<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use InvalidArgumentException;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ToolResult;

final class TalosToolEvidenceBudgetGate
{
    public function __construct(private readonly TalosAgentBudgetService $budgets) {}

    public function apply(
        TalosToolTurn $turn,
        string $turnLeaseToken,
        ProceduralNode $node,
        ToolResult $result,
    ): ToolResult
    {
        if ($result->isError || $result->evidence === []) {
            return $result;
        }

        $call = TalosToolCall::query()
            ->ownedBy((int) $turn->user_id)
            ->where('tool_turn_id', $turn->id)
            ->where('provider_call_id', $node->call->providerCallId)
            ->first();
        if (! $call instanceof TalosToolCall) {
            return ToolResult::error(
                $node->call->providerCallId,
                'TALOS_TOOL_OWNERSHIP_MISMATCH',
                'Evidence budget could not correlate the persisted tool call.',
            );
        }

        $bytes = $this->evidenceBytes($result);
        $reservationId = 'tool-call:'.$call->id.':'.$call->attempt.':evidence_bytes';
        try {
            $this->budgets->reserve(
                ownerUserId: (int) $turn->user_id,
                turnId: (string) $turn->id,
                reservationId: $reservationId,
                kind: 'tool_evidence',
                resource: 'evidence_bytes',
                amount: $bytes,
                toolCallId: (string) $call->id,
                metadata: [
                    'node_id' => $node->id,
                    'tool_name' => $node->call->name,
                    'attempt' => (int) $call->attempt,
                ],
                turnLeaseToken: $turnLeaseToken,
            );
            $this->budgets->settle($reservationId, (int) $turn->user_id, $bytes, $turnLeaseToken);
        } catch (InvalidArgumentException $exception) {
            if (! str_contains($exception->getMessage(), 'evidence_bytes')) {
                throw $exception;
            }

            return ToolResult::error(
                $node->call->providerCallId,
                'TALOS_TOOL_EVIDENCE_BYTES_BUDGET_EXHAUSTED',
                'The tool result exceeded the remaining evidence byte budget.',
            );
        }

        return $result;
    }

    private function evidenceBytes(ToolResult $result): int
    {
        $reported = $result->structuredContent['evidence_bytes'] ?? null;
        if (is_int($reported) && $reported >= 0) {
            return $reported;
        }

        $encoded = json_encode([
            'content' => $result->content,
            'structuredContent' => $result->structuredContent,
            'evidence' => $result->evidence,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        return strlen($encoded);
    }
}
