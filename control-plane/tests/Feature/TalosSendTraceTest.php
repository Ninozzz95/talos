<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Chat\TalosSendTrace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\TestCase;

final class TalosSendTraceTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_persists_only_run_derived_identity_and_allowlisted_metrics(): void
    {
        [$user, $run] = $this->context();

        $event = app(TalosSendTrace::class)->record(
            (int) $user->id,
            $run,
            'provider',
            true,
            [
                'elapsed_ms' => 245,
                'time_to_first_event_ms' => 81,
                'input_tokens' => 19,
                'output_tokens' => 7,
                'cached_tokens' => 3,
                'cache_read_tokens' => 3,
                'cache_write_tokens' => null,
                'cache_miss_tokens' => 0,
                'cache_write_5m_tokens' => null,
                'cache_write_1h_tokens' => null,
                'event_count' => 4,
                'tool_call_count' => 1,
            ],
        );

        $this->assertSame('chat.send.trace', $event->event_type);
        $this->assertSame([
            'phase' => 'provider',
            'streamed' => true,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'run_status' => 'running',
            'elapsed_ms' => 245,
            'time_to_first_event_ms' => 81,
            'input_tokens' => 19,
            'output_tokens' => 7,
            'cached_tokens' => 3,
            'cache_read_tokens' => 3,
            'cache_write_tokens' => null,
            'cache_miss_tokens' => 0,
            'cache_write_5m_tokens' => null,
            'cache_write_1h_tokens' => null,
            'event_count' => 4,
            'tool_call_count' => 1,
        ], $event->payload);
    }

    public function test_it_rejects_forbidden_or_unknown_trace_fields_before_persistence(): void
    {
        [$user, $run] = $this->context();

        try {
            app(TalosSendTrace::class)->record(
                (int) $user->id,
                $run,
                'provider',
                true,
                [
                    'elapsed_ms' => 4,
                    'prompt' => 'private prompt',
                    'api_key' => 'secret',
                    'headers' => ['Authorization' => 'Bearer secret'],
                    'reasoning' => 'private chain of thought',
                    'tool_arguments' => ['query' => 'private query'],
                ],
            );
            $this->fail('Forbidden trace fields were accepted.');
        } catch (InvalidArgumentException $exception) {
            $this->assertSame('Send trace metrics contain unsupported fields.', $exception->getMessage());
        }

        $this->assertDatabaseMissing('talos_run_events', [
            'run_id' => $run->id,
            'event_type' => 'chat.send.trace',
        ]);
    }

    public function test_it_rejects_foreign_runs(): void
    {
        [$owner, $run] = $this->context();
        $foreign = User::factory()->create();
        $trace = app(TalosSendTrace::class);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Send trace run is not owned by the current user.');
        $trace->record((int) $foreign->id, $run, 'provider', true);

        $this->assertNotSame($owner->id, $foreign->id);
    }

    public function test_it_rejects_non_integer_negative_and_unbounded_metrics(): void
    {
        [$user, $run] = $this->context();
        $trace = app(TalosSendTrace::class);

        foreach ([-1, 1.5, null, 2_147_483_648] as $invalid) {
            try {
                $trace->record(
                    (int) $user->id,
                    $run,
                    'provider',
                    true,
                    ['elapsed_ms' => $invalid],
                );
                $this->fail('An invalid send trace metric was accepted.');
            } catch (InvalidArgumentException $exception) {
                $this->assertSame(
                    'Send trace metric elapsed_ms must be an integer between 0 and 2147483647.',
                    $exception->getMessage(),
                );
            }
        }

        $this->assertDatabaseMissing('talos_run_events', [
            'run_id' => $run->id,
            'event_type' => 'chat.send.trace',
        ]);
    }

    /** @return array{User, TalosRun} */
    private function context(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Stream trace',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'private prompt'),
            'prompt' => 'private prompt',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
        ]);

        return [$user, $run];
    }
}
