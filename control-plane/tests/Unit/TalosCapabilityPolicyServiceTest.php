<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosAuditEvent;
use App\Models\TalosCapabilityGrant;
use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Policy\TalosCapability;
use App\Services\Policy\TalosCapabilityDecision;
use App\Services\Policy\TalosCapabilityPolicyException;
use App\Services\Policy\TalosCapabilityPolicyService;
use App\Services\Policy\TalosCapabilityRisk;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosCapabilityPolicyServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_v1_vocabulary_has_exact_risk_action_and_master_enable_metadata(): void
    {
        self::assertSame([
            'artifacts.generate',
            'files.write',
            'files.transfer_to_provider',
            'web.search',
            'web.fetch',
            'browser.read',
            'browser.write',
            'browser.upload',
            'email.read',
            'email.send',
            'calendar.read',
            'calendar.write',
            'filesystem.read',
            'filesystem.write',
            'integrations.external',
        ], TalosCapability::values());
        self::assertSame(['deny', 'ask', 'allow'], TalosCapabilityDecision::values());
        self::assertSame(TalosCapabilityRisk::CRITICAL, TalosCapability::FILES_TRANSFER_TO_PROVIDER->risk());
        self::assertSame(['read', 'write', 'outbound'], array_map(
            static fn ($action): string => $action->value,
            TalosCapability::BROWSER_UPLOAD->actions(),
        ));
        self::assertSame([
            'web.search',
            'web.fetch',
            'browser.read',
        ], array_values(array_map(
            static fn (TalosCapability $capability): string => $capability->value,
            array_filter(TalosCapability::cases(), static fn (TalosCapability $capability): bool => $capability->masterEnableEligible()),
        )));
    }

    public function test_missing_policy_is_canonical_ask_and_is_audited(): void
    {
        $user = User::factory()->create();

        $outcome = $this->service()->evaluate($user, 'artifacts.generate');

        self::assertFalse($outcome->allowed);
        self::assertTrue($outcome->requiresApproval);
        self::assertSame(TalosCapabilityDecision::ASK, $outcome->decision);
        self::assertSame('default_ask', $outcome->reason);
        self::assertSame(['write'], $outcome->actions);
        self::assertSame(0, $outcome->revision);
        self::assertSame(0, TalosCapabilityPolicySet::query()->count());
        $this->assertAuditEvent('capability_policy.evaluated', 'artifacts.generate', 'ask');
    }

    public function test_unknown_capability_or_action_fails_closed(): void
    {
        $user = User::factory()->create();

        try {
            $this->service()->evaluate($user, 'browser.anything');
            self::fail('Unknown capability must fail closed.');
        } catch (TalosCapabilityPolicyException $exception) {
            self::assertSame('TALOS_CAPABILITY_UNKNOWN', $exception->errorCode);
        }

        try {
            $this->service()->evaluate($user, 'browser.read', ['actions' => ['write']]);
            self::fail('An action outside the capability contract must fail closed.');
        } catch (TalosCapabilityPolicyException $exception) {
            self::assertSame('TALOS_CAPABILITY_ACTION_INVALID', $exception->errorCode);
        }
    }

    public function test_baseline_allow_is_account_authority_and_revoke_becomes_explicit_deny(): void
    {
        $user = User::factory()->create();
        $service = $this->service();

        $allowed = $service->update($user, 'web.search', 'allow', 0);

        self::assertSame(1, $allowed['revision']);
        self::assertSame('allow', $this->policy($allowed, 'web.search')['decision']);
        self::assertSame('user', $this->policy($allowed, 'web.search')['source']);
        self::assertSame('account', $allowed['grants'][0]['scope']);
        self::assertTrue($service->evaluate($user, 'web.search')->allowed);

        $revoked = $service->revoke($user, 'web.search', 1);

        self::assertSame(2, $revoked['revision']);
        self::assertSame('deny', $this->policy($revoked, 'web.search')['decision']);
        self::assertSame('revoked', $revoked['grants'][0]['status']);
        self::assertFalse($service->evaluate($user, 'web.search')->allowed);
    }

    public function test_high_and_critical_allow_or_grant_requires_explicit_acknowledgement(): void
    {
        $user = User::factory()->create();
        $service = $this->service();

        foreach ([
            fn () => $service->update($user, 'browser.write', 'allow', 0),
            fn () => $service->createGrant($user, 'browser.write', 0, [
                'scope' => 'once',
                'actions' => ['write'],
            ]),
        ] as $operation) {
            try {
                $operation();
                self::fail('High-risk authority must require acknowledgement.');
            } catch (TalosCapabilityPolicyException $exception) {
                self::assertSame('TALOS_CAPABILITY_RISK_ACK_REQUIRED', $exception->errorCode);
            }
        }

        $snapshot = $service->update(
            $user,
            'browser.write',
            'allow',
            0,
            ['risk_acknowledged' => true],
        );
        self::assertSame('allow', $this->policy($snapshot, 'browser.write')['decision']);
    }

    public function test_once_grant_is_consumed_atomically_after_one_matching_evaluation(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $snapshot = $service->createGrant($user, 'web.fetch', 0, [
            'scope' => 'once',
            'actions' => ['read', 'outbound'],
        ]);

        $first = $service->evaluate($user, 'web.fetch');
        $second = $service->evaluate($user, 'web.fetch');

        self::assertTrue($first->allowed);
        self::assertSame('active_grant', $first->reason);
        self::assertSame($snapshot['grants'][0]['id'], $first->grantId);
        self::assertSame('once', $first->grantScope);
        self::assertFalse($second->allowed);
        self::assertSame('default_ask', $second->reason);
        self::assertSame('consumed', TalosCapabilityGrant::query()->value('status'));
        self::assertSame(2, $second->revision);
    }

    public function test_session_grant_requires_owned_session_finite_ttl_and_exact_scope(): void
    {
        $user = User::factory()->create();
        $foreign = User::factory()->create();
        $foreignSession = $this->talosSession($foreign, 'Foreign');
        $ownedSession = $this->talosSession($user, 'Owned');
        $otherSession = $this->talosSession($user, 'Other');
        $service = $this->service();

        try {
            $service->createGrant($user, 'files.write', 0, [
                'scope' => 'session',
                'scope_id' => $foreignSession->id,
                'session_ttl_seconds' => 300,
            ]);
            self::fail('Foreign sessions must not grant authority.');
        } catch (TalosCapabilityPolicyException $exception) {
            self::assertSame('TALOS_CAPABILITY_SESSION_INVALID', $exception->errorCode);
        }

        $service->createGrant($user, 'files.write', 0, [
            'scope' => 'session',
            'scope_id' => $ownedSession->id,
            'session_ttl_seconds' => 300,
        ]);

        self::assertTrue($service->evaluate($user, 'files.write', ['session_id' => $ownedSession->id])->allowed);
        $mismatch = $service->evaluate($user, 'files.write', ['session_id' => $otherSession->id]);
        self::assertFalse($mismatch->allowed);
        self::assertSame('default_ask', $mismatch->reason);
    }

    public function test_device_and_tool_scopes_must_match_the_current_context(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $service->createGrant($user, 'web.search', 0, [
            'scope' => 'device',
            'scope_id' => 'device-a',
            'tool_id' => 'web-search-tool',
            'actions' => ['read'],
        ]);

        self::assertTrue($service->evaluate($user, 'web.search', [
            'actions' => ['read'],
            'device_id' => 'device-a',
            'tool_id' => 'web-search-tool',
        ])->allowed);
        self::assertFalse($service->evaluate($user, 'web.search', [
            'actions' => ['read'],
            'device_id' => 'device-b',
            'tool_id' => 'web-search-tool',
        ])->allowed);
        self::assertFalse($service->evaluate($user, 'web.search', [
            'actions' => ['read'],
            'device_id' => 'device-a',
            'tool_id' => 'different-tool',
        ])->allowed);
    }

    public function test_expired_grant_is_normalized_once_and_no_longer_authorizes(): void
    {
        CarbonImmutable::setTestNow('2026-08-05T10:00:00Z');
        $user = User::factory()->create();
        $session = $this->talosSession($user, 'Expiring');
        $service = $this->service();
        $service->createGrant($user, 'files.write', 0, [
            'scope' => 'session',
            'scope_id' => $session->id,
            'session_ttl_seconds' => 60,
        ]);

        CarbonImmutable::setTestNow('2026-08-05T10:01:01Z');
        $first = $service->evaluate($user, 'files.write', ['session_id' => $session->id]);
        $second = $service->evaluate($user, 'files.write', ['session_id' => $session->id]);

        self::assertFalse($first->allowed);
        self::assertFalse($second->allowed);
        self::assertSame('expired', TalosCapabilityGrant::query()->value('status'));
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'capability_grant.expired')->count());
    }

    public function test_explicit_deny_wins_over_a_matching_active_grant(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $service->createGrant($user, 'web.search', 0, ['scope' => 'account']);
        $service->update($user, 'web.search', 'deny', 1);

        $outcome = $service->evaluate($user, 'web.search');

        self::assertFalse($outcome->allowed);
        self::assertSame('explicit_deny', $outcome->reason);
        self::assertSame('revoked', TalosCapabilityGrant::query()->value('status'));
    }

    public function test_master_enable_is_one_revision_checked_batch_without_boolean_state(): void
    {
        $user = User::factory()->create();

        $result = $this->service()->masterEnable($user, 0, true);

        self::assertSame(['web.search', 'web.fetch', 'browser.read'], $result['enabled_capabilities']);
        self::assertCount(12, $result['excluded_capabilities']);
        self::assertSame(1, $result['policy']['revision']);
        self::assertSame('allow', $this->policy($result['policy'], 'browser.read')['decision']);
        self::assertSame('ask', $this->policy($result['policy'], 'browser.write')['decision']);
        self::assertCount(3, $result['policy']['grants']);
        self::assertArrayNotHasKey('master_enabled', $result['policy']);
        $this->assertAuditEvent('capability_policy.master_enabled', null, null);
    }

    public function test_revoke_all_revokes_grants_and_returns_allows_to_ask_but_preserves_deny(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $service->update($user, 'web.search', 'allow', 0);
        $service->update($user, 'browser.write', 'deny', 1);

        $snapshot = $service->revokeAll($user, 2);

        self::assertSame(3, $snapshot['revision']);
        self::assertSame('ask', $this->policy($snapshot, 'web.search')['decision']);
        self::assertSame('deny', $this->policy($snapshot, 'browser.write')['decision']);
        self::assertSame('revoked', $snapshot['grants'][0]['status']);
        self::assertFalse($service->evaluate($user, 'web.search')->allowed);
        self::assertFalse($service->evaluate($user, 'browser.write')->allowed);
    }

    public function test_stale_grant_and_revoke_all_mutations_return_authoritative_snapshot(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $service->update($user, 'web.search', 'allow', 0);

        foreach ([
            fn () => $service->createGrant($user, 'web.fetch', 0, ['scope' => 'once']),
            fn () => $service->revokeAll($user, 0),
        ] as $operation) {
            try {
                $operation();
                self::fail('A stale mutation must be rejected.');
            } catch (TalosCapabilityPolicyException $exception) {
                self::assertSame('TALOS_CAPABILITY_POLICY_REVISION_CONFLICT', $exception->errorCode);
                self::assertSame(1, $exception->snapshot['revision']);
            }
        }
    }

    public function test_last_use_does_not_advance_revision_but_once_consumption_does(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $service->update($user, 'web.fetch', 'allow', 0);

        $service->evaluate($user, 'web.fetch');
        $snapshot = $service->snapshot($user);

        self::assertSame(1, $snapshot['revision']);
        self::assertNotNull($this->policy($snapshot, 'web.fetch')['last_used_at']);
    }

    public function test_legacy_rows_are_read_compatibly_without_implicit_rewrite(): void
    {
        $user = User::factory()->create();
        $set = TalosCapabilityPolicySet::query()->create([
            'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
            'user_id' => $user->id,
            'schema_version' => 1,
            'revision' => 4,
        ]);
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'web.search',
            'decision' => 'allow_until_revoked',
        ]);

        $outcome = $this->service()->evaluate($user, 'web.search');

        self::assertTrue($outcome->allowed);
        self::assertSame('legacy_active_grant', $outcome->reason);
        self::assertSame('allow_until_revoked', TalosCapabilityPolicy::query()->value('decision'));
        self::assertSame(0, TalosCapabilityGrant::query()->count());
    }

    public function test_legacy_synthetic_grant_can_be_revoked_without_a_prior_bulk_migration(): void
    {
        $user = User::factory()->create();
        $set = TalosCapabilityPolicySet::query()->create([
            'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
            'user_id' => $user->id,
            'schema_version' => 1,
            'revision' => 6,
        ]);
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'web.search',
            'decision' => 'allow_until_revoked',
        ]);
        $service = $this->service();
        $legacyGrantId = $service->snapshot($user)['grants'][0]['id'];

        $snapshot = $service->revokeGrant($user, $legacyGrantId, 6);

        self::assertSame(7, $snapshot['revision']);
        self::assertSame('ask', $this->policy($snapshot, 'web.search')['decision']);
        self::assertSame('allow_until_revoked', TalosCapabilityPolicy::query()->value('legacy_decision'));
        self::assertNotNull(TalosCapabilityPolicy::query()->value('canonicalized_at'));
        self::assertSame([], $snapshot['grants']);
        self::assertFalse($service->evaluate($user, 'web.search')->allowed);
    }

    public function test_invalid_stored_decision_is_fail_closed_and_audited(): void
    {
        $user = User::factory()->create();
        $set = TalosCapabilityPolicySet::query()->create([
            'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
            'user_id' => $user->id,
            'schema_version' => 1,
            'revision' => 4,
        ]);
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'web.search',
            'decision' => 'allow_forever',
        ]);

        $snapshot = $this->service()->snapshotEnvelope($user);
        $outcome = $this->service()->evaluate($user, 'web.search');

        self::assertSame('deny', $this->policy($snapshot['contract'], 'web.search')['decision']);
        self::assertSame('invalid_stored_decision', $snapshot['faults'][0]['code']);
        self::assertFalse($outcome->allowed);
        self::assertSame('invalid_stored_decision', $outcome->reason);
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'capability_policy.invalid_record')->count());
    }

    private function service(): TalosCapabilityPolicyService
    {
        return $this->app->make(TalosCapabilityPolicyService::class);
    }

    private function talosSession(User $owner, string $title): TalosSession
    {
        return TalosSession::query()->create([
            'user_id' => $owner->id,
            'title' => $title,
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
    }

    /** @param array<string, mixed> $snapshot */
    private function policy(array $snapshot, string $capability): array
    {
        foreach ($snapshot['policies'] as $entry) {
            if ($entry['capability'] === $capability) {
                return $entry;
            }
        }

        self::fail("Missing capability policy: {$capability}");
    }

    private function assertAuditEvent(string $eventType, ?string $capability, ?string $decision): void
    {
        $event = TalosAuditEvent::query()->where('event_type', $eventType)->latest('created_at')->first();
        self::assertNotNull($event, "Missing audit event: {$eventType}");
        if ($capability !== null) {
            self::assertSame($capability, $event->payload['capability'] ?? null);
        }
        if ($decision !== null) {
            self::assertSame($decision, $event->payload['decision'] ?? null);
        }
    }
}
