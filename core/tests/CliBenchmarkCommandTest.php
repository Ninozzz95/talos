<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testMainCliDeclaresBenchmarkCommand(): void
{
    $cli = (string) file_get_contents(__DIR__ . '/../kadmos');

    assertTrue(str_contains($cli, "case 'benchmark':"), 'Main CLI should implement a benchmark command.');
    assertTrue(str_contains($cli, 'kadmos benchmark'), 'Main CLI help should document the benchmark command.');
}

$tests = [
    'testMainCliDeclaresBenchmarkCommand',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI benchmark command tests passed" . PHP_EOL;

