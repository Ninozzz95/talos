<?php

declare(strict_types=1);

require_once __DIR__.'/../../vendor/autoload.php';

use Kadmos\Provider\PinnedProviderHttpTransport;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Provider\ProviderStreamCancelledException;
use Kadmos\Provider\StreamingProviderTransport;
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

function testPinnedProviderTransportPinsEveryApprovedAddressInOneResolveRule(): void
{
    $approvedIps = [
        '93.184.216.34',
        '2606:2800:220:1:248:1893:25c8:1946',
    ];
    $expectedResolve = [
        'api.provider.test:443:93.184.216.34,[2606:2800:220:1:248:1893:25c8:1946]',
    ];
    $bufferedOptions = null;
    $buffered = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => $approvedIps),
        curlTransport: static function (string $url, array $options) use (&$bufferedOptions): array {
            $bufferedOptions = $options;

            return [
                'raw_response' => '{"ok":true}',
                'curl_error' => '',
                'http_code' => 200,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );

    assertPinnedTransport(
        $buffered('https://api.provider.test/v1/responses', [], [], 1000) === ['ok' => true],
        'Buffered transport must accept either address from the vetted resolution set.',
    );
    assertPinnedTransport(
        ($bufferedOptions[CURLOPT_RESOLVE] ?? null) === $expectedResolve,
        'Buffered transport must pin every vetted address in one libcurl resolve rule.',
    );

    $streamingOptions = null;
    $streaming = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => $approvedIps),
        curlTransport: static function (string $url, array $options) use (&$streamingOptions): array {
            $streamingOptions = $options;
            ($options[CURLOPT_WRITEFUNCTION])(null, "data: approved-ip\n\n");

            return [
                'raw_response' => '',
                'curl_error' => '',
                'http_code' => 200,
                'primary_ip' => '2606:2800:220:1:248:1893:25c8:1946',
            ];
        },
    );

    assertPinnedTransport(
        iterator_to_array($streaming->stream(
            'https://api.provider.test/v1/responses',
            [],
            [],
            1000,
            static fn (): bool => false,
        )) === ["data: approved-ip\n\n"],
        'Streaming transport must accept either address from the vetted resolution set.',
    );
    assertPinnedTransport(
        ($streamingOptions[CURLOPT_RESOLVE] ?? null) === $expectedResolve,
        'Streaming transport must pin every vetted address in one libcurl resolve rule.',
    );
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

function testPinnedProviderTransportStreamsThroughPinnedSocketWithBoundedCallbacks(): void
{
    $seenOptions = null;
    $transport = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => ['93.184.216.34']),
        curlTransport: static function (string $url, array $options) use (&$seenOptions): array {
            $seenOptions = $options;
            $write = $options[CURLOPT_WRITEFUNCTION] ?? null;
            if (! is_callable($write)) {
                throw new RuntimeException('Streaming transport must configure a cURL write callback.');
            }
            assertPinnedTransport($write(null, "data: one\n\n") === strlen("data: one\n\n"), 'The write callback must accept the first bounded chunk.');
            assertPinnedTransport($write(null, "data: two\n\n") === strlen("data: two\n\n"), 'The write callback must accept the second bounded chunk.');

            return [
                'raw_response' => '',
                'curl_error' => '',
                'http_code' => 200,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );

    assertPinnedTransport($transport instanceof StreamingProviderTransport, 'Pinned transport must expose the additive streaming interface.');
    $chunks = iterator_to_array($transport->stream(
        'https://api.provider.test/v1/responses',
        ['model' => 'test', 'stream' => true],
        ['Content-Type: application/json', 'Authorization: Bearer test-secret'],
        30000,
        static fn (): bool => false,
    ));

    assertPinnedTransport($chunks === ["data: one\n\n", "data: two\n\n"], 'Streaming transport must preserve provider chunk order and bytes.');
    assertPinnedTransport(($seenOptions[CURLOPT_RETURNTRANSFER] ?? null) === false, 'Streaming cURL must not buffer the complete body.');
    assertPinnedTransport(($seenOptions[CURLOPT_FOLLOWLOCATION] ?? null) === false, 'Streaming redirects must remain disabled.');
    assertPinnedTransport(($seenOptions[CURLOPT_MAXREDIRS] ?? null) === 0, 'Streaming redirect budget must remain zero.');
    assertPinnedTransport(($seenOptions[CURLOPT_RESOLVE] ?? null) === ['api.provider.test:443:93.184.216.34'], 'Streaming socket must use the vetted DNS pin.');
    assertPinnedTransport(($seenOptions[CURLOPT_TIMEOUT_MS] ?? null) === 20000, 'Streaming timeout must remain policy-clamped.');
    assertPinnedTransport(is_callable($seenOptions[CURLOPT_XFERINFOFUNCTION] ?? null), 'Streaming cURL must poll cancellation while no body arrives.');
}

function testPinnedProviderTransportCancelsAndRejectsRedirectRebindingAndOverflow(): void
{
    $cancelled = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => ['93.184.216.34']),
        curlTransport: static function (string $url, array $options): array {
            $progress = $options[CURLOPT_XFERINFOFUNCTION] ?? null;
            assertPinnedTransport(is_callable($progress), 'Cancellation test requires the progress callback.');
            $progress(null, 0, 0, 0, 0);

            return [
                'raw_response' => false,
                'curl_error' => 'Callback aborted',
                'http_code' => 0,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );
    try {
        iterator_to_array($cancelled->stream(
            'https://api.provider.test/v1/responses',
            [],
            [],
            1000,
            static fn (): bool => true,
        ));
        throw new RuntimeException('Cancelled provider streams must stop.');
    } catch (ProviderStreamCancelledException $exception) {
        assertPinnedTransport($exception->reason === 'user_requested', 'Cancellation must remain a typed bounded reason.');
    }

    $redirect = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => ['93.184.216.34']),
        curlTransport: static function (string $url, array $options): array {
            ($options[CURLOPT_WRITEFUNCTION])(null, '{"error":"redirect"}');

            return [
                'raw_response' => '',
                'curl_error' => '',
                'http_code' => 302,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );
    try {
        iterator_to_array($redirect->stream('https://api.provider.test/v1', [], [], 1000, static fn (): bool => false));
        throw new RuntimeException('Streaming redirects must fail closed.');
    } catch (ProviderRequestException $exception) {
        assertPinnedTransport($exception->status === 302, 'Streaming redirect must retain controlled HTTP status.');
    }

    $rebound = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => ['93.184.216.34']),
        curlTransport: static function (string $url, array $options): array {
            ($options[CURLOPT_WRITEFUNCTION])(null, "data: must-not-yield\n\n");

            return [
                'raw_response' => '',
                'curl_error' => '',
                'http_code' => 200,
                'primary_ip' => '8.8.8.8',
            ];
        },
    );
    assertPinnedTransportThrows(
        static fn () => iterator_to_array($rebound->stream('https://api.provider.test/v1', [], [], 1000, static fn (): bool => false)),
        'Streaming response bytes must not be yielded before connected-IP verification.',
    );

    $overflow = new PinnedProviderHttpTransport(
        provider: 'openai',
        executionPolicy: pinnedTransportPolicy(static fn (string $host): array => ['93.184.216.34']),
        curlTransport: static function (string $url, array $options): array {
            ($options[CURLOPT_WRITEFUNCTION])(null, str_repeat('x', 2_100_000));

            return [
                'raw_response' => false,
                'curl_error' => 'write failed',
                'http_code' => 200,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );
    assertPinnedTransportThrows(
        static fn () => iterator_to_array($overflow->stream('https://api.provider.test/v1', [], [], 1000, static fn (): bool => false)),
        'Streaming callback queues must fail closed at their byte ceiling.',
    );
}

function testPinnedProviderTransportAllowsOnlyExactGeminiSseQueryOnStreamingPath(): void
{
    $runner = static function (string $url, array $options): array {
        ($options[CURLOPT_WRITEFUNCTION])(null, "data: {\"candidates\":[]}\n\n");

        return [
            'raw_response' => '',
            'curl_error' => '',
            'http_code' => 200,
            'primary_ip' => '142.250.74.234',
        ];
    };
    $policy = new ExecutionPolicy(
        allowedHosts: ['generativelanguage.googleapis.com'],
        maxTimeoutMs: 20000,
        hostResolver: static fn (string $host): array => ['142.250.74.234'],
    );
    $transport = new PinnedProviderHttpTransport(
        provider: 'gemini',
        executionPolicy: $policy,
        curlTransport: $runner,
    );

    $allowed = iterator_to_array($transport->stream(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
        [],
        [],
        1000,
        static fn (): bool => false,
    ));
    assertPinnedTransport($allowed === ["data: {\"candidates\":[]}\n\n"], 'Exact Gemini alt=sse streaming endpoint must remain usable.');

    foreach ([
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=json',
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse&key=secret',
    ] as $endpoint) {
        assertPinnedTransportThrows(
            static fn () => iterator_to_array($transport->stream($endpoint, [], [], 1000, static fn (): bool => false)),
            'Gemini streaming must reject every query except exact alt=sse.',
        );
    }
    assertPinnedTransportThrows(
        static fn () => $transport->send(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
            [],
            [],
            1000,
        ),
        'Buffered provider requests must preserve the zero-query policy.',
    );
}

function assertPinnedTransportThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (RuntimeException) {
        return;
    }

    throw new RuntimeException($message);
}

$tests = [
    'testPinnedProviderTransportPinsDnsDisablesRedirectsAndDecodesJson',
    'testPinnedProviderTransportPinsEveryApprovedAddressInOneResolveRule',
    'testPinnedProviderTransportRejectsRebindingUnsafeUrlsAndRedirectResponses',
    'testPinnedProviderTransportAllowsOnlyLoopbackOllama',
    'testPinnedProviderTransportRequiresPolicyForUnknownProviders',
    'testPinnedProviderTransportStreamsThroughPinnedSocketWithBoundedCallbacks',
    'testPinnedProviderTransportCancelsAndRejectsRedirectRebindingAndOverflow',
    'testPinnedProviderTransportAllowsOnlyExactGeminiSseQueryOnStreamingPath',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All pinned provider HTTP transport tests passed\n";
