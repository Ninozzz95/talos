from __future__ import annotations

import base64
import json as json_module
import time
from typing import Any

import httpx

from .config import Settings
from .contracts import OcrPageUsage, VllmPageResult, VllmReadiness
from .errors import OcrFault
from .rendering import RenderedPage


DOCUMENT_PROMPT = "<image>\n<|grounding|>Convert the document to markdown."


def _runtime_unavailable() -> OcrFault:
    return OcrFault(
        "TALOS_OCR_RUNTIME_UNAVAILABLE",
        "The OCR runtime is unavailable.",
        status_code=503,
        retryable=True,
    )


def _runtime_drift() -> OcrFault:
    return OcrFault(
        "TALOS_OCR_RUNTIME_DRIFT",
        "The OCR runtime does not match the configured version contract.",
        status_code=503,
    )


def _invalid_response() -> OcrFault:
    return OcrFault(
        "TALOS_OCR_RUNTIME_RESPONSE_INVALID",
        "The OCR runtime returned an invalid response.",
        status_code=502,
    )


class VllmClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.vllm_url,
            headers={
                "Authorization": f"Bearer {settings.vllm_api_key}",
                "Accept": "application/json",
            },
            timeout=httpx.Timeout(
                connect=settings.connect_timeout_seconds,
                write=settings.write_timeout_seconds,
                read=settings.read_timeout_seconds,
                pool=settings.pool_timeout_seconds,
            ),
            limits=httpx.Limits(max_connections=2, max_keepalive_connections=2),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        )

    async def readiness(self) -> VllmReadiness:
        await self._request("GET", "/health", expect_json=False)
        version_payload = await self._request("GET", "/version")
        models_payload = await self._request("GET", "/v1/models")
        if not isinstance(version_payload, dict):
            raise _invalid_response()
        version = version_payload.get("version")
        if not isinstance(version, str):
            raise _invalid_response()
        served_models = self._served_models(models_payload)
        if version != self.settings.vllm_version:
            raise _runtime_drift()
        if self.settings.served_model not in served_models:
            raise _runtime_drift()
        return VllmReadiness(
            status="ready",
            version=version,
            served_models=served_models,
        )

    async def ocr_page(self, page: RenderedPage) -> VllmPageResult:
        image_base64 = base64.b64encode(page.png_bytes).decode("ascii")
        payload = {
            "model": self.settings.served_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_base64}"
                            },
                        },
                        {"type": "text", "text": DOCUMENT_PROMPT},
                    ],
                }
            ],
            "max_tokens": self.settings.max_completion_tokens,
            "temperature": 0.0,
            "skip_special_tokens": False,
            "vllm_xargs": {
                "ngram_size": 30,
                "window_size": 90,
                "whitelist_token_ids": [128821, 128822],
            },
        }
        started = time.perf_counter()
        response = await self._request("POST", "/v1/chat/completions", json=payload)
        latency_ms = max(0, round((time.perf_counter() - started) * 1000))
        return self._parse_completion(response, latency_ms)

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        expect_json: bool = True,
        json: dict[str, Any] | None = None,
    ) -> Any:
        try:
            async with self._client.stream(method, path, json=json) as response:
                if response.is_redirect or response.status_code >= 500:
                    raise _runtime_unavailable()
                if response.status_code < 200 or response.status_code >= 300:
                    raise _invalid_response()
                declared_length = response.headers.get("content-length")
                if declared_length is not None:
                    try:
                        if int(declared_length) > self.settings.max_response_bytes:
                            raise _invalid_response()
                    except ValueError as error:
                        raise _invalid_response() from error

                body = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(body) + len(chunk) > self.settings.max_response_bytes:
                        raise _invalid_response()
                    body.extend(chunk)
        except OcrFault:
            raise
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise _runtime_unavailable() from error
        if not expect_json:
            return None
        try:
            return json_module.loads(body)
        except (UnicodeDecodeError, ValueError) as error:
            raise _invalid_response() from error

    @staticmethod
    def _served_models(payload: Any) -> list[str]:
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise _invalid_response()
        models: list[str] = []
        for item in payload["data"]:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                raise _invalid_response()
            models.append(item["id"])
        if not models:
            raise _invalid_response()
        return models

    def _parse_completion(self, payload: Any, latency_ms: int) -> VllmPageResult:
        if not isinstance(payload, dict) or payload.get("model") != self.settings.served_model:
            raise _runtime_drift()
        choices = payload.get("choices")
        usage = payload.get("usage")
        if not isinstance(choices, list) or len(choices) != 1 or not isinstance(usage, dict):
            raise _invalid_response()
        choice = choices[0]
        if not isinstance(choice, dict) or not isinstance(choice.get("message"), dict):
            raise _invalid_response()
        finish_reason = choice.get("finish_reason")
        if finish_reason == "length":
            raise OcrFault(
                "TALOS_OCR_RUNTIME_OUTPUT_TRUNCATED",
                "The OCR runtime output reached its configured limit.",
                status_code=502,
            )
        if finish_reason != "stop":
            raise _invalid_response()
        text = choice["message"].get("content")
        prompt_tokens = usage.get("prompt_tokens")
        completion_tokens = usage.get("completion_tokens")
        if (
            not isinstance(text, str)
            or not text.strip()
            or len(text.encode("utf-8")) > self.settings.max_text_bytes
            or not isinstance(prompt_tokens, int)
            or isinstance(prompt_tokens, bool)
            or prompt_tokens < 0
            or not isinstance(completion_tokens, int)
            or isinstance(completion_tokens, bool)
            or completion_tokens < 0
        ):
            raise _invalid_response()
        return VllmPageResult(
            text=text,
            latency_ms=latency_ms,
            usage=OcrPageUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            ),
            finish_reason=finish_reason,
            warnings=[],
        )
