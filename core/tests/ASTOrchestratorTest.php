<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/NodeStatus.php';
require_once __DIR__ . '/../src/ASTOrchestrator.php';
require_once __DIR__ . '/../src/Workers/NodeWorkerControlException.php';
require_once __DIR__ . '/../src/Workers/NodeWorkerInterface.php';
require_once __DIR__ . '/../src/Workers/WorkerRegistry.php';

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\Workers\NodeWorkerInterface;
use Kadmos\Workers\NodeWorkerControlException;
use Kadmos\Workers\WorkerRegistry;

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            $message . PHP_EOL .
            'Expected: ' . var_export($expected, true) . PHP_EOL .
            'Actual:   ' . var_export($actual, true)
        );
    }
}

function testFailureCascadesToLinearDescendants(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());
    $orchestrator->addNode('A');
    $orchestrator->addNode('B', ['A']);
    $orchestrator->addNode('C', ['B']);

    $orchestrator->markRunning('A');
    $orchestrator->markFailed('A');

    assertSameValue(NodeStatus::FAILED, $orchestrator->getNodeStatus('A'), 'A should fail.');
    assertSameValue(NodeStatus::BLOCKED_BY_DEPENDENCY, $orchestrator->getNodeStatus('B'), 'B should be blocked by A.');
    assertSameValue(NodeStatus::BLOCKED_BY_DEPENDENCY, $orchestrator->getNodeStatus('C'), 'C should be blocked by A through B.');
    assertSameValue([], $orchestrator->getExecutionQueue(), 'No node should be schedulable after A fails.');
}

function testFailureBlocksSharedChildUntilAllParentsSucceed(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());
    $orchestrator->addNode('A');
    $orchestrator->addNode('B');
    $orchestrator->addNode('C', ['A', 'B']);

    $orchestrator->markRunning('A');
    $orchestrator->markSuccess('A');
    $orchestrator->markRunning('B');
    $orchestrator->markFailed('B');

    assertSameValue(NodeStatus::SUCCESS, $orchestrator->getNodeStatus('A'), 'A should succeed.');
    assertSameValue(NodeStatus::FAILED, $orchestrator->getNodeStatus('B'), 'B should fail.');
    assertSameValue(NodeStatus::BLOCKED_BY_DEPENDENCY, $orchestrator->getNodeStatus('C'), 'C should be blocked while B is failed.');
    assertSameValue([], $orchestrator->getExecutionQueue(), 'C should not be schedulable until B succeeds.');
}

function testHmiRetryRestoresBlockedDescendants(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());
    $orchestrator->addNode('A');
    $orchestrator->addNode('B', ['A']);
    $orchestrator->addNode('C', ['B']);

    $orchestrator->markRunning('A');
    $orchestrator->markFailed('A');
    $orchestrator->forceRetry('A');
    $orchestrator->markRunning('A');
    $orchestrator->markSuccess('A');

    assertSameValue(NodeStatus::SUCCESS, $orchestrator->getNodeStatus('A'), 'A should recover to success.');
    assertSameValue(NodeStatus::PENDING, $orchestrator->getNodeStatus('B'), 'B should be restored after A succeeds.');
    assertSameValue(NodeStatus::PENDING, $orchestrator->getNodeStatus('C'), 'C should be restored but remain gated by B.');
    assertSameValue(['B'], $orchestrator->getExecutionQueue(), 'B should be the first schedulable restored node.');
}

function testHmiRetryDoesNotRestoreChildWhileAnotherParentFailed(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());
    $orchestrator->addNode('A');
    $orchestrator->addNode('B');
    $orchestrator->addNode('C', ['A', 'B']);

    $orchestrator->markRunning('A');
    $orchestrator->markFailed('A');
    $orchestrator->markRunning('B');
    $orchestrator->markFailed('B');

    $orchestrator->forceRetry('A');
    $orchestrator->markRunning('A');
    $orchestrator->markSuccess('A');

    assertSameValue(NodeStatus::SUCCESS, $orchestrator->getNodeStatus('A'), 'A should recover to success.');
    assertSameValue(NodeStatus::FAILED, $orchestrator->getNodeStatus('B'), 'B should remain failed.');
    assertSameValue(NodeStatus::BLOCKED_BY_DEPENDENCY, $orchestrator->getNodeStatus('C'), 'C should stay blocked while B is failed.');
    assertSameValue([], $orchestrator->getExecutionQueue(), 'No child should be schedulable while one parent remains failed.');
}

function testExecuteNodeRejectsUnsatisfiedDependencies(): void
{
    $registry = new WorkerRegistry();
    $registry->register('TEST', new class implements NodeWorkerInterface {
        public function execute(array $payload): array
        {
            return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'done', 'raw_output' => null];
        }
    });
    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('A', [], 'TEST');
    $orchestrator->setPayload('A', []);
    $orchestrator->addNode('B', ['A'], 'TEST');
    $orchestrator->setPayload('B', []);

    $blocked = false;
    try {
        $orchestrator->executeNode('B');
    } catch (RuntimeException $exception) {
        $blocked = str_contains($exception->getMessage(), 'dependencies have not succeeded');
    }

    assertSameValue(true, $blocked, 'Direct execution must enforce the same dependency barrier as the scheduler.');
    assertSameValue(NodeStatus::VALIDATED, $orchestrator->getNodeStatus('B'), 'Rejected execution must not mutate the child state.');
}

function testWorkerExceptionDoesNotLeakIntoDagState(): void
{
    $registry = new WorkerRegistry();
    $registry->register('THROWING', new class implements NodeWorkerInterface {
        public function execute(array $payload): array
        {
            throw new RuntimeException('api_key=synthetic-secret');
        }
    });
    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('A', [], 'THROWING');
    $orchestrator->setPayload('A', []);

    $orchestrator->executeNode('A');

    $serialized = $orchestrator->serializeDagState();
    $exported = json_encode($orchestrator->exportState(), JSON_THROW_ON_ERROR);
    assertSameValue(false, str_contains($serialized, 'synthetic-secret'), 'Model-visible DAG state must not contain worker exception details.');
    assertSameValue(false, str_contains($exported, 'synthetic-secret'), 'Persisted DAG state must not contain worker exception details.');
    assertSameValue(NodeStatus::FAILED, $orchestrator->getNodeStatus('A'), 'A controlled worker exception should still fail the node.');
}

function testMarkedWorkerControlExceptionPropagatesAfterSanitizedFailure(): void
{
    $registry = new WorkerRegistry();
    $registry->register('CONTROL_THROWING', new class implements NodeWorkerInterface {
        public function execute(array $payload): array
        {
            throw new class('api_key=synthetic-control-secret') extends RuntimeException implements NodeWorkerControlException {};
        }
    });
    $orchestrator = new ASTOrchestrator($registry);
    $orchestrator->addNode('A', [], 'CONTROL_THROWING');
    $orchestrator->setPayload('A', []);

    $propagated = false;
    try {
        $orchestrator->executeNode('A');
    } catch (NodeWorkerControlException) {
        $propagated = true;
    }

    $serialized = $orchestrator->serializeDagState();
    $exported = json_encode($orchestrator->exportState(), JSON_THROW_ON_ERROR);
    assertSameValue(true, $propagated, 'Marked worker control exceptions must reach the durable recovery caller.');
    assertSameValue(NodeStatus::FAILED, $orchestrator->getNodeStatus('A'), 'A propagated control exception must still fail the DAG node.');
    assertSameValue(false, str_contains($serialized, 'synthetic-control-secret'), 'Model-visible DAG state must sanitize propagated exception details.');
    assertSameValue(false, str_contains($exported, 'synthetic-control-secret'), 'Persisted DAG state must sanitize propagated exception details.');
}

$tests = [
    'testFailureCascadesToLinearDescendants',
    'testFailureBlocksSharedChildUntilAllParentsSucceed',
    'testHmiRetryRestoresBlockedDescendants',
    'testHmiRetryDoesNotRestoreChildWhileAnotherParentFailed',
    'testExecuteNodeRejectsUnsatisfiedDependencies',
    'testWorkerExceptionDoesNotLeakIntoDagState',
    'testMarkedWorkerControlExceptionPropagatesAfterSanitizedFailure',
    'testBuildContextReturnsTypeMapping',
    'testBuildContextIgnoresNonMutateActions',
    'testBuildContextIgnoresUnknownNodes',
    'testBuildContextWithDefaultType',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All ASTOrchestrator tests passed" . PHP_EOL;

// ===== buildContext tests =====

function testBuildContextReturnsTypeMapping(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());
    $orchestrator->addNode('A', [], 'HTTP_REQUEST');
    $orchestrator->addNode('B', ['A'], 'QUERY_DATABASE');

    $context = $orchestrator->buildContext([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'A', 'payload' => []],
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'B', 'payload' => []],
    ]);

    assertSameValue(['A' => 'HTTP_REQUEST', 'B' => 'QUERY_DATABASE'], $context, 'buildContext should return correct type mapping.');
}

function testBuildContextIgnoresNonMutateActions(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());
    $orchestrator->addNode('A', [], 'HTTP_REQUEST');

    $context = $orchestrator->buildContext([
        ['action' => 'SPAWN_NODE', 'node_id' => 'A'],
        ['action' => 'YIELD_EXECUTION'],
    ]);

    assertSameValue([], $context, 'buildContext should ignore non-MUTATE_PAYLOAD actions.');
}

function testBuildContextIgnoresUnknownNodes(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());

    $context = $orchestrator->buildContext([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'GHOST', 'payload' => []],
    ]);

    assertSameValue([], $context, 'buildContext should ignore nodes not in the AST.');
}

function testBuildContextWithDefaultType(): void
{
    $orchestrator = new ASTOrchestrator(new WorkerRegistry());
    $orchestrator->addNode('A');

    $context = $orchestrator->buildContext([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'A', 'payload' => []],
    ]);

    assertSameValue(['A' => 'UNKNOWN'], $context, 'buildContext should return UNKNOWN for nodes without explicit type.');
}
