from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
from typing import Any
from uuid import uuid4

import httpx
import pytest
from PIL import Image, ImageDraw

from talos_ocr_worker.rendering import PillowPdfiumRenderer


MODEL = "deepseek-ai/DeepSeek-OCR-2"
MODEL_REVISION = "aaa02f3811945a91062062994c5c4a3f4c0af2b0"
SERVED_MODEL = f"{MODEL}@{MODEL_REVISION}"
LIVE_ENABLED = os.getenv("TALOS_OCR_LIVE", "").lower() in {"1", "true", "yes", "on"}
LIVE_TOKEN = os.getenv("TALOS_OCR_WORKER_TOKEN", "")
LIVE_URL = os.getenv("TALOS_OCR_URL", "http://127.0.0.1:13200").rstrip("/")

pytestmark = pytest.mark.skipif(
    not LIVE_ENABLED,
    reason="Set TALOS_OCR_LIVE=1 to run the real DeepSeek OCR-2/vLLM gate.",
)


class _RendererLimits:
    max_source_bytes = 10_485_760
    max_pdf_pages = 20
    pdf_scale = 2.0
    max_image_pixels = 16_000_000
    max_total_pixels = 80_000_000


def _sentinel_image() -> Image.Image:
    glyphs = {
        " ": ("00000",) * 7,
        "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
        "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
        "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
        "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
        "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
        "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
        "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
        "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
        "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
        "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    }
    text = "TALOS OCR LIVE"
    scale = 14
    margin = 32
    width = margin * 2 + ((len(text) * 6) - 1) * scale
    height = margin * 2 + 7 * scale
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    for character_index, character in enumerate(text):
        glyph = glyphs[character]
        for row, bits in enumerate(glyph):
            for column, bit in enumerate(bits):
                if bit == "1":
                    left = margin + ((character_index * 6 + column) * scale)
                    top = margin + row * scale
                    draw.rectangle(
                        (left, top, left + scale - 1, top + scale - 1),
                        fill="black",
                    )
    return image


def _encoded_sources() -> list[tuple[str, bytes, str, str]]:
    image = _sentinel_image()
    png_output = io.BytesIO()
    image.save(png_output, format="PNG", optimize=False, compress_level=9)
    pdf_output = io.BytesIO()
    image.save(pdf_output, format="PDF", resolution=144.0)
    image.close()
    return [
        ("image/png", png_output.getvalue(), "pillow", "12.3.0"),
        ("application/pdf", pdf_output.getvalue(), "pypdfium2", "5.12.1"),
    ]


def _request(source: bytes, mime_type: str) -> tuple[dict[str, Any], str, str]:
    request_id = str(uuid4())
    owner_ref = str(uuid4())
    return (
        {
            "protocol": "talos.ocr.worker.v1",
            "request_id": request_id,
            "owner_ref": owner_ref,
            "input": {
                "mime_type": mime_type,
                "sha256": hashlib.sha256(source).hexdigest(),
                "bytes_base64": base64.b64encode(source).decode("ascii"),
            },
        },
        request_id,
        owner_ref,
    )


def _assert_no_location_authority(value: Any) -> None:
    if isinstance(value, dict):
        assert "url" not in value
        assert "path" not in value
        for child in value.values():
            _assert_no_location_authority(child)
    elif isinstance(value, list):
        for child in value:
            _assert_no_location_authority(child)


def _assert_ocr_response(
    data: dict[str, Any],
    *,
    source: bytes,
    mime_type: str,
    request_id: str,
    owner_ref: str,
    renderer: str,
    renderer_version: str,
) -> None:
    expected_pages = PillowPdfiumRenderer(_RendererLimits()).render(source, mime_type)
    assert data["protocol"] == "talos.ocr.worker.v1"
    assert data["request_id"] == request_id
    assert data["owner_ref"] == owner_ref
    assert data["source_sha256"] == hashlib.sha256(source).hexdigest()
    assert "TALOS" in re.sub(r"[^A-Z0-9]", "", data["text"].upper())
    assert data["text_sha256"] == hashlib.sha256(data["text"].encode()).hexdigest()
    assert [page["image_sha256"] for page in data["pages"]] == [
        page.sha256 for page in expected_pages
    ]
    for page in data["pages"]:
        assert page["text_sha256"] == hashlib.sha256(page["text"].encode()).hexdigest()
        assert re.fullmatch(r"[0-9a-f]{64}", page["image_sha256"])
    assert data["provenance"] == {
        "model": MODEL,
        "model_revision": MODEL_REVISION,
        "served_model": SERVED_MODEL,
        "runtime": "vllm",
        "runtime_version": "0.25.1",
        "renderer": renderer,
        "renderer_version": renderer_version,
    }
    assert "bytes_base64" not in json.dumps(data, sort_keys=True)
    _assert_no_location_authority(data)


def test_real_worker_extracts_image_and_pdf_sentinels_with_exact_provenance() -> None:
    assert re.fullmatch(r"[0-9a-fA-F]{64,}", LIVE_TOKEN), (
        "TALOS_OCR_WORKER_TOKEN must contain the credential generated for the live stack."
    )
    timeout = httpx.Timeout(240.0, connect=10.0, write=30.0, pool=5.0)
    with httpx.Client(
        base_url=LIVE_URL,
        headers={"X-Talos-Ocr-Token": LIVE_TOKEN, "Accept": "application/json"},
        timeout=timeout,
        follow_redirects=False,
        trust_env=False,
    ) as client:
        readiness = client.get("/ready")
        assert readiness.status_code == 200, readiness.text
        assert readiness.json()["data"] == {
            "protocol": "talos.ocr.worker.v1",
            "status": "ready",
            "model": MODEL,
            "model_revision": MODEL_REVISION,
            "served_model": SERVED_MODEL,
            "runtime": "vllm",
            "runtime_version": "0.25.1",
            "pdf_renderer": "pypdfium2",
            "pdf_renderer_version": "5.12.1",
            "image_renderer": "pillow",
            "image_renderer_version": "12.3.0",
        }

        for mime_type, source, renderer, renderer_version in _encoded_sources():
            payload, request_id, owner_ref = _request(source, mime_type)
            response = client.post("/v1/ocr", json=payload)
            assert response.status_code == 200, response.text
            _assert_ocr_response(
                response.json()["data"],
                source=source,
                mime_type=mime_type,
                request_id=request_id,
                owner_ref=owner_ref,
                renderer=renderer,
                renderer_version=renderer_version,
            )
