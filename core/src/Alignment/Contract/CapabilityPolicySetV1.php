<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

final readonly class CapabilityPolicySetV1
{
    public const int SCHEMA_VERSION = 1;

    /** @param array<string, mixed> $value */
    private function __construct(private array $value) {}

    public static function fromJson(string $json): self
    {
        $value = AlignmentContractDecoder::decode($json, AlignmentContractName::CapabilityPolicySet);
        self::guard($value);

        return new self($value);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(AlignmentContractDecoder::encodeServerArray($value, AlignmentContractName::CapabilityPolicySet));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->value;
    }

    public function toJson(): string
    {
        return AlignmentContractDecoder::encodeServerArray($this->value, AlignmentContractName::CapabilityPolicySet);
    }

    /** @param array<string, mixed> $value */
    private static function guard(array $value): void
    {
        $deniedActions = [];
        foreach ($value['policies'] as $policy) {
            if ($policy['decision'] !== 'deny') {
                continue;
            }
            foreach ($policy['actions'] as $action) {
                $deniedActions[$policy['capability']][$action] = true;
            }
        }

        foreach ($value['grants'] as $grant) {
            if (in_array($grant['scope'], ['session', 'device'], true)
                && (! isset($grant['scope_id']) || $grant['scope_id'] === '')) {
                self::fail('grant_scope_id_required', 'Session and device grants require a scope identifier.');
            }
            if (in_array($grant['scope'], ['once', 'account'], true)
                && ($grant['scope_id'] ?? null) !== null) {
                self::fail('grant_scope_id_forbidden', 'Once and account grants cannot carry a target scope identifier.');
            }
            if ($grant['status'] !== 'active') {
                continue;
            }
            foreach ($grant['actions'] as $action) {
                if (($deniedActions[$grant['capability']][$action] ?? false) === true) {
                    self::fail('policy_deny_grant_conflict', 'An active grant cannot override an explicit deny.');
                }
            }
        }
    }

    private static function fail(string $code, string $details): never
    {
        throw new AlignmentContractException($code, AlignmentContractName::CapabilityPolicySet, $details);
    }
}
