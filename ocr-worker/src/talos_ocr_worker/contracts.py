from __future__ import annotations

import base64
import hashlib
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


PROTOCOL = "talos.ocr.worker.v1"
MimeType = Literal["application/pdf", "image/png", "image/jpeg", "image/webp"]


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class OcrInput(_StrictModel):
    mime_type: MimeType
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    bytes_base64: str = Field(min_length=4)

    @model_validator(mode="after")
    def validate_encoded_source(self) -> "OcrInput":
        try:
            decoded = base64.b64decode(self.bytes_base64, validate=True)
        except (ValueError, base64.binascii.Error) as error:
            raise ValueError("bytes_base64 must be strict base64") from error
        if not decoded:
            raise ValueError("bytes_base64 must not decode to an empty source")
        if base64.b64encode(decoded).decode("ascii") != self.bytes_base64:
            raise ValueError("bytes_base64 must use canonical base64 encoding")
        if not hashlib.sha256(decoded).hexdigest() == self.sha256:
            raise ValueError("sha256 does not match bytes_base64")
        return self


class OcrRequest(_StrictModel):
    protocol: Literal["talos.ocr.worker.v1"]
    request_id: UUID
    owner_ref: UUID
    input: OcrInput


class OcrPageUsage(_StrictModel):
    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)


class OcrPageEvidence(_StrictModel):
    index: int = Field(ge=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    image_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    text: str
    text_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    latency_ms: int = Field(ge=0)
    usage: OcrPageUsage
    warnings: list[str] = Field(default_factory=list)


class OcrProvenance(_StrictModel):
    model: str
    model_revision: str
    served_model: str
    runtime: Literal["vllm"]
    runtime_version: str
    renderer: Literal["pillow", "pypdfium2"]
    renderer_version: str


class OcrResponseData(_StrictModel):
    protocol: Literal["talos.ocr.worker.v1"]
    request_id: UUID
    owner_ref: UUID
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    text: str
    text_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    pages: list[OcrPageEvidence]
    provenance: OcrProvenance
    warnings: list[str] = Field(default_factory=list)


class OcrResponse(_StrictModel):
    data: OcrResponseData


class HealthResponse(_StrictModel):
    protocol: Literal["talos.ocr.worker.v1"] = PROTOCOL
    status: Literal["alive"] = "alive"


class ReadyData(_StrictModel):
    protocol: Literal["talos.ocr.worker.v1"]
    status: Literal["ready"]
    model: str
    model_revision: str
    served_model: str
    runtime: Literal["vllm"]
    runtime_version: str
    pdf_renderer: Literal["pypdfium2"]
    pdf_renderer_version: str
    image_renderer: Literal["pillow"]
    image_renderer_version: str


class ReadyResponse(_StrictModel):
    data: ReadyData


class ErrorData(_StrictModel):
    code: str
    message: str
    retryable: bool


class ErrorResponse(_StrictModel):
    error: ErrorData


class VllmReadiness(_StrictModel):
    status: Literal["ready"]
    version: str
    served_models: list[str]


class VllmPageResult(_StrictModel):
    text: str
    latency_ms: int = Field(ge=0)
    usage: OcrPageUsage
    finish_reason: str
    warnings: list[str] = Field(default_factory=list)

