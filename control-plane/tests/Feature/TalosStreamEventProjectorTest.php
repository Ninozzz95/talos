<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Chat\TalosStreamEventProjector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Kadmos\Provider\ProviderStreamEvent;
use Tests\TestCase;

final class TalosStreamEventProjectorTest extends TestCase
{
    use RefreshDatabase;

    public function test_provider_events_are_persisted_before_projection_and_tool_arguments_never_leave_the_server(): void
    {
        [$user, $run] = $this->context();
        $projector = $this->app->make(TalosStreamEventProjector::class);

        $text = $projector->projectProviderEvent(
            (int) $user->id,
            $run,
            new ProviderStreamEvent(
                ProviderStreamEvent::TEXT_DELTA,
                1,
                ['text' => 'Visible delta.'],
            ),
        );
        $tool = $projector->projectProviderEvent(
            (int) $user->id,
            $run,
            new ProviderStreamEvent(
                ProviderStreamEvent::TOOL_CALL_DELTA,
                2,
                [
                    'index' => 0,
                    'provider_call_id' => 'call-1',
                    'name' => 'web_search',
                    'arguments_delta' => '{"api_key":"must-never-leave"}',
                ],
            ),
        );

        $this->assertSame([
            'contract' => 'talos.chat.stream.v1',
            'run_id' => (string) $run->id,
            'sequence' => 1,
            'kind' => 'text.delta',
            'occurred_at' => $text['occurred_at'],
            'payload' => [
                'text' => 'Visible delta.',
                'provider_sequence' => 1,
            ],
        ], $text);
        $this->assertSame('tool.started', $tool['kind']);
        $this->assertSame([
            'provider_sequence' => 2,
            'index' => 0,
            'provider_call_id' => 'call-1',
            'name' => 'web_search',
            'arguments_progressed' => true,
        ], $tool['payload']);
        $this->assertSame(2, $run->events()->count());
        $this->assertStringNotContainsString(
            'must-never-leave',
            json_encode($run->events()->get()->map->toApiArray()->all(), JSON_THROW_ON_ERROR),
        );
    }

    public function test_lifecycle_payloads_are_exactly_allowlisted_before_any_event_is_persisted(): void
    {
        [$user, $run] = $this->context();
        $projector = $this->app->make(TalosStreamEventProjector::class);
        $invalidPayloads = [
            [
                'kind' => 'tool.started',
                'payload' => [
                    'provider_call_id' => 'call-1',
                    'tool_name' => 'web_search',
                    'status' => 'running',
                    'raw_tool_arguments' => ['api_key' => 'must-never-persist'],
                ],
            ],
            [
                'kind' => 'tool.completed',
                'payload' => [
                    'provider_call_id' => 'call-1',
                    'tool_name' => 'web_search',
                ],
            ],
            [
                'kind' => 'run.failed',
                'payload' => [
                    'status' => 'failed',
                    'code' => 'TALOS_PROVIDER_FAILED',
                    'retryable' => false,
                    'headers' => ['Authorization' => 'Bearer private'],
                ],
            ],
            [
                'kind' => 'stream.heartbeat',
                'payload' => ['prompt' => 'private prompt'],
            ],
        ];

        foreach ($invalidPayloads as $case) {
            try {
                $projector->projectLifecycle(
                    (int) $user->id,
                    $run,
                    $case['kind'],
                    $case['payload'],
                );
                $this->fail("Invalid {$case['kind']} payload was accepted.");
            } catch (InvalidArgumentException) {
                $this->assertSame(0, $run->events()->count());
            }
        }
    }

    public function test_valid_lifecycle_payloads_are_normalized_into_stable_public_envelopes(): void
    {
        [$user, $run] = $this->context();
        $projector = $this->app->make(TalosStreamEventProjector::class);
        $requestKey = TalosStreamEventProjector::CONTRACT.':'.$run->id.':assistant';
        $timestamp = now()->toJSON();

        $events = [
            $projector->projectLifecycle((int) $user->id, $run, 'run.started'),
            $projector->projectLifecycle((int) $user->id, $run, 'tool.started', [
                'provider_call_id' => 'call-1',
                'tool_name' => 'web_search',
                'status' => 'running',
            ]),
            $projector->projectLifecycle((int) $user->id, $run, 'tool.progress', [
                'provider_call_id' => 'call-1',
                'tool_name' => 'web_search',
                'status' => 'awaiting_approval',
            ]),
            $projector->projectLifecycle((int) $user->id, $run, 'tool.completed', [
                'provider_call_id' => 'call-1',
                'tool_name' => 'web_search',
                'status' => 'succeeded',
            ]),
            $projector->projectLifecycle((int) $user->id, $run, 'artifact.created', [
                'artifact_id' => 'artifact-1',
                'artifact_type' => 'browser_screenshot',
                'mime_type' => 'image/png',
                'name' => 'Current frame',
                'size_bytes' => 1024,
            ]),
            $projector->projectLifecycle((int) $user->id, $run, 'message.completed', [
                'message_id' => 'message-1',
                'request_key' => $requestKey,
                'message' => [
                    'id' => 'message-1',
                    'session_id' => (string) $run->session_id,
                    'role' => 'assistant',
                    'content' => 'Completed answer.',
                    'model_profile_id' => null,
                    'run_id' => (string) $run->id,
                    'request_key' => $requestKey,
                    'metadata' => [
                        'source' => 'test',
                        'raw_tool_arguments' => ['api_key' => 'must-be-removed'],
                    ],
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ],
            ]),
            $projector->projectLifecycle((int) $user->id, $run, 'run.failed', [
                'status' => 'recovery_required',
                'code' => 'TALOS_PROVIDER_RECOVERY_REQUIRED',
                'retryable' => true,
            ]),
            $projector->projectLifecycle((int) $user->id, $run, 'run.cancelled', [
                'reason' => 'user_requested',
            ]),
            $projector->projectLifecycle((int) $user->id, $run, 'stream.heartbeat'),
        ];

        $this->assertSame([
            'run.started',
            'tool.started',
            'tool.progress',
            'tool.completed',
            'artifact.created',
            'message.completed',
            'run.failed',
            'run.cancelled',
            'stream.heartbeat',
        ], array_column($events, 'kind'));
        $this->assertSame(range(1, 9), array_column($events, 'sequence'));
        $this->assertSame([
            'id',
            'session_id',
            'model_profile_id',
            'model_routing_profile_id',
            'context_set_id',
            'mode',
            'status',
            'provider',
            'model',
            'started_at',
        ], array_keys($events[0]['payload']['run']));
        $this->assertSame([
            'source' => 'test',
            'contract' => 'talos.message.metadata.v2',
        ], $events[5]['payload']['message']['metadata']);
        $this->assertSame([], $events[8]['payload']);
    }

    /** @return array{User, TalosRun} */
    private function context(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Stream projection',
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
            'metadata' => [],
            'started_at' => now(),
        ]);

        return [$user, $run];
    }
}
