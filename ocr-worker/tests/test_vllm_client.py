from __future__ import annotations

import json
from dataclasses import replace

import httpx
import pytest

from talos_ocr_worker.config import Settings
from talos_ocr_worker.errors import OcrFault
from talos_ocr_worker.rendering import RenderedPage
from talos_ocr_worker.vllm_client import DOCUMENT_PROMPT, VllmClient


class CountingStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.yielded = 0

    async def __aiter__(self):
        for chunk in self.chunks:
            self.yielded += 1
            yield chunk


def healthy_response(request: httpx.Request, settings: Settings) -> httpx.Response:
    if request.url.path == "/health":
        return httpx.Response(200, content=b"")
    if request.url.path == "/version":
        return httpx.Response(200, json={"version": settings.vllm_version})
    if request.url.path == "/v1/models":
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [{"id": settings.served_model, "object": "model"}],
            },
        )
    raise AssertionError(f"unexpected request: {request.method} {request.url}")


@pytest.mark.asyncio
async def test_vllm_readiness_requires_health_exact_version_and_exact_served_model(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    healthy = VllmClient(
        settings,
        transport=httpx.MockTransport(lambda request: healthy_response(request, settings)),
    )
    readiness = await healthy.readiness()
    await healthy.close()

    assert readiness.status == "ready"
    assert readiness.version == settings.vllm_version
    assert readiness.served_models == [settings.served_model]

    def drifted(request: httpx.Request) -> httpx.Response:
        response = healthy_response(request, settings)
        if request.url.path == "/version":
            return httpx.Response(200, json={"version": "0.25.2"})
        return response

    client = VllmClient(settings, transport=httpx.MockTransport(drifted))
    with pytest.raises(OcrFault) as captured:
        await client.readiness()
    await client.close()

    assert captured.value.code == "TALOS_OCR_RUNTIME_DRIFT"
    assert captured.value.retryable is False

    def missing_model(request: httpx.Request) -> httpx.Response:
        response = healthy_response(request, settings)
        if request.url.path == "/v1/models":
            return httpx.Response(
                200,
                json={"object": "list", "data": [{"id": "moving-alias"}]},
            )
        return response

    client = VllmClient(settings, transport=httpx.MockTransport(missing_model))
    with pytest.raises(OcrFault) as captured:
        await client.readiness()
    await client.close()

    assert captured.value.code == "TALOS_OCR_RUNTIME_DRIFT"


@pytest.mark.asyncio
async def test_vllm_request_uses_fixed_prompt_base64_and_official_ngram_arguments(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    captured_payload: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_payload
        captured_payload = json.loads(request.content)
        assert request.headers["authorization"] == f"Bearer {settings.vllm_api_key}"
        return httpx.Response(
            200,
            json={
                "model": settings.served_model,
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": "verified markdown"},
                    }
                ],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7},
            },
        )

    client = VllmClient(settings, transport=httpx.MockTransport(handler))
    result = await client.ocr_page(
        RenderedPage(
            index=1,
            width=1,
            height=1,
            png_bytes=b"png-sentinel",
            sha256="a" * 64,
        )
    )
    await client.close()

    assert result.text == "verified markdown"
    assert result.usage.prompt_tokens == 11
    assert result.usage.completion_tokens == 7
    assert captured_payload == {
        "model": settings.served_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/png;base64,cG5nLXNlbnRpbmVs"
                        },
                    },
                    {"type": "text", "text": DOCUMENT_PROMPT},
                ],
            }
        ],
        "max_tokens": settings.max_completion_tokens,
        "temperature": 0.0,
        "skip_special_tokens": False,
        "vllm_xargs": {
            "ngram_size": 30,
            "window_size": 90,
            "whitelist_token_ids": [128821, 128822],
        },
    }


@pytest.mark.asyncio
async def test_vllm_timeout_redirect_http_error_malformed_empty_and_truncated_output_fail_closed(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    page = RenderedPage(1, 1, 1, b"png", "a" * 64)

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private upstream detail", request=request)

    handlers = (
        timeout,
        lambda request: httpx.Response(307, headers={"location": "http://elsewhere"}),
        lambda request: httpx.Response(500, text="private upstream detail"),
        lambda request: httpx.Response(200, content=b"not-json"),
        lambda request: httpx.Response(
            200,
            json={
                "model": settings.served_model,
                "choices": [{"finish_reason": "stop", "message": {"content": ""}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 0},
            },
        ),
        lambda request: httpx.Response(
            200,
            json={
                "model": settings.served_model,
                "choices": [
                    {"finish_reason": "length", "message": {"content": "partial"}}
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            },
        ),
    )

    for handler in handlers:
        client = VllmClient(settings, transport=httpx.MockTransport(handler))
        with pytest.raises(OcrFault) as captured:
            await client.ocr_page(page)
        await client.close()

        assert captured.value.code in {
            "TALOS_OCR_RUNTIME_UNAVAILABLE",
            "TALOS_OCR_RUNTIME_RESPONSE_INVALID",
            "TALOS_OCR_RUNTIME_OUTPUT_TRUNCATED",
        }
        assert "private upstream detail" not in captured.value.safe_message


@pytest.mark.asyncio
async def test_vllm_response_budget_stops_stream_before_unbounded_body(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = replace(
        Settings.from_env(),
        max_response_bytes=8,
        max_text_bytes=4,
    )
    stream = CountingStream([b"12345678", b"9", b"must-not-be-read"])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=stream)

    client = VllmClient(settings, transport=httpx.MockTransport(handler))
    with pytest.raises(OcrFault) as captured:
        await client.ocr_page(RenderedPage(1, 1, 1, b"png", "a" * 64))
    await client.close()

    assert captured.value.code == "TALOS_OCR_RUNTIME_RESPONSE_INVALID"
    assert stream.yielded == 2
