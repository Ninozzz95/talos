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
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserTaskRepository;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

final class TalosBrowserTaskApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_task_projection_exposes_runtime_and_active_tab_identity(): void
    {
        [$user, $session, $task] = $this->context();
        $expectedTabId = (string) Uuid::uuid5(
            Uuid::NAMESPACE_URL,
            "talos.browser.tab.v1:{$user->id}:{$task->browser_session_id}",
        );

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->getJson("/api/talos/browser/tasks/{$task->id}")
            ->assertOk()
            ->assertJsonPath('data.runtime_id', $task->browserSession()->value('worker_session_id'))
            ->assertJsonPath('data.active_tab_id', $expectedTabId);

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->getJson('/api/talos/browser/tasks?talos_session_id='.$session->id)
            ->assertOk()
            ->assertJsonPath('data.0.runtime_id', $task->browserSession()->value('worker_session_id'))
            ->assertJsonPath('data.0.active_tab_id', $expectedTabId);
    }

    public function test_cancel_route_returns_terminal_projection_and_same_command_replays_once(): void
    {
        [$user, $session, $task] = $this->context();
        $worker = $this->app->make(BrowserSessionClient::class);
        $this->assertInstanceOf(FakeBrowserSessionClient::class, $worker);
        $payload = [
            'expected_state_version' => $task->state_version,
            'command_id' => 'cancel-api-replay',
            'reason' => 'The user stopped this Browser task.',
        ];

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/cancel", $payload)
            ->assertOk()
            ->assertJsonPath('data.task.id', $task->id)
            ->assertJsonPath('data.task.status', 'cancelled')
            ->assertJsonPath('data.task.state_version', $task->state_version + 1);

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/cancel", $payload)
            ->assertOk()
            ->assertJsonPath('data.task.status', 'cancelled');

        $this->assertCount(1, array_filter(
            $worker->requests,
            static fn (array $request): bool => $request['method'] === 'cancel',
        ));
    }

    public function test_cancel_route_is_owner_and_chat_scoped(): void
    {
        [$user, $session, $task] = $this->context();
        $foreign = User::factory()->create();
        $payload = [
            'expected_state_version' => $task->state_version,
            'command_id' => 'cancel-api-foreign',
            'reason' => 'Foreign cancellation must not be accepted.',
        ];

        $this->actingAs($foreign)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/cancel", $payload)
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_TASK_NOT_FOUND');

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', 'another-chat')
            ->postJson("/api/talos/browser/tasks/{$task->id}/cancel", $payload)
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_TASK_NOT_FOUND');
    }

    public function test_cancel_route_rejects_invalid_payload_and_a_different_terminal_command(): void
    {
        [$user, $session, $task] = $this->context();

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/cancel", [
                'expected_state_version' => -1,
                'command_id' => '',
                'reason' => '',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_VALIDATION_FAILED');

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/cancel", [
                'expected_state_version' => $task->state_version,
                'command_id' => 'cancel-api-first',
                'reason' => 'First terminal command.',
            ])
            ->assertOk();

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/cancel", [
                'expected_state_version' => $task->state_version + 1,
                'command_id' => 'cancel-api-second',
                'reason' => 'Different terminal command.',
            ])
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_TASK_TRANSITION_INVALID');
    }

    public function test_recover_route_returns_the_server_classified_strategy(): void
    {
        [$user, $session, $task] = $this->context();
        TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'intent_id' => 'recover-api-intent',
            'sequence' => 1,
            'kind' => 'navigate',
            'arguments' => ['url' => 'https://example.test/recover'],
            'expected_state_version' => $task->state_version,
            'risk' => 'read',
            'idempotency_key' => 'sha256:'.hash('sha256', 'recover-api-intent'),
            'preconditions' => [],
            'status' => 'committed',
            'requested_at' => now(),
            'started_at' => now(),
            'committed_at' => now(),
        ]);

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/recover", [
                'command_id' => 'recover-api-command',
            ])
            ->assertOk()
            ->assertJsonPath('data.decision.strategy', 'reconcile')
            ->assertJsonPath('data.task.status', 'recovering')
            ->assertJsonPath('data.resulting_task', null);
    }

    public function test_recover_route_is_owner_scoped_and_validates_its_command(): void
    {
        [$user, $session, $task] = $this->context();
        $foreign = User::factory()->create();

        $this->actingAs($foreign)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/recover", ['command_id' => 'foreign-recovery'])
            ->assertNotFound()
            ->assertJsonPath('code', 'TALOS_BROWSER_TASK_NOT_FOUND');

        $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/recover", ['command_id' => ''])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_BROWSER_VALIDATION_FAILED');
    }

    public function test_fork_route_creates_one_running_task_from_a_recovering_checkpoint(): void
    {
        [$user, $session, $task] = $this->context();
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->transition(
            $user->id,
            $task->id,
            BrowserTaskStatus::Recovering,
            $task->state_version,
            'prepare-api-fork',
            'task.recovering',
            'system',
        );
        TalosBrowserCheckpoint::query()->create([
            'schema_version' => 'talos.browser.checkpoint.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'task_state_version' => $task->state_version,
            'task_status' => $task->status,
            'tab_inventory' => [],
            'budget' => $task->budget,
            'action_frontier' => [],
            'evidence_frontier' => [],
            'runtime_reconciliation_token' => null,
            'recorded_at' => now(),
        ]);

        $response = $this->actingAs($user)
            ->withHeader('X-Talos-Session-Id', $session->id)
            ->postJson("/api/talos/browser/tasks/{$task->id}/fork", [
                'command_id' => 'fork-api-command',
            ])
            ->assertCreated()
            ->assertJsonPath('data.source_task.status', 'recovering')
            ->assertJsonPath('data.task.status', 'running');

        $this->assertNotSame($task->id, $response->json('data.task.id'));
    }

    /** @return array{User, TalosSession, TalosBrowserTask} */
    private function context(): array
    {
        $worker = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $worker);
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Task cancellation API',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Cancel the Browser task.'),
            'prompt' => 'Cancel the Browser task.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Cancel the Browser task.',
        ]);
        $workerSessionId = 'worker-cancel-api-'.str()->uuid();
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => $workerSessionId,
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
        $worker->inspectResponse = [
            'sessionId' => $workerSessionId,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'stateVersion' => 1,
            'expiresAt' => now()->addHour()->toJSON(),
        ];
        $task = $this->app->make(TalosBrowserTaskRuntime::class)->begin($user->id, $run, $browser);

        return [$user, $session, $task];
    }
}
