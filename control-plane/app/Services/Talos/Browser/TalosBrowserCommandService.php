<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\TalosRun;
use App\Services\Runs\RunEventNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

final class TalosBrowserCommandService
{
    private const MAX_SNAPSHOT_BYTES = 60000;
    private const MAX_SNAPSHOT_NODES = 120;

    public function __construct(
        private readonly BrowserSessionClient $client,
        private readonly TalosBrowserPolicy $policy,
        private readonly TalosBrowserArtifactStore $artifacts,
    ) {
    }

    public function reconcile(TalosBrowserSession $session, ?TalosBrowserDeadline $deadline = null): void
    {
        if ($deadline?->expired()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WALL_TIME_EXHAUSTED', 'Browser read wall-clock budget exhausted.');
        }
        if (! $session->isOperable()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_INVALID_STATE', 'Browser session is not operable.', ['status' => $session->status], 409);
        }

        try {
            $worker = $this->client->inspect($this->ownerRef($session), $session->worker_session_id, $this->remainingTimeout($deadline));
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
        $session->refresh();

        if (! $session->isOperable()) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_INVALID_STATE', 'Browser session is not operable.', ['status' => $session->status], 409);
        }
    }

    /** @return array<string, mixed> */
    public function execute(TalosBrowserSession $session, TalosRun $run, array $rawCommand, RunEventNormalizer $normalizer, int $remainingEvidenceBytes = PHP_INT_MAX, ?TalosBrowserDeadline $deadline = null): array
    {
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
                'evidence_bytes' => (int) ($result['evidence_bytes'] ?? 0),
            ];
        } catch (TalosBrowserCommandException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, $exception);
        } catch (\InvalidArgumentException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException('TALOS_BROWSER_COMMAND_MALFORMED', 'Browser command payload is malformed.', status: 422));
        } catch (BrowserWorkerException $exception) {
            return $this->failed($session, $run, $normalizer, $rawCommand, new TalosBrowserCommandException($exception->errorCode, $exception->getMessage(), status: $exception->errorCode === 'TALOS_BROWSER_WORKER_UNAVAILABLE' ? 503 : 502));
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

        $worker = $this->client->navigate($this->ownerRef($session), $session->worker_session_id, $url, $this->remainingTimeout($deadline));
        $this->assertActive($run, $deadline);
        $finalUrl = is_string($worker['url'] ?? null) ? $worker['url'] : $url;
        $finalDecision = $this->policy->inspect($finalUrl);
        $this->assertActive($run, $deadline);
        if (! $finalDecision['allowed']) {
            $this->browserEvent($session, 'policy.denied', 'policy', ['url' => $finalUrl, 'policy_decision' => $finalDecision]);
            throw new TalosBrowserCommandException('TALOS_BROWSER_POLICY_DENIED', 'Browser redirect was blocked by policy.', ['reason' => $finalDecision['reason']], 422);
        }

        $safeFinalUrl = TalosBrowserRedactor::url($finalUrl) ?? '[redacted-url]';
        $session->update(['status' => $worker['status'] ?? 'active', 'current_url' => $safeFinalUrl, 'current_title' => $worker['title'] ?? null, 'policy' => $finalDecision, 'last_snapshot_artifact_id' => null, 'last_seen_at' => now()]);
        return [
            'observation' => ['operation' => 'navigate', 'url' => $safeFinalUrl, 'title' => (string) ($worker['title'] ?? ''), 'untrusted' => true],
            'used_browser_context' => ['browser_session_id' => $session->id, 'url' => $safeFinalUrl, 'title' => (string) ($worker['title'] ?? ''), 'untrusted' => true],
            'event_payload' => ['url_before' => $before, 'url_after' => $safeFinalUrl],
        ];
    }

    /** @return array<string, mixed> */
    private function snapshot(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, TalosBrowserCommand $command, int $remainingEvidenceBytes, ?TalosBrowserDeadline $deadline): array
    {
        $this->assertActive($run, $deadline);
        $raw = $this->client->snapshot($this->ownerRef($session), $session->worker_session_id, $this->remainingTimeout($deadline));
        $this->assertActive($run, $deadline);
        $safe = $this->safeSnapshot($raw);
        $contents = json_encode($safe, JSON_THROW_ON_ERROR);
        if (strlen($contents) > $remainingEvidenceBytes) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser evidence budget exhausted.');
        }
        $artifact = $this->storeAndLinkArtifact($session, $run, $normalizer, $command, 'snapshot', 'application/json', $contents, ['format' => 'accessibility_refs_v1', 'text_digest' => $safe['textDigest'], 'node_count' => count($safe['nodes'])], $safe, $deadline);
        $session->update(['last_snapshot_artifact_id' => $artifact->id, 'current_url' => $safe['url'], 'current_title' => $safe['title'], 'last_seen_at' => now()]);
        $context = ['browser_session_id' => $session->id, 'snapshot_artifact_id' => $artifact->id, 'url' => TalosBrowserRedactor::url($safe['url']), 'title' => $safe['title'], 'text_digest' => $safe['textDigest'], 'evidence_hash' => 'sha256:'.$artifact->sha256, 'untrusted' => true];
        return ['artifact_ids' => [$artifact->id], 'observation' => ['operation' => 'snapshot', 'url' => $safe['url'], 'title' => $safe['title'], 'text_digest' => $safe['textDigest'], 'evidence_hash' => 'sha256:'.$artifact->sha256, 'nodes' => $safe['nodes'], 'untrusted' => true], 'used_browser_context' => $context, 'event_payload' => ['artifact_id' => $artifact->id], 'evidence_bytes' => strlen($contents)];
    }

    /** @return array<string, mixed> */
    private function screenshot(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, TalosBrowserCommand $command, int $remainingEvidenceBytes, ?TalosBrowserDeadline $deadline): array
    {
        $this->assertActive($run, $deadline);
        $worker = $this->client->screenshot($this->ownerRef($session), $session->worker_session_id, $this->remainingTimeout($deadline));
        $this->assertActive($run, $deadline);
        $bytes = is_string($worker['base64'] ?? null) ? base64_decode($worker['base64'], true) : false;
        if (! is_string($bytes) || $bytes === '' || strlen($bytes) > TalosBrowserArtifactStore::MAX_SCREENSHOT_BYTES) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid screenshot.', status: 502);
        }
        $observationBytes = strlen(json_encode([
            'operation' => 'screenshot',
            'artifact_id' => '00000000-0000-0000-0000-000000000000',
            'untrusted' => true,
        ], JSON_THROW_ON_ERROR));
        if ($observationBytes > $remainingEvidenceBytes) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser evidence budget exhausted.');
        }
        $artifact = $this->storeAndLinkArtifact($session, $run, $normalizer, $command, 'screenshot', 'image/png', $bytes, ['width' => $worker['width'] ?? null, 'height' => $worker['height'] ?? null], [], $deadline);
        $session->update(['last_screenshot_artifact_id' => $artifact->id, 'last_seen_at' => now()]);
        return ['artifact_ids' => [$artifact->id], 'observation' => ['operation' => 'screenshot', 'artifact_id' => $artifact->id, 'untrusted' => true], 'event_payload' => ['artifact_id' => $artifact->id], 'evidence_bytes' => $observationBytes];
    }

    /** @return array<string, mixed> */
    private function read(TalosBrowserSession $session, TalosBrowserCommand $command, int $remainingEvidenceBytes, TalosRun $run, ?TalosBrowserDeadline $deadline): array
    {
        $this->assertActive($run, $deadline);
        $artifact = TalosBrowserArtifact::query()->where('id', $session->last_snapshot_artifact_id)->where('browser_session_id', $session->id)->where('type', 'snapshot')->first();
        if (! $artifact instanceof TalosBrowserArtifact || ! Storage::disk($artifact->storage_disk)->exists($artifact->storage_path)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_EVIDENCE', 'Current snapshot evidence is required before reading page content.');
        }
        if ($command->expectedEvidenceHash !== 'sha256:'.$artifact->sha256) throw new TalosBrowserCommandException('TALOS_BROWSER_STALE_EVIDENCE', 'Browser read evidence does not match the current snapshot.');
        $raw = json_decode(Storage::disk($artifact->storage_disk)->get($artifact->storage_path), true);
        if (! is_array($raw) || ! is_array($raw['nodes'] ?? null)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_ARTIFACT_INVALID', 'Browser snapshot evidence is invalid.', status: 502);
        }
        $ref = isset($command->arguments['ref']) ? (string) $command->arguments['ref'] : null;
        $query = isset($command->arguments['query']) ? mb_strtolower((string) $command->arguments['query']) : null;
        $matches = array_values(array_filter($raw['nodes'], static function (mixed $node) use ($ref, $query): bool {
            if (! is_array($node)) return false;
            if ($ref !== null && ($node['ref'] ?? null) !== $ref) return false;
            return $query === null || str_contains(mb_strtolower((string) ($node['name'] ?? '')), $query);
        }));
        $matches = array_map(static fn (array $node): array => ['ref' => (string) ($node['ref'] ?? ''), 'role' => (string) ($node['role'] ?? ''), 'name' => mb_substr((string) ($node['name'] ?? ''), 0, 512), 'visible' => ($node['visible'] ?? false) === true], array_slice($matches, 0, 20));
        $observation = ['operation' => 'read', 'matches' => $matches, 'untrusted' => true];
        $evidenceBytes = strlen(json_encode($observation, JSON_THROW_ON_ERROR));
        if ($evidenceBytes > $remainingEvidenceBytes) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser evidence budget exhausted.');
        }

        return ['artifact_ids' => [$artifact->id], 'observation' => $observation, 'used_browser_context' => ['browser_session_id' => $session->id, 'snapshot_artifact_id' => $artifact->id, 'url' => TalosBrowserRedactor::url((string) ($raw['url'] ?? '')), 'title' => (string) ($raw['title'] ?? ''), 'text_digest' => (string) ($raw['textDigest'] ?? ''), 'evidence_hash' => 'sha256:'.$artifact->sha256, 'untrusted' => true], 'event_payload' => ['artifact_id' => $artifact->id, 'match_count' => count($matches)], 'evidence_bytes' => $evidenceBytes];
    }

    /** @param array<string, mixed> $raw @return array{format: string, url: string, title: string, textDigest: string, nodes: list<array<string, mixed>>} */
    private function safeSnapshot(array $raw): array
    {
        if (($raw['format'] ?? null) !== 'accessibility_refs_v1' || ! is_string($raw['url'] ?? null) || ! is_string($raw['title'] ?? null) || ! is_string($raw['textDigest'] ?? null) || ! is_array($raw['nodes'] ?? null)) {
            throw new TalosBrowserCommandException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid snapshot.', status: 502);
        }
        $nodes = [];
        foreach (array_slice($raw['nodes'], 0, self::MAX_SNAPSHOT_NODES) as $node) {
            if (! is_array($node) || ! is_string($node['ref'] ?? null) || ! is_string($node['role'] ?? null) || ! is_string($node['name'] ?? null) || ! is_bool($node['visible'] ?? null)) continue;
            $nodes[] = ['ref' => mb_substr($node['ref'], 0, 128), 'role' => mb_substr($node['role'], 0, 128), 'name' => mb_substr($node['name'], 0, 512), 'visible' => $node['visible']];
        }
        $snapshotUrl = TalosBrowserRedactor::url(mb_substr($raw['url'], 0, 2048)) ?? '[redacted-url]';
        $safe = ['format' => 'accessibility_refs_v1', 'url' => $snapshotUrl, 'title' => mb_substr($raw['title'], 0, 512), 'textDigest' => mb_substr($raw['textDigest'], 0, 128), 'nodes' => $nodes];
        if (strlen(json_encode($safe, JSON_THROW_ON_ERROR)) > self::MAX_SNAPSHOT_BYTES) throw new TalosBrowserCommandException('TALOS_BROWSER_EVIDENCE_BUDGET', 'Browser snapshot exceeded the evidence budget.');
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
                $artifact = $this->artifacts->store($session, $type, $mime, $contents, $metadata);
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
        if ($deadline === null) return 15000;
        if ($deadline->expired()) throw new TalosBrowserCommandException('TALOS_BROWSER_WALL_TIME_EXHAUSTED', 'Browser read wall-clock budget exhausted.');

        return $deadline->remainingMilliseconds();
    }

    /** @return array<string, mixed> */
    private function failed(TalosBrowserSession $session, TalosRun $run, RunEventNormalizer $normalizer, array $rawCommand, TalosBrowserCommandException $exception): array
    {
        $commandId = is_string($rawCommand['command_id'] ?? null) ? $rawCommand['command_id'] : 'unknown';
        $operation = is_string($rawCommand['operation'] ?? null) ? $rawCommand['operation'] : 'unknown';
        $this->browserEvent($session, $exception->errorCode === 'TALOS_BROWSER_POLICY_DENIED' ? 'policy.denied' : 'command.failed', 'policy', ['operation' => $operation, 'command_id' => $commandId, 'reason' => $exception->getMessage()]);
        $this->runEvent($run, $normalizer, 'browser.command.failed', ['command_id' => $commandId, 'browser_session_id' => $session->id, 'operation' => $operation, 'error_code' => $exception->errorCode, 'message' => $exception->getMessage(), 'details' => $exception->details]);
        return ['error' => ['code' => $exception->errorCode, 'message' => $exception->getMessage(), 'details' => $exception->details, 'status' => $exception->status], 'activity' => ['id' => $commandId, 'operation' => $operation, 'status' => 'failed', 'label' => ucfirst($operation), 'run_id' => $run->id, 'browser_session_id' => $session->id, 'artifact_ids' => [], 'occurred_at' => now()->toJSON()]];
    }

    private function ownerRef(TalosBrowserSession $session): string
    {
        return 'talos-user:'.$session->user_id;
    }
}
