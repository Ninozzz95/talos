<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Validator\ValidatorHealthCheck;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testHealthCheckReturnsTrueWhenProbeSucceeds(): void
{
    $health = new ValidatorHealthCheck(
        'http://validator.local/health',
        1000,
        fn(string $url, int $timeoutMs): bool => $url === 'http://validator.local/health' && $timeoutMs === 1000,
    );

    assertTrue($health->isHealthy(), 'Health check should return true when probe succeeds.');
}

function testHealthCheckReturnsFalseWhenProbeFailsOrThrows(): void
{
    $failed = new ValidatorHealthCheck('http://validator.local/health', 1000, fn(): bool => false);
    assertTrue(!$failed->isHealthy(), 'Health check should return false when probe fails.');

    $thrown = new ValidatorHealthCheck('http://validator.local/health', 1000, fn(): bool => throw new RuntimeException('down'));
    assertTrue(!$thrown->isHealthy(), 'Health check should return false when probe throws.');
}

$tests = [
    'testHealthCheckReturnsTrueWhenProbeSucceeds',
    'testHealthCheckReturnsFalseWhenProbeFailsOrThrows',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All validator health check tests passed" . PHP_EOL;

