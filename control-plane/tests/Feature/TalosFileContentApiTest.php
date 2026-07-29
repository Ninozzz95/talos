<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosFile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosFileContentApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $this->useIsolatedLocalStorage();
    }

    public function test_owner_receives_verified_image_inline_with_private_hardened_headers(): void
    {
        $bytes = $this->png();
        $file = $this->storedFile($this->user, 'diagram.png', 'image/png', $bytes);

        $response = $this->get($this->contentUrl($file))->assertOk();

        $response
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader('ETag', '"sha256-'.$file->checksum.'"')
            ->assertHeader('Content-Disposition', 'inline; filename=diagram.png')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $cacheControl = (string) $response->headers->get('Cache-Control');
        self::assertStringContainsString('private', $cacheControl);
        self::assertStringContainsString('no-cache', $cacheControl);
        self::assertSame($bytes, $this->binaryContent($response));
    }

    public function test_clean_non_image_uses_attachment_disposition_and_safe_filename(): void
    {
        $bytes = "verified notes\n";
        $file = $this->storedFile($this->user, 'resume notes.txt', 'text/plain', $bytes);

        $response = $this->get($this->contentUrl($file))->assertOk();

        self::assertStringStartsWith(
            'attachment;',
            (string) $response->headers->get('Content-Disposition'),
        );
        self::assertSame($bytes, $this->binaryContent($response));
    }

    public function test_binary_response_supports_range_and_conditional_etag_requests(): void
    {
        $bytes = '0123456789';
        $file = $this->storedFile($this->user, 'sample.bin', 'application/octet-stream', $bytes);

        $range = $this->withHeader('Range', 'bytes=2-5')->get($this->contentUrl($file));
        $range
            ->assertStatus(206)
            ->assertHeader('Content-Range', 'bytes 2-5/10');
        self::assertSame('2345', $this->binaryContent($range));

        $etag = '"sha256-'.$file->checksum.'"';
        $this->withHeader('If-None-Match', $etag)
            ->get($this->contentUrl($file))
            ->assertStatus(304)
            ->assertHeader('ETag', $etag);
    }

    public function test_foreign_and_unavailable_files_fail_closed_as_not_found(): void
    {
        $foreignUser = User::factory()->create();
        $foreign = $this->storedFile($foreignUser, 'foreign.png', 'image/png', $this->png());

        $this->getJson($this->contentUrl($foreign))->assertNotFound();

        $cases = [
            ['status' => 'quarantined', 'scan_status' => 'pending', 'storage_disk' => 'local'],
            ['status' => 'available', 'scan_status' => 'legacy_unverified', 'storage_disk' => 'local'],
            ['status' => 'available', 'scan_status' => 'clean', 'storage_disk' => 's3'],
        ];

        foreach ($cases as $index => $overrides) {
            $file = $this->storedFile($this->user, 'blocked-'.$index.'.png', 'image/png', $this->png(), $overrides);
            $this->getJson($this->contentUrl($file))->assertNotFound();
        }
    }

    public function test_canonical_file_outside_the_local_storage_root_fails_closed(): void
    {
        $root = Storage::disk('local')->path('');
        $outsideRoot = dirname($root).DIRECTORY_SEPARATOR.'outside-'.str()->uuid();
        app('files')->ensureDirectoryExists($outsideRoot);
        $bytes = $this->png();
        $outsidePath = $outsideRoot.DIRECTORY_SEPARATOR.'escape.png';
        file_put_contents($outsidePath, $bytes);

        try {
            $file = TalosFile::query()->create([
                'user_id' => $this->user->id,
                'original_name' => 'escape.png',
                'mime_type' => 'image/png',
                'detected_mime' => 'image/png',
                'size_bytes' => strlen($bytes),
                'checksum' => hash('sha256', $bytes),
                'status' => 'available',
                'scan_status' => 'clean',
                'storage_disk' => 'local',
                'storage_path' => '../'.basename($outsideRoot).'/escape.png',
                'metadata' => [],
            ]);

            $this->getJson($this->contentUrl($file))
                ->assertConflict()
                ->assertJsonPath('code', 'TALOS_FILE_CONTENT_INTEGRITY');
        } finally {
            app('files')->deleteDirectory($outsideRoot);
        }
    }

    public function test_missing_size_drift_and_checksum_drift_return_typed_integrity_faults(): void
    {
        $missing = $this->storedFile($this->user, 'missing.png', 'image/png', $this->png());
        Storage::disk('local')->delete((string) $missing->storage_path);
        $this->getJson($this->contentUrl($missing))
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_FILE_CONTENT_INTEGRITY');

        $sizeDrift = $this->storedFile($this->user, 'size.png', 'image/png', $this->png());
        $sizeDrift->update(['size_bytes' => strlen($this->png()) + 1]);
        $this->getJson($this->contentUrl($sizeDrift))
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_FILE_CONTENT_INTEGRITY');

        $hashDrift = $this->storedFile($this->user, 'hash.png', 'image/png', $this->png());
        Storage::disk('local')->put((string) $hashDrift->storage_path, $this->png().'tampered');
        $hashDrift->update(['size_bytes' => strlen($this->png().'tampered')]);
        $this->getJson($this->contentUrl($hashDrift))
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_FILE_CONTENT_INTEGRITY');
    }

    /**
     * @param array<string, string> $overrides
     */
    private function storedFile(
        User $owner,
        string $name,
        string $mime,
        string $bytes,
        array $overrides = [],
    ): TalosFile {
        $path = 'ingested/'.str()->uuid().'-'.$name;
        Storage::disk('local')->put($path, $bytes);

        return TalosFile::query()->create([
            'user_id' => $owner->id,
            'original_name' => $name,
            'mime_type' => $mime,
            'detected_mime' => $mime,
            'size_bytes' => strlen($bytes),
            'checksum' => hash('sha256', $bytes),
            'status' => 'available',
            'scan_status' => 'clean',
            'storage_disk' => 'local',
            'storage_path' => $path,
            'metadata' => [],
            ...$overrides,
        ]);
    }

    private function contentUrl(TalosFile $file): string
    {
        return '/api/talos/files/'.$file->id.'/content';
    }

    private function png(): string
    {
        return base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZJrQAAAAASUVORK5CYII=',
            true,
        ) ?: '';
    }

    private function binaryContent(mixed $response): string
    {
        ob_start();
        $response->baseResponse->sendContent();
        $content = ob_get_clean();

        return is_string($content) ? $content : '';
    }
}
