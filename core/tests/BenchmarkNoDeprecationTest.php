<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testBenchmarkRunnerDoesNotEmitPhpDeprecations(): void
{
    $phpBin = getenv('KADMOS_TEST_PHP') ?: PHP_BINARY;
    $command = escapeshellarg($phpBin) . ' ' . escapeshellarg(__DIR__ . '/../kadmos-benchmark.php') . ' 1 2>&1';

    $output = [];
    $code = 0;
    exec($command, $output, $code);
    $text = implode(PHP_EOL, $output);

    assertTrue($code === 0, 'Benchmark runner should exit 0. Output: ' . $text);
    assertTrue(!str_contains($text, 'Deprecated'), 'Benchmark runner should not emit Deprecated warnings. Output: ' . $text);
}

$tests = [
    'testBenchmarkRunnerDoesNotEmitPhpDeprecations',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All benchmark no-deprecation tests passed" . PHP_EOL;

