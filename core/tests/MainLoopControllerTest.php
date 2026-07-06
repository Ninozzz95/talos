<?php

declare(strict_types=1);

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

use AVM\ASTOrchestrator;
use AVM\NodeStatus;
use AVM\MockLLM;
use AVM\JmpValidatorClient;
use AVM\HttpClientInterface;
use AVM\MainLoopController;
use AVM\Workers\WorkerRegistry;
use AVM\Workers\NodeWorkerInterface;

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new \RuntimeException(
            $message . PHP_EOL .
            'Expected: ' . var_export($expected, true) . PHP_EOL .
            'Actual:   ' . var_export($actual, true)
        );
    }
}

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new \RuntimeException($message);
    }
}

// Stub HTTP client that always returns valid
final class AlwaysValidHttpClient implements HttpClientInterface
{
    public function postJson(string $url, array $body): array
    {
        return ['valid' => true];
    }
}

// Stub worker that always succeeds
final class SuccessWorker implements NodeWorkerInterface
{
    public function execute(array $payload): array
    {
        return [
            'status' => NodeStatus::SUCCESS,
            'output_summary' => 'OK',
            'raw_output' => null,
        ];
    }
}

function testMainLoopBuildsAndExecutesDag(): void
{
    $registry = new WorkerRegistry();
    $registry->register('HTTP_REQUEST', new SuccessWorker());

    $orchestrator = new ASTOrchestrator($registry);
    $llm = new MockLLM([
        // Cycle 1: spawn two nodes
        \json_encode([
            ['action' => 'SPAWN_NODE', 'node_id' => 'A', 'node_type' => 'HTTP_REQUEST'],
            ['action' => 'SPAWN_NODE', 'node_id' => 'B', 'node_type' => 'HTTP_REQUEST', 'dependencies' => ['A']],
        ]),
        // Cycle 2: configure payloads + yield
        \json_encode([
            ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'A', 'payload' => ['url' => 'https://example.com']],
            ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'B', 'payload' => ['url' => 'https://example.com']],
            ['action' => 'YIELD_EXECUTION'],
        ]),
        // Cycle 3: yield again (loop continues)
        \json_encode([
            ['action' => 'YIELD_EXECUTION'],
        ]),
    ]);

    $validator = new JmpValidatorClient(new AlwaysValidHttpClient());
    $controller = new MainLoopController($orchestrator, $llm, $validator, 5);
    $controller->run();

    // After the loop, both nodes should be SUCCESS
    assertSameValue(NodeStatus::SUCCESS, $orchestrator->getNodeStatus('A'), 'A should be SUCCESS.');
    assertSameValue(NodeStatus::SUCCESS, $orchestrator->getNodeStatus('B'), 'B should be SUCCESS.');
    assertTrue($llm->isExhausted(), 'MockLLM should have exhausted all scripted responses.');
}

function testMainLoopHandlesValidationFault(): void
{
    $registry = new WorkerRegistry();
    $orchestrator = new ASTOrchestrator($registry);

    // Mock LLM that generates invalid actions
    $llm = new MockLLM([
        \json_encode([['action' => 'INVALID_ACTION']]),
    ]);

    // Stub HTTP that returns validation fault
    $faultyHttp = new class implements HttpClientInterface {
        public function postJson(string $url, array $body): array
        {
            return [
                'valid' => false,
                'errors' => [
                    ['field' => 'action', 'expected' => 'SPAWN_NODE|MUTATE_PAYLOAD|YIELD_EXECUTION', 'received' => 'INVALID_ACTION', 'message' => 'Unknown action.'],
                ],
            ];
        }
    };

    $validator = new JmpValidatorClient($faultyHttp);
    $controller = new MainLoopController($orchestrator, $llm, $validator, 3);
    $controller->run();

    // Validation fault should have been injected
    $faults = $llm->getInjectedFaults();
    assertTrue(\count($faults) > 0, 'Validation faults should be injected into LLM.');
    assertSameValue('action', $faults[0]['field'], 'Fault field should match.');
}

function testMainLoopStopsAtMaxCycles(): void
{
    $registry = new WorkerRegistry();
    $orchestrator = new ASTOrchestrator($registry);

    $llm = new MockLLM([
        \json_encode([['action' => 'YIELD_EXECUTION']]),
    ]);

    $validator = new JmpValidatorClient(new AlwaysValidHttpClient());
    $controller = new MainLoopController($orchestrator, $llm, $validator, 2);
    $controller->run();

    assertSameValue(2, $controller->getCycleCount(), 'Controller should stop after maxCycles.');
}

function testDagSerializationContainsNodes(): void
{
    $registry = new WorkerRegistry();
    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('X', [], 'HTTP_REQUEST');
    $orchestrator->addNode('Y', ['X'], 'QUERY_DATABASE');

    $serialized = $orchestrator->serializeDagState();

    assertTrue(\str_contains($serialized, 'X'), 'Serialization should contain node X.');
    assertTrue(\str_contains($serialized, 'Y'), 'Serialization should contain node Y.');
    assertTrue(\str_contains($serialized, 'HTTP_REQUEST'), 'Serialization should contain node type.');
    assertTrue(\str_contains($serialized, 'PENDING'), 'Serialization should contain node status.');
}

$tests = [
    'testMainLoopBuildsAndExecutesDag',
    'testMainLoopHandlesValidationFault',
    'testMainLoopStopsAtMaxCycles',
    'testDagSerializationContainsNodes',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All MainLoopController tests passed" . PHP_EOL;
