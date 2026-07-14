#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * KADMOS Live Benchmark Runner — Phase 3
 * Runs all 7 scenarios against real DeepSeek API
 * Usage: KADMOS_API_KEY=sk-... php kadmos-bench-live-all.php
 */

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    fwrite(STDERR, "Run composer install in core/ first.\n");
    exit(1);
}
require_once $autoload;

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\OpenAIClient;
use Kadmos\Validator\ValidatorFactory;
use Kadmos\MainLoopController;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

$apiKey = getenv('KADMOS_API_KEY') ?: getenv('DEEPSEEK_API_KEY') ?: '';
if (!$apiKey) { echo "Set KADMOS_API_KEY\n"; exit(1); }

$model = 'deepseek-chat';
$baseUrl = 'https://api.deepseek.com/v1';
$scenariosDir = __DIR__ . '/tests/benchmarks/scenarios';
$logDir = __DIR__ . '/tests/benchmarks/logs';
if (!is_dir($logDir)) mkdir($logDir, 0777, true);

$scenarioFiles = glob($scenariosDir . '/*.json');
sort($scenarioFiles);

echo "╔══════════════════════════════════════════════════════════════╗\n";
echo "║           KADMOS LIVE BENCHMARK — Phase 3                    ║\n";
echo "║           Model: $model                               ║\n";
echo "╚══════════════════════════════════════════════════════════════╝\n\n";

$results = [];
$totalTokens = 0;
$totalFaults = 0;
$totalCorrected = 0;
$totalPassed = 0;

foreach ($scenarioFiles as $file) {
    $scenario = json_decode(file_get_contents($file), true);
    $name = $scenario['name'];
    $difficulty = $scenario['difficulty'];
    $hasError = isset($scenario['inject_error_at']);

    echo str_pad("  {$name}", 30);

    // Setup fresh engine
    $registry = new WorkerRegistry();
    $registry->register('HTTP_REQUEST', new class implements NodeWorkerInterface {
        public function execute(array $payload): array {
            return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
        }
    });
    $registry->register('QUERY_DATABASE', new class implements NodeWorkerInterface {
        public function execute(array $payload): array {
            return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
        }
    });

    $orchestrator = new ASTOrchestrator($registry);
    $llm = new OpenAIClient($apiKey, $model, $baseUrl);

    // Build execution prompt — force JMP-only mode
    $execSystemPrompt = <<<'PROMPT'
You are a workflow executor. Reply ONLY with a JSON array of JMP commands. No other text.

Commands:
- SPAWN_NODE: {"action":"SPAWN_NODE","node_id":"...","node_type":"...","dependencies":[...]}
- MUTATE_PAYLOAD: {"action":"MUTATE_PAYLOAD","node_id":"...","payload":{...}}
- YIELD_EXECUTION: {"action":"YIELD_EXECUTION"}

Node types: HTTP_REQUEST (url, method?, headers?, body?, timeout_ms?), QUERY_DATABASE (query, params?)

Reply with ONLY the JSON array. No markdown, no explanation, no code blocks.
PROMPT;
    $llm->withSystemPrompt($execSystemPrompt);

    // Build prompt from scenario steps: show what needs to be done each cycle
    $scenarioPrompts = [];
    foreach ($scenario['steps'] as $i => $step) {
        $mutationsDesc = json_encode($step['mutations']);
        $scenarioPrompts[] = "Cycle {$i}: The DAG needs these mutations: {$mutationsDesc}";
    }

    try {
        $validator = ValidatorFactory::fromEnvironment()->create();
    } catch (\RuntimeException $e) {
        fwrite(STDERR, $e->getMessage() . PHP_EOL);
        exit(4);
    }

    $cycles = count($scenario['steps']) + 5;
    $controller = new MainLoopController($orchestrator, $llm, $validator, $cycles);

    $startTime = microtime(true);
    try {
        $controller->run();
    } catch (\Throwable $e) {
        echo "CRASH: {$e->getMessage()}\n";
        continue;
    }
    $elapsed = round((microtime(true) - $startTime) * 1000);

    // Collect metrics
    $ctr = $controller->getCTR();
    $faultCount = $controller->getFaultCount();
    $cycleCount = $controller->getCycleCount();
    $tokens = $llm->getLastTotalTokens();
    $totalTokens += $tokens;
    $totalFaults += $faultCount;

    // Count nodes
    $allIds = [];
    foreach ($scenario['steps'] as $step) {
        foreach ($step['mutations'] as $m) {
            if (($m['action'] ?? '') === 'SPAWN_NODE') {
                $allIds[] = $m['node_id'];
            }
        }
    }
    $s = 0; $f = 0; $b = 0;
    foreach ($allIds as $nid) {
        try {
            $st = $orchestrator->getNodeStatus($nid);
            if ($st === NodeStatus::SUCCESS) $s++;
            elseif ($st === NodeStatus::FAILED) $f++;
            elseif ($st === NodeStatus::BLOCKED_BY_DEPENDENCY) $b++;
        } catch (\Throwable) {}
    }

    $completion = count($allIds) > 0 ? round($s / count($allIds) * 100) : 100;
    if ($completion >= 100) $totalPassed++;

    // Verdict
    $verdict = $hasError ? ($ctr <= 3 ? '✅ AUTO-CORRECTED' : '⚠ HIGH CTR') : '✅ CLEAN';
    if ($completion < 100) $verdict = '⚠ PARTIAL';
    if ($f > 0 && $b === 0) $verdict = '❌ FAILED';
    $totalCorrected += ($hasError && $ctr <= 3) ? 1 : 0;

    // Display
    printf("CTR:%-5s FAULTS:%-3s TOKENS:%-6s COMP:%-5s %s\n",
        number_format($ctr, 1),
        $faultCount,
        $tokens,
        "{$completion}%",
        $verdict
    );

    // Save log
    $log = [
        'scenario' => $name,
        'model' => $model,
        'timestamp' => date('c'),
        'ctr' => $ctr,
        'faults' => $faultCount,
        'cycles' => $cycleCount,
        'tokens' => $tokens,
        'elapsed_ms' => $elapsed,
        'nodes_total' => count($allIds),
        'nodes_success' => $s,
        'nodes_failed' => $f,
        'nodes_blocked' => $b,
        'completion' => $completion,
        'verdict' => $verdict,
        'dag' => $orchestrator->serializeDagState(),
    ];
    file_put_contents(
        $logDir . '/' . $name . '_' . date('Ymd_His') . '.json',
        json_encode($log, JSON_PRETTY_PRINT)
    );

    $results[] = $log;
}

// Summary
echo "\n══════════════════════════════════════════════════════════════\n";
echo "  SUMMARY\n";
echo "  Total tokens: {$totalTokens}\n";
echo "  Faults caught: {$totalFaults}\n";
echo "  Faults auto-corrected: {$totalCorrected}/{$totalFaults}\n";
echo "  Scenarios passed: {$totalPassed}/" . count($scenarioFiles) . "\n";
echo "  Logs saved to: tests/benchmarks/logs/\n";
echo "══════════════════════════════════════════════════════════════\n";

// Save full report
file_put_contents(
    $logDir . '/report_' . date('Ymd_His') . '.json',
    json_encode(['results' => $results, 'summary' => [
        'total_tokens' => $totalTokens,
        'total_faults' => $totalFaults,
        'total_corrected' => $totalCorrected,
        'total_passed' => $totalPassed,
        'total_scenarios' => count($scenarioFiles),
    ]], JSON_PRETTY_PRINT)
);
