<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Services\FileIngestion\TalosFilePipelineHealth;

final class HealthyTalosFilePipelineHealth implements TalosFilePipelineHealth
{
    /** @return array<string, array{status: string, detail: string, blocking?: bool}> */
    public function checks(): array
    {
        return [
            'clamav' => ['status' => 'healthy', 'detail' => 'ClamAV 1.5.3 is available.'],
            'tika' => ['status' => 'healthy', 'detail' => 'Apache Tika 3.3.1 is available.'],
            'ocr' => ['status' => 'disabled', 'detail' => 'OCR is disabled.', 'blocking' => false],
        ];
    }
}
