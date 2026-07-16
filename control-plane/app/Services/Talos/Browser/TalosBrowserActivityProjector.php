<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

final class TalosBrowserActivityProjector
{
    private const EVENT_TYPES = ['browser.command.succeeded', 'browser.command.failed'];

    private const OPERATIONS = ['navigate', 'snapshot', 'screenshot', 'read', 'click'];

    /** @return list<array<string, mixed>> */
    public function forRun(TalosRun $run): array
    {
        return $this->projectionForRun($run)['activities'];
    }

    /** @return array{activities: list<array<string, mixed>>, context: array<string, mixed>|null} */
    public function projectionForRun(TalosRun $run): array
    {
        $events = $this->eventsForRun($run);
        $ownerUserId = (int) ($run->user_id ?: $run->session()->value('user_id'));
        if ($ownerUserId <= 0 || ! is_string($run->session_id) || $run->session_id === '') {
            return ['activities' => [], 'context' => null];
        }

        $sessionIds = $this->browserSessionIds($events);
        $sessions = TalosBrowserSession::query()
            ->where('user_id', $ownerUserId)
            ->where('talos_session_id', $run->session_id)
            ->whereIn('id', $sessionIds)
            ->get()
            ->keyBy('id');
        $evidenceByRun = $this->reconciledEvidenceForRuns([(string) $run->id], $ownerUserId, (string) $run->session_id);
        $artifacts = $this->artifactsForEvents($events, $ownerUserId, $sessions->keys()->all());

        return $this->project($run, $events, $sessions, $artifacts, $evidenceByRun);
    }

    /**
     * Rebuilds server-owned Browser evidence in memory for every message. Existing
     * metadata is never authoritative, even when it has a canonical-looking shape.
     *
     * @param EloquentCollection<int, TalosMessage> $messages
     */
    public function projectMissingForSession(EloquentCollection $messages, TalosSession $session): void
    {
        $runIds = $messages
            ->filter(static fn (TalosMessage $message): bool => $message->role === 'assistant'
                && is_string($message->run_id)
                && $message->run_id !== '')
            ->pluck('run_id')
            ->filter(static fn (mixed $runId): bool => is_string($runId))
            ->unique()
            ->values();

        $runs = TalosRun::query()
            ->where('session_id', $session->id)
            ->where('user_id', $session->user_id)
            ->whereIn('id', $runIds->all())
            ->with(['events' => static fn ($query) => $query
                ->whereIn('event_type', self::EVENT_TYPES)
                ->orderBy('sequence')])
            ->get()
            ->keyBy('id');
        $events = $runs->flatMap(static fn (TalosRun $run) => $run->getRelation('events'));
        $sessions = TalosBrowserSession::query()
            ->where('user_id', $session->user_id)
            ->where('talos_session_id', $session->id)
            ->whereIn('id', $this->browserSessionIds($events))
            ->get()
            ->keyBy('id');
        $evidenceByRun = $this->reconciledEvidenceForRuns(
            $runIds->all(),
            (int) $session->user_id,
            (string) $session->id,
        );
        $artifacts = $this->artifactsForEvents($events, (int) $session->user_id, $sessions->keys()->all());

        foreach ($messages as $message) {
            $metadata = is_array($message->metadata) ? $message->metadata : [];
            unset($metadata['browser_activities'], $metadata['used_browser_context']);

            $run = $message->role === 'assistant' && is_string($message->run_id)
                ? $runs->get($message->run_id)
                : null;
            if ($run instanceof TalosRun) {
                $projection = $this->project($run, $run->getRelation('events'), $sessions, $artifacts, $evidenceByRun);
                if ($projection['activities'] !== []) {
                    $metadata['browser_activities'] = $projection['activities'];
                }
                if (is_array($projection['context'])) {
                    $metadata['used_browser_context'] = $projection['context'];
                }
            }

            $message->forceFill(['metadata' => $metadata]);
        }
    }

    /** @return Collection<int, mixed> */
    private function eventsForRun(TalosRun $run): Collection
    {
        if ($run->relationLoaded('events')) {
            return $run->getRelation('events')
                ->filter(static fn ($event): bool => in_array($event->event_type, self::EVENT_TYPES, true))
                ->sortBy('sequence')
                ->values();
        }

        return $run->events()
            ->whereIn('event_type', self::EVENT_TYPES)
            ->orderBy('sequence')
            ->get();
    }

    /** @param Collection<int, mixed> $events @return list<string> */
    private function browserSessionIds(Collection $events): array
    {
        return $events
            ->map(static function ($event): ?string {
                $payload = is_array($event->payload) ? $event->payload : [];
                $id = $payload['browser_session_id'] ?? null;

                return is_string($id) && trim($id) !== '' ? trim($id) : null;
            })
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param Collection<int, mixed> $events
     * @param list<string> $browserSessionIds
     * @return EloquentCollection<string, TalosBrowserArtifact>
     */
    private function artifactsForEvents(Collection $events, int $ownerUserId, array $browserSessionIds): EloquentCollection
    {
        $artifactIds = $events
            ->flatMap(fn ($event): array => $this->rawArtifactIds(is_array($event->payload) ? $event->payload : []))
            ->unique()
            ->values()
            ->all();
        if ($artifactIds === [] || $browserSessionIds === []) {
            return new EloquentCollection;
        }

        return TalosBrowserArtifact::query()
            ->where('user_id', $ownerUserId)
            ->whereIn('browser_session_id', $browserSessionIds)
            ->whereIn('id', $artifactIds)
            ->get()
            ->keyBy('id');
    }

    /**
     * @param list<string> $runIds
     * @return Collection<string, Collection<int, TalosBrowserEvidenceBundle>>
     */
    private function reconciledEvidenceForRuns(array $runIds, int $ownerUserId, string $sessionId): Collection
    {
        if ($runIds === [] || $ownerUserId <= 0 || $sessionId === '') {
            return collect();
        }

        return TalosBrowserEvidenceBundle::query()
            ->from('talos_browser_evidence_bundles as projection_evidence')
            ->join('talos_browser_tasks as projection_tasks', function ($join): void {
                $join->on('projection_tasks.id', '=', 'projection_evidence.task_id')
                    ->on('projection_tasks.user_id', '=', 'projection_evidence.user_id')
                    ->on('projection_tasks.talos_session_id', '=', 'projection_evidence.talos_session_id');
            })
            ->join('talos_browser_actions as projection_actions', function ($join): void {
                $join->on('projection_actions.id', '=', 'projection_evidence.action_id')
                    ->on('projection_actions.task_id', '=', 'projection_evidence.task_id')
                    ->on('projection_actions.user_id', '=', 'projection_evidence.user_id')
                    ->on('projection_actions.talos_session_id', '=', 'projection_evidence.talos_session_id');
            })
            ->join('talos_messages as projection_origins', function ($join): void {
                $join->on('projection_origins.id', '=', 'projection_tasks.origin_message_id')
                    ->on('projection_origins.session_id', '=', 'projection_tasks.talos_session_id');
            })
            ->where('projection_evidence.user_id', $ownerUserId)
            ->where('projection_evidence.talos_session_id', $sessionId)
            ->whereNotNull('projection_evidence.reconciled_at')
            ->whereIn('projection_actions.status', ['evidence_committed', 'verified'])
            ->whereIn('projection_origins.run_id', $runIds)
            ->get([
                'projection_evidence.*',
                'projection_origins.run_id as projection_run_id',
                'projection_tasks.browser_session_id as projection_browser_session_id',
                'projection_actions.kind as projection_action_kind',
            ])
            ->groupBy(static fn (TalosBrowserEvidenceBundle $bundle): string => (string) $bundle->getAttribute('projection_run_id'));
    }

    /**
     * @param Collection<int, mixed> $events
     * @param EloquentCollection<string, TalosBrowserSession> $sessions
     * @param EloquentCollection<string, TalosBrowserArtifact> $artifacts
     * @param Collection<string, Collection<int, TalosBrowserEvidenceBundle>> $evidenceByRun
     * @return array{activities: list<array<string, mixed>>, context: array<string, mixed>|null}
     */
    private function project(
        TalosRun $run,
        Collection $events,
        EloquentCollection $sessions,
        EloquentCollection $artifacts,
        Collection $evidenceByRun,
    ): array
    {
        $activities = [];
        $contextArtifacts = [];
        $runEvidence = $evidenceByRun->get((string) $run->id, collect());
        if (! $runEvidence instanceof Collection) {
            $runEvidence = collect();
        }

        foreach ($events as $event) {
            $payload = is_array($event->payload) ? $event->payload : [];
            $operation = is_string($payload['operation'] ?? null) ? trim($payload['operation']) : '';
            $browserSessionId = is_string($payload['browser_session_id'] ?? null)
                ? trim($payload['browser_session_id'])
                : '';
            if (! in_array($operation, self::OPERATIONS, true)
                || $browserSessionId === ''
                || ! $sessions->has($browserSessionId)) {
                continue;
            }

            $rawArtifactIds = $this->rawArtifactIds($payload);
            $bundle = $event->event_type === 'browser.command.succeeded'
                ? $this->matchingEvidenceBundle($runEvidence, $operation, $browserSessionId, $rawArtifactIds)
                : null;
            if ($event->event_type === 'browser.command.succeeded' && ! $bundle instanceof TalosBrowserEvidenceBundle) {
                continue;
            }
            $bundleSourceIds = $bundle instanceof TalosBrowserEvidenceBundle
                ? $this->bundleSourceIds($bundle)
                : [];
            $validArtifacts = [];
            foreach ($rawArtifactIds as $artifactId) {
                $artifact = $artifacts->get($artifactId);
                if ($artifact instanceof TalosBrowserArtifact
                    && (string) $artifact->browser_session_id === $browserSessionId
                    && ($bundle === null || in_array($artifactId, $bundleSourceIds, true))) {
                    $validArtifacts[] = $artifact;
                }
            }
            if ($event->event_type === 'browser.command.succeeded' && $validArtifacts !== []) {
                $contextArtifacts = $validArtifacts;
            }

            $activities[] = [
                'id' => (string) $event->id,
                'operation' => $operation,
                'status' => $event->event_type === 'browser.command.succeeded' ? 'succeeded' : 'failed',
                'label' => ucfirst(str_replace('_', ' ', $operation)),
                'run_id' => (string) $run->id,
                'browser_session_id' => $browserSessionId,
                'artifact_ids' => array_values(array_map(
                    static fn (TalosBrowserArtifact $artifact): string => (string) $artifact->id,
                    $validArtifacts,
                )),
                'occurred_at' => $event->occurred_at?->toJSON() ?? $event->created_at?->toJSON(),
                'error_code' => is_string($payload['error_code'] ?? null) ? $payload['error_code'] : null,
            ];
        }

        return [
            'activities' => $activities,
            'context' => $this->contextFromArtifacts($contextArtifacts, $sessions),
        ];
    }

    /**
     * @param Collection<int, TalosBrowserEvidenceBundle> $bundles
     * @param list<string> $eventArtifactIds
     */
    private function matchingEvidenceBundle(
        Collection $bundles,
        string $operation,
        string $browserSessionId,
        array $eventArtifactIds,
    ): ?TalosBrowserEvidenceBundle {
        foreach ($bundles as $bundle) {
            if (! $bundle instanceof TalosBrowserEvidenceBundle
                || (string) $bundle->getAttribute('projection_browser_session_id') !== $browserSessionId
                || (string) $bundle->getAttribute('projection_action_kind') !== $operation) {
                continue;
            }
            $sourceIds = $this->bundleSourceIds($bundle);
            if ($sourceIds === []
                || ($eventArtifactIds !== [] && array_intersect($eventArtifactIds, $sourceIds) === [])) {
                continue;
            }

            return $bundle;
        }

        return null;
    }

    /** @return list<string> */
    private function bundleSourceIds(TalosBrowserEvidenceBundle $bundle): array
    {
        $ids = [];
        foreach ([$bundle->snapshot_artifact_id, $bundle->screenshot_artifact_id] as $artifactId) {
            if (is_string($artifactId) && trim($artifactId) !== '') {
                $ids[] = trim($artifactId);
            }
        }
        $claims = is_array($bundle->claims) ? $bundle->claims : [];
        foreach ($claims as $claim) {
            $artifactId = is_array($claim) ? ($claim['source_artifact_id'] ?? null) : null;
            if (is_string($artifactId) && trim($artifactId) !== '') {
                $ids[] = trim($artifactId);
            }
        }

        return array_values(array_unique($ids));
    }

    /** @param array<string, mixed> $payload @return list<string> */
    private function rawArtifactIds(array $payload): array
    {
        $ids = is_array($payload['evidence_ids'] ?? null)
            ? $payload['evidence_ids']
            : (is_array($payload['artifact_ids'] ?? null) ? $payload['artifact_ids'] : []);

        return array_values(array_unique(array_filter(
            $ids,
            static fn (mixed $id): bool => is_string($id) && trim($id) !== '',
        )));
    }

    /**
     * @param list<TalosBrowserArtifact> $artifacts
     * @param EloquentCollection<string, TalosBrowserSession> $sessions
     * @return array<string, mixed>|null
     */
    private function contextFromArtifacts(array $artifacts, EloquentCollection $sessions): ?array
    {
        $snapshot = null;
        $screenshot = null;
        foreach ($artifacts as $artifact) {
            if ($artifact->type === 'snapshot') {
                $snapshot = $artifact;
            } elseif ($artifact->type === 'screenshot') {
                $screenshot = $artifact;
            }
        }
        $anchor = $snapshot ?? $screenshot;
        if (! $anchor instanceof TalosBrowserArtifact) {
            return null;
        }

        $session = $sessions->get((string) $anchor->browser_session_id);
        if (! $session instanceof TalosBrowserSession) {
            return null;
        }
        $metadata = is_array($anchor->metadata) ? $anchor->metadata : [];
        $isCurrent = ($snapshot instanceof TalosBrowserArtifact
                && (string) $session->last_snapshot_artifact_id === (string) $snapshot->id)
            || ($snapshot === null
                && $screenshot instanceof TalosBrowserArtifact
                && (string) $session->last_screenshot_artifact_id === (string) $screenshot->id);

        $context = [
            'session_id' => (string) $session->id,
            'browser_session_id' => (string) $session->id,
            'url' => is_string($metadata['url'] ?? null)
                ? TalosBrowserRedactor::url($metadata['url'])
                : ($isCurrent ? $session->current_url : null),
            'title' => is_string($metadata['title'] ?? null)
                ? $metadata['title']
                : ($isCurrent ? $session->current_title : null),
            'state_version' => $anchor->state_version
                ?? (is_int($metadata['state_version'] ?? null) ? $metadata['state_version'] : ($isCurrent ? (int) $session->worker_state_version : null)),
            'evidence_hash' => 'sha256:'.$anchor->sha256,
            'untrusted' => true,
        ];
        if ($snapshot instanceof TalosBrowserArtifact) {
            $context['snapshot_artifact_id'] = (string) $snapshot->id;
            $context['text_digest'] = is_string($snapshot->metadata['text_digest'] ?? null)
                ? $snapshot->metadata['text_digest']
                : null;
        }
        if ($screenshot instanceof TalosBrowserArtifact) {
            $context['screenshot_artifact_id'] = (string) $screenshot->id;
        }

        return $context;
    }
}
