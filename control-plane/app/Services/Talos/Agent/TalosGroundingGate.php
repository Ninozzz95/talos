<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosRunArtifact;
use App\Models\TalosToolCall;
use App\Models\TalosToolResult as PersistedToolResult;
use App\Models\TalosToolTurn;
use InvalidArgumentException;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ToolResult;

final class TalosGroundingGate
{
    private const EVIDENCE_TOOLS = [
        'browser_navigate',
        'browser_snapshot',
        'browser_read',
        'browser_take_screenshot',
        'web_search',
        'web_fetch',
    ];

    public function release(TalosToolTurn $turn, ProviderTurnResponse $response): string
    {
        if ($response->kind !== ProviderTurnResponse::FINAL || ! is_string($response->text) || trim($response->text) === '') {
            throw new TalosGroundingException('TALOS_GROUNDING_FINAL_REQUIRED', 'Grounding gate accepts only a final provider response.');
        }

        $turn->load(['calls.results']);
        if ($turn->calls->isEmpty()) {
            return $response->text;
        }

        foreach ($turn->calls as $call) {
            $this->assertCallOwnership($turn, $call);
            if ($call->results->count() !== 1) {
                throw new TalosGroundingException('TALOS_GROUNDING_RESULT_MISSING', 'Every tool call must have exactly one persisted result per attempt.');
            }

            /** @var PersistedToolResult $persisted */
            $persisted = $call->results->first();
            $this->assertResultOwnership($turn, $call, $persisted);
            try {
                $result = ToolResult::fromArray(
                    is_array($persisted->canonical_result) ? $persisted->canonical_result : [],
                    (string) $call->provider_call_id,
                );
            } catch (InvalidArgumentException) {
                throw new TalosGroundingException('TALOS_GROUNDING_RESULT_INVALID', 'Persisted tool result failed canonical validation.');
            }
            if ($result->isError !== (bool) $persisted->is_error) {
                throw new TalosGroundingException('TALOS_GROUNDING_RESULT_INVALID', 'Persisted tool result error state is inconsistent.');
            }

            if (! $result->isError && in_array($call->tool_name, self::EVIDENCE_TOOLS, true)) {
                $this->assertEvidence($turn, $persisted, $result);
            }
        }

        return $response->text;
    }

    private function assertCallOwnership(TalosToolTurn $turn, TalosToolCall $call): void
    {
        if ((string) $call->tool_turn_id !== (string) $turn->id
            || (string) $call->run_id !== (string) $turn->run_id
            || (int) $call->user_id !== (int) $turn->user_id) {
            throw new TalosGroundingException('TALOS_GROUNDING_OWNERSHIP_MISMATCH', 'Tool call ownership does not match its turn.');
        }
    }

    private function assertResultOwnership(TalosToolTurn $turn, TalosToolCall $call, PersistedToolResult $result): void
    {
        if ((string) $result->tool_call_id !== (string) $call->id
            || (string) $result->tool_turn_id !== (string) $turn->id
            || (string) $result->run_id !== (string) $turn->run_id
            || (int) $result->user_id !== (int) $turn->user_id
            || (string) $result->provider_call_id !== (string) $call->provider_call_id) {
            throw new TalosGroundingException('TALOS_GROUNDING_OWNERSHIP_MISMATCH', 'Tool result ownership or correlation does not match its turn.');
        }
    }

    private function assertEvidence(TalosToolTurn $turn, PersistedToolResult $persisted, ToolResult $result): void
    {
        if ($result->evidence === []) {
            throw new TalosGroundingException('TALOS_GROUNDING_EVIDENCE_REQUIRED', 'Successful web and browser tools require persisted evidence.');
        }

        $canonicalIds = [];
        foreach ($result->evidence as $evidence) {
            $artifactId = $evidence['artifact_id'] ?? null;
            $boundary = $evidence['trusted_boundary'] ?? null;
            if (! is_string($artifactId)
                || $artifactId === ''
                || ! is_string($boundary)
                || ! in_array($boundary, ['untrusted_web_content', 'untrusted_browser_content'], true)) {
                throw new TalosGroundingException('TALOS_GROUNDING_EVIDENCE_INVALID', 'Tool evidence identity or trust boundary is invalid.');
            }
            $sha256 = $evidence['sha256'] ?? null;
            if (! is_string($sha256) || preg_match('/^sha256:[a-f0-9]{64}$/', $sha256) !== 1) {
                throw new TalosGroundingException('TALOS_GROUNDING_EVIDENCE_INVALID', 'Tool evidence hash is invalid.');
            }
            $this->assertPersistedArtifact($turn, $artifactId, $sha256);
            $canonicalIds[] = $artifactId;
        }

        $persistedIds = is_array($persisted->evidence_ids) ? $persisted->evidence_ids : [];
        if (! array_is_list($persistedIds) || $canonicalIds !== $persistedIds) {
            throw new TalosGroundingException('TALOS_GROUNDING_EVIDENCE_INVALID', 'Persisted evidence IDs do not match the canonical tool result.');
        }
    }

    private function assertPersistedArtifact(TalosToolTurn $turn, string $artifactId, string $sha256): void
    {
        $runArtifact = TalosRunArtifact::query()
            ->whereKey($artifactId)
            ->where('run_id', $turn->run_id)
            ->first();
        if ($runArtifact instanceof TalosRunArtifact) {
            $storedHash = is_array($runArtifact->metadata) ? $runArtifact->metadata['sha256'] ?? null : null;
            if (is_string($storedHash) && hash_equals($sha256, $storedHash)) {
                return;
            }

            throw new TalosGroundingException('TALOS_GROUNDING_EVIDENCE_INVALID', 'Run evidence hash does not match its persisted artifact.');
        }

        $browserArtifact = TalosBrowserArtifact::query()
            ->whereKey($artifactId)
            ->where('user_id', $turn->user_id)
            ->first();
        $linkedToRun = $browserArtifact instanceof TalosBrowserArtifact
            && TalosRunArtifact::query()
                ->where('run_id', $turn->run_id)
                ->where('uri', 'talos-browser-artifact://'.$browserArtifact->id)
                ->exists();
        if ($linkedToRun && is_string($browserArtifact->sha256)
            && hash_equals($sha256, 'sha256:'.$browserArtifact->sha256)) {
            return;
        }

        throw new TalosGroundingException('TALOS_GROUNDING_EVIDENCE_NOT_PERSISTED', 'Tool evidence is not persisted and owned by the current run.');
    }
}
