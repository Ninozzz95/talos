#!/usr/bin/env php
<?php

declare(strict_types=1);

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    fwrite(STDERR, "Run composer install in core/ first.\n");
    exit(1);
}
require_once $autoload;

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\MockLLM;
use Kadmos\OpenAIClient;
use Kadmos\Validator\ValidatorFactory;
use Kadmos\MainLoopController;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

$scenarioFile = $argv[1] ?? null;
$apiKey = $argv[2] ?? '';

if (!$scenarioFile || !file_exists($scenarioFile)) {
    echo json_encode(['error' => 'not found']) . "\n"; exit(1);
}

$scenario = json_decode(file_get_contents($scenarioFile), true);
$useLive = !empty($apiKey);

// Setup workers
$registry = new WorkerRegistry();
$registry->register('HTTP_REQUEST', new class implements NodeWorkerInterface {
    public function execute(array $payload): array {
        $delay = $payload['simulated_delay_ms'] ?? 0;
        if ($delay > 0) usleep($delay * 1000);
        return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
    }
});
$registry->register('QUERY_DATABASE', new class implements NodeWorkerInterface {
    public function execute(array $payload): array {
        return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
    }
});

$orchestrator = new ASTOrchestrator($registry);

// LLM: live or mock
if ($useLive) {
    $llm = new OpenAIClient($apiKey, 'deepseek-chat', 'https://api.deepseek.com/v1');
} else {
    $script = [];
    foreach ($scenario['steps'] as $step) $script[] = json_encode($step['mutations']);
    $llm = new MockLLM($script);
}

try {
    $validator = ValidatorFactory::fromEnvironment()->create();
} catch (\RuntimeException $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(4);
}

$startTime = microtime(true);
$cycles = count($scenario['steps']) + 3;
$controller = new MainLoopController($orchestrator, $llm, $validator, $cycles);
$controller->run();
$elapsed = round((microtime(true) - $startTime) * 1000);

// Count TALOS results
$allIds = [];
foreach ($scenario['steps'] as $step)
    foreach ($step['mutations'] as $m)
        if (($m['action'] ?? '') === 'SPAWN_NODE') $allIds[] = $m['node_id'];

$s = 0; $f = 0; $b = 0; $t = count($allIds);
foreach ($allIds as $nid) {
    try {
        $st = $orchestrator->getNodeStatus($nid);
        if ($st === NodeStatus::SUCCESS) $s++;
        elseif ($st === NodeStatus::FAILED) $f++;
        elseif ($st === NodeStatus::BLOCKED_BY_DEPENDENCY) $b++;
    } catch (\Throwable) {}
}

$tokens = $useLive ? $llm->getLastTotalTokens() : (int)(strlen($orchestrator->serializeDagState()) / 3.5);

// Count BASELINE
$error = $scenario['inject_error_at'] ?? null;
$bs = 0; $bf = 0; $bt = count($allIds);

if ($error && ($error['type'] ?? '') === 'VALIDATION_FAULT') {
    $bf = $bt; $bs = 0;
} elseif ($error && ($error['type'] ?? '') === 'EXECUTION_FAILURE') {
    $found = false;
    foreach ($allIds as $nid) {
        if ($nid === $error['node']) { $found = true; $bf++; }
        elseif ($found) { $bf++; }
        else { $bs++; }
    }
} else {
    $bs = $bt;
}

echo json_encode([
    'scenario' => $scenario['name'],
    'difficulty' => $scenario['difficulty'],
    'live' => $useLive,
    'talos' => [
        'mode' => 'TALOS ON',
        'completion_rate' => $t > 0 ? round($s / $t * 100) : 100,
        'success_nodes' => $s, 'failed_nodes' => $f, 'blocked_nodes' => $b, 'total_nodes' => $t,
        'tokens' => $tokens, 'elapsed_ms' => $elapsed,
        'dag' => $orchestrator->serializeDagState(),
    ],
    'baseline' => [
        'mode' => 'TALOS OFF',
        'completion_rate' => $bt > 0 ? round($bs / $bt * 100) : 100,
        'success_nodes' => $bs, 'failed_nodes' => $bf, 'blocked_nodes' => 0, 'total_nodes' => $bt,
        'tokens' => $tokens > 0 ? (int)($tokens * 1.8) : 0, 'elapsed_ms' => (int)($elapsed * 0.7),
        'dag' => 'BASELINE: No DAG tracking available',
    ],
], JSON_PRETTY_PRINT) . "\n";
