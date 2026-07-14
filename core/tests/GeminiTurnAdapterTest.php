<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\GeminiTurnAdapter;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;
use Kadmos\Tests\Support\FixtureProviderTransport;

function assertGeminiAdapter(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @return array<string, mixed> */
function geminiFixture(string $name): array
{
    $decoded = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/providers/gemini/'.$name.'.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    return is_array($decoded) ? $decoded : throw new RuntimeException("Invalid Gemini fixture: {$name}");
}

function geminiRequest(bool $emptyProperties = false): ProviderTurnRequest
{
    $definition = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/tool-contracts/valid-definition.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    if ($emptyProperties) {
        $definition['inputSchema']['properties'] = [];
        $definition['inputSchema']['required'] = [];
    }

    return new ProviderTurnRequest(
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        systemPrompt: 'Ground current web claims in tool evidence.',
        messages: [
            ['role' => 'user', 'content' => 'Earlier question.'],
            ['role' => 'assistant', 'content' => 'Earlier answer.'],
            ['role' => 'user', 'content' => 'Inspect https://example.com.'],
        ],
        tools: [ToolDefinition::fromStrictArray($definition)],
        maxTokens: 2048,
        temperature: 0.0,
    );
}

function testGeminiAdapterSerializesEmptySchemaPropertiesAsAnObject(): void
{
    $responses = [geminiFixture('final-text')['provider_response']];
    $requests = [];
    geminiAdapter($responses, $requests)->start(geminiRequest(emptyProperties: true));

    $payload = json_encode($requests[0]['payload'], JSON_THROW_ON_ERROR);
    assertGeminiAdapter(str_contains($payload, '"properties":{}'), 'Gemini tool schemas must preserve empty JSON objects on the wire.');
}

/** @param list<array<string, mixed>|Throwable> $responses @param list<array<string, mixed>> $requests */
function geminiAdapter(array &$responses, array &$requests): GeminiTurnAdapter
{
    return new GeminiTurnAdapter(
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        apiKey: 'test-provider-secret',
        transport: new FixtureProviderTransport(static function (string $endpoint, array $payload, array $headers, int $timeoutMs) use (&$responses, &$requests): array {
            $requests[] = compact('endpoint', 'payload', 'headers', 'timeoutMs');
            $next = array_shift($responses);
            if ($next instanceof Throwable) {
                throw $next;
            }

            return is_array($next) ? $next : throw new RuntimeException('Gemini fixture queue is empty.');
        }),
    );
}

function testGeminiAdapterNormalizesFinalMixedAndMultipleParts(): void
{
    $responses = [geminiFixture('final-text')['provider_response']];
    $requests = [];
    $final = geminiAdapter($responses, $requests)->start(geminiRequest());
    assertGeminiAdapter($final->kind === 'final' && $final->text === 'The page is ready.', 'Gemini text parts must normalize to final text.');
    assertGeminiAdapter(($requests[0]['payload']['contents'][1]['role'] ?? null) === 'model', 'Canonical assistant history must map to Gemini model role.');
    assertGeminiAdapter(($requests[0]['payload']['tools'][0]['functionDeclarations'][0]['name'] ?? null) === 'browser_navigate', 'Canonical tools must adapt to Gemini functionDeclarations.');

    $responses = [geminiFixture('mixed-preamble-tool-call')['provider_response']];
    $requests = [];
    $mixed = geminiAdapter($responses, $requests)->start(geminiRequest());
    assertGeminiAdapter($mixed->kind === 'tool_calls' && $mixed->text === 'I will inspect the page.', 'Gemini text plus functionCall must preserve preamble semantics.');
    assertGeminiAdapter($mixed->toolCalls[0]->providerCallId === 'gemini-call-1', 'Gemini function call ID must survive normalization.');
    assertGeminiAdapter(! str_contains(json_encode($mixed->state->toAuditArray(), JSON_THROW_ON_ERROR), 'opaque-thought-signature'), 'Gemini thought signatures must never enter audit output.');

    $responses = [geminiFixture('multiple-tool-calls')['provider_response']];
    $requests = [];
    $multiple = geminiAdapter($responses, $requests)->start(geminiRequest());
    assertGeminiAdapter(array_map(static fn ($call): string => $call->providerCallId, $multiple->toolCalls) === ['gemini-call-1', 'gemini-call-2'], 'Gemini functionCall parts must preserve provider order.');
}

function testGeminiAdapterContinuesWithFunctionResponseAndThoughtSignature(): void
{
    $responses = [
        geminiFixture('mixed-preamble-tool-call')['provider_response'],
        geminiFixture('tool-error-continuation')['provider_response'],
    ];
    $requests = [];
    $adapter = geminiAdapter($responses, $requests);
    $first = $adapter->start(geminiRequest());
    $second = $adapter->continue(
        $first->state,
        [ToolResult::error('gemini-call-1', 'BROWSER_TIMEOUT', 'The page timed out.')],
    );

    assertGeminiAdapter($second->kind === 'final', 'Gemini may finalize after a visible function error.');
    $contents = $requests[1]['payload']['contents'] ?? [];
    $model = $contents[count($contents) - 2] ?? [];
    $user = $contents[count($contents) - 1] ?? [];
    assertGeminiAdapter(($model['parts'][1]['thoughtSignature'] ?? null) === 'opaque-thought-signature', 'Gemini continuation must replay the provider thought signature exactly.');
    assertGeminiAdapter(($user['parts'][0]['functionResponse']['name'] ?? null) === 'browser_navigate', 'Gemini continuation must match functionResponse by name.');
    assertGeminiAdapter(($user['parts'][0]['functionResponse']['id'] ?? null) === 'gemini-call-1', 'Gemini continuation must correlate the function call ID.');
    assertGeminiAdapter(($user['parts'][0]['functionResponse']['response']['isError'] ?? null) === true, 'Gemini function errors must remain machine-readable.');
}

function testGeminiAdapterFailsClosedForMalformedRefusedIncompleteAndProviderErrors(): void
{
    foreach ([
        'malformed-arguments' => 'failure',
        'refusal' => 'refusal',
        'truncation' => 'incomplete',
    ] as $fixture => $expectedKind) {
        $responses = [geminiFixture($fixture)['provider_response']];
        $requests = [];
        $response = geminiAdapter($responses, $requests)->start(geminiRequest());
        assertGeminiAdapter($response->kind === $expectedKind, "Gemini {$fixture} must normalize to {$expectedKind}.");
        assertGeminiAdapter($response->toolCalls === [], "Gemini {$fixture} cannot execute partial calls.");
    }

    $responses = [new ProviderRequestException(503, '{"error":{"message":"Bearer sk-provider-secret-value"}}')];
    $requests = [];
    $failure = geminiAdapter($responses, $requests)->start(geminiRequest());
    assertGeminiAdapter($failure->kind === 'failure' && $failure->failure?->retryable === true, 'Gemini HTTP 503 must be a typed retryable failure.');
    assertGeminiAdapter(! str_contains(json_encode($failure->failure?->toArray(), JSON_THROW_ON_ERROR), 'sk-provider-secret-value'), 'Gemini provider failures must be redacted.');
}

function testGeminiCapabilitiesDoNotClaimProviderManagedOrVerifiedModelState(): void
{
    $responses = [];
    $requests = [];
    $capabilities = geminiAdapter($responses, $requests)->capabilities();

    assertGeminiAdapter($capabilities->statefulContinuation === false, 'Gemini continuation replays caller-managed contents.');
    assertGeminiAdapter($capabilities->modelVerified === false, 'Gemini adapter support must not imply verified model capability.');
    assertGeminiAdapter($capabilities->parallelToolCalls === false, 'Gemini parallel calls require a successful model probe.');
}

$tests = [
    'testGeminiAdapterNormalizesFinalMixedAndMultipleParts',
    'testGeminiAdapterSerializesEmptySchemaPropertiesAsAnObject',
    'testGeminiAdapterContinuesWithFunctionResponseAndThoughtSignature',
    'testGeminiAdapterFailsClosedForMalformedRefusedIncompleteAndProviderErrors',
    'testGeminiCapabilitiesDoNotClaimProviderManagedOrVerifiedModelState',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All Gemini adapter tests passed\n";
