<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Cli\Console;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testConsoleExitCodesAreStable(): void
{
    assertTrue(Console::EXIT_SUCCESS === 0, 'Success exit code should be 0.');
    assertTrue(Console::EXIT_USER_ERROR === 1, 'User/input error exit code should be 1.');
    assertTrue(Console::EXIT_ENVIRONMENT_ERROR === 2, 'Environment/config error exit code should be 2.');
    assertTrue(Console::EXIT_BENCHMARK_THRESHOLD_FAILED === 3, 'Benchmark threshold exit code should be 3.');
    assertTrue(Console::EXIT_VALIDATOR_UNAVAILABLE === 4, 'Validator unavailable exit code should be 4.');
}

function testConsoleJsonIsMachineReadable(): void
{
    $json = Console::json(['ok' => true, 'checks' => [['name' => 'php', 'ok' => true]]]);
    $decoded = json_decode($json, true);

    assertTrue(is_array($decoded), 'Console JSON output should decode.');
    assertTrue($decoded['ok'] === true, 'Console JSON output should preserve data.');
    assertTrue(!str_contains($json, "\033["), 'Console JSON output should not contain ANSI decoration.');
}

$tests = [
    'testConsoleExitCodesAreStable',
    'testConsoleJsonIsMachineReadable',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI console tests passed" . PHP_EOL;
