<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\AnthropicMessagesTurnAdapter;
use Kadmos\Provider\GeminiTurnAdapter;
use Kadmos\Provider\OpenAiChatTurnAdapter;
use Kadmos\Provider\OpenAiResponsesTurnAdapter;
use Kadmos\Provider\ProviderStream;
use Kadmos\Provider\ProviderStreamCancelledException;
use Kadmos\Provider\ProviderTransport;
use Kadmos\Provider\StreamingProviderTransport;
use Kadmos\Provider\StreamingProviderTurnAdapter;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;

function assertStreamingAdapter(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

final class StreamingFixtureTransport implements ProviderTransport, StreamingProviderTransport
{
    /** @var list<array<string, mixed>> */
    public array $requests = [];

    /**
     * @param list<array<string, mixed>> $responses
     * @param list<string> $streams
     */
    public function __construct(
        private array $responses,
        private array $streams,
    ) {}

    public function send(string $endpoint, array $payload, array $headers, int $timeoutMs): array
    {
        $this->requests[] = [
            'kind' => 'send',
            'endpoint' => $endpoint,
            'payload' => $payload,
            'headers' => $headers,
            'timeout_ms' => $timeoutMs,
        ];
        $response = array_shift($this->responses);
        if (! is_array($response)) {
            throw new RuntimeException('Buffered fixture response queue is empty.');
        }

        return $response;
    }

    public function stream(
        string $endpoint,
        array $payload,
        array $headers,
        int $timeoutMs,
        \Closure $isCancelled,
    ): iterable {
        $this->requests[] = [
            'kind' => 'stream',
            'endpoint' => $endpoint,
            'payload' => $payload,
            'headers' => $headers,
            'timeout_ms' => $timeoutMs,
        ];
        if ($isCancelled()) {
            throw new ProviderStreamCancelledException('user_requested');
        }
        $wire = array_shift($this->streams);
        if (! is_string($wire)) {
            throw new RuntimeException('Streaming fixture response queue is empty.');
        }
        $middle = intdiv(strlen($wire), 2);
        yield substr($wire, 0, $middle);
        yield substr($wire, $middle);
    }
}

function streamingToolDefinition(): ToolDefinition
{
    $definition = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/tool-contracts/valid-definition.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    return ToolDefinition::fromStrictArray($definition);
}

function streamingTurnRequest(string $provider, string $model): ProviderTurnRequest
{
    return new ProviderTurnRequest(
        provider: $provider,
        model: $model,
        systemPrompt: 'Use tools when evidence is required.',
        messages: [
            ['role' => 'user', 'content' => 'Earlier question.'],
            ['role' => 'assistant', 'content' => 'Earlier answer.'],
            ['role' => 'user', 'content' => 'Inspect https://example.com.'],
        ],
        tools: [streamingToolDefinition()],
        maxTokens: 1024,
        temperature: 0.0,
        reasoningVisible: true,
    );
}

function streamFixture(string $name): string
{
    $wire = file_get_contents(__DIR__.'/fixtures/providers/stream/'.$name);
    if ($wire === false) {
        throw new RuntimeException("Missing provider stream fixture {$name}.");
    }

    return $wire;
}

/** @return array<string, mixed> */
function responseSignature(ProviderTurnResponse $response): array
{
    return [
        'kind' => $response->kind,
        'text' => $response->text,
        'response_id' => $response->responseId,
        'stop_reason' => $response->stopReason,
        'usage' => $response->usage?->toArray(),
        'visible_reasoning' => $response->visibleReasoning,
        'tool_calls' => array_map(static fn ($call): array => $call->toArray(), $response->toolCalls),
        'state' => $response->state?->toAuditArray(),
    ];
}

/** @return array<string, mixed> */
function openAiChatToolResponse(): array
{
    return [
        'id' => 'chatcmpl_stream_1',
        'choices' => [[
            'index' => 0,
            'message' => [
                'role' => 'assistant',
                'content' => "Ciao \u{1F44B}. I will inspect the page. ",
                'reasoning_content' => 'I checked the evidence. ',
                'tool_calls' => [[
                    'id' => 'call_browser_1',
                    'type' => 'function',
                    'function' => [
                        'name' => 'browser_navigate',
                        'arguments' => '{"url":"https://example.com"}',
                    ],
                ]],
            ],
            'finish_reason' => 'tool_calls',
        ]],
        'usage' => [
            'prompt_tokens' => 41,
            'completion_tokens' => 12,
            'total_tokens' => 53,
            'prompt_tokens_details' => [
                'cached_tokens' => 7,
                'cache_write_tokens' => 2,
            ],
        ],
    ];
}

/** @return array<string, mixed> */
function responsesToolResponse(): array
{
    return [
        'id' => 'resp_stream_1',
        'status' => 'completed',
        'output' => [
            ['id' => 'rs_1', 'type' => 'reasoning', 'summary' => [['type' => 'summary_text', 'text' => 'I checked the evidence. ']]],
            ['id' => 'msg_1', 'type' => 'message', 'role' => 'assistant', 'status' => 'completed', 'content' => [['type' => 'output_text', 'text' => "Ciao \u{1F44B}. I will inspect the page. ", 'annotations' => []]]],
            ['id' => 'fc_1', 'type' => 'function_call', 'status' => 'completed', 'arguments' => '{"url":"https://example.com"}', 'call_id' => 'call_browser_1', 'name' => 'browser_navigate'],
        ],
        'usage' => [
            'input_tokens' => 47,
            'output_tokens' => 15,
            'total_tokens' => 62,
            'input_tokens_details' => [
                'cached_tokens' => 9,
                'cache_write_tokens' => 3,
            ],
        ],
    ];
}

/** @return array<string, mixed> */
function anthropicToolResponse(): array
{
    return [
        'id' => 'msg_stream_1',
        'type' => 'message',
        'role' => 'assistant',
        'model' => 'claude-sonnet-4-5',
        'content' => [
            ['type' => 'thinking', 'thinking' => 'I checked the evidence. ', 'signature' => 'sig_private_continuation'],
            ['type' => 'text', 'text' => "Ciao \u{1F44B}. I will inspect the page. "],
            ['type' => 'tool_use', 'id' => 'toolu_browser_1', 'name' => 'browser_navigate', 'input' => ['url' => 'https://example.com']],
        ],
        'stop_reason' => 'tool_use',
        'stop_sequence' => null,
        'usage' => [
            'input_tokens' => 52,
            'output_tokens' => 18,
            'cache_read_input_tokens' => 6,
            'cache_creation_input_tokens' => 2,
        ],
    ];
}

/** @return array<string, mixed> */
function geminiToolResponse(): array
{
    return [
        'responseId' => 'gemini_stream_1',
        'modelVersion' => 'gemini-2.5-pro',
        'candidates' => [[
            'index' => 0,
            'content' => [
                'role' => 'model',
                'parts' => [
                    ['text' => 'I checked the evidence. ', 'thought' => true, 'thoughtSignature' => 'private-signature'],
                    ['text' => "Ciao \u{1F44B}. I will inspect the page. "],
                    ['functionCall' => ['id' => 'gemini_call_1', 'name' => 'browser_navigate', 'args' => ['url' => 'https://example.com']]],
                ],
            ],
            'finishReason' => 'STOP',
        ]],
        'usageMetadata' => [
            'promptTokenCount' => 38,
            'candidatesTokenCount' => 14,
            'totalTokenCount' => 52,
            'cachedContentTokenCount' => 5,
        ],
    ];
}

/** @return array<string, mixed> */
function openAiFinalResponse(string $id): array
{
    return [
        'id' => $id,
        'choices' => [[
            'index' => 0,
            'message' => ['role' => 'assistant', 'content' => 'Finished.'],
            'finish_reason' => 'stop',
        ]],
        'usage' => ['prompt_tokens' => 5, 'completion_tokens' => 2, 'total_tokens' => 7],
    ];
}

function openAiFinalStream(string $id): string
{
    return "data: {\"id\":\"{$id}\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Finished.\"},\"finish_reason\":\"stop\"}]}\n\n"
        ."data: {\"id\":\"{$id}\",\"choices\":[],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2,\"total_tokens\":7}}\n\n"
        ."data: [DONE]\n\n";
}

/** @return array<string, mixed> */
function responsesFinalResponse(): array
{
    return [
        'id' => 'resp_final_1',
        'status' => 'completed',
        'output' => [[
            'id' => 'msg_final',
            'type' => 'message',
            'role' => 'assistant',
            'status' => 'completed',
            'content' => [['type' => 'output_text', 'text' => 'Finished.', 'annotations' => []]],
        ]],
        'usage' => ['input_tokens' => 5, 'output_tokens' => 2, 'total_tokens' => 7],
    ];
}

function responsesFinalStream(): string
{
    $response = json_encode(responsesFinalResponse(), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    return "event: response.created\n"
        ."data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_final_1\",\"status\":\"in_progress\",\"output\":[]}}\n\n"
        ."event: response.output_text.delta\n"
        ."data: {\"type\":\"response.output_text.delta\",\"response_id\":\"resp_final_1\",\"output_index\":0,\"content_index\":0,\"item_id\":\"msg_final\",\"delta\":\"Finished.\"}\n\n"
        ."event: response.completed\n"
        ."data: {\"type\":\"response.completed\",\"response\":{$response}}\n\n";
}

/** @return array<string, mixed> */
function anthropicFinalResponse(): array
{
    return [
        'id' => 'msg_final_1',
        'type' => 'message',
        'role' => 'assistant',
        'model' => 'claude-sonnet-4-5',
        'content' => [['type' => 'text', 'text' => 'Finished.']],
        'stop_reason' => 'end_turn',
        'stop_sequence' => null,
        'usage' => ['input_tokens' => 5, 'output_tokens' => 2],
    ];
}

function anthropicFinalStream(): string
{
    return "event: message_start\n"
        ."data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_final_1\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-sonnet-4-5\",\"content\":[],\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":5,\"output_tokens\":0}}}\n\n"
        ."event: content_block_start\n"
        ."data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n"
        ."event: content_block_delta\n"
        ."data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Finished.\"}}\n\n"
        ."event: content_block_stop\n"
        ."data: {\"type\":\"content_block_stop\",\"index\":0}\n\n"
        ."event: message_delta\n"
        ."data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}\n\n"
        ."event: message_stop\n"
        ."data: {\"type\":\"message_stop\"}\n\n";
}

/** @return array<string, mixed> */
function geminiFinalResponse(): array
{
    return [
        'responseId' => 'gemini_final_1',
        'candidates' => [[
            'index' => 0,
            'content' => ['role' => 'model', 'parts' => [['text' => 'Finished.']]],
            'finishReason' => 'STOP',
        ]],
        'usageMetadata' => ['promptTokenCount' => 5, 'candidatesTokenCount' => 2, 'totalTokenCount' => 7],
    ];
}

function geminiFinalStream(): string
{
    return "data: {\"responseId\":\"gemini_final_1\",\"candidates\":[{\"index\":0,\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Finished.\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":5,\"candidatesTokenCount\":2,\"totalTokenCount\":7}}\n\n";
}

/**
 * @param array<string, mixed> $bufferedPayload
 * @param array<string, mixed> $streamPayload
 * @param array<string, mixed> $streamOnly
 */
function assertStreamPayloadExtension(array $bufferedPayload, array $streamPayload, array $streamOnly, string $label): void
{
    foreach (array_keys($streamOnly) as $field) {
        unset($streamPayload[$field]);
    }
    assertStreamingAdapter($streamPayload === $bufferedPayload, "{$label} streaming must preserve the complete buffered payload before additive stream fields.");
}

function testAllProviderAdaptersShareBufferedBuildersAndFinalOutcomesWithStreaming(): void
{
    $cases = [
        [
            'label' => 'OpenAI-compatible Chat',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'endpoint' => 'https://api.deepseek.com/v1/chat/completions',
            'tool_response' => openAiChatToolResponse(),
            'final_response' => openAiFinalResponse('chatcmpl_final_1'),
            'tool_stream' => streamFixture('openai-chat.sse'),
            'final_stream' => openAiFinalStream('chatcmpl_final_1'),
            'call_id' => 'call_browser_1',
            'stream_only' => ['stream' => true, 'stream_options' => ['include_usage' => true]],
            'stream_endpoint' => 'https://api.deepseek.com/v1/chat/completions',
            'factory' => static fn (StreamingFixtureTransport $transport): StreamingProviderTurnAdapter => new OpenAiChatTurnAdapter(
                provider: 'deepseek',
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                apiKey: 'secret',
                transport: $transport,
            ),
        ],
        [
            'label' => 'OpenAI Responses',
            'provider' => 'openai',
            'model' => 'gpt-5-mini',
            'endpoint' => 'https://api.openai.com/v1/responses',
            'tool_response' => responsesToolResponse(),
            'final_response' => responsesFinalResponse(),
            'tool_stream' => streamFixture('openai-responses.sse'),
            'final_stream' => responsesFinalStream(),
            'call_id' => 'call_browser_1',
            'stream_only' => ['stream' => true],
            'stream_endpoint' => 'https://api.openai.com/v1/responses',
            'factory' => static fn (StreamingFixtureTransport $transport): StreamingProviderTurnAdapter => new OpenAiResponsesTurnAdapter(
                endpoint: 'https://api.openai.com/v1/responses',
                apiKey: 'secret',
                transport: $transport,
            ),
        ],
        [
            'label' => 'Anthropic Messages',
            'provider' => 'anthropic',
            'model' => 'claude-sonnet-4-5',
            'endpoint' => 'https://api.anthropic.com/v1/messages',
            'tool_response' => anthropicToolResponse(),
            'final_response' => anthropicFinalResponse(),
            'tool_stream' => streamFixture('anthropic-messages.sse'),
            'final_stream' => anthropicFinalStream(),
            'call_id' => 'toolu_browser_1',
            'stream_only' => ['stream' => true],
            'stream_endpoint' => 'https://api.anthropic.com/v1/messages',
            'factory' => static fn (StreamingFixtureTransport $transport): StreamingProviderTurnAdapter => new AnthropicMessagesTurnAdapter(
                endpoint: 'https://api.anthropic.com/v1/messages',
                apiKey: 'secret',
                transport: $transport,
            ),
        ],
        [
            'label' => 'Gemini Generate Content',
            'provider' => 'gemini',
            'model' => 'gemini-2.5-pro',
            'endpoint' => 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
            'tool_response' => geminiToolResponse(),
            'final_response' => geminiFinalResponse(),
            'tool_stream' => streamFixture('gemini-generate-content.sse'),
            'final_stream' => geminiFinalStream(),
            'call_id' => 'gemini_call_1',
            'stream_only' => [],
            'stream_endpoint' => 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
            'factory' => static fn (StreamingFixtureTransport $transport): StreamingProviderTurnAdapter => new GeminiTurnAdapter(
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
                apiKey: 'secret',
                transport: $transport,
            ),
        ],
    ];

    foreach ($cases as $case) {
        $transport = new StreamingFixtureTransport(
            [$case['tool_response'], $case['final_response']],
            [$case['tool_stream'], $case['final_stream']],
        );
        $adapter = ($case['factory'])($transport);
        assertStreamingAdapter($adapter instanceof StreamingProviderTurnAdapter, "{$case['label']} must expose the common streaming adapter interface.");
        $request = streamingTurnRequest($case['provider'], $case['model']);

        $bufferedStart = $adapter->start($request);
        $result = ToolResult::error($case['call_id'], 'BROWSER_TEST', 'Fixture result.');
        $bufferedFinal = $adapter->continue($bufferedStart->state, [$result]);

        $startStream = $adapter->streamStart($request, static fn (): bool => false);
        assertStreamingAdapter($startStream instanceof ProviderStream, "{$case['label']} streamStart must return a ProviderStream.");
        iterator_to_array($startStream);
        $streamedStart = $startStream->finalOutcome();
        $continueStream = $adapter->streamContinue($streamedStart->state, [$result], static fn (): bool => false);
        iterator_to_array($continueStream);
        $streamedFinal = $continueStream->finalOutcome();

        assertStreamingAdapter(responseSignature($streamedStart) === responseSignature($bufferedStart), "{$case['label']} streamed tool outcome must equal buffered normalization.");
        assertStreamingAdapter(responseSignature($streamedFinal) === responseSignature($bufferedFinal), "{$case['label']} streamed continuation must equal buffered normalization.");

        assertStreamPayloadExtension(
            $transport->requests[0]['payload'],
            $transport->requests[2]['payload'],
            $case['stream_only'],
            "{$case['label']} start",
        );
        assertStreamPayloadExtension(
            $transport->requests[1]['payload'],
            $transport->requests[3]['payload'],
            $case['stream_only'],
            "{$case['label']} continuation",
        );
        foreach ($case['stream_only'] as $field => $value) {
            assertStreamingAdapter(($transport->requests[2]['payload'][$field] ?? null) === $value, "{$case['label']} start must add {$field} only on streaming.");
            assertStreamingAdapter(($transport->requests[3]['payload'][$field] ?? null) === $value, "{$case['label']} continuation must add {$field} only on streaming.");
        }
        assertStreamingAdapter($transport->requests[2]['endpoint'] === $case['stream_endpoint'], "{$case['label']} must use its exact streaming endpoint.");
        assertStreamingAdapter($transport->requests[3]['endpoint'] === $case['stream_endpoint'], "{$case['label']} continuation must reuse its exact streaming endpoint.");
        assertStreamingAdapter(in_array('Accept: text/event-stream', $transport->requests[2]['headers'], true), "{$case['label']} must explicitly request SSE.");
    }
}

testAllProviderAdaptersShareBufferedBuildersAndFinalOutcomesWithStreaming();

echo "ProviderStreamingAdapterTest passed\n";
