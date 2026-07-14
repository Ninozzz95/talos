<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Benchmark\BenchmarkMode;
use Kadmos\Benchmark\BenchmarkScenario;

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

function testScenarioLoadsStableMetadataFromJsonFixture(): void
{
    $scenario = BenchmarkScenario::fromFile(__DIR__ . '/benchmarks/scenarios/01_simple_http.json');

    assertSame('simple_http_call', $scenario->name(), 'Scenario name should be loaded.');
    assertSame(1, $scenario->difficulty(), 'Scenario difficulty should be loaded.');
    assertSame(['n1'], $scenario->nodeIds(), 'Scenario should expose spawned node ids in order.');
    assertSame(4, $scenario->mutationCount(), 'Scenario should count all scripted mutations, including yield commands.');
    assertSame(null, $scenario->injectedError(), 'Scenario without injected error should return null.');
}

function testBenchmarkModeContractUsesExplicitAvmOnOffAndToolAgentNames(): void
{
    assertSame('avm_on', BenchmarkMode::AVM_ON, 'AVM ON mode should have a stable machine name.');
    assertSame('avm_off_direct', BenchmarkMode::AVM_OFF_DIRECT, 'AVM OFF direct mode should have a stable machine name.');
    assertSame('tool_agent', BenchmarkMode::TOOL_AGENT, 'Tool-agent mode should have a stable machine name.');

    assertSame(
        [BenchmarkMode::AVM_ON, BenchmarkMode::AVM_OFF_DIRECT, BenchmarkMode::TOOL_AGENT],
        BenchmarkMode::all(),
        'Benchmark modes should be ordered for reports.'
    );
}

$tests = [
    'testScenarioLoadsStableMetadataFromJsonFixture',
    'testBenchmarkModeContractUsesExplicitAvmOnOffAndToolAgentNames',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All benchmark scenario tests passed" . PHP_EOL;
