<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/NodeStatus.php';
require_once __DIR__ . '/../src/ASTOrchestrator.php';
require_once __DIR__ . '/../src/DagRepositoryInterface.php';
require_once __DIR__ . '/../src/SqliteDagRepository.php';
require_once __DIR__ . '/../src/Workers/NodeWorkerInterface.php';
require_once __DIR__ . '/../src/Workers/WorkerRegistry.php';

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\SqliteDagRepository;
use Kadmos\Workers\WorkerRegistry;

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

function testSaveAndLoadPreservesState(): void
{
    $registry = new WorkerRegistry();
    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('A', [], 'HTTP_REQUEST');
    $orchestrator->addNode('B', ['A'], 'QUERY_DATABASE');

    // Set some state
    $orchestrator->markRunning('A');
    $orchestrator->markSuccess('A');

    $repo = new SqliteDagRepository(); // in-memory
    $repo->save($orchestrator);

    // Create fresh orchestrator and load
    $orchestrator2 = new ASTOrchestrator(new WorkerRegistry());
    $loaded = $repo->load($orchestrator2);

    assertTrue($loaded, 'Should load saved state.');
    assertSameValue(NodeStatus::SUCCESS, $orchestrator2->getNodeStatus('A'), 'Node A should be SUCCESS.');
    assertSameValue(NodeStatus::PENDING, $orchestrator2->getNodeStatus('B'), 'Node B should be PENDING.');
}

function testExistsReturnsTrueAfterSave(): void
{
    $registry = new WorkerRegistry();
    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('X', [], 'HTTP_REQUEST');

    $repo = new SqliteDagRepository();
    assertTrue(!$repo->exists(), 'Should not exist before save.');

    $repo->save($orchestrator);
    assertTrue($repo->exists(), 'Should exist after save.');
}

function testClearRemovesState(): void
{
    $registry = new WorkerRegistry();
    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('X', [], 'HTTP_REQUEST');

    $repo = new SqliteDagRepository();
    $repo->save($orchestrator);
    assertTrue($repo->exists(), 'Should exist after save.');

    $repo->clear();
    assertTrue(!$repo->exists(), 'Should not exist after clear.');
}

function testLoadReturnsFalseWhenEmpty(): void
{
    $repo = new SqliteDagRepository();
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());

    $loaded = $repo->load($orchestrator);
    assertTrue(!$loaded, 'Should return false when nothing saved.');
}

function testFullWorkflowPersistsAndRestores(): void
{
    // Build DAG, execute, save, reload, verify

    $registry = new WorkerRegistry();
    $registry->register('HTTP_REQUEST', new class implements \Kadmos\Workers\NodeWorkerInterface {
        public function execute(array $payload): array {
            return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
        }
    });
    $registry->register('QUERY_DATABASE', new class implements \Kadmos\Workers\NodeWorkerInterface {
        public function execute(array $payload): array {
            return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
        }
    });

    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('api', [], 'HTTP_REQUEST');
    $orchestrator->addNode('db', ['api'], 'QUERY_DATABASE');
    $orchestrator->addNode('email', ['db'], 'HTTP_REQUEST');

    $orchestrator->setPayload('api', ['url' => 'https://api.example.com']);
    $orchestrator->setPayload('db', ['query' => 'SELECT 1']);
    $orchestrator->setPayload('email', ['url' => 'https://mail.example.com']);

    $orchestrator->executeNode('api');
    $orchestrator->executeNode('db');
    // email stays VALIDATED (not yet executed)

    assertSameValue(NodeStatus::SUCCESS, $orchestrator->getNodeStatus('api'), 'api should be SUCCESS.');
    assertSameValue(NodeStatus::SUCCESS, $orchestrator->getNodeStatus('db'), 'db should be SUCCESS.');
    assertSameValue(NodeStatus::VALIDATED, $orchestrator->getNodeStatus('email'), 'email should be VALIDATED.');

    // Save
    $repo = new SqliteDagRepository();
    $repo->save($orchestrator);

    // Reload into new orchestrator
    $orchestrator2 = new ASTOrchestrator(new WorkerRegistry());
    $repo->load($orchestrator2);

    // Verify ALL state preserved
    assertSameValue(NodeStatus::SUCCESS, $orchestrator2->getNodeStatus('api'), 'Reloaded: api should be SUCCESS.');
    assertSameValue(NodeStatus::SUCCESS, $orchestrator2->getNodeStatus('db'), 'Reloaded: db should be SUCCESS.');
    assertSameValue(NodeStatus::VALIDATED, $orchestrator2->getNodeStatus('email'), 'Reloaded: email should be VALIDATED.');
}

$tests = [
    'testSaveAndLoadPreservesState',
    'testExistsReturnsTrueAfterSave',
    'testClearRemovesState',
    'testLoadReturnsFalseWhenEmpty',
    'testFullWorkflowPersistsAndRestores',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All DagRepository tests passed" . PHP_EOL;
