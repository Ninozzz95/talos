<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosExecutionClaimService;
use App\Services\Talos\Agent\TalosProceduralGuardCheckpoint;
use App\Services\Talos\Agent\TalosProceduralGuardCheckpointStore;
use App\Services\Talos\Agent\TalosProviderRecoveryRequiredException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Kadmos\Tool\ToolCall;
use Tests\TestCase;

final class TalosProceduralGuardCheckpointStoreTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkpoint_is_encrypted_checksummed_and_reloaded_under_the_active_turn_lease(): void
    {
        [$user, $turn] = $this->turnContext();
        $claims = app(TalosExecutionClaimService::class);
        $leaseToken = $claims->claimTurn($user->id, (string) $turn->id, 'resume');
        $this->assertNotNull($leaseToken);
        $revisionBeforePersist = (int) $turn->refresh()->revision;
        $call = new ToolCall('provider-call', 'web_search', ['query' => 'private-query-marker'], null, []);
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls([$call]);
        $this->assertTrue($checkpoint->guard()->inspect($call, 0)->allowed);
        $checkpoint->incrementRepair('provider-call');
        $store = app(TalosProceduralGuardCheckpointStore::class);

        $stored = $store->persist($user->id, (string) $turn->id, $leaseToken, $checkpoint);
        $reloaded = $store->load($stored->refresh());

        $this->assertSame($revisionBeforePersist + 1, $stored->revision);
        $this->assertSame(1, $stored->repair_attempt);
        $this->assertSame('sha256:'.hash('sha256', $checkpoint->encode()), $stored->loop_guard_state_sha256);
        $this->assertSame(1, $reloaded->repairAttempt('provider-call'));
        $this->assertFalse($reloaded->guard()->inspect($call, 0)->allowed);
        $this->assertStringNotContainsString(
            'private-query-marker',
            (string) DB::table('talos_tool_turns')->where('id', $turn->id)->value('loop_guard_state'),
        );
    }

    public function test_stale_worker_cannot_overwrite_a_durable_guard_checkpoint(): void
    {
        [$user, $turn] = $this->turnContext();
        $claims = app(TalosExecutionClaimService::class);
        $leaseToken = $claims->claimTurn($user->id, (string) $turn->id, 'resume');
        $this->assertNotNull($leaseToken);
        $store = app(TalosProceduralGuardCheckpointStore::class);
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $store->persist($user->id, (string) $turn->id, $leaseToken, $checkpoint);
        $before = $turn->refresh()->loop_guard_state_sha256;

        $this->expectException(TalosProviderRecoveryRequiredException::class);
        try {
            $store->persist($user->id, (string) $turn->id, 'stale-worker-token', $checkpoint);
        } finally {
            $this->assertSame($before, $turn->refresh()->loop_guard_state_sha256);
        }
    }

    public function test_corrupt_guard_checkpoint_fails_closed(): void
    {
        [$user, $turn] = $this->turnContext();
        $turn->forceFill([
            'loop_guard_state' => TalosProceduralGuardCheckpoint::fresh()->encode(),
            'loop_guard_state_sha256' => 'sha256:'.str_repeat('0', 64),
        ])->save();

        $this->expectException(\InvalidArgumentException::class);
        app(TalosProceduralGuardCheckpointStore::class)->load($turn->refresh());
    }

    /** @return array{User, TalosToolTurn} */
    private function turnContext(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Durable procedural guard',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'durable guard'),
            'prompt' => 'Use a tool safely.',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'adapter_version' => 'test_v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 16],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        return [$user, $turn];
    }
}
