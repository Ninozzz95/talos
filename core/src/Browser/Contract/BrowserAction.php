<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final readonly class BrowserAction
{
    /**
     * @param array<string, mixed> $arguments
     * @param list<array{kind: string, value: mixed}> $preconditions
     */
    private function __construct(
        public string $actionId,
        public string $taskId,
        public string $intentId,
        public int $sequence,
        public BrowserActionKind $kind,
        public array $arguments,
        public int $expectedStateVersion,
        public BrowserActionRisk $risk,
        public string $idempotencyKey,
        public array $preconditions,
        public BrowserActionStatus $status,
        public string $createdAt,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-action', 'Browser action'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value, ['arguments'], ['preconditions']));
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::ACTION,
            'action_id' => $this->actionId,
            'task_id' => $this->taskId,
            'intent_id' => $this->intentId,
            'sequence' => $this->sequence,
            'kind' => $this->kind->value,
            'arguments' => BrowserContractGuard::object($this->arguments),
            'expected_state_version' => $this->expectedStateVersion,
            'risk' => $this->risk->value,
            'idempotency_key' => $this->idempotencyKey,
            'preconditions' => BrowserContractGuard::objectList($this->preconditions),
            'status' => $this->status->value,
            'created_at' => $this->createdAt,
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        /** @var BrowserActionKind $kind */
        $kind = BrowserContractGuard::enum($value['kind'], BrowserActionKind::class, 'Browser action kind');
        /** @var BrowserActionRisk $risk */
        $risk = BrowserContractGuard::enum($value['risk'], BrowserActionRisk::class, 'Browser action risk');
        /** @var BrowserActionStatus $status */
        $status = BrowserContractGuard::enum($value['status'], BrowserActionStatus::class, 'Browser action status');

        return new self(
            $value['action_id'],
            $value['task_id'],
            $value['intent_id'],
            $value['sequence'],
            $kind,
            $value['arguments'],
            $value['expected_state_version'],
            $risk,
            $value['idempotency_key'],
            $value['preconditions'],
            $status,
            $value['created_at'],
        );
    }
}
