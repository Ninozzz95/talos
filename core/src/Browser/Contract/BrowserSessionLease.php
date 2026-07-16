<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final readonly class BrowserSessionLease
{
    private function __construct(
        public string $leaseId,
        public string $taskId,
        public BrowserLeaseOwnerType $ownerType,
        public string $ownerId,
        public string $fencingToken,
        public BrowserLeaseStatus $status,
        public string $acquiredAt,
        public string $expiresAt,
        public ?string $releasedAt,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-session-lease', 'Browser session lease'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value));
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::LEASE,
            'lease_id' => $this->leaseId,
            'task_id' => $this->taskId,
            'owner_type' => $this->ownerType->value,
            'owner_id' => $this->ownerId,
            'fencing_token' => $this->fencingToken,
            'status' => $this->status->value,
            'acquired_at' => $this->acquiredAt,
            'expires_at' => $this->expiresAt,
            'released_at' => $this->releasedAt,
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        /** @var BrowserLeaseOwnerType $ownerType */
        $ownerType = BrowserContractGuard::enum($value['owner_type'], BrowserLeaseOwnerType::class, 'Browser lease owner type');
        /** @var BrowserLeaseStatus $status */
        $status = BrowserContractGuard::enum($value['status'], BrowserLeaseStatus::class, 'Browser lease status');
        $acquiredAt = BrowserContractGuard::timestamp($value['acquired_at'], 'Browser lease acquired_at');
        $expiresAt = BrowserContractGuard::timestamp($value['expires_at'], 'Browser lease expires_at');
        BrowserContractGuard::require($expiresAt > $acquiredAt, 'Browser lease expires_at must follow acquired_at.');
        BrowserContractGuard::require(
            $status === BrowserLeaseStatus::Released ? $value['released_at'] !== null : $value['released_at'] === null,
            'Browser lease released_at must match released status.',
        );
        if ($value['released_at'] !== null) {
            $releasedAt = BrowserContractGuard::timestamp($value['released_at'], 'Browser lease released_at');
            BrowserContractGuard::require($releasedAt >= $acquiredAt, 'Browser lease released_at cannot precede acquired_at.');
        }

        return new self(
            $value['lease_id'],
            $value['task_id'],
            $ownerType,
            $value['owner_id'],
            $value['fencing_token'],
            $status,
            $value['acquired_at'],
            $value['expires_at'],
            $value['released_at'],
        );
    }
}
