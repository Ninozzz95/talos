from __future__ import annotations

import hashlib
import io
import math
import threading
import warnings
from dataclasses import dataclass

import pypdfium2 as pdfium
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import Settings
from .errors import OcrFault


_PIL_LOCK = threading.Lock()
_PDFIUM_LOCK = threading.Lock()
_IMAGE_FORMATS = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
}


def _invalid_source() -> OcrFault:
    return OcrFault(
        "TALOS_OCR_SOURCE_INVALID",
        "The OCR source is invalid or unsupported.",
        status_code=422,
    )


def _source_limit() -> OcrFault:
    return OcrFault(
        "TALOS_OCR_SOURCE_LIMIT_EXCEEDED",
        "The OCR source exceeds a configured safety limit.",
        status_code=413,
    )


@dataclass(frozen=True, slots=True)
class RenderedPage:
    index: int
    width: int
    height: int
    png_bytes: bytes
    sha256: str


class PillowPdfiumRenderer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def render(self, source: bytes, mime_type: str) -> list[RenderedPage]:
        if not source or len(source) > self.settings.max_source_bytes:
            raise _source_limit()
        if mime_type == "application/pdf":
            return self._render_pdf(source)
        if mime_type in _IMAGE_FORMATS:
            return [self._render_image(source, mime_type)]
        raise _invalid_source()

    def _render_image(self, source: bytes, mime_type: str) -> RenderedPage:
        expected_format = _IMAGE_FORMATS[mime_type]
        with _PIL_LOCK:
            previous_limit = Image.MAX_IMAGE_PIXELS
            Image.MAX_IMAGE_PIXELS = self.settings.max_image_pixels
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(
                        io.BytesIO(source),
                        formats=[expected_format],
                    ) as candidate:
                        self._validate_image(candidate, expected_format)
                        candidate.verify()
                    with Image.open(
                        io.BytesIO(source),
                        formats=[expected_format],
                    ) as decoded:
                        self._validate_image(decoded, expected_format)
                        decoded.load()
                        normalized = self._flatten_to_rgb(ImageOps.exif_transpose(decoded))
            except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
                raise _source_limit() from error
            except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
                raise _invalid_source() from error
            finally:
                Image.MAX_IMAGE_PIXELS = previous_limit

        png_bytes = self._encode_png(normalized)
        normalized.close()
        return RenderedPage(
            index=1,
            width=self._checked_dimension(png_bytes, 0),
            height=self._checked_dimension(png_bytes, 1),
            png_bytes=png_bytes,
            sha256=hashlib.sha256(png_bytes).hexdigest(),
        )

    def _render_pdf(self, source: bytes) -> list[RenderedPage]:
        if not source.startswith(b"%PDF-"):
            raise _invalid_source()

        rendered: list[RenderedPage] = []
        total_pixels = 0
        try:
            with _PDFIUM_LOCK, pdfium.PdfDocument(source) as document:
                page_count = len(document)
                if page_count < 1:
                    raise _invalid_source()
                if page_count > self.settings.max_pdf_pages:
                    raise _source_limit()

                for offset in range(page_count):
                    page = document[offset]
                    bitmap = None
                    try:
                        width_points, height_points = page.get_size()
                        projected_width = math.ceil(width_points * self.settings.pdf_scale)
                        projected_height = math.ceil(height_points * self.settings.pdf_scale)
                        self._enforce_pixels(projected_width, projected_height, total_pixels)
                        bitmap = page.render(scale=self.settings.pdf_scale, rotation=0)
                        normalized = bitmap.to_pil().convert("RGB").copy()
                    finally:
                        if bitmap is not None:
                            bitmap.close()
                        page.close()

                    width, height = normalized.size
                    page_pixels = width * height
                    self._enforce_pixels(width, height, total_pixels)
                    total_pixels += page_pixels
                    png_bytes = self._encode_png(normalized)
                    normalized.close()
                    rendered.append(
                        RenderedPage(
                            index=offset + 1,
                            width=width,
                            height=height,
                            png_bytes=png_bytes,
                            sha256=hashlib.sha256(png_bytes).hexdigest(),
                        )
                    )
        except OcrFault:
            raise
        except (
            pdfium.PdfiumError,
            OSError,
            OverflowError,
            RuntimeError,
            ValueError,
        ) as error:
            raise _invalid_source() from error

        return rendered

    def _validate_image(self, image: Image.Image, expected_format: str) -> None:
        if image.format != expected_format:
            raise _invalid_source()
        if bool(getattr(image, "is_animated", False)) or int(
            getattr(image, "n_frames", 1)
        ) != 1:
            raise _invalid_source()
        self._enforce_pixels(image.width, image.height, 0)

    def _enforce_pixels(self, width: int, height: int, previous: int) -> None:
        if width <= 0 or height <= 0:
            raise _invalid_source()
        pixels = width * height
        if (
            pixels > self.settings.max_image_pixels
            or previous + pixels > self.settings.max_total_pixels
        ):
            raise _source_limit()

    @staticmethod
    def _flatten_to_rgb(image: Image.Image) -> Image.Image:
        rgba = image.convert("RGBA")
        flattened = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        flattened.alpha_composite(rgba)
        rgb = flattened.convert("RGB")
        rgba.close()
        flattened.close()
        return rgb

    @staticmethod
    def _encode_png(image: Image.Image) -> bytes:
        output = io.BytesIO()
        image.save(
            output,
            format="PNG",
            optimize=False,
            compress_level=9,
            exif=b"",
            icc_profile=None,
        )
        return output.getvalue()

    @staticmethod
    def _checked_dimension(source: bytes, axis: int) -> int:
        with Image.open(io.BytesIO(source), formats=["PNG"]) as image:
            return image.size[axis]
