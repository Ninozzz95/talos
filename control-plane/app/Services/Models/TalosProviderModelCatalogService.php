<?php

declare(strict_types=1);

namespace App\Services\Models;

use App\Models\TalosModelProfile;
use App\Services\Models\Catalog\TalosAnthropicModelCatalogAdapter;
use App\Services\Models\Catalog\TalosGeminiModelCatalogAdapter;
use App\Services\Models\Catalog\TalosOllamaModelCatalogAdapter;
use App\Services\Models\Catalog\TalosOpenAiCompatibleModelCatalogAdapter;
use App\Services\Models\Catalog\TalosOpenRouterModelCatalogAdapter;
use App\Services\Models\Catalog\TalosProviderModelCatalogAdapter;
use App\Services\Models\Catalog\TalosProviderModelCatalogException;
use App\Services\Security\PublicHttpRequestPinning;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Owner-scoped provider model-catalog discovery.
 *
 * Turns the pure adapters into real discovery: adapter selection, owner secret
 * decryption, page loop through the shared {@see PublicHttpRequestPinning}
 * boundary (which forces `withoutRedirecting()` and DNS pinning), bounded
 * pagination, id deduplication and the frozen envelope. No provider body,
 * credential or connection IP enters the returned envelope.
 */
final class TalosProviderModelCatalogService
{
    private const MAX_PAGES = 100;
    private const MAX_MODELS = 5000;
    private const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
    private const DEFAULT_TIMEOUT_SECONDS = 30;

    private readonly PublicHttpRequestPinning $pinning;

    /** @var list<TalosProviderModelCatalogAdapter> */
    private readonly array $adapters;

    /**
     * @param  iterable<TalosProviderModelCatalogAdapter>|null  $adapters
     */
    public function __construct(?PublicHttpRequestPinning $pinning = null, ?iterable $adapters = null)
    {
        $this->pinning = $pinning ?? new PublicHttpRequestPinning;
        $this->adapters = $adapters !== null ? array_values([...$adapters]) : self::defaultAdapters();
    }

    /**
     * @return list<TalosProviderModelCatalogAdapter>
     */
    private static function defaultAdapters(): array
    {
        return [
            new TalosOpenAiCompatibleModelCatalogAdapter,
            new TalosAnthropicModelCatalogAdapter,
            new TalosGeminiModelCatalogAdapter,
            new TalosOpenRouterModelCatalogAdapter,
            new TalosOllamaModelCatalogAdapter,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function discoverDraft(array $data): array
    {
        $provider = (string) ($data['provider'] ?? '');
        $baseUrl = $this->resolveBaseUrl($provider, is_string($data['base_url'] ?? null) ? $data['base_url'] : null);
        $secret = is_string($data['secret'] ?? null) && trim($data['secret']) !== '' ? trim($data['secret']) : null;

        return $this->discover($provider, $baseUrl, $secret, self::DEFAULT_TIMEOUT_SECONDS, null);
    }

    /**
     * @return array<string, mixed>
     */
    public function discoverForProfile(TalosModelProfile $profile): array
    {
        $provider = (string) $profile->provider;
        $baseUrl = $this->resolveBaseUrl($provider, is_string($profile->base_url) ? $profile->base_url : null);

        $secret = null;
        if (filled($profile->encrypted_secret)) {
            try {
                $decrypted = Crypt::decryptString((string) $profile->encrypted_secret);
                $secret = trim($decrypted) !== '' ? $decrypted : null;
            } catch (Throwable) {
                throw TalosProviderModelCatalogException::authFailed($provider);
            }
        }

        $timeout = is_int($profile->timeout_seconds) && $profile->timeout_seconds > 0
            ? $profile->timeout_seconds
            : self::DEFAULT_TIMEOUT_SECONDS;

        return $this->discover($provider, $baseUrl, $secret, $timeout, $profile->id === null ? null : (string) $profile->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function discover(string $provider, string $baseUrl, ?string $secret, int $timeout, ?string $profileId): array
    {
        $adapter = $this->adapterFor($provider);
        $trustedLocal = TalosModelProviderCatalog::allowsTrustedLocalBaseUrl($provider, $baseUrl);

        if (! $trustedLocal && TalosModelProviderCatalog::requiresSecret($provider) && $secret === null) {
            throw TalosProviderModelCatalogException::secretMissing($provider);
        }

        $models = [];
        $seen = [];
        $warnings = [];
        $pageCount = 0;
        $complete = true;
        $cursor = null;

        while (true) {
            if ($pageCount >= self::MAX_PAGES) {
                $complete = false;
                $warnings[] = ['code' => TalosProviderModelCatalogException::LIMIT_EXCEEDED, 'message' => 'Stopped after the maximum page count.'];
                break;
            }

            $endpoint = $adapter->endpoint($provider, $baseUrl, $cursor);
            $page = $this->fetchPage($provider, $adapter, $endpoint, $cursor, $secret, $timeout, $trustedLocal);
            $pageCount++;

            $reachedModelCap = false;
            foreach ($page->items() as $item) {
                $id = $item->id();
                if (isset($seen[$id])) {
                    continue;
                }
                if (count($models) >= self::MAX_MODELS) {
                    $complete = false;
                    $warnings[] = ['code' => TalosProviderModelCatalogException::LIMIT_EXCEEDED, 'message' => 'Stopped after the maximum model count.'];
                    $reachedModelCap = true;
                    break;
                }
                $seen[$id] = true;
                $models[] = $item->toArray();
            }

            if ($reachedModelCap || ! $page->hasMore()) {
                break;
            }
            $cursor = $page->nextCursor();
        }

        return [
            'profile_id' => $profileId,
            'provider' => $provider,
            'models' => $models,
            'complete' => $complete,
            'page_count' => $pageCount,
            'fetched_at' => now()->toRfc3339String(),
            'warnings' => $warnings,
        ];
    }

    private function fetchPage(
        string $provider,
        TalosProviderModelCatalogAdapter $adapter,
        string $endpoint,
        ?string $cursor,
        ?string $secret,
        int $timeout,
        bool $trustedLocal,
    ): \App\Services\Models\Catalog\TalosProviderModelCatalogPage {
        $pin = $this->pinning->pin($endpoint, $trustedLocal);
        if (! $pin['allowed']) {
            throw TalosProviderModelCatalogException::policyBlocked($provider, "Provider catalog endpoint blocked by TALOS policy: {$pin['reason']}");
        }

        $request = $this->pinning->apply(
            Http::timeout($timeout)->acceptJson()->withHeaders($adapter->headers($secret)),
            $pin,
        );

        try {
            $response = $request->get($endpoint, $adapter->query($cursor));
        } catch (ConnectionException) {
            throw TalosProviderModelCatalogException::connectionFailed($provider);
        }

        if (! $this->pinning->connectedToPinnedIp($response, $pin)) {
            throw TalosProviderModelCatalogException::connectedIpMismatch($provider);
        }

        $status = $response->status();
        if ($status >= 300 && $status < 400) {
            throw TalosProviderModelCatalogException::redirectBlocked($provider);
        }
        if ($status === 401 || $status === 403) {
            throw TalosProviderModelCatalogException::authFailed($provider);
        }
        if ($status === 429) {
            throw TalosProviderModelCatalogException::rateLimited($provider, $this->retryAfterSeconds($response->header('Retry-After')));
        }
        if ($status >= 500) {
            throw TalosProviderModelCatalogException::connectionFailed($provider);
        }
        if ($status < 200 || $status >= 300) {
            throw TalosProviderModelCatalogException::responseInvalid($provider);
        }

        if (strlen($response->body()) > self::MAX_RESPONSE_BYTES) {
            throw TalosProviderModelCatalogException::responseTooLarge($provider);
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw TalosProviderModelCatalogException::responseInvalid($provider);
        }

        return $adapter->parsePage($provider, $json);
    }

    private function adapterFor(string $provider): TalosProviderModelCatalogAdapter
    {
        foreach ($this->adapters as $adapter) {
            if ($adapter->supports($provider)) {
                return $adapter;
            }
        }

        throw TalosProviderModelCatalogException::policyBlocked($provider, 'No model-catalog adapter supports this provider.');
    }

    private function resolveBaseUrl(string $provider, ?string $baseUrl): string
    {
        if (is_string($baseUrl) && trim($baseUrl) !== '') {
            return trim($baseUrl);
        }

        return (string) TalosModelProviderCatalog::defaultsFor($provider)['default_base_url'];
    }

    private function retryAfterSeconds(?string $header): ?int
    {
        if ($header === null || ! preg_match('/^\d+$/', trim($header))) {
            return null;
        }

        $seconds = (int) trim($header);

        return $seconds > 0 ? $seconds : null;
    }
}
