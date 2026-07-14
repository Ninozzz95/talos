<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosAgentTurnService;
use App\Services\Talos\Agent\TalosExecutionClaimService;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Agent\TalosProviderGateway;
use App\Services\Talos\Agent\TalosProviderOutcomeCodec;
use App\Services\Talos\Agent\TalosProviderRecoveryRequiredException;
use App\Services\Talos\Agent\TalosProceduralGuardCheckpoint;
use App\Services\Talos\Agent\TalosToolExecutionBackend;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Kadmos\Provider\ProviderFailure;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolResult;
use Tests\TestCase;

final class TalosAgentTurnServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_final_turn_uses_complete_durable_history_and_is_idempotent(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create(['session_id' => $session->id, 'role' => 'user', 'content' => 'First question.', 'metadata' => []]);
        TalosMessage::query()->create(['session_id' => $session->id, 'role' => 'assistant', 'content' => 'First answer.', 'metadata' => []]);
        TalosMessage::query()->create(['session_id' => $session->id, 'role' => 'user', 'content' => 'Continue with context.', 'run_id' => $run->id, 'metadata' => []]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);
        $service = $this->service($adapter);

        $first = $service->execute($user->id, $run, $profile);
        $second = $service->execute($user->id, $run->refresh(), $profile->refresh());

        $this->assertSame('completed', $first->status);
        $this->assertSame('Completed with durable context.', $first->text);
        $this->assertSame('completed', $second->status);
        $this->assertSame(1, $adapter->startCalls);
        $this->assertSame([
            ['role' => 'user', 'content' => 'First question.'],
            ['role' => 'assistant', 'content' => 'First answer.'],
            ['role' => 'user', 'content' => 'Continue with context.'],
        ], $adapter->receivedMessages);
        $this->assertSame(1, TalosMessage::query()->where('run_id', $run->id)->where('role', 'assistant')->count());
        $this->assertSame('succeeded', $run->refresh()->status);
        $this->assertSame(1, TalosToolTurn::query()->where('run_id', $run->id)->count());
    }

    public function test_native_tool_round_crosses_compiler_dispatcher_continuation_and_grounding(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Search the web for AVM.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: false);
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        $service = $this->service($adapter);

        $outcome = $service->execute($user->id, $run, $profile);

        $this->assertSame('completed', $outcome->status);
        $this->assertSame('Grounded final answer.', $outcome->text);
        $this->assertSame(1, $adapter->startCalls);
        $this->assertSame(1, $adapter->continueCalls);
        $this->assertSame(['web_search'], $backend->executedTools);
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
        $this->assertSame('completed', $turn->status);
        $this->assertSame(1, $turn->calls()->count());
        $this->assertSame(1, $turn->results()->count());
        $this->assertSame('succeeded', $turn->calls()->firstOrFail()->status);
        $this->assertSame('Grounded final answer.', TalosMessage::query()->where('run_id', $run->id)->where('role', 'assistant')->value('content'));
        $this->assertSame(
            ['provider.turn.started', 'tool.execution.started', 'tool.execution.completed', 'provider.turn.continued', 'assistant.grounded'],
            $run->events()->orderBy('sequence')->pluck('event_type')->all(),
        );
    }

    public function test_grounding_fault_is_returned_as_a_controlled_failed_outcome(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Search without durable evidence.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: false);
        $this->app->instance(TalosToolExecutionBackend::class, new AgentTurnTestBackend(persistEvidence: false));

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('TALOS_GROUNDING_EVIDENCE_NOT_PERSISTED', $outcome->failureCode);
        $this->assertSame('failed', $run->refresh()->status);
        $failedEvent = $run->events()->where('event_type', 'agent.turn.failed')->firstOrFail();
        $this->assertSame(
            'TALOS_GROUNDING_EVIDENCE_NOT_PERSISTED',
            $failedEvent->payload['code'] ?? null,
        );
    }

    public function test_execute_returns_in_progress_without_calling_provider_when_turn_has_a_live_lease(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Do not duplicate this provider request.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'model_profile_id' => $profile->id,
            'status' => 'running',
            'provider' => $profile->provider,
            'model' => $profile->model,
            'adapter_version' => $adapter->capabilities()->adapterVersion,
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 16],
            'budget_usage' => [],
            'started_at' => now(),
        ]);
        $token = app(TalosExecutionClaimService::class)->claimTurn($user->id, $turn->id, 'provider_start');
        $this->assertNotNull($token);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('in_progress', $outcome->status);
        $this->assertSame(0, $adapter->startCalls);
        $this->assertSame(0, $adapter->continueCalls);
        $this->assertSame($token, $turn->refresh()->execution_lease_token);
    }

    public function test_provider_cost_budget_is_enforced_before_final_answer_persistence(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $profile->forceFill(['capabilities' => [
            'pricing' => [
                'input_micros_per_million_tokens' => 1_000_000_000_000,
                'output_micros_per_million_tokens' => 0,
                'cached_input_micros_per_million_tokens' => 1_000_000_000_000,
            ],
        ]])->save();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'This answer must respect its cost budget.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile->refresh());

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('TALOS_TOOL_COST_BUDGET_EXHAUSTED', $outcome->failureCode);
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
        $this->assertGreaterThan($turn->budget_policy['max_cost_micros'], $turn->budget_usage['cost_micros']);
        $this->assertSame(0, TalosMessage::query()->where('run_id', $run->id)->where('role', 'assistant')->count());
    }

    public function test_uncertain_provider_start_preserves_recovery_required_state(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Do not replay an uncertain provider request.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: true, throwOnStart: true);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('recovery_required', $outcome->status);
        $this->assertSame('TALOS_PROVIDER_RECOVERY_REQUIRED', $outcome->failureCode);
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
        $this->assertSame('recovery_required', $turn->status);
        $this->assertSame('recovery_required', $turn->provider_operation_status);
        $this->assertSame('recovery_required', $run->refresh()->status);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $run->id,
            'event_type' => 'agent.turn.recovery_required',
        ]);

        $replayed = $this->service($adapter)->execute($user->id, $run->refresh(), $profile);
        $this->assertSame('recovery_required', $replayed->status);
        $this->assertSame(1, $adapter->startCalls);
    }

    public function test_stale_provider_worker_cannot_overwrite_a_successor_completion(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Preserve the successor result.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(
            finalImmediately: true,
            throwOnStart: true,
            onStart: static function () use ($run, $session, $profile): void {
                $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
                TalosMessage::query()->create([
                    'session_id' => $session->id,
                    'role' => 'assistant',
                    'content' => 'Successor completed safely.',
                    'model_profile_id' => $profile->id,
                    'run_id' => $run->id,
                    'metadata' => ['source' => 'successor'],
                ]);
                $turn->forceFill([
                    'status' => 'completed',
                    'provider_operation_status' => 'completed',
                    'execution_lease_token' => 'successor-lease-token',
                    'execution_lease_expires_at' => now()->addMinute(),
                    'completed_at' => now(),
                ])->save();
                $run->forceFill(['status' => 'succeeded', 'completed_at' => now()])->save();
            },
        );

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('completed', $outcome->status);
        $this->assertSame('Successor completed safely.', $outcome->text);
        $this->assertSame('completed', TalosToolTurn::query()->where('run_id', $run->id)->value('status'));
        $this->assertSame('succeeded', $run->refresh()->status);
        $this->assertSame(0, $run->events()->where('event_type', 'agent.turn.recovery_required')->count());
    }

    public function test_resume_recovers_typed_provider_failure_from_checkpoint_when_terminal_event_is_missing(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);
        $response = ProviderTurnResponse::failure(new ProviderFailure(
            'PROVIDER_HTTP_ERROR',
            'The provider returned an upstream error.',
            true,
            503,
            ['provider' => 'openai'],
        ));
        $encodedOutcome = TalosProviderOutcomeCodec::encode($response);
        TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'model_profile_id' => $profile->id,
            'status' => 'failed',
            'provider' => $profile->provider,
            'model' => $profile->model,
            'adapter_version' => $adapter->capabilities()->adapterVersion,
            'pending_tool_call_ids' => [],
            'provider_outcome' => $encodedOutcome,
            'provider_outcome_sha256' => 'sha256:'.hash('sha256', $encodedOutcome),
            'provider_operation_status' => 'completed',
            'budget_policy' => ['max_calls' => 16],
            'budget_usage' => [],
            'started_at' => now(),
            'completed_at' => now(),
        ]);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('PROVIDER_HTTP_ERROR', $outcome->failureCode);
        $this->assertSame(0, $adapter->startCalls);
        $this->assertSame(0, $run->events()->where('event_type', 'agent.turn.failed')->count());
    }

    public function test_invalid_provider_arguments_are_returned_for_repair_before_any_physical_execution(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Search the web with validated arguments.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new InvalidThenRepairingAgentAdapter;
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('completed', $outcome->status);
        $this->assertSame(['web_search'], $backend->executedTools);
        $this->assertSame(1, $adapter->startCalls);
        $this->assertSame(2, $adapter->continueCalls);
        $this->assertSame('TALOS_TOOL_ARGUMENTS_INVALID', $adapter->firstResultCode);
        $this->assertSame(
            1,
            $run->events()->where('event_type', 'provider.tool_arguments.rejected')->count(),
        );
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
        $checkpoint = $this->app
            ->make(\App\Services\Talos\Agent\TalosProceduralGuardCheckpointStore::class)
            ->load($turn);
        $this->assertSame('provider-invalid-search', $checkpoint->logicalCallId('provider-repaired-search'));
        $this->assertSame(1, $checkpoint->repairAttempt('provider-repaired-search'));
        $persistedCall = $turn->calls()->where('provider_call_id', 'provider-repaired-search')->firstOrFail();
        $this->assertSame('provider-invalid-search', $persistedCall->logical_call_id);
        $this->assertSame(1, $persistedCall->attempt);
    }

    public function test_resume_blocks_a_semantic_repeat_with_a_new_provider_call_id_from_durable_state(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        $observed = new ToolCall('provider-observed', 'web_search', ['query' => 'same semantic request'], null, []);
        $repeated = new ToolCall('provider-repeated', 'web_search', ['query' => 'same semantic request'], null, []);
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls([$observed]);
        $this->assertTrue($checkpoint->guard()->inspect($observed, 0)->allowed);
        $response = ProviderTurnResponse::toolCalls(
            null,
            [$repeated],
            new ProviderTurnState(
                'openai',
                $adapter->capabilities()->adapterVersion,
                'response-repeated',
                'test_state',
                ['round' => 2],
                ['provider-repeated'],
            ),
            'response-repeated',
            'tool_calls',
            new TokenUsage(4, 2, 6),
        );
        $encodedOutcome = TalosProviderOutcomeCodec::encode($response);
        $encodedGuard = $checkpoint->encode();
        TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'model_profile_id' => $profile->id,
            'status' => 'awaiting_tool_results',
            'provider' => $profile->provider,
            'model' => $profile->model,
            'adapter_version' => $adapter->capabilities()->adapterVersion,
            'provider_response_id' => 'response-repeated',
            'pending_tool_call_ids' => ['provider-repeated'],
            'provider_outcome' => $encodedOutcome,
            'provider_outcome_sha256' => 'sha256:'.hash('sha256', $encodedOutcome),
            'provider_operation_status' => 'completed',
            'provider_round' => 1,
            'loop_guard_state' => $encodedGuard,
            'loop_guard_state_sha256' => 'sha256:'.hash('sha256', $encodedGuard),
            'budget_policy' => [
                'max_calls' => 16,
                'max_navigations' => 4,
                'max_screenshots' => 4,
                'max_evidence_nodes' => 16,
                'max_evidence_bytes' => 16_000_000,
                'max_elapsed_ms' => 120_000,
                'max_input_tokens' => 131_072,
                'max_output_tokens' => 65_536,
                'max_cost_micros' => 5_000_000,
            ],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('TALOS_TOOL_LOOP_DETECTED', $outcome->failureCode);
        $this->assertSame([], $backend->executedTools);
        $this->assertSame(0, $adapter->startCalls);
        $this->assertSame(0, $adapter->continueCalls);
    }

    public function test_resume_replays_the_same_persisted_pending_call_without_reexecuting_its_effect(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Search once even if the provider continuation crashes.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        $firstAdapter = new FailingContinueAgentAdapter;

        $first = $this->service($firstAdapter)->execute($user->id, $run, $profile);

        $this->assertSame('recovery_required', $first->status);
        $this->assertSame(['web_search'], $backend->executedTools);
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
        $this->assertNotNull($turn->loop_guard_state);
        $turn->forceFill([
            'status' => 'awaiting_tool_results',
            'provider_operation_key' => null,
            'provider_operation_hash' => null,
            'provider_operation_status' => null,
            'execution_lease_token' => null,
            'execution_lease_expires_at' => null,
            'execution_lease_phase' => null,
            'completed_at' => null,
        ])->save();
        $run->forceFill(['status' => 'running', 'completed_at' => null])->save();
        $resumingAdapter = new AgentTurnTestAdapter(finalImmediately: false);

        $resumed = $this->service($resumingAdapter)->execute($user->id, $run->refresh(), $profile->refresh());

        $this->assertSame('completed', $resumed->status);
        $this->assertSame('Grounded final answer.', $resumed->text);
        $this->assertSame(['web_search'], $backend->executedTools);
        $this->assertSame(0, $resumingAdapter->startCalls);
        $this->assertSame(1, $resumingAdapter->continueCalls);
        $this->assertSame(1, $turn->calls()->count());
        $this->assertSame(1, $turn->results()->count());
    }

    public function test_resume_does_not_double_count_a_repair_checkpointed_before_provider_continuation(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Repair one invalid web search after a crash.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $first = $this->service(new FailingInvalidContinueAgentAdapter)->execute($user->id, $run, $profile);

        $this->assertSame('recovery_required', $first->status);
        $this->assertSame([], $backend->executedTools);
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
        $storedBeforeResume = $this->app
            ->make(\App\Services\Talos\Agent\TalosProceduralGuardCheckpointStore::class)
            ->load($turn);
        $this->assertSame(1, $storedBeforeResume->repairAttempt('provider-invalid-search'));
        $turn->forceFill([
            'status' => 'awaiting_tool_results',
            'provider_operation_key' => null,
            'provider_operation_hash' => null,
            'provider_operation_status' => null,
            'execution_lease_token' => null,
            'execution_lease_expires_at' => null,
            'execution_lease_phase' => null,
            'completed_at' => null,
        ])->save();
        $run->forceFill(['status' => 'running', 'completed_at' => null])->save();
        $resumingAdapter = new InvalidThenRepairingAgentAdapter;

        $resumed = $this->service($resumingAdapter)->execute($user->id, $run->refresh(), $profile->refresh());

        $this->assertSame('completed', $resumed->status);
        $this->assertSame(['web_search'], $backend->executedTools);
        $checkpoint = $this->app
            ->make(\App\Services\Talos\Agent\TalosProceduralGuardCheckpointStore::class)
            ->load($turn->refresh());
        $this->assertSame(1, $checkpoint->repairAttempt('provider-invalid-search'));
        $this->assertSame(1, $checkpoint->repairAttempt('provider-repaired-search'));
        $this->assertSame(1, $turn->calls()->where('provider_call_id', 'provider-repaired-search')->value('attempt'));
    }

    public function test_a_stale_worker_cannot_advance_the_provider_round(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $turn = $this->runtimeTurn($user, $session, $run, $profile);
        $staleToken = app(TalosExecutionClaimService::class)->claimTurn(
            $user->id,
            (string) $turn->id,
            'tool_dispatch',
        );
        $this->assertNotNull($staleToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();
        $method = new \ReflectionMethod(TalosAgentTurnService::class, 'continueProviderWithResults');

        try {
            $method->invoke(
                $this->service(new AgentTurnTestAdapter(finalImmediately: false)),
                $user->id,
                $run,
                $profile,
                $turn->refresh(),
                null,
                $staleToken,
                [new ToolResult('provider-call', false, [['type' => 'text', 'text' => 'ok']], [], [])],
                TalosProceduralGuardCheckpoint::fresh(),
                0,
                [],
            );
            $this->fail('A stale worker advanced the provider round.');
        } catch (TalosProviderRecoveryRequiredException) {
            // Expected fencing failure.
        }

        $this->assertSame(0, $turn->refresh()->provider_round);
        $this->assertSame('running', $turn->status);
        $this->assertSame('successor-turn-token', $turn->execution_lease_token);
    }

    public function test_a_stale_worker_cannot_commit_a_terminal_success(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $turn = $this->runtimeTurn($user, $session, $run, $profile);
        $staleToken = app(TalosExecutionClaimService::class)->claimTurn($user->id, (string) $turn->id, 'finalize');
        $this->assertNotNull($staleToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();
        $method = new \ReflectionMethod(TalosAgentTurnService::class, 'finalize');
        $outcome = $method->invoke(
            $this->service(new AgentTurnTestAdapter(finalImmediately: true)),
            $user->id,
            $run,
            $turn->refresh(),
            ProviderTurnResponse::final(
                'Stale answer.',
                'stale-response',
                'stop',
                new TokenUsage(1, 1, 2),
            ),
            $staleToken,
        );

        $this->assertSame('in_progress', $outcome->status);
        $this->assertSame('running', $run->refresh()->status);
        $this->assertSame('running', $turn->refresh()->status);
        $this->assertSame(0, TalosMessage::query()->where('run_id', $run->id)->where('role', 'assistant')->count());
    }

    public function test_a_stale_worker_cannot_commit_a_terminal_failure(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $turn = $this->runtimeTurn($user, $session, $run, $profile);
        $staleToken = app(TalosExecutionClaimService::class)->claimTurn($user->id, (string) $turn->id, 'fail');
        $this->assertNotNull($staleToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();
        $method = new \ReflectionMethod(TalosAgentTurnService::class, 'fail');
        $outcome = $method->invoke(
            $this->service(new AgentTurnTestAdapter(finalImmediately: true)),
            $user->id,
            $run,
            $turn->refresh(),
            'STALE_FAILURE',
            $staleToken,
        );

        $this->assertSame('in_progress', $outcome->status);
        $this->assertSame('running', $run->refresh()->status);
        $this->assertSame('running', $turn->refresh()->status);
        $this->assertSame(0, $run->events()->where('event_type', 'agent.turn.failed')->count());
    }

    public function test_a_stale_worker_cannot_add_provider_usage(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $turn = $this->runtimeTurn($user, $session, $run, $profile);
        $staleToken = app(TalosExecutionClaimService::class)->claimTurn($user->id, (string) $turn->id, 'usage');
        $this->assertNotNull($staleToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();
        $method = new \ReflectionMethod(TalosAgentTurnService::class, 'accumulateUsage');

        try {
            $method->invoke(
                $this->service(new AgentTurnTestAdapter(finalImmediately: true)),
                $user->id,
                $turn->refresh(),
                new TokenUsage(10, 5, 15),
                $profile,
                $staleToken,
            );
            $this->fail('A stale worker changed provider usage.');
        } catch (TalosProviderRecoveryRequiredException) {
            // Expected fencing failure.
        }

        $this->assertSame([], $turn->refresh()->budget_usage);
        $this->assertSame('successor-turn-token', $turn->execution_lease_token);
    }

    public function test_a_stale_worker_cannot_append_a_provider_event(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $turn = $this->runtimeTurn($user, $session, $run, $profile);
        $staleToken = app(TalosExecutionClaimService::class)->claimTurn($user->id, (string) $turn->id, 'provider_start');
        $this->assertNotNull($staleToken);
        $turn->refresh()->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();
        $method = new \ReflectionMethod(TalosAgentTurnService::class, 'record');

        try {
            $method->invoke(
                $this->service(new AgentTurnTestAdapter(finalImmediately: true)),
                $user->id,
                $turn->refresh(),
                $staleToken,
                'provider.turn.started',
                ['response_id' => 'stale-response'],
            );
            $this->fail('A stale worker appended a provider event.');
        } catch (TalosProviderRecoveryRequiredException) {
            $this->addToAssertionCount(1);
        }

        $this->assertSame(0, $run->events()->where('event_type', 'provider.turn.started')->count());
    }

    public function test_a_persisted_call_without_its_guard_observation_fails_closed(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $turn = $this->runtimeTurn($user, $session, $run, $profile);
        $call = new ToolCall('provider-orphaned', 'web_search', ['query' => 'AVM'], null, []);
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls([$call]);
        \App\Models\TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => $call->providerCallId,
            'provider_call_id' => $call->providerCallId,
            'node_id' => 'node-orphaned',
            'tool_name' => $call->name,
            'node_type' => 'TOOL_WEB_SEARCH',
            'arguments' => $call->arguments,
            'canonical_call' => json_encode($call->toWireArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'execution_context' => '{}',
            'arguments_sha256' => 'sha256:'.hash('sha256', \Kadmos\Tool\ProceduralLoopGuard::canonicalJson($call->arguments)),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'orphaned'),
            'state_version' => 0,
            'risk' => 'low',
            'capability' => 'web.search',
            'status' => 'proposed',
            'attempt' => 0,
            'approval_state' => 'not_required',
        ]);
        $method = new \ReflectionMethod(TalosAgentTurnService::class, 'persistedReplayProviderCallIds');

        $this->expectException(TalosProviderRecoveryRequiredException::class);
        $method->invoke(
            $this->service(new AgentTurnTestAdapter(finalImmediately: true)),
            $turn,
            [$call],
            $checkpoint,
        );
    }

    private function service(ProviderTurnAdapter $adapter): TalosAgentTurnService
    {
        $gateway = new TalosProviderGateway(new AgentTurnTestResolver($adapter));

        return new TalosAgentTurnService(
            $gateway,
            $this->app->make(\Kadmos\Tool\ProceduralToolCompiler::class),
            $this->app->make(\App\Services\Talos\Agent\TalosToolDispatcher::class),
            $this->app->make(\App\Services\Talos\Agent\TalosGroundingGate::class),
            $this->app->make(\App\Services\Talos\Agent\TalosToolRepairPolicy::class),
            $this->app->make(\App\Services\Talos\Agent\TalosProviderToolArgumentValidator::class),
            $this->app->make(\App\Services\Runs\TalosRunEventRecorder::class),
            $this->app->make(TalosExecutionClaimService::class),
            $this->app->make(\App\Services\Talos\Agent\TalosAgentBudgetService::class),
            $this->app->make(\App\Services\Talos\Agent\TalosProceduralGuardCheckpointStore::class),
            $this->app->make(\App\Services\Talos\Browser\TalosBrowserArtifactReader::class),
        );
    }

    /** @return array{User, TalosSession, TalosRun, TalosModelProfile} */
    private function context(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Agent turn',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Agent test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'model_profile_id' => $profile->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'agent turn'),
            'prompt' => 'Continue with context.',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
        ]);

        return [$user, $session, $run, $profile];
    }

    private function runtimeTurn(
        User $user,
        TalosSession $session,
        TalosRun $run,
        TalosModelProfile $profile,
    ): TalosToolTurn {
        return TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'model_profile_id' => $profile->id,
            'status' => 'running',
            'provider' => $profile->provider,
            'model' => $profile->model,
            'adapter_version' => 'agent_test_v1',
            'pending_tool_call_ids' => [],
            'provider_round' => 0,
            'budget_policy' => ['max_calls' => 16],
            'budget_usage' => [],
            'started_at' => now(),
        ]);
    }
}

final class AgentTurnTestResolver implements TalosProviderAdapterResolver
{
    public function __construct(private readonly ProviderTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        return $this->adapter;
    }
}

final class AgentTurnTestAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    /** @var list<array{role: string, content: string}> */
    public array $receivedMessages = [];

    public function __construct(
        private readonly bool $finalImmediately,
        private readonly bool $throwOnStart = false,
        private readonly ?\Closure $onStart = null,
    ) {}

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'agent_test_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;
        $this->receivedMessages = $request->messages;
        ($this->onStart)?->__invoke();
        if ($this->throwOnStart) {
            throw new \RuntimeException('Provider response outcome is unknown.');
        }
        if ($this->finalImmediately) {
            return ProviderTurnResponse::final('Completed with durable context.', 'response-final', 'stop', new TokenUsage(10, 5, 15));
        }

        $call = new ToolCall('provider-search-1', 'web_search', ['query' => 'AVM'], null, []);

        return ProviderTurnResponse::toolCalls(
            null,
            [$call],
            new ProviderTurnState('openai', 'agent_test_v1', 'response-tools', 'test_state', ['marker' => 'continuation'], ['provider-search-1']),
            'response-tools',
            'tool_calls',
            new TokenUsage(10, 5, 15),
        );
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        if (count($toolResults) !== 1 || $toolResults[0]->toolUseId !== 'provider-search-1' || $toolResults[0]->isError) {
            throw new \RuntimeException('Continuation did not receive the canonical successful result.');
        }

        return ProviderTurnResponse::final('Grounded final answer.', 'response-grounded', 'stop', new TokenUsage(12, 6, 18));
    }
}

final class AgentTurnTestBackend implements TalosToolExecutionBackend
{
    /** @var list<string> */
    public array $executedTools = [];

    public function __construct(private readonly bool $persistEvidence = true) {}

    public function execute(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession = null): ToolResult
    {
        $this->executedTools[] = $node->call->name;
        $hash = 'sha256:'.hash('sha256', 'search evidence');
        $artifactId = 'missing-evidence-'.$node->call->providerCallId;
        if ($this->persistEvidence) {
            $artifact = TalosRunArtifact::query()->create([
                'run_id' => $turn->run_id,
                'artifact_type' => 'web_search_result',
                'uri' => 'talos-test-evidence://'.$node->call->providerCallId,
                'mime_type' => 'application/json',
                'metadata' => [
                    'tool_turn_id' => $turn->id,
                    'provider_call_id' => $node->call->providerCallId,
                    'sha256' => $hash,
                    'trust' => 'untrusted',
                ],
            ]);
            $artifactId = (string) $artifact->id;
        }

        return new ToolResult(
            $node->call->providerCallId,
            false,
            [['type' => 'text', 'text' => 'Verified search result.']],
            ['results' => [['title' => 'AVM']], 'evidence_ids' => [$artifactId]],
            [[
                'artifact_id' => $artifactId,
                'kind' => 'search_result',
                'sha256' => $hash,
                'trusted_boundary' => 'untrusted_web_content',
            ]],
        );
    }
}

final class InvalidThenRepairingAgentAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    public ?string $firstResultCode = null;

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'agent_repair_test_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;
        $call = new ToolCall('provider-invalid-search', 'web_search', ['query' => '', 'unexpected' => true], null, []);

        return ProviderTurnResponse::toolCalls(
            null,
            [$call],
            new ProviderTurnState('openai', 'agent_repair_test_v1', 'response-invalid', 'test_state', ['round' => 1], ['provider-invalid-search']),
            'response-invalid',
            'tool_calls',
            new TokenUsage(4, 2, 6),
        );
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        if ($this->continueCalls === 1) {
            $result = $toolResults[0] ?? null;
            if (! $result instanceof ToolResult || ! $result->isError) {
                throw new \RuntimeException('Invalid provider arguments reached physical execution.');
            }
            $this->firstResultCode = is_string($result->structuredContent['code'] ?? null)
                ? $result->structuredContent['code']
                : null;
            $call = new ToolCall('provider-repaired-search', 'web_search', ['query' => 'AVM'], null, []);

            return ProviderTurnResponse::toolCalls(
                null,
                [$call],
                new ProviderTurnState('openai', 'agent_repair_test_v1', 'response-repaired', 'test_state', ['round' => 2], ['provider-repaired-search']),
                'response-repaired',
                'tool_calls',
                new TokenUsage(4, 2, 6),
            );
        }

        $result = $toolResults[0] ?? null;
        if (! $result instanceof ToolResult || $result->isError || $result->toolUseId !== 'provider-repaired-search') {
            throw new \RuntimeException('Repaired provider call did not receive its canonical result.');
        }

        return ProviderTurnResponse::final('Grounded repaired answer.', 'response-final-repaired', 'stop', new TokenUsage(4, 2, 6));
    }
}

final class FailingContinueAgentAdapter implements ProviderTurnAdapter
{
    private AgentTurnTestAdapter $delegate;

    public function __construct()
    {
        $this->delegate = new AgentTurnTestAdapter(finalImmediately: false);
    }

    public function capabilities(): ProviderCapabilities
    {
        return $this->delegate->capabilities();
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        return $this->delegate->start($request);
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        throw new \RuntimeException('Provider continuation outcome is unknown.');
    }
}

final class FailingInvalidContinueAgentAdapter implements ProviderTurnAdapter
{
    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'agent_repair_test_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $call = new ToolCall('provider-invalid-search', 'web_search', ['query' => '', 'unexpected' => true], null, []);

        return ProviderTurnResponse::toolCalls(
            null,
            [$call],
            new ProviderTurnState('openai', 'agent_repair_test_v1', 'response-invalid', 'test_state', ['round' => 1], ['provider-invalid-search']),
            'response-invalid',
            'tool_calls',
            new TokenUsage(4, 2, 6),
        );
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        throw new \RuntimeException('Provider repair continuation outcome is unknown.');
    }
}
