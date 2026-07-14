<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Runs\TalosRunEventRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

final class TalosRunEventRecorderTest extends TestCase
{
    use RefreshDatabase;

    public function test_records_a_redacted_normalized_event_for_a_coherent_owner(): void
    {
        $user = User::factory()->create();
        $run = $this->createRun($user);
        $recorder = app(TalosRunEventRecorder::class);

        $event = $recorder->record([
            'run_id' => $run->id,
            'user_id' => $user->id,
        ], [
            'type' => 'tool.execution.completed',
            'node_id' => 'tool-1',
            'payload' => [
                'api_key' => 'secret-value',
                'nested' => ['refresh_token' => 'refresh-secret', 'safe' => 'visible'],
            ],
        ]);

        $this->assertSame($run->id, $event->run_id);
        $this->assertSame(1, $event->sequence);
        $this->assertSame('tool.execution.completed', $event->event_type);
        $this->assertSame('info', $event->severity);
        $this->assertSame('[redacted]', $event->payload['api_key']);
        $this->assertSame('[redacted]', $event->payload['nested']['refresh_token']);
        $this->assertSame('visible', $event->payload['nested']['safe']);
    }

    public function test_rejects_an_owner_that_does_not_match_the_run_or_event_ids(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $run = $this->createRun($owner);
        $recorder = app(TalosRunEventRecorder::class);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('owner');

        $recorder->record([
            'run_id' => $run->id,
            'user_id' => $other->id,
        ], [
            'event_type' => 'tool.execution.started',
            'run_id' => $run->id,
            'user_id' => $other->id,
        ]);
    }

    public function test_rejects_event_ids_that_do_not_match_the_coherent_owner(): void
    {
        $user = User::factory()->create();
        $run = $this->createRun($user);
        $recorder = app(TalosRunEventRecorder::class);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('run_id');

        $recorder->record([
            'run_id' => $run->id,
            'user_id' => $user->id,
        ], [
            'event_type' => 'tool.execution.started',
            'run_id' => 'foreign-run',
        ]);
    }

    public function test_serializes_sibling_appends_behind_the_locked_run(): void
    {
        $user = User::factory()->create();
        $run = $this->createRun($user);
        $owner = ['run_id' => $run->id, 'user_id' => $user->id];
        $recorder = app(TalosRunEventRecorder::class);

        $first = $recorder->record($owner, ['event_type' => 'tool.execution.started']);
        $second = $recorder->record($owner, ['event_type' => 'tool.execution.completed']);

        $this->assertSame([1, 2], DB::table('talos_run_events')
            ->where('run_id', $run->id)
            ->orderBy('sequence')
            ->pluck('sequence')
            ->all());
        $this->assertSame(1, $first->sequence);
        $this->assertSame(2, $second->sequence);
    }

    public function test_missing_run_is_not_recorded(): void
    {
        $user = User::factory()->create();
        $recorder = app(TalosRunEventRecorder::class);

        $this->expectException(ModelNotFoundException::class);

        $recorder->record([
            'run_id' => 'missing-run',
            'user_id' => $user->id,
        ], ['event_type' => 'tool.execution.started']);
    }

    private function createRun(User $user): TalosRun
    {
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Recorder test',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);

        return TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'recorder test'),
        ]);
    }
}
