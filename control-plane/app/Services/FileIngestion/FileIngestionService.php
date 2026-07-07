<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

final class FileIngestionService
{
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
        $storedName = $sha256 . '.' . $extension;
        $storagePath = 'ingested/' . date('Y/m/d') . '/' . $storedName;

        Storage::disk('local')->put($storagePath, $contents);

        $extractedText = $this->extractText($contents, $extension);

        $ingested = [
            'id' => (string) Str::uuid(),
            'original_name' => $file->getClientOriginalName(),
            'extension' => $extension,
            'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
            'size_bytes' => strlen($contents),
            'sha256' => $sha256,
            'storage_disk' => 'local',
            'storage_path' => $storagePath,
            'extracted_text' => $extractedText,
            'extracted_chars' => strlen($extractedText),
            'scenario_seed' => [
                'source_file' => [
                    'name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
                    'sha256' => $sha256,
                    'storage_path' => $storagePath,
                ],
                'task_context' => $extractedText,
            ],
        ];

        $ingested['benchmark_scenario'] = $this->scenarioFactory->create($ingested);

        return $ingested;
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
}
