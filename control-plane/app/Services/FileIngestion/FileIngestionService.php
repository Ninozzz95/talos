<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

use App\Models\TalosContextSet;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

final class FileIngestionService
{
    private const CHUNK_BYTES = 4000;

    public function __construct(private readonly FileBenchmarkScenarioFactory $scenarioFactory)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function ingest(UploadedFile $file): array
    {
        $contents = (string) file_get_contents($file->getRealPath());
        $sha256 = hash('sha256', $contents);
        $extension = strtolower((string) $file->getClientOriginalExtension());
        $parser = $this->parserForExtension($extension);
        $storedName = $sha256 . '.' . $extension;
        $storagePath = 'ingested/' . date('Y/m/d') . '/' . $storedName;
        $mimeType = $file->getMimeType() ?: 'application/octet-stream';
        $originalName = $file->getClientOriginalName();

        Storage::disk('local')->put($storagePath, $contents);

        $talosFile = TalosFile::query()->create([
            'original_name' => $originalName,
            'mime_type' => $mimeType,
            'size_bytes' => strlen($contents),
            'checksum' => $sha256,
            'status' => 'uploaded',
            'storage_disk' => 'local',
            'storage_path' => $storagePath,
            'parser' => $parser,
            'metadata' => [
                'extension' => $extension,
                'storage_disk' => 'local',
            ],
        ]);

        try {
            $extractedText = $this->extractText($contents, $extension);
            $chunkPayloads = $this->chunkText($extractedText, $parser);

            $contextSet = DB::transaction(function () use ($talosFile, $chunkPayloads, $extension, $extractedText, $originalName): TalosContextSet {
                $chunks = [];
                foreach ($chunkPayloads as $payload) {
                    $chunks[] = TalosFileChunk::query()->create([
                        'file_id' => $talosFile->id,
                        ...$payload,
                    ]);
                }

                $talosFile->update([
                    'status' => 'available',
                    'failure_reason' => null,
                    'metadata' => [
                        ...($talosFile->metadata ?? []),
                        'extension' => $extension,
                        'extracted_chars' => strlen($extractedText),
                        'chunks_count' => count($chunks),
                    ],
                ]);

                return $this->createDefaultContextSet($talosFile->refresh(), $chunks, $originalName);
            });

            $talosFile->refresh()->load('chunks');
            $contextSet->load(['sources.file', 'sources.fileChunk']);
            $ingested = $this->buildIngestionResponse($talosFile, $extension, $extractedText, $contextSet);
            $ingested['benchmark_scenario'] = $this->scenarioFactory->create($ingested);

            $talosFile->update([
                'metadata' => [
                    ...($talosFile->metadata ?? []),
                    'benchmark_scenario_storage_path' => $ingested['benchmark_scenario']['storage_path'] ?? null,
                ],
            ]);

            return $ingested;
        } catch (Throwable) {
            $failureReason = 'File could not be parsed for Context Vault ingestion.';

            $talosFile->update([
                'status' => 'failed',
                'failure_reason' => $failureReason,
                'metadata' => [
                    ...($talosFile->metadata ?? []),
                    'extension' => $extension,
                    'failure_stage' => 'post_storage_ingestion',
                ],
            ]);

            return $this->buildIngestionResponse($talosFile->refresh(), $extension, '', null);
        }
    }

    private function extractText(string $contents, string $extension): string
    {
        return match ($extension) {
            'json' => $this->normalizeJson($contents),
            'csv', 'md', 'txt' => $contents,
            default => '',
        };
    }

    private function normalizeJson(string $contents): string
    {
        $decoded = json_decode($contents, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return $contents;
        }

        return (string) json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
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
     * @param list<TalosFileChunk> $chunks
     */
    private function createDefaultContextSet(TalosFile $file, array $chunks, string $name): TalosContextSet
    {
        $contextSet = TalosContextSet::query()->create([
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
            'size_bytes' => $file->size_bytes,
            'sha256' => $file->checksum,
            'checksum' => $file->checksum,
            'status' => $file->status,
            'storage_disk' => $file->storage_disk,
            'storage_path' => $file->storage_path,
            'parser' => $file->parser,
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
}
