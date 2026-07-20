from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator


SHA256_PATTERN = r"^sha256:[0-9a-f]{64}$"
OWNER_ID_PATTERN = r"^hj_[A-Za-z0-9_-]{8,96}$"
IDENTIFIER_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


def _canonical_tuple(value: object, *, field_name: str) -> tuple[object, ...]:
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be a JSON list")
    return tuple(value)


def _validate_unique(values: tuple[object, ...], *, field_name: str) -> tuple[object, ...]:
    normalized = [str(value) for value in values]
    if len(normalized) != len(set(normalized)):
        raise ValueError(f"{field_name} must contain unique values")
    return values


def _validate_bounded_text(value: str, *, field_name: str, maximum_bytes: int) -> str:
    size = len(value.encode("utf-8", errors="strict"))
    if size == 0 or size > maximum_bytes:
        raise ValueError(f"{field_name} must contain between 1 and {maximum_bytes} UTF-8 bytes")
    if any(ord(character) < 32 and character not in {"\n", "\t"} for character in value):
        raise ValueError(f"{field_name} contains control characters")
    return value


class HumanActionKind(StrEnum):
    SEND_MESSAGE = "send_message"
    END_TRIAL = "end_trial"


class TerminalOutcome(StrEnum):
    GOAL_REACHED = "goal_reached"
    USER_STOPPED = "user_stopped"
    TRANSFER_REQUESTED = "transfer_requested"
    OUT_OF_SCOPE = "out_of_scope"
    BUDGET_EXHAUSTED = "budget_exhausted"
    CANCELLED = "cancelled"


class Persona(StrictModel):
    id: str = Field(pattern=IDENTIFIER_PATTERN)
    language: str = Field(pattern=r"^[a-z]{2}(?:-[A-Z]{2})?$")
    traits: tuple[str, ...] = Field(min_length=1, max_length=16)

    @field_validator("traits", mode="before")
    @classmethod
    def parse_traits(cls, value: object) -> tuple[object, ...]:
        return _canonical_tuple(value, field_name="traits")

    @field_validator("traits")
    @classmethod
    def validate_traits(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        _validate_unique(value, field_name="traits")
        for trait in value:
            _validate_bounded_text(trait, field_name="trait", maximum_bytes=128)
        return value


class TrialBudgets(StrictModel):
    max_turns: int = Field(ge=1, le=64)
    max_provider_tokens: int = Field(ge=1, le=1_000_000)
    max_cost_usd: float = Field(ge=0, le=10_000)
    max_duration_ms: int = Field(ge=1_000, le=3_600_000)


class HumanScenario(StrictModel):
    scenario_id: str = Field(pattern=IDENTIFIER_PATTERN)
    goal: str
    user_facts: tuple[str, ...] = Field(min_length=1, max_length=64)
    persona: Persona
    allowed_actions: tuple[HumanActionKind, ...] = Field(min_length=1, max_length=2)
    budgets: TrialBudgets

    @field_validator("user_facts", mode="before")
    @classmethod
    def parse_json_lists(cls, value: object, info) -> tuple[object, ...]:
        return _canonical_tuple(value, field_name=info.field_name)

    @field_validator("allowed_actions", mode="before")
    @classmethod
    def parse_allowed_actions(cls, value: object) -> tuple[HumanActionKind, ...]:
        items = _canonical_tuple(value, field_name="allowed_actions")
        parsed: list[HumanActionKind] = []
        for item in items:
            if not isinstance(item, str):
                raise ValueError("allowed_actions must contain canonical strings")
            try:
                parsed.append(HumanActionKind(item))
            except ValueError as error:
                raise ValueError("allowed_actions contains an unsupported action") from error
        return tuple(parsed)

    @field_validator("goal")
    @classmethod
    def validate_goal(cls, value: str) -> str:
        return _validate_bounded_text(value, field_name="goal", maximum_bytes=4_000)

    @field_validator("user_facts")
    @classmethod
    def validate_user_facts(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        _validate_unique(value, field_name="user_facts")
        for fact in value:
            _validate_bounded_text(fact, field_name="user fact", maximum_bytes=1_000)
        return value

    @field_validator("allowed_actions")
    @classmethod
    def validate_allowed_actions(cls, value: tuple[HumanActionKind, ...]) -> tuple[HumanActionKind, ...]:
        _validate_unique(value, field_name="allowed_actions")
        return value


class ModelUnderTest(StrictModel):
    provider_id: str = Field(pattern=IDENTIFIER_PATTERN)
    model: str = Field(min_length=1, max_length=256)
    endpoint_sha256: str = Field(pattern=SHA256_PATTERN)


class CreateTrialRequest(StrictModel):
    contract: Literal["talos.human_journey.tau2.create_trial"]
    schema_version: Literal[1]
    owner_id: str = Field(pattern=OWNER_ID_PATTERN)
    trial_index: int = Field(ge=0, le=1_000_000)
    seed: int = Field(ge=0, le=2_147_483_647)
    scenario: HumanScenario
    model_under_test: ModelUnderTest


class CreateTrialResponse(StrictModel):
    contract: Literal["talos.human_journey.tau2.trial_created"]
    schema_version: Literal[1]
    trial_id: str = Field(pattern=IDENTIFIER_PATTERN)
    trial_token: str = Field(min_length=32, max_length=128)
    status: Literal["ready"]
    max_turns: int = Field(ge=1, le=64)


class NextTurnRequest(StrictModel):
    contract: Literal["talos.human_journey.tau2.next_turn"]
    schema_version: Literal[1]
    checkpoint_id: str = Field(pattern=IDENTIFIER_PATTERN)
    assistant_message: str
    observation_sha256: str = Field(pattern=SHA256_PATTERN)
    created_at: str

    @field_validator("assistant_message")
    @classmethod
    def validate_assistant_message(cls, value: str) -> str:
        return _validate_bounded_text(value, field_name="assistant_message", maximum_bytes=20_000)

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("created_at must be an ISO-8601 timestamp") from error
        if parsed.tzinfo is None:
            raise ValueError("created_at must include a timezone")
        return value


class TurnMetrics(StrictModel):
    prompt_tokens: int = Field(ge=0, le=1_000_000)
    completion_tokens: int = Field(ge=0, le=1_000_000)
    cost_usd: float = Field(ge=0, le=10_000)
    latency_ms: int = Field(ge=0, le=3_600_000)


class MessageTurnResponse(StrictModel):
    contract: Literal["talos.human_journey.tau2.turn_response"]
    schema_version: Literal[1]
    kind: Literal["message"]
    turn_index: int = Field(ge=0, le=64)
    content: str
    metrics: TurnMetrics
    provider_response_sha256: str = Field(pattern=SHA256_PATTERN)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _validate_bounded_text(value, field_name="content", maximum_bytes=20_000)


class TerminalTurnResponse(StrictModel):
    contract: Literal["talos.human_journey.tau2.turn_response"]
    schema_version: Literal[1]
    kind: Literal["terminal"]
    turn_index: int = Field(ge=0, le=64)
    outcome: TerminalOutcome
    reason: str
    metrics: TurnMetrics
    provider_response_sha256: str = Field(pattern=SHA256_PATTERN)

    @field_validator("outcome", mode="before")
    @classmethod
    def parse_outcome(cls, value: object) -> TerminalOutcome:
        if not isinstance(value, str):
            raise ValueError("outcome must be a canonical string")
        try:
            return TerminalOutcome(value)
        except ValueError as error:
            raise ValueError("outcome is unsupported") from error

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        return _validate_bounded_text(value, field_name="reason", maximum_bytes=2_000)


TurnResponse = Annotated[MessageTurnResponse | TerminalTurnResponse, Field(discriminator="kind")]
_TURN_RESPONSE_ADAPTER = TypeAdapter(TurnResponse)


def parse_turn_response(value: object) -> TurnResponse:
    return _TURN_RESPONSE_ADAPTER.validate_python(value, strict=True)


class WorkerHistoryMessage(StrictModel):
    role: Literal["assistant", "user"]
    content: str

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _validate_bounded_text(value, field_name="history content", maximum_bytes=20_000)


class WorkerProviderConfig(StrictModel):
    provider_id: str = Field(pattern=IDENTIFIER_PATTERN)
    model: str = Field(min_length=1, max_length=256)
    base_url: str = Field(min_length=1, max_length=2_048)
    api_key: str = Field(min_length=1, max_length=4_096)
    max_output_tokens: int = Field(ge=1, le=4_096)
    timeout_seconds: int = Field(ge=1, le=120)


class WorkerTurnRequest(StrictModel):
    contract: Literal["talos.human_journey.tau2.worker_turn"]
    schema_version: Literal[1]
    trial_id: str = Field(pattern=IDENTIFIER_PATTERN)
    turn_index: int = Field(ge=1, le=64)
    seed: int = Field(ge=0, le=2_147_483_647)
    scenario: HumanScenario
    history: tuple[WorkerHistoryMessage, ...] = Field(max_length=126)
    assistant_message: str
    provider: WorkerProviderConfig

    @field_validator("history", mode="before")
    @classmethod
    def parse_history(cls, value: object) -> tuple[object, ...]:
        return _canonical_tuple(value, field_name="history")

    @field_validator("assistant_message")
    @classmethod
    def validate_assistant_message(cls, value: str) -> str:
        return _validate_bounded_text(value, field_name="assistant_message", maximum_bytes=20_000)

    @model_validator(mode="after")
    def validate_alternating_history(self) -> WorkerTurnRequest:
        expected_role = "assistant"
        for message in self.history:
            if message.role != expected_role:
                raise ValueError("history must alternate assistant and user messages")
            expected_role = "user" if expected_role == "assistant" else "assistant"
        if expected_role == "user":
            raise ValueError("history must contain complete assistant/user pairs")
        return self


class WorkerFaultResponse(StrictModel):
    contract: Literal["talos.human_journey.tau2.worker_response"]
    schema_version: Literal[1]
    kind: Literal["fault"]
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{2,63}$")
    message: str = Field(min_length=1, max_length=512)


WorkerResponse = Annotated[
    MessageTurnResponse | TerminalTurnResponse | WorkerFaultResponse,
    Field(discriminator="kind"),
]
_WORKER_RESPONSE_ADAPTER = TypeAdapter(WorkerResponse)


def parse_worker_response(value: object) -> WorkerResponse:
    return _WORKER_RESPONSE_ADAPTER.validate_python(value, strict=True)
