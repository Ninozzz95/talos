<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use App\Models\TalosArtifactGeneration;
use App\Models\TalosDocument;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\User;
use App\Services\FileIngestion\Malware\TalosMalwareScanner;
use App\Services\FileIngestion\TalosQuarantineStore;
use App\Services\Library\TalosLibraryProjector;
use App\Services\Runs\TalosRunEventRecorder;
use App\Support\TalosStoragePathBoundary;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;
use ZipArchive;

final class TalosArtifactPromotionService
{
    /** @var array<string, string> */
    private const EXTENSION_BY_FORMAT = [
        'docx' => 'docx',
        'pdf' => 'pdf',
        'pptx' => 'pptx',
        'xlsx' => 'xlsx',
        'thumbnail' => 'png',
    ];

    /** @var array<string, string> */
    private const OOXML_ENTRY_BY_FORMAT = [
        'docx' => 'word/document.xml',
        'pptx' => 'ppt/presentation.xml',
        'xlsx' => 'xl/workbook.xml',
    ];

    public function __construct(
        private readonly TalosQuarantineStore $quarantine,
        private readonly TalosMalwareScanner $malwareScanner,
        private readonly TalosLibraryProjector $libraryProjector,
        private readonly TalosRunEventRecorder $eventRecorder,
    ) {}

    /**
     * @return array{artifact: TalosRunArtifact, document: TalosDocument}
     */
    public function promote(
        User $user,
        TalosRun $run,
        TalosArtifactGeneration $generation,
        TalosSemanticDocumentV1 $document,
        ArtifactWorkerResult $result,
    ): array {
        if (! $result->succeeded()
            || ! is_string($result->format)
            || ! is_string($result->mimeType)
            || ! is_string($result->sha256)
            || ! is_int($result->byteSize)
            || ! is_string($result->bytes)
            || ! isset(self::EXTENSION_BY_FORMAT[$result->format])) {
            throw new TalosArtifactGenerationException(
                'TALOS_ARTIFACT_WORKER_PROTOCOL_INVALID',
                'Artifact worker result is not promotable.',
                502,
            );
        }

        $quarantinePath = null;
        $finalPath = null;
        $committed = false;

        try {
            $quarantinePath = $this->quarantine->stageContents($result->bytes, (string) $generation->id);
            $absoluteQuarantinePath = $this->quarantine->absolutePath($quarantinePath);
            $this->assertStoredIntegrity(
                $absoluteQuarantinePath,
                $result->byteSize,
                $result->sha256,
                'TALOS_ARTIFACT_QUARANTINE_INTEGRITY',
            );
            $this->assertFormatBytes($absoluteQuarantinePath, $result->format);

            try {
                $scan = $this->malwareScanner->scan($absoluteQuarantinePath);
            } catch (Throwable $exception) {
                throw new TalosArtifactGenerationException(
                    'TALOS_ARTIFACT_SCAN_FAILED',
                    'Generated artifact malware scanning failed.',
                    503,
                    previous: $exception,
                );
            }
            if ($scan->status !== 'clean') {
                throw new TalosArtifactGenerationException(
                    'TALOS_ARTIFACT_MALWARE_DETECTED',
                    'Generated artifact was rejected by malware scanning.',
                    422,
                    details: ['threat' => $scan->threat],
                );
            }

            $this->assertStoredIntegrity(
                $absoluteQuarantinePath,
                $result->byteSize,
                $result->sha256,
                'TALOS_ARTIFACT_CHANGED_AFTER_SCAN',
                409,
            );

            $artifactId = (string) Str::uuid();
            $documentId = (string) Str::uuid();
            $finalPath = 'ingested/'.gmdate('Y/m/d').'/'
                .$result->sha256.'-'.$artifactId.'.'.self::EXTENSION_BY_FORMAT[$result->format];
            $this->quarantine->copyToFinal($quarantinePath, $finalPath);
            $absoluteFinalPath = Storage::disk('local')->path($finalPath);
            $this->assertStoredIntegrity(
                $absoluteFinalPath,
                $result->byteSize,
                $result->sha256,
                'TALOS_ARTIFACT_PROMOTION_INTEGRITY',
            );

            $promoted = DB::transaction(function () use (
                $artifactId,
                $documentId,
                $document,
                $finalPath,
                $generation,
                $result,
                $run,
                $scan,
                $user,
            ): array {
                $semantic = $document->toArray();
                $canonicalDocument = $document->toCanonicalJson();
                $metadata = [
                    'origin' => 'generated',
                    'trust_boundary' => 'generated_content',
                    'title' => (string) $semantic['title'],
                    'filename' => (string) $generation->filename,
                    'format' => $result->format,
                    'size_bytes' => $result->byteSize,
                    'sha256' => $result->sha256,
                    'storage_disk' => 'local',
                    'storage_path' => $finalPath,
                    'promotion_status' => 'verified',
                    'worker_request_id' => $result->requestId,
                    'document_id' => $documentId,
                    'validation' => [
                        'detected_mime' => $result->detectedMime,
                        'reopened' => $result->reopened,
                    ],
                    'scan' => [
                        'status' => $scan->status,
                        'engine_version' => $scan->engineVersion,
                        'signature_version' => $scan->signatureVersion,
                    ],
                ];

                $artifact = new TalosRunArtifact([
                    'run_id' => $run->id,
                    'artifact_type' => 'generated_document',
                    'uri' => 'talos://generated-artifacts/'.$artifactId,
                    'mime_type' => $result->mimeType,
                    'metadata' => $metadata,
                ]);
                $artifact->id = $artifactId;
                $artifact->save();

                $generatedDocument = new TalosDocument([
                    'user_id' => $user->id,
                    'run_id' => $run->id,
                    'run_artifact_id' => $artifactId,
                    'title' => (string) $semantic['title'],
                    'document_type' => 'generated_document',
                    'format' => $result->format,
                    'status' => 'active',
                    'content' => $canonicalDocument,
                    'content_hash' => hash('sha256', $canonicalDocument),
                    'metadata' => [
                        'origin' => 'generated',
                        'trust_boundary' => 'generated_content',
                        'binary_artifact' => true,
                        'artifact_format' => $result->format,
                        'artifact_mime_type' => $result->mimeType,
                    ],
                ]);
                $generatedDocument->id = $documentId;
                $generatedDocument->save();

                $generation->forceFill([
                    'artifact_id' => $artifactId,
                    'document_id' => $documentId,
                    'status' => TalosArtifactGeneration::STATUS_SUCCEEDED,
                    'failure_code' => null,
                    'completed_at' => now(),
                ])->save();

                if ($this->libraryProjector->project($artifact) === null) {
                    throw new RuntimeException('Generated artifact did not produce a Library projection.');
                }

                $this->eventRecorder->record(
                    ['run_id' => (string) $run->id, 'user_id' => (int) $user->id],
                    [
                        'event_type' => 'artifact.created',
                        'payload' => [
                            'generation_id' => (string) $generation->id,
                            'artifact_id' => $artifactId,
                            'document_id' => $documentId,
                            'format' => $result->format,
                            'mime_type' => $result->mimeType,
                            'sha256' => $result->sha256,
                            'byte_size' => $result->byteSize,
                        ],
                    ],
                );

                return ['artifact' => $artifact->refresh(), 'document' => $generatedDocument->refresh()];
            }, 3);
            $committed = true;

            try {
                $this->quarantine->discard($quarantinePath);
            } catch (Throwable $cleanupException) {
                $artifact = $promoted['artifact'];
                $metadata = is_array($artifact->metadata) ? $artifact->metadata : [];
                try {
                    $artifact->forceFill([
                        'metadata' => [...$metadata, 'quarantine_cleanup_pending' => true],
                    ])->save();
                } catch (Throwable $markerException) {
                    report($markerException);
                }
                report($cleanupException);
            }

            return $promoted;
        } catch (Throwable $exception) {
            if (! $committed && is_string($finalPath)) {
                try {
                    $this->quarantine->discardFinal($finalPath);
                } catch (Throwable $cleanupException) {
                    report($cleanupException);
                }
            }
            if (! $committed && is_string($quarantinePath)) {
                try {
                    $this->quarantine->discard($quarantinePath);
                } catch (Throwable $cleanupException) {
                    report($cleanupException);
                }
            }

            if ($exception instanceof TalosArtifactGenerationException) {
                throw $exception;
            }

            throw new TalosArtifactGenerationException(
                'TALOS_ARTIFACT_PROMOTION_FAILED',
                'Generated artifact could not be promoted atomically.',
                503,
                previous: $exception,
            );
        }
    }

    private function assertStoredIntegrity(
        string $absolutePath,
        int $expectedSize,
        string $expectedSha256,
        string $code,
        int $status = 502,
    ): void {
        $realPath = realpath($absolutePath);
        $root = realpath(dirname($absolutePath, 5));
        clearstatcache(true, $absolutePath);
        $size = is_file($absolutePath) ? filesize($absolutePath) : false;
        $sha256 = is_file($absolutePath) ? hash_file('sha256', $absolutePath) : false;
        if (! is_string($realPath)
            || ($root !== false && ! TalosStoragePathBoundary::contains($root, $realPath))
            || ! is_int($size)
            || $size !== $expectedSize
            || ! is_string($sha256)
            || ! hash_equals($expectedSha256, $sha256)) {
            throw new TalosArtifactGenerationException(
                $code,
                'Generated artifact bytes failed integrity verification.',
                $status,
            );
        }
    }

    private function assertFormatBytes(string $path, string $format): void
    {
        if ($format === 'pdf') {
            $bytes = file_get_contents($path);
            if (! is_string($bytes)
                || ! str_starts_with($bytes, '%PDF-')
                || ! str_contains($bytes, '%%EOF')) {
                throw $this->formatFault();
            }

            return;
        }

        if ($format === 'thumbnail') {
            $header = file_get_contents($path, false, null, 0, 8);
            $image = @getimagesize($path);
            if ($header !== "\x89PNG\r\n\x1a\n"
                || ! is_array($image)
                || ($image[2] ?? null) !== IMAGETYPE_PNG) {
                throw $this->formatFault();
            }

            return;
        }

        $requiredEntry = self::OOXML_ENTRY_BY_FORMAT[$format] ?? null;
        if (! is_string($requiredEntry)) {
            throw $this->formatFault();
        }
        $archive = new ZipArchive;
        if ($archive->open($path) !== true) {
            throw $this->formatFault();
        }

        try {
            foreach (['[Content_Types].xml', '_rels/.rels', $requiredEntry] as $entry) {
                if ($archive->locateName($entry, ZipArchive::FL_NOCASE) === false) {
                    throw $this->formatFault();
                }
            }
            for ($index = 0; $index < $archive->numFiles; $index++) {
                $name = $archive->getNameIndex($index);
                if (! is_string($name)
                    || str_contains(str_replace('\\', '/', $name), '../')
                    || str_starts_with($name, '/')
                    || str_starts_with($name, '\\')) {
                    throw $this->formatFault();
                }
            }
        } finally {
            $archive->close();
        }
    }

    private function formatFault(): TalosArtifactGenerationException
    {
        return new TalosArtifactGenerationException(
            'TALOS_ARTIFACT_FORMAT_INVALID',
            'Generated artifact bytes do not match the requested format.',
            502,
        );
    }
}
