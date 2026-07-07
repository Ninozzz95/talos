<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

use Kadmos\NodeStatus;
use Kadmos\Security\ExecutionPolicy;
use Kadmos\Workers\HttpRequestWorker;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected: ' . var_export($expected, true) . ' Actual: ' . var_export($actual, true));
    }
}

function testExecutionPolicyBlocksMetadataIp(): void
{
    $policy = new ExecutionPolicy();
    $decision = $policy->inspectUrl('http://169.254.169.254/latest/meta-data', 5000);

    assertTrue(!$decision->allowed, 'Metadata IP should be blocked.');
    assertTrue(str_contains($decision->reason, 'metadata IP'), 'Decision should explain metadata IP block.');
}

function testExecutionPolicyBlocksLocalhostByDefault(): void
{
    $policy = new ExecutionPolicy();
    $decision = $policy->inspectUrl('http://127.0.0.1:8080/private', 5000);

    assertTrue(!$decision->allowed, 'Localhost should be blocked by default.');
    assertTrue(str_contains($decision->reason, 'localhost'), 'Decision should explain localhost block.');
}

function testExecutionPolicyNormalizesTrailingDotLocalhost(): void
{
    $policy = new ExecutionPolicy();
    $decision = $policy->inspectUrl('http://localhost./private', 5000);

    assertTrue(!$decision->allowed, 'Localhost with a trailing DNS dot should be blocked.');
    assertTrue(str_contains($decision->reason, 'localhost'), 'Decision should explain normalized localhost block.');
}

function testExecutionPolicyBlocksHostnameResolvingToMetadataIp(): void
{
    $policy = new ExecutionPolicy(hostResolver: static fn(string $host): array => ['169.254.169.254']);
    $decision = $policy->inspectUrl('http://metadata-proxy.example/latest', 5000);

    assertTrue(!$decision->allowed, 'Hostnames resolving to metadata IP should be blocked.');
    assertTrue(str_contains($decision->reason, 'metadata IP'), 'Decision should explain resolved metadata IP block.');
}

function testExecutionPolicyCapsTimeout(): void
{
    $policy = new ExecutionPolicy(maxTimeoutMs: 10000, hostResolver: static fn(string $host): array => ['93.184.216.34']);
    $decision = $policy->inspectUrl('https://api.example.com', 60000);

    assertTrue($decision->allowed, 'Public HTTPS URL should be allowed.');
    assertSameValue(10000, $decision->timeoutMs, 'Timeout should be capped by policy.');
}

function testHttpWorkerReturnsPolicyFailureWithoutNetworkCall(): void
{
    $worker = new HttpRequestWorker(new ExecutionPolicy());
    $result = $worker->execute(['url' => 'http://169.254.169.254/latest/meta-data']);

    assertSameValue(NodeStatus::FAILED, $result['status'], 'Policy-blocked request should fail closed.');
    assertTrue(str_contains($result['output_summary'], 'Blocked by execution policy'), 'Output should identify policy block.');
}

$tests = [
    'testExecutionPolicyBlocksMetadataIp',
    'testExecutionPolicyBlocksLocalhostByDefault',
    'testExecutionPolicyNormalizesTrailingDotLocalhost',
    'testExecutionPolicyBlocksHostnameResolvingToMetadataIp',
    'testExecutionPolicyCapsTimeout',
    'testHttpWorkerReturnsPolicyFailureWithoutNetworkCall',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All execution policy tests passed" . PHP_EOL;
