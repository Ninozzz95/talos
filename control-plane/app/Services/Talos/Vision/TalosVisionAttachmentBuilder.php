<?php

declare(strict_types=1);

namespace App\Services\Talos\Vision;

use App\Exceptions\TalosVisionException;
use App\Models\TalosFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Kadmos\Tool\ProviderInputResource;
use Throwable;

/**
 * Turns the authorized image attachments of a chat turn into canonical
 * `ProviderInputResource` values (KIND_IMAGE) that the existing turn adapters
 * render into provider-native image content blocks.
 *
 * Security invariants (see the Upload Part 2 plan §4):
 *   - Integrity is verified BEFORE any resource is created: the stored bytes
 *     must match the recorded size_bytes AND the recorded sha256 checksum
 *     (same pattern as TalosBrowserFileUploadService::stagingPayload).
 *   - The media type is the signature-verified `detected_mime`, never the
 *     client-supplied `mime_type`.
 *   - Size (≤10 MB/image) and aggregate (≤20 MB) are pre-checked from trusted
 *     metadata so refusals surface as clean typed faults, never as a raw
 *     value-object throw or an unbounded read.
 *   - Non-image files are ignored (they keep the existing text grounding path).
 */
final class TalosVisionAttachmentBuilder
{
    /** Per-image cap enforced by ProviderInputResource::MAX_BYTES. */
    private const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

    /** Aggregate cap enforced by ProviderTurnRequest::MAX_RESOURCE_BYTES. */
    private const MAX_AGGREGATE_BYTES = 20 * 1024 * 1024;

    /**
     * Native input-image media types accepted by each provider's turn adapter.
     * Mirrors the adapters' SUPPORTED_IMAGE_MEDIA_TYPES / OpenAiInputResourcePolicy.
     *
     * @var array<string, list<string>>
     */
    private const SUPPORTED_IMAGE_MEDIA_TYPES = [
        'openai' => ['image/png', 'image/jpeg', 'image/webp'],
        'anthropic' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'gemini' => ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'],
    ];

    /**
     * @param  Collection<int, TalosFile>  $files  authorized attachments (mixed)
     * @return array{resources: list<ProviderInputResource>, image_file_ids: list<string>}
     *
     * @throws TalosVisionException on any integrity/size/type failure (fail-closed)
     */
    public function build(Collection $files, string $provider): array
    {
        $provider = strtolower(trim($provider));
        $supported = self::SUPPORTED_IMAGE_MEDIA_TYPES[$provider] ?? [];

        /** @var list<TalosFile> $images */
        $images = $files
            ->filter(static fn (TalosFile $file): bool => is_string($file->detected_mime)
                && str_starts_with($file->detected_mime, 'image/'))
            ->values()
            ->all();

        if ($images === []) {
            return ['resources' => [], 'image_file_ids' => []];
        }

        // Phase A — validate trusted metadata cheaply, before reading any bytes.
        $aggregate = 0;
        foreach ($images as $file) {
            $mediaType = (string) $file->detected_mime;
            $size = (int) $file->size_bytes;

            if ($size < 1 || $size > self::MAX_IMAGE_BYTES) {
                throw new TalosVisionException(
                    'TALOS_VISION_IMAGE_TOO_LARGE',
                    'An attached image is too large to send to the model (limit 10 MB per image).',
                );
            }
            if (! in_array($mediaType, $supported, true)) {
                throw new TalosVisionException(
                    'TALOS_VISION_IMAGE_UNSUPPORTED',
                    'The selected provider cannot accept one of the attached image formats.',
                );
            }
            $aggregate += $size;
        }
        if ($aggregate > self::MAX_AGGREGATE_BYTES) {
            throw new TalosVisionException(
                'TALOS_VISION_PAYLOAD_TOO_LARGE',
                'The attached images exceed the total size the model can accept (limit 20 MB).',
            );
        }

        // Phase B — read + verify integrity + wrap into canonical resources.
        $resources = [];
        $imageFileIds = [];
        foreach ($images as $file) {
            $bytes = $this->readBytes($file);
            $this->assertIntegrity($file, $bytes);

            try {
                $resources[] = ProviderInputResource::fromBytes(
                    (string) $file->id,
                    ProviderInputResource::KIND_IMAGE,
                    (string) $file->original_name,
                    (string) $file->detected_mime,
                    $bytes,
                );
            } catch (InvalidArgumentException) {
                // Defence-in-depth: a name/media-type the value object rejects
                // surfaces as a clean typed fault, never a 500.
                throw new TalosVisionException(
                    'TALOS_VISION_IMAGE_UNSUPPORTED',
                    'An attached image could not be prepared for the model.',
                );
            }
            $imageFileIds[] = (string) $file->id;
        }

        return ['resources' => $resources, 'image_file_ids' => $imageFileIds];
    }

    private function readBytes(TalosFile $file): string
    {
        if (! is_string($file->storage_disk) || $file->storage_disk === ''
            || ! is_string($file->storage_path) || $file->storage_path === '') {
            throw new TalosVisionException(
                'TALOS_VISION_READ_FAILED',
                'An attached image could not be read for the model.',
            );
        }

        try {
            $bytes = Storage::disk($file->storage_disk)->get($file->storage_path);
        } catch (Throwable) {
            $bytes = null;
        }

        if (! is_string($bytes) || $bytes === '') {
            throw new TalosVisionException(
                'TALOS_VISION_READ_FAILED',
                'An attached image could not be read for the model.',
            );
        }

        return $bytes;
    }

    private function assertIntegrity(TalosFile $file, string $bytes): void
    {
        $expectedSha = 'sha256:'.(string) $file->checksum;
        if (strlen($bytes) !== (int) $file->size_bytes
            || ! hash_equals($expectedSha, 'sha256:'.hash('sha256', $bytes))) {
            throw new TalosVisionException(
                'TALOS_VISION_INTEGRITY',
                'An attached image failed its integrity check and was not sent to the model.',
            );
        }
    }
}
