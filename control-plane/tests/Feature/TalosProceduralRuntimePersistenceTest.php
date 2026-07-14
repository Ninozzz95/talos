<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolBudgetReservation;
use App\Models\TalosToolCall;
use App\Models\TalosToolResult;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosDagCheckpointCodec;
use App\Services\Talos\Agent\TalosProviderStateCodec;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class TalosProceduralRuntimePersistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_owned_turn_call_result_and_budget_state_are_durable_and_correlated(): void
    {
        $user = User::factory()->create();
        [$session, $run] = $this->runContext($user);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-procedural-runtime',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true],
            'policy' => [],
            'worker_state_version' => 4,
            'expires_at' => now()->addHour(),
        ]);
        $dagState = [
            'nodes' => ['node-1' => ['status' => 'FAILED', 'secret_marker' => 'checkpoint-private']],
            'dependencies' => ['node-1' => []],
            'children' => ['node-1' => []],
            'consumed_approval_ids' => [],
        ];
        $providerState = ['reasoning_content' => 'opaque continuation state'];
        $loopGuardState = json_encode([
            'schema_version' => 'talos_loop_guard_state_v1',
            'guard' => [
                'observations' => ['sha256:'.str_repeat('a', 64) => 1],
                'retries' => [],
            ],
            'repair_attempts' => ['logical-browser-read' => 1],
            'provider_call_lineage' => ['provider-call-1' => 'logical-browser-read'],
            'private_marker' => 'loop-guard-private',
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'browser_session_id' => $browser->id,
            'status' => 'awaiting_tool_results',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'openai_chat_v1',
            'provider_response_id' => 'response-1',
            'continuation_kind' => 'openai_chat_messages',
            'pending_tool_call_ids' => ['provider-call-1'],
            'provider_state' => TalosProviderStateCodec::encode($providerState),
            'provider_state_sha256' => 'sha256:'.hash('sha256', TalosProviderStateCodec::encode($providerState)),
            'loop_guard_state' => $loopGuardState,
            'loop_guard_state_sha256' => 'sha256:'.hash('sha256', $loopGuardState),
            'dag_state' => TalosDagCheckpointCodec::encode($dagState),
            'dag_state_sha256' => 'sha256:'.hash('sha256', TalosDagCheckpointCodec::encode($dagState)),
            'budget_policy' => ['max_calls' => 8, 'max_cost_micros' => 500000],
            'budget_usage' => ['calls' => 1, 'cost_micros' => 1000],
            'started_at' => now(),
        ]);
        $call = TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-browser-read',
            'provider_call_id' => 'provider-call-1',
            'node_id' => 'node-1',
            'tool_name' => 'browser_snapshot',
            'node_type' => 'TOOL_BROWSER_SNAPSHOT',
            'arguments' => [],
            'canonical_call' => json_encode([
                'schema_version' => 'talos_provider_tool_call_v1',
                'provider_call_id' => 'provider-call-1',
                'name' => 'browser_snapshot',
                'arguments' => [],
                'assistant_preamble' => null,
                'provider_metadata' => ['private_marker' => 'call-private'],
            ], JSON_THROW_ON_ERROR),
            'execution_context' => json_encode([
                'schema_version' => 'talos_tool_execution_context_v1',
                'user_id' => (string) $user->id,
                'chat_session_id' => (string) $session->id,
                'run_id' => (string) $run->id,
                'turn_id' => (string) $turn->id,
                'browser_session_id' => (string) $browser->id,
                'node_id' => 'node-1',
                'capability' => 'browser.read',
                'risk' => 'low',
                'state_version' => 4,
                'deadline_at' => now()->addMinute()->toIso8601String(),
                'idempotency_key' => 'sha256:'.hash('sha256', 'node-1'),
            ], JSON_THROW_ON_ERROR),
            'arguments_sha256' => 'sha256:'.hash('sha256', '{}'),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'call-fingerprint'),
            'state_version' => 4,
            'risk' => 'low',
            'capability' => 'browser.read',
            'status' => 'failed',
            'attempt' => 0,
            'approval_state' => 'not_required',
        ]);
        $result = TalosToolResult::query()->create([
            'tool_call_id' => $call->id,
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'provider_call_id' => 'provider-call-1',
            'attempt' => 0,
            'status' => 'failed',
            'is_error' => true,
            'canonical_result' => [
                'schema_version' => 'talos_tool_result_v1',
                'tool_use_id' => 'provider-call-1',
                'isError' => true,
                'content' => [['type' => 'text', 'text' => 'Browser state is stale.']],
                'structuredContent' => ['code' => 'TALOS_BROWSER_STALE_STATE'],
                'evidence' => [],
            ],
            'error_code' => 'TALOS_BROWSER_STALE_STATE',
            'evidence_ids' => [],
            'state_version' => 4,
        ]);
        $reservation = TalosToolBudgetReservation::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'tool_call_id' => $call->id,
            'reservation_id' => 'reservation-1',
            'kind' => 'action',
            'resource' => 'calls',
            'reserved_amount' => 1,
            'settled_amount' => 1,
            'status' => 'settled',
            'metadata' => ['source' => 'procedural_runtime'],
        ]);

        $this->assertSame($user->id, $turn->user_id);
        $this->assertSame(['provider-call-1'], $turn->pending_tool_call_ids);
        $this->assertSame('opaque continuation state', TalosProviderStateCodec::decode($turn->provider_state)['reasoning_content']);
        $this->assertSame('loop-guard-private', json_decode($turn->loop_guard_state, true, flags: JSON_THROW_ON_ERROR)['private_marker']);
        $this->assertSame('sha256:'.hash('sha256', $loopGuardState), $turn->loop_guard_state_sha256);
        $this->assertSame($browser->id, $turn->browser_session_id);
        $this->assertSame('checkpoint-private', TalosDagCheckpointCodec::decode($turn->dag_state)['nodes']['node-1']['secret_marker']);
        $this->assertStringNotContainsString(
            'opaque continuation state',
            (string) DB::table('talos_tool_turns')->where('id', $turn->id)->value('provider_state'),
        );
        $this->assertStringNotContainsString(
            'checkpoint-private',
            (string) DB::table('talos_tool_turns')->where('id', $turn->id)->value('dag_state'),
        );
        $this->assertStringNotContainsString(
            'loop-guard-private',
            (string) DB::table('talos_tool_turns')->where('id', $turn->id)->value('loop_guard_state'),
        );
        $this->assertStringNotContainsString(
            'call-private',
            (string) DB::table('talos_tool_calls')->where('id', $call->id)->value('canonical_call'),
        );
        $this->assertSame('call-private', json_decode($call->canonical_call, true, flags: JSON_THROW_ON_ERROR)['provider_metadata']['private_marker']);
        $this->assertTrue($turn->calls->contains($call));
        $this->assertTrue($call->results->contains($result));
        $this->assertSame('TALOS_BROWSER_STALE_STATE', $call->results->firstOrFail()->error_code);
        $this->assertTrue($turn->budgetReservations->contains($reservation));
        $this->assertSame(1, $reservation->settled_amount);
    }

    public function test_owner_scopes_hide_another_users_procedural_state(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        [$session, $run] = $this->runContext($owner);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $owner->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'openai_chat_v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 8],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        $this->assertNotNull(TalosToolTurn::query()->ownedBy($owner->id)->find($turn->id));
        $this->assertNull(TalosToolTurn::query()->ownedBy($other->id)->find($turn->id));
    }

    public function test_provider_call_correlation_is_unique_per_turn(): void
    {
        $user = User::factory()->create();
        [$session, $run] = $this->runContext($user);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'openai_chat_v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 8],
            'budget_usage' => [],
            'started_at' => now(),
        ]);
        $attributes = [
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-1',
            'provider_call_id' => 'provider-call-duplicate',
            'tool_name' => 'web_search',
            'arguments' => ['query' => 'AVM'],
            'arguments_sha256' => 'sha256:'.hash('sha256', 'arguments'),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'fingerprint'),
            'risk' => 'low',
            'capability' => 'web.search',
            'status' => 'proposed',
            'attempt' => 0,
            'approval_state' => 'not_required',
        ];
        TalosToolCall::query()->create($attributes);

        $this->expectException(QueryException::class);
        TalosToolCall::query()->create([...$attributes, 'sequence' => 2, 'logical_call_id' => 'logical-2']);
    }

    /** @return array{TalosSession, TalosRun} */
    private function runContext(User $user): array
    {
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Procedural runtime',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Use the browser.'),
            'prompt' => 'Use the browser.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);

        return [$session, $run];
    }
}
