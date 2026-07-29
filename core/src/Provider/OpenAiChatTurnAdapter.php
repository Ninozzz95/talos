<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Closure;
use InvalidArgumentException;
use JsonException;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolContractGuard;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;
use Throwable;

final class OpenAiChatTurnAdapter implements StreamingProviderTurnAdapter
{
    public const ADAPTER_VERSION = 'openai_chat_v1';

    private readonly string $provider;

    public function __construct(
        string $provider,
        private readonly string $endpoint,
        private readonly string $apiKey,
        private readonly ProviderTransport $transport,
        private readonly int $timeoutMs = 30000,
    ) {
        ToolContractGuard::nonEmptyString($provider, 'OpenAI-compatible provider', 64);
        $this->provider = strtolower($provider);
        if ($timeoutMs < 1) {
            throw new InvalidArgumentException('OpenAI-compatible timeout must be positive.');
        }
        $parts = parse_url($endpoint);
        $scheme = is_array($parts) ? strtolower((string) ($parts['scheme'] ?? '')) : '';
        $host = is_array($parts) ? strtolower(rtrim(trim((string) ($parts['host'] ?? ''), '[]'), '.')) : '';
        if (! is_array($parts)
            || $host === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new InvalidArgumentException('OpenAI-compatible endpoint must be credential-free and contain no query or fragment.');
        }
        if ($this->provider === 'ollama') {
            if (! in_array($scheme, ['http', 'https'], true) || ! in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
                throw new InvalidArgumentException('Ollama endpoint must use an HTTP(S) loopback URL.');
            }
            if ($apiKey !== '') {
                throw new InvalidArgumentException('Ollama adapter must remain credential-free.');
            }
        } else {
            if ($scheme !== 'https') {
                throw new InvalidArgumentException('Remote OpenAI-compatible endpoints require HTTPS.');
            }
            ToolContractGuard::nonEmptyString($apiKey, 'OpenAI-compatible API key', 8192);
        }
    }

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities(
            provider: $this->provider,
            adapterVersion: self::ADAPTER_VERSION,
            nativeTools: true,
            parallelToolCalls: false,
            strictSchemas: false,
            statefulContinuation: false,
            reasoningContinuationState: $this->provider === 'deepseek',
            imageToolResults: false,
            source: 'adapter_contract',
            limitations: ['Model-level capabilities still require a successful probe.'],
            nativeInputImages: $this->provider === 'openai',
            nativeInputDocuments: $this->provider === 'openai',
        );
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        [$payload, $hasResources] = $this->startPayload($request);

        return $this->withoutResourceContinuation($this->perform($payload), $hasResources);
    }

    public function streamStart(ProviderTurnRequest $request, Closure $isCancelled): ProviderStream
    {
        [$payload, $hasResources] = $this->startPayload($request);

        return $this->performStream(
            $payload,
            $isCancelled,
            fn (array $response): ProviderTurnResponse => $this->withoutResourceContinuation(
                $this->normalize($response, $payload),
                $hasResources,
            ),
        );
    }

    /** @return array{array<string, mixed>, bool} */
    private function startPayload(ProviderTurnRequest $request): array
    {
        if (strtolower($request->provider) !== strtolower($this->provider)) {
            throw new InvalidArgumentException('Provider turn request does not match the configured adapter.');
        }

        if ($request->resources !== [] && $this->provider !== 'openai') {
            throw new InvalidArgumentException('This OpenAI-compatible provider does not support canonical native input resources.');
        }
        $durableMessages = $request->resources === []
            ? $request->messages
            : $this->messagesWithResources($request);
        $messages = [['role' => 'system', 'content' => $request->systemPrompt], ...$durableMessages];
        $payload = [
            'model' => $request->model,
            'messages' => $messages,
        ];
        if ($request->maxTokens !== null) {
            $payload['max_tokens'] = $request->maxTokens;
        }
        if ($request->temperature !== null) {
            $payload['temperature'] = $request->temperature;
        }
        if ($request->responseMimeType !== null) {
            if (! in_array($this->provider, ['deepseek', 'openai'], true)) {
                throw new InvalidArgumentException('This OpenAI-compatible provider does not support the requested response MIME type.');
            }
            $payload['response_format'] = ['type' => 'json_object'];
        }
        foreach (ReasoningEffortMap::paramsFor(
            ReasoningEffortMap::TARGET_OPENAI_CHAT,
            $request->reasoningEffort,
            $request->reasoningVisible ?? false,
            $request->maxTokens,
        ) as $reasoningKey => $reasoningValue) {
            $payload[$reasoningKey] = $reasoningValue;
        }
        if ($this->provider === 'deepseek' && $request->reasoningVisible !== null) {
            $payload['thinking'] = [
                'type' => $request->reasoningVisible ? 'enabled' : 'disabled',
            ];
        }
        if ($request->tools !== []) {
            $payload['tools'] = array_map($this->providerTool(...), $request->tools);
            $payload['tool_choice'] = 'auto';
        }
        $payload = $this->withPromptCachePlan($payload, $request->promptCachePlan, $request->model);

        return [$payload, $request->resources !== []];
    }

    /** @return list<array<string, mixed>> */
    private function messagesWithResources(ProviderTurnRequest $request): array
    {
        $messages = $request->messages;
        $last = array_key_last($messages);
        $content = [];
        foreach ($request->resources as $resource) {
            OpenAiInputResourcePolicy::assertSupported($resource, 'OpenAI Chat Completions');
            if ($resource->isImage()) {
                $content[] = [
                    'type' => 'image_url',
                    'image_url' => ['url' => $resource->dataUri()],
                ];
                continue;
            }
            $content[] = [
                'type' => 'file',
                'file' => [
                    'filename' => $resource->filename,
                    'file_data' => $resource->dataUri(),
                ],
            ];
        }
        $content[] = ['type' => 'text', 'text' => $messages[$last]['content']];
        $messages[$last]['content'] = $content;

        return $messages;
    }

    private function withoutResourceContinuation(ProviderTurnResponse $response, bool $hasResources): ProviderTurnResponse
    {
        if (! $hasResources || $response->kind !== ProviderTurnResponse::TOOL_CALLS) {
            return $response;
        }

        return ProviderTurnResponse::failure(new ProviderFailure(
            code: 'PROVIDER_RESOURCE_TOOL_CALL_UNSUPPORTED',
            message: 'A provider resource turn returned an undeclared tool call.',
            retryable: false,
        ), $response->responseId, $response->stopReason, $response->usage);
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        return $this->perform($this->continuationPayload($state, $toolResults));
    }

    public function streamContinue(
        ProviderTurnState $state,
        array $toolResults,
        Closure $isCancelled,
    ): ProviderStream {
        $payload = $this->continuationPayload($state, $toolResults);

        return $this->performStream(
            $payload,
            $isCancelled,
            fn (array $response): ProviderTurnResponse => $this->normalize($response, $payload),
        );
    }

    /**
     * @param list<ToolResult> $toolResults
     * @return array<string, mixed>
     */
    private function continuationPayload(ProviderTurnState $state, array $toolResults): array
    {
        if (strtolower($state->provider) !== strtolower($this->provider)) {
            throw new InvalidArgumentException('Provider turn state does not match the configured adapter.');
        }
        ToolContractGuard::listArray($toolResults, 'Provider continuation tool results');
        $resultsById = [];
        foreach ($toolResults as $result) {
            if (! $result instanceof ToolResult) {
                throw new InvalidArgumentException('Provider continuation requires ToolResult values.');
            }
            if (isset($resultsById[$result->toolUseId])) {
                throw new InvalidArgumentException('Provider continuation result IDs must be unique.');
            }
            $resultsById[$result->toolUseId] = $result;
        }
        if (array_keys($resultsById) != $state->pendingToolCallIds
            || count($resultsById) !== count($state->pendingToolCallIds)) {
            throw new InvalidArgumentException('Provider continuation results must match every pending tool call exactly and in order.');
        }

        $native = $state->nativeStateFor(self::ADAPTER_VERSION);
        $messages = ToolContractGuard::listArray($native['messages'] ?? null, 'OpenAI continuation messages');
        $assistantMessage = ToolContractGuard::objectArray($native['assistant_message'] ?? null, 'OpenAI continuation assistant message');
        $messages[] = $assistantMessage;
        foreach ($state->pendingToolCallIds as $callId) {
            $result = $resultsById[$callId];
            $messages[] = [
                'role' => 'tool',
                'tool_call_id' => $callId,
                'content' => json_encode($this->providerToolResultPayload($result), JSON_THROW_ON_ERROR),
            ];
        }

        $payload = [
            'model' => ToolContractGuard::nonEmptyString($native['model'] ?? null, 'OpenAI continuation model', 256),
            'messages' => $messages,
        ];
        foreach ([
            'max_tokens',
            'temperature',
            'response_format',
            'reasoning_effort',
            'thinking',
            'tools',
            'tool_choice',
            'prompt_cache_key',
            'prompt_cache_options',
        ] as $field) {
            if (array_key_exists($field, $native)) {
                $payload[$field] = $native[$field];
            }
        }

        return $payload;
    }

    /** @return array<string, mixed> */
    private function providerToolResultPayload(ToolResult $result): array
    {
        $redacted = $result->toRedactedArray();
        $payload = [
            'isError' => $result->isError,
        ];

        if ($result->structuredContent !== null) {
            $payload['structuredContent'] = $redacted['structuredContent'];
        } else {
            $payload['content'] = $redacted['content'];
        }

        $payload['evidence'] = $redacted['evidence'];

        return $payload;
    }

    /** @param array<string, mixed> $payload */
    private function perform(array $payload): ProviderTurnResponse
    {
        try {
            $headers = ['Content-Type: application/json'];
            if ($this->provider !== 'ollama') {
                $headers[] = 'Authorization: Bearer '.$this->apiKey;
            }
            $response = $this->transport->send(
                $this->endpoint,
                $payload,
                $headers,
                $this->timeoutMs,
            );
            if (! is_array($response)) {
                throw new InvalidArgumentException('Provider transport returned a non-object response.');
            }

            return $this->normalize($response, $payload);
        } catch (ProviderRequestException $exception) {
            $details = ToolContractGuard::redact(['provider_response' => $exception->responseBody]);

            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_HTTP_ERROR',
                message: sprintf('Provider request failed with HTTP %d.', $exception->status),
                retryable: $exception->status === 429 || $exception->status >= 500,
                httpStatus: $exception->status,
                details: $details,
            ));
        } catch (Throwable $exception) {
            $details = ToolContractGuard::redact(['transport_error' => $exception->getMessage()]);

            return ProviderTurnResponse::failure(new ProviderFailure(
                code: $exception instanceof JsonException ? 'PROVIDER_PROTOCOL_INVALID_JSON' : 'PROVIDER_PROTOCOL_ERROR',
                message: 'Provider response did not satisfy the adapter contract.',
                retryable: false,
                details: $details,
            ));
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @param Closure(array<string, mixed>): ProviderTurnResponse $finalizer
     */
    private function performStream(array $payload, Closure $isCancelled, Closure $finalizer): ProviderStream
    {
        if (! $this->transport instanceof StreamingProviderTransport) {
            throw new InvalidArgumentException('Configured OpenAI-compatible transport does not support streaming.');
        }
        $streamPayload = [...$payload, 'stream' => true];
        if (in_array($this->provider, ['openai', 'deepseek', 'groq', 'ollama'], true)) {
            $streamPayload['stream_options'] = ['include_usage' => true];
        }
        $headers = ['Content-Type: application/json', 'Accept: text/event-stream'];
        if ($this->provider !== 'ollama') {
            $headers[] = 'Authorization: Bearer '.$this->apiKey;
        }

        return new ProviderStream(
            $this->transport->stream(
                $this->endpoint,
                $streamPayload,
                $headers,
                $this->timeoutMs,
                $isCancelled,
            ),
            new OpenAiChatStreamDecoder($finalizer),
        );
    }

    /** @param array<string, mixed> $response @param array<string, mixed> $requestPayload */
    private function normalize(array $response, array $requestPayload): ProviderTurnResponse
    {
        $responseId = is_string($response['id'] ?? null) ? $response['id'] : null;
        $usage = TokenUsage::fromOpenAi(is_array($response['usage'] ?? null) ? $response['usage'] : []);
        $choices = ToolContractGuard::listArray($response['choices'] ?? null, 'OpenAI provider choices');
        if ($choices === [] || ! is_array($choices[0])) {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_RESPONSE_EMPTY',
                message: 'Provider response did not contain a choice.',
                retryable: false,
            ), $responseId, usage: $usage);
        }

        $choice = ToolContractGuard::objectArray($choices[0], 'OpenAI provider choice');
        $stopReason = is_string($choice['finish_reason'] ?? null) ? $choice['finish_reason'] : null;
        $message = ToolContractGuard::objectArray($choice['message'] ?? null, 'OpenAI provider assistant message');
        $content = is_string($message['content'] ?? null) ? trim($message['content']) : '';
        $refusal = is_string($message['refusal'] ?? null) ? trim($message['refusal']) : '';
        $visibleReasoning = is_string($message['reasoning_content'] ?? null)
            ? trim($message['reasoning_content'])
            : '';

        if ($refusal !== '') {
            return ProviderTurnResponse::refusal($refusal, $responseId, $stopReason, $usage);
        }
        if ($stopReason === 'content_filter') {
            return ProviderTurnResponse::refusal('The provider blocked this response.', $responseId, $stopReason, $usage);
        }
        if ($stopReason === 'length') {
            return ProviderTurnResponse::incomplete(
                $content !== '' ? $content : 'The provider response was truncated.',
                $responseId,
                $stopReason,
                $usage,
                $visibleReasoning !== '' ? $visibleReasoning : null,
            );
        }

        $rawToolCalls = $message['tool_calls'] ?? [];
        if (! is_array($rawToolCalls)) {
            throw new InvalidArgumentException('OpenAI provider tool_calls must be a list.');
        }
        if ($rawToolCalls !== []) {
            ToolContractGuard::listArray($rawToolCalls, 'OpenAI provider tool_calls');
            $toolCalls = [];
            foreach ($rawToolCalls as $index => $rawToolCall) {
                $rawToolCall = ToolContractGuard::objectArray($rawToolCall, sprintf('OpenAI provider tool call %d', $index));
                if (($rawToolCall['type'] ?? null) !== 'function') {
                    throw new InvalidArgumentException('OpenAI provider returned an unsupported tool-call type.');
                }
                $function = ToolContractGuard::objectArray($rawToolCall['function'] ?? null, sprintf('OpenAI provider tool call %d function', $index));
                $argumentsJson = ToolContractGuard::nonEmptyString($function['arguments'] ?? null, sprintf('OpenAI provider tool call %d arguments', $index), 262144);
                $arguments = json_decode($argumentsJson, false, flags: JSON_THROW_ON_ERROR);
                if (! $arguments instanceof \stdClass) {
                    throw new InvalidArgumentException(sprintf('OpenAI provider tool call %d arguments must be an object.', $index));
                }
                $toolCalls[] = ToolCall::fromJson(json_encode([
                    'schema_version' => ToolCall::SCHEMA_VERSION,
                    'provider_call_id' => ToolContractGuard::nonEmptyString($rawToolCall['id'] ?? null, sprintf('OpenAI provider tool call %d ID', $index), 256),
                    'name' => ToolContractGuard::nonEmptyString($function['name'] ?? null, sprintf('OpenAI provider tool call %d name', $index), 128),
                    'arguments' => $arguments,
                    'assistant_preamble' => $content !== '' ? $content : null,
                    'provider_metadata' => [
                        'adapter' => self::ADAPTER_VERSION,
                        'response_id' => $responseId,
                        'stop_reason' => $stopReason,
                        'index' => $index,
                    ],
                ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
            }

            $assistantMessage = [
                'role' => 'assistant',
                'content' => $message['content'] ?? null,
                'tool_calls' => array_values($rawToolCalls),
            ];
            if (is_string($message['reasoning_content'] ?? null)) {
                $assistantMessage['reasoning_content'] = $message['reasoning_content'];
            }
            $nativeState = [
                'model' => $requestPayload['model'],
                'messages' => $requestPayload['messages'],
                'assistant_message' => $assistantMessage,
            ];
            foreach ([
                'max_tokens',
                'temperature',
                'response_format',
                'reasoning_effort',
                'thinking',
                'tools',
                'tool_choice',
                'prompt_cache_key',
                'prompt_cache_options',
            ] as $field) {
                if (array_key_exists($field, $requestPayload)) {
                    $nativeState[$field] = $requestPayload[$field];
                }
            }
            $state = new ProviderTurnState(
                provider: $this->provider,
                adapterVersion: self::ADAPTER_VERSION,
                responseId: $responseId,
                continuationKind: 'chat_messages',
                nativeState: $nativeState,
                pendingToolCallIds: array_map(static fn (ToolCall $call): string => $call->providerCallId, $toolCalls),
            );

            return ProviderTurnResponse::toolCalls(
                $content !== '' ? $content : null,
                $toolCalls,
                $state,
                $responseId,
                $stopReason,
                $usage,
            );
        }

        if ($content === '') {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_RESPONSE_EMPTY',
                message: 'Provider response contained neither final text nor tool calls.',
                retryable: false,
            ), $responseId, $stopReason, $usage);
        }

        return ProviderTurnResponse::final(
            $content,
            $responseId,
            $stopReason,
            $usage,
            $visibleReasoning !== '' ? $visibleReasoning : null,
        );
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function withPromptCachePlan(array $payload, ?PromptCachePlan $plan, string $model): array
    {
        if ($plan === null || $plan->mode === PromptCachePlan::MODE_PROVIDER_DEFAULT) {
            return $payload;
        }
        if ($this->provider !== 'openai') {
            throw new InvalidArgumentException('This OpenAI-compatible provider only supports provider-default prompt caching.');
        }

        $model = $this->normalizedModel($model);
        if ($this->isGpt56Model($model)) {
            return $this->withGpt56PromptCachePlan($payload, $plan);
        }
        if (! $this->isDocumentedAutomaticOpenAiModel($model)
            || $plan->mode !== PromptCachePlan::MODE_AUTOMATIC
            || $plan->breakpoints !== []
            || $plan->ttl !== null) {
            throw new InvalidArgumentException('The selected OpenAI model does not support this prompt-cache policy.');
        }

        $payload['prompt_cache_key'] = $plan->keyHash;

        return $payload;
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function withGpt56PromptCachePlan(array $payload, PromptCachePlan $plan): array
    {
        if ($plan->mode === PromptCachePlan::MODE_DISABLED) {
            $payload['prompt_cache_options'] = ['mode' => 'explicit'];

            return $payload;
        }
        if (! in_array($plan->mode, [PromptCachePlan::MODE_AUTOMATIC, PromptCachePlan::MODE_EXPLICIT], true)
            || ($plan->ttl !== null && $plan->ttl !== PromptCachePlan::TTL_30_MINUTES)
            || ($plan->mode === PromptCachePlan::MODE_AUTOMATIC && count($plan->breakpoints) > 3)) {
            throw new InvalidArgumentException('GPT-5.6 prompt-cache policy is invalid.');
        }

        $payload['prompt_cache_key'] = $plan->keyHash;
        $payload['prompt_cache_options'] = [
            'mode' => $plan->mode === PromptCachePlan::MODE_AUTOMATIC ? 'implicit' : 'explicit',
        ];
        if ($plan->ttl !== null) {
            $payload['prompt_cache_options']['ttl'] = $plan->ttl;
        }

        foreach ($plan->breakpoints as $breakpoint) {
            if ($breakpoint === PromptCachePlan::BREAKPOINT_TOOLS) {
                throw new InvalidArgumentException('OpenAI Chat cache breakpoints cannot target tool definitions.');
            }
            if ($breakpoint === PromptCachePlan::BREAKPOINT_SYSTEM) {
                $payload['messages'][0]['content'] = $this->cacheableContent(
                    $payload['messages'][0]['content'] ?? null,
                    'OpenAI Chat system cache breakpoint',
                    'text',
                );
                continue;
            }

            $messageIndex = (int) substr($breakpoint, strlen('message:'));
            $wireIndex = $messageIndex + 1;
            if (! array_key_exists($wireIndex, $payload['messages'])) {
                throw new InvalidArgumentException('OpenAI Chat cache breakpoint references an unknown message.');
            }
            $payload['messages'][$wireIndex]['content'] = $this->cacheableContent(
                $payload['messages'][$wireIndex]['content'] ?? null,
                'OpenAI Chat message cache breakpoint',
                'text',
            );
        }

        return $payload;
    }

    /** @return list<array<string, mixed>> */
    private function cacheableContent(mixed $content, string $label, string $textType): array
    {
        if (is_string($content)) {
            $blocks = [['type' => $textType, 'text' => $content]];
        } else {
            $blocks = ToolContractGuard::listArray($content, $label);
        }
        if ($blocks === []) {
            throw new InvalidArgumentException("{$label} requires at least one content block.");
        }

        $last = array_key_last($blocks);
        $block = ToolContractGuard::objectArray($blocks[$last], $label.' content block');
        if (! in_array($block['type'] ?? null, ['text', 'image_url', 'input_audio', 'file', 'refusal'], true)) {
            throw new InvalidArgumentException("{$label} targets an unsupported content block.");
        }
        $block['prompt_cache_breakpoint'] = ['mode' => 'explicit'];
        $blocks[$last] = $block;

        return $blocks;
    }

    private function normalizedModel(string $model): string
    {
        $model = strtolower(trim($model));
        $model = str_replace(['.', '_'], '-', $model);

        return preg_replace('/-+/', '-', $model) ?? $model;
    }

    private function isGpt56Model(string $model): bool
    {
        return preg_match('/^gpt-5-6(?:$|-)/', $model) === 1;
    }

    private function isDocumentedAutomaticOpenAiModel(string $model): bool
    {
        return preg_match('/^(?:gpt-4o|gpt-4-1|o1|o3|o4)(?:$|-)/', $model) === 1
            || $model === 'gpt-5'
            || preg_match('/^gpt-5-[0-5](?:$|-)/', $model) === 1;
    }

    /** @return array<string, mixed> */
    private function providerTool(ToolDefinition $tool): array
    {
        $wireDefinition = $tool->toWireArray();

        return [
            'type' => 'function',
            'function' => [
                'name' => $tool->name,
                'description' => $tool->description,
                'parameters' => $wireDefinition['inputSchema'],
            ],
        ];
    }
}
