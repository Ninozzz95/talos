<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\TalosAuditEvent;
use App\Models\TalosContextSet;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosRunEvent;
use App\Models\TalosSession;
use App\Services\Talos\Browser\TalosBrowserLegacyV1Adapter;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

final class TalosSessionExportService
{
    public function __construct(private readonly TalosBrowserLegacyV1Adapter $legacyBrowser) {}

    /**
     * @return array<string, mixed>
     */
    public function jsonEvidencePack(TalosSession $session): array
    {
        $messages = $this->messages($session);
        $runs = $this->runs($session);
        $modelProfiles = $this->modelProfiles($messages, $runs);
        $contextManifest = $this->contextManifest($messages, $runs);
        $benchmarkReadiness = $this->benchmarkReadiness($session, $runs);

        return [
            'schema_version' => 1,
            'report_type' => 'talos_session_export',
            'export_status' => 'complete',
            'exported_at' => now()->toJSON(),
            'available_formats' => ['json', 'markdown', 'context_manifest', 'benchmark_scenario'],
            'session' => $this->sessionPayload($session),
            'messages' => $messages
                ->map(fn (TalosMessage $message): array => $this->messagePayload($message, $modelProfiles))
                ->values()
                ->all(),
            'runs' => $runs
                ->map(fn (TalosRun $run): array => $this->runPayload($run, $modelProfiles))
                ->values()
                ->all(),
            'browser_legacy_projection' => $this->legacyBrowser->projectForSession($session),
            'context_manifest' => $contextManifest,
            'benchmark_readiness' => $benchmarkReadiness,
            'markdown_transcript' => $this->markdown($session, $messages),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function markdownExport(TalosSession $session): array
    {
        $messages = $this->messages($session);

        return [
            'schema_version' => 1,
            'report_type' => 'talos_session_markdown_export',
            'export_status' => 'complete',
            'content_type' => 'text/markdown',
            'session_id' => $session->id,
            'exported_at' => now()->toJSON(),
            'content' => $this->markdown($session, $messages),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function contextManifestExport(TalosSession $session): array
    {
        $messages = $this->messages($session);
        $runs = $this->runs($session);

        return [
            'schema_version' => 1,
            'report_type' => 'talos_context_manifest_export',
            'export_status' => 'complete',
            'session_id' => $session->id,
            'exported_at' => now()->toJSON(),
            'context_manifest' => $this->contextManifest($messages, $runs),
        ];
    }

    /**
     * @return array{ready: bool, missing: list<string>, scenario?: array<string, mixed>}
     */
    public function benchmarkReadinessForSession(TalosSession $session): array
    {
        return $this->benchmarkReadiness($session, $this->runs($session));
    }

    public function recordAudit(TalosSession $session, string $format): void
    {
        TalosAuditEvent::record('session.exported', 'talos_session', (string) $session->id, [
            'format' => $format,
            'message_count' => $session->messages()->count(),
            'run_count' => TalosRun::query()->where('session_id', $session->id)->count(),
        ]);
    }

    /**
     * @return Collection<int, TalosMessage>
     */
    private function messages(TalosSession $session): Collection
    {
        return $session->messages()
            ->oldest('created_at')
            ->oldest('id')
            ->get();
    }

    /**
     * @return Collection<int, TalosRun>
     */
    private function runs(TalosSession $session): Collection
    {
        return TalosRun::query()
            ->where('session_id', $session->id)
            ->with(['events', 'artifacts'])
            ->oldest('created_at')
            ->oldest('id')
            ->get();
    }

    /**
     * @param  Collection<int, TalosMessage>  $messages
     * @param  Collection<int, TalosRun>  $runs
     * @return array<string, array<string, mixed>>
     */
    private function modelProfiles(Collection $messages, Collection $runs): array
    {
        $ids = $messages
            ->pluck('model_profile_id')
            ->merge($runs->pluck('model_profile_id'))
            ->filter()
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return [];
        }

        return TalosModelProfile::query()
            ->whereIn('id', $ids)
            ->get()
            ->mapWithKeys(fn (TalosModelProfile $profile): array => [
                (string) $profile->id => $this->modelProfilePayload($profile),
            ])
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function sessionPayload(TalosSession $session): array
    {
        return [
            'id' => $session->id,
            'title' => $session->title,
            'mode' => $session->mode,
            'persistence_mode' => $session->persistence_mode,
            'active_model_profile_id' => $session->active_model_profile_id,
            'metadata' => $this->redactArray($session->metadata ?? []),
            'created_at' => $session->created_at?->toJSON(),
            'updated_at' => $session->updated_at?->toJSON(),
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $modelProfiles
     * @return array<string, mixed>
     */
    private function messagePayload(TalosMessage $message, array $modelProfiles): array
    {
        $metadata = is_array($message->metadata) ? $message->metadata : [];
        $exportMetadata = $this->legacyBrowser->annotateMessageMetadata($metadata);

        return [
            'id' => $message->id,
            'role' => $message->role,
            'content' => $message->content,
            'model_profile_id' => $message->model_profile_id,
            'model_profile' => $message->model_profile_id ? ($modelProfiles[$message->model_profile_id] ?? null) : null,
            'run_id' => $message->run_id,
            'used_context' => $this->listFromMetadata($metadata, 'used_context'),
            'used_memories' => $this->listFromMetadata($metadata, 'used_memories'),
            'metadata' => $this->redactArray($exportMetadata),
            'created_at' => $message->created_at?->toJSON(),
            'updated_at' => $message->updated_at?->toJSON(),
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $modelProfiles
     * @return array<string, mixed>
     */
    private function runPayload(TalosRun $run, array $modelProfiles): array
    {
        $events = $this->runEvents($run);
        $artifacts = $this->runArtifacts($run);

        return [
            'id' => $run->id,
            'session_id' => $run->session_id,
            'model_profile_id' => $run->model_profile_id,
            'model_profile' => $run->model_profile_id ? ($modelProfiles[$run->model_profile_id] ?? null) : null,
            'context_set_id' => $run->context_set_id,
            'mode' => $run->mode,
            'status' => $run->status,
            'prompt_hash' => $run->prompt_hash,
            'context_hash' => $this->contextHash($run),
            'provider' => $run->provider,
            'model' => $run->model,
            'metadata' => $this->redactArray($run->metadata ?? []),
            'replayability_state' => [
                'replayable' => count($events) > 0,
                'events_count' => count($events),
                'artifacts_count' => count($artifacts),
            ],
            'events' => $events,
            'artifacts' => $artifacts,
            'started_at' => $run->started_at?->toJSON(),
            'completed_at' => $run->completed_at?->toJSON(),
            'created_at' => $run->created_at?->toJSON(),
            'updated_at' => $run->updated_at?->toJSON(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function modelProfilePayload(TalosModelProfile $profile): array
    {
        return [
            'id' => $profile->id,
            'provider' => $profile->provider,
            'model' => $profile->model,
            'display_name' => $profile->display_name,
            'status' => $profile->status,
            'has_secret' => filled($profile->encrypted_secret),
        ];
    }

    /**
     * @param  Collection<int, TalosMessage>  $messages
     * @param  Collection<int, TalosRun>  $runs
     * @return array<string, mixed>
     */
    private function contextManifest(Collection $messages, Collection $runs): array
    {
        $ids = $runs->pluck('context_set_id')
            ->merge($messages->flatMap(function (TalosMessage $message): array {
                $metadata = is_array($message->metadata) ? $message->metadata : [];

                return array_values(array_filter(array_map(
                    static fn (array $source): ?string => isset($source['context_set_id']) && is_string($source['context_set_id'])
                        ? $source['context_set_id']
                        : null,
                    $this->listFromMetadata($metadata, 'used_context'),
                )));
            }))
            ->filter()
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return [
                'context_set_ids' => [],
                'context_sets' => [],
            ];
        }

        $sets = TalosContextSet::query()
            ->whereIn('id', $ids)
            ->with(['sources.file', 'sources.fileChunk'])
            ->get()
            ->map(fn (TalosContextSet $contextSet): array => $this->contextSetPayload($contextSet))
            ->values()
            ->all();

        return [
            'context_set_ids' => $ids->all(),
            'context_sets' => $sets,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function contextSetPayload(TalosContextSet $contextSet): array
    {
        return [
            'id' => $contextSet->id,
            'name' => $contextSet->name,
            'status' => $contextSet->status,
            'metadata' => $this->redactArray($contextSet->metadata ?? []),
            'sources' => $contextSet->sources
                ->map(fn (TalosContextSource $source): array => $this->contextSourcePayload($source))
                ->values()
                ->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function contextSourcePayload(TalosContextSource $source): array
    {
        return [
            'id' => $source->id,
            'source_type' => $source->source_type,
            'sequence' => $source->sequence,
            'metadata' => $this->redactArray($source->metadata ?? []),
            'file' => $source->file instanceof TalosFile ? $this->filePayload($source->file) : null,
            'chunk' => $source->fileChunk instanceof TalosFileChunk ? $this->chunkPayload($source->fileChunk) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function filePayload(TalosFile $file): array
    {
        return [
            'id' => $file->id,
            'original_name' => $file->original_name,
            'mime_type' => $file->mime_type,
            'size_bytes' => $file->size_bytes,
            'checksum' => $file->checksum,
            'status' => $file->status,
            'parser' => $file->parser,
            'failure_reason' => $file->failure_reason,
            'metadata' => $this->redactArray($file->metadata ?? []),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function chunkPayload(TalosFileChunk $chunk): array
    {
        return [
            'id' => $chunk->id,
            'file_id' => $chunk->file_id,
            'sequence' => $chunk->sequence,
            'preview' => Str::limit($chunk->content, 240, '...'),
            'content_hash' => $chunk->content_hash,
            'start_offset' => $chunk->start_offset,
            'end_offset' => $chunk->end_offset,
            'metadata' => $this->redactArray($chunk->metadata ?? []),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function runEvents(TalosRun $run): array
    {
        $events = $run->relationLoaded('events')
            ? $run->events
            : $run->events()->get();

        return $events
            ->sortBy('sequence')
            ->map(fn (TalosRunEvent $event): array => $event->toApiArray())
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function runArtifacts(TalosRun $run): array
    {
        $artifacts = $run->relationLoaded('artifacts')
            ? $run->artifacts
            : $run->artifacts()->get();

        return $artifacts
            ->map(fn (TalosRunArtifact $artifact): array => [
                'id' => $artifact->id,
                'artifact_type' => $artifact->artifact_type,
                'mime_type' => $artifact->mime_type,
                'metadata' => $this->redactArray($artifact->metadata ?? []),
                'created_at' => $artifact->created_at?->toJSON(),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, TalosRun>  $runs
     * @return array{ready: bool, missing: list<string>, scenario?: array<string, mixed>}
     */
    private function benchmarkReadiness(TalosSession $session, Collection $runs): array
    {
        $run = $runs
            ->filter(fn (TalosRun $candidate): bool => $candidate->status === 'succeeded')
            ->last();

        $missing = [];

        if (! $run instanceof TalosRun) {
            $missing[] = 'succeeded_run';
        }

        if (! $run?->prompt_hash) {
            $missing[] = 'prompt_hash';
        }

        if (! $run?->prompt) {
            $missing[] = 'prompt';
        }

        if (! $run || ! $this->contextHash($run)) {
            $missing[] = 'context_hash';
        }

        if ($missing !== [] || ! $run instanceof TalosRun) {
            return [
                'ready' => false,
                'missing' => array_values(array_unique($missing)),
            ];
        }

        return [
            'ready' => true,
            'missing' => [],
            'scenario' => [
                'schema_version' => 1,
                'scenario_type' => 'talos_session_benchmark_scenario',
                'session_id' => $session->id,
                'source_run_id' => $run->id,
                'prompt' => $run->prompt,
                'prompt_hash' => $run->prompt_hash,
                'context_hash' => $this->contextHash($run),
                'model' => $run->model,
                'provider' => $run->provider,
                'evaluator_version' => $this->evaluatorVersion($run),
            ],
        ];
    }

    private function contextHash(TalosRun $run): ?string
    {
        $metadata = is_array($run->metadata) ? $run->metadata : [];
        $contextHash = $metadata['context_hash'] ?? null;

        return is_string($contextHash) && $contextHash !== '' ? $contextHash : null;
    }

    private function evaluatorVersion(TalosRun $run): string
    {
        $metadata = is_array($run->metadata) ? $run->metadata : [];
        $version = $metadata['evaluator_version'] ?? null;

        return is_string($version) && $version !== '' ? $version : 'kadmos-core-benchmark-v1';
    }

    /**
     * @param  Collection<int, TalosMessage>  $messages
     */
    private function markdown(TalosSession $session, Collection $messages): string
    {
        $lines = [
            '# TALOS Session Export',
            '',
            '- Session ID: '.$session->id,
            '- Title: '.$session->title,
            '- Exported at: '.now()->toJSON(),
            '',
            '## Messages',
        ];

        foreach ($messages as $message) {
            $lines[] = '';
            $lines[] = '### '.strtoupper((string) $message->role).' - '.($message->created_at?->toJSON() ?? 'unknown time');
            $lines[] = '';
            $lines[] = (string) $message->content;
        }

        return implode("\n", $lines)."\n";
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return list<array<string, mixed>>
     */
    private function listFromMetadata(array $metadata, string $key): array
    {
        $value = $metadata[$key] ?? [];

        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter(array_map(
            fn (mixed $item): ?array => is_array($item) ? $this->redactArray($item) : null,
            $value,
        )));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function redactArray(array $payload): array
    {
        return TalosAuditEvent::redact($payload);
    }
}
