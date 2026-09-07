<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Extraction;

use App\Exceptions\TalosExtractionException;
use App\Services\FileIngestion\Ocr\TalosOcrClient;
use App\Services\FileIngestion\Ocr\TalosOcrResult;

final class TalosFileExtractionPipeline
{
    /** @var list<string> */
    private const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

    public function __construct(
        private readonly TalosExtractorRegistry $extractors,
        private readonly TalosOcrClient $ocr,
    ) {}

    public function extract(
        string $absolutePath,
        string $mimeType,
        string $sourceSha256,
        string $ownerRef,
    ): TalosExtractionResult {
        $normalizedMime = strtolower(trim($mimeType));
        if (in_array($normalizedMime, self::IMAGE_MIME_TYPES, true)) {
            if ($this->ocr->enabled()) {
                return $this->extractWithOcr($absolutePath, $normalizedMime, $sourceSha256, $ownerRef);
            }

            // OCR disabled: accept the image as a vision-only attachment. It has
            // already been malware-scanned (ClamAV); we simply derive no text and
            // let vision-capable models see the image directly, instead of
            // failing the whole upload with TALOS_OCR_REQUIRED.
            return new TalosExtractionResult(
                text: '',
                metadata: [
                    'content_type' => $normalizedMime,
                    'source_sha256' => $sourceSha256,
                    'trust_level' => 'untrusted',
                    'vision_only' => true,
                ],
                extractor: 'vision_passthrough',
                extractorVersion: 'v1',
                requiresOcr: false,
            );
        }
        if ($normalizedMime !== 'application/pdf') {
            return $this->extractors->forMime($normalizedMime)->extract($absolutePath, $normalizedMime);
        }

        try {
            $native = $this->extractors->forMime($normalizedMime)->extract($absolutePath, $normalizedMime);
        } catch (TalosExtractionException $exception) {
            if ($exception->errorCode !== 'TALOS_TIKA_EMPTY_OUTPUT') {
                throw $exception;
            }

            return $this->extractWithOcr($absolutePath, $normalizedMime, $sourceSha256, $ownerRef);
        }

        if ($this->nativePdfIsSufficient($native)) {
            return $native;
        }

        return $this->extractWithOcr($absolutePath, $normalizedMime, $sourceSha256, $ownerRef);
    }

    private function extractWithOcr(
        string $absolutePath,
        string $mimeType,
        string $sourceSha256,
        string $ownerRef,
    ): TalosExtractionResult {
        if (! $this->ocr->enabled()) {
            throw new TalosExtractionException(
                'TALOS_OCR_REQUIRED',
                'This file requires OCR, but the OCR capability is disabled.',
            );
        }

        return $this->toExtractionResult(
            $this->ocr->extract($absolutePath, $mimeType, $sourceSha256, $ownerRef),
            $mimeType,
            $sourceSha256,
        );
    }

    private function nativePdfIsSufficient(TalosExtractionResult $result): bool
    {
        if ($result->requiresOcr) {
            return false;
        }
        $minimum = $this->positiveConfigInt('talos-files.ocr.pdf_min_native_chars');
        $perPage = $this->positiveConfigInt('talos-files.ocr.pdf_min_native_chars_per_page');
        $characters = mb_strlen(trim($result->text), 'UTF-8');
        $pageCount = $result->metadata['page_count'] ?? null;
        $pageMinimum = is_int($pageCount) && $pageCount > 0 ? $pageCount * $perPage : 0;

        return $characters >= max($minimum, $pageMinimum);
    }

    private function toExtractionResult(
        TalosOcrResult $result,
        string $mimeType,
        string $sourceSha256,
    ): TalosExtractionResult {
        return new TalosExtractionResult(
            text: $result->text,
            metadata: [
                ...$result->metadata,
                'content_type' => $mimeType,
                'source_sha256' => $sourceSha256,
                'trust_level' => 'untrusted',
                'model_revision' => $result->modelRevision,
            ],
            extractor: 'deepseek_ocr_2_vllm',
            extractorVersion: $result->modelRevision,
            requiresOcr: true,
        );
    }

    private function positiveConfigInt(string $key): int
    {
        $value = config($key);
        if (! is_int($value) || $value <= 0) {
            throw new TalosExtractionException(
                'TALOS_OCR_CONFIGURATION_INVALID',
                'The OCR service is not configured correctly.',
            );
        }

        return $value;
    }
}

