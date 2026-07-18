<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Ocr;

interface TalosOcrClient
{
    public function enabled(): bool;

    public function readiness(): TalosOcrReadiness;

    public function extract(
        string $absolutePath,
        string $mimeType,
        string $sourceSha256,
        string $ownerRef,
    ): TalosOcrResult;
}

