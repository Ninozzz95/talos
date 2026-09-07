<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosCapabilityGrant;
use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use App\Models\User;
use App\Services\Policy\TalosCapability;
use App\Services\Policy\TalosCapabilityAction;
use App\Services\Policy\TalosCapabilityDecision;
use App\Services\Policy\TalosCapabilityPolicyContractMapper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Kadmos\Alignment\Contract\CapabilityPolicySetV1;
use Tests\TestCase;

final class TalosCapabilityPolicyContractMapperTest extends TestCase
{
    use RefreshDatabase;

    public function test_c2_decision_and_action_vocabularies_are_exact(): void
    {
        self::assertSame(['deny', 'ask', 'allow'], TalosCapabilityDecision::values());
        self::assertSame(['read', 'write', 'outbound'], TalosCapabilityAction::values());
        self::assertSame(['read', 'outbound'], $this->actionValues(TalosCapability::WEB_SEARCH));
        self::assertSame(['read', 'write', 'outbound'], $this->actionValues(TalosCapability::BROWSER_UPLOAD));
        self::assertSame(['write'], $this->actionValues(TalosCapability::FILESYSTEM_WRITE));
    }

    public function test_legacy_duration_decisions_map_to_three_state_baselines_and_separate_grants_without_mutation(): void
    {
        $sessionPolicy = new TalosCapabilityPolicy([
            'id' => 'legacy-session-policy',
            'capability' => 'files.write',
            'decision' => 'allow_for_session',
            'talos_session_id' => 'session-42',
            'expires_at' => now()->addHour(),
        ]);
        $persistentPolicy = new TalosCapabilityPolicy([
            'id' => 'legacy-account-policy',
            'capability' => 'web.search',
            'decision' => 'allow_until_revoked',
        ]);
        $mapper = $this->mapper();

        $sessionBaseline = $mapper->baselineFromStoredPolicy(TalosCapability::FILES_WRITE, $sessionPolicy);
        $sessionGrant = $mapper->legacyGrantFromStoredPolicy(TalosCapability::FILES_WRITE, $sessionPolicy);
        $accountBaseline = $mapper->baselineFromStoredPolicy(TalosCapability::WEB_SEARCH, $persistentPolicy);
        $accountGrant = $mapper->legacyGrantFromStoredPolicy(TalosCapability::WEB_SEARCH, $persistentPolicy);

        self::assertSame('ask', $sessionBaseline['decision']);
        self::assertSame('user', $sessionBaseline['source']);
        self::assertSame('session', $sessionGrant['scope']);
        self::assertSame('session-42', $sessionGrant['scope_id']);
        self::assertSame('active', $sessionGrant['status']);
        self::assertSame('allow', $accountBaseline['decision']);
        self::assertSame('account', $accountGrant['scope']);
        self::assertNull($accountGrant['scope_id']);
        self::assertSame('allow_for_session', $sessionPolicy->decision);
        self::assertSame('allow_until_revoked', $persistentPolicy->decision);
    }

    public function test_snapshot_enforces_deny_precedence_and_returns_a_contract_valid_projection_with_a_visible_fault(): void
    {
        $set = $this->policySet();
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'browser.write',
            'actions' => ['write', 'outbound'],
            'decision' => 'deny',
            'source' => 'user',
        ]);
        TalosCapabilityGrant::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'browser.write',
            'actions' => ['write', 'outbound'],
            'scope' => 'account',
            'status' => 'active',
            'granted_at' => now(),
            'risk_acknowledged' => true,
        ]);

        $snapshot = $this->mapper()->snapshot($set);
        $contract = $snapshot['contract'];

        self::assertInstanceOf(CapabilityPolicySetV1::class, $contract);
        self::assertSame('deny', $this->policy($contract->toArray(), 'browser.write')['decision']);
        self::assertSame('revoked', $contract->toArray()['grants'][0]['status']);
        self::assertSame('deny_grant_conflict', $snapshot['faults'][0]['code']);
        self::assertSame($contract->toArray(), CapabilityPolicySetV1::fromJson($contract->toJson())->toArray());
    }

    public function test_malformed_stored_decision_fails_closed_as_managed_deny_and_is_reported(): void
    {
        $set = $this->policySet();
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'web.fetch',
            'decision' => 'allow_forever',
        ]);

        $snapshot = $this->mapper()->snapshot($set);
        $contract = $snapshot['contract']->toArray();

        self::assertSame('deny', $this->policy($contract, 'web.fetch')['decision']);
        self::assertSame('managed', $this->policy($contract, 'web.fetch')['source']);
        self::assertSame('invalid_stored_decision', $snapshot['faults'][0]['code']);
    }

    private function mapper(): TalosCapabilityPolicyContractMapper
    {
        return $this->app->make(TalosCapabilityPolicyContractMapper::class);
    }

    private function policySet(): TalosCapabilityPolicySet
    {
        $user = User::factory()->create();

        return TalosCapabilityPolicySet::query()->create([
            'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
            'user_id' => $user->id,
            'schema_version' => 1,
            'revision' => 0,
        ]);
    }

    /** @return list<string> */
    private function actionValues(TalosCapability $capability): array
    {
        return array_map(
            static fn (TalosCapabilityAction $action): string => $action->value,
            $capability->actions(),
        );
    }

    /** @param array<string, mixed> $contract */
    private function policy(array $contract, string $capability): array
    {
        foreach ($contract['policies'] as $policy) {
            if ($policy['capability'] === $capability) {
                return $policy;
            }
        }

        self::fail("Missing capability policy: {$capability}");
    }
}
