<?php

declare(strict_types=1);

namespace App\Services\FileIngestion\Extraction;

use App\Exceptions\TalosExtractionException;
use JsonException;

final class PlainTextExtractor implements TalosTextExtractor
{
    private const SUPPORTED_MIME_TYPES = [
        'application/json',
        'text/csv',
        'text/markdown',
        'text/plain',
    ];

    public function supports(string $mimeType): bool
    {
        return in_array(strtolower(trim($mimeType)), self::SUPPORTED_MIME_TYPES, true);
    }

    public function extract(string $absolutePath, string $mimeType): TalosExtractionResult
    {
        $normalizedMime = strtolower(trim($mimeType));
        if (! $this->supports($normalizedMime)) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTOR_UNSUPPORTED',
                'No deterministic text extractor is configured for this file type.',
            );
        }

        $contents = file_get_contents($absolutePath);
        if (! is_string($contents)) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTION_READ_FAILED',
                'The quarantined file could not be read for extraction.',
            );
        }

        if (preg_match('//u', $contents) !== 1) {
            throw new TalosExtractionException(
                'TALOS_FILE_TEXT_ENCODING_INVALID',
                'Text files must use valid UTF-8 encoding.',
            );
        }

        $text = $normalizedMime === 'application/json'
            ? $this->canonicalJson($contents)
            : $contents;
        $this->assertWithinBudget($text);

        return new TalosExtractionResult(
            text: $text,
            metadata: ['content_type' => $normalizedMime],
            extractor: 'talos_plain',
            extractorVersion: '1',
            requiresOcr: false,
        );
    }

    private function canonicalJson(string $contents): string
    {
        try {
            $decoded = json_decode($contents, false, 512, JSON_THROW_ON_ERROR);
            $encoded = json_encode(
                $decoded,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
            );
        } catch (JsonException $exception) {
            throw new TalosExtractionException(
                'TALOS_FILE_JSON_INVALID',
                'The JSON document is not syntactically valid.',
                $exception,
            );
        }

        return $encoded;
    }

    private function assertWithinBudget(string $text): void
    {
        $budget = config('talos-files.tika.max_extracted_bytes');
        if (! is_int($budget) || $budget <= 0) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTION_CONFIG_INVALID',
                'The extraction size policy is not configured correctly.',
            );
        }

        if (strlen($text) > $budget) {
            throw new TalosExtractionException(
                'TALOS_FILE_EXTRACTED_TEXT_TOO_LARGE',
                'The extracted text exceeds the configured size limit.',
            );
        }
    }
}
