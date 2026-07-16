<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final readonly class BrowserCheckpoint
{
    /**
     * @param list<array{tab_id: string, url: string, title: string, is_active: bool}> $tabInventory
     * @param array{max_actions: int, max_elapsed_ms: int, max_bytes: int, max_tabs: int, max_domains?: int, max_tokens?: int} $budget
     * @param list<string> $actionFrontier
     * @param list<string> $evidenceFrontier
     */
    private function __construct(
        public string $checkpointId,
        public string $taskId,
        public int $taskStateVersion,
        public BrowserTaskStatus $taskStatus,
        public array $tabInventory,
        public array $budget,
        public array $actionFrontier,
        public array $evidenceFrontier,
        public ?string $runtimeReconciliationToken,
        public string $createdAt,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-checkpoint', 'Browser checkpoint'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value, ['budget'], ['tab_inventory']));
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::CHECKPOINT,
            'checkpoint_id' => $this->checkpointId,
            'task_id' => $this->taskId,
            'task_state_version' => $this->taskStateVersion,
            'task_status' => $this->taskStatus->value,
            'tab_inventory' => BrowserContractGuard::objectList($this->tabInventory),
            'budget' => BrowserContractGuard::object($this->budget),
            'action_frontier' => $this->actionFrontier,
            'evidence_frontier' => $this->evidenceFrontier,
            'runtime_reconciliation_token' => $this->runtimeReconciliationToken,
            'created_at' => $this->createdAt,
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        /** @var BrowserTaskStatus $status */
        $status = BrowserContractGuard::enum($value['task_status'], BrowserTaskStatus::class, 'Browser checkpoint task status');
        $activeTabs = array_filter($value['tab_inventory'], static fn (array $tab): bool => $tab['is_active']);
        BrowserContractGuard::require(count($activeTabs) <= 1, 'Browser checkpoint may contain at most one active tab.');

        return new self(
            $value['checkpoint_id'],
            $value['task_id'],
            $value['task_state_version'],
            $status,
            $value['tab_inventory'],
            $value['budget'],
            $value['action_frontier'],
            $value['evidence_frontier'],
            $value['runtime_reconciliation_token'],
            $value['created_at'],
        );
    }
}
