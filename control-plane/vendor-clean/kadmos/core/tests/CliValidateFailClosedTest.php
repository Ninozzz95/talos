<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testValidateFailsClosedWhenValidatorIsUnavailable(): void
{
    $fixture = tempnam(sys_get_temp_dir(), 'kadmos-jmp-');
    if ($fixture === false) {
        throw new RuntimeException('Could not create temp fixture.');
    }

    file_put_contents($fixture, json_encode([
        ['action' => 'YIELD_EXECUTION'],
    ]));

    putenv('KADMOS_VALIDATOR_HEALTH_URL=http://127.0.0.1:9/health');
    putenv('KADMOS_VALIDATOR_URL=http://127.0.0.1:9/validate');

    $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../kadmos') . ' validate ' . escapeshellarg($fixture) . ' 2>&1';
    $output = [];
    $code = 0;
    exec($command, $output, $code);

    @unlink($fixture);
    putenv('KADMOS_VALIDATOR_HEALTH_URL');
    putenv('KADMOS_VALIDATOR_URL');

    $text = implode(PHP_EOL, $output);

    assertTrue($code === 4, 'Validate should exit 4 when validator is unavailable. Output: ' . $text);
    assertTrue(str_contains($text, 'Validator unavailable'), 'Validate should explain the fail-closed validator state. Output: ' . $text);
}

$tests = [
    'testValidateFailsClosedWhenValidatorIsUnavailable',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI validate fail-closed tests passed" . PHP_EOL;

