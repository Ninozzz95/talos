<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

use InvalidArgumentException;

/**
 * Ollama local model catalog adapter.
 *
 * Discovers installed models through the loopback native `GET /api/tags`
 * endpoint (derived from the origin of the configured base URL, not its `/v1`
 * chat path). It never attaches an Authorization header. Chat compatibility
 * stays `unknown`; the persisted local probe is the capability gate.
 */
final class TalosOllamaModelCatalogAdapter implements TalosProviderModelCatalogAdapter
{
    public function supports(string $provider): bool
    {
        return $provider === 'ollama';
    }

    public function endpoint(string $provider, ?string $baseUrl, ?string $cursor): string
    {
        $parts = parse_url(is_string($baseUrl) ? trim($baseUrl) : '');
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            throw new InvalidArgumentException('The Ollama catalog requires a loopback base URL.');
        }

        $scheme = strtolower((string) $parts['scheme']);
        $host = (string) $parts['host'];
        $hostPart = str_contains($host, ':') ? "[{$host}]" : $host;
        $port = isset($parts['port']) ? ':'.(int) $parts['port'] : '';

        return "{$scheme}://{$hostPart}{$port}/api/tags";
    }

    public function query(?string $cursor): array
    {
        return [];
    }

    public function headers(?string $secret): array
    {
        return [];
    }

    public function parsePage(string $provider, mixed $decoded): TalosProviderModelCatalogPage
    {
        if (! is_array($decoded) || ! isset($decoded['models']) || ! is_array($decoded['models']) || ! array_is_list($decoded['models'])) {
            throw TalosProviderModelCatalogException::responseInvalid($provider);
        }

        $items = [];
        foreach ($decoded['models'] as $entry) {
            if (! is_array($entry)) {
                throw TalosProviderModelCatalogException::responseInvalid($provider);
            }

            $name = $this->firstNonEmptyString($entry['name'] ?? null, $entry['model'] ?? null);
            if ($name === null) {
                throw TalosProviderModelCatalogException::responseInvalid($provider);
            }

            $items[] = new TalosProviderModelCatalogItem(
                id: $name,
                displayName: $name,
                provider: $provider,
                ownedBy: null,
                chatCompatibility: 'unknown',
                capabilities: [],
                contextWindow: null,
                maxOutputTokens: null,
                lifecycle: 'unknown',
                canonicalSlug: null,
                localDigest: $this->normalizeDigest($entry['digest'] ?? null),
                metadata: $this->details($entry['details'] ?? null),
            );
        }

        return new TalosProviderModelCatalogPage($items, null, false);
    }

    private function firstNonEmptyString(mixed ...$values): ?string
    {
        foreach ($values as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function normalizeDigest(mixed $digest): ?string
    {
        if (! is_string($digest)) {
            return null;
        }
        $normalized = strtolower(trim($digest));
        if (str_starts_with($normalized, 'sha256:')) {
            $normalized = substr($normalized, strlen('sha256:'));
        }

        return preg_match('/^[a-f0-9]{64}$/', $normalized) === 1 ? $normalized : null;
    }

    /**
     * @return array<string, scalar>
     */
    private function details(mixed $details): array
    {
        if (! is_array($details)) {
            return [];
        }

        $bounded = [];
        foreach (['family', 'parameter_size', 'quantization_level'] as $key) {
            $value = $details[$key] ?? null;
            if (is_scalar($value)) {
                $bounded[$key] = $value;
            }
        }

        return $bounded;
    }
}
