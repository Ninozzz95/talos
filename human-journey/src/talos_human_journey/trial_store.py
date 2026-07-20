from __future__ import annotations

import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum

from talos_human_journey.auth import BearerTokenVerifier, verify_trial_token
from talos_human_journey.contracts import (
    CreateTrialRequest,
    MessageTurnResponse,
    NextTurnRequest,
    TerminalTurnResponse,
    WorkerHistoryMessage,
)


class TrialState(StrEnum):
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TrialStoreFault(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


TurnResponseModel = MessageTurnResponse | TerminalTurnResponse


@dataclass(slots=True)
class TrialRecord:
    trial_id: str
    request: CreateTrialRequest
    created_at: float
    expires_at: float
    state: TrialState = TrialState.READY
    turn_count: int = 0
    last_fault_code: str | None = None
    _token_verifier: BearerTokenVerifier = field(repr=False, default=None)  # type: ignore[assignment]
    _responses: list[TurnResponseModel] = field(repr=False, default_factory=list)
    _history: list[WorkerHistoryMessage] = field(repr=False, default_factory=list)

    @property
    def responses(self) -> tuple[TurnResponseModel, ...]:
        return tuple(self._responses)

    @property
    def history(self) -> tuple[WorkerHistoryMessage, ...]:
        return tuple(self._history)


class TrialStore:
    def __init__(
        self,
        *,
        max_trials: int,
        ttl_seconds: int,
        clock: Callable[[], float] = time.monotonic,
        token_factory: Callable[[], str] = lambda: secrets.token_urlsafe(32),
        id_factory: Callable[[], str] = lambda: f"trial_{secrets.token_urlsafe(18)}",
    ) -> None:
        if max_trials < 1 or ttl_seconds < 1:
            raise ValueError("store bounds must be positive")
        self._max_trials = max_trials
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._token_factory = token_factory
        self._id_factory = id_factory
        self._records: dict[str, TrialRecord] = {}
        self._lock = threading.RLock()
        self._closed = False

    def create(self, request: CreateTrialRequest) -> tuple[TrialRecord, str]:
        with self._lock:
            self._ensure_open()
            self._sweep_locked()
            if len(self._records) >= self._max_trials:
                raise TrialStoreFault("TRIAL_CAPACITY_EXCEEDED")
            raw_token = self._token_factory()
            trial_id = self._id_factory()
            if trial_id in self._records:
                raise TrialStoreFault("TRIAL_ID_COLLISION")
            now = self._clock()
            record = TrialRecord(
                trial_id=trial_id,
                request=request,
                created_at=now,
                expires_at=now + self._ttl_seconds,
                _token_verifier=BearerTokenVerifier(raw_token),
            )
            self._records[trial_id] = record
            return record, raw_token

    def get(self, trial_id: str, trial_token: str | None) -> TrialRecord | None:
        with self._lock:
            if self._closed:
                return None
            record = self._records.get(trial_id)
            if record is None or record.expires_at <= self._clock():
                return None
            if not verify_trial_token(record._token_verifier, trial_token):
                return None
            return record

    def begin_turn(self, trial_id: str, trial_token: str | None) -> TrialRecord:
        with self._lock:
            record = self._owned_record(trial_id, trial_token)
            if record.state is TrialState.RUNNING:
                raise TrialStoreFault("TRIAL_BUSY")
            if record.state in {TrialState.CANCELLED, TrialState.COMPLETED}:
                raise TrialStoreFault("TRIAL_TERMINAL")
            if record.turn_count >= record.request.scenario.budgets.max_turns:
                raise TrialStoreFault("TRIAL_TURN_LIMIT_EXCEEDED")
            record.turn_count += 1
            record.last_fault_code = None
            record.state = TrialState.RUNNING
            return record

    def complete_turn(
        self,
        trial_id: str,
        trial_token: str | None,
        response: TurnResponseModel,
        turn_request: NextTurnRequest | None = None,
    ) -> TrialRecord:
        with self._lock:
            record = self._owned_record(trial_id, trial_token)
            if record.state is not TrialState.RUNNING:
                raise TrialStoreFault("TRIAL_NOT_RUNNING")
            record._responses.append(response)
            if turn_request is not None and isinstance(response, MessageTurnResponse):
                record._history.extend((
                    WorkerHistoryMessage(role="assistant", content=turn_request.assistant_message),
                    WorkerHistoryMessage(role="user", content=response.content),
                ))
            record.state = (
                TrialState.COMPLETED
                if isinstance(response, TerminalTurnResponse)
                else TrialState.READY
            )
            return record

    def fail_turn(self, trial_id: str, trial_token: str | None, fault_code: str) -> TrialRecord:
        with self._lock:
            record = self._owned_record(trial_id, trial_token)
            if record.state is not TrialState.RUNNING:
                raise TrialStoreFault("TRIAL_NOT_RUNNING")
            record.last_fault_code = fault_code
            record.state = TrialState.READY
            return record

    def cancel(self, trial_id: str, trial_token: str | None) -> TrialRecord:
        with self._lock:
            record = self._owned_record(trial_id, trial_token)
            record.state = TrialState.CANCELLED
            return record

    def delete(self, trial_id: str, trial_token: str | None) -> bool:
        with self._lock:
            record = self.get(trial_id, trial_token)
            if record is None:
                return False
            if record.state is TrialState.RUNNING:
                raise TrialStoreFault("TRIAL_ACTIVE")
            del self._records[trial_id]
            return True

    def sweep(self) -> tuple[str, ...]:
        with self._lock:
            return self._sweep_locked()

    def close(self) -> tuple[TrialRecord, ...]:
        with self._lock:
            if self._closed:
                return ()
            active = tuple(record for record in self._records.values() if record.state is TrialState.RUNNING)
            for record in active:
                record.state = TrialState.CANCELLED
            self._records.clear()
            self._closed = True
            return active

    def _owned_record(self, trial_id: str, trial_token: str | None) -> TrialRecord:
        record = self.get(trial_id, trial_token)
        if record is None:
            raise TrialStoreFault("TRIAL_NOT_FOUND")
        return record

    def _sweep_locked(self) -> tuple[str, ...]:
        now = self._clock()
        expired = tuple(
            trial_id
            for trial_id, record in self._records.items()
            if record.expires_at <= now
        )
        for trial_id in expired:
            record = self._records.pop(trial_id)
            if record.state is TrialState.RUNNING:
                record.state = TrialState.CANCELLED
        return expired

    def _ensure_open(self) -> None:
        if self._closed:
            raise TrialStoreFault("TRIAL_STORE_CLOSED")
