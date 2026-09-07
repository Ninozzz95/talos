<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

use InvalidArgumentException;

/**
 * Immutable single page of catalog items returned by an adapter's parsePage().
 */
final class TalosProviderModelCatalogPage
{
    /** @var list<TalosProviderModelCatalogItem> */
    private readonly array $items;

    /**
     * @param  list<TalosProviderModelCatalogItem>  $items
     */
    public function __construct(
        array $items,
        private readonly ?string $nextCursor,
        private readonly bool $hasMore,
    ) {
        foreach ($items as $item) {
            if (! $item instanceof TalosProviderModelCatalogItem) {
                throw new InvalidArgumentException('A catalog page only holds catalog items.');
            }
        }
        $this->items = array_values($items);

        if ($this->hasMore && ($this->nextCursor === null || trim($this->nextCursor) === '')) {
            throw new InvalidArgumentException('A page with more results must expose a next cursor.');
        }
    }

    /**
     * @return list<TalosProviderModelCatalogItem>
     */
    public function items(): array
    {
        return $this->items;
    }

    public function nextCursor(): ?string
    {
        return $this->nextCursor;
    }

    public function hasMore(): bool
    {
        return $this->hasMore;
    }
}
