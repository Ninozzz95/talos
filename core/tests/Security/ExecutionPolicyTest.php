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

function testExecutionPolicyBlocksHostnameResolvingToPrivateIp(): void
{
    $policy = new ExecutionPolicy(hostResolver: static fn(string $host): array => ['10.10.2.5']);
    $decision = $policy->inspectUrl('https://internal-alias.example/report', 5000);

    assertTrue(!$decision->allowed, 'Hostnames resolving to private IP ranges should be blocked.');
    assertTrue(str_contains($decision->reason, 'private network'), 'Decision should explain private network block.');
}

function testExecutionPolicyFailsClosedOnAmbiguousDnsResolution(): void
{
    $policy = new ExecutionPolicy(hostResolver: static fn(string $host): array => ['not-an-ip-address']);
    $decision = $policy->inspectUrl('https://ambiguous.example/report', 5000);

    assertTrue(!$decision->allowed, 'Invalid DNS resolver output should fail closed.');
    assertTrue(str_contains($decision->reason, 'invalid DNS resolution'), 'Decision should explain ambiguous DNS resolution.');
}

function testExecutionPolicyRejectsIanaNonPublicSpecialPurposeRanges(): void
{
    $ranges = [
        'RFC6598 shared space' => '100.64.0.1',
        'IPv4 benchmark range' => '198.18.0.1',
        'IPv4 documentation range' => '192.0.2.1',
        'IPv6 benchmark range' => '2001:2::1',
        'IPv6 documentation range' => '2001:db8::1',
        'IPv6 local-use translation prefix' => '64:ff9b:1::1',
        'IPv6 dummy prefix' => '100:0:0:1::1',
        'IPv6 segment routing SIDs prefix' => '5f00::1',
    ];

    foreach ($ranges as $label => $ip) {
        $host = str_contains($ip, ':') ? "[{$ip}]" : $ip;
        $decision = (new ExecutionPolicy())->inspectUrl("https://{$host}/v1", 5000);

        assertTrue(!$decision->allowed, "{$label} should be blocked.");
    }
}

function testExecutionPolicyCanRejectProviderUrlUserinfoQueryAndFragment(): void
{
    $policy = new ExecutionPolicy(
        allowedHosts: ['api.openai.com'],
        hostResolver: static fn(string $host): array => ['93.184.216.34'],
    );
    $urls = [
        'https://token@api.openai.com/v1',
        'https://api.openai.com/v1?api_key=token',
        'https://api.openai.com/v1#token',
    ];

    foreach ($urls as $url) {
        $decision = $policy->inspectUrl($url, 5000, rejectQueryAndFragment: true);
        assertTrue(!$decision->allowed, "Provider URL should reject unsafe components: {$url}");
    }
}

function testExecutionPolicyCanValidateAllowlistWithoutResolvingForNonNetworkTransport(): void
{
    $resolutionAttempts = 0;
    $policy = new ExecutionPolicy(
        allowedHosts: ['api.openai.com'],
        hostResolver: static function (string $host) use (&$resolutionAttempts): array {
            $resolutionAttempts++;
            return ['93.184.216.34'];
        },
    );

    $decision = $policy->inspectUrl(
        'https://api.openai.com/v1/chat/completions',
        5000,
        requireResolution: false,
        rejectQueryAndFragment: true,
    );

    assertTrue($decision->allowed, 'An allowlisted provider URL should pass structural validation.');
    assertSameValue(0, $resolutionAttempts, 'Non-network validation must not resolve DNS.');
}

function testExecutionPolicyCapsTimeout(): void
{
    $policy = new ExecutionPolicy(maxTimeoutMs: 10000, hostResolver: static fn(string $host): array => ['93.184.216.34']);
    $decision = $policy->inspectUrl('https://api.example.com', 60000);

    assertTrue($decision->allowed, 'Public HTTPS URL should be allowed.');
    assertSameValue(10000, $decision->timeoutMs, 'Timeout should be capped by policy.');
}

function testExecutionPolicyIncludesAuditRecord(): void
{
    $policy = new ExecutionPolicy(maxTimeoutMs: 3000, hostResolver: static fn(string $host): array => ['93.184.216.34']);
    $decision = $policy->inspectUrl('https://api.example.com/v1/search', 8000);

    assertSameValue('api.example.com', $decision->audit['host'] ?? null, 'Audit record should include normalized host.');
    assertSameValue('https', $decision->audit['scheme'] ?? null, 'Audit record should include scheme.');
    assertSameValue(['93.184.216.34'], $decision->audit['resolved_ips'] ?? null, 'Audit record should include resolved IPs.');
    assertSameValue(8000, $decision->audit['requested_timeout_ms'] ?? null, 'Audit record should include requested timeout.');
    assertSameValue(3000, $decision->audit['effective_timeout_ms'] ?? null, 'Audit record should include effective timeout.');
    assertSameValue(true, $decision->audit['allowed'] ?? null, 'Audit record should include final allow decision.');
}

function testHttpWorkerReturnsPolicyFailureWithoutNetworkCall(): void
{
    $worker = new HttpRequestWorker(new ExecutionPolicy());
    $result = $worker->execute(['url' => 'http://169.254.169.254/latest/meta-data']);

    assertSameValue(NodeStatus::FAILED, $result['status'], 'Policy-blocked request should fail closed.');
    assertTrue(str_contains($result['output_summary'], 'Blocked by execution policy'), 'Output should identify policy block.');
}

function testHttpWorkerPinsVettedResolvedAddress(): void
{
    $policy = new ExecutionPolicy(hostResolver: static fn(string $host): array => ['93.184.216.34']);
    $seenResolve = null;

    $worker = new HttpRequestWorker($policy, static function (string $url, array $options) use (&$seenResolve): array {
        $seenResolve = $options[\CURLOPT_RESOLVE] ?? null;

        return [
            'raw_response' => "HTTP/1.1 200 OK\r\n\r\nok",
            'curl_error' => '',
            'http_code' => 200,
            'header_size' => 19,
            'primary_ip' => '93.184.216.34',
        ];
    });

    $result = $worker->execute(['url' => 'https://api.example.com/search']);

    assertSameValue(NodeStatus::SUCCESS, $result['status'], 'Pinned public request should succeed through fake transport.');
    assertSameValue(['api.example.com:443:93.184.216.34'], $seenResolve, 'Worker should pin vetted DNS address with CURLOPT_RESOLVE.');
}

function testHttpWorkerRejectsPrimaryIpMismatchAfterConnect(): void
{
    $policy = new ExecutionPolicy(hostResolver: static fn(string $host): array => ['93.184.216.34']);

    $worker = new HttpRequestWorker($policy, static fn(string $url, array $options): array => [
        'raw_response' => "HTTP/1.1 200 OK\r\n\r\nok",
        'curl_error' => '',
        'http_code' => 200,
        'header_size' => 19,
        'primary_ip' => '10.0.0.10',
    ]);

    $result = $worker->execute(['url' => 'https://api.example.com/search']);

    assertSameValue(NodeStatus::FAILED, $result['status'], 'Primary IP mismatch should fail closed.');
    assertTrue(str_contains($result['output_summary'], 'DNS rebinding'), 'Failure should identify DNS rebinding guard.');
}

$tests = [
    'testExecutionPolicyBlocksMetadataIp',
    'testExecutionPolicyBlocksLocalhostByDefault',
    'testExecutionPolicyNormalizesTrailingDotLocalhost',
    'testExecutionPolicyBlocksHostnameResolvingToMetadataIp',
    'testExecutionPolicyBlocksHostnameResolvingToPrivateIp',
    'testExecutionPolicyFailsClosedOnAmbiguousDnsResolution',
    'testExecutionPolicyRejectsIanaNonPublicSpecialPurposeRanges',
    'testExecutionPolicyCanRejectProviderUrlUserinfoQueryAndFragment',
    'testExecutionPolicyCanValidateAllowlistWithoutResolvingForNonNetworkTransport',
    'testExecutionPolicyCapsTimeout',
    'testExecutionPolicyIncludesAuditRecord',
    'testHttpWorkerReturnsPolicyFailureWithoutNetworkCall',
    'testHttpWorkerPinsVettedResolvedAddress',
    'testHttpWorkerRejectsPrimaryIpMismatchAfterConnect',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All execution policy tests passed" . PHP_EOL;
