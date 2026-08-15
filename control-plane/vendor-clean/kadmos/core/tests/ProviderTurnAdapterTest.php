<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\OpenAiChatTurnAdapter;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;
use Kadmos\Tests\Support\FixtureProviderTransport;

function assertProviderTurn(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @return array<string, mixed> */
function providerFixture(string $name): array
{
    $contents = file_get_contents(__DIR__.'/fixtures/providers/openai-chat/'.$name.'.json');
    if ($contents === false) {
        throw new RuntimeException("Unable to load provider fixture: {$name}");
    }

    $decoded = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
    if (! is_array($decoded)) {
        throw new RuntimeException("Provider fixture must be an object: {$name}");
    }

    return $decoded;
}

function providerTurnRequest(string $provider = 'deepseek', bool $emptyProperties = false): ProviderTurnRequest
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
        provider: $provider,
        model: $provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4.1-mini',
        systemPrompt: 'Use tools only when evidence is required.',
        messages: [
            ['role' => 'user', 'content' => 'Earlier question.'],
            ['role' => 'assistant', 'content' => 'Earlier answer.'],
            ['role' => 'user', 'content' => 'Inspect https://example.com and report what you see.'],
        ],
        tools: [ToolDefinition::fromStrictArray($definition)],
        maxTokens: 2048,
        temperature: 0.0,
    );
}

function testOpenAiAdapterSerializesEmptySchemaPropertiesAsAnObject(): void
{
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest(emptyProperties: true));

    $payload = json_encode($requests[0]['payload'], JSON_THROW_ON_ERROR);
    assertProviderTurn(str_contains($payload, '"properties":{}'), 'OpenAI-compatible tool schemas must preserve empty JSON objects on the wire.');
}

/**
 * @param list<array<string, mixed>|Throwable> $responses
 * @param list<array<string, mixed>> $requests
 */
function openAiFixtureAdapter(array &$responses, array &$requests, string $provider = 'deepseek'): OpenAiChatTurnAdapter
{
    return new OpenAiChatTurnAdapter(
        provider: $provider,
        endpoint: $provider === 'deepseek'
            ? 'https://api.deepseek.com/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions',
        apiKey: 'test-provider-secret',
        transport: new FixtureProviderTransport(static function (string $endpoint, array $payload, array $headers, int $timeoutMs) use (&$responses, &$requests): array {
            $requests[] = compact('endpoint', 'payload', 'headers', 'timeoutMs');
            $next = array_shift($responses);
            if ($next instanceof Throwable) {
                throw $next;
            }
            if (! is_array($next)) {
                throw new RuntimeException('Provider fixture response queue is empty.');
            }

            return $next;
        }),
        timeoutMs: 30000,
    );
}

function testOpenAiAdapterNormalizesFinalTextAndPreservesConversationHistory(): void
{
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    $response = openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest());

    assertProviderTurn($response->kind === 'final', 'Final provider text must normalize to a final outcome.');
    assertProviderTurn($response->text === 'The page is ready.', 'Final text must be preserved exactly.');
    assertProviderTurn($response->toolCalls === [], 'Final text cannot invent tool calls.');
    assertProviderTurn(count($requests[0]['payload']['messages'] ?? []) === 4, 'The adapter must send system plus the complete durable conversation history.');
    assertProviderTurn(($requests[0]['payload']['messages'][1]['content'] ?? null) === 'Earlier question.', 'Earlier user context must survive the provider boundary.');
}

function testOpenAiAdapterAcceptsPreambleAndMultipleNativeCalls(): void
{
    $responses = [providerFixture('mixed-preamble-tool-call')['provider_response']];
    $requests = [];
    $response = openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest());

    assertProviderTurn($response->kind === 'tool_calls', 'Native calls plus text must remain executable tool intent.');
    assertProviderTurn($response->text === 'I will inspect the page.', 'Assistant text beside calls must be preserved only as preamble.');
    assertProviderTurn(count($response->toolCalls) === 1, 'The mixed fixture must expose one typed call.');
    assertProviderTurn($response->toolCalls[0]->providerCallId === 'call_browser_1', 'Provider call IDs must survive normalization.');
    assertProviderTurn($response->toolCalls[0]->arguments === ['url' => 'https://example.com'], 'Function arguments must decode into a closed object.');
    assertProviderTurn(($requests[0]['payload']['tools'][0]['function']['name'] ?? null) === 'browser_navigate', 'Canonical definitions must adapt to provider-native functions.');

    $responses = [providerFixture('multiple-tool-calls')['provider_response']];
    $requests = [];
    $multiple = openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest());
    assertProviderTurn(array_map(static fn ($call): string => $call->providerCallId, $multiple->toolCalls) === ['call_browser_1', 'call_browser_2'], 'Parallel calls must preserve provider order and IDs.');
}

function testOpenAiAdapterFailsClosedForMalformedCallsRefusalAndTruncation(): void
{
    foreach ([
        'malformed-arguments' => 'failure',
        'refusal' => 'refusal',
        'truncation' => 'incomplete',
    ] as $fixture => $expectedKind) {
        $responses = [providerFixture($fixture)['provider_response']];
        $requests = [];
        $response = openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest());

        assertProviderTurn($response->kind === $expectedKind, "{$fixture} must normalize to {$expectedKind}.");
        assertProviderTurn($response->toolCalls === [], "{$fixture} must never execute a partial tool call.");
    }
}

function testOpenAiAdapterContinuesWithNativeRoleToolResults(): void
{
    $responses = [
        providerFixture('mixed-preamble-tool-call')['provider_response'],
        providerFixture('tool-error-continuation')['provider_response'],
    ];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests);
    $first = $adapter->start(providerTurnRequest());
    $second = $adapter->continue(
        $first->state,
        [ToolResult::error('call_browser_1', 'BROWSER_TIMEOUT', 'The page timed out.')],
    );

    assertProviderTurn($second->kind === 'final', 'A provider may recover and finalize after a tool error result.');
    $continuationMessages = $requests[1]['payload']['messages'] ?? [];
    $assistantMessage = $continuationMessages[count($continuationMessages) - 2] ?? [];
    $toolMessage = $continuationMessages[count($continuationMessages) - 1] ?? [];
    assertProviderTurn(($assistantMessage['tool_calls'][0]['id'] ?? null) === 'call_browser_1', 'Continuation must replay the exact assistant tool-call message.');
    assertProviderTurn(($toolMessage['role'] ?? null) === 'tool', 'OpenAI-compatible continuation must use role=tool.');
    assertProviderTurn(($toolMessage['tool_call_id'] ?? null) === 'call_browser_1', 'Tool results must correlate by provider call ID.');
    $toolPayload = json_decode((string) ($toolMessage['content'] ?? ''), true, flags: JSON_THROW_ON_ERROR);
    assertProviderTurn(($toolPayload['isError'] ?? null) === true, 'Tool-level failures must remain visible to the provider as results.');
}

function testDeepSeekReasoningStateIsReplayedButNeverExposedInAuditOutput(): void
{
    $responses = [
        providerFixture('deepseek-reasoning-tool-call')['provider_response'],
        providerFixture('final-text')['provider_response'],
    ];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests);
    $first = $adapter->start(providerTurnRequest());

    $audit = json_encode($first->state->toAuditArray(), JSON_THROW_ON_ERROR);
    assertProviderTurn(! str_contains($audit, 'private-reasoning-trace'), 'Hidden reasoning must never enter audit or UI serialization.');

    $adapter->continue(
        $first->state,
        [ToolResult::error('call_browser_1', 'BROWSER_TIMEOUT', 'Retry with another source.')],
    );
    $continuationMessages = $requests[1]['payload']['messages'] ?? [];
    $assistantMessage = $continuationMessages[count($continuationMessages) - 2] ?? [];
    assertProviderTurn(($assistantMessage['reasoning_content'] ?? null) === 'private-reasoning-trace', 'DeepSeek reasoning continuation state must be replayed exactly when required.');
}

function testOpenAiAdapterReturnsRedactedProviderFailures(): void
{
    $fixture = providerFixture('provider-error');
    $responses = [new ProviderRequestException(
        (int) $fixture['status'],
        json_encode($fixture['body'], JSON_THROW_ON_ERROR),
    )];
    $requests = [];
    $response = openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest());
    $failureJson = json_encode($response->failure?->toArray(), JSON_THROW_ON_ERROR);

    assertProviderTurn($response->kind === 'failure', 'Provider HTTP failures must become typed failure outcomes.');
    assertProviderTurn(! str_contains($failureJson, 'sk-provider-secret-value'), 'Provider diagnostics must never leak credentials.');
}

function testOpenAiAdapterAllowsCredentialFreeOllamaOnlyOnLoopback(): void
{
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    $adapter = new OpenAiChatTurnAdapter(
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        apiKey: '',
        transport: new FixtureProviderTransport(static function (string $endpoint, array $payload, array $headers) use (&$responses, &$requests): array {
            $requests[] = compact('endpoint', 'payload', 'headers');

            return array_shift($responses);
        }),
    );
    $request = new ProviderTurnRequest(
        provider: 'ollama',
        model: 'qwen3:8b',
        systemPrompt: 'Answer directly.',
        messages: [['role' => 'user', 'content' => 'Hello.']],
        tools: [],
    );

    assertProviderTurn($adapter->start($request)->kind === 'final', 'Loopback Ollama must use the OpenAI-compatible adapter.');
    assertProviderTurn(! array_filter($requests[0]['headers'], static fn (string $header): bool => str_starts_with($header, 'Authorization:')), 'Ollama requests must remain credential-free.');

    try {
        new OpenAiChatTurnAdapter(
            provider: 'ollama',
            endpoint: 'http://192.0.2.10:11434/v1/chat/completions',
            apiKey: '',
            transport: new FixtureProviderTransport(static fn (): array => []),
        );
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException('Ollama endpoints outside loopback must fail closed.');
}

function testChatCapabilitiesDoNotClaimProviderManagedOrVerifiedModelState(): void
{
    $responses = [];
    $requests = [];
    $capabilities = openAiFixtureAdapter($responses, $requests)->capabilities();

    assertProviderTurn($capabilities->statefulContinuation === false, 'Chat Completions replays client history and is not provider-managed state.');
    assertProviderTurn($capabilities->modelVerified === false, 'Adapter wire support must not imply verified model capability.');
    assertProviderTurn($capabilities->parallelToolCalls === false, 'Parallel tool support must remain false until a model probe passes.');
}

$tests = [
    'testOpenAiAdapterNormalizesFinalTextAndPreservesConversationHistory',
    'testOpenAiAdapterSerializesEmptySchemaPropertiesAsAnObject',
    'testOpenAiAdapterAcceptsPreambleAndMultipleNativeCalls',
    'testOpenAiAdapterFailsClosedForMalformedCallsRefusalAndTruncation',
    'testOpenAiAdapterContinuesWithNativeRoleToolResults',
    'testDeepSeekReasoningStateIsReplayedButNeverExposedInAuditOutput',
    'testOpenAiAdapterReturnsRedactedProviderFailures',
    'testOpenAiAdapterAllowsCredentialFreeOllamaOnlyOnLoopback',
    'testChatCapabilitiesDoNotClaimProviderManagedOrVerifiedModelState',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All provider turn adapter tests passed\n";
