from __future__ import annotations

import hashlib
import io
from dataclasses import replace

import pytest
from PIL import Image, PngImagePlugin
from pypdf import PdfReader, PdfWriter

from talos_ocr_worker.config import Settings
from talos_ocr_worker.errors import OcrFault
from talos_ocr_worker.rendering import PillowPdfiumRenderer


def image_source(
    image_format: str,
    *,
    size: tuple[int, int] = (16, 12),
    metadata: bool = False,
) -> bytes:
    image = Image.new("RGB", size, color=(31, 97, 173))
    output = io.BytesIO()
    options: dict[str, object] = {}
    if image_format == "PNG" and metadata:
        pnginfo = PngImagePlugin.PngInfo()
        pnginfo.add_text("private-marker", "must-not-survive")
        options["pnginfo"] = pnginfo
    image.save(output, format=image_format, **options)
    return output.getvalue()


def pdf_source(page_sizes: list[tuple[int, int]]) -> bytes:
    pages = [
        Image.new("RGB", size, color=(index * 60 + 20, 40, 120))
        for index, size in enumerate(page_sizes)
    ]
    output = io.BytesIO()
    pages[0].save(
        output,
        format="PDF",
        save_all=True,
        append_images=pages[1:],
        resolution=72.0,
    )
    return output.getvalue()


def encrypted_pdf_source() -> bytes:
    reader = PdfReader(io.BytesIO(pdf_source([(10, 10)])))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt("talos-test-password", algorithm="RC4-128")
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def renderer(settings: Settings, **overrides: object) -> PillowPdfiumRenderer:
    return PillowPdfiumRenderer(replace(settings, **overrides))


def test_png_jpeg_webp_are_verified_normalized_and_metadata_stripped(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    cases = (
        ("PNG", "image/png", True),
        ("JPEG", "image/jpeg", False),
        ("WEBP", "image/webp", False),
    )

    for image_format, mime_type, metadata in cases:
        pages = renderer(settings).render(
            image_source(image_format, metadata=metadata),
            mime_type,
        )

        assert len(pages) == 1
        page = pages[0]
        assert (page.index, page.width, page.height) == (1, 16, 12)
        assert page.png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        assert page.sha256 == hashlib.sha256(page.png_bytes).hexdigest()
        with Image.open(io.BytesIO(page.png_bytes)) as normalized:
            assert normalized.format == "PNG"
            assert normalized.mode == "RGB"
            assert "private-marker" not in normalized.info
            assert "exif" not in normalized.info
            assert "icc_profile" not in normalized.info


def test_animated_image_pixel_bomb_mime_spoof_and_corrupt_image_fail_closed(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    first = Image.new("RGB", (8, 8), color="red")
    second = Image.new("RGB", (8, 8), color="blue")
    animated = io.BytesIO()
    first.save(
        animated,
        format="WEBP",
        save_all=True,
        append_images=[second],
        duration=100,
        loop=0,
    )
    cases = (
        (renderer(settings), animated.getvalue(), "image/webp"),
        (
            renderer(settings, max_image_pixels=63, max_total_pixels=63),
            image_source("PNG", size=(8, 8)),
            "image/png",
        ),
        (renderer(settings), image_source("PNG"), "image/jpeg"),
        (renderer(settings), b"not-an-image", "image/png"),
    )

    for candidate, source, mime_type in cases:
        with pytest.raises(OcrFault) as captured:
            candidate.render(source, mime_type)

        assert captured.value.code in {
            "TALOS_OCR_SOURCE_INVALID",
            "TALOS_OCR_SOURCE_LIMIT_EXCEEDED",
        }
        assert captured.value.retryable is False


def test_pdf_pages_render_in_order_with_exact_hash_dimensions_and_renderer_pin(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    pages = renderer(settings).render(
        pdf_source([(40, 20), (30, 25)]),
        "application/pdf",
    )

    assert [(page.index, page.width, page.height) for page in pages] == [
        (1, 80, 40),
        (2, 60, 50),
    ]
    assert pages[0].sha256 != pages[1].sha256
    for page in pages:
        assert page.sha256 == hashlib.sha256(page.png_bytes).hexdigest()
        assert page.png_bytes.startswith(b"\x89PNG\r\n\x1a\n")


def test_encrypted_corrupt_page_limit_and_total_pixel_limit_pdf_fail_closed(
    valid_ocr_environment: dict[str, str],
) -> None:
    settings = Settings.from_env()
    cases = (
        (renderer(settings), encrypted_pdf_source(), "application/pdf"),
        (renderer(settings), b"%PDF-1.7\ncorrupt", "application/pdf"),
        (
            renderer(settings, max_pdf_pages=1),
            pdf_source([(10, 10), (10, 10)]),
            "application/pdf",
        ),
        (
            renderer(settings, max_image_pixels=399, max_total_pixels=399),
            pdf_source([(10, 10)]),
            "application/pdf",
        ),
    )

    for candidate, source, mime_type in cases:
        with pytest.raises(OcrFault) as captured:
            candidate.render(source, mime_type)

        assert captured.value.code in {
            "TALOS_OCR_SOURCE_INVALID",
            "TALOS_OCR_SOURCE_LIMIT_EXCEEDED",
        }
        assert captured.value.retryable is False


def test_non_finite_pdf_page_dimensions_fail_as_controlled_source_fault(
    valid_ocr_environment: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class NonFinitePage:
        def get_size(self) -> tuple[float, float]:
            return (float("inf"), 10.0)

        def close(self) -> None:
            return None

    class NonFiniteDocument:
        def __enter__(self):
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def __len__(self) -> int:
            return 1

        def __getitem__(self, offset: int) -> NonFinitePage:
            assert offset == 0
            return NonFinitePage()

    monkeypatch.setattr(
        "talos_ocr_worker.rendering.pdfium.PdfDocument",
        lambda source: NonFiniteDocument(),
    )

    with pytest.raises(OcrFault) as captured:
        renderer(Settings.from_env()).render(b"%PDF-1.7\n", "application/pdf")

    assert captured.value.code == "TALOS_OCR_SOURCE_INVALID"
