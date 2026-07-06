<?php

declare(strict_types=1);

namespace AVM;

use AVM\Workers\WorkerRegistry;
use AVM\Workers\NodeWorkerInterface;
use InvalidArgumentException;

final class ASTOrchestrator
{
    /** @var array<string, array{id: string, status: string, type: string, payload?: array<string, mixed>, output_summary?: string, raw_output?: mixed}> */
    private array $nodes = [];

    /** @var array<string, list<string>> */
    private array $dependencies = [];

    /** @var array<string, list<string>> */
    private array $children = [];

    private WorkerRegistry $workerRegistry;

    public function __construct(WorkerRegistry $workerRegistry)
    {
        $this->workerRegistry = $workerRegistry;
    }

    /**
     * @param list<string> $dependencies
     */
    public function addNode(string $nodeId, array $dependencies = [], string $type = 'UNKNOWN'): void
    {
        if (isset($this->nodes[$nodeId])) {
            throw new InvalidArgumentException("Node already exists: {$nodeId}");
        }

        foreach ($dependencies as $dependencyId) {
            $this->assertNodeExists($dependencyId);
        }

        $this->nodes[$nodeId] = [
            'id' => $nodeId,
            'status' => NodeStatus::PENDING,
            'type' => $type,
        ];
        $this->dependencies[$nodeId] = array_values($dependencies);
        $this->children[$nodeId] ??= [];

        foreach ($dependencies as $dependencyId) {
            $this->children[$dependencyId] ??= [];
            $this->children[$dependencyId][] = $nodeId;
        }
    }

    public function markRunning(string $nodeId): void
    {
        $this->setStatus($nodeId, NodeStatus::RUNNING);
    }

    public function markSuccess(string $nodeId): void
    {
        $this->setStatus($nodeId, NodeStatus::SUCCESS);
        $this->restoreBlockedDescendants($nodeId);
    }

    public function markFailed(string $nodeId): void
    {
        $this->setStatus($nodeId, NodeStatus::FAILED);
        $this->blockPendingDescendants($nodeId);
    }

    public function forceRetry(string $nodeId): void
    {
        $this->assertNodeExists($nodeId);

        if ($this->nodes[$nodeId]['status'] !== NodeStatus::FAILED) {
            throw new InvalidArgumentException("Only FAILED nodes can be forced to RETRYING: {$nodeId}");
        }

        $this->setStatus($nodeId, NodeStatus::RETRYING);
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
        $this->assertNodeExists($nodeId);
        $this->nodes[$nodeId]['payload'] = $payload;
        $this->nodes[$nodeId]['status'] = NodeStatus::VALIDATED;
    }

    /**
     * Executes a validated node using the appropriate worker.
     */
    public function executeNode(string $nodeId): void
    {
        $node = $this->nodes[$nodeId];

        if ($node['status'] !== NodeStatus::VALIDATED && $node['status'] !== NodeStatus::RETRYING) {
            throw new \RuntimeException("Node {$nodeId} is not in an executable state.");
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
        } catch (\Exception $e) {
            $this->setStatus($nodeId, NodeStatus::FAILED);
            $this->nodes[$nodeId]['output_summary'] = "Worker Exception: " . $e->getMessage();
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
     * @return array{nodes: array, dependencies: array, children: array}
     */
    public function exportState(): array
    {
        return [
            'nodes' => $this->nodes,
            'dependencies' => $this->dependencies,
            'children' => $this->children,
        ];
    }

    /**
     * Imports DAG state from a previously exported array.
     * @param array{nodes: array, dependencies: array, children: array} $data
     */
    public function importState(array $data): void
    {
        $this->nodes = $data['nodes'] ?? [];
        $this->dependencies = $data['dependencies'] ?? [];
        $this->children = $data['children'] ?? [];
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

    private function assertNodeExists(string $nodeId): void
    {
        if (!isset($this->nodes[$nodeId])) {
            throw new InvalidArgumentException("Unknown node: {$nodeId}");
        }
    }
}
