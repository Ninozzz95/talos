<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosRunArtifact;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use Illuminate\Support\Facades\DB;
use JsonException;
use Ramsey\Uuid\Uuid;

final readonly class TalosBrowserRunArtifactCorrelator
{
    private const BROWSER_TOOL_NAMES = [
        'browser_navigate',
        'browser_snapshot',
        'browser_read',
        'browser_take_screenshot',
        'browser_click',
        'browser_file_upload',
    ];

    public function __construct(private TalosBrowserArtifactReader $artifactReader) {}

    public function correlate(
        TalosToolTurn $turn,
        TalosBrowserSession $browserSession,
        TalosBrowserArtifact $artifact,
        string $providerCallId,
    ): TalosRunArtifact {
        $providerCallId = trim($providerCallId);
        if ($providerCallId === '') {
            throw new TalosBrowserEvidenceException(
                'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                'Browser artifact correlation does not match its owned tool turn.',
            );
        }

        return DB::transaction(function () use ($turn, $browserSession, $artifact, $providerCallId): TalosRunArtifact {
            $ownedTurn = TalosToolTurn::query()
                ->whereKey($turn->id)
                ->where('user_id', $browserSession->user_id)
                ->where('session_id', $browserSession->talos_session_id)
                ->where('browser_session_id', $browserSession->id)
                ->lockForUpdate()
                ->first();
            $ownedSession = TalosBrowserSession::query()
                ->whereKey($browserSession->id)
                ->where('user_id', $browserSession->user_id)
                ->where('talos_session_id', $browserSession->talos_session_id)
                ->lockForUpdate()
                ->first();
            $ownedArtifact = TalosBrowserArtifact::query()
                ->whereKey($artifact->id)
                ->where('user_id', $browserSession->user_id)
                ->where('browser_session_id', $browserSession->id)
                ->where('trust_boundary', 'untrusted_browser_content')
                ->lockForUpdate()
                ->first();
            if (! $ownedTurn instanceof TalosToolTurn
                || ! $ownedSession instanceof TalosBrowserSession
                || ! $ownedArtifact instanceof TalosBrowserArtifact) {
                throw new TalosBrowserEvidenceException(
                    'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                    'Browser artifact correlation does not match its persisted owned scope.',
                );
            }
            $call = TalosToolCall::query()
                ->where('tool_turn_id', $ownedTurn->id)
                ->where('run_id', $ownedTurn->run_id)
                ->where('user_id', $ownedTurn->user_id)
                ->where('provider_call_id', $providerCallId)
                ->whereIn('tool_name', self::BROWSER_TOOL_NAMES)
                ->lockForUpdate()
                ->first();
            if (! $call instanceof TalosToolCall) {
                throw new TalosBrowserEvidenceException(
                    'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                    'Browser artifact correlation has no matching persisted Browser tool call.',
                );
            }
            $action = $this->canonicalActionForCall($ownedTurn, $ownedSession, $call);
            $this->assertCanonicalArtifactForCall($ownedArtifact, $call, $action);
            $this->assertCanonicalArtifactBytes($ownedArtifact);

            $turn = $ownedTurn;
            $browserSession = $ownedSession;
            $artifact = $ownedArtifact;
            $uri = 'talos-browser-artifact://'.$artifact->id;
            $links = TalosRunArtifact::query()
                ->where('run_id', $turn->run_id)
                ->where('uri', $uri)
                ->lockForUpdate()
                ->get();
            $partial = $links->filter(static function (TalosRunArtifact $candidate): bool {
                $metadata = is_array($candidate->metadata) ? $candidate->metadata : [];
                $hasTurn = array_key_exists('tool_turn_id', $metadata);
                $hasCall = array_key_exists('provider_call_id', $metadata);

                return $hasTurn !== $hasCall
                    || ($hasTurn && (! is_string($metadata['tool_turn_id']) || ! is_string($metadata['provider_call_id'])));
            });
            if ($partial->isNotEmpty()) {
                throw new TalosBrowserEvidenceException(
                    'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                    'Browser evidence contains a partially bound run link.',
                );
            }
            $exact = $links->filter(static function (TalosRunArtifact $candidate) use ($turn, $providerCallId): bool {
                $metadata = is_array($candidate->metadata) ? $candidate->metadata : [];

                return is_string($metadata['tool_turn_id'] ?? null)
                    && is_string($metadata['provider_call_id'] ?? null)
                    && hash_equals((string) $turn->id, $metadata['tool_turn_id'])
                    && hash_equals($providerCallId, $metadata['provider_call_id']);
            })->values();
            if ($exact->count() > 1) {
                throw new TalosBrowserEvidenceException(
                    'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                    'Browser evidence has duplicate run links for the same tool call.',
                );
            }

            $link = $exact->first();
            if (! $link instanceof TalosRunArtifact) {
                $unbound = $links->filter(static function (TalosRunArtifact $candidate): bool {
                    $metadata = is_array($candidate->metadata) ? $candidate->metadata : [];

                    return ! array_key_exists('tool_turn_id', $metadata)
                        && ! array_key_exists('provider_call_id', $metadata);
                })->values();
                if ($unbound->count() > 1) {
                    throw new TalosBrowserEvidenceException(
                        'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                        'Browser evidence has ambiguous unbound run links.',
                    );
                }
                $link = $unbound->first();
            }
            if (! $link instanceof TalosRunArtifact) {
                $linkId = (string) Uuid::uuid5(
                    Uuid::NAMESPACE_URL,
                    implode(':', [
                        'talos.browser.run-artifact-link.v1',
                        $turn->run_id,
                        $artifact->id,
                        $turn->id,
                        $providerCallId,
                    ]),
                );
                $metadata = [
                    'browser_artifact_id' => (string) $artifact->id,
                    'browser_session_id' => (string) $browserSession->id,
                    'tool_turn_id' => (string) $turn->id,
                    'provider_call_id' => $providerCallId,
                    'sha256' => (string) $artifact->sha256,
                    'trust' => 'untrusted',
                ];
                DB::table('talos_run_artifacts')->insertOrIgnore([
                    'id' => $linkId,
                    'run_id' => $turn->run_id,
                    'artifact_type' => 'browser_'.$artifact->type,
                    'uri' => $uri,
                    'mime_type' => $artifact->mime,
                    'metadata' => json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $link = TalosRunArtifact::query()->whereKey($linkId)->lockForUpdate()->first();
                if (! $link instanceof TalosRunArtifact) {
                    throw new TalosBrowserEvidenceException(
                        'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                        'Browser evidence usage link could not be persisted.',
                    );
                }
            }
            $existing = is_array($link->metadata) ? $link->metadata : [];
            foreach ([
                'browser_artifact_id' => (string) $artifact->id,
                'browser_session_id' => (string) $browserSession->id,
                'tool_turn_id' => (string) $turn->id,
                'provider_call_id' => $providerCallId,
                'sha256' => (string) $artifact->sha256,
            ] as $key => $expected) {
                if (array_key_exists($key, $existing)
                    && (! is_string($existing[$key]) || ! hash_equals($expected, $existing[$key]))) {
                    throw new TalosBrowserEvidenceException(
                        'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                        'Browser run evidence correlation conflicts with its persisted source.',
                    );
                }
            }
            if ((string) $link->run_id !== (string) $turn->run_id
                || (string) $link->uri !== $uri
                || (string) $link->artifact_type !== 'browser_'.$artifact->type
                || (string) $link->mime_type !== (string) $artifact->mime) {
                throw new TalosBrowserEvidenceException(
                    'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                    'Browser run evidence type conflicts with its persisted source.',
                );
            }

            $link->forceFill([
                'artifact_type' => 'browser_'.$artifact->type,
                'mime_type' => $artifact->mime,
                'metadata' => [
                    ...$existing,
                    'browser_artifact_id' => (string) $artifact->id,
                    'browser_session_id' => (string) $browserSession->id,
                    'tool_turn_id' => (string) $turn->id,
                    'provider_call_id' => $providerCallId,
                    'sha256' => (string) $artifact->sha256,
                    'trust' => 'untrusted',
                ],
            ])->save();

            return $link->refresh();
        }, 3);
    }

    private function assertCanonicalArtifactForCall(
        TalosBrowserArtifact $artifact,
        TalosToolCall $call,
        TalosBrowserAction $action,
    ): void {
        $type = (string) $artifact->type;
        $mime = (string) $artifact->mime;
        $allowedTypes = match ((string) $call->tool_name) {
            'browser_snapshot', 'browser_read' => ['snapshot'],
            'browser_take_screenshot' => ['screenshot'],
            'browser_navigate', 'browser_click', 'browser_file_upload' => ['snapshot', 'screenshot'],
            default => [],
        };
        $mimeMatches = ($type === 'snapshot' && $mime === 'application/json')
            || ($type === 'screenshot' && $mime === 'image/png');
        $expectedKind = match ((string) $call->tool_name) {
            'browser_navigate' => 'navigate',
            'browser_snapshot' => 'snapshot',
            'browser_read' => 'read',
            'browser_take_screenshot' => 'screenshot',
            'browser_click' => 'click',
            'browser_file_upload' => 'upload',
            default => null,
        };
        $stateDelta = in_array($expectedKind, ['navigate', 'click', 'upload'], true) ? 1 : 0;
        $expectedSourceStateVersion = (int) $action->expected_state_version;
        $expectedStateVersion = (int) $action->expected_state_version + $stateDelta;
        $sourceCommandMatches = is_string($artifact->source_command_id)
            && trim($artifact->source_command_id) !== ''
            && ($expectedKind === 'read'
                ? is_string($call->evidence_snapshot_artifact_id)
                    && hash_equals((string) $artifact->id, $call->evidence_snapshot_artifact_id)
                    && is_string($call->evidence_hash)
                    && hash_equals('sha256:'.(string) $artifact->sha256, $call->evidence_hash)
                : hash_equals((string) $call->provider_call_id, $artifact->source_command_id));

        if (! in_array($type, $allowedTypes, true)
            || ! $mimeMatches
            || $expectedKind === null
            || ! hash_equals($expectedKind, (string) $action->kind)
            || ! $sourceCommandMatches
            || ! is_int($artifact->source_state_version)
            || $artifact->source_state_version !== $expectedSourceStateVersion
            || ! is_string($artifact->sha256)
            || preg_match('/^[a-f0-9]{64}$/D', $artifact->sha256) !== 1
            || ! is_int($artifact->state_version)
            || $artifact->state_version !== $expectedStateVersion) {
            throw new TalosBrowserEvidenceException(
                'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                'Browser artifact type, MIME, digest or state is not canonical for its persisted tool call.',
            );
        }
    }

    private function canonicalActionForCall(
        TalosToolTurn $turn,
        TalosBrowserSession $browserSession,
        TalosToolCall $call,
    ): TalosBrowserAction {
        if (! is_string($call->logical_call_id)
            || trim($call->logical_call_id) === ''
            || ! is_string($call->effect_key)
            || trim($call->effect_key) === '') {
            throw new TalosBrowserEvidenceException(
                'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                'Browser artifact correlation has no durable action identity.',
            );
        }

        $actions = TalosBrowserAction::query()
            ->where('user_id', $turn->user_id)
            ->where('talos_session_id', $turn->session_id)
            ->where('intent_id', $call->logical_call_id)
            ->where('idempotency_key', $call->effect_key)
            ->whereHas('task', static function ($query) use ($turn, $browserSession): void {
                $query
                    ->where('user_id', $turn->user_id)
                    ->where('talos_session_id', $turn->session_id)
                    ->where('browser_session_id', $browserSession->id)
                    ->whereHas('originMessage', static function ($message) use ($turn): void {
                        $message
                            ->where('session_id', $turn->session_id)
                            ->where('run_id', $turn->run_id);
                    });
            })
            ->lockForUpdate()
            ->get();
        $action = $actions->first();

        if ($actions->count() !== 1 || ! $action instanceof TalosBrowserAction) {
            throw new TalosBrowserEvidenceException(
                'TALOS_BROWSER_EVIDENCE_SCOPE_INVALID',
                'Browser artifact correlation has no unique owned action journal entry.',
            );
        }

        return $action;
    }

    private function assertCanonicalArtifactBytes(TalosBrowserArtifact $artifact): void
    {
        try {
            $contents = $artifact->type === 'screenshot'
                ? $this->artifactReader->readScreenshot($artifact)
                : $this->artifactReader->read($artifact);
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            throw new TalosBrowserEvidenceException(
                'TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED',
                'Browser artifact bytes failed integrity verification before correlation.',
                previous: $exception,
            );
        }

        if ($artifact->type !== 'snapshot') {
            return;
        }

        try {
            $decoded = json_decode($contents, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new TalosBrowserEvidenceException(
                'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                'Browser snapshot bytes are not valid JSON.',
                previous: $exception,
            );
        }
        if (! is_object($decoded)) {
            throw new TalosBrowserEvidenceException(
                'TALOS_BROWSER_EVIDENCE_SOURCE_INVALID',
                'Browser snapshot root must be a JSON object.',
            );
        }
    }
}
