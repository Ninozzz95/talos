<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Ocr;

use App\Exceptions\TalosExtractionException;

final class DisabledTalosOcrClient implements TalosOcrClient
{
    public function enabled(): bool
    {
        return false;
    }

    public function readiness(): TalosOcrReadiness
    {
        return new TalosOcrReadiness(
            status: 'disabled',
            detail: 'OCR is disabled.',
            blocking: false,
        );
    }

    public function extract(
        string $absolutePath,
        string $mimeType,
        string $sourceSha256,
        string $ownerRef,
    ): TalosOcrResult {
        throw new TalosExtractionException(
            'TALOS_OCR_REQUIRED',
            'This file requires OCR, but the OCR capability is disabled.',
        );
    }
}

