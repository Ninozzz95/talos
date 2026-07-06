<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/NodeStatus.php';
require_once __DIR__ . '/../src/ASTOrchestrator.php';

use AVM\ASTOrchestrator;
use AVM\NodeStatus;

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
    $orchestrator = new ASTOrchestrator();
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
    $orchestrator = new ASTOrchestrator();
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
    $orchestrator = new ASTOrchestrator();
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

$tests = [
    'testFailureCascadesToLinearDescendants',
    'testFailureBlocksSharedChildUntilAllParentsSucceed',
    'testHmiRetryRestoresBlockedDescendants',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All ASTOrchestrator tests passed" . PHP_EOL;
