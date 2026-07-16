<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

use InvalidArgumentException;

final readonly class BrowserTask
{
    /** @param array{max_actions: int, max_elapsed_ms: int, max_bytes: int, max_tabs: int, max_domains?: int, max_tokens?: int} $budget */
    private function __construct(
        public string $taskId,
        public string $conversationId,
        public string $originMessageId,
        public string $goal,
        public BrowserTaskStatus $status,
        public BrowserAutonomyProfile $autonomyProfile,
        public array $budget,
        public ?string $runtimeId,
        public ?string $activeTabId,
        public int $stateVersion,
        public string $createdAt,
        public string $updatedAt,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-task', 'Browser task'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value, ['budget']));
    }

    public function transition(BrowserTaskStatus $next, int $expectedVersion): self
    {
        if ($expectedVersion !== $this->stateVersion) {
            throw new InvalidArgumentException('Browser task state version is stale.');
        }
        if (! in_array($next, $this->allowedTransitions(), true)) {
            throw new InvalidArgumentException("Browser task transition {$this->status->value} -> {$next->value} is invalid.");
        }

        return new self(
            $this->taskId,
            $this->conversationId,
            $this->originMessageId,
            $this->goal,
            $next,
            $this->autonomyProfile,
            $this->budget,
            $this->runtimeId,
            $this->activeTabId,
            $this->stateVersion + 1,
            $this->createdAt,
            gmdate('Y-m-d\TH:i:s\Z'),
        );
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::TASK,
            'task_id' => $this->taskId,
            'conversation_id' => $this->conversationId,
            'origin_message_id' => $this->originMessageId,
            'goal' => $this->goal,
            'status' => $this->status->value,
            'autonomy_profile' => $this->autonomyProfile->value,
            'budget' => BrowserContractGuard::object($this->budget),
            'runtime_id' => $this->runtimeId,
            'active_tab_id' => $this->activeTabId,
            'state_version' => $this->stateVersion,
            'created_at' => $this->createdAt,
            'updated_at' => $this->updatedAt,
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        /** @var BrowserTaskStatus $status */
        $status = BrowserContractGuard::enum($value['status'], BrowserTaskStatus::class, 'Browser task status');
        /** @var BrowserAutonomyProfile $profile */
        $profile = BrowserContractGuard::enum($value['autonomy_profile'], BrowserAutonomyProfile::class, 'Browser autonomy profile');

        return new self(
            $value['task_id'],
            $value['conversation_id'],
            $value['origin_message_id'],
            $value['goal'],
            $status,
            $profile,
            $value['budget'],
            $value['runtime_id'],
            $value['active_tab_id'],
            $value['state_version'],
            $value['created_at'],
            $value['updated_at'],
        );
    }

    /** @return list<BrowserTaskStatus> */
    private function allowedTransitions(): array
    {
        $next = match ($this->status) {
            BrowserTaskStatus::Created => [BrowserTaskStatus::Planning],
            BrowserTaskStatus::Planning => [BrowserTaskStatus::Ready, BrowserTaskStatus::Failed],
            BrowserTaskStatus::Ready => [BrowserTaskStatus::Running, BrowserTaskStatus::Failed],
            BrowserTaskStatus::Running => [BrowserTaskStatus::WaitingUser, BrowserTaskStatus::Recovering, BrowserTaskStatus::Completed, BrowserTaskStatus::Failed],
            BrowserTaskStatus::WaitingUser => [BrowserTaskStatus::Running, BrowserTaskStatus::Failed],
            BrowserTaskStatus::Recovering => [BrowserTaskStatus::Running, BrowserTaskStatus::WaitingUser, BrowserTaskStatus::Failed],
            BrowserTaskStatus::Completed, BrowserTaskStatus::Failed, BrowserTaskStatus::Cancelled => [],
        };

        if (! in_array($this->status, [BrowserTaskStatus::Completed, BrowserTaskStatus::Failed, BrowserTaskStatus::Cancelled], true)) {
            $next[] = BrowserTaskStatus::Cancelled;
        }

        return $next;
    }
}
