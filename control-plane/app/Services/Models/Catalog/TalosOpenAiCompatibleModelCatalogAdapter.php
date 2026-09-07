<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

use InvalidArgumentException;

/**
 * OpenAI-compatible model catalog adapter for OpenAI and DeepSeek.
 *
 * Both expose an OpenAI-style `GET {base}/models` returning `{ data: [...] }`
 * with per-model `id` and optional `owned_by`. The list is not paginated, so
 * capability and lifecycle stay `unknown`; the persisted chat probe remains the
 * authoritative capability gate.
 */
final class TalosOpenAiCompatibleModelCatalogAdapter implements TalosProviderModelCatalogAdapter
{
    private const SUPPORTED = ['openai', 'deepseek'];

    public function supports(string $provider): bool
    {
        return in_array($provider, self::SUPPORTED, true);
    }

    public function endpoint(string $provider, ?string $baseUrl, ?string $cursor): string
    {
        $base = is_string($baseUrl) ? trim($baseUrl) : '';
        if ($base === '') {
            throw new InvalidArgumentException('An OpenAI-compatible catalog requires a base URL.');
        }

        $normalized = rtrim($base, '/');

        return str_ends_with($normalized, '/models') ? $normalized : $normalized.'/models';
    }

    public function query(?string $cursor): array
    {
        return [];
    }

    public function headers(?string $secret): array
    {
        $token = is_string($secret) ? trim($secret) : '';

        return $token === '' ? [] : ['Authorization' => 'Bearer '.$token];
    }

    public function parsePage(string $provider, mixed $decoded): TalosProviderModelCatalogPage
    {
        if (! is_array($decoded)
            || ! array_key_exists('data', $decoded)
            || ! is_array($decoded['data'])
            || ! array_is_list($decoded['data'])) {
            throw TalosProviderModelCatalogException::responseInvalid($provider);
        }

        $items = [];
        foreach ($decoded['data'] as $entry) {
            if (! is_array($entry) || ! isset($entry['id']) || ! is_string($entry['id']) || trim($entry['id']) === '') {
                throw TalosProviderModelCatalogException::responseInvalid($provider);
            }

            $id = trim($entry['id']);
            $ownedBy = isset($entry['owned_by']) && is_string($entry['owned_by']) && trim($entry['owned_by']) !== ''
                ? trim($entry['owned_by'])
                : null;

            $items[] = new TalosProviderModelCatalogItem(
                id: $id,
                displayName: $id,
                provider: $provider,
                ownedBy: $ownedBy,
                chatCompatibility: 'unknown',
                capabilities: [],
                contextWindow: null,
                maxOutputTokens: null,
                lifecycle: 'unknown',
                canonicalSlug: null,
                localDigest: null,
                metadata: [],
            );
        }

        return new TalosProviderModelCatalogPage($items, null, false);
    }
}
