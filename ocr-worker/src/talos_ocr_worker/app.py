from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings
from .contracts import ErrorData, ErrorResponse, HealthResponse, OcrRequest
from .errors import OcrFault
from .middleware import BodyLimitMiddleware, WorkerAuthMiddleware


def _error_response(
    *,
    code: str,
    message: str,
    status_code: int,
    retryable: bool = False,
) -> JSONResponse:
    payload = ErrorResponse(
        error=ErrorData(code=code, message=message, retryable=retryable)
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))


def create_app(
    settings: Settings | None = None,
    *,
    service: Any | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_env()
    if service is None:
        from .service import OcrService

        service = OcrService(resolved_settings)

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        del application
        try:
            yield
        finally:
            close = getattr(service, "close", None)
            if close is not None:
                await close()

    app = FastAPI(
        title="TALOS OCR Worker",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        BodyLimitMiddleware,
        maximum_bytes=resolved_settings.max_request_bytes,
    )
    app.add_middleware(
        WorkerAuthMiddleware,
        worker_token=resolved_settings.worker_token,
        protected_paths={"/ready", "/v1/ocr"},
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        del request, error
        return _error_response(
            code="TALOS_OCR_REQUEST_INVALID",
            message="The OCR request is malformed.",
            status_code=422,
        )

    @app.exception_handler(OcrFault)
    async def ocr_fault_handler(request: Request, error: OcrFault) -> JSONResponse:
        del request
        return _error_response(
            code=error.code,
            message=error.safe_message,
            status_code=error.status_code,
            retryable=error.retryable,
        )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/ready")
    async def ready(request: Request):
        del request
        return await service.readiness()

    @app.post("/v1/ocr")
    async def extract(request: Request, payload: OcrRequest):
        del request
        return await service.extract(payload)

    return app
