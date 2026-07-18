<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Extraction;

interface TalosTextExtractor
{
    public function supports(string $mimeType): bool;

    public function extract(string $absolutePath, string $mimeType): TalosExtractionResult;
}
