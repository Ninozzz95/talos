<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosExecutionClaimService;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserTaskException;
use App\Services\Talos\Browser\TalosBrowserTaskRepository;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Ramsey\Uuid\Uuid;
use RuntimeException;
use Tests\TestCase;

final class TalosBrowserTaskRuntimeTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_begin_is_idempotent_and_persists_the_canonical_running_journal(): void
    {
        Carbon::setTestNow('2026-07-15T19:00:00Z');
        [$user, $run, $browser] = $this->context();
        $runtime = $this->app->make(TalosBrowserTaskRuntime::class);

        $first = $runtime->begin($user->id, $run, $browser);
        $replay = $runtime->begin($user->id, $run, $browser);
        $expectedId = (string) Uuid::uuid5(
            Uuid::NAMESPACE_URL,
            "talos.browser.task.v1:{$user->id}:{$run->id}",
        );

        $this->assertSame($expectedId, $first->id);
        $this->assertSame($first->id, $replay->id);
        $this->assertSame('running', $replay->status);
        $this->assertSame(3, $replay->state_version);
        $this->assertSame(4, $replay->events()->count());
        $this->assertSame(1, TalosBrowserTask::query()->whereKey($first->id)->count());
        $this->assertSame(16, $first->budget['max_domains']);
        $this->assertSame(196608, $first->budget['max_tokens']);
    }

    public function test_cancel_atomically_fences_task_run_turn_calls_and_rejects_late_completion(): void
    {
        Carbon::setTestNow('2026-07-15T19:10:00Z');
        [$user, $run, $browser, $turn, $call] = $this->context(withExecution: true);
        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        $runtime = $this->app->make(TalosBrowserTaskRuntime::class);
        $task = $runtime->begin($user->id, $run, $browser);
        $turnToken = (string) $turn->execution_lease_token;
        $effectToken = (string) $call->execution_token;

        $cancelled = $runtime->cancel(
            $user->id,
            $task->id,
            $task->state_version,
            'cancel-runtime-1',
            'User cancelled the Browser task.',
        );
        $replay = $runtime->cancel(
            $user->id,
            $task->id,
            $task->state_version,
            'cancel-runtime-1',
            'User cancelled the Browser task.',
        );

        $this->assertSame('cancelled', $cancelled->status);
        $this->assertSame($cancelled->id, $replay->id);
        $this->assertSame('cancelled', $run->refresh()->status);
        $this->assertSame('cancelled', $turn->refresh()->status);
        $this->assertNull($turn->execution_lease_token);
        $this->assertSame('cancelled', $call->refresh()->status);
        $this->assertNull($call->execution_token);
        $this->assertSame('closed', $browser->refresh()->status);
        $this->assertCount(1, array_filter($client->requests, static fn (array $request): bool => $request['method'] === 'cancel'));
        $this->assertFalse($this->app->make(TalosExecutionClaimService::class)->completeCall(
            $user->id,
            $call->id,
            $effectToken,
            $turnToken,
        ));

        try {
            $runtime->cancel(
                $user->id,
                $task->id,
                $cancelled->state_version,
                'cancel-runtime-different',
                'A different terminal command.',
            );
            $this->fail('A different command cancelled an already terminal task.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TASK_TRANSITION_INVALID', $exception->errorCode);
        }
    }

    public function test_completed_settlement_rejects_an_unresolved_action(): void
    {
        [$user, $run, $browser] = $this->context();
        $runtime = $this->app->make(TalosBrowserTaskRuntime::class);
        $task = $runtime->begin($user->id, $run, $browser);
        TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $task->talos_session_id,
            'intent_id' => 'unresolved-intent',
            'sequence' => 1,
            'kind' => 'snapshot',
            'arguments' => [],
            'expected_state_version' => $task->state_version,
            'risk' => 'read',
            'idempotency_key' => 'sha256:'.hash('sha256', 'unresolved-action'),
            'preconditions' => [],
            'status' => 'authorized',
            'requested_at' => now(),
            'approved_at' => now(),
        ]);

        try {
            $runtime->settle($user->id, $run, BrowserTaskStatus::Completed);
            $this->fail('A Browser task completed with an unresolved action.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TASK_JOURNAL_INVALID', $exception->errorCode);
        }

        $this->assertSame('running', $task->refresh()->status);
        $this->assertSame(4, $task->events()->count());
    }

    public function test_fork_preserves_the_correlated_worker_when_the_commit_response_is_ambiguous(): void
    {
        [$user, $run, $browser] = $this->context();
        $client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $client);
        $runtime = $this->app->make(TalosBrowserTaskRuntime::class);
        $task = $runtime->begin($user->id, $run, $browser);
        $task = $this->app->make(TalosBrowserTaskRepository::class)->transition(
            $user->id,
            $task->id,
            BrowserTaskStatus::Recovering,
            $task->state_version,
            'runtime-fork-enter-recovery',
            'task.recovering',
            'system',
            statePatch: ['reconciled_at' => now()->startOfSecond()],
        );
        TalosBrowserCheckpoint::query()->create([
            'schema_version' => 'talos.browser.checkpoint.v1',
            'task_id' => $task->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'task_state_version' => $task->state_version,
            'task_status' => $task->status,
            'tab_inventory' => [[
                'tab_id' => 'tab-main',
                'url' => 'https://example.test/ambiguous-fork',
                'title' => 'Ambiguous fork checkpoint',
                'is_active' => true,
            ]],
            'budget' => $task->budget,
            'action_frontier' => [],
            'evidence_frontier' => [],
            'runtime_reconciliation_token' => 'ambiguous-fork-checkpoint-token',
            'recorded_at' => now(),
        ]);
        $database = DB::getFacadeRoot();
        $databaseMock = DB::partialMock();
        $databaseMock
            ->shouldReceive('transaction')
            ->with(\Mockery::type(\Closure::class))
            ->andReturnUsing(static fn (callable $callback): mixed => $database->transaction($callback));
        $databaseMock
            ->shouldReceive('transaction')
            ->once()
            ->with(\Mockery::type(\Closure::class), 3)
            ->andReturnUsing(static function (callable $callback, int $attempts) use ($database): never {
                $database->transaction($callback, $attempts);

                throw new RuntimeException('The commit completed but its response was lost.');
            });

        $fork = $runtime->fork($user->id, $task->id, 'runtime-fork-ambiguous-commit');
        $forkBrowser = $fork->browserSession()->firstOrFail();

        $this->assertSame($fork->runtime_id, $forkBrowser->worker_session_id);
        $this->assertCount(1, array_filter(
            $client->requests,
            static fn (array $request): bool => $request['method'] === 'create',
        ));
        $this->assertCount(0, array_filter(
            $client->requests,
            static fn (array $request): bool => $request['method'] === 'close',
        ));
    }

    /** @return array{User, TalosRun, TalosBrowserSession, 3?: TalosToolTurn, 4?: TalosToolCall} */
    private function context(bool $withExecution = false): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Runtime task',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Inspect the current page.'),
            'prompt' => 'Inspect the current page.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Inspect the current page.',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-runtime-'.str()->uuid(),
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 1,
            'expires_at' => now()->addHour(),
        ]);
        if (! $withExecution) {
            return [$user, $run, $browser];
        }

        $turnToken = (string) str()->uuid();
        $effectToken = (string) str()->uuid();
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'browser_session_id' => $browser->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'test',
            'pending_tool_call_ids' => [],
            'budget_policy' => [],
            'budget_usage' => [],
            'revision' => 0,
            'execution_lease_token' => $turnToken,
            'execution_lease_expires_at' => now()->addMinutes(3),
            'execution_lease_phase' => 'tool_dispatch',
            'started_at' => now(),
        ]);
        $call = TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-runtime-1',
            'provider_call_id' => 'provider-runtime-1',
            'node_id' => 'node-runtime-1',
            'tool_name' => 'browser_navigate',
            'arguments' => ['url' => 'https://example.test/'],
            'arguments_sha256' => 'sha256:'.hash('sha256', '{}'),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'runtime-call'),
            'risk' => 'read',
            'capability' => 'browser.navigate',
            'status' => 'running',
            'attempt' => 0,
            'execution_token' => $effectToken,
            'execution_lease_expires_at' => now()->addMinutes(3),
            'effect_key' => 'sha256:'.hash('sha256', 'runtime-effect'),
            'effect_status' => 'in_flight',
            'approval_state' => 'not_required',
        ]);

        return [$user, $run, $browser, $turn, $call];
    }
}
