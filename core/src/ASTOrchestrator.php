<?php

declare(strict_types=1);

namespace AVM;

use InvalidArgumentException;

final class ASTOrchestrator
{
    /** @var array<string, array{id: string, status: string, type: string}> */
    private array $nodes = [];

    /** @var array<string, list<string>> */
    private array $dependencies = [];

    /** @var array<string, list<string>> */
    private array $children = [];

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
        return in_array($status, [NodeStatus::PENDING, NodeStatus::RETRYING], true);
    }

    private function assertNodeExists(string $nodeId): void
    {
        if (!isset($this->nodes[$nodeId])) {
            throw new InvalidArgumentException("Unknown node: {$nodeId}");
        }
    }
}
