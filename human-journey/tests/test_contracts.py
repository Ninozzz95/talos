from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from talos_human_journey.contracts import (
    CreateTrialRequest,
    CreateTrialResponse,
    HumanActionKind,
    NextTurnRequest,
    WorkerTurnRequest,
    parse_worker_response,
    parse_turn_response,
)


TAU2_FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "control-plane"
    / "tests"
    / "fixtures"
    / "human-journey"
    / "tau2-contract-v1.json"
)


def valid_create_trial() -> dict[str, object]:
    return {
        "contract": "talos.human_journey.tau2.create_trial",
        "schema_version": 1,
        "owner_id": "hj_20260720T120000Z_ab12cd34",
        "trial_index": 0,
        "seed": 42,
        "scenario": {
            "scenario_id": "BROWSER-NATURAL-001",
            "goal": "Inspect a controlled page and retain grounded browser evidence.",
            "user_facts": ["The user knows the visible target URL."],
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
        "model_under_test": {
            "provider_id": "talos-fixture-provider",
            "model": "talos-fixture-model",
            "endpoint_sha256": "sha256:" + "a" * 64,
        },
    }


def test_create_trial_contract_is_strict_and_preserves_canonical_values() -> None:
    request = CreateTrialRequest.model_validate(valid_create_trial())

    assert request.scenario.scenario_id == "BROWSER-NATURAL-001"
    assert request.scenario.persona.traits == ("hurried", "typo_prone", "ambiguous")
    assert request.scenario.allowed_actions == (HumanActionKind.SEND_MESSAGE, HumanActionKind.END_TRIAL)
    assert request.model_dump(mode="json") == valid_create_trial()


@pytest.mark.parametrize(
    "mutation",
    [
        lambda value: value.update({"unknown": True}),
        lambda value: value.update({"trial_index": "0"}),
        lambda value: value.update({"seed": -1}),
        lambda value: value["scenario"].update({"user_facts": ["same", "same"]}),
        lambda value: value["scenario"]["persona"].update({"traits": ["hurried", "hurried"]}),
        lambda value: value["scenario"].update({"allowed_actions": ["send_message", "send_message"]}),
        lambda value: value["model_under_test"].update({"endpoint_sha256": "a" * 64}),
    ],
)
def test_create_trial_contract_rejects_coercion_unknown_keys_and_duplicate_sets(mutation) -> None:
    value = deepcopy(valid_create_trial())
    mutation(value)

    with pytest.raises(ValidationError):
        CreateTrialRequest.model_validate(value)


def test_next_turn_contract_requires_bounded_assistant_text_and_observation_digest() -> None:
    request = NextTurnRequest.model_validate({
        "contract": "talos.human_journey.tau2.next_turn",
        "schema_version": 1,
        "checkpoint_id": "owned-screenshot-visible",
        "assistant_message": "Ho aperto la pagina. Cosa vuoi verificare?",
        "observation_sha256": "sha256:" + "b" * 64,
        "created_at": "2026-07-20T12:00:01.000Z",
    })

    assert request.assistant_message.startswith("Ho aperto")

    invalid = request.model_dump(mode="json")
    invalid["assistant_message"] = ""
    with pytest.raises(ValidationError):
        NextTurnRequest.model_validate(invalid)


@pytest.mark.parametrize(
    "value",
    [
        {
            "contract": "talos.human_journey.tau2.turn_response",
            "schema_version": 1,
            "kind": "message",
            "turn_index": 1,
            "content": "Riprova col link di prima.",
            "metrics": {
                "prompt_tokens": 120,
                "completion_tokens": 12,
                "cost_usd": 0.001,
                "latency_ms": 240,
            },
            "provider_response_sha256": "sha256:" + "c" * 64,
        },
        {
            "contract": "talos.human_journey.tau2.turn_response",
            "schema_version": 1,
            "kind": "terminal",
            "turn_index": 2,
            "outcome": "goal_reached",
            "reason": "The simulated user goal is complete.",
            "metrics": {
                "prompt_tokens": 140,
                "completion_tokens": 4,
                "cost_usd": 0.0012,
                "latency_ms": 210,
            },
            "provider_response_sha256": "sha256:" + "d" * 64,
        },
    ],
)
def test_turn_response_parser_is_discriminated_and_strict(value: dict[str, object]) -> None:
    parsed = parse_turn_response(value)
    assert parsed.kind == value["kind"]

    invalid = deepcopy(value)
    invalid["extra"] = "not allowed"
    with pytest.raises(ValidationError):
        parse_turn_response(invalid)


def test_worker_contract_is_strict_and_keeps_provider_secrets_internal() -> None:
    value = {
        "contract": "talos.human_journey.tau2.worker_turn",
        "schema_version": 1,
        "trial_id": "trial_fixture_001",
        "turn_index": 2,
        "seed": 42,
        "scenario": valid_create_trial()["scenario"],
        "history": [
            {"role": "assistant", "content": "Apri il link."},
            {"role": "user", "content": "Va bene, provo."},
        ],
        "assistant_message": "La pagina e aperta.",
        "provider": {
            "provider_id": "fixture-simulator",
            "model": "talos-user-simulator",
            "base_url": "http://127.0.0.1:43123/v1",
            "api_key": "fixture-secret",
            "max_output_tokens": 512,
            "timeout_seconds": 30,
        },
    }

    request = WorkerTurnRequest.model_validate(value)
    assert request.history[1].role == "user"
    assert request.provider.api_key == "fixture-secret"

    invalid = deepcopy(value)
    invalid["provider"]["timeout_seconds"] = "30"
    with pytest.raises(ValidationError):
        WorkerTurnRequest.model_validate(invalid)

    fault = parse_worker_response({
        "contract": "talos.human_journey.tau2.worker_response",
        "schema_version": 1,
        "kind": "fault",
        "code": "PROVIDER_FAILED",
        "message": "The simulator provider could not complete the turn.",
    })
    assert fault.kind == "fault"


def test_typescript_and_python_accept_and_reject_the_same_wire_fixtures() -> None:
    fixture = json.loads(TAU2_FIXTURE_PATH.read_text(encoding="utf-8"))
    assert fixture["contract"] == "talos.human_journey.tau2.conformance_fixture"
    assert fixture["schema_version"] == 1

    parsers = {
        "create_trial": CreateTrialRequest.model_validate,
        "trial_created": CreateTrialResponse.model_validate,
        "next_turn": NextTurnRequest.model_validate,
        "turn_response": parse_turn_response,
    }
    valid = fixture["valid"]
    parsers["create_trial"](valid["create_trial"])
    parsers["trial_created"](valid["trial_created"])
    parsers["next_turn"](valid["next_turn"])
    parsers["turn_response"](valid["message_response"])
    parsers["turn_response"](valid["terminal_response"])

    for invalid in fixture["invalid"]:
        with pytest.raises(ValidationError):
            parsers[invalid["parser"]](invalid["value"])
