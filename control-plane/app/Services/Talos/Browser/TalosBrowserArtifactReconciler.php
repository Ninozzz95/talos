<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosAuditEvent;
use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

final class TalosBrowserArtifactReconciler
{
    private const MAX_MANIFEST_BYTES = 65_536;

    private const MAX_MANIFESTS_PER_SESSION = 8;

    private const MAX_MANIFESTS_PER_RUN = 100;

    public function __construct(private readonly TalosBrowserArtifactStore $store) {}

    /**
     * @return array{outcome: string, manifests: int, entries: int}
     */
    public function reconcileForSession(string $sessionId, int $userId): array
    {
        try {
            return $this->reconcileSession($sessionId, $userId);
        } catch (\Throwable $exception) {
            $this->audit('browser_artifact_cleanup.reconcile_failed', $sessionId, [
                'outcome' => 'failed',
                'fault_type' => $exception::class,
            ]);

            throw $exception;
        }
    }

    /**
     * @return array{status: string, sessions: int, manifests: int, entries: int, restored: int, finalized: int, truncated: bool}
     */
    public function reconcileAll(): array
    {
        $paths = $this->discoverManifestPaths(TalosBrowserArtifactStore::QUARANTINE_ROOT, self::MAX_MANIFESTS_PER_RUN + 1);
        $truncated = count($paths) > self::MAX_MANIFESTS_PER_RUN;
        $paths = array_slice($paths, 0, self::MAX_MANIFESTS_PER_RUN);
        $sessions = [];

        foreach ($paths as $path) {
            $identity = $this->identityFromManifestPath($path);
            $sessions[$identity['user_id'].'|'.$identity['session_id']] = $identity;
        }

        $result = [
            'status' => 'ok',
            'sessions' => 0,
            'manifests' => 0,
            'entries' => 0,
            'restored' => 0,
            'finalized' => 0,
            'truncated' => $truncated,
        ];

        foreach ($sessions as $identity) {
            $sessionResult = $this->reconcileForSession($identity['session_id'], $identity['user_id']);
            $result['sessions']++;
            $result['manifests'] += $sessionResult['manifests'];
            $result['entries'] += $sessionResult['entries'];

            if ($sessionResult['outcome'] === 'restored') {
                $result['restored']++;
            } elseif ($sessionResult['outcome'] === 'finalized') {
                $result['finalized']++;
            }
        }

        return $result;
    }

    public function persistPending(string $sessionId, int $userId): void
    {
        DB::transaction(function () use ($sessionId, $userId): void {
            $session = TalosSession::query()
                ->whereKey($sessionId)
                ->where('user_id', $userId)
                ->lockForUpdate()
                ->first();

            if (! $session instanceof TalosSession) {
                return;
            }

            $metadata = is_array($session->metadata) ? $session->metadata : [];
            $metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] = true;
            $session->update(['metadata' => $metadata]);
        }, 3);
    }

    /** @param list<array<string, mixed>> $receipt */
    public function auditDeferred(string $sessionId, array $receipt, string $phase): void
    {
        $this->audit('browser_artifact_cleanup.deferred', $sessionId, [
            'outcome' => 'deferred',
            'phase' => $phase,
            'manifest_count' => count($this->manifestPaths($receipt)),
            'entry_count' => count($receipt),
        ]);
    }

    /**
     * @return array{outcome: string, manifests: int, entries: int}
     */
    private function reconcileSession(string $sessionId, int $userId): array
    {
        $root = TalosBrowserArtifactStore::QUARANTINE_ROOT."/{$userId}/{$sessionId}";
        $manifestPaths = $this->discoverManifestPaths($root, self::MAX_MANIFESTS_PER_SESSION + 1);
        if (count($manifestPaths) > self::MAX_MANIFESTS_PER_SESSION) {
            throw new \RuntimeException('Browser artifact reconciliation exceeds the manifest limit.');
        }

        $chat = TalosSession::query()->whereKey($sessionId)->first();
        if ($chat instanceof TalosSession && (int) $chat->user_id !== $userId) {
            throw new \RuntimeException('Browser artifact journal ownership is inconsistent.');
        }

        if ($manifestPaths === []) {
            $metadata = is_array($chat?->metadata) ? $chat->metadata : [];
            if (($metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY] ?? false) === true) {
                $this->clearPending($sessionId, $userId);
                $result = ['outcome' => 'released', 'manifests' => 0, 'entries' => 0];
                $this->audit('browser_artifact_cleanup.reconciled', $sessionId, $result);

                return $result;
            }

            return ['outcome' => 'none', 'manifests' => 0, 'entries' => 0];
        }

        $receipt = [];
        $artifactIds = [];

        foreach ($manifestPaths as $manifestPath) {
            foreach ($this->readManifest($manifestPath, $sessionId, $userId) as $entry) {
                $artifactId = $entry['artifact_id'];
                if (isset($artifactIds[$artifactId])) {
                    throw new \RuntimeException('Browser artifact journal contains duplicate artifacts.');
                }

                $artifactIds[$artifactId] = true;
                $receipt[] = $entry;

                if (count($receipt) > TalosBrowserArtifactStore::MAX_CLEANUP_ARTIFACTS) {
                    throw new \RuntimeException('Browser artifact reconciliation exceeds the entry limit.');
                }
            }
        }

        if ($chat instanceof TalosSession) {
            $this->assertRowsMatchJournal($chat, $receipt);
            $this->store->restore($receipt, false);

            try {
                $this->clearPending($sessionId, $userId);
                $this->store->completeJournals($receipt);
            } catch (\Throwable $exception) {
                $this->persistPending($sessionId, $userId);

                throw $exception;
            }

            $outcome = 'restored';
        } else {
            if (TalosBrowserSession::query()->where('talos_session_id', $sessionId)->exists()) {
                throw new \RuntimeException('Deleted chat still has browser session rows.');
            }

            $this->store->finalizeReconciled($receipt);
            $outcome = 'finalized';
        }

        $result = [
            'outcome' => $outcome,
            'manifests' => count($manifestPaths),
            'entries' => count($receipt),
        ];
        $this->audit('browser_artifact_cleanup.reconciled', $sessionId, $result);

        return $result;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function readManifest(string $manifestPath, string $expectedSessionId, int $expectedUserId): array
    {
        $disk = $this->localDisk();
        $size = $disk->size($manifestPath);
        if (! is_int($size) || $size <= 0 || $size > self::MAX_MANIFEST_BYTES) {
            throw new \RuntimeException('Browser artifact journal size is invalid.');
        }

        $contents = $disk->get($manifestPath);
        if (! is_string($contents)) {
            throw new \RuntimeException('Browser artifact journal could not be read.');
        }

        try {
            $manifest = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new \RuntimeException('Browser artifact journal JSON is invalid.', previous: $exception);
        }

        if (! is_array($manifest)
            || ($manifest['schema'] ?? null) !== 'talos_browser_artifact_cleanup'
            || ($manifest['version'] ?? null) !== TalosBrowserArtifactStore::JOURNAL_VERSION
            || ! is_string($manifest['operation_id'] ?? null)
            || ! Str::isUuid($manifest['operation_id'])
            || ! is_int($manifest['batch'] ?? null)
            || $manifest['batch'] < 1
            || ! is_string($manifest['session_id'] ?? null)
            || $manifest['session_id'] !== $expectedSessionId
            || ! is_int($manifest['user_id'] ?? null)
            || $manifest['user_id'] !== $expectedUserId
            || ! is_int($manifest['entry_count'] ?? null)
            || ! is_array($manifest['entries'] ?? null)
            || ! array_is_list($manifest['entries'])
            || $manifest['entry_count'] !== count($manifest['entries'])
            || $manifest['entry_count'] < 1
            || $manifest['entry_count'] > TalosBrowserArtifactStore::CLEANUP_BATCH_SIZE
        ) {
            throw new \RuntimeException('Browser artifact journal schema is invalid.');
        }

        $operationId = $manifest['operation_id'];
        $batch = $manifest['batch'];
        if ($manifestPath !== TalosBrowserArtifactStore::manifestPath($expectedUserId, $expectedSessionId, $operationId, $batch)) {
            throw new \RuntimeException('Browser artifact journal path is invalid.');
        }

        $receipt = [];
        $seen = [];

        foreach ($manifest['entries'] as $entry) {
            if (! is_array($entry)
                || ! is_string($entry['artifact_id'] ?? null)
                || ! Str::isUuid($entry['artifact_id'])
                || ! is_string($entry['browser_session_id'] ?? null)
                || ! Str::isUuid($entry['browser_session_id'])
                || ($entry['disk'] ?? null) !== TalosBrowserArtifactStore::LOCAL_DISK
                || ! is_string($entry['path'] ?? null)
                || ! is_string($entry['quarantine_path'] ?? null)
            ) {
                throw new \RuntimeException('Browser artifact journal entry is invalid.');
            }

            $artifactId = $entry['artifact_id'];
            $browserSessionId = $entry['browser_session_id'];
            if (isset($seen[$artifactId])) {
                throw new \RuntimeException('Browser artifact journal batch contains duplicate artifacts.');
            }

            if (! TalosBrowserArtifactStore::isArtifactPath($entry['path'], $expectedUserId, $browserSessionId)
                || $entry['quarantine_path'] !== TalosBrowserArtifactStore::quarantinePath($expectedUserId, $expectedSessionId, $operationId, $batch, $artifactId)
            ) {
                throw new \RuntimeException('Browser artifact journal entry path is invalid.');
            }

            $seen[$artifactId] = true;
            $receipt[] = [
                'artifact_id' => $artifactId,
                'browser_session_id' => $browserSessionId,
                'user_id' => $expectedUserId,
                'session_id' => $expectedSessionId,
                'operation_id' => $operationId,
                'batch' => $batch,
                'disk' => TalosBrowserArtifactStore::LOCAL_DISK,
                'path' => $entry['path'],
                'quarantine_path' => $entry['quarantine_path'],
                'manifest_path' => $manifestPath,
                'moved' => true,
            ];
        }

        return $receipt;
    }

    /** @param list<array<string, mixed>> $receipt */
    private function assertRowsMatchJournal(TalosSession $chat, array $receipt): void
    {
        $inconsistentBrowserSession = TalosBrowserSession::query()
            ->where('talos_session_id', $chat->id)
            ->where('user_id', '<>', $chat->user_id)
            ->exists();
        if ($inconsistentBrowserSession) {
            throw new \RuntimeException('Browser session ownership is inconsistent during reconciliation.');
        }

        $rows = TalosBrowserArtifact::query()
            ->join('talos_browser_sessions', 'talos_browser_sessions.id', '=', 'talos_browser_artifacts.browser_session_id')
            ->where('talos_browser_sessions.talos_session_id', $chat->id)
            ->orderBy('talos_browser_artifacts.id')
            ->limit(TalosBrowserArtifactStore::MAX_CLEANUP_ARTIFACTS + 1)
            ->get([
                'talos_browser_artifacts.id as artifact_id',
                'talos_browser_artifacts.user_id as artifact_user_id',
                'talos_browser_artifacts.storage_disk',
                'talos_browser_artifacts.storage_path',
                'talos_browser_sessions.id as browser_session_id',
                'talos_browser_sessions.user_id as browser_session_user_id',
            ]);

        if ($rows->count() < count($receipt)
            || $rows->count() > TalosBrowserArtifactStore::MAX_CLEANUP_ARTIFACTS) {
            throw new \RuntimeException('Browser artifact rows do not match the cleanup journal.');
        }

        $rowsById = $rows->keyBy('artifact_id');
        $journaledIds = array_fill_keys(array_column($receipt, 'artifact_id'), true);
        foreach ($rows as $row) {
            $artifactId = (string) $row->artifact_id;
            $browserSessionId = (string) $row->browser_session_id;
            $storagePath = (string) $row->storage_path;
            if ((int) $row->artifact_user_id !== (int) $chat->user_id
                || (int) $row->browser_session_user_id !== (int) $chat->user_id
                || (string) $row->storage_disk !== TalosBrowserArtifactStore::LOCAL_DISK
                || ! TalosBrowserArtifactStore::isArtifactPath($storagePath, (int) $chat->user_id, $browserSessionId)
            ) {
                throw new \RuntimeException('Browser artifact row ownership or storage is inconsistent during reconciliation.');
            }

            if (! isset($journaledIds[$artifactId]) && ! $this->localDisk()->exists($storagePath)) {
                throw new \RuntimeException('Unjournaled browser artifact content is missing during reconciliation.');
            }
        }

        foreach ($receipt as $entry) {
            $row = $rowsById->get($entry['artifact_id']);
            if ($row === null
                || (int) $row->artifact_user_id !== (int) $chat->user_id
                || (int) $row->browser_session_user_id !== (int) $chat->user_id
                || (string) $row->browser_session_id !== $entry['browser_session_id']
                || (string) $row->storage_disk !== $entry['disk']
                || (string) $row->storage_path !== $entry['path']
            ) {
                throw new \RuntimeException('Browser artifact row is inconsistent with the cleanup journal.');
            }
        }
    }

    private function clearPending(string $sessionId, int $userId): void
    {
        DB::transaction(function () use ($sessionId, $userId): void {
            $session = TalosSession::query()
                ->whereKey($sessionId)
                ->where('user_id', $userId)
                ->lockForUpdate()
                ->first();

            if (! $session instanceof TalosSession) {
                throw new \RuntimeException('Chat disappeared during browser artifact reconciliation.');
            }

            $metadata = is_array($session->metadata) ? $session->metadata : [];
            unset($metadata[TalosBrowserArtifactStore::CLEANUP_PENDING_METADATA_KEY]);
            $session->update(['metadata' => $metadata]);
        }, 3);
    }

    /** @return list<string> */
    private function discoverManifestPaths(string $root, int $limit): array
    {
        $disk = $this->localDisk();
        if (! $disk->directoryExists($root)) {
            return [];
        }

        $paths = [];
        foreach ($disk->getDriver()->listContents($root, true) as $attributes) {
            if (! $attributes->isFile() || ! str_ends_with($attributes->path(), '.json')) {
                continue;
            }

            $paths[] = $attributes->path();
            if (count($paths) >= $limit) {
                break;
            }
        }

        sort($paths, SORT_STRING);

        return $paths;
    }

    /** @return array{user_id: int, session_id: string} */
    private function identityFromManifestPath(string $path): array
    {
        $root = preg_quote(TalosBrowserArtifactStore::QUARANTINE_ROOT, '#');
        if (preg_match("#^{$root}/([1-9][0-9]*)/([A-Za-z0-9-]{1,64})/[A-Za-z0-9-]{1,64}/batch-[0-9]{4}\\.json$#", $path, $matches) !== 1) {
            throw new \RuntimeException('Browser artifact journal location is invalid.');
        }

        return [
            'user_id' => (int) $matches[1],
            'session_id' => $matches[2],
        ];
    }

    /** @param list<array<string, mixed>> $receipt @return list<string> */
    private function manifestPaths(array $receipt): array
    {
        $paths = [];
        foreach ($receipt as $entry) {
            if (is_string($entry['manifest_path'] ?? null)) {
                $paths[$entry['manifest_path']] = true;
            }
        }

        return array_keys($paths);
    }

    /** @param array<string, mixed> $payload */
    private function audit(string $eventType, string $sessionId, array $payload): void
    {
        try {
            TalosAuditEvent::record($eventType, 'talos_session', $sessionId, $payload, 'system', null);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function localDisk(): FilesystemAdapter
    {
        return Storage::disk(TalosBrowserArtifactStore::LOCAL_DISK);
    }
}
