<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Benchmark\BenchmarkComparisonRunner;
use Kadmos\Benchmark\BenchmarkMode;
use Kadmos\Benchmark\BenchmarkScenario;
use Kadmos\NodeStatus;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assertSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected: ' . var_export($expected, true) . ' Actual: ' . var_export($actual, true));
    }
}

function testComparisonRunnerReportsAllModesForSimpleScenario(): void
{
    $scenario = BenchmarkScenario::fromFile(__DIR__ . '/benchmarks/scenarios/01_simple_http.json');
    $runner = new BenchmarkComparisonRunner(runs: 1);

    $report = $runner->compareScenario($scenario);

    assertSame('simple_http_call', $report['scenario']['name'], 'Report should include scenario identity.');
    assertSame(BenchmarkMode::all(), array_keys($report['modes']), 'Report should include all benchmark modes in order.');

    foreach (BenchmarkMode::all() as $mode) {
        assertSame(1, $report['modes'][$mode]['total_nodes'], "{$mode} should see the same node count.");
        assertSame(1.0, $report['modes'][$mode]['completion_rate'], "{$mode} should complete the clean single-node workflow.");
        assertTrue(isset($report['modes'][$mode]['token_estimate']), "{$mode} should expose a token estimate.");
    }
}

function testAvmOnPreservesFailureCascadeOnDeepChainScenario(): void
{
    $scenario = BenchmarkScenario::fromFile(__DIR__ . '/benchmarks/scenarios/05_deep_chain_failure.json');
    $runner = new BenchmarkComparisonRunner(runs: 1);

    $report = $runner->compareScenario($scenario);
    $avmOn = $report['modes'][BenchmarkMode::AVM_ON];

    assertSame(5, $avmOn['total_nodes'], 'AVM ON should load the full deep-chain graph.');
    assertSame(1, $avmOn['success_nodes'], 'Only n1 should succeed before the injected n2 failure.');
    assertSame(1, $avmOn['failed_nodes'], 'Only the injected failure node should be FAILED.');
    assertSame(3, $avmOn['blocked_nodes'], 'Descendants of the failed node should be blocked, not executed blindly.');
    assertSame(true, $avmOn['state_match'], 'AVM ON should match the expected failure-state contract.');
    assertSame(NodeStatus::BLOCKED_BY_DEPENDENCY, $avmOn['node_statuses']['n5'], 'The deepest descendant should be blocked.');
}

$tests = [
    'testComparisonRunnerReportsAllModesForSimpleScenario',
    'testAvmOnPreservesFailureCascadeOnDeepChainScenario',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All benchmark comparison runner tests passed" . PHP_EOL;
