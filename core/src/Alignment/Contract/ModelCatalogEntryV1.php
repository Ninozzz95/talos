<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

final readonly class ModelCatalogEntryV1
{
    public const int SCHEMA_VERSION = 1;

    /** @param array<string, mixed> $value */
    private function __construct(private array $value) {}

    public static function fromJson(string $json): self
    {
        $value = AlignmentContractDecoder::decode($json, AlignmentContractName::ModelCatalogEntry);
        self::guard($value);

        return new self($value);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(AlignmentContractDecoder::encodeServerArray($value, AlignmentContractName::ModelCatalogEntry));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->value;
    }

    public function toJson(): string
    {
        return AlignmentContractDecoder::encodeServerArray($this->value, AlignmentContractName::ModelCatalogEntry);
    }

    /** @param array<string, mixed> $value */
    private static function guard(array $value): void
    {
        $revision = strtolower(trim($value['source']['revision']));
        if (in_array($revision, ['head', 'latest', 'main', 'master', 'stable'], true)) {
            self::fail('model_revision_mutable', 'Model source revision must be immutable, not a moving alias.');
        }
    }

    private static function fail(string $code, string $details): never
    {
        throw new AlignmentContractException($code, AlignmentContractName::ModelCatalogEntry, $details);
    }
}
