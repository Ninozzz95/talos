<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosRun;
use App\Models\TalosToolCall;
use App\Models\TalosToolResult;
use App\Models\TalosToolTurn;
use App\Services\Runs\TalosRunEventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Kadmos\Provider\ProviderFailure;
use Kadmos\Tool\ToolApprovalAuthority;
use Kadmos\Tool\ToolApprovalGrant;
use Kadmos\Tool\ToolResult;
use Kadmos\Tool\ProviderTurnResponse;

final class TalosApprovalService implements ToolApprovalAuthority
{
    public function __construct(private readonly TalosRunEventRecorder $events) {}

    public function approve(string $callId, int $actorUserId, string $planHash): ToolApprovalGrant
    {
        $identity = $this->ownedCallIdentity($callId, $actorUserId);

        return DB::transaction(function () use ($identity, $callId, $actorUserId, $planHash): ToolApprovalGrant {
            $turn = $this->lockTurn($identity, $actorUserId);
            $call = TalosToolCall::query()
                ->ownedBy($actorUserId)
                ->where('tool_turn_id', $turn->id)
                ->where('run_id', $turn->run_id)
                ->lockForUpdate()
                ->findOrFail($callId);

            if ($this->isSameApproval($call, $actorUserId, $planHash)) {
                return $this->grantFromCall($call);
            }
            $this->assertNoLiveTurnLease($turn);
            if ($call->approval_state !== 'awaiting_approval'
                || $call->status !== 'awaiting_approval'
                || $turn->status !== 'awaiting_approval'
                || ! is_string($call->approval_payload_sha256)
                || ! hash_equals($call->approval_payload_sha256, $planHash)
                || ! is_string($call->node_id)
                || $call->node_id === '') {
                throw new InvalidArgumentException('Tool call is not eligible for this exact approval.');
            }

            $approvalId = (string) Str::uuid();
            $approvedAt = now()->startOfSecond();
            $call->forceFill([
                'approval_id' => $approvalId,
                'approval_state' => 'approved',
                'approved_by_user_id' => $actorUserId,
                'approved_at' => $approvedAt,
                'rejected_at' => null,
            ])->save();

            $this->events->record(
                ['run_id' => (string) $turn->run_id, 'user_id' => $actorUserId],
                [
                    'event_type' => 'tool.approval.approved',
                    'node_id' => $call->node_id,
                    'severity' => 'info',
                    'payload' => [
                        'tool_call_id' => (string) $call->id,
                        'provider_call_id' => (string) $call->provider_call_id,
                        'plan_hash' => (string) $call->approval_payload_sha256,
                        'actor_user_id' => $actorUserId,
                    ],
                ],
            );

            return $this->grantFromCall($call->refresh());
        }, 3);
    }

    public function reject(string $callId, int $actorUserId, string $planHash): void
    {
        $identity = $this->ownedCallIdentity($callId, $actorUserId);

        DB::transaction(function () use ($identity, $callId, $actorUserId, $planHash): void {
            $turn = $this->lockTurn($identity, $actorUserId);
            $call = TalosToolCall::query()
                ->ownedBy($actorUserId)
                ->where('tool_turn_id', $turn->id)
                ->where('run_id', $turn->run_id)
                ->lockForUpdate()
                ->findOrFail($callId);

            if ($this->isSameRejection($call, $actorUserId, $planHash)) {
                return;
            }
            $this->assertNoLiveTurnLease($turn);
            if ($call->approval_state !== 'awaiting_approval'
                || $call->status !== 'awaiting_approval'
                || $turn->status !== 'awaiting_approval'
                || ! is_string($call->approval_payload_sha256)
                || ! hash_equals($call->approval_payload_sha256, $planHash)) {
                throw new InvalidArgumentException('Tool call is not eligible for this exact rejection.');
            }

            $call->forceFill([
                'approval_state' => 'rejected',
                'status' => 'cancelled',
                'approval_id' => null,
                'approved_by_user_id' => $actorUserId,
                'approved_at' => null,
                'rejected_at' => now()->startOfSecond(),
            ])->save();

            $terminalAt = now()->startOfSecond();
            $run = TalosRun::query()
                ->where('user_id', $actorUserId)
                ->where('session_id', $turn->session_id)
                ->lockForUpdate()
                ->findOrFail($call->run_id);
            $toolResult = ToolResult::error(
                (string) $call->provider_call_id,
                'TALOS_TOOL_APPROVAL_REJECTED',
                'The approval-gated tool call was rejected by the operator.',
            );
            TalosToolResult::query()->firstOrCreate(
                ['tool_call_id' => $call->id, 'attempt' => $call->attempt],
                [
                    'tool_turn_id' => $turn->id,
                    'run_id' => $run->id,
                    'user_id' => $actorUserId,
                    'provider_call_id' => $call->provider_call_id,
                    'status' => 'failed',
                    'is_error' => true,
                    'canonical_result' => $toolResult->toWireArray(),
                    'error_code' => 'TALOS_TOOL_APPROVAL_REJECTED',
                    'evidence_ids' => [],
                    'state_version' => $call->state_version,
                ],
            );
            $outcome = ProviderTurnResponse::failure(new ProviderFailure(
                code: 'TALOS_TOOL_APPROVAL_REJECTED',
                message: 'The approval-gated tool call was rejected.',
                retryable: false,
            ));
            $encodedOutcome = TalosProviderOutcomeCodec::encode($outcome);

            $turn->forceFill([
                'status' => 'failed',
                'pending_tool_call_ids' => [],
                'provider_state' => null,
                'provider_state_sha256' => null,
                'provider_outcome' => $encodedOutcome,
                'provider_outcome_sha256' => 'sha256:'.hash('sha256', $encodedOutcome),
                'continuation_kind' => null,
                'completed_at' => $terminalAt,
            ])->save();
            $run->forceFill([
                'status' => 'failed',
                'completed_at' => $terminalAt,
            ])->save();

            $this->events->record(
                ['run_id' => (string) $run->id, 'user_id' => $actorUserId],
                [
                    'event_type' => 'tool.approval.rejected',
                    'node_id' => is_string($call->node_id) ? $call->node_id : null,
                    'severity' => 'warning',
                    'payload' => [
                        'tool_call_id' => (string) $call->id,
                        'provider_call_id' => (string) $call->provider_call_id,
                        'code' => 'TALOS_TOOL_APPROVAL_REJECTED',
                        'plan_hash' => (string) $call->approval_payload_sha256,
                        'actor_user_id' => $actorUserId,
                        'terminal_status' => 'failed',
                    ],
                ],
            );
        }, 3);
    }

    private function ownedCallIdentity(string $callId, int $actorUserId): TalosToolCall
    {
        return TalosToolCall::query()
            ->ownedBy($actorUserId)
            ->select(['id', 'tool_turn_id', 'run_id'])
            ->findOrFail($callId);
    }

    private function lockTurn(TalosToolCall $identity, int $actorUserId): TalosToolTurn
    {
        return TalosToolTurn::query()
            ->ownedBy($actorUserId)
            ->where('run_id', $identity->run_id)
            ->lockForUpdate()
            ->findOrFail($identity->tool_turn_id);
    }

    private function assertNoLiveTurnLease(TalosToolTurn $turn): void
    {
        if (is_string($turn->execution_lease_token)
            && $turn->execution_lease_token !== ''
            && $turn->execution_lease_expires_at?->isFuture()) {
            throw new InvalidArgumentException('Tool approval is fenced by an active turn execution lease.');
        }
    }

    private function isSameApproval(TalosToolCall $call, int $actorUserId, string $planHash): bool
    {
        return in_array($call->approval_state, ['approved', 'claimed'], true)
            && (int) $call->approved_by_user_id === $actorUserId
            && is_string($call->approval_payload_sha256)
            && hash_equals($call->approval_payload_sha256, $planHash)
            && is_string($call->approval_id)
            && $call->approval_id !== ''
            && $call->approved_at !== null;
    }

    private function isSameRejection(TalosToolCall $call, int $actorUserId, string $planHash): bool
    {
        return $call->approval_state === 'rejected'
            && $call->status === 'cancelled'
            && (int) $call->approved_by_user_id === $actorUserId
            && is_string($call->approval_payload_sha256)
            && hash_equals($call->approval_payload_sha256, $planHash)
            && $call->rejected_at !== null;
    }

    private function grantFromCall(TalosToolCall $call): ToolApprovalGrant
    {
        if (! is_string($call->approval_id)
            || ! is_string($call->node_id)
            || ! is_string($call->approval_payload_sha256)
            || $call->approved_by_user_id === null
            || $call->approved_at === null) {
            throw new InvalidArgumentException('Persisted tool approval is incomplete.');
        }

        return new ToolApprovalGrant(
            approvalId: $call->approval_id,
            nodeId: $call->node_id,
            actorId: (string) $call->approved_by_user_id,
            capability: (string) $call->capability,
            planHash: $call->approval_payload_sha256,
            approvedAt: $call->approved_at->toIso8601String(),
        );
    }

    public function authorizes(ToolApprovalGrant $grant): bool
    {
        if (! ctype_digit($grant->actorId)) {
            return false;
        }

        $call = TalosToolCall::query()
            ->ownedBy((int) $grant->actorId)
            ->where('node_id', $grant->nodeId)
            ->where('approval_id', $grant->approvalId)
            ->whereIn('approval_state', ['approved', 'claimed'])
            ->first();

        return $call !== null
            && is_string($call->approval_payload_sha256)
            && hash_equals($call->approval_payload_sha256, $grant->planHash)
            && hash_equals((string) $call->capability, $grant->capability)
            && (string) $call->approved_by_user_id === $grant->actorId
            && $call->approved_at?->toIso8601String() === $grant->approvedAt;
    }

    public function claimForExecution(ToolApprovalGrant $grant): bool
    {
        if (! $this->authorizes($grant)) {
            return false;
        }

        return TalosToolCall::query()
            ->where('approval_id', $grant->approvalId)
            ->where('node_id', $grant->nodeId)
            ->where('approved_by_user_id', (int) $grant->actorId)
            ->where('capability', $grant->capability)
            ->where('approval_payload_sha256', $grant->planHash)
            ->where('approval_state', 'approved')
            ->update([
                'approval_state' => 'claimed',
                'status' => 'running',
                'updated_at' => now(),
            ]) === 1;
    }
}
