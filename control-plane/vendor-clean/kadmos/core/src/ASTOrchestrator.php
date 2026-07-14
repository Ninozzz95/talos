<?php

declare(strict_types=1);

namespace Kadmos;

use Kadmos\Tool\ToolApprovalGrant;
use Kadmos\Tool\ToolApprovalAuthority;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;
use InvalidArgumentException;

final class ASTOrchestrator
{
    /** @var array<string, array{id: string, status: string, type: string, payload?: array<string, mixed>, approval_requirement?: array{capability: string, plan_hash: string}, approval_grant?: array<string, string>, output_summary?: string, raw_output?: mixed}> */
    private array $nodes = [];

    /** @var array<string, list<string>> */
    private array $dependencies = [];

    /** @var array<string, list<string>> */
    private array $children = [];

    /** @var array<string, true> */
    private array $consumedApprovalIds = [];

    private WorkerRegistry $workerRegistry;

    public function __construct(WorkerRegistry $workerRegistry, private readonly ?ToolApprovalAuthority $approvalAuthority = null)
    {
        $this->workerRegistry = $workerRegistry;
    }

    /**
     * @param list<string> $dependencies
     */
    public function addNode(string $nodeId, array $dependencies = [], string $type = 'UNKNOWN'): void
    {
        $nodeId = (string) $nodeId;
        if (isset($this->nodes[$nodeId])) {
            throw new InvalidArgumentException("Node already exists: {$nodeId}");
        }

        foreach ($dependencies as $dependencyId) {
            $this->assertNodeExists((string) $dependencyId);
        }

        $this->nodes[$nodeId] = [
            'id' => $nodeId,
            'status' => NodeStatus::PENDING,
            'type' => $type,
        ];
        $this->dependencies[$nodeId] = array_map('strval', array_values($dependencies));
        $this->children[$nodeId] ??= [];

        foreach ($dependencies as $dependencyId) {
            $this->children[$dependencyId] ??= [];
            $this->children[$dependencyId][] = $nodeId;
        }
    }

    public function markRunning(string $nodeId): void
    {
        $this->assertNodeExists($nodeId);
        if (! in_array($this->nodes[$nodeId]['status'], [NodeStatus::PENDING, NodeStatus::VALIDATED, NodeStatus::RETRYING], true)) {
            throw new InvalidArgumentException("Node cannot transition to RUNNING from its current state: {$nodeId}");
        }
        if (! $this->allDependenciesSucceeded($nodeId)) {
            throw new InvalidArgumentException("Node dependencies have not succeeded: {$nodeId}");
        }
        if (isset($this->nodes[$nodeId]['approval_requirement']) && ! isset($this->nodes[$nodeId]['approval_grant'])) {
            throw new InvalidArgumentException("Node requires a verified approval grant: {$nodeId}");
        }

        $this->setStatus($nodeId, NodeStatus::RUNNING);
    }

    public function markSuccess(string $nodeId): void
    {
        $this->assertNodeExists($nodeId);
        if ($this->nodes[$nodeId]['status'] !== NodeStatus::RUNNING) {
            throw new InvalidArgumentException("Only RUNNING nodes can transition to SUCCESS: {$nodeId}");
        }
        $this->setStatus($nodeId, NodeStatus::SUCCESS);
        $this->restoreBlockedDescendants($nodeId);
    }

    public function markFailed(string $nodeId): void
    {
        $this->assertNodeExists($nodeId);
        if ($this->nodes[$nodeId]['status'] !== NodeStatus::RUNNING) {
            throw new InvalidArgumentException("Only RUNNING nodes can transition to FAILED: {$nodeId}");
        }
        $this->setStatus($nodeId, NodeStatus::FAILED);
        $this->blockPendingDescendants($nodeId);
    }

    public function forceRetry(string $nodeId): void
    {
        $this->assertNodeExists($nodeId);

        if ($this->nodes[$nodeId]['status'] !== NodeStatus::FAILED) {
            throw new InvalidArgumentException("Only FAILED nodes can be forced to RETRYING: {$nodeId}");
        }

        if (isset($this->nodes[$nodeId]['approval_requirement'])) {
            unset($this->nodes[$nodeId]['approval_grant']);
            $this->setStatus($nodeId, NodeStatus::AWAITING_APPROVAL);

            return;
        }

        $this->setStatus($nodeId, NodeStatus::RETRYING);
    }

    public function markAwaitingApproval(string $nodeId, string $capability): void
    {
        $this->assertNodeExists($nodeId);
        if (! in_array($this->nodes[$nodeId]['status'], [NodeStatus::PENDING, NodeStatus::VALIDATED], true)) {
            throw new InvalidArgumentException("Only pending or validated nodes can await approval: {$nodeId}");
        }
        if (! isset($this->nodes[$nodeId]['payload'])) {
            throw new InvalidArgumentException("Approval-gated node requires a payload: {$nodeId}");
        }
        if ($capability === '' || strlen($capability) > 128) {
            throw new InvalidArgumentException("Approval capability is invalid: {$nodeId}");
        }

        $this->nodes[$nodeId]['approval_requirement'] = [
            'capability' => $capability,
            'plan_hash' => $this->approvalPlanHash($nodeId),
        ];
        unset($this->nodes[$nodeId]['approval_grant']);
        $this->setStatus($nodeId, NodeStatus::AWAITING_APPROVAL);
    }

    /** @return array{capability: string, plan_hash: string} */
    public function getApprovalRequirement(string $nodeId): array
    {
        $this->assertNodeExists($nodeId);
        $requirement = $this->nodes[$nodeId]['approval_requirement'] ?? null;
        if (! is_array($requirement)) {
            throw new InvalidArgumentException("Node does not carry an approval requirement: {$nodeId}");
        }

        return $requirement;
    }

    public function approveNode(string $nodeId, ToolApprovalGrant $approval): void
    {
        $this->assertNodeExists($nodeId);
        if ($this->nodes[$nodeId]['status'] !== NodeStatus::AWAITING_APPROVAL) {
            throw new InvalidArgumentException("Only AWAITING_APPROVAL nodes can be approved: {$nodeId}");
        }
        $requirement = $this->getApprovalRequirement($nodeId);
        if ($approval->nodeId !== $nodeId
            || $approval->capability !== $requirement['capability']
            || $approval->planHash !== $requirement['plan_hash']) {
            throw new InvalidArgumentException("Approval grant does not match the current node plan: {$nodeId}");
        }
        if (isset($this->consumedApprovalIds[$approval->approvalId])) {
            throw new InvalidArgumentException("Approval grant has already been consumed: {$nodeId}");
        }
        if ($this->approvalAuthority === null || ! $this->approvalAuthority->authorizes($approval)) {
            throw new InvalidArgumentException("Approval actor is not authorized for the node capability: {$nodeId}");
        }

        $this->consumedApprovalIds[$approval->approvalId] = true;
        $this->nodes[$nodeId]['approval_grant'] = $approval->toArray();
        $this->setStatus($nodeId, NodeStatus::VALIDATED);
    }

    /**
     * @return list<string>
     */
    public function getExecutionQueue(): array
    {
        $ready = [];

        foreach (array_keys($this->nodes) as $nodeId) {
            if (!$this->isSchedulableState($this->nodes[$nodeId]['status'])) {
                continue;
            }

            if ($this->allDependenciesSucceeded($nodeId)) {
                $ready[] = $nodeId;
            }
        }

        return $ready;
    }

    public function getNodeStatus(string $nodeId): string
    {
        $this->assertNodeExists($nodeId);

        return $this->nodes[$nodeId]['status'];
    }

    /**
     * Costruisce il context {node_id => node_type} per l'envelope IPC.
     *
     * @param list<array<string, mixed>> $mutations
     * @return array<string, string>
     */
    public function buildContext(array $mutations): array
    {
        $context = [];
        foreach ($mutations as $mutation) {
            if (($mutation['action'] ?? '') === 'SPAWN_NODE' && isset($mutation['node_id'], $mutation['node_type'])) {
                $context[(string) $mutation['node_id']] = (string) $mutation['node_type'];
            }
            if (($mutation['action'] ?? '') === 'MUTATE_PAYLOAD' && isset($mutation['node_id'])) {
                $nodeId = (string) $mutation['node_id'];
                if (isset($this->nodes[$nodeId])) {
                    $context[$nodeId] = $this->nodes[$nodeId]['type'];
                }
            }
        }
        return $context;
    }

    /**
     * Sets the payload for a node and transitions it to VALIDATED.
     *
     * @param array<string, mixed> $payload
     */
    public function setPayload(string $nodeId, array $payload): void
    {
        $nodeId = (string) $nodeId;
        $this->assertNodeExists($nodeId);
        $this->nodes[$nodeId]['payload'] = $payload;
        if (isset($this->nodes[$nodeId]['approval_requirement'])) {
            $this->nodes[$nodeId]['approval_requirement']['plan_hash'] = $this->approvalPlanHash($nodeId);
            unset($this->nodes[$nodeId]['approval_grant']);
            $this->nodes[$nodeId]['status'] = NodeStatus::AWAITING_APPROVAL;

            return;
        }

        $this->nodes[$nodeId]['status'] = NodeStatus::VALIDATED;
    }

    /**
     * Executes a validated node using the appropriate worker.
     */
    public function executeNode(string $nodeId): void
    {
        $this->assertNodeExists($nodeId);
        $node = $this->nodes[$nodeId];

        if ($node['status'] !== NodeStatus::VALIDATED && $node['status'] !== NodeStatus::RETRYING) {
            throw new \RuntimeException("Node {$nodeId} is not in an executable state.");
        }
        if (! $this->allDependenciesSucceeded($nodeId)) {
            throw new \RuntimeException("Node {$nodeId} dependencies have not succeeded.");
        }
        if (isset($node['approval_requirement']) && ! isset($node['approval_grant'])) {
            throw new \RuntimeException("Node {$nodeId} requires a verified approval grant.");
        }

        $this->setStatus($nodeId, NodeStatus::RUNNING);

        try {
            $worker = $this->workerRegistry->getWorker($node['type']);
            $delta = $worker->execute($node['payload'] ?? []);

            $this->setStatus($nodeId, $delta['status']);
            $this->nodes[$nodeId]['output_summary'] = $delta['output_summary'];
            $this->nodes[$nodeId]['raw_output'] = $delta['raw_output'];

            if ($delta['status'] === NodeStatus::FAILED) {
                $this->blockPendingDescendants($nodeId);
            } elseif ($delta['status'] === NodeStatus::SUCCESS) {
                $this->restoreBlockedDescendants($nodeId);
            }
        } catch (\Throwable) {
            $this->setStatus($nodeId, NodeStatus::FAILED);
            $this->nodes[$nodeId]['output_summary'] = 'Worker execution failed.';
            $this->nodes[$nodeId]['raw_output'] = null;
            $this->blockPendingDescendants($nodeId);
        }
    }

    /**
     * Serializes the DAG state into a text prompt for the LLM.
     * Includes context window saturation warning.
     */
    public function serializeDagState(): string
    {
        $lines = [];
        $lines[] = "Current DAG State:";
        $lines[] = "---";

        $nodeCount = count($this->nodes);
        $lines[] = "Total nodes: {$nodeCount}";
        if ($nodeCount > 20) {
            $lines[] = "WARNING: Large DAG ({$nodeCount} nodes). Consider pruning completed subtrees.";
        }
        $lines[] = "";

        foreach ($this->nodes as $nodeId => $node) {
            $status = $node['status'];
            $type = $node['type'];
            $deps = \implode(', ', $this->dependencies[$nodeId] ?? []);

            $line = "Node: {$nodeId} | Type: {$type} | Status: {$status}";
            if ($deps !== '') {
                $line .= " | Dependencies: [{$deps}]";
            }

            // Include execution results if present
            if (isset($node['output_summary'])) {
                $line .= " | Result: {$node['output_summary']}";
            }

            $lines[] = $line;
        }

        // List blocked nodes explicitly
        $blocked = [];
        $pending = [];
        foreach ($this->nodes as $nodeId => $node) {
            if ($node['status'] === NodeStatus::BLOCKED_BY_DEPENDENCY) {
                $blocked[] = $nodeId;
            } elseif ($node['status'] === NodeStatus::PENDING) {
                $pending[] = $nodeId;
            }
        }

        if ($blocked !== []) {
            $lines[] = "Blocked nodes: " . \implode(', ', $blocked);
        }
        if ($pending !== []) {
            $lines[] = "Pending nodes: " . \implode(', ', $pending);
        }

        $serialized = \implode("\n", $lines);
        $estimatedTokens = (int)(\strlen($serialized) / 3.5); // rough: ~3.5 chars per token
        if ($estimatedTokens > 80000) {
            $lines[] = "\n⚠ CONTEXT WARNING: DAG state ~{$estimatedTokens} tokens (limit: 128K). LLM may lose context.";
        }

        return \implode("\n", $lines);
    }

    /**
     * Exports the full DAG state as an array for serialization.
     * @return array{nodes: array, dependencies: array, children: array, consumed_approval_ids: list<string>}
     */
    public function exportState(): array
    {
        return [
            'nodes' => $this->nodes,
            'dependencies' => $this->dependencies,
            'children' => $this->children,
            'consumed_approval_ids' => array_keys($this->consumedApprovalIds),
        ];
    }

    /**
     * Imports DAG state from a previously exported array.
     * @param array{nodes: array, dependencies: array, children: array, consumed_approval_ids?: list<string>} $data
     */
    public function importState(array $data): void
    {
        $this->nodes = $data['nodes'] ?? [];
        $this->dependencies = $data['dependencies'] ?? [];
        $this->children = $data['children'] ?? [];
        $this->consumedApprovalIds = [];
        foreach ($data['consumed_approval_ids'] ?? [] as $approvalId) {
            if (is_string($approvalId) && $approvalId !== '') {
                $this->consumedApprovalIds[$approvalId] = true;
            }
        }
    }

    private function setStatus(string $nodeId, string $status): void
    {
        $this->assertNodeExists($nodeId);
        $this->nodes[$nodeId]['status'] = $status;
    }

    private function blockPendingDescendants(string $nodeId): void
    {
        foreach ($this->children[$nodeId] ?? [] as $childId) {
            if (in_array($this->nodes[$childId]['status'], [NodeStatus::PENDING, NodeStatus::VALIDATED], true)) {
                $this->nodes[$childId]['status'] = NodeStatus::BLOCKED_BY_DEPENDENCY;
            }

            $this->blockPendingDescendants($childId);
        }
    }

    private function restoreBlockedDescendants(string $nodeId): void
    {
        foreach ($this->children[$nodeId] ?? [] as $childId) {
            if (
                $this->nodes[$childId]['status'] === NodeStatus::BLOCKED_BY_DEPENDENCY
                && !$this->hasFailedOrBlockedDependency($childId)
            ) {
                $this->nodes[$childId]['status'] = NodeStatus::PENDING;
            }

            $this->restoreBlockedDescendants($childId);
        }
    }

    private function hasFailedOrBlockedDependency(string $nodeId): bool
    {
        foreach ($this->dependencies[$nodeId] ?? [] as $dependencyId) {
            if (in_array($this->nodes[$dependencyId]['status'], [
                NodeStatus::FAILED,
                NodeStatus::BLOCKED_BY_DEPENDENCY,
                NodeStatus::PRUNED,
            ], true)) {
                return true;
            }
        }

        return false;
    }

    private function allDependenciesSucceeded(string $nodeId): bool
    {
        foreach ($this->dependencies[$nodeId] ?? [] as $dependencyId) {
            if ($this->nodes[$dependencyId]['status'] !== NodeStatus::SUCCESS) {
                return false;
            }
        }

        return true;
    }

    private function isSchedulableState(string $status): bool
    {
        return \in_array($status, [NodeStatus::PENDING, NodeStatus::VALIDATED, NodeStatus::RETRYING], true);
    }

    private function approvalPlanHash(string $nodeId): string
    {
        $material = $this->canonicalApprovalValue([
            'node_id' => $nodeId,
            'type' => $this->nodes[$nodeId]['type'],
            'dependencies' => $this->dependencies[$nodeId] ?? [],
            'payload' => $this->nodes[$nodeId]['payload'] ?? [],
        ]);

        try {
            $json = json_encode($material, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new InvalidArgumentException("Approval payload is not JSON-compatible: {$nodeId}", previous: $exception);
        }

        return 'sha256:'.hash('sha256', $json);
    }

    private function canonicalApprovalValue(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return [
                'kind' => 'list',
                'items' => array_map($this->canonicalApprovalValue(...), $value),
            ];
        }

        ksort($value, SORT_STRING);
        $entries = [];
        foreach ($value as $key => $item) {
            $entries[] = [(string) $key, $this->canonicalApprovalValue($item)];
        }

        return ['kind' => 'object', 'entries' => $entries];
    }

    private function assertNodeExists(string $nodeId): void
    {
        $nodeId = (string) $nodeId;
        if (!isset($this->nodes[$nodeId])) {
            throw new InvalidArgumentException("Unknown node: {$nodeId}");
        }
    }
}
