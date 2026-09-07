<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosAuditEvent;
use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Policy\TalosCapabilityPolicyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosCapabilityPolicyApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_exact_canonical_defaults_and_separate_metadata(): void
    {
        $this->authenticateTalosUser();

        $response = $this->getJson('/api/talos/capability-policies')
            ->assertOk()
            ->assertJsonPath('data.schema_version', 1)
            ->assertJsonPath('data.revision', 0)
            ->assertJsonCount(15, 'data.policies')
            ->assertJsonCount(0, 'data.grants')
            ->assertJsonPath('data.policies.0.capability', 'artifacts.generate')
            ->assertJsonPath('data.policies.0.actions.0', 'write')
            ->assertJsonPath('data.policies.0.decision', 'ask')
            ->assertJsonPath('data.policies.0.source', 'default')
            ->assertJsonCount(15, 'meta.catalog')
            ->assertJsonPath('meta.master_enable.eligible.0', 'web.search')
            ->assertJsonCount(0, 'meta.faults');

        self::assertSame(['schema_version', 'revision', 'policies', 'grants'], array_keys($response->json('data')));
        self::assertSame(['web.search', 'web.fetch', 'browser.read'], $response->json('meta.master_enable.eligible'));
    }

    public function test_user_can_write_only_a_three_state_baseline_with_optimistic_revision(): void
    {
        $user = $this->authenticateTalosUser();

        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow',
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.policies.3.capability', 'web.search')
            ->assertJsonPath('data.policies.3.decision', 'allow')
            ->assertJsonPath('data.grants.0.scope', 'account');

        $this->putJson('/api/talos/capability-policies/web.fetch', [
            'expected_revision' => 1,
            'decision' => 'allow_for_session',
        ])->assertUnprocessable()->assertJsonValidationErrors('decision');
        $this->assertDatabaseHas('talos_capability_policy_sets', [
            'user_id' => $user->id,
            'revision' => 1,
        ]);
    }

    public function test_grant_endpoint_validates_scope_action_tool_and_owned_session(): void
    {
        $user = $this->authenticateTalosUser();
        $session = $this->talosSession($user, 'Owned');

        $response = $this->postJson('/api/talos/capability-policies/files.write/grants', [
            'expected_revision' => 0,
            'scope' => 'session',
            'scope_id' => $session->id,
            'actions' => ['write'],
            'tool_id' => 'artifact-writer',
            'session_ttl_seconds' => 600,
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.grants.0.scope', 'session')
            ->assertJsonPath('data.grants.0.scope_id', $session->id)
            ->assertJsonPath('data.grants.0.tool_id', 'artifact-writer');

        $grantId = $response->json('data.grants.0.id');
        $this->deleteJson('/api/talos/capability-policies/grants/'.$grantId, [
            'expected_revision' => 1,
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 2)
            ->assertJsonPath('data.grants.0.status', 'revoked');
    }

    public function test_cross_user_session_and_invalid_action_are_rejected_without_state(): void
    {
        $this->authenticateTalosUser();
        $foreign = User::factory()->create();
        $foreignSession = $this->talosSession($foreign, 'Foreign');

        $this->postJson('/api/talos/capability-policies/files.write/grants', [
            'expected_revision' => 0,
            'scope' => 'session',
            'scope_id' => $foreignSession->id,
            'actions' => ['write'],
            'session_ttl_seconds' => 600,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_SESSION_INVALID')
            ->assertJsonValidationErrors('scope_id');

        $this->postJson('/api/talos/capability-policies/files.write/grants', [
            'expected_revision' => 0,
            'scope' => 'once',
            'actions' => ['outbound'],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_ACTION_INVALID')
            ->assertJsonValidationErrors('actions');
        $this->assertDatabaseCount('talos_capability_policy_sets', 0);
    }

    public function test_stale_policy_grant_batch_and_revoke_requests_return_authoritative_contract(): void
    {
        $this->authenticateTalosUser();
        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow',
        ])->assertOk();

        foreach ([
            ['put', '/api/talos/capability-policies/web.fetch', ['decision' => 'deny']],
            ['post', '/api/talos/capability-policies/web.fetch/grants', ['scope' => 'once']],
            ['post', '/api/talos/capability-policies/master-enable', ['warning_acknowledged' => true]],
            ['post', '/api/talos/capability-policies/revoke-all', []],
        ] as [$method, $uri, $payload]) {
            $this->json(strtoupper($method), $uri, ['expected_revision' => 0, ...$payload])
                ->assertStatus(409)
                ->assertJsonPath('code', 'TALOS_CAPABILITY_POLICY_REVISION_CONFLICT')
                ->assertJsonPath('data.revision', 1)
                ->assertJsonPath('data.policies.3.decision', 'allow')
                ->assertJsonValidationErrors('expected_revision');
        }
    }

    public function test_master_enable_requires_ack_and_returns_batch_metadata_without_boolean_state(): void
    {
        $this->authenticateTalosUser();

        $this->postJson('/api/talos/capability-policies/master-enable', [
            'expected_revision' => 0,
            'warning_acknowledged' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors('warning_acknowledged');

        $response = $this->postJson('/api/talos/capability-policies/master-enable', [
            'expected_revision' => 0,
            'warning_acknowledged' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonCount(3, 'data.grants')
            ->assertJsonPath('meta.enabled_capabilities.0', 'web.search')
            ->assertJsonCount(12, 'meta.excluded_capabilities');

        self::assertArrayNotHasKey('master_enabled', $response->json('data'));
    }

    public function test_revoke_all_requires_current_revision_and_preserves_explicit_deny(): void
    {
        $user = $this->authenticateTalosUser();
        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow',
        ])->assertOk();
        $this->putJson('/api/talos/capability-policies/browser.write', [
            'expected_revision' => 1,
            'decision' => 'deny',
        ])->assertOk();

        $this->postJson('/api/talos/capability-policies/revoke-all', [
            'expected_revision' => 2,
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 3)
            ->assertJsonPath('data.policies.3.decision', 'ask')
            ->assertJsonPath('data.policies.6.decision', 'deny')
            ->assertJsonPath('data.grants.0.status', 'revoked');

        $service = $this->app->make(TalosCapabilityPolicyService::class);
        self::assertFalse($service->evaluate($user, 'web.search')->allowed);
        self::assertFalse($service->evaluate($user, 'browser.write')->allowed);
    }

    public function test_high_risk_authority_requires_ack_at_http_boundary(): void
    {
        $this->authenticateTalosUser();

        $this->putJson('/api/talos/capability-policies/browser.write', [
            'expected_revision' => 0,
            'decision' => 'allow',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_RISK_ACK_REQUIRED')
            ->assertJsonValidationErrors('risk_acknowledged');

        $this->postJson('/api/talos/capability-policies/browser.write/grants', [
            'expected_revision' => 0,
            'scope' => 'once',
            'actions' => ['write'],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_RISK_ACK_REQUIRED');
    }

    public function test_malformed_stored_policy_is_visible_in_metadata_and_effectively_denied(): void
    {
        $user = $this->authenticateTalosUser();
        $set = TalosCapabilityPolicySet::query()->create([
            'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
            'user_id' => $user->id,
            'schema_version' => 1,
            'revision' => 7,
        ]);
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => 'web.fetch',
            'decision' => 'allow_forever',
        ]);

        $this->getJson('/api/talos/capability-policies')
            ->assertOk()
            ->assertJsonPath('data.policies.4.decision', 'deny')
            ->assertJsonPath('data.policies.4.source', 'managed')
            ->assertJsonPath('meta.faults.0.code', 'invalid_stored_decision');
    }

    public function test_policy_aggregates_are_isolated_per_user(): void
    {
        $owner = $this->authenticateTalosUser();
        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow',
        ])->assertOk();

        $other = User::factory()->create();
        $this->actingAs($other);
        $this->getJson('/api/talos/capability-policies')
            ->assertOk()
            ->assertJsonPath('data.revision', 0)
            ->assertJsonPath('data.policies.3.decision', 'ask');

        $this->actingAs($owner);
        $this->getJson('/api/talos/capability-policies')
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.policies.3.decision', 'allow');
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'capability_policy.created')->count());
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
}
