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

final class OpenAiResponsesTurnAdapter implements ProviderTurnAdapter
{
    public const ADAPTER_VERSION = 'openai_responses_v1';

    public function __construct(
        private readonly string $endpoint,
        private readonly string $apiKey,
        private readonly ProviderTransport $transport,
        private readonly int $timeoutMs = 30000,
    ) {
        ToolContractGuard::nonEmptyString($apiKey, 'OpenAI Responses API key', 8192);
        if ($timeoutMs < 1) {
            throw new InvalidArgumentException('OpenAI Responses timeout must be positive.');
        }
        $parts = parse_url($endpoint);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || trim((string) ($parts['host'] ?? '')) === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new InvalidArgumentException('OpenAI Responses endpoint must be a credential-free HTTPS URL.');
        }
    }

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities(
            provider: 'openai',
            adapterVersion: self::ADAPTER_VERSION,
            nativeTools: true,
            parallelToolCalls: false,
            strictSchemas: false,
            statefulContinuation: true,
            reasoningContinuationState: false,
            imageToolResults: true,
            source: 'adapter_contract',
            limitations: ['Model-level capabilities still require a successful probe.'],
            nativeInputImages: true,
            nativeInputDocuments: true,
        );
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        if (strtolower($request->provider) !== 'openai') {
            throw new InvalidArgumentException('OpenAI Responses request requires the openai provider.');
        }
        $input = $request->resources === []
            ? $request->messages
            : $this->messagesWithResources($request);
        $payload = [
            'model' => $request->model,
            'instructions' => $request->systemPrompt,
            'input' => $input,
        ];
        if ($request->maxTokens !== null) {
            $payload['max_output_tokens'] = $request->maxTokens;
        }
        if ($request->temperature !== null) {
            $payload['temperature'] = $request->temperature;
        }
        foreach (ReasoningEffortMap::paramsFor(
            ReasoningEffortMap::TARGET_OPENAI_RESPONSES,
            $request->reasoningEffort,
            $request->reasoningVisible ?? false,
            $request->maxTokens,
        ) as $reasoningKey => $reasoningValue) {
            $payload[$reasoningKey] = $reasoningValue;
        }
        if ($request->tools !== []) {
            $payload['tools'] = array_map($this->providerTool(...), $request->tools);
            $payload['tool_choice'] = 'auto';
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
            OpenAiInputResourcePolicy::assertSupported($resource, 'OpenAI Responses');
            if ($resource->isImage()) {
                $content[] = ['type' => 'input_image', 'image_url' => $resource->dataUri()];
                continue;
            }
            $content[] = [
                'type' => 'input_file',
                'filename' => $resource->filename,
                'file_data' => $resource->dataUri(),
            ];
        }
        $content[] = ['type' => 'input_text', 'text' => $messages[$last]['content']];
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
        if ($state->provider !== 'openai') {
            throw new InvalidArgumentException('OpenAI Responses state belongs to another provider.');
        }
        $resultsById = $this->correlatedResults($state, $toolResults);
        $native = $state->nativeStateFor(self::ADAPTER_VERSION);
        $responseId = ToolContractGuard::nonEmptyString($native['previous_response_id'] ?? null, 'Responses previous response ID', 256);
        $payload = [
            'model' => ToolContractGuard::nonEmptyString($native['model'] ?? null, 'Responses continuation model', 256),
            'previous_response_id' => $responseId,
            'instructions' => ToolContractGuard::nonEmptyString($native['instructions'] ?? null, 'Responses continuation instructions', 65536),
            'input' => array_map(
                static fn (string $callId): array => [
                    'type' => 'function_call_output',
                    'call_id' => $callId,
                    'output' => json_encode($resultsById[$callId]->toRedactedArray(), JSON_THROW_ON_ERROR),
                ],
                $state->pendingToolCallIds,
            ),
        ];
        foreach (['max_output_tokens', 'temperature', 'reasoning', 'tools', 'tool_choice'] as $field) {
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
                ['Content-Type: application/json', 'Authorization: Bearer '.$this->apiKey],
                $this->timeoutMs,
            );
            if (! is_array($response)) {
                throw new InvalidArgumentException('OpenAI Responses transport returned a non-object response.');
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
                code: $exception instanceof JsonException ? 'PROVIDER_PROTOCOL_INVALID_JSON' : 'PROVIDER_PROTOCOL_ERROR',
                message: 'Provider response did not satisfy the Responses adapter contract.',
                retryable: false,
                details: ToolContractGuard::redact(['transport_error' => $exception->getMessage()]),
            ));
        }
    }

    /** @param array<string, mixed> $response @param array<string, mixed> $requestPayload */
    private function normalize(array $response, array $requestPayload): ProviderTurnResponse
    {
        $responseId = is_string($response['id'] ?? null) ? $response['id'] : null;
        $usage = TokenUsage::fromOpenAiResponses(is_array($response['usage'] ?? null) ? $response['usage'] : []);
        $status = is_string($response['status'] ?? null) ? $response['status'] : null;
        if ($status === 'incomplete') {
            $reason = is_string($response['incomplete_details']['reason'] ?? null)
                ? $response['incomplete_details']['reason']
                : 'unknown';

            return ProviderTurnResponse::incomplete('The provider response is incomplete: '.$reason.'.', $responseId, $reason, $usage);
        }
        if (in_array($status, ['failed', 'cancelled'], true)) {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_RESPONSE_'.strtoupper($status),
                message: 'The provider did not complete the response.',
                retryable: $status === 'failed',
            ), $responseId, $status, $usage);
        }

        $output = ToolContractGuard::listArray($response['output'] ?? null, 'Responses output');
        $texts = [];
        $refusals = [];
        $toolCalls = [];
        foreach ($output as $index => $item) {
            $item = ToolContractGuard::objectArray($item, sprintf('Responses output item %d', $index));
            $type = $item['type'] ?? null;
            if ($type === 'message') {
                foreach (ToolContractGuard::listArray($item['content'] ?? null, sprintf('Responses message %d content', $index)) as $block) {
                    $block = ToolContractGuard::objectArray($block, sprintf('Responses message %d content block', $index));
                    if (($block['type'] ?? null) === 'output_text' && is_string($block['text'] ?? null)) {
                        $texts[] = trim($block['text']);
                    } elseif (($block['type'] ?? null) === 'refusal' && is_string($block['refusal'] ?? null)) {
                        $refusals[] = trim($block['refusal']);
                    }
                }
                continue;
            }
            if ($type !== 'function_call') {
                continue;
            }

            $argumentsJson = ToolContractGuard::nonEmptyString($item['arguments'] ?? null, sprintf('Responses function call %d arguments', $index), 262144);
            $arguments = json_decode($argumentsJson, false, flags: JSON_THROW_ON_ERROR);
            if (! $arguments instanceof \stdClass) {
                throw new InvalidArgumentException(sprintf('Responses function call %d arguments must be an object.', $index));
            }
            $toolCalls[] = ToolCall::fromJson(json_encode([
                'schema_version' => ToolCall::SCHEMA_VERSION,
                'provider_call_id' => ToolContractGuard::nonEmptyString($item['call_id'] ?? null, sprintf('Responses function call %d call ID', $index), 256),
                'name' => ToolContractGuard::nonEmptyString($item['name'] ?? null, sprintf('Responses function call %d name', $index), 128),
                'arguments' => $arguments,
                'assistant_preamble' => null,
                'provider_metadata' => [
                    'adapter' => self::ADAPTER_VERSION,
                    'response_id' => $responseId,
                    'stop_reason' => $status,
                    'item_id' => is_string($item['id'] ?? null) ? $item['id'] : null,
                    'index' => $index,
                ],
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        }

        $text = trim(implode("\n", array_filter($texts, static fn (string $value): bool => $value !== '')));
        $refusal = trim(implode("\n", array_filter($refusals, static fn (string $value): bool => $value !== '')));
        if ($refusal !== '') {
            return ProviderTurnResponse::refusal($refusal, $responseId, $status, $usage);
        }
        if ($toolCalls !== []) {
            if ($responseId === null || $responseId === '') {
                throw new InvalidArgumentException('Responses tool calls require a response ID for continuation.');
            }
            $toolCalls = array_map(
                static fn (ToolCall $call): ToolCall => ToolCall::fromArray([
                    ...$call->toArray(),
                    'assistant_preamble' => $text !== '' ? $text : null,
                ]),
                $toolCalls,
            );
            $native = [
                'model' => $requestPayload['model'],
                'previous_response_id' => $responseId,
                'instructions' => $requestPayload['instructions'],
            ];
            foreach (['max_output_tokens', 'temperature', 'reasoning', 'tools', 'tool_choice'] as $field) {
                if (array_key_exists($field, $requestPayload)) {
                    $native[$field] = $requestPayload[$field];
                }
            }
            $state = new ProviderTurnState(
                provider: 'openai',
                adapterVersion: self::ADAPTER_VERSION,
                responseId: $responseId,
                continuationKind: 'previous_response_id',
                nativeState: $native,
                pendingToolCallIds: array_map(static fn (ToolCall $call): string => $call->providerCallId, $toolCalls),
            );

            return ProviderTurnResponse::toolCalls($text !== '' ? $text : null, $toolCalls, $state, $responseId, $status, $usage);
        }
        if ($text === '') {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_RESPONSE_EMPTY',
                message: 'Responses output contained neither final text nor function calls.',
                retryable: false,
            ), $responseId, $status, $usage);
        }

        return ProviderTurnResponse::final($text, $responseId, $status, $usage);
    }

    /** @param list<ToolResult> $toolResults @return array<string, ToolResult> */
    private function correlatedResults(ProviderTurnState $state, array $toolResults): array
    {
        ToolContractGuard::listArray($toolResults, 'Responses continuation tool results');
        $results = [];
        foreach ($toolResults as $result) {
            if (! $result instanceof ToolResult || isset($results[$result->toolUseId])) {
                throw new InvalidArgumentException('Responses continuation requires unique ToolResult values.');
            }
            $results[$result->toolUseId] = $result;
        }
        if (array_keys($results) !== $state->pendingToolCallIds) {
            throw new InvalidArgumentException('Responses continuation results must match pending call IDs in order.');
        }

        return $results;
    }

    /** @return array<string, mixed> */
    private function providerTool(ToolDefinition $tool): array
    {
        $wireDefinition = $tool->toWireArray();

        return [
            'type' => 'function',
            'name' => $tool->name,
            'description' => $tool->description,
            'parameters' => $wireDefinition['inputSchema'],
            'strict' => true,
        ];
    }
}
