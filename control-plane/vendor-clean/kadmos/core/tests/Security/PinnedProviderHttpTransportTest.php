<?php

declare(strict_types=1);

require_once __DIR__.'/../../vendor/autoload.php';

use Kadmos\Provider\PinnedProviderHttpTransport;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Security\ExecutionPolicy;

function assertPinnedTransport(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function pinnedTransportPolicy(callable $resolver): ExecutionPolicy
{
    return new ExecutionPolicy(
        allowedHosts: ['api.provider.test'],
        maxTimeoutMs: 20000,
        hostResolver: Closure::fromCallable($resolver),
    );
}

function testPinnedProviderTransportPinsDnsDisablesRedirectsAndDecodesJson(): void
{
    $resolutionCount = 0;
    $seenOptions = null;
    $transport = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static function (string $host) use (&$resolutionCount): array {
            $resolutionCount++;
            return ['93.184.216.34'];
        }),
        curlTransport: static function (string $url, array $options) use (&$seenOptions): array {
            $seenOptions = $options;
            return [
                'raw_response' => '{"ok":true}',
                'curl_error' => '',
                'http_code' => 200,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );

    $response = $transport(
        'https://api.provider.test/v1/responses',
        ['model' => 'test'],
        ['Content-Type: application/json', 'Authorization: Bearer test-secret'],
        30000,
    );

    assertPinnedTransport($response === ['ok' => true], 'Pinned transport must decode the provider JSON object.');
    assertPinnedTransport($resolutionCount === 1, 'Every provider request must resolve through policy.');
    assertPinnedTransport(($seenOptions[CURLOPT_FOLLOWLOCATION] ?? null) === false, 'Provider redirects must be disabled.');
    assertPinnedTransport(($seenOptions[CURLOPT_MAXREDIRS] ?? null) === 0, 'Provider redirect budget must be zero.');
    assertPinnedTransport(($seenOptions[CURLOPT_RESOLVE] ?? null) === ['api.provider.test:443:93.184.216.34'], 'Provider socket must pin the vetted address.');
    assertPinnedTransport(($seenOptions[CURLOPT_TIMEOUT_MS] ?? null) === 20000, 'Execution policy must clamp provider timeout.');
    assertPinnedTransport(($seenOptions[CURLOPT_SSL_VERIFYPEER] ?? null) === true, 'TLS peer verification must be enabled by default.');
}

function testPinnedProviderTransportRejectsRebindingUnsafeUrlsAndRedirectResponses(): void
{
    $transport = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => ['93.184.216.34']),
        curlTransport: static fn (string $url, array $options): array => [
            'raw_response' => '',
            'curl_error' => '',
            'http_code' => 302,
            'primary_ip' => '93.184.216.34',
        ],
    );

    try {
        $transport('https://api.provider.test/v1?token=secret', [], [], 1000);
        throw new RuntimeException('Provider query credentials must fail closed.');
    } catch (RuntimeException $exception) {
        assertPinnedTransport(str_contains(strtolower($exception->getMessage()), 'policy'), 'Unsafe provider URLs must fail at the policy boundary.');
    }

    try {
        $transport('https://api.provider.test/v1', [], [], 1000);
        throw new RuntimeException('Redirect responses must fail closed.');
    } catch (ProviderRequestException $exception) {
        assertPinnedTransport($exception->status === 302, 'Redirect must remain a controlled provider HTTP failure.');
    }

    $rebound = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => ['93.184.216.34']),
        curlTransport: static fn (): array => [
            'raw_response' => '{"ok":true}',
            'curl_error' => '',
            'http_code' => 200,
            'primary_ip' => '8.8.8.8',
        ],
    );
    try {
        $rebound('https://api.provider.test/v1', [], [], 1000);
    } catch (RuntimeException $exception) {
        assertPinnedTransport(str_contains(strtolower($exception->getMessage()), 'approved ip'), 'Connected IP must match the vetted resolution.');
        return;
    }

    throw new RuntimeException('DNS rebinding mismatch must fail closed.');
}

function testPinnedProviderTransportAllowsOnlyLoopbackOllama(): void
{
    $seenOptions = null;
    $transport = new PinnedProviderHttpTransport(
        provider: 'ollama',
        curlTransport: static function (string $url, array $options) use (&$seenOptions): array {
            $seenOptions = $options;
            return [
                'raw_response' => '{"ok":true}',
                'curl_error' => '',
                'http_code' => 200,
                'primary_ip' => '127.0.0.1',
            ];
        },
    );

    assertPinnedTransport($transport('http://127.0.0.1:11434/v1/chat/completions', [], [], 1000) === ['ok' => true], 'Ollama loopback transport must work without remote policy.');
    assertPinnedTransport(($seenOptions[CURLOPT_RESOLVE] ?? null) === ['127.0.0.1:11434:127.0.0.1'], 'Ollama loopback socket must be pinned.');

    try {
        $transport('http://192.168.1.10:11434/v1/chat/completions', [], [], 1000);
    } catch (RuntimeException) {
        return;
    }

    throw new RuntimeException('Ollama outside loopback must fail closed.');
}

function testPinnedProviderTransportRequiresPolicyForUnknownProviders(): void
{
    foreach (['unknown', 'openai_compatible'] as $provider) {
        try {
            new PinnedProviderHttpTransport(provider: $provider);
        } catch (InvalidArgumentException) {
            continue;
        }

        throw new RuntimeException("Provider {$provider} without an explicit allowlist must fail closed.");
    }
}

$tests = [
    'testPinnedProviderTransportPinsDnsDisablesRedirectsAndDecodesJson',
    'testPinnedProviderTransportRejectsRebindingUnsafeUrlsAndRedirectResponses',
    'testPinnedProviderTransportAllowsOnlyLoopbackOllama',
    'testPinnedProviderTransportRequiresPolicyForUnknownProviders',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All pinned provider HTTP transport tests passed\n";
