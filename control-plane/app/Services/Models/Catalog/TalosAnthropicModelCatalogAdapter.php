<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

use InvalidArgumentException;

/**
 * Anthropic model catalog adapter.
 *
 * `GET {base}/models` is cursor-paginated with `after_id`, `has_more` and
 * `last_id`, authenticated with `x-api-key` and `anthropic-version`. Every
 * listed model is usable through the Messages API, so chat compatibility is
 * `supported`; the rich `capabilities` object maps to bounded claims.
 */
final class TalosAnthropicModelCatalogAdapter implements TalosProviderModelCatalogAdapter
{
    public function supports(string $provider): bool
    {
        return $provider === 'anthropic';
    }

    public function endpoint(string $provider, ?string $baseUrl, ?string $cursor): string
    {
        $base = is_string($baseUrl) ? trim($baseUrl) : '';
        if ($base === '') {
            throw new InvalidArgumentException('The Anthropic catalog requires a base URL.');
        }

        $normalized = rtrim($base, '/');

        return str_ends_with($normalized, '/models') ? $normalized : $normalized.'/models';
    }

    public function query(?string $cursor): array
    {
        $query = ['limit' => '1000'];
        if (is_string($cursor) && trim($cursor) !== '') {
            $query['after_id'] = trim($cursor);
        }

        return $query;
    }

    public function headers(?string $secret): array
    {
        $token = is_string($secret) ? trim($secret) : '';
        if ($token === '') {
            return ['anthropic-version' => '2023-06-01'];
        }

        return ['x-api-key' => $token, 'anthropic-version' => '2023-06-01'];
    }

    public function parsePage(string $provider, mixed $decoded): TalosProviderModelCatalogPage
    {
        if (! is_array($decoded) || ! isset($decoded['data']) || ! is_array($decoded['data']) || ! array_is_list($decoded['data'])) {
            throw TalosProviderModelCatalogException::responseInvalid($provider);
        }

        $items = [];
        foreach ($decoded['data'] as $entry) {
            if (! is_array($entry) || ! isset($entry['id']) || ! is_string($entry['id']) || trim($entry['id']) === '') {
                throw TalosProviderModelCatalogException::responseInvalid($provider);
            }

            $id = trim($entry['id']);
            $capabilities = is_array($entry['capabilities'] ?? null) ? $entry['capabilities'] : [];
            $structured = $this->capabilitySupported($capabilities, 'structured_outputs');
            $codeExecution = $this->capabilitySupported($capabilities, 'code_execution');

            $items[] = new TalosProviderModelCatalogItem(
                id: $id,
                displayName: is_string($entry['display_name'] ?? null) && trim($entry['display_name']) !== '' ? trim($entry['display_name']) : $id,
                provider: $provider,
                ownedBy: 'anthropic',
                chatCompatibility: 'supported',
                capabilities: [
                    'text' => true,
                    'vision' => $this->capabilitySupported($capabilities, 'image_input'),
                    'tools' => $this->combineSupport($structured, $codeExecution),
                    'reasoning' => $this->capabilitySupported($capabilities, 'thinking'),
                ],
                contextWindow: $this->positiveOrNull($entry['max_input_tokens'] ?? null),
                maxOutputTokens: $this->positiveOrNull($entry['max_tokens'] ?? null),
                lifecycle: 'unknown',
                canonicalSlug: null,
                localDigest: null,
                metadata: [],
            );
        }

        $hasMore = ($decoded['has_more'] ?? false) === true;
        $lastId = $decoded['last_id'] ?? null;
        if ($hasMore && (! is_string($lastId) || trim($lastId) === '')) {
            throw TalosProviderModelCatalogException::paginationInvalid($provider);
        }

        return new TalosProviderModelCatalogPage($items, $hasMore ? trim((string) $lastId) : null, $hasMore);
    }

    /**
     * @param  array<string, mixed>  $capabilities
     */
    private function capabilitySupported(array $capabilities, string $key): ?bool
    {
        $entry = $capabilities[$key] ?? null;
        if (! is_array($entry) || ! array_key_exists('supported', $entry) || ! is_bool($entry['supported'])) {
            return null;
        }

        return $entry['supported'];
    }

    private function combineSupport(?bool $left, ?bool $right): ?bool
    {
        if ($left === true || $right === true) {
            return true;
        }
        if ($left === false || $right === false) {
            return false;
        }

        return null;
    }

    private function positiveOrNull(mixed $value): ?int
    {
        return is_int($value) && $value > 0 ? $value : null;
    }
}
