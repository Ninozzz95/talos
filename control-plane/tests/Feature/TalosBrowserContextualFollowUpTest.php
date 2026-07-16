<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserFollowUpResolver;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use App\Services\Talos\Browser\TalosBrowserUrlIntentResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Tests\TestCase;

final class TalosBrowserContextualFollowUpTest extends TestCase
{
    use RefreshDatabase;

    public function test_ambiguous_urls_persist_a_compact_clarification_without_dispatch(): void
    {
        $user = $this->authenticateTalosUser();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Ambiguous Browser request',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Contextual Browser test',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
            'status' => 'healthy',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-contextual-follow-up',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'expires_at' => now()->addHour(),
        ]);
        $prompt = 'Confronta https://one.example/path e https://two.example/item.';
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => $prompt,
            'metadata' => ['source' => 'talos_chat_page'],
        ]);
        $client = new FakeBrowserSessionClient;
        $adapter = new ContextualFollowUpNoDispatchAdapter;
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->instance(TalosProviderAdapterResolver::class, new ContextualFollowUpResolver($adapter));
        $this->app->instance(TalosBrowserFollowUpResolver::class, new TalosBrowserFollowUpResolver(
            new TalosBrowserUrlIntentResolver(policy: new TalosBrowserPolicy(
                publicPolicy: new PublicHttpUrlPolicy(
                    resolver: static fn (string $host): array => ['93.184.216.34'],
                ),
            )),
        ));

        $response = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $prompt,
            'model_profile_id' => $profile->id,
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk()
            ->assertJsonPath('browser_clarification.type', 'multiple_urls')
            ->assertJsonPath('browser_clarification.choices.0.url', 'https://one.example/path')
            ->assertJsonPath('browser_clarification.choices.1.url', 'https://two.example/item')
            ->assertJsonPath('assistant_message.metadata.browser_follow_up.operation', 'clarify');

        $this->assertSame(0, $adapter->startCalls);
        $this->assertSame([], array_values(array_filter(
            $client->requests,
            static fn (array $request): bool => ($request['method'] ?? null) !== 'inspect',
        )));
        $this->assertDatabaseHas('talos_messages', [
            'session_id' => $session->id,
            'role' => 'assistant',
            'run_id' => $response->json('run.id'),
        ]);
        $this->assertSame('succeeded', TalosRun::query()->findOrFail($response->json('run.id'))->status);
    }
}

final class ContextualFollowUpResolver implements TalosProviderAdapterResolver
{
    public function __construct(private readonly ProviderTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        return $this->adapter;
    }
}

final class ContextualFollowUpNoDispatchAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities('openai', 'contextual_follow_up_v1', true, true, true, true, true, false, 'test');
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;

        return ProviderTurnResponse::final('Provider must not run.', 'unexpected-provider-run', 'stop', new TokenUsage(1, 1, 2));
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        throw new \RuntimeException('Provider continuation must not run for clarification.');
    }
}
