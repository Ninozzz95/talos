<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserTask;
use App\Models\TalosRunArtifact;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use InvalidArgumentException;
use JsonException;
use Kadmos\Browser\Contract\BrowserEvidenceBundle as CoreEvidenceBundle;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ToolResult;

final readonly class TalosBrowserEvidenceVerifier
{
    public function __construct(private TalosBrowserArtifactReader $artifacts) {}

    public function verifyCurrent(TalosBrowserEvidenceBundle $bundle): void
    {
        $bundle->loadMissing(['task.originMessage', 'action', 'previousEvidence']);
        $task = $bundle->task;
        $action = $bundle->action;
        if (! $task instanceof TalosBrowserTask
            || ! $action instanceof TalosBrowserAction
            || (string) $action->task_id !== (string) $task->id
            || (string) $bundle->task_id !== (string) $task->id
            || (int) $bundle->user_id !== (int) $task->user_id
            || (string) $bundle->talos_session_id !== (string) $task->talos_session_id
            || (string) $task->browser_session_id === '') {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence ownership does not match its task and action.');
        }
        $runId = $task->originMessage?->run_id;
        $call = is_string($runId) ? TalosToolCall::query()
            ->where('run_id', $runId)
            ->where('user_id', $task->user_id)
            ->where('logical_call_id', $action->intent_id)
            ->where('effect_key', $action->idempotency_key)
            ->latest('attempt')
            ->first() : null;
        if (! $call instanceof TalosToolCall
            || ! is_string($action->result_sha256)
            || preg_match('/^sha256:[a-f0-9]{64}$/D', $action->result_sha256) !== 1
            || ! in_array($action->status, ['committed', 'evidence_committed', 'verified'], true)
            || (int) $bundle->worker_state_version < (int) $action->expected_state_version) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence is not correlated to a committed tool action.');
        }

        $canonical = $this->canonicalBundle($bundle);
        try {
            CoreEvidenceBundle::fromArray($canonical);
        } catch (InvalidArgumentException $exception) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_CONTRACT_INVALID', 'Persisted Browser evidence violates the canonical v1 contract.', $exception);
        }
        $seed = $canonical;
        unset($seed['evidence_id'], $seed['integrity_sha256']);
        $seed['result_sha256'] = $action->result_sha256;
        $expectedIntegrity = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($seed));
        if (! hash_equals((string) $bundle->integrity_sha256, $expectedIntegrity)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', 'Browser evidence bundle integrity does not match its canonical payload.');
        }
        if ($bundle->previousEvidence instanceof TalosBrowserEvidenceBundle
            && ((int) $bundle->previousEvidence->user_id !== (int) $bundle->user_id
                || (string) $bundle->previousEvidence->task_id !== (string) $bundle->task_id
                || (string) $bundle->previousEvidence->talos_session_id !== (string) $bundle->talos_session_id
                || $bundle->previousEvidence->reconciled_at === null
                || (int) $bundle->previousEvidence->worker_state_version > (int) $bundle->worker_state_version)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_CHAIN_INVALID', 'Browser evidence predecessor is unverified, cross-scoped or newer than its successor.');
        }

        $verifiedBrowserSources = [];
        foreach (['snapshot', 'screenshot'] as $kind) {
            $artifactId = $bundle->getAttribute($kind.'_artifact_id');
            if ($artifactId === null) {
                continue;
            }
            if (! is_string($artifactId)) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser evidence artifact identity is malformed.');
            }
            $artifact = TalosBrowserArtifact::query()
                ->whereKey($artifactId)
                ->where('user_id', $bundle->user_id)
                ->where('browser_session_id', $task->browser_session_id)
                ->first();
            if (! $artifact instanceof TalosBrowserArtifact) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'A Browser evidence artifact is no longer available in its owned scope.');
            }
            $this->verifyBrowserArtifact($bundle, $artifact, $kind);
            $verifiedBrowserSources[$artifactId] = $artifact;
        }

        $claims = is_array($bundle->claims) ? $bundle->claims : [];
        if (! array_is_list($claims) || $claims === []) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_CONTRACT_INVALID', 'Browser evidence requires an ordered non-empty claim list.');
        }
        $seenClaims = [];
        foreach ($claims as $claim) {
            if (! is_array($claim)
                || ! is_string($claim['claim_id'] ?? null)
                || isset($seenClaims[$claim['claim_id']])
                || ! is_string($claim['source_artifact_id'] ?? null)
                || ! is_string($claim['value'] ?? null)
                || preg_match('/^sha256:[a-f0-9]{64}$/D', $claim['value']) !== 1) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_CONTRACT_INVALID', 'Browser evidence claim identity or digest is invalid.');
            }
            $seenClaims[$claim['claim_id']] = true;
            $sourceId = $claim['source_artifact_id'];
            $browserArtifact = $verifiedBrowserSources[$sourceId] ?? TalosBrowserArtifact::query()
                ->whereKey($sourceId)
                ->where('user_id', $bundle->user_id)
                ->where('browser_session_id', $task->browser_session_id)
                ->first();
            if ($browserArtifact instanceof TalosBrowserArtifact) {
                if (! isset($verifiedBrowserSources[$sourceId])) {
                    $this->verifyBrowserArtifact($bundle, $browserArtifact, (string) $browserArtifact->type);
                    $verifiedBrowserSources[$sourceId] = $browserArtifact;
                }
                if (! is_string($browserArtifact->sha256)
                    || ! hash_equals($claim['value'], 'sha256:'.$browserArtifact->sha256)) {
                    throw $this->fault('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', 'Browser claim digest does not match its source artifact.');
                }

                continue;
            }

            $runArtifact = TalosRunArtifact::query()
                ->whereKey($sourceId)
                ->where('run_id', $call->run_id)
                ->first();
            $metadata = $runArtifact instanceof TalosRunArtifact && is_array($runArtifact->metadata) ? $runArtifact->metadata : [];
            if (! $runArtifact instanceof TalosRunArtifact
                || (string) ($metadata['tool_turn_id'] ?? '') !== (string) $call->tool_turn_id
                || (string) ($metadata['provider_call_id'] ?? '') !== (string) $call->provider_call_id
                || ! $this->metadataHashMatches($metadata['sha256'] ?? null, $claim['value'])) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'Browser claim source is absent or not owned by its tool run.');
            }
            if ($runArtifact->artifact_type === 'browser_navigation') {
                $observation = $metadata['observation'] ?? null;
                if (! is_array($observation)
                    || ! hash_equals($claim['value'], 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($observation)))) {
                    throw $this->fault('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', 'Browser navigation claim does not match its canonical observation.');
                }
            }
        }
    }

    public function verifyForToolCall(TalosToolTurn $turn, TalosToolCall $call, ToolResult $result): TalosBrowserEvidenceBundle
    {
        if ((int) $call->user_id !== (int) $turn->user_id
            || (string) $call->tool_turn_id !== (string) $turn->id
            || (string) $call->run_id !== (string) $turn->run_id
            || $result->isError) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser grounding call does not belong to its tool turn.');
        }
        $task = TalosBrowserTask::query()
            ->where('user_id', $turn->user_id)
            ->where('talos_session_id', $turn->session_id)
            ->where('browser_session_id', $turn->browser_session_id)
            ->whereHas('originMessage', static fn ($query) => $query->where('run_id', $turn->run_id))
            ->first();
        $action = $task instanceof TalosBrowserTask ? TalosBrowserAction::query()
            ->where('task_id', $task->id)
            ->where('user_id', $turn->user_id)
            ->where('intent_id', $call->logical_call_id)
            ->where('idempotency_key', $call->effect_key)
            ->first() : null;
        $bundle = $action instanceof TalosBrowserAction ? TalosBrowserEvidenceBundle::query()
            ->where('action_id', $action->id)
            ->where('user_id', $turn->user_id)
            ->first() : null;
        if (! $bundle instanceof TalosBrowserEvidenceBundle) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'Browser tool result has no durable evidence bundle.');
        }
        if ($bundle->reconciled_at === null) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_NOT_RECONCILED', 'Browser evidence is staged but has not passed publication verification.');
        }

        $this->verifyCurrent($bundle);
        $resultIds = array_values(array_map(static fn (array $item): mixed => $item['artifact_id'] ?? null, $result->evidence));
        $claimIds = array_values(array_map(static fn (array $claim): mixed => $claim['source_artifact_id'] ?? null, $bundle->claims));
        if ($resultIds !== $claimIds) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence claims do not match the current canonical tool result.');
        }

        return $bundle;
    }

    private function verifyBrowserArtifact(TalosBrowserEvidenceBundle $bundle, TalosBrowserArtifact $artifact, string $kind): void
    {
        if (! in_array($kind, ['snapshot', 'screenshot'], true)
            || (string) $artifact->type !== $kind
            || (string) $artifact->trust_boundary !== 'untrusted_browser_content'
            || ! is_string($artifact->sha256)
            || ! hash_equals((string) $bundle->getAttribute($kind.'_sha256'), 'sha256:'.$artifact->sha256)
            || (string) $bundle->getAttribute($kind.'_mime') !== (string) $artifact->mime) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser artifact metadata does not match its evidence bundle.');
        }

        try {
            $contents = $this->artifacts->read($artifact);
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', 'Browser artifact bytes failed integrity verification.', $exception);
        }
        if ((int) $bundle->getAttribute($kind.'_byte_size') !== strlen($contents)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', 'Browser artifact byte count does not match its evidence bundle.');
        }
        if ($kind === 'snapshot') {
            if ($artifact->mime !== 'application/json') {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_MIME_INVALID', 'Browser snapshot MIME is not allowlisted JSON.');
            }
            try {
                $decoded = json_decode($contents, false, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $exception) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_MIME_INVALID', 'Browser snapshot bytes are not valid JSON.', $exception);
            }
            if (! is_object($decoded)) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_MIME_INVALID', 'Browser snapshot root must be a JSON object.');
            }

            return;
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo->buffer($contents);
        $dimensions = @getimagesizefromstring($contents);
        if ($artifact->mime !== 'image/png'
            || $detectedMime !== 'image/png'
            || ! is_array($dimensions)
            || ($dimensions[2] ?? null) !== IMAGETYPE_PNG
            || ! hash_equals(substr($contents, 0, 8), "\x89PNG\r\n\x1a\n")
            || (int) $bundle->screenshot_width !== (int) ($dimensions[0] ?? 0)
            || (int) $bundle->screenshot_height !== (int) ($dimensions[1] ?? 0)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_MIME_INVALID', 'Browser screenshot bytes, MIME or dimensions are inconsistent.');
        }
    }

    /** @return array<string, mixed> */
    private function canonicalBundle(TalosBrowserEvidenceBundle $bundle): array
    {
        return [
            'schema_version' => (string) $bundle->schema_version,
            'evidence_id' => (string) $bundle->id,
            'task_id' => (string) $bundle->task_id,
            'action_id' => (string) $bundle->action_id,
            'worker_state_version' => (int) $bundle->worker_state_version,
            'url' => (string) $bundle->url,
            'title' => (string) $bundle->title,
            'captured_at' => $bundle->captured_at?->toISOString(),
            'frame' => $bundle->frame,
            'snapshot_artifact_id' => $bundle->snapshot_artifact_id,
            'screenshot_artifact_id' => $bundle->screenshot_artifact_id,
            'before_evidence_id' => $bundle->before_evidence_id,
            'integrity_sha256' => (string) $bundle->integrity_sha256,
            'claims' => $bundle->claims,
        ];
    }

    private function metadataHashMatches(mixed $stored, string $expected): bool
    {
        return is_string($stored)
            && (hash_equals($stored, $expected) || hash_equals('sha256:'.$stored, $expected));
    }

    private function fault(string $code, string $message, ?\Throwable $previous = null): TalosBrowserEvidenceException
    {
        return new TalosBrowserEvidenceException($code, $message, previous: $previous);
    }
}
