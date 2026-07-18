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

final class TalosBrowserCommandService
{
    private const MAX_SNAPSHOT_BYTES = 60000;

    private const MAX_SNAPSHOT_NODES = 120;

    public function __construct(
        private readonly BrowserSessionClient $client,
        private readonly TalosBrowserPolicy $policy,
        private readonly TalosBrowserArtifactStore $artifacts,
        private readonly TalosBrowserArtifactReader $artifactReader,
        private readonly TalosBrowserLegacyWriteGate $legacyWrites,
    ) {}

    public function reconcile(TalosBrowserSession $session, ?TalosBrowserDeadline $deadline = null): void
    {
        $this->legacyWrites->assertEnabled('browser.command.reconcile');

        if ($deadline?->expired()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WALL_TIME_EXHAUSTED', 'Browser read wall-clock budget exhausted.');
        }
        if (! $session->isOperable()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_INVALID_STATE', 'Browser session is not operable.', ['status' => $session->status], 409);
        }

        try {
            $worker = $this->client->inspect(TalosBrowserOwnerReference::forUser((int) $session->user_id), $session->worker_session_id, $this->remainingTimeout($deadline));
        } catch (BrowserWorkerException $exception) {
            $session->update(['status' => 'failed', 'last_seen_at' => now()]);
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_LOST', 'Browser worker session is unavailable.', status: 503);
        }
        if ($deadline?->expired()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WALL_TIME_EXHAUSTED', 'Browser read wall-clock budget exhausted.');
        }

        $session->update([
            'status' => is_string($worker['status'] ?? null) ? $worker['status'] : $session->status,
            'capabilities' => is_array($worker['capabilities'] ?? null) ? $worker['capabilities'] : $session->capabilities,
            'expires_at' => $worker['expiresAt'] ?? $session->expires_at,
            'last_seen_at' => now(),
        ]);
        $reportedState = $worker['stateVersion'] ?? null;
        if (is_int($reportedState) && $reportedState >= 0) {
            TalosBrowserSession::query()
                ->whereKey($session->id)
                ->where('worker_state_version', '<', $reportedState)
                ->update(['worker_state_version' => $reportedState]);
        }
        $session->refresh();

        if (! $session->isOperable()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_INVALID_STATE', 'Browser session is not operable.', ['status' => $session->status], 409);
        }
    }

    /** @return array<string, mixed> */
    public function execute(TalosBrowserSession $session, TalosRun $run, array $rawCommand, RunEventNormalizer $normalizer, int $remainingEvidenceBytes = PHP_INT_MAX, ?TalosBrowserDeadline $deadline = null): array
    {
        $this->legacyWrites->assertEnabled('browser.command.execute');

        try {
            $this->assertActive($run, $deadline);
            $command = TalosBrowserCommand::fromArray($rawCommand);
            if ($command->runId !== $run->id || $command->browserSessionId !== $session->id) {
                throw new TalosBrowserCommandException('TALOS_BROWSER_COMMAND_OWNERSHIP', 'Browser command ownership did not match this run.', status: 422);
            }
            if (! $session->isOperable()) {
                throw new TalosBrowserCommandException('TALOS_BROWSER_INVALID_STATE', 'Browser session is not active.', ['status' => $session->status], 409);
            }
            if (! $session->supportsBrowserOperation($command->operation)) {
                throw new TalosBrowserCommandException('TALOS_BROWSER_CAPABILITY_DENIED', 'Browser operation is not available for this session.', ['operation' => $command->operation], 422);
            }

            $this->runEvent($run, $normalizer, 'browser.command.requested', [
                'command_id' => $command->commandId,
                'browser_session_id' => $session->id,
                'operation' => $command->operation,
                'risk' => 'read',
            ]);

            $result = match ($command->operation) {
                'navigate' => $this->navigate($session, $command, $run, $deadline),
                'snapshot' => $this->snapshot($session, $run, $normalizer, $command, $remainingEvidenceBytes, $deadline),
                'screenshot' => $this->screenshot($session, $run, $normalizer, $command, $remainingEvidenceBytes, $deadline),
                'read' => $this->read($session, $command, $remainingEvidenceBytes, $run, $deadline),
            };

            $this->browserEvent($session, 'command.succeeded', 'worker', [
                'operation' => $command->operation,
                'command_id' => $command->commandId,
                ...($result['event_payload'] ?? []),
            ]);
            $this->runEvent($run, $normalizer, 'browser.command.succeeded', [
                'command_id' => $command->commandId,
                'browser_session_id' => $session->id,
                'operation' => $command->operation,
                'artifact_ids' => $result['artifact_ids'] ?? [],
                'worker_evidence' => $result['worker_evidence'] ?? [],
            ]);

            return [
                'activity' => [
                    'id' => $command->commandId,
                    'operation' => $command->operation,
                    'status' => 'succeeded',
                    'label' => ucfirst($command->operation),
                    'run_id' => $run->id,
                    'browser_session_id' => $session->id,
                    'artifact_ids' => $result['artifact_ids'] ?? [],
                    'occurred_at' => now()->toJSON(),
                ],
                'observation' => $result['observation'],
                'used_browser_context' => $result['used_browser_context'] ?? null,
                'worker_evidence' => $result['worker_evidence'] ?? [],
                'evidence_bytes' => (int) ($result['evidence_bytes'] ?? 0),
            ];
        } catch (TalosBrowserCommandException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, $exception);
        } catch (\InvalidArgumentException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException('TALOS_BROWSER_COMMAND_MALFORMED', 'Browser command payload is malformed.', status: 422));
        } catch (BrowserWorkerException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException(
                $exception->errorCode,
                $exception->getMessage(),
                status: $exception->errorCode === 'TALOS_BROWSER_WORKER_UNAVAILABLE' ? 503 : 502,
                origin: 'browser_worker',
            ));
        } catch (Throwable) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException('TALOS_BROWSER_COMMAND_FAILED', 'Browser command failed.', status: 502));
        }
    }

    /** @return array<string, mixed> */
    private function navigate(TalosBrowserSession $session, TalosBrowserCommand $command, TalosRun $run, ?TalosBrowserDeadline $deadline): array
    {
        $url = (string) $command->arguments['url'];
        $before = $session->current_url;
        $this->assertActive($run, $deadline);
        $decision = $this->policy->inspect($url);
        $this->assertActive($run, $deadline);
        if (! $decision['allowed']) {
            $this->browserEvent($session, 'policy.denied', 'policy', ['url' => $url, 'policy_decision' => $decision]);
            throw new TalosBrowserCommandException('TALOS_BROWSER_POLICY_DENIED', 'Browser navigation was blocked by policy.', ['reason' => $decision['reason']], 422);
        }

        $workerResult = $this->invokeToolResult($session, $command, 'browser_navigate', ['url' => $url], 1, $deadline);
        $worker = $workerResult->structuredContent ?? [];
        $workerEvidence = $this->verifiedWorkerEvidence($workerResult, 'navigation', $this->canonicalEvidenceHash([
            'url' => $worker['url'] ?? null,
            'title' => $worker['title'] ?? null,
            'state_version' => $worker['state_version'] ?? null,
        ]));
        $this->assertActive($run, $deadline);
        $finalUrl = is_string($worker['url'] ?? null) ? $worker['url'] : $url;
        $finalDecision = $this->policy->inspect($finalUrl);
        $this->assertActive($run, $deadline);
        if (! $finalDecision['allowed']) {
            $this->browserEvent($session, 'policy.denied', 'policy', ['url' => $finalUrl, 'policy_decision' => $finalDecision]);
            throw new TalosBrowserCommandException('TALOS_BROWSER_POLICY_DENIED', 'Browser redirect was blocked by policy.', ['reason' => $finalDecision['reason']], 422);
        }

        $safeFinalUrl = TalosBrowserRedactor::url($finalUrl) ?? '[redacted-url]';
        $session->update(['status' => 'active', 'current_url' => $safeFinalUrl, 'current_title' => $worker['title'] ?? null, 'policy' => $finalDecision, 'last_snapshot_artifact_id' => null, 'last_seen_at' => now()]);

        return [
            'observation' => ['operation' => 'navigate', 'url' => $safeFinalUrl, 'title' => (string) ($worker['title'] ?? ''), 'untrusted' => true],
            'used_browser_context' => ['browser_session_id' => $session->id, 'url' => $safeFinalUrl, 'title' => (string) ($worker['title'] ?? ''), 'untrusted' => true],
            'event_payload' => ['url_before' => $before, 'url_after' => $safeFinalUrl, 'worker_evidence' => $workerEvidence],
            'worker_evidence' => $workerEvidence,
        ];
    }

    /** @return array<string, mixed> */
    private function snapshot(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, TalosBrowserCommand $command, int $remainingEvidenceBytes, ?TalosBrowserDeadline $deadline): array
    {
        $this->assertActive($run, $deadline);
        $workerResult = $this->invokeToolResult($session, $command, 'browser_snapshot', [], 0, $deadline);
        $worker = $workerResult->structuredContent ?? [];
        $this->assertActive($run, $deadline);
        $workerEvidence = $this->verifiedWorkerEvidence($workerResult, 'snapshot', $this->canonicalEvidenceHash([
            'snapshotId' => $worker['snapshot_id'] ?? null,
            'format' => $worker['format'] ?? null,
            'nodes' => $worker['nodes'] ?? null,
            'textDigest' => $worker['text_digest'] ?? null,
        ]));
        $safe = $this->safeSnapshot([
            'format' => $worker['format'] ?? null,
            'snapshotId' => $worker['snapshot_id'] ?? null,
            'textDigest' => $worker['text_digest'] ?? null,
            'nodes' => $worker['nodes'] ?? null,
            'url' => $worker['url'] ?? null,
            'title' => $worker['title'] ?? null,
        ]);
        $contents = json_encode($safe, JSON_THROW_ON_ERROR);
        if (strlen($contents) > $remainingEvidenceBytes) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser evidence budget exhausted.');
        }
        $sourceStateVersion = (int) $session->worker_state_version;
        $artifact = $this->storeAndLinkArtifact($session, $run, $normalizer, $command, 'snapshot', 'application/json', $contents, ['format' => 'accessibility_refs_v1', 'snapshot_id' => $safe['snapshotId'], 'url' => $safe['url'], 'title' => $safe['title'], 'text_digest' => $safe['textDigest'], 'node_count' => count($safe['nodes']), 'state_version' => $worker['state_version'] ?? $sourceStateVersion, 'worker_evidence' => $workerEvidence], $safe, $deadline);
        $updated = TalosBrowserSession::query()
            ->whereKey($session->id)
            ->where('user_id', $session->user_id)
            ->where('worker_state_version', $sourceStateVersion)
            ->update(['last_snapshot_artifact_id' => $artifact->id, 'current_url' => $safe['url'], 'current_title' => $safe['title'], 'last_seen_at' => now()]);
        if ($updated !== 1) {
            try {
                $this->artifacts->discard($artifact);
            } catch (Throwable) {
                // Preserve the state conflict even when compensating cleanup fails.
            }

            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_STATE', 'Browser snapshot was superseded by newer state.', status: 409);
        }
        $session->refresh();
        $context = ['browser_session_id' => $session->id, 'snapshot_artifact_id' => $artifact->id, 'url' => TalosBrowserRedactor::url($safe['url']), 'title' => $safe['title'], 'text_digest' => $safe['textDigest'], 'evidence_hash' => 'sha256:'.$artifact->sha256, 'untrusted' => true];

        return ['artifact_ids' => [$artifact->id], 'observation' => ['operation' => 'snapshot', 'url' => $safe['url'], 'title' => $safe['title'], 'text_digest' => $safe['textDigest'], 'evidence_hash' => 'sha256:'.$artifact->sha256, 'nodes' => $safe['nodes'], 'untrusted' => true], 'used_browser_context' => $context, 'event_payload' => ['artifact_id' => $artifact->id, 'worker_evidence' => $workerEvidence], 'worker_evidence' => $workerEvidence, 'evidence_bytes' => strlen($contents)];
    }

    /** @return array<string, mixed> */
    private function screenshot(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, TalosBrowserCommand $command, int $remainingEvidenceBytes, ?TalosBrowserDeadline $deadline): array
    {
        $this->assertActive($run, $deadline);
        $workerResult = $this->invokeToolResult($session, $command, 'browser_take_screenshot', [], 0, $deadline);
        $worker = $workerResult->structuredContent ?? [];
        $this->assertActive($run, $deadline);
        $image = collect($workerResult->content)->first(static fn (mixed $block): bool => is_array($block)
            && ($block['type'] ?? null) === 'image'
            && ($block['mimeType'] ?? null) === 'image/png');
        $bytes = is_array($image) && is_string($image['data'] ?? null) ? base64_decode($image['data'], true) : false;
        if (! is_string($bytes) || $bytes === '' || strlen($bytes) > TalosBrowserArtifactStore::MAX_SCREENSHOT_BYTES) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid screenshot.', status: 502, origin: 'browser_worker');
        }
        $workerHash = is_string($worker['sha256'] ?? null) ? $worker['sha256'] : '';
        if ($workerHash !== 'sha256:'.hash('sha256', $bytes)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker screenshot evidence hash did not match its payload.', status: 502, origin: 'browser_worker');
        }
        $workerEvidence = $this->verifiedWorkerEvidence($workerResult, 'screenshot', $workerHash);
        $observationBytes = strlen(json_encode([
            'operation' => 'screenshot',
            'artifact_id' => '00000000-0000-0000-0000-000000000000',
            'untrusted' => true,
        ], JSON_THROW_ON_ERROR));
        if ($observationBytes > $remainingEvidenceBytes) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser evidence budget exhausted.');
        }
        $artifact = $this->storeAndLinkArtifact($session, $run, $normalizer, $command, 'screenshot', 'image/png', $bytes, ['url' => TalosBrowserRedactor::url((string) ($worker['url'] ?? $session->current_url ?? '')), 'title' => (string) ($worker['title'] ?? $session->current_title ?? ''), 'state_version' => $worker['state_version'] ?? (int) $session->worker_state_version, 'width' => $worker['width'] ?? null, 'height' => $worker['height'] ?? null, 'worker_evidence' => $workerEvidence], [], $deadline);
        $session->update(['last_screenshot_artifact_id' => $artifact->id, 'last_seen_at' => now()]);

        return ['artifact_ids' => [$artifact->id], 'observation' => ['operation' => 'screenshot', 'artifact_id' => $artifact->id, 'untrusted' => true], 'event_payload' => ['artifact_id' => $artifact->id, 'worker_evidence' => $workerEvidence], 'worker_evidence' => $workerEvidence, 'evidence_bytes' => $observationBytes];
    }

    /** @return array<string, mixed> */
    private function read(TalosBrowserSession $session, TalosBrowserCommand $command, int $remainingEvidenceBytes, TalosRun $run, ?TalosBrowserDeadline $deadline): array
    {
        $this->assertActive($run, $deadline);
        $artifact = TalosBrowserArtifact::query()->where('id', $session->last_snapshot_artifact_id)->where('browser_session_id', $session->id)->where('type', 'snapshot')->first();
        if (! $artifact instanceof TalosBrowserArtifact) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_EVIDENCE', 'Current snapshot evidence is required before reading page content.');
        }
        if ($command->expectedEvidenceHash !== 'sha256:'.$artifact->sha256) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_EVIDENCE', 'Browser read evidence does not match the current snapshot.');
        }
        try {
            $contents = $this->artifactReader->read($artifact);
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            $session->refresh();
            throw new TalosBrowserCommandException(
                'TALOS_BROWSER_RECOVERY_REQUIRED',
                'Browser snapshot integrity verification failed; recovery is required before continuing.',
                ['artifact_id' => $exception->artifactId, 'reason' => $exception->reason],
                409,
            );
        }
        try {
            $raw = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_ARTIFACT_INVALID', 'Browser snapshot evidence is invalid.', status: 502);
        }
        if (! is_array($raw) || ! is_array($raw['nodes'] ?? null) || ! is_string($raw['snapshotId'] ?? null)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_ARTIFACT_INVALID', 'Browser snapshot evidence is invalid.', status: 502);
        }
        $ref = isset($command->arguments['ref']) ? (string) $command->arguments['ref'] : null;
        $query = isset($command->arguments['query']) ? mb_strtolower((string) $command->arguments['query']) : null;
        $arguments = ['snapshot_id' => $raw['snapshotId']];
        if ($ref !== null) {
            $arguments['ref'] = $ref;
        }
        if ($query !== null) {
            $arguments['query'] = $query;
        }
        $workerResult = $this->invokeToolResult($session, $command, 'browser_read', $arguments, 0, $deadline);
        $worker = $workerResult->structuredContent ?? [];
        $sourceEvidence = is_array($artifact->metadata['worker_evidence'] ?? null) ? $artifact->metadata['worker_evidence'] : [];
        $sourceHash = is_string($sourceEvidence[0]['sha256'] ?? null) ? $sourceEvidence[0]['sha256'] : '';
        $workerEvidence = $this->verifiedWorkerEvidence($workerResult, 'snapshot', $sourceHash);
        $matches = [];
        foreach (array_slice(is_array($worker['matches'] ?? null) ? $worker['matches'] : [], 0, 20) as $node) {
            if (! is_array($node) || ! is_string($node['ref'] ?? null) || ! is_string($node['role'] ?? null) || ! is_string($node['name'] ?? null) || ! is_bool($node['visible'] ?? null)) {
                continue;
            }
            $matches[] = ['ref' => mb_substr($node['ref'], 0, 128), 'role' => mb_substr($node['role'], 0, 128), 'name' => mb_substr($node['name'], 0, 512), 'visible' => $node['visible']];
        }
        $observation = ['operation' => 'read', 'matches' => $matches, 'untrusted' => true];
        $evidenceBytes = strlen(json_encode($observation, JSON_THROW_ON_ERROR));
        if ($evidenceBytes > $remainingEvidenceBytes) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser evidence budget exhausted.');
        }

        return ['artifact_ids' => [$artifact->id], 'observation' => $observation, 'used_browser_context' => ['browser_session_id' => $session->id, 'snapshot_artifact_id' => $artifact->id, 'url' => TalosBrowserRedactor::url((string) ($raw['url'] ?? '')), 'title' => (string) ($raw['title'] ?? ''), 'text_digest' => (string) ($raw['textDigest'] ?? ''), 'evidence_hash' => 'sha256:'.$artifact->sha256, 'untrusted' => true], 'event_payload' => ['artifact_id' => $artifact->id, 'match_count' => count($matches), 'worker_evidence' => $workerEvidence], 'worker_evidence' => $workerEvidence, 'evidence_bytes' => $evidenceBytes];
    }

    /** @param array<string, mixed> $arguments @return array<string, mixed> */
    private function invokeTool(TalosBrowserSession $session, TalosBrowserCommand $command, string $name, array $arguments, int $stateDelta, ?TalosBrowserDeadline $deadline): array
    {
        $result = $this->invokeToolResult($session, $command, $name, $arguments, $stateDelta, $deadline);

        return $result->structuredContent ?? [];
    }

    /** @param array<string, mixed> $arguments */
    private function invokeToolResult(TalosBrowserSession $session, TalosBrowserCommand $command, string $name, array $arguments, int $stateDelta, ?TalosBrowserDeadline $deadline): BrowserToolResult
    {
        $currentState = (int) $session->worker_state_version;
        $result = $this->client->callTool(
            TalosBrowserOwnerReference::forUser((int) $session->user_id),
            $session->worker_session_id,
            $command->commandId,
            $name,
            [...$arguments, 'state_version' => $currentState],
            $this->remainingTimeout($deadline),
        );
        $structured = $result->structuredContent;
        if ($result->isError) {
            $code = is_string($structured['code'] ?? null) && preg_match('/^TALOS_BROWSER_[A-Z0-9_]{1,96}$/', $structured['code']) === 1
                ? $structured['code']
                : 'TALOS_BROWSER_WORKER_FAILURE';
            $message = is_string($structured['message'] ?? null) ? trim($structured['message']) : '';
            if ($message === '') {
                $text = collect($result->content)->first(static fn (mixed $block): bool => is_array($block) && ($block['type'] ?? null) === 'text');
                $message = is_array($text) && is_string($text['text'] ?? null) ? trim($text['text']) : '';
            }
            if ($message === '') {
                $message = 'Browser worker failed to complete the tool call.';
            }
            $status = match ($code) {
                'TALOS_BROWSER_STALE_STATE', 'TALOS_BROWSER_STALE_REF' => 409,
                'TALOS_BROWSER_CAPABILITY_DENIED', 'TALOS_BROWSER_INVALID_TOOL_ARGUMENTS', 'TALOS_BROWSER_INVALID_NAVIGATION_URL' => 422,
                'TALOS_BROWSER_WAIT_TIMEOUT' => 408,
                default => 502,
            };

            throw new TalosBrowserCommandException($code, mb_substr($message, 0, 512), status: $status, origin: 'browser_worker');
        }
        if (! is_array($structured)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned a tool result without structured output.', status: 502, origin: 'browser_worker');
        }
        $stateVersion = $structured['state_version'] ?? null;
        if (! is_int($stateVersion) || $stateVersion !== $currentState + $stateDelta) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid state transition.', status: 502, origin: 'browser_worker');
        }
        $updated = TalosBrowserSession::query()
            ->whereKey($session->id)
            ->where('worker_state_version', $currentState)
            ->update(['worker_state_version' => $stateVersion, 'last_seen_at' => now()]);
        $session->refresh();
        if ($updated !== 1 || (int) $session->worker_state_version !== $stateVersion) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_STATE', 'Browser worker result was superseded by a newer browser state.', status: 409, origin: 'browser_worker');
        }

        return $result;
    }

    /** @return list<array{artifact_id: string, kind: string, sha256: string, trusted_boundary: string}> */
    private function verifiedWorkerEvidence(BrowserToolResult $result, string $kind, string $expectedHash): array
    {
        if (preg_match('/^sha256:[a-f0-9]{64}$/', $expectedHash) !== 1) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker evidence source was malformed.', status: 502, origin: 'browser_worker');
        }
        $referencedIds = is_array($result->structuredContent['evidence_ids'] ?? null)
            ? $result->structuredContent['evidence_ids']
            : [];
        $verified = [];
        foreach ($result->evidence as $evidence) {
            if (! is_array($evidence)
                || ($evidence['kind'] ?? null) !== $kind
                || ($evidence['sha256'] ?? null) !== $expectedHash
                || ! is_string($evidence['artifact_id'] ?? null)
                || ! in_array($evidence['artifact_id'], $referencedIds, true)
                || ! is_string($evidence['trusted_boundary'] ?? null)) {
                continue;
            }
            $verified[] = [
                'artifact_id' => $evidence['artifact_id'],
                'kind' => $kind,
                'sha256' => $expectedHash,
                'trusted_boundary' => $evidence['trusted_boundary'],
            ];
        }
        if ($verified === []) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker evidence did not match the executed tool result.', status: 502, origin: 'browser_worker');
        }

        return $verified;
    }

    /** @param array<string, mixed> $source */
    private function canonicalEvidenceHash(array $source): string
    {
        return 'sha256:'.hash('sha256', json_encode($source, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed> $raw @return array{format: string, snapshotId: string, url: string, title: string, textDigest: string, nodes: list<array<string, mixed>>} */
    private function safeSnapshot(array $raw): array
    {
        if (($raw['format'] ?? null) !== 'accessibility_refs_v1' || ! is_string($raw['snapshotId'] ?? null) || preg_match('/^snap_[A-Za-z0-9-]+$/', $raw['snapshotId']) !== 1 || ! is_string($raw['url'] ?? null) || ! is_string($raw['title'] ?? null) || ! is_string($raw['textDigest'] ?? null) || ! is_array($raw['nodes'] ?? null)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid snapshot.', status: 502, origin: 'browser_worker');
        }
        $nodes = [];
        foreach (array_slice($raw['nodes'], 0, self::MAX_SNAPSHOT_NODES) as $node) {
            if (! is_array($node) || ! is_string($node['ref'] ?? null) || ! is_string($node['role'] ?? null) || ! is_string($node['name'] ?? null) || ! is_bool($node['visible'] ?? null)) {
                continue;
            }
            $nodes[] = ['ref' => mb_substr($node['ref'], 0, 128), 'role' => mb_substr($node['role'], 0, 128), 'name' => mb_substr($node['name'], 0, 512), 'visible' => $node['visible']];
        }
        $snapshotUrl = TalosBrowserRedactor::url(mb_substr($raw['url'], 0, 2048)) ?? '[redacted-url]';
        $safe = ['format' => 'accessibility_refs_v1', 'snapshotId' => $raw['snapshotId'], 'url' => $snapshotUrl, 'title' => mb_substr($raw['title'], 0, 512), 'textDigest' => mb_substr($raw['textDigest'], 0, 4000), 'nodes' => $nodes];
        if (strlen(json_encode($safe, JSON_THROW_ON_ERROR)) > self::MAX_SNAPSHOT_BYTES) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser snapshot exceeded the evidence budget.');
        }

        return $safe;
    }

    /** @param array<string, mixed> $payload */
    private function browserEvent(TalosBrowserSession $session, string $type, string $actor, array $payload): void
    {
        TalosBrowserEvent::query()->create(['browser_session_id' => $session->id, 'user_id' => $session->user_id, 'type' => $type, 'actor' => $actor, 'url_before' => $payload['url_before'] ?? null, 'url_after' => $payload['url_after'] ?? null, 'payload' => $payload, 'policy_decision' => $payload['policy_decision'] ?? null]);
    }

    /** @param array<string, mixed> $payload */
    private function runEvent(TalosRun $run, RunEventNormalizer $normalizer, string $type, array $payload): void
    {
        $run->events()->create([...$normalizer->normalize(['event_type' => $type, 'severity' => str_ends_with($type, 'failed') ? 'error' : 'info', 'payload' => $payload]), 'sequence' => ((int) $run->events()->max('sequence')) + 1, 'occurred_at' => now()]);
    }

    /** @param array<string, mixed> $metadata @param array<string, mixed> $eventPayload */
    private function storeAndLinkArtifact(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, TalosBrowserCommand $command, string $type, string $mime, string $contents, array $metadata, array $eventPayload, ?TalosBrowserDeadline $deadline): TalosBrowserArtifact
    {
        $this->assertActive($run, $deadline);
        $artifact = null;
        try {
            DB::transaction(function () use (&$artifact, $session, $run, $normalizer, $command, $type, $mime, $contents, $metadata, $eventPayload, $deadline): void {
                $this->assertActive($run, $deadline);
                $stateVersion = is_int($metadata['state_version'] ?? null)
                    ? $metadata['state_version']
                    : (int) $session->worker_state_version;
                $artifact = $this->artifacts->store(
                    $session,
                    $type,
                    $mime,
                    $contents,
                    $metadata,
                    [
                        'source_command_id' => $command->commandId,
                        'source_state_version' => (int) $session->worker_state_version,
                        'state_version' => $stateVersion,
                        'trust_boundary' => 'untrusted_browser_content',
                    ],
                );
                $run->artifacts()->create([
                    'artifact_type' => 'browser_'.$type,
                    'uri' => 'talos-browser-artifact://'.$artifact->id,
                    'mime_type' => $artifact->mime,
                    'metadata' => [
                        'browser_artifact_id' => $artifact->id,
                        'browser_session_id' => $artifact->browser_session_id,
                        'sha256' => $artifact->sha256,
                        'trust' => 'untrusted',
                        'source_command_id' => $command->commandId,
                        'source_node_id' => $command->nodeId,
                        'worker_evidence' => is_array($metadata['worker_evidence'] ?? null) ? $metadata['worker_evidence'] : [],
                    ],
                ]);
                $this->assertActive($run, $deadline);
                $this->runEvent($run, $normalizer, 'browser.artifact.created', [
                    'artifact_id' => $artifact->id,
                    'browser_session_id' => $artifact->browser_session_id,
                    'type' => $artifact->type,
                    'sha256' => $artifact->sha256,
                    'metadata' => $eventPayload,
                ]);
            });
        } catch (Throwable $exception) {
            if ($artifact instanceof TalosBrowserArtifact) {
                $this->artifacts->discard($artifact);
            }
            throw $exception;
        }

        assert($artifact instanceof TalosBrowserArtifact);

        return $artifact;
    }

    private function assertActive(TalosRun $run, ?TalosBrowserDeadline $deadline): void
    {
        if ($deadline?->expired()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WALL_TIME_EXHAUSTED', 'Browser read wall-clock budget exhausted.');
        }
        if ($run->fresh()?->status === 'cancelled') {
            throw new TalosBrowserCommandException('TALOS_BROWSER_CANCELLED', 'Browser read was cancelled.', status: 409);
        }
    }

    private function remainingTimeout(?TalosBrowserDeadline $deadline): int
    {
        if ($deadline === null) {
            return 15000;
        }
        if ($deadline->expired()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WALL_TIME_EXHAUSTED', 'Browser read wall-clock budget exhausted.');
        }

        return $deadline->remainingMilliseconds();
    }

    /** @return array<string, mixed> */
    private function failed(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, array $rawCommand, TalosBrowserCommandException $exception): array
    {
        $commandId = is_string($rawCommand['command_id'] ?? null) ? $rawCommand['command_id'] : 'unknown';
        $operation = is_string($rawCommand['operation'] ?? null) ? $rawCommand['operation'] : 'unknown';
        $this->browserEvent($session, $exception->errorCode === 'TALOS_BROWSER_POLICY_DENIED' ? 'policy.denied' : 'command.failed', 'policy', ['operation' => $operation, 'command_id' => $commandId, 'reason' => $exception->getMessage()]);
        $this->runEvent($run, $normalizer, 'browser.command.failed', ['command_id' => $commandId, 'browser_session_id' => $session->id, 'operation' => $operation, 'error_code' => $exception->errorCode, 'message' => $exception->getMessage(), 'details' => $exception->details, 'origin' => $exception->origin]);

        return ['error' => ['code' => $exception->errorCode, 'message' => $exception->getMessage(), 'details' => $exception->details, 'status' => $exception->status, 'origin' => $exception->origin], 'activity' => ['id' => $commandId, 'operation' => $operation, 'status' => 'failed', 'label' => ucfirst($operation), 'run_id' => $run->id, 'browser_session_id' => $session->id, 'artifact_ids' => [], 'occurred_at' => now()->toJSON()]];
    }

}
