<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Web\BrowserBackedWebSearchProvider;
use App\Services\Talos\Web\SearxngWebSearchProvider;
use App\Services\Talos\Web\UnavailableWebSearchProvider;
use App\Services\Talos\Web\WebSearchProvider;
use App\Services\Talos\Web\WebSearchProviderFactory;
use Tests\TestCase;

final class WebSearchProviderFactoryTest extends TestCase
{
    public function test_default_and_unknown_drivers_fail_closed_without_claiming_search(): void
    {
        foreach ([[], ['provider' => 'unknown']] as $configuration) {
            $provider = $this->factory($configuration)->forOwner('user:7');
            $response = $provider->search('current news');

            $this->assertInstanceOf(UnavailableWebSearchProvider::class, $provider);
            $this->assertFalse($response->available);
            $this->assertContains($response->reason, ['provider_not_configured', 'provider_unsupported']);
        }
    }

    public function test_searxng_driver_requires_an_explicit_valid_endpoint(): void
    {
        $missing = $this->factory(['provider' => 'searxng'])->forOwner('user:7');
        $configured = $this->factory([
            'provider' => 'searxng',
            'searxng' => ['url' => 'http://searxng:8080'],
        ])->forOwner('user:7');

        $this->assertInstanceOf(UnavailableWebSearchProvider::class, $missing);
        $this->assertSame('searxng_not_configured', $missing->search('query')->reason);
        $this->assertInstanceOf(SearxngWebSearchProvider::class, $configured);
    }

    public function test_nonblank_owner_is_required_before_any_driver_is_selected(): void
    {
        foreach ([
            ['provider' => 'unavailable'],
            ['provider' => 'unknown'],
            ['provider' => 'searxng', 'searxng' => ['url' => 'http://searxng:8080']],
        ] as $configuration) {
            $provider = $this->factory($configuration)->forOwner(" \t\n");

            $this->assertInstanceOf(UnavailableWebSearchProvider::class, $provider);
            $this->assertSame('owner_context_invalid', $provider->search('query')->reason);
        }
    }

    public function test_browser_driver_requires_explicit_enablement_origin_and_owner_context(): void
    {
        $disabled = $this->factory([
            'provider' => 'browser',
            'browser' => ['enabled' => false, 'origin' => 'https://search.example/search'],
        ])->forOwner('user:7');
        $missingOrigin = $this->factory([
            'provider' => 'browser',
            'browser' => ['enabled' => true, 'origin' => null],
        ])->forOwner('user:7');
        $invalidOwner = $this->factory([
            'provider' => 'browser',
            'browser' => ['enabled' => true, 'origin' => 'https://search.example/search'],
        ])->forOwner('');
        $configured = $this->factory([
            'provider' => 'browser',
            'browser' => ['enabled' => true, 'origin' => 'https://search.example/search'],
        ])->forOwner('user:7');

        $this->assertSame('browser_search_disabled', $disabled->search('query')->reason);
        $this->assertSame('browser_search_not_configured', $missingOrigin->search('query')->reason);
        $this->assertSame('owner_context_invalid', $invalidOwner->search('query')->reason);
        $this->assertInstanceOf(BrowserBackedWebSearchProvider::class, $configured);
        $this->assertTrue($configured->enabled);
        $this->assertSame('https://search.example/search', $configured->searchOrigin);
    }

    public function test_service_container_exposes_the_owner_aware_factory_and_a_fail_closed_default_provider(): void
    {
        config()->set('services.talos.web.search', ['provider' => 'unavailable']);
        $this->app->forgetInstance(WebSearchProviderFactory::class);

        $this->assertInstanceOf(WebSearchProviderFactory::class, $this->app->make(WebSearchProviderFactory::class));
        $provider = $this->app->make(WebSearchProvider::class);

        $this->assertInstanceOf(UnavailableWebSearchProvider::class, $provider);
        $this->assertSame('owner_context_required', $provider->search('query')->reason);
    }

    /** @param array<string, mixed> $configuration */
    private function factory(array $configuration): WebSearchProviderFactory
    {
        return new WebSearchProviderFactory(new FakeBrowserSessionClient, $configuration);
    }
}
