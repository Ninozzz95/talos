<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosExecutionClaimService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Tests\TestCase;

final class TalosExecutionClaimServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_live_turn_lease_has_one_owner_and_uses_a_fencing_token(): void
    {
        [$owner, $turn] = $this->turn();
        $service = app(TalosExecutionClaimService::class);

        $first = $service->claimTurn($owner->id, $turn->id, 'provider_start');
        $second = $service->claimTurn($owner->id, $turn->id, 'provider_start');

        $this->assertNotNull($first);
        $this->assertNull($second);
        $this->assertTrue($service->renewTurn($owner->id, $turn->id, $first, 'provider_start'));

        $turn->refresh()->forceFill(['execution_lease_expires_at' => now()->subSecond()])->save();
        $replacement = $service->claimTurn($owner->id, $turn->id, 'resume');

        $this->assertNotNull($replacement);
        $this->assertNotSame($first, $replacement);
        $this->assertFalse($service->renewTurn($owner->id, $turn->id, $first, 'stale'));
        $this->assertTrue($service->releaseTurn($owner->id, $turn->id, $replacement));
        $this->assertNull($turn->refresh()->execution_lease_token);
    }

    public function test_terminal_turns_cannot_be_reclaimed(): void
    {
        foreach (['completed', 'failed', 'cancelled', 'recovery_required'] as $status) {
            [$owner, $turn] = $this->turn();
            $turn->forceFill([
                'status' => $status,
                'execution_lease_token' => null,
                'execution_lease_expires_at' => null,
            ])->save();
            $revision = (int) $turn->revision;

            $this->assertNull(app(TalosExecutionClaimService::class)->claimTurn(
                $owner->id,
                $turn->id,
                'resume',
            ));
            $this->assertSame($revision, (int) $turn->refresh()->revision);
            $this->assertNull($turn->execution_lease_token);
        }
    }

    public function test_call_claims_lock_the_live_turn_before_the_mutable_call_row(): void
    {
        [$owner, $turn, $call] = $this->turn(withCall: true);
        $service = app(TalosExecutionClaimService::class);
        $turnToken = $service->claimTurn($owner->id, $turn->id, 'tool_dispatch');
        $this->assertNotNull($turnToken);
        $tables = [];
        DB::listen(static function ($query) use (&$tables): void {
            $sql = strtolower((string) $query->sql);
            if (str_starts_with($sql, 'select') && str_contains($sql, 'talos_tool_turns')) {
                $tables[] = 'turn';
            } elseif (str_starts_with($sql, 'select') && str_contains($sql, 'talos_tool_calls')) {
                $tables[] = 'call';
            }
        });

        $effectToken = $service->claimCall(
            $owner->id,
            $call->id,
            'sha256:'.hash('sha256', 'turn-first-lock-order'),
            $turnToken,
        );

        $this->assertNotNull($effectToken);
        $this->assertSame(['call', 'turn', 'call'], array_slice($tables, -3));
    }

    public function test_tool_effect_claims_cannot_be_stolen_or_replayed_after_an_uncertain_effect(): void
    {
        [$owner, $turn, $call] = $this->turn(withCall: true);
        $service = app(TalosExecutionClaimService::class);
        $effectKey = 'sha256:'.hash('sha256', 'effect');
        $turnToken = $service->claimTurn($owner->id, $turn->id, 'tool_dispatch');
        $this->assertNotNull($turnToken);

        $first = $service->claimCall($owner->id, $call->id, $effectKey, $turnToken);

        $this->assertNotNull($first);
        $this->assertNull($service->claimCall($owner->id, $call->id, $effectKey, $turnToken));

        $call->refresh()->forceFill(['execution_lease_expires_at' => now()->subSecond()])->save();

        $this->assertNull($service->claimCall($owner->id, $call->id, $effectKey, $turnToken));
        $this->assertSame('recovery_required', $call->refresh()->effect_status);
        $this->assertFalse($service->completeCall($owner->id, $call->id, 'stale-token', $turnToken));
    }

    public function test_a_stale_turn_lease_cannot_claim_a_physical_tool_effect(): void
    {
        [$owner, $turn, $call] = $this->turn(withCall: true);
        $service = app(TalosExecutionClaimService::class);
        $effectKey = 'sha256:'.hash('sha256', 'effect');
        $staleTurnToken = $service->claimTurn($owner->id, $turn->id, 'tool_dispatch');
        $this->assertNotNull($staleTurnToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();

        $this->assertNull($service->claimCall($owner->id, $call->id, $effectKey, $staleTurnToken));
        $this->assertNull($call->refresh()->effect_status);
        $this->assertNull($call->execution_token);
    }

    public function test_a_stale_turn_lease_cannot_release_an_in_flight_effect_claim(): void
    {
        [$owner, $turn, $call] = $this->turn(withCall: true);
        $service = app(TalosExecutionClaimService::class);
        $effectKey = 'sha256:'.hash('sha256', 'effect');
        $staleTurnToken = $service->claimTurn($owner->id, $turn->id, 'tool_dispatch');
        $this->assertNotNull($staleTurnToken);
        $effectToken = $service->claimCall($owner->id, $call->id, $effectKey, $staleTurnToken);
        $this->assertNotNull($effectToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();

        $this->assertFalse($service->releaseCall(
            $owner->id,
            $call->id,
            $effectToken,
            $staleTurnToken,
        ));
        $this->assertSame('recovery_required', $call->refresh()->effect_status);
        $this->assertSame('recovery_required', $call->status);
        $this->assertNull($call->execution_token);
    }

    public function test_a_stale_turn_lease_cannot_complete_an_in_flight_effect_claim(): void
    {
        [$owner, $turn, $call] = $this->turn(withCall: true);
        $service = app(TalosExecutionClaimService::class);
        $effectKey = 'sha256:'.hash('sha256', 'effect');
        $staleTurnToken = $service->claimTurn($owner->id, $turn->id, 'tool_dispatch');
        $this->assertNotNull($staleTurnToken);
        $effectToken = $service->claimCall($owner->id, $call->id, $effectKey, $staleTurnToken);
        $this->assertNotNull($effectToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();

        $this->assertFalse($service->completeCall(
            $owner->id,
            $call->id,
            $effectToken,
            $staleTurnToken,
        ));
        $this->assertSame('in_flight', $call->refresh()->effect_status);
        $this->assertSame($effectToken, $call->execution_token);
    }

    public function test_a_stale_turn_lease_fails_the_immediate_effect_boundary_and_quarantines_the_call(): void
    {
        [$owner, $turn, $call] = $this->turn(withCall: true);
        $service = app(TalosExecutionClaimService::class);
        $effectKey = 'sha256:'.hash('sha256', 'effect');
        $staleTurnToken = $service->claimTurn($owner->id, $turn->id, 'tool_dispatch');
        $this->assertNotNull($staleTurnToken);
        $effectToken = $service->claimCall($owner->id, $call->id, $effectKey, $staleTurnToken);
        $this->assertNotNull($effectToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();

        $this->assertFalse($service->authorizeCallExecution(
            $owner->id,
            $call->id,
            $effectToken,
            $staleTurnToken,
        ));
        $this->assertSame('recovery_required', $call->refresh()->status);
        $this->assertSame('recovery_required', $call->effect_status);
        $this->assertNull($call->execution_token);
        $this->assertNull($call->execution_lease_expires_at);
    }

    public function test_claims_are_owner_scoped(): void
    {
        [, $turn] = $this->turn();
        $other = User::factory()->create();

        $this->expectException(InvalidArgumentException::class);
        app(TalosExecutionClaimService::class)->claimTurn($other->id, $turn->id, 'provider_start');
    }

    /** @return array{User, TalosToolTurn, 2?: TalosToolCall} */
    private function turn(bool $withCall = false): array
    {
        $owner = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $owner->id,
            'title' => 'Execution claim',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $owner->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'claim'),
            'prompt' => 'claim',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $owner->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'adapter_version' => 'test-v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 4],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        if (! $withCall) {
            return [$owner, $turn];
        }

        $call = TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $owner->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-call',
            'provider_call_id' => 'provider-call',
            'node_id' => 'node-call',
            'tool_name' => 'web_search',
            'node_type' => 'TOOL_WEB_SEARCH',
            'arguments' => ['query' => 'AVM'],
            'arguments_sha256' => 'sha256:'.hash('sha256', '{"query":"AVM"}'),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'fingerprint'),
            'risk' => 'low',
            'capability' => 'web.search',
            'status' => 'proposed',
            'attempt' => 0,
            'approval_state' => 'not_required',
        ]);

        return [$owner, $turn, $call];
    }
}
