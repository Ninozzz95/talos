from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from talos_human_journey.auth import BearerTokenVerifier, verify_bearer
from talos_human_journey.body_limit import BodyLimitMiddleware
from talos_human_journey.config import Settings
from talos_human_journey.contracts import CreateTrialRequest, CreateTrialResponse, NextTurnRequest, TurnResponse
from talos_human_journey.tau2_actor import Tau2HumanActor, Tau2WorkerFault
from talos_human_journey.trial_store import TrialStoreFault


def _fault_status(code: str) -> int:
    if code == "TRIAL_NOT_FOUND":
        return 404
    if code == "TRIAL_CAPACITY_EXCEEDED":
        return 429
    if code in {"TRIAL_BUSY", "TRIAL_ACTIVE", "TRIAL_TERMINAL"}:
        return 409
    if code.startswith("SIMULATOR_") or code.startswith("TRIAL_"):
        return 422
    if code in {"WORKER_TIMEOUT", "PROVIDER_FAILED"}:
        return 502
    return 500


def create_app(settings: Settings, *, actor: Tau2HumanActor | None = None) -> FastAPI:
    human_actor = actor or Tau2HumanActor(settings=settings)
    process_verifier = BearerTokenVerifier(settings.auth_token)
    bearer = HTTPBearer(auto_error=False)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        await human_actor.close()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(BodyLimitMiddleware, max_body_bytes=settings.max_body_bytes)
    app.state.human_actor = human_actor

    def require_process_token(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> None:
        verify_bearer(credentials, process_verifier)

    def require_json(request: Request) -> None:
        media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if media_type != "application/json" and not media_type.endswith("+json"):
            raise HTTPException(status_code=415, detail="Content-Type must be application/json")

    @app.exception_handler(TrialStoreFault)
    async def handle_store_fault(_request: Request, error: TrialStoreFault) -> JSONResponse:
        return JSONResponse(
            status_code=_fault_status(error.code),
            content={"error": {"code": error.code, "message": "The trial is unavailable or cannot perform that operation."}},
        )

    @app.exception_handler(Tau2WorkerFault)
    async def handle_worker_fault(_request: Request, error: Tau2WorkerFault) -> JSONResponse:
        return JSONResponse(
            status_code=_fault_status(error.code),
            content={"error": {"code": error.code, "message": error.safe_message}},
        )

    @app.get("/healthz")
    async def health() -> dict[str, object]:
        return {
            "contract": "talos.human_journey.health",
            "schema_version": 1,
            "status": "alive",
        }

    @app.get("/readyz", dependencies=[Depends(require_process_token)])
    async def readiness() -> dict[str, object]:
        prompt = Path(__file__).resolve().parents[2] / "upstream" / "tau2" / "user_simulator" / "simulation_guidelines.md"
        ready = prompt.is_file()
        return {
            "contract": "talos.human_journey.readiness",
            "schema_version": 1,
            "status": "ready" if ready else "not_ready",
            "config_ready": True,
            "vendored_data_ready": ready,
            "store_ready": True,
            "simulator_endpoint_sha256": human_actor.simulator_endpoint_sha256,
        }

    @app.post(
        "/v1/trials",
        status_code=201,
        response_model=CreateTrialResponse,
        dependencies=[Depends(require_process_token), Depends(require_json)],
    )
    async def create_trial(payload: CreateTrialRequest) -> CreateTrialResponse:
        return human_actor.create_trial(payload)

    @app.post(
        "/v1/trials/{trial_id}/turns",
        response_model=TurnResponse,
        dependencies=[Depends(require_process_token), Depends(require_json)],
    )
    async def next_turn(
        trial_id: str,
        payload: NextTurnRequest,
        trial_token: str | None = Header(default=None, alias="X-Talos-Trial-Token"),
    ):
        return await human_actor.next_turn(trial_id, trial_token, payload)

    @app.post(
        "/v1/trials/{trial_id}/cancel",
        response_model=TurnResponse,
        dependencies=[Depends(require_process_token)],
    )
    async def cancel_trial(
        trial_id: str,
        trial_token: str | None = Header(default=None, alias="X-Talos-Trial-Token"),
    ):
        return await human_actor.cancel(trial_id, trial_token)

    @app.delete(
        "/v1/trials/{trial_id}",
        status_code=204,
        dependencies=[Depends(require_process_token)],
    )
    async def delete_trial(
        trial_id: str,
        trial_token: str | None = Header(default=None, alias="X-Talos-Trial-Token"),
    ) -> Response:
        if not human_actor.delete(trial_id, trial_token):
            raise TrialStoreFault("TRIAL_NOT_FOUND")
        return Response(status_code=204)

    return app


def create_runtime_app() -> FastAPI:
    """Create the sidecar only after validating startup environment and secrets."""

    return create_app(Settings.from_env())
