<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

final class TalosBrowserArtifactStore
{
    public const MAX_SCREENSHOT_BYTES = 5_000_000;

    public const CLEANUP_PENDING_METADATA_KEY = '__talos_browser_cleanup_pending';

    public const LOCAL_DISK = 'local';

    public const QUARANTINE_ROOT = 'talos/browser/.quarantine';

    public const JOURNAL_VERSION = 2;

    public const CLEANUP_BATCH_SIZE = 25;

    public const MAX_CLEANUP_ARTIFACTS = 100;

    /** @param array<string, mixed> $metadata */
    public function store(TalosBrowserSession $session, string $type, string $mime, string $contents, array $metadata = []): TalosBrowserArtifact
    {
        $id = (string) str()->uuid();
        $path = self::artifactPath((int) $session->user_id, (string) $session->id, $id);
        $disk = $this->localDisk();
        $written = false;

        try {
            return DB::transaction(function () use ($session, $type, $mime, $contents, $metadata, $id, $path, $disk, &$written): TalosBrowserArtifact {
                $chat = TalosSession::query()
                    ->whereKey($session->talos_session_id)
                    ->where('user_id', $session->user_id)
                    ->lockForUpdate()
                    ->first();

                if (! $chat instanceof TalosSession) {
                    throw new \RuntimeException('Browser chat is unavailable.');
                }

                $chatMetadata = is_array($chat->metadata) ? $chat->metadata : [];
                if (($chatMetadata[self::CLEANUP_PENDING_METADATA_KEY] ?? false) === true) {
                    throw new \RuntimeException('Browser artifact creation is blocked while chat cleanup is pending.');
                }

                $browserSessionExists = TalosBrowserSession::query()
                    ->whereKey($session->id)
                    ->where('user_id', $session->user_id)
                    ->where('talos_session_id', $chat->id)
                    ->exists();

                if (! $browserSessionExists) {
                    throw new \RuntimeException('Browser session is unavailable.');
                }

                $artifactCount = TalosBrowserArtifact::query()
                    ->join('talos_browser_sessions', 'talos_browser_sessions.id', '=', 'talos_browser_artifacts.browser_session_id')
                    ->where('talos_browser_sessions.talos_session_id', $chat->id)
                    ->count('talos_browser_artifacts.id');
                if ($artifactCount >= self::MAX_CLEANUP_ARTIFACTS) {
                    throw new \RuntimeException('Browser artifact creation exceeds the operational cleanup limit.');
                }

                if (! $disk->put($path, $contents)) {
                    throw new \RuntimeException('Browser artifact storage failed.');
                }

                $written = true;

                try {
                    return TalosBrowserArtifact::query()->create([
                        'id' => $id,
                        'browser_session_id' => $session->id,
                        'user_id' => $session->user_id,
                        'type' => $type,
                        'mime' => $mime,
                        'storage_disk' => self::LOCAL_DISK,
                        'storage_path' => $path,
                        'sha256' => hash('sha256', $contents),
                        'metadata' => $metadata,
                    ]);
                } catch (\Throwable $exception) {
                    $this->deleteFile($disk, $path);
                    $written = false;

                    throw $exception;
                }
            });
        } catch (\Throwable $exception) {
            if ($written) {
                $this->deleteFile($disk, $path);
            }

            throw $exception;
        }
    }

    public function discard(TalosBrowserArtifact $artifact): void
    {
        $this->assertLocalDisk((string) $artifact->storage_disk);
        $this->deleteFile($this->localDisk(), (string) $artifact->storage_path);
        $artifact->delete();
    }

    /**
     * @param list<array<string, mixed>>|null $recoveryReceipt
     * @return list<array<string, mixed>>
     */
    public function deleteForChat(TalosSession $session, ?array &$recoveryReceipt = null): array
    {
        $this->markCleanupPending($session);
        $this->assertConsistentBrowserSessionOwners($session);

        $artifactQuery = TalosBrowserArtifact::query()
            ->join('talos_browser_sessions', 'talos_browser_sessions.id', '=', 'talos_browser_artifacts.browser_session_id')
            ->where('talos_browser_sessions.talos_session_id', $session->id);

        $artifactCount = (clone $artifactQuery)->count('talos_browser_artifacts.id');
        if ($artifactCount > self::MAX_CLEANUP_ARTIFACTS) {
            throw new \RuntimeException('Browser artifact cleanup exceeds the operational limit.');
        }

        $inconsistentArtifactOwner = (clone $artifactQuery)
            ->where('talos_browser_artifacts.user_id', '<>', $session->user_id)
            ->exists();
        if ($inconsistentArtifactOwner) {
            throw new \RuntimeException('Browser artifact ownership is inconsistent.');
        }

        $artifacts = $artifactQuery
            ->orderBy('talos_browser_artifacts.id')
            ->limit(self::MAX_CLEANUP_ARTIFACTS)
            ->get([
                'talos_browser_artifacts.id as artifact_id',
                'talos_browser_artifacts.user_id as artifact_user_id',
                'talos_browser_artifacts.storage_disk',
                'talos_browser_artifacts.storage_path',
                'talos_browser_sessions.id as browser_session_id',
            ]);

        if ($artifacts->isEmpty()) {
            if ($recoveryReceipt !== null) {
                $recoveryReceipt = [];
            }

            return [];
        }

        $operationId = (string) str()->uuid();
        $receipt = [];

        foreach ($artifacts->values() as $index => $artifact) {
            $artifactId = (string) $artifact->artifact_id;
            $browserSessionId = (string) $artifact->browser_session_id;
            $path = (string) $artifact->storage_path;
            $batch = intdiv($index, self::CLEANUP_BATCH_SIZE) + 1;

            $this->assertLocalDisk((string) $artifact->storage_disk);
            if (! self::isArtifactPath($path, (int) $session->user_id, $browserSessionId)) {
                throw new \RuntimeException('Browser artifact storage path is inconsistent.');
            }

            $receipt[] = [
                'artifact_id' => $artifactId,
                'browser_session_id' => $browserSessionId,
                'user_id' => (int) $session->user_id,
                'session_id' => (string) $session->id,
                'operation_id' => $operationId,
                'batch' => $batch,
                'disk' => self::LOCAL_DISK,
                'path' => $path,
                'quarantine_path' => self::quarantinePath((int) $session->user_id, (string) $session->id, $operationId, $batch, $artifactId),
                'manifest_path' => self::manifestPath((int) $session->user_id, (string) $session->id, $operationId, $batch),
                'moved' => false,
            ];
        }

        if ($recoveryReceipt !== null) {
            $recoveryReceipt = $receipt;
        }

        $disk = $this->localDisk();

        try {
            foreach ($this->groupByManifest($receipt) as $manifestPath => $entries) {
                $this->writeManifest($disk, $manifestPath, $entries);
            }

            foreach ($receipt as $index => $entry) {
                $moved = $this->moveFile($disk, $entry['path'], $entry['quarantine_path']);
                $receipt[$index]['moved'] = $moved;

                if ($recoveryReceipt !== null) {
                    $recoveryReceipt[$index]['moved'] = $moved;
                }
            }
        } catch (\Throwable $exception) {
            throw new \RuntimeException('Browser artifact cleanup failed.', previous: $exception);
        }

        return $receipt;
    }

    /** @param list<array<string, mixed>> $receipt */
    public function finalize(array $receipt): void
    {
        $failures = [];

        foreach ($receipt as $entry) {
            if (($entry['moved'] ?? false) !== true) {
                continue;
            }

            try {
                $this->assertLocalDisk((string) ($entry['disk'] ?? ''));
                $this->deleteFile($this->localDisk(), (string) $entry['quarantine_path']);
            } catch (\Throwable $exception) {
                $failures[] = $exception;
            }
        }

        if ($failures !== []) {
            throw $this->aggregateFailure('cleanup', $failures);
        }

        $this->completeJournals($receipt);
    }

    /**
     * Finalize a journal after its chat row has already been deleted.
     *
     * @param list<array<string, mixed>> $receipt
     */
    public function finalizeReconciled(array $receipt): void
    {
        $failures = [];

        foreach ($receipt as $entry) {
            try {
                $this->assertLocalDisk((string) ($entry['disk'] ?? ''));
                $disk = $this->localDisk();
                $this->deleteFile($disk, (string) $entry['quarantine_path']);
                $this->deleteFile($disk, (string) $entry['path']);
            } catch (\Throwable $exception) {
                $failures[] = $exception;
            }
        }

        if ($failures !== []) {
            throw $this->aggregateFailure('reconciliation cleanup', $failures);
        }

        $this->completeJournals($receipt);
    }

    /**
     * @param list<array<string, mixed>> $receipt
     */
    public function restore(array $receipt, bool $completeJournals = true): void
    {
        $failures = [];

        foreach (array_reverse($receipt) as $entry) {
            try {
                $this->assertLocalDisk((string) ($entry['disk'] ?? ''));

                if (($entry['moved'] ?? true) !== true) {
                    continue;
                }

                $this->restoreFile(
                    $this->localDisk(),
                    (string) $entry['quarantine_path'],
                    (string) $entry['path'],
                );
            } catch (\Throwable $exception) {
                $failures[] = $exception;
            }
        }

        if ($failures !== []) {
            throw $this->aggregateFailure('restore', $failures);
        }

        if ($completeJournals) {
            $this->completeJournals($receipt);
        }
    }

    /** @param list<array<string, mixed>> $receipt */
    public function completeJournals(array $receipt): void
    {
        $failures = [];

        foreach ($this->manifestPaths($receipt) as $manifestPath) {
            try {
                $this->deleteFile($this->localDisk(), $manifestPath);
            } catch (\Throwable $exception) {
                $failures[] = $exception;
            }
        }

        if ($failures !== []) {
            throw $this->aggregateFailure('journal completion', $failures);
        }
    }

    public static function artifactPath(int $userId, string $browserSessionId, string $artifactId): string
    {
        return "talos/browser/{$userId}/{$browserSessionId}/{$artifactId}";
    }

    public static function isArtifactPath(string $path, int $userId, string $browserSessionId): bool
    {
        $prefix = preg_quote("talos/browser/{$userId}/{$browserSessionId}/", '#');

        return preg_match("#^{$prefix}[0-9a-fA-F-]{36}$#", $path) === 1;
    }

    public static function manifestPath(int $userId, string $sessionId, string $operationId, int $batch): string
    {
        return sprintf('%s/%d/%s/%s/batch-%04d.json', self::QUARANTINE_ROOT, $userId, $sessionId, $operationId, $batch);
    }

    public static function quarantinePath(int $userId, string $sessionId, string $operationId, int $batch, string $artifactId): string
    {
        return sprintf('%s/%d/%s/%s/batch-%04d/%s', self::QUARANTINE_ROOT, $userId, $sessionId, $operationId, $batch, $artifactId);
    }

    private function markCleanupPending(TalosSession $session): void
    {
        $metadata = is_array($session->metadata) ? $session->metadata : [];
        if (($metadata[self::CLEANUP_PENDING_METADATA_KEY] ?? false) === true) {
            return;
        }

        $metadata[self::CLEANUP_PENDING_METADATA_KEY] = true;
        $session->update(['metadata' => $metadata]);
    }

    private function assertConsistentBrowserSessionOwners(TalosSession $session): void
    {
        $inconsistent = TalosBrowserSession::query()
            ->where('talos_session_id', $session->id)
            ->where('user_id', '<>', $session->user_id)
            ->exists();

        if ($inconsistent) {
            throw new \RuntimeException('Browser session ownership is inconsistent.');
        }
    }

    /**
     * @param list<array<string, mixed>> $receipt
     * @return array<string, list<array<string, mixed>>>
     */
    private function groupByManifest(array $receipt): array
    {
        $groups = [];

        foreach ($receipt as $entry) {
            $groups[(string) $entry['manifest_path']][] = $entry;
        }

        return $groups;
    }

    /** @param list<array<string, mixed>> $entries */
    private function writeManifest(FilesystemAdapter $disk, string $manifestPath, array $entries): void
    {
        $first = $entries[0] ?? null;
        if (! is_array($first) || count($entries) > self::CLEANUP_BATCH_SIZE) {
            throw new \RuntimeException('Browser artifact cleanup batch is invalid.');
        }

        $manifest = json_encode([
            'schema' => 'talos_browser_artifact_cleanup',
            'version' => self::JOURNAL_VERSION,
            'operation_id' => $first['operation_id'],
            'batch' => $first['batch'],
            'session_id' => $first['session_id'],
            'user_id' => $first['user_id'],
            'entry_count' => count($entries),
            'entries' => array_map(static fn (array $entry): array => [
                'artifact_id' => $entry['artifact_id'],
                'browser_session_id' => $entry['browser_session_id'],
                'disk' => $entry['disk'],
                'path' => $entry['path'],
                'quarantine_path' => $entry['quarantine_path'],
            ], $entries),
        ], JSON_THROW_ON_ERROR);

        if (! $disk->put($manifestPath, $manifest)) {
            throw new \RuntimeException('Browser artifact cleanup manifest failed.');
        }
    }

    /**
     * @param list<array<string, mixed>> $receipt
     * @return list<string>
     */
    private function manifestPaths(array $receipt): array
    {
        $paths = [];

        foreach ($receipt as $entry) {
            $path = $entry['manifest_path'] ?? null;
            if (is_string($path) && $path !== '') {
                $paths[$path] = true;
            }
        }

        return array_keys($paths);
    }

    private function localDisk(): FilesystemAdapter
    {
        return Storage::disk(self::LOCAL_DISK);
    }

    private function assertLocalDisk(string $disk): void
    {
        if ($disk !== self::LOCAL_DISK) {
            throw new \RuntimeException('Browser artifacts must use local storage.');
        }
    }

    private function deleteFile(FilesystemAdapter $disk, string $path): void
    {
        try {
            $deleted = $disk->delete($path);
        } catch (\Throwable $exception) {
            throw new \RuntimeException('Browser artifact storage cleanup failed.', previous: $exception);
        }

        if ($deleted === true || ! $disk->exists($path)) {
            return;
        }

        throw new \RuntimeException('Browser artifact storage cleanup failed while the file still exists.');
    }

    private function moveFile(FilesystemAdapter $disk, string $source, string $destination): bool
    {
        try {
            $moved = $disk->move($source, $destination);
        } catch (\Throwable $exception) {
            throw new \RuntimeException('Browser artifact quarantine move failed.', previous: $exception);
        }

        if ($moved === true) {
            return true;
        }

        $sourceExists = $disk->exists($source);
        $destinationExists = $disk->exists($destination);

        if (! $sourceExists && $destinationExists) {
            return true;
        }

        if (! $sourceExists && ! $destinationExists) {
            return false;
        }

        throw new \RuntimeException('Browser artifact quarantine move failed while the source still exists.');
    }

    private function restoreFile(FilesystemAdapter $disk, string $quarantinePath, string $destinationPath): void
    {
        try {
            $moved = $disk->move($quarantinePath, $destinationPath);
        } catch (\Throwable $exception) {
            throw new \RuntimeException('Browser artifact restore move failed.', previous: $exception);
        }

        if ($moved === true) {
            return;
        }

        $quarantineExists = $disk->exists($quarantinePath);
        $destinationExists = $disk->exists($destinationPath);

        if (! $quarantineExists && $destinationExists) {
            return;
        }

        if (! $quarantineExists && ! $destinationExists) {
            throw new \RuntimeException('Browser artifact restore failed: both quarantine and destination are missing.');
        }

        throw new \RuntimeException('Browser artifact restore move failed while the quarantine source remains.');
    }

    /** @param list<\Throwable> $failures */
    private function aggregateFailure(string $operation, array $failures): \RuntimeException
    {
        $count = count($failures);
        $noun = $count === 1 ? 'entry' : 'entries';

        return new \RuntimeException("Browser artifact {$operation} failed for {$count} {$noun}.", previous: $failures[0]);
    }
}
