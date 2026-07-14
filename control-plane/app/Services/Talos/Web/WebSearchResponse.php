<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use JsonSerializable;

final readonly class WebSearchResponse implements JsonSerializable
{
    /** @param list<WebSearchResult> $results */
    public function __construct(
        public bool $available,
        public array $results,
        public ?string $reason = null,
        public string $provenance = 'untrusted_web_search',
    ) {}

    /** @param list<WebSearchResult> $results */
    public static function available(array $results): self
    {
        return new self(true, $results);
    }

    public static function unavailable(string $reason): self
    {
        return new self(false, [], $reason);
    }

    /** @return array{available: bool, results: list<array<string, mixed>>, reason: ?string, provenance: string} */
    public function toArray(): array
    {
        return [
            'available' => $this->available,
            'results' => array_map(static fn (WebSearchResult $result): array => $result->toArray(), $this->results),
            'reason' => $this->reason,
            'provenance' => $this->provenance,
        ];
    }

    /** @return array{available: bool, results: list<array<string, mixed>>, reason: ?string, provenance: string} */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
