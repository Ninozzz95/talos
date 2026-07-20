from __future__ import annotations

import json
import threading
import time
from collections import deque
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


@dataclass(frozen=True, slots=True)
class FixtureReply:
    content: str = "Continua con il link visibile."
    status: int = 200
    delay_seconds: float = 0
    malformed: bool = False


class OpenAISimulatorFixture:
    def __init__(self, *, api_key: str = "fixture-secret") -> None:
        self.api_key = api_key
        self.requests: list[dict[str, Any]] = []
        self._replies: deque[FixtureReply] = deque()
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def base_url(self) -> str:
        if self._server is None:
            raise RuntimeError("fixture is not running")
        host, port = self._server.server_address
        return f"http://{host}:{port}/v1"

    def enqueue(self, reply: FixtureReply) -> None:
        self._replies.append(reply)

    def __enter__(self) -> OpenAISimulatorFixture:
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 - stdlib callback name
                length = int(self.headers.get("content-length", "0"))
                body = self.rfile.read(length)
                try:
                    parsed = json.loads(body)
                except json.JSONDecodeError:
                    parsed = {"malformed_request": True}
                owner.requests.append({
                    "path": self.path,
                    "authorization": self.headers.get("authorization"),
                    "body": parsed,
                })
                reply = owner._replies.popleft() if owner._replies else FixtureReply()
                if reply.delay_seconds:
                    time.sleep(reply.delay_seconds)
                if self.headers.get("authorization") != f"Bearer {owner.api_key}":
                    self.send_response(401)
                    payload = b'{"error":{"message":"unauthorized"}}'
                elif reply.malformed:
                    self.send_response(reply.status)
                    payload = b"not-json"
                elif reply.status != 200:
                    self.send_response(reply.status)
                    payload = b'{"error":{"message":"fixture failure"}}'
                else:
                    self.send_response(200)
                    payload = json.dumps({
                        "id": "chatcmpl-fixture",
                        "object": "chat.completion",
                        "created": 1_753_000_000,
                        "model": "talos-user-simulator",
                        "choices": [{
                            "index": 0,
                            "message": {"role": "assistant", "content": reply.content},
                            "finish_reason": "stop",
                        }],
                        "usage": {
                            "prompt_tokens": 31,
                            "completion_tokens": 7,
                            "total_tokens": 38,
                        },
                    }, separators=(",", ":")).encode("utf-8")
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                try:
                    self.wfile.write(payload)
                except BrokenPipeError:
                    pass

            def log_message(self, _format: str, *_args: object) -> None:
                return None

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, _type, _value, _traceback) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._server = None
        self._thread = None

