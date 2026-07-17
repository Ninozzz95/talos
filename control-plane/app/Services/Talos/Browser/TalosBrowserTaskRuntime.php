<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Services\Runs\TalosRunEventRecorder;
use App\Services\Security\CanonicalHttpUrl;
use Illuminate\Support\Facades\DB;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralPlan;
use Kadmos\Tool\ToolResult;
use Ramsey\Uuid\Uuid;
use Throwable;

final readonly class TalosBrowserTaskRuntime
{
    private const DEFAULT_BUDGET = [
        'max_actions' => 16,
        'max_elapsed_ms' => 120000,
        'max_bytes' => 16000000,
        'max_tabs' => 1,
        'max_domains' => 16,
        'max_tokens' => 196608,
    ];

    public function __construct(
        private TalosBrowserTaskRepository $tasks,
        private BrowserSessionClient $worker,
        private TalosRunEventRecorder $events,
        private TalosBrowserBudgetService $budgets,
        private TalosBrowserEvidenceCommitService $evidenceCommits,
        private TalosBrowserEvidenceOutbox $evidenceOutbox,
    ) {}

    public function begin(
        int $ownerUserId,
        TalosRun $run,
        TalosBrowserSession $browserSession,
    ): TalosBrowserTask {
        $run = TalosRun::query()->whereKey($run->id)->where('user_id', $ownerUserId)->first();
        $browserSession = TalosBrowserSession::query()
            ->whereKey($browserSession->id)
            ->where('user_id', $ownerUserId)
            ->first();
        if (! $run instanceof TalosRun
            || ! $browserSession instanceof TalosBrowserSession
            || (string) $run->session_id !== (string) $browserSession->talos_session_id) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_OWNERSHIP_INVALID',
                'Browser task run and worker session ownership do not match.',
                'Reload the owned chat and Browser session before retrying.',
            );
        }
        $message = TalosMessage::query()
            ->where('session_id', $run->session_id)
            ->where('run_id', $run->id)
            ->where('role', 'user')
            ->orderBy('created_at')
            ->first();
        if (! $message instanceof TalosMessage) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                'The Browser task has no run-bound origin message.',
                'Persist the user message before starting the Browser task.',
            );
        }

        $taskId = (string) Uuid::uuid5(
            Uuid::NAMESPACE_URL,
            "talos.browser.task.v1:{$ownerUserId}:{$run->id}",
        );
        $task = TalosBrowserTask::query()->ownedBy($ownerUserId)->whereKey($taskId)->first();
        if (! $task instanceof TalosBrowserTask) {
            $requestedAt = ($run->started_at ?? $run->created_at ?? now())->copy()->startOfSecond();
            $task = $this->tasks->create([
                'id' => $taskId,
                'schema_version' => 'talos.browser.task.v1',
                'user_id' => $ownerUserId,
                'talos_session_id' => $run->session_id,
                'origin_message_id' => $message->id,
                'browser_session_id' => $browserSession->id,
                'goal' => (string) $run->prompt,
                'status' => BrowserTaskStatus::Created->value,
                'autonomy_profile' => $this->autonomyProfile($browserSession),
                'budget' => self::DEFAULT_BUDGET,
                'runtime_id' => $browserSession->worker_session_id,
                'active_tab_id' => $this->tabIdForSession($ownerUserId, (string) $browserSession->id),
                'state_version' => 0,
                'requested_at' => $requestedAt,
            ], "browser-task:{$taskId}:create", 'system');
        }
        $this->assertTaskCorrelation($task, $run, $message, $browserSession);

        $startedAt = ($run->started_at ?? $task->requested_at ?? now())->copy()->startOfSecond();
        $progression = [
            BrowserTaskStatus::Created->value => BrowserTaskStatus::Planning,
            BrowserTaskStatus::Planning->value => BrowserTaskStatus::Ready,
            BrowserTaskStatus::Ready->value => BrowserTaskStatus::Running,
        ];
        while (isset($progression[$task->status])) {
            $next = $progression[$task->status];
            $task = $this->tasks->transition(
                $ownerUserId,
                (string) $task->id,
                $next,
                (int) $task->state_version,
                "browser-task:{$taskId}:{$next->value}",
                'task.'.$next->value,
                'system',
                statePatch: $next === BrowserTaskStatus::Running ? ['started_at' => $startedAt] : [],
            );
        }

        return $task;
    }

    /**
     * @param  array<string, TalosToolCall>  $persistedCalls
     * @return array<string, TalosBrowserAction>
     */
    public function prepareActions(
        int $ownerUserId,
        TalosBrowserTask $task,
        ProceduralPlan $plan,
        array $persistedCalls,
    ): array {
        $task = $this->tasks->owned($ownerUserId, (string) $task->id);
        if ($task->status !== BrowserTaskStatus::Running->value) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_TRANSITION_INVALID',
                'Browser actions can only be prepared for a running task.',
                'Recover or restart the Browser task before dispatching tools.',
            );
        }

        return DB::transaction(function () use ($ownerUserId, $task, $plan, $persistedCalls): array {
            $lockedTask = TalosBrowserTask::query()
                ->ownedBy($ownerUserId)
                ->whereKey($task->id)
                ->where('status', BrowserTaskStatus::Running->value)
                ->lockForUpdate()
                ->first();
            if (! $lockedTask instanceof TalosBrowserTask) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_STATE_CONFLICT',
                    'Browser task state changed while preparing its actions.',
                    'Reload the Browser task and retry.',
                );
            }
            $nextSequence = ((int) $lockedTask->actions()->max('sequence')) + 1;
            $actions = [];
            foreach ($plan->nodes as $node) {
                if ($node->context->browserSessionId === null || ! str_starts_with($node->call->name, 'browser_')) {
                    continue;
                }
                $call = $persistedCalls[$node->id] ?? null;
                if (! $call instanceof TalosToolCall) {
                    throw new TalosBrowserTaskException(
                        'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                        'A compiled Browser action has no persisted physical call.',
                        'Open Doctor and inspect the Browser task/tool-call correlation.',
                    );
                }
                $kind = $this->actionKind($node->call->name);
                $risk = match ($node->call->name) {
                    'browser_click' => 'reversible',
                    'browser_file_upload' => 'sensitive',
                    default => 'read',
                };
                $action = $lockedTask->actions()
                    ->where('idempotency_key', $node->context->idempotencyKey)
                    ->first();
                if (! $action instanceof TalosBrowserAction) {
                    $action = TalosBrowserAction::query()->create([
                        'schema_version' => 'talos.browser.action.v1',
                        'task_id' => $lockedTask->id,
                        'user_id' => $ownerUserId,
                        'talos_session_id' => $lockedTask->talos_session_id,
                        'intent_id' => $call->logical_call_id,
                        'sequence' => $nextSequence++,
                        'kind' => $kind,
                        'arguments' => $call->arguments,
                        'expected_state_version' => $node->context->stateVersion,
                        'risk' => $risk,
                        'idempotency_key' => $node->context->idempotencyKey,
                        'preconditions' => [],
                        'status' => 'proposed',
                        'requested_at' => now(),
                    ]);
                }
                $this->assertActionCorrelation($lockedTask, $action, $call, $kind, $risk, $node->context->stateVersion);
                $actions[$node->id] = $action;
            }

            return $actions;
        }, 3);
    }

    public function assertCanDispatch(
        int $ownerUserId,
        TalosBrowserTask $task,
        TalosBrowserAction $action,
        TalosToolCall $call,
        TalosBrowserSession $browserSession,
    ): TalosBrowserAction {
        $this->assertDispatchScope($ownerUserId, $task, $action, $call, $browserSession);
        $this->budgets->assertCanDispatch($task->refresh(), [
            'actions' => 1,
            'elapsed_ms' => 0,
            'bytes' => 0,
            'tabs' => 0,
            'domains' => $this->candidateDomainDelta($task, $action),
            'tokens' => 0,
        ]);

        return DB::transaction(function () use ($ownerUserId, $task, $action): TalosBrowserAction {
            $lockedTask = TalosBrowserTask::query()
                ->ownedBy($ownerUserId)
                ->whereKey($task->id)
                ->where('status', BrowserTaskStatus::Running->value)
                ->lockForUpdate()
                ->first();
            $lockedAction = TalosBrowserAction::query()
                ->ownedBy($ownerUserId)
                ->whereKey($action->id)
                ->where('task_id', $task->id)
                ->lockForUpdate()
                ->first();
            if (! $lockedTask instanceof TalosBrowserTask || ! $lockedAction instanceof TalosBrowserAction) {
                throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_STATE_CONFLICT', 'Browser action authorization lost its task scope.');
            }
            if ($lockedAction->status === 'proposed') {
                $lockedAction->forceFill(['status' => 'authorized', 'approved_at' => now()])->save();
            } elseif ($lockedAction->status !== 'authorized') {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_ACTION_STATE_INVALID',
                    'Browser action cannot be authorized from its current state.',
                    'Reload the Browser task action journal before retrying.',
                );
            }

            return $lockedAction->refresh();
        }, 3);
    }

    public function markDispatched(
        int $ownerUserId,
        TalosBrowserTask $task,
        TalosBrowserAction $action,
        TalosToolCall $call,
    ): TalosBrowserAction {
        if ((int) $task->user_id !== $ownerUserId
            || (int) $action->user_id !== $ownerUserId
            || (int) $call->user_id !== $ownerUserId
            || (string) $action->task_id !== (string) $task->id
            || ! is_string($call->effect_key)
            || ! hash_equals((string) $action->idempotency_key, $call->effect_key)
            || $call->effect_status !== 'in_flight') {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_ACTION_FENCE_INVALID',
                'Browser action dispatch is not bound to the claimed physical effect.',
                'Retry only after the tool-call execution fence is re-established.',
            );
        }

        return DB::transaction(function () use ($ownerUserId, $task, $action): TalosBrowserAction {
            $lockedTask = TalosBrowserTask::query()
                ->ownedBy($ownerUserId)
                ->whereKey($task->id)
                ->where('status', BrowserTaskStatus::Running->value)
                ->lockForUpdate()
                ->first();
            $lockedAction = TalosBrowserAction::query()
                ->ownedBy($ownerUserId)
                ->whereKey($action->id)
                ->where('task_id', $task->id)
                ->lockForUpdate()
                ->first();
            if (! $lockedTask instanceof TalosBrowserTask || ! $lockedAction instanceof TalosBrowserAction) {
                throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_STATE_CONFLICT', 'Browser action dispatch lost its task scope.');
            }
            if ($lockedAction->status === 'authorized') {
                $lockedAction->forceFill(['status' => 'dispatched', 'started_at' => now()])->save();
            } elseif ($lockedAction->status !== 'dispatched') {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_ACTION_STATE_INVALID',
                    'Browser action cannot be dispatched from its current state.',
                    'Inspect the Browser action journal before retrying.',
                );
            }

            return $lockedAction->refresh();
        }, 3);
    }

    public function recordResult(
        int $ownerUserId,
        TalosBrowserTask $task,
        TalosBrowserAction $action,
        TalosToolCall $call,
        ToolResult $result,
        TalosBrowserSession $browserSession,
        bool $dispatched = true,
    ): TalosBrowserAction {
        if ((int) $task->user_id !== $ownerUserId
            || (int) $action->user_id !== $ownerUserId
            || (int) $call->user_id !== $ownerUserId
            || (int) $browserSession->user_id !== $ownerUserId
            || (string) $action->task_id !== (string) $task->id
            || (string) $task->browser_session_id !== (string) $browserSession->id
            || (string) $result->toolUseId !== (string) $call->provider_call_id) {
            throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_OWNERSHIP_INVALID', 'Browser result does not belong to its task action.');
        }
        $resultHash = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($result->toWireArray()));

        return DB::transaction(function () use (
            $ownerUserId,
            $task,
            $action,
            $call,
            $result,
            $browserSession,
            $dispatched,
            $resultHash,
        ): TalosBrowserAction {
            $lockedAction = TalosBrowserAction::query()
                ->ownedBy($ownerUserId)
                ->whereKey($action->id)
                ->where('task_id', $task->id)
                ->lockForUpdate()
                ->first();
            if (! $lockedAction instanceof TalosBrowserAction) {
                throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_JOURNAL_INVALID', 'Browser action result lost its durable action row.');
            }
            $terminal = $dispatched ? ($result->isError ? 'failed' : 'committed') : 'denied';
            if (in_array($lockedAction->status, ['committed', 'evidence_committed', 'verified', 'failed', 'denied'], true)) {
                $terminalMatches = $terminal === 'committed'
                    ? in_array($lockedAction->status, ['committed', 'evidence_committed', 'verified'], true)
                    : $lockedAction->status === $terminal;
                if (! $terminalMatches || ! hash_equals((string) $lockedAction->result_sha256, $resultHash)) {
                    throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_COMMAND_CONFLICT', 'Browser action already has a different terminal result.');
                }

                return $lockedAction;
            }
            $allowed = $dispatched ? ['dispatched'] : ['proposed', 'authorized'];
            if (! in_array($lockedAction->status, $allowed, true)) {
                throw new TalosBrowserTaskException('TALOS_BROWSER_ACTION_STATE_INVALID', 'Browser action result cannot be committed from its current state.');
            }
            $now = now();
            $lockedAction->forceFill([
                'status' => $terminal,
                'result_sha256' => $resultHash,
                'error_code' => $result->isError ? $this->toolErrorCode($result) : null,
                'committed_at' => $terminal === 'committed' ? $now : null,
                'failed_at' => $terminal !== 'committed' ? $now : null,
            ])->save();
            if ($terminal === 'committed') {
                $this->evidenceCommits->commit(new TalosBrowserEvidenceCommitRequest(
                    task: $task,
                    action: $lockedAction,
                    call: $call,
                    result: $result,
                    browserSession: $browserSession->refresh(),
                    resultSha256: $resultHash,
                ));
            }

            return $lockedAction->refresh();
        }, 3);
    }

    public function resumeEvidenceForCall(int $ownerUserId, TalosToolCall $call): TalosBrowserEvidenceCommitOutcome
    {
        if ((int) $call->user_id !== $ownerUserId
            || ! is_string($call->logical_call_id)
            || ! is_string($call->effect_key)) {
            throw new TalosBrowserEvidenceException('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence replay call is not owned or lacks its durable identity.');
        }
        $action = TalosBrowserAction::query()
            ->ownedBy($ownerUserId)
            ->where('intent_id', $call->logical_call_id)
            ->where('idempotency_key', $call->effect_key)
            ->whereHas('task.originMessage', static fn ($query) => $query->where('run_id', $call->run_id))
            ->first();
        if (! $action instanceof TalosBrowserAction) {
            throw new TalosBrowserEvidenceException('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'Browser tool call has no correlated durable action.');
        }

        return $this->evidenceOutbox->resumeForAction($ownerUserId, (string) $action->id);
    }

    public function markAmbiguous(
        int $ownerUserId,
        TalosBrowserTask $task,
        TalosBrowserAction $action,
        TalosToolCall $call,
        string $errorCode,
    ): TalosBrowserAction {
        if (preg_match('/^TALOS_[A-Z0-9_]{1,120}$/D', $errorCode) !== 1
            || (int) $task->user_id !== $ownerUserId
            || (int) $action->user_id !== $ownerUserId
            || (int) $call->user_id !== $ownerUserId
            || (string) $action->task_id !== (string) $task->id
            || (string) $action->intent_id !== (string) $call->logical_call_id
            || ! is_string($call->effect_key)
            || ! hash_equals((string) $action->idempotency_key, $call->effect_key)
            || $call->effect_status !== 'recovery_required') {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_ACTION_FENCE_INVALID',
                'Ambiguous Browser action is not bound to a quarantined physical effect.',
                'Open Doctor and inspect the Browser action/call execution fence.',
            );
        }

        return DB::transaction(function () use ($ownerUserId, $task, $action, $errorCode): TalosBrowserAction {
            $lockedTask = TalosBrowserTask::query()
                ->ownedBy($ownerUserId)
                ->whereKey($task->id)
                ->where('status', BrowserTaskStatus::Running->value)
                ->lockForUpdate()
                ->first();
            $lockedAction = TalosBrowserAction::query()
                ->ownedBy($ownerUserId)
                ->whereKey($action->id)
                ->where('task_id', $task->id)
                ->lockForUpdate()
                ->first();
            if (! $lockedTask instanceof TalosBrowserTask || ! $lockedAction instanceof TalosBrowserAction) {
                throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_STATE_CONFLICT', 'Browser action quarantine lost its running task scope.');
            }
            if ($lockedAction->status === 'dispatched') {
                $lockedAction->forceFill([
                    'status' => 'ambiguous',
                    'error_code' => $errorCode,
                    'failed_at' => now(),
                ])->save();
            } elseif ($lockedAction->status !== 'ambiguous'
                || ! is_string($lockedAction->error_code)
                || ! hash_equals($lockedAction->error_code, $errorCode)) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_ACTION_STATE_INVALID',
                    'Browser action cannot enter ambiguous recovery from its current state.',
                    'Reload the Browser task action journal before retrying recovery.',
                );
            }

            return $lockedAction->refresh();
        }, 3);
    }

    public function settle(
        int $ownerUserId,
        TalosRun $run,
        BrowserTaskStatus $next,
    ): ?TalosBrowserTask {
        if (! in_array($next, [BrowserTaskStatus::Completed, BrowserTaskStatus::Failed, BrowserTaskStatus::Recovering], true)) {
            throw new \InvalidArgumentException('Browser task settlement status is unsupported.');
        }
        $message = TalosMessage::query()
            ->where('session_id', $run->session_id)
            ->where('run_id', $run->id)
            ->where('role', 'user')
            ->orderBy('created_at')
            ->first();
        if (! $message instanceof TalosMessage) {
            return null;
        }
        $task = TalosBrowserTask::query()
            ->ownedBy($ownerUserId)
            ->where('origin_message_id', $message->id)
            ->latest('requested_at')
            ->first();
        if (! $task instanceof TalosBrowserTask) {
            return null;
        }
        if ($task->status === $next->value) {
            return $task;
        }
        if (in_array($task->status, [BrowserTaskStatus::Completed->value, BrowserTaskStatus::Failed->value, BrowserTaskStatus::Cancelled->value], true)) {
            throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_TRANSITION_INVALID', 'Terminal Browser task settlement cannot be changed.');
        }
        if ($next === BrowserTaskStatus::Completed
            && $task->actions()->whereNotIn('status', ['evidence_committed', 'verified', 'denied'])->exists()) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                'Browser task cannot complete while an action result is unresolved.',
                'Recover the unresolved Browser action before finalizing the answer.',
            );
        }
        $timestamp = now()->startOfSecond();
        $statePatch = match ($next) {
            BrowserTaskStatus::Completed => ['completed_at' => $timestamp],
            BrowserTaskStatus::Failed => ['failed_at' => $timestamp],
            BrowserTaskStatus::Recovering => ['reconciled_at' => $timestamp],
            default => [],
        };

        return $this->tasks->transition(
            $ownerUserId,
            $task->id,
            $next,
            $task->state_version,
            $this->settlementCommand($task->id, $run->id, $next),
            'task.'.$next->value,
            'system',
            statePatch: $statePatch,
        );
    }

    public function cancel(
        int $ownerUserId,
        string $taskId,
        int $expectedVersion,
        string $commandId,
        string $reason,
    ): TalosBrowserTask {
        $reason = trim($reason);
        if ($reason === '' || mb_strlen($reason) > 512) {
            throw new \InvalidArgumentException('Browser task cancellation reason is invalid.');
        }

        [$task, $workerSessionId, $runId, $propagate] = DB::transaction(function () use (
            $ownerUserId,
            $taskId,
            $expectedVersion,
            $commandId,
            $reason,
        ): array {
            $lockedTask = TalosBrowserTask::query()
                ->ownedBy($ownerUserId)
                ->whereKey($taskId)
                ->lockForUpdate()
                ->first();
            if (! $lockedTask instanceof TalosBrowserTask) {
                throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_NOT_FOUND', 'Browser task was not found.');
            }
            $wasCancelled = $lockedTask->status === BrowserTaskStatus::Cancelled->value;
            $cancelledAt = ($wasCancelled && $lockedTask->cancelled_at !== null
                ? $lockedTask->cancelled_at
                : now())->copy()->startOfSecond();
            $task = $this->tasks->transition(
                $ownerUserId,
                $taskId,
                BrowserTaskStatus::Cancelled,
                $expectedVersion,
                $commandId,
                'task.cancelled',
                'user',
                (string) $ownerUserId,
                ['cancelled_at' => $cancelledAt],
                ['reason' => $reason],
            );
            if ($wasCancelled) {
                return [$task, null, null, false];
            }

            $message = TalosMessage::query()
                ->whereKey($lockedTask->origin_message_id)
                ->where('session_id', $lockedTask->talos_session_id)
                ->first();
            $run = $message instanceof TalosMessage && is_string($message->run_id)
                ? TalosRun::query()->whereKey($message->run_id)->where('user_id', $ownerUserId)->lockForUpdate()->first()
                : null;
            if (! $run instanceof TalosRun) {
                throw new TalosBrowserTaskException(
                    'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                    'The Browser task cannot be correlated to its run.',
                    'Open Doctor and inspect the Browser task journal.',
                );
            }
            $turn = TalosToolTurn::query()
                ->ownedBy($ownerUserId)
                ->where('run_id', $run->id)
                ->lockForUpdate()
                ->first();
            if ($turn instanceof TalosToolTurn) {
                foreach ($turn->calls()->lockForUpdate()->get() as $call) {
                    assert($call instanceof TalosToolCall);
                    $call->forceFill([
                        'status' => 'cancelled',
                        'effect_status' => $call->effect_status === 'in_flight' ? 'ambiguous' : 'cancelled',
                        'execution_token' => null,
                        'execution_lease_expires_at' => null,
                    ])->save();
                }
                $turn->forceFill([
                    'status' => 'cancelled',
                    'cancel_requested_at' => $cancelledAt,
                    'completed_at' => $cancelledAt,
                    'execution_lease_token' => null,
                    'execution_lease_expires_at' => null,
                    'execution_lease_phase' => null,
                    'provider_operation_status' => $turn->provider_operation_status === 'in_flight' ? 'cancelled' : $turn->provider_operation_status,
                    'revision' => ((int) $turn->revision) + 1,
                ])->save();
            }
            $lockedTask->leases()->where('status', 'active')->update([
                'status' => 'released',
                'released_at' => $cancelledAt,
                'updated_at' => $cancelledAt,
            ]);
            $run->forceFill(['status' => 'cancelled', 'completed_at' => $cancelledAt])->save();

            $browser = $lockedTask->browserSession;
            $workerSessionId = $browser instanceof TalosBrowserSession && is_string($browser->worker_session_id)
                ? $browser->worker_session_id
                : null;
            if ($browser instanceof TalosBrowserSession) {
                $browser->forceFill(['status' => 'closed', 'expires_at' => $cancelledAt])->save();
            }

            return [$task, $workerSessionId, (string) $run->id, true];
        }, 3);

        if ($propagate && is_string($runId)) {
            $this->events->record(
                ['run_id' => $runId, 'user_id' => $ownerUserId],
                ['event_type' => 'browser.task.cancelled', 'payload' => ['task_id' => $taskId]],
            );
        }
        if ($propagate && is_string($workerSessionId) && $workerSessionId !== '') {
            try {
                $this->worker->cancel('user:'.$ownerUserId, $workerSessionId, $reason);
            } catch (Throwable $exception) {
                if (is_string($runId)) {
                    $this->events->record(
                        ['run_id' => $runId, 'user_id' => $ownerUserId],
                        [
                            'event_type' => 'browser.task.cancel_propagation_failed',
                            'severity' => 'warning',
                            'payload' => [
                                'task_id' => $taskId,
                                'worker_error' => $exception instanceof BrowserWorkerException
                                    ? $exception->errorCode
                                    : 'TALOS_BROWSER_WORKER_FAILURE',
                            ],
                        ],
                    );
                }
            }
        }

        return $task;
    }

    public function fork(
        int $ownerUserId,
        string $taskId,
        string $commandId,
    ): TalosBrowserTask {
        $commandId = trim($commandId);
        if ($commandId === '' || mb_strlen($commandId) > 128) {
            throw new \InvalidArgumentException('Browser recovery command ID is invalid.');
        }
        $source = $this->tasks->owned($ownerUserId, $taskId);
        if ($source->status !== BrowserTaskStatus::Recovering->value) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_TRANSITION_INVALID',
                'A Browser task must enter recovery before it can be forked.',
                'Reload the task recovery state before retrying the fork.',
            );
        }
        $checkpoint = $source->checkpoints()->latest('task_state_version')->first();
        if (! $checkpoint instanceof TalosBrowserCheckpoint) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_CHECKPOINT_REQUIRED',
                'A safe Browser checkpoint is required before forking recovery.',
                'Capture a verified checkpoint before retrying recovery.',
            );
        }
        $forkId = (string) Uuid::uuid5(
            Uuid::NAMESPACE_URL,
            "talos.browser.task.fork.v1:{$ownerUserId}:{$taskId}:{$commandId}",
        );
        $existing = TalosBrowserTask::query()->ownedBy($ownerUserId)->whereKey($forkId)->first();
        if ($existing instanceof TalosBrowserTask) {
            return $this->assertForkCorrelation($existing, $source);
        }

        $sourceBrowser = $source->browserSession;
        $width = $sourceBrowser instanceof TalosBrowserSession ? (int) $sourceBrowser->viewport_width : 1280;
        $height = $sourceBrowser instanceof TalosBrowserSession ? (int) $sourceBrowser->viewport_height : 800;
        $worker = $this->worker->createIdempotent(
            'user:'.$ownerUserId,
            $width,
            $height,
            $forkId,
        );
        if (! $this->validWorkerSession($worker)) {
            $this->closeWorkerQuietly($ownerUserId, $worker);
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_WORKER_FAILURE',
                'Browser recovery worker returned an invalid session contract.',
                'Open Doctor, verify the Browser worker, then retry recovery.',
            );
        }

        try {
            return DB::transaction(function () use (
                $ownerUserId,
                $source,
                $sourceBrowser,
                $checkpoint,
                $forkId,
                $commandId,
                $worker,
                $width,
                $height,
            ): TalosBrowserTask {
                $existing = TalosBrowserTask::query()->ownedBy($ownerUserId)->whereKey($forkId)->lockForUpdate()->first();
                if ($existing instanceof TalosBrowserTask) {
                    return $this->assertForkCorrelation($existing, $source);
                }
                $browser = TalosBrowserSession::query()->create([
                    'user_id' => $ownerUserId,
                    'talos_session_id' => $source->talos_session_id,
                    'worker_session_id' => $worker['sessionId'],
                    'status' => $worker['status'],
                    'mode' => $worker['mode'],
                    'current_url' => $this->checkpointActiveValue($checkpoint, 'url'),
                    'current_title' => $this->checkpointActiveValue($checkpoint, 'title'),
                    'viewport_width' => $width,
                    'viewport_height' => $height,
                    'device_scale_factor' => is_int($worker['deviceScaleFactor'] ?? null) ? $worker['deviceScaleFactor'] : 1,
                    'capabilities' => $worker['capabilities'],
                    'policy' => $sourceBrowser instanceof TalosBrowserSession ? $sourceBrowser->policy : [],
                    'worker_state_version' => $worker['stateVersion'],
                    'expires_at' => $worker['expiresAt'],
                    'last_seen_at' => now(),
                ]);
                $task = $this->tasks->create([
                    'id' => $forkId,
                    'schema_version' => 'talos.browser.task.v1',
                    'user_id' => $ownerUserId,
                    'talos_session_id' => $source->talos_session_id,
                    'origin_message_id' => $source->origin_message_id,
                    'browser_session_id' => $browser->id,
                    'goal' => $source->goal,
                    'status' => BrowserTaskStatus::Created->value,
                    'autonomy_profile' => $source->autonomy_profile,
                    'budget' => $source->budget,
                    'runtime_id' => $worker['sessionId'],
                    'active_tab_id' => $this->checkpointActiveValue($checkpoint, 'tab_id')
                        ?? $this->tabIdForSession($ownerUserId, (string) $browser->id),
                    'state_version' => 0,
                    'requested_at' => now()->startOfSecond(),
                ], $this->forkCommand($forkId, 'create'), 'system');
                foreach ([BrowserTaskStatus::Planning, BrowserTaskStatus::Ready, BrowserTaskStatus::Running] as $next) {
                    $task = $this->tasks->transition(
                        $ownerUserId,
                        $task->id,
                        $next,
                        $task->state_version,
                        $this->forkCommand($forkId, $next->value),
                        'task.'.$next->value,
                        'system',
                        statePatch: $next === BrowserTaskStatus::Running ? ['started_at' => now()->startOfSecond()] : [],
                        eventPayload: ['forked_from_task_id' => $source->id, 'recovery_command_id' => $commandId],
                    );
                }
                TalosBrowserCheckpoint::query()->create([
                    'schema_version' => 'talos.browser.checkpoint.v1',
                    'task_id' => $task->id,
                    'user_id' => $ownerUserId,
                    'talos_session_id' => $task->talos_session_id,
                    'task_state_version' => $task->state_version,
                    'task_status' => $task->status,
                    'tab_inventory' => $checkpoint->tab_inventory,
                    'budget' => $task->budget,
                    'action_frontier' => $checkpoint->action_frontier,
                    'evidence_frontier' => $checkpoint->evidence_frontier,
                    'runtime_reconciliation_token' => null,
                    'recorded_at' => now(),
                ]);

                return $task->refresh();
            }, 3);
        } catch (Throwable $exception) {
            $existing = TalosBrowserTask::query()->ownedBy($ownerUserId)->whereKey($forkId)->first();
            if ($existing instanceof TalosBrowserTask) {
                $existing = $this->assertForkCorrelation($existing, $source);
                $existingWorkerSessionId = $existing->browserSession()->value('worker_session_id');
                if (is_string($existingWorkerSessionId)
                    && hash_equals((string) $worker['sessionId'], $existingWorkerSessionId)) {
                    return $existing;
                }

                $this->closeWorkerQuietly($ownerUserId, $worker);

                return $existing;
            }

            $this->closeWorkerQuietly($ownerUserId, $worker);

            throw $exception;
        }
    }

    private function autonomyProfile(TalosBrowserSession $browserSession): string
    {
        $policy = is_array($browserSession->policy) ? $browserSession->policy : [];
        $profile = $policy['autonomy_profile'] ?? 'assist';

        return is_string($profile) && in_array($profile, ['observe', 'assist', 'act', 'custom'], true)
            ? $profile
            : 'assist';
    }

    private function assertTaskCorrelation(
        TalosBrowserTask $task,
        TalosRun $run,
        TalosMessage $message,
        TalosBrowserSession $browserSession,
    ): void {
        if ((int) $task->user_id !== (int) $run->user_id
            || (string) $task->talos_session_id !== (string) $run->session_id
            || (string) $task->origin_message_id !== (string) $message->id
            || (string) $task->browser_session_id !== (string) $browserSession->id) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                'The deterministic Browser task identity is already bound to another context.',
                'Open Doctor and inspect the Browser task identity collision.',
            );
        }
    }

    private function assertForkCorrelation(TalosBrowserTask $fork, TalosBrowserTask $source): TalosBrowserTask
    {
        if ((int) $fork->user_id !== (int) $source->user_id
            || (string) $fork->talos_session_id !== (string) $source->talos_session_id
            || (string) $fork->origin_message_id !== (string) $source->origin_message_id) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                'The deterministic Browser fork identity is already bound to another context.',
                'Open Doctor and inspect the Browser recovery identity collision.',
            );
        }

        return $fork;
    }

    /** @param array<string, mixed> $worker */
    private function validWorkerSession(array $worker): bool
    {
        return is_string($worker['sessionId'] ?? null)
            && $worker['sessionId'] !== ''
            && is_string($worker['status'] ?? null)
            && in_array($worker['status'], ['ready', 'active'], true)
            && is_string($worker['mode'] ?? null)
            && $worker['mode'] !== ''
            && is_array($worker['capabilities'] ?? null)
            && is_int($worker['stateVersion'] ?? null)
            && $worker['stateVersion'] >= 0
            && is_string($worker['expiresAt'] ?? null)
            && strtotime($worker['expiresAt']) !== false;
    }

    /** @param array<string, mixed> $worker */
    private function closeWorkerQuietly(int $ownerUserId, array $worker): void
    {
        if (! is_string($worker['sessionId'] ?? null) || $worker['sessionId'] === '') {
            return;
        }
        try {
            $this->worker->close('user:'.$ownerUserId, $worker['sessionId']);
        } catch (Throwable) {
        }
    }

    private function checkpointActiveValue(TalosBrowserCheckpoint $checkpoint, string $key): ?string
    {
        $tabs = is_array($checkpoint->tab_inventory) ? $checkpoint->tab_inventory : [];
        foreach ($tabs as $tab) {
            if (is_array($tab) && ($tab['is_active'] ?? false) === true && is_string($tab[$key] ?? null)) {
                return $tab[$key];
            }
        }

        return null;
    }

    private function tabIdForSession(int $ownerUserId, string $browserSessionId): string
    {
        return (string) Uuid::uuid5(
            Uuid::NAMESPACE_URL,
            "talos.browser.tab.v1:{$ownerUserId}:{$browserSessionId}",
        );
    }

    private function forkCommand(string $forkId, string $phase): string
    {
        return 'browser-fork:'.substr(hash('sha256', $forkId.':'.$phase), 0, 48);
    }

    private function actionKind(string $toolName): string
    {
        return match ($toolName) {
            'browser_navigate' => 'navigate',
            'browser_snapshot' => 'snapshot',
            'browser_read' => 'read',
            'browser_take_screenshot' => 'screenshot',
            'browser_click' => 'click',
            'browser_file_upload' => 'upload',
            default => throw new TalosBrowserTaskException(
                'TALOS_BROWSER_ACTION_UNSUPPORTED',
                'Compiled Browser tool is not supported by the task action journal.',
            ),
        };
    }

    private function assertActionCorrelation(
        TalosBrowserTask $task,
        TalosBrowserAction $action,
        TalosToolCall $call,
        string $kind,
        string $risk,
        int $expectedStateVersion,
    ): void {
        if ((int) $action->user_id !== (int) $task->user_id
            || (string) $action->talos_session_id !== (string) $task->talos_session_id
            || (string) $action->task_id !== (string) $task->id
            || (string) $action->intent_id !== (string) $call->logical_call_id
            || (string) $action->kind !== $kind
            || (string) $action->risk !== $risk
            || (int) $action->expected_state_version !== $expectedStateVersion
            || ! is_array($action->arguments)
            || ! is_array($call->arguments)
            || ! hash_equals(
                ProceduralLoopGuard::canonicalJson($action->arguments),
                ProceduralLoopGuard::canonicalJson($call->arguments),
            )) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_COMMAND_CONFLICT',
                'Persisted Browser action does not match its compiled physical call.',
                'Open Doctor and inspect the Browser action/call correlation.',
            );
        }
    }

    private function assertDispatchScope(
        int $ownerUserId,
        TalosBrowserTask $task,
        TalosBrowserAction $action,
        TalosToolCall $call,
        TalosBrowserSession $browserSession,
    ): void {
        if ((int) $task->user_id !== $ownerUserId
            || (int) $action->user_id !== $ownerUserId
            || (int) $call->user_id !== $ownerUserId
            || (int) $browserSession->user_id !== $ownerUserId
            || (string) $task->talos_session_id !== (string) $browserSession->talos_session_id
            || (string) $task->browser_session_id !== (string) $browserSession->id
            || (string) $action->task_id !== (string) $task->id
            || (string) $call->run_id !== (string) $task->originMessage?->run_id
            || (string) $action->intent_id !== (string) $call->logical_call_id) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_OWNERSHIP_INVALID',
                'Browser dispatch scope does not match its task, session, and physical call.',
                'Reload the owned Browser task before retrying.',
            );
        }
    }

    private function candidateDomainDelta(TalosBrowserTask $task, TalosBrowserAction $candidate): int
    {
        if ($candidate->kind !== 'navigate') {
            return 0;
        }
        $arguments = is_array($candidate->arguments) ? $candidate->arguments : [];
        $url = $arguments['url'] ?? null;
        if (! is_string($url)) {
            throw new TalosBrowserTaskException('TALOS_BROWSER_TASK_JOURNAL_INVALID', 'Prepared Browser navigation URL is missing.');
        }
        try {
            $candidateHost = CanonicalHttpUrl::fromString($url)->asciiHost;
            $consumed = $task->actions()
                ->where('kind', 'navigate')
                ->where(function ($query): void {
                    $query->whereNotNull('started_at')
                        ->orWhereIn('status', ['dispatched', 'observed', 'committed', 'evidence_committed', 'verified', 'ambiguous']);
                })
                ->get(['arguments']);
            foreach ($consumed as $action) {
                $persistedUrl = is_array($action->arguments) ? ($action->arguments['url'] ?? null) : null;
                if (! is_string($persistedUrl)) {
                    throw new \InvalidArgumentException('Persisted Browser navigation URL is missing.');
                }
                if (CanonicalHttpUrl::fromString($persistedUrl)->asciiHost === $candidateHost) {
                    return 0;
                }
            }
        } catch (\InvalidArgumentException $exception) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                'Browser navigation domain accounting is invalid.',
                'Open Doctor and inspect the Browser action URLs.',
            );
        }

        return 1;
    }

    private function toolErrorCode(ToolResult $result): ?string
    {
        $code = $result->structuredContent['code'] ?? null;

        return is_string($code) ? $code : null;
    }

    private function settlementCommand(string $taskId, string $runId, BrowserTaskStatus $next): string
    {
        return 'browser-settle:'.substr(hash('sha256', $taskId.':'.$runId.':'.$next->value), 0, 48);
    }
}
