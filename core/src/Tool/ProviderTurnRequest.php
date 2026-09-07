<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use Kadmos\Provider\PromptCachePlan;

final readonly class ProviderTurnRequest
{
    private const MAX_RESOURCES = 4;
    private const MAX_RESOURCE_BYTES = 20971520;

    /**
     * @param list<array{role: string, content: string}> $messages
     * @param list<ToolDefinition> $tools
     * @param list<ProviderInputResource> $resources
     */
    public function __construct(
        public string $provider,
        public string $model,
        public string $systemPrompt,
        public array $messages,
        public array $tools,
        public ?int $maxTokens = null,
        public ?float $temperature = null,
        public array $resources = [],
        public ?string $reasoningEffort = null,
        public ?bool $reasoningVisible = null,
        public ?string $responseMimeType = null,
        public ?PromptCachePlan $promptCachePlan = null,
    ) {
        ToolContractGuard::nonEmptyString($provider, 'Provider turn provider', 64);
        ToolContractGuard::nonEmptyString($model, 'Provider turn model', 256);
        ToolContractGuard::nonEmptyString($systemPrompt, 'Provider turn system prompt', 65536);
        ToolContractGuard::listArray($messages, 'Provider turn messages');
        if ($messages === []) {
            throw new InvalidArgumentException('Provider turn requires at least one durable message.');
        }
        foreach ($messages as $index => $message) {
            $message = ToolContractGuard::objectArray($message, sprintf('Provider turn message %d', $index));
            ToolContractGuard::exactKeys($message, ['role', 'content'], [], sprintf('Provider turn message %d', $index));
            $role = ToolContractGuard::nonEmptyString($message['role'], sprintf('Provider turn message %d role', $index), 16);
            if (! in_array($role, ['user', 'assistant'], true)) {
                throw new InvalidArgumentException('Provider turn durable messages support user and assistant roles only.');
            }
            ToolContractGuard::nonEmptyString($message['content'], sprintf('Provider turn message %d content', $index), 262144);
        }

        ToolContractGuard::listArray($tools, 'Provider turn tools');
        foreach ($tools as $tool) {
            if (! $tool instanceof ToolDefinition) {
                throw new InvalidArgumentException('Provider turn tools must be ToolDefinition values.');
            }
        }
        ToolContractGuard::boundedListArray($resources, 'Provider turn resources', self::MAX_RESOURCES);
        $resourceIds = [];
        $resourceBytes = 0;
        foreach ($resources as $resource) {
            if (! $resource instanceof ProviderInputResource) {
                throw new InvalidArgumentException('Provider turn resources must be ProviderInputResource values.');
            }
            if (isset($resourceIds[$resource->resourceId])) {
                throw new InvalidArgumentException('Provider turn resource IDs must be unique.');
            }
            $resourceIds[$resource->resourceId] = true;
            $resourceBytes += $resource->sizeBytes;
        }
        if ($resourceBytes > self::MAX_RESOURCE_BYTES) {
            throw new InvalidArgumentException('Provider turn resources exceed the aggregate byte budget.');
        }
        if ($resources !== [] && $tools !== []) {
            throw new InvalidArgumentException('Provider turns cannot combine native input resources with procedural tools.');
        }
        if ($resources !== [] && ($messages[array_key_last($messages)]['role'] ?? null) !== 'user') {
            throw new InvalidArgumentException('Provider turn resources require a final user message.');
        }
        if ($maxTokens !== null && $maxTokens < 1) {
            throw new InvalidArgumentException('Provider turn maxTokens must be positive when set.');
        }
        if ($temperature !== null && ($temperature < 0.0 || $temperature > 2.0)) {
            throw new InvalidArgumentException('Provider turn temperature must be between 0 and 2 when set.');
        }
        if ($reasoningEffort !== null) {
            // The canonical ladder is validated by ReasoningEffortMap (single source
            // of truth) and by the controller against the model's advertised levels;
            // here we only fail closed on an empty or over-long token.
            ToolContractGuard::nonEmptyString($reasoningEffort, 'Provider turn reasoning effort', 16);
        }
        if ($responseMimeType !== null && $responseMimeType !== 'application/json') {
            throw new InvalidArgumentException('Provider turn response MIME type is unsupported.');
        }
    }

    /** @return array<string, mixed> */
    public function toRedactedArray(): array
    {
        return ToolContractGuard::redact([
            'provider' => $this->provider,
            'model' => $this->model,
            'system_prompt' => $this->systemPrompt,
            'messages' => $this->messages,
            'tools' => array_map(static fn (ToolDefinition $tool): array => $tool->toArray(), $this->tools),
            'resources' => array_map(static fn (ProviderInputResource $resource): array => $resource->toAuditArray(), $this->resources),
            'max_tokens' => $this->maxTokens,
            'temperature' => $this->temperature,
            'reasoning_effort' => $this->reasoningEffort,
            'reasoning_visible' => $this->reasoningVisible,
            'response_mime_type' => $this->responseMimeType,
            'prompt_cache_plan' => $this->promptCachePlan?->toAuditArray(),
        ]);
    }
}
