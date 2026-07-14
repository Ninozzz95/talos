<?php

declare(strict_types=1);

// Quick HMI demo: spawns a DAG, executes nodes, broadcasts to dashboard
// Usage: php tests/hmi-demo.php

require_once __DIR__ . '/../src/NodeStatus.php';
require_once __DIR__ . '/../src/ASTOrchestrator.php';
require_once __DIR__ . '/../src/LLMClientInterface.php';
require_once __DIR__ . '/../src/MockLLM.php';
require_once __DIR__ . '/../src/ValidationFault.php';
require_once __DIR__ . '/../src/ValidationResult.php';
require_once __DIR__ . '/../src/HttpClientInterface.php';
require_once __DIR__ . '/../src/JmpValidatorClient.php';
require_once __DIR__ . '/../src/MainLoopController.php';
require_once __DIR__ . '/../src/Workers/NodeWorkerInterface.php';
require_once __DIR__ . '/../src/Workers/WorkerRegistry.php';
require_once __DIR__ . '/../src/Workers/HttpRequestWorker.php';

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\MockLLM;
use Kadmos\JmpValidatorClient;
use Kadmos\HttpClientInterface;
use Kadmos\MainLoopController;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

// Stub that always succeeds instantly
$successWorker = new class implements NodeWorkerInterface {
    public function execute(array $payload): array {
        return [
            'status' => NodeStatus::SUCCESS,
            'output_summary' => 'Simulated OK',
            'raw_output' => null,
        ];
    }
};

$registry = new WorkerRegistry();
$registry->register('HTTP_REQUEST', $successWorker);
$registry->register('QUERY_DATABASE', $successWorker);

$orchestrator = new ASTOrchestrator($registry);

// Mock LLM script: builds a 3-node DAG step by step
$llm = new MockLLM([
    // Cycle 1: Spawn nodes
    json_encode([
        ['action' => 'SPAWN_NODE', 'node_id' => 'n1', 'node_type' => 'HTTP_REQUEST'],
        ['action' => 'SPAWN_NODE', 'node_id' => 'n2', 'node_type' => 'QUERY_DATABASE', 'dependencies' => ['n1']],
        ['action' => 'SPAWN_NODE', 'node_id' => 'n3', 'node_type' => 'HTTP_REQUEST', 'dependencies' => ['n1']],
    ]),
    // Cycle 2: Configure payloads + yield
    json_encode([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'n1', 'payload' => ['url' => 'https://api.github.com']],
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'n2', 'payload' => ['query' => 'SELECT * FROM users']],
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'n3', 'payload' => ['url' => 'https://api.github.com']],
        ['action' => 'YIELD_EXECUTION'],
    ]),
    // Cycle 3: Yield again (all nodes now SUCCESS)
    json_encode([['action' => 'YIELD_EXECUTION']]),
]);

// Stub HTTP client
$alwaysValid = new class implements HttpClientInterface {
    public function postJson(string $url, array $body): array {
        return ['valid' => true];
    }
};

$validator = new JmpValidatorClient($alwaysValid);

$broadcastUrl = 'http://127.0.0.1:3000/broadcast';

echo "=== KADMOS HMI Demo ===\n";
echo "Open http://127.0.0.1:8000/ in your browser NOW\n";
echo "Waiting 5 seconds...\n";
sleep(5);

echo "Starting Main Loop...\n";
$controller = new MainLoopController($orchestrator, $llm, $validator, 5, $broadcastUrl);
$controller->run();

echo "Done! {$controller->getCycleCount()} cycles run.\n";

// Print final state
echo "\nFinal DAG State:\n";
echo $orchestrator->serializeDagState() . "\n";
