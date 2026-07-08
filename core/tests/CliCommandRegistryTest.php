<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Cli\CommandRegistry;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testCommandRegistryDocumentsPhaseThirteenCommands(): void
{
    $ids = array_column(CommandRegistry::all(), 'id');

    foreach ([
        'doctor',
        'validate',
        'run',
        'compare',
        'trace replay',
        'fault explain',
        'recover',
        'files ingest',
        'export benchmark',
    ] as $commandId) {
        assertTrue(in_array($commandId, $ids, true), "Command registry should include {$commandId}.");
    }
}

function testCommandRegistryMachineReadablePayloadHasNoAnsi(): void
{
    $json = CommandRegistry::json();
    $decoded = json_decode($json, true);

    assertTrue(is_array($decoded), 'Command registry JSON should decode.');
    assertTrue(isset($decoded['commands']) && is_array($decoded['commands']), 'Command registry JSON should expose commands.');
    assertTrue(!str_contains($json, "\033["), 'Command registry JSON should not contain ANSI.');
}

function testMainHelpUsesCommandRegistry(): void
{
    $phpBin = getenv('KADMOS_TEST_PHP') ?: PHP_BINARY;
    $output = [];
    $code = 0;

    exec(escapeshellarg($phpBin) . ' ' . escapeshellarg(__DIR__ . '/../kadmos') . ' help 2>&1', $output, $code);
    $text = implode(PHP_EOL, $output);

    assertTrue($code === 0, 'kadmos help should exit 0. Output: '.$text);
    assertTrue(str_contains($text, 'kadmos trace replay'), 'help should document trace replay.');
    assertTrue(str_contains($text, 'kadmos recover'), 'help should document recovery.');
    assertTrue(str_contains($text, 'kadmos files ingest'), 'help should document file ingestion.');
    assertTrue(str_contains($text, 'kadmos export benchmark'), 'help should document benchmark export.');
}

$tests = [
    'testCommandRegistryDocumentsPhaseThirteenCommands',
    'testCommandRegistryMachineReadablePayloadHasNoAnsi',
    'testMainHelpUsesCommandRegistry',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI command registry tests passed" . PHP_EOL;
