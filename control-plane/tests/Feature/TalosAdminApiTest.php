<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosApiToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosAdminApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_endpoint_rejects_missing_token(): void
    {
        $this->getJson('/api/talos/admin/doctor')
            ->assertForbidden()
            ->assertJsonPath('error', 'TALOS_ADMIN_TOKEN_REQUIRED');
    }

    public function test_token_without_scope_cannot_access_admin_endpoint(): void
    {
        $plainToken = TalosApiToken::issue('limited', ['talos.audit.read']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->getJson('/api/talos/admin/doctor')
            ->assertForbidden()
            ->assertJsonPath('error', 'TALOS_SCOPE_DENIED')
            ->assertJsonPath('required_scope', 'talos.doctor.read');
    }

    public function test_expired_token_is_rejected(): void
    {
        $plainToken = TalosApiToken::issue('expired', ['talos.doctor.read'], now()->subMinute());

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->getJson('/api/talos/admin/doctor')
            ->assertForbidden()
            ->assertJsonPath('error', 'TALOS_TOKEN_EXPIRED');
    }

    public function test_policy_endpoint_lists_capabilities_for_scoped_token(): void
    {
        $plainToken = TalosApiToken::issue('admin', ['talos.policy.read']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->getJson('/api/talos/admin/policy')
            ->assertOk()
            ->assertJsonPath('data.default_decision', 'deny')
            ->assertJsonPath('data.capabilities.0', 'talos.doctor.read')
            ->assertJsonPath('data.token.name', 'admin');
    }

    public function test_policy_endpoint_returns_token_role_assignment(): void
    {
        $plainToken = TalosApiToken::issue('security', ['talos.policy.read'], null, 'security_admin');

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->getJson('/api/talos/admin/policy')
            ->assertOk()
            ->assertJsonPath('data.token.role', 'security_admin');
    }
}
