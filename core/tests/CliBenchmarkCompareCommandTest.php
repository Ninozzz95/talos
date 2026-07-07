<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testBenchmarkCompareCommandEmitsMachineReadableReport(): void
{
    $phpBin = getenv('KADMOS_TEST_PHP') ?: PHP_BINARY;
    $scenario = __DIR__ . '/benchmarks/scenarios/01_simple_http.json';
    $command = escapeshellarg($phpBin)
        . ' ' . escapeshellarg(__DIR__ . '/../kadmos')
        . ' benchmark compare --scenario=' . escapeshellarg($scenario)
        . ' --runs=1 --json 2>&1';

    $output = [];
    $code = 0;
    exec($command, $output, $code);
    $text = implode(PHP_EOL, $output);
    $report = json_decode($text, true);

    assertTrue($code === 0, 'benchmark compare should exit 0. Output: ' . $text);
    assertTrue(is_array($report), 'benchmark compare --json should emit valid JSON. Output: ' . $text);
    assertTrue(($report['scenario']['name'] ?? null) === 'simple_http_call', 'Report should include the selected scenario.');
    assertTrue(isset($report['modes']['avm_on'], $report['modes']['avm_off_direct'], $report['modes']['tool_agent']), 'Report should include all comparison modes.');
}

$tests = [
    'testBenchmarkCompareCommandEmitsMachineReadableReport',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI benchmark compare command tests passed" . PHP_EOL;
