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

final class GeminiTurnAdapter implements StreamingProviderTurnAdapter
{
    public const ADAPTER_VERSION = 'gemini_generate_content_v1beta';

    private const SUPPORTED_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

    public function __construct(
        private readonly string $endpoint,
        private readonly string $apiKey,
        private readonly ProviderTransport $transport,
        private readonly int $timeoutMs = 30000,
    ) {
        ToolContractGuard::nonEmptyString($apiKey, 'Gemini API key', 8192);
        if ($timeoutMs < 1) {
            throw new InvalidArgumentException('Gemini timeout must be positive.');
        }
        $parts = parse_url($endpoint);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || trim((string) ($parts['host'] ?? '')) === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new InvalidArgumentException('Gemini endpoint must be a credential-free HTTPS URL.');
        }
    }

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities(
            provider: 'gemini',
            adapterVersion: self::ADAPTER_VERSION,
            nativeTools: true,
            parallelToolCalls: false,
            strictSchemas: false,
            statefulContinuation: false,
            reasoningContinuationState: true,
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
        if (strtolower($request->provider) !== 'gemini') {
            throw new InvalidArgumentException('Gemini request requires the gemini provider.');
        }
        if ($request->promptCachePlan !== null
            && $request->promptCachePlan->mode !== PromptCachePlan::MODE_PROVIDER_DEFAULT) {
            throw new InvalidArgumentException('Gemini generateContent only supports provider-default implicit prompt caching.');
        }
        $contents = array_map(
            static fn (array $message): array => [
                'role' => $message['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $message['content']]],
            ],
            $request->messages,
        );
        if ($request->resources !== []) {
            $contents = $this->contentsWithResources($request, $contents);
        }
        $payload = [
            'systemInstruction' => ['parts' => [['text' => $request->systemPrompt]]],
            'contents' => $contents,
        ];
        $generationConfig = [];
        if ($request->maxTokens !== null) {
            $generationConfig['maxOutputTokens'] = $request->maxTokens;
        }
        if ($request->temperature !== null) {
            $generationConfig['temperature'] = $request->temperature;
        }
        foreach (ReasoningEffortMap::paramsFor(
            ReasoningEffortMap::TARGET_GEMINI,
            $request->reasoningEffort,
            $request->reasoningVisible ?? false,
            $request->maxTokens,
        ) as $reasoningKey => $reasoningValue) {
            $generationConfig[$reasoningKey] = $reasoningValue;
        }
        if ($generationConfig !== []) {
            $payload['generationConfig'] = $generationConfig;
        }
        if ($request->tools !== []) {
            $payload['tools'] = [[
                'functionDeclarations' => array_map($this->providerTool(...), $request->tools),
            ]];
            $payload['toolConfig'] = ['functionCallingConfig' => ['mode' => 'AUTO']];
        }

        return [$payload, $request->resources !== []];
    }

    /**
     * @param list<array<string, mixed>> $contents
     * @return list<array<string, mixed>>
     */
    private function contentsWithResources(ProviderTurnRequest $request, array $contents): array
    {
        $last = array_key_last($contents);
        $parts = [];
        foreach ($request->resources as $resource) {
            if ($resource->isImage() && ! in_array($resource->mediaType, self::SUPPORTED_IMAGE_MEDIA_TYPES, true)) {
                throw new InvalidArgumentException('Gemini generateContent does not support this image media type.');
            }
            if ($resource->isDocument() && $resource->mediaType !== 'application/pdf') {
                throw new InvalidArgumentException('Gemini native documents must be PDF.');
            }
            $parts[] = [
                'inline_data' => [
                    'mime_type' => $resource->mediaType,
                    'data' => $resource->base64Data(),
                ],
            ];
        }
        $parts[] = ['text' => $request->messages[array_key_last($request->messages)]['content']];
        $contents[$last]['parts'] = $parts;

        return $contents;
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
        if ($state->provider !== 'gemini') {
            throw new InvalidArgumentException('Gemini state belongs to another provider.');
        }
        $results = $this->correlatedResults($state, $toolResults);
        $native = $state->nativeStateFor(self::ADAPTER_VERSION);
        $contents = ToolContractGuard::listArray($native['contents'] ?? null, 'Gemini continuation contents');
        $modelContent = ToolContractGuard::objectArray($native['model_content'] ?? null, 'Gemini continuation model content');
        $callNames = ToolContractGuard::objectArray($native['call_names'] ?? null, 'Gemini continuation call names');
        $contents[] = $modelContent;
        $responseParts = [];
        foreach ($state->pendingToolCallIds as $callId) {
            $name = ToolContractGuard::nonEmptyString($callNames[$callId] ?? null, 'Gemini continuation function name', 128);
            $responseParts[] = [
                'functionResponse' => [
                    'id' => $callId,
                    'name' => $name,
                    'response' => $results[$callId]->toRedactedArray(),
                ],
            ];
        }
        $contents[] = ['role' => 'user', 'parts' => $responseParts];

        $payload = [
            'systemInstruction' => ToolContractGuard::objectArray($native['systemInstruction'] ?? null, 'Gemini continuation system instruction'),
            'contents' => $contents,
        ];
        foreach (['generationConfig', 'tools', 'toolConfig'] as $field) {
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
                ['Content-Type: application/json', 'x-goog-api-key: '.$this->apiKey],
                $this->timeoutMs,
            );
            if (! is_array($response)) {
                throw new InvalidArgumentException('Gemini transport returned a non-object response.');
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
                message: 'Provider response did not satisfy the Gemini adapter contract.',
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
            throw new InvalidArgumentException('Configured Gemini transport does not support streaming.');
        }

        return new ProviderStream(
            $this->transport->stream(
                $this->streamEndpoint(),
                $payload,
                [
                    'Content-Type: application/json',
                    'Accept: text/event-stream',
                    'x-goog-api-key: '.$this->apiKey,
                ],
                $this->timeoutMs,
                $isCancelled,
            ),
            new GeminiStreamDecoder($finalizer),
        );
    }

    private function streamEndpoint(): string
    {
        if (! str_ends_with($this->endpoint, ':generateContent')) {
            throw new InvalidArgumentException('Gemini streaming requires a generateContent endpoint.');
        }

        return substr($this->endpoint, 0, -strlen(':generateContent'))
            .':streamGenerateContent?alt=sse';
    }

    /** @param array<string, mixed> $response @param array<string, mixed> $requestPayload */
    private function normalize(array $response, array $requestPayload): ProviderTurnResponse
    {
        $responseId = is_string($response['responseId'] ?? null) ? $response['responseId'] : null;
        $usage = TokenUsage::fromGemini(is_array($response['usageMetadata'] ?? null) ? $response['usageMetadata'] : []);
        $candidates = ToolContractGuard::listArray($response['candidates'] ?? null, 'Gemini candidates');
        if ($candidates === [] || ! is_array($candidates[0])) {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_RESPONSE_EMPTY',
                message: 'Gemini response did not contain a candidate.',
                retryable: false,
            ), $responseId, usage: $usage);
        }
        $candidate = ToolContractGuard::objectArray($candidates[0], 'Gemini candidate');
        $finishReason = is_string($candidate['finishReason'] ?? null) ? $candidate['finishReason'] : null;
        $content = ToolContractGuard::objectArray($candidate['content'] ?? null, 'Gemini candidate content');
        $parts = ToolContractGuard::listArray($content['parts'] ?? null, 'Gemini candidate parts');
        $texts = [];
        $thoughts = [];
        $toolCalls = [];
        $callNames = [];
        foreach ($parts as $index => $part) {
            $part = ToolContractGuard::objectArray($part, sprintf('Gemini candidate part %d', $index));
            if (is_string($part['text'] ?? null)) {
                if (($part['thought'] ?? null) === true) {
                    $thoughts[] = trim($part['text']);
                } else {
                    $texts[] = trim($part['text']);
                }
            }
            if (! array_key_exists('functionCall', $part)) {
                continue;
            }
            $function = ToolContractGuard::objectArray($part['functionCall'], sprintf('Gemini functionCall %d', $index));
            $callId = is_string($function['id'] ?? null) && trim($function['id']) !== ''
                ? $function['id']
                : sprintf('gemini:%s:%d', $responseId ?? hash('sha256', json_encode($part, JSON_THROW_ON_ERROR)), $index);
            $name = ToolContractGuard::nonEmptyString($function['name'] ?? null, sprintf('Gemini functionCall %d name', $index), 128);
            $toolCalls[] = ToolCall::fromArray([
                'schema_version' => ToolCall::SCHEMA_VERSION,
                'provider_call_id' => $callId,
                'name' => $name,
                'arguments' => ToolContractGuard::objectArray($function['args'] ?? null, sprintf('Gemini functionCall %d args', $index)),
                'assistant_preamble' => null,
                'provider_metadata' => [
                    'adapter' => self::ADAPTER_VERSION,
                    'response_id' => $responseId,
                    'stop_reason' => $finishReason,
                    'index' => $index,
                ],
            ]);
            $callNames[$callId] = $name;
        }
        $text = trim(implode("\n", array_filter($texts, static fn (string $value): bool => $value !== '')));
        $visibleReasoning = trim(implode("\n", array_filter($thoughts, static fn (string $value): bool => $value !== '')));
        if (in_array($finishReason, ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'], true)) {
            return ProviderTurnResponse::refusal($text !== '' ? $text : 'The provider blocked this response.', $responseId, $finishReason, $usage);
        }
        if ($finishReason === 'MAX_TOKENS') {
            return ProviderTurnResponse::incomplete($text !== '' ? $text : 'The provider response was truncated.', $responseId, $finishReason, $usage);
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
                'systemInstruction' => $requestPayload['systemInstruction'],
                'contents' => $requestPayload['contents'],
                'model_content' => $content,
                'call_names' => $callNames,
            ];
            foreach (['generationConfig', 'tools', 'toolConfig'] as $field) {
                if (array_key_exists($field, $requestPayload)) {
                    $native[$field] = $requestPayload[$field];
                }
            }
            $state = new ProviderTurnState(
                provider: 'gemini',
                adapterVersion: self::ADAPTER_VERSION,
                responseId: $responseId,
                continuationKind: 'content_history',
                nativeState: $native,
                pendingToolCallIds: array_map(static fn (ToolCall $call): string => $call->providerCallId, $toolCalls),
            );

            return ProviderTurnResponse::toolCalls($text !== '' ? $text : null, $toolCalls, $state, $responseId, $finishReason, $usage);
        }
        if ($text === '') {
            return ProviderTurnResponse::failure(new ProviderFailure(
                code: 'PROVIDER_RESPONSE_EMPTY',
                message: 'Gemini response contained neither final text nor function calls.',
                retryable: false,
            ), $responseId, $finishReason, $usage);
        }

        return ProviderTurnResponse::final(
            $text,
            $responseId,
            $finishReason,
            $usage,
            $visibleReasoning !== '' ? $visibleReasoning : null,
        );
    }

    /** @param list<ToolResult> $toolResults @return array<string, ToolResult> */
    private function correlatedResults(ProviderTurnState $state, array $toolResults): array
    {
        ToolContractGuard::listArray($toolResults, 'Gemini continuation tool results');
        $results = [];
        foreach ($toolResults as $result) {
            if (! $result instanceof ToolResult || isset($results[$result->toolUseId])) {
                throw new InvalidArgumentException('Gemini continuation requires unique ToolResult values.');
            }
            $results[$result->toolUseId] = $result;
        }
        if (array_keys($results) !== $state->pendingToolCallIds) {
            throw new InvalidArgumentException('Gemini continuation results must match pending function call IDs in order.');
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
            'parametersJsonSchema' => $wireDefinition['inputSchema'],
        ];
    }
}
