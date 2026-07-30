<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosAuditEvent;
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

    public function test_v1_vocabulary_has_exact_risk_and_master_enable_metadata(): void
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

        self::assertSame(TalosCapabilityRisk::MEDIUM, TalosCapability::ARTIFACTS_GENERATE->risk());
        self::assertSame(TalosCapabilityRisk::CRITICAL, TalosCapability::FILES_TRANSFER_TO_PROVIDER->risk());
        self::assertSame(TalosCapabilityRisk::LOW, TalosCapability::BROWSER_READ->risk());
        self::assertSame(TalosCapabilityRisk::HIGH, TalosCapability::BROWSER_WRITE->risk());
        self::assertSame(TalosCapabilityRisk::CRITICAL, TalosCapability::EMAIL_SEND->risk());
        self::assertSame([
            'web.search',
            'web.fetch',
            'browser.read',
        ], array_values(array_map(
            static fn (TalosCapability $capability): string => $capability->value,
            array_filter(TalosCapability::cases(), static fn (TalosCapability $capability): bool => $capability->masterEnableEligible()),
        )));
    }

    public function test_missing_policy_fails_closed_as_ask_and_is_audited(): void
    {
        $user = User::factory()->create();

        $outcome = $this->service()->evaluate($user, 'artifacts.generate');

        self::assertFalse($outcome->allowed);
        self::assertTrue($outcome->requiresApproval);
        self::assertSame(TalosCapabilityDecision::ASK, $outcome->decision);
        self::assertSame('default_ask', $outcome->reason);
        self::assertSame(0, $outcome->revision);
        self::assertSame(0, TalosCapabilityPolicySet::query()->count());
        $this->assertAuditEvent('capability_policy.evaluated', 'artifacts.generate', 'ask');
    }

    public function test_unknown_capability_fails_closed(): void
    {
        $user = User::factory()->create();

        try {
            $this->service()->evaluate($user, 'browser.anything');
            self::fail('Unknown capability must fail closed.');
        } catch (TalosCapabilityPolicyException $exception) {
            self::assertSame('TALOS_CAPABILITY_UNKNOWN', $exception->errorCode);
            self::assertSame(422, $exception->status);
            self::assertSame('capability', $exception->field);
        }
    }

    public function test_persistent_allow_is_used_and_revocation_blocks_the_next_action(): void
    {
        $user = User::factory()->create();
        $service = $this->service();

        $allowed = $service->update(
            $user,
            'web.search',
            'allow_until_revoked',
            0,
        );

        self::assertSame(1, $allowed['revision']);
        self::assertSame('allow_until_revoked', $this->entry($allowed, 'web.search')['decision']);
        self::assertTrue($service->evaluate($user, 'web.search')->allowed);
        $this->assertAuditEvent('capability_policy.used', 'web.search', 'allow_until_revoked');

        $revoked = $service->revoke($user, 'web.search', 1);

        self::assertSame(2, $revoked['revision']);
        self::assertSame('deny', $this->entry($revoked, 'web.search')['decision']);
        self::assertFalse($service->evaluate($user, 'web.search')->allowed);
        $this->assertAuditEvent('capability_policy.revoked', 'web.search', 'deny');
    }

    public function test_high_risk_authority_requires_explicit_acknowledgement(): void
    {
        $user = User::factory()->create();

        try {
            $this->service()->update(
                $user,
                'browser.write',
                'allow_until_revoked',
                0,
            );
            self::fail('High-risk persistent authority must require acknowledgement.');
        } catch (TalosCapabilityPolicyException $exception) {
            self::assertSame('TALOS_CAPABILITY_RISK_ACK_REQUIRED', $exception->errorCode);
            self::assertSame('risk_acknowledged', $exception->field);
        }

        $snapshot = $this->service()->update(
            $user,
            'browser.write',
            'allow_until_revoked',
            0,
            ['risk_acknowledged' => true],
        );

        self::assertSame('allow_until_revoked', $this->entry($snapshot, 'browser.write')['decision']);
    }

    public function test_session_allow_requires_an_owned_exact_session_and_finite_ttl(): void
    {
        $user = User::factory()->create();
        $foreign = User::factory()->create();
        $foreignSession = $this->talosSession($foreign, 'Foreign');
        $ownedSession = $this->talosSession($user, 'Owned');
        $service = $this->service();

        try {
            $service->update(
                $user,
                'files.write',
                'allow_for_session',
                0,
                ['session_id' => $foreignSession->id, 'session_ttl_seconds' => 300],
            );
            self::fail('Foreign sessions must not grant capability authority.');
        } catch (TalosCapabilityPolicyException $exception) {
            self::assertSame('TALOS_CAPABILITY_SESSION_INVALID', $exception->errorCode);
        }

        try {
            $service->update(
                $user,
                'files.write',
                'allow_for_session',
                0,
                [
                    'session_id' => $ownedSession->id,
                    'session_ttl_seconds' => TalosCapabilityPolicyService::SESSION_TTL_MAX_SECONDS + 1,
                ],
            );
            self::fail('Session authority must have a bounded TTL.');
        } catch (TalosCapabilityPolicyException $exception) {
            self::assertSame('TALOS_CAPABILITY_SESSION_TTL_INVALID', $exception->errorCode);
        }

        $snapshot = $service->update(
            $user,
            'files.write',
            'allow_for_session',
            0,
            ['session_id' => $ownedSession->id, 'session_ttl_seconds' => 300],
        );
        $entry = $this->entry($snapshot, 'files.write');

        self::assertSame($ownedSession->id, $entry['session_id']);
        self::assertNotNull($entry['expires_at']);
        self::assertTrue($service->evaluate($user, 'files.write', ['session_id' => $ownedSession->id])->allowed);
    }

    public function test_session_mismatch_falls_back_to_ask_without_using_the_grant(): void
    {
        $user = User::factory()->create();
        $grantedSession = $this->talosSession($user, 'Granted');
        $otherSession = $this->talosSession($user, 'Other');
        $service = $this->service();

        $service->update(
            $user,
            'files.write',
            'allow_for_session',
            0,
            ['session_id' => $grantedSession->id, 'session_ttl_seconds' => 300],
        );

        $outcome = $service->evaluate($user, 'files.write', ['session_id' => $otherSession->id]);

        self::assertFalse($outcome->allowed);
        self::assertTrue($outcome->requiresApproval);
        self::assertSame(TalosCapabilityDecision::ASK, $outcome->decision);
        self::assertSame('session_mismatch', $outcome->reason);
        self::assertNull(TalosCapabilityPolicy::query()->where('capability', 'files.write')->value('last_used_at'));
        $this->assertAuditEvent('capability_policy.evaluated', 'files.write', 'ask');
    }

    public function test_expired_session_allow_is_normalized_and_audited_once(): void
    {
        CarbonImmutable::setTestNow('2026-07-30T10:00:00Z');
        $user = User::factory()->create();
        $session = $this->talosSession($user, 'Expiring');
        $service = $this->service();
        $service->update(
            $user,
            'files.write',
            'allow_for_session',
            0,
            ['session_id' => $session->id, 'session_ttl_seconds' => 60],
        );

        CarbonImmutable::setTestNow('2026-07-30T10:01:01Z');
        $first = $service->evaluate($user, 'files.write', ['session_id' => $session->id]);
        $second = $service->evaluate($user, 'files.write', ['session_id' => $session->id]);

        self::assertSame('session_expired', $first->reason);
        self::assertSame(2, $first->revision);
        self::assertSame('explicit_ask', $second->reason);
        self::assertSame(2, $second->revision);
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'capability_policy.expired')->count());
        self::assertSame('ask', TalosCapabilityPolicy::query()->where('capability', 'files.write')->value('decision'));
    }

    public function test_master_enable_only_allows_low_risk_eligible_capabilities(): void
    {
        $user = User::factory()->create();

        $result = $this->service()->masterEnable($user, 0, true);

        self::assertSame([
            'web.search',
            'web.fetch',
            'browser.read',
        ], $result['enabled_capabilities']);
        self::assertCount(12, $result['excluded_capabilities']);
        self::assertSame(1, $result['policy']['revision']);
        self::assertSame('allow_until_revoked', $this->entry($result['policy'], 'browser.read')['decision']);
        self::assertSame('ask', $this->entry($result['policy'], 'browser.write')['decision']);
        $this->assertAuditEvent('capability_policy.master_enabled', null, null);
    }

    public function test_revoke_all_denies_every_capability_atomically(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $service->update($user, 'web.search', 'allow_until_revoked', 0);
        $service->update(
            $user,
            'browser.write',
            'allow_until_revoked',
            1,
            ['risk_acknowledged' => true],
        );

        $snapshot = $service->revokeAll($user);

        self::assertSame(3, $snapshot['revision']);
        foreach ($snapshot['capabilities'] as $entry) {
            self::assertSame('deny', $entry['decision']);
        }
        self::assertFalse($service->evaluate($user, 'web.search')->allowed);
        self::assertFalse($service->evaluate($user, 'browser.write')->allowed);
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'capability_policy.revoke_all')->count());
    }

    public function test_last_use_does_not_advance_policy_edit_revision(): void
    {
        $user = User::factory()->create();
        $service = $this->service();
        $service->update($user, 'web.fetch', 'allow_until_revoked', 0);

        $service->evaluate($user, 'web.fetch');
        $snapshot = $service->snapshot($user);

        self::assertSame(1, $snapshot['revision']);
        self::assertNotNull($this->entry($snapshot, 'web.fetch')['last_used_at']);
    }

    public function test_invalid_stored_decision_is_fail_closed_in_snapshot_and_evaluation(): void
    {
        $user = User::factory()->create();
        $set = TalosCapabilityPolicySet::query()->create([
            'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
            'user_id' => $user->id,
            'schema_version' => TalosCapabilityPolicySet::SCHEMA_VERSION,
            'revision' => 4,
        ]);
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'web.search',
            'decision' => 'allow_forever',
        ]);

        $snapshotEntry = $this->entry($this->service()->snapshot($user), 'web.search');
        $outcome = $this->service()->evaluate($user, 'web.search');

        self::assertSame('deny', $snapshotEntry['decision']);
        self::assertSame('invalid', $snapshotEntry['source']);
        self::assertFalse($outcome->allowed);
        self::assertSame(TalosCapabilityDecision::DENY, $outcome->decision);
        self::assertSame('invalid_stored_decision', $outcome->reason);
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
    private function entry(array $snapshot, string $capability): array
    {
        foreach ($snapshot['capabilities'] as $entry) {
            if ($entry['capability'] === $capability) {
                return $entry;
            }
        }

        self::fail("Missing capability entry: {$capability}");
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
