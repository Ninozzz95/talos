from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path

import pytest

from fixtures.openai_simulator_fixture import FixtureReply, OpenAISimulatorFixture
from talos_human_journey.config import Settings
from talos_human_journey.contracts import CreateTrialRequest, NextTurnRequest, WorkerTurnRequest
from talos_human_journey.tau2_actor import Tau2HumanActor, Tau2WorkerClient, Tau2WorkerFault
from talos_human_journey.tau2_worker import (
    execute_worker_request,
    map_scenario_to_tau2,
    normalize_user_message,
)


ROOT = Path(__file__).resolve().parents[1]


def worker_request(base_url: str, *, content: str = "La pagina e aperta.") -> WorkerTurnRequest:
    return WorkerTurnRequest.model_validate({
        "contract": "talos.human_journey.tau2.worker_turn",
        "schema_version": 1,
        "trial_id": "trial_fixture_001",
        "turn_index": 1,
        "seed": 42,
        "scenario": {
            "scenario_id": "BROWSER-NATURAL-001",
            "goal": "Inspect a controlled page and retain grounded evidence.",
            "user_facts": ["The target URL is visible in the conversation."],
            "persona": {
                "id": "hurried_typo_it",
                "language": "it-IT",
                "traits": ["hurried", "typo_prone", "ambiguous"],
            },
            "allowed_actions": ["send_message", "end_trial"],
            "budgets": {
                "max_turns": 16,
                "max_provider_tokens": 12_000,
                "max_cost_usd": 2.0,
                "max_duration_ms": 180_000,
            },
        },
        "history": [],
        "assistant_message": content,
        "provider": {
            "provider_id": "fixture-simulator",
            "model": "talos-user-simulator",
            "base_url": base_url,
            "api_key": "fixture-secret",
            "max_output_tokens": 512,
            "timeout_seconds": 30,
        },
    })


@pytest.mark.parametrize(
    ("persona_id", "traits", "expected_verbosity"),
    [
        ("novice_it", ["novice"], "standard"),
        ("hurried_typo_it", ["hurried", "typo_prone"], "minimal"),
        ("skeptical_it", ["skeptical"], "standard"),
        ("expert_it", ["expert"], "standard"),
        ("ambiguous_it", ["ambiguous"], "standard"),
    ],
)
def test_five_personas_map_to_supported_tau2_text_configuration(
    persona_id: str,
    traits: list[str],
    expected_verbosity: str,
) -> None:
    request = worker_request("http://127.0.0.1:43123/v1").model_copy(update={
        "scenario": worker_request("http://127.0.0.1:43123/v1").scenario.model_copy(update={
            "persona": worker_request("http://127.0.0.1:43123/v1").scenario.persona.model_copy(update={
                "id": persona_id,
                "traits": tuple(traits),
            })
        })
    })

    scenario, persona = map_scenario_to_tau2(request.scenario)

    assert scenario.instructions.domain == "talos_browser_workspace"
    assert scenario.instructions.reason_for_call == request.scenario.goal
    assert scenario.instructions.known_info == "- The target URL is visible in the conversation."
    assert "Do not invent" in scenario.instructions.unknown_info
    assert persona_id in scenario.persona
    assert "it-IT" in scenario.persona
    assert all(trait in scenario.persona for trait in traits)
    assert persona.verbosity.value == expected_verbosity
    assert persona.interrupt_tendency is None


@pytest.mark.parametrize(
    ("content", "kind", "outcome"),
    [
        ("Va bene, continuo.", "message", None),
        ("Fatto. ###STOP###", "terminal", "goal_reached"),
        ("###TRANSFER###", "terminal", "transfer_requested"),
        ("Non ho abbastanza dati. ###OUT-OF-SCOPE###", "terminal", "out_of_scope"),
    ],
)
def test_stop_tokens_normalize_to_bounded_turn_responses(content: str, kind: str, outcome: str | None) -> None:
    response = normalize_user_message(
        content=content,
        turn_index=1,
        usage={"prompt_tokens": 31, "completion_tokens": 7},
        cost_usd=0.0,
        latency_ms=20,
        raw_response={"id": "fixture"},
    )

    assert response.kind == kind
    if outcome is not None:
        assert response.outcome == outcome


@pytest.mark.asyncio
async def test_real_pinned_user_simulator_calls_a_separate_loopback_provider() -> None:
    fixture = OpenAISimulatorFixture()
    fixture.enqueue(FixtureReply(content="riprova col link di prima"))
    with fixture:
        client = Tau2WorkerClient(data_root=ROOT / "upstream" / "tau2")
        response = await client.generate("trial_fixture_001", worker_request(fixture.base_url))

    assert response.kind == "message"
    assert response.content == "riprova col link di prima"
    assert response.metrics.prompt_tokens == 31
    assert response.metrics.completion_tokens == 7
    assert client.active_count == 0
    assert len(fixture.requests) == 1
    captured = fixture.requests[0]
    assert captured["path"] == "/v1/chat/completions"
    assert captured["authorization"] == "Bearer fixture-secret"
    assert captured["body"]["seed"] == 42
    assert captured["body"]["max_tokens"] == 512


@pytest.mark.parametrize(
    ("reply", "expected_code"),
    [
        (FixtureReply(status=500), "PROVIDER_FAILED"),
        (FixtureReply(malformed=True), "PROVIDER_MALFORMED_RESPONSE"),
        (FixtureReply(content=""), "PROVIDER_EMPTY_CONTENT"),
    ],
)
def test_provider_failure_malformed_json_and_empty_content_are_distinct_safe_faults(
    reply: FixtureReply,
    expected_code: str,
) -> None:
    fixture = OpenAISimulatorFixture()
    fixture.enqueue(reply)
    with fixture:
        response = execute_worker_request(worker_request(fixture.base_url))

    assert response.kind == "fault"
    assert response.code == expected_code
    assert "fixture-secret" not in response.message
    assert "fixture failure" not in response.message


class HangingProcess:
    def __init__(self) -> None:
        self.returncode: int | None = None
        self.terminated = False
        self.killed = False

    async def communicate(self, _input: bytes | None = None) -> tuple[bytes, bytes]:
        await asyncio.Future()
        raise AssertionError("unreachable")

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = -15

    def kill(self) -> None:
        self.killed = True
        self.returncode = -9

    async def wait(self) -> int:
        return 0 if self.returncode is None else self.returncode


class StubbornProcess(HangingProcess):
    def terminate(self) -> None:
        self.terminated = True

    async def wait(self) -> int:
        if not self.killed:
            await asyncio.Future()
        return -9


@pytest.mark.asyncio
async def test_worker_timeout_terminates_and_reaps_without_secrets_in_argv(monkeypatch) -> None:
    process = HangingProcess()
    launches: list[tuple[tuple[object, ...], dict[str, object]]] = []

    async def fake_create(*args, **kwargs):
        launches.append((args, kwargs))
        return process

    monkeypatch.setattr("talos_human_journey.tau2_actor.asyncio.create_subprocess_exec", fake_create)
    client = Tau2WorkerClient(
        data_root=ROOT / "upstream" / "tau2",
        timeout_padding_seconds=0,
        termination_grace_seconds=0.01,
    )
    request = worker_request("http://127.0.0.1:43123/v1").model_copy(update={
        "provider": worker_request("http://127.0.0.1:43123/v1").provider.model_copy(update={"timeout_seconds": 1})
    })

    with pytest.raises(Tau2WorkerFault, match="WORKER_TIMEOUT"):
        await client.generate("trial_fixture_001", request)

    assert process.terminated is True
    assert client.active_count == 0
    args, kwargs = launches[0]
    assert args[1:] == ("-m", "talos_human_journey.tau2_worker")
    assert "fixture-secret" not in repr(args)
    assert "fixture-secret" not in repr(kwargs["env"])


@pytest.mark.asyncio
async def test_worker_timeout_kills_after_the_termination_grace_period(monkeypatch) -> None:
    process = StubbornProcess()

    async def fake_create(*_args, **_kwargs):
        return process

    monkeypatch.setattr("talos_human_journey.tau2_actor.asyncio.create_subprocess_exec", fake_create)
    client = Tau2WorkerClient(
        data_root=ROOT / "upstream" / "tau2",
        timeout_padding_seconds=0,
        termination_grace_seconds=0.01,
    )
    request = worker_request("http://127.0.0.1:43123/v1").model_copy(update={
        "provider": worker_request("http://127.0.0.1:43123/v1").provider.model_copy(update={"timeout_seconds": 1})
    })

    with pytest.raises(Tau2WorkerFault, match="WORKER_TIMEOUT"):
        await client.generate("trial_fixture_001", request)

    assert process.terminated is True
    assert process.killed is True
    assert client.active_count == 0


def actor_settings(base_url: str = "http://127.0.0.1:43123/v1") -> Settings:
    return Settings(
        bind_host="127.0.0.1",
        auth_token="s" * 43,
        simulator_api_key="fixture-secret",
        simulator_provider_id="fixture-simulator",
        simulator_model="talos-user-simulator",
        simulator_base_url=base_url,
        max_body_bytes=262_144,
        max_trials=10,
        max_turns=64,
        max_output_tokens=512,
        provider_timeout_seconds=30,
        trial_ttl_seconds=900,
    )


def create_trial_request(
    *,
    provider_id: str = "model-under-test",
    model: str = "tested-model",
    endpoint: str = "http://127.0.0.1:49999/v1",
    max_provider_tokens: int = 1_000,
) -> CreateTrialRequest:
    value = worker_request("http://127.0.0.1:43123/v1")
    payload = {
        "contract": "talos.human_journey.tau2.create_trial",
        "schema_version": 1,
        "owner_id": "hj_20260720T120000Z_ab12cd34",
        "trial_index": 0,
        "seed": 42,
        "scenario": value.scenario.model_dump(mode="json"),
        "model_under_test": {
            "provider_id": provider_id,
            "model": model,
            "endpoint_sha256": "sha256:" + hashlib.sha256(endpoint.encode("utf-8")).hexdigest(),
        },
    }
    payload["scenario"]["budgets"]["max_provider_tokens"] = max_provider_tokens
    return CreateTrialRequest.model_validate(payload)


def next_turn(message: str = "Ho aperto la pagina.") -> NextTurnRequest:
    return NextTurnRequest.model_validate({
        "contract": "talos.human_journey.tau2.next_turn",
        "schema_version": 1,
        "checkpoint_id": "browser-evidence-visible",
        "assistant_message": message,
        "observation_sha256": "sha256:" + "e" * 64,
        "created_at": "2026-07-20T12:00:01.000Z",
    })


class ActorWorker:
    def __init__(self, responses) -> None:
        self.responses = list(responses)
        self.requests: list[WorkerTurnRequest] = []
        self.cancelled: list[str] = []
        self.closed = False

    async def generate(self, _trial_id: str, request: WorkerTurnRequest):
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    async def cancel(self, trial_id: str) -> bool:
        self.cancelled.append(trial_id)
        return True

    async def cancel_all(self) -> None:
        self.closed = True


def fixture_message(turn_index: int, *, prompt_tokens: int = 20, completion_tokens: int = 8):
    return normalize_user_message(
        content=f"messaggio simulato {turn_index}",
        turn_index=turn_index,
        usage={"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
        cost_usd=0.01,
        latency_ms=40,
        raw_response={"turn": turn_index},
    )


@pytest.mark.asyncio
async def test_actor_rejects_simulator_identity_or_endpoint_as_model_under_test() -> None:
    settings = actor_settings()
    actor = Tau2HumanActor(settings=settings, worker=ActorWorker([]))

    with pytest.raises(Tau2WorkerFault, match="SIMULATOR_MODEL_REUSE_FORBIDDEN"):
        actor.create_trial(create_trial_request(
            provider_id="FIXTURE-SIMULATOR",
            model="TALOS-USER-SIMULATOR",
        ))
    with pytest.raises(Tau2WorkerFault, match="SIMULATOR_ENDPOINT_REUSE_FORBIDDEN"):
        actor.create_trial(create_trial_request(endpoint=settings.simulator_base_url))


@pytest.mark.asyncio
async def test_actor_preserves_bounded_history_and_provider_profile_across_turns() -> None:
    worker = ActorWorker([fixture_message(1), fixture_message(2)])
    actor = Tau2HumanActor(settings=actor_settings(), worker=worker)
    created = actor.create_trial(create_trial_request())

    first = await actor.next_turn(created.trial_id, created.trial_token, next_turn("Prima risposta TALOS."))
    second = await actor.next_turn(created.trial_id, created.trial_token, next_turn("Seconda risposta TALOS."))

    assert first.content == "messaggio simulato 1"
    assert second.content == "messaggio simulato 2"
    assert worker.requests[0].history == ()
    assert [item.model_dump(mode="json") for item in worker.requests[1].history] == [
        {"role": "assistant", "content": "Prima risposta TALOS."},
        {"role": "user", "content": "messaggio simulato 1"},
    ]
    assert worker.requests[1].provider.provider_id == "fixture-simulator"
    assert worker.requests[1].provider.model == "talos-user-simulator"
    assert worker.requests[1].provider.api_key == "fixture-secret"


@pytest.mark.asyncio
async def test_actor_fails_closed_when_cumulative_provider_budget_is_exceeded() -> None:
    worker = ActorWorker([fixture_message(1, prompt_tokens=25, completion_tokens=20)])
    actor = Tau2HumanActor(settings=actor_settings(), worker=worker)
    created = actor.create_trial(create_trial_request(max_provider_tokens=40))

    with pytest.raises(Tau2WorkerFault, match="TRIAL_BUDGET_EXCEEDED"):
        await actor.next_turn(created.trial_id, created.trial_token, next_turn())


@pytest.mark.asyncio
async def test_actor_cancels_workers_deletes_inactive_trials_and_closes() -> None:
    worker = ActorWorker([fixture_message(1)])
    actor = Tau2HumanActor(settings=actor_settings(), worker=worker)
    created = actor.create_trial(create_trial_request())

    cancelled = await actor.cancel(created.trial_id, created.trial_token)
    assert cancelled.outcome == "cancelled"
    assert worker.cancelled == [created.trial_id]
    assert actor.delete(created.trial_id, created.trial_token) is True
    await actor.close()
    assert worker.closed is True
