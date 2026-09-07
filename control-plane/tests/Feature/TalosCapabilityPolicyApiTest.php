<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosAuditEvent;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Policy\TalosCapabilityPolicyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosCapabilityPolicyApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_exact_v1_defaults_for_the_authenticated_user(): void
    {
        $this->authenticateTalosUser();

        $response = $this->getJson('/api/talos/capability-policies')
            ->assertOk()
            ->assertJsonPath('data.schema_version', 1)
            ->assertJsonPath('data.revision', 0)
            ->assertJsonCount(15, 'data.capabilities')
            ->assertJsonPath('data.capabilities.0.capability', 'artifacts.generate')
            ->assertJsonPath('data.capabilities.0.decision', 'ask')
            ->assertJsonPath('data.capabilities.0.source', 'default')
            ->assertJsonPath('data.master_enable.eligible.0', 'web.search');

        self::assertSame(
            ['web.search', 'web.fetch', 'browser.read'],
            $response->json('data.master_enable.eligible'),
        );
    }

    public function test_user_can_update_a_policy_with_optimistic_revision(): void
    {
        $user = $this->authenticateTalosUser();

        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow_until_revoked',
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.capabilities.3.capability', 'web.search')
            ->assertJsonPath('data.capabilities.3.decision', 'allow_until_revoked');

        $this->assertDatabaseHas('talos_capability_policy_sets', [
            'user_id' => $user->id,
            'revision' => 1,
        ]);
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'capability_policy.created')->count());
    }

    public function test_stale_policy_update_returns_409_with_authoritative_snapshot(): void
    {
        $this->authenticateTalosUser();
        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow_until_revoked',
        ])->assertOk();

        $this->putJson('/api/talos/capability-policies/web.fetch', [
            'expected_revision' => 0,
            'decision' => 'deny',
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'TALOS_CAPABILITY_POLICY_REVISION_CONFLICT')
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.capabilities.3.decision', 'allow_until_revoked')
            ->assertJsonValidationErrors('expected_revision');
    }

    public function test_unknown_capability_and_decision_are_rejected(): void
    {
        $this->authenticateTalosUser();

        $this->putJson('/api/talos/capability-policies/browser.anything', [
            'expected_revision' => 0,
            'decision' => 'deny',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_UNKNOWN')
            ->assertJsonValidationErrors('capability');

        $this->putJson('/api/talos/capability-policies/browser.read', [
            'expected_revision' => 0,
            'decision' => 'allow_everything',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('decision');
    }

    public function test_cross_user_session_authority_is_rejected(): void
    {
        $this->authenticateTalosUser();
        $foreign = User::factory()->create();
        $foreignSession = $this->talosSession($foreign, 'Foreign');

        $this->putJson('/api/talos/capability-policies/files.write', [
            'expected_revision' => 0,
            'decision' => 'allow_for_session',
            'session_id' => $foreignSession->id,
            'session_ttl_seconds' => 600,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_SESSION_INVALID')
            ->assertJsonValidationErrors('session_id');

        $this->assertDatabaseCount('talos_capability_policy_sets', 0);
    }

    public function test_master_enable_requires_warning_and_returns_explicit_exclusions(): void
    {
        $this->authenticateTalosUser();

        $this->postJson('/api/talos/capability-policies/master-enable', [
            'expected_revision' => 0,
            'warning_acknowledged' => false,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('warning_acknowledged');

        $this->postJson('/api/talos/capability-policies/master-enable', [
            'expected_revision' => 0,
            'warning_acknowledged' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('meta.enabled_capabilities.0', 'web.search')
            ->assertJsonPath('meta.excluded_capabilities.0', 'artifacts.generate')
            ->assertJsonCount(3, 'meta.enabled_capabilities')
            ->assertJsonCount(12, 'meta.excluded_capabilities');
    }

    public function test_revoke_all_is_immediate_even_from_a_stale_client(): void
    {
        $user = $this->authenticateTalosUser();
        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow_until_revoked',
        ])->assertOk();
        $service = $this->app->make(TalosCapabilityPolicyService::class);
        self::assertTrue($service->evaluate($user, 'web.search')->allowed);

        $this->postJson('/api/talos/capability-policies/revoke-all', [
            'expected_revision' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.revision', 2);

        self::assertFalse($service->evaluate($user, 'web.search')->allowed);
    }

    public function test_policy_aggregates_are_isolated_per_user(): void
    {
        $owner = $this->authenticateTalosUser();
        $this->putJson('/api/talos/capability-policies/web.search', [
            'expected_revision' => 0,
            'decision' => 'allow_until_revoked',
        ])->assertOk();

        $other = User::factory()->create();
        $this->actingAs($other);
        $this->getJson('/api/talos/capability-policies')
            ->assertOk()
            ->assertJsonPath('data.revision', 0)
            ->assertJsonPath('data.capabilities.3.decision', 'ask');

        $this->actingAs($owner);
        $this->getJson('/api/talos/capability-policies')
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.capabilities.3.decision', 'allow_until_revoked');
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
