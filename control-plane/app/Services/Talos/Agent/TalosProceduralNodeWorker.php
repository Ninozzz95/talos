<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosBrowserSession;
use App\Models\TalosToolTurn;
use Kadmos\NodeStatus;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Workers\NodeWorkerInterface;
use RuntimeException;
use Throwable;

final class TalosProceduralNodeWorker implements NodeWorkerInterface
{
    /** @var array<string, array{call_id: string, effect_token: string}> */
    private array $executionFences = [];

    /** @param array<string, ProceduralNode> $nodes */
    public function __construct(
        private array $nodes,
        private TalosToolExecutionBackend $backend,
        private TalosToolTurn $turn,
        private ?TalosBrowserSession $browserSession,
        private TalosToolEvidenceBudgetGate $evidenceBudgets,
        private TalosExecutionClaimService $claims,
        private int $ownerUserId,
        private string $turnLeaseToken,
    ) {}

    public function armExecutionFence(string $nodeId, string $callId, string $effectToken): void
    {
        $this->executionFences[$nodeId] = [
            'call_id' => $callId,
            'effect_token' => $effectToken,
        ];
    }

    public function execute(array $payload): array
    {
        $nodeId = $payload['context']['node_id'] ?? null;
        $node = is_string($nodeId) ? ($this->nodes[$nodeId] ?? null) : null;
        if (! $node instanceof ProceduralNode) {
            throw new RuntimeException('Procedural worker payload does not identify a materialized node.');
        }
        $fence = $this->executionFences[$nodeId] ?? null;
        if (! is_array($fence)
            || ! $this->claims->authorizeCallExecution(
                $this->ownerUserId,
                $fence['call_id'],
                $fence['effect_token'],
                $this->turnLeaseToken,
            )) {
            throw new TalosToolRecoveryRequiredException(
                message: 'The physical tool effect was fenced before backend execution.',
            );
        }

        try {
            $result = $this->evidenceBudgets->apply(
                $this->turn,
                $this->turnLeaseToken,
                $node,
                $this->backend->execute($node, $this->turn, $this->browserSession),
            );
        } catch (TalosToolRecoveryRequiredException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new TalosToolRecoveryRequiredException(
                message: 'The fenced tool execution did not return a verifiable outcome.',
            );
        }

        return [
            'status' => $result->isError ? NodeStatus::FAILED : NodeStatus::SUCCESS,
            'output_summary' => $result->isError ? 'Tool execution failed.' : 'Tool execution succeeded.',
            'raw_output' => $result,
        ];
    }
}
