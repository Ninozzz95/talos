<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserRecoveryCommand;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserRecoveryDecision;
use App\Services\Talos\Browser\TalosBrowserRecoveryService;
use App\Services\Talos\Browser\TalosBrowserTaskException;
use App\Services\Talos\Browser\TalosBrowserTaskRepository;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Kadmos\Browser\Recovery\BrowserRecoveryStrategy;
use Kadmos\Tool\ProceduralLoopGuard;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

final class TalosBrowserRecoveryServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_recovery_service_contract_exists(): void
    {
        $this->assertTrue(class_exists(TalosBrowserRecoveryService::class));
        $this->assertTrue(class_exists(TalosBrowserRecoveryDecision::class));
        $this->assertTrue(method_exists(TalosBrowserRecoveryService::class, 'reconcile'));
    }

    public function test_committed_action_without_evidence_enters_reconciliation_without_redispatch(): void
    {
        [$user, , , , $task, $worker] = $this->context('reconcile');
        $this->action($task, 'committed', 'read', started: true, committed: true, effectStatus: 'committed');
        $service = $this->app->make(TalosBrowserRecoveryService::class);

        $decision = $service->reconcile($user->id, $task->id, 'recover-missing-evidence');
        $replay = $service->reconcile($user->id, $task->id, 'recover-missing-evidence');

        $this->assertSame(BrowserRecoveryStrategy::Reconcile, $decision->strategy);
        $this->assertSame($decision->toApiArray(), $replay->toApiArray());
        $this->assertSame('recovering', $task->refresh()->status);
        $this->assertCount(0, array_filter(
            $worker->requests,
            static fn (array $request): bool => in_array($request['method'], ['navigate', 'click', 'tool'], true),
        ));
    }

    public function test_authorized_never_dispatched_action_resumes_with_the_same_idempotency_intent(): void
    {
        [$user, , , , $task] = $this->context('resume');
        $action = $this->action($task, 'authorized', 'read', effectStatus: 'pending');
        $service = $this->app->make(TalosBrowserRecoveryService::class);

        $decision = $service->reconcile($user->id, $task->id, 'recover-safe-resume');
        $replay = $service->reconcile($user->id, $task->id, 'recover-safe-resume');

        $this->assertSame(BrowserRecoveryStrategy::Resume, $decision->strategy);
        $this->assertSame($task->id, $decision->resultingTaskId);
        $this->assertSame($decision->toApiArray(), $replay->toApiArray());
        $this->assertSame('running', $task->refresh()->status);
        $this->assertSame($action->idempotency_key, $action->refresh()->idempotency_key);
        $this->assertSame(6, $task->events()->count());
    }

    public function test_committed_action_and_evidence_resume_an_already_recovering_provider_continuation(): void
    {
        [$user, , , $browser, $task, $worker] = $this->context('provider-continuation');
        $action = $this->action($task, 'committed', 'read', started: true, committed: true, effectStatus: 'committed');
        $this->evidence($task, $action, $browser);
        $task = $this->app->make(TalosBrowserTaskRepository::class)->transition(
            $user->id,
            $task->id,
            BrowserTaskStatus::Recovering,
            $task->state_version,
            'provider-continuation-fault',
            'task.recovering',
            'system',
        );

        $decision = $this->app->make(TalosBrowserRecoveryService::class)
            ->reconcile($user->id, $task->id, 'recover-provider-continuation');

        $this->assertSame(BrowserRecoveryStrategy::Resume, $decision->strategy);
        $this->assertSame('browser_recovery_result_replay', $decision->reasonCode);
        $this->assertSame('running', $task->refresh()->status);
        $this->assertSame(1, $task->actions()->count());
        $this->assertSame(1, $task->evidenceBundles()->count());
        $this->assertCount(0, array_filter(
            $worker->requests,
            static fn (array $request): bool => in_array($request['method'], ['navigate', 'click', 'tool'], true),
        ));
    }

    public function test_ambiguous_consequential_action_waits_for_user_only_with_a_current_verified_frame(): void
    {
        [$user, , , $browser, $task] = $this->context('wait');
        $action = $this->action($task, 'ambiguous', 'irreversible', started: true, effectStatus: 'ambiguous');
        $this->evidence($task, $action, $browser);

        $decision = $this->app->make(TalosBrowserRecoveryService::class)
            ->reconcile($user->id, $task->id, 'recover-consequential');

        $this->assertSame(BrowserRecoveryStrategy::WaitForUser, $decision->strategy);
        $this->assertSame('waiting_user', $task->refresh()->status);
    }

    public function test_ambiguous_read_action_on_an_already_recovering_task_is_replayable_without_redispatch(): void
    {
        [$user, , , , $task, $worker] = $this->context('ambiguous-read');
        $this->action($task, 'ambiguous', 'read', started: true, effectStatus: 'recovery_required');
        $task = $this->app->make(TalosBrowserTaskRepository::class)->transition(
            $user->id,
            $task->id,
            BrowserTaskStatus::Recovering,
            $task->state_version,
            'ambiguous-process-fault',
            'task.recovering',
            'system',
        );
        $service = $this->app->make(TalosBrowserRecoveryService::class);

        $decision = $service->reconcile($user->id, $task->id, 'recover-ambiguous-read');
        $replay = $service->reconcile($user->id, $task->id, 'recover-ambiguous-read');

        $this->assertSame(BrowserRecoveryStrategy::Reconcile, $decision->strategy);
        $this->assertSame('browser_recovery_action_reconcile', $decision->reasonCode);
        $this->assertSame($decision->toApiArray(), $replay->toApiArray());
        $this->assertSame('recovering', $task->refresh()->status);
        $this->assertSame(1, TalosBrowserRecoveryCommand::query()->where('task_id', $task->id)->count());
        $this->assertCount(0, array_filter(
            $worker->requests,
            static fn (array $request): bool => in_array($request['method'], ['navigate', 'click', 'tool'], true),
        ));
    }

    public function test_missing_worker_forks_once_from_a_safe_checkpoint(): void
    {
        [$user, , , , $task, $worker] = $this->context('fork');
        $this->checkpoint($task);
        $worker->afterRequest = static function (string $method): void {
            if ($method === 'inspect') {
                throw new BrowserWorkerException('TALOS_BROWSER_SESSION_NOT_FOUND', 'Worker session is gone.');
            }
        };
        $service = $this->app->make(TalosBrowserRecoveryService::class);

        $decision = $service->reconcile($user->id, $task->id, 'recover-safe-fork');
        $expectedForkId = (string) Uuid::uuid5(
            Uuid::NAMESPACE_URL,
            "talos.browser.task.fork.v1:{$user->id}:{$task->id}:recover-safe-fork",
        );
        $this->assertSame($expectedForkId, $decision->resultingTaskId);
        $this->assertTrue(TalosBrowserTask::query()->whereKey($decision->resultingTaskId)->exists());
        $replay = $service->reconcile($user->id, $task->id, 'recover-safe-fork');

        $this->assertSame(BrowserRecoveryStrategy::Fork, $decision->strategy);
        $this->assertNotNull($decision->resultingTaskId);
        $this->assertNotSame($task->id, $decision->resultingTaskId);
        $this->assertSame($decision->toApiArray(), $replay->toApiArray());
        $this->assertSame('recovering', $task->refresh()->status);
        $fork = TalosBrowserTask::query()->findOrFail($decision->resultingTaskId);
        $this->assertSame('running', $fork->status);
        $this->assertSame(1, $fork->checkpoints()->count());
        $this->assertCount(1, array_filter(
            $worker->requests,
            static fn (array $request): bool => $request['method'] === 'create',
        ));
        $createRequest = array_values(array_filter(
            $worker->requests,
            static fn (array $request): bool => $request['method'] === 'create',
        ))[0];
        $this->assertSame($expectedForkId, $createRequest['idempotencyKey']);
    }

    public function test_corrupt_journal_fails_closed_before_worker_inspection(): void
    {
        [$user, , , , $task, $worker] = $this->context('corrupt');
        $task->events()->where('to_state_version', 2)->delete();

        $service = $this->app->make(TalosBrowserRecoveryService::class);

        $decision = $service->reconcile($user->id, $task->id, 'recover-corrupt-journal');
        $replay = $service->reconcile($user->id, $task->id, 'recover-corrupt-journal');

        $this->assertSame(BrowserRecoveryStrategy::Fail, $decision->strategy);
        $this->assertSame('browser_recovery_journal_invalid', $decision->reasonCode);
        $this->assertSame($decision->toApiArray(), $replay->toApiArray());
        $this->assertSame('running', $task->refresh()->status);
        $this->assertSame(1, TalosBrowserRecoveryCommand::query()->where('task_id', $task->id)->count());
        $this->assertCount(0, array_filter(
            $worker->requests,
            static fn (array $request): bool => $request['method'] === 'inspect',
        ));
    }

    public function test_recovery_command_id_cannot_be_reused_for_another_task_owned_by_the_same_user(): void
    {
        [$user, $session, , , $task] = $this->context('command-owner-scope');
        $task->events()->where('to_state_version', 2)->delete();
        $service = $this->app->make(TalosBrowserRecoveryService::class);
        $service->reconcile($user->id, $task->id, 'recover-owner-command');

        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Second recovery task'),
            'prompt' => 'Second recovery task',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Second recovery task',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-recovery-command-owner-scope-second',
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/command-owner-scope-second',
            'current_title' => 'Second recovery fixture',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 4,
            'expires_at' => now()->addHour(),
        ]);
        $secondTask = $this->app->make(TalosBrowserTaskRuntime::class)->begin($user->id, $run, $browser);
        $secondTask->events()->where('to_state_version', 2)->delete();

        try {
            $service->reconcile($user->id, $secondTask->id, 'recover-owner-command');
            $this->fail('A recovery command ID was reused for another task.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TASK_COMMAND_CONFLICT', $exception->errorCode);
        }

        $this->assertSame(1, TalosBrowserRecoveryCommand::query()
            ->where('user_id', $user->id)
            ->where('command_id', 'recover-owner-command')
            ->count());
    }

    /** @return array{User, TalosSession, TalosRun, TalosBrowserSession, TalosBrowserTask, FakeBrowserSessionClient} */
    private function context(string $suffix): array
    {
        $worker = new FakeBrowserSessionClient;
        $worker->inspectResponse = [
            'sessionId' => 'worker-recovery-'.$suffix,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'stateVersion' => 4,
            'expiresAt' => now()->addHour()->toJSON(),
        ];
        $this->app->instance(BrowserSessionClient::class, $worker);
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Recovery '.$suffix,
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Recover '.$suffix),
            'prompt' => 'Recover '.$suffix,
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Recover '.$suffix,
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-recovery-'.$suffix,
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/'.$suffix,
            'current_title' => 'Recovery fixture',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 4,
            'expires_at' => now()->addHour(),
        ]);
        $task = $this->app->make(TalosBrowserTaskRuntime::class)->begin($user->id, $run, $browser);

        return [$user, $session, $run, $browser, $task, $worker];
    }

    private function action(
        TalosBrowserTask $task,
        string $status,
        string $risk,
        bool $started = false,
        bool $committed = false,
        string $effectStatus = 'pending',
    ): TalosBrowserAction {
        $message = $task->originMessage()->firstOrFail();
        $arguments = ['url' => 'https://example.test/recovery'];
        $argumentsHash = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($arguments));
        $idempotencyKey = 'sha256:'.hash('sha256', 'recovery-effect-'.$task->id);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $task->user_id,
            'session_id' => $task->talos_session_id,
            'browser_session_id' => $task->browser_session_id,
            'run_id' => $message->run_id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'test',
            'pending_tool_call_ids' => [],
            'budget_policy' => [],
            'budget_usage' => [],
            'revision' => 0,
            'started_at' => now(),
        ]);
        $call = TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $message->run_id,
            'user_id' => $task->user_id,
            'sequence' => 1,
            'logical_call_id' => 'logical-'.$task->id,
            'provider_call_id' => 'provider-'.$task->id,
            'node_id' => 'node-'.$task->id,
            'tool_name' => 'browser_navigate',
            'arguments' => $arguments,
            'arguments_sha256' => $argumentsHash,
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'recovery-call-'.$task->id),
            'risk' => $risk,
            'capability' => 'browser.navigate',
            'status' => $started ? 'running' : 'planned',
            'attempt' => 0,
            'effect_key' => $idempotencyKey,
            'effect_status' => $effectStatus,
            'approval_state' => 'not_required',
        ]);

        return TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'intent_id' => $call->logical_call_id,
            'sequence' => 1,
            'kind' => 'navigate',
            'arguments' => $arguments,
            'expected_state_version' => $task->state_version,
            'risk' => $risk,
            'idempotency_key' => $idempotencyKey,
            'preconditions' => [],
            'status' => $status,
            'requested_at' => now(),
            'approved_at' => $status === 'authorized' ? now() : null,
            'started_at' => $started ? now() : null,
            'committed_at' => $committed ? now() : null,
        ]);
    }

    private function evidence(
        TalosBrowserTask $task,
        TalosBrowserAction $action,
        TalosBrowserSession $browser,
    ): void {
        TalosBrowserEvidenceBundle::query()->create([
            'schema_version' => 'talos.browser.evidence.v1',
            'task_id' => $task->id,
            'action_id' => $action->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'worker_state_version' => $browser->worker_state_version,
            'url' => $browser->current_url,
            'title' => 'Current verified frame',
            'captured_at' => now(),
            'frame' => ['frame_id' => 'frame-'.$task->id, 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
            'integrity_sha256' => 'sha256:'.hash('sha256', 'frame-'.$task->id),
            'claims' => [],
            'committed_at' => now(),
        ]);
    }

    private function checkpoint(TalosBrowserTask $task): void
    {
        TalosBrowserCheckpoint::query()->create([
            'schema_version' => 'talos.browser.checkpoint.v1',
            'task_id' => $task->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'task_state_version' => $task->state_version,
            'task_status' => $task->status,
            'tab_inventory' => [[
                'tab_id' => 'tab-main',
                'url' => 'https://example.test/checkpoint',
                'title' => 'Checkpoint',
                'is_active' => true,
            ]],
            'budget' => $task->budget,
            'action_frontier' => [],
            'evidence_frontier' => [],
            'runtime_reconciliation_token' => 'recovery-checkpoint-token',
            'recorded_at' => now(),
        ]);
    }
}
