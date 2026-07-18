<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosFile;
use App\Models\TalosRun;
use App\Models\TalosToolCall;
use App\Services\Runs\RunEventNormalizer;
use App\Services\Talos\FileAuthority\TalosFileAuthorityException;
use App\Services\Talos\FileAuthority\TalosFileAuthorityService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Kadmos\Tool\ProceduralLoopGuard;
use Throwable;

final class TalosBrowserFileUploadService
{
    /** @var list<string> */
    private const ALLOWED_ARGUMENTS = ['target', 'element', 'file_ids'];

    /** @var list<string> */
    private const ALLOWED_MIME_TYPES = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];

    public function __construct(
        private readonly BrowserSessionClient $client,
        private readonly TalosBrowserSemanticClickService $semanticTargets,
        private readonly TalosFileAuthorityService $authority,
        private readonly TalosBrowserPolicy $policy,
        private readonly TalosBrowserArtifactStore $artifacts,
    ) {}

    /**
     * @param array<string, mixed> $arguments
     * @return array<string, mixed>
     */
    public function preview(
        TalosBrowserSession $session,
        array $arguments,
        ?string $expectedSnapshotArtifactId = null,
        ?string $expectedEvidenceHash = null,
        ?string $expectedSnapshotId = null,
        ?int $expectedStateVersion = null,
    ): array {
        $fileIds = $this->assertArguments($arguments);
        if (! $session->isOperable() || ! $session->supportsBrowserOperation('upload')) {
            throw new TalosBrowserCommandException(
                'TALOS_BROWSER_CAPABILITY_DENIED',
                'Browser file upload is not available for this session.',
                status: 422,
            );
        }
        $target = $this->semanticTargets->preview(
            $session,
            array_filter([
                'target' => $arguments['target'],
                'element' => $arguments['element'] ?? null,
            ], static fn (mixed $value): bool => $value !== null),
            $expectedSnapshotArtifactId,
            $expectedEvidenceHash,
            $expectedSnapshotId,
            $expectedStateVersion,
        );
        $grantIds = $this->authority->activeGrantIdsForFiles(
            (int) $session->user_id,
            $fileIds,
            'browser.upload',
            (string) $session->talos_session_id,
        );
        $files = $this->orderedFiles((int) $session->user_id, $fileIds);

        return [
            ...$target,
            'files' => $files->map(fn (TalosFile $file): array => $this->fileMetadata($file))->all(),
            'grant_ids' => $grantIds,
        ];
    }

    /** @return array<string, mixed> */
    public function execute(
        TalosBrowserSession $session,
        TalosRun $run,
        RunEventNormalizer $normalizer,
        TalosToolCall $call,
        string $nodeId,
        int $remainingEvidenceBytes = PHP_INT_MAX,
    ): array {
        $commandId = (string) $call->provider_call_id;
        $rawCommand = ['command_id' => $commandId, 'operation' => 'upload'];
        $dispatchAttempted = false;
        $stagedIds = [];

        try {
            $this->assertCall($session, $run, $call, $nodeId);
            $arguments = is_array($call->arguments) ? $call->arguments : [];
            $sourceStateVersion = (int) $session->worker_state_version;
            $preview = $this->preview(
                $session,
                $arguments,
                (string) $call->evidence_snapshot_artifact_id,
                (string) $call->evidence_hash,
                (string) $call->evidence_snapshot_id,
                (int) $call->state_version,
            );
            $fileIds = array_values($arguments['file_ids']);
            $this->authority->authorizeFiles(
                (int) $session->user_id,
                $fileIds,
                array_values($preview['grant_ids']),
                'browser.upload',
                (string) $session->talos_session_id,
            );
            $files = $this->orderedFiles((int) $session->user_id, $fileIds);
            foreach ($files as $file) {
                $stagingPayload = $this->stagingPayload($file);
                $stageId = 'stg_'.Str::uuid();
                $stagedIds[] = $stageId;
                $staged = $this->client->stageFile(
                    TalosBrowserOwnerReference::forUser((int) $session->user_id),
                    (string) $session->worker_session_id,
                    $stageId,
                    $stagingPayload,
                );
                if (! hash_equals($stageId, (string) ($staged['stage_id'] ?? ''))) {
                    throw new BrowserWorkerException(
                        'TALOS_BROWSER_WORKER_FAILURE',
                        'Browser worker returned an unexpected staged file identity.',
                    );
                }
            }

            $this->browserEvent($session, 'command.requested', 'agent', [
                'operation' => 'upload',
                'command_id' => $commandId,
                'target_ref' => $preview['target']['ref'],
                'file_ids' => $files->modelKeys(),
                'risk' => 'sensitive',
            ]);
            $this->runEvent($run, $normalizer, 'browser.command.requested', [
                'command_id' => $commandId,
                'browser_session_id' => $session->id,
                'operation' => 'upload',
                'target_ref' => $preview['target']['ref'],
                'file_ids' => $files->modelKeys(),
                'risk' => 'sensitive',
            ]);

            $dispatchAttempted = true;
            $workerResult = $this->callWorker(
                $session,
                $call,
                [
                    'target' => $preview['target']['ref'],
                    'element' => $preview['target']['name'],
                    'staged_file_ids' => $stagedIds,
                    'snapshot_id' => $preview['snapshot_id'],
                    'state_version' => $sourceStateVersion,
                ],
            );
            $capture = $this->validatedCapture(
                $session,
                $workerResult,
                $sourceStateVersion,
                $preview['target'],
                $files,
            );
            if ($capture['evidence_bytes'] > $remainingEvidenceBytes) {
                $this->markRecovery($session, $capture['state_version']);
                throw new TalosBrowserCommandException(
                    'TALOS_BROWSER_EVIDENCE_BUDGET',
                    'Browser upload evidence exceeds the remaining evidence budget; recovery is required.',
                    status: 409,
                );
            }
            $decision = $this->policy->inspect($capture['url']);
            if (! $decision['allowed']) {
                $this->markRecovery($session, $capture['state_version']);
                throw new TalosBrowserCommandException(
                    'TALOS_BROWSER_RECOVERY_REQUIRED',
                    'The browser upload reached a destination denied by policy; recovery is required.',
                    ['reason' => $decision['reason']],
                    409,
                );
            }

            $stored = $this->persistCapture($session, $run, $normalizer, $call, $nodeId, $capture);
            $artifactIds = [(string) $stored['screenshot']->id, (string) $stored['snapshot']->id];
            $safeFiles = $files->map(fn (TalosFile $file): array => $this->fileMetadata($file))->all();
            $observation = [
                'operation' => 'upload',
                'target' => $preview['target'],
                'files' => $safeFiles,
                'url' => $capture['url'],
                'title' => $capture['title'],
                'screenshot_artifact_id' => $stored['screenshot']->id,
                'snapshot_artifact_id' => $stored['snapshot']->id,
                'untrusted' => true,
            ];
            $this->browserEvent($session, 'command.succeeded', 'worker', [
                'operation' => 'upload',
                'command_id' => $commandId,
                'target_ref' => $preview['target']['ref'],
                'file_ids' => $files->modelKeys(),
                'artifact_ids' => $artifactIds,
                'replayed' => $stored['replayed'],
            ]);
            $this->runEvent($run, $normalizer, 'browser.command.succeeded', [
                'command_id' => $commandId,
                'browser_session_id' => $session->id,
                'operation' => 'upload',
                'file_ids' => $files->modelKeys(),
                'artifact_ids' => $artifactIds,
                'worker_evidence' => $capture['worker_evidence'],
                'replayed' => $stored['replayed'],
            ]);

            return [
                'activity' => [
                    'id' => $commandId,
                    'operation' => 'upload',
                    'status' => 'succeeded',
                    'label' => 'Upload files',
                    'run_id' => $run->id,
                    'browser_session_id' => $session->id,
                    'artifact_ids' => $artifactIds,
                    'occurred_at' => now()->toJSON(),
                ],
                'observation' => $observation,
                'used_browser_context' => [
                    'browser_session_id' => $session->id,
                    'snapshot_artifact_id' => $stored['snapshot']->id,
                    'screenshot_artifact_id' => $stored['screenshot']->id,
                    'url' => $capture['url'],
                    'title' => $capture['title'],
                    'text_digest' => $capture['snapshot']['textDigest'],
                    'evidence_hash' => 'sha256:'.$stored['snapshot']->sha256,
                    'untrusted' => true,
                ],
                'worker_evidence' => $capture['worker_evidence'],
                'evidence_bytes' => $capture['evidence_bytes'],
            ];
        } catch (TalosFileAuthorityException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException(
                $exception->errorCode,
                $exception->getMessage(),
                status: $exception->status,
                origin: 'control_plane',
            ));
        } catch (TalosBrowserCommandException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, $exception);
        } catch (Throwable) {
            if ($dispatchAttempted) {
                $this->markRecovery($session, (int) $session->worker_state_version);
            }

            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException(
                $dispatchAttempted ? 'TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED' : 'TALOS_BROWSER_UPLOAD_FILE_INTEGRITY',
                $dispatchAttempted
                    ? 'The browser upload outcome could not be committed safely; recovery is required.'
                    : 'The authorized Vault file failed integrity verification before upload.',
                status: $dispatchAttempted ? 409 : 422,
                origin: 'control_plane',
            ));
        } finally {
            $cleanupFailureCodes = [];
            foreach ($stagedIds as $stageId) {
                try {
                    $this->client->discardStagedFile(
                        TalosBrowserOwnerReference::forUser((int) $session->user_id),
                        (string) $session->worker_session_id,
                        $stageId,
                    );
                } catch (Throwable $exception) {
                    $cleanupFailureCodes[] = $exception instanceof BrowserWorkerException
                        ? $exception->errorCode
                        : 'TALOS_BROWSER_WORKER_FAILURE';
                }
            }
            if ($cleanupFailureCodes !== []) {
                $this->recordStagingCleanupFailure(
                    $session,
                    $run,
                    $normalizer,
                    $commandId,
                    count($stagedIds),
                    $cleanupFailureCodes,
                );
            }
        }
    }

    /** @param list<string> $errorCodes */
    private function recordStagingCleanupFailure(
        TalosBrowserSession $session,
        TalosRun $run,
        RunEventNormalizer $normalizer,
        string $commandId,
        int $attemptedCount,
        array $errorCodes,
    ): void {
        $payload = [
            'command_id' => $commandId,
            'browser_session_id' => (string) $session->id,
            'operation' => 'upload',
            'attempted_count' => $attemptedCount,
            'failed_count' => count($errorCodes),
            'error_codes' => array_values(array_unique($errorCodes)),
            'fallback' => 'worker_ttl_and_session_disposal',
        ];

        try {
            $this->browserEvent($session, 'file_staging.cleanup.failed', 'worker', $payload);
        } catch (Throwable) {
            report(new \RuntimeException('Browser staged-file cleanup Browser telemetry could not be persisted.'));
        }
        try {
            $this->runEvent($run, $normalizer, 'browser.file_staging.cleanup.failed', $payload);
        } catch (Throwable) {
            report(new \RuntimeException('Browser staged-file cleanup run telemetry could not be persisted.'));
        }
    }

    private function assertCall(TalosBrowserSession $session, TalosRun $run, TalosToolCall $call, string $nodeId): void
    {
        $arguments = is_array($call->arguments) ? $call->arguments : [];
        if ((int) $call->user_id !== (int) $session->user_id
            || (string) $call->run_id !== (string) $run->id
            || (int) $run->user_id !== (int) $session->user_id
            || (string) $run->session_id !== (string) $session->talos_session_id
            || $run->status !== 'running'
            || $call->tool_name !== 'browser_file_upload'
            || $call->node_type !== 'TOOL_BROWSER_FILE_UPLOAD'
            || $call->capability !== 'browser.upload'
            || $call->risk !== 'critical'
            || ! hash_equals((string) $call->node_id, $nodeId)
            || ! in_array($call->approval_state, ['approved', 'claimed'], true)
            || (int) $call->approved_by_user_id !== (int) $session->user_id
            || ! is_string($call->approval_id) || $call->approval_id === ''
            || ! is_string($call->approval_payload_sha256)
            || preg_match('/^sha256:[a-f0-9]{64}$/D', $call->approval_payload_sha256) !== 1
            || ! is_string($call->execution_token) || $call->execution_token === ''
            || $call->execution_lease_expires_at === null || ! $call->execution_lease_expires_at->isFuture()
            || ! is_string($call->evidence_snapshot_artifact_id)
            || ! is_string($call->evidence_snapshot_id)
            || ! is_string($call->evidence_hash)
            || (int) $call->state_version !== (int) $session->worker_state_version
            || ! is_string($call->arguments_sha256)
            || ! hash_equals($call->arguments_sha256, 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($arguments)))) {
            throw new TalosBrowserCommandException(
                'TALOS_BROWSER_UPLOAD_APPROVAL_INVALID',
                'Browser upload is not bound to a current exact approval.',
                status: 409,
            );
        }
        $this->assertArguments($arguments);
    }

    /** @param array<string, mixed> $arguments @return list<string> */
    private function assertArguments(array $arguments): array
    {
        $fileIds = $arguments['file_ids'] ?? null;
        if (array_diff(array_keys($arguments), self::ALLOWED_ARGUMENTS) !== []
            || ! is_string($arguments['target'] ?? null)
            || preg_match('/^r[0-9]+$/D', $arguments['target']) !== 1
            || (array_key_exists('element', $arguments)
                && (! is_string($arguments['element']) || strlen($arguments['element']) > 256))
            || ! is_array($fileIds)
            || ! array_is_list($fileIds)
            || count($fileIds) < 1
            || count($fileIds) > 4
            || count(array_unique($fileIds)) !== count($fileIds)
            || array_any($fileIds, static fn (mixed $id): bool => ! is_string($id) || ! Str::isUuid($id))) {
            throw new TalosBrowserCommandException(
                'TALOS_BROWSER_COMMAND_MALFORMED',
                'Browser upload arguments are malformed.',
                status: 422,
            );
        }

        return $fileIds;
    }

    /** @param list<string> $fileIds @return Collection<int, TalosFile> */
    private function orderedFiles(int $userId, array $fileIds): Collection
    {
        $files = TalosFile::query()
            ->where('user_id', $userId)
            ->where('status', 'available')
            ->whereIn('id', $fileIds)
            ->get()
            ->keyBy('id');
        if ($files->count() !== count($fileIds)) {
            throw new TalosFileAuthorityException(
                'TALOS_FILE_GRANT_FILE_INVALID',
                'Browser upload requires owned Vault files in available status.',
                'file_ids',
            );
        }

        return new Collection(array_map(static fn (string $id): TalosFile => $files->get($id), $fileIds));
    }

    /** @return array<string, mixed> */
    private function stagingPayload(TalosFile $file): array
    {
        $metadata = $this->fileMetadata($file);
        if (! is_string($file->storage_disk) || $file->storage_disk === ''
            || ! is_string($file->storage_path) || $file->storage_path === '') {
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_FILE_INTEGRITY', 'Vault file storage metadata is invalid.', status: 422);
        }
        try {
            $bytes = Storage::disk($file->storage_disk)->get($file->storage_path);
        } catch (Throwable) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_FILE_INTEGRITY', 'Vault file bytes are unavailable.', status: 422);
        }
        if (! is_string($bytes)
            || strlen($bytes) !== $metadata['size_bytes']
            || ! hash_equals($metadata['sha256'], 'sha256:'.hash('sha256', $bytes))) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_FILE_INTEGRITY', 'Vault file bytes failed integrity verification.', status: 422);
        }

        return [...$metadata, 'base64' => base64_encode($bytes)];
    }

    /** @return array{file_id: string, name: string, mime_type: string, size_bytes: int, sha256: string} */
    private function fileMetadata(TalosFile $file): array
    {
        $name = (string) $file->original_name;
        $mime = (string) $file->mime_type;
        $size = (int) $file->size_bytes;
        $checksum = (string) $file->checksum;
        $semanticName = trim($name);
        if ($semanticName === ''
            || strlen($name) > 255
            || in_array($semanticName, ['.', '..'], true)
            || preg_match('/[\\\\\/\x00-\x1F\x7F]/', $name) === 1
            || ! in_array($mime, self::ALLOWED_MIME_TYPES, true)
            || $size < 1
            || $size > 10 * 1024 * 1024
            || preg_match('/^[a-f0-9]{64}$/D', $checksum) !== 1) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_FILE_UNSUPPORTED', 'Vault file is not eligible for Browser upload.', status: 422);
        }

        return [
            'file_id' => (string) $file->id,
            'name' => $name,
            'mime_type' => $mime,
            'size_bytes' => $size,
            'sha256' => 'sha256:'.$checksum,
        ];
    }

    /** @param array<string, mixed> $arguments */
    private function callWorker(TalosBrowserSession $session, TalosToolCall $call, array $arguments): BrowserToolResult
    {
        try {
            $result = $this->client->callTool(
                TalosBrowserOwnerReference::forUser((int) $session->user_id),
                (string) $session->worker_session_id,
                (string) $call->provider_call_id,
                'browser_file_upload',
                $arguments,
                authorization: BrowserActionAuthorization::userApproval(
                    (string) $call->provider_call_id,
                    (string) $call->approval_id,
                    (string) $call->approval_payload_sha256,
                    (string) $call->execution_token,
                ),
            );
        } catch (BrowserWorkerException $exception) {
            $this->markRecovery($session, (int) $session->worker_state_version);
            throw new TalosBrowserCommandException(
                'TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED',
                'The browser worker did not return a replayable upload outcome; recovery is required.',
                ['worker_code' => $exception->errorCode],
                409,
                'browser_worker',
            );
        }
        if (! $result->isError) {
            return $result;
        }
        $structured = $result->structuredContent ?? [];
        $code = is_string($structured['code'] ?? null) && preg_match('/^TALOS_BROWSER_[A-Z0-9_]{1,96}$/D', $structured['code']) === 1
            ? $structured['code']
            : 'TALOS_BROWSER_WORKER_FAILURE';
        $message = is_string($structured['message'] ?? null) && trim($structured['message']) !== ''
            ? mb_substr(trim($structured['message']), 0, 512)
            : 'Browser worker failed to complete the file upload.';
        if (str_contains($code, 'RECOVERY_REQUIRED')) {
            $this->markRecovery($session, is_int($structured['state_version'] ?? null) ? $structured['state_version'] : (int) $session->worker_state_version);
        }

        throw new TalosBrowserCommandException($code, $message, status: str_contains($code, 'RECOVERY_REQUIRED') ? 409 : 422, origin: 'browser_worker');
    }

    /**
     * @param array<string, mixed> $ownedTarget
     * @param Collection<int, TalosFile> $files
     * @return array<string, mixed>
     */
    private function validatedCapture(
        TalosBrowserSession $session,
        BrowserToolResult $result,
        int $sourceStateVersion,
        array $ownedTarget,
        Collection $files,
    ): array {
        $structured = $result->structuredContent;
        $expectedFiles = $files->map(fn (TalosFile $file): array => $this->fileMetadata($file))->all();
        if (! is_array($structured)
            || ! is_int($structured['state_version'] ?? null)
            || $structured['state_version'] !== $sourceStateVersion + 1
            || ! is_string($structured['url'] ?? null) || trim($structured['url']) === '' || strlen($structured['url']) > 2048
            || ! is_string($structured['title'] ?? null) || strlen($structured['title']) > 512
            || ! is_array($structured['target'] ?? null)
            || ($structured['target']['ref'] ?? null) !== $ownedTarget['ref']
            || ($structured['target']['role'] ?? null) !== $ownedTarget['role']
            || ($structured['target']['name'] ?? null) !== $ownedTarget['name']
            || ($structured['files'] ?? null) !== $expectedFiles) {
            $this->markRecovery($session, is_int($structured['state_version'] ?? null) ? $structured['state_version'] : $sourceStateVersion);
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload result binding is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }

        $image = collect($result->content)->first(static fn (mixed $block): bool => is_array($block)
            && ($block['type'] ?? null) === 'image'
            && ($block['mimeType'] ?? null) === 'image/png');
        $screenshotBytes = is_array($image) && is_string($image['data'] ?? null) ? base64_decode($image['data'], true) : false;
        $screenshot = $structured['screenshot'] ?? null;
        if (! is_string($screenshotBytes) || $screenshotBytes === ''
            || strlen($screenshotBytes) > TalosBrowserArtifactStore::MAX_SCREENSHOT_BYTES
            || ! is_array($screenshot)
            || ($screenshot['mime_type'] ?? null) !== 'image/png'
            || ($screenshot['width'] ?? null) !== (int) $session->viewport_width
            || ($screenshot['height'] ?? null) !== (int) $session->viewport_height
            || ($screenshot['sha256'] ?? null) !== 'sha256:'.hash('sha256', $screenshotBytes)) {
            $this->markRecovery($session, $structured['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload screenshot evidence is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }
        $snapshot = $structured['snapshot'] ?? null;
        if (! is_array($snapshot)
            || ($snapshot['format'] ?? null) !== 'accessibility_refs_v1'
            || ! is_string($snapshot['snapshot_id'] ?? null)
            || preg_match('/^snap_[A-Za-z0-9-]+$/D', $snapshot['snapshot_id']) !== 1
            || ! is_string($snapshot['text_digest'] ?? null) || strlen($snapshot['text_digest']) > 4000
            || ! is_array($snapshot['nodes'] ?? null) || ! array_is_list($snapshot['nodes']) || count($snapshot['nodes']) > 200
            || ! is_string($snapshot['sha256'] ?? null)) {
            $this->markRecovery($session, $structured['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload snapshot evidence is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }
        $workerSnapshot = [
            'snapshot_id' => $snapshot['snapshot_id'],
            'format' => 'accessibility_refs_v1',
            'text_digest' => $snapshot['text_digest'],
            'nodes' => $snapshot['nodes'],
        ];
        $workerSnapshotJson = json_encode($workerSnapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if ($snapshot['sha256'] !== 'sha256:'.hash('sha256', $workerSnapshotJson)) {
            $this->markRecovery($session, $structured['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload snapshot digest is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }
        $safeSnapshot = $this->safeSnapshot($snapshot, $structured['url'], $structured['title']);
        $snapshotJson = json_encode($safeSnapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $workerEvidence = [
            ...$this->verifiedWorkerEvidence($session, $structured['state_version'], $result, 'screenshot', $screenshot['sha256']),
            ...$this->verifiedWorkerEvidence($session, $structured['state_version'], $result, 'snapshot', $snapshot['sha256']),
        ];

        return [
            'source_state_version' => $sourceStateVersion,
            'state_version' => $structured['state_version'],
            'url' => TalosBrowserRedactor::url($structured['url']) ?? '[redacted-url]',
            'title' => $structured['title'],
            'target' => $ownedTarget,
            'files' => $expectedFiles,
            'screenshot_bytes' => $screenshotBytes,
            'width' => $screenshot['width'],
            'height' => $screenshot['height'],
            'snapshot' => $safeSnapshot,
            'snapshot_json' => $snapshotJson,
            'worker_evidence' => $workerEvidence,
            'evidence_bytes' => strlen($screenshotBytes) + strlen($snapshotJson),
        ];
    }

    /** @param array<string, mixed> $snapshot @return array<string, mixed> */
    private function safeSnapshot(array $snapshot, string $url, string $title): array
    {
        $nodes = [];
        foreach (array_slice($snapshot['nodes'], 0, 120) as $node) {
            if (! is_array($node)
                || ! is_string($node['ref'] ?? null)
                || ! is_string($node['role'] ?? null)
                || ! is_string($node['name'] ?? null)
                || ! is_bool($node['visible'] ?? null)) {
                continue;
            }
            $safe = [
                'ref' => mb_substr($node['ref'], 0, 128),
                'role' => mb_substr($node['role'], 0, 128),
                'name' => mb_substr($node['name'], 0, 512),
                'visible' => $node['visible'],
            ];
            if (is_string($node['href'] ?? null)) {
                $safe['href'] = TalosBrowserRedactor::url(mb_substr($node['href'], 0, 2048));
            }
            $nodes[] = array_filter($safe, static fn (mixed $value): bool => $value !== null);
        }

        return [
            'format' => 'accessibility_refs_v1',
            'snapshotId' => $snapshot['snapshot_id'],
            'url' => TalosBrowserRedactor::url(mb_substr($url, 0, 2048)) ?? '[redacted-url]',
            'title' => mb_substr($title, 0, 512),
            'textDigest' => mb_substr($snapshot['text_digest'], 0, 4000),
            'nodes' => $nodes,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function verifiedWorkerEvidence(
        TalosBrowserSession $session,
        int $stateVersion,
        BrowserToolResult $result,
        string $kind,
        string $expectedHash,
    ): array {
        $ids = is_array($result->structuredContent['evidence_ids'] ?? null) ? $result->structuredContent['evidence_ids'] : [];
        $matches = array_values(array_filter($result->evidence, static fn (mixed $item): bool => is_array($item)
            && ($item['kind'] ?? null) === $kind
            && ($item['sha256'] ?? null) === $expectedHash
            && is_string($item['artifact_id'] ?? null)
            && in_array($item['artifact_id'], $ids, true)
            && is_string($item['trusted_boundary'] ?? null)));
        if (count($matches) !== 1) {
            $this->markRecovery($session, $stateVersion);
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload worker evidence is incomplete; recovery is required.', status: 409, origin: 'browser_worker');
        }

        return $matches;
    }

    /** @param array<string, mixed> $capture @return array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact, replayed: bool} */
    private function persistCapture(
        TalosBrowserSession $session,
        TalosRun $run,
        RunEventNormalizer $normalizer,
        TalosToolCall $call,
        string $nodeId,
        array $capture,
    ): array {
        $commandId = (string) $call->provider_call_id;
        $existing = TalosBrowserArtifact::query()
            ->where('browser_session_id', $session->id)
            ->where('user_id', $session->user_id)
            ->where('source_command_id', $commandId)
            ->get();
        if ($existing->isNotEmpty()) {
            return $this->replayedCapture($session, $capture, $existing->all());
        }

        $created = [];
        try {
            $stored = DB::transaction(function () use ($session, $run, $normalizer, $commandId, $nodeId, $capture, &$created): array {
                $lease = TalosBrowserSession::query()
                    ->whereKey($session->id)
                    ->where('user_id', $session->user_id)
                    ->where('talos_session_id', $session->talos_session_id)
                    ->lockForUpdate()
                    ->first();
                if (! $lease instanceof TalosBrowserSession
                    || (int) $lease->worker_state_version !== $capture['source_state_version']) {
                    throw new \RuntimeException('Browser upload capture was superseded by newer state.');
                }
                $provenance = [
                    'source_command_id' => $commandId,
                    'source_state_version' => $capture['source_state_version'],
                    'state_version' => $capture['state_version'],
                    'trust_boundary' => 'untrusted_browser_content',
                ];
                $metadata = [
                    'source_command_id' => $commandId,
                    'source_node_id' => $nodeId,
                    'source_state_version' => $capture['source_state_version'],
                    'state_version' => $capture['state_version'],
                    'url' => $capture['url'],
                    'title' => $capture['title'],
                    'target' => $capture['target'],
                    'files' => $capture['files'],
                    'worker_evidence' => $capture['worker_evidence'],
                ];
                $screenshot = $this->artifacts->store(
                    $lease,
                    'screenshot',
                    'image/png',
                    $capture['screenshot_bytes'],
                    [...$metadata, 'width' => $capture['width'], 'height' => $capture['height']],
                    $provenance,
                );
                $created[] = $screenshot;
                $snapshot = $this->artifacts->store(
                    $lease,
                    'snapshot',
                    'application/json',
                    $capture['snapshot_json'],
                    [...$metadata, 'format' => 'accessibility_refs_v1', 'text_digest' => $capture['snapshot']['textDigest'], 'node_count' => count($capture['snapshot']['nodes'])],
                    $provenance,
                );
                $created[] = $snapshot;
                foreach ([$screenshot, $snapshot] as $artifact) {
                    $run->artifacts()->firstOrCreate(
                        ['uri' => 'talos-browser-artifact://'.$artifact->id],
                        [
                            'artifact_type' => 'browser_'.$artifact->type,
                            'mime_type' => $artifact->mime,
                            'metadata' => [
                                'browser_artifact_id' => $artifact->id,
                                'browser_session_id' => $lease->id,
                                'sha256' => $artifact->sha256,
                                'trust' => 'untrusted',
                                'source_command_id' => $commandId,
                                'source_node_id' => $nodeId,
                            ],
                        ],
                    );
                }
                $lease->forceFill([
                    'worker_state_version' => $capture['state_version'],
                    'last_screenshot_artifact_id' => $screenshot->id,
                    'last_snapshot_artifact_id' => $snapshot->id,
                    'current_url' => $capture['url'],
                    'current_title' => $capture['title'],
                    'status' => 'active',
                    'last_seen_at' => now(),
                ])->save();
                $this->runEvent($run, $normalizer, 'browser.artifact.created', [
                    'browser_session_id' => $lease->id,
                    'artifact_ids' => [(string) $screenshot->id, (string) $snapshot->id],
                    'source_command_id' => $commandId,
                ]);

                return compact('screenshot', 'snapshot');
            });
        } catch (Throwable) {
            foreach (array_reverse($created) as $artifact) {
                try {
                    $this->artifacts->discard($artifact);
                } catch (Throwable) {
                    // Recovery remains authoritative if compensating cleanup also fails.
                }
            }
            $this->markRecovery($session, $capture['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload evidence could not be committed atomically; recovery is required.', status: 409);
        }
        $session->refresh();

        return [...$stored, 'replayed' => false];
    }

    /** @param array<string, mixed> $capture @param list<TalosBrowserArtifact> $artifacts @return array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact, replayed: bool} */
    private function replayedCapture(TalosBrowserSession $session, array $capture, array $artifacts): array
    {
        $byType = [];
        foreach ($artifacts as $artifact) {
            if (isset($byType[$artifact->type])) {
                throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload replay evidence is duplicated.', status: 409);
            }
            $byType[$artifact->type] = $artifact;
        }
        $screenshot = $byType['screenshot'] ?? null;
        $snapshot = $byType['snapshot'] ?? null;
        if (! $screenshot instanceof TalosBrowserArtifact
            || ! $snapshot instanceof TalosBrowserArtifact
            || (int) $session->worker_state_version !== $capture['state_version']
            || (int) $screenshot->source_state_version !== $capture['source_state_version']
            || (int) $snapshot->source_state_version !== $capture['source_state_version']
            || ! hash_equals((string) $screenshot->sha256, hash('sha256', $capture['screenshot_bytes']))
            || ! hash_equals((string) $snapshot->sha256, hash('sha256', $capture['snapshot_json']))) {
            $this->markRecovery($session, $capture['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED', 'Browser upload replay evidence is incomplete or stale.', status: 409);
        }

        return compact('screenshot', 'snapshot') + ['replayed' => true];
    }

    private function markRecovery(TalosBrowserSession $session, int $stateVersion): void
    {
        TalosBrowserSession::query()
            ->whereKey($session->id)
            ->where('user_id', $session->user_id)
            ->update([
                'status' => 'recovery_required',
                'worker_state_version' => max((int) $session->worker_state_version, $stateVersion),
                'last_seen_at' => now(),
            ]);
        $session->refresh();
    }

    /** @param array<string, mixed> $payload */
    private function browserEvent(TalosBrowserSession $session, string $type, string $actor, array $payload): void
    {
        $session->events()->create([
            'browser_session_id' => $session->id,
            'user_id' => $session->user_id,
            'type' => $type,
            'actor' => $actor,
            'url_before' => $payload['url_before'] ?? null,
            'url_after' => $payload['url_after'] ?? null,
            'payload' => $payload,
            'policy_decision' => $payload['policy_decision'] ?? null,
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function runEvent(TalosRun $run, RunEventNormalizer $normalizer, string $type, array $payload): void
    {
        $run->events()->create([
            ...$normalizer->normalize([
                'event_type' => $type,
                'severity' => str_ends_with($type, 'failed') ? 'error' : 'info',
                'payload' => $payload,
            ]),
            'sequence' => ((int) $run->events()->max('sequence')) + 1,
            'occurred_at' => now(),
        ]);
    }

    /** @param array<string, mixed> $rawCommand @return array<string, mixed> */
    private function failed(
        TalosBrowserSession $session,
        TalosRun $run,
        RunEventNormalizer $normalizer,
        array $rawCommand,
        TalosBrowserCommandException $exception,
    ): array {
        $commandId = is_string($rawCommand['command_id'] ?? null) ? $rawCommand['command_id'] : 'unknown';
        $this->browserEvent($session, 'command.failed', 'policy', [
            'operation' => 'upload',
            'command_id' => $commandId,
            'reason' => $exception->getMessage(),
        ]);
        $this->runEvent($run, $normalizer, 'browser.command.failed', [
            'command_id' => $commandId,
            'browser_session_id' => $session->id,
            'operation' => 'upload',
            'error_code' => $exception->errorCode,
            'message' => $exception->getMessage(),
            'details' => $exception->details,
            'origin' => $exception->origin,
        ]);

        return [
            'error' => [
                'code' => $exception->errorCode,
                'message' => $exception->getMessage(),
                'details' => $exception->details,
                'status' => $exception->status,
                'origin' => $exception->origin,
            ],
            'activity' => [
                'id' => $commandId,
                'operation' => 'upload',
                'status' => 'failed',
                'label' => 'Upload files',
                'run_id' => $run->id,
                'browser_session_id' => $session->id,
                'artifact_ids' => [],
                'occurred_at' => now()->toJSON(),
            ],
        ];
    }

}
