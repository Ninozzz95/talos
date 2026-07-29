<?php

declare(strict_types=1);

namespace App\Services\Library;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

final readonly class TalosLibraryProjection
{
    /** @var list<string> */
    public const KINDS = ['image', 'file', 'link'];

    /** @var list<string> */
    public const ORIGINS = ['uploaded', 'generated', 'browser', 'search'];

    /**
     * @param array<string, mixed> $metadata
     */
    public function __construct(
        public int $userId,
        public ?string $originSessionId,
        public string $sourceType,
        public string $sourceId,
        public string $kind,
        public string $origin,
        public string $title,
        public ?string $mimeType,
        public ?int $byteSize,
        public ?string $checksum,
        public ?string $sourceUrl,
        public string $searchText,
        public string $trustBoundary,
        public CarbonImmutable $occurredAt,
        public array $metadata,
    ) {
        if ($userId < 1
            || ! in_array($kind, self::KINDS, true)
            || ! in_array($origin, self::ORIGINS, true)
            || $sourceId === ''
            || $sourceType === ''
            || $title === ''
            || $trustBoundary === '') {
            throw new InvalidArgumentException('Library projection is invalid.');
        }
    }

    /** @return array<string, mixed> */
    public function toAttributes(): array
    {
        return [
            'origin_session_id' => $this->originSessionId,
            'kind' => $this->kind,
            'origin' => $this->origin,
            'title' => $this->title,
            'mime_type' => $this->mimeType,
            'byte_size' => $this->byteSize,
            'checksum' => $this->checksum,
            'source_url' => $this->sourceUrl,
            'search_text' => $this->searchText,
            'trust_boundary' => $this->trustBoundary,
            'occurred_at' => $this->occurredAt,
            'metadata' => $this->metadata,
            'unavailable_at' => null,
        ];
    }
}
