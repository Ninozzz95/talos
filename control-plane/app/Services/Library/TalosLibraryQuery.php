<?php

declare(strict_types=1);

namespace App\Services\Library;

use App\Models\TalosLibraryItem;
use App\Models\TalosSession;
use Illuminate\Database\Eloquent\Builder;

final class TalosLibraryQuery
{
    private const DEFAULT_LIMIT = 40;

    private const MAX_LIMIT = 100;

    public function __construct(
        private readonly TalosLibraryCursor $cursor,
        private readonly TalosLibrarySearchNormalizer $searchNormalizer,
    ) {}

    /**
     * @param array{kind?: mixed, origin?: mixed, search?: mixed, limit?: mixed, cursor?: mixed} $input
     * @return array{data: list<array<string, mixed>>, meta: array{count: int, has_more: bool, next_cursor: ?string}}
     */
    public function page(int $userId, array $input): array
    {
        $filters = $this->filters($input);
        $query = $this->visibleItems($userId);
        $this->applyFilters($query, $filters);

        $encodedCursor = $input['cursor'] ?? null;
        if (is_string($encodedCursor) && $encodedCursor !== '') {
            $position = $this->cursor->decode($encodedCursor, $userId, $filters);
            $query->where(function (Builder $boundary) use ($position): void {
                $boundary
                    ->where('occurred_at', '<', $position['occurred_at'])
                    ->orWhere(function (Builder $sameTime) use ($position): void {
                        $sameTime
                            ->where('occurred_at', '=', $position['occurred_at'])
                            ->where('id', '<', $position['id']);
                    });
            });
        }

        $items = $query
            ->with(['sessionLinks.session'])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit($filters['limit'] + 1)
            ->get();
        $hasMore = $items->count() > $filters['limit'];
        $page = $items->take($filters['limit'])->values();
        $last = $page->last();

        return [
            'data' => $page
                ->map(static fn (TalosLibraryItem $item): array => $item->toApiArray())
                ->all(),
            'meta' => [
                'count' => $page->count(),
                'has_more' => $hasMore,
                'next_cursor' => $hasMore && $last instanceof TalosLibraryItem
                    ? $this->cursor->encode($userId, $filters, $last->occurred_at, (string) $last->id)
                    : null,
            ],
        ];
    }

    /**
     * @return array{data: list<array<string, mixed>>, meta: array{count: int, has_more: bool}}
     */
    public function sessionMedia(int $userId, TalosSession $session, ?string $kind = null): array
    {
        $query = $this->visibleItems($userId)
            ->whereHas('sessionLinks', static function (Builder $links) use ($session, $userId): void {
                $links
                    ->where('session_id', $session->id)
                    ->where('user_id', $userId);
            });
        if ($kind !== null) {
            $query->where('kind', $kind);
        }

        $items = $query
            ->with(['sessionLinks.session'])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit(self::MAX_LIMIT + 1)
            ->get();
        $hasMore = $items->count() > self::MAX_LIMIT;
        $page = $items->take(self::MAX_LIMIT)->values();

        return [
            'data' => $page
                ->map(static fn (TalosLibraryItem $item): array => $item->toApiArray())
                ->all(),
            'meta' => [
                'count' => $page->count(),
                'has_more' => $hasMore,
            ],
        ];
    }

    /** @param list<string> $ids */
    public function removeFromLibrary(int $userId, array $ids): int
    {
        return TalosLibraryItem::query()
            ->where('user_id', $userId)
            ->whereIn('id', array_values(array_unique($ids)))
            ->whereNull('hidden_at')
            ->update([
                'hidden_at' => now(),
                'updated_at' => now(),
            ]);
    }

    /** @return Builder<TalosLibraryItem> */
    private function visibleItems(int $userId): Builder
    {
        return TalosLibraryItem::query()
            ->where('user_id', $userId)
            ->whereNull('hidden_at')
            ->whereNull('unavailable_at');
    }

    /**
     * @param array{kind?: mixed, origin?: mixed, search?: mixed, limit?: mixed} $input
     * @return array{kind: ?string, origin: ?string, search: ?string, limit: int}
     */
    private function filters(array $input): array
    {
        $kind = is_string($input['kind'] ?? null) && trim($input['kind']) !== ''
            ? trim($input['kind'])
            : null;
        $origin = is_string($input['origin'] ?? null) && trim($input['origin']) !== ''
            ? trim($input['origin'])
            : null;
        $search = is_string($input['search'] ?? null)
            ? $this->searchNormalizer->normalize($input['search'])
            : '';
        $search = $search !== '' ? $search : null;
        $rawLimit = $input['limit'] ?? null;
        $limit = (is_int($rawLimit) || (is_string($rawLimit) && ctype_digit($rawLimit)))
            ? (int) $rawLimit
            : self::DEFAULT_LIMIT;

        return [
            'kind' => $kind,
            'origin' => $origin,
            'search' => $search,
            'limit' => max(1, min(self::MAX_LIMIT, $limit)),
        ];
    }

    /**
     * @param Builder<TalosLibraryItem> $query
     * @param array{kind: ?string, origin: ?string, search: ?string, limit: int} $filters
     */
    private function applyFilters(Builder $query, array $filters): void
    {
        if ($filters['kind'] !== null) {
            $query->where('kind', $filters['kind']);
        }
        if ($filters['origin'] !== null) {
            $query->where('origin', $filters['origin']);
        }
        if ($filters['search'] !== null) {
            foreach ($this->searchNormalizer->terms($filters['search']) as $term) {
                $escaped = addcslashes($term, '\\%_');
                $query->whereRaw("search_text LIKE ? ESCAPE '\\'", ['%'.$escaped.'%']);
            }
        }
    }
}
