#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * KADMOS Execute — Headless JMP execution
 * Reads JSON line from stdin: {mutations: [...], api_key: "..."}
 * Executes JMP deterministically, returns DAG state
 */

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    fwrite(STDERR, "Run composer install in core/ first.\n");
    exit(1);
}
require_once $autoload;

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\Validator\ValidatorFactory;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

$line = fgets(STDIN);
if ($line === false || trim($line) === '') {
    echo json_encode(['error' => 'no input']) . "\n"; exit(1);
}

$input = json_decode($line, true);
if (!$input || !isset($input['mutations'])) {
    echo json_encode(['error' => 'invalid input, expected {mutations: [...]}']) . "\n"; exit(1);
}

$batch = $input['mutations'];

// Setup
$worker = new class implements NodeWorkerInterface {
    public function execute(array $payload): array {
        return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
    }
};

$registry = new WorkerRegistry();
$registry->register('HTTP_REQUEST', $worker);
$registry->register('QUERY_DATABASE', $worker);

$orchestrator = new ASTOrchestrator($registry);

try {
    $validator = ValidatorFactory::fromEnvironment()->create();
} catch (\RuntimeException $e) {
    echo json_encode(['error' => $e->getMessage()]) . "\n";
    exit(4);
}

// Validate
$context = $orchestrator->buildContext($batch);
$validation = $validator->validate($batch, $context);

if (!$validation->valid) {
    $errors = array_map(fn($f) => "{$f->field}: {$f->message}", $validation->errors);
    echo json_encode(['status' => 'rejected', 'errors' => $errors, 'dag' => $orchestrator->serializeDagState()]) . "\n";
    exit(1);
}

// Apply
foreach ($batch as $mutation) {
    $action = $mutation['action'] ?? '';
    switch ($action) {
        case 'SPAWN_NODE':
            $nodeId = (string)($mutation['node_id'] ?? '');
            $nodeType = (string)($mutation['node_type'] ?? 'UNKNOWN');
            $deps = isset($mutation['dependencies']) && is_array($mutation['dependencies'])
                ? array_map('strval', $mutation['dependencies']) : [];
            $orchestrator->addNode($nodeId, $deps, $nodeType);
            break;
        case 'MUTATE_PAYLOAD':
            $nodeId = (string)($mutation['node_id'] ?? '');
            $payload = isset($mutation['payload']) && is_array($mutation['payload'])
                ? $mutation['payload'] : [];
            $orchestrator->setPayload($nodeId, $payload);
            break;
    }
}

// Execute
$queue = $orchestrator->getExecutionQueue();
foreach ($queue as $nodeId) {
    try { $orchestrator->executeNode($nodeId); } catch (\Throwable) {}
}
$queue = $orchestrator->getExecutionQueue();
foreach ($queue as $nodeId) {
    try { $orchestrator->executeNode($nodeId); } catch (\Throwable) {}
}

echo json_encode([
    'status' => 'executed',
    'dag' => $orchestrator->serializeDagState(),
    'nodes_processed' => count($queue),
]) . "\n";
