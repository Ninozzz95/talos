<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Extraction;

final readonly class TalosExtractionResult
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public function __construct(
        public string $text,
        public array $metadata,
        public string $extractor,
        public string $extractorVersion,
        public bool $requiresOcr,
    ) {}
}
