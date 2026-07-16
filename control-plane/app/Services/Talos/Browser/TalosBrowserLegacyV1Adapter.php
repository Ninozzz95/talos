<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;

final class TalosBrowserLegacyV1Adapter
{
    public const SCHEMA_VERSION = 'talos.browser.legacy-projection.v1';

    /** @var list<string> */
    private const RESERVED_TRUST_KEYS = [
        'action_id',
        'browser_evidence_contract',
        'commit_state',
        'committed_at',
        'committed_v1',
        'evidence_id',
        'integrity_sha256',
        'projection_hash',
        'reconciled_at',
        'schema_version',
        'task_id',
    ];

    /** @return array<string, mixed> */
    public function projectForSession(TalosSession $session): array
    {
        $ownerId = (int) $session->user_id;
        $sessions = TalosBrowserSession::query()
            ->where('user_id', $ownerId)
            ->where('talos_session_id', $session->id)
            ->with([
                'events' => static fn ($query) => $query
                    ->where('user_id', $ownerId)
                    ->oldest('created_at')
                    ->oldest('id'),
                'artifacts' => static fn ($query) => $query
                    ->where('user_id', $ownerId)
                    ->oldest('created_at')
                    ->oldest('id'),
            ])
            ->oldest('created_at')
            ->oldest('id')
            ->get();

        $projection = [
            'schema_version' => self::SCHEMA_VERSION,
            'commit_state' => 'legacy_unverified',
            'committed_v1' => false,
            'talos_session_id' => (string) $session->id,
            'sessions' => $sessions
                ->map(fn (TalosBrowserSession $browserSession): array => $this->sessionPayload($browserSession))
                ->values()
                ->all(),
        ];

        $canonical = json_encode(
            $projection,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
        $projection['projection_hash'] = 'sha256:'.hash('sha256', $canonical);

        return $projection;
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array<string, mixed>
     */
    public function annotateMessageMetadata(array $metadata): array
    {
        $metadata = $this->safePayload($metadata);
        if (! array_key_exists('browser_activities', $metadata)
            && ! array_key_exists('used_browser_context', $metadata)
            && ! array_key_exists('browser_evidence_contract', $metadata)) {
            return $metadata;
        }

        $metadata['browser_evidence_contract'] = [
            'schema_version' => self::SCHEMA_VERSION,
            'commit_state' => 'legacy_unverified',
            'committed_v1' => false,
            'source' => 'legacy_message_metadata',
        ];

        return $metadata;
    }

    /** @return array<string, mixed> */
    private function sessionPayload(TalosBrowserSession $session): array
    {
        return [
            'id' => (string) $session->id,
            'status' => (string) $session->status,
            'mode' => (string) $session->mode,
            'current_url' => TalosBrowserRedactor::url(
                is_string($session->current_url) ? $session->current_url : null,
            ),
            'current_title' => is_string($session->current_title) ? $session->current_title : null,
            'viewport' => [
                'width' => (int) $session->viewport_width,
                'height' => (int) $session->viewport_height,
            ],
            'capabilities' => $this->safePayload(is_array($session->capabilities) ? $session->capabilities : []),
            'policy' => $this->safePayload(is_array($session->policy) ? $session->policy : []),
            'state_version' => (int) $session->worker_state_version,
            'events' => $session->events
                ->map(fn (TalosBrowserEvent $event): array => $this->eventPayload($event))
                ->values()
                ->all(),
            'artifacts' => $session->artifacts
                ->map(fn (TalosBrowserArtifact $artifact): array => $this->artifactPayload($artifact))
                ->values()
                ->all(),
            'created_at' => $session->created_at?->toJSON(),
            'updated_at' => $session->updated_at?->toJSON(),
        ];
    }

    /** @return array<string, mixed> */
    private function eventPayload(TalosBrowserEvent $event): array
    {
        return [
            'id' => (string) $event->id,
            'type' => (string) $event->type,
            'actor' => (string) $event->actor,
            'command_id' => is_string($event->command_id) ? $event->command_id : null,
            'url_before' => TalosBrowserRedactor::url(
                is_string($event->url_before) ? $event->url_before : null,
            ),
            'url_after' => TalosBrowserRedactor::url(
                is_string($event->url_after) ? $event->url_after : null,
            ),
            'payload' => $this->safePayload(is_array($event->payload) ? $event->payload : []),
            'policy_decision' => $this->safePayload(
                is_array($event->policy_decision) ? $event->policy_decision : [],
            ),
            'created_at' => $event->created_at?->toJSON(),
        ];
    }

    /** @return array<string, mixed> */
    private function artifactPayload(TalosBrowserArtifact $artifact): array
    {
        return [
            'id' => (string) $artifact->id,
            'type' => (string) $artifact->type,
            'mime' => (string) $artifact->mime,
            'evidence_hash' => 'sha256:'.(string) $artifact->sha256,
            'worker_capture_id' => is_string($artifact->worker_capture_id) ? $artifact->worker_capture_id : null,
            'source_command_id' => is_string($artifact->source_command_id) ? $artifact->source_command_id : null,
            'source_state_version' => is_int($artifact->source_state_version) ? $artifact->source_state_version : null,
            'state_version' => is_int($artifact->state_version) ? $artifact->state_version : null,
            'trust_boundary' => is_string($artifact->trust_boundary) ? $artifact->trust_boundary : 'untrusted_browser_content',
            'metadata' => $this->safePayload(is_array($artifact->metadata) ? $artifact->metadata : []),
            'commit_state' => 'legacy_unverified',
            'committed_v1' => false,
            'created_at' => $artifact->created_at?->toJSON(),
        ];
    }

    /**
     * @param  array<string, mixed>|list<mixed>  $payload
     * @return array<string, mixed>|list<mixed>
     */
    private function safePayload(array $payload): array
    {
        $safe = TalosBrowserRedactor::payload($payload);

        foreach ($safe as $key => $value) {
            if (in_array((string) $key, [
                'storage_disk',
                'storage_path',
                'worker_session_id',
                'execution_lease_token',
                'reconciliation_token',
                ...self::RESERVED_TRUST_KEYS,
            ], true)) {
                unset($safe[$key]);

                continue;
            }

            if (is_array($value)) {
                $safe[$key] = $this->safePayload($value);
            }
        }

        return $safe;
    }
}
