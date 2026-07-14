<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

use Kadmos\OpenAIClient;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Security\ExecutionPolicy;

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

function expectRuntimeException(callable $callback, string $messageFragment): RuntimeException
{
    try {
        $callback();
    } catch (RuntimeException $exception) {
        assertTrue(
            str_contains(strtolower($exception->getMessage()), strtolower($messageFragment)),
            "Exception should contain '{$messageFragment}', got '{$exception->getMessage()}'.",
        );

        return $exception;
    }

    throw new RuntimeException("Expected RuntimeException containing '{$messageFragment}'.");
}

/** @return array<string, mixed> */
function successfulProviderPayload(string $content = 'ok'): array
{
    return [
        'choices' => [['message' => ['content' => $content]]],
        'usage' => [],
    ];
}

/** @return array{raw_response: string, curl_error: string, http_code: int, primary_ip: ?string} */
function successfulCurlResult(?string $primaryIp = '93.184.216.34'): array
{
    return [
        'raw_response' => json_encode(successfulProviderPayload(), JSON_THROW_ON_ERROR),
        'curl_error' => '',
        'http_code' => 200,
        'primary_ip' => $primaryIp,
    ];
}

function providerPolicy(callable $resolver): ExecutionPolicy
{
    return new ExecutionPolicy(
        allowedHosts: ['api.openai.test'],
        hostResolver: Closure::fromCallable($resolver),
    );
}

function testOpenAIClientRejectsPrivateBaseUrl(): void
{
    expectRuntimeException(
        static fn() => new OpenAIClient('secret', 'gpt-test', 'http://127.0.0.1:8080/v1'),
        'blocked by execution policy',
    );
}

function testOpenAIClientCustomTransportRemainsNonNetworkButStillEnforcesAllowlist(): void
{
    $resolutionAttempts = 0;
    $transportCalls = 0;
    $policy = providerPolicy(static function (string $host) use (&$resolutionAttempts): array {
        $resolutionAttempts++;
        return ['93.184.216.34'];
    });
    $client = new OpenAIClient(
        apiKey: 'secret',
        model: 'gpt-test',
        baseUrl: 'https://api.openai.test/v1',
        transport: static function () use (&$transportCalls): array {
            $transportCalls++;
            return successfulProviderPayload();
        },
        provider: 'openai',
        executionPolicy: $policy,
    );

    assertSameValue('ok', $client->generate('ping'), 'Custom transport should still return provider content.');
    assertSameValue(0, $resolutionAttempts, 'A non-network custom transport must not trigger DNS resolution.');
    assertSameValue(1, $transportCalls, 'Custom transport should execute exactly once.');

    expectRuntimeException(
        static fn() => new OpenAIClient(
            apiKey: 'secret',
            model: 'gpt-test',
            baseUrl: 'https://unlisted.example/v1',
            transport: static fn(): array => successfulProviderPayload(),
            provider: 'openai',
            executionPolicy: $policy,
        ),
        'not allowlisted',
    );
    assertSameValue(0, $resolutionAttempts, 'Unallowlisted hosts must fail before DNS resolution.');
}

function testOpenAIClientUsesTalosAllowlistFallbackAndOfficialDefaults(): void
{
    $previousKadmos = getenv('KADMOS_ALLOWED_PROVIDER_HOSTS');
    $previousTalos = getenv('TALOS_MODEL_PROVIDER_ALLOWED_HOSTS');

    try {
        putenv('KADMOS_ALLOWED_PROVIDER_HOSTS');
        putenv('TALOS_MODEL_PROVIDER_ALLOWED_HOSTS=api.provider.test');
        $client = new OpenAIClient(
            apiKey: 'secret',
            model: 'gpt-test',
            baseUrl: 'https://api.provider.test/v1',
            transport: static fn(): array => successfulProviderPayload(),
        );
        assertSameValue('ok', $client->generate('ping'), 'TALOS provider allowlist should be honored when KADMOS is unset.');

        expectRuntimeException(
            static fn() => new OpenAIClient(
                apiKey: 'secret',
                model: 'gpt-test',
                baseUrl: 'https://api.openai.com/v1',
                transport: static fn(): array => successfulProviderPayload(),
            ),
            'not allowlisted',
        );

        putenv('TALOS_MODEL_PROVIDER_ALLOWED_HOSTS');
        $official = new OpenAIClient(
            apiKey: 'secret',
            model: 'gemini-test',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            transport: static fn(): array => successfulProviderPayload(),
            provider: 'gemini',
        );
        assertSameValue('ok', $official->generate('ping'), 'Official provider defaults should align with the control plane catalog.');
    } finally {
        $previousKadmos === false
            ? putenv('KADMOS_ALLOWED_PROVIDER_HOSTS')
            : putenv("KADMOS_ALLOWED_PROVIDER_HOSTS={$previousKadmos}");
        $previousTalos === false
            ? putenv('TALOS_MODEL_PROVIDER_ALLOWED_HOSTS')
            : putenv("TALOS_MODEL_PROVIDER_ALLOWED_HOSTS={$previousTalos}");
    }
}

function testOpenAIClientRealTransportPinsDnsDisablesRedirectsAndReinspectsEachRequest(): void
{
    $resolutionAttempts = 0;
    $seenOptions = [];
    $policy = providerPolicy(static function (string $host) use (&$resolutionAttempts): array {
        $resolutionAttempts++;
        return ['93.184.216.34'];
    });
    $client = new OpenAIClient(
        apiKey: 'secret',
        model: 'gpt-test',
        baseUrl: 'https://api.openai.test/v1',
        provider: 'openai',
        executionPolicy: $policy,
        curlTransport: static function (string $url, array $options) use (&$seenOptions): array {
            $seenOptions[] = $options;
            return successfulCurlResult();
        },
    );

    $client->generate('first');
    $client->generate('second');

    assertSameValue(2, $resolutionAttempts, 'Provider DNS must be re-inspected for every network request.');
    assertSameValue(2, count($seenOptions), 'Both requests should use the real cURL option path.');
    foreach ($seenOptions as $options) {
        assertSameValue(false, $options[CURLOPT_FOLLOWLOCATION] ?? null, 'Provider redirects must be disabled in cURL.');
        assertSameValue(0, $options[CURLOPT_MAXREDIRS] ?? null, 'Provider redirects must have a zero hop budget.');
        assertSameValue(
            ['api.openai.test:443:93.184.216.34'],
            $options[CURLOPT_RESOLVE] ?? null,
            'The actual provider connection must pin vetted DNS addresses.',
        );
    }
}

function testOpenAIClientRealTransportRequiresMatchingPrimaryIp(): void
{
    foreach ([
        'missing' => null,
        'mismatch' => '203.0.113.8',
    ] as $case => $primaryIp) {
        $client = new OpenAIClient(
            apiKey: 'secret',
            model: 'gpt-test',
            baseUrl: 'https://api.openai.test/v1',
            provider: 'openai',
            executionPolicy: providerPolicy(static fn(string $host): array => ['93.184.216.34']),
            curlTransport: static fn(): array => successfulCurlResult($primaryIp),
        );

        expectRuntimeException(
            static fn() => $client->generate('ping'),
            'approved ip',
        );
    }
}

function testOpenAIClientRealTransportReturnsControlledFailureForRedirect(): void
{
    $seenOptions = null;
    $client = new OpenAIClient(
        apiKey: 'secret',
        model: 'gpt-test',
        baseUrl: 'https://api.openai.test/v1',
        provider: 'openai',
        executionPolicy: providerPolicy(static fn(string $host): array => ['93.184.216.34']),
        curlTransport: static function (string $url, array $options) use (&$seenOptions): array {
            $seenOptions = $options;
            return [
                'raw_response' => '',
                'curl_error' => '',
                'http_code' => 302,
                'primary_ip' => '93.184.216.34',
            ];
        },
    );

    $exception = expectRuntimeException(static fn() => $client->generate('ping'), 'HTTP 302');

    assertTrue($exception instanceof ProviderRequestException, 'Redirect should be a controlled provider request failure.');
    assertSameValue(false, $seenOptions[CURLOPT_FOLLOWLOCATION] ?? null, 'Redirect failure must come from a no-follow request.');
}

function testOpenAIClientRejectsUnsafeProviderUrlComponentsBeforeTransport(): void
{
    $policy = new ExecutionPolicy(allowedHosts: ['api.openai.com']);
    $urls = [
        'https://token@api.openai.com/v1',
        'https://api.openai.com/v1?api_key=token',
        'https://api.openai.com/v1#token',
    ];

    foreach ($urls as $url) {
        expectRuntimeException(
            static fn() => new OpenAIClient(
                apiKey: 'secret',
                model: 'gpt-test',
                baseUrl: $url,
                transport: static fn(): array => successfulProviderPayload(),
                executionPolicy: $policy,
            ),
            'blocked by execution policy',
        );
    }
}

function testOpenAIClientEnforcesCredentialFreeLoopbackOnlyOllama(): void
{
    $seenHeaders = null;
    $local = new OpenAIClient(
        apiKey: '',
        model: 'llama3.1',
        baseUrl: 'http://127.0.0.1:11434/v1',
        transport: static function (string $url, string $body, array $headers) use (&$seenHeaders): array {
            $seenHeaders = $headers;
            return successfulProviderPayload();
        },
        provider: 'ollama',
    );

    assertSameValue('ok', $local->generate('ping'), 'Credential-free loopback Ollama should be accepted.');
    assertTrue(
        !array_filter($seenHeaders, static fn(string $header): bool => str_starts_with(strtolower($header), 'authorization:')),
        'Credential-free Ollama must not receive an Authorization header.',
    );

    expectRuntimeException(
        static fn() => new OpenAIClient(
            apiKey: '',
            model: 'llama3.1',
            baseUrl: 'https://api.openai.com/v1',
            transport: static fn(): array => successfulProviderPayload(),
            provider: 'ollama',
        ),
        'loopback',
    );
    expectRuntimeException(
        static fn() => new OpenAIClient(
            apiKey: 'must-not-exist',
            model: 'llama3.1',
            baseUrl: 'http://127.0.0.1:11434/v1',
            transport: static fn(): array => successfulProviderPayload(),
            provider: 'ollama',
        ),
        'credential-free',
    );
    expectRuntimeException(
        static fn() => new OpenAIClient(
            apiKey: '',
            model: 'gpt-test',
            baseUrl: 'https://api.openai.com/v1',
            transport: static fn(): array => successfulProviderPayload(),
            provider: 'openai',
        ),
        'api key',
    );
}

function testOpenAIClientPinsAndVerifiesTheRealOllamaLoopbackSocket(): void
{
    $seenOptions = null;
    $local = new OpenAIClient(
        apiKey: '',
        model: 'llama3.1',
        baseUrl: 'http://127.0.0.1:11434/v1',
        provider: 'ollama',
        curlTransport: static function (string $url, array $options) use (&$seenOptions): array {
            $seenOptions = $options;
            return successfulCurlResult('127.0.0.1');
        },
    );

    assertSameValue('ok', $local->generate('ping'), 'Real Ollama transport should accept its pinned loopback socket.');
    assertSameValue(
        ['127.0.0.1:11434:127.0.0.1'],
        $seenOptions[CURLOPT_RESOLVE] ?? null,
        'Real Ollama transport must pin the configured loopback address.',
    );

    $rebound = new OpenAIClient(
        apiKey: '',
        model: 'llama3.1',
        baseUrl: 'http://localhost:11434/v1',
        provider: 'ollama',
        curlTransport: static fn(): array => successfulCurlResult('93.184.216.34'),
    );
    expectRuntimeException(
        static fn() => $rebound->generate('ping'),
        'approved ip',
    );
}

$tests = [
    'testOpenAIClientRejectsPrivateBaseUrl',
    'testOpenAIClientCustomTransportRemainsNonNetworkButStillEnforcesAllowlist',
    'testOpenAIClientUsesTalosAllowlistFallbackAndOfficialDefaults',
    'testOpenAIClientRealTransportPinsDnsDisablesRedirectsAndReinspectsEachRequest',
    'testOpenAIClientRealTransportRequiresMatchingPrimaryIp',
    'testOpenAIClientRealTransportReturnsControlledFailureForRedirect',
    'testOpenAIClientRejectsUnsafeProviderUrlComponentsBeforeTransport',
    'testOpenAIClientEnforcesCredentialFreeLoopbackOnlyOllama',
    'testOpenAIClientPinsAndVerifiesTheRealOllamaLoopbackSocket',
];

foreach ($tests as $test) {
    $test();
    echo $test . ' passed' . PHP_EOL;
}

echo 'All OpenAIClient policy tests passed' . PHP_EOL;
