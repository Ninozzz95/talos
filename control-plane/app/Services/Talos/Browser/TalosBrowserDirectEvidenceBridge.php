<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosRun;
use App\Models\TalosToolCall;
use App\Models\TalosToolResult as PersistedToolResult;
use App\Models\TalosToolTurn;
use Illuminate\Support\Facades\DB;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ToolResult;
use Ramsey\Uuid\Uuid;

final readonly class TalosBrowserDirectEvidenceBridge
{
    public function __construct(
        private TalosBrowserTaskRuntime $tasks,
        private TalosBrowserRunArtifactCorrelator $runArtifacts,
        private TalosBrowserEvidenceCommitService $commits,
        private TalosBrowserEvidenceOutbox $outbox,
    ) {}

    /**
     * @param array<string, mixed> $rawCommand
     * @param array<string, mixed> $commandResult
     */
    public function commit(
        int $ownerUserId,
        TalosRun $run,
        TalosBrowserSession $browserSession,
        array $rawCommand,
        array $commandResult,
    ): TalosBrowserEvidenceCommitOutcome {
        $command = TalosBrowserCommand::fromArray($rawCommand);
        if ($command->operation !== 'screenshot'
            || (int) $run->user_id !== $ownerUserId
            || (string) $run->session_id !== (string) $browserSession->talos_session_id
            || (int) $browserSession->user_id !== $ownerUserId
            || $command->runId !== (string) $run->id
            || $command->browserSessionId !== (string) $browserSession->id) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Direct Browser evidence is outside its owned screenshot command scope.');
        }
        $activity = is_array($commandResult['activity'] ?? null) ? $commandResult['activity'] : [];
        $artifactIds = $activity['artifact_ids'] ?? null;
        if (! is_array($artifactIds)
            || ! array_is_list($artifactIds)
            || $artifactIds === []
            || array_filter($artifactIds, static fn (mixed $id): bool => ! is_string($id) || ! Uuid::isValid($id)) !== []) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Direct Browser screenshot did not return canonical artifact identities.');
        }
        $artifactIds = array_values(array_unique($artifactIds));
        $artifacts = TalosBrowserArtifact::query()
            ->whereIn('id', $artifactIds)
            ->where('user_id', $ownerUserId)
            ->where('browser_session_id', $browserSession->id)
            ->get()
            ->keyBy('id');
        if ($artifacts->count() !== count($artifactIds)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'Direct Browser screenshot evidence is missing from its owned scope.');
        }

        $task = $this->tasks->begin($ownerUserId, $run, $browserSession);
        $turnId = (string) Uuid::uuid5(Uuid::NAMESPACE_URL, 'talos.browser.direct.turn.v1:'.$ownerUserId.':'.$run->id);
        $callId = (string) Uuid::uuid5(Uuid::NAMESPACE_URL, 'talos.browser.direct.call.v1:'.$turnId.':'.$command->commandId);
        $actionId = (string) Uuid::uuid5(Uuid::NAMESPACE_URL, 'talos.browser.direct.action.v1:'.$task->id.':'.$command->idempotencyKey);
        $providerCallId = $command->commandId;
        $toolName = 'browser_take_screenshot';
        $evidence = [];
        foreach ($artifactIds as $artifactId) {
            $artifact = $artifacts->get($artifactId);
            if (! $artifact instanceof TalosBrowserArtifact
                || $artifact->type !== 'screenshot'
                || $artifact->mime !== 'image/png'
                || (string) $artifact->trust_boundary !== 'untrusted_browser_content'
                || ! is_string($artifact->sha256)) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Direct Browser screenshot artifact metadata is invalid.');
            }
            $evidence[] = [
                'artifact_id' => (string) $artifact->id,
                'kind' => 'screenshot',
                'sha256' => 'sha256:'.$artifact->sha256,
                'trusted_boundary' => 'untrusted_browser_content',
            ];
        }
        $structured = [
            'tool' => $toolName,
            'activity' => $activity,
            'observation' => is_array($commandResult['observation'] ?? null) ? $commandResult['observation'] : null,
            'used_browser_context' => is_array($commandResult['used_browser_context'] ?? null) ? $commandResult['used_browser_context'] : null,
            'evidence_bytes' => is_int($commandResult['evidence_bytes'] ?? null) ? $commandResult['evidence_bytes'] : 0,
            'evidence_ids' => $artifactIds,
        ];
        $encoded = ProceduralLoopGuard::canonicalJson($structured);
        $result = new ToolResult(
            toolUseId: $providerCallId,
            isError: false,
            content: [['type' => 'text', 'text' => $encoded]],
            structuredContent: $structured,
            evidence: $evidence,
        );
        $resultSha256 = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($result->toWireArray()));

        [$turn, $call, $action] = DB::transaction(function () use (
            $ownerUserId,
            $run,
            $browserSession,
            $task,
            $command,
            $result,
            $resultSha256,
            $artifactIds,
            $artifacts,
            $turnId,
            $callId,
            $actionId,
            $providerCallId,
            $toolName,
        ): array {
            $turn = TalosToolTurn::query()->where('run_id', $run->id)->lockForUpdate()->first();
            if (! $turn instanceof TalosToolTurn) {
                $turn = new TalosToolTurn;
                $turn->forceFill([
                    'id' => $turnId,
                    'user_id' => $ownerUserId,
                    'session_id' => $run->session_id,
                    'browser_session_id' => $browserSession->id,
                    'run_id' => $run->id,
                    'model_profile_id' => $run->model_profile_id,
                    'status' => 'finalizing',
                    'provider' => 'talos',
                    'model' => 'deterministic-browser-direct',
                    'adapter_version' => 'talos_browser_direct_v1',
                    'pending_tool_call_ids' => [],
                    'budget_policy' => [],
                    'budget_usage' => [],
                    'revision' => 0,
                    'started_at' => $run->started_at ?? now(),
                ])->save();
            }
            if ((string) $turn->id !== $turnId
                || (int) $turn->user_id !== $ownerUserId
                || (string) $turn->session_id !== (string) $run->session_id
                || (string) $turn->browser_session_id !== (string) $browserSession->id
                || (string) $turn->adapter_version !== 'talos_browser_direct_v1') {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Direct Browser tool turn conflicts with an existing procedural turn.');
            }

            $call = TalosToolCall::query()->whereKey($callId)->lockForUpdate()->first();
            if (! $call instanceof TalosToolCall) {
                $call = new TalosToolCall;
                $call->forceFill([
                    'id' => $callId,
                    'tool_turn_id' => $turn->id,
                    'run_id' => $run->id,
                    'user_id' => $ownerUserId,
                    'sequence' => 1,
                    'logical_call_id' => $command->commandId,
                    'provider_call_id' => $providerCallId,
                    'node_id' => $command->nodeId,
                    'tool_name' => $toolName,
                    'node_type' => 'TOOL_BROWSER_SCREENSHOT',
                    'arguments' => $command->arguments,
                    'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($command->arguments)),
                    'dependencies' => [],
                    'fingerprint' => $command->idempotencyKey,
                    'state_version' => (int) $browserSession->worker_state_version,
                    'risk' => 'low',
                    'capability' => 'browser.read',
                    'status' => 'succeeded',
                    'attempt' => 0,
                    'effect_key' => $command->idempotencyKey,
                    'effect_status' => 'completed',
                    'approval_state' => 'not_required',
                ])->save();
            }
            if ((string) $call->tool_turn_id !== (string) $turn->id
                || (string) $call->provider_call_id !== $providerCallId
                || (string) $call->effect_key !== $command->idempotencyKey) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Direct Browser tool call conflicts with its deterministic identity.');
            }

            $action = TalosBrowserAction::query()->whereKey($actionId)->lockForUpdate()->first();
            if (! $action instanceof TalosBrowserAction) {
                $action = new TalosBrowserAction;
                $action->forceFill([
                    'id' => $actionId,
                    'schema_version' => 'talos.browser.action.v1',
                    'task_id' => $task->id,
                    'user_id' => $ownerUserId,
                    'talos_session_id' => $run->session_id,
                    'intent_id' => $call->logical_call_id,
                    'sequence' => 1,
                    'kind' => 'screenshot',
                    'arguments' => $command->arguments,
                    'expected_state_version' => (int) $browserSession->worker_state_version,
                    'risk' => 'read',
                    'idempotency_key' => $command->idempotencyKey,
                    'preconditions' => [],
                    'status' => 'committed',
                    'result_sha256' => $resultSha256,
                    'requested_at' => now(),
                    'approved_at' => now(),
                    'started_at' => now(),
                    'committed_at' => now(),
                ])->save();
            }
            if ((string) $action->task_id !== (string) $task->id
                || (string) $action->intent_id !== (string) $call->logical_call_id
                || (string) $action->idempotency_key !== $command->idempotencyKey
                || ! is_string($action->result_sha256)
                || ! hash_equals($action->result_sha256, $resultSha256)) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_COMMIT_CONFLICT', 'Direct Browser action conflicts with its canonical result.');
            }

            foreach ($artifactIds as $artifactId) {
                $this->runArtifacts->correlate($turn, $browserSession, $artifacts->get($artifactId), $providerCallId);
            }

            $persistedResult = PersistedToolResult::query()
                ->where('tool_call_id', $call->id)
                ->where('attempt', 0)
                ->lockForUpdate()
                ->first();
            if (! $persistedResult instanceof PersistedToolResult) {
                PersistedToolResult::query()->create([
                    'tool_call_id' => $call->id,
                    'tool_turn_id' => $turn->id,
                    'run_id' => $run->id,
                    'user_id' => $ownerUserId,
                    'provider_call_id' => $providerCallId,
                    'attempt' => 0,
                    'status' => 'succeeded',
                    'is_error' => false,
                    'canonical_result' => $result->toWireArray(),
                    'evidence_ids' => $artifactIds,
                    'state_version' => (int) $browserSession->worker_state_version,
                ]);
            } elseif (ProceduralLoopGuard::canonicalJson((array) $persistedResult->canonical_result)
                !== ProceduralLoopGuard::canonicalJson($result->toWireArray())) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_COMMIT_CONFLICT', 'Direct Browser result conflicts with its persisted replay.');
            }

            return [$turn->refresh(), $call->refresh(), $action->refresh()];
        }, 3);

        $bundle = $this->commits->commit(new TalosBrowserEvidenceCommitRequest(
            task: $task,
            action: $action,
            call: $call,
            result: $result,
            browserSession: $browserSession->refresh(),
            resultSha256: $resultSha256,
        ));
        $outcome = $this->outbox->resume((string) $bundle->id);
        $turn->forceFill([
            'status' => 'completed',
            'pending_tool_call_ids' => [],
            'completed_at' => now(),
            'revision' => ((int) $turn->revision) + 1,
        ])->save();
        $this->tasks->settle($ownerUserId, $run, BrowserTaskStatus::Completed);

        return $outcome;
    }

    private function fault(string $code, string $message): TalosBrowserEvidenceException
    {
        return new TalosBrowserEvidenceException($code, $message);
    }
}
