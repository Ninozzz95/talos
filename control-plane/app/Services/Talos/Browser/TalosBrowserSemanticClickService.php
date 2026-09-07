<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\TalosRun;
use App\Services\Runs\RunEventNormalizer;
use Illuminate\Support\Facades\DB;
use Throwable;

final class TalosBrowserSemanticClickService
{
    /** @var list<string> */
    private const ALLOWED_ARGUMENTS = ['target', 'element'];

    /** @var list<string> */
    private const CLICKABLE_ROLES = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'combobox', 'switch'];

    public function __construct(
        private readonly BrowserSessionClient $client,
        private readonly TalosBrowserPolicy $policy,
        private readonly TalosBrowserArtifactStore $artifacts,
        private readonly TalosBrowserArtifactReader $artifactReader,
        private readonly TalosBrowserLegacyWriteGate $legacyWrites,
    ) {}

    /**
     * @param  array<string, mixed>  $arguments
     * @return array{target: array{ref: string, role: string, name: string, visible: bool}, snapshot_id: string, state_version: int, url: string|null, title: string|null}
     */
    public function preview(
        TalosBrowserSession $session,
        array $arguments,
        ?string $expectedSnapshotArtifactId = null,
        ?string $expectedEvidenceHash = null,
        ?string $expectedSnapshotId = null,
        ?int $expectedStateVersion = null,
    ): array {
        if (! $session->isOperable() || ! $session->supportsBrowserOperation('interact')) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_CAPABILITY_DENIED', 'Semantic browser interaction is not available for this session.', status: 422);
        }
        $this->assertArguments($arguments);
        $source = $this->ownedSnapshot(
            $session,
            $expectedSnapshotArtifactId,
            $expectedEvidenceHash,
            $expectedSnapshotId,
            $expectedStateVersion,
        );
        $target = $this->ownedTarget($source['snapshot'], (string) $arguments['target']);

        return [
            'target' => $target,
            'snapshot_artifact_id' => (string) $source['artifact']->id,
            'snapshot_id' => (string) $source['snapshot']['snapshotId'],
            'evidence_hash' => 'sha256:'.$source['artifact']->sha256,
            'state_version' => (int) ($source['artifact']->state_version ?? $session->worker_state_version),
            'url' => is_string($source['snapshot']['url'] ?? null) ? $source['snapshot']['url'] : $session->current_url,
            'title' => is_string($source['snapshot']['title'] ?? null) ? $source['snapshot']['title'] : $session->current_title,
        ];
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    public function execute(
        TalosBrowserSession $session,
        TalosRun $run,
        RunEventNormalizer $normalizer,
        string $commandId,
        string $nodeId,
        array $arguments,
        int $remainingEvidenceBytes = PHP_INT_MAX,
        ?string $expectedSnapshotArtifactId = null,
        ?string $expectedEvidenceHash = null,
        ?string $expectedSnapshotId = null,
        ?int $expectedStateVersion = null,
    ): array {
        $this->legacyWrites->assertEnabled('browser.semantic_click.execute');

        $rawCommand = ['command_id' => $commandId, 'operation' => 'click'];

        try {
            $this->assertCommand($session, $run, $commandId, $nodeId, $arguments);
            $sourceStateVersion = (int) $session->worker_state_version;
            $source = $this->ownedSnapshot(
                $session,
                $expectedSnapshotArtifactId,
                $expectedEvidenceHash,
                $expectedSnapshotId,
                $expectedStateVersion,
            );
            $target = $this->ownedTarget($source['snapshot'], (string) $arguments['target']);

            $this->browserEvent($session, 'command.requested', 'agent', [
                'operation' => 'click',
                'command_id' => $commandId,
                'target_ref' => $target['ref'],
                'risk' => 'high',
            ]);
            $this->runEvent($run, $normalizer, 'browser.command.requested', [
                'command_id' => $commandId,
                'browser_session_id' => $session->id,
                'operation' => 'click',
                'target_ref' => $target['ref'],
                'risk' => 'high',
            ]);

            $workerResult = $this->callWorker(
                $session,
                $commandId,
                [
                    'target' => $target['ref'],
                    'element' => $target['name'],
                    'snapshot_id' => $source['snapshot']['snapshotId'],
                    'state_version' => $sourceStateVersion,
                ],
            );
            $capture = $this->validatedCapture($session, $workerResult, $sourceStateVersion, $target);
            if ($capture['evidence_bytes'] > $remainingEvidenceBytes) {
                $this->markRecovery($session, $capture['state_version']);
                throw new TalosBrowserCommandException(
                    'TALOS_BROWSER_EVIDENCE_BUDGET',
                    'Browser click evidence exceeds the remaining evidence budget; recovery is required.',
                    status: 409,
                    origin: 'control_plane',
                );
            }

            $decision = $this->policy->inspect($capture['url']);
            if (! $decision['allowed']) {
                $this->markRecovery($session, $capture['state_version']);
                throw new TalosBrowserCommandException(
                    'TALOS_BROWSER_RECOVERY_REQUIRED',
                    'The browser click reached a destination denied by policy; recovery is required.',
                    ['reason' => $decision['reason']],
                    409,
                );
            }

            $stored = $this->persistCapture(
                $session,
                $run,
                $normalizer,
                $commandId,
                $nodeId,
                $capture,
            );
            $artifactIds = [(string) $stored['screenshot']->id, (string) $stored['snapshot']->id];
            $observation = [
                'operation' => 'click',
                'target' => $target,
                'url' => $capture['url'],
                'title' => $capture['title'],
                'screenshot_artifact_id' => $stored['screenshot']->id,
                'snapshot_artifact_id' => $stored['snapshot']->id,
                'untrusted' => true,
            ];

            $this->browserEvent($session, 'command.succeeded', 'worker', [
                'operation' => 'click',
                'command_id' => $commandId,
                'target_ref' => $target['ref'],
                'artifact_ids' => $artifactIds,
                'replayed' => $stored['replayed'],
            ]);
            $this->runEvent($run, $normalizer, 'browser.command.succeeded', [
                'command_id' => $commandId,
                'browser_session_id' => $session->id,
                'operation' => 'click',
                'artifact_ids' => $artifactIds,
                'worker_evidence' => $capture['worker_evidence'],
                'replayed' => $stored['replayed'],
            ]);

            return [
                'activity' => [
                    'id' => $commandId,
                    'operation' => 'click',
                    'status' => 'succeeded',
                    'label' => 'Click',
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
        } catch (TalosBrowserCommandException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, $exception);
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException(
                'TALOS_BROWSER_RECOVERY_REQUIRED',
                'Browser snapshot integrity verification failed; recovery is required.',
                ['artifact_id' => $exception->artifactId, 'reason' => $exception->reason],
                409,
            ));
        } catch (Throwable) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException(
                'TALOS_BROWSER_CLICK_RECOVERY_REQUIRED',
                'The browser click outcome could not be committed safely; recovery is required.',
                status: 409,
            ));
        }
    }

    /** @param array<string, mixed> $arguments */
    private function assertCommand(TalosBrowserSession $session, TalosRun $run, string $commandId, string $nodeId, array $arguments): void
    {
        if (! $session->isOperable() || ! $session->supportsBrowserOperation('interact')) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_CAPABILITY_DENIED', 'Semantic browser interaction is not available for this session.', status: 422);
        }
        if ($run->status !== 'running') {
            throw new TalosBrowserCommandException('TALOS_BROWSER_RUN_INACTIVE', 'The owning run is no longer active.', status: 409);
        }
        if (preg_match('/^[A-Za-z0-9._:-]{1,128}$/', $commandId) !== 1
            || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $nodeId) !== 1) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_COMMAND_MALFORMED', 'Browser click identity is malformed.', status: 422);
        }
        $this->assertArguments($arguments);
    }

    /** @param array<string, mixed> $arguments */
    private function assertArguments(array $arguments): void
    {
        if (array_diff(array_keys($arguments), self::ALLOWED_ARGUMENTS) !== []
            || ! is_string($arguments['target'] ?? null)
            || preg_match('/^r[0-9]+$/', $arguments['target']) !== 1
            || (array_key_exists('element', $arguments) && (! is_string($arguments['element']) || strlen($arguments['element']) > 512))) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_COMMAND_MALFORMED', 'Browser click arguments are malformed.', status: 422);
        }
    }

    /** @return array{artifact: TalosBrowserArtifact, snapshot: array<string, mixed>} */
    private function ownedSnapshot(
        TalosBrowserSession $session,
        ?string $expectedSnapshotArtifactId = null,
        ?string $expectedEvidenceHash = null,
        ?string $expectedSnapshotId = null,
        ?int $expectedStateVersion = null,
    ): array {
        $artifactId = $expectedSnapshotArtifactId ?? $session->last_snapshot_artifact_id;
        if ($expectedSnapshotArtifactId !== null
            && (string) $session->last_snapshot_artifact_id !== $expectedSnapshotArtifactId) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_EVIDENCE', 'The approved Browser snapshot is no longer current.', status: 409);
        }
        $artifact = TalosBrowserArtifact::query()
            ->whereKey($artifactId)
            ->where('browser_session_id', $session->id)
            ->where('user_id', $session->user_id)
            ->where('type', 'snapshot')
            ->first();
        if (! $artifact instanceof TalosBrowserArtifact) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_EVIDENCE', 'A current owned browser snapshot is required before clicking.', status: 409);
        }

        try {
            $snapshot = json_decode($this->artifactReader->read($artifact), true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_ARTIFACT_INVALID', 'Browser snapshot evidence is invalid.', status: 502);
        }
        if (! is_array($snapshot)
            || ($snapshot['format'] ?? null) !== 'accessibility_refs_v1'
            || ! is_string($snapshot['snapshotId'] ?? null)
            || preg_match('/^snap_[A-Za-z0-9-]+$/', $snapshot['snapshotId']) !== 1
            || ! is_array($snapshot['nodes'] ?? null)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_ARTIFACT_INVALID', 'Browser snapshot evidence is invalid.', status: 502);
        }
        $actualEvidenceHash = is_string($artifact->sha256) ? 'sha256:'.$artifact->sha256 : null;
        if (($expectedEvidenceHash !== null && (! is_string($actualEvidenceHash) || ! hash_equals($expectedEvidenceHash, $actualEvidenceHash)))
            || ($expectedSnapshotId !== null && ! hash_equals($expectedSnapshotId, $snapshot['snapshotId']))
            || ($expectedStateVersion !== null
                && ((int) $session->worker_state_version !== $expectedStateVersion
                    || (int) $artifact->state_version !== $expectedStateVersion))) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_EVIDENCE', 'The Browser snapshot no longer matches the approved evidence binding.', status: 409);
        }

        return compact('artifact', 'snapshot');
    }

    /** @param array<string, mixed> $snapshot @return array{ref: string, role: string, name: string, visible: bool} */
    private function ownedTarget(array $snapshot, string $ref): array
    {
        foreach ($snapshot['nodes'] as $node) {
            if (! is_array($node) || ($node['ref'] ?? null) !== $ref) {
                continue;
            }
            if (! is_string($node['role'] ?? null)
                || ! in_array(mb_strtolower($node['role']), self::CLICKABLE_ROLES, true)
                || ! is_string($node['name'] ?? null)
                || strlen($node['name']) > 512
                || ($node['visible'] ?? null) !== true) {
                throw new TalosBrowserCommandException('TALOS_BROWSER_UNSUPPORTED_TARGET', 'The owned browser ref is not an actionable visible target.', status: 422);
            }

            return [
                'ref' => $ref,
                'role' => mb_strtolower($node['role']),
                'name' => $node['name'],
                'visible' => true,
            ];
        }

        throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_REF', 'The requested browser ref is missing from the owned snapshot.', status: 409);
    }

    /** @param array<string, mixed> $arguments */
    private function callWorker(TalosBrowserSession $session, string $commandId, array $arguments): BrowserToolResult
    {
        try {
            $result = $this->client->callTool(
                TalosBrowserOwnerReference::forUser((int) $session->user_id),
                (string) $session->worker_session_id,
                $commandId,
                'browser_click',
                $arguments,
                authorization: BrowserActionAuthorization::policy($commandId),
            );
        } catch (BrowserWorkerException $exception) {
            $this->markRecovery($session, (int) $session->worker_state_version);
            throw new TalosBrowserCommandException(
                'TALOS_BROWSER_CLICK_RECOVERY_REQUIRED',
                'The browser worker did not return a replayable click outcome; recovery is required.',
                ['worker_code' => $exception->errorCode],
                409,
                'browser_worker',
            );
        }

        if (! $result->isError) {
            return $result;
        }
        $structured = $result->structuredContent ?? [];
        $code = is_string($structured['code'] ?? null) && preg_match('/^TALOS_BROWSER_[A-Z0-9_]{1,96}$/', $structured['code']) === 1
            ? $structured['code']
            : 'TALOS_BROWSER_WORKER_FAILURE';
        $message = is_string($structured['message'] ?? null) && trim($structured['message']) !== ''
            ? mb_substr(trim($structured['message']), 0, 512)
            : 'Browser worker failed to complete the semantic click.';
        if (str_contains($code, 'RECOVERY_REQUIRED')) {
            $stateVersion = is_int($structured['state_version'] ?? null)
                ? $structured['state_version']
                : (int) $session->worker_state_version;
            $this->markRecovery($session, $stateVersion);
        }

        throw new TalosBrowserCommandException($code, $message, status: str_contains($code, 'RECOVERY_REQUIRED') ? 409 : 422, origin: 'browser_worker');
    }

    /**
     * @param  array{ref: string, role: string, name: string, visible: bool}  $ownedTarget
     * @return array{source_state_version: int, state_version: int, url: string, title: string, target: array<string, mixed>, screenshot_bytes: string, screenshot_sha256: string, width: int, height: int, snapshot: array<string, mixed>, snapshot_json: string, snapshot_sha256: string, worker_evidence: list<array<string, mixed>>, evidence_bytes: int}
     */
    private function validatedCapture(TalosBrowserSession $session, BrowserToolResult $result, int $sourceStateVersion, array $ownedTarget): array
    {
        $structured = $result->structuredContent;
        if (! is_array($structured)
            || ! is_int($structured['state_version'] ?? null)
            || $structured['state_version'] !== $sourceStateVersion + 1
            || ! is_string($structured['url'] ?? null)
            || trim($structured['url']) === ''
            || strlen($structured['url']) > 2048
            || ! is_string($structured['title'] ?? null)
            || strlen($structured['title']) > 512
            || ! is_array($structured['target'] ?? null)
            || ($structured['target']['ref'] ?? null) !== $ownedTarget['ref']
            || ($structured['target']['role'] ?? null) !== $ownedTarget['role']
            || ($structured['target']['name'] ?? null) !== $ownedTarget['name']) {
            $this->markRecovery($session, is_int($structured['state_version'] ?? null) ? $structured['state_version'] : $sourceStateVersion);
            throw new TalosBrowserCommandException('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', 'Browser click result binding is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }

        $image = collect($result->content)->first(static fn (mixed $block): bool => is_array($block)
            && ($block['type'] ?? null) === 'image'
            && ($block['mimeType'] ?? null) === 'image/png');
        $screenshotBytes = is_array($image) && is_string($image['data'] ?? null)
            ? base64_decode($image['data'], true)
            : false;
        $screenshot = $structured['screenshot'] ?? null;
        if (! is_string($screenshotBytes)
            || $screenshotBytes === ''
            || strlen($screenshotBytes) > TalosBrowserArtifactStore::MAX_SCREENSHOT_BYTES
            || ! is_array($screenshot)
            || ($screenshot['mime_type'] ?? null) !== 'image/png'
            || ($screenshot['width'] ?? null) !== (int) $session->viewport_width
            || ($screenshot['height'] ?? null) !== (int) $session->viewport_height
            || ($screenshot['sha256'] ?? null) !== 'sha256:'.hash('sha256', $screenshotBytes)) {
            $this->markRecovery($session, $structured['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', 'Browser click screenshot evidence is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }

        $snapshot = $structured['snapshot'] ?? null;
        if (! is_array($snapshot)
            || ($snapshot['format'] ?? null) !== 'accessibility_refs_v1'
            || ! is_string($snapshot['snapshot_id'] ?? null)
            || preg_match('/^snap_[A-Za-z0-9-]+$/', $snapshot['snapshot_id']) !== 1
            || ! is_string($snapshot['text_digest'] ?? null)
            || strlen($snapshot['text_digest']) > 4000
            || ! is_array($snapshot['nodes'] ?? null)
            || count($snapshot['nodes']) > 200
            || ! is_string($snapshot['sha256'] ?? null)) {
            $this->markRecovery($session, $structured['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', 'Browser click snapshot evidence is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }
        if ($snapshot['sha256'] !== TalosBrowserSnapshotEvidence::sha256(
            snapshotId: $snapshot['snapshot_id'],
            format: 'accessibility_refs_v1',
            textDigest: $snapshot['text_digest'],
            nodes: $snapshot['nodes'],
        )) {
            $this->markRecovery($session, $structured['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', 'Browser click snapshot digest is invalid; recovery is required.', status: 409, origin: 'browser_worker');
        }
        $safeSnapshot = $this->safeSnapshot([
            'format' => 'accessibility_refs_v1',
            'snapshotId' => $snapshot['snapshot_id'],
            'textDigest' => $snapshot['text_digest'],
            'nodes' => $snapshot['nodes'],
            'url' => $structured['url'],
            'title' => $structured['title'],
        ]);
        $snapshotJson = json_encode($safeSnapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $screenshotEvidence = $this->verifiedWorkerEvidence($session, $structured['state_version'], $result, 'screenshot', $screenshot['sha256']);
        $snapshotEvidence = $this->verifiedWorkerEvidence($session, $structured['state_version'], $result, 'snapshot', $snapshot['sha256']);

        return [
            'source_state_version' => $sourceStateVersion,
            'state_version' => $structured['state_version'],
            'url' => TalosBrowserRedactor::url($structured['url']) ?? '[redacted-url]',
            'title' => $structured['title'],
            'target' => $ownedTarget,
            'screenshot_bytes' => $screenshotBytes,
            'screenshot_sha256' => $screenshot['sha256'],
            'width' => $screenshot['width'],
            'height' => $screenshot['height'],
            'snapshot' => $safeSnapshot,
            'snapshot_json' => $snapshotJson,
            'snapshot_sha256' => 'sha256:'.hash('sha256', $snapshotJson),
            'worker_evidence' => [...$screenshotEvidence, ...$snapshotEvidence],
            'evidence_bytes' => strlen($screenshotBytes) + strlen($snapshotJson),
        ];
    }

    /** @param array<string, mixed> $raw @return array{format: string, snapshotId: string, url: string, title: string, textDigest: string, nodes: list<array<string, mixed>>} */
    private function safeSnapshot(array $raw): array
    {
        $nodes = [];
        foreach (array_slice($raw['nodes'], 0, 120) as $node) {
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
            if (is_int($node['level'] ?? null) && $node['level'] >= 1 && $node['level'] <= 6) {
                $safe['level'] = $node['level'];
            }
            $nodes[] = array_filter($safe, static fn (mixed $value): bool => $value !== null);
        }

        return [
            'format' => 'accessibility_refs_v1',
            'snapshotId' => $raw['snapshotId'],
            'url' => TalosBrowserRedactor::url(mb_substr($raw['url'], 0, 2048)) ?? '[redacted-url]',
            'title' => mb_substr($raw['title'], 0, 512),
            'textDigest' => mb_substr($raw['textDigest'], 0, 4000),
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
        $ids = is_array($result->structuredContent['evidence_ids'] ?? null)
            ? $result->structuredContent['evidence_ids']
            : [];
        $matches = array_values(array_filter($result->evidence, static fn (mixed $item): bool => is_array($item)
            && ($item['kind'] ?? null) === $kind
            && ($item['sha256'] ?? null) === $expectedHash
            && is_string($item['artifact_id'] ?? null)
            && in_array($item['artifact_id'], $ids, true)
            && is_string($item['trusted_boundary'] ?? null)));
        if (count($matches) !== 1) {
            $this->markRecovery($session, $stateVersion);
            throw new TalosBrowserCommandException('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', 'Browser click worker evidence is incomplete; recovery is required.', status: 409, origin: 'browser_worker');
        }

        return $matches;
    }

    /**
     * @param  array{source_state_version: int, state_version: int, url: string, title: string, target: array<string, mixed>, screenshot_bytes: string, screenshot_sha256: string, width: int, height: int, snapshot: array<string, mixed>, snapshot_json: string, snapshot_sha256: string, worker_evidence: list<array<string, mixed>>, evidence_bytes: int}  $capture
     * @return array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact, replayed: bool}
     */
    private function persistCapture(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, string $commandId, string $nodeId, array $capture): array
    {
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
            /** @var array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact} $stored */
            $stored = DB::transaction(function () use ($session, $run, $normalizer, $commandId, $nodeId, $capture, &$created): array {
                $lease = TalosBrowserSession::query()
                    ->whereKey($session->id)
                    ->where('user_id', $session->user_id)
                    ->where('talos_session_id', $session->talos_session_id)
                    ->lockForUpdate()
                    ->first();
                if (! $lease instanceof TalosBrowserSession
                    || (int) $lease->worker_state_version !== $capture['source_state_version']) {
                    throw new \RuntimeException('Browser click capture was superseded by newer state.');
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
        } catch (Throwable $exception) {
            foreach (array_reverse($created) as $artifact) {
                try {
                    $this->artifacts->discard($artifact);
                } catch (Throwable) {
                    // Recovery state remains authoritative if compensating cleanup also fails.
                }
            }
            $this->markRecovery($session, $capture['state_version']);

            throw new TalosBrowserCommandException(
                'TALOS_BROWSER_CLICK_RECOVERY_REQUIRED',
                'Browser click evidence could not be committed atomically; recovery is required.',
                status: 409,
                origin: 'control_plane',
            );
        }

        $session->refresh();

        return [...$stored, 'replayed' => false];
    }

    /**
     * @param  array<string, mixed>  $capture
     * @param  list<TalosBrowserArtifact>  $artifacts
     * @return array{screenshot: TalosBrowserArtifact, snapshot: TalosBrowserArtifact, replayed: bool}
     */
    private function replayedCapture(TalosBrowserSession $session, array $capture, array $artifacts): array
    {
        $byType = [];
        foreach ($artifacts as $artifact) {
            if (isset($byType[$artifact->type])) {
                throw new TalosBrowserCommandException('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', 'Browser click replay evidence is duplicated.', status: 409);
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
            || (int) $screenshot->state_version !== $capture['state_version']
            || (int) $snapshot->state_version !== $capture['state_version']
            || ! hash_equals((string) $screenshot->sha256, hash('sha256', $capture['screenshot_bytes']))
            || ! hash_equals((string) $snapshot->sha256, hash('sha256', $capture['snapshot_json']))) {
            $this->markRecovery($session, $capture['state_version']);
            throw new TalosBrowserCommandException('TALOS_BROWSER_CLICK_RECOVERY_REQUIRED', 'Browser click replay evidence is incomplete or stale.', status: 409);
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
        TalosBrowserEvent::query()->create([
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
    private function failed(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, array $rawCommand, TalosBrowserCommandException $exception): array
    {
        $commandId = is_string($rawCommand['command_id'] ?? null) ? $rawCommand['command_id'] : 'unknown';
        $this->browserEvent($session, 'command.failed', 'policy', [
            'operation' => 'click',
            'command_id' => $commandId,
            'reason' => $exception->getMessage(),
        ]);
        $this->runEvent($run, $normalizer, 'browser.command.failed', [
            'command_id' => $commandId,
            'browser_session_id' => $session->id,
            'operation' => 'click',
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
                'operation' => 'click',
                'status' => 'failed',
                'label' => 'Click',
                'run_id' => $run->id,
                'browser_session_id' => $session->id,
                'artifact_ids' => [],
                'occurred_at' => now()->toJSON(),
            ],
        ];
    }

}
