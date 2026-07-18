from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from starlette.responses import JSONResponse, PlainTextResponse

from talos_ocr_worker.middleware import BodyLimitMiddleware


async def echo_app(scope, receive, send) -> None:
    if scope["type"] != "http":
        return
    body = bytearray()
    more = True
    while more:
        message = await receive()
        body.extend(message.get("body", b""))
        more = bool(message.get("more_body", False))
    await PlainTextResponse(bytes(body))(scope, receive, send)


async def streamed_body() -> AsyncIterator[bytes]:
    yield b"a" * 20
    yield b"b" * 20


@pytest.mark.asyncio
async def test_body_limit_allows_bounded_request() -> None:
    app = BodyLimitMiddleware(echo_app, maximum_bytes=32)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/", content=b"bounded")

    assert response.status_code == 200
    assert response.text == "bounded"


@pytest.mark.asyncio
async def test_body_limit_rejects_content_length_and_streamed_overflow_before_json() -> None:
    app = BodyLimitMiddleware(echo_app, maximum_bytes=32)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
    ) as client:
        declared = await client.post("/", content=b"x" * 33)
        streamed = await client.post("/", content=streamed_body())

    for response in (declared, streamed):
        assert response.status_code == 413
        assert response.json() == {
            "error": {
                "code": "TALOS_OCR_REQUEST_TOO_LARGE",
                "message": "The OCR request exceeds the configured size limit.",
                "retryable": False,
            }
        }


def test_body_limit_rejects_non_positive_configuration() -> None:
    with pytest.raises(ValueError, match="maximum_bytes"):
        BodyLimitMiddleware(echo_app, maximum_bytes=0)
