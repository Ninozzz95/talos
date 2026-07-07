<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            $message . PHP_EOL .
            'Expected: ' . var_export($expected, true) . PHP_EOL .
            'Actual:   ' . var_export($actual, true)
        );
    }
}

function testComposerUsesKadmosNamespace(): void
{
    $composerPath = __DIR__ . '/../composer.json';
    $composer = json_decode((string) file_get_contents($composerPath), true);

    assertSameValue('kadmos/core', $composer['name'] ?? null, 'Composer package should use the Kadmos product name.');
    assertTrue(isset($composer['autoload']['psr-4']['Kadmos\\']), 'Composer autoload should expose Kadmos\\.');
    assertTrue(!isset($composer['autoload']['psr-4']['AVM\\']), 'Composer autoload should not expose the stale AVM\\ namespace.');
    assertTrue(isset($composer['autoload-dev']['psr-4']['Kadmos\\Tests\\']), 'Composer dev autoload should expose Kadmos\\Tests\\.');
}

function testComposerAutoloadLoadsCoreClasses(): void
{
    require_once __DIR__ . '/../vendor/autoload.php';

    assertTrue(class_exists('Kadmos\\ASTOrchestrator'), 'Composer autoload should load Kadmos\\ASTOrchestrator.');
    assertTrue(class_exists('Kadmos\\NodeStatus'), 'Composer autoload should load Kadmos\\NodeStatus.');
    assertTrue(class_exists('Kadmos\\Workers\\WorkerRegistry'), 'Composer autoload should load Kadmos\\Workers\\WorkerRegistry.');
}

function testCliDoesNotReferenceStaleAvmNamespace(): void
{
    $cli = (string) file_get_contents(__DIR__ . '/../kadmos');

    assertTrue(!str_contains($cli, '\\AVM\\'), 'CLI should not instantiate stale \\AVM\\ classes.');
}

$tests = [
    'testComposerUsesKadmosNamespace',
    'testComposerAutoloadLoadsCoreClasses',
    'testCliDoesNotReferenceStaleAvmNamespace',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All namespace contract tests passed" . PHP_EOL;

