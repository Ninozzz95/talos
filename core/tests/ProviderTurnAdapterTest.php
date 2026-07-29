<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\OpenAiChatTurnAdapter;
use Kadmos\Provider\PromptCachePlan;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Tool\ProviderInputResource;
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

function providerTurnRequest(
    string $provider = 'deepseek',
    bool $emptyProperties = false,
    ?bool $reasoningVisible = null,
    ?string $responseMimeType = null,
    ?PromptCachePlan $promptCachePlan = null,
    ?string $model = null,
): ProviderTurnRequest
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
        model: $model ?? ($provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4.1-mini'),
        systemPrompt: 'Use tools only when evidence is required.',
        messages: [
            ['role' => 'user', 'content' => 'Earlier question.'],
            ['role' => 'assistant', 'content' => 'Earlier answer.'],
            ['role' => 'user', 'content' => 'Inspect https://example.com and report what you see.'],
        ],
        tools: [ToolDefinition::fromStrictArray($definition)],
        maxTokens: 2048,
        temperature: 0.0,
        reasoningVisible: $reasoningVisible,
        responseMimeType: $responseMimeType,
        promptCachePlan: $promptCachePlan,
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

function testOpenAiAdapterSeparatesProviderVisibleReasoningFromFinalText(): void
{
    $responses = [providerFixture('final-visible-reasoning')['provider_response']];
    $requests = [];
    $response = openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest(reasoningVisible: true));

    assertProviderTurn($response->kind === 'final', 'Provider-visible reasoning must not change the final outcome kind.');
    assertProviderTurn($response->text === 'The page is ready.', 'Provider-visible reasoning must not be duplicated into the answer.');
    assertProviderTurn($response->visibleReasoning === 'I compared the available evidence before answering.', 'Provider-designated reasoning must survive normalization separately.');
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

function testOpenAiAdapterRejectsListShapedToolArguments(): void
{
    $fixture = providerFixture('mixed-preamble-tool-call')['provider_response'];
    $fixture['choices'][0]['message']['tool_calls'][0]['function']['arguments'] = '[]';
    $responses = [$fixture];
    $requests = [];

    $response = openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest());

    assertProviderTurn($response->kind === 'failure', 'List-shaped Chat Completions arguments must fail closed.');
    assertProviderTurn($response->toolCalls === [], 'List-shaped Chat Completions arguments must never reach execution.');
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

function testOpenAiAdapterProjectsCanonicalToolResultsOnceForChatContinuation(): void
{
    $responses = [
        providerFixture('mixed-preamble-tool-call')['provider_response'],
        providerFixture('final-text')['provider_response'],
    ];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests);
    $first = $adapter->start(providerTurnRequest());
    $structured = [
        'tool' => 'browser_snapshot',
        'observation' => [
            'nodes' => [[
                'ref' => 'r1',
                'role' => 'link',
                'name' => str_repeat('Vehicle result ', 256),
            ]],
        ],
        'evidence_ids' => ['artifact-1'],
    ];
    $canonical = new ToolResult(
        toolUseId: 'call_browser_1',
        isError: false,
        content: [[
            'type' => 'text',
            'text' => json_encode($structured, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]],
        structuredContent: $structured,
        evidence: [[
            'artifact_id' => 'artifact-1',
            'kind' => 'browser_snapshot',
            'sha256' => 'sha256:'.str_repeat('a', 64),
            'trusted_boundary' => 'browser-worker',
        ]],
    );

    $adapter->continue($first->state, [$canonical]);

    $messages = $requests[1]['payload']['messages'] ?? [];
    $toolMessage = $messages[count($messages) - 1] ?? [];
    $providerPayload = json_decode((string) ($toolMessage['content'] ?? ''), true, flags: JSON_THROW_ON_ERROR);
    assertProviderTurn(
        array_keys($providerPayload) === ['isError', 'structuredContent', 'evidence'],
        'A structured provider result must be projected once without duplicated MCP compatibility fields.',
    );
    assertProviderTurn(
        ($providerPayload['structuredContent'] ?? null) === $structured,
        'Compact provider projection must preserve the complete structured result.',
    );
    assertProviderTurn(
        ($providerPayload['evidence'][0]['artifact_id'] ?? null) === 'artifact-1',
        'Compact provider projection must preserve redacted evidence identity.',
    );
    assertProviderTurn(
        strlen((string) $toolMessage['content']) < strlen(json_encode($canonical->toRedactedArray(), JSON_THROW_ON_ERROR)),
        'Compact provider projection must be smaller than the persisted canonical result.',
    );

    $responses = [
        providerFixture('mixed-preamble-tool-call')['provider_response'],
        providerFixture('final-text')['provider_response'],
    ];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests);
    $first = $adapter->start(providerTurnRequest());
    $adapter->continue($first->state, [new ToolResult(
        toolUseId: 'call_browser_1',
        isError: false,
        content: [['type' => 'text', 'text' => 'Unstructured fallback result.']],
        structuredContent: null,
        evidence: [],
    )]);
    $messages = $requests[1]['payload']['messages'] ?? [];
    $fallbackPayload = json_decode((string) ($messages[count($messages) - 1]['content'] ?? ''), true, flags: JSON_THROW_ON_ERROR);
    assertProviderTurn(
        array_keys($fallbackPayload) === ['isError', 'content', 'evidence'],
        'An unstructured provider result must retain its redacted content fallback.',
    );
    assertProviderTurn(
        ($fallbackPayload['content'][0]['text'] ?? null) === 'Unstructured fallback result.',
        'Compact provider projection must preserve unstructured text.',
    );
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

function testDeepSeekThinkingToggleIsExplicitAndDurableAcrossToolContinuation(): void
{
    $responses = [
        providerFixture('mixed-preamble-tool-call')['provider_response'],
        providerFixture('tool-error-continuation')['provider_response'],
    ];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests);
    $first = $adapter->start(providerTurnRequest(reasoningVisible: false));
    $adapter->continue(
        $first->state,
        [ToolResult::error('call_browser_1', 'BROWSER_TIMEOUT', 'Retry with another source.')],
    );

    assertProviderTurn(
        ($requests[0]['payload']['thinking']['type'] ?? null) === 'disabled',
        'DeepSeek must receive an explicit disabled thinking toggle when the composer turns thinking off.',
    );
    assertProviderTurn(
        ($requests[1]['payload']['thinking']['type'] ?? null) === 'disabled',
        'DeepSeek continuation must preserve the exact thinking toggle from the initial tool turn.',
    );

    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    openAiFixtureAdapter($responses, $requests)->start(providerTurnRequest(reasoningVisible: true));
    assertProviderTurn(
        ($requests[0]['payload']['thinking']['type'] ?? null) === 'enabled',
        'DeepSeek must receive an explicit enabled thinking toggle when requested.',
    );

    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    openAiFixtureAdapter($responses, $requests, 'openai')->start(
        providerTurnRequest('openai', reasoningVisible: false),
    );
    assertProviderTurn(
        ! array_key_exists('thinking', $requests[0]['payload']),
        'DeepSeek-specific thinking wire fields must not leak into OpenAI requests.',
    );
}

function testDeepSeekJsonResponseMimeTypeIsNativeAndDurableAcrossToolContinuation(): void
{
    $responses = [
        providerFixture('mixed-preamble-tool-call')['provider_response'],
        providerFixture('final-text')['provider_response'],
    ];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests);
    $first = $adapter->start(providerTurnRequest(responseMimeType: 'application/json'));
    $adapter->continue(
        $first->state,
        [ToolResult::error('call_browser_1', 'BROWSER_TIMEOUT', 'The page timed out.')],
    );

    assertProviderTurn(
        ($requests[0]['payload']['response_format']['type'] ?? null) === 'json_object',
        'DeepSeek JSON output must use its stable native response_format contract.',
    );
    assertProviderTurn(
        ($requests[1]['payload']['response_format']['type'] ?? null) === 'json_object',
        'DeepSeek JSON output mode must survive the full tool continuation.',
    );
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
            endpoint: 'http://192.168.1.10:11434/v1/chat/completions',
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

function openAiResourceRequest(
    string $provider = 'openai',
    string $documentMime = 'application/pdf',
    string $imageMime = 'image/png',
): ProviderTurnRequest
{
    return new ProviderTurnRequest(
        provider: $provider,
        model: strtolower($provider) === 'openai' ? 'gpt-5.6' : 'deepseek-chat',
        systemPrompt: 'Answer from the supplied resources.',
        messages: [['role' => 'user', 'content' => 'Analyze these resources.']],
        tools: [],
        resources: [
            ProviderInputResource::fromBytes('image-1', ProviderInputResource::KIND_IMAGE, 'diagram.png', $imageMime, 'image-bytes'),
            ProviderInputResource::fromBytes('document-1', ProviderInputResource::KIND_DOCUMENT, 'report.pdf', $documentMime, 'pdf-bytes'),
        ],
    );
}

function testOpenAiChatAdapterRejectsGifWithoutStaticFrameProof(): void
{
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];

    try {
        openAiFixtureAdapter($responses, $requests, 'openai')->start(openAiResourceRequest(imageMime: 'image/gif'));
    } catch (InvalidArgumentException) {
        assertProviderTurn($requests === [], 'Unverified OpenAI Chat GIF input must fail before transport.');

        return;
    }

    throw new RuntimeException('OpenAI Chat GIF input without static-frame proof must fail closed.');
}

function testOpenAiChatAdapterMapsGpt56PromptCachePolicyAcrossToolContinuation(): void
{
    $plan = new PromptCachePlan(
        mode: PromptCachePlan::MODE_AUTOMATIC,
        keyHash: str_repeat('a', 64),
        breakpoints: [PromptCachePlan::BREAKPOINT_SYSTEM, 'message:0'],
        ttl: PromptCachePlan::TTL_30_MINUTES,
        minimumInputTokens: 1024,
    );
    $responses = [
        providerFixture('mixed-preamble-tool-call')['provider_response'],
        providerFixture('final-text')['provider_response'],
    ];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests, 'openai');
    $first = $adapter->start(providerTurnRequest(
        provider: 'openai',
        promptCachePlan: $plan,
        model: 'gpt-5.6-sol',
    ));
    $adapter->continue(
        $first->state,
        [ToolResult::error('call_browser_1', 'BROWSER_TIMEOUT', 'Retry later.')],
    );

    foreach ($requests as $index => $request) {
        assertProviderTurn(
            ($request['payload']['prompt_cache_key'] ?? null) === str_repeat('a', 64),
            "OpenAI GPT-5.6 request {$index} must preserve the opaque stable cache key.",
        );
        assertProviderTurn(
            ($request['payload']['prompt_cache_options'] ?? null) === [
                'mode' => 'implicit',
                'ttl' => '30m',
            ],
            "OpenAI GPT-5.6 request {$index} must preserve the automatic cache policy.",
        );
    }
    assertProviderTurn(
        ($requests[0]['payload']['messages'][0]['content'][0]['prompt_cache_breakpoint']['mode'] ?? null) === 'explicit',
        'OpenAI Chat must map the canonical system breakpoint to its text block.',
    );
    assertProviderTurn(
        ($requests[0]['payload']['messages'][1]['content'][0]['prompt_cache_breakpoint']['mode'] ?? null) === 'explicit',
        'OpenAI Chat must map canonical message indexes without counting the injected system message.',
    );
    assertProviderTurn(
        ($requests[1]['payload']['messages'][0]['content'][0]['prompt_cache_breakpoint']['mode'] ?? null) === 'explicit',
        'OpenAI Chat continuation must preserve prior explicit breakpoint blocks.',
    );
}

function testOpenAiChatAdapterKeepsOlderAndCompatibleProviderCacheDialectsFailClosed(): void
{
    $automatic = new PromptCachePlan(
        mode: PromptCachePlan::MODE_AUTOMATIC,
        keyHash: str_repeat('b', 64),
        breakpoints: [],
        ttl: null,
        minimumInputTokens: 1024,
    );
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    openAiFixtureAdapter($responses, $requests, 'openai')->start(providerTurnRequest(
        provider: 'openai',
        promptCachePlan: $automatic,
        model: 'gpt-4.1-mini',
    ));
    assertProviderTurn(
        ($requests[0]['payload']['prompt_cache_key'] ?? null) === str_repeat('b', 64),
        'Documented older OpenAI models may receive the stable routing key.',
    );
    assertProviderTurn(
        ! array_key_exists('prompt_cache_options', $requests[0]['payload']),
        'Older OpenAI models must not receive GPT-5.6 prompt_cache_options.',
    );

    $disabled = new PromptCachePlan(
        mode: PromptCachePlan::MODE_DISABLED,
        keyHash: str_repeat('c', 64),
        breakpoints: [],
        ttl: null,
        minimumInputTokens: null,
    );
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    openAiFixtureAdapter($responses, $requests, 'openai')->start(providerTurnRequest(
        provider: 'openai',
        promptCachePlan: $disabled,
        model: 'gpt-5.6',
    ));
    assertProviderTurn(
        ($requests[0]['payload']['prompt_cache_options'] ?? null) === ['mode' => 'explicit'],
        'GPT-5.6 disabled mode must suppress implicit caching with an empty explicit policy.',
    );
    assertProviderTurn(
        ! array_key_exists('prompt_cache_key', $requests[0]['payload']),
        'A disabled OpenAI cache plan must not emit a routing key.',
    );

    $explicit = new PromptCachePlan(
        mode: PromptCachePlan::MODE_EXPLICIT,
        keyHash: str_repeat('d', 64),
        breakpoints: [PromptCachePlan::BREAKPOINT_SYSTEM],
        ttl: PromptCachePlan::TTL_30_MINUTES,
        minimumInputTokens: 1024,
    );
    foreach ([
        ['provider' => 'openai', 'model' => 'gpt-4.1-mini'],
        ['provider' => 'deepseek', 'model' => 'deepseek-chat'],
    ] as $case) {
        $responses = [providerFixture('final-text')['provider_response']];
        $requests = [];
        try {
            openAiFixtureAdapter($responses, $requests, $case['provider'])->start(providerTurnRequest(
                provider: $case['provider'],
                promptCachePlan: $explicit,
                model: $case['model'],
            ));
        } catch (InvalidArgumentException) {
            assertProviderTurn($requests === [], 'Unsupported explicit cache controls must fail before provider transport.');
            continue;
        }

        throw new RuntimeException('Unsupported OpenAI-compatible explicit cache controls must fail closed.');
    }
}

function testOpenAiChatAdapterNormalizesConfiguredProviderIdentity(): void
{
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests, 'OpenAI');

    $response = $adapter->start(openAiResourceRequest('OPENAI'));

    assertProviderTurn($response->kind === 'final', 'Mixed-case OpenAI identity must preserve native resource delivery.');
    assertProviderTurn($adapter->capabilities()->provider === 'openai', 'Provider capabilities must expose a canonical identity.');
    assertProviderTurn($adapter->capabilities()->nativeInputImages, 'Mixed-case OpenAI configuration must advertise native image support.');
    assertProviderTurn($adapter->capabilities()->nativeInputDocuments, 'Mixed-case OpenAI configuration must advertise native document support.');
}

function testOpenAiChatAdapterRejectsUnsupportedDocumentMimeBeforeTransport(): void
{
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];

    try {
        openAiFixtureAdapter($responses, $requests, 'openai')->start(openAiResourceRequest(documentMime: 'application/octet-stream'));
    } catch (InvalidArgumentException) {
        assertProviderTurn($requests === [], 'Unsupported OpenAI Chat document MIME must fail before transport.');

        return;
    }

    throw new RuntimeException('Unsupported OpenAI Chat document MIME must fail closed.');
}

function testOpenAiChatAdapterSerializesNativeOpenAiResourcesAndRejectsCompatibleAliases(): void
{
    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    $adapter = openAiFixtureAdapter($responses, $requests, 'openai');
    $adapter->start(openAiResourceRequest());

    $content = $requests[0]['payload']['messages'][1]['content'] ?? [];
    assertProviderTurn(($content[0]['type'] ?? null) === 'image_url', 'OpenAI Chat images must use image_url blocks.');
    assertProviderTurn(($content[0]['image_url']['url'] ?? null) === 'data:image/png;base64,'.base64_encode('image-bytes'), 'OpenAI Chat images must carry inline data URLs.');
    assertProviderTurn(($content[1]['type'] ?? null) === 'file', 'OpenAI Chat documents must use file blocks.');
    assertProviderTurn(($content[1]['file']['filename'] ?? null) === 'report.pdf', 'OpenAI Chat file blocks must preserve the safe filename.');
    assertProviderTurn(($content[1]['file']['file_data'] ?? null) === 'data:application/pdf;base64,'.base64_encode('pdf-bytes'), 'OpenAI Chat files must carry inline data URLs.');
    assertProviderTurn(($content[2]['type'] ?? null) === 'text' && ($content[2]['text'] ?? null) === 'Analyze these resources.', 'OpenAI Chat prompt text must remain in the final user turn.');
    assertProviderTurn($adapter->capabilities()->nativeInputImages, 'OpenAI Chat must advertise native image support.');
    assertProviderTurn($adapter->capabilities()->nativeInputDocuments, 'OpenAI Chat must advertise native document support.');

    $responses = [providerFixture('mixed-preamble-tool-call')['provider_response']];
    $requests = [];
    $unexpectedCall = openAiFixtureAdapter($responses, $requests, 'openai')->start(openAiResourceRequest());
    assertProviderTurn($unexpectedCall->kind === 'failure', 'OpenAI Chat resource turns must reject undeclared provider tool calls.');
    assertProviderTurn($unexpectedCall->state === null, 'OpenAI Chat resource turns must not retain inline bytes in continuation state.');

    $responses = [providerFixture('final-text')['provider_response']];
    $requests = [];
    $deepSeek = openAiFixtureAdapter($responses, $requests, 'deepseek');
    try {
        $deepSeek->start(openAiResourceRequest('deepseek'));
    } catch (InvalidArgumentException) {
        assertProviderTurn($requests === [], 'OpenAI-compatible aliases must reject resources before transport.');
        assertProviderTurn(! $deepSeek->capabilities()->nativeInputImages, 'DeepSeek must not inherit OpenAI image support.');
        assertProviderTurn(! $deepSeek->capabilities()->nativeInputDocuments, 'DeepSeek must not inherit OpenAI document support.');

        return;
    }

    throw new RuntimeException('OpenAI-compatible aliases must fail closed for native resources.');
}

$tests = [
    'testOpenAiAdapterNormalizesFinalTextAndPreservesConversationHistory',
    'testOpenAiAdapterSeparatesProviderVisibleReasoningFromFinalText',
    'testOpenAiAdapterSerializesEmptySchemaPropertiesAsAnObject',
    'testOpenAiAdapterAcceptsPreambleAndMultipleNativeCalls',
    'testOpenAiAdapterFailsClosedForMalformedCallsRefusalAndTruncation',
    'testOpenAiAdapterRejectsListShapedToolArguments',
    'testOpenAiAdapterContinuesWithNativeRoleToolResults',
    'testOpenAiAdapterProjectsCanonicalToolResultsOnceForChatContinuation',
    'testDeepSeekReasoningStateIsReplayedButNeverExposedInAuditOutput',
    'testDeepSeekThinkingToggleIsExplicitAndDurableAcrossToolContinuation',
    'testDeepSeekJsonResponseMimeTypeIsNativeAndDurableAcrossToolContinuation',
    'testOpenAiAdapterReturnsRedactedProviderFailures',
    'testOpenAiAdapterAllowsCredentialFreeOllamaOnlyOnLoopback',
    'testChatCapabilitiesDoNotClaimProviderManagedOrVerifiedModelState',
    'testOpenAiChatAdapterSerializesNativeOpenAiResourcesAndRejectsCompatibleAliases',
    'testOpenAiChatAdapterRejectsUnsupportedDocumentMimeBeforeTransport',
    'testOpenAiChatAdapterNormalizesConfiguredProviderIdentity',
    'testOpenAiChatAdapterRejectsGifWithoutStaticFrameProof',
    'testOpenAiChatAdapterMapsGpt56PromptCachePolicyAcrossToolContinuation',
    'testOpenAiChatAdapterKeepsOlderAndCompatibleProviderCacheDialectsFailClosed',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All provider turn adapter tests passed\n";
