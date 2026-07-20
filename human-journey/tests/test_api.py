from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from talos_human_journey.auth import BearerTokenVerifier, verify_bearer, verify_trial_token
from talos_human_journey.body_limit import BodyLimitMiddleware
from talos_human_journey.api import create_app, create_runtime_app
from talos_human_journey.tau2_actor import Tau2HumanActor

from test_tau2_actor import ActorWorker, actor_settings, create_trial_request, fixture_message


def test_process_and_trial_tokens_share_constant_time_owner_safe_failures(monkeypatch) -> None:
    comparisons: list[tuple[bytes, bytes]] = []

    def record_comparison(left: bytes, right: bytes) -> bool:
        comparisons.append((left, right))
        return left == right

    monkeypatch.setattr("talos_human_journey.auth.hmac.compare_digest", record_comparison)
    verifier = BearerTokenVerifier("x" * 43)

    assert verify_bearer(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="x" * 43),
        verifier,
    ) is None
    for credentials in (None, HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong")):
        with pytest.raises(HTTPException) as process_error:
            verify_bearer(credentials, verifier)
        assert process_error.value.status_code == 401
        assert process_error.value.detail == "Not authenticated"
        assert process_error.value.headers == {"WWW-Authenticate": "Bearer"}

    assert verify_trial_token(verifier, "x" * 43) is True
    assert verify_trial_token(verifier, "wrong") is False
    assert verify_trial_token(verifier, None) is False
    assert comparisons
    assert all(isinstance(left, bytes) and isinstance(right, bytes) for left, right in comparisons)
    assert all(len(left) == len(right) == 32 for left, right in comparisons)
    assert "x" * 43 not in repr(verifier)


@pytest.mark.asyncio
async def test_body_limit_rejects_declared_and_streamed_overflow_before_mutation() -> None:
    mutations: list[bytes] = []

    async def application(scope, receive, send) -> None:
        body = b""
        while True:
            message = await receive()
            body += message.get("body", b"")
            if not message.get("more_body", False):
                break
        mutations.append(body)
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = BodyLimitMiddleware(application, max_body_bytes=5)

    async def run_request(headers: list[tuple[bytes, bytes]], chunks: list[bytes]) -> list[dict[str, object]]:
        sent: list[dict[str, object]] = []
        queue = [
            {"type": "http.request", "body": chunk, "more_body": index < len(chunks) - 1}
            for index, chunk in enumerate(chunks)
        ]

        async def receive() -> dict[str, object]:
            return queue.pop(0)

        async def send(message: dict[str, object]) -> None:
            sent.append(message)

        await middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/v1/trials",
                "headers": headers,
            },
            receive,
            send,
        )
        return sent

    declared = await run_request([(b"content-length", b"6")], [b"ignore"])
    streamed = await run_request([], [b"abc", b"def"])

    for messages in (declared, streamed):
        assert messages[0]["status"] == 413
        assert json.loads(messages[1]["body"]) == {
            "error": {
                "code": "REQUEST_BODY_TOO_LARGE",
                "message": "The JSON request body exceeds the configured limit.",
            }
        }
    assert mutations == []


@pytest.mark.asyncio
async def test_body_limit_passes_non_http_and_bounded_http_requests() -> None:
    calls: list[str] = []

    async def application(scope, receive, send) -> None:
        calls.append(scope["type"])
        if scope["type"] == "http":
            await receive()
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

    middleware = BodyLimitMiddleware(application, max_body_bytes=5)

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"12345", "more_body": False}

    async def send(_message: dict[str, object]) -> None:
        return None

    await middleware({"type": "lifespan"}, receive, send)
    await middleware({"type": "http", "headers": []}, receive, send)

    assert calls == ["lifespan", "http"]


def auth_headers(token: str = "s" * 43) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_sidecar_health_auth_trial_ownership_and_shutdown_contract() -> None:
    worker = ActorWorker([fixture_message(1)])
    settings = actor_settings()
    actor = Tau2HumanActor(settings=settings, worker=worker)
    app = create_app(settings, actor=actor)

    with TestClient(app) as client:
        health = client.get("/healthz")
        assert health.status_code == 200
        assert health.json() == {
            "contract": "talos.human_journey.health",
            "schema_version": 1,
            "status": "alive",
        }

        missing = client.get("/readyz")
        wrong = client.get("/readyz", headers=auth_headers("wrong"))
        assert missing.status_code == wrong.status_code == 401
        assert missing.json() == wrong.json() == {"detail": "Not authenticated"}

        ready = client.get("/readyz", headers=auth_headers())
        assert ready.status_code == 200
        assert ready.json()["status"] == "ready"
        assert ready.json()["simulator_endpoint_sha256"].startswith("sha256:")
        assert "fixture-simulator" not in ready.text
        assert "fixture-secret" not in ready.text

        created_response = client.post(
            "/v1/trials",
            headers={**auth_headers(), "content-type": "application/json"},
            json=create_trial_request().model_dump(mode="json"),
        )
        assert created_response.status_code == 201
        created = created_response.json()
        trial_id = created["trial_id"]
        trial_token = created["trial_token"]

        turn_payload = {
            "contract": "talos.human_journey.tau2.next_turn",
            "schema_version": 1,
            "checkpoint_id": "browser-evidence-visible",
            "assistant_message": "Ho aperto la pagina.",
            "observation_sha256": "sha256:" + "e" * 64,
            "created_at": "2026-07-20T12:00:01.000Z",
        }
        wrong_owner = client.post(
            f"/v1/trials/{trial_id}/turns",
            headers={**auth_headers(), "X-Talos-Trial-Token": "wrong"},
            json=turn_payload,
        )
        missing_owner = client.post(
            "/v1/trials/trial_missing/turns",
            headers={**auth_headers(), "X-Talos-Trial-Token": trial_token},
            json=turn_payload,
        )
        assert wrong_owner.status_code == missing_owner.status_code == 404
        assert wrong_owner.json() == missing_owner.json()

        turn = client.post(
            f"/v1/trials/{trial_id}/turns",
            headers={**auth_headers(), "X-Talos-Trial-Token": trial_token},
            json=turn_payload,
        )
        assert turn.status_code == 200
        assert turn.json()["kind"] == "message"

        deleted = client.delete(
            f"/v1/trials/{trial_id}",
            headers={**auth_headers(), "X-Talos-Trial-Token": trial_token},
        )
        assert deleted.status_code == 204

    assert worker.closed is True


def test_sidecar_rejects_wrong_content_type_unknown_fields_and_oversized_json_before_creation() -> None:
    settings = actor_settings()
    actor = Tau2HumanActor(settings=settings, worker=ActorWorker([]))
    app = create_app(settings, actor=actor)

    with TestClient(app) as client:
        text = client.post(
            "/v1/trials",
            headers={**auth_headers(), "content-type": "text/plain"},
            content="{}",
        )
        assert text.status_code == 415

        unknown_payload = create_trial_request().model_dump(mode="json")
        unknown_payload["unknown"] = True
        unknown = client.post(
            "/v1/trials",
            headers={**auth_headers(), "content-type": "application/json"},
            json=unknown_payload,
        )
        assert unknown.status_code == 422

        oversized = client.post(
            "/v1/trials",
            headers={**auth_headers(), "content-type": "application/json"},
            content=b"{" + b" " * settings.max_body_bytes + b"}",
        )
        assert oversized.status_code == 413

        valid = client.post(
            "/v1/trials",
            headers={**auth_headers(), "content-type": "application/json"},
            json=create_trial_request().model_dump(mode="json"),
        )
        assert valid.status_code == 201


def test_runtime_factory_reads_only_startup_secret_files(tmp_path, monkeypatch) -> None:
    token_file = tmp_path / "sidecar.token"
    key_file = tmp_path / "simulator.key"
    token_file.write_text("s" * 43, encoding="utf-8")
    key_file.write_text("fixture-secret", encoding="utf-8")
    values = {
        "TALOS_HJ_SIDECAR_TOKEN_FILE": str(token_file),
        "TALOS_HJ_SIMULATOR_API_KEY_FILE": str(key_file),
        "TALOS_HJ_SIMULATOR_PROVIDER_ID": "fixture-simulator",
        "TALOS_HJ_SIMULATOR_MODEL": "talos-user-simulator",
        "TALOS_HJ_SIMULATOR_BASE_URL": "http://127.0.0.1:43123/v1",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)

    app = create_runtime_app()

    assert app.state.human_actor.settings.auth_token == "s" * 43
    assert app.state.human_actor.settings.simulator_api_key == "fixture-secret"
    assert "fixture-secret" not in repr(app.state.human_actor.store)
