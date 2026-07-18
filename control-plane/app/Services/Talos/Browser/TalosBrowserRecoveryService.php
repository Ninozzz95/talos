<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserRecoveryCommand;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosBrowserTaskEvent;
use App\Models\TalosMessage;
use App\Models\TalosToolCall;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserCheckpoint;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Kadmos\Browser\Recovery\BrowserRecoveryClassifier;
use Kadmos\Browser\Recovery\BrowserRecoveryDecision;
use Kadmos\Browser\Recovery\BrowserRecoveryObservation;
use Kadmos\Browser\Recovery\BrowserRecoveryStrategy;
use Kadmos\Tool\ProceduralLoopGuard;
use Ramsey\Uuid\Uuid;

final readonly class TalosBrowserRecoveryService
{
    private const ACTION_STATUSES = [
        'proposed', 'policy_checked', 'authorized', 'denied', 'dispatched',
        'observed', 'committed', 'evidence_committed', 'verified', 'ambiguous', 'failed',
    ];

    public function __construct(
        private TalosBrowserTaskRepository $tasks,
        private BrowserSessionClient $worker,
        private TalosBrowserTaskRuntime $runtime,
        private BrowserRecoveryClassifier $classifier = new BrowserRecoveryClassifier,
    ) {}

    public function reconcile(
        int $ownerUserId,
        string $taskId,
        string $commandId,
    ): TalosBrowserRecoveryDecision {
        $commandId = trim($commandId);
        if ($commandId === '' || mb_strlen($commandId) > 128) {
            throw new InvalidArgumentException('Browser recovery command ID is invalid.');
        }
        $task = $this->tasks->owned($ownerUserId, $taskId);
        $replayed = $this->replayed($ownerUserId, $task, $commandId);
        if ($replayed instanceof TalosBrowserRecoveryDecision) {
            return $replayed;
        }

        $journalIntegrity = $this->journalIntegrity($task);
        if (! $journalIntegrity) {
            return $this->apply($ownerUserId, $task, $commandId, $this->classifier->classify(new BrowserRecoveryObservation(
                ownershipVerified: true,
                journalIntegrityVerified: false,
                versionVerified: false,
                policyVerified: false,
                workerAvailable: false,
                dispatchState: 'not_dispatched',
                evidenceCommitted: false,
                consequentialAction: false,
                safeCheckpointAvailable: false,
                idempotencyIntentMatches: false,
                currentFrameVerified: false,
            )));
        }

        $browser = $task->browserSession;
        [$workerAvailable, $workerStateVersion] = $this->inspectWorker($ownerUserId, $browser);
        $action = $task->actions()->latest('sequence')->first();
        $dispatchState = $this->dispatchState($action);
        if ($dispatchState === null) {
            return $this->apply($ownerUserId, $task, $commandId, $this->classifier->classify(new BrowserRecoveryObservation(
                ownershipVerified: true,
                journalIntegrityVerified: false,
                versionVerified: false,
                policyVerified: false,
                workerAvailable: $workerAvailable,
                dispatchState: 'not_dispatched',
                evidenceCommitted: false,
                consequentialAction: false,
                safeCheckpointAvailable: false,
                idempotencyIntentMatches: false,
                currentFrameVerified: false,
            )));
        }
        $latestEvidence = $task->evidenceBundles()->latest('worker_state_version')->first();
        $evidenceCommitted = $action instanceof TalosBrowserAction
            && in_array($dispatchState, ['committed', 'dispatched'], true)
            && $latestEvidence instanceof TalosBrowserEvidenceBundle
            && (string) $latestEvidence->action_id === (string) $action->id
            && $latestEvidence->committed_at !== null;
        $safeCheckpoint = $this->safeCheckpoint($task);
        $decision = $this->classifier->classify(new BrowserRecoveryObservation(
            ownershipVerified: true,
            journalIntegrityVerified: true,
            versionVerified: ! $workerAvailable
                || ($workerStateVersion !== null && $workerStateVersion >= (int) ($browser?->worker_state_version ?? 0)),
            policyVerified: $this->policyVerified($action),
            workerAvailable: $workerAvailable,
            dispatchState: $dispatchState,
            evidenceCommitted: $evidenceCommitted,
            consequentialAction: $action instanceof TalosBrowserAction && $action->risk !== 'read',
            safeCheckpointAvailable: $safeCheckpoint instanceof TalosBrowserCheckpoint,
            idempotencyIntentMatches: $this->idempotencyIntentMatches($task, $action),
            currentFrameVerified: $this->currentFrameVerified($latestEvidence, $workerAvailable, $workerStateVersion),
        ));

        return $this->apply($ownerUserId, $task, $commandId, $decision);
    }

    private function apply(
        int $ownerUserId,
        TalosBrowserTask $task,
        string $commandId,
        BrowserRecoveryDecision $decision,
    ): TalosBrowserRecoveryDecision {
        $payload = ['recovery_decision' => [
            'strategy' => $decision->strategy->value,
            'reason_code' => $decision->reasonCode,
            'remediation' => $decision->remediation,
        ]];
        $resultingTaskId = null;
        $journalOnlyDecision = false;
        if ($decision->strategy === BrowserRecoveryStrategy::Resume) {
            $recoveryCommandPersisted = false;
            if ($task->status !== BrowserTaskStatus::Recovering->value) {
                $task = $this->tasks->transition(
                    $ownerUserId,
                    $task->id,
                    BrowserTaskStatus::Recovering,
                    $task->state_version,
                    $commandId,
                    'task.recovering',
                    'user',
                    (string) $ownerUserId,
                    ['reconciled_at' => now()->startOfSecond()],
                    $payload,
                );
                $recoveryCommandPersisted = true;
            }
            $task = $this->tasks->transition(
                $ownerUserId,
                $task->id,
                BrowserTaskStatus::Running,
                $task->state_version,
                $recoveryCommandPersisted ? $this->derivedCommand($commandId, 'resume') : $commandId,
                'task.resumed',
                $recoveryCommandPersisted ? 'system' : 'user',
                $recoveryCommandPersisted ? null : (string) $ownerUserId,
                eventPayload: $payload,
            );
            $resultingTaskId = $task->id;
        } elseif ($decision->strategy === BrowserRecoveryStrategy::Reconcile) {
            if ($task->status === BrowserTaskStatus::Recovering->value) {
                $journalOnlyDecision = true;
            } else {
                $task = $this->tasks->transition(
                    $ownerUserId,
                    $task->id,
                    BrowserTaskStatus::Recovering,
                    $task->state_version,
                    $commandId,
                    'task.reconciling_evidence',
                    'user',
                    (string) $ownerUserId,
                    ['reconciled_at' => now()->startOfSecond()],
                    $payload,
                );
            }
        } elseif ($decision->strategy === BrowserRecoveryStrategy::Fork) {
            if ($task->status === BrowserTaskStatus::Recovering->value) {
                $journalOnlyDecision = true;
            } else {
                $task = $this->tasks->transition(
                    $ownerUserId,
                    $task->id,
                    BrowserTaskStatus::Recovering,
                    $task->state_version,
                    $commandId,
                    'task.forking',
                    'user',
                    (string) $ownerUserId,
                    ['reconciled_at' => now()->startOfSecond()],
                    $payload,
                );
            }
            $resultingTaskId = $this->runtime->fork($ownerUserId, $task->id, $commandId)->id;
        } elseif ($decision->strategy === BrowserRecoveryStrategy::WaitForUser) {
            $task = $this->tasks->transition(
                $ownerUserId,
                $task->id,
                BrowserTaskStatus::WaitingUser,
                $task->state_version,
                $commandId,
                'task.recovery_waiting_user',
                'user',
                (string) $ownerUserId,
                eventPayload: $payload,
            );
        } elseif ($this->journalIntegrity($task)
            && in_array($task->status, [BrowserTaskStatus::Running->value, BrowserTaskStatus::Recovering->value], true)) {
            $task = $this->tasks->transition(
                $ownerUserId,
                $task->id,
                BrowserTaskStatus::Failed,
                $task->state_version,
                $commandId,
                'task.recovery_failed',
                'system',
                statePatch: ['failed_at' => now()->startOfSecond()],
                eventPayload: $payload,
            );
        } else {
            $journalOnlyDecision = true;
        }

        if ($journalOnlyDecision) {
            return $this->journalDecision($ownerUserId, $task, $commandId, $decision, $resultingTaskId);
        }

        return $this->applicationDecision($decision, $task, $resultingTaskId);
    }

    private function replayed(
        int $ownerUserId,
        TalosBrowserTask $task,
        string $commandId,
    ): ?TalosBrowserRecoveryDecision {
        $recoveryCommand = TalosBrowserRecoveryCommand::query()
            ->ownedBy($ownerUserId)
            ->where('command_id', $commandId)
            ->first();
        if ($recoveryCommand instanceof TalosBrowserRecoveryCommand) {
            return $this->decisionFromJournal($task, $recoveryCommand, $commandId);
        }

        $event = TalosBrowserTaskEvent::query()
            ->ownedBy($ownerUserId)
            ->where('command_id', $commandId)
            ->first();
        if (! $event instanceof TalosBrowserTaskEvent) {
            return null;
        }
        $payload = is_array($event->payload) ? ($event->payload['recovery_decision'] ?? null) : null;
        if ((string) $event->task_id !== (string) $task->id || ! is_array($payload)) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                'Browser recovery command ID was already used for another intent.',
                'Generate a new recovery command ID and retry.',
            );
        }
        $strategy = is_string($payload['strategy'] ?? null)
            ? BrowserRecoveryStrategy::tryFrom($payload['strategy'])
            : null;
        if (! $strategy instanceof BrowserRecoveryStrategy
            || ! is_string($payload['reason_code'] ?? null)
            || ! is_string($payload['remediation'] ?? null)) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                'Persisted Browser recovery decision is malformed.',
                'Open Doctor and inspect the Browser task journal.',
            );
        }
        $resultingTaskId = $strategy === BrowserRecoveryStrategy::Resume ? $task->id : null;
        if ($strategy === BrowserRecoveryStrategy::Fork) {
            $resultingTaskId = $this->runtime->fork($ownerUserId, $task->id, $commandId)->id;
        }

        return new TalosBrowserRecoveryDecision(
            $strategy,
            $payload['reason_code'],
            $payload['remediation'],
            $task->id,
            $resultingTaskId,
        );
    }

    private function journalDecision(
        int $ownerUserId,
        TalosBrowserTask $task,
        string $commandId,
        BrowserRecoveryDecision $decision,
        ?string $resultingTaskId,
    ): TalosBrowserRecoveryDecision {
        $commandHash = $this->recoveryCommandHash($task->id);
        $payload = ['recovery_decision' => [
            'strategy' => $decision->strategy->value,
            'reason_code' => $decision->reasonCode,
            'remediation' => $decision->remediation,
        ]];
        $now = now();
        DB::table('talos_browser_recovery_commands')->insertOrIgnore([
            'id' => (string) Uuid::uuid5(
                Uuid::NAMESPACE_URL,
                "talos.browser.recovery.command.v1:{$ownerUserId}:{$commandId}",
            ),
            'schema_version' => 'talos.browser.recovery.command.v1',
            'task_id' => $task->id,
            'user_id' => $ownerUserId,
            'talos_session_id' => $task->talos_session_id,
            'command_id' => $commandId,
            'command_sha256' => $commandHash,
            'strategy' => $decision->strategy->value,
            'reason_code' => $decision->reasonCode,
            'remediation' => $decision->remediation,
            'resulting_task_id' => $resultingTaskId,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'occurred_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $stored = TalosBrowserRecoveryCommand::query()
            ->ownedBy($ownerUserId)
            ->where('command_id', $commandId)
            ->first();
        if (! $stored instanceof TalosBrowserRecoveryCommand) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                'Browser recovery decision could not be journaled.',
                'Open Doctor and inspect the Browser recovery command store.',
            );
        }

        return $this->decisionFromJournal($task, $stored, $commandId);
    }

    private function decisionFromJournal(
        TalosBrowserTask $task,
        TalosBrowserRecoveryCommand $command,
        string $commandId,
    ): TalosBrowserRecoveryDecision {
        $strategy = BrowserRecoveryStrategy::tryFrom((string) $command->strategy);
        $payload = is_array($command->payload) ? ($command->payload['recovery_decision'] ?? null) : null;
        if ((string) $command->task_id !== (string) $task->id
            || ! hash_equals((string) $command->command_id, $commandId)
            || ! hash_equals((string) $command->command_sha256, $this->recoveryCommandHash($task->id))) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                'Browser recovery command ID was already used for another intent.',
                'Generate a new recovery command ID and retry.',
            );
        }
        if (! $strategy instanceof BrowserRecoveryStrategy
            || ! is_string($command->reason_code)
            || ! is_string($command->remediation)
            || ! is_array($payload)
            || ($payload['strategy'] ?? null) !== $strategy->value
            || ($payload['reason_code'] ?? null) !== $command->reason_code
            || ($payload['remediation'] ?? null) !== $command->remediation) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                'Persisted Browser recovery decision is malformed.',
                'Open Doctor and inspect the Browser recovery command journal.',
            );
        }

        return new TalosBrowserRecoveryDecision(
            $strategy,
            $command->reason_code,
            $command->remediation,
            $task->id,
            is_string($command->resulting_task_id) ? $command->resulting_task_id : null,
        );
    }

    private function recoveryCommandHash(string $taskId): string
    {
        return 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson([
            'schema_version' => 'talos.browser.recovery.command.v1',
            'task_id' => $taskId,
            'operation' => 'recover',
        ]));
    }

    private function journalIntegrity(TalosBrowserTask $task): bool
    {
        $events = $task->events()->get();
        if ($events->count() !== ((int) $task->state_version) + 1) {
            return false;
        }
        $previousStatus = null;
        foreach ($events as $index => $event) {
            assert($event instanceof TalosBrowserTaskEvent);
            if ((int) $event->user_id !== (int) $task->user_id
                || (string) $event->talos_session_id !== (string) $task->talos_session_id
                || (int) $event->to_state_version !== $index
                || ($index === 0 && ($event->from_status !== null || $event->from_state_version !== null))
                || ($index > 0 && ((int) $event->from_state_version !== $index - 1 || $event->from_status !== $previousStatus))
                || ! is_string($event->command_sha256)
                || preg_match('/^sha256:[a-f0-9]{64}$/D', $event->command_sha256) !== 1) {
                return false;
            }
            $previousStatus = $event->to_status;
        }
        $last = $events->last();

        return $last instanceof TalosBrowserTaskEvent
            && (string) $last->to_status === (string) $task->status
            && (int) $last->to_state_version === (int) $task->state_version;
    }

    /** @return array{bool, int|null} */
    private function inspectWorker(int $ownerUserId, mixed $browser): array
    {
        if (! $browser instanceof TalosBrowserSession
            || ! is_string($browser->worker_session_id)
            || $browser->worker_session_id === '') {
            return [false, null];
        }
        try {
            $summary = $this->worker->inspect(TalosBrowserOwnerReference::forUser($ownerUserId), $browser->worker_session_id);
        } catch (BrowserWorkerException) {
            return [false, null];
        }

        return is_string($summary['sessionId'] ?? null)
            && hash_equals($browser->worker_session_id, $summary['sessionId'])
            && is_string($summary['status'] ?? null)
            && in_array($summary['status'], ['ready', 'active'], true)
            && is_int($summary['stateVersion'] ?? null)
            && $summary['stateVersion'] >= 0
                ? [true, $summary['stateVersion']]
                : [false, null];
    }

    private function dispatchState(mixed $action): ?string
    {
        if (! $action instanceof TalosBrowserAction) {
            return 'not_dispatched';
        }
        if (! in_array($action->status, self::ACTION_STATUSES, true)) {
            return null;
        }
        if ($action->committed_at !== null || in_array($action->status, ['committed', 'evidence_committed', 'verified'], true)) {
            return 'committed';
        }
        if ($action->status === 'ambiguous' || ($action->status === 'failed' && $action->started_at !== null)) {
            return 'ambiguous';
        }
        if ($action->started_at !== null || in_array($action->status, ['dispatched', 'observed'], true)) {
            return 'dispatched';
        }

        return 'not_dispatched';
    }

    private function policyVerified(mixed $action): bool
    {
        if (! $action instanceof TalosBrowserAction) {
            return true;
        }
        if (! in_array($action->status, self::ACTION_STATUSES, true)) {
            return false;
        }

        return $action->status !== 'proposed'
            && ! ($action->status === 'authorized' && $action->approved_at === null);
    }

    private function idempotencyIntentMatches(TalosBrowserTask $task, mixed $action): bool
    {
        if (! $action instanceof TalosBrowserAction) {
            return true;
        }
        if (in_array($action->status, ['denied', 'failed'], true)) {
            return false;
        }
        $message = TalosMessage::query()->whereKey($task->origin_message_id)->first();
        if (! $message instanceof TalosMessage || ! is_string($message->run_id)) {
            return false;
        }
        $call = TalosToolCall::query()
            ->ownedBy((int) $task->user_id)
            ->where('run_id', $message->run_id)
            ->where('logical_call_id', $action->intent_id)
            ->first();
        if (! $call instanceof TalosToolCall
            || ! is_string($call->effect_key)
            || ! hash_equals((string) $action->idempotency_key, $call->effect_key)
            || ! is_array($call->arguments)
            || ! is_array($action->arguments)) {
            return false;
        }

        return hash_equals(
            ProceduralLoopGuard::canonicalJson($action->arguments),
            ProceduralLoopGuard::canonicalJson($call->arguments),
        );
    }

    private function safeCheckpoint(TalosBrowserTask $task): ?TalosBrowserCheckpoint
    {
        $checkpoint = $task->checkpoints()->latest('task_state_version')->first();
        if (! $checkpoint instanceof TalosBrowserCheckpoint
            || (int) $checkpoint->task_state_version > (int) $task->state_version) {
            return null;
        }
        try {
            BrowserCheckpoint::fromArray([
                'schema_version' => $checkpoint->schema_version,
                'checkpoint_id' => $checkpoint->id,
                'task_id' => $checkpoint->task_id,
                'task_state_version' => $checkpoint->task_state_version,
                'task_status' => $checkpoint->task_status,
                'tab_inventory' => $checkpoint->tab_inventory,
                'budget' => $checkpoint->budget,
                'action_frontier' => $checkpoint->action_frontier,
                'evidence_frontier' => $checkpoint->evidence_frontier,
                'runtime_reconciliation_token' => $checkpoint->runtime_reconciliation_token,
                'created_at' => $checkpoint->recorded_at?->toISOString(),
            ]);
        } catch (InvalidArgumentException) {
            return null;
        }

        return $checkpoint;
    }

    private function currentFrameVerified(mixed $evidence, bool $workerAvailable, ?int $workerStateVersion): bool
    {
        return $workerAvailable
            && $workerStateVersion !== null
            && $evidence instanceof TalosBrowserEvidenceBundle
            && $evidence->committed_at !== null
            && (int) $evidence->worker_state_version === $workerStateVersion
            && is_string($evidence->integrity_sha256)
            && preg_match('/^sha256:[a-f0-9]{64}$/D', $evidence->integrity_sha256) === 1;
    }

    private function applicationDecision(
        BrowserRecoveryDecision $decision,
        TalosBrowserTask $task,
        ?string $resultingTaskId = null,
    ): TalosBrowserRecoveryDecision {
        return new TalosBrowserRecoveryDecision(
            $decision->strategy,
            $decision->reasonCode,
            $decision->remediation,
            $task->id,
            $resultingTaskId,
        );
    }

    private function derivedCommand(string $commandId, string $phase): string
    {
        return 'browser-recovery:'.substr(hash('sha256', $commandId.':'.$phase), 0, 48);
    }
}
