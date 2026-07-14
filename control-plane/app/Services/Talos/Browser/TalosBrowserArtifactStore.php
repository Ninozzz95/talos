<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserHmiApproval;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

final class TalosBrowserArtifactStore
{
    public const MAX_SCREENSHOT_BYTES = 5_000_000;

    public const MAX_SNAPSHOT_BYTES = 1_000_000;

    public const CLEANUP_PENDING_METADATA_KEY = '__talos_browser_cleanup_pending';

    public const LOCAL_DISK = 'local';

    public const QUARANTINE_ROOT = 'talos/browser/.quarantine';

    public const JOURNAL_VERSION = 2;

    public const CLEANUP_BATCH_SIZE = 25;

    public const MAX_CLEANUP_ARTIFACTS = 100;

    /** @param array<string, mixed> $metadata @param array<string, mixed> $provenance */
    public function store(TalosBrowserSession $session, string $type, string $mime, string $contents, array $metadata = [], array $provenance = []): TalosBrowserArtifact
    {
        $id = (string) str()->uuid();
        $path = self::artifactPath((int) $session->user_id, (string) $session->id, $id);
        $disk = $this->localDisk();
        $written = false;

        try {
            return DB::transaction(function () use ($session, $type, $mime, $contents, $metadata, $provenance, $id, $path, $disk, &$written): TalosBrowserArtifact {
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
                        'worker_capture_id' => $provenance['worker_capture_id'] ?? null,
                        'source_command_id' => $provenance['source_command_id'] ?? null,
                        'source_state_version' => $provenance['source_state_version'] ?? null,
                        'state_version' => $provenance['state_version'] ?? null,
                        'trust_boundary' => $provenance['trust_boundary'] ?? null,
                        'type' => $type,
                        'mime' => $mime,
                        'storage_disk' => self::LOCAL_DISK,
                        'storage_path' => $path,
                        'sha256' => hash('sha256', $contents),
                        'metadata' => [...$metadata, 'size_bytes' => strlen($contents)],
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

    /**
     * @param  array<string, mixed>  $workerResult
     * @return array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact, session: TalosBrowserSession, replayed: bool}
     */
    public function storeHmiCapture(
        TalosBrowserSession $session,
        string $commandId,
        array $workerResult,
        ?string $approvalId = null,
        ?string $executionLeaseToken = null,
    ): array {
        if (($approvalId === null) !== ($executionLeaseToken === null)) {
            throw new \RuntimeException('Browser HMI execution lease binding is incomplete.');
        }
        $capture = $this->validatedHmiCapture($session, $commandId, $workerResult);
        $created = [];

        try {
            /** @var array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact, replayed: bool} $stored */
            $stored = DB::transaction(function () use ($session, $commandId, $approvalId, $executionLeaseToken, $capture, &$created): array {
                $chat = TalosSession::query()
                    ->whereKey($session->talos_session_id)
                    ->where('user_id', $session->user_id)
                    ->lockForUpdate()
                    ->first();
                $lease = TalosBrowserSession::query()
                    ->whereKey($session->id)
                    ->where('user_id', $session->user_id)
                    ->where('talos_session_id', $session->talos_session_id)
                    ->lockForUpdate()
                    ->first();
                if (! $chat instanceof TalosSession || ! $lease instanceof TalosBrowserSession) {
                    throw new \RuntimeException('Browser HMI capture lease is no longer active.');
                }
                if (is_string($approvalId)) {
                    $approval = TalosBrowserHmiApproval::query()
                        ->whereKey($approvalId)
                        ->where('user_id', $lease->user_id)
                        ->where('browser_session_id', $lease->id)
                        ->where('command_id', $commandId)
                        ->where('status', 'executing')
                        ->lockForUpdate()
                        ->first();
                    if (! $approval instanceof TalosBrowserHmiApproval
                        || ! is_string($executionLeaseToken)
                        || ! Str::isUuid($executionLeaseToken)
                        || ! is_string($approval->execution_lease_token)
                        || ! hash_equals((string) $approval->execution_lease_token, $executionLeaseToken)
                        || $approval->execution_lease_expires_at === null
                        || ! $approval->execution_lease_expires_at->isFuture()) {
                        throw new \RuntimeException('Browser HMI execution lease is no longer current.');
                    }
                }

                $existing = TalosBrowserArtifact::query()
                    ->where('browser_session_id', $lease->id)
                    ->where('user_id', $lease->user_id)
                    ->where('source_command_id', $commandId)
                    ->lockForUpdate()
                    ->get();
                if ($existing->isNotEmpty()) {
                    $replayed = $this->validatedExistingHmiCapture($lease, $capture, $existing->all());
                    $updated = TalosBrowserSession::query()
                        ->whereKey($lease->id)
                        ->where('user_id', $lease->user_id)
                        ->where('worker_state_version', $capture['state_version'])
                        ->update([
                            'last_screenshot_artifact_id' => $replayed['screenshot']->id,
                            'last_snapshot_artifact_id' => $replayed['snapshot']->id,
                            'current_url' => $capture['url'],
                            'current_title' => $capture['title'],
                            'status' => 'active',
                            'last_seen_at' => now(),
                        ]);
                    if ($updated !== 1) {
                        throw new \RuntimeException('Browser HMI replay evidence was superseded by newer state.');
                    }

                    return [...$replayed, 'replayed' => true];
                }

                if (! $lease->isOperable() && $lease->status !== 'recovery_required') {
                    throw new \RuntimeException('Browser HMI capture lease is no longer active.');
                }
                if ((int) $lease->worker_state_version !== $capture['source_state_version']) {
                    throw new \RuntimeException('Browser HMI capture was superseded by newer state.');
                }

                $provenance = [
                    'worker_capture_id' => $capture['capture_id'],
                    'source_command_id' => $commandId,
                    'source_state_version' => $capture['source_state_version'],
                    'state_version' => $capture['state_version'],
                    'source_frame_sha256' => $capture['frame_sha256'],
                    'interaction_id' => $capture['interaction_id'],
                    'trust_boundary' => 'untrusted_browser_content',
                ];
                $sharedMetadata = array_filter([
                    'worker_capture_id' => $capture['capture_id'],
                    'source_command_id' => $commandId,
                    'source_state_version' => $capture['source_state_version'],
                    'state_version' => $capture['state_version'],
                    'source_frame_sha256' => $capture['frame_sha256'],
                    'interaction_id' => $capture['interaction_id'],
                    'approval_id' => $approvalId,
                    'captured_at' => $capture['captured_at'],
                ], static fn (mixed $value): bool => $value !== null);

                $screenshot = $this->store(
                    $lease,
                    'screenshot',
                    'image/png',
                    $capture['screenshot_bytes'],
                    [...$sharedMetadata, 'width' => $capture['width'], 'height' => $capture['height']],
                    $provenance,
                );
                $created[] = $screenshot;

                $snapshot = $this->store(
                    $lease,
                    'snapshot',
                    'application/json',
                    $capture['snapshot_json'],
                    [...$sharedMetadata, 'format' => 'accessibility_refs_v1', 'text_digest' => $capture['text_digest'], 'node_count' => $capture['node_count']],
                    $provenance,
                );
                $created[] = $snapshot;

                $updated = TalosBrowserSession::query()
                    ->whereKey($lease->id)
                    ->where('user_id', $lease->user_id)
                    ->where('status', $lease->status)
                    ->where('worker_state_version', $capture['source_state_version'])
                    ->update([
                        'worker_state_version' => $capture['state_version'],
                        'last_screenshot_artifact_id' => $screenshot->id,
                        'last_snapshot_artifact_id' => $snapshot->id,
                        'current_url' => $capture['url'],
                        'current_title' => $capture['title'],
                        'status' => 'active',
                        'last_seen_at' => now(),
                    ]);
                if ($updated !== 1) {
                    throw new \RuntimeException('Browser HMI capture was superseded by newer state.');
                }

                return [...compact('screenshot', 'snapshot'), 'replayed' => false];
            });
        } catch (\Throwable $exception) {
            $cleanupFailures = [];
            foreach (array_reverse($created) as $artifact) {
                try {
                    $this->discard($artifact);
                } catch (\Throwable $cleanupFailure) {
                    $cleanupFailures[] = $cleanupFailure;
                }
            }
            if ($cleanupFailures !== []) {
                throw new \RuntimeException('Browser HMI capture rollback left an artifact cleanup failure.', previous: $exception);
            }

            throw $exception;
        }

        $session->refresh();

        return [...$stored, 'session' => $session];
    }

    /**
     * @param  array{capture_id: string, interaction_id: string, source_state_version: int, state_version: int, frame_sha256: string, screenshot_bytes: string, width: int, height: int, snapshot_json: string, text_digest: string, node_count: int, url: string, title: string, captured_at: string}  $capture
     * @param  list<TalosBrowserArtifact>  $artifacts
     * @return array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact}
     */
    private function validatedExistingHmiCapture(TalosBrowserSession $session, array $capture, array $artifacts): array
    {
        if (count($artifacts) !== 2 || (int) $session->worker_state_version !== $capture['state_version']) {
            throw new \RuntimeException('Browser HMI replay evidence is incomplete or stale.');
        }
        $byType = [];
        foreach ($artifacts as $artifact) {
            if (isset($byType[$artifact->type])) {
                throw new \RuntimeException('Browser HMI replay evidence is duplicated.');
            }
            $byType[$artifact->type] = $artifact;
        }
        $screenshot = $byType['screenshot'] ?? null;
        $snapshot = $byType['snapshot'] ?? null;
        if (! $screenshot instanceof TalosBrowserArtifact || ! $snapshot instanceof TalosBrowserArtifact) {
            throw new \RuntimeException('Browser HMI replay evidence is incomplete or stale.');
        }

        foreach ([$screenshot, $snapshot] as $artifact) {
            if ((string) $artifact->worker_capture_id !== $capture['capture_id']
                || (int) $artifact->source_state_version !== $capture['source_state_version']
                || (int) $artifact->state_version !== $capture['state_version']
                || (string) ($artifact->metadata['source_frame_sha256'] ?? '') !== $capture['frame_sha256']
                || (string) ($artifact->metadata['interaction_id'] ?? '') !== $capture['interaction_id']
                || (string) $artifact->storage_disk !== self::LOCAL_DISK) {
                throw new \RuntimeException('Browser HMI replay evidence does not match the worker result.');
            }
            $contents = $this->localDisk()->get((string) $artifact->storage_path);
            if (! is_string($contents) || ! hash_equals((string) $artifact->sha256, hash('sha256', $contents))) {
                throw new \RuntimeException('Browser HMI replay evidence failed integrity verification.');
            }
        }
        if (! hash_equals((string) $screenshot->sha256, hash('sha256', $capture['screenshot_bytes']))
            || (string) ($snapshot->metadata['text_digest'] ?? '') !== $capture['text_digest']
            || (int) ($snapshot->metadata['node_count'] ?? -1) !== $capture['node_count']) {
            throw new \RuntimeException('Browser HMI replay evidence does not match the worker result.');
        }

        return compact('screenshot', 'snapshot');
    }

    public function discard(TalosBrowserArtifact $artifact): void
    {
        $this->assertLocalDisk((string) $artifact->storage_disk);
        $this->deleteFile($this->localDisk(), (string) $artifact->storage_path);
        $artifact->delete();
    }

    /**
     * @param  array<string, mixed>  $workerResult
     * @return array{capture_id: string, interaction_id: string, source_state_version: int, state_version: int, frame_sha256: string, screenshot_bytes: string, width: int, height: int, snapshot_json: string, text_digest: string, node_count: int, url: string, title: string, captured_at: string}
     */
    private function validatedHmiCapture(TalosBrowserSession $session, string $commandId, array $workerResult): array
    {
        if (! $this->hasExactKeys($workerResult, [
            'schema_version', 'capture_id', 'interaction_id', 'session_id', 'source_state_version', 'state_version',
            'command_id', 'frame_sha256', 'url', 'title', 'effect_classification',
            'sensitive_effect_authorized', 'target', 'screenshot', 'snapshot', 'captured_at',
        ])
            || preg_match('/^[A-Za-z0-9._:-]{1,128}$/', $commandId) !== 1
            || ($workerResult['schema_version'] ?? null) !== 'talos_browser_hmi_result_v2'
            || ! is_string($workerResult['capture_id'] ?? null)
            || preg_match('/^cap_[a-f0-9-]{36}$/', $workerResult['capture_id']) !== 1
            || ! is_string($workerResult['interaction_id'] ?? null)
            || ! Str::isUuid($workerResult['interaction_id'])
            || ! is_string($workerResult['command_id'] ?? null)
            || ! hash_equals($commandId, $workerResult['command_id'])
            || ($workerResult['session_id'] ?? null) !== $session->worker_session_id
            || ! $this->nonNegativeInteger($workerResult['source_state_version'] ?? null)
            || ! $this->nonNegativeInteger($workerResult['state_version'] ?? null)
            || $workerResult['state_version'] !== $workerResult['source_state_version'] + 1
            || ! $this->isSha256($workerResult['frame_sha256'] ?? null)
            || ! is_string($workerResult['url'] ?? null)
            || $workerResult['url'] === ''
            || mb_strlen($workerResult['url']) > 2048
            || ! is_string($workerResult['title'] ?? null)
            || mb_strlen($workerResult['title']) > 512
            || ! is_string($workerResult['captured_at'] ?? null)
            || $workerResult['captured_at'] === ''
            || mb_strlen($workerResult['captured_at']) > 64
            || ! $this->validTimestamp($workerResult['captured_at'])
            || ! in_array($workerResult['effect_classification'] ?? null, ['ordinary', 'sensitive'], true)
            || ! is_bool($workerResult['sensitive_effect_authorized'] ?? null)
            || (($workerResult['effect_classification'] ?? null) === 'sensitive' && $workerResult['sensitive_effect_authorized'] !== true)
            || ! $this->validHmiTarget($workerResult['target'] ?? null)
            || ($workerResult['target']['required_effect_classification'] ?? null) !== $workerResult['effect_classification']) {
            throw new \RuntimeException('Browser HMI capture contract is invalid.');
        }

        $screenshot = $workerResult['screenshot'] ?? null;
        if (! is_array($screenshot)
            || ! $this->hasExactKeys($screenshot, ['mime_type', 'width', 'height', 'sha256', 'base64'])
            || ($screenshot['mime_type'] ?? null) !== 'image/png'
            || ! $this->positiveInteger($screenshot['width'] ?? null)
            || ! $this->positiveInteger($screenshot['height'] ?? null)
            || $screenshot['width'] !== (int) $session->viewport_width
            || $screenshot['height'] !== (int) $session->viewport_height
            || ! $this->isSha256($screenshot['sha256'] ?? null)
            || ! is_string($screenshot['base64'] ?? null)) {
            throw new \RuntimeException('Browser HMI screenshot contract is invalid.');
        }
        $screenshotBytes = base64_decode($screenshot['base64'], true);
        if (! is_string($screenshotBytes) || $screenshotBytes === '' || strlen($screenshotBytes) > self::MAX_SCREENSHOT_BYTES) {
            throw new \RuntimeException('Browser HMI screenshot payload is invalid.');
        }
        if (($screenshot['sha256'] ?? null) !== 'sha256:'.hash('sha256', $screenshotBytes)) {
            throw new \RuntimeException('Browser HMI screenshot hash is invalid.');
        }

        $snapshot = $workerResult['snapshot'] ?? null;
        if (! is_array($snapshot)
            || ! $this->hasExactKeys($snapshot, ['snapshot_id', 'format', 'text_digest', 'sha256', 'nodes'])
            || ! is_string($snapshot['snapshot_id'] ?? null)
            || preg_match('/^snap_[A-Za-z0-9-]+$/', $snapshot['snapshot_id']) !== 1
            || ($snapshot['format'] ?? null) !== 'accessibility_refs_v1'
            || ! is_string($snapshot['text_digest'] ?? null)
            || mb_strlen($snapshot['text_digest']) > 4000
            || ! is_array($snapshot['nodes'] ?? null)
            || ! array_is_list($snapshot['nodes'])
            || count($snapshot['nodes']) > 500
            || ! $this->validSnapshotNodes($snapshot['nodes'])) {
            throw new \RuntimeException('Browser HMI snapshot contract is invalid.');
        }
        $snapshotForHash = [
            'snapshot_id' => $snapshot['snapshot_id'],
            'format' => $snapshot['format'],
            'text_digest' => $snapshot['text_digest'],
            'nodes' => $snapshot['nodes'],
        ];
        if (($snapshot['sha256'] ?? null) !== 'sha256:'.hash('sha256', $this->canonicalJson($snapshotForHash))) {
            throw new \RuntimeException('Browser HMI snapshot hash is invalid.');
        }
        $snapshotJson = json_encode([
            'snapshotId' => $snapshot['snapshot_id'],
            'format' => $snapshot['format'],
            'url' => $this->redactedPersistedUrl($workerResult['url']),
            'title' => $workerResult['title'],
            'nodes' => $snapshot['nodes'],
            'textDigest' => $snapshot['text_digest'],
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if (strlen($snapshotJson) > self::MAX_SNAPSHOT_BYTES) {
            throw new \RuntimeException('Browser HMI snapshot payload is invalid.');
        }

        return [
            'capture_id' => $workerResult['capture_id'],
            'interaction_id' => $workerResult['interaction_id'],
            'source_state_version' => $workerResult['source_state_version'],
            'state_version' => $workerResult['state_version'],
            'frame_sha256' => $workerResult['frame_sha256'],
            'screenshot_bytes' => $screenshotBytes,
            'width' => $screenshot['width'],
            'height' => $screenshot['height'],
            'snapshot_json' => $snapshotJson,
            'text_digest' => $snapshot['text_digest'],
            'node_count' => count($snapshot['nodes']),
            'url' => $this->redactedPersistedUrl($workerResult['url']),
            'title' => $workerResult['title'],
            'captured_at' => $workerResult['captured_at'],
        ];
    }

    /** @param array<string, mixed> $value @param list<string> $keys */
    private function hasExactKeys(array $value, array $keys): bool
    {
        $actual = array_keys($value);
        sort($actual);
        $expected = $keys;
        sort($expected);

        return $actual === $expected;
    }

    private function nonNegativeInteger(mixed $value): bool
    {
        return is_int($value) && $value >= 0;
    }

    private function positiveInteger(mixed $value): bool
    {
        return is_int($value) && $value > 0;
    }

    private function isSha256(mixed $value): bool
    {
        return is_string($value) && preg_match('/^sha256:[a-f0-9]{64}$/', $value) === 1;
    }

    private function validTimestamp(string $value): bool
    {
        try {
            new \DateTimeImmutable($value);

            return true;
        } catch (\Exception) {
            return false;
        }
    }

    /** @param array<string, mixed>|list<mixed>|null $target */
    private function validHmiTarget(mixed $target): bool
    {
        if (! is_array($target)
            || ! $this->hasExactKeys($target, [
                'tag', 'role', 'name', 'input_type', 'href', 'form_method', 'is_editable',
                'is_submit', 'is_download', 'opens_new_context', 'effect_attestation',
                'required_effect_classification', 'visible', 'disabled', 'fingerprint',
            ])
            || ! is_string($target['tag'] ?? null)
            || $target['tag'] === ''
            || mb_strlen($target['tag']) > 64
            || (! is_string($target['role'] ?? null) && $target['role'] !== null)
            || (is_string($target['role'] ?? null) && mb_strlen($target['role']) > 64)
            || ! is_string($target['name'] ?? null)
            || mb_strlen($target['name']) > 256
            || (! is_string($target['input_type'] ?? null) && $target['input_type'] !== null)
            || (is_string($target['input_type'] ?? null) && mb_strlen($target['input_type']) > 64)
            || (! is_string($target['href'] ?? null) && $target['href'] !== null)
            || (is_string($target['href'] ?? null) && ! $this->validHmiHref($target['href']))
            || (! is_string($target['form_method'] ?? null) && $target['form_method'] !== null)
            || (is_string($target['form_method'] ?? null) && mb_strlen($target['form_method']) > 16)
            || ! is_bool($target['is_editable'] ?? null)
            || ! is_bool($target['is_submit'] ?? null)
            || ! is_bool($target['is_download'] ?? null)
            || ! is_bool($target['opens_new_context'] ?? null)
            || ! in_array($target['effect_attestation'] ?? null, ['browser_default', 'unattestable'], true)
            || ! in_array($target['required_effect_classification'] ?? null, ['ordinary', 'sensitive'], true)
            || $target['required_effect_classification'] !== ($target['effect_attestation'] === 'browser_default' ? 'ordinary' : 'sensitive')
            || ! is_bool($target['visible'] ?? null)
            || ! is_bool($target['disabled'] ?? null)
            || ! $this->isSha256($target['fingerprint'] ?? null)) {
            return false;
        }

        return true;
    }

    private function validHmiHref(string $value): bool
    {
        $parts = parse_url($value);

        return strlen($value) <= 2048
            && filter_var($value, FILTER_VALIDATE_URL) !== false
            && is_array($parts)
            && in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            && is_string($parts['host'] ?? null)
            && ($parts['user'] ?? null) === null
            && ($parts['pass'] ?? null) === null
            && ($parts['query'] ?? null) === null
            && ($parts['fragment'] ?? null) === null;
    }

    /** @param list<mixed> $nodes */
    private function validSnapshotNodes(array $nodes): bool
    {
        foreach ($nodes as $node) {
            if (! is_array($node)
                || ! $this->hasExactKeys($node, ['ref', 'role', 'name', 'visible'])
                && ! $this->hasExactKeys($node, ['ref', 'role', 'name', 'href', 'visible'])
                && ! $this->hasExactKeys($node, ['ref', 'role', 'name', 'level', 'visible'])
                && ! $this->hasExactKeys($node, ['ref', 'role', 'name', 'href', 'level', 'visible'])
                || ! is_string($node['ref'] ?? null)
                || $node['ref'] === ''
                || mb_strlen($node['ref']) > 128
                || ! is_string($node['role'] ?? null)
                || mb_strlen($node['role']) > 64
                || ! is_string($node['name'] ?? null)
                || mb_strlen($node['name']) > 512
                || (array_key_exists('href', $node) && ! $this->validHmiHref((string) $node['href']))
                || (array_key_exists('href', $node) && ! is_string($node['href']))
                || (array_key_exists('level', $node) && (! is_int($node['level']) || $node['level'] < 1 || $node['level'] > 6))
                || ! is_bool($node['visible'] ?? null)) {
                return false;
            }
        }

        return true;
    }

    private function redactedPersistedUrl(string $url): string
    {
        $redacted = TalosBrowserRedactor::url($url) ?? '[redacted-url]';
        $queryPosition = strpos($redacted, '?');

        return $queryPosition === false ? $redacted : substr($redacted, 0, $queryPosition);
    }

    private function canonicalJson(mixed $value): string
    {
        return json_encode($this->canonicalValue($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    private function canonicalValue(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map(fn (mixed $item): mixed => $this->canonicalValue($item), $value);
        }
        ksort($value);
        foreach ($value as $key => $item) {
            $value[$key] = $this->canonicalValue($item);
        }

        return $value;
    }

    /**
     * @param  list<array<string, mixed>>|null  $recoveryReceipt
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
     * @param  list<array<string, mixed>>  $receipt
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
     * @param  list<array<string, mixed>>  $receipt
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
     * @param  list<array<string, mixed>>  $receipt
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
     * @param  list<array<string, mixed>>  $receipt
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
