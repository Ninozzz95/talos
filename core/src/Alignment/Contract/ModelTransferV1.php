<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

final readonly class ModelTransferV1
{
    public const int SCHEMA_VERSION = 1;

    /** @param array<string, mixed> $value */
    private function __construct(private array $value) {}

    public static function fromJson(string $json): self
    {
        $value = AlignmentContractDecoder::decode($json, AlignmentContractName::ModelTransfer);
        self::guard($value);

        return new self($value);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(AlignmentContractDecoder::encodeServerArray($value, AlignmentContractName::ModelTransfer));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->value;
    }

    public function toJson(): string
    {
        return AlignmentContractDecoder::encodeServerArray($this->value, AlignmentContractName::ModelTransfer);
    }

    /** @param array<string, mixed> $value */
    private static function guard(array $value): void
    {
        if ($value['have_bytes'] > $value['total_bytes']) {
            self::fail('transfer_byte_count_invalid', 'Transferred bytes cannot exceed declared total bytes.');
        }
        if ($value['mode'] === 'preview'
            && ($value['state'] !== 'planned' || $value['have_bytes'] !== 0 || $value['verification'] !== 'not_applicable')) {
            self::fail('transfer_preview_state_invalid', 'Preview transfers must remain planned, write zero bytes, and skip verification.');
        }
        if ($value['mode'] === 'execute' && $value['state'] === 'completed'
            && ($value['have_bytes'] !== $value['total_bytes'] || $value['verification'] !== 'verified')) {
            self::fail('transfer_completed_unverified', 'Completed transfers require exact byte totals and verified content.');
        }
    }

    private static function fail(string $code, string $details): never
    {
        throw new AlignmentContractException($code, AlignmentContractName::ModelTransfer, $details);
    }
}
