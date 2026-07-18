from __future__ import annotations

import asyncio
import base64
import hashlib
from concurrent.futures import ThreadPoolExecutor
from typing import Protocol

from .config import Settings
from .contracts import (
    OcrPageEvidence,
    OcrProvenance,
    OcrRequest,
    OcrResponse,
    OcrResponseData,
    ReadyData,
    ReadyResponse,
)
from .errors import OcrFault
from .rendering import PillowPdfiumRenderer, RenderedPage
from .vllm_client import VllmClient


class _Renderer(Protocol):
    def render(self, source: bytes, mime_type: str) -> list[RenderedPage]: ...


class _Runtime(Protocol):
    async def readiness(self): ...

    async def ocr_page(self, page: RenderedPage): ...

    async def close(self) -> None: ...


class OcrService:
    def __init__(
        self,
        settings: Settings,
        *,
        renderer: _Renderer | None = None,
        vllm_client: _Runtime | None = None,
    ) -> None:
        self.settings = settings
        self.renderer = renderer or PillowPdfiumRenderer(settings)
        self.vllm_client = vllm_client or VllmClient(settings)
        self._capacity = asyncio.Semaphore(settings.max_concurrency)
        self._render_capacity = asyncio.Semaphore(settings.max_concurrency)
        self._renderer_executor = ThreadPoolExecutor(
            max_workers=settings.max_concurrency,
            thread_name_prefix="talos-ocr-render",
        )

    async def readiness(self) -> ReadyResponse:
        await self.vllm_client.readiness()
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
        try:
            async with asyncio.timeout(self.settings.request_timeout_seconds):
                return await self._extract_within_deadline(request)
        except TimeoutError as error:
            raise OcrFault(
                "TALOS_OCR_REQUEST_TIMEOUT",
                "The OCR request exceeded its processing deadline.",
                status_code=504,
                retryable=True,
            ) from error

    async def _extract_within_deadline(self, request: OcrRequest) -> OcrResponse:
        source = base64.b64decode(request.input.bytes_base64, validate=True)
        if len(source) > self.settings.max_source_bytes:
            raise OcrFault(
                "TALOS_OCR_SOURCE_LIMIT_EXCEEDED",
                "The OCR source exceeds a configured safety limit.",
                status_code=413,
            )

        async with self._capacity:
            pages = await self._render_pages(source, request.input.mime_type)
            evidence: list[OcrPageEvidence] = []
            aggregate_warnings: list[str] = []
            for page in pages:
                result = await self.vllm_client.ocr_page(page)
                text_sha256 = hashlib.sha256(result.text.encode("utf-8")).hexdigest()
                aggregate_warnings.extend(result.warnings)
                evidence.append(
                    OcrPageEvidence(
                        index=page.index,
                        width=page.width,
                        height=page.height,
                        image_sha256=page.sha256,
                        text=result.text,
                        text_sha256=text_sha256,
                        latency_ms=result.latency_ms,
                        usage=result.usage,
                        warnings=result.warnings,
                    )
                )

        text = "\n\n".join(page.text for page in evidence)
        if not text or len(text.encode("utf-8")) > self.settings.max_text_bytes:
            raise OcrFault(
                "TALOS_OCR_RUNTIME_RESPONSE_INVALID",
                "The OCR runtime returned an invalid response.",
                status_code=502,
            )
        renderer_name = (
            "pypdfium2" if request.input.mime_type == "application/pdf" else "pillow"
        )
        response = OcrResponse(
            data=OcrResponseData(
                protocol=request.protocol,
                request_id=request.request_id,
                owner_ref=request.owner_ref,
                source_sha256=request.input.sha256,
                text=text,
                text_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
                pages=evidence,
                provenance=OcrProvenance(
                    model=self.settings.model,
                    model_revision=self.settings.model_revision,
                    served_model=self.settings.served_model,
                    runtime="vllm",
                    runtime_version=self.settings.vllm_version,
                    renderer=renderer_name,
                    renderer_version=(
                        self.settings.pdf_renderer_version
                        if renderer_name == "pypdfium2"
                        else self.settings.image_renderer_version
                    ),
                ),
                warnings=list(dict.fromkeys(aggregate_warnings)),
            )
        )
        if len(response.model_dump_json().encode("utf-8")) > self.settings.max_response_bytes:
            raise OcrFault(
                "TALOS_OCR_RUNTIME_RESPONSE_INVALID",
                "The OCR runtime returned an invalid response.",
                status_code=502,
            )
        return response

    async def _render_pages(
        self,
        source: bytes,
        mime_type: str,
    ) -> list[RenderedPage]:
        await self._render_capacity.acquire()
        loop = asyncio.get_running_loop()
        try:
            future = loop.run_in_executor(
                self._renderer_executor,
                self.renderer.render,
                source,
                mime_type,
            )
        except BaseException:
            self._render_capacity.release()
            raise
        future.add_done_callback(lambda _: self._render_capacity.release())

        return await asyncio.shield(future)

    async def close(self) -> None:
        try:
            await self.vllm_client.close()
        finally:
            self._renderer_executor.shutdown(wait=False, cancel_futures=True)
