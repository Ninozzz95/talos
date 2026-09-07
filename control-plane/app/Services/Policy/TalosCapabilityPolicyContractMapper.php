<?php

declare(strict_types=1);

namespace App\Services\Policy;

use App\Models\TalosCapabilityGrant;
use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Kadmos\Alignment\Contract\CapabilityPolicySetV1;

final class TalosCapabilityPolicyContractMapper
{
    private const LEGACY_ALLOW_FOR_SESSION = 'allow_for_session';

    private const LEGACY_ALLOW_UNTIL_REVOKED = 'allow_until_revoked';

    /**
     * @return array{
     *   contract: CapabilityPolicySetV1,
     *   catalog: list<array<string, mixed>>,
     *   master_enable: array{eligible: list<string>, excluded: list<string>},
     *   faults: list<array<string, mixed>>
     * }
     */
    public function snapshot(?TalosCapabilityPolicySet $set): array
    {
        $set?->loadMissing(['policies', 'grants']);
        /** @var Collection<string, TalosCapabilityPolicy> $policies */
        $policies = ($set?->policies ?? collect())->keyBy(
            static fn (TalosCapabilityPolicy $policy): string => (string) $policy->capability,
        );
        /** @var Collection<int, TalosCapabilityGrant> $persistedGrants */
        $persistedGrants = $set?->grants ?? collect();
        $faults = [];
        $policyValues = [];
        $grantValues = [];

        foreach (TalosCapability::cases() as $capability) {
            $stored = $policies->get($capability->value);
            $baseline = $this->baselineFromStoredPolicy($capability, $stored);
            if ($baseline['fault'] !== null) {
                $faults[] = $baseline['fault'];
            }
            $policyValues[] = $this->contractPolicy($baseline);

            if ($stored instanceof TalosCapabilityPolicy) {
                $legacyGrant = $this->legacyGrantFromStoredPolicy($capability, $stored);
                if ($legacyGrant !== null) {
                    $grantValues[] = $legacyGrant;
                }
            }
        }

        foreach ($persistedGrants->sortBy('id')->values() as $grant) {
            $mapped = $this->persistedGrant($grant);
            if ($mapped['fault'] !== null) {
                $faults[] = $mapped['fault'];
            }
            if ($mapped['grant'] !== null) {
                $grantValues[] = $mapped['grant'];
            }
        }

        $policyByCapability = collect($policyValues)->keyBy('capability');
        foreach ($grantValues as &$grant) {
            $policy = $policyByCapability->get($grant['capability']);
            if (($policy['decision'] ?? null) !== TalosCapabilityDecision::DENY->value
                || $grant['status'] !== TalosCapabilityGrantStatus::ACTIVE->value
                || array_intersect($policy['actions'], $grant['actions']) === []) {
                continue;
            }
            $grant['status'] = TalosCapabilityGrantStatus::REVOKED->value;
            $faults[] = [
                'code' => 'deny_grant_conflict',
                'capability' => $grant['capability'],
                'grant_id' => $grant['id'],
                'message' => 'An active grant was suppressed because an explicit deny takes precedence.',
            ];
        }
        unset($grant);

        $contract = CapabilityPolicySetV1::fromArray([
            'schema_version' => TalosCapabilityPolicySet::CONTRACT_SCHEMA_VERSION,
            'revision' => (int) ($set?->revision ?? 0),
            'policies' => $policyValues,
            'grants' => array_values($grantValues),
        ]);

        return [
            'contract' => $contract,
            'catalog' => array_map(
                static fn (TalosCapability $capability): array => $capability->toMetadataArray(),
                TalosCapability::cases(),
            ),
            'master_enable' => [
                'eligible' => $this->masterCapabilities(true),
                'excluded' => $this->masterCapabilities(false),
            ],
            'faults' => $faults,
        ];
    }

    /**
     * @return array{
     *   capability: string,
     *   actions: list<string>,
     *   decision: string,
     *   source: string,
     *   risk: string,
     *   updated_at: ?string,
     *   last_used_at: ?string,
     *   fault: ?array<string, mixed>
     * }
     */
    public function baselineFromStoredPolicy(
        TalosCapability $capability,
        ?TalosCapabilityPolicy $policy,
    ): array {
        $actions = $this->actionValues($capability);
        if (! $policy instanceof TalosCapabilityPolicy) {
            return [
                'capability' => $capability->value,
                'actions' => $actions,
                'decision' => TalosCapabilityDecision::ASK->value,
                'source' => 'default',
                'risk' => $capability->risk()->value,
                'updated_at' => null,
                'last_used_at' => null,
                'fault' => null,
            ];
        }

        $stored = (string) $policy->decision;
        $decision = match ($stored) {
            TalosCapabilityDecision::DENY->value => TalosCapabilityDecision::DENY->value,
            TalosCapabilityDecision::ASK->value,
            self::LEGACY_ALLOW_FOR_SESSION => TalosCapabilityDecision::ASK->value,
            TalosCapabilityDecision::ALLOW->value,
            self::LEGACY_ALLOW_UNTIL_REVOKED => TalosCapabilityDecision::ALLOW->value,
            default => TalosCapabilityDecision::DENY->value,
        };
        $validStoredDecision = in_array($stored, [
            TalosCapabilityDecision::DENY->value,
            TalosCapabilityDecision::ASK->value,
            TalosCapabilityDecision::ALLOW->value,
            self::LEGACY_ALLOW_FOR_SESSION,
            self::LEGACY_ALLOW_UNTIL_REVOKED,
        ], true);
        $source = in_array((string) $policy->source, ['default', 'user', 'managed'], true)
            ? (string) $policy->source
            : 'user';
        if (! $validStoredDecision) {
            $source = 'managed';
        }
        $storedActions = $policy->actions;
        $actionsValid = $storedActions === null || $this->validActionSubset($storedActions, $actions);

        return [
            'capability' => $capability->value,
            'actions' => $actionsValid && is_array($storedActions) ? array_values($storedActions) : $actions,
            'decision' => $decision,
            'source' => $source,
            'risk' => $capability->risk()->value,
            'updated_at' => $this->date($policy->updated_at),
            'last_used_at' => $this->date($policy->last_used_at),
            'fault' => ! $validStoredDecision
                ? $this->fault('invalid_stored_decision', $capability, $policy)
                : (! $actionsValid ? $this->fault('invalid_stored_actions', $capability, $policy) : null),
        ];
    }

    /** @return array<string, mixed>|null */
    public function legacyGrantFromStoredPolicy(
        TalosCapability $capability,
        TalosCapabilityPolicy $policy,
    ): ?array {
        $stored = (string) $policy->decision;
        if (! in_array($stored, [self::LEGACY_ALLOW_FOR_SESSION, self::LEGACY_ALLOW_UNTIL_REVOKED], true)) {
            return null;
        }

        $session = $stored === self::LEGACY_ALLOW_FOR_SESSION;
        $expiresAt = $session ? $policy->expires_at : null;
        $status = $session && (
            ! is_string($policy->talos_session_id)
            || $policy->talos_session_id === ''
            || ! $expiresAt instanceof CarbonInterface
            || $expiresAt->isPast()
        ) ? TalosCapabilityGrantStatus::EXPIRED : TalosCapabilityGrantStatus::ACTIVE;

        return [
            'id' => 'legacy-'.$capability->value.'-'.((string) $policy->getKey() ?: 'unpersisted'),
            'capability' => $capability->value,
            'tool_id' => null,
            'actions' => $this->actionValues($capability),
            'scope' => $session ? TalosCapabilityGrantScope::SESSION->value : TalosCapabilityGrantScope::ACCOUNT->value,
            'scope_id' => $session ? $policy->talos_session_id : null,
            'status' => $status->value,
            'granted_at' => $this->date($policy->created_at) ?? '1970-01-01T00:00:00.000000Z',
            'expires_at' => $this->date($expiresAt),
            'risk_acknowledged' => true,
        ];
    }

    /**
     * @return array{
     *   legacy_decision: string,
     *   decision: string,
     *   source: string,
     *   actions: list<string>,
     *   grant: ?array<string, mixed>
     * }
     */
    public function migrationPlanForPolicy(TalosCapabilityPolicy $policy): array
    {
        $capability = TalosCapability::tryFrom((string) $policy->capability);
        if (! $capability instanceof TalosCapability) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_MIGRATION_UNKNOWN_CAPABILITY',
                'A stored capability policy cannot be migrated because its capability is unknown.',
                422,
                'capability',
                ['policy_id' => (string) $policy->getKey(), 'capability' => $policy->capability],
            );
        }
        $legacyDecision = (string) $policy->decision;
        if (! in_array($legacyDecision, [
            TalosCapabilityDecision::DENY->value,
            TalosCapabilityDecision::ASK->value,
            self::LEGACY_ALLOW_FOR_SESSION,
            self::LEGACY_ALLOW_UNTIL_REVOKED,
        ], true)) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_MIGRATION_DECISION_INVALID',
                'A stored capability policy has an unsupported migration decision.',
                422,
                'decision',
                ['policy_id' => (string) $policy->getKey(), 'decision' => $legacyDecision],
            );
        }

        $baseline = $this->baselineFromStoredPolicy($capability, $policy);

        return [
            'legacy_decision' => $legacyDecision,
            'decision' => $baseline['decision'],
            'source' => 'user',
            'actions' => $this->actionValues($capability),
            'grant' => $this->legacyGrantFromStoredPolicy($capability, $policy),
        ];
    }

    /** @param array<string, mixed> $baseline
     *  @return array<string, mixed>
     */
    private function contractPolicy(array $baseline): array
    {
        return [
            'capability' => $baseline['capability'],
            'actions' => $baseline['actions'],
            'decision' => $baseline['decision'],
            'source' => $baseline['source'],
            'risk' => $baseline['risk'],
            'updated_at' => $baseline['updated_at'],
            'last_used_at' => $baseline['last_used_at'],
        ];
    }

    /** @return array{grant: ?array<string, mixed>, fault: ?array<string, mixed>} */
    private function persistedGrant(TalosCapabilityGrant $grant): array
    {
        $capability = TalosCapability::tryFrom((string) $grant->capability);
        if (! $capability instanceof TalosCapability) {
            return [
                'grant' => null,
                'fault' => [
                    'code' => 'unknown_grant_capability',
                    'capability' => (string) $grant->capability,
                    'grant_id' => (string) $grant->getKey(),
                    'message' => 'A grant references an unknown capability and was ignored.',
                ],
            ];
        }

        $canonicalActions = $this->actionValues($capability);
        $actions = $grant->actions;
        $valid = $this->validActionSubset($actions, $canonicalActions);
        $scope = TalosCapabilityGrantScope::tryFrom((string) $grant->scope);
        $status = TalosCapabilityGrantStatus::tryFrom((string) $grant->status);
        $scopeValid = $scope instanceof TalosCapabilityGrantScope
            && ($scope->requiresScopeId()
                ? is_string($grant->scope_id) && trim($grant->scope_id) !== ''
                : $grant->scope_id === null);
        $fault = null;
        if (! $valid || ! $scopeValid || ! $status instanceof TalosCapabilityGrantStatus) {
            $fault = [
                'code' => 'invalid_stored_grant',
                'capability' => $capability->value,
                'grant_id' => (string) $grant->getKey(),
                'message' => 'A malformed capability grant was suppressed.',
            ];
        }
        $effectiveStatus = $fault !== null
            ? TalosCapabilityGrantStatus::REVOKED
            : $status;
        if ($effectiveStatus === TalosCapabilityGrantStatus::ACTIVE
            && $grant->expires_at instanceof CarbonInterface
            && $grant->expires_at->isPast()) {
            $effectiveStatus = TalosCapabilityGrantStatus::EXPIRED;
        }

        return [
            'grant' => [
                'id' => (string) $grant->getKey(),
                'capability' => $capability->value,
                'tool_id' => $grant->tool_id,
                'actions' => $valid ? array_values($actions) : $canonicalActions,
                'scope' => $scope?->value ?? TalosCapabilityGrantScope::ONCE->value,
                'scope_id' => $scope?->requiresScopeId() === true ? $grant->scope_id : null,
                'status' => $effectiveStatus->value,
                'granted_at' => $this->date($grant->granted_at) ?? '1970-01-01T00:00:00.000000Z',
                'expires_at' => $this->date($grant->expires_at),
                'risk_acknowledged' => (bool) $grant->risk_acknowledged,
            ],
            'fault' => $fault,
        ];
    }

    /** @return list<string> */
    private function actionValues(TalosCapability $capability): array
    {
        return array_map(
            static fn (TalosCapabilityAction $action): string => $action->value,
            $capability->actions(),
        );
    }

    /** @param mixed $actions @param list<string> $allowed */
    private function validActionSubset(mixed $actions, array $allowed): bool
    {
        return is_array($actions)
            && $actions !== []
            && array_is_list($actions)
            && count($actions) === count(array_unique($actions, SORT_STRING))
            && array_diff($actions, $allowed) === [];
    }

    /** @return array<string, mixed> */
    private function fault(
        string $code,
        TalosCapability $capability,
        TalosCapabilityPolicy $policy,
    ): array {
        return [
            'code' => $code,
            'capability' => $capability->value,
            'policy_id' => (string) $policy->getKey(),
            'message' => 'A malformed capability policy was forced to deny.',
        ];
    }

    private function date(mixed $value): ?string
    {
        return $value instanceof CarbonInterface ? $value->toJSON() : null;
    }

    /** @return list<string> */
    private function masterCapabilities(bool $eligible): array
    {
        return array_values(array_map(
            static fn (TalosCapability $capability): string => $capability->value,
            array_filter(
                TalosCapability::cases(),
                static fn (TalosCapability $capability): bool => $capability->masterEnableEligible() === $eligible,
            ),
        ));
    }
}
