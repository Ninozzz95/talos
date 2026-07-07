<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Benchmark\BenchmarkComparisonRunner;
use Kadmos\Benchmark\BenchmarkMode;
use Kadmos\Benchmark\BenchmarkScenario;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testMockBenchmarkSuiteMeetsEnterpriseThresholds(): void
{
    $thresholds = json_decode((string) file_get_contents(__DIR__ . '/benchmarks/thresholds.json'), true, flags: JSON_THROW_ON_ERROR);
    $mockSuite = $thresholds['mock_suite'];
    $scenarioFiles = glob(__DIR__ . '/benchmarks/scenarios/*.json') ?: [];
    sort($scenarioFiles);

    assertTrue($scenarioFiles !== [], 'Benchmark threshold test requires scenario fixtures.');

    foreach ($scenarioFiles as $scenarioFile) {
        $report = (new BenchmarkComparisonRunner(runs: 1))->compareScenario(BenchmarkScenario::fromFile($scenarioFile));
        $avm = $report['modes'][BenchmarkMode::AVM_ON];

        if (($report['scenario']['injected_error'] ?? null) === null) {
            assertTrue(
                $avm['completion_rate'] >= $mockSuite['avm_on_min_success_rate'],
                $report['scenario']['name'] . ' should meet AVM ON success threshold.'
            );
        }

        assertTrue($avm['contract_violation_count'] <= $mockSuite['avm_on_max_invalid_executed'], $report['scenario']['name'] . ' should not execute invalid contract state.');
        assertTrue(isset($avm['node_statuses']) && is_array($avm['node_statuses']), $report['scenario']['name'] . ' should keep replayable node status evidence.');
    }
}

$tests = [
    'testMockBenchmarkSuiteMeetsEnterpriseThresholds',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All benchmark threshold tests passed" . PHP_EOL;
