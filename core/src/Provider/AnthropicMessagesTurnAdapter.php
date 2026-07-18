<?php

declare(strict_types=1);

namespace Kadmos\Provider;

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

final class AnthropicMessagesTurnAdapter implements ProviderTurnAdapter
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
        if ($request->temperature !== null) {
            $payload['temperature'] = $request->temperature;
        }
        if ($request->tools !== []) {
            $payload['tools'] = array_map($this->providerTool(...), $request->tools);
        }

        return $this->withoutResourceContinuation($this->perform($payload), $request->resources !== []);
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
            'system' => ToolContractGuard::nonEmptyString($native['system'] ?? null, 'Anthropic continuation system prompt', 65536),
            'messages' => $messages,
            'max_tokens' => is_int($native['max_tokens'] ?? null) ? $native['max_tokens'] : 4096,
        ];
        foreach (['temperature', 'tools'] as $field) {
            if (array_key_exists($field, $native)) {
                $payload[$field] = $native[$field];
            }
        }

        return $this->perform($payload);
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

    /** @param array<string, mixed> $response @param array<string, mixed> $requestPayload */
    private function normalize(array $response, array $requestPayload): ProviderTurnResponse
    {
        $responseId = is_string($response['id'] ?? null) ? $response['id'] : null;
        $stopReason = is_string($response['stop_reason'] ?? null) ? $response['stop_reason'] : null;
        $usage = TokenUsage::fromAnthropic(is_array($response['usage'] ?? null) ? $response['usage'] : []);
        $content = ToolContractGuard::listArray($response['content'] ?? null, 'Anthropic response content');
        $texts = [];
        $toolCalls = [];
        foreach ($content as $index => $block) {
            $block = ToolContractGuard::objectArray($block, sprintf('Anthropic content block %d', $index));
            if (($block['type'] ?? null) === 'text') {
                $texts[] = ToolContractGuard::nonEmptyString($block['text'] ?? null, sprintf('Anthropic text block %d', $index), 262144);
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
            foreach (['temperature', 'tools'] as $field) {
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

        return ProviderTurnResponse::final($text, $responseId, $stopReason, $usage);
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
