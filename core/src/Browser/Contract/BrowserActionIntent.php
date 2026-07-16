<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final readonly class BrowserActionIntent
{
    /**
     * @param array<string, mixed> $arguments
     * @param list<BrowserCapability> $requestedCapabilities
     */
    private function __construct(
        public string $intentId,
        public string $taskId,
        public string $sourceMessageId,
        public BrowserActionKind $kind,
        public array $arguments,
        public ?string $targetTabId,
        public array $requestedCapabilities,
        public string $createdAt,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-action-intent', 'Browser action intent'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value, ['arguments']));
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::INTENT,
            'intent_id' => $this->intentId,
            'task_id' => $this->taskId,
            'source_message_id' => $this->sourceMessageId,
            'kind' => $this->kind->value,
            'arguments' => BrowserContractGuard::object($this->arguments),
            'target_tab_id' => $this->targetTabId,
            'requested_capabilities' => array_map(static fn (BrowserCapability $capability): string => $capability->value, $this->requestedCapabilities),
            'created_at' => $this->createdAt,
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        /** @var BrowserActionKind $kind */
        $kind = BrowserContractGuard::enum($value['kind'], BrowserActionKind::class, 'Browser action intent kind');
        /** @var list<BrowserCapability> $capabilities */
        $capabilities = BrowserContractGuard::enumList($value['requested_capabilities'], BrowserCapability::class, 'Browser capability');

        return new self(
            $value['intent_id'],
            $value['task_id'],
            $value['source_message_id'],
            $kind,
            $value['arguments'],
            $value['target_tab_id'],
            $capabilities,
            $value['created_at'],
        );
    }
}
