<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testRuntimeScriptsDoNotUseAlwaysValidValidatorBypass(): void
{
    $scripts = [
        'kadmos-chat.php',
        'kadmos-chat-repl.php',
        'kadmos-execute.php',
        'kadmos-bench-live.php',
        'kadmos-bench-live-all.php',
    ];

    foreach ($scripts as $script) {
        $contents = (string) file_get_contents(__DIR__ . '/../' . $script);

        assertTrue(!str_contains($contents, 'alwaysValid'), "{$script} should not define an always-valid validator bypass.");
        assertTrue(!str_contains($contents, 'new class implements HttpClientInterface'), "{$script} should not inline a validator bypass HTTP client.");
    }
}

$tests = [
    'testRuntimeScriptsDoNotUseAlwaysValidValidatorBypass',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All validator bypass contract tests passed" . PHP_EOL;

