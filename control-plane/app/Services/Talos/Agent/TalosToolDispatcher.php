<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosToolCall as PersistedToolCall;
use App\Models\TalosToolResult as PersistedToolResult;
use App\Models\TalosToolTurn;
use App\Services\Runs\TalosRunEventRecorder;
use App\Services\Talos\Browser\TalosBrowserActionPolicy;
use App\Services\Talos\Browser\TalosBrowserEvidenceException;
use App\Services\Talos\Browser\TalosBrowserTakeoverService;
use App\Services\Talos\Browser\TalosBrowserTaskException;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ProceduralPlan;
use Kadmos\Tool\ToolApprovalGrant;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolResult;
use Kadmos\Workers\WorkerRegistry;

final class TalosToolDispatcher
{
    public function __construct(
        private readonly TalosToolExecutionBackend $backend,
        private readonly TalosApprovalService $approvals,
        private readonly TalosAgentBudgetService $budgets,
        private readonly TalosRunEventRecorder $events,
        private readonly TalosExecutionClaimService $claims,
        private readonly TalosToolEvidenceBudgetGate $evidenceBudgets,
        private readonly TalosBrowserActionPolicy $browserActionPolicy,
        private readonly TalosBrowserTakeoverService $browserTakeover,
        private readonly TalosBrowserTaskRuntime $browserTasks,
    ) {}

    public function dispatch(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        ProceduralPlan $plan,
        TalosProceduralGuardCheckpoint $guardCheckpoint,
        ?TalosBrowserSession $browserSession = null,
        array $logicalCallIdsByProviderCallId = [],
        array $repairAttemptsByProviderCallId = [],
        ?string $evidenceHash = null,
        ?string $evidenceSnapshotArtifactId = null,
        ?string $evidenceSnapshotId = null,
        ?TalosBrowserTask $browserTask = null,
    ): TalosToolDispatchReport {
        if (! in_array($plan->state, [ProceduralPlan::DAG_COMPILED, ProceduralPlan::AWAITING_APPROVAL], true)) {
            throw new InvalidArgumentException('Only executable procedural plans can be dispatched.');
        }

        $turn = $this->ownedLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
        $this->assertBrowserOwnership($turn, $browserSession);
        $nodesById = [];
        foreach ($plan->nodes as $node) {
            $nodesById[$node->id] = $node;
        }

        $workers = new WorkerRegistry;
        $worker = new TalosProceduralNodeWorker(
            $nodesById,
            $this->backend,
            $turn,
            $browserSession,
            $this->evidenceBudgets,
            $this->claims,
            $ownerUserId,
            $turnLeaseToken,
        );
        foreach ($plan->nodes as $node) {
            if (! $workers->has($node->type)) {
                $workers->register($node->type, $worker);
            }
        }
        $orchestrator = $plan->materialize($workers, $this->approvals);
        $calls = $this->persistCalls(
            $ownerUserId,
            $turn,
            $turnLeaseToken,
            $plan,
            $orchestrator,
            $guardCheckpoint,
            $evidenceHash,
            $evidenceSnapshotArtifactId,
            $evidenceSnapshotId,
            $logicalCallIdsByProviderCallId,
            $repairAttemptsByProviderCallId,
        );
        $turn->refresh();
        $this->restoreCheckpoint($turn, $orchestrator);
        $this->restorePersistedResults($ownerUserId, $turn, $turnLeaseToken, $calls, $orchestrator);
        $this->applyPersistedApprovals($calls, $orchestrator);
        $browserTask ??= $this->activeBrowserTask($ownerUserId, $turn, $browserSession);
        $actions = [];
        if ($browserTask instanceof TalosBrowserTask) {
            if (! $browserSession instanceof TalosBrowserSession
                || (int) $browserTask->user_id !== $ownerUserId
                || (string) $browserTask->talos_session_id !== (string) $turn->session_id
                || (string) $browserTask->browser_session_id !== (string) $browserSession->id) {
                throw new TalosToolRecoveryRequiredException(message: 'Browser task scope does not match the procedural turn.');
            }
            if ($browserTask->status === 'running') {
                try {
                    $actions = $this->browserTasks->prepareActions($ownerUserId, $browserTask, $plan, $calls);
                } catch (TalosBrowserTaskException $exception) {
                    throw new TalosToolRecoveryRequiredException($exception->errorCode, $exception->getMessage());
                }
            } elseif ($browserTask->status !== 'waiting_user') {
                throw new TalosToolRecoveryRequiredException(message: 'Browser task must be recovered before procedural dispatch can continue.');
            }
        }

        while (($queue = $orchestrator->getExecutionQueue()) !== []) {
            foreach ($queue as $nodeId) {
                $node = $nodesById[$nodeId];
                $call = $calls[$nodeId];
                $action = $actions[$nodeId] ?? null;
                $browserNode = $node->context->browserSessionId !== null
                    && str_starts_with($node->call->name, 'browser_');
                if ($browserNode
                    && $browserTask instanceof TalosBrowserTask
                    && $browserSession instanceof TalosBrowserSession) {
                    try {
                        $this->browserTakeover->assertModelMayDispatch($browserTask);
                    } catch (TalosBrowserTaskException $exception) {
                        $calls[$nodeId] = $this->denyNode(
                            $ownerUserId,
                            $turn,
                            $turnLeaseToken,
                            $orchestrator,
                            $node,
                            $call,
                            $exception->errorCode,
                            $exception->getMessage(),
                            ['source' => 'human_takeover'],
                            $browserTask,
                            $action,
                            $browserSession,
                        );

                        continue;
                    }
                    if (! $action instanceof TalosBrowserAction) {
                        throw new TalosToolRecoveryRequiredException(
                            message: 'A dispatchable Browser node is missing its durable action journal row.',
                        );
                    }
                    $decision = $this->browserActionPolicy->evaluate(
                        $browserTask,
                        $node,
                        $browserSession,
                        $call->refresh(),
                    );
                    if (! $decision->allowsModelDispatch()) {
                        $calls[$nodeId] = $this->denyNode(
                            $ownerUserId,
                            $turn,
                            $turnLeaseToken,
                            $orchestrator,
                            $node,
                            $call,
                            $decision->reasonCode,
                            $decision->remediation,
                            [
                                'source' => 'browser_action_policy',
                                'disposition' => $decision->disposition->value,
                                'risk' => $decision->risk->value,
                            ],
                            $browserTask,
                            $action,
                            $browserSession,
                        );

                        continue;
                    }
                    try {
                        $actions[$nodeId] = $action = $this->browserTasks->assertCanDispatch(
                            $ownerUserId,
                            $browserTask,
                            $action,
                            $call->refresh(),
                            $browserSession->refresh(),
                        );
                    } catch (TalosBrowserTaskException $exception) {
                        if (in_array($exception->errorCode, [
                            'TALOS_BROWSER_ACTION_STATE_INVALID',
                            'TALOS_BROWSER_TASK_STATE_CONFLICT',
                            'TALOS_BROWSER_TASK_JOURNAL_INVALID',
                        ], true)) {
                            throw new TalosToolRecoveryRequiredException($exception->errorCode, $exception->getMessage());
                        }
                        $calls[$nodeId] = $this->denyNode(
                            $ownerUserId,
                            $turn,
                            $turnLeaseToken,
                            $orchestrator,
                            $node,
                            $call,
                            $exception->errorCode,
                            $exception->getMessage(),
                            ['source' => 'browser_task_budget'],
                            $browserTask,
                            $action,
                            $browserSession,
                        );

                        continue;
                    }
                }
                $this->enforceElapsedBudget($ownerUserId, $turn, $turnLeaseToken);
                $reservationIds = $this->reserveExecutionBudgets(
                    $ownerUserId,
                    $turn,
                    $turnLeaseToken,
                    $call,
                    $node,
                );
                $effectToken = $this->claims->claimCall(
                    $ownerUserId,
                    (string) $call->id,
                    $node->context->idempotencyKey,
                    $turnLeaseToken,
                );
                if ($effectToken === null) {
                    foreach (array_reverse($reservationIds) as $reservationId) {
                        $this->budgets->release($reservationId, $ownerUserId, $turnLeaseToken);
                    }
                    throw new TalosToolRecoveryRequiredException;
                }
                if ($action instanceof TalosBrowserAction
                    && $browserTask instanceof TalosBrowserTask) {
                    try {
                        $actions[$nodeId] = $action = $this->browserTasks->markDispatched(
                            $ownerUserId,
                            $browserTask,
                            $action,
                            $call->refresh(),
                        );
                    } catch (TalosBrowserTaskException $exception) {
                        $this->claims->releaseCall(
                            $ownerUserId,
                            (string) $call->id,
                            $effectToken,
                            $turnLeaseToken,
                        );
                        foreach (array_reverse($reservationIds) as $reservationId) {
                            $this->budgets->release($reservationId, $ownerUserId, $turnLeaseToken);
                        }
                        throw new TalosToolRecoveryRequiredException($exception->errorCode, $exception->getMessage());
                    }
                }
                $worker->armExecutionFence($nodeId, (string) $call->id, $effectToken);

                $this->record($ownerUserId, $turn, $turnLeaseToken, 'tool.execution.started', $node, [
                    'provider_call_id' => $node->call->providerCallId,
                    'tool_name' => $node->call->name,
                ]);

                try {
                    $this->enforceElapsedBudget($ownerUserId, $turn, $turnLeaseToken);
                } catch (TalosBudgetExceededException $exception) {
                    $released = $this->claims->releaseCall(
                        $ownerUserId,
                        (string) $call->id,
                        $effectToken,
                        $turnLeaseToken,
                    );
                    foreach (array_reverse($reservationIds) as $reservationId) {
                        $this->budgets->release($reservationId, $ownerUserId, $turnLeaseToken);
                    }
                    if (! $released) {
                        throw new TalosToolRecoveryRequiredException(
                            message: 'The tool preflight crossed its budget after its execution fence expired.',
                        );
                    }
                    $this->record($ownerUserId, $turn, $turnLeaseToken, 'tool.execution.denied', $node, [
                        'provider_call_id' => $node->call->providerCallId,
                        'tool_name' => $node->call->name,
                        'error_code' => $exception->faultCode,
                    ]);

                    throw $exception;
                } catch (TalosToolRecoveryRequiredException $exception) {
                    $this->claims->authorizeCallExecution(
                        $ownerUserId,
                        (string) $call->id,
                        $effectToken,
                        $turnLeaseToken,
                    );

                    throw $exception;
                }

                try {
                    $orchestrator->executeNode($nodeId);
                    $outcome = $orchestrator->exportState()['nodes'][$nodeId] ?? [];
                    $result = $node->resultFromOutcome(is_array($outcome) ? $outcome : []);
                    $call = $this->persistResultAndCompleteCall(
                        $ownerUserId,
                        $turn,
                        $turnLeaseToken,
                        $call,
                        $effectToken,
                        $result,
                        $node->context->stateVersion,
                        $browserTask,
                        $action,
                        $browserSession,
                    );
                    $calls[$nodeId] = $call;
                } catch (\Throwable $exception) {
                    $this->claims->quarantineCall(
                        $ownerUserId,
                        (string) $call->id,
                        $effectToken,
                    );

                    if ($action instanceof TalosBrowserAction
                        && $browserTask instanceof TalosBrowserTask) {
                        try {
                            $actions[$nodeId] = $this->browserTasks->markAmbiguous(
                                $ownerUserId,
                                $browserTask,
                                $action,
                                $call->refresh(),
                                'TALOS_BROWSER_ACTION_OUTCOME_UNKNOWN',
                            );
                        } catch (TalosBrowserTaskException $taskException) {
                            throw new TalosToolRecoveryRequiredException(
                                $taskException->errorCode,
                                $taskException->getMessage(),
                            );
                        }

                        throw new TalosToolRecoveryRequiredException(
                            'TALOS_BROWSER_ACTION_OUTCOME_UNKNOWN',
                            'The Browser action crossed its execution fence but its physical outcome is unknown.',
                        );
                    }

                    throw $exception;
                }
                if ($browserNode && ! $result->isError) {
                    try {
                        $this->browserTasks->resumeEvidenceForCall($ownerUserId, $call->refresh());
                    } catch (TalosBrowserEvidenceException $exception) {
                        throw new TalosToolRecoveryRequiredException($exception->faultCode, $exception->getMessage());
                    }
                }
                foreach ($reservationIds as $reservationId) {
                    $this->budgets->settle($reservationId, $ownerUserId, 1, $turnLeaseToken);
                }

                $this->record(
                    $ownerUserId,
                    $turn,
                    $turnLeaseToken,
                    $result->isError ? 'tool.execution.failed' : 'tool.execution.completed',
                    $node,
                    [
                        'provider_call_id' => $node->call->providerCallId,
                        'tool_name' => $node->call->name,
                        'is_error' => $result->isError,
                        'evidence_ids' => array_values(array_filter(array_map(
                            static fn (array $evidence): mixed => $evidence['artifact_id'] ?? null,
                            $result->evidence,
                        ), 'is_string')),
                        'error_code' => $this->errorCode($result),
                    ],
                );
                $this->checkpoint($ownerUserId, $turn, $turnLeaseToken, $orchestrator);
            }
        }

        $this->synchronizeCallStates($ownerUserId, $turn, $turnLeaseToken, $calls, $orchestrator);
        $this->checkpoint($ownerUserId, $turn, $turnLeaseToken, $orchestrator);

        $waiting = [];
        $blocked = [];
        $results = [];
        foreach ($plan->nodes as $node) {
            $call = $calls[$node->id]->refresh();
            if ($call->status === 'awaiting_approval') {
                $waiting[] = (string) $call->id;
            }
            if ($call->status === 'blocked_by_dependency') {
                $blocked[] = (string) $call->id;
            }
            $persisted = $call->results()->where('attempt', $call->attempt)->first();
            if ($persisted instanceof PersistedToolResult) {
                $results[] = ToolResult::fromArray(
                    is_array($persisted->canonical_result) ? $persisted->canonical_result : [],
                    (string) $call->provider_call_id,
                );
            }
        }

        $status = match (true) {
            $waiting !== [] => 'awaiting_approval',
            array_any($results, static fn (ToolResult $result): bool => $result->isError) || $blocked !== [] => 'failed',
            $plan->finalizationReady($orchestrator) => 'completed',
            default => 'pending',
        };

        return new TalosToolDispatchReport($status, $results, $waiting, $blocked);
    }

    /** @param array<string, mixed> $audit */
    private function denyNode(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        ASTOrchestrator $orchestrator,
        ProceduralNode $node,
        PersistedToolCall $call,
        string $errorCode,
        string $message,
        array $audit,
        ?TalosBrowserTask $browserTask = null,
        ?TalosBrowserAction $browserAction = null,
        ?TalosBrowserSession $browserSession = null,
    ): PersistedToolCall {
        $result = ToolResult::error($node->call->providerCallId, $errorCode, $message);
        $orchestrator->markRunning($node->id);
        $orchestrator->markFailed($node->id);
        $call = $this->persistPolicyDenial(
            $ownerUserId,
            $turn,
            $turnLeaseToken,
            $call,
            $result,
            $node->context->stateVersion,
            $browserTask,
            $browserAction,
            $browserSession,
        );
        $this->record($ownerUserId, $turn, $turnLeaseToken, 'tool.execution.denied', $node, [
            'provider_call_id' => $node->call->providerCallId,
            'tool_name' => $node->call->name,
            'error_code' => $errorCode,
            ...$audit,
        ]);
        $this->checkpoint($ownerUserId, $turn, $turnLeaseToken, $orchestrator);

        return $call;
    }

    private function activeBrowserTask(
        int $ownerUserId,
        TalosToolTurn $turn,
        ?TalosBrowserSession $browserSession,
    ): ?TalosBrowserTask {
        if (! $browserSession instanceof TalosBrowserSession) {
            return null;
        }

        $tasks = TalosBrowserTask::query()
            ->ownedBy($ownerUserId)
            ->where('talos_session_id', $turn->session_id)
            ->where('browser_session_id', $browserSession->id)
            ->whereNotIn('status', ['completed', 'failed', 'cancelled'])
            ->orderByDesc('requested_at')
            ->limit(2)
            ->get();
        if ($tasks->count() > 1) {
            throw new TalosToolRecoveryRequiredException(
                message: 'Multiple live Browser tasks contend for the same session.',
            );
        }

        $task = $tasks->first();

        return $task instanceof TalosBrowserTask ? $task : null;
    }

    private function persistPolicyDenial(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        PersistedToolCall $call,
        ToolResult $result,
        int $stateVersion,
        ?TalosBrowserTask $browserTask,
        ?TalosBrowserAction $browserAction,
        ?TalosBrowserSession $browserSession,
    ): PersistedToolCall {
        return DB::transaction(function () use (
            $ownerUserId,
            $turn,
            $turnLeaseToken,
            $call,
            $result,
            $stateVersion,
            $browserTask,
            $browserAction,
            $browserSession,
        ): PersistedToolCall {
            $lockedTurn = $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
            $lockedCall = PersistedToolCall::query()
                ->ownedBy($ownerUserId)
                ->whereKey($call->id)
                ->where('tool_turn_id', $lockedTurn->id)
                ->lockForUpdate()
                ->first();
            if (! $lockedCall instanceof PersistedToolCall) {
                throw new TalosToolRecoveryRequiredException;
            }

            PersistedToolResult::query()->firstOrCreate(
                ['tool_call_id' => $lockedCall->id, 'attempt' => $lockedCall->attempt],
                [
                    'tool_turn_id' => $lockedTurn->id,
                    'run_id' => $lockedTurn->run_id,
                    'user_id' => $lockedTurn->user_id,
                    'provider_call_id' => $lockedCall->provider_call_id,
                    'status' => 'failed',
                    'is_error' => true,
                    'canonical_result' => $result->toWireArray(),
                    'error_code' => $this->errorCode($result),
                    'evidence_ids' => [],
                    'state_version' => $stateVersion,
                ],
            );
            $lockedCall->forceFill([
                'status' => 'failed',
                'effect_status' => 'completed',
                'execution_token' => null,
                'execution_lease_expires_at' => null,
            ])->save();
            if ($browserTask instanceof TalosBrowserTask
                && $browserAction instanceof TalosBrowserAction
                && $browserSession instanceof TalosBrowserSession) {
                $this->browserTasks->recordResult(
                    $ownerUserId,
                    $browserTask,
                    $browserAction,
                    $lockedCall,
                    $result,
                    $browserSession,
                    false,
                );
            }

            return $lockedCall;
        }, 3);
    }

    private function enforceElapsedBudget(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
    ): void {
        [$elapsed, $limit] = DB::transaction(function () use ($ownerUserId, $turn, $turnLeaseToken): array {
            $lockedTurn = $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);

            $policy = is_array($lockedTurn->budget_policy) ? $lockedTurn->budget_policy : [];
            $limit = $policy['max_elapsed_ms'] ?? null;
            if (! is_int($limit) || $limit < 0 || $lockedTurn->started_at === null) {
                throw new InvalidArgumentException('Tool turn does not define a valid elapsed-time budget.');
            }

            $observedElapsed = max(0, (int) $lockedTurn->started_at->diffInMilliseconds(now()));
            $usage = is_array($lockedTurn->budget_usage) ? $lockedTurn->budget_usage : [];
            $elapsed = max($observedElapsed, (int) ($usage['elapsed_ms'] ?? 0));
            if ($elapsed !== (int) ($usage['elapsed_ms'] ?? 0)) {
                $usage['elapsed_ms'] = $elapsed;
                $lockedTurn->forceFill(['budget_usage' => $usage])->save();
            }

            return [$elapsed, $limit];
        }, 3);
        $turn->refresh();

        if ($elapsed >= $limit) {
            throw new TalosBudgetExceededException(
                'TALOS_TOOL_TIME_BUDGET_EXHAUSTED',
                'The procedural time budget was exhausted before the next tool execution.',
            );
        }
    }

    private function ownedLiveTurn(int $ownerUserId, string $turnId, string $turnLeaseToken): TalosToolTurn
    {
        $turn = TalosToolTurn::query()
            ->ownedBy($ownerUserId)
            ->whereKey($turnId)
            ->where('execution_lease_token', $turnLeaseToken)
            ->where('execution_lease_expires_at', '>', now())
            ->whereNotIn('status', ['completed', 'failed', 'cancelled'])
            ->first();
        if (! $turn instanceof TalosToolTurn) {
            throw new TalosToolRecoveryRequiredException(
                message: 'The procedural turn lease expired or was fenced by a successor.',
            );
        }

        return $turn;
    }

    private function lockLiveTurn(int $ownerUserId, string $turnId, string $turnLeaseToken): TalosToolTurn
    {
        $turn = TalosToolTurn::query()
            ->ownedBy($ownerUserId)
            ->whereKey($turnId)
            ->where('execution_lease_token', $turnLeaseToken)
            ->where('execution_lease_expires_at', '>', now())
            ->whereNotIn('status', ['completed', 'failed', 'cancelled'])
            ->lockForUpdate()
            ->first();
        if (! $turn instanceof TalosToolTurn) {
            throw new TalosToolRecoveryRequiredException(
                message: 'The procedural turn lease expired or was fenced by a successor.',
            );
        }

        return $turn;
    }

    /** @return list<string> */
    private function reserveExecutionBudgets(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        PersistedToolCall $call,
        ProceduralNode $node,
    ): array {
        $resources = ['calls'];
        if ($node->call->name === 'browser_navigate') {
            $resources[] = 'navigations';
        }
        if ($node->call->name === 'browser_take_screenshot') {
            $resources[] = 'screenshots';
        }
        if ($node->producesEvidence) {
            $resources[] = 'evidence_nodes';
        }

        $reserved = [];
        try {
            foreach ($resources as $resource) {
                $reservationId = 'tool-call:'.$call->id.':'.$call->attempt.':'.$resource;
                $this->budgets->reserve(
                    ownerUserId: $ownerUserId,
                    turnId: (string) $turn->id,
                    reservationId: $reservationId,
                    kind: 'tool_execution',
                    resource: $resource,
                    amount: 1,
                    toolCallId: (string) $call->id,
                    metadata: ['node_id' => $node->id, 'tool_name' => $node->call->name],
                    turnLeaseToken: $turnLeaseToken,
                );
                $reserved[] = $reservationId;
            }
        } catch (\Throwable $exception) {
            foreach (array_reverse($reserved) as $reservationId) {
                $this->budgets->release($reservationId, $ownerUserId, $turnLeaseToken);
            }
            throw $exception;
        }

        return $reserved;
    }

    private function assertBrowserOwnership(TalosToolTurn $turn, ?TalosBrowserSession $browserSession): void
    {
        if ($browserSession === null) {
            if ($turn->browser_session_id !== null) {
                throw new InvalidArgumentException('Tool turn requires its owned browser session.');
            }

            return;
        }

        if ((string) $turn->browser_session_id !== (string) $browserSession->id
            || (int) $turn->user_id !== (int) $browserSession->user_id
            || (string) $turn->session_id !== (string) $browserSession->talos_session_id) {
            throw new InvalidArgumentException('Browser session is not owned by the tool turn.');
        }
    }

    /**
     * @param  array<string, string>  $logicalCallIdsByProviderCallId
     * @param  array<string, int>  $repairAttemptsByProviderCallId
     * @return array<string, PersistedToolCall>
     */
    private function persistCalls(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        ProceduralPlan $plan,
        ASTOrchestrator $orchestrator,
        TalosProceduralGuardCheckpoint $guardCheckpoint,
        ?string $evidenceHash,
        ?string $evidenceSnapshotArtifactId,
        ?string $evidenceSnapshotId,
        array $logicalCallIdsByProviderCallId,
        array $repairAttemptsByProviderCallId,
    ): array {
        $providerCallIds = array_map(static fn (ProceduralNode $node): string => $node->call->providerCallId, $plan->nodes);
        $this->assertCallMetadata($providerCallIds, $logicalCallIdsByProviderCallId, $repairAttemptsByProviderCallId);
        foreach ($plan->nodes as $node) {
            if (! $guardCheckpoint->containsCompiledCall($node->call, $node->fingerprint)) {
                throw new InvalidArgumentException('Compiled tool call is absent from the durable loop guard checkpoint.');
            }
        }
        $encodedGuard = $guardCheckpoint->encode();
        $guardChecksum = 'sha256:'.hash('sha256', $encodedGuard);

        return DB::transaction(function () use ($ownerUserId, $turn, $turnLeaseToken, $plan, $orchestrator, $guardCheckpoint, $evidenceHash, $evidenceSnapshotArtifactId, $evidenceSnapshotId, $encodedGuard, $guardChecksum, $logicalCallIdsByProviderCallId, $repairAttemptsByProviderCallId): array {
            $lockedTurn = $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
            $nextSequence = ((int) $lockedTurn->calls()->max('sequence')) + 1;
            $persisted = [];

            foreach ($plan->nodes as $node) {
                $logicalCallId = $logicalCallIdsByProviderCallId[$node->call->providerCallId] ?? $node->call->providerCallId;
                $repairAttempt = $repairAttemptsByProviderCallId[$node->call->providerCallId] ?? 0;
                $call = $lockedTurn->calls()->where('provider_call_id', $node->call->providerCallId)->first();
                $canonicalCall = ProceduralLoopGuard::canonicalJson($node->call->toWireArray());
                $context = json_encode($node->context->toArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                $argumentsHash = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($node->call->arguments));
                $nodeEvidenceHash = $node->context->browserSessionId !== null ? $evidenceHash : null;
                $nodeEvidenceArtifactId = $node->context->browserSessionId !== null ? $evidenceSnapshotArtifactId : null;
                $nodeEvidenceSnapshotId = $node->context->browserSessionId !== null ? $evidenceSnapshotId : null;
                if ($call instanceof PersistedToolCall) {
                    if (! hash_equals((string) $call->fingerprint, $node->fingerprint)
                        || ! hash_equals((string) $call->logical_call_id, $logicalCallId)
                        || (int) $call->attempt !== $repairAttempt
                        || ! hash_equals((string) $call->arguments_sha256, $argumentsHash)
                        || ! is_string($call->canonical_call)
                        || ! hash_equals($this->canonicalStoredCall($call->canonical_call), $canonicalCall)
                        || ! is_string($call->execution_context)
                        || ! hash_equals($call->execution_context, $context)
                        || $call->evidence_hash !== $nodeEvidenceHash
                        || $call->evidence_snapshot_artifact_id !== $nodeEvidenceArtifactId
                        || $call->evidence_snapshot_id !== $nodeEvidenceSnapshotId) {
                        throw new InvalidArgumentException('Persisted tool call does not match the compiled plan.');
                    }
                    $persisted[$node->id] = $call;

                    continue;
                }

                $approval = $node->requiresApproval ? $orchestrator->getApprovalRequirement($node->id) : null;
                $redacted = $node->call->toRedactedArray();
                $call = $lockedTurn->calls()->create([
                    'run_id' => $lockedTurn->run_id,
                    'user_id' => $lockedTurn->user_id,
                    'sequence' => $nextSequence++,
                    'logical_call_id' => $logicalCallId,
                    'provider_call_id' => $node->call->providerCallId,
                    'node_id' => $node->id,
                    'tool_name' => $node->call->name,
                    'node_type' => $node->type,
                    'arguments' => is_array($redacted['arguments'] ?? null) ? $redacted['arguments'] : [],
                    'canonical_call' => $canonicalCall,
                    'execution_context' => $context,
                    'arguments_sha256' => $argumentsHash,
                    'dependencies' => $node->dependencies,
                    'fingerprint' => $node->fingerprint,
                    'state_version' => $node->context->stateVersion,
                    'evidence_hash' => $nodeEvidenceHash,
                    'evidence_snapshot_artifact_id' => $nodeEvidenceArtifactId,
                    'evidence_snapshot_id' => $nodeEvidenceSnapshotId,
                    'risk' => $node->context->risk,
                    'capability' => $node->context->capability,
                    'status' => $node->requiresApproval ? 'awaiting_approval' : 'proposed',
                    'attempt' => $repairAttempt,
                    'approval_state' => $node->requiresApproval ? 'awaiting_approval' : 'not_required',
                    'approval_payload_sha256' => $approval['plan_hash'] ?? null,
                ]);
                $persisted[$node->id] = $call;
            }

            $lockedTurn->forceFill([
                'loop_guard_state' => $encodedGuard,
                'loop_guard_state_sha256' => $guardChecksum,
                'repair_attempt' => $guardCheckpoint->maximumRepairAttempt(),
                'revision' => ((int) $lockedTurn->revision) + 1,
            ])->save();

            return $persisted;
        }, 3);
    }

    /**
     * @param  list<string>  $providerCallIds
     * @param  array<string, string>  $logicalCallIdsByProviderCallId
     * @param  array<string, int>  $repairAttemptsByProviderCallId
     */
    private function assertCallMetadata(
        array $providerCallIds,
        array $logicalCallIdsByProviderCallId,
        array $repairAttemptsByProviderCallId,
    ): void {
        foreach ([
            'logical call IDs' => $logicalCallIdsByProviderCallId,
            'repair attempts' => $repairAttemptsByProviderCallId,
        ] as $label => $metadata) {
            if ($metadata !== [] && array_keys($metadata) !== $providerCallIds) {
                throw new InvalidArgumentException('Procedural '.$label.' must exactly match plan provider calls.');
            }
        }
        foreach ($logicalCallIdsByProviderCallId as $providerCallId => $logicalCallId) {
            if (! is_string($providerCallId)
                || ! is_string($logicalCallId)
                || trim($logicalCallId) === ''
                || strlen($logicalCallId) > 256) {
                throw new InvalidArgumentException('Procedural logical call metadata is invalid.');
            }
        }
        foreach ($repairAttemptsByProviderCallId as $providerCallId => $attempt) {
            if (! is_string($providerCallId) || ! is_int($attempt) || $attempt < 0 || $attempt > 255) {
                throw new InvalidArgumentException('Procedural repair attempt metadata is invalid.');
            }
        }
    }

    private function canonicalStoredCall(string $encoded): string
    {
        return ProceduralLoopGuard::canonicalJson(ToolCall::fromJson($encoded)->toWireArray());
    }

    private function restoreCheckpoint(TalosToolTurn $turn, ASTOrchestrator $orchestrator): void
    {
        $encoded = $turn->dag_state;
        if ($encoded === null) {
            return;
        }
        if (! is_string($encoded) || ! is_string($turn->dag_state_sha256)) {
            throw new InvalidArgumentException('Tool turn DAG checkpoint is invalid.');
        }
        $hash = 'sha256:'.hash('sha256', $encoded);
        if (! hash_equals($turn->dag_state_sha256, $hash)) {
            throw new InvalidArgumentException('Tool turn DAG checkpoint integrity failed.');
        }
        $orchestrator->importState(TalosDagCheckpointCodec::decode($encoded));
    }

    /** @param array<string, PersistedToolCall> $calls */
    private function applyPersistedApprovals(array $calls, ASTOrchestrator $orchestrator): void
    {
        foreach ($calls as $nodeId => $call) {
            if ($orchestrator->getNodeStatus($nodeId) !== NodeStatus::AWAITING_APPROVAL || $call->approval_state !== 'approved') {
                continue;
            }
            if (! is_string($call->approval_id)
                || ! is_string($call->approval_payload_sha256)
                || $call->approved_at === null
                || $call->approved_by_user_id === null) {
                throw new InvalidArgumentException('Persisted tool approval is incomplete.');
            }
            $orchestrator->approveNode($nodeId, new ToolApprovalGrant(
                approvalId: $call->approval_id,
                nodeId: $nodeId,
                actorId: (string) $call->approved_by_user_id,
                capability: (string) $call->capability,
                planHash: $call->approval_payload_sha256,
                approvedAt: $call->approved_at->toIso8601String(),
            ));
        }
    }

    /** @param array<string, PersistedToolCall> $calls */
    private function restorePersistedResults(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        array $calls,
        ASTOrchestrator $orchestrator,
    ): void {
        foreach ($calls as $nodeId => $call) {
            $persisted = $call->results()->where('attempt', $call->attempt)->first();
            if (! $persisted instanceof PersistedToolResult) {
                continue;
            }

            if (! $persisted->is_error && str_starts_with((string) $call->tool_name, 'browser_')) {
                try {
                    $this->browserTasks->resumeEvidenceForCall($ownerUserId, $call->refresh());
                } catch (TalosBrowserEvidenceException $exception) {
                    throw new TalosToolRecoveryRequiredException($exception->faultCode, $exception->getMessage());
                }
            }

            $status = $orchestrator->getNodeStatus($nodeId);
            if (! in_array($status, [NodeStatus::SUCCESS, NodeStatus::FAILED], true)) {
                $orchestrator->markRunning($nodeId);
                if ($persisted->is_error) {
                    $orchestrator->markFailed($nodeId);
                } else {
                    $orchestrator->markSuccess($nodeId);
                }
            }

            DB::transaction(function () use ($ownerUserId, $turn, $turnLeaseToken, $call, $persisted): void {
                $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
                $lockedCall = PersistedToolCall::query()
                    ->ownedBy($ownerUserId)
                    ->whereKey($call->id)
                    ->where('tool_turn_id', $turn->id)
                    ->lockForUpdate()
                    ->first();
                if (! $lockedCall instanceof PersistedToolCall) {
                    throw new TalosToolRecoveryRequiredException;
                }
                $lockedCall->forceFill([
                    'status' => $persisted->is_error ? 'failed' : 'succeeded',
                    'effect_status' => 'completed',
                    'execution_token' => null,
                    'execution_lease_expires_at' => null,
                ])->save();
            }, 3);
            $this->settlePersistedResultReservations($call->refresh(), $turnLeaseToken);
        }
    }

    private function settlePersistedResultReservations(
        PersistedToolCall $call,
        string $turnLeaseToken,
    ): void {
        $prefix = 'tool-call:'.$call->id.':'.$call->attempt.':';
        $reservations = $call->turn
            ->budgetReservations()
            ->where('user_id', $call->user_id)
            ->where('tool_call_id', $call->id)
            ->where('reservation_id', 'like', $prefix.'%')
            ->where('status', 'reserved')
            ->get();

        foreach ($reservations as $reservation) {
            $this->budgets->settle(
                (string) $reservation->reservation_id,
                (int) $call->user_id,
                (int) $reservation->reserved_amount,
                $turnLeaseToken,
            );
        }
    }

    private function persistResultAndCompleteCall(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        PersistedToolCall $call,
        string $effectToken,
        ToolResult $result,
        int $stateVersion,
        ?TalosBrowserTask $browserTask = null,
        ?TalosBrowserAction $browserAction = null,
        ?TalosBrowserSession $browserSession = null,
    ): PersistedToolCall {
        $evidenceIds = array_values(array_filter(array_map(
            static fn (array $evidence): mixed => $evidence['artifact_id'] ?? null,
            $result->evidence,
        ), 'is_string'));

        return DB::transaction(function () use ($ownerUserId, $turn, $turnLeaseToken, $call, $effectToken, $result, $stateVersion, $evidenceIds, $browserTask, $browserAction, $browserSession): PersistedToolCall {
            $lockedTurn = $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
            $lockedCall = PersistedToolCall::query()
                ->ownedBy($ownerUserId)
                ->whereKey($call->id)
                ->where('tool_turn_id', $lockedTurn->id)
                ->where('execution_token', $effectToken)
                ->where('effect_status', 'in_flight')
                ->where('execution_lease_expires_at', '>', now())
                ->lockForUpdate()
                ->first();
            if (! $lockedCall instanceof PersistedToolCall) {
                throw new TalosToolRecoveryRequiredException(
                    message: 'Tool result was fenced before its physical effect could be committed.',
                );
            }

            PersistedToolResult::query()->updateOrCreate(
                ['tool_call_id' => $lockedCall->id, 'attempt' => $lockedCall->attempt],
                [
                    'tool_turn_id' => $lockedTurn->id,
                    'run_id' => $lockedTurn->run_id,
                    'user_id' => $lockedTurn->user_id,
                    'provider_call_id' => $lockedCall->provider_call_id,
                    'status' => $result->isError ? 'failed' : 'succeeded',
                    'is_error' => $result->isError,
                    'canonical_result' => $result->toWireArray(),
                    'error_code' => $this->errorCode($result),
                    'evidence_ids' => $evidenceIds,
                    'state_version' => $stateVersion,
                ],
            );
            $lockedCall->forceFill([
                'status' => $result->isError ? 'failed' : 'succeeded',
                'effect_status' => 'completed',
                'execution_token' => null,
                'execution_lease_expires_at' => null,
            ])->save();
            if ($browserTask instanceof TalosBrowserTask
                && $browserAction instanceof TalosBrowserAction
                && $browserSession instanceof TalosBrowserSession) {
                $this->browserTasks->recordResult(
                    $ownerUserId,
                    $browserTask,
                    $browserAction,
                    $lockedCall,
                    $result,
                    $browserSession,
                );
            }

            return $lockedCall;
        }, 3);
    }

    /** @param array<string, PersistedToolCall> $calls */
    private function synchronizeCallStates(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        array $calls,
        ASTOrchestrator $orchestrator,
    ): void {
        DB::transaction(function () use ($ownerUserId, $turn, $turnLeaseToken, $calls, $orchestrator): void {
            $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
            foreach ($calls as $nodeId => $call) {
                $lockedCall = PersistedToolCall::query()
                    ->ownedBy($ownerUserId)
                    ->whereKey($call->id)
                    ->where('tool_turn_id', $turn->id)
                    ->lockForUpdate()
                    ->first();
                if (! $lockedCall instanceof PersistedToolCall) {
                    throw new TalosToolRecoveryRequiredException;
                }
                if ($lockedCall->results()->where('attempt', $lockedCall->attempt)->exists()) {
                    continue;
                }
                $status = match ($orchestrator->getNodeStatus($nodeId)) {
                    NodeStatus::AWAITING_APPROVAL => 'awaiting_approval',
                    NodeStatus::BLOCKED_BY_DEPENDENCY => 'blocked_by_dependency',
                    NodeStatus::FAILED => 'failed',
                    default => 'pending',
                };
                $lockedCall->forceFill(['status' => $status])->save();
            }
        }, 3);
    }

    private function checkpoint(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        ASTOrchestrator $orchestrator,
    ): void {
        $encoded = TalosDagCheckpointCodec::encode($orchestrator->exportState());
        DB::transaction(function () use ($ownerUserId, $turn, $turnLeaseToken, $encoded): void {
            $lockedTurn = $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
            $lockedTurn->forceFill([
                'dag_state' => $encoded,
                'dag_state_sha256' => 'sha256:'.hash('sha256', $encoded),
                'revision' => ((int) $lockedTurn->revision) + 1,
            ])->save();
        }, 3);
        $turn->refresh();
    }

    /** @param array<string, mixed> $payload */
    private function record(
        int $ownerUserId,
        TalosToolTurn $turn,
        string $turnLeaseToken,
        string $eventType,
        ProceduralNode $node,
        array $payload,
    ): void {
        DB::transaction(function () use ($ownerUserId, $turn, $turnLeaseToken, $eventType, $node, $payload): void {
            $lockedTurn = $this->lockLiveTurn($ownerUserId, (string) $turn->id, $turnLeaseToken);
            $this->events->record(
                ['run_id' => (string) $lockedTurn->run_id, 'user_id' => (int) $lockedTurn->user_id],
                ['event_type' => $eventType, 'node_id' => $node->id, 'payload' => $payload],
            );
        }, 3);
    }

    private function errorCode(ToolResult $result): ?string
    {
        $code = $result->structuredContent['code'] ?? null;

        return $result->isError && is_string($code) ? $code : null;
    }
}
