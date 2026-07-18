<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserBudgetService;
use App\Services\Talos\Browser\TalosBrowserTaskException;
use App\Services\Talos\Browser\TalosBrowserTaskRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Tests\TestCase;

final class TalosBrowserBudgetServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_usage_is_derived_from_owned_canonical_ledgers(): void
    {
        Carbon::setTestNow('2026-07-15T18:00:00Z');
        [$task, $turn] = $this->context([
            'max_actions' => 8,
            'max_elapsed_ms' => 60_000,
            'max_bytes' => 1_000_000,
            'max_tabs' => 4,
            'max_domains' => 4,
            'max_tokens' => 2_000,
        ]);
        $task->forceFill(['started_at' => now()->subSecond()])->save();
        $turn->forceFill(['budget_usage' => ['input_tokens' => 100, 'output_tokens' => 50]])->save();

        $first = $this->action($task, 1, 'https://EXAMPLE.test./cars', 'dispatched');
        $second = $this->action($task, 2, 'https://other.example/path', 'committed');
        TalosBrowserEvidenceBundle::query()->create([
            'schema_version' => 'talos.browser.evidence.v1',
            'task_id' => $task->id,
            'action_id' => $second->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'worker_state_version' => 4,
            'url' => 'https://other.example/path',
            'title' => 'Evidence',
            'captured_at' => now(),
            'frame' => ['frame_id' => 'frame-budget', 'viewport_width' => 1280, 'viewport_height' => 800, 'device_pixel_ratio' => 1, 'scroll_x' => 0, 'scroll_y' => 0],
            'snapshot_byte_size' => 100,
            'screenshot_byte_size' => 50,
            'integrity_sha256' => 'sha256:'.hash('sha256', 'budget-evidence'),
            'claims' => [],
            'committed_at' => now(),
        ]);
        TalosBrowserCheckpoint::query()->create([
            'schema_version' => 'talos.browser.checkpoint.v1',
            'task_id' => $task->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'task_state_version' => $task->state_version,
            'task_status' => $task->status,
            'tab_inventory' => [
                ['tab_id' => 'one', 'url' => 'https://example.test/', 'title' => 'One', 'is_active' => true],
                ['tab_id' => 'two', 'url' => 'https://other.example/', 'title' => 'Two', 'is_active' => false],
            ],
            'budget' => $task->budget,
            'action_frontier' => [$first->id, $second->id],
            'evidence_frontier' => [],
            'recorded_at' => now(),
        ]);

        $client = new FakeBrowserSessionClient;
        $usage = (new TalosBrowserBudgetService($client))->usage($task->refresh());

        $this->assertSame(2, $usage['actions']);
        $this->assertSame(1000, $usage['elapsed_ms']);
        $this->assertSame(150, $usage['bytes']);
        $this->assertSame(2, $usage['tabs']);
        $this->assertSame(2, $usage['domains']);
        $this->assertSame(150, $usage['tokens']);
        $this->assertSame([], $client->requests, 'A durable checkpoint must avoid a redundant worker inspection.');
    }

    public function test_legacy_defaults_and_candidate_delta_fail_with_actionable_all_limit_details(): void
    {
        Carbon::setTestNow('2026-07-15T18:10:00Z');
        [$task, $turn] = $this->context([
            'max_actions' => 1,
            'max_elapsed_ms' => 1000,
            'max_bytes' => 1,
            'max_tabs' => 1,
        ]);
        $task->forceFill(['started_at' => now()->subMilliseconds(999)])->save();
        $turn->forceFill(['budget_usage' => ['input_tokens' => 196607, 'output_tokens' => 0]])->save();
        $this->action($task, 1, 'https://example.test/', 'dispatched');

        $client = new FakeBrowserSessionClient;
        $service = new TalosBrowserBudgetService($client);
        $this->assertSame(16, $service->effectiveLimits($task)['max_domains']);
        $this->assertSame(196608, $service->effectiveLimits($task)['max_tokens']);

        try {
            $service->assertCanDispatch($task->refresh(), [
                'actions' => 1,
                'elapsed_ms' => 2,
                'bytes' => 2,
                'tabs' => 1,
                'domains' => 16,
                'tokens' => 2,
            ]);
            $this->fail('A candidate over every effective Browser limit was dispatched.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_BUDGET_EXHAUSTED', $exception->errorCode);
            $this->assertSame([
                'max_actions', 'max_elapsed_ms', 'max_bytes', 'max_tabs', 'max_domains', 'max_tokens',
            ], $exception->details['exhausted_limits']);
            $this->assertSame('Reduce the requested Browser operation or start a new task with an approved budget.', $exception->remediation);
        }
    }

    public function test_prepared_and_authorized_actions_do_not_consume_the_physical_action_or_domain_budget(): void
    {
        Carbon::setTestNow('2026-07-15T18:20:00Z');
        [$task] = $this->context([
            'max_actions' => 1,
            'max_elapsed_ms' => 60_000,
            'max_bytes' => 1_000_000,
            'max_tabs' => 4,
            'max_domains' => 1,
            'max_tokens' => 2_000,
        ]);
        $this->action($task, 1, 'https://prepared.example/path');

        $service = new TalosBrowserBudgetService(new FakeBrowserSessionClient);
        $usage = $service->usage($task->refresh());

        $this->assertSame(0, $usage['actions']);
        $this->assertSame(0, $usage['domains']);
        $this->assertTrue($service->assertCanDispatch($task, [
            'actions' => 1,
            'elapsed_ms' => 0,
            'bytes' => 0,
            'tabs' => 0,
            'domains' => 1,
            'tokens' => 0,
        ])->allowed);
    }

    public function test_worker_tab_fallback_uses_the_canonical_owner_reference(): void
    {
        [$task] = $this->context([
            'max_actions' => 8,
            'max_elapsed_ms' => 60_000,
            'max_bytes' => 1_000_000,
            'max_tabs' => 4,
            'max_domains' => 4,
            'max_tokens' => 2_000,
        ]);
        $client = new FakeBrowserSessionClient;

        (new TalosBrowserBudgetService($client))->usage($task->refresh());

        $inspection = collect($client->requests)->firstWhere('method', 'inspect');
        $this->assertIsArray($inspection);
        $this->assertSame('talos-user:'.$task->user_id, $inspection['ownerRef']);
    }

    /** @param array<string, int> $budget @return array{TalosBrowserTask, TalosToolTurn} */
    private function context(array $budget): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Budget task',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'budget task'),
            'prompt' => 'budget task',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Run a bounded Browser task.',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-budget-'.str()->uuid(),
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true],
            'policy' => [],
            'worker_state_version' => 4,
            'expires_at' => now()->addHour(),
        ]);
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
            'started_at' => now(),
        ]);
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->create([
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'origin_message_id' => $message->id,
            'browser_session_id' => $browser->id,
            'goal' => 'Run a bounded Browser task.',
            'status' => 'created',
            'autonomy_profile' => 'assist',
            'budget' => $budget,
            'state_version' => 0,
            'requested_at' => now(),
        ], 'budget-create-'.str()->uuid(), 'system');
        foreach ([BrowserTaskStatus::Planning, BrowserTaskStatus::Ready, BrowserTaskStatus::Running] as $status) {
            $task = $repository->transition(
                $user->id,
                $task->id,
                $status,
                $task->state_version,
                'budget-transition-'.str()->uuid(),
                'task.'.$status->value,
                'system',
            );
        }

        return [$task, $turn];
    }

    private function action(
        TalosBrowserTask $task,
        int $sequence,
        string $url,
        string $status = 'proposed',
    ): TalosBrowserAction {
        return TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $task->user_id,
            'talos_session_id' => $task->talos_session_id,
            'intent_id' => (string) str()->uuid(),
            'sequence' => $sequence,
            'kind' => 'navigate',
            'arguments' => ['url' => $url],
            'expected_state_version' => $task->state_version,
            'risk' => 'read',
            'idempotency_key' => 'sha256:'.hash('sha256', $task->id.':'.$sequence),
            'preconditions' => [],
            'status' => $status,
            'requested_at' => now(),
            'started_at' => in_array($status, ['dispatched', 'committed'], true) ? now() : null,
            'committed_at' => $status === 'committed' ? now() : null,
        ]);
    }
}
