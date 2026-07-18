from __future__ import annotations

import pytest

import talos_ocr_worker.config as config_module
from talos_ocr_worker.config import Settings
from talos_ocr_worker.errors import OcrFault


def test_settings_accept_exact_pinned_configuration(valid_ocr_environment: dict[str, str]) -> None:
    settings = Settings.from_env()

    assert settings.protocol == "talos.ocr.worker.v1"
    assert settings.model_revision == "aaa02f3811945a91062062994c5c4a3f4c0af2b0"
    assert settings.vllm_version == "0.25.1"
    assert settings.pdf_renderer_version == "5.12.1"
    assert settings.image_renderer_version == "12.3.0"
    assert settings.request_timeout_seconds == 170
    assert settings.max_request_bytes == 15_728_640
    assert settings.pdf_scale == 2.0


def test_settings_rejects_installed_renderer_distribution_drift(
    valid_ocr_environment: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actual_version = config_module.distribution_version

    def drifted_version(distribution: str) -> str:
        if distribution == "pillow":
            return "0.0.0"
        return actual_version(distribution)

    monkeypatch.setattr(config_module, "distribution_version", drifted_version)

    with pytest.raises(OcrFault) as captured:
        Settings.from_env()

    assert captured.value.code == "TALOS_OCR_CONFIGURATION_INVALID"


@pytest.mark.parametrize(
    "key",
    [
        "TALOS_OCR_PDF_SCALE",
        "TALOS_OCR_REQUEST_TIMEOUT_SECONDS",
        "TALOS_OCR_CONNECT_TIMEOUT_SECONDS",
        "TALOS_OCR_READ_TIMEOUT_SECONDS",
    ],
)
def test_settings_rejects_non_finite_numeric_limits(
    valid_ocr_environment: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    key: str,
) -> None:
    monkeypatch.setenv(key, "nan")

    with pytest.raises(OcrFault) as captured:
        Settings.from_env()

    assert captured.value.code == "TALOS_OCR_CONFIGURATION_INVALID"


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("TALOS_OCR_WORKER_TOKEN", ""),
        ("TALOS_OCR_WORKER_TOKEN", "short"),
        ("TALOS_OCR_PROTOCOL", "talos.ocr.worker.v2"),
        ("TALOS_OCR_VLLM_URL", "https://user:pass@example.test"),
        ("TALOS_OCR_VLLM_URL", "file:///tmp/model"),
        ("TALOS_OCR_MODEL_REVISION", "main"),
        ("TALOS_OCR_SERVED_MODEL", "deepseek-ai/DeepSeek-OCR-2"),
        ("TALOS_OCR_VLLM_VERSION", "latest"),
        ("TALOS_OCR_MAX_REQUEST_BYTES", "0"),
        ("TALOS_OCR_MAX_SOURCE_BYTES", "-1"),
        ("TALOS_OCR_MAX_CONCURRENCY", "3"),
        ("TALOS_OCR_REQUEST_TIMEOUT_SECONDS", "0"),
        ("TALOS_OCR_PDF_SCALE", "0"),
    ],
)
def test_settings_reject_missing_token_moving_protocol_and_invalid_limits(
    valid_ocr_environment: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    key: str,
    value: str,
) -> None:
    monkeypatch.setenv(key, value)

    with pytest.raises(OcrFault) as captured:
        Settings.from_env()

    assert captured.value.code == "TALOS_OCR_CONFIGURATION_INVALID"
    assert captured.value.status_code == 500
    assert captured.value.retryable is False
