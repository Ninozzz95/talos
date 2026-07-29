<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Chat\TalosStreamEventProjector;
use App\Services\Talos\Chat\TalosStreamReconciler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Kadmos\Provider\ProviderStreamEvent;
use Tests\TestCase;

final class TalosChatStreamRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_reconciliation_returns_only_public_events_after_the_known_sequence_and_the_durable_final_message(): void
    {
        [$user, $session, $run] = $this->context();
        $projector = $this->app->make(TalosStreamEventProjector::class);
        $projector->projectLifecycle((int) $user->id, $run, 'run.started');
        $projector->projectProviderEvent(
            (int) $user->id,
            $run,
            new ProviderStreamEvent(
                ProviderStreamEvent::TEXT_DELTA,
                1,
                ['text' => 'Recovered answer.'],
            ),
        );
        $projector->projectProviderEvent(
            (int) $user->id,
            $run,
            new ProviderStreamEvent(
                ProviderStreamEvent::COMPLETED,
                2,
                [
                    'outcome' => 'final',
                    'response_id' => 'response-1',
                    'stop_reason' => 'stop',
                ],
            ),
        );
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'assistant',
            'content' => 'Recovered answer.',
            'run_id' => $run->id,
            'request_key' => 'talos.chat.stream.v1:'.$run->id.':assistant',
            'metadata' => ['source' => 'talos_agent_turn'],
        ]);
        $run->forceFill(['status' => 'succeeded', 'completed_at' => now()])->save();
        $projector->projectLifecycle((int) $user->id, $run, 'message.completed', [
            'message_id' => (string) $message->id,
            'request_key' => (string) $message->request_key,
            'message' => [
                'id' => (string) $message->id,
                'session_id' => (string) $message->session_id,
                'role' => (string) $message->role,
                'content' => (string) $message->content,
                'model_profile_id' => $message->model_profile_id,
                'run_id' => (string) $message->run_id,
                'request_key' => (string) $message->request_key,
                'metadata' => $message->metadata,
                'created_at' => $message->created_at?->toJSON(),
                'updated_at' => $message->updated_at?->toJSON(),
            ],
        ]);

        $snapshot = $this->app->make(TalosStreamReconciler::class)->snapshot(
            (int) $user->id,
            $run->refresh(),
            1,
        );

        $this->assertSame('talos.chat.stream.v1', $snapshot['contract']);
        $this->assertSame([2, 4], array_column($snapshot['events'], 'sequence'));
        $this->assertSame(['text.delta', 'message.completed'], array_column($snapshot['events'], 'kind'));
        $this->assertSame((string) $message->id, $snapshot['assistant_message']['id']);
        $this->assertSame('Recovered answer.', $snapshot['assistant_message']['content']);
        $this->assertSame(4, $snapshot['last_sequence']);
        $this->assertTrue($snapshot['terminal']);
        $this->assertStringNotContainsString(
            'provider.stream.completed',
            json_encode($snapshot, JSON_THROW_ON_ERROR),
        );
        $this->assertStringNotContainsString('stream', json_encode($snapshot['run'], JSON_THROW_ON_ERROR));
    }

    /** @return array{User, TalosSession, TalosRun} */
    private function context(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Stream recovery',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'stream'),
            'prompt' => 'stream',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
        ]);

        return [$user, $session, $run];
    }
}
