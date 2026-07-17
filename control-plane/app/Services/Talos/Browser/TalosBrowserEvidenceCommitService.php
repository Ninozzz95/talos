<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosRunArtifact;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Services\Security\CanonicalHttpUrl;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserEvidenceBundle as CoreEvidenceBundle;
use Kadmos\Tool\ProceduralLoopGuard;
use Ramsey\Uuid\Uuid;

final readonly class TalosBrowserEvidenceCommitService
{
    private const BROWSER_ACTION_BY_TOOL = [
        'browser_navigate' => 'navigate',
        'browser_snapshot' => 'snapshot',
        'browser_read' => 'read',
        'browser_take_screenshot' => 'screenshot',
        'browser_click' => 'click',
        'browser_file_upload' => 'upload',
    ];

    public function __construct(private TalosBrowserArtifactReader $artifactReader) {}

    public function commit(TalosBrowserEvidenceCommitRequest $request): TalosBrowserEvidenceBundle
    {
        return DB::transaction(function () use ($request): TalosBrowserEvidenceBundle {
            [$task, $action, $session, $call, $turn] = $this->canonicalContext($request);

            $this->assertRequest($request, $task, $action, $session, $call, $turn);
            $sources = $this->resolveSources($request, $session, $call, $turn);
            $claims = $sources['claims'];
            $snapshot = $this->singleBrowserArtifact($sources['browser_artifacts'], 'snapshot');
            $screenshot = $this->singleBrowserArtifact($sources['browser_artifacts'], 'screenshot');
            [$url, $title] = $this->pageIdentity($session, $snapshot, $screenshot, $sources['run_artifacts']);
            $capturedAt = $this->capturedAt($sources['browser_artifacts'], $sources['run_artifacts'], $action->committed_at?->toISOString());
            $previous = TalosBrowserEvidenceBundle::query()
                ->where('task_id', $task->id)
                ->where('user_id', $task->user_id)
                ->where('talos_session_id', $task->talos_session_id)
                ->whereNotNull('reconciled_at')
                ->where('worker_state_version', '<=', (int) $session->worker_state_version)
                ->latest('worker_state_version')
                ->latest('captured_at')
                ->first();
            $frame = [
                'frame_id' => 'frame-'.substr(hash('sha256', $action->id."\0".$session->worker_state_version."\0".ProceduralLoopGuard::canonicalJson($claims)), 0, 48),
                'viewport_width' => (int) $session->viewport_width,
                'viewport_height' => (int) $session->viewport_height,
                'device_pixel_ratio' => (int) ($session->device_scale_factor ?? 1),
                'scroll_x' => 0,
                'scroll_y' => 0,
            ];
            $seed = [
                'schema_version' => 'talos.browser.evidence.v1',
                'task_id' => (string) $task->id,
                'action_id' => (string) $action->id,
                'result_sha256' => $request->resultSha256,
                'worker_state_version' => (int) $session->worker_state_version,
                'url' => $url,
                'title' => $title,
                'captured_at' => $capturedAt,
                'frame' => $frame,
                'snapshot_artifact_id' => $snapshot?->id,
                'screenshot_artifact_id' => $screenshot?->id,
                'before_evidence_id' => $previous?->id,
                'claims' => $claims,
            ];
            $integrity = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($seed));
            $existing = TalosBrowserEvidenceBundle::query()
                ->where('action_id', $action->id)
                ->lockForUpdate()
                ->first();
            if ($existing instanceof TalosBrowserEvidenceBundle) {
                if (! hash_equals((string) $existing->integrity_sha256, $integrity)) {
                    throw $this->fault('TALOS_BROWSER_EVIDENCE_COMMIT_CONFLICT', 'Browser action already owns a different evidence bundle.');
                }

                return $existing;
            }

            $evidenceId = (string) Uuid::uuid5(Uuid::NAMESPACE_URL, 'talos.browser.evidence.v1:'.$action->id.':'.$integrity);
            $canonical = [
                ...$seed,
                'evidence_id' => $evidenceId,
                'integrity_sha256' => $integrity,
            ];
            unset($canonical['result_sha256']);
            try {
                CoreEvidenceBundle::fromArray($canonical);
            } catch (InvalidArgumentException $exception) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_CONTRACT_INVALID', 'Browser evidence failed the canonical v1 contract.', previous: $exception);
            }

            $bundle = new TalosBrowserEvidenceBundle;
            $bundle->forceFill([
                'id' => $evidenceId,
                'schema_version' => 'talos.browser.evidence.v1',
                'task_id' => $task->id,
                'action_id' => $action->id,
                'user_id' => $task->user_id,
                'talos_session_id' => $task->talos_session_id,
                'worker_state_version' => (int) $session->worker_state_version,
                'url' => $url,
                'title' => $title,
                'captured_at' => $capturedAt,
                'frame' => $frame,
                ...$this->artifactFields('snapshot', $snapshot),
                ...$this->artifactFields('screenshot', $screenshot),
                'before_evidence_id' => $previous?->id,
                'integrity_sha256' => $integrity,
                'claims' => $claims,
                'committed_at' => now(),
                'reconciled_at' => null,
            ])->save();

            return $bundle->refresh();
        }, 3);
    }

    /** @return list<array{claim_id: string, kind: string, value: string, source_artifact_id: string}> */
    public function canonicalClaims(TalosBrowserEvidenceCommitRequest $request): array
    {
        return DB::transaction(function () use ($request): array {
            [$task, $action, $session, $call, $turn] = $this->canonicalContext($request);
            $this->assertRequest($request, $task, $action, $session, $call, $turn);

            return $this->resolveSources($request, $session, $call, $turn)['claims'];
        }, 3);
    }

    /** @return array{TalosBrowserTask, \App\Models\TalosBrowserAction, TalosBrowserSession, TalosToolCall, TalosToolTurn} */
    private function canonicalContext(TalosBrowserEvidenceCommitRequest $request): array
    {
        $task = TalosBrowserTask::query()
            ->ownedBy((int) $request->task->user_id)
            ->whereKey($request->task->id)
            ->lockForUpdate()
            ->first();
        $action = $request->action->newQuery()
            ->ownedBy((int) $request->task->user_id)
            ->whereKey($request->action->id)
            ->where('task_id', $request->task->id)
            ->lockForUpdate()
            ->first();
        $session = TalosBrowserSession::query()
            ->whereKey($request->browserSession->id)
            ->where('user_id', $request->task->user_id)
            ->where('talos_session_id', $request->task->talos_session_id)
            ->lockForUpdate()
            ->first();
        if (! $task instanceof TalosBrowserTask
            || ! $action instanceof \App\Models\TalosBrowserAction
            || ! $session instanceof TalosBrowserSession) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence lost its owned task, action or session scope.');
        }
        $originRunId = $task->originMessage()->value('run_id');
        $call = TalosToolCall::query()
            ->whereKey($request->call->id)
            ->where('user_id', $task->user_id)
            ->where('run_id', $originRunId)
            ->whereIn('tool_name', array_keys(self::BROWSER_ACTION_BY_TOOL))
            ->lockForUpdate()
            ->first();
        $turn = $call instanceof TalosToolCall
            ? TalosToolTurn::query()
                ->whereKey($call->tool_turn_id)
                ->where('user_id', $task->user_id)
                ->where('session_id', $task->talos_session_id)
                ->where('browser_session_id', $session->id)
                ->where('run_id', $originRunId)
                ->lockForUpdate()
                ->first()
            : null;
        if (! $call instanceof TalosToolCall || ! $turn instanceof TalosToolTurn) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence call or parent turn is outside the owned task scope.');
        }

        return [$task, $action, $session, $call, $turn];
    }

    private function assertRequest(
        TalosBrowserEvidenceCommitRequest $request,
        TalosBrowserTask $task,
        \App\Models\TalosBrowserAction $action,
        TalosBrowserSession $session,
        TalosToolCall $call,
        TalosToolTurn $turn,
    ): void {
        $originRunId = $task->originMessage()->value('run_id');
        $canonicalResultSha256 = 'sha256:'.hash(
            'sha256',
            ProceduralLoopGuard::canonicalJson($request->result->toWireArray()),
        );
        if ($request->result->isError
            || $request->result->evidence === []
            || preg_match('/^sha256:[a-f0-9]{64}$/D', $request->resultSha256) !== 1
            || ! hash_equals($canonicalResultSha256, $request->resultSha256)
            || ! is_string($action->result_sha256)
            || ! hash_equals($action->result_sha256, $request->resultSha256)
            || ! in_array($action->status, ['committed', 'evidence_committed', 'verified'], true)
            || (string) $action->intent_id !== (string) $call->logical_call_id
            || (string) $request->result->toolUseId !== (string) $call->provider_call_id
            || (string) $request->call->id !== (string) $call->id
            || (string) $request->call->tool_turn_id !== (string) $call->tool_turn_id
            || (string) $request->call->logical_call_id !== (string) $call->logical_call_id
            || (string) $request->call->provider_call_id !== (string) $call->provider_call_id
            || (string) $request->call->tool_name !== (string) $call->tool_name
            || (int) $call->user_id !== (int) $task->user_id
            || (string) $call->run_id !== (string) $originRunId
            || (int) $turn->user_id !== (int) $task->user_id
            || (string) $turn->session_id !== (string) $task->talos_session_id
            || (string) $turn->browser_session_id !== (string) $session->id
            || (string) $turn->run_id !== (string) $originRunId
            || (self::BROWSER_ACTION_BY_TOOL[(string) $call->tool_name] ?? null) !== (string) $action->kind
            || (string) $task->browser_session_id !== (string) $session->id
            || (int) $session->worker_state_version !== $this->expectedCommittedStateVersion($action)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', 'Browser evidence request does not match its action, call, result or worker state.');
        }
    }

    private function expectedCommittedStateVersion(\App\Models\TalosBrowserAction $action): int
    {
        $delta = in_array((string) $action->kind, ['navigate', 'click', 'upload'], true) ? 1 : 0;

        return (int) $action->expected_state_version + $delta;
    }

    /**
     * @return array{
     *   claims: list<array{claim_id: string, kind: string, value: string, source_artifact_id: string}>,
     *   browser_artifacts: Collection<string, TalosBrowserArtifact>,
     *   run_artifacts: Collection<string, TalosRunArtifact>
     * }
     */
    private function resolveSources(
        TalosBrowserEvidenceCommitRequest $request,
        TalosBrowserSession $session,
        TalosToolCall $call,
        TalosToolTurn $turn,
    ): array
    {
        $evidence = $request->result->evidence;
        $ids = [];
        foreach ($evidence as $item) {
            $id = $item['artifact_id'] ?? null;
            if (! is_string($id) || ! Str::isUuid($id) || isset($ids[$id])) {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser evidence contains a missing, malformed or duplicate source identity.');
            }
            $ids[$id] = true;
        }
        $artifactIds = array_keys($ids);
        $browserArtifacts = TalosBrowserArtifact::query()
            ->whereIn('id', $artifactIds)
            ->where('user_id', $request->task->user_id)
            ->where('browser_session_id', $session->id)
            ->get()
            ->keyBy('id');
        $runArtifacts = TalosRunArtifact::query()
            ->whereIn('id', $artifactIds)
            ->where('run_id', $call->run_id)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->keyBy('id');
        $browserLinks = TalosRunArtifact::query()
            ->where('run_id', $call->run_id)
            ->whereIn('uri', array_map(static fn (string $id): string => 'talos-browser-artifact://'.$id, $browserArtifacts->keys()->all()))
            ->get()
            ->groupBy(static fn (TalosRunArtifact $artifact): string => substr((string) $artifact->uri, strlen('talos-browser-artifact://')));
        $claims = [];
        foreach ($evidence as $item) {
            $id = (string) $item['artifact_id'];
            $kind = $item['kind'] ?? null;
            $sha256 = $item['sha256'] ?? null;
            $boundary = $item['trusted_boundary'] ?? null;
            if (! is_string($kind)
                || preg_match('/^[a-z][a-z0-9_]{0,127}$/D', $kind) !== 1
                || ! is_string($sha256)
                || preg_match('/^sha256:[a-f0-9]{64}$/D', $sha256) !== 1
                || $boundary !== 'untrusted_browser_content') {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser evidence source metadata is invalid.');
            }

            $browserArtifact = $browserArtifacts->get($id);
            $runArtifact = $runArtifacts->get($id);
            if ($browserArtifact instanceof TalosBrowserArtifact) {
                $linkCandidates = $browserLinks->get($id, collect());
                $matchingLinks = $linkCandidates->filter(static function (TalosRunArtifact $candidate) use ($call): bool {
                    $metadata = is_array($candidate->metadata) ? $candidate->metadata : [];

                    return is_string($metadata['tool_turn_id'] ?? null)
                        && is_string($metadata['provider_call_id'] ?? null)
                        && hash_equals((string) $call->tool_turn_id, $metadata['tool_turn_id'])
                        && hash_equals((string) $call->provider_call_id, $metadata['provider_call_id']);
                })->values();
                if ($matchingLinks->count() !== 1) {
                    throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser artifact does not have one durable link to the current tool call.');
                }
                $link = $matchingLinks->first();
                $metadata = $link instanceof TalosRunArtifact && is_array($link->metadata) ? $link->metadata : [];
                if (! $link instanceof TalosRunArtifact
                    || ! $this->browserArtifactAllowedForCall($browserArtifact, $call, $kind)
                    || ! is_string($browserArtifact->sha256)
                    || ! hash_equals($sha256, 'sha256:'.$browserArtifact->sha256)
                    || (string) $browserArtifact->trust_boundary !== 'untrusted_browser_content'
                    || ! is_int($browserArtifact->state_version)
                    || (int) $browserArtifact->state_version !== (int) $session->worker_state_version
                    || (string) $link->artifact_type !== 'browser_'.$browserArtifact->type
                    || (string) $link->mime_type !== (string) $browserArtifact->mime
                    || (string) $link->uri !== 'talos-browser-artifact://'.$id
                    || (string) ($metadata['browser_artifact_id'] ?? '') !== $id
                    || (string) ($metadata['browser_session_id'] ?? '') !== (string) $session->id
                    || (string) ($metadata['tool_turn_id'] ?? '') !== (string) $call->tool_turn_id
                    || (string) ($metadata['provider_call_id'] ?? '') !== (string) $call->provider_call_id
                    || (string) ($metadata['trust'] ?? '') !== 'untrusted'
                    || ! $this->metadataHashMatches($metadata['sha256'] ?? null, $sha256)) {
                    throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser artifact is not durably linked to the current run and tool call.');
                }
            } elseif ($runArtifact instanceof TalosRunArtifact) {
                $this->assertNavigationRunArtifact($runArtifact, $call, $turn, $session, $kind, $sha256);
            } else {
                throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', 'A claimed Browser evidence source is absent from the owned run.');
            }

            $claims[] = [
                'claim_id' => 'claim-'.substr(hash('sha256', $request->action->id."\0".$id."\0".$kind), 0, 48),
                'kind' => $kind,
                'value' => $sha256,
                'source_artifact_id' => $id,
            ];
        }

        return [
            'claims' => $claims,
            'browser_artifacts' => $browserArtifacts,
            'run_artifacts' => $runArtifacts,
        ];
    }

    private function browserArtifactAllowedForCall(
        TalosBrowserArtifact $artifact,
        TalosToolCall $call,
        string $kind,
    ): bool {
        $type = (string) $artifact->type;
        $mime = (string) $artifact->mime;
        if (($type === 'snapshot' && $mime !== 'application/json')
            || ($type === 'screenshot' && $mime !== 'image/png')
            || ! in_array($type, ['snapshot', 'screenshot'], true)) {
            return false;
        }

        return match ((string) $call->tool_name) {
            'browser_snapshot' => $type === 'snapshot' && $kind === 'snapshot',
            'browser_read' => $type === 'snapshot' && $kind === 'snapshot_read',
            'browser_take_screenshot' => $type === 'screenshot' && $kind === 'screenshot',
            'browser_click' => $kind === $type,
            'browser_file_upload' => $kind === $type,
            'browser_navigate' => $kind === $type,
            default => false,
        };
    }

    private function assertNavigationRunArtifact(
        TalosRunArtifact $artifact,
        TalosToolCall $call,
        TalosToolTurn $turn,
        TalosBrowserSession $session,
        string $kind,
        string $sha256,
    ): void {
        $metadata = is_array($artifact->metadata) ? $artifact->metadata : [];
        $observation = is_array($metadata['observation'] ?? null) ? $metadata['observation'] : null;
        $expectedUri = 'talos-tool-evidence://'.hash('sha256', implode('|', [
            (string) $turn->id,
            (string) $call->provider_call_id,
            'browser_navigation',
            '0',
        ]));
        $observationSha256 = is_array($observation)
            ? 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($observation))
            : null;
        if ((string) $call->tool_name !== 'browser_navigate'
            || $kind !== 'navigation'
            || (string) $artifact->artifact_type !== 'browser_navigation'
            || (string) $artifact->mime_type !== 'application/json'
            || (string) $artifact->uri !== $expectedUri
            || (string) ($metadata['browser_session_id'] ?? '') !== (string) $session->id
            || (string) ($metadata['tool_turn_id'] ?? '') !== (string) $turn->id
            || (string) ($metadata['provider_call_id'] ?? '') !== (string) $call->provider_call_id
            || (string) ($metadata['trust'] ?? '') !== 'untrusted'
            || ! is_string($observationSha256)
            || ! hash_equals($sha256, $observationSha256)
            || ! $this->metadataHashMatches($metadata['sha256'] ?? null, $sha256)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Run evidence is not an allowlisted navigation source for the current Browser call.');
        }
    }

    private function singleBrowserArtifact(Collection $artifacts, string $type): ?TalosBrowserArtifact
    {
        $matching = $artifacts->filter(static fn (TalosBrowserArtifact $artifact): bool => $artifact->type === $type)->values();
        if ($matching->count() > 1) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', "Browser evidence contains more than one {$type} artifact.");
        }

        $artifact = $matching->first();

        return $artifact instanceof TalosBrowserArtifact ? $artifact : null;
    }

    /** @return array<string, mixed> */
    private function artifactFields(string $prefix, ?TalosBrowserArtifact $artifact): array
    {
        if (! $artifact instanceof TalosBrowserArtifact) {
            return [
                $prefix.'_artifact_id' => null,
                $prefix.'_mime' => null,
                $prefix.'_sha256' => null,
                $prefix.'_byte_size' => null,
                $prefix.'_width' => null,
                $prefix.'_height' => null,
                $prefix.'_redaction_status' => null,
            ];
        }
        $metadata = is_array($artifact->metadata) ? $artifact->metadata : [];
        $redaction = $metadata['redaction_status'] ?? 'none';
        if (! in_array($redaction, ['none', 'redacted', 'quarantined'], true)) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser artifact redaction state is invalid.');
        }

        return [
            $prefix.'_artifact_id' => $artifact->id,
            $prefix.'_mime' => $artifact->mime,
            $prefix.'_sha256' => 'sha256:'.$artifact->sha256,
            $prefix.'_byte_size' => $metadata['size_bytes'] ?? null,
            $prefix.'_width' => $metadata['width'] ?? null,
            $prefix.'_height' => $metadata['height'] ?? null,
            $prefix.'_redaction_status' => $redaction,
        ];
    }

    private function capturedAt(Collection $browserArtifacts, Collection $runArtifacts, ?string $fallback): string
    {
        $createdAt = $browserArtifacts->pluck('created_at')->merge($runArtifacts->pluck('created_at'))->filter()->sort()->first();

        return $createdAt?->toISOString() ?? $fallback ?? now()->toISOString();
    }

    private function canonicalUrl(string $url): string
    {
        if ($url === 'about:blank') {
            return $url;
        }

        try {
            return CanonicalHttpUrl::fromString($url)->toAsciiString();
        } catch (InvalidArgumentException $exception) {
            throw $this->fault('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', 'Browser evidence does not have a supported canonical page URL.', previous: $exception);
        }
    }

    /** @return array{string, string} */
    private function pageIdentity(
        TalosBrowserSession $session,
        ?TalosBrowserArtifact $snapshot,
        ?TalosBrowserArtifact $screenshot,
        Collection $runArtifacts,
    ): array {
        $candidates = [];
        if ($snapshot instanceof TalosBrowserArtifact) {
            try {
                $decoded = json_decode($this->artifactReader->read($snapshot), false, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException $exception) {
                throw $this->fault(
                    'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                    'Browser snapshot evidence is not valid canonical JSON.',
                    previous: $exception,
                );
            }
            if ($decoded instanceof \stdClass) {
                $candidates[] = [
                    'url' => property_exists($decoded, 'url') ? $decoded->url : null,
                    'title' => property_exists($decoded, 'title') ? $decoded->title : null,
                ];
            }
        }
        foreach ($runArtifacts as $runArtifact) {
            if (! $runArtifact instanceof TalosRunArtifact || (string) $runArtifact->artifact_type !== 'browser_navigation') {
                continue;
            }
            $metadata = is_array($runArtifact->metadata) ? $runArtifact->metadata : [];
            $observation = is_array($metadata['observation'] ?? null) ? $metadata['observation'] : [];
            $candidates[] = $observation;
        }
        foreach ([$snapshot, $screenshot] as $artifact) {
            if ($artifact instanceof TalosBrowserArtifact && is_array($artifact->metadata)) {
                $candidates[] = $artifact->metadata;
            }
        }
        $candidates[] = ['url' => $session->current_url, 'title' => $session->current_title];

        $identity = null;
        foreach ($candidates as $candidate) {
            $candidateUrl = $candidate['url'] ?? null;
            if ($candidateUrl === null || $candidateUrl === '') {
                continue;
            }
            if (! is_string($candidateUrl)) {
                throw $this->fault(
                    'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                    'Browser evidence page URL is not a canonical string.',
                );
            }
            $candidateUrl = trim($candidateUrl);
            if ($candidateUrl === '') {
                continue;
            }
            $url = $this->canonicalUrl($candidateUrl);
            $candidateTitle = $candidate['title'] ?? null;
            if ($candidateTitle !== null && ! is_string($candidateTitle)) {
                throw $this->fault(
                    'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                    'Browser evidence page title is not a canonical string.',
                );
            }
            $title = mb_substr(trim((string) $candidateTitle), 0, 512);

            if ($identity === null) {
                $identity = [$url, $title];

                continue;
            }
            if (! hash_equals($identity[0], $url)
                || ($identity[1] !== '' && $title !== '' && ! hash_equals($identity[1], $title))) {
                throw $this->fault(
                    'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                    'Browser evidence page identity conflicts across its canonical sources.',
                );
            }
            if ($identity[1] === '' && $title !== '') {
                $identity[1] = $title;
            }
        }

        if ($identity !== null) {
            return $identity;
        }

        throw $this->fault(
            'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
            'Browser evidence does not contain a supported canonical page identity.',
        );
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
