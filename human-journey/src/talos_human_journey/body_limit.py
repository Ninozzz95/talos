from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any


Scope = dict[str, Any]
Message = dict[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
AsgiApp = Callable[[Scope, Receive, Send], Awaitable[None]]


class BodyLimitExceeded(Exception):
    """Raised before a route can consume an oversized request body."""


class BodyLimitMiddleware:
    def __init__(self, app: AsgiApp, max_body_bytes: int) -> None:
        if max_body_bytes < 1:
            raise ValueError("max_body_bytes must be positive")
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        for raw_name, raw_value in scope.get("headers", []):
            if raw_name.lower() != b"content-length":
                continue
            try:
                declared_length = int(raw_value.decode("ascii"))
            except (UnicodeDecodeError, ValueError):
                declared_length = 0
            if declared_length > self.max_body_bytes:
                await self._send_too_large(send)
                return

        received_bytes = 0
        response_started = False

        async def bounded_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message.get("type") == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_body_bytes:
                    raise BodyLimitExceeded
            return message

        async def tracked_send(message: Message) -> None:
            nonlocal response_started
            if message.get("type") == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, bounded_receive, tracked_send)
        except BodyLimitExceeded:
            if response_started:
                raise
            await self._send_too_large(send)

    @staticmethod
    async def _send_too_large(send: Send) -> None:
        payload = json.dumps(
            {
                "error": {
                    "code": "REQUEST_BODY_TOO_LARGE",
                    "message": "The JSON request body exceeds the configured limit.",
                }
            },
            separators=(",", ":"),
        ).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": payload})

