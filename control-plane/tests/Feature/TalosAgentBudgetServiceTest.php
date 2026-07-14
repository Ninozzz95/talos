<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolBudgetReservation;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosAgentBudgetService;
use App\Services\Talos\Agent\TalosExecutionClaimService;
use App\Services\Talos\Agent\TalosToolRecoveryRequiredException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\TestCase;

final class TalosAgentBudgetServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_stale_turn_lease_cannot_release_or_settle_a_successor_reservation(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 1]);
        $service = app(TalosAgentBudgetService::class);
        $claims = app(TalosExecutionClaimService::class);
        $staleToken = $claims->claimTurn($owner->id, $turn->id, 'tool_dispatch');
        $this->assertNotNull($staleToken);
        $service->reserve(
            $owner->id,
            $turn->id,
            'reservation-fenced',
            'action',
            'calls',
            1,
            turnLeaseToken: $staleToken,
        );
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();

        foreach (['release', 'settle'] as $operation) {
            try {
                $operation === 'release'
                    ? $service->release('reservation-fenced', $owner->id, $staleToken)
                    : $service->settle('reservation-fenced', $owner->id, 1, $staleToken);
                $this->fail("A stale turn lease completed budget operation {$operation}.");
            } catch (TalosToolRecoveryRequiredException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertSame('reserved', TalosToolBudgetReservation::query()
            ->where('reservation_id', 'reservation-fenced')
            ->value('status'));
    }

    public function test_reserve_uses_the_persisted_owner_policy_and_tracks_consumed_budget(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, [
            'max_calls' => 2,
            'max_cost_micros' => 100,
        ]);
        $service = app(TalosAgentBudgetService::class);

        $reservation = $service->reserve(
            $owner->id,
            $turn->id,
            'reservation-1',
            'action',
            'calls',
            1,
        );

        $this->assertSame('reservation-1', $reservation->reservation_id);
        $this->assertSame('reserved', $reservation->status);
        $this->assertSame(1, $reservation->reserved_amount);

        $service->settle('reservation-1', $owner->id, 1);

        $this->assertDatabaseHas('talos_tool_budget_reservations', [
            'reservation_id' => 'reservation-1',
            'user_id' => $owner->id,
            'resource' => 'calls',
            'reserved_amount' => 1,
            'settled_amount' => 1,
            'status' => 'settled',
        ]);

        $turn->setAttribute('budget_policy', ['max_calls' => 999]);

        $this->expectException(InvalidArgumentException::class);
        $service->reserve($owner->id, $turn->id, 'reservation-2', 'action', 'calls', 2);
    }

    public function test_reserve_returns_the_existing_reservation_for_an_identical_replay(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 1]);
        $call = $this->toolCall($owner, $turn);
        $service = app(TalosAgentBudgetService::class);
        $metadata = ['attempt' => 1, 'source' => 'dispatcher'];

        $reservation = $service->reserve(
            $owner->id,
            $turn->id,
            'reservation-replay',
            'action',
            'calls',
            1,
            $call->id,
            $metadata,
        );
        $replayed = $service->reserve(
            $owner->id,
            $turn->id,
            'reservation-replay',
            'action',
            'calls',
            1,
            $call->id,
            $metadata,
        );

        $this->assertSame($reservation->getKey(), $replayed->getKey());
        $this->assertSame('reserved', $replayed->status);
        $this->assertSame(1, TalosToolBudgetReservation::query()->where('reservation_id', 'reservation-replay')->count());
    }

    public function test_reserve_rejects_replays_with_any_different_identity_field(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 1]);
        $otherTurn = $this->turn($owner, ['max_calls' => 1]);
        $call = $this->toolCall($owner, $turn, 'provider-call-1');
        $otherCall = $this->toolCall($owner, $turn, 'provider-call-2', 2);
        $service = app(TalosAgentBudgetService::class);
        $metadata = ['attempt' => 1, 'source' => 'dispatcher'];

        $service->reserve(
            $owner->id,
            $turn->id,
            'reservation-conflict',
            'action',
            'calls',
            1,
            $call->id,
            $metadata,
        );

        $replays = [
            [$other->id, $turn->id, $call->id, 'action', 'calls', 1, $metadata],
            [$owner->id, $otherTurn->id, $call->id, 'action', 'calls', 1, $metadata],
            [$owner->id, $turn->id, $otherCall->id, 'action', 'calls', 1, $metadata],
            [$owner->id, $turn->id, $call->id, 'observation', 'calls', 1, $metadata],
            [$owner->id, $turn->id, $call->id, 'action', 'navigations', 1, $metadata],
            [$owner->id, $turn->id, $call->id, 'action', 'calls', 0, $metadata],
            [$owner->id, $turn->id, $call->id, 'action', 'calls', 1, ['attempt' => 2]],
        ];

        foreach ($replays as $replay) {
            try {
                $service->reserve(
                    $replay[0],
                    $replay[1],
                    'reservation-conflict',
                    $replay[3],
                    $replay[4],
                    $replay[5],
                    $replay[2],
                    $replay[6],
                );
                $this->fail('Mismatched reservation replay was accepted.');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertSame(1, TalosToolBudgetReservation::query()->where('reservation_id', 'reservation-conflict')->count());
    }

    public function test_reservations_cannot_overbook_a_resource_and_only_allow_known_non_negative_integers(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 2]);
        $service = app(TalosAgentBudgetService::class);

        $service->reserve($owner->id, $turn->id, 'reservation-1', 'action', 'calls', 1);
        $service->reserve($owner->id, $turn->id, 'reservation-2', 'action', 'calls', 1);

        $this->expectException(InvalidArgumentException::class);
        $service->reserve($owner->id, $turn->id, 'reservation-3', 'action', 'calls', 1);
    }

    public function test_settle_is_owner_scoped(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 2]);
        $service = app(TalosAgentBudgetService::class);
        $service->reserve($owner->id, $turn->id, 'reservation-settle', 'action', 'calls', 1);

        $this->expectException(InvalidArgumentException::class);
        $service->settle('reservation-settle', $other->id, 1);
    }

    public function test_settle_can_be_repeated_with_the_same_amount(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 2]);
        $service = app(TalosAgentBudgetService::class);
        $service->reserve($owner->id, $turn->id, 'reservation-settle', 'action', 'calls', 1);

        $settled = $service->settle('reservation-settle', $owner->id, 1);
        $repeated = $service->settle('reservation-settle', $owner->id, 1);

        $this->assertSame('settled', $settled->status);
        $this->assertSame(1, $repeated->settled_amount);
        $this->assertSame(1, TalosToolBudgetReservation::query()->where('reservation_id', 'reservation-settle')->count());
    }

    public function test_settlement_cannot_exceed_the_reserved_amount(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 2]);
        $service = app(TalosAgentBudgetService::class);
        $service->reserve($owner->id, $turn->id, 'reservation-over-settle', 'action', 'calls', 1);

        $this->expectException(InvalidArgumentException::class);
        $service->settle('reservation-over-settle', $owner->id, 2);
    }

    public function test_release_can_be_repeated_without_changing_the_reservation(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 1]);
        $service = app(TalosAgentBudgetService::class);
        $service->reserve($owner->id, $turn->id, 'reservation-release', 'action', 'calls', 1);

        $released = $service->release('reservation-release', $owner->id);
        $repeated = $service->release('reservation-release', $owner->id);

        $this->assertSame('released', $released->status);
        $this->assertSame('released', $repeated->status);
        $this->assertSame(1, TalosToolBudgetReservation::query()->where('reservation_id', 'reservation-release')->count());
    }

    public function test_release_is_owner_scoped(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 1]);
        $service = app(TalosAgentBudgetService::class);
        $service->reserve($owner->id, $turn->id, 'reservation-release-owner', 'action', 'calls', 1);

        $this->expectException(InvalidArgumentException::class);
        $service->release('reservation-release-owner', $other->id);
    }

    public function test_invalid_resource_amount_and_settlement_are_rejected(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 2]);
        $service = app(TalosAgentBudgetService::class);

        $this->expectException(InvalidArgumentException::class);
        $service->reserve($owner->id, $turn->id, 'reservation-invalid', 'action', 'unknown', 1);
    }

    public function test_all_allowlisted_resources_can_be_reserved(): void
    {
        $owner = User::factory()->create();
        $resources = [
            'calls',
            'navigations',
            'screenshots',
            'evidence_nodes',
            'evidence_bytes',
            'elapsed_ms',
            'input_tokens',
            'output_tokens',
            'cost_micros',
        ];
        $policy = array_fill_keys(array_map(static fn (string $resource): string => 'max_'.$resource, $resources), 1);
        $turn = $this->turn($owner, $policy);
        $service = app(TalosAgentBudgetService::class);

        foreach ($resources as $index => $resource) {
            $service->reserve($owner->id, $turn->id, 'reservation-'.$index, 'action', $resource, 1);
        }

        $this->assertSame(count($resources), TalosToolBudgetReservation::query()->count());
    }

    public function test_consumed_amount_is_owner_scoped_and_includes_reserved_and_settled_capacity(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $turn = $this->turn($owner, ['max_evidence_bytes' => 100]);
        $service = app(TalosAgentBudgetService::class);
        $service->reserve($owner->id, $turn->id, 'evidence-reserved', 'evidence', 'evidence_bytes', 30);
        $service->reserve($owner->id, $turn->id, 'evidence-settled', 'evidence', 'evidence_bytes', 20);
        $service->settle('evidence-settled', $owner->id, 15);

        $this->assertSame(45, $service->consumedForTurn($owner->id, $turn->id, 'evidence_bytes'));

        $this->expectException(InvalidArgumentException::class);
        $service->consumedForTurn($other->id, $turn->id, 'evidence_bytes');
    }

    public function test_reservation_amounts_must_be_non_negative_integers(): void
    {
        $owner = User::factory()->create();
        $turn = $this->turn($owner, ['max_calls' => 4]);
        $service = app(TalosAgentBudgetService::class);

        foreach ([-1, 1.5, '1'] as $index => $amount) {
            try {
                $service->reserve($owner->id, $turn->id, 'reservation-invalid-'.$index, 'action', 'calls', $amount);
                $this->fail('Invalid budget amount was accepted.');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    /** @param array<string, int> $policy */
    private function turn(User $user, array $policy): TalosToolTurn
    {
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Budget service',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Use a tool.'),
            'prompt' => 'Use a tool.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);

        return TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'openai_chat_v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => $policy,
            'budget_usage' => [],
            'started_at' => now(),
        ]);
    }

    private function toolCall(User $user, TalosToolTurn $turn, string $providerCallId = 'provider-call', int $sequence = 1): TalosToolCall
    {
        return TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $turn->run_id,
            'user_id' => $user->id,
            'sequence' => $sequence,
            'logical_call_id' => 'logical-call-'.$sequence,
            'provider_call_id' => $providerCallId,
            'node_id' => null,
            'tool_name' => 'browser.navigate',
            'node_type' => 'tool',
            'arguments' => ['url' => 'https://example.test'],
            'arguments_sha256' => hash('sha256', '{"url":"https://example.test"}'),
            'dependencies' => [],
            'fingerprint' => hash('sha256', 'call-'.$sequence),
            'risk' => 'low',
            'capability' => 'browser.navigate',
            'status' => 'pending',
            'attempt' => 0,
            'approval_state' => 'not_required',
        ]);
    }
}
