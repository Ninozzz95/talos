<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosFile;
use App\Services\FileIngestion\FileIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class FileIngestionServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'filesystems.disks.local.root' => storage_path('framework/testing/task-5-local-' . uniqid()),
        ]);
        Storage::purge('local');
    }

    public function test_file_ingestion_accepts_server_side_google_drive_content_with_provenance(): void
    {
        $service = app(FileIngestionService::class);

        $result = $service->ingestString(
            "# Imported Notes\n\nDrive source content.",
            'drive-notes.md',
            'text/markdown',
            [
                'source_provider' => 'google_drive',
                'google_drive_file_id' => 'drive-file-1',
                'google_drive_modified_time' => '2026-07-09T10:00:00Z',
            ],
        );

        $this->assertSame('available', $result['status']);
        $this->assertSame('drive-notes.md', $result['original_name']);
        $this->assertSame('google_drive', $result['metadata']['source_provider']);
        $this->assertSame('untrusted', $result['metadata']['trust_level']);
        $this->assertDatabaseHas('talos_files', [
            'original_name' => 'drive-notes.md',
            'status' => 'available',
        ]);
    }

    public function test_file_ingestion_sanitizes_sensitive_server_side_metadata(): void
    {
        $service = app(FileIngestionService::class);

        $result = $service->ingestString(
            'Drive content with sensitive import metadata.',
            'drive-private.txt',
            'text/plain',
            [
                'source_provider' => 'google_drive',
                'refresh_token' => 'refresh-token-secret',
                'nested' => [
                    'client_secret' => 'client-secret-value',
                    'safe' => 'kept',
                ],
            ],
        );

        $this->assertSame('available', $result['status']);
        $this->assertSame('kept', $result['metadata']['nested']['safe']);

        $file = TalosFile::query()->where('original_name', 'drive-private.txt')->firstOrFail();
        $metadataJson = json_encode($file->metadata, JSON_THROW_ON_ERROR);

        $this->assertStringNotContainsString('refresh-token-secret', $metadataJson);
        $this->assertStringNotContainsString('client-secret-value', $metadataJson);
        $this->assertStringContainsString('[redacted]', $metadataJson);
    }
}
