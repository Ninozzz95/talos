<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

/**
 * Google Gemini native model catalog adapter.
 *
 * Uses the native `GET /v1beta/models` endpoint (not the OpenAI-compatible
 * chat base URL), passes the credential only in the `x-goog-api-key` header so
 * it never enters a URL or log, paginates with `pageToken`, and classifies chat
 * compatibility from `supportedGenerationMethods` containing `generateContent`.
 */
final class TalosGeminiModelCatalogAdapter implements TalosProviderModelCatalogAdapter
{
    private const NATIVE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

    public function supports(string $provider): bool
    {
        return $provider === 'gemini';
    }

    public function endpoint(string $provider, ?string $baseUrl, ?string $cursor): string
    {
        return self::NATIVE_ENDPOINT;
    }

    public function query(?string $cursor): array
    {
        $query = ['pageSize' => '1000'];
        if (is_string($cursor) && trim($cursor) !== '') {
            $query['pageToken'] = trim($cursor);
        }

        return $query;
    }

    public function headers(?string $secret): array
    {
        $token = is_string($secret) ? trim($secret) : '';

        return $token === '' ? [] : ['x-goog-api-key' => $token];
    }

    public function parsePage(string $provider, mixed $decoded): TalosProviderModelCatalogPage
    {
        if (! is_array($decoded) || ! isset($decoded['models']) || ! is_array($decoded['models']) || ! array_is_list($decoded['models'])) {
            throw TalosProviderModelCatalogException::responseInvalid($provider);
        }

        $items = [];
        foreach ($decoded['models'] as $entry) {
            if (! is_array($entry) || ! isset($entry['name']) || ! is_string($entry['name']) || trim($entry['name']) === '') {
                throw TalosProviderModelCatalogException::responseInvalid($provider);
            }

            $name = trim($entry['name']);
            $id = str_starts_with($name, 'models/') ? substr($name, strlen('models/')) : $name;
            if ($id === '') {
                throw TalosProviderModelCatalogException::responseInvalid($provider);
            }

            $methods = is_array($entry['supportedGenerationMethods'] ?? null) ? $entry['supportedGenerationMethods'] : [];
            $isChat = in_array('generateContent', $methods, true);
            $isEmbedding = in_array('embedContent', $methods, true);

            $items[] = new TalosProviderModelCatalogItem(
                id: $id,
                displayName: is_string($entry['displayName'] ?? null) && trim($entry['displayName']) !== '' ? trim($entry['displayName']) : $id,
                provider: $provider,
                ownedBy: 'google',
                chatCompatibility: $isChat ? 'supported' : 'unsupported',
                capabilities: [
                    'text' => $isChat ? true : null,
                    'embeddings' => $isEmbedding ? true : null,
                ],
                contextWindow: $this->positiveOrNull($entry['inputTokenLimit'] ?? null),
                maxOutputTokens: $this->positiveOrNull($entry['outputTokenLimit'] ?? null),
                lifecycle: 'unknown',
                canonicalSlug: $name,
                localDigest: null,
                metadata: [],
            );
        }

        $nextPageToken = $decoded['nextPageToken'] ?? null;
        $hasMore = is_string($nextPageToken) && trim($nextPageToken) !== '';

        return new TalosProviderModelCatalogPage($items, $hasMore ? trim((string) $nextPageToken) : null, $hasMore);
    }

    private function positiveOrNull(mixed $value): ?int
    {
        return is_int($value) && $value > 0 ? $value : null;
    }
}
