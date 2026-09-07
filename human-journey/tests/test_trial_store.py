from __future__ import annotations

from copy import deepcopy

import pytest

from talos_human_journey.contracts import CreateTrialRequest, MessageTurnResponse
from talos_human_journey.trial_store import TrialState, TrialStore, TrialStoreFault


def valid_trial_request(*, max_turns: int = 2) -> CreateTrialRequest:
    return CreateTrialRequest.model_validate({
        "contract": "talos.human_journey.tau2.create_trial",
        "schema_version": 1,
        "owner_id": "hj_20260720T120000Z_ab12cd34",
        "trial_index": 0,
        "seed": 42,
        "scenario": {
            "scenario_id": "BROWSER-NATURAL-001",
            "goal": "Inspect one controlled page.",
            "user_facts": ["The user knows the target URL."],
            "persona": {
                "id": "novice_it",
                "language": "it-IT",
                "traits": ["novice"],
            },
            "allowed_actions": ["send_message", "end_trial"],
            "budgets": {
                "max_turns": max_turns,
                "max_provider_tokens": 1_000,
                "max_cost_usd": 1.0,
                "max_duration_ms": 60_000,
            },
        },
        "model_under_test": {
            "provider_id": "fixture-provider",
            "model": "fixture-model",
            "endpoint_sha256": "sha256:" + "a" * 64,
        },
    })


def message_response(turn_index: int) -> MessageTurnResponse:
    return MessageTurnResponse.model_validate({
        "contract": "talos.human_journey.tau2.turn_response",
        "schema_version": 1,
        "kind": "message",
        "turn_index": turn_index,
        "content": "Continua con il link visibile.",
        "metrics": {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "cost_usd": 0.001,
            "latency_ms": 20,
        },
        "provider_response_sha256": "sha256:" + "b" * 64,
    })


def test_store_enforces_capacity_and_hides_raw_trial_tokens() -> None:
    tokens = iter(["first-" + "a" * 32, "second-" + "b" * 32])
    ids = iter(["trial_first", "trial_second"])
    store = TrialStore(
        max_trials=1,
        ttl_seconds=60,
        token_factory=lambda: next(tokens),
        id_factory=lambda: next(ids),
    )

    record, raw_token = store.create(valid_trial_request())

    assert record.trial_id == "trial_first"
    assert raw_token == "first-" + "a" * 32
    assert raw_token not in repr(record)
    assert store.get(record.trial_id, raw_token) is record
    assert store.get(record.trial_id, "wrong") is None
    assert store.get("missing", raw_token) is None
    with pytest.raises(TrialStoreFault, match="TRIAL_CAPACITY_EXCEEDED"):
        store.create(valid_trial_request())


def test_store_serializes_turns_counts_attempts_and_enforces_budget() -> None:
    store = TrialStore(max_trials=2, ttl_seconds=60)
    record, token = store.create(valid_trial_request(max_turns=2))

    first = store.begin_turn(record.trial_id, token)
    assert first.state is TrialState.RUNNING
    assert first.turn_count == 1
    with pytest.raises(TrialStoreFault, match="TRIAL_BUSY"):
        store.begin_turn(record.trial_id, token)

    store.fail_turn(record.trial_id, token, "PROVIDER_FAILED")
    assert record.state is TrialState.READY
    assert record.turn_count == 1
    assert record.last_fault_code == "PROVIDER_FAILED"

    store.begin_turn(record.trial_id, token)
    completed = store.complete_turn(record.trial_id, token, message_response(2))
    assert completed.state is TrialState.READY
    assert completed.turn_count == 2
    assert completed.responses == (message_response(2),)

    with pytest.raises(TrialStoreFault, match="TRIAL_TURN_LIMIT_EXCEEDED"):
        store.begin_turn(record.trial_id, token)


def test_store_cancel_delete_ttl_sweep_and_close_are_fail_closed() -> None:
    now = [100.0]
    store = TrialStore(max_trials=3, ttl_seconds=60, clock=lambda: now[0])
    active, active_token = store.create(valid_trial_request())
    expired, expired_token = store.create(valid_trial_request())

    store.begin_turn(active.trial_id, active_token)
    with pytest.raises(TrialStoreFault, match="TRIAL_ACTIVE"):
        store.delete(active.trial_id, active_token)

    cancelled = store.cancel(active.trial_id, active_token)
    assert cancelled.state is TrialState.CANCELLED
    assert store.delete(active.trial_id, active_token) is True
    assert store.delete(active.trial_id, active_token) is False

    now[0] = 161.0
    assert store.get(expired.trial_id, expired_token) is None
    assert store.sweep() == (expired.trial_id,)

    remaining, remaining_token = store.create(valid_trial_request())
    store.begin_turn(remaining.trial_id, remaining_token)
    closed_records = store.close()
    assert closed_records == (remaining,)
    assert remaining.state is TrialState.CANCELLED
    with pytest.raises(TrialStoreFault, match="TRIAL_STORE_CLOSED"):
        store.create(valid_trial_request())

