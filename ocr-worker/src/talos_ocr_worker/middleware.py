from __future__ import annotations

import secrets
from collections.abc import Collection

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class WorkerAuthMiddleware:
    """Reject protected worker routes before body buffering or validation."""

    def __init__(
        self,
        app: ASGIApp,
        worker_token: str,
        protected_paths: Collection[str],
    ) -> None:
        self.app = app
        self.worker_token = worker_token
        self.protected_paths = frozenset(protected_paths)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        protected_path = path[:-1] if len(path) > 1 and path.endswith("/") else path
        if (
            scope["type"] == "http"
            and protected_path in self.protected_paths
            and not self._authorized(scope)
        ):
            response = JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "TALOS_OCR_UNAUTHORIZED",
                        "message": "The OCR worker token is invalid.",
                        "retryable": False,
                    }
                },
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

    def _authorized(self, scope: Scope) -> bool:
        candidates = [
            value
            for name, value in scope.get("headers", [])
            if name.lower() == b"x-talos-ocr-token"
        ]
        if len(candidates) != 1:
            return False
        try:
            candidate = candidates[0].decode("ascii")
        except UnicodeDecodeError:
            return False
        return secrets.compare_digest(candidate, self.worker_token)


class BodyLimitMiddleware:
    """Buffer a bounded HTTP body before the application can decode it."""

    def __init__(self, app: ASGIApp, maximum_bytes: int) -> None:
        if maximum_bytes <= 0:
            raise ValueError("maximum_bytes must be positive")
        self.app = app
        self.maximum_bytes = maximum_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared_length = self._content_length(scope)
        if declared_length is not None and declared_length > self.maximum_bytes:
            await self._reject(scope, receive, send)
            return

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            body.extend(message.get("body", b""))
            if len(body) > self.maximum_bytes:
                await self._reject(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay_receive() -> Message:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {
                "type": "http.request",
                "body": bytes(body),
                "more_body": False,
            }

        await self.app(scope, replay_receive, send)

    @staticmethod
    def _content_length(scope: Scope) -> int | None:
        for name, value in scope.get("headers", []):
            if name.lower() != b"content-length":
                continue
            try:
                parsed = int(value.decode("ascii"))
            except (UnicodeDecodeError, ValueError):
                return None
            return parsed if parsed >= 0 else None
        return None

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content={
                "error": {
                    "code": "TALOS_OCR_REQUEST_TOO_LARGE",
                    "message": "The OCR request exceeds the configured size limit.",
                    "retryable": False,
                }
            },
        )
        await response(scope, receive, send)
