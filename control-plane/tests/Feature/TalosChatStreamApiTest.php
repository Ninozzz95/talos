<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderStream;
use Kadmos\Provider\ProviderStreamDecoder;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Provider\StreamingProviderTurnAdapter;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Tests\TestCase;

final class TalosChatStreamApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_backed_chat_streams_canonical_events_and_retries_without_a_second_provider_call(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Live stream',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Stream model',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Stream this answer.',
            'metadata' => [],
        ]);
        $adapter = new ChatStreamApiTestAdapter;
        $this->app->instance(
            TalosProviderAdapterResolver::class,
            new ChatStreamApiTestResolver($adapter),
        );
        $payload = [
            'message' => 'Stream this answer.',
            'session_id' => $session->id,
            'user_message_id' => $message->id,
            'model_profile_id' => $profile->id,
        ];

        $first = $this->postJson('/api/talos/chat/stream', $payload);

        $first->assertOk();
        $this->assertStringStartsWith('text/event-stream', (string) $first->headers->get('content-type'));
        $firstContent = $first->streamedContent();
        $this->assertSame([
            'run.started',
            'text.delta',
            'text.delta',
            'message.completed',
        ], $this->streamKinds($firstContent));
        $firstSequences = $this->streamSequences($firstContent);
        $this->assertCount(4, $firstSequences);
        $this->assertSame(1, $adapter->streamStartCalls);
        $run = TalosRun::query()->where('session_id', $session->id)->firstOrFail();
        $assistant = TalosMessage::query()
            ->where('run_id', $run->id)
            ->where('role', 'assistant')
            ->firstOrFail();
        $this->assertSame('Streamed API answer.', $assistant->content);
        $this->assertSame(
            'talos.chat.stream.v1:'.$run->id.':assistant',
            $assistant->request_key,
        );
        $trace = $run->events()->where('event_type', 'chat.send.trace')->firstOrFail();
        $this->assertSame(2, $trace->payload['cached_tokens'] ?? null);
        $this->assertSame(2, $trace->payload['cache_read_tokens'] ?? null);
        $this->assertSame(1, $trace->payload['cache_write_tokens'] ?? null);
        $this->assertSame(4, $trace->payload['cache_miss_tokens'] ?? null);
        $this->assertNull($trace->payload['cache_write_5m_tokens'] ?? null);
        $this->assertNull($trace->payload['cache_write_1h_tokens'] ?? null);

        $retry = $this->postJson('/api/talos/chat/stream', $payload);

        $retry->assertOk();
        $retryContent = $retry->streamedContent();
        $this->assertSame([
            'run.started',
            'text.delta',
            'text.delta',
            'message.completed',
        ], $this->streamKinds($retryContent));
        $this->assertSame(1, $adapter->streamStartCalls);
        $this->assertSame(1, TalosRun::query()->where('session_id', $session->id)->count());
        $this->assertSame(
            1,
            TalosMessage::query()->where('run_id', $run->id)->where('role', 'assistant')->count(),
        );

        $cursorRetry = $this->postJson('/api/talos/chat/stream', [
            ...$payload,
            'after_sequence' => $firstSequences[1],
        ]);

        $cursorRetry
            ->assertOk()
            ->assertHeader('X-Talos-Reconciled', '1');
        $cursorContent = $cursorRetry->streamedContent();
        $this->assertSame(
            ['text.delta', 'message.completed'],
            $this->streamKinds($cursorContent),
        );
        $this->assertSame(
            [$firstSequences[2], $firstSequences[3]],
            $this->streamSequences($cursorContent),
        );
        $this->assertSame(1, $adapter->streamStartCalls);
    }

    public function test_changed_bound_origin_is_rejected_before_a_new_run_or_provider_call(): void
    {
        $user = $this->authenticateTalosUser();
        [$run, $session] = $this->runFor($user);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Stream model',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Original bound message.',
            'metadata' => [],
        ]);
        $adapter = new ChatStreamApiTestAdapter;
        $this->app->instance(
            TalosProviderAdapterResolver::class,
            new ChatStreamApiTestResolver($adapter),
        );

        $this->postJson('/api/talos/chat/stream', [
            'message' => 'Changed bound message.',
            'session_id' => $session->id,
            'user_message_id' => $message->id,
            'model_profile_id' => $profile->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_message_id']);

        $this->assertSame(1, TalosRun::query()->where('session_id', $session->id)->count());
        $this->assertSame(0, $adapter->streamStartCalls);
    }

    public function test_stream_requires_authentication_and_hides_foreign_sessions(): void
    {
        $this->postJson('/api/talos/chat/stream', [
            'message' => 'Private stream.',
            'session_id' => 'foreign-session',
            'user_message_id' => 'foreign-message',
        ])->assertUnauthorized();

        $user = $this->authenticateTalosUser();
        $foreign = User::factory()->create();
        $foreignSession = TalosSession::query()->create([
            'user_id' => $foreign->id,
            'title' => 'Foreign stream',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $foreignMessage = TalosMessage::query()->create([
            'session_id' => $foreignSession->id,
            'role' => 'user',
            'content' => 'Private stream.',
            'metadata' => [],
        ]);
        $adapter = new ChatStreamApiTestAdapter;
        $this->app->instance(
            TalosProviderAdapterResolver::class,
            new ChatStreamApiTestResolver($adapter),
        );

        $this->postJson('/api/talos/chat/stream', [
            'message' => 'Private stream.',
            'session_id' => $foreignSession->id,
            'user_message_id' => $foreignMessage->id,
        ])->assertNotFound();

        $this->assertSame(0, $adapter->streamStartCalls);
        $this->assertFalse(TalosRun::query()->where('user_id', $user->id)->exists());
    }

    public function test_owner_can_cancel_a_running_stream_once_and_retry_idempotently(): void
    {
        $user = $this->authenticateTalosUser();
        [$run, $session] = $this->runFor($user);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'adapter_version' => 'test_v1',
            'pending_tool_call_ids' => [],
            'provider_operation_key' => 'operation-key',
            'provider_operation_hash' => hash('sha256', 'operation'),
            'provider_operation_status' => 'in_flight',
            'provider_round' => 0,
            'revision' => 0,
            'budget_policy' => [],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        $first = $this->postJson("/api/talos/runs/{$run->id}/cancel");

        $first
            ->assertOk()
            ->assertJsonPath('data.run.status', 'cancelled')
            ->assertJsonPath('data.already_cancelled', false)
            ->assertJsonPath('data.event.contract', 'talos.chat.stream.v1')
            ->assertJsonPath('data.event.kind', 'run.cancelled')
            ->assertJsonPath('data.event.payload.reason', 'user_requested');
        $sequence = $first->json('data.event.sequence');
        $this->assertIsInt($sequence);
        $this->assertSame('cancelled', $turn->refresh()->status);
        $this->assertSame('cancelled', $turn->provider_operation_status);
        $this->assertNotNull($turn->cancel_requested_at);

        $this->postJson("/api/talos/runs/{$run->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.run.status', 'cancelled')
            ->assertJsonPath('data.already_cancelled', true)
            ->assertJsonPath('data.event.sequence', $sequence);

        $this->assertSame(
            1,
            $run->events()->where('event_type', 'run.cancelled')->count(),
        );
    }

    public function test_completed_or_foreign_runs_cannot_be_cancelled(): void
    {
        $user = $this->authenticateTalosUser();
        [$completed] = $this->runFor($user, 'succeeded');
        [$foreign] = $this->runFor(User::factory()->create());

        $this->postJson("/api/talos/runs/{$completed->id}/cancel")
            ->assertConflict()
            ->assertJsonPath('error.code', 'TALOS_RUN_NOT_CANCELLABLE');
        $this->postJson("/api/talos/runs/{$foreign->id}/cancel")
            ->assertNotFound();
    }

    /** @return array{TalosRun, TalosSession} */
    private function runFor(User $user, string $status = 'running'): array
    {
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Streaming API',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => $status,
            'prompt_hash' => hash('sha256', 'Stream this response.'),
            'prompt' => 'Stream this response.',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
            'completed_at' => $status === 'running' ? null : now(),
        ]);

        return [$run, $session];
    }

    /** @return list<string> */
    private function streamKinds(string $content): array
    {
        preg_match_all('/^event: ([^\r\n]+)$/m', $content, $matches);

        return array_values($matches[1] ?? []);
    }

    /** @return list<int> */
    private function streamSequences(string $content): array
    {
        preg_match_all('/^id: ([0-9]+)$/m', $content, $matches);

        return array_map(
            static fn (string $sequence): int => (int) $sequence,
            array_values($matches[1] ?? []),
        );
    }
}

final class ChatStreamApiTestResolver implements TalosProviderAdapterResolver
{
    public function __construct(private readonly ProviderTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        return $this->adapter;
    }
}

final class ChatStreamApiTestAdapter implements StreamingProviderTurnAdapter
{
    public int $streamStartCalls = 0;

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'chat_stream_api_test_v1', true, false, false, false, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        return ProviderTurnResponse::final('Buffered API answer.');
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        return ProviderTurnResponse::final('Buffered API continuation.');
    }

    public function streamStart(ProviderTurnRequest $request, Closure $isCancelled): ProviderStream
    {
        $this->streamStartCalls++;

        return new ProviderStream(
            ['Streamed API ', 'answer.'],
            new ChatStreamApiTestDecoder,
        );
    }

    public function streamContinue(
        ProviderTurnState $state,
        array $toolResults,
        Closure $isCancelled,
    ): ProviderStream {
        return new ProviderStream(
            ['Streamed continuation.'],
            new ChatStreamApiTestDecoder,
        );
    }
}

final class ChatStreamApiTestDecoder implements ProviderStreamDecoder
{
    private int $sequence = 0;

    private string $text = '';

    public function push(string $chunk): array
    {
        $this->text .= $chunk;

        return [new ProviderStreamEvent(
            ProviderStreamEvent::TEXT_DELTA,
            ++$this->sequence,
            ['text' => $chunk],
        )];
    }

    public function finish(): ProviderTurnResponse
    {
        return ProviderTurnResponse::final(
            $this->text,
            'chat-stream-api-response',
            'stop',
            new TokenUsage(
                inputTokens: 6,
                outputTokens: 4,
                totalTokens: 10,
                cachedTokens: 2,
                cacheReadTokens: 2,
                cacheWriteTokens: 1,
                cacheMissTokens: 4,
            ),
        );
    }
}
