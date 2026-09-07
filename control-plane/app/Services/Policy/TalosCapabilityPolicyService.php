<?php

declare(strict_types=1);

namespace App\Services\Policy;

use App\Models\TalosAuditEvent;
use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class TalosCapabilityPolicyService
{
    public const SESSION_TTL_DEFAULT_SECONDS = 28800;

    public const SESSION_TTL_MAX_SECONDS = 86400;

    private const SESSION_TTL_MIN_SECONDS = 60;

    /** @return array<string, mixed> */
    public function snapshot(User $user): array
    {
        return DB::transaction(function () use ($user): array {
            $set = TalosCapabilityPolicySet::query()
                ->ownedBy((int) $user->id)
                ->lockForUpdate()
                ->first();
            if (! $set instanceof TalosCapabilityPolicySet) {
                return $this->snapshotFromSet(null);
            }

            $this->assertSupportedSchema($set);
            $set->load('policies');
            $this->normalizeExpiredPolicies($user, $set);
            $set->load('policies');

            return $this->snapshotFromSet($set);
        });
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function evaluate(User $user, string $capability, array $context = []): TalosPolicyOutcome
    {
        $capabilityValue = $this->capability($capability);

        return DB::transaction(function () use ($user, $capabilityValue, $context): TalosPolicyOutcome {
            $set = TalosCapabilityPolicySet::query()
                ->ownedBy((int) $user->id)
                ->lockForUpdate()
                ->first();
            if (! $set instanceof TalosCapabilityPolicySet) {
                $outcome = $this->outcome(
                    $capabilityValue,
                    TalosCapabilityDecision::ASK,
                    'default_ask',
                    0,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            $this->assertSupportedSchema($set);
            $entry = TalosCapabilityPolicy::query()
                ->where('policy_set_id', $set->id)
                ->where('capability', $capabilityValue->value)
                ->lockForUpdate()
                ->first();
            if (! $entry instanceof TalosCapabilityPolicy) {
                $outcome = $this->outcome(
                    $capabilityValue,
                    TalosCapabilityDecision::ASK,
                    'default_ask',
                    (int) $set->revision,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            $storedDecision = TalosCapabilityDecision::tryFrom((string) $entry->decision);
            if (! $storedDecision instanceof TalosCapabilityDecision) {
                $outcome = $this->outcome(
                    $capabilityValue,
                    TalosCapabilityDecision::DENY,
                    'invalid_stored_decision',
                    (int) $set->revision,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            if ($storedDecision === TalosCapabilityDecision::ALLOW_FOR_SESSION) {
                if ($entry->talos_session_id === null || $entry->expires_at === null || $entry->expires_at->isPast()) {
                    $entry->forceFill([
                        'decision' => TalosCapabilityDecision::ASK->value,
                        'talos_session_id' => null,
                        'expires_at' => null,
                    ])->save();
                    $set->forceFill(['revision' => ((int) $set->revision) + 1])->save();
                    $this->audit($user, 'capability_policy.expired', $set, [
                        'capability' => $capabilityValue->value,
                        'decision' => TalosCapabilityDecision::ASK->value,
                        'revision' => (int) $set->revision,
                    ]);
                    $outcome = $this->outcome(
                        $capabilityValue,
                        TalosCapabilityDecision::ASK,
                        'session_expired',
                        (int) $set->revision,
                    );
                    $this->auditEvaluation($user, $outcome);

                    return $outcome;
                }

                $currentSessionId = $context['session_id'] ?? null;
                if (! is_string($currentSessionId) || ! hash_equals((string) $entry->talos_session_id, $currentSessionId)) {
                    $outcome = $this->outcome(
                        $capabilityValue,
                        TalosCapabilityDecision::ASK,
                        'session_mismatch',
                        (int) $set->revision,
                    );
                    $this->auditEvaluation($user, $outcome);

                    return $outcome;
                }
            }

            if (! $storedDecision->allows()) {
                $reason = $storedDecision === TalosCapabilityDecision::DENY ? 'explicit_deny' : 'explicit_ask';
                $outcome = $this->outcome(
                    $capabilityValue,
                    $storedDecision,
                    $reason,
                    (int) $set->revision,
                );
                $this->auditEvaluation($user, $outcome);

                return $outcome;
            }

            $entry->forceFill(['last_used_at' => now()])->save();
            $outcome = $this->outcome(
                $capabilityValue,
                $storedDecision,
                'explicit_allow',
                (int) $set->revision,
                $entry,
            );
            $this->audit($user, 'capability_policy.used', $set, [
                'capability' => $capabilityValue->value,
                'decision' => $storedDecision->value,
                'outcome' => 'allow',
                'revision' => (int) $set->revision,
                'session_id' => $entry->talos_session_id,
            ]);

            return $outcome;
        });
    }

    /**
     * @param  array<string, mixed>  $context
     */
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
     * @param  array<string, mixed>  $context
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
        $authority = $this->authorityContext($user, $capabilityValue, $decisionValue, $context);

        return DB::transaction(function () use (
            $user,
            $capabilityValue,
            $decisionValue,
            $expectedRevision,
            $authority,
        ): array {
            $set = $this->policySetForUpdate($user);
            $this->assertExpectedRevision($set, $expectedRevision);
            $entry = TalosCapabilityPolicy::query()
                ->where('policy_set_id', $set->id)
                ->where('capability', $capabilityValue->value)
                ->lockForUpdate()
                ->first();
            $previousDecision = $entry instanceof TalosCapabilityPolicy
                ? TalosCapabilityDecision::tryFrom((string) $entry->decision)
                : null;

            if (! $entry instanceof TalosCapabilityPolicy) {
                $entry = new TalosCapabilityPolicy([
                    'policy_set_id' => $set->id,
                    'capability' => $capabilityValue->value,
                ]);
            }
            $entry->forceFill([
                'decision' => $decisionValue->value,
                'talos_session_id' => $authority['session_id'],
                'expires_at' => $authority['expires_at'],
            ])->save();
            $set->forceFill(['revision' => ((int) $set->revision) + 1])->save();

            $this->audit(
                $user,
                $previousDecision === null ? 'capability_policy.created' : 'capability_policy.changed',
                $set,
                [
                    'capability' => $capabilityValue->value,
                    'decision' => $decisionValue->value,
                    'previous_decision' => $previousDecision?->value,
                    'revision' => (int) $set->revision,
                    'session_id' => $entry->talos_session_id,
                    'expires_at' => $entry->expires_at?->toJSON(),
                ],
            );
            if ($previousDecision?->allows() && ! $decisionValue->allows()) {
                $this->audit($user, 'capability_policy.revoked', $set, [
                    'capability' => $capabilityValue->value,
                    'decision' => $decisionValue->value,
                    'previous_decision' => $previousDecision->value,
                    'revision' => (int) $set->revision,
                ]);
            }

            $set->load('policies');

            return $this->snapshotFromSet($set);
        });
    }

    /** @return array<string, mixed> */
    public function masterEnable(User $user, int $expectedRevision, bool $warningAcknowledged): array
    {
        if (! $warningAcknowledged) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_MASTER_ACK_REQUIRED',
                'Master enable requires explicit acknowledgement of the enabled capabilities and exclusions.',
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

                TalosCapabilityPolicy::query()->updateOrCreate([
                    'policy_set_id' => $set->id,
                    'capability' => $capability->value,
                ], [
                    'decision' => TalosCapabilityDecision::ALLOW_UNTIL_REVOKED->value,
                    'talos_session_id' => null,
                    'expires_at' => null,
                ]);
                $enabled[] = $capability->value;
            }

            $set->forceFill(['revision' => ((int) $set->revision) + 1])->save();
            $this->audit($user, 'capability_policy.master_enabled', $set, [
                'enabled_capabilities' => $enabled,
                'excluded_capabilities' => $excluded,
                'revision' => (int) $set->revision,
            ]);
            $set->load('policies');

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
        return $this->update(
            $user,
            $capability,
            TalosCapabilityDecision::DENY->value,
            $expectedRevision,
        );
    }

    /** @return array<string, mixed> */
    public function revokeAll(User $user): array
    {
        return DB::transaction(function () use ($user): array {
            $set = $this->policySetForUpdate($user);

            foreach (TalosCapability::cases() as $capability) {
                TalosCapabilityPolicy::query()->updateOrCreate([
                    'policy_set_id' => $set->id,
                    'capability' => $capability->value,
                ], [
                    'decision' => TalosCapabilityDecision::DENY->value,
                    'talos_session_id' => null,
                    'expires_at' => null,
                ]);
            }

            $set->forceFill(['revision' => ((int) $set->revision) + 1])->save();
            $this->audit($user, 'capability_policy.revoke_all', $set, [
                'capabilities' => TalosCapability::values(),
                'decision' => TalosCapabilityDecision::DENY->value,
                'revision' => (int) $set->revision,
            ]);
            $set->load('policies');

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

    /**
     * @param  array<string, mixed>  $context
     * @return array{session_id: ?string, expires_at: mixed}
     */
    private function authorityContext(
        User $user,
        TalosCapability $capability,
        TalosCapabilityDecision $decision,
        array $context,
    ): array {
        if ($capability->requiresRiskAcknowledgement($decision) && ($context['risk_acknowledged'] ?? null) !== true) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_RISK_ACK_REQUIRED',
                'This high-risk capability requires explicit acknowledgement.',
                422,
                'risk_acknowledged',
                ['capability' => $capability->value, 'risk' => $capability->risk()->value],
            );
        }

        if (! $decision->requiresSession()) {
            if (($context['session_id'] ?? null) !== null || ($context['session_ttl_seconds'] ?? null) !== null) {
                throw new TalosCapabilityPolicyException(
                    'TALOS_CAPABILITY_SESSION_NOT_ALLOWED',
                    'Session fields are only valid for allow_for_session.',
                    422,
                    'session_id',
                );
            }

            return ['session_id' => null, 'expires_at' => null];
        }

        $sessionId = $context['session_id'] ?? null;
        if (! is_string($sessionId) || ! TalosSession::query()
            ->whereKey($sessionId)
            ->where('user_id', $user->id)
            ->exists()) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_SESSION_INVALID',
                'Session authority requires an existing session owned by the authenticated user.',
                422,
                'session_id',
            );
        }

        $ttl = $context['session_ttl_seconds'] ?? self::SESSION_TTL_DEFAULT_SECONDS;
        if (! is_int($ttl) || $ttl < self::SESSION_TTL_MIN_SECONDS || $ttl > self::SESSION_TTL_MAX_SECONDS) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_SESSION_TTL_INVALID',
                'Session authority must expire between 60 seconds and 24 hours.',
                422,
                'session_ttl_seconds',
            );
        }

        return [
            'session_id' => $sessionId,
            'expires_at' => now()->addSeconds($ttl),
        ];
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
                'schema_version' => TalosCapabilityPolicySet::SCHEMA_VERSION,
                'revision' => 0,
            ]);
        }

        $this->assertSupportedSchema($set);

        return $set;
    }

    private function assertSupportedSchema(TalosCapabilityPolicySet $set): void
    {
        if ((int) $set->schema_version === TalosCapabilityPolicySet::SCHEMA_VERSION) {
            return;
        }

        throw new TalosCapabilityPolicyException(
            'TALOS_CAPABILITY_POLICY_SCHEMA_UNSUPPORTED',
            'The stored capability policy schema is not supported by this TALOS build.',
            500,
            null,
            [
                'expected' => TalosCapabilityPolicySet::SCHEMA_VERSION,
                'actual' => (int) $set->schema_version,
            ],
        );
    }

    private function assertExpectedRevision(TalosCapabilityPolicySet $set, int $expectedRevision): void
    {
        if ($expectedRevision === (int) $set->revision) {
            return;
        }

        $set->load('policies');

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

    private function normalizeExpiredPolicies(User $user, TalosCapabilityPolicySet $set): void
    {
        $expired = $set->policies->filter(static function (TalosCapabilityPolicy $entry): bool {
            if ($entry->decision !== TalosCapabilityDecision::ALLOW_FOR_SESSION->value) {
                return false;
            }

            return $entry->talos_session_id === null
                || $entry->expires_at === null
                || $entry->expires_at->isPast();
        });
        if ($expired->isEmpty()) {
            return;
        }

        foreach ($expired as $entry) {
            $entry->forceFill([
                'decision' => TalosCapabilityDecision::ASK->value,
                'talos_session_id' => null,
                'expires_at' => null,
            ])->save();
            $this->audit($user, 'capability_policy.expired', $set, [
                'capability' => (string) $entry->capability,
                'decision' => TalosCapabilityDecision::ASK->value,
                'revision' => ((int) $set->revision) + 1,
            ]);
        }

        $set->forceFill(['revision' => ((int) $set->revision) + 1])->save();
    }

    /** @return array<string, mixed> */
    private function snapshotFromSet(?TalosCapabilityPolicySet $set): array
    {
        /** @var Collection<int, TalosCapabilityPolicy> $policies */
        $policies = $set?->relationLoaded('policies') === true
            ? $set->policies
            : collect();
        $byCapability = $policies->keyBy(
            static fn (TalosCapabilityPolicy $entry): string => (string) $entry->capability,
        );
        $entries = [];

        foreach (TalosCapability::cases() as $capability) {
            $entry = $byCapability->get($capability->value);
            $decision = $entry instanceof TalosCapabilityPolicy
                ? TalosCapabilityDecision::tryFrom((string) $entry->decision)
                : null;
            $source = $entry instanceof TalosCapabilityPolicy ? 'explicit' : 'default';
            if ($entry instanceof TalosCapabilityPolicy && $decision === null) {
                $decision = TalosCapabilityDecision::DENY;
                $source = 'invalid';
            }
            $entries[] = [
                ...$capability->toMetadataArray(),
                'decision' => ($decision ?? TalosCapabilityDecision::ASK)->value,
                'source' => $source,
                'session_id' => $entry?->talos_session_id,
                'expires_at' => $entry?->expires_at?->toJSON(),
                'last_used_at' => $entry?->last_used_at?->toJSON(),
            ];
        }

        return [
            'schema_version' => TalosCapabilityPolicySet::SCHEMA_VERSION,
            'revision' => (int) ($set?->revision ?? 0),
            'capabilities' => $entries,
            'master_enable' => [
                'eligible' => array_values(array_map(
                    static fn (TalosCapability $capability): string => $capability->value,
                    array_filter(
                        TalosCapability::cases(),
                        static fn (TalosCapability $capability): bool => $capability->masterEnableEligible(),
                    ),
                )),
                'excluded' => array_values(array_map(
                    static fn (TalosCapability $capability): string => $capability->value,
                    array_filter(
                        TalosCapability::cases(),
                        static fn (TalosCapability $capability): bool => ! $capability->masterEnableEligible(),
                    ),
                )),
            ],
        ];
    }

    private function outcome(
        TalosCapability $capability,
        TalosCapabilityDecision $decision,
        string $reason,
        int $revision,
        ?TalosCapabilityPolicy $entry = null,
    ): TalosPolicyOutcome {
        return new TalosPolicyOutcome(
            capability: $capability,
            risk: $capability->risk(),
            decision: $decision,
            allowed: $decision->allows(),
            requiresApproval: $decision === TalosCapabilityDecision::ASK,
            reason: $reason,
            revision: $revision,
            sessionId: $entry?->talos_session_id,
            expiresAt: $entry?->expires_at?->toJSON(),
        );
    }

    private function auditEvaluation(User $user, TalosPolicyOutcome $outcome): void
    {
        $this->audit($user, 'capability_policy.evaluated', null, [
            'capability' => $outcome->capability->value,
            'decision' => $outcome->decision->value,
            'outcome' => $outcome->allowed ? 'allow' : ($outcome->requiresApproval ? 'ask' : 'deny'),
            'reason' => $outcome->reason,
            'revision' => $outcome->revision,
            'session_id' => $outcome->sessionId,
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
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
                'schema_version' => TalosCapabilityPolicySet::SCHEMA_VERSION,
                ...$payload,
            ],
            'user',
            (string) $user->id,
        );
    }
}
