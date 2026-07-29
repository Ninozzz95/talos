<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Agent\TalosProviderGateway;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderStream;
use Kadmos\Provider\ProviderStreamDecoder;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Provider\StreamingProviderTurnAdapter;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Tests\TestCase;

final class TalosProviderGatewayStreamingTest extends TestCase
{
    use RefreshDatabase;

    public function test_streaming_start_uses_the_existing_operation_fence_and_persists_the_final_outcome(): void
    {
        [$user, $profile, $turn] = $this->context();
        $adapter = new GatewayStreamingTestAdapter;
        $gateway = new TalosProviderGateway(new GatewayStreamingTestResolver($adapter));
        $events = [];
        $request = new ProviderTurnRequest(
            provider: 'openai',
            model: 'gpt-test',
            systemPrompt: 'System.',
            messages: [['role' => 'user', 'content' => 'Stream this.']],
            tools: [],
        );

        $response = $gateway->startStreaming(
            (int) $user->id,
            $turn,
            $profile,
            $request,
            static function (ProviderStreamEvent $event) use (&$events): void {
                $events[] = $event->toArray();
            },
            static fn (): bool => false,
        );

        $this->assertSame(ProviderTurnResponse::FINAL, $response->kind);
        $this->assertSame('Streamed answer.', $response->text);
        $this->assertSame(1, $adapter->streamStartCalls);
        $this->assertSame(0, $adapter->bufferedStartCalls);
        $this->assertSame([
            [
                'kind' => ProviderStreamEvent::TEXT_DELTA,
                'sequence' => 1,
                'payload' => ['text' => 'Streamed '],
            ],
            [
                'kind' => ProviderStreamEvent::TEXT_DELTA,
                'sequence' => 2,
                'payload' => ['text' => 'answer.'],
            ],
            [
                'kind' => ProviderStreamEvent::COMPLETED,
                'sequence' => 3,
                'payload' => [
                    'outcome' => ProviderTurnResponse::FINAL,
                    'response_id' => 'response-streamed',
                    'stop_reason' => 'stop',
                ],
            ],
        ], $events);

        $stored = $turn->refresh();
        $this->assertSame('completed', $stored->provider_operation_status);
        $this->assertSame('completed', $stored->status);
        $this->assertNotNull($stored->provider_outcome);
        $this->assertSame(
            'sha256:'.hash('sha256', (string) $stored->provider_outcome),
            $stored->provider_outcome_sha256,
        );
    }

    /** @return array{User, TalosModelProfile, TalosToolTurn} */
    private function context(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Gateway stream',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Gateway stream',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'model_profile_id' => $profile->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Stream this.'),
            'prompt' => 'Stream this.',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'model_profile_id' => $profile->id,
            'status' => 'running',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'adapter_version' => 'gateway_stream_test_v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 16],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        return [$user, $profile, $turn];
    }
}

final class GatewayStreamingTestResolver implements TalosProviderAdapterResolver
{
    public function __construct(private readonly StreamingProviderTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): StreamingProviderTurnAdapter
    {
        return $this->adapter;
    }
}

final class GatewayStreamingTestAdapter implements StreamingProviderTurnAdapter
{
    public int $streamStartCalls = 0;

    public int $bufferedStartCalls = 0;

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'gateway_stream_test_v1', true, false, false, false, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->bufferedStartCalls++;

        return ProviderTurnResponse::final('Buffered answer.');
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        return ProviderTurnResponse::final('Buffered continuation.');
    }

    public function streamStart(ProviderTurnRequest $request, Closure $isCancelled): ProviderStream
    {
        $this->streamStartCalls++;

        return new ProviderStream(
            ['Streamed ', 'answer.'],
            new GatewayStreamingTestDecoder,
        );
    }

    public function streamContinue(
        ProviderTurnState $state,
        array $toolResults,
        Closure $isCancelled,
    ): ProviderStream {
        return new ProviderStream(
            ['continued'],
            new GatewayStreamingTestDecoder,
        );
    }
}

final class GatewayStreamingTestDecoder implements ProviderStreamDecoder
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
            'response-streamed',
            'stop',
            new TokenUsage(4, 2, 6),
        );
    }
}
