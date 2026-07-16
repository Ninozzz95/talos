<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTaskEvent;
use App\Models\TalosMessage;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserTaskException;
use App\Services\Talos\Browser\TalosBrowserTaskRepository;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Tests\TestCase;

final class TalosBrowserTaskRepositoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_projection_and_transition_event_commit_atomically(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('atomic');
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->create(
            $this->taskAttributes($user, $session, $message, $browser),
            'create-atomic-task',
            'user',
            (string) $user->id,
        );

        $planning = $repository->transition(
            (int) $user->id,
            (string) $task->id,
            BrowserTaskStatus::Planning,
            0,
            'plan-atomic-task',
            'task.planning',
            'system',
        );

        $this->assertSame('planning', $planning->status);
        $this->assertSame(1, $planning->state_version);
        $this->assertSame(2, $planning->events()->count());
        $this->assertDatabaseHas('talos_browser_task_events', [
            'task_id' => $planning->id,
            'command_id' => 'plan-atomic-task',
            'from_status' => 'created',
            'to_status' => 'planning',
            'from_state_version' => 0,
            'to_state_version' => 1,
        ]);
    }

    public function test_same_command_and_intent_replays_without_a_second_event(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('replay');
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $attributes = $this->taskAttributes($user, $session, $message, $browser);

        $task = $repository->create($attributes, 'create-replay-task', 'user', (string) $user->id);
        $sameTask = $repository->create($attributes, 'create-replay-task', 'user', (string) $user->id);
        $first = $repository->transition(
            (int) $user->id,
            (string) $task->id,
            BrowserTaskStatus::Planning,
            0,
            'plan-replay-task',
            'task.planning',
            'system',
        );
        $replayed = $repository->transition(
            (int) $user->id,
            (string) $task->id,
            BrowserTaskStatus::Planning,
            0,
            'plan-replay-task',
            'task.planning',
            'system',
        );

        $this->assertSame($task->id, $sameTask->id);
        $this->assertSame($first->id, $replayed->id);
        $this->assertSame(1, $replayed->state_version);
        $this->assertSame(2, TalosBrowserTaskEvent::query()->where('task_id', $task->id)->count());
    }

    public function test_same_command_with_different_intent_is_rejected(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('conflict');
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->create(
            $this->taskAttributes($user, $session, $message, $browser),
            'create-conflict-task',
            'user',
            (string) $user->id,
        );
        $repository->transition(
            (int) $user->id,
            (string) $task->id,
            BrowserTaskStatus::Planning,
            0,
            'reused-command',
            'task.planning',
            'system',
        );

        try {
            $repository->transition(
                (int) $user->id,
                (string) $task->id,
                BrowserTaskStatus::Cancelled,
                1,
                'reused-command',
                'task.cancelled',
                'user',
            );
            $this->fail('A reused command ID with different intent was accepted.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TASK_COMMAND_CONFLICT', $exception->errorCode);
        }
    }

    public function test_stale_competing_version_writes_no_event(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('stale');
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->create(
            $this->taskAttributes($user, $session, $message, $browser),
            'create-stale-task',
            'user',
            (string) $user->id,
        );
        $repository->transition(
            (int) $user->id,
            (string) $task->id,
            BrowserTaskStatus::Planning,
            0,
            'first-stale-task-transition',
            'task.planning',
            'system',
        );

        try {
            $repository->transition(
                (int) $user->id,
                (string) $task->id,
                BrowserTaskStatus::Cancelled,
                0,
                'second-stale-task-transition',
                'task.cancelled',
                'user',
            );
            $this->fail('A stale state version was accepted.');
        } catch (TalosBrowserTaskException $exception) {
            $this->assertSame('TALOS_BROWSER_TASK_STATE_CONFLICT', $exception->errorCode);
        }

        $this->assertSame(2, TalosBrowserTaskEvent::query()->where('task_id', $task->id)->count());
        $this->assertSame('planning', $task->refresh()->status);
        $this->assertSame(1, $task->state_version);
    }

    public function test_event_insert_failure_rolls_the_projection_back(): void
    {
        [$user, $session, $message, $browser] = $this->browserContext('rollback');
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->create(
            $this->taskAttributes($user, $session, $message, $browser),
            'create-rollback-task',
            'user',
            (string) $user->id,
        );
        TalosBrowserTaskEvent::query()->create([
            'schema_version' => 'talos.browser.task-event.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'command_id' => 'preoccupied-version',
            'command_sha256' => 'sha256:'.str_repeat('a', 64),
            'event_type' => 'task.synthetic_conflict',
            'actor_type' => 'system',
            'actor_id' => null,
            'from_status' => 'created',
            'from_state_version' => 0,
            'to_status' => 'planning',
            'to_state_version' => 1,
            'payload' => [],
            'occurred_at' => now(),
        ]);

        try {
            $repository->transition(
                (int) $user->id,
                (string) $task->id,
                BrowserTaskStatus::Planning,
                0,
                'must-roll-back',
                'task.planning',
                'system',
            );
            $this->fail('The synthetic journal collision did not fail.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }

        $this->assertSame('created', $task->refresh()->status);
        $this->assertSame(0, $task->state_version);
        $this->assertDatabaseMissing('talos_browser_task_events', ['command_id' => 'must-roll-back']);
    }

    public function test_owner_scope_hides_foreign_tasks_and_events(): void
    {
        [$owner, $session, $message, $browser] = $this->browserContext('owner');
        $foreign = User::factory()->create();
        $repository = $this->app->make(TalosBrowserTaskRepository::class);
        $task = $repository->create(
            $this->taskAttributes($owner, $session, $message, $browser),
            'create-owned-task',
            'user',
            (string) $owner->id,
        );

        foreach ([
            static fn () => $repository->owned((int) $foreign->id, (string) $task->id),
            static fn () => $repository->events((int) $foreign->id, (string) $task->id),
        ] as $operation) {
            try {
                $operation();
                $this->fail('Foreign Browser task state was visible.');
            } catch (TalosBrowserTaskException $exception) {
                $this->assertSame('TALOS_BROWSER_TASK_NOT_FOUND', $exception->errorCode);
            }
        }
    }

    /** @return array{User, TalosSession, TalosMessage, TalosBrowserSession} */
    private function browserContext(string $suffix): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Task repository '.$suffix,
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Inspect example.test.',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-'.$suffix,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);

        return [$user, $session, $message, $browser];
    }

    /** @return array<string, mixed> */
    private function taskAttributes(User $user, TalosSession $session, TalosMessage $message, TalosBrowserSession $browser): array
    {
        return [
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'origin_message_id' => $message->id,
            'browser_session_id' => $browser->id,
            'goal' => 'Inspect example.test.',
            'status' => 'created',
            'autonomy_profile' => 'assist',
            'budget' => [
                'max_actions' => 8,
                'max_elapsed_ms' => 60_000,
                'max_bytes' => 1_000_000,
                'max_tabs' => 4,
            ],
            'state_version' => 0,
            'requested_at' => now(),
        ];
    }
}
