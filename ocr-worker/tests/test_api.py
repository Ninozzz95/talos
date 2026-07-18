from __future__ import annotations

import asyncio
import base64
import hashlib
import threading
from dataclasses import replace
from typing import Any
from uuid import uuid4

import httpx
import pytest

from talos_ocr_worker.app import create_app
from talos_ocr_worker.config import Settings
from talos_ocr_worker.contracts import (
    OcrPageUsage,
    OcrRequest,
    OcrResponse,
    OcrResponseData,
    ReadyData,
    ReadyResponse,
    VllmPageResult,
)
from talos_ocr_worker.errors import OcrFault
from talos_ocr_worker.rendering import RenderedPage
from talos_ocr_worker.service import OcrService


class FakeOcrService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.extract_calls = 0

    async def readiness(self) -> ReadyResponse:
        return ReadyResponse(
            data=ReadyData(
                protocol=self.settings.protocol,
                status="ready",
                model=self.settings.model,
                model_revision=self.settings.model_revision,
                served_model=self.settings.served_model,
                runtime="vllm",
                runtime_version=self.settings.vllm_version,
                pdf_renderer="pypdfium2",
                pdf_renderer_version=self.settings.pdf_renderer_version,
                image_renderer="pillow",
                image_renderer_version=self.settings.image_renderer_version,
            )
        )

    async def extract(self, request: OcrRequest) -> OcrResponse:
        self.extract_calls += 1
        text = "TALOS OCR sentinel"
        return OcrResponse(
            data=OcrResponseData(
                protocol=request.protocol,
                request_id=request.request_id,
                owner_ref=request.owner_ref,
                source_sha256=request.input.sha256,
                text=text,
                text_sha256=hashlib.sha256(text.encode()).hexdigest(),
                pages=[],
                provenance={
                    "model": self.settings.model,
                    "model_revision": self.settings.model_revision,
                    "served_model": self.settings.served_model,
                    "runtime": "vllm",
                    "runtime_version": self.settings.vllm_version,
                    "renderer": "pillow",
                    "renderer_version": self.settings.image_renderer_version,
                },
                warnings=[],
            )
        )


class FakeRenderer:
    def render(self, source: bytes, mime_type: str) -> list[RenderedPage]:
        assert source == b"abc"
        assert mime_type == "image/png"
        return [
            RenderedPage(1, 2, 3, b"page-one", hashlib.sha256(b"page-one").hexdigest()),
            RenderedPage(2, 4, 5, b"page-two", hashlib.sha256(b"page-two").hexdigest()),
        ]


class FakeVllmClient:
    def __init__(self) -> None:
        self.calls: list[int] = []
        self.closed = False

    async def ocr_page(self, page: RenderedPage) -> VllmPageResult:
        self.calls.append(page.index)
        return VllmPageResult(
            text=f"page {page.index}",
            latency_ms=page.index * 10,
            usage=OcrPageUsage(prompt_tokens=page.index, completion_tokens=page.index + 1),
            finish_reason="stop",
            warnings=[f"warning-{page.index}"],
        )

    async def close(self) -> None:
        self.closed = True


class SlowVllmClient(FakeVllmClient):
    async def ocr_page(self, page: RenderedPage) -> VllmPageResult:
        await asyncio.sleep(0.05)
        return await super().ocr_page(page)


class BlockingRenderer(FakeRenderer):
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.calls = 0

    def render(self, source: bytes, mime_type: str) -> list[RenderedPage]:
        self.calls += 1
        self.started.set()
        self.release.wait(timeout=2)
        return super().render(source, mime_type)


def canonical_request(settings: Settings) -> dict[str, Any]:
    source = b"abc"
    return {
        "protocol": settings.protocol,
        "request_id": str(uuid4()),
        "owner_ref": str(uuid4()),
        "input": {
            "mime_type": "image/png",
            "sha256": hashlib.sha256(source).hexdigest(),
            "bytes_base64": base64.b64encode(source).decode("ascii"),
        },
    }


@pytest.mark.asyncio
async def test_full_worker_response_carries_page_hashes_usage_warnings_and_exact_provenance(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    vllm = FakeVllmClient()
    service = OcrService(settings, renderer=FakeRenderer(), vllm_client=vllm)
    app = create_app(settings, service=service)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/v1/ocr",
            headers={"X-Talos-Ocr-Token": settings.worker_token},
            json=canonical_request(settings),
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert vllm.calls == [1, 2]
    assert payload["text"] == "page 1\n\npage 2"
    assert payload["text_sha256"] == hashlib.sha256(payload["text"].encode()).hexdigest()
    assert [page["index"] for page in payload["pages"]] == [1, 2]
    assert payload["pages"][0]["image_sha256"] == hashlib.sha256(b"page-one").hexdigest()
    assert payload["pages"][1]["usage"] == {
        "prompt_tokens": 2,
        "completion_tokens": 3,
    }
    assert payload["warnings"] == ["warning-1", "warning-2"]
    assert payload["provenance"] == {
        "model": settings.model,
        "model_revision": settings.model_revision,
        "served_model": settings.served_model,
        "runtime": "vllm",
        "runtime_version": settings.vllm_version,
        "renderer": "pillow",
        "renderer_version": settings.image_renderer_version,
    }


@pytest.mark.asyncio
async def test_worker_lifespan_closes_the_runtime_client(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    vllm = FakeVllmClient()
    service = OcrService(settings, renderer=FakeRenderer(), vllm_client=vllm)
    app = create_app(settings, service=service)

    async with app.router.lifespan_context(app):
        assert vllm.closed is False

    assert vllm.closed is True


@pytest.mark.asyncio
async def test_health_is_bounded_and_ready_requires_constant_time_token(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    service = FakeOcrService(settings)
    app = create_app(settings, service=service)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        health = await client.get("/health")
        missing = await client.get("/ready")
        invalid = await client.get("/ready", headers={"X-Talos-Ocr-Token": "c" * 64})
        ready = await client.get(
            "/ready",
            headers={"X-Talos-Ocr-Token": settings.worker_token},
        )

    assert health.status_code == 200
    assert health.json() == {
        "protocol": "talos.ocr.worker.v1",
        "status": "alive",
    }
    for response in (missing, invalid):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "TALOS_OCR_UNAUTHORIZED"
    assert ready.status_code == 200
    assert ready.json()["data"]["served_model"] == settings.served_model


@pytest.mark.asyncio
async def test_ocr_contract_rejects_wrong_protocol_unknown_fields_invalid_base64_and_hash(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    service = FakeOcrService(settings)
    app = create_app(settings, service=service)
    headers = {"X-Talos-Ocr-Token": settings.worker_token}
    cases = []

    wrong_protocol = canonical_request(settings)
    wrong_protocol["protocol"] = "talos.ocr.worker.v2"
    cases.append(wrong_protocol)

    unknown = canonical_request(settings)
    unknown["unexpected"] = True
    cases.append(unknown)

    invalid_base64 = canonical_request(settings)
    invalid_base64["input"]["bytes_base64"] = "not base64!!"
    cases.append(invalid_base64)

    invalid_hash = canonical_request(settings)
    invalid_hash["input"]["sha256"] = "abc"
    cases.append(invalid_hash)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
    ) as client:
        responses = [
            await client.post("/v1/ocr", headers=headers, json=payload)
            for payload in cases
        ]

    assert service.extract_calls == 0
    for response in responses:
        assert response.status_code == 422
        assert response.json() == {
            "error": {
                "code": "TALOS_OCR_REQUEST_INVALID",
                "message": "The OCR request is malformed.",
                "retryable": False,
            }
        }


@pytest.mark.asyncio
async def test_worker_authentication_precedes_body_validation_and_body_buffering(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = replace(Settings.from_env(), max_request_bytes=32)
    service = FakeOcrService(settings)
    app = create_app(settings, service=service)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
    ) as client:
        malformed = await client.post("/v1/ocr", content=b"not-json")
        oversized = await client.post("/v1/ocr", content=b"x" * 33)

    assert service.extract_calls == 0
    for response in (malformed, oversized):
        assert response.status_code == 401
        assert response.json() == {
            "error": {
                "code": "TALOS_OCR_UNAUTHORIZED",
                "message": "The OCR worker token is invalid.",
                "retryable": False,
            }
        }


@pytest.mark.asyncio
async def test_worker_authentication_covers_trailing_slash_aliases_before_body_buffering(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = replace(Settings.from_env(), max_request_bytes=32)
    service = FakeOcrService(settings)
    app = create_app(settings, service=service)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
        follow_redirects=False,
    ) as client:
        ready = await client.get("/ready/")
        oversized = await client.post("/v1/ocr/", content=b"x" * 33)

    assert service.extract_calls == 0
    for response in (ready, oversized):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "TALOS_OCR_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_worker_total_deadline_returns_retryable_canonical_fault(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = replace(Settings.from_env(), request_timeout_seconds=0.01)
    service = OcrService(
        settings,
        renderer=FakeRenderer(),
        vllm_client=SlowVllmClient(),
    )
    app = create_app(settings, service=service)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/v1/ocr",
            headers={"X-Talos-Ocr-Token": settings.worker_token},
            json=canonical_request(settings),
        )

    assert response.status_code == 504
    assert response.json() == {
        "error": {
            "code": "TALOS_OCR_REQUEST_TIMEOUT",
            "message": "The OCR request exceeded its processing deadline.",
            "retryable": True,
        }
    }


@pytest.mark.asyncio
async def test_timed_out_renderer_keeps_capacity_until_thread_really_finishes(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = replace(
        Settings.from_env(),
        max_concurrency=1,
        request_timeout_seconds=0.02,
    )
    renderer = BlockingRenderer()
    service = OcrService(
        settings,
        renderer=renderer,
        vllm_client=FakeVllmClient(),
    )
    request = OcrRequest.model_validate(canonical_request(settings))

    try:
        with pytest.raises(OcrFault, match="processing deadline"):
            await service.extract(request)
        assert renderer.started.wait(timeout=1)

        with pytest.raises(OcrFault, match="processing deadline"):
            await service.extract(request)

        assert renderer.calls == 1
    finally:
        renderer.release.set()
        await asyncio.sleep(0.05)
        await service.close()
