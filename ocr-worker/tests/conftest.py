from __future__ import annotations

import os
from collections.abc import Iterator

import pytest


OCR_ENV_KEYS = (
    "TALOS_OCR_WORKER_TOKEN",
    "TALOS_OCR_PROTOCOL",
    "TALOS_OCR_VLLM_URL",
    "TALOS_OCR_VLLM_API_KEY",
    "TALOS_OCR_MODEL",
    "TALOS_OCR_MODEL_REVISION",
    "TALOS_OCR_SERVED_MODEL",
    "TALOS_OCR_VLLM_VERSION",
    "TALOS_OCR_MAX_REQUEST_BYTES",
    "TALOS_OCR_MAX_SOURCE_BYTES",
    "TALOS_OCR_MAX_RESPONSE_BYTES",
    "TALOS_OCR_MAX_TEXT_BYTES",
    "TALOS_OCR_MAX_PDF_PAGES",
    "TALOS_OCR_PDF_SCALE",
    "TALOS_OCR_MAX_IMAGE_PIXELS",
    "TALOS_OCR_MAX_TOTAL_PIXELS",
    "TALOS_OCR_MAX_COMPLETION_TOKENS",
    "TALOS_OCR_MAX_CONCURRENCY",
    "TALOS_OCR_REQUEST_TIMEOUT_SECONDS",
    "TALOS_OCR_CONNECT_TIMEOUT_SECONDS",
    "TALOS_OCR_WRITE_TIMEOUT_SECONDS",
    "TALOS_OCR_READ_TIMEOUT_SECONDS",
    "TALOS_OCR_POOL_TIMEOUT_SECONDS",
)


@pytest.fixture(autouse=True)
def isolated_ocr_environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key in OCR_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    yield
    for key in OCR_ENV_KEYS:
        os.environ.pop(key, None)


@pytest.fixture
def valid_ocr_environment(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    revision = "aaa02f3811945a91062062994c5c4a3f4c0af2b0"
    values = {
        "TALOS_OCR_WORKER_TOKEN": "a" * 64,
        "TALOS_OCR_PROTOCOL": "talos.ocr.worker.v1",
        "TALOS_OCR_VLLM_URL": "http://ocr-runtime:8000",
        "TALOS_OCR_VLLM_API_KEY": "b" * 64,
        "TALOS_OCR_MODEL": "deepseek-ai/DeepSeek-OCR-2",
        "TALOS_OCR_MODEL_REVISION": revision,
        "TALOS_OCR_SERVED_MODEL": f"deepseek-ai/DeepSeek-OCR-2@{revision}",
        "TALOS_OCR_VLLM_VERSION": "0.25.1",
        "TALOS_OCR_MAX_REQUEST_BYTES": "15728640",
        "TALOS_OCR_MAX_SOURCE_BYTES": "10485760",
        "TALOS_OCR_MAX_RESPONSE_BYTES": "10485760",
        "TALOS_OCR_MAX_TEXT_BYTES": "5242880",
        "TALOS_OCR_MAX_PDF_PAGES": "20",
        "TALOS_OCR_PDF_SCALE": "2.0",
        "TALOS_OCR_MAX_IMAGE_PIXELS": "16000000",
        "TALOS_OCR_MAX_TOTAL_PIXELS": "80000000",
        "TALOS_OCR_MAX_COMPLETION_TOKENS": "8192",
        "TALOS_OCR_MAX_CONCURRENCY": "2",
        "TALOS_OCR_REQUEST_TIMEOUT_SECONDS": "170",
        "TALOS_OCR_CONNECT_TIMEOUT_SECONDS": "3",
        "TALOS_OCR_WRITE_TIMEOUT_SECONDS": "30",
        "TALOS_OCR_READ_TIMEOUT_SECONDS": "180",
        "TALOS_OCR_POOL_TIMEOUT_SECONDS": "5",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    return values
