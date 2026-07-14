<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\AnthropicMessagesTurnAdapter;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;
use Kadmos\Tests\Support\FixtureProviderTransport;

function assertAnthropicAdapter(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @return array<string, mixed> */
function anthropicFixture(string $name): array
{
    $decoded = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/providers/anthropic/'.$name.'.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    return is_array($decoded) ? $decoded : throw new RuntimeException("Invalid Anthropic fixture: {$name}");
}

function anthropicRequest(bool $emptyProperties = false): ProviderTurnRequest
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
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
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

function testAnthropicAdapterSerializesEmptySchemaPropertiesAsAnObject(): void
{
    $responses = [anthropicFixture('final-text')['provider_response']];
    $requests = [];
    anthropicAdapter($responses, $requests)->start(anthropicRequest(emptyProperties: true));

    $payload = json_encode($requests[0]['payload'], JSON_THROW_ON_ERROR);
    assertAnthropicAdapter(str_contains($payload, '"properties":{}'), 'Anthropic tool schemas must preserve empty JSON objects on the wire.');
}

/** @param list<array<string, mixed>|Throwable> $responses @param list<array<string, mixed>> $requests */
function anthropicAdapter(array &$responses, array &$requests): AnthropicMessagesTurnAdapter
{
    return new AnthropicMessagesTurnAdapter(
        endpoint: 'https://api.anthropic.com/v1/messages',
        apiKey: 'test-provider-secret',
        transport: new FixtureProviderTransport(static function (string $endpoint, array $payload, array $headers, int $timeoutMs) use (&$responses, &$requests): array {
            $requests[] = compact('endpoint', 'payload', 'headers', 'timeoutMs');
            $next = array_shift($responses);
            if ($next instanceof Throwable) {
                throw $next;
            }

            return is_array($next) ? $next : throw new RuntimeException('Anthropic fixture queue is empty.');
        }),
    );
}

function testAnthropicAdapterNormalizesFinalMixedAndMultipleBlocks(): void
{
    $responses = [anthropicFixture('final-text')['provider_response']];
    $requests = [];
    $final = anthropicAdapter($responses, $requests)->start(anthropicRequest());
    assertAnthropicAdapter($final->kind === 'final' && $final->text === 'The page is ready.', 'Anthropic text blocks must normalize to final text.');
    assertAnthropicAdapter(($requests[0]['payload']['messages'][1]['content'] ?? null) === 'Earlier answer.', 'Anthropic request must preserve conversation history.');
    assertAnthropicAdapter(($requests[0]['payload']['tools'][0]['input_schema']['type'] ?? null) === 'object', 'Canonical schemas must adapt to Anthropic input_schema.');

    $responses = [anthropicFixture('mixed-preamble-tool-call')['provider_response']];
    $requests = [];
    $mixed = anthropicAdapter($responses, $requests)->start(anthropicRequest());
    assertAnthropicAdapter($mixed->kind === 'tool_calls' && $mixed->text === 'I will inspect the page.', 'Anthropic ordered text plus tool_use must preserve preamble semantics.');
    assertAnthropicAdapter($mixed->toolCalls[0]->providerCallId === 'toolu_browser_1', 'Anthropic tool_use ID must survive normalization.');

    $responses = [anthropicFixture('multiple-tool-calls')['provider_response']];
    $requests = [];
    $multiple = anthropicAdapter($responses, $requests)->start(anthropicRequest());
    assertAnthropicAdapter(array_map(static fn ($call): string => $call->providerCallId, $multiple->toolCalls) === ['toolu_browser_1', 'toolu_browser_2'], 'Anthropic tool_use block order must be preserved.');
}

function testAnthropicAdapterContinuesWithImmediateToolResultBlocks(): void
{
    $responses = [
        anthropicFixture('mixed-preamble-tool-call')['provider_response'],
        anthropicFixture('tool-error-continuation')['provider_response'],
    ];
    $requests = [];
    $adapter = anthropicAdapter($responses, $requests);
    $first = $adapter->start(anthropicRequest());
    $second = $adapter->continue(
        $first->state,
        [ToolResult::error('toolu_browser_1', 'BROWSER_TIMEOUT', 'The page timed out.')],
    );

    assertAnthropicAdapter($second->kind === 'final', 'Anthropic may finalize after a visible tool error.');
    $messages = $requests[1]['payload']['messages'] ?? [];
    $assistant = $messages[count($messages) - 2] ?? [];
    $user = $messages[count($messages) - 1] ?? [];
    assertAnthropicAdapter(($assistant['role'] ?? null) === 'assistant' && ($assistant['content'][1]['type'] ?? null) === 'tool_use', 'Anthropic continuation must replay ordered assistant blocks exactly.');
    assertAnthropicAdapter(($user['role'] ?? null) === 'user' && ($user['content'][0]['type'] ?? null) === 'tool_result', 'Anthropic continuation must immediately return user tool_result blocks.');
    assertAnthropicAdapter(($user['content'][0]['tool_use_id'] ?? null) === 'toolu_browser_1', 'Anthropic tool_result must correlate tool_use_id.');
    assertAnthropicAdapter(($user['content'][0]['is_error'] ?? null) === true, 'Anthropic tool-level errors must set is_error.');
}

function testAnthropicAdapterFailsClosedForMalformedRefusedIncompleteAndProviderErrors(): void
{
    foreach ([
        'malformed-arguments' => 'failure',
        'refusal' => 'refusal',
        'truncation' => 'incomplete',
    ] as $fixture => $expectedKind) {
        $responses = [anthropicFixture($fixture)['provider_response']];
        $requests = [];
        $response = anthropicAdapter($responses, $requests)->start(anthropicRequest());
        assertAnthropicAdapter($response->kind === $expectedKind, "Anthropic {$fixture} must normalize to {$expectedKind}.");
        assertAnthropicAdapter($response->toolCalls === [], "Anthropic {$fixture} cannot execute partial calls.");
    }

    $responses = [new ProviderRequestException(500, '{"error":{"message":"Bearer sk-provider-secret-value"}}')];
    $requests = [];
    $failure = anthropicAdapter($responses, $requests)->start(anthropicRequest());
    assertAnthropicAdapter($failure->kind === 'failure' && $failure->failure?->retryable === true, 'Anthropic HTTP 500 must be a typed retryable failure.');
    assertAnthropicAdapter(! str_contains(json_encode($failure->failure?->toArray(), JSON_THROW_ON_ERROR), 'sk-provider-secret-value'), 'Anthropic provider failures must be redacted.');
}

function testAnthropicCapabilitiesDoNotClaimProviderManagedOrVerifiedModelState(): void
{
    $responses = [];
    $requests = [];
    $capabilities = anthropicAdapter($responses, $requests)->capabilities();

    assertAnthropicAdapter($capabilities->statefulContinuation === false, 'Anthropic Messages continuation is caller-managed history.');
    assertAnthropicAdapter($capabilities->modelVerified === false, 'Anthropic adapter support must not imply verified model capability.');
    assertAnthropicAdapter($capabilities->parallelToolCalls === false, 'Anthropic parallel calls require a successful model probe.');
}

$tests = [
    'testAnthropicAdapterNormalizesFinalMixedAndMultipleBlocks',
    'testAnthropicAdapterSerializesEmptySchemaPropertiesAsAnObject',
    'testAnthropicAdapterContinuesWithImmediateToolResultBlocks',
    'testAnthropicAdapterFailsClosedForMalformedRefusedIncompleteAndProviderErrors',
    'testAnthropicCapabilitiesDoNotClaimProviderManagedOrVerifiedModelState',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All Anthropic Messages adapter tests passed\n";
