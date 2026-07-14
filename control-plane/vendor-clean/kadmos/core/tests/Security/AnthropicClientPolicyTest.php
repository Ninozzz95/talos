<?php

declare(strict_types=1);

require_once __DIR__.'/../../vendor/autoload.php';

use Kadmos\AnthropicClient;
use Kadmos\Security\ExecutionPolicy;

function assertAnthropicPolicy(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @return array<string, mixed> */
function anthropicLegacyResponse(): array
{
    return [
        'id' => 'msg-1',
        'content' => [['type' => 'text', 'text' => 'ok']],
        'stop_reason' => 'end_turn',
    ];
}

function testAnthropicClientSupportsNonNetworkTestsAndPinnedRealTransport(): void
{
    $customCalls = 0;
    $client = new AnthropicClient(
        apiKey: 'secret',
        model: 'claude-test',
        transport: static function (string $url, string $body, array $headers, int $timeoutMs) use (&$customCalls): array {
            $customCalls++;
            return anthropicLegacyResponse();
        },
    );
    assertAnthropicPolicy($client->generate('ping') === 'ok' && $customCalls === 1, 'Anthropic custom transport must remain deterministic and non-networked.');

    $seenOptions = null;
    $policy = new ExecutionPolicy(
        allowedHosts: ['api.anthropic.com'],
        hostResolver: static fn (string $host): array => ['93.184.216.34'],
    );
    $real = new AnthropicClient(
        apiKey: 'secret',
        model: 'claude-test',
        executionPolicy: $policy,
        curlTransport: static function (string $url, array $options) use (&$seenOptions): array {
            $seenOptions = $options;
            return [
                'raw_response' => json_encode(anthropicLegacyResponse(), JSON_THROW_ON_ERROR),
                'curl_error' => '',
                'http_code' => 200,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );
    assertAnthropicPolicy($real->generate('ping') === 'ok', 'Anthropic real transport must preserve legacy generate behavior.');
    assertAnthropicPolicy(($seenOptions[CURLOPT_RESOLVE] ?? null) === ['api.anthropic.com:443:93.184.216.34'], 'Anthropic socket must pin vetted DNS.');
    assertAnthropicPolicy(($seenOptions[CURLOPT_FOLLOWLOCATION] ?? null) === false, 'Anthropic redirects must be disabled.');
}

function testAnthropicClientRejectsMissingCredentialsAndConnectedIpMismatch(): void
{
    try {
        new AnthropicClient(apiKey: '');
        throw new RuntimeException('Anthropic remote client must require a credential.');
    } catch (InvalidArgumentException) {
    }

    $client = new AnthropicClient(
        apiKey: 'secret',
        model: 'claude-test',
        executionPolicy: new ExecutionPolicy(
            allowedHosts: ['api.anthropic.com'],
            hostResolver: static fn (string $host): array => ['93.184.216.34'],
        ),
        curlTransport: static fn (): array => [
            'raw_response' => json_encode(anthropicLegacyResponse(), JSON_THROW_ON_ERROR),
            'curl_error' => '',
            'http_code' => 200,
            'primary_ip' => '8.8.8.8',
        ],
    );
    try {
        $client->generate('ping');
    } catch (RuntimeException $exception) {
        assertAnthropicPolicy(str_contains(strtolower($exception->getMessage()), 'approved ip'), 'Anthropic connected IP mismatch must fail closed.');
        return;
    }

    throw new RuntimeException('Anthropic DNS rebinding mismatch must fail closed.');
}

$tests = [
    'testAnthropicClientSupportsNonNetworkTestsAndPinnedRealTransport',
    'testAnthropicClientRejectsMissingCredentialsAndConnectedIpMismatch',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All AnthropicClient policy tests passed\n";
