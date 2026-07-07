<?php

declare(strict_types=1);

namespace Kadmos\Benchmark;

use Kadmos\ASTOrchestrator;
use Kadmos\MainLoopController;
use Kadmos\MockLLM;
use Kadmos\NodeStatus;
use Kadmos\Workers\WorkerRegistry;

final readonly class BenchmarkComparisonRunner
{
    public function __construct(private int $runs = 1)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function compareScenario(BenchmarkScenario $scenario): array
    {
        $modes = [];
        foreach (BenchmarkMode::all() as $mode) {
            $modes[$mode] = $this->runMode($scenario, $mode);
        }

        return [
            'schema_version' => 1,
            'generated_at' => date('c'),
            'runs' => $this->runs,
            'scenario' => [
                'name' => $scenario->name(),
                'difficulty' => $scenario->difficulty(),
                'description' => $scenario->description(),
                'path' => $scenario->path(),
                'expected_nodes' => $scenario->expectedNodes(),
                'mutation_count' => $scenario->mutationCount(),
                'injected_error' => $scenario->injectedError(),
            ],
            'modes' => $modes,
            'comparison' => $this->compareModes($modes),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function runMode(BenchmarkScenario $scenario, string $mode): array
    {
        if ($mode === BenchmarkMode::AVM_ON) {
            return $this->averageRuns(fn() => $this->runAvmOn($scenario));
        }

        if ($mode === BenchmarkMode::AVM_OFF_DIRECT) {
            return $this->runAvmOffDirect($scenario);
        }

        return $this->runToolAgent($scenario);
    }

    /**
     * @param callable(): array<string, mixed> $run
     * @return array<string, mixed>
     */
    private function averageRuns(callable $run): array
    {
        $runs = max(1, $this->runs);
        $last = [];
        $numericSums = [];

        for ($i = 0; $i < $runs; $i++) {
            $last = $run();
            foreach ($last as $key => $value) {
                if (is_int($value) || is_float($value)) {
                    $numericSums[$key] = ($numericSums[$key] ?? 0) + $value;
                }
            }
        }

        foreach ($numericSums as $key => $sum) {
            $last[$key] = is_int($sum) && $sum % $runs === 0 ? (int) ($sum / $runs) : round($sum / $runs, 4);
        }

        return $last;
    }

    /**
     * @return array<string, mixed>
     */
    private function runAvmOn(BenchmarkScenario $scenario): array
    {
        $registry = new WorkerRegistry();
        $worker = new BenchmarkNodeWorker($scenario);
        $registry->register('HTTP_REQUEST', $worker);
        $registry->register('QUERY_DATABASE', $worker);

        $orchestrator = new ASTOrchestrator($registry);
        $script = [];
        foreach ($scenario->steps() as $step) {
            $script[] = json_encode($this->attachBenchmarkNodeIds($step['mutations'] ?? []));
        }

        $controller = new MainLoopController(
            $orchestrator,
            new MockLLM($script),
            new ScenarioAwareValidator($scenario),
            count($script) + 3,
        );

        $startedAt = microtime(true);
        $controller->run();
        $elapsedMs = (int) round((microtime(true) - $startedAt) * 1000);

        $statuses = $this->collectNodeStatuses($orchestrator, $scenario->nodeIds());
        $counts = $this->countStatuses($statuses);

        return $this->resultPayload(
            mode: BenchmarkMode::AVM_ON,
            totalNodes: count($scenario->nodeIds()),
            statuses: $statuses,
            successNodes: $counts[NodeStatus::SUCCESS] ?? 0,
            failedNodes: $counts[NodeStatus::FAILED] ?? 0,
            blockedNodes: $counts[NodeStatus::BLOCKED_BY_DEPENDENCY] ?? 0,
            stateMatch: $this->stateMatches($scenario, $statuses),
            cycles: $controller->getCycleCount(),
            validationFaults: $controller->getFaultCount(),
            tokenEstimate: $this->estimateAvmTokens($orchestrator, $scenario),
            elapsedMs: $elapsedMs,
            notes: 'Deterministic AVM run with DAG scheduling, validation gate, and failure-state propagation.',
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function runAvmOffDirect(BenchmarkScenario $scenario): array
    {
        $nodeIds = $scenario->nodeIds();
        $statuses = array_fill_keys($nodeIds, NodeStatus::SUCCESS);
        $error = $scenario->injectedError();

        if ($error !== null) {
            if (($error['type'] ?? null) === 'VALIDATION_FAULT') {
                $target = (string) ($error['node'] ?? '');
                foreach ($statuses as $nodeId => $_) {
                    $statuses[$nodeId] = $nodeId === $target || $this->appearsAfter($scenario, $nodeId, $target)
                        ? NodeStatus::FAILED
                        : NodeStatus::SUCCESS;
                }
            } elseif (($error['type'] ?? null) === 'EXECUTION_FAILURE') {
                $target = (string) ($error['node'] ?? '');
                $found = false;
                foreach ($nodeIds as $nodeId) {
                    if ($nodeId === $target) {
                        $found = true;
                    }
                    $statuses[$nodeId] = $found ? NodeStatus::FAILED : NodeStatus::SUCCESS;
                }
            }
        }

        $counts = $this->countStatuses($statuses);

        return $this->resultPayload(
            mode: BenchmarkMode::AVM_OFF_DIRECT,
            totalNodes: count($nodeIds),
            statuses: $statuses,
            successNodes: $counts[NodeStatus::SUCCESS] ?? 0,
            failedNodes: $counts[NodeStatus::FAILED] ?? 0,
            blockedNodes: 0,
            stateMatch: $this->stateMatches($scenario, $statuses),
            cycles: count($scenario->steps()),
            validationFaults: $error !== null && ($error['type'] ?? null) === 'VALIDATION_FAULT' ? 1 : 0,
            tokenEstimate: $this->estimateDirectTokens($scenario),
            elapsedMs: max(1, (int) round($scenario->simulatedLatencyMs() * 0.7)),
            notes: 'Direct LLM baseline: no durable DAG state, no dependency blocking, failures collapse into plain failed outputs.',
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function runToolAgent(BenchmarkScenario $scenario): array
    {
        $nodeIds = $scenario->nodeIds();
        $statuses = array_fill_keys($nodeIds, NodeStatus::SUCCESS);
        $error = $scenario->injectedError();
        $faults = 0;

        if ($error !== null) {
            $target = (string) ($error['node'] ?? '');
            if (($error['type'] ?? null) === 'VALIDATION_FAULT') {
                $faults = 1;
            } elseif (($error['type'] ?? null) === 'EXECUTION_FAILURE' && isset($statuses[$target])) {
                $statuses[$target] = NodeStatus::FAILED;
            }
        }

        $counts = $this->countStatuses($statuses);

        return $this->resultPayload(
            mode: BenchmarkMode::TOOL_AGENT,
            totalNodes: count($nodeIds),
            statuses: $statuses,
            successNodes: $counts[NodeStatus::SUCCESS] ?? 0,
            failedNodes: $counts[NodeStatus::FAILED] ?? 0,
            blockedNodes: 0,
            stateMatch: $this->stateMatches($scenario, $statuses),
            cycles: count($scenario->steps()) + $faults,
            validationFaults: $faults,
            tokenEstimate: (int) round($this->estimateDirectTokens($scenario) * 1.25),
            elapsedMs: max(1, $scenario->simulatedLatencyMs()),
            notes: 'Tool-agent baseline: structured tool calls and light validation, but no AVM failure-state cascade.',
        );
    }

    /**
     * @param array<int, mixed> $mutations
     * @return list<array<string, mixed>>
     */
    private function attachBenchmarkNodeIds(array $mutations): array
    {
        $patched = [];
        foreach ($mutations as $mutation) {
            if (!is_array($mutation)) {
                continue;
            }

            if (($mutation['action'] ?? null) === 'MUTATE_PAYLOAD' && isset($mutation['node_id'])) {
                $payload = $mutation['payload'] ?? [];
                $mutation['payload'] = is_array($payload) ? $payload : [];
                $mutation['payload']['__benchmark_node_id'] = (string) $mutation['node_id'];
            }

            $patched[] = $mutation;
        }

        return $patched;
    }

    /**
     * @param list<string> $nodeIds
     * @return array<string, string>
     */
    private function collectNodeStatuses(ASTOrchestrator $orchestrator, array $nodeIds): array
    {
        $statuses = [];
        foreach ($nodeIds as $nodeId) {
            try {
                $statuses[$nodeId] = $orchestrator->getNodeStatus($nodeId);
            } catch (\Throwable) {
                $statuses[$nodeId] = 'MISSING';
            }
        }

        return $statuses;
    }

    /**
     * @param array<string, string> $statuses
     * @return array<string, int>
     */
    private function countStatuses(array $statuses): array
    {
        $counts = [];
        foreach ($statuses as $status) {
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        }

        return $counts;
    }

    /**
     * @param array<string, string> $statuses
     */
    private function stateMatches(BenchmarkScenario $scenario, array $statuses): bool
    {
        $expectedState = $scenario->expectedState();
        if ($expectedState !== []) {
            foreach ($expectedState as $nodeId => $expectedStatus) {
                if (($statuses[$nodeId] ?? null) !== $expectedStatus) {
                    return false;
                }
            }

            return true;
        }

        if ($scenario->expectsAllSuccess()) {
            foreach ($scenario->nodeIds() as $nodeId) {
                if (($statuses[$nodeId] ?? null) !== NodeStatus::SUCCESS) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * @param array<string, string> $statuses
     * @return array<string, mixed>
     */
    private function resultPayload(
        string $mode,
        int $totalNodes,
        array $statuses,
        int $successNodes,
        int $failedNodes,
        int $blockedNodes,
        bool $stateMatch,
        int $cycles,
        int $validationFaults,
        int $tokenEstimate,
        int $elapsedMs,
        string $notes,
    ): array {
        return [
            'mode' => $mode,
            'label' => BenchmarkMode::label($mode),
            'total_nodes' => $totalNodes,
            'success_nodes' => $successNodes,
            'failed_nodes' => $failedNodes,
            'blocked_nodes' => $blockedNodes,
            'completion_rate' => $totalNodes > 0 ? round($successNodes / $totalNodes, 4) : 1.0,
            'state_match' => $stateMatch,
            'cycles' => $cycles,
            'validation_faults' => $validationFaults,
            'token_estimate' => $tokenEstimate,
            'elapsed_ms' => $elapsedMs,
            'node_statuses' => $statuses,
            'notes' => $notes,
        ];
    }

    private function estimateAvmTokens(ASTOrchestrator $orchestrator, BenchmarkScenario $scenario): int
    {
        return max(1, (int) round((strlen($orchestrator->serializeDagState()) + $scenario->mutationCount() * 80) / 3.5));
    }

    private function estimateDirectTokens(BenchmarkScenario $scenario): int
    {
        return max(1, (int) round(strlen(json_encode($scenario->toArray())) / 3.5));
    }

    private function appearsAfter(BenchmarkScenario $scenario, string $nodeId, string $target): bool
    {
        $seenTarget = false;
        foreach ($scenario->nodeIds() as $candidate) {
            if ($candidate === $target) {
                $seenTarget = true;
                continue;
            }
            if ($candidate === $nodeId) {
                return $seenTarget;
            }
        }

        return false;
    }

    /**
     * @param array<string, array<string, mixed>> $modes
     * @return array<string, mixed>
     */
    private function compareModes(array $modes): array
    {
        $avm = $modes[BenchmarkMode::AVM_ON] ?? [];
        $direct = $modes[BenchmarkMode::AVM_OFF_DIRECT] ?? [];
        $tool = $modes[BenchmarkMode::TOOL_AGENT] ?? [];

        return [
            'avm_vs_direct_completion_delta' => round(($avm['completion_rate'] ?? 0) - ($direct['completion_rate'] ?? 0), 4),
            'avm_vs_tool_completion_delta' => round(($avm['completion_rate'] ?? 0) - ($tool['completion_rate'] ?? 0), 4),
            'avm_blocked_nodes_delta_vs_direct' => (int) ($avm['blocked_nodes'] ?? 0) - (int) ($direct['blocked_nodes'] ?? 0),
            'avm_state_match' => (bool) ($avm['state_match'] ?? false),
        ];
    }
}
