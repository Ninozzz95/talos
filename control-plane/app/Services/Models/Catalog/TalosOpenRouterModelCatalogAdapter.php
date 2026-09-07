<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

use InvalidArgumentException;

/**
 * OpenRouter model catalog adapter.
 *
 * `GET {base}/models` defaults to text-only models, so this adapter always
 * requests `output_modalities=all` to receive every provider entry. Modalities
 * come from `architecture.input_modalities/output_modalities`; tool and
 * reasoning support come from `supported_parameters`.
 */
final class TalosOpenRouterModelCatalogAdapter implements TalosProviderModelCatalogAdapter
{
    public function supports(string $provider): bool
    {
        return $provider === 'openrouter';
    }

    public function endpoint(string $provider, ?string $baseUrl, ?string $cursor): string
    {
        $base = is_string($baseUrl) ? trim($baseUrl) : '';
        if ($base === '') {
            throw new InvalidArgumentException('The OpenRouter catalog requires a base URL.');
        }

        $normalized = rtrim($base, '/');

        return str_ends_with($normalized, '/models') ? $normalized : $normalized.'/models';
    }

    public function query(?string $cursor): array
    {
        return ['output_modalities' => 'all'];
    }

    public function headers(?string $secret): array
    {
        $token = is_string($secret) ? trim($secret) : '';

        return $token === '' ? [] : ['Authorization' => 'Bearer '.$token];
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
            $architecture = is_array($entry['architecture'] ?? null) ? $entry['architecture'] : [];
            $inputModalities = $this->stringList($architecture['input_modalities'] ?? null);
            $outputModalities = $this->stringList($architecture['output_modalities'] ?? null);
            $parameters = $this->stringList($entry['supported_parameters'] ?? null);
            $hasArchitecture = $architecture !== [];

            $producesText = in_array('text', $outputModalities, true);

            $items[] = new TalosProviderModelCatalogItem(
                id: $id,
                displayName: is_string($entry['name'] ?? null) && trim($entry['name']) !== '' ? trim($entry['name']) : $id,
                provider: $provider,
                ownedBy: null,
                chatCompatibility: $producesText ? 'supported' : 'unsupported',
                capabilities: [
                    'text' => $hasArchitecture ? $producesText : null,
                    'vision' => $hasArchitecture ? in_array('image', $inputModalities, true) : null,
                    'tools' => $parameters === [] ? null : in_array('tools', $parameters, true),
                    'reasoning' => $parameters === [] ? null : in_array('reasoning', $parameters, true),
                    'image_output' => $hasArchitecture ? in_array('image', $outputModalities, true) : null,
                    'audio_output' => $hasArchitecture ? in_array('audio', $outputModalities, true) : null,
                ],
                contextWindow: $this->positiveOrNull($entry['context_length'] ?? null),
                maxOutputTokens: $this->positiveOrNull($entry['max_completion_tokens'] ?? null),
                lifecycle: 'unknown',
                canonicalSlug: is_string($entry['canonical_slug'] ?? null) && trim($entry['canonical_slug']) !== '' ? trim($entry['canonical_slug']) : null,
                localDigest: null,
                metadata: [],
            );
        }

        return new TalosProviderModelCatalogPage($items, null, false);
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $value): array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            return [];
        }

        return array_values(array_filter($value, static fn (mixed $element): bool => is_string($element)));
    }

    private function positiveOrNull(mixed $value): ?int
    {
        return is_int($value) && $value > 0 ? $value : null;
    }
}
