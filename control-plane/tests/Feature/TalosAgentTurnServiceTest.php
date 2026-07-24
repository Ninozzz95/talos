<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Runs\TalosRunEventRecorder;
use App\Services\Talos\Agent\TalosAgentBudgetService;
use App\Services\Talos\Agent\TalosAgentTurnService;
use App\Services\Talos\Agent\TalosExecutionClaimService;
use App\Services\Talos\Agent\TalosGroundingGate;
use App\Services\Talos\Agent\TalosProceduralGuardCheckpoint;
use App\Services\Talos\Agent\TalosProceduralGuardCheckpointStore;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Agent\TalosProviderGateway;
use App\Services\Talos\Agent\TalosProviderOutcomeCodec;
use App\Services\Talos\Agent\TalosProviderRecoveryRequiredException;
use App\Services\Talos\Agent\TalosProviderToolArgumentValidator;
use App\Services\Talos\Agent\TalosToolDispatcher;
use App\Services\Talos\Agent\TalosToolExecutionBackend;
use App\Services\Talos\Agent\TalosToolRepairPolicy;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserArtifactReader;
use App\Services\Talos\Browser\TalosBrowserFollowUpResolver;
use App\Services\Talos\Browser\TalosBrowserRecoveryService;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderFailure;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ProceduralToolCompiler;
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

    public function test_agent_system_prompt_forbids_derived_urls_and_preserves_exact_machine_output_requests(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Restituisci soltanto un array JSON con gli URL osservati.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('completed', $outcome->status);
        $this->assertStringContainsString(
            'Never infer, reconstruct, predict, or guess a URL.',
            $adapter->receivedSystemPrompt,
        );
        $this->assertStringContainsString(
            'A ref, role, or name without an explicit href is not URL evidence.',
            $adapter->receivedSystemPrompt,
        );
        $this->assertStringContainsString(
            'return exactly that shape with no prose or code fences',
            $adapter->receivedSystemPrompt,
        );
    }

    public function test_deepseek_exact_json_array_uses_native_json_mode_and_persists_only_the_validated_envelope_value(): void
    {
        [$user, $session, $run, $profile] = $this->context('deepseek', 'deepseek-chat');
        $prompt = 'Restituisci esclusivamente un array JSON con marca e modello.';
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => $prompt,
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $run->forceFill([
            'prompt' => $prompt,
            'prompt_hash' => hash('sha256', $prompt),
        ])->save();
        $adapter = new AgentTurnTestAdapter(
            finalImmediately: true,
            provider: 'deepseek',
            finalText: '{"talos_output":[{"marca":"Opel","modello":"Corsa"}]}',
        );

        $outcome = $this->service($adapter)->execute($user->id, $run->refresh(), $profile);

        $expected = '[{"marca":"Opel","modello":"Corsa"}]';
        $this->assertSame('completed', $outcome->status, (string) $outcome->failureCode);
        $this->assertSame($expected, $outcome->text);
        $this->assertSame('application/json', $adapter->receivedResponseMimeType);
        $this->assertStringContainsString(
            '{"talos_output":[]}',
            $adapter->receivedSystemPrompt,
        );
        $this->assertSame(
            $expected,
            TalosMessage::query()
                ->where('run_id', $run->id)
                ->where('role', 'assistant')
                ->value('content'),
        );
    }

    public function test_deepseek_exact_json_array_fails_closed_when_the_provider_ignores_the_envelope(): void
    {
        [$user, $session, $run, $profile] = $this->context('deepseek', 'deepseek-chat');
        $prompt = 'Restituisci soltanto un array JSON con marca e modello.';
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => $prompt,
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $run->forceFill([
            'prompt' => $prompt,
            'prompt_hash' => hash('sha256', $prompt),
        ])->save();
        $adapter = new AgentTurnTestAdapter(
            finalImmediately: true,
            provider: 'deepseek',
            finalText: '[{"marca":"Opel","modello":"Corsa"}]',
        );

        $outcome = $this->service($adapter)->execute($user->id, $run->refresh(), $profile);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('TALOS_MACHINE_OUTPUT_INVALID', $outcome->failureCode);
        $this->assertSame(
            0,
            TalosMessage::query()
                ->where('run_id', $run->id)
                ->where('role', 'assistant')
                ->count(),
        );
    }

    public function test_request_local_current_user_context_replaces_only_the_provider_copy_of_that_turn(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create(['session_id' => $session->id, 'role' => 'user', 'content' => 'Earlier question.', 'metadata' => []]);
        TalosMessage::query()->create(['session_id' => $session->id, 'role' => 'assistant', 'content' => 'Earlier answer.', 'metadata' => []]);
        $current = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Upload the selected file.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);

        $outcome = $this->service($adapter)->execute(
            $user->id,
            $run,
            $profile,
            null,
            "TALOS_FILE_RESOURCE_MANIFEST_V1:\n{\"resources\":[{\"file_id\":\"authorized-id\"}]}\n\nUSER_TASK:\nUpload the selected file.",
        );

        $this->assertSame('completed', $outcome->status);
        $this->assertSame([
            ['role' => 'user', 'content' => 'Earlier question.'],
            ['role' => 'assistant', 'content' => 'Earlier answer.'],
            [
                'role' => 'user',
                'content' => "TALOS_FILE_RESOURCE_MANIFEST_V1:\n{\"resources\":[{\"file_id\":\"authorized-id\"}]}\n\nUSER_TASK:\nUpload the selected file.",
            ],
        ], $adapter->receivedMessages);
        $this->assertSame('Upload the selected file.', $current->refresh()->content);
        $this->assertSame('Earlier question.', $session->messages()->where('role', 'user')->whereNull('run_id')->value('content'));
    }

    public function test_agent_turn_appends_a_server_owned_directive_without_replacing_history(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create(['session_id' => $session->id, 'role' => 'user', 'content' => 'Earlier question.', 'metadata' => []]);
        TalosMessage::query()->create(['session_id' => $session->id, 'role' => 'assistant', 'content' => 'Earlier answer.', 'metadata' => []]);
        $current = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Cosa vedi qui?',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $run->forceFill(['prompt' => $current->content, 'prompt_hash' => hash('sha256', $current->content)])->save();
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-follow-up-directive',
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.com/current',
            'current_title' => 'Current page',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'expires_at' => now()->addHour(),
        ]);
        $adapter = new AgentTurnTestAdapter(finalImmediately: true);

        $outcome = $this->service($adapter)->execute($user->id, $run->refresh(), $profile, $browser);

        $this->assertSame('completed', $outcome->status, (string) $outcome->failureCode);
        $this->assertSame([
            ['role' => 'user', 'content' => 'Earlier question.'],
            ['role' => 'assistant', 'content' => 'Earlier answer.'],
            ['role' => 'user', 'content' => 'Cosa vedi qui?'],
        ], $adapter->receivedMessages);
        $this->assertStringContainsString('TALOS_BROWSER_FOLLOW_UP_DIRECTIVE_V1', $adapter->receivedSystemPrompt);
        $this->assertStringContainsString('browser_snapshot', $adapter->receivedSystemPrompt);
        $this->assertStringContainsString('https://example.com/current', $adapter->receivedSystemPrompt);
        $this->assertDatabaseCount('talos_browser_tasks', 0);
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

    public function test_browser_tool_round_persists_task_action_evidence_and_terminal_state(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Navigate to the example page.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-agent-task',
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/start',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $worker = new FakeBrowserSessionClient;
        $worker->inspectResponse = [
            'sessionId' => $browser->worker_session_id,
            'status' => 'active',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'capabilities' => $browser->capabilities,
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];
        $this->app->instance(BrowserSessionClient::class, $worker);
        $adapter = new AgentTurnTestAdapter(
            finalImmediately: false,
            toolName: 'browser_navigate',
            toolArguments: ['url' => 'https://example.test/target'],
        );
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile, $browser);

        $this->assertSame('completed', $outcome->status, (string) $outcome->failureCode);
        $this->assertSame(['browser_navigate'], $backend->executedTools);
        $task = TalosBrowserTask::query()
            ->where('user_id', $user->id)
            ->where('origin_message_id', $message->id)
            ->firstOrFail();
        $this->assertSame('completed', $task->status);
        $this->assertSame(5, $task->events()->count());
        $action = TalosBrowserAction::query()->where('task_id', $task->id)->firstOrFail();
        $this->assertSame('evidence_committed', $action->status);
        $this->assertNotNull($action->started_at);
        $this->assertNotNull($action->committed_at);
        $this->assertSame(1, $action->evidenceBundles()->count());
    }

    public function test_browser_result_replays_after_provider_continuation_recovery_without_a_second_dispatch(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Navigate once, then recover the provider continuation.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-agent-provider-recovery',
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/start',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $worker = new FakeBrowserSessionClient;
        $worker->inspectResponse = [
            'sessionId' => $browser->worker_session_id,
            'status' => 'active',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'capabilities' => $browser->capabilities,
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ];
        $this->app->instance(BrowserSessionClient::class, $worker);
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        $failing = new FailingContinueAgentAdapter(
            'browser_navigate',
            ['url' => 'https://example.test/target'],
        );

        $first = $this->service($failing)->execute($user->id, $run, $profile, $browser);

        $this->assertSame('recovery_required', $first->status);
        $task = TalosBrowserTask::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertSame('recovering', $task->status);
        $this->assertSame(['browser_navigate'], $backend->executedTools);
        $worker->inspectResponse['stateVersion'] = 1;
        $this->app->make(TalosBrowserRecoveryService::class)
            ->reconcile($user->id, $task->id, 'recover-agent-provider-continuation');
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
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
        $resuming = new AgentTurnTestAdapter(
            finalImmediately: false,
            toolName: 'browser_navigate',
            toolArguments: ['url' => 'https://example.test/target'],
        );

        $resumed = $this->service($resuming)->execute($user->id, $run->refresh(), $profile->refresh(), $browser->refresh());

        $this->assertSame('completed', $resumed->status, (string) $resumed->failureCode);
        $this->assertSame(['browser_navigate'], $backend->executedTools);
        $this->assertSame(0, $resuming->startCalls);
        $this->assertSame(1, $resuming->continueCalls);
        $this->assertSame('completed', $task->refresh()->status);
        $this->assertSame(1, TalosBrowserTask::query()->where('user_id', $user->id)->count());
        $this->assertSame(1, $task->actions()->count());
        $this->assertSame(1, $task->evidenceBundles()->count());
    }

    public function test_browser_backend_exception_quarantines_the_action_and_requires_recovery(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Navigate once even if the Browser process disconnects.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-agent-process-fault',
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/start',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $backend = new ThrowingBrowserAgentTurnBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        $adapter = new AgentTurnTestAdapter(
            finalImmediately: false,
            toolName: 'browser_navigate',
            toolArguments: ['url' => 'https://example.test/target'],
        );

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile, $browser);

        $this->assertSame('recovery_required', $outcome->status);
        $this->assertSame('TALOS_BROWSER_ACTION_OUTCOME_UNKNOWN', $outcome->failureCode);
        $this->assertSame(['browser_navigate'], $backend->executedTools);
        $task = TalosBrowserTask::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertSame('recovering', $task->status);
        $action = $task->actions()->firstOrFail();
        $this->assertSame('ambiguous', $action->status);
        $this->assertSame('TALOS_BROWSER_ACTION_OUTCOME_UNKNOWN', $action->error_code);
        $this->assertSame(0, $task->evidenceBundles()->count());
        $call = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail()->calls()->firstOrFail();
        $this->assertSame('recovery_required', $call->effect_status);
    }

    public function test_browser_canonical_error_result_fails_the_action_and_task_without_recovery(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Navigate once and report a deterministic worker rejection.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-agent-canonical-fault',
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/start',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $backend = new FailingBrowserAgentTurnBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        $adapter = new AgentTurnTestAdapter(
            finalImmediately: false,
            toolName: 'browser_navigate',
            toolArguments: ['url' => 'https://example.test/target'],
        );

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile, $browser);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('TALOS_BROWSER_NAVIGATION_FAILED', $outcome->failureCode);
        $this->assertSame(['browser_navigate'], $backend->executedTools);
        $task = TalosBrowserTask::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertSame('failed', $task->status);
        $action = $task->actions()->firstOrFail();
        $this->assertSame('failed', $action->status);
        $this->assertSame('TALOS_BROWSER_NAVIGATION_FAILED', $action->error_code);
        $this->assertSame(0, $task->evidenceBundles()->count());
        $call = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail()->calls()->firstOrFail();
        $this->assertSame('completed', $call->effect_status);
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
        $this->assertSame(503, $outcome->providerFailure?->httpStatus);
        $this->assertTrue($outcome->providerFailure?->retryable);
        $this->assertSame(0, $adapter->startCalls);
        $this->assertSame(0, $run->events()->where('event_type', 'agent.turn.failed')->count());
    }

    public function test_provider_failure_metadata_survives_initial_failure_and_checkpoint_resume(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Run a provider protocol turn.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new ProviderFailureAgentTurnTestAdapter(new ProviderFailure(
            'PROVIDER_PROTOCOL_ERROR',
            'The provider response failed protocol validation.',
            false,
            null,
            ['contract' => 'openai_chat_v1'],
        ));
        $service = $this->service($adapter);

        $first = $service->execute($user->id, $run, $profile);
        $second = $service->execute($user->id, $run->refresh(), $profile->refresh());

        $this->assertSame('failed', $first->status);
        $this->assertSame('PROVIDER_PROTOCOL_ERROR', $first->failureCode);
        $this->assertSame('PROVIDER_PROTOCOL_ERROR', $first->providerFailure?->code);
        $this->assertFalse($first->providerFailure?->retryable);
        $this->assertNull($first->providerFailure?->httpStatus);
        $this->assertSame('PROVIDER_PROTOCOL_ERROR', $second->providerFailure?->code);
        $this->assertFalse($second->providerFailure?->retryable);
        $this->assertSame(1, $adapter->startCalls);
        $event = $run->events()->where('event_type', 'agent.turn.failed')->firstOrFail();
        $this->assertSame(
            'PROVIDER_PROTOCOL_ERROR',
            $event->payload['provider_failure']['code'] ?? null,
        );
        $this->assertFalse($event->payload['provider_failure']['retryable'] ?? true);
        $this->assertNull($event->payload['provider_failure']['http_status'] ?? null);
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
            ->make(TalosProceduralGuardCheckpointStore::class)
            ->load($turn);
        $this->assertSame('provider-invalid-search', $checkpoint->logicalCallId('provider-repaired-search'));
        $this->assertSame(1, $checkpoint->repairAttempt('provider-repaired-search'));
        $persistedCall = $turn->calls()->where('provider_call_id', 'provider-repaired-search')->firstOrFail();
        $this->assertSame('provider-invalid-search', $persistedCall->logical_call_id);
        $this->assertSame(1, $persistedCall->attempt);
    }

    public function test_a_second_invalid_call_in_the_same_repair_lineage_fails_before_dispatch(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Use one repair opportunity, then fail closed.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new RepeatedInvalidAgentAdapter;
        $backend = new AgentTurnTestBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('TALOS_TOOL_ARGUMENTS_INVALID', $outcome->failureCode);
        $this->assertSame([], $backend->executedTools);
        $this->assertSame(1, $adapter->startCalls);
        $this->assertSame(1, $adapter->continueCalls);
        $this->assertSame(
            2,
            $run->events()->where('event_type', 'provider.tool_arguments.rejected')->count(),
        );
    }

    public function test_transient_tool_failures_receive_two_checkpointed_repairs_and_a_third_failure_is_terminal(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Retry a transient search failure within the bounded budget.',
            'run_id' => $run->id,
            'metadata' => [],
        ]);
        $adapter = new RepeatedTransientAgentAdapter;
        $backend = new AlwaysTransientAgentTurnBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $outcome = $this->service($adapter)->execute($user->id, $run, $profile);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('TALOS_WEB_SEARCH_TRANSIENT_FAILURE', $outcome->failureCode);
        $this->assertSame([
            'provider-transient-0',
            'provider-transient-1',
            'provider-transient-2',
        ], $backend->executedCallIds);
        $this->assertSame(1, $adapter->startCalls);
        $this->assertSame(2, $adapter->continueCalls);
        $turn = TalosToolTurn::query()->where('run_id', $run->id)->firstOrFail();
        $checkpoint = $this->app
            ->make(TalosProceduralGuardCheckpointStore::class)
            ->load($turn);
        $this->assertSame(2, $checkpoint->repairAttempt('provider-transient-0'));
        $this->assertSame(2, $checkpoint->repairAttempt('provider-transient-1'));
        $this->assertSame([0, 1, 2], $turn->calls()->orderBy('sequence')->pluck('attempt')->all());
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
            ->make(TalosProceduralGuardCheckpointStore::class)
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
            ->make(TalosProceduralGuardCheckpointStore::class)
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
        TalosToolCall::query()->create([
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
            'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($call->arguments)),
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

    public function test_replay_compilation_state_keeps_non_browser_calls_on_the_batch_base_state(): void
    {
        [$user, $session, $run, $profile] = $this->context();
        $turn = $this->runtimeTurn($user, $session, $run, $profile);
        $calls = [
            new ToolCall('provider-nav', 'browser_navigate', ['url' => 'https://example.test/target'], null, []),
            new ToolCall('provider-search', 'web_search', ['query' => 'AVM'], null, []),
        ];
        foreach ($calls as $index => $call) {
            TalosToolCall::query()->create([
                'tool_turn_id' => $turn->id,
                'run_id' => $run->id,
                'user_id' => $user->id,
                'sequence' => $index + 1,
                'logical_call_id' => $call->providerCallId,
                'provider_call_id' => $call->providerCallId,
                'node_id' => 'node-'.$index,
                'tool_name' => $call->name,
                'node_type' => $call->name === 'browser_navigate' ? 'TOOL_BROWSER_NAVIGATE' : 'TOOL_WEB_SEARCH',
                'arguments' => $call->arguments,
                'canonical_call' => json_encode($call->toWireArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'execution_context' => '{}',
                'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($call->arguments)),
                'dependencies' => [],
                'fingerprint' => 'sha256:'.hash('sha256', 'replay-'.$index),
                'state_version' => 0,
                'risk' => 'low',
                'capability' => $call->name === 'browser_navigate' ? 'browser.read' : 'web.search',
                'status' => 'succeeded',
                'attempt' => 0,
                'approval_state' => 'not_required',
            ]);
        }
        $method = new \ReflectionMethod(TalosAgentTurnService::class, 'compilationStateVersion');

        self::assertSame(0, $method->invoke(
            $this->service(new AgentTurnTestAdapter(finalImmediately: true)),
            $turn,
            $calls,
            null,
        ));
    }

    private function service(ProviderTurnAdapter $adapter): TalosAgentTurnService
    {
        $gateway = new TalosProviderGateway(new AgentTurnTestResolver($adapter));

        return new TalosAgentTurnService(
            $gateway,
            $this->app->make(ProceduralToolCompiler::class),
            $this->app->make(TalosToolDispatcher::class),
            $this->app->make(TalosGroundingGate::class),
            $this->app->make(TalosToolRepairPolicy::class),
            $this->app->make(TalosProviderToolArgumentValidator::class),
            $this->app->make(TalosRunEventRecorder::class),
            $this->app->make(TalosExecutionClaimService::class),
            $this->app->make(TalosAgentBudgetService::class),
            $this->app->make(TalosProceduralGuardCheckpointStore::class),
            $this->app->make(TalosBrowserArtifactReader::class),
            $this->app->make(TalosBrowserFollowUpResolver::class),
            $this->app->make(TalosBrowserTaskRuntime::class),
        );
    }

    /** @return array{User, TalosSession, TalosRun, TalosModelProfile} */
    private function context(string $provider = 'openai', string $model = 'gpt-test'): array
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
            'provider' => $provider,
            'model' => $model,
            'display_name' => 'Agent test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => $provider === 'deepseek'
                ? 'https://api.deepseek.com/v1'
                : 'https://api.openai.com/v1',
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
            'provider' => $provider,
            'model' => $model,
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

    public string $receivedSystemPrompt = '';

    public ?string $receivedResponseMimeType = null;

    public function __construct(
        private readonly bool $finalImmediately,
        private readonly bool $throwOnStart = false,
        private readonly ?\Closure $onStart = null,
        private readonly string $toolName = 'web_search',
        private readonly array $toolArguments = ['query' => 'AVM'],
        private readonly string $provider = 'openai',
        private readonly string $finalText = 'Completed with durable context.',
    ) {}

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities($this->provider, 'agent_test_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;
        $this->receivedMessages = $request->messages;
        $this->receivedSystemPrompt = $request->systemPrompt;
        $this->receivedResponseMimeType = $request->responseMimeType;
        ($this->onStart)?->__invoke();
        if ($this->throwOnStart) {
            throw new \RuntimeException('Provider response outcome is unknown.');
        }
        if ($this->finalImmediately) {
            return ProviderTurnResponse::final($this->finalText, 'response-final', 'stop', new TokenUsage(10, 5, 15));
        }

        $call = new ToolCall('provider-search-1', $this->toolName, $this->toolArguments, null, []);

        return ProviderTurnResponse::toolCalls(
            null,
            [$call],
            new ProviderTurnState($this->provider, 'agent_test_v1', 'response-tools', 'test_state', ['marker' => 'continuation'], ['provider-search-1']),
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

final class ProviderFailureAgentTurnTestAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public function __construct(private readonly ProviderFailure $failure) {}

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'provider_failure_test_v1', true, false, false, false, false, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;

        return ProviderTurnResponse::failure($this->failure);
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        throw new \RuntimeException('A terminal provider failure must not continue.');
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
        $browserTool = str_starts_with($node->call->name, 'browser_');
        if ($node->call->name === 'browser_navigate' && $browserSession instanceof TalosBrowserSession) {
            $browserSession->forceFill([
                'current_url' => (string) ($node->call->arguments['url'] ?? $browserSession->current_url),
                'current_title' => 'Navigated page',
                'worker_state_version' => $node->context->stateVersion + 1,
                'last_seen_at' => now(),
            ])->save();
        }
        $observation = [
            'url' => $browserSession?->current_url ?? 'https://example.test/',
            'title' => $browserSession?->current_title ?? '',
        ];
        $hash = $browserTool
            ? 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($observation))
            : 'sha256:'.hash('sha256', 'search evidence');
        $artifactId = 'missing-evidence-'.$node->call->providerCallId;
        if ($this->persistEvidence) {
            $artifactUri = $browserTool
                ? 'talos-tool-evidence://'.hash('sha256', implode('|', [
                    (string) $turn->id,
                    $node->call->providerCallId,
                    'browser_navigation',
                    '0',
                ]))
                : 'talos-test-evidence://'.$node->call->providerCallId;
            $artifact = TalosRunArtifact::query()->create([
                'run_id' => $turn->run_id,
                'artifact_type' => $browserTool ? 'browser_navigation' : 'web_search_result',
                'uri' => $artifactUri,
                'mime_type' => 'application/json',
                'metadata' => [
                    ...($browserTool ? [
                        'browser_session_id' => $browserSession?->id,
                        'observation' => $observation,
                    ] : []),
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
                'kind' => $browserTool ? 'navigation' : 'search_result',
                'sha256' => $hash,
                'trusted_boundary' => $browserTool ? 'untrusted_browser_content' : 'untrusted_web_content',
            ]],
        );
    }
}

final class ThrowingBrowserAgentTurnBackend implements TalosToolExecutionBackend
{
    /** @var list<string> */
    public array $executedTools = [];

    public function execute(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession = null): ToolResult
    {
        $this->executedTools[] = $node->call->name;

        throw new \RuntimeException('Simulated Browser transport disconnect after dispatch.');
    }
}

final class FailingBrowserAgentTurnBackend implements TalosToolExecutionBackend
{
    /** @var list<string> */
    public array $executedTools = [];

    public function execute(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession = null): ToolResult
    {
        $this->executedTools[] = $node->call->name;

        return ToolResult::error(
            $node->call->providerCallId,
            'TALOS_BROWSER_NAVIGATION_FAILED',
            'The Browser worker rejected the navigation deterministically.',
        );
    }
}

final class AlwaysTransientAgentTurnBackend implements TalosToolExecutionBackend
{
    /** @var list<string> */
    public array $executedCallIds = [];

    public function execute(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession = null): ToolResult
    {
        $this->executedCallIds[] = $node->call->providerCallId;

        return ToolResult::error(
            $node->call->providerCallId,
            'TALOS_WEB_SEARCH_TRANSIENT_FAILURE',
            'The search transport failed transiently.',
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

final class RepeatedInvalidAgentAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'agent_repair_test_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;

        return $this->invalidResponse('provider-invalid-initial', 'response-invalid-initial', 1);
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        $result = $toolResults[0] ?? null;
        if (! $result instanceof ToolResult
            || ! $result->isError
            || ($result->structuredContent['code'] ?? null) !== 'TALOS_TOOL_ARGUMENTS_INVALID') {
            throw new \RuntimeException('The provider did not receive the canonical argument-repair result.');
        }
        if ($this->continueCalls > 1) {
            throw new \RuntimeException('A second malformed call was incorrectly admitted for repair.');
        }

        return $this->invalidResponse('provider-invalid-again', 'response-invalid-again', 2);
    }

    private function invalidResponse(string $callId, string $responseId, int $round): ProviderTurnResponse
    {
        $call = new ToolCall($callId, 'web_search', ['query' => '', 'unexpected' => true], null, []);

        return ProviderTurnResponse::toolCalls(
            null,
            [$call],
            new ProviderTurnState(
                'openai',
                'agent_repair_test_v1',
                $responseId,
                'test_state',
                ['round' => $round],
                [$callId],
            ),
            $responseId,
            'tool_calls',
            new TokenUsage(4, 2, 6),
        );
    }
}

final class RepeatedTransientAgentAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'agent_transient_test_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;

        return $this->toolResponse(0);
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        $result = $toolResults[0] ?? null;
        if (! $result instanceof ToolResult
            || ! $result->isError
            || ($result->structuredContent['code'] ?? null) !== 'TALOS_WEB_SEARCH_TRANSIENT_FAILURE') {
            throw new \RuntimeException('The provider did not receive the canonical transient tool result.');
        }
        if ($this->continueCalls > 2) {
            throw new \RuntimeException('The transient repair budget admitted an extra provider continuation.');
        }

        return $this->toolResponse($this->continueCalls);
    }

    private function toolResponse(int $round): ProviderTurnResponse
    {
        $callId = 'provider-transient-'.$round;
        $responseId = 'response-transient-'.$round;
        $call = new ToolCall($callId, 'web_search', ['query' => 'AVM transient retry'], null, []);

        return ProviderTurnResponse::toolCalls(
            null,
            [$call],
            new ProviderTurnState(
                'openai',
                'agent_transient_test_v1',
                $responseId,
                'test_state',
                ['round' => $round],
                [$callId],
            ),
            $responseId,
            'tool_calls',
            new TokenUsage(4, 2, 6),
        );
    }
}

final class FailingContinueAgentAdapter implements ProviderTurnAdapter
{
    private AgentTurnTestAdapter $delegate;

    public function __construct(
        string $toolName = 'web_search',
        array $toolArguments = ['query' => 'AVM'],
    ) {
        $this->delegate = new AgentTurnTestAdapter(
            finalImmediately: false,
            toolName: $toolName,
            toolArguments: $toolArguments,
        );
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
