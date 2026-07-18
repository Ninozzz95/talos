<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

use App\Services\FileIngestion\Extraction\TikaServerExtractor;
use App\Services\FileIngestion\Malware\ClamAvInstreamClient;
use App\Services\FileIngestion\Ocr\TalosOcrClient;
use Throwable;

final class TalosFileSidecarHealth implements TalosFilePipelineHealth
{
    public function __construct(
        private readonly ClamAvInstreamClient $clamav,
        private readonly TikaServerExtractor $tika,
        private readonly TalosOcrClient $ocr,
    ) {}

    /** @return array<string, array{status: string, detail: string, blocking?: bool}> */
    public function checks(): array
    {
        return [
            'clamav' => $this->probe('ClamAV', fn (): string => $this->clamav->version()),
            'tika' => $this->probe('Apache Tika', fn (): string => $this->tika->version()),
            'ocr' => $this->ocrReadiness(),
        ];
    }

    /** @return array{status: string, detail: string, blocking: bool} */
    private function ocrReadiness(): array
    {
        try {
            $readiness = $this->ocr->readiness();

            return [
                'status' => $readiness->status,
                'detail' => $readiness->detail,
                'blocking' => $readiness->blocking,
            ];
        } catch (Throwable) {
            return [
                'status' => 'failed',
                'detail' => 'DeepSeek OCR-2 is unavailable or incompatible with the configured version pins.',
                'blocking' => $this->ocr->enabled(),
            ];
        }
    }

    /** @param callable(): string $probe */
    private function probe(string $name, callable $probe): array
    {
        try {
            $version = $probe();

            return [
                'status' => 'healthy',
                'detail' => "{$name} {$version} is available.",
            ];
        } catch (Throwable) {
            return [
                'status' => 'failed',
                'detail' => "{$name} is unavailable or incompatible with the configured version pin.",
            ];
        }
    }
}
