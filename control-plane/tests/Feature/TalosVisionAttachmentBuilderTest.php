<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Exceptions\TalosVisionException;
use App\Models\TalosFile;
use App\Models\User;
use App\Services\Talos\Vision\TalosVisionAttachmentBuilder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Kadmos\Tool\ProviderInputResource;
use Tests\TestCase;

final class TalosVisionAttachmentBuilderTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->useIsolatedLocalStorage();
        $this->user = User::factory()->create();
    }

    private function imageFile(
        string $name,
        string $bytes,
        string $detectedMime = 'image/png',
        ?int $sizeBytes = null,
        ?string $checksum = null,
        bool $store = true,
    ): TalosFile {
        $path = 'ingested/private/'.$name;
        if ($store) {
            Storage::disk('local')->put($path, $bytes);
        }

        return TalosFile::query()->create([
            'user_id' => $this->user->id,
            'original_name' => $name,
            'mime_type' => 'application/octet-stream',
            'detected_mime' => $detectedMime,
            'size_bytes' => $sizeBytes ?? strlen($bytes),
            'checksum' => $checksum ?? hash('sha256', $bytes),
            'status' => 'available',
            'storage_disk' => 'local',
            'storage_path' => $path,
            'parser' => 'image',
        ]);
    }

    private function textFile(string $name, string $content): TalosFile
    {
        $path = 'ingested/private/'.$name;
        Storage::disk('local')->put($path, $content);

        return TalosFile::query()->create([
            'user_id' => $this->user->id,
            'original_name' => $name,
            'mime_type' => 'text/plain',
            'detected_mime' => 'text/plain',
            'size_bytes' => strlen($content),
            'checksum' => hash('sha256', $content),
            'status' => 'available',
            'storage_disk' => 'local',
            'storage_path' => $path,
            'parser' => 'text',
        ]);
    }

    /** @param list<TalosFile> $files */
    private function collect(array $files): Collection
    {
        return new Collection($files);
    }

    public function test_builds_one_image_resource_per_image_with_detected_mime_and_verified_bytes(): void
    {
        $pngBytes = "\x89PNG\r\n\x1a\n".random_bytes(64);
        $webpBytes = 'RIFF....WEBPVP8 '.random_bytes(48);
        $image1 = $this->imageFile('shot-1.png', $pngBytes, 'image/png');
        $image2 = $this->imageFile('shot-2.webp', $webpBytes, 'image/webp');
        $text = $this->textFile('notes.txt', 'grounding only, not an image');

        $built = (new TalosVisionAttachmentBuilder)->build(
            $this->collect([$image1, $text, $image2]),
            'openai',
        );

        self::assertCount(2, $built['resources']);
        self::assertSame([$image1->id, $image2->id], $built['image_file_ids']);

        [$first, $second] = $built['resources'];
        self::assertInstanceOf(ProviderInputResource::class, $first);
        self::assertSame(ProviderInputResource::KIND_IMAGE, $first->kind);
        self::assertSame($image1->id, $first->resourceId);
        self::assertSame('image/png', $first->mediaType);
        self::assertSame(strlen($pngBytes), $first->sizeBytes);
        self::assertSame('sha256:'.hash('sha256', $pngBytes), $first->sha256);
        self::assertSame('image/webp', $second->mediaType);
        self::assertSame($image2->id, $second->resourceId);
    }

    public function test_non_image_only_collection_produces_no_resources(): void
    {
        $text = $this->textFile('a.txt', 'hello');

        $built = (new TalosVisionAttachmentBuilder)->build($this->collect([$text]), 'anthropic');

        self::assertSame([], $built['resources']);
        self::assertSame([], $built['image_file_ids']);
    }

    public function test_size_mismatch_fails_closed_with_integrity_fault(): void
    {
        $bytes = random_bytes(128);
        $file = $this->imageFile('tampered.png', $bytes, 'image/png', sizeBytes: strlen($bytes) + 1);

        try {
            (new TalosVisionAttachmentBuilder)->build($this->collect([$file]), 'openai');
            self::fail('Expected a size mismatch to fail closed.');
        } catch (TalosVisionException $exception) {
            self::assertSame('TALOS_VISION_INTEGRITY', $exception->errorCode);
        }
    }

    public function test_checksum_mismatch_fails_closed_with_integrity_fault(): void
    {
        $bytes = random_bytes(128);
        $file = $this->imageFile('wrong-hash.png', $bytes, 'image/png', checksum: hash('sha256', 'different'));

        try {
            (new TalosVisionAttachmentBuilder)->build($this->collect([$file]), 'openai');
            self::fail('Expected a checksum mismatch to fail closed.');
        } catch (TalosVisionException $exception) {
            self::assertSame('TALOS_VISION_INTEGRITY', $exception->errorCode);
        }
    }

    public function test_single_image_over_ten_megabytes_is_rejected_before_reading(): void
    {
        // Declared oversize: pre-checked from trusted metadata, no 10 MB allocation.
        $file = $this->imageFile('huge.png', 'placeholder', 'image/png', sizeBytes: 10 * 1024 * 1024 + 1, store: false);

        try {
            (new TalosVisionAttachmentBuilder)->build($this->collect([$file]), 'openai');
            self::fail('Expected an oversize image to be rejected.');
        } catch (TalosVisionException $exception) {
            self::assertSame('TALOS_VISION_IMAGE_TOO_LARGE', $exception->errorCode);
        }
    }

    public function test_aggregate_over_twenty_megabytes_is_rejected_before_reading(): void
    {
        $a = $this->imageFile('a.png', 'x', 'image/png', sizeBytes: 8 * 1024 * 1024, store: false);
        $b = $this->imageFile('b.png', 'y', 'image/png', sizeBytes: 8 * 1024 * 1024, store: false);
        $c = $this->imageFile('c.png', 'z', 'image/png', sizeBytes: 8 * 1024 * 1024, store: false);

        try {
            (new TalosVisionAttachmentBuilder)->build($this->collect([$a, $b, $c]), 'openai');
            self::fail('Expected an oversize aggregate payload to be rejected.');
        } catch (TalosVisionException $exception) {
            self::assertSame('TALOS_VISION_PAYLOAD_TOO_LARGE', $exception->errorCode);
        }
    }

    public function test_image_media_type_unsupported_by_provider_is_rejected(): void
    {
        // GIF is an image but not in OpenAI's supported input-image set.
        $bytes = 'GIF89a'.random_bytes(32);
        $file = $this->imageFile('animated.gif', $bytes, 'image/gif');

        try {
            (new TalosVisionAttachmentBuilder)->build($this->collect([$file]), 'openai');
            self::fail('Expected an unsupported image media type to be rejected.');
        } catch (TalosVisionException $exception) {
            self::assertSame('TALOS_VISION_IMAGE_UNSUPPORTED', $exception->errorCode);
        }
    }

    public function test_gif_is_accepted_for_anthropic_which_supports_it(): void
    {
        $bytes = 'GIF89a'.random_bytes(32);
        $file = $this->imageFile('animated.gif', $bytes, 'image/gif');

        $built = (new TalosVisionAttachmentBuilder)->build($this->collect([$file]), 'anthropic');

        self::assertCount(1, $built['resources']);
        self::assertSame('image/gif', $built['resources'][0]->mediaType);
    }

    public function test_missing_storage_bytes_fail_closed_with_read_failed(): void
    {
        $file = $this->imageFile('gone.png', random_bytes(64), 'image/png', store: false);

        try {
            (new TalosVisionAttachmentBuilder)->build($this->collect([$file]), 'openai');
            self::fail('Expected missing storage bytes to fail closed.');
        } catch (TalosVisionException $exception) {
            self::assertSame('TALOS_VISION_READ_FAILED', $exception->errorCode);
        }
    }
}
