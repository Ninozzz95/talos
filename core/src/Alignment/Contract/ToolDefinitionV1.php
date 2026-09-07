<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

final readonly class ToolDefinitionV1
{
    public const int SCHEMA_VERSION = 1;

    /** @param array<string, mixed> $value */
    private function __construct(private array $value) {}

    public static function fromJson(string $json): self
    {
        $value = AlignmentContractDecoder::decode($json, AlignmentContractName::ToolDefinition);
        self::guard($value);

        return new self($value);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(AlignmentContractDecoder::encodeServerArray($value, AlignmentContractName::ToolDefinition));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->value;
    }

    public function toJson(): string
    {
        return AlignmentContractDecoder::encodeServerArray($this->value, AlignmentContractName::ToolDefinition);
    }

    /** @param array<string, mixed> $value */
    private static function guard(array $value): void
    {
        $risk = $value['risk'];
        $effects = $value['effects'];
        if (in_array($risk, ['high', 'critical'], true) && $effects['requires_approval'] !== true) {
            self::fail('tool_approval_required', 'High and critical risk tools require approval.');
        }
        if ($effects['mutates_state'] === true && $effects['parallel_safe'] === true) {
            self::fail('tool_parallel_mutation', 'A mutating tool cannot declare itself parallel-safe.');
        }

        if ($value['lifecycle']['kind'] === 'managed_registry'
            && in_array('local_mobile', $value['execution']['locations'], true)) {
            self::fail('tool_location_unsupported', 'Managed registry tools cannot execute inside the mobile process.');
        }

        $implementationKey = $value['execution']['implementation_key'];
        if (preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,199}\z/D', $implementationKey) !== 1) {
            self::fail('tool_implementation_key_unsafe', 'Implementation key must identify local registered code, never a URL or code body.');
        }
    }

    private static function fail(string $code, string $details): never
    {
        throw new AlignmentContractException($code, AlignmentContractName::ToolDefinition, $details);
    }
}
