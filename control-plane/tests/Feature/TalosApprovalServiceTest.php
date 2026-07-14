<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosApprovalService;
use App\Services\Talos\Agent\TalosProviderOutcomeCodec;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\TestCase;

final class TalosApprovalServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_owned_exact_plan_approval_can_be_claimed_only_once(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        $service = app(TalosApprovalService::class);

        $grant = $service->approve($call->id, $user->id, (string) $call->approval_payload_sha256);
        $retriedGrant = $service->approve($call->id, $user->id, (string) $call->approval_payload_sha256);

        $this->assertSame($call->node_id, $grant->nodeId);
        $this->assertSame((string) $user->id, $grant->actorId);
        $this->assertSame($grant->approvalId, $retriedGrant->approvalId);
        $this->assertSame($grant->approvedAt, $retriedGrant->approvedAt);
        $this->assertTrue($service->authorizes($grant));
        $this->assertTrue($service->claimForExecution($grant));
        $this->assertFalse($service->claimForExecution($grant));
        $this->assertDatabaseHas('talos_tool_calls', [
            'id' => $call->id,
            'approval_id' => $grant->approvalId,
            'approval_state' => 'claimed',
            'status' => 'running',
            'approved_by_user_id' => $user->id,
        ]);
    }

    public function test_another_user_cannot_approve_or_inspect_the_call(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $call = $this->approvalCall($owner);

        $this->expectException(ModelNotFoundException::class);
        app(TalosApprovalService::class)->approve($call->id, $other->id, (string) $call->approval_payload_sha256);
    }

    public function test_another_user_cannot_reject_the_call(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $call = $this->approvalCall($owner);

        $this->expectException(ModelNotFoundException::class);
        app(TalosApprovalService::class)->reject($call->id, $other->id, (string) $call->approval_payload_sha256);
    }

    public function test_rejection_requires_the_exact_plan_hash(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);

        $this->expectException(InvalidArgumentException::class);
        app(TalosApprovalService::class)->reject($call->id, $user->id, 'sha256:'.hash('sha256', 'wrong-plan'));
    }

    public function test_payload_mutation_invalidates_an_already_issued_grant(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        $service = app(TalosApprovalService::class);
        $grant = $service->approve($call->id, $user->id, (string) $call->approval_payload_sha256);

        $call->forceFill([
            'approval_payload_sha256' => 'sha256:'.hash('sha256', 'mutated-plan'),
            'approval_state' => 'awaiting_approval',
            'approval_id' => null,
            'approved_by_user_id' => null,
            'approved_at' => null,
        ])->save();

        $this->assertFalse($service->authorizes($grant));
        $this->assertFalse($service->claimForExecution($grant));
    }

    public function test_rejected_call_cannot_be_approved_without_a_new_attempt(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        $service = app(TalosApprovalService::class);

        $service->reject($call->id, $user->id, (string) $call->approval_payload_sha256);

        $this->assertDatabaseHas('talos_tool_calls', [
            'id' => $call->id,
            'approval_state' => 'rejected',
            'status' => 'cancelled',
        ]);
        $this->expectException(InvalidArgumentException::class);
        $service->approve($call->id, $user->id, (string) $call->approval_payload_sha256);
    }

    public function test_rejecting_the_same_exact_call_twice_is_idempotent_and_records_one_event(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        $service = app(TalosApprovalService::class);

        $service->reject($call->id, $user->id, (string) $call->approval_payload_sha256);
        $service->reject($call->id, $user->id, (string) $call->approval_payload_sha256);

        $this->assertSame('rejected', $call->refresh()->approval_state);
        $this->assertSame(1, TalosRunEvent::query()
            ->where('run_id', $call->run_id)
            ->where('event_type', 'tool.approval.rejected')
            ->count());
        $this->assertSame(1, $call->results()->where('error_code', 'TALOS_TOOL_APPROVAL_REJECTED')->count());
    }

    public function test_an_approved_call_cannot_be_rejected_by_an_opposite_retry(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        $service = app(TalosApprovalService::class);
        $service->approve($call->id, $user->id, (string) $call->approval_payload_sha256);

        $this->expectException(InvalidArgumentException::class);
        $service->reject($call->id, $user->id, (string) $call->approval_payload_sha256);
    }

    public function test_a_live_turn_lease_fences_an_approval_transition(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        TalosToolTurn::query()->whereKey($call->tool_turn_id)->update([
            'execution_lease_token' => (string) \Illuminate\Support\Str::uuid(),
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'concurrent_resume',
        ]);

        $this->expectException(InvalidArgumentException::class);
        app(TalosApprovalService::class)->approve($call->id, $user->id, (string) $call->approval_payload_sha256);
    }

    public function test_rejection_api_remains_available_without_a_model_profile_or_browser_session(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        $this->actingAs($user);

        $this->postJson("/api/talos/agent-turns/{$call->tool_turn_id}/approvals/{$call->id}", [
            'decision' => 'reject',
            'plan_hash' => $call->approval_payload_sha256,
        ])->assertOk()
            ->assertJsonPath('approval_decision.decision', 'reject')
            ->assertJsonPath('agent_turn.failure_code', 'TALOS_TOOL_APPROVAL_REJECTED');

        $this->assertSame('rejected', $call->refresh()->approval_state);
    }

    public function test_rejecting_a_call_terminalizes_its_turn_and_run_with_audited_state(): void
    {
        $user = User::factory()->create();
        $call = $this->approvalCall($user);
        $service = app(TalosApprovalService::class);

        $service->reject($call->id, $user->id, (string) $call->approval_payload_sha256);

        $turn = TalosToolTurn::query()->findOrFail($call->tool_turn_id);
        $run = TalosRun::query()->findOrFail($call->run_id);

        $this->assertSame('failed', $turn->status);
        $this->assertNotNull($turn->completed_at);
        $this->assertSame([], $turn->pending_tool_call_ids);
        $this->assertNull($turn->provider_state);
        $outcome = TalosProviderOutcomeCodec::decode((string) $turn->provider_outcome);
        $this->assertSame('failure', $outcome['kind'] ?? null);
        $this->assertSame('TALOS_TOOL_APPROVAL_REJECTED', $outcome['failure']['code'] ?? null);
        $this->assertFalse($outcome['failure']['retryable'] ?? true);
        $this->assertSame('failed', $run->status);
        $this->assertNotNull($run->completed_at);

        /** @var TalosRunEvent $event */
        $event = $run->events()->where('event_type', 'tool.approval.rejected')->firstOrFail();
        $this->assertSame('warning', $event->severity);
        $this->assertSame($call->id, $event->payload['tool_call_id'] ?? null);
        $this->assertSame('TALOS_TOOL_APPROVAL_REJECTED', $event->payload['code'] ?? null);
    }

    private function approvalCall(User $user): TalosToolCall
    {
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Approval service',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Click submit.'),
            'prompt' => 'Click submit.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'awaiting_approval',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'openai_chat_v1',
            'pending_tool_call_ids' => ['provider-call-click'],
            'budget_policy' => ['max_calls' => 8],
            'budget_usage' => [],
            'started_at' => now(),
        ]);
        $planHash = 'sha256:'.hash('sha256', 'exact-click-plan');

        return TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-click',
            'provider_call_id' => 'provider-call-click',
            'node_id' => 'node-click',
            'tool_name' => 'browser_click',
            'node_type' => 'TOOL_BROWSER_CLICK',
            'arguments' => ['target' => 'r7'],
            'arguments_sha256' => 'sha256:'.hash('sha256', '{"target":"r7"}'),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'click-fingerprint'),
            'risk' => 'high',
            'capability' => 'browser.write',
            'status' => 'awaiting_approval',
            'attempt' => 0,
            'approval_state' => 'awaiting_approval',
            'approval_payload_sha256' => $planHash,
        ]);
    }
}
