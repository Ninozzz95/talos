<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

final class TalosBrowserArtifactReader
{
    public function read(TalosBrowserArtifact $artifact): string
    {
        $maximumBytes = match ($artifact->type) {
            'screenshot' => TalosBrowserArtifactStore::MAX_SCREENSHOT_BYTES,
            'snapshot' => TalosBrowserArtifactStore::MAX_SNAPSHOT_BYTES,
            default => $this->fail($artifact, 'unsupported_type'),
        };

        try {
            $disk = Storage::disk((string) $artifact->storage_disk);
            $path = (string) $artifact->storage_path;
            if (! $disk->exists($path)) {
                $this->fail($artifact, 'missing');
            }

            $actualSize = $disk->size($path);
            $metadata = is_array($artifact->metadata) ? $artifact->metadata : [];
            $recordedSize = $metadata['size_bytes'] ?? null;
            if (! is_int($actualSize)
                || $actualSize < 1
                || $actualSize > $maximumBytes
                || ($recordedSize !== null && (! is_int($recordedSize) || $recordedSize !== $actualSize))) {
                $this->fail($artifact, 'size_mismatch');
            }

            $stream = $disk->readStream($path);
            if (! is_resource($stream)) {
                $this->fail($artifact, 'read_failure');
            }
            try {
                $contents = stream_get_contents($stream, $maximumBytes + 1);
            } finally {
                fclose($stream);
            }
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            throw $exception;
        } catch (Throwable) {
            $this->fail($artifact, 'read_failure');
        }

        if (! is_string($contents) || strlen($contents) !== $actualSize) {
            $this->fail($artifact, 'size_mismatch');
        }
        $expectedHash = (string) $artifact->sha256;
        if (preg_match('/^[a-f0-9]{64}$/', $expectedHash) !== 1
            || ! hash_equals($expectedHash, hash('sha256', $contents))) {
            $this->fail($artifact, 'sha256_mismatch');
        }

        return $contents;
    }

    private function fail(TalosBrowserArtifact $artifact, string $reason): never
    {
        try {
            DB::transaction(function () use ($artifact, $reason): void {
                $session = TalosBrowserSession::query()
                    ->whereKey($artifact->browser_session_id)
                    ->where('user_id', $artifact->user_id)
                    ->lockForUpdate()
                    ->first();
                if (! $session instanceof TalosBrowserSession) {
                    return;
                }

                if (! in_array($session->status, ['closing', 'closed'], true)) {
                    $session->forceFill(['status' => 'recovery_required', 'last_seen_at' => now()])->save();
                }
                $commandId = 'artifact_integrity_'.hash('sha256', $artifact->id."\0".$reason);
                TalosBrowserEvent::query()->firstOrCreate(
                    [
                        'browser_session_id' => $session->id,
                        'type' => 'artifact.integrity_failed',
                        'command_id' => $commandId,
                    ],
                    [
                        'user_id' => $session->user_id,
                        'actor' => 'system',
                        'payload' => [
                            'artifact_id' => $artifact->id,
                            'artifact_type' => $artifact->type,
                            'reason' => $reason,
                        ],
                        'policy_decision' => null,
                    ],
                );
            }, 3);
        } catch (Throwable) {
            // The integrity failure remains fail-closed even if observability persistence is unavailable.
        }

        throw new TalosBrowserArtifactIntegrityException((string) $artifact->id, $reason);
    }
}
