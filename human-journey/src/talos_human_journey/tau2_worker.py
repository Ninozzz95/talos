from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from talos_human_journey.contracts import (
    HumanScenario,
    MessageTurnResponse,
    TerminalTurnResponse,
    TurnMetrics,
    WorkerFaultResponse,
    WorkerTurnRequest,
)


class WorkerExecutionFault(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.safe_message = message
        super().__init__(code)


def _tau2_data_root() -> Path:
    configured = os.environ.get("TAU2_DATA_DIR")
    root = Path(configured) if configured else Path(__file__).resolve().parents[2] / "upstream"
    if (root / "user_simulator" / "simulation_guidelines.md").is_file():
        root = root.parent
    prompt = root / "tau2" / "user_simulator" / "simulation_guidelines.md"
    if not root.is_absolute():
        root = root.resolve()
        prompt = root / "tau2" / "user_simulator" / "simulation_guidelines.md"
    if not prompt.is_file():
        raise WorkerExecutionFault("TAU2_DATA_UNAVAILABLE", "The pinned tau2 simulator data is unavailable.")
    os.environ["TAU2_DATA_DIR"] = str(root)
    return root


def map_scenario_to_tau2(scenario: HumanScenario):
    """Map the AVM scenario to the pinned upstream models after the data fence."""

    _tau2_data_root()
    from tau2.data_model.persona import PersonaConfig, Verbosity
    from tau2.data_model.tasks import StructuredUserInstructions, UserScenario

    known_info = "\n".join(f"- {fact}" for fact in scenario.user_facts)
    action_names = ", ".join(action.value for action in scenario.allowed_actions)
    instructions = StructuredUserInstructions(
        domain="talos_browser_workspace",
        reason_for_call=scenario.goal,
        known_info=known_info,
        unknown_info=(
            "Do not invent facts that are absent from the scenario. Treat every "
            "unlisted detail as unknown and ask naturally when it is needed."
        ),
        task_instructions=(
            f"Use {scenario.persona.language}. Pursue only the visible goal. "
            f"Allowed simulated-user actions: {action_names}. End the trial when "
            "the goal is complete, a transfer occurs, or required facts are unavailable."
        ),
    )
    traits = "\n".join(f"- {trait}" for trait in scenario.persona.traits)
    persona_text = (
        f"TALOS persona id: {scenario.persona.id}\n"
        f"Language: {scenario.persona.language}\n"
        f"Ordered traits:\n{traits}"
    )
    upstream_scenario = UserScenario(persona=persona_text, instructions=instructions)
    verbosity = Verbosity.MINIMAL if "hurried" in scenario.persona.traits else Verbosity.STANDARD
    return upstream_scenario, PersonaConfig(verbosity=verbosity, interrupt_tendency=None)


def _response_digest(raw_response: object) -> str:
    canonical = json.dumps(
        raw_response,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(canonical).hexdigest()


def normalize_user_message(
    *,
    content: str | None,
    turn_index: int,
    usage: dict[str, Any] | None,
    cost_usd: float | None,
    latency_ms: int,
    raw_response: object,
) -> MessageTurnResponse | TerminalTurnResponse:
    if content is None or content.strip() == "":
        raise WorkerExecutionFault("PROVIDER_EMPTY_CONTENT", "The simulator provider returned no user message.")
    metrics = TurnMetrics(
        prompt_tokens=int((usage or {}).get("prompt_tokens") or 0),
        completion_tokens=int((usage or {}).get("completion_tokens") or 0),
        cost_usd=float(cost_usd or 0),
        latency_ms=max(0, latency_ms),
    )
    digest = _response_digest(raw_response)
    terminal: tuple[str, str, str] | None = None
    if "###TRANSFER###" in content:
        terminal = ("transfer_requested", "The simulated user requested a transfer.", "###TRANSFER###")
    elif "###OUT-OF-SCOPE###" in content:
        terminal = ("out_of_scope", "The scenario lacks facts required to continue.", "###OUT-OF-SCOPE###")
    elif "###STOP###" in content:
        terminal = ("goal_reached", "The simulated user goal is complete.", "###STOP###")
    if terminal is not None:
        outcome, reason, _token = terminal
        return TerminalTurnResponse(
            contract="talos.human_journey.tau2.turn_response",
            schema_version=1,
            kind="terminal",
            turn_index=turn_index,
            outcome=outcome,
            reason=reason,
            metrics=metrics,
            provider_response_sha256=digest,
        )
    return MessageTurnResponse(
        contract="talos.human_journey.tau2.turn_response",
        schema_version=1,
        kind="message",
        turn_index=turn_index,
        content=content,
        metrics=metrics,
        provider_response_sha256=digest,
    )


def run_worker_turn(request: WorkerTurnRequest) -> MessageTurnResponse | TerminalTurnResponse:
    _tau2_data_root()
    from tau2.data_model.message import AssistantMessage, UserMessage
    from tau2.user.user_simulator import UserSimulator

    scenario, persona = map_scenario_to_tau2(request.scenario)
    simulator = UserSimulator(
        llm=f"openai/{request.provider.model}",
        instructions=str(scenario),
        tools=None,
        llm_args={
            "api_base": request.provider.base_url,
            "api_key": request.provider.api_key,
            "max_tokens": request.provider.max_output_tokens,
            "timeout": request.provider.timeout_seconds,
            "num_retries": 0,
            "seed": request.seed,
        },
        persona_config=persona,
    )
    history = []
    for item in request.history:
        history.append(
            AssistantMessage.text(item.content)
            if item.role == "assistant"
            else UserMessage.text(item.content)
        )
    state = simulator.get_init_state(history)
    started = time.perf_counter()
    message, _state = simulator.generate_next_message(
        AssistantMessage.text(request.assistant_message),
        state,
    )
    latency_ms = int((time.perf_counter() - started) * 1_000)
    return normalize_user_message(
        content=message.content,
        turn_index=request.turn_index,
        usage=message.usage,
        cost_usd=message.cost,
        latency_ms=latency_ms,
        raw_response=message.raw_data or {"content": message.content},
    )


def _fault(code: str, message: str) -> WorkerFaultResponse:
    return WorkerFaultResponse(
        contract="talos.human_journey.tau2.worker_response",
        schema_version=1,
        kind="fault",
        code=code,
        message=message,
    )


def _is_malformed_provider_response(error: BaseException) -> bool:
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, (json.JSONDecodeError, UnicodeDecodeError)):
            return True
        current = current.__cause__ or current.__context__
    return False


def execute_worker_request(
    request: WorkerTurnRequest,
) -> MessageTurnResponse | TerminalTurnResponse | WorkerFaultResponse:
    try:
        return run_worker_turn(request)
    except WorkerExecutionFault as error:
        return _fault(error.code, error.safe_message)
    except Exception as error:
        if _is_malformed_provider_response(error):
            return _fault(
                "PROVIDER_MALFORMED_RESPONSE",
                "The simulator provider returned malformed JSON.",
            )
        return _fault(
            "PROVIDER_FAILED",
            "The simulator provider could not complete the turn.",
        )


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(1_048_577)
        if len(raw) > 1_048_576:
            response = _fault("WORKER_REQUEST_TOO_LARGE", "The worker request exceeds its limit.")
        else:
            request = WorkerTurnRequest.model_validate_json(raw, strict=True)
            response = execute_worker_request(request)
    except ValidationError:
        response = _fault("WORKER_REQUEST_INVALID", "The worker request is malformed.")
    except Exception:
        response = _fault("WORKER_INTERNAL_ERROR", "The simulator worker encountered an internal error.")
    sys.stdout.write(response.model_dump_json() + "\n")
    sys.stdout.flush()
    return 0 if response.kind != "fault" else 1


if __name__ == "__main__":
    raise SystemExit(main())
