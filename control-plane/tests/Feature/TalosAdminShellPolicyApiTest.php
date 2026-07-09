<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosApiToken;
use App\Models\TalosAuditEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosAdminShellPolicyApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_shell_preview_requires_admin_preview_scope(): void
    {
        $this->postJson('/api/talos/admin/shell/preview', [
            'command' => 'php artisan about',
        ])
            ->assertForbidden()
            ->assertJsonPath('error', 'TALOS_ADMIN_TOKEN_REQUIRED');

        $plainToken = TalosApiToken::issue('limited', ['talos.policy.read']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->postJson('/api/talos/admin/shell/preview', [
                'command' => 'php artisan about',
            ])
            ->assertForbidden()
            ->assertJsonPath('error', 'TALOS_SCOPE_DENIED')
            ->assertJsonPath('required_scope', 'talos.shell.preview');
    }

    public function test_shell_preview_returns_default_deny_decision_and_audits_without_plain_command(): void
    {
        $plainToken = TalosApiToken::issue('shell-preview', ['talos.shell.preview']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->postJson('/api/talos/admin/shell/preview', [
                'command' => 'php artisan migrate --force --password=secret',
                'timeout_seconds' => 30,
                'use_pty' => true,
                'use_tmux' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.decision', 'deny')
            ->assertJsonPath('data.allowed', false)
            ->assertJsonPath('data.executed', false)
            ->assertJsonPath('data.required_scope', 'talos.shell.exec')
            ->assertJsonPath('data.reason', 'host_shell_execution_disabled');

        $event = TalosAuditEvent::query()
            ->where('event_type', 'shell.preview.denied')
            ->firstOrFail();

        $payload = json_encode($event->payload, JSON_THROW_ON_ERROR);
        $this->assertStringContainsString('command_hash', $payload);
        $this->assertStringNotContainsString('migrate --force', $payload);
        $this->assertStringNotContainsString('secret', $payload);
    }

    public function test_shell_execute_is_blocked_by_default_even_with_exec_scope_and_is_audited(): void
    {
        $plainToken = TalosApiToken::issue('shell-exec', ['talos.shell.exec']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->postJson('/api/talos/admin/shell/execute', [
                'command' => 'php artisan migrate --force',
                'timeout_seconds' => 30,
            ])
            ->assertForbidden()
            ->assertJsonPath('data.decision', 'deny')
            ->assertJsonPath('data.allowed', false)
            ->assertJsonPath('data.executed', false)
            ->assertJsonPath('data.reason', 'host_shell_execution_disabled');

        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'shell.execute.denied',
            'subject_type' => 'shell',
        ]);
    }

    public function test_shell_routes_reject_cross_site_browser_requests(): void
    {
        $plainToken = TalosApiToken::issue('shell-preview', ['talos.shell.preview']);

        $this->withHeaders([
            'X-Talos-Api-Token' => $plainToken,
            'Sec-Fetch-Site' => 'cross-site',
        ])->postJson('/api/talos/admin/shell/preview', [
            'command' => 'php artisan about',
        ])
            ->assertForbidden()
            ->assertJsonPath('error', 'TALOS_CROSS_SITE_SHELL_DENIED');
    }
}
