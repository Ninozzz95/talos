<?php

declare(strict_types=1);

namespace Kadmos\Provider;

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

final class OpenAiChatTurnAdapter implements ProviderTurnAdapter
{
    public const ADAPTER_VERSION = 'openai_chat_v1';

    public function __construct(
        private readonly string $provider,
        private readonly string $endpoint,
        private readonly string $apiKey,
        private readonly ProviderTransport $transport,
        private readonly int $timeoutMs = 30000,
    ) {
        ToolContractGuard::nonEmptyString($provider, 'OpenAI-compatible provider', 64);
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
        );
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        if (strtolower($request->provider) !== strtolower($this->provider)) {
            throw new InvalidArgumentException('Provider turn request does not match the configured adapter.');
        }

        $messages = [['role' => 'system', 'content' => $request->systemPrompt], ...$request->messages];
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
        if ($request->tools !== []) {
            $payload['tools'] = array_map($this->providerTool(...), $request->tools);
            $payload['tool_choice'] = 'auto';
        }

        return $this->perform($payload);
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
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
                'content' => json_encode($result->toRedactedArray(), JSON_THROW_ON_ERROR),
            ];
        }

        $payload = [
            'model' => ToolContractGuard::nonEmptyString($native['model'] ?? null, 'OpenAI continuation model', 256),
            'messages' => $messages,
        ];
        foreach (['max_tokens', 'temperature', 'tools', 'tool_choice'] as $field) {
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
                $arguments = json_decode($argumentsJson, true, flags: JSON_THROW_ON_ERROR);
                $arguments = ToolContractGuard::objectArray($arguments, sprintf('OpenAI provider tool call %d arguments', $index));
                $toolCalls[] = ToolCall::fromArray([
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
                ]);
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
            foreach (['max_tokens', 'temperature', 'tools', 'tool_choice'] as $field) {
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

        return ProviderTurnResponse::final($content, $responseId, $stopReason, $usage);
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
