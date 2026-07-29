<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Closure;
use InvalidArgumentException;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolContractGuard;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;
use Throwable;

final class AnthropicMessagesTurnAdapter implements StreamingProviderTurnAdapter
{
    public const ADAPTER_VERSION = 'anthropic_messages_v1';

    private const SUPPORTED_IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    public function __construct(
        private readonly string $endpoint,
        private readonly string $apiKey,
        private readonly ProviderTransport $transport,
        private readonly int $timeoutMs = 30000,
        private readonly string $anthropicVersion = '2023-06-01',
    ) {
        ToolContractGuard::nonEmptyString($apiKey, 'Anthropic API key', 8192);
        ToolContractGuard::nonEmptyString($anthropicVersion, 'Anthropic API version', 32);
        if ($timeoutMs < 1) {
            throw new InvalidArgumentException('Anthropic timeout must be positive.');
        }
        $parts = parse_url($endpoint);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || trim((string) ($parts['host'] ?? '')) === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new InvalidArgumentException('Anthropic endpoint must be a credential-free HTTPS URL.');
        }
    }

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities(
            provider: 'anthropic',
            adapterVersion: self::ADAPTER_VERSION,
            nativeTools: true,
            parallelToolCalls: false,
            strictSchemas: false,
            statefulContinuation: false,
            reasoningContinuationState: false,
            imageToolResults: false,
            source: 'adapter_contract',
            limitations: ['Model-level capabilities still require a successful probe.'],
            nativeInputImages: true,
            nativeInputDocuments: true,
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
        if (strtolower($request->provider) !== 'anthropic') {
            throw new InvalidArgumentException('Anthropic request requires the anthropic provider.');
        }
        $messages = $request->resources === []
            ? $request->messages
            : $this->messagesWithResources($request);
        $payload = [
            'model' => $request->model,
            'system' => $request->systemPrompt,
            'messages' => $messages,
            'max_tokens' => $request->maxTokens ?? 4096,
        ];
        $reasoning = ReasoningEffortMap::paramsFor(
            ReasoningEffortMap::TARGET_ANTHROPIC,
            $request->reasoningEffort,
            $request->reasoningVisible ?? false,
            $request->maxTokens,
        );
        if ($reasoning !== []) {
            // Extended thinking requires temperature to be unset — Anthropic rejects a
            // custom temperature together with a thinking block, so the reasoning budget
            // takes its place.
            foreach ($reasoning as $reasoningKey => $reasoningValue) {
                $payload[$reasoningKey] = $reasoningValue;
            }
        } elseif ($request->temperature !== null) {
            $payload['temperature'] = $request->temperature;
        }
        if ($request->tools !== []) {
            $payload['tools'] = array_map($this->providerTool(...), $request->tools);
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
            if ($resource->isImage()) {
                if (! in_array($resource->mediaType, self::SUPPORTED_IMAGE_MEDIA_TYPES, true)) {
                    throw new InvalidArgumentException('Anthropic Messages does not support this image media type.');
                }
                $content[] = [
                    'type' => 'image',
                    'source' => [
                        'type' => 'base64',
                        'media_type' => $resource->mediaType,
                        'data' => $resource->base64Data(),
                    ],
                ];
                continue;
            }
            if ($resource->mediaType !== 'application/pdf') {
                throw new InvalidArgumentException('Anthropic native documents must be PDF.');
            }
            $content[] = [
                'type' => 'document',
                'source' => [
                    'type' => 'base64',
                    'media_type' => 'application/pdf',
                    'data' => $resource->base64Data(),
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
        if ($state->provider !== 'anthropic') {
            throw new InvalidArgumentException('Anthropic state belongs to another provider.');
        }
        $results = $this->correlatedResults($state, $toolResults);
        $native = $state->nativeStateFor(self::ADAPTER_VERSION);
        $messages = ToolContractGuard::listArray($native['messages'] ?? null, 'Anthropic continuation messages');
        $assistantContent = ToolContractGuard::listArray($native['assistant_content'] ?? null, 'Anthropic continuation assistant content');
        $messages[] = ['role' => 'assistant', 'content' => $assistantContent];
        $toolResultBlocks = [];
        foreach ($state->pendingToolCallIds as $callId) {
            $result = $results[$callId];
            $toolResultBlocks[] = [
                'type' => 'tool_result',
                'tool_use_id' => $callId,
                'content' => [[
                    'type' => 'text',
                    'text' => json_encode($result->toRedactedArray(), JSON_THROW_ON_ERROR),
                ]],
                'is_error' => $result->isError,
            ];
        }
        $messages[] = ['role' => 'user', 'content' => $toolResultBlocks];

        $payload = [
            'model' => ToolContractGuard::nonEmptyString($native['model'] ?? null, 'Anthropic continuation model', 256),
            'system' => $this->continuationSystem($native['system'] ?? null),
            'messages' => $messages,
            'max_tokens' => is_int($native['max_tokens'] ?? null) ? $native['max_tokens'] : 4096,
        ];
        foreach (['temperature', 'thinking', 'tools', 'cache_control'] as $field) {
            if (array_key_exists($field, $native)) {
                $payload[$field] = $native[$field];
            }
        }

        return $payload;
    }

    /** @param array<string, mixed> $payload */
    private function perform(array $payload): ProviderTurnResponse
    {
        try {
            $response = $this->transport->send(
                $this->endpoint,
                $payload,
                ['Content-Type: application/json', 'x-api-key: '.$this->apiKey, 'anthropic-version: '.$this->anthropicVersion],
                $this->timeoutMs,
            );
            if (! is_array($response)) {
                throw new InvalidArgumentException('Anthropic transport returned a non-object response.');
            }

            return $this->normalize($response, $payload);
        } catch (ProviderRequestException $exception) {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_HTTP_ERROR',
                message: sprintf('Provider request failed with HTTP %d.', $exception->status),
                retryable: $exception->status === 429 || $exception->status >= 500,
                httpStatus: $exception->status,
                details: ToolContractGuard::redact(['provider_response' => $exception->responseBody]),
            ));
        } catch (Throwable $exception) {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_PROTOCOL_ERROR',
                message: 'Provider response did not satisfy the Anthropic adapter contract.',
                retryable: false,
                details: ToolContractGuard::redact(['transport_error' => $exception->getMessage()]),
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
            throw new InvalidArgumentException('Configured Anthropic transport does not support streaming.');
        }
        $streamPayload = [...$payload, 'stream' => true];

        return new ProviderStream(
            $this->transport->stream(
                $this->endpoint,
                $streamPayload,
                [
                    'Content-Type: application/json',
                    'Accept: text/event-stream',
                    'x-api-key: '.$this->apiKey,
                    'anthropic-version: '.$this->anthropicVersion,
                ],
                $this->timeoutMs,
                $isCancelled,
            ),
            new AnthropicMessagesStreamDecoder($finalizer),
        );
    }

    /** @param array<string, mixed> $response @param array<string, mixed> $requestPayload */
    private function normalize(array $response, array $requestPayload): ProviderTurnResponse
    {
        $responseId = is_string($response['id'] ?? null) ? $response['id'] : null;
        $stopReason = is_string($response['stop_reason'] ?? null) ? $response['stop_reason'] : null;
        $usage = TokenUsage::fromAnthropic(is_array($response['usage'] ?? null) ? $response['usage'] : []);
        $content = ToolContractGuard::listArray($response['content'] ?? null, 'Anthropic response content');
        $texts = [];
        $thinking = [];
        $toolCalls = [];
        foreach ($content as $index => $block) {
            $block = ToolContractGuard::objectArray($block, sprintf('Anthropic content block %d', $index));
            if (($block['type'] ?? null) === 'text') {
                $texts[] = ToolContractGuard::nonEmptyString($block['text'] ?? null, sprintf('Anthropic text block %d', $index), 262144);
                continue;
            }
            if (($block['type'] ?? null) === 'thinking') {
                $thinking[] = ToolContractGuard::nonEmptyString($block['thinking'] ?? null, sprintf('Anthropic thinking block %d', $index), 262144);
                continue;
            }
            if (($block['type'] ?? null) !== 'tool_use') {
                continue;
            }
            $toolCalls[] = ToolCall::fromArray([
                'schema_version' => ToolCall::SCHEMA_VERSION,
                'provider_call_id' => ToolContractGuard::nonEmptyString($block['id'] ?? null, sprintf('Anthropic tool_use %d ID', $index), 256),
                'name' => ToolContractGuard::nonEmptyString($block['name'] ?? null, sprintf('Anthropic tool_use %d name', $index), 128),
                'arguments' => ToolContractGuard::objectArray($block['input'] ?? null, sprintf('Anthropic tool_use %d input', $index)),
                'assistant_preamble' => null,
                'provider_metadata' => [
                    'adapter' => self::ADAPTER_VERSION,
                    'response_id' => $responseId,
                    'stop_reason' => $stopReason,
                    'index' => $index,
                ],
            ]);
        }
        $text = trim(implode("\n", $texts));
        $visibleReasoning = trim(implode("\n", $thinking));
        if ($stopReason === 'refusal') {
            return ProviderTurnResponse::refusal($text !== '' ? $text : 'The provider refused this request.', $responseId, $stopReason, $usage);
        }
        if ($stopReason === 'max_tokens') {
            return ProviderTurnResponse::incomplete($text !== '' ? $text : 'The provider response was truncated.', $responseId, $stopReason, $usage);
        }
        if ($toolCalls !== []) {
            $toolCalls = array_map(
                static fn (ToolCall $call): ToolCall => ToolCall::fromArray([
                    ...$call->toArray(),
                    'assistant_preamble' => $text !== '' ? $text : null,
                ]),
                $toolCalls,
            );
            $native = [
                'model' => $requestPayload['model'],
                'system' => $requestPayload['system'],
                'messages' => $requestPayload['messages'],
                'assistant_content' => $content,
                'max_tokens' => $requestPayload['max_tokens'],
            ];
            foreach (['temperature', 'thinking', 'tools', 'cache_control'] as $field) {
                if (array_key_exists($field, $requestPayload)) {
                    $native[$field] = $requestPayload[$field];
                }
            }
            $state = new ProviderTurnState(
                provider: 'anthropic',
                adapterVersion: self::ADAPTER_VERSION,
                responseId: $responseId,
                continuationKind: 'ordered_content_blocks',
                nativeState: $native,
                pendingToolCallIds: array_map(static fn (ToolCall $call): string => $call->providerCallId, $toolCalls),
            );

            return ProviderTurnResponse::toolCalls($text !== '' ? $text : null, $toolCalls, $state, $responseId, $stopReason, $usage);
        }
        if ($text === '') {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_RESPONSE_EMPTY',
                message: 'Anthropic response contained neither final text nor tool calls.',
                retryable: false,
            ), $responseId, $stopReason, $usage);
        }

        return ProviderTurnResponse::final(
            $text,
            $responseId,
            $stopReason,
            $usage,
            $visibleReasoning !== '' ? $visibleReasoning : null,
        );
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function withPromptCachePlan(array $payload, ?PromptCachePlan $plan, string $model): array
    {
        if ($plan === null
            || $plan->mode === PromptCachePlan::MODE_PROVIDER_DEFAULT
            || $plan->mode === PromptCachePlan::MODE_DISABLED) {
            return $payload;
        }
        if (! $this->supportsManagedPromptCache($model)
            || ! in_array($plan->mode, [PromptCachePlan::MODE_AUTOMATIC, PromptCachePlan::MODE_EXPLICIT], true)
            || ($plan->ttl !== null
                && ! in_array($plan->ttl, [PromptCachePlan::TTL_5_MINUTES, PromptCachePlan::TTL_1_HOUR], true))
            || ($plan->mode === PromptCachePlan::MODE_AUTOMATIC && count($plan->breakpoints) > 3)) {
            throw new InvalidArgumentException('The selected Anthropic model does not support this prompt-cache policy.');
        }

        $cacheControl = $this->cacheControl($plan->ttl);
        if ($plan->mode === PromptCachePlan::MODE_AUTOMATIC) {
            $payload['cache_control'] = $cacheControl;
        }

        foreach ($plan->breakpoints as $breakpoint) {
            if ($breakpoint === PromptCachePlan::BREAKPOINT_TOOLS) {
                if (! isset($payload['tools']) || $payload['tools'] === []) {
                    throw new InvalidArgumentException('Anthropic tool cache breakpoint requires at least one tool.');
                }
                $last = array_key_last($payload['tools']);
                $payload['tools'][$last]['cache_control'] = $cacheControl;
                continue;
            }
            if ($breakpoint === PromptCachePlan::BREAKPOINT_SYSTEM) {
                $payload['system'] = $this->cacheableContent(
                    $payload['system'] ?? null,
                    $cacheControl,
                    'Anthropic system cache breakpoint',
                );
                continue;
            }

            $messageIndex = (int) substr($breakpoint, strlen('message:'));
            if (! array_key_exists($messageIndex, $payload['messages'])) {
                throw new InvalidArgumentException('Anthropic cache breakpoint references an unknown message.');
            }
            $payload['messages'][$messageIndex]['content'] = $this->cacheableContent(
                $payload['messages'][$messageIndex]['content'] ?? null,
                $cacheControl,
                'Anthropic message cache breakpoint',
            );
        }

        return $payload;
    }

    /** @return array{type: string, ttl?: string} */
    private function cacheControl(?string $ttl): array
    {
        if ($ttl === null || $ttl === PromptCachePlan::TTL_5_MINUTES) {
            return ['type' => 'ephemeral'];
        }
        if ($ttl === PromptCachePlan::TTL_1_HOUR) {
            return ['type' => 'ephemeral', 'ttl' => '1h'];
        }

        throw new InvalidArgumentException('Anthropic cache TTL is unsupported.');
    }

    /**
     * @param array{type: string, ttl?: string} $cacheControl
     * @return list<array<string, mixed>>
     */
    private function cacheableContent(mixed $content, array $cacheControl, string $label): array
    {
        if (is_string($content)) {
            $blocks = [['type' => 'text', 'text' => $content]];
        } else {
            $blocks = ToolContractGuard::listArray($content, $label);
        }
        if ($blocks === []) {
            throw new InvalidArgumentException("{$label} requires at least one content block.");
        }

        $last = array_key_last($blocks);
        $block = ToolContractGuard::objectArray($blocks[$last], $label.' content block');
        if (($block['type'] ?? null) === 'thinking') {
            throw new InvalidArgumentException("{$label} cannot target an Anthropic thinking block.");
        }
        $block['cache_control'] = $cacheControl;
        $blocks[$last] = $block;

        return $blocks;
    }

    /** @return string|list<array<string, mixed>> */
    private function continuationSystem(mixed $system): string|array
    {
        if (is_string($system)) {
            return ToolContractGuard::nonEmptyString($system, 'Anthropic continuation system prompt', 65536);
        }

        $blocks = ToolContractGuard::listArray($system, 'Anthropic continuation system blocks');
        if ($blocks === []) {
            throw new InvalidArgumentException('Anthropic continuation system blocks must not be empty.');
        }
        foreach ($blocks as $index => $value) {
            $block = ToolContractGuard::objectArray($value, sprintf('Anthropic continuation system block %d', $index));
            ToolContractGuard::exactKeys(
                $block,
                ['type', 'text'],
                ['cache_control'],
                sprintf('Anthropic continuation system block %d', $index),
            );
            if (($block['type'] ?? null) !== 'text') {
                throw new InvalidArgumentException('Anthropic continuation system blocks must be text.');
            }
            ToolContractGuard::nonEmptyString(
                $block['text'],
                sprintf('Anthropic continuation system block %d text', $index),
                65536,
            );
            if (array_key_exists('cache_control', $block)) {
                $this->validateCacheControl($block['cache_control'], sprintf('Anthropic continuation system block %d cache control', $index));
            }
        }

        return $blocks;
    }

    private function validateCacheControl(mixed $value, string $label): void
    {
        $cacheControl = ToolContractGuard::objectArray($value, $label);
        ToolContractGuard::exactKeys($cacheControl, ['type'], ['ttl'], $label);
        if (($cacheControl['type'] ?? null) !== 'ephemeral'
            || (array_key_exists('ttl', $cacheControl) && $cacheControl['ttl'] !== '1h')) {
            throw new InvalidArgumentException("{$label} is unsupported.");
        }
    }

    private function supportsManagedPromptCache(string $model): bool
    {
        $model = strtolower(trim($model));
        $model = str_replace(['.', '_'], '-', $model);
        $model = preg_replace('/-+/', '-', $model) ?? $model;

        foreach ([
            'claude-opus-5',
            'claude-fable-5',
            'claude-mythos-5',
            'claude-mythos-preview',
            'claude-opus-4-8',
            'claude-opus-4-7',
            'claude-opus-4-6',
            'claude-opus-4-5',
            'claude-haiku-4-5',
            'claude-sonnet-5',
            'claude-sonnet-4-6',
            'claude-sonnet-4-5',
            'claude-opus-4-1',
        ] as $supported) {
            if (str_starts_with($model, $supported)) {
                return true;
            }
        }

        return false;
    }

    /** @param list<ToolResult> $toolResults @return array<string, ToolResult> */
    private function correlatedResults(ProviderTurnState $state, array $toolResults): array
    {
        ToolContractGuard::listArray($toolResults, 'Anthropic continuation tool results');
        $results = [];
        foreach ($toolResults as $result) {
            if (! $result instanceof ToolResult || isset($results[$result->toolUseId])) {
                throw new InvalidArgumentException('Anthropic continuation requires unique ToolResult values.');
            }
            $results[$result->toolUseId] = $result;
        }
        if (array_keys($results) !== $state->pendingToolCallIds) {
            throw new InvalidArgumentException('Anthropic continuation results must match pending tool_use IDs in order.');
        }

        return $results;
    }

    /** @return array<string, mixed> */
    private function providerTool(ToolDefinition $tool): array
    {
        $wireDefinition = $tool->toWireArray();

        return [
            'name' => $tool->name,
            'description' => $tool->description,
            'input_schema' => $wireDefinition['inputSchema'],
        ];
    }
}
