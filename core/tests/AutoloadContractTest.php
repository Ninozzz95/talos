<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testRuntimeScriptsUseComposerAutoload(): void
{
    $scripts = [
        'kadmos',
        'kadmos-chat-repl.php',
        'kadmos-chat.php',
        'kadmos-execute.php',
        'kadmos-benchmark.php',
        'kadmos-bench-live.php',
        'kadmos-bench-live-all.php',
    ];

    foreach ($scripts as $script) {
        $path = __DIR__ . '/../' . $script;
        $contents = (string) file_get_contents($path);

        assertTrue(str_contains($contents, '/vendor/autoload.php'), "{$script} should load Composer autoload.");
        assertTrue(!str_contains($contents, "require_once __DIR__ . '/src/"), "{$script} should not manually require src files.");
    }
}

$tests = [
    'testRuntimeScriptsUseComposerAutoload',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All autoload contract tests passed" . PHP_EOL;
