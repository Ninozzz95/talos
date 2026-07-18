<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

use App\Exceptions\TalosExtractionException;
use App\Exceptions\TalosFilePolicyException;
use App\Exceptions\TalosMalwareScanException;
use App\Models\TalosContextSet;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use App\Services\FileIngestion\Extraction\TalosFileExtractionPipeline;
use App\Services\FileIngestion\Malware\TalosMalwareScanner;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

final class FileIngestionService
{
    private const CHUNK_BYTES = 4000;

    public function __construct(
        private readonly TalosBenchmarkScenarioMaterializer $scenarioFactory,
        private readonly TalosUploadPolicy $uploadPolicy,
        private readonly TalosQuarantineStore $quarantineStore,
        private readonly TalosMalwareScanner $malwareScanner,
        private readonly TalosFileExtractionPipeline $extractionPipeline,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function ingest(UploadedFile $file, ?int $userId = null): array
    {
        $sourcePath = $file->getRealPath();
        if (! is_string($sourcePath) || $sourcePath === '') {
            throw new TalosFilePolicyException('TALOS_FILE_UNREADABLE', 'The uploaded file could not be inspected safely.');
        }

        $fileId = (string) Str::uuid();
        $quarantinePath = $this->quarantineStore->stagePath($sourcePath, $fileId);
        $mimeType = $file->getClientMimeType() ?: 'application/octet-stream';
        $originalName = $file->getClientOriginalName();

        return $this->processStagedFile($fileId, $quarantinePath, $originalName, $mimeType, [], $userId);
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array<string, mixed>
     */
    public function ingestString(string $contents, string $originalName, string $mimeType, array $metadata = [], ?int $userId = null): array
    {
        $fileId = (string) Str::uuid();
        $quarantinePath = $this->quarantineStore->stageContents($contents, $fileId);

        return $this->processStagedFile(
            $fileId,
            $quarantinePath,
            $originalName,
            $mimeType,
            [
                ...$metadata,
                'trust_level' => 'untrusted',
            ],
            $userId,
        );
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array<string, mixed>
     */
    private function processStagedFile(
        string $fileId,
        string $quarantinePath,
        string $originalName,
        string $clientMimeType,
        array $metadata = [],
        ?int $userId = null,
    ): array {
        try {
            $absolutePath = $this->quarantineStore->absolutePath($quarantinePath);
            $size = filesize($absolutePath);
            $sha256 = hash_file('sha256', $absolutePath);
            if (! is_int($size) || ! is_string($sha256)) {
                throw new TalosFilePolicyException('TALOS_FILE_UNREADABLE', 'The uploaded file could not be inspected safely.');
            }

            $fileMetadata = [
                ...$this->sanitizeMetadata($metadata),
                'trust_level' => $metadata['trust_level'] ?? 'untrusted',
                'client_mime' => $clientMimeType,
            ];

            $talosFile = TalosFile::query()->create([
                'id' => $fileId,
                'user_id' => $userId,
                'original_name' => $originalName,
                'mime_type' => $clientMimeType,
                'size_bytes' => $size,
                'checksum' => $sha256,
                'status' => 'quarantined',
                'scan_status' => 'pending',
                'extraction_status' => 'pending',
                'storage_disk' => 'talos_quarantine',
                'storage_path' => $quarantinePath,
                'metadata' => $fileMetadata,
            ]);
        } catch (Throwable $exception) {
            $this->discardUnownedQuarantine($fileId, $quarantinePath);

            throw $exception;
        }

        try {
            $decision = $this->uploadPolicy->inspect(
                $absolutePath,
                $originalName,
                $clientMimeType,
                $size,
            );
        } catch (TalosFilePolicyException $exception) {
            return $this->failFile(
                $talosFile,
                status: 'rejected',
                scanStatus: 'not_run',
                extractionStatus: 'not_run',
                errorCode: $exception->errorCode,
                safeMessage: $exception->getMessage(),
            );
        }

        $extension = $decision->canonicalExtension;
        $parser = $this->parserForExtension($extension);
        $talosFile->update([
            'mime_type' => $decision->detectedMime,
            'detected_mime' => $decision->detectedMime,
            'status' => 'scanning',
            'scan_status' => 'running',
            'parser' => $parser,
            'metadata' => [
                ...($talosFile->metadata ?? []),
                'extension' => $extension,
                'upload_policy' => $decision->evidence,
            ],
        ]);

        try {
            $scan = $this->malwareScanner->scan($absolutePath);
        } catch (TalosMalwareScanException $exception) {
            return $this->failFile(
                $talosFile,
                status: 'scanning_failed',
                scanStatus: 'failed',
                extractionStatus: 'not_run',
                errorCode: $exception->errorCode,
                safeMessage: $exception->getMessage(),
            );
        } catch (Throwable) {
            return $this->failFile(
                $talosFile,
                status: 'scanning_failed',
                scanStatus: 'failed',
                extractionStatus: 'not_run',
                errorCode: 'TALOS_FILE_SCANNER_UNAVAILABLE',
                safeMessage: 'The malware scanner could not verify this file. Retry when the scanner is healthy.',
            );
        }

        if ($scan->status === 'infected') {
            $talosFile->update([
                'status' => 'quarantined',
                'scan_status' => 'infected',
                'scan_engine' => 'clamav',
                'scan_engine_version' => $scan->engineVersion,
                'scan_signature_version' => $scan->signatureVersion,
                'scanned_at' => now(),
                'extraction_status' => 'not_run',
                'failure_reason' => 'Malware was detected. The file remains quarantined and was not processed.',
                'metadata' => [
                    ...($talosFile->metadata ?? []),
                    'failure_code' => 'TALOS_FILE_MALWARE_DETECTED',
                    'malware_threat' => $scan->threat,
                ],
            ]);

            return $this->toPublicResponse(
                $this->buildIngestionResponse($talosFile->refresh(), $extension, '', null),
            );
        }

        $postScanHash = hash_file('sha256', $absolutePath);
        if (! is_string($postScanHash) || ! hash_equals($sha256, $postScanHash)) {
            return $this->failFile(
                $talosFile,
                status: 'scanning_failed',
                scanStatus: 'failed',
                extractionStatus: 'not_run',
                errorCode: 'TALOS_FILE_CHANGED_AFTER_SCAN',
                safeMessage: 'The quarantined file changed after malware scanning and was not processed.',
                extension: $extension,
            );
        }

        $talosFile->update([
            'status' => 'extracting',
            'scan_status' => 'clean',
            'scan_engine' => 'clamav',
            'scan_engine_version' => $scan->engineVersion,
            'scan_signature_version' => $scan->signatureVersion,
            'scanned_at' => now(),
            'extraction_status' => 'running',
        ]);

        try {
            $extraction = $this->extractionPipeline->extract(
                $absolutePath,
                $decision->detectedMime,
                $sha256,
                $fileId,
            );
        } catch (TalosExtractionException $exception) {
            return $this->failFile(
                $talosFile,
                status: 'extraction_failed',
                scanStatus: 'clean',
                extractionStatus: 'failed',
                errorCode: $exception->errorCode,
                safeMessage: $exception->getMessage(),
                extension: $extension,
            );
        } catch (Throwable) {
            return $this->failFile(
                $talosFile,
                status: 'extraction_failed',
                scanStatus: 'clean',
                extractionStatus: 'failed',
                errorCode: 'TALOS_FILE_EXTRACTION_FAILED',
                safeMessage: 'File could not be parsed for Context Vault ingestion.',
                extension: $extension,
            );
        }

        $extractedText = $extraction->text;
        $chunkPayloads = $this->chunkText($extractedText, $parser);
        $storedName = $sha256.'-'.$fileId.'.'.$extension;
        $storagePath = 'ingested/'.gmdate('Y/m/d').'/'.$storedName;
        $scenario = null;

        try {
            $this->quarantineStore->copyToFinal($quarantinePath, $storagePath);
            $promotedHash = hash_file('sha256', Storage::disk('local')->path($storagePath));
            if (! is_string($promotedHash) || ! hash_equals($sha256, $promotedHash)) {
                throw new \RuntimeException('Promoted file checksum mismatch.');
            }

            $scenario = $this->scenarioFactory->create($this->buildScenarioInput(
                $talosFile,
                $decision->detectedMime,
                $storagePath,
                $extractedText,
            ));

            $contextSet = DB::transaction(function () use ($talosFile, $chunkPayloads, $extension, $extractedText, $extraction, $originalName, $userId, $storagePath, $scenario): TalosContextSet {
                $talosFile->update([
                    'storage_disk' => 'local',
                    'storage_path' => $storagePath,
                ]);

                $chunks = [];
                foreach ($chunkPayloads as $payload) {
                    $chunks[] = TalosFileChunk::query()->create([
                        'file_id' => $talosFile->id,
                        ...$payload,
                    ]);
                }

                $talosFile->update([
                    'status' => 'available',
                    'extraction_status' => 'complete',
                    'extractor' => $extraction->extractor,
                    'extractor_version' => $extraction->extractorVersion,
                    'extracted_at' => now(),
                    'failure_reason' => null,
                    'metadata' => [
                        ...($talosFile->metadata ?? []),
                        'extension' => $extension,
                        'extracted_chars' => strlen($extractedText),
                        'chunks_count' => count($chunks),
                        'extraction' => $extraction->metadata,
                        'requires_ocr' => $extraction->requiresOcr,
                        'benchmark_scenario_ref' => $talosFile->id,
                        'benchmark_scenario_storage_path' => $scenario['storage_path'] ?? null,
                    ],
                ]);

                return $this->createDefaultContextSet($talosFile->refresh(), $chunks, $originalName, $userId);
            });
        } catch (Throwable) {
            $compensationFaults = $this->compensateMaterialization($scenario, $storagePath);
            $talosFile->refresh();

            return $this->failFile(
                $talosFile,
                status: 'extraction_failed',
                scanStatus: 'clean',
                extractionStatus: 'failed',
                errorCode: 'TALOS_FILE_EXTRACTION_FAILED',
                safeMessage: 'File could not be parsed for Context Vault ingestion.',
                extension: $extension,
                failureMetadata: $compensationFaults === [] ? [] : ['compensation_faults' => $compensationFaults],
            );
        }

        try {
            $this->quarantineStore->discard($quarantinePath);
        } catch (Throwable) {
            $talosFile->refresh();
            $talosFile->update([
                'metadata' => [
                    ...($talosFile->metadata ?? []),
                    'quarantine_cleanup_status' => 'pending',
                ],
            ]);
        }

        $talosFile->refresh()->load('chunks');
        $contextSet->load(['sources.file', 'sources.fileChunk']);
        $ingested = $this->buildIngestionResponse($talosFile, $extension, $extractedText, $contextSet);
        $ingested['benchmark_scenario'] = $scenario;

        return $this->toPublicResponse($ingested);
    }

    /** @return array<string, mixed> */
    private function buildScenarioInput(
        TalosFile $file,
        string $detectedMime,
        string $storagePath,
        string $extractedText,
    ): array {
        return [
            'id' => $file->id,
            'original_name' => $file->original_name,
            'mime_type' => $detectedMime,
            'sha256' => $file->checksum,
            'storage_disk' => 'local',
            'storage_path' => $storagePath,
            'extracted_chars' => strlen($extractedText),
            'extracted_text' => $extractedText,
        ];
    }

    /**
     * @param  array<string, mixed>|null  $scenario
     * @return list<string>
     */
    private function compensateMaterialization(?array $scenario, string $storagePath): array
    {
        $faults = [];

        if ($scenario !== null) {
            try {
                $this->scenarioFactory->discard($scenario);
            } catch (Throwable) {
                $faults[] = 'benchmark_scenario_discard_failed';
            }
        }

        try {
            $this->quarantineStore->discardFinal($storagePath);
        } catch (Throwable) {
            $faults[] = 'final_file_discard_failed';
        }

        return $faults;
    }

    private function discardUnownedQuarantine(string $fileId, string $quarantinePath): void
    {
        try {
            if (TalosFile::query()->whereKey($fileId)->exists()) {
                return;
            }
        } catch (Throwable $ownershipCheckFailure) {
            report($ownershipCheckFailure);

            return;
        }

        try {
            $this->quarantineStore->discard($quarantinePath);
        } catch (Throwable $cleanupFailure) {
            report($cleanupFailure);
        }
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array<string, mixed>
     */
    private function sanitizeMetadata(array $metadata): array
    {
        $sanitized = [];

        foreach ($metadata as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if (str_contains($normalizedKey, 'secret')
                || str_contains($normalizedKey, 'token')
                || str_contains($normalizedKey, 'password')
                || str_contains($normalizedKey, 'api_key')
            ) {
                $sanitized[$key] = '[redacted]';

                continue;
            }

            if (is_array($value)) {
                /** @var array<string, mixed> $value */
                $sanitized[$key] = $this->sanitizeMetadata($value);

                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }

    private function parserForExtension(string $extension): string
    {
        return match ($extension) {
            'json' => 'json',
            'csv' => 'csv',
            'md' => 'markdown',
            'txt' => 'plain_text',
            default => 'raw_text',
        };
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function chunkText(string $text, string $parser): array
    {
        if ($text === '') {
            return [];
        }

        $chunks = [];
        $offset = 0;
        $sequence = 1;
        $length = strlen($text);

        while ($offset < $length) {
            $content = substr($text, $offset, self::CHUNK_BYTES);
            $endOffset = $offset + strlen($content);

            $chunks[] = [
                'sequence' => $sequence++,
                'content' => $content,
                'content_hash' => hash('sha256', $content),
                'start_offset' => $offset,
                'end_offset' => $endOffset,
                'metadata' => [
                    'parser' => $parser,
                    'source' => 'extracted_text',
                ],
            ];

            $offset = $endOffset;
        }

        return $chunks;
    }

    /**
     * @param  list<TalosFileChunk>  $chunks
     */
    private function createDefaultContextSet(TalosFile $file, array $chunks, string $name, ?int $userId): TalosContextSet
    {
        $contextSet = TalosContextSet::query()->create([
            'user_id' => $userId,
            'name' => $name,
            'status' => $file->status,
            'metadata' => [
                'created_by' => 'file_ingestion',
                'default_for_file_id' => $file->id,
            ],
        ]);

        TalosContextSource::query()->create([
            'context_set_id' => $contextSet->id,
            'file_id' => $file->id,
            'source_type' => 'uploaded_file',
            'sequence' => 1,
            'metadata' => ['created_by' => 'file_ingestion'],
        ]);

        $sequence = 2;
        foreach ($chunks as $chunk) {
            TalosContextSource::query()->create([
                'context_set_id' => $contextSet->id,
                'file_id' => $file->id,
                'file_chunk_id' => $chunk->id,
                'source_type' => 'file_chunk',
                'sequence' => $sequence++,
                'metadata' => ['created_by' => 'file_ingestion'],
            ]);
        }

        return $contextSet;
    }

    /**
     * @return array<string, mixed>
     */
    private function failFile(
        TalosFile $file,
        string $status,
        string $scanStatus,
        string $extractionStatus,
        string $errorCode,
        string $safeMessage,
        string $extension = '',
        array $failureMetadata = [],
    ): array {
        $file->update([
            'status' => $status,
            'scan_status' => $scanStatus,
            'extraction_status' => $extractionStatus,
            'failure_reason' => $safeMessage,
            'metadata' => [
                ...($file->metadata ?? []),
                'failure_code' => $errorCode,
                'failure_stage' => $scanStatus === 'failed' ? 'malware_scan' : ($extractionStatus === 'failed' ? 'extraction' : 'upload_policy'),
                ...$failureMetadata,
            ],
        ]);

        return $this->toPublicResponse(
            $this->buildIngestionResponse($file->refresh(), $extension, '', null),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function buildIngestionResponse(
        TalosFile $file,
        string $extension,
        string $extractedText,
        ?TalosContextSet $contextSet,
    ): array {
        return [
            'id' => $file->id,
            'original_name' => $file->original_name,
            'extension' => $extension,
            'mime_type' => $file->mime_type,
            'detected_mime' => $file->detected_mime,
            'size_bytes' => $file->size_bytes,
            'sha256' => $file->checksum,
            'checksum' => $file->checksum,
            'status' => $file->status,
            'scan_status' => $file->scan_status,
            'scan_engine' => $file->scan_engine,
            'scan_engine_version' => $file->scan_engine_version,
            'scan_signature_version' => $file->scan_signature_version,
            'scanned_at' => $file->scanned_at?->toJSON(),
            'extraction_status' => $file->extraction_status,
            'extractor' => $file->extractor,
            'extractor_version' => $file->extractor_version,
            'extracted_at' => $file->extracted_at?->toJSON(),
            'storage_disk' => $file->storage_disk,
            'storage_path' => $file->storage_path,
            'parser' => $file->parser,
            'metadata' => $file->metadata ?? [],
            'error_code' => $file->metadata['failure_code'] ?? null,
            'failure_reason' => $file->failure_reason,
            'chunks_count' => $file->chunks()->count(),
            'context_set' => $contextSet?->toApiArray(includeSources: true),
            'extracted_text' => $extractedText,
            'extracted_chars' => strlen($extractedText),
            'scenario_seed' => [
                'source_file' => [
                    'name' => $file->original_name,
                    'mime_type' => $file->mime_type,
                    'sha256' => $file->checksum,
                    'storage_path' => $file->storage_path,
                ],
                'task_context' => $extractedText,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function toPublicResponse(array $payload): array
    {
        $public = [];

        foreach ($payload as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if ($normalizedKey === 'storage_disk' || str_ends_with($normalizedKey, 'storage_path')) {
                continue;
            }

            $public[$key] = is_array($value)
                ? $this->toPublicResponse($value)
                : $value;
        }

        return $public;
    }
}
