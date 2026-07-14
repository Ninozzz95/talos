<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use App\Services\Security\PublicHttpRequestPinning;
use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Browser\BrowserSessionClient;

final readonly class WebSearchProviderFactory
{
    /** @param array<string, mixed> $configuration */
    public function __construct(
        private BrowserSessionClient $browserClient,
        private array $configuration,
    ) {}

    public function forOwner(string $ownerRef): WebSearchProvider
    {
        if (trim($ownerRef) === '') {
            return new UnavailableWebSearchProvider('owner_context_invalid');
        }

        $driver = strtolower(trim(is_string($this->configuration['provider'] ?? null)
            ? $this->configuration['provider']
            : 'unavailable'));

        return match ($driver) {
            '', 'unavailable' => new UnavailableWebSearchProvider,
            'searxng' => $this->searxng(),
            'browser' => $this->browser($ownerRef),
            default => new UnavailableWebSearchProvider('provider_unsupported'),
        };
    }

    private function searxng(): WebSearchProvider
    {
        $configuration = $this->configuration['searxng'] ?? null;
        $endpoint = is_array($configuration) && is_string($configuration['url'] ?? null)
            ? trim($configuration['url'])
            : '';
        $parts = $endpoint !== '' ? parse_url($endpoint) : false;
        $scheme = is_array($parts) ? strtolower((string) ($parts['scheme'] ?? '')) : '';
        $host = is_array($parts) ? strtolower(rtrim((string) ($parts['host'] ?? ''), '.')) : '';
        if (! is_array($parts)
            || ! in_array($scheme, ['http', 'https'], true)
            || $host === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            return new UnavailableWebSearchProvider('searxng_not_configured');
        }

        $endpointPolicy = PublicHttpUrlPolicy::forTrustedServiceHosts([$host]);

        return new SearxngWebSearchProvider(
            $endpoint,
            $endpointPolicy,
            new PublicHttpRequestPinning($endpointPolicy),
            new PublicHttpUrlPolicy,
        );
    }

    private function browser(string $ownerRef): WebSearchProvider
    {
        $configuration = $this->configuration['browser'] ?? null;
        $enabled = is_array($configuration)
            && filter_var($configuration['enabled'] ?? false, FILTER_VALIDATE_BOOL) === true;
        if (! $enabled) {
            return new UnavailableWebSearchProvider('browser_search_disabled');
        }

        $origin = is_array($configuration) && is_string($configuration['origin'] ?? null)
            ? trim($configuration['origin'])
            : '';
        if ($origin === '') {
            return new UnavailableWebSearchProvider('browser_search_not_configured');
        }
        if (strlen($ownerRef) > 128 || preg_match('/\A[A-Za-z0-9][A-Za-z0-9:_-]*\z/', $ownerRef) !== 1) {
            return new UnavailableWebSearchProvider('owner_context_invalid');
        }

        return new BrowserBackedWebSearchProvider(
            $this->browserClient,
            new PublicHttpUrlPolicy,
            $ownerRef,
            $origin,
            true,
        );
    }
}
