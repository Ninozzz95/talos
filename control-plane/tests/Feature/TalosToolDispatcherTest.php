<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosApprovalService;
use App\Services\Talos\Agent\TalosBudgetExceededException;
use App\Services\Talos\Agent\TalosExecutionClaimService;
use App\Services\Talos\Agent\TalosProceduralGuardCheckpoint;
use App\Services\Talos\Agent\TalosToolDispatcher;
use App\Services\Talos\Agent\TalosToolExecutionBackend;
use App\Services\Talos\Agent\TalosToolRecoveryRequiredException;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserRunArtifactCorrelator;
use App\Services\Talos\Browser\TalosBrowserTakeoverService;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Kadmos\Tool\ProceduralBudget;
use Kadmos\Tool\ProceduralCompileContext;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ProceduralPlan;
use Kadmos\Tool\ProceduralToolCompiler;
use Kadmos\Tool\ProceduralToolSpec;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolResult;
use Tests\TestCase;

final class TalosToolDispatcherTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $fake = Storage::fake('dispatcher-evidence-'.str()->uuid());
        Storage::set('local', $fake);
    }

    public function test_dispatch_rejects_a_plan_compiled_from_a_non_bundled_registry_before_side_effects(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $context = new ProceduralCompileContext(
            userId: (string) $user->id,
            chatSessionId: (string) $session->id,
            runId: (string) $run->id,
            turnId: (string) $turn->id,
            browserSessionId: (string) $browser->id,
            stateVersion: 0,
            deadlineAt: now()->addMinute()->toIso8601String(),
            observedAt: now()->toIso8601String(),
        );
        $externalRegistry = [
            ...$this->registry(),
            'remote_only' => new ProceduralToolSpec(
                'remote_only',
                'TOOL_REMOTE_ONLY',
                'remote.read',
                'low',
                false,
                true,
                false,
                true,
            ),
        ];
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-remote-only', 'remote_only', [], null, [])],
            $context,
            registry: $externalRegistry,
        );
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        try {
            $this->app->make(TalosToolDispatcher::class)->dispatch(
                $user->id,
                $turn,
                $this->claimTurnLease($user, $turn),
                $plan,
                $checkpoint,
                $browser,
            );
            $this->fail('A non-bundled procedural plan must fail before dispatch.');
        } catch (InvalidArgumentException $exception) {
            $this->assertSame('Procedural plan contains a tool outside the bundled TALOS registry.', $exception->getMessage());
        }

        $this->assertSame([], $backend->executedTools);
        $this->assertDatabaseCount('talos_tool_calls', 0);
        $this->assertDatabaseCount('talos_tool_results', 0);
    }

    public function test_server_browser_policy_denial_never_reaches_the_physical_backend(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $browser->update([
            'policy' => [
                'browser_action_policy' => ['allowed_domains' => ['allowed.example']],
            ],
        ]);
        $origin = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Navigate to a blocked domain.',
        ]);
        $task = TalosBrowserTask::query()->create([
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'origin_message_id' => $origin->id,
            'browser_session_id' => $browser->id,
            'goal' => 'Navigate under the server domain policy.',
            'status' => 'running',
            'autonomy_profile' => 'observe',
            'budget' => ['max_actions' => 8, 'max_elapsed_ms' => 60_000, 'max_bytes' => 1_000_000, 'max_tabs' => 4],
            'state_version' => 3,
            'requested_at' => now(),
            'started_at' => now(),
        ]);
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-policy-denied', 'browser_navigate', ['url' => 'https://blocked.example/'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $report = $this->app->make(TalosToolDispatcher::class)->dispatch(
            $user->id,
            $turn,
            $this->claimTurnLease($user, $turn),
            $plan,
            $checkpoint,
            $browser->refresh(),
        );

        $this->assertSame([], $backend->executedTools);
        $this->assertSame('failed', $report->status);
        $this->assertSame('browser_policy_domain_denied', $turn->results()->firstOrFail()->error_code);
        $this->assertSame('denied', $task->actions()->firstOrFail()->status);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $run->id,
            'event_type' => 'tool.execution.denied',
        ]);
    }

    public function test_active_human_takeover_pauses_model_dispatch_before_the_backend(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $origin = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Pause for human takeover.',
        ]);
        $task = TalosBrowserTask::query()->create([
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'origin_message_id' => $origin->id,
            'browser_session_id' => $browser->id,
            'goal' => 'Pause model execution during human control.',
            'status' => 'running',
            'autonomy_profile' => 'observe',
            'budget' => ['max_actions' => 8, 'max_elapsed_ms' => 60_000, 'max_bytes' => 1_000_000, 'max_tabs' => 4],
            'state_version' => 3,
            'requested_at' => now(),
            'started_at' => now(),
        ]);
        $this->app->make(TalosBrowserTakeoverService::class)->acquire(
            $user->id,
            $task->id,
            'dispatcher-human',
            60,
            'dispatcher-takeover',
        );
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-paused', 'browser_navigate', ['url' => 'https://example.test/'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $report = $this->app->make(TalosToolDispatcher::class)->dispatch(
            $user->id,
            $turn,
            $this->claimTurnLease($user, $turn),
            $plan,
            $checkpoint,
            $browser,
        );

        $this->assertSame([], $backend->executedTools);
        $this->assertSame('failed', $report->status);
        $this->assertSame('TALOS_BROWSER_HUMAN_TAKEOVER_ACTIVE', $turn->results()->firstOrFail()->error_code);
    }

    public function test_commits_compiled_calls_and_guard_before_the_first_physical_effect(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $call = new ToolCall('provider-atomic', 'web_search', ['query' => 'AVM'], null, []);
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls([$call]);
        $plan = (new ProceduralToolCompiler)->compile(
            [$call],
            $this->registry(),
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
            new ProceduralBudget,
            $checkpoint->guard(),
        );
        $leaseToken = app(TalosExecutionClaimService::class)->claimTurn($user->id, (string) $turn->id, 'tool_dispatch');
        $this->assertNotNull($leaseToken);
        $backend = new RecordingToolExecutionBackend(function () use ($turn, $checkpoint): void {
            $observed = $turn->refresh();
            $this->assertSame(1, $observed->calls()->where('provider_call_id', 'provider-atomic')->count());
            $this->assertSame('sha256:'.hash('sha256', $checkpoint->encode()), $observed->loop_guard_state_sha256);
        });
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $report = $this->app->make(TalosToolDispatcher::class)->dispatch(
            $user->id,
            $turn,
            $leaseToken,
            $plan,
            $checkpoint,
            $browser,
            $checkpoint->logicalCallIdsFor([$call]),
            $checkpoint->repairAttemptsFor([$call]),
        );

        $this->assertSame('completed', $report->status);
        $this->assertSame(['web_search'], $backend->executedTools);
    }

    public function test_a_stale_turn_lease_cannot_persist_calls_guard_or_dag_state(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $call = new ToolCall('provider-stale', 'web_search', ['query' => 'AVM'], null, []);
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls([$call]);
        $plan = (new ProceduralToolCompiler)->compile(
            [$call],
            $this->registry(),
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
            new ProceduralBudget,
            $checkpoint->guard(),
        );
        $staleToken = app(TalosExecutionClaimService::class)->claimTurn($user->id, (string) $turn->id, 'tool_dispatch');
        $this->assertNotNull($staleToken);
        $turn->forceFill([
            'execution_lease_token' => 'successor-turn-token',
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_lease_phase' => 'successor',
        ])->save();

        try {
            $this->app->make(TalosToolDispatcher::class)->dispatch(
                $user->id,
                $turn->refresh(),
                $staleToken,
                $plan,
                $checkpoint,
                $browser,
                $checkpoint->logicalCallIdsFor([$call]),
                $checkpoint->repairAttemptsFor([$call]),
            );
            $this->fail('A stale turn lease mutated procedural runtime state.');
        } catch (TalosToolRecoveryRequiredException $exception) {
            $this->assertSame('TALOS_TOOL_RECOVERY_REQUIRED', $exception->faultCode);
        }

        $fresh = $turn->refresh();
        $this->assertSame(0, $fresh->calls()->count());
        $this->assertNull($fresh->loop_guard_state);
        $this->assertNull($fresh->dag_state);
        $this->assertSame('successor-turn-token', $fresh->execution_lease_token);
    }

    public function test_a_turn_fenced_after_call_claim_cannot_cross_the_backend_effect_boundary(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-boundary', 'web_search', ['query' => 'AVM'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $leaseToken = $this->claimTurnLease($user, $turn);
        $fenceOnStartedEvent = true;
        \DB::listen(function ($query) use (&$fenceOnStartedEvent, $turn): void {
            if (! $fenceOnStartedEvent
                || ! str_contains(strtolower((string) $query->sql), 'insert into "talos_run_events"')) {
                return;
            }

            $fenceOnStartedEvent = false;
            TalosToolTurn::query()->whereKey($turn->id)->update([
                'execution_lease_token' => 'successor-turn-token',
                'execution_lease_expires_at' => now()->addMinute(),
                'execution_lease_phase' => 'successor',
            ]);
        });

        try {
            $this->app->make(TalosToolDispatcher::class)->dispatch(
                $user->id,
                $turn,
                $leaseToken,
                $plan,
                $checkpoint,
                $browser,
            );
            $this->fail('A stale worker crossed the physical backend boundary.');
        } catch (TalosToolRecoveryRequiredException) {
            $this->addToAssertionCount(1);
        }

        $this->assertSame([], $backend->executedTools);
        $call = $turn->calls()->where('provider_call_id', 'provider-boundary')->firstOrFail();
        $this->assertSame('recovery_required', $call->status);
        $this->assertSame('recovery_required', $call->effect_status);
        $this->assertSame('successor-turn-token', $turn->refresh()->execution_lease_token);
    }

    public function test_dispatches_a_compiled_dag_in_dependency_order_and_persists_canonical_results(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $browserTask = $this->beginBrowserTask($user, $session, $run, $browser);
        $backend = $this->durableRecordingBackend();
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        [$plan, $checkpoint] = $this->compilePlan(
            [
                new ToolCall('provider-nav', 'browser_navigate', ['url' => 'https://example.com'], null, []),
                new ToolCall('provider-snapshot', 'browser_snapshot', [], null, []),
            ],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $leaseToken = $this->claimTurnLease($user, $turn);

        $report = $this->app->make(TalosToolDispatcher::class)->dispatch(
            $user->id,
            $turn,
            $leaseToken,
            $plan,
            $checkpoint,
            $browser,
            $checkpoint->logicalCallIdsFor(array_map(static fn (ProceduralNode $node): ToolCall => $node->call, $plan->nodes)),
            $checkpoint->repairAttemptsFor(array_map(static fn (ProceduralNode $node): ToolCall => $node->call, $plan->nodes)),
            browserTask: $browserTask,
        );

        $this->assertSame('completed', $report->status);
        $this->assertSame(['browser_navigate', 'browser_snapshot'], $backend->executedTools);
        $this->assertCount(2, $report->results);
        $this->assertSame([], $report->waitingApprovalCallIds);
        $this->assertSame([], $report->blockedCallIds);
        $this->assertSame(2, $turn->calls()->where('status', 'succeeded')->count());
        $this->assertSame(2, $turn->results()->where('status', 'succeeded')->count());
        $this->assertSame(2, $turn->budgetReservations()->where('resource', 'calls')->where('status', 'settled')->count());
        $this->assertNotNull($turn->refresh()->dag_state);
        $this->assertStringNotContainsString(
            'provider-nav',
            (string) \DB::table('talos_tool_turns')->where('id', $turn->id)->value('dag_state'),
        );
        $this->assertSame(
            ['tool.execution.started', 'tool.execution.completed', 'tool.execution.started', 'tool.execution.completed'],
            $run->events()->orderBy('sequence')->pluck('event_type')->all(),
        );
        $this->assertSame(2, $browserTask->actions()->where('status', 'evidence_committed')->count());
        $this->assertSame(2, TalosBrowserEvidenceBundle::query()
            ->where('task_id', $browserTask->id)
            ->whereNotNull('reconciled_at')
            ->count());
    }

    public function test_persists_repaired_provider_calls_under_their_stable_logical_attempt(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        $call = new ToolCall('provider-repaired', 'web_search', ['query' => 'AVM'], null, []);
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls([
            new ToolCall('provider-original', 'web_search', ['query' => ''], null, []),
        ]);
        $checkpoint->incrementRepair('provider-original');
        [$plan, $checkpoint] = $this->compilePlan(
            [$call],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
                retryProviderCallIds: ['provider-repaired'],
                logicalCallIdsByProviderCallId: ['provider-repaired' => 'provider-original'],
            ),
            checkpoint: $checkpoint,
            repairSourceProviderCallIds: ['provider-original'],
        );
        $leaseToken = $this->claimTurnLease($user, $turn);

        $report = $this->app->make(TalosToolDispatcher::class)->dispatch(
            $user->id,
            $turn,
            $leaseToken,
            $plan,
            $checkpoint,
            $browser,
            ['provider-repaired' => 'provider-original'],
            ['provider-repaired' => 1],
        );

        $this->assertSame('completed', $report->status);
        $persisted = $turn->calls()->where('provider_call_id', 'provider-repaired')->firstOrFail();
        $this->assertSame('provider-original', $persisted->logical_call_id);
        $this->assertSame(1, $persisted->attempt);
    }

    public function test_safe_sibling_completes_while_high_risk_node_waits_then_resume_consumes_exact_approval_once(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $browser->forceFill([
            'capabilities' => [...$browser->capabilities, 'hmiActions' => true],
        ])->save();
        $browserTask = $this->beginBrowserTask($user, $session, $run, $browser);
        $backend = $this->durableRecordingBackend();
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        [$plan, $checkpoint] = $this->compilePlan(
            [
                new ToolCall('provider-click', 'browser_click', ['ref' => 'r1'], null, []),
                new ToolCall('provider-search', 'web_search', ['query' => 'AVM'], null, []),
            ],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $dispatcher = $this->app->make(TalosToolDispatcher::class);
        $leaseToken = $this->claimTurnLease($user, $turn);

        $waiting = $dispatcher->dispatch($user->id, $turn, $leaseToken, $plan, $checkpoint, $browser, browserTask: $browserTask);

        $this->assertSame('awaiting_approval', $waiting->status);
        $this->assertSame(['web_search'], $backend->executedTools);
        $this->assertCount(1, $waiting->waitingApprovalCallIds);
        $approvalCall = $turn->calls()->findOrFail($waiting->waitingApprovalCallIds[0]);
        $turn->forceFill(['status' => 'awaiting_approval'])->save();
        $this->assertTrue(
            $this->app->make(TalosExecutionClaimService::class)->releaseTurn(
                $user->id,
                (string) $turn->id,
                $leaseToken,
            ),
            'The worker lease must be released before an operator can approve the paused turn.',
        );
        $this->app->make(TalosApprovalService::class)->approve(
            (string) $approvalCall->id,
            $user->id,
            (string) $approvalCall->approval_payload_sha256,
        );
        $resumeLeaseToken = $this->claimTurnLease($user, $turn->refresh());

        $completed = $dispatcher->dispatch($user->id, $turn->refresh(), $resumeLeaseToken, $plan, $checkpoint, $browser->refresh(), browserTask: $browserTask->refresh());

        $this->assertSame('completed', $completed->status);
        $this->assertSame(['web_search', 'browser_click'], $backend->executedTools);
        $this->assertCount(2, $completed->results);
        $this->assertSame(2, $turn->results()->count());
        $this->assertSame('claimed', $approvalCall->refresh()->approval_state);
        $this->assertSame('evidence_committed', $browserTask->actions()->firstOrFail()->status);
        $this->assertNotNull(TalosBrowserEvidenceBundle::query()
            ->where('task_id', $browserTask->id)
            ->firstOrFail()
            ->reconciled_at);

        $replayed = $dispatcher->dispatch($user->id, $turn->refresh(), $resumeLeaseToken, $plan, $checkpoint, $browser->refresh(), browserTask: $browserTask->refresh());
        $this->assertSame('completed', $replayed->status);
        $this->assertSame(['web_search', 'browser_click'], $backend->executedTools);
    }

    public function test_server_budget_denial_prevents_physical_execution_and_releases_partial_reservations(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $turn->update(['budget_policy' => [...$turn->budget_policy, 'max_navigations' => 0]]);
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-denied-nav', 'browser_navigate', ['url' => 'https://example.com'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $leaseToken = $this->claimTurnLease($user, $turn);

        try {
            $this->app->make(TalosToolDispatcher::class)->dispatch(
                $user->id,
                $turn->refresh(),
                $leaseToken,
                $plan,
                $checkpoint,
                $browser,
            );
            $this->fail('Navigation crossed an exhausted server-side budget.');
        } catch (InvalidArgumentException $exception) {
            $this->assertStringContainsString('navigations', $exception->getMessage());
        }

        $this->assertSame([], $backend->executedTools);
        $this->assertSame(0, $turn->budgetReservations()->where('status', 'reserved')->count());
    }

    public function test_browser_task_budget_denial_persists_denied_action_without_backend_execution(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Do not cross the Browser task action limit.',
        ]);
        $task = $this->app->make(TalosBrowserTaskRuntime::class)->begin($user->id, $run, $browser);
        $task->forceFill(['budget' => [...$task->budget, 'max_actions' => 1]])->save();
        TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $task->talos_session_id,
            'intent_id' => 'already-consumed-intent',
            'sequence' => 1,
            'kind' => 'snapshot',
            'arguments' => [],
            'expected_state_version' => $task->state_version,
            'risk' => 'read',
            'idempotency_key' => 'sha256:'.hash('sha256', 'already-consumed-action'),
            'preconditions' => [],
            'status' => 'committed',
            'requested_at' => now(),
            'approved_at' => now(),
            'started_at' => now(),
            'committed_at' => now(),
        ]);
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-task-budget-nav', 'browser_navigate', ['url' => 'https://example.com'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);

        $report = $this->app->make(TalosToolDispatcher::class)->dispatch(
            $user->id,
            $turn,
            $this->claimTurnLease($user, $turn),
            $plan,
            $checkpoint,
            $browser,
            browserTask: $task->refresh(),
        );

        $this->assertSame('failed', $report->status);
        $this->assertSame([], $backend->executedTools);
        $action = TalosBrowserAction::query()->where('task_id', $task->id)->where('status', 'denied')->firstOrFail();
        $this->assertSame('denied', $action->status);
        $this->assertNull($action->started_at);
        $this->assertSame('TALOS_BROWSER_BUDGET_EXHAUSTED', $action->error_code);
        $this->assertSame('TALOS_BROWSER_BUDGET_EXHAUSTED', $turn->results()->firstOrFail()->error_code);
    }

    public function test_an_expired_in_flight_effect_is_never_executed_again_without_downstream_deduplication(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-search-recovery', 'web_search', ['query' => 'AVM'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $node = $plan->nodes[0];
        $redacted = $node->call->toRedactedArray();
        $call = TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => $node->call->providerCallId,
            'provider_call_id' => $node->call->providerCallId,
            'node_id' => $node->id,
            'tool_name' => $node->call->name,
            'node_type' => $node->type,
            'arguments' => $redacted['arguments'],
            'canonical_call' => json_encode($node->call->toWireArray(), JSON_THROW_ON_ERROR),
            'execution_context' => json_encode($node->context->toArray(), JSON_THROW_ON_ERROR),
            'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($node->call->arguments)),
            'dependencies' => $node->dependencies,
            'fingerprint' => $node->fingerprint,
            'state_version' => $node->context->stateVersion,
            'risk' => $node->context->risk,
            'capability' => $node->context->capability,
            'status' => 'running',
            'attempt' => 0,
            'execution_token' => 'stale-effect-token',
            'execution_lease_expires_at' => now()->subSecond(),
            'effect_key' => $node->context->idempotencyKey,
            'effect_status' => 'in_flight',
            'approval_state' => 'not_required',
        ]);
        $leaseToken = $this->claimTurnLease($user, $turn);

        try {
            $this->app->make(TalosToolDispatcher::class)->dispatch(
                $user->id,
                $turn,
                $leaseToken,
                $plan,
                $checkpoint,
                $browser,
            );
            $this->fail('An uncertain physical effect was replayed.');
        } catch (TalosToolRecoveryRequiredException $exception) {
            $this->assertSame('TALOS_TOOL_RECOVERY_REQUIRED', $exception->faultCode);
        }

        $this->assertSame([], $backend->executedTools);
        $this->assertSame('recovery_required', $call->refresh()->status);
        $this->assertSame(0, $call->results()->count());
    }

    public function test_evidence_bytes_budget_is_enforced_before_a_successful_result_enters_the_dag(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $turn->update(['budget_policy' => [...$turn->budget_policy, 'max_evidence_bytes' => 1]]);
        $backend = new RecordingToolExecutionBackend;
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-search-budget', 'web_search', ['query' => 'AVM'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $leaseToken = $this->claimTurnLease($user, $turn);

        $report = $this->app->make(TalosToolDispatcher::class)->dispatch(
            $user->id,
            $turn,
            $leaseToken,
            $plan,
            $checkpoint,
            $browser,
        );

        $this->assertSame('failed', $report->status);
        $this->assertSame(['web_search'], $backend->executedTools);
        $this->assertCount(1, $report->results);
        $this->assertTrue($report->results[0]->isError);
        $this->assertSame(
            'TALOS_TOOL_EVIDENCE_BYTES_BUDGET_EXHAUSTED',
            $report->results[0]->structuredContent['code'] ?? null,
        );
        $this->assertSame('failed', $turn->calls()->firstOrFail()->status);
    }

    public function test_an_effect_completed_before_evidence_accounting_loses_its_fence_is_quarantined(): void
    {
        [$user, $session, $run, $turn, $browser] = $this->context();
        $backend = new RecordingToolExecutionBackend(function () use ($turn): void {
            $turn->refresh()->forceFill([
                'execution_lease_token' => 'successor-turn-token',
                'execution_lease_expires_at' => now()->addMinute(),
                'execution_lease_phase' => 'successor',
            ])->save();
        });
        $this->app->instance(TalosToolExecutionBackend::class, $backend);
        [$plan, $checkpoint] = $this->compilePlan(
            [new ToolCall('provider-evidence-fence', 'web_search', ['query' => 'AVM'], null, [])],
            new ProceduralCompileContext(
                userId: (string) $user->id,
                chatSessionId: (string) $session->id,
                runId: (string) $run->id,
                turnId: (string) $turn->id,
                browserSessionId: (string) $browser->id,
                stateVersion: 0,
                deadlineAt: now()->addMinute()->toIso8601String(),
                observedAt: now()->toIso8601String(),
            ),
        );
        $leaseToken = $this->claimTurnLease($user, $turn);

        try {
            $this->app->make(TalosToolDispatcher::class)->dispatch(
                $user->id,
                $turn,
                $leaseToken,
                $plan,
                $checkpoint,
                $browser,
            );
            $this->fail('An unaccounted physical effect was not quarantined.');
        } catch (TalosToolRecoveryRequiredException) {
            $this->addToAssertionCount(1);
        }

        $this->assertSame(['web_search'], $backend->executedTools);
        $call = $turn->calls()->where('provider_call_id', 'provider-evidence-fence')->firstOrFail();
        $this->assertSame('recovery_required', $call->status);
        $this->assertSame('recovery_required', $call->effect_status);
        $this->assertSame(0, $call->results()->count());
    }

    public function test_dispatcher_stops_before_the_next_physical_effect_when_elapsed_budget_expires(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-13T12:00:00Z'));

        try {
            [$user, $session, $run, $turn, $browser] = $this->context();
            $turn->update([
                'started_at' => now(),
                'budget_policy' => [...$turn->budget_policy, 'max_elapsed_ms' => 100],
            ]);
            $backend = new RecordingToolExecutionBackend(static function (int $executionCount): void {
                if ($executionCount === 1) {
                    Carbon::setTestNow(now()->addMilliseconds(150));
                }
            });
            $this->app->instance(TalosToolExecutionBackend::class, $backend);
            [$plan, $checkpoint] = $this->compilePlan(
                [
                    new ToolCall('provider-search-one', 'web_search', ['query' => 'AVM one'], null, []),
                    new ToolCall('provider-search-two', 'web_search', ['query' => 'AVM two'], null, []),
                ],
                new ProceduralCompileContext(
                    userId: (string) $user->id,
                    chatSessionId: (string) $session->id,
                    runId: (string) $run->id,
                    turnId: (string) $turn->id,
                    browserSessionId: (string) $browser->id,
                    stateVersion: 0,
                    deadlineAt: now()->addSecond()->toIso8601String(),
                    observedAt: now()->toIso8601String(),
                ),
                new ProceduralBudget(maxElapsedMilliseconds: 100),
            );
            $leaseToken = $this->claimTurnLease($user, $turn);

            try {
                $this->app->make(TalosToolDispatcher::class)->dispatch(
                    $user->id,
                    $turn,
                    $leaseToken,
                    $plan,
                    $checkpoint,
                    $browser,
                );
                $this->fail('A second physical effect crossed the elapsed-time budget.');
            } catch (TalosBudgetExceededException $exception) {
                $this->assertSame('TALOS_TOOL_TIME_BUDGET_EXHAUSTED', $exception->faultCode);
            }

            $this->assertSame(['web_search'], $backend->executedTools);
            $this->assertSame(150, $turn->refresh()->budget_usage['elapsed_ms'] ?? null);
            $this->assertSame(1, $turn->results()->count());
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_dispatcher_rechecks_elapsed_budget_after_preflight_before_invoking_the_backend(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-13T12:00:00Z'));
        $advanceClockOnEventInsert = true;
        \DB::listen(static function ($query) use (&$advanceClockOnEventInsert): void {
            if (! $advanceClockOnEventInsert
                || ! str_contains(strtolower((string) $query->sql), 'insert into "talos_run_events"')) {
                return;
            }

            $advanceClockOnEventInsert = false;
            Carbon::setTestNow(now()->addMilliseconds(150));
        });

        try {
            [$user, $session, $run, $turn, $browser] = $this->context();
            $turn->update([
                'started_at' => now(),
                'budget_policy' => [...$turn->budget_policy, 'max_elapsed_ms' => 100],
            ]);
            $backend = new RecordingToolExecutionBackend;
            $this->app->instance(TalosToolExecutionBackend::class, $backend);
            [$plan, $checkpoint] = $this->compilePlan(
                [new ToolCall('provider-preflight-expired', 'web_search', ['query' => 'AVM'], null, [])],
                new ProceduralCompileContext(
                    userId: (string) $user->id,
                    chatSessionId: (string) $session->id,
                    runId: (string) $run->id,
                    turnId: (string) $turn->id,
                    browserSessionId: (string) $browser->id,
                    stateVersion: 0,
                    deadlineAt: now()->addSecond()->toIso8601String(),
                    observedAt: now()->toIso8601String(),
                ),
                new ProceduralBudget(maxElapsedMilliseconds: 100),
            );
            $leaseToken = $this->claimTurnLease($user, $turn);

            try {
                $this->app->make(TalosToolDispatcher::class)->dispatch(
                    $user->id,
                    $turn,
                    $leaseToken,
                    $plan,
                    $checkpoint,
                    $browser,
                );
                $this->fail('A physical effect started after preflight crossed the elapsed-time budget.');
            } catch (TalosBudgetExceededException $exception) {
                $this->assertSame('TALOS_TOOL_TIME_BUDGET_EXHAUSTED', $exception->faultCode);
            }

            $this->assertSame([], $backend->executedTools);
            $this->assertSame(0, $turn->budgetReservations()->where('status', 'reserved')->count());
            $this->assertSame('ready', $turn->calls()->firstOrFail()->effect_status);
        } finally {
            $advanceClockOnEventInsert = false;
            Carbon::setTestNow();
        }
    }

    public function test_a_result_arriving_after_the_turn_lease_expires_is_not_persisted_or_replayed(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-13T12:00:00Z'));

        try {
            [$user, $session, $run, $turn, $browser] = $this->context();
            $turn->update([
                'started_at' => now(),
                'budget_policy' => [...$turn->budget_policy, 'max_elapsed_ms' => 1_000_000],
            ]);
            $backend = new RecordingToolExecutionBackend(static function (): void {
                Carbon::setTestNow(now()->addSeconds(181));
            });
            $this->app->instance(TalosToolExecutionBackend::class, $backend);
            [$plan, $checkpoint] = $this->compilePlan(
                [new ToolCall('provider-result-before-fence', 'web_search', ['query' => 'AVM'], null, [])],
                new ProceduralCompileContext(
                    userId: (string) $user->id,
                    chatSessionId: (string) $session->id,
                    runId: (string) $run->id,
                    turnId: (string) $turn->id,
                    browserSessionId: (string) $browser->id,
                    stateVersion: 0,
                    deadlineAt: now()->addHour()->toIso8601String(),
                    observedAt: now()->toIso8601String(),
                ),
                new ProceduralBudget(maxElapsedMilliseconds: 1_000_000),
            );
            $dispatcher = $this->app->make(TalosToolDispatcher::class);
            $leaseToken = $this->claimTurnLease($user, $turn);

            try {
                $dispatcher->dispatch($user->id, $turn, $leaseToken, $plan, $checkpoint, $browser);
                $this->fail('An expired result fence was treated as an ordinary completion.');
            } catch (TalosToolRecoveryRequiredException $exception) {
                $this->assertSame('TALOS_TOOL_RECOVERY_REQUIRED', $exception->faultCode);
            }

            $this->assertSame(0, $turn->results()->count());
            $this->assertGreaterThan(0, $turn->budgetReservations()->where('status', 'reserved')->count());

            $successorToken = $this->claimTurnLease($user, $turn->refresh());
            try {
                $dispatcher->dispatch(
                    $user->id,
                    $turn->refresh(),
                    $successorToken,
                    $plan,
                    $checkpoint,
                    $browser->refresh(),
                );
                $this->fail('An uncertain physical effect was replayed by the successor turn lease.');
            } catch (TalosToolRecoveryRequiredException $exception) {
                $this->assertSame('TALOS_TOOL_RECOVERY_REQUIRED', $exception->faultCode);
            }
            $this->assertSame(['web_search'], $backend->executedTools);
            $this->assertSame(0, $turn->results()->count());
            $this->assertSame('recovery_required', $turn->calls()->firstOrFail()->effect_status);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_elapsed_usage_cannot_regress_when_a_stale_turn_instance_records_an_older_observation(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-13T12:00:00Z'));

        try {
            [$user, $session, $run, $turn] = $this->context();
            $turn->update([
                'started_at' => now(),
                'budget_policy' => [...$turn->budget_policy, 'max_elapsed_ms' => 1_000],
            ]);
            $newerObserver = $turn->fresh();
            $staleObserver = $turn->fresh();
            $method = new \ReflectionMethod(TalosToolDispatcher::class, 'enforceElapsedBudget');
            $dispatcher = $this->app->make(TalosToolDispatcher::class);
            $leaseToken = $this->claimTurnLease($user, $turn);

            Carbon::setTestNow(now()->addMilliseconds(400));
            $method->invoke($dispatcher, $user->id, $newerObserver, $leaseToken);
            Carbon::setTestNow(Carbon::parse('2026-07-13T12:00:00.200Z'));
            $method->invoke($dispatcher, $user->id, $staleObserver, $leaseToken);

            $this->assertSame(400, $turn->refresh()->budget_usage['elapsed_ms'] ?? null);
        } finally {
            Carbon::setTestNow();
        }
    }

    /**
     * @param  list<ToolCall>  $calls
     * @param  list<string>  $repairSourceProviderCallIds
     * @return array{ProceduralPlan, TalosProceduralGuardCheckpoint}
     */
    private function compilePlan(
        array $calls,
        ProceduralCompileContext $context,
        ?ProceduralBudget $budget = null,
        ?TalosProceduralGuardCheckpoint $checkpoint = null,
        array $repairSourceProviderCallIds = [],
        ?array $registry = null,
    ): array {
        $checkpoint ??= TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls($calls, $repairSourceProviderCallIds);

        return [
            (new ProceduralToolCompiler)->compile(
                $calls,
                $registry ?? $this->registry(),
                $context,
                $budget ?? new ProceduralBudget,
                $checkpoint->guard(),
            ),
            $checkpoint,
        ];
    }

    private function claimTurnLease(User $user, TalosToolTurn $turn): string
    {
        $token = app(TalosExecutionClaimService::class)->claimTurn(
            $user->id,
            (string) $turn->id,
            'tool_dispatch',
        );
        $this->assertNotNull($token);

        return $token;
    }

    private function beginBrowserTask(
        User $user,
        TalosSession $session,
        TalosRun $run,
        TalosBrowserSession $browser,
    ): TalosBrowserTask {
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => (string) $run->prompt,
        ]);

        return $this->app->make(TalosBrowserTaskRuntime::class)->begin($user->id, $run, $browser);
    }

    private function durableRecordingBackend(?\Closure $afterExecution = null): RecordingToolExecutionBackend
    {
        return new RecordingToolExecutionBackend(
            $afterExecution,
            $this->app->make(TalosBrowserArtifactStore::class),
            $this->app->make(TalosBrowserRunArtifactCorrelator::class),
        );
    }

    /** @return array<string, ProceduralToolSpec> */
    private function registry(): array
    {
        return [
            'browser_navigate' => new ProceduralToolSpec('browser_navigate', 'TOOL_BROWSER_NAVIGATE', 'browser.read', 'low', true, false, false, false),
            'browser_snapshot' => new ProceduralToolSpec('browser_snapshot', 'TOOL_BROWSER_SNAPSHOT', 'browser.read', 'low', false, true, false, true),
            'browser_click' => new ProceduralToolSpec('browser_click', 'TOOL_BROWSER_CLICK', 'browser.write', 'high', true, false, true, true),
            'web_search' => new ProceduralToolSpec('web_search', 'TOOL_WEB_SEARCH', 'web.search', 'low', false, true, false, true),
        ];
    }

    /** @return array{User, TalosSession, TalosRun, TalosToolTurn, TalosBrowserSession} */
    private function context(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Dispatcher',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'dispatcher'),
            'prompt' => 'dispatcher',
            'provider' => 'test',
            'model' => 'test',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-dispatcher',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'browser_session_id' => $browser->id,
            'run_id' => $run->id,
            'status' => 'awaiting_tool_results',
            'provider' => 'test',
            'model' => 'test',
            'adapter_version' => 'test_v1',
            'pending_tool_call_ids' => ['provider-nav', 'provider-snapshot'],
            'budget_policy' => [
                'max_calls' => 8,
                'max_navigations' => 4,
                'max_screenshots' => 4,
                'max_evidence_nodes' => 8,
                'max_evidence_bytes' => 1_000_000,
                'max_elapsed_ms' => 120_000,
                'max_input_tokens' => 100_000,
                'max_output_tokens' => 50_000,
                'max_cost_micros' => 1_000_000,
            ],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        return [$user, $session, $run, $turn, $browser];
    }
}

final class RecordingToolExecutionBackend implements TalosToolExecutionBackend
{
    /** @var list<string> */
    public array $executedTools = [];

    public function __construct(
        private readonly ?\Closure $afterExecution = null,
        private readonly ?TalosBrowserArtifactStore $browserArtifacts = null,
        private readonly ?TalosBrowserRunArtifactCorrelator $browserRunArtifacts = null,
    ) {}

    public function execute(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession = null): ToolResult
    {
        $this->executedTools[] = $node->call->name;
        ($this->afterExecution)?->__invoke(count($this->executedTools));
        if (str_starts_with($node->call->name, 'browser_')
            && $this->browserArtifacts instanceof TalosBrowserArtifactStore
            && $this->browserRunArtifacts instanceof TalosBrowserRunArtifactCorrelator) {
            if (! $browserSession instanceof TalosBrowserSession) {
                throw new \LogicException('Durable Browser test evidence requires an owned Browser session.');
            }
            $browserSession->refresh();
            if ((int) $browserSession->worker_state_version !== $node->context->stateVersion) {
                throw new \LogicException('Durable Browser test evidence received a stale worker state.');
            }
            $resultStateVersion = $node->context->stateVersion
                + (in_array($node->call->name, ['browser_navigate', 'browser_click'], true) ? 1 : 0);
            $url = 'https://example.com/';
            $title = 'Dispatcher fixture';
            $snapshot = [
                'snapshot_id' => 'snapshot-'.$node->call->providerCallId,
                'format' => 'accessibility_refs_v1',
                'url' => $url,
                'title' => $title,
                'textDigest' => hash('sha256', $node->call->providerCallId),
                'nodes' => [],
            ];
            $contents = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $artifact = $this->browserArtifacts->store(
                $browserSession,
                'snapshot',
                'application/json',
                $contents,
                [
                    'url' => $url,
                    'title' => $title,
                    'format' => 'accessibility_refs_v1',
                    'text_digest' => $snapshot['textDigest'],
                    'node_count' => 0,
                ],
                [
                    'source_command_id' => $node->call->providerCallId,
                    'source_state_version' => $node->context->stateVersion,
                    'state_version' => $resultStateVersion,
                    'trust_boundary' => 'untrusted_browser_content',
                ],
            );
            $this->browserRunArtifacts->correlate(
                $turn,
                $browserSession,
                $artifact,
                $node->call->providerCallId,
            );
            $browserSession->forceFill([
                'last_snapshot_artifact_id' => $artifact->id,
                'current_url' => $url,
                'current_title' => $title,
                'worker_state_version' => $resultStateVersion,
                'last_seen_at' => now(),
            ])->save();
            $evidence = [[
                'artifact_id' => (string) $artifact->id,
                'kind' => 'snapshot',
                'sha256' => 'sha256:'.$artifact->sha256,
                'trusted_boundary' => 'untrusted_browser_content',
            ]];

            return new ToolResult(
                toolUseId: $node->call->providerCallId,
                isError: false,
                content: [['type' => 'text', 'text' => 'ok']],
                structuredContent: [
                    'tool' => $node->call->name,
                    'state_version' => $resultStateVersion,
                    'observation' => ['url' => $url, 'title' => $title],
                    'used_browser_context' => [
                        'url' => $url,
                        'title' => $title,
                        'snapshot_artifact_id' => (string) $artifact->id,
                        'evidence_hash' => 'sha256:'.$artifact->sha256,
                    ],
                    'evidence_ids' => [(string) $artifact->id],
                ],
                evidence: $evidence,
            );
        }
        $artifactId = 'artifact-'.$node->call->providerCallId;
        $evidence = $node->producesEvidence ? [[
            'artifact_id' => $artifactId,
            'kind' => 'test',
            'sha256' => 'sha256:'.hash('sha256', $artifactId),
            'trusted_boundary' => 'untrusted_web_content',
        ]] : [];

        return new ToolResult(
            toolUseId: $node->call->providerCallId,
            isError: false,
            content: [['type' => 'text', 'text' => 'ok']],
            structuredContent: ['tool' => $node->call->name, 'evidence_ids' => array_column($evidence, 'artifact_id')],
            evidence: $evidence,
        );
    }
}
