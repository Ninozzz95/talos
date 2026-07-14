<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ProviderTurnRequest
{
    /**
     * @param list<array{role: string, content: string}> $messages
     * @param list<ToolDefinition> $tools
     */
    public function __construct(
        public string $provider,
        public string $model,
        public string $systemPrompt,
        public array $messages,
        public array $tools,
        public ?int $maxTokens = null,
        public ?float $temperature = null,
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
        if ($maxTokens !== null && $maxTokens < 1) {
            throw new InvalidArgumentException('Provider turn maxTokens must be positive when set.');
        }
        if ($temperature !== null && ($temperature < 0.0 || $temperature > 2.0)) {
            throw new InvalidArgumentException('Provider turn temperature must be between 0 and 2 when set.');
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
            'max_tokens' => $this->maxTokens,
            'temperature' => $this->temperature,
        ]);
    }
}
