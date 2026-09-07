<?php

declare(strict_types=1);

namespace App\Services\Policy;

use App\Models\TalosAuditEvent;
use App\Models\TalosCapabilityGrant;
use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use App\Models\TalosSession;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class TalosCapabilityPolicyService
{
    public const SESSION_TTL_DEFAULT_SECONDS = 28800;

    public const SESSION_TTL_MAX_SECONDS = 86400;

    private const SESSION_TTL_MIN_SECONDS = 60;

    public function __construct(
        private readonly TalosCapabilityPolicyContractMapper $mapper,
    ) {}

    /** @return array<string, mixed> */
    public function snapshot(User $user): array
    {
        return $this->snapshotEnvelope($user)['contract'];
    }

    /**
     * @return array{
     *   contract: array<string, mixed>,
     *   catalog: list<array<string, mixed>>,
     *   master_enable: array<string, list<string>>,
     *   faults: list<array<string, mixed>>
     * }
     */
    public function snapshotEnvelope(User $user): array
    {
        return DB::transaction(function () use ($user): array {
            $set = TalosCapabilityPolicySet::query()
                ->ownedBy((int) $user->id)
                ->lockForUpdate()
                ->first();
            if (! $set instanceof TalosCapabilityPolicySet) {
                return $this->mappedEnvelope(null);
            }

            $this->assertSupportedSchema($set);
            $this->normalizeExpiredGrants($user, $set);

            return $this->mappedEnvelope($set);
        });
    }

    /** @param array<string, mixed> $context */
    public function evaluate(User $user, string $capability, array $context = []): TalosPolicyOutcome
    {
        $capabilityValue = $this->capability($capability);
        $actions = $this->requestedActions($capabilityValue, $context['actions'] ?? null);
        $toolId = $this->optionalIdentifier($context['tool_id'] ?? null, 'tool_id');

        return DB::transaction(function () use ($user, $capabilityValue, $actions, $toolId, $context): TalosPolicyOutcome {
            $set = TalosCapabilityPolicySet::query()
                ->ownedBy((int) $user->id)
                ->lockForUpdate()
                ->first();
            if (! $set instanceof TalosCapabilityPolicySet) {
                $outcome = $this->outcome(
                    $capabilityValue,
                    $actions,
                    TalosCapabilityDecision::ASK,
                    false,
                    true,
                    'default_ask',
                    0,
                    toolId: $toolId,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            $this->assertSupportedSchema($set);
            $this->normalizeExpiredGrants($user, $set);
            $policy = TalosCapabilityPolicy::query()
                ->where('policy_set_id', $set->id)
                ->where('capability', $capabilityValue->value)
                ->lockForUpdate()
                ->first();
            $baseline = $this->mapper->baselineFromStoredPolicy($capabilityValue, $policy);
            if ($baseline['fault'] !== null) {
                $this->audit($user, 'capability_policy.invalid_record', $set, [
                    ...$baseline['fault'],
                    'revision' => (int) $set->revision,
                ]);
                $outcome = $this->outcome(
                    $capabilityValue,
                    $actions,
                    TalosCapabilityDecision::DENY,
                    false,
                    false,
                    'invalid_stored_decision',
                    (int) $set->revision,
                    toolId: $toolId,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            $decision = TalosCapabilityDecision::from($baseline['decision']);
            if ($decision === TalosCapabilityDecision::DENY) {
                $outcome = $this->outcome(
                    $capabilityValue,
                    $actions,
                    $decision,
                    false,
                    false,
                    'explicit_deny',
                    (int) $set->revision,
                    toolId: $toolId,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            $grant = $this->matchingPersistedGrant($set, $capabilityValue, $actions, $toolId, $context);
            if ($grant instanceof TalosCapabilityGrant) {
                $revision = $this->useGrant($user, $set, $grant);
                $this->touchPolicy($policy);
                $outcome = $this->outcome(
                    $capabilityValue,
                    $actions,
                    $decision,
                    true,
                    false,
                    'active_grant',
                    $revision,
                    grantId: (string) $grant->id,
                    grantScope: (string) $grant->scope,
                    toolId: $toolId,
                    expiresAt: $grant->expires_at?->toJSON(),
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            if ($policy instanceof TalosCapabilityPolicy) {
                $legacyGrant = $this->mapper->legacyGrantFromStoredPolicy($capabilityValue, $policy);
                if (is_array($legacyGrant)
                    && $legacyGrant['status'] === TalosCapabilityGrantStatus::ACTIVE->value
                    && $this->arrayGrantMatches($legacyGrant, $actions, $toolId, $context)) {
                    $this->touchPolicy($policy);
                    $outcome = $this->outcome(
                        $capabilityValue,
                        $actions,
                        $decision,
                        true,
                        false,
                        'legacy_active_grant',
                        (int) $set->revision,
                        grantId: $legacyGrant['id'],
                        grantScope: $legacyGrant['scope'],
                        toolId: $toolId,
                        expiresAt: $legacyGrant['expires_at'],
                    );
                    $this->auditEvaluation($user, $outcome);

                    return $outcome;
                }
            }

            if ($decision === TalosCapabilityDecision::ALLOW) {
                $this->touchPolicy($policy);
                $outcome = $this->outcome(
                    $capabilityValue,
                    $actions,
                    $decision,
                    true,
                    false,
                    'explicit_allow',
                    (int) $set->revision,
                    toolId: $toolId,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            $outcome = $this->outcome(
                $capabilityValue,
                $actions,
                TalosCapabilityDecision::ASK,
                false,
                true,
                $policy instanceof TalosCapabilityPolicy ? 'explicit_ask' : 'default_ask',
                (int) $set->revision,
                toolId: $toolId,
            );
            $this->auditEvaluation($user, $outcome);

            return $outcome;
        });
    }

    /** @param array<string, mixed> $context */
    public function authorize(User $user, string $capability, array $context = []): TalosPolicyOutcome
    {
        $outcome = $this->evaluate($user, $capability, $context);
        if ($outcome->allowed) {
            return $outcome;
        }

        throw new TalosCapabilityPolicyException(
            $outcome->requiresApproval ? 'TALOS_CAPABILITY_APPROVAL_REQUIRED' : 'TALOS_CAPABILITY_DENIED',
            $outcome->requiresApproval
                ? 'This action requires explicit user approval.'
                : 'This action is denied by the current capability policy.',
            403,
            'capability',
            ['outcome' => $outcome->toArray()],
        );
    }

    /**
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function update(
        User $user,
        string $capability,
        string $decision,
        int $expectedRevision,
        array $context = [],
    ): array {
        $capabilityValue = $this->capability($capability);
        $decisionValue = $this->decision($decision);
        $riskAcknowledged = ($context['risk_acknowledged'] ?? null) === true;
        $this->assertRiskAcknowledged($capabilityValue, $decisionValue->allows(), $riskAcknowledged);
        if (($context['session_id'] ?? null) !== null || ($context['session_ttl_seconds'] ?? null) !== null) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_SESSION_NOT_ALLOWED',
                'Duration is represented by a separate capability grant, not by a baseline decision.',
                422,
                'session_id',
            );
        }

        return DB::transaction(function () use (
            $user,
            $capabilityValue,
            $decisionValue,
            $expectedRevision,
            $riskAcknowledged,
        ): array {
            $set = $this->policySetForUpdate($user);
            $this->assertExpectedRevision($set, $expectedRevision);
            $policy = TalosCapabilityPolicy::query()
                ->where('policy_set_id', $set->id)
                ->where('capability', $capabilityValue->value)
                ->lockForUpdate()
                ->first();
            $previous = $this->mapper->baselineFromStoredPolicy($capabilityValue, $policy);
            if (! $policy instanceof TalosCapabilityPolicy) {
                $policy = new TalosCapabilityPolicy([
                    'policy_set_id' => $set->id,
                    'capability' => $capabilityValue->value,
                ]);
            }
            $policy->forceFill([
                ...$this->legacyArchive($policy),
                'actions' => $this->actionValues($capabilityValue),
                'decision' => $decisionValue->value,
                'source' => 'user',
                'talos_session_id' => null,
                'expires_at' => null,
            ])->save();

            $revokedGrantIds = $this->revokeActiveGrants($set, $capabilityValue->value);
            if ($decisionValue === TalosCapabilityDecision::ALLOW) {
                $this->createAccountGrant($set, $capabilityValue, $riskAcknowledged);
            }

            $this->advanceRevision($set);
            $this->audit(
                $user,
                $previous['source'] === 'default' ? 'capability_policy.created' : 'capability_policy.changed',
                $set,
                [
                    'capability' => $capabilityValue->value,
                    'actions' => $this->actionValues($capabilityValue),
                    'decision' => $decisionValue->value,
                    'previous_decision' => $previous['decision'],
                    'source' => 'user',
                    'risk_acknowledged' => $riskAcknowledged,
                    'revoked_grant_ids' => $revokedGrantIds,
                    'revision' => (int) $set->revision,
                ],
            );
            if ($previous['decision'] === TalosCapabilityDecision::ALLOW->value && ! $decisionValue->allows()) {
                $this->audit($user, 'capability_policy.revoked', $set, [
                    'capability' => $capabilityValue->value,
                    'decision' => $decisionValue->value,
                    'revision' => (int) $set->revision,
                ]);
            }

            return $this->snapshotFromSet($set);
        });
    }

    /** @param array<string, mixed> $grant @return array<string, mixed> */
    public function createGrant(
        User $user,
        string $capability,
        int $expectedRevision,
        array $grant,
    ): array {
        $capabilityValue = $this->capability($capability);
        $scope = $this->grantScope((string) ($grant['scope'] ?? ''));
        $actions = $this->requestedActions($capabilityValue, $grant['actions'] ?? null);
        $toolId = $this->optionalIdentifier($grant['tool_id'] ?? null, 'tool_id');
        $riskAcknowledged = ($grant['risk_acknowledged'] ?? null) === true;
        $this->assertRiskAcknowledged($capabilityValue, true, $riskAcknowledged);
        $authority = $this->grantAuthority($user, $scope, $grant);

        return DB::transaction(function () use (
            $user,
            $capabilityValue,
            $expectedRevision,
            $scope,
            $actions,
            $toolId,
            $riskAcknowledged,
            $authority,
        ): array {
            $set = $this->policySetForUpdate($user);
            $this->assertExpectedRevision($set, $expectedRevision);
            $policy = TalosCapabilityPolicy::query()
                ->where('policy_set_id', $set->id)
                ->where('capability', $capabilityValue->value)
                ->lockForUpdate()
                ->first();
            $baseline = $this->mapper->baselineFromStoredPolicy($capabilityValue, $policy);
            if ($baseline['decision'] === TalosCapabilityDecision::DENY->value) {
                throw new TalosCapabilityPolicyException(
                    'TALOS_CAPABILITY_GRANT_DENIED',
                    'An explicit deny must be changed before a grant can be created.',
                    422,
                    'capability',
                    ['capability' => $capabilityValue->value],
                );
            }

            $created = TalosCapabilityGrant::query()->create([
                'policy_set_id' => $set->id,
                'capability' => $capabilityValue->value,
                'tool_id' => $toolId,
                'actions' => $actions,
                'scope' => $scope->value,
                'scope_id' => $authority['scope_id'],
                'status' => TalosCapabilityGrantStatus::ACTIVE->value,
                'granted_at' => now(),
                'expires_at' => $authority['expires_at'],
                'risk_acknowledged' => $riskAcknowledged,
            ]);
            $this->advanceRevision($set);
            $this->audit($user, 'capability_grant.created', $set, [
                'grant_id' => (string) $created->id,
                'capability' => $capabilityValue->value,
                'actions' => $actions,
                'scope' => $scope->value,
                'scope_id' => $authority['scope_id'],
                'tool_id' => $toolId,
                'expires_at' => $created->expires_at?->toJSON(),
                'risk_acknowledged' => $riskAcknowledged,
                'revision' => (int) $set->revision,
            ]);

            return $this->snapshotFromSet($set);
        });
    }

    /** @return array<string, mixed> */
    public function revokeGrant(User $user, string $grantId, int $expectedRevision): array
    {
        return DB::transaction(function () use ($user, $grantId, $expectedRevision): array {
            $set = $this->policySetForUpdate($user);
            $this->assertExpectedRevision($set, $expectedRevision);
            $grant = TalosCapabilityGrant::query()
                ->where('policy_set_id', $set->id)
                ->whereKey($grantId)
                ->lockForUpdate()
                ->first();
            if (! $grant instanceof TalosCapabilityGrant) {
                $legacyPolicy = $this->legacyPolicyForGrantId($set, $grantId);
                if ($legacyPolicy instanceof TalosCapabilityPolicy) {
                    $capability = TalosCapability::from((string) $legacyPolicy->capability);
                    $legacyPolicy->forceFill([
                        ...$this->legacyArchive($legacyPolicy),
                        'actions' => $this->actionValues($capability),
                        'decision' => TalosCapabilityDecision::ASK->value,
                        'source' => 'user',
                        'talos_session_id' => null,
                        'expires_at' => null,
                    ])->save();
                    $this->advanceRevision($set);
                    $this->audit($user, 'capability_grant.revoked', $set, [
                        'grant_id' => $grantId,
                        'capability' => $capability->value,
                        'legacy_compatibility_grant' => true,
                        'revision' => (int) $set->revision,
                    ]);

                    return $this->snapshotFromSet($set);
                }

                throw new TalosCapabilityPolicyException(
                    'TALOS_CAPABILITY_GRANT_UNKNOWN',
                    'The requested capability grant was not found.',
                    404,
                    'grant_id',
                    ['grant_id' => $grantId],
                );
            }
            if ($grant->status === TalosCapabilityGrantStatus::ACTIVE->value) {
                $grant->forceFill([
                    'status' => TalosCapabilityGrantStatus::REVOKED->value,
                    'revoked_at' => now(),
                ])->save();
                if ($grant->scope === TalosCapabilityGrantScope::ACCOUNT->value) {
                    TalosCapabilityPolicy::query()
                        ->where('policy_set_id', $set->id)
                        ->where('capability', $grant->capability)
                        ->where('decision', TalosCapabilityDecision::ALLOW->value)
                        ->update(['decision' => TalosCapabilityDecision::ASK->value, 'source' => 'user']);
                }
                $this->advanceRevision($set);
                $this->audit($user, 'capability_grant.revoked', $set, [
                    'grant_id' => (string) $grant->id,
                    'capability' => (string) $grant->capability,
                    'revision' => (int) $set->revision,
                ]);
            }

            return $this->snapshotFromSet($set);
        });
    }

    /** @return array<string, mixed> */
    public function masterEnable(User $user, int $expectedRevision, bool $warningAcknowledged): array
    {
        if (! $warningAcknowledged) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_MASTER_ACK_REQUIRED',
                'Master enable requires explicit acknowledgement of enabled capabilities and exclusions.',
                422,
                'warning_acknowledged',
            );
        }

        return DB::transaction(function () use ($user, $expectedRevision): array {
            $set = $this->policySetForUpdate($user);
            $this->assertExpectedRevision($set, $expectedRevision);
            $enabled = [];
            $excluded = [];

            foreach (TalosCapability::cases() as $capability) {
                if (! $capability->masterEnableEligible()) {
                    $excluded[] = $capability->value;
                    continue;
                }
                $policy = TalosCapabilityPolicy::query()
                    ->where('policy_set_id', $set->id)
                    ->where('capability', $capability->value)
                    ->lockForUpdate()
                    ->first();
                if (! $policy instanceof TalosCapabilityPolicy) {
                    $policy = new TalosCapabilityPolicy([
                        'policy_set_id' => $set->id,
                        'capability' => $capability->value,
                    ]);
                }
                $policy->forceFill([
                    ...$this->legacyArchive($policy),
                    'actions' => $this->actionValues($capability),
                    'decision' => TalosCapabilityDecision::ALLOW->value,
                    'source' => 'user',
                    'talos_session_id' => null,
                    'expires_at' => null,
                ])->save();
                $this->revokeActiveGrants($set, $capability->value);
                $this->createAccountGrant($set, $capability, true);
                $enabled[] = $capability->value;
            }

            $this->advanceRevision($set);
            $this->audit($user, 'capability_policy.master_enabled', $set, [
                'operation' => 'batch_set',
                'selector' => 'master_enable_eligible',
                'decision' => TalosCapabilityDecision::ALLOW->value,
                'grant_scope' => TalosCapabilityGrantScope::ACCOUNT->value,
                'enabled_capabilities' => $enabled,
                'excluded_capabilities' => $excluded,
                'risk_acknowledged' => true,
                'revision' => (int) $set->revision,
            ]);

            return [
                'policy' => $this->snapshotFromSet($set),
                'enabled_capabilities' => $enabled,
                'excluded_capabilities' => $excluded,
            ];
        });
    }

    /** @return array<string, mixed> */
    public function revoke(User $user, string $capability, int $expectedRevision): array
    {
        return $this->update($user, $capability, TalosCapabilityDecision::DENY->value, $expectedRevision);
    }

    /** @return array<string, mixed> */
    public function revokeAll(User $user, int $expectedRevision): array
    {
        return DB::transaction(function () use ($user, $expectedRevision): array {
            $set = $this->policySetForUpdate($user);
            $this->assertExpectedRevision($set, $expectedRevision);
            $grants = TalosCapabilityGrant::query()
                ->where('policy_set_id', $set->id)
                ->where('status', TalosCapabilityGrantStatus::ACTIVE->value)
                ->lockForUpdate()
                ->get();
            foreach ($grants as $grant) {
                $grant->forceFill([
                    'status' => TalosCapabilityGrantStatus::REVOKED->value,
                    'revoked_at' => now(),
                ])->save();
            }

            $policies = TalosCapabilityPolicy::query()
                ->where('policy_set_id', $set->id)
                ->lockForUpdate()
                ->get();
            foreach ($policies as $policy) {
                $capability = TalosCapability::tryFrom((string) $policy->capability);
                if (! $capability instanceof TalosCapability) {
                    continue;
                }
                $baseline = $this->mapper->baselineFromStoredPolicy($capability, $policy);
                $legacyGrant = $this->mapper->legacyGrantFromStoredPolicy($capability, $policy);
                if ($baseline['decision'] !== TalosCapabilityDecision::ALLOW->value && $legacyGrant === null) {
                    continue;
                }
                $policy->forceFill([
                    ...$this->legacyArchive($policy),
                    'actions' => $this->actionValues($capability),
                    'decision' => TalosCapabilityDecision::ASK->value,
                    'source' => 'user',
                    'talos_session_id' => null,
                    'expires_at' => null,
                ])->save();
            }

            $this->advanceRevision($set);
            $this->audit($user, 'capability_policy.revoke_all', $set, [
                'revoked_grant_ids' => $grants->pluck('id')->values()->all(),
                'preserved_denies' => $policies->where('decision', TalosCapabilityDecision::DENY->value)
                    ->pluck('capability')->values()->all(),
                'revision' => (int) $set->revision,
            ]);

            return $this->snapshotFromSet($set);
        });
    }

    private function capability(string $value): TalosCapability
    {
        $capability = TalosCapability::tryFrom($value);
        if ($capability instanceof TalosCapability) {
            return $capability;
        }

        throw new TalosCapabilityPolicyException(
            'TALOS_CAPABILITY_UNKNOWN',
            'The requested TALOS capability is not registered.',
            422,
            'capability',
            ['capability' => $value],
        );
    }

    private function decision(string $value): TalosCapabilityDecision
    {
        $decision = TalosCapabilityDecision::tryFrom($value);
        if ($decision instanceof TalosCapabilityDecision) {
            return $decision;
        }

        throw new TalosCapabilityPolicyException(
            'TALOS_CAPABILITY_DECISION_UNKNOWN',
            'The requested capability decision is not registered.',
            422,
            'decision',
            ['decision' => $value],
        );
    }

    private function grantScope(string $value): TalosCapabilityGrantScope
    {
        $scope = TalosCapabilityGrantScope::tryFrom($value);
        if ($scope instanceof TalosCapabilityGrantScope) {
            return $scope;
        }

        throw new TalosCapabilityPolicyException(
            'TALOS_CAPABILITY_GRANT_SCOPE_UNKNOWN',
            'The requested capability grant scope is not registered.',
            422,
            'scope',
            ['scope' => $value],
        );
    }

    /** @param array<string, mixed> $grant @return array{scope_id: ?string, expires_at: mixed} */
    private function grantAuthority(User $user, TalosCapabilityGrantScope $scope, array $grant): array
    {
        $scopeId = $this->optionalIdentifier($grant['scope_id'] ?? null, 'scope_id');
        if ($scope->requiresScopeId() && $scopeId === null) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_GRANT_SCOPE_ID_REQUIRED',
                'Session and device grants require a scope identifier.',
                422,
                'scope_id',
            );
        }
        if (! $scope->requiresScopeId() && $scopeId !== null) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_GRANT_SCOPE_ID_FORBIDDEN',
                'Once and account grants cannot carry a scope identifier.',
                422,
                'scope_id',
            );
        }
        if ($scope !== TalosCapabilityGrantScope::SESSION) {
            if (($grant['session_ttl_seconds'] ?? null) !== null) {
                throw new TalosCapabilityPolicyException(
                    'TALOS_CAPABILITY_GRANT_TTL_FORBIDDEN',
                    'Session TTL is only valid for a session grant.',
                    422,
                    'session_ttl_seconds',
                );
            }

            return ['scope_id' => $scopeId, 'expires_at' => null];
        }

        if (! TalosSession::query()->whereKey($scopeId)->where('user_id', $user->id)->exists()) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_SESSION_INVALID',
                'Session authority requires an existing session owned by the authenticated user.',
                422,
                'scope_id',
            );
        }
        $ttl = $grant['session_ttl_seconds'] ?? self::SESSION_TTL_DEFAULT_SECONDS;
        if (! is_int($ttl) || $ttl < self::SESSION_TTL_MIN_SECONDS || $ttl > self::SESSION_TTL_MAX_SECONDS) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_SESSION_TTL_INVALID',
                'Session authority must expire between 60 seconds and 24 hours.',
                422,
                'session_ttl_seconds',
            );
        }

        return ['scope_id' => $scopeId, 'expires_at' => now()->addSeconds($ttl)];
    }

    private function policySetForUpdate(User $user): TalosCapabilityPolicySet
    {
        $set = TalosCapabilityPolicySet::query()
            ->ownedBy((int) $user->id)
            ->lockForUpdate()
            ->first();
        if (! $set instanceof TalosCapabilityPolicySet) {
            $set = TalosCapabilityPolicySet::query()->create([
                'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
                'user_id' => (int) $user->id,
                'schema_version' => TalosCapabilityPolicySet::PERSISTENCE_SCHEMA_VERSION,
                'revision' => 0,
            ]);
        }
        $this->assertSupportedSchema($set);

        return $set;
    }

    private function assertSupportedSchema(TalosCapabilityPolicySet $set): void
    {
        if (in_array((int) $set->schema_version, [
            TalosCapabilityPolicySet::CONTRACT_SCHEMA_VERSION,
            TalosCapabilityPolicySet::PERSISTENCE_SCHEMA_VERSION,
        ], true)) {
            return;
        }

        throw new TalosCapabilityPolicyException(
            'TALOS_CAPABILITY_POLICY_SCHEMA_UNSUPPORTED',
            'The stored capability policy schema is not supported by this TALOS build.',
            500,
            null,
            [
                'supported' => [
                    TalosCapabilityPolicySet::CONTRACT_SCHEMA_VERSION,
                    TalosCapabilityPolicySet::PERSISTENCE_SCHEMA_VERSION,
                ],
                'actual' => (int) $set->schema_version,
            ],
        );
    }

    private function assertExpectedRevision(TalosCapabilityPolicySet $set, int $expectedRevision): void
    {
        if ($expectedRevision === (int) $set->revision) {
            return;
        }

        throw new TalosCapabilityPolicyException(
            'TALOS_CAPABILITY_POLICY_REVISION_CONFLICT',
            'Capability policies changed in another session. Reload the latest policies and retry.',
            409,
            'expected_revision',
            [
                'expected_revision' => $expectedRevision,
                'actual_revision' => (int) $set->revision,
            ],
            $this->snapshotFromSet($set),
        );
    }

    private function assertRiskAcknowledged(
        TalosCapability $capability,
        bool $authorityGranted,
        bool $riskAcknowledged,
    ): void {
        if (! $authorityGranted || ! $capability->risk()->isHighOrCritical() || $riskAcknowledged) {
            return;
        }

        throw new TalosCapabilityPolicyException(
            'TALOS_CAPABILITY_RISK_ACK_REQUIRED',
            'This high-risk capability requires explicit acknowledgement.',
            422,
            'risk_acknowledged',
            ['capability' => $capability->value, 'risk' => $capability->risk()->value],
        );
    }

    private function normalizeExpiredGrants(User $user, TalosCapabilityPolicySet $set): void
    {
        $expired = TalosCapabilityGrant::query()
            ->where('policy_set_id', $set->id)
            ->where('status', TalosCapabilityGrantStatus::ACTIVE->value)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->lockForUpdate()
            ->get();
        if ($expired->isEmpty()) {
            return;
        }
        foreach ($expired as $grant) {
            $grant->forceFill(['status' => TalosCapabilityGrantStatus::EXPIRED->value])->save();
            $this->audit($user, 'capability_grant.expired', $set, [
                'grant_id' => (string) $grant->id,
                'capability' => (string) $grant->capability,
                'revision' => ((int) $set->revision) + 1,
            ]);
        }
        $this->advanceRevision($set);
    }

    /**
     * @param list<string> $actions
     * @param array<string, mixed> $context
     */
    private function matchingPersistedGrant(
        TalosCapabilityPolicySet $set,
        TalosCapability $capability,
        array $actions,
        ?string $toolId,
        array $context,
    ): ?TalosCapabilityGrant {
        /** @var Collection<int, TalosCapabilityGrant> $grants */
        $grants = TalosCapabilityGrant::query()
            ->where('policy_set_id', $set->id)
            ->where('capability', $capability->value)
            ->where('status', TalosCapabilityGrantStatus::ACTIVE->value)
            ->lockForUpdate()
            ->get();
        $scopeOrder = ['once' => 0, 'session' => 1, 'device' => 2, 'account' => 3];

        return $grants
            ->sortBy(static fn (TalosCapabilityGrant $grant): string => sprintf(
                '%d-%s',
                $scopeOrder[(string) $grant->scope] ?? 9,
                (string) $grant->id,
            ))
            ->first(fn (TalosCapabilityGrant $grant): bool => $this->modelGrantMatches(
                $grant,
                $actions,
                $toolId,
                $context,
            ));
    }

    /** @param list<string> $actions @param array<string, mixed> $context */
    private function modelGrantMatches(
        TalosCapabilityGrant $grant,
        array $actions,
        ?string $toolId,
        array $context,
    ): bool {
        $grantActions = $grant->actions;
        if (! is_array($grantActions) || array_diff($actions, $grantActions) !== []) {
            return false;
        }
        if ($grant->tool_id !== null && ($toolId === null || ! hash_equals((string) $grant->tool_id, $toolId))) {
            return false;
        }

        return $this->scopeMatches((string) $grant->scope, $grant->scope_id, $context);
    }

    /** @param array<string, mixed> $grant @param list<string> $actions @param array<string, mixed> $context */
    private function arrayGrantMatches(array $grant, array $actions, ?string $toolId, array $context): bool
    {
        if (array_diff($actions, $grant['actions']) !== []) {
            return false;
        }
        if ($grant['tool_id'] !== null && ($toolId === null || ! hash_equals($grant['tool_id'], $toolId))) {
            return false;
        }

        return $this->scopeMatches($grant['scope'], $grant['scope_id'], $context);
    }

    /** @param array<string, mixed> $context */
    private function scopeMatches(string $scope, ?string $scopeId, array $context): bool
    {
        return match ($scope) {
            TalosCapabilityGrantScope::ONCE->value,
            TalosCapabilityGrantScope::ACCOUNT->value => true,
            TalosCapabilityGrantScope::SESSION->value => is_string($context['session_id'] ?? null)
                && is_string($scopeId)
                && hash_equals($scopeId, $context['session_id']),
            TalosCapabilityGrantScope::DEVICE->value => is_string($context['device_id'] ?? null)
                && is_string($scopeId)
                && hash_equals($scopeId, $context['device_id']),
            default => false,
        };
    }

    private function useGrant(User $user, TalosCapabilityPolicySet $set, TalosCapabilityGrant $grant): int
    {
        if ($grant->scope === TalosCapabilityGrantScope::ONCE->value) {
            $grant->forceFill([
                'status' => TalosCapabilityGrantStatus::CONSUMED->value,
                'last_used_at' => now(),
                'consumed_at' => now(),
            ])->save();
            $this->advanceRevision($set);
            $this->audit($user, 'capability_grant.consumed', $set, [
                'grant_id' => (string) $grant->id,
                'capability' => (string) $grant->capability,
                'revision' => (int) $set->revision,
            ]);

            return (int) $set->revision;
        }

        DB::table('talos_capability_grants')->where('id', $grant->id)->update(['last_used_at' => now()]);

        return (int) $set->revision;
    }

    private function legacyPolicyForGrantId(
        TalosCapabilityPolicySet $set,
        string $grantId,
    ): ?TalosCapabilityPolicy {
        $policies = TalosCapabilityPolicy::query()
            ->where('policy_set_id', $set->id)
            ->lockForUpdate()
            ->get();
        foreach ($policies as $policy) {
            $capability = TalosCapability::tryFrom((string) $policy->capability);
            if (! $capability instanceof TalosCapability) {
                continue;
            }
            $legacyGrant = $this->mapper->legacyGrantFromStoredPolicy($capability, $policy);
            if (is_array($legacyGrant) && hash_equals((string) $legacyGrant['id'], $grantId)) {
                return $policy;
            }
        }

        return null;
    }

    private function touchPolicy(?TalosCapabilityPolicy $policy): void
    {
        if ($policy instanceof TalosCapabilityPolicy) {
            DB::table('talos_capability_policies')->where('id', $policy->id)->update(['last_used_at' => now()]);
        }
    }

    /** @return list<string> */
    private function revokeActiveGrants(TalosCapabilityPolicySet $set, string $capability): array
    {
        $grants = TalosCapabilityGrant::query()
            ->where('policy_set_id', $set->id)
            ->where('capability', $capability)
            ->where('status', TalosCapabilityGrantStatus::ACTIVE->value)
            ->lockForUpdate()
            ->get();
        foreach ($grants as $grant) {
            $grant->forceFill([
                'status' => TalosCapabilityGrantStatus::REVOKED->value,
                'revoked_at' => now(),
            ])->save();
        }

        return $grants->pluck('id')->values()->all();
    }

    private function createAccountGrant(
        TalosCapabilityPolicySet $set,
        TalosCapability $capability,
        bool $riskAcknowledged,
    ): TalosCapabilityGrant {
        return TalosCapabilityGrant::query()->create([
            'policy_set_id' => $set->id,
            'capability' => $capability->value,
            'tool_id' => null,
            'actions' => $this->actionValues($capability),
            'scope' => TalosCapabilityGrantScope::ACCOUNT->value,
            'scope_id' => null,
            'status' => TalosCapabilityGrantStatus::ACTIVE->value,
            'granted_at' => now(),
            'expires_at' => null,
            'risk_acknowledged' => $riskAcknowledged,
        ]);
    }

    /** @return array<string, mixed> */
    private function legacyArchive(TalosCapabilityPolicy $policy): array
    {
        if ($policy->canonicalized_at !== null) {
            return [];
        }

        return [
            'legacy_decision' => $policy->legacy_decision ?? $policy->decision,
            'legacy_talos_session_id' => $policy->legacy_talos_session_id ?? $policy->talos_session_id,
            'legacy_expires_at' => $policy->legacy_expires_at ?? $policy->expires_at,
            'canonicalized_at' => now(),
        ];
    }

    private function advanceRevision(TalosCapabilityPolicySet $set): void
    {
        $set->forceFill([
            'schema_version' => TalosCapabilityPolicySet::PERSISTENCE_SCHEMA_VERSION,
            'revision' => ((int) $set->revision) + 1,
        ])->save();
    }

    /** @return array<string, mixed> */
    private function snapshotFromSet(TalosCapabilityPolicySet $set): array
    {
        $set->unsetRelation('policies');
        $set->unsetRelation('grants');

        return $this->mapper->snapshot($set)['contract']->toArray();
    }

    /** @return array{contract: array<string, mixed>, catalog: list<array<string, mixed>>, master_enable: array<string, list<string>>, faults: list<array<string, mixed>>} */
    private function mappedEnvelope(?TalosCapabilityPolicySet $set): array
    {
        $mapped = $this->mapper->snapshot($set);

        return [
            'contract' => $mapped['contract']->toArray(),
            'catalog' => $mapped['catalog'],
            'master_enable' => $mapped['master_enable'],
            'faults' => $mapped['faults'],
        ];
    }

    /** @return list<string> */
    private function requestedActions(TalosCapability $capability, mixed $requested): array
    {
        $allowed = $this->actionValues($capability);
        if ($requested === null) {
            return $allowed;
        }
        if (! is_array($requested)
            || $requested === []
            || ! array_is_list($requested)
            || count($requested) !== count(array_unique($requested, SORT_STRING))
            || array_filter($requested, 'is_string') !== $requested
            || array_diff($requested, $allowed) !== []) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_ACTION_INVALID',
                'Requested actions must be a non-empty unique subset of the capability actions.',
                422,
                'actions',
                ['capability' => $capability->value, 'allowed_actions' => $allowed],
            );
        }

        return array_values($requested);
    }

    /** @return list<string> */
    private function actionValues(TalosCapability $capability): array
    {
        return array_map(
            static fn (TalosCapabilityAction $action): string => $action->value,
            $capability->actions(),
        );
    }

    private function optionalIdentifier(mixed $value, string $field): ?string
    {
        if ($value === null) {
            return null;
        }
        if (! is_string($value)
            || trim($value) === ''
            || strlen($value) > 128
            || preg_match('/[\x00-\x1F\x7F]/', $value) === 1) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_IDENTIFIER_INVALID',
                'Capability scope identifiers must be non-empty bounded strings without control characters.',
                422,
                $field,
            );
        }

        return $value;
    }

    private function outcome(
        TalosCapability $capability,
        array $actions,
        TalosCapabilityDecision $decision,
        bool $allowed,
        bool $requiresApproval,
        string $reason,
        int $revision,
        ?string $grantId = null,
        ?string $grantScope = null,
        ?string $toolId = null,
        ?string $expiresAt = null,
    ): TalosPolicyOutcome {
        return new TalosPolicyOutcome(
            capability: $capability,
            risk: $capability->risk(),
            decision: $decision,
            actions: $actions,
            allowed: $allowed,
            requiresApproval: $requiresApproval,
            reason: $reason,
            revision: $revision,
            grantId: $grantId,
            grantScope: $grantScope,
            toolId: $toolId,
            expiresAt: $expiresAt,
        );
    }

    private function auditEvaluation(User $user, TalosPolicyOutcome $outcome): void
    {
        $this->audit($user, 'capability_policy.evaluated', null, [
            'capability' => $outcome->capability->value,
            'actions' => $outcome->actions,
            'decision' => $outcome->decision->value,
            'outcome' => $outcome->allowed ? 'allow' : ($outcome->requiresApproval ? 'ask' : 'deny'),
            'reason' => $outcome->reason,
            'revision' => $outcome->revision,
            'grant_id' => $outcome->grantId,
            'grant_scope' => $outcome->grantScope,
            'tool_id' => $outcome->toolId,
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function audit(
        User $user,
        string $eventType,
        ?TalosCapabilityPolicySet $set,
        array $payload,
    ): void {
        TalosAuditEvent::record(
            $eventType,
            'capability_policy_set',
            (string) ($set?->id ?? TalosCapabilityPolicySet::idForUser((int) $user->id)),
            [
                'schema_version' => TalosCapabilityPolicySet::CONTRACT_SCHEMA_VERSION,
                ...$payload,
            ],
            'user',
            (string) $user->id,
        );
    }
}
