<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Benchmark\BenchmarkComparisonRunner;
use Kadmos\Benchmark\BenchmarkScenario;
use Kadmos\Cli\EvidenceRenderer;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testEvidenceRendererHighlightsEnterpriseMetrics(): void
{
    $scenario = BenchmarkScenario::fromFile(__DIR__ . '/benchmarks/scenarios/05_deep_chain_failure.json');
    $report = (new BenchmarkComparisonRunner(runs: 1))->compareScenario($scenario);

    $output = EvidenceRenderer::renderReport($report);

    foreach ([
        'Kadmos evidence report',
        'Winner',
        'Enterprise risk',
        'Contract violations',
        'Recovery score',
        'Determinism',
        'AVM ON',
        'AVM OFF Direct',
        'Tool Agent',
    ] as $expected) {
        assertTrue(str_contains($output, $expected), "Evidence output should include {$expected}.");
    }
}

function testEvidenceRendererHandlesReportBundles(): void
{
    $scenario = BenchmarkScenario::fromFile(__DIR__ . '/benchmarks/scenarios/01_simple_http.json');
    $report = (new BenchmarkComparisonRunner(runs: 1))->compareScenario($scenario);

    $output = EvidenceRenderer::renderReport([
        'schema_version' => 1,
        'generated_at' => '2026-07-07T00:00:00+00:00',
        'runs' => 1,
        'reports' => [$report],
    ]);

    assertTrue(str_contains($output, 'simple_http_call'), 'Bundle output should include scenario names.');
    assertTrue(str_contains($output, 'Enterprise risk'), 'Bundle output should still render evidence metrics.');
}

$tests = [
    'testEvidenceRendererHighlightsEnterpriseMetrics',
    'testEvidenceRendererHandlesReportBundles',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI evidence renderer tests passed" . PHP_EOL;
