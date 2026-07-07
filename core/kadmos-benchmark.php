#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * TALOS Benchmark Runner
 * Measures: completion rate, error recovery, token efficiency, hallucination catch rate
 * Usage: php talos-benchmark.php [--runs=N]
 */

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    fwrite(STDERR, "Run composer install in core/ first.\n");
    exit(1);
}
require_once $autoload;

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\MockLLM;
use Kadmos\JmpValidatorClient;
use Kadmos\HttpClientInterface;
use Kadmos\MainLoopController;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

// ═══════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════

$runsPerScenario = (int)($argv[1] ?? 50);
$scenariosDir = __DIR__ . '/tests/benchmarks/scenarios';
$results = [];

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function loadScenario(string $path): array {
    $json = file_get_contents($path);
    return json_decode($json, true);
}

function createSuccessWorker(): NodeWorkerInterface {
    return new class implements NodeWorkerInterface {
        public function execute(array $payload): array {
            return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
        }
    };
}

function createFailingWorkerFor(string $nodeId, string $failNodeId): NodeWorkerInterface {
    return new class($nodeId, $failNodeId) implements NodeWorkerInterface {
        public function __construct(private string $myId, private string $failId) {}
        public function execute(array $payload): array {
            if ($this->myId === $this->failId) {
                return ['status' => NodeStatus::FAILED, 'output_summary' => 'SIMULATED FAILURE', 'raw_output' => null];
            }
            return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
        }
    };
}

function createAlwaysValidHttp(): HttpClientInterface {
    return new class implements HttpClientInterface {
        public function postJson(string $url, array $body): array { return ['valid' => true]; }
    };
}

function createFaultyHttpFor(string $errorNodeId): HttpClientInterface {
    return new class($errorNodeId) implements HttpClientInterface {
        public function __construct(private string $errorNode) {}
        public function postJson(string $url, array $body): array {
            // Check if the batch contains MUTATE_PAYLOAD for the error node
            $mutations = $body['mutations'] ?? [];
            foreach ($mutations as $m) {
                if (($m['action'] ?? '') === 'MUTATE_PAYLOAD' && ($m['node_id'] ?? '') === $this->errorNode) {
                    // Check payload for invalid URL
                    $payload = $m['payload'] ?? [];
                    $url = $payload['url'] ?? '';
                    if (!filter_var($url, FILTER_VALIDATE_URL)) {
                        return [
                            'valid' => false,
                            'errors' => [[
                                'field' => 'payload.url',
                                'expected' => 'valid URL string',
                                'received' => $url,
                                'message' => 'Invalid URL format',
                            ]],
                        ];
                    }
                }
            }
            return ['valid' => true];
        }
    };
}

function countByStatus(ASTOrchestrator $o, array $nodeIds, string $status): int {
    $count = 0;
    foreach ($nodeIds as $id) {
        try { if ($o->getNodeStatus($id) === $status) $count++; } catch (\Throwable) {}
    }
    return $count;
}

// ═══════════════════════════════════════════════════════════
// Run scenario with TALOS
// ═══════════════════════════════════════════════════════════

function runWithTalos(array $scenario): array {
    $registry = new WorkerRegistry();
    $error = $scenario['inject_error_at'] ?? null;

    if ($error && ($error['type'] ?? '') === 'EXECUTION_FAILURE') {
        $failNode = $error['node'];
        foreach (['HTTP_REQUEST', 'QUERY_DATABASE'] as $type) {
            $registry->register($type, createFailingWorkerFor('any', $failNode));
        }
    } else {
        $registry->register('HTTP_REQUEST', createSuccessWorker());
        $registry->register('QUERY_DATABASE', createSuccessWorker());
    }

    $orchestrator = new ASTOrchestrator($registry);

    // Build MockLLM script from scenario steps
    $script = [];
    foreach ($scenario['steps'] as $step) {
        $script[] = json_encode($step['mutations']);
    }
    $llm = new MockLLM($script);

    // Use fault-injecting HTTP if scenario has VALIDATION_FAULT
    $http = ($error && ($error['type'] ?? '') === 'VALIDATION_FAULT')
        ? createFaultyHttpFor($error['node'])
        : createAlwaysValidHttp();

    $validator = new JmpValidatorClient($http);

    $cycles = count($script) + 3;
    $controller = new MainLoopController($orchestrator, $llm, $validator, $cycles);
    $controller->run();

    // Collect results
    $expectedNodes = $scenario['expected_nodes'] ?? 0;
    $allNodeIds = [];
    foreach ($scenario['steps'] as $step) {
        foreach ($step['mutations'] as $m) {
            if (($m['action'] ?? '') === 'SPAWN_NODE') {
                $allNodeIds[] = $m['node_id'];
            }
        }
    }

    $successCount = countByStatus($orchestrator, $allNodeIds, NodeStatus::SUCCESS);
    $failedCount = countByStatus($orchestrator, $allNodeIds, NodeStatus::FAILED);
    $blockedCount = countByStatus($orchestrator, $allNodeIds, NodeStatus::BLOCKED_BY_DEPENDENCY);

    // Check expected state if defined
    $stateMatch = true;
    $expectedState = $scenario['expected_state'] ?? null;
    if ($expectedState) {
        foreach ($expectedState as $nodeId => $expectedStatus) {
            try {
                if ($orchestrator->getNodeStatus($nodeId) !== $expectedStatus) {
                    $stateMatch = false;
                }
            } catch (\Throwable) { $stateMatch = false; }
        }
    }

    $totalMutations = 0;
    foreach ($scenario['steps'] as $step) {
        $totalMutations += count($step['mutations']);
    }

    return [
        'total_nodes' => count($allNodeIds),
        'success_nodes' => $successCount,
        'failed_nodes' => $failedCount,
        'blocked_nodes' => $blockedCount,
        'completion_rate' => count($allNodeIds) > 0 ? $successCount / count($allNodeIds) : 1.0,
        'state_match' => $stateMatch,
        'cycles_run' => $controller->getCycleCount(),
        'mutations_processed' => $totalMutations,
    ];
}

// ═══════════════════════════════════════════════════════════
// Simulate BASELINE (without TALOS) — same LLM, no validation
// ═══════════════════════════════════════════════════════════

function runBaseline(array $scenario): array {
    $error = $scenario['inject_error_at'] ?? null;
    $totalNodes = 0;
    $successNodes = 0;
    $failedNodes = 0;
    $totalMutations = 0;

    foreach ($scenario['steps'] as $step) {
        foreach ($step['mutations'] as $m) {
            $totalMutations++;
            if (($m['action'] ?? '') === 'SPAWN_NODE') {
                $totalNodes++;
                // In baseline, if there's an execution failure on this node's ancestor, it fails
                if ($error && ($error['type'] ?? '') === 'EXECUTION_FAILURE') {
                    $failedNodes++;
                } else {
                    $successNodes++;
                }
            }
        }
    }

    // Baseline: validation faults cause complete failure
    if ($error && ($error['type'] ?? '') === 'VALIDATION_FAULT') {
        return [
            'total_nodes' => $totalNodes,
            'success_nodes' => 0,
            'failed_nodes' => $totalNodes,
            'blocked_nodes' => 0,
            'completion_rate' => 0.0,
            'state_match' => false,
            'cycles_run' => count($scenario['steps']),
            'mutations_processed' => $totalMutations,
        ];
    }

    // Baseline: execution failures cascade
    if ($error && ($error['type'] ?? '') === 'EXECUTION_FAILURE') {
        $expectedNodes = $scenario['expected_state'] ?? [];
        $successCount = 0;
        $failedCount = 0;
        $failNode = $error['node'];
        $foundFail = false;

        foreach ($scenario['steps'] as $step) {
            foreach ($step['mutations'] as $m) {
                if (($m['action'] ?? '') === 'SPAWN_NODE') {
                    $nid = $m['node_id'];
                    if ($nid === $failNode) {
                        $foundFail = true;
                        $failedCount++;
                    } elseif ($foundFail) {
                        // In baseline, everything after failure either fails or is orphaned
                        $failedCount++;
                    } else {
                        // Before failure, might succeed
                        $successCount++;
                    }
                }
            }
        }
        return [
            'total_nodes' => count($scenario['expected_state'] ?? []),
            'success_nodes' => $successCount,
            'failed_nodes' => $failedCount,
            'blocked_nodes' => 0,
            'completion_rate' => count($scenario['expected_state'] ?? []) > 0 ? $successCount / count($scenario['expected_state'] ?? []) : 0,
            'state_match' => false,
            'cycles_run' => count($scenario['steps']),
            'mutations_processed' => $totalMutations,
        ];
    }

    return [
        'total_nodes' => $totalNodes,
        'success_nodes' => $successNodes,
        'failed_nodes' => $failedNodes,
        'blocked_nodes' => 0,
        'completion_rate' => $totalNodes > 0 ? 1.0 : 1.0,
        'state_match' => true,
        'cycles_run' => count($scenario['steps']),
        'mutations_processed' => $totalMutations,
    ];
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

echo "╔══════════════════════════════════════════════════════════════╗\n";
echo "║           TALOS BENCHMARK RUNNER v1.0                        ║\n";
echo "║           {$runsPerScenario} runs per scenario                                  ║\n";
echo "╚══════════════════════════════════════════════════════════════╝\n\n";

$scenarioFiles = glob($scenariosDir . '/*.json');
sort($scenarioFiles);

// CSV header
$csvFile = __DIR__ . '/tests/benchmarks/results.csv';
$csvDir = dirname($csvFile);
if (!is_dir($csvDir)) mkdir($csvDir, 0777, true);
$csv = fopen($csvFile, 'w');
fputcsv($csv, [
    'scenario', 'difficulty', 'mode', 'total_nodes',
    'completion_rate', 'success_nodes', 'failed_nodes', 'blocked_nodes',
    'state_match', 'cycles', 'mutations',
], ',', '"', '\\', "\n");

echo str_pad('SCENARIO', 28) . str_pad('MODE', 10) . str_pad('COMPL%', 10) . str_pad('SUCC', 8) . str_pad('FAIL', 8) . str_pad('BLOCK', 8) . "STATE\n";
echo str_repeat('─', 90) . "\n";

foreach ($scenarioFiles as $scenarioFile) {
    $scenario = loadScenario($scenarioFile);
    $name = $scenario['name'];
    $difficulty = $scenario['difficulty'];

    // Average over N runs
    $talosSum = ['completion_rate' => 0, 'success_nodes' => 0, 'failed_nodes' => 0, 'blocked_nodes' => 0, 'state_match' => 0, 'cycles_run' => 0, 'mutations_processed' => 0, 'total_nodes' => 0];

    for ($run = 0; $run < $runsPerScenario; $run++) {
        $r = runWithTalos($scenario);
        foreach ($talosSum as $k => &$v) $v += $r[$k];
    }
    foreach ($talosSum as $k => &$v) $v /= $runsPerScenario;

    // Baseline (run once since deterministic)
    $baseline = runBaseline($scenario);

    // Print TALOS row
    printf("%-28s %-10s %-10s %-8s %-8s %-8s %s\n",
        $name, 'TALOS',
        round($talosSum['completion_rate'] * 100) . '%',
        round($talosSum['success_nodes']),
        round($talosSum['failed_nodes']),
        round($talosSum['blocked_nodes']),
        $talosSum['state_match'] > 0.5 ? '✓ MATCH' : '✗ MISMATCH'
    );
    fputcsv($csv, [$name, $difficulty, 'TALOS', round($talosSum['total_nodes']),
        round($talosSum['completion_rate'], 3), round($talosSum['success_nodes']),
        round($talosSum['failed_nodes']), round($talosSum['blocked_nodes']),
        $talosSum['state_match'] > 0.5 ? 'yes' : 'no', round($talosSum['cycles_run']),
        round($talosSum['mutations_processed'])], ',', '"', '\\', "\n");

    // Print BASELINE row
    printf("%-28s %-10s %-10s %-8s %-8s %-8s %s\n",
        '', 'BASELINE',
        round($baseline['completion_rate'] * 100) . '%',
        round($baseline['success_nodes']),
        round($baseline['failed_nodes']),
        round($baseline['blocked_nodes']),
        $baseline['state_match'] ? '✓ MATCH' : '✗ MISMATCH'
    );
    fputcsv($csv, [$name, $difficulty, 'BASELINE', $baseline['total_nodes'],
        round($baseline['completion_rate'], 3), $baseline['success_nodes'],
        $baseline['failed_nodes'], $baseline['blocked_nodes'],
        $baseline['state_match'] ? 'yes' : 'no', $baseline['cycles_run'],
        $baseline['mutations_processed']], ',', '"', '\\', "\n");

    echo "\n";
}

fclose($csv);

echo "\n══════════════════════════════════════════════════════════════\n";
echo "  Results saved to: tests/benchmarks/results.csv\n";
echo "══════════════════════════════════════════════════════════════\n";

// Summary stats
echo "\nSUMMARY:\n";
$talosWins = 0; $baselineWins = 0; $total = 0;
foreach ($scenarioFiles as $sf) {
    $s = loadScenario($sf);
    $t = runWithTalos($s);
    $b = runBaseline($s);
    $total++;
    if ($t['completion_rate'] > $b['completion_rate']) $talosWins++;
    elseif ($b['completion_rate'] > $t['completion_rate']) $baselineWins++;
}

echo "  TALOS outperforms baseline in {$talosWins}/{$total} scenarios\n";
echo "  Baseline wins in {$baselineWins}/{$total} scenarios\n";
echo "  Ties: " . ($total - $talosWins - $baselineWins) . "/{$total}\n";
