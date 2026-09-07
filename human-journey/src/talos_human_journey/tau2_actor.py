from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Protocol

from talos_human_journey.config import Settings
from talos_human_journey.contracts import (
    CreateTrialRequest,
    CreateTrialResponse,
    MessageTurnResponse,
    NextTurnRequest,
    TerminalTurnResponse,
    TurnMetrics,
    WorkerProviderConfig,
    WorkerTurnRequest,
    parse_worker_response,
)
from talos_human_journey.trial_store import TrialState, TrialStore, TrialStoreFault


class Tau2WorkerFault(RuntimeError):
    def __init__(self, code: str, safe_message: str) -> None:
        self.code = code
        self.safe_message = safe_message
        super().__init__(code)


class Tau2WorkerClient:
    def __init__(
        self,
        *,
        data_root: Path,
        timeout_padding_seconds: float = 2,
        termination_grace_seconds: float = 2,
    ) -> None:
        self._data_root = data_root.resolve()
        self._timeout_padding_seconds = timeout_padding_seconds
        self._termination_grace_seconds = termination_grace_seconds
        self._active: dict[str, Any] = {}
        self._active_lock = asyncio.Lock()

    @property
    def active_count(self) -> int:
        return len(self._active)

    async def generate(
        self,
        trial_id: str,
        request: WorkerTurnRequest,
    ) -> MessageTurnResponse | TerminalTurnResponse:
        environment = self._minimal_environment()
        async with self._active_lock:
            if trial_id in self._active:
                raise Tau2WorkerFault("TRIAL_BUSY", "A simulator turn is already active.")
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-m",
                "talos_human_journey.tau2_worker",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=environment,
            )
            self._active[trial_id] = process

        try:
            try:
                stdout, _stderr = await asyncio.wait_for(
                    process.communicate(request.model_dump_json().encode("utf-8")),
                    timeout=request.provider.timeout_seconds + self._timeout_padding_seconds,
                )
            except TimeoutError as error:
                await self._terminate_process(process)
                raise Tau2WorkerFault("WORKER_TIMEOUT", "The simulator worker exceeded its timeout.") from error
            except asyncio.CancelledError:
                await self._terminate_process(process)
                raise

            if len(stdout) > 1_048_576:
                raise Tau2WorkerFault("WORKER_RESPONSE_TOO_LARGE", "The simulator worker response is too large.")
            try:
                payload = json.loads(stdout)
                response = parse_worker_response(payload)
            except Exception as error:
                raise Tau2WorkerFault("WORKER_RESPONSE_MALFORMED", "The simulator worker returned malformed output.") from error
            if response.kind == "fault":
                raise Tau2WorkerFault(response.code, response.message)
            if process.returncode not in {0, None}:
                raise Tau2WorkerFault("WORKER_FAILED", "The simulator worker exited unsuccessfully.")
            return response
        finally:
            async with self._active_lock:
                if self._active.get(trial_id) is process:
                    del self._active[trial_id]

    async def cancel(self, trial_id: str) -> bool:
        async with self._active_lock:
            process = self._active.get(trial_id)
        if process is None:
            return False
        await self._terminate_process(process)
        return True

    async def cancel_all(self) -> None:
        async with self._active_lock:
            processes = tuple(self._active.values())
        await asyncio.gather(*(self._terminate_process(process) for process in processes), return_exceptions=True)

    def _minimal_environment(self) -> dict[str, str]:
        allowed = ("PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME")
        environment = {name: os.environ[name] for name in allowed if name in os.environ}
        data_root = (
            self._data_root.parent
            if (self._data_root / "user_simulator" / "simulation_guidelines.md").is_file()
            else self._data_root
        )
        environment.update({
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUNBUFFERED": "1",
            "TAU2_DATA_DIR": str(data_root),
        })
        return environment

    async def _terminate_process(self, process: Any) -> None:
        if process.returncode is not None:
            await process.wait()
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=self._termination_grace_seconds)
        except TimeoutError:
            process.kill()
            await process.wait()


class WorkerClient(Protocol):
    async def generate(
        self,
        trial_id: str,
        request: WorkerTurnRequest,
    ) -> MessageTurnResponse | TerminalTurnResponse: ...

    async def cancel(self, trial_id: str) -> bool: ...

    async def cancel_all(self) -> None: ...


class Tau2HumanActor:
    def __init__(
        self,
        *,
        settings: Settings,
        worker: WorkerClient | None = None,
        store: TrialStore | None = None,
    ) -> None:
        self.settings = settings
        self.worker = worker or Tau2WorkerClient(
            data_root=Path(__file__).resolve().parents[2] / "upstream" / "tau2"
        )
        self.store = store or TrialStore(
            max_trials=settings.max_trials,
            ttl_seconds=settings.trial_ttl_seconds,
        )

    @property
    def simulator_endpoint_sha256(self) -> str:
        return "sha256:" + hashlib.sha256(self.settings.simulator_base_url.encode("utf-8")).hexdigest()

    def create_trial(self, request: CreateTrialRequest) -> CreateTrialResponse:
        simulator_identity = (
            self.settings.simulator_provider_id.casefold(),
            self.settings.simulator_model.casefold(),
        )
        tested_identity = (
            request.model_under_test.provider_id.casefold(),
            request.model_under_test.model.casefold(),
        )
        if tested_identity == simulator_identity:
            raise Tau2WorkerFault(
                "SIMULATOR_MODEL_REUSE_FORBIDDEN",
                "The simulator and model under test must use separate identities.",
            )
        if request.model_under_test.endpoint_sha256 == self.simulator_endpoint_sha256:
            raise Tau2WorkerFault(
                "SIMULATOR_ENDPOINT_REUSE_FORBIDDEN",
                "The simulator and model under test must use separate endpoints.",
            )
        if request.scenario.budgets.max_turns > self.settings.max_turns:
            raise Tau2WorkerFault("TRIAL_TURN_LIMIT_EXCEEDED", "The requested trial exceeds the configured turn limit.")
        record, raw_token = self.store.create(request)
        return CreateTrialResponse(
            contract="talos.human_journey.tau2.trial_created",
            schema_version=1,
            trial_id=record.trial_id,
            trial_token=raw_token,
            status="ready",
            max_turns=request.scenario.budgets.max_turns,
        )

    async def next_turn(
        self,
        trial_id: str,
        trial_token: str | None,
        turn: NextTurnRequest,
    ) -> MessageTurnResponse | TerminalTurnResponse:
        record = self.store.begin_turn(trial_id, trial_token)
        prior_prompt_tokens = sum(response.metrics.prompt_tokens for response in record.responses)
        prior_completion_tokens = sum(response.metrics.completion_tokens for response in record.responses)
        remaining_tokens = max(
            1,
            record.request.scenario.budgets.max_provider_tokens
            - prior_prompt_tokens
            - prior_completion_tokens,
        )
        worker_request = WorkerTurnRequest.model_validate({
            "contract": "talos.human_journey.tau2.worker_turn",
            "schema_version": 1,
            "trial_id": trial_id,
            "turn_index": record.turn_count,
            "seed": record.request.seed + record.turn_count - 1,
            "scenario": record.request.scenario,
            "history": [item.model_dump(mode="json") for item in record.history],
            "assistant_message": turn.assistant_message,
            "provider": {
                "provider_id": self.settings.simulator_provider_id,
                "model": self.settings.simulator_model,
                "base_url": self.settings.simulator_base_url,
                "api_key": self.settings.simulator_api_key,
                "max_output_tokens": min(self.settings.max_output_tokens, remaining_tokens),
                "timeout_seconds": self.settings.provider_timeout_seconds,
            },
        })
        try:
            response = await self.worker.generate(trial_id, worker_request)
            if response.turn_index != record.turn_count:
                raise Tau2WorkerFault("WORKER_TURN_MISMATCH", "The simulator worker returned the wrong turn index.")
            self._enforce_budgets(record.responses, response, record.request)
            return self.store.complete_turn(trial_id, trial_token, response, turn).responses[-1]
        except asyncio.CancelledError:
            try:
                self.store.cancel(trial_id, trial_token)
            except TrialStoreFault:
                pass
            raise
        except Tau2WorkerFault as error:
            try:
                if record.state is TrialState.RUNNING:
                    self.store.fail_turn(trial_id, trial_token, error.code)
            except TrialStoreFault:
                pass
            raise

    async def cancel(self, trial_id: str, trial_token: str | None) -> TerminalTurnResponse:
        record = self.store.get(trial_id, trial_token)
        if record is None:
            raise TrialStoreFault("TRIAL_NOT_FOUND")
        await self.worker.cancel(trial_id)
        record = self.store.cancel(trial_id, trial_token)
        digest = "sha256:" + hashlib.sha256(f"cancel:{trial_id}:{record.turn_count}".encode("utf-8")).hexdigest()
        return TerminalTurnResponse(
            contract="talos.human_journey.tau2.turn_response",
            schema_version=1,
            kind="terminal",
            turn_index=record.turn_count,
            outcome="cancelled",
            reason="The adaptive trial was cancelled.",
            metrics=TurnMetrics(
                prompt_tokens=0,
                completion_tokens=0,
                cost_usd=0,
                latency_ms=0,
            ),
            provider_response_sha256=digest,
        )

    def delete(self, trial_id: str, trial_token: str | None) -> bool:
        return self.store.delete(trial_id, trial_token)

    async def close(self) -> None:
        await self.worker.cancel_all()
        self.store.close()

    @staticmethod
    def _enforce_budgets(
        prior: tuple[MessageTurnResponse | TerminalTurnResponse, ...],
        response: MessageTurnResponse | TerminalTurnResponse,
        request: CreateTrialRequest,
    ) -> None:
        responses = (*prior, response)
        tokens = sum(item.metrics.prompt_tokens + item.metrics.completion_tokens for item in responses)
        cost = sum(item.metrics.cost_usd for item in responses)
        duration = sum(item.metrics.latency_ms for item in responses)
        budgets = request.scenario.budgets
        if (
            tokens > budgets.max_provider_tokens
            or cost > budgets.max_cost_usd
            or duration > budgets.max_duration_ms
        ):
            raise Tau2WorkerFault("TRIAL_BUDGET_EXCEEDED", "The simulator trial exceeded its configured budget.")
