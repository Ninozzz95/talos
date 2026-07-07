<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testStartFailsClosedInLiveModeWhenValidatorIsUnavailable(): void
{
    putenv('KADMOS_API_KEY=test-key');
    putenv('KADMOS_VALIDATOR_HEALTH_URL=http://127.0.0.1:9/health');
    putenv('KADMOS_VALIDATOR_URL=http://127.0.0.1:9/validate');

    $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../kadmos') . ' start 1 --no-boot 2>&1';
    $output = [];
    $code = 0;
    exec($command, $output, $code);

    putenv('KADMOS_API_KEY');
    putenv('KADMOS_VALIDATOR_HEALTH_URL');
    putenv('KADMOS_VALIDATOR_URL');

    $text = implode(PHP_EOL, $output);

    assertTrue($code === 4, 'Live start should exit 4 when validator is unavailable. Output: ' . $text);
    assertTrue(str_contains($text, 'Validator unavailable'), 'Live start should explain fail-closed validator state. Output: ' . $text);
}

$tests = [
    'testStartFailsClosedInLiveModeWhenValidatorIsUnavailable',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI start fail-closed tests passed" . PHP_EOL;

