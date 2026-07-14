<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Web\TalosWebFetchException;
use App\Services\Talos\Web\TalosWebFetchService;
use App\Services\Talos\Web\WebSearchProviderFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosWebToolPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_tool_routes_require_an_authenticated_owner(): void
    {
        $this->postJson('/api/talos/web/search', ['query' => 'latest news'])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'TALOS_AUTH_REQUIRED');

        $this->postJson('/api/talos/web/fetch', ['url' => 'https://example.com'])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'TALOS_AUTH_REQUIRED');
    }

    public function test_configured_search_provider_is_reached_through_the_owner_scoped_production_route(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        config()->set('services.talos.web.search', [
            'provider' => 'browser',
            'browser' => [
                'enabled' => true,
                'origin' => 'https://search.example/search',
            ],
        ]);
        $client = new FakeBrowserSessionClient;
        $client->snapshotResponse = [
            'nodes' => [[
                'ref' => 'r1',
                'role' => 'link',
                'name' => 'Verified result',
                'href' => 'https://example.com/result',
                'visible' => true,
            ]],
        ];
        $this->app->instance(BrowserSessionClient::class, $client);
        $this->app->forgetInstance(WebSearchProviderFactory::class);

        $this->postJson('/api/talos/web/search', [
            'query' => 'latest news',
            'options' => ['language' => 'en', 'safesearch' => 1],
        ])
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.results.0.title', 'Verified result')
            ->assertJsonPath('data.results.0.url', 'https://example.com/result')
            ->assertJsonPath('data.results.0.untrusted', true)
            ->assertJsonPath('data.provenance', 'untrusted_web_search');

        $this->assertSame('talos-user:'.$user->id, $client->requests[0]['ownerRef']);
    }

    public function test_application_fetch_route_blocks_private_targets_before_dispatch(): void
    {
        $this->actingAs(User::factory()->create());
        Http::fake();

        $this->postJson('/api/talos/web/fetch', [
            'url' => 'http://169.254.169.254/latest/meta-data',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_WEB_FETCH_URL_BLOCKED');

        Http::assertNothingSent();
    }

    public function test_web_tool_route_validation_is_bounded_and_rejects_unknown_options(): void
    {
        $this->actingAs(User::factory()->create());

        $this->postJson('/api/talos/web/search', [
            'query' => 'news',
            'options' => ['unexpected' => true],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_WEB_VALIDATION_FAILED');

        $this->postJson('/api/talos/web/fetch', [
            'url' => 'https://example.com',
            'max_bytes' => 10000001,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_WEB_VALIDATION_FAILED');
    }

    public function test_application_fetch_service_still_fails_closed_when_resolved_directly(): void
    {
        Http::fake();

        try {
            $this->app->make(TalosWebFetchService::class)->fetch('http://169.254.169.254/latest/meta-data');
            $this->fail('Metadata URL crossed the application fetch boundary.');
        } catch (TalosWebFetchException $exception) {
            $this->assertSame('TALOS_WEB_FETCH_URL_BLOCKED', $exception->errorCode);
        }

        Http::assertNothingSent();
    }
}
