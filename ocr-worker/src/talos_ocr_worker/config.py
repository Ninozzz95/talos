from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version as distribution_version
from urllib.parse import urlsplit

from .errors import OcrFault


PROTOCOL = "talos.ocr.worker.v1"
MODEL = "deepseek-ai/DeepSeek-OCR-2"
MODEL_REVISION = "aaa02f3811945a91062062994c5c4a3f4c0af2b0"
VLLM_VERSION = "0.25.1"
PDF_RENDERER_VERSION = "5.12.1"
IMAGE_RENDERER_VERSION = "12.3.0"


def _configuration_fault() -> OcrFault:
    return OcrFault(
        "TALOS_OCR_CONFIGURATION_INVALID",
        "The OCR worker configuration is invalid.",
        status_code=500,
    )


def _required(name: str) -> str:
    value = os.getenv(name, "")
    if value == "":
        raise _configuration_fault()
    return value


def _integer(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except (TypeError, ValueError) as error:
        raise _configuration_fault() from error


def _number(name: str, default: float) -> float:
    raw = os.getenv(name, str(default))
    try:
        return float(raw)
    except (TypeError, ValueError) as error:
        raise _configuration_fault() from error


@dataclass(frozen=True, slots=True)
class Settings:
    worker_token: str
    protocol: str
    vllm_url: str
    vllm_api_key: str
    model: str
    model_revision: str
    served_model: str
    vllm_version: str
    pdf_renderer_version: str
    image_renderer_version: str
    max_request_bytes: int
    max_source_bytes: int
    max_response_bytes: int
    max_text_bytes: int
    max_pdf_pages: int
    pdf_scale: float
    max_image_pixels: int
    max_total_pixels: int
    max_completion_tokens: int
    max_concurrency: int
    request_timeout_seconds: float
    connect_timeout_seconds: float
    write_timeout_seconds: float
    read_timeout_seconds: float
    pool_timeout_seconds: float

    @classmethod
    def from_env(cls) -> "Settings":
        try:
            settings = cls(
                worker_token=_required("TALOS_OCR_WORKER_TOKEN"),
                protocol=os.getenv("TALOS_OCR_PROTOCOL", PROTOCOL),
                vllm_url=os.getenv("TALOS_OCR_VLLM_URL", "http://ocr-runtime:8000"),
                vllm_api_key=_required("TALOS_OCR_VLLM_API_KEY"),
                model=os.getenv("TALOS_OCR_MODEL", MODEL),
                model_revision=os.getenv("TALOS_OCR_MODEL_REVISION", MODEL_REVISION),
                served_model=os.getenv(
                    "TALOS_OCR_SERVED_MODEL",
                    f"{MODEL}@{MODEL_REVISION}",
                ),
                vllm_version=os.getenv("TALOS_OCR_VLLM_VERSION", VLLM_VERSION),
                pdf_renderer_version=distribution_version("pypdfium2"),
                image_renderer_version=distribution_version("pillow"),
                max_request_bytes=_integer("TALOS_OCR_MAX_REQUEST_BYTES", 15_728_640),
                max_source_bytes=_integer("TALOS_OCR_MAX_SOURCE_BYTES", 10_485_760),
                max_response_bytes=_integer("TALOS_OCR_MAX_RESPONSE_BYTES", 10_485_760),
                max_text_bytes=_integer("TALOS_OCR_MAX_TEXT_BYTES", 5_242_880),
                max_pdf_pages=_integer("TALOS_OCR_MAX_PDF_PAGES", 20),
                pdf_scale=_number("TALOS_OCR_PDF_SCALE", 2.0),
                max_image_pixels=_integer("TALOS_OCR_MAX_IMAGE_PIXELS", 16_000_000),
                max_total_pixels=_integer("TALOS_OCR_MAX_TOTAL_PIXELS", 80_000_000),
                max_completion_tokens=_integer(
                    "TALOS_OCR_MAX_COMPLETION_TOKENS",
                    8_192,
                ),
                max_concurrency=_integer("TALOS_OCR_MAX_CONCURRENCY", 2),
                request_timeout_seconds=_number(
                    "TALOS_OCR_REQUEST_TIMEOUT_SECONDS",
                    170,
                ),
                connect_timeout_seconds=_number(
                    "TALOS_OCR_CONNECT_TIMEOUT_SECONDS",
                    3,
                ),
                write_timeout_seconds=_number("TALOS_OCR_WRITE_TIMEOUT_SECONDS", 30),
                read_timeout_seconds=_number("TALOS_OCR_READ_TIMEOUT_SECONDS", 180),
                pool_timeout_seconds=_number("TALOS_OCR_POOL_TIMEOUT_SECONDS", 5),
            )
        except PackageNotFoundError as error:
            raise _configuration_fault() from error
        settings.validate()
        return settings

    def validate(self) -> None:
        if not re.fullmatch(r"[0-9a-fA-F]{64,}", self.worker_token):
            raise _configuration_fault()
        if not re.fullmatch(r"[0-9a-fA-F]{64,}", self.vllm_api_key):
            raise _configuration_fault()
        if self.protocol != PROTOCOL:
            raise _configuration_fault()
        if self.model != MODEL or self.model_revision != MODEL_REVISION:
            raise _configuration_fault()
        if self.served_model != f"{MODEL}@{MODEL_REVISION}":
            raise _configuration_fault()
        if self.vllm_version != VLLM_VERSION:
            raise _configuration_fault()
        if self.pdf_renderer_version != PDF_RENDERER_VERSION:
            raise _configuration_fault()
        if self.image_renderer_version != IMAGE_RENDERER_VERSION:
            raise _configuration_fault()

        try:
            parsed_url = urlsplit(self.vllm_url)
            port = parsed_url.port
        except ValueError as error:
            raise _configuration_fault() from error
        if (
            parsed_url.scheme not in {"http", "https"}
            or not parsed_url.hostname
            or parsed_url.username is not None
            or parsed_url.password is not None
            or parsed_url.query
            or parsed_url.fragment
            or parsed_url.path not in {"", "/"}
            or port is None
        ):
            raise _configuration_fault()

        positive_integers = (
            self.max_request_bytes,
            self.max_source_bytes,
            self.max_response_bytes,
            self.max_text_bytes,
            self.max_pdf_pages,
            self.max_image_pixels,
            self.max_total_pixels,
            self.max_completion_tokens,
        )
        positive_numbers = (
            self.pdf_scale,
            self.request_timeout_seconds,
            self.connect_timeout_seconds,
            self.write_timeout_seconds,
            self.read_timeout_seconds,
            self.pool_timeout_seconds,
        )
        if any(value <= 0 for value in positive_integers) or any(
            not math.isfinite(value) or value <= 0 for value in positive_numbers
        ):
            raise _configuration_fault()
        if not 1 <= self.max_concurrency <= 2:
            raise _configuration_fault()
        if self.max_source_bytes > self.max_request_bytes:
            raise _configuration_fault()
        if self.max_text_bytes > self.max_response_bytes:
            raise _configuration_fault()
        if self.max_pdf_pages > 20 or self.pdf_scale > 4.0:
            raise _configuration_fault()
        if self.max_image_pixels > self.max_total_pixels:
            raise _configuration_fault()
        if self.max_completion_tokens > 8_192:
            raise _configuration_fault()
