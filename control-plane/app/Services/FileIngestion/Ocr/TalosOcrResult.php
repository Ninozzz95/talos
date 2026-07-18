<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Ocr;

final readonly class TalosOcrResult
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public function __construct(
        public string $text,
        public array $metadata,
        public string $modelRevision,
    ) {}
}

