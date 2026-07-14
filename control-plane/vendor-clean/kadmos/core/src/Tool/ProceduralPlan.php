<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\Workers\WorkerRegistry;

final readonly class ProceduralPlan
{
    public const DAG_COMPILED = 'DAG_COMPILED';
    public const AWAITING_APPROVAL = 'AWAITING_APPROVAL';
    public const LOOP_BLOCKED = 'LOOP_BLOCKED';
    public const BUDGET_EXHAUSTED = 'BUDGET_EXHAUSTED';
    public const FAILED_POLICY = 'FAILED_POLICY';
    public const FAILED_VALIDATION = 'FAILED_VALIDATION';
    public const CANCELLED = 'CANCELLED';
    public const TIMED_OUT = 'TIMED_OUT';

    /**
     * @param list<ProceduralNode> $nodes
     * @param list<string> $finalizationDependencies
     * @param list<array{code: string, message: string, call_id?: string}> $faults
     */
    public function __construct(
        public string $state,
        public array $nodes,
        public array $finalizationDependencies,
        public array $faults,
    ) {
        if (! in_array($state, [self::DAG_COMPILED, self::AWAITING_APPROVAL, self::LOOP_BLOCKED, self::BUDGET_EXHAUSTED, self::FAILED_POLICY, self::FAILED_VALIDATION, self::CANCELLED, self::TIMED_OUT], true)) {
            throw new InvalidArgumentException('Procedural plan state is unsupported.');
        }
        if (! array_is_list($nodes) || ! array_is_list($finalizationDependencies) || ! array_is_list($faults)) {
            throw new InvalidArgumentException('Procedural plan collections must be lists.');
        }
        foreach ($nodes as $node) {
            if (! $node instanceof ProceduralNode) {
                throw new InvalidArgumentException('Procedural plan nodes must be typed.');
            }
        }
        $this->validateGraph();
        $this->validateState();
    }

    public function materialize(WorkerRegistry $workers, ?ToolApprovalAuthority $approvalAuthority = null): ASTOrchestrator
    {
        $orchestrator = new ASTOrchestrator($workers, $approvalAuthority);
        foreach ($this->nodes as $node) {
            $orchestrator->addNode($node->id, $node->dependencies, $node->type);
            $orchestrator->setPayload($node->id, $node->payload());
            if ($node->requiresApproval) {
                $orchestrator->markAwaitingApproval($node->id, $node->context->capability);
            }
        }

        return $orchestrator;
    }

    public function finalizationReady(ASTOrchestrator $orchestrator): bool
    {
        if (! in_array($this->state, [self::DAG_COMPILED, self::AWAITING_APPROVAL], true)) {
            return false;
        }
        foreach ($this->nodes as $node) {
            if (! in_array($orchestrator->getNodeStatus($node->id), [NodeStatus::SUCCESS, NodeStatus::FAILED, NodeStatus::SKIPPED, NodeStatus::PRUNED], true)) {
                return false;
            }
        }
        foreach ($this->finalizationDependencies as $nodeId) {
            if ($orchestrator->getNodeStatus($nodeId) !== NodeStatus::SUCCESS) {
                return false;
            }
        }

        return true;
    }

    private function validateGraph(): void
    {
        $nodesById = [];
        foreach ($this->nodes as $node) {
            if (isset($nodesById[$node->id])) {
                throw new InvalidArgumentException('Procedural plan node IDs must be unique.');
            }
            $nodesById[$node->id] = $node;
        }
        foreach ($this->nodes as $node) {
            foreach ($node->dependencies as $dependency) {
                if (! isset($nodesById[$dependency])) {
                    throw new InvalidArgumentException('Procedural plan dependency references an unknown node.');
                }
            }
        }

        $visiting = [];
        $visited = [];
        $visit = function (string $nodeId) use (&$visit, &$visiting, &$visited, $nodesById): void {
            if (isset($visited[$nodeId])) {
                return;
            }
            if (isset($visiting[$nodeId])) {
                throw new InvalidArgumentException('Procedural plan dependencies must be acyclic.');
            }
            $visiting[$nodeId] = true;
            foreach ($nodesById[$nodeId]->dependencies as $dependency) {
                $visit($dependency);
            }
            unset($visiting[$nodeId]);
            $visited[$nodeId] = true;
        };
        foreach (array_keys($nodesById) as $nodeId) {
            $visit($nodeId);
        }

        $finalizationSeen = [];
        foreach ($this->finalizationDependencies as $dependency) {
            if (! is_string($dependency) || isset($finalizationSeen[$dependency])) {
                throw new InvalidArgumentException('Procedural finalization dependencies must be unique node IDs.');
            }
            $node = $nodesById[$dependency] ?? null;
            if (! $node instanceof ProceduralNode || ! $node->producesEvidence) {
                throw new InvalidArgumentException('Procedural finalization dependencies must reference evidence-producing nodes.');
            }
            $finalizationSeen[$dependency] = true;
        }
    }

    private function validateState(): void
    {
        $compiled = in_array($this->state, [self::DAG_COMPILED, self::AWAITING_APPROVAL], true);
        if ($compiled && $this->faults !== []) {
            throw new InvalidArgumentException('Compiled procedural plans cannot contain terminal faults.');
        }
        if (! $compiled && $this->nodes !== []) {
            throw new InvalidArgumentException('Terminal procedural plans cannot expose executable nodes.');
        }
        if ($this->state === self::AWAITING_APPROVAL
            && ! array_any($this->nodes, static fn (ProceduralNode $node): bool => $node->requiresApproval)) {
            throw new InvalidArgumentException('An approval-waiting plan requires at least one approval-gated node.');
        }
        if ($this->state === self::DAG_COMPILED
            && array_any($this->nodes, static fn (ProceduralNode $node): bool => $node->requiresApproval)) {
            throw new InvalidArgumentException('An approval-gated plan must disclose its waiting state.');
        }
        foreach ($this->faults as $fault) {
            if (! is_array($fault)
                || ! is_string($fault['code'] ?? null)
                || ($fault['code'] ?? '') === ''
                || ! is_string($fault['message'] ?? null)
                || ($fault['message'] ?? '') === ''
                || (isset($fault['call_id']) && ! is_string($fault['call_id']))) {
                throw new InvalidArgumentException('Procedural plan faults must use the canonical typed shape.');
            }
        }
    }
}
