<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Ocr;

final readonly class TalosOcrReadiness
{
    public function __construct(
        public string $status,
        public string $detail,
        public bool $blocking,
    ) {}
}

