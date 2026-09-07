<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

/**
 * Pure provider adapter for model-catalog discovery.
 *
 * An adapter performs no HTTP and holds no state. It only describes how to
 * address a provider's model-list endpoint and how to turn one decoded page
 * into canonical items. All transport, secret handling, SSRF/DNS pinning,
 * redirect blocking and pagination bounds live in
 * {@see TalosProviderModelCatalogService}.
 */
interface TalosProviderModelCatalogAdapter
{
    public function supports(string $provider): bool;

    public function endpoint(string $provider, ?string $baseUrl, ?string $cursor): string;

    /**
     * @return array<string, string>
     */
    public function query(?string $cursor): array;

    /**
     * @return array<string, string>
     */
    public function headers(?string $secret): array;

    /**
     * @param  mixed  $decoded  the JSON-decoded provider response body
     */
    public function parsePage(string $provider, mixed $decoded): TalosProviderModelCatalogPage;
}
