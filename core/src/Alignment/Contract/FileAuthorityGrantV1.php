<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

final readonly class FileAuthorityGrantV1
{
    public const int SCHEMA_VERSION = 1;

    /** @param array<string, mixed> $value */
    private function __construct(private array $value) {}

    public static function fromJson(string $json): self
    {
        $value = AlignmentContractDecoder::decode($json, AlignmentContractName::FileAuthorityGrant);
        self::guard($value);

        return new self($value);
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(AlignmentContractDecoder::encodeServerArray($value, AlignmentContractName::FileAuthorityGrant));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->value;
    }

    public function toJson(): string
    {
        return AlignmentContractDecoder::encodeServerArray($this->value, AlignmentContractName::FileAuthorityGrant);
    }

    /** @param array<string, mixed> $value */
    private static function guard(array $value): void
    {
        if (str_contains($value['id'], '://') || preg_match('/\s/', $value['id']) === 1) {
            self::fail('file_grant_id_unsafe', 'Grant ID must be opaque and must never convey bearer authority.');
        }

        $scope = $value['scope'];
        $scopeId = $value['scope_id'] ?? null;
        $bindings = $value['resource_bindings'];
        if ($scope === 'file'
            && (count($bindings) !== 1 || $scopeId !== $bindings[0]['library_item_id'])) {
            self::fail('file_grant_file_binding_invalid', 'File scope requires one matching Library item binding.');
        }
        if (in_array($scope, ['folder', 'session'], true)
            && ((! is_string($scopeId) || $scopeId === '') || $bindings === [])) {
            self::fail('file_grant_scope_binding_required', 'Folder and session scopes require a scope ID and frozen file bindings.');
        }
        if ($scope === 'global') {
            if ($bindings !== []) {
                self::fail('file_grant_global_binding_forbidden', 'Global scope cannot carry resource bindings.');
            }
            if ($scopeId !== null) {
                self::fail('file_grant_global_scope_id_forbidden', 'Global scope cannot carry a scope ID.');
            }
            if (($value['risk_acknowledged_at'] ?? null) === null) {
                self::fail('file_grant_global_acknowledgement_required', 'Global scope requires explicit risk acknowledgement.');
            }
        }
        if ($value['status'] === 'revoked' && ($value['revoked_at'] ?? null) === null) {
            self::fail('file_grant_revoked_at_required', 'Revoked grants require a revocation timestamp.');
        }
        if ($value['status'] !== 'revoked' && ($value['revoked_at'] ?? null) !== null) {
            self::fail('file_grant_revoked_at_forbidden', 'Only revoked grants may carry a revocation timestamp.');
        }
    }

    private static function fail(string $code, string $details): never
    {
        throw new AlignmentContractException($code, AlignmentContractName::FileAuthorityGrant, $details);
    }
}
