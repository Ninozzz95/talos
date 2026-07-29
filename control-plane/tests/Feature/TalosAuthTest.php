<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosWorkspaceSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\UrlGenerator;
use Tests\TestCase;

final class TalosAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_page_renders_the_talos_auth_surface(): void
    {
        $this->withoutVite();
        User::factory()->create();

        $this->get('/login')
            ->assertOk()
            ->assertSee('TALOS Access')
            ->assertSee('talos-login-form')
            ->assertSee('email')
            ->assertDontSee('Back to TALOS');
    }

    public function test_guest_with_no_users_is_redirected_to_first_run_setup(): void
    {
        $this->withoutVite();

        $this->get('/')
            ->assertRedirect('/setup');
    }

    public function test_first_run_redirect_uses_canonical_public_origin_when_fastcgi_omits_the_external_port(): void
    {
        $this->withoutVite();

        $urlGenerator = $this->app->make(UrlGenerator::class);
        $urlGenerator->setRequest(Request::create('http://127.0.0.1/'));

        self::assertSame(
            'http://localhost:8088/setup',
            $urlGenerator->to('/setup'),
        );
    }

    public function test_guest_with_existing_user_is_redirected_to_login_before_workspace(): void
    {
        $this->withoutVite();
        User::factory()->create();

        $this->get('/')
            ->assertRedirect('/login');
    }

    public function test_guest_cannot_open_browse_before_authentication(): void
    {
        $this->withoutVite();
        User::factory()->create();

        $this->get('/browse')
            ->assertRedirect('/login');
    }

    public function test_browse_preserves_the_first_run_setup_gate(): void
    {
        $this->withoutVite();

        $this->get('/browse')
            ->assertRedirect('/setup');
    }

    public function test_authenticated_user_can_render_the_workspace(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->get('/')
            ->assertOk()
            ->assertSee('talos-workspace-root')
            ->assertSee('data-authenticated="true"', false);

        self::assertStringContainsString('private', (string) $response->headers->get('Cache-Control'));
        self::assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_authenticated_workspace_server_renders_an_accessible_boot_loader_before_vue_mounts(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/');

        $response
            ->assertOk()
            ->assertSee('data-talos-boot-loader="true"', false)
            ->assertSee('role="status"', false)
            ->assertSee('aria-busy="true"', false)
            ->assertSee('@media (prefers-reduced-motion: reduce)', false)
            ->assertSee('.talos-boot-loader .talos-spinner *', false)
            ->assertSee('class="talos-loading-screen"', false)
            ->assertSee('class="talos-spinner"', false)
            ->assertSee('animation: flowData 2.5s infinite', false)
            ->assertSee('animation: igniteNode 2.5s infinite', false)
            ->assertSee('var(--talos-boot-accent, #F5A623)', false)
            ->assertSee('animation-name: talosBootIgniteNode', false)
            ->assertSeeInOrder([
                'data-talos-boot-theme-bridge',
                'data-talos-boot-loader="true"',
            ], false)
            ->assertSeeInOrder([
                'data-talos-boot-loader="true"',
                'id="talos-workspace-root"',
            ], false);

        $html = $response->getContent();

        self::assertIsString($html);
        self::assertStringNotContainsString('<iframe', strtolower($html));
        self::assertStringNotContainsString('<script src="http', strtolower($html));
        self::assertStringNotContainsString('talos-boot-loader__wordmark', $html);
        self::assertStringNotContainsString('talos-boot-loader__edge', $html);
    }

    public function test_boot_loader_first_frame_uses_the_authenticated_users_server_theme_accent(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($user->id),
            'user_id' => $user->id,
            'preferences' => [
                'theme' => 'terminal',
                'theme_customization' => ['accent' => '#7c3aed'],
            ],
        ]);

        $this->actingAs($user)
            ->get('/')
            ->assertOk()
            ->assertSee('style="--talos-boot-accent: #7c3aed"', false)
            ->assertDontSee('style="--talos-boot-accent: #63f08e"', false);
    }

    public function test_boot_loader_first_frame_uses_calm_only_when_the_user_has_no_settings_record(): void
    {
        $this->withoutVite();
        $freshUser = User::factory()->create();

        $this->actingAs($freshUser)
            ->get('/')
            ->assertOk()
            ->assertSee('style="--talos-boot-accent: #c08b3c"', false);

        $existingEmptyUser = User::factory()->create();
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($existingEmptyUser->id),
            'user_id' => $existingEmptyUser->id,
            'preferences' => [],
        ]);

        $this->actingAs($existingEmptyUser)
            ->get('/')
            ->assertOk()
            ->assertDontSee('style="--talos-boot-accent: #c08b3c"', false);
    }

    public function test_boot_loader_first_frame_falls_back_to_the_users_preset_and_never_another_users_settings(): void
    {
        $this->withoutVite();
        $currentUser = User::factory()->create();
        $otherUser = User::factory()->create();

        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($currentUser->id),
            'user_id' => $currentUser->id,
            'preferences' => ['theme' => 'terminal'],
        ]);
        TalosWorkspaceSetting::query()->create([
            'id' => TalosWorkspaceSetting::idForUser($otherUser->id),
            'user_id' => $otherUser->id,
            'preferences' => [
                'theme' => 'violet',
                'theme_customization' => ['accent' => '#abcdef'],
            ],
        ]);

        $this->actingAs($currentUser)
            ->get('/')
            ->assertOk()
            ->assertSee('style="--talos-boot-accent: #63f08e"', false)
            ->assertDontSee('#abcdef', false);
    }

    public function test_login_redirects_to_setup_until_first_user_exists(): void
    {
        $this->withoutVite();

        $this->get('/login')
            ->assertRedirect('/setup');
    }

    public function test_setup_page_renders_only_before_first_user_exists(): void
    {
        $this->withoutVite();

        $this->get('/setup')
            ->assertOk()
            ->assertSee('TALOS Setup')
            ->assertSee('talos-setup-form');
    }

    public function test_setup_redirects_to_login_after_first_user_exists(): void
    {
        $this->withoutVite();
        User::factory()->create();

        $this->get('/setup')
            ->assertRedirect('/login');
    }

    public function test_first_run_setup_creates_the_initial_admin_and_authenticates(): void
    {
        $this->withoutVite();

        $this->post('/setup', [
            'name' => 'Ninox Admin',
            'email' => 'admin@example.test',
            'password' => 'secure-password-123',
            'password_confirmation' => 'secure-password-123',
        ])
            ->assertRedirect('/');

        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', [
            'name' => 'Ninox Admin',
            'email' => 'admin@example.test',
        ]);
    }

    public function test_setup_requires_a_strong_confirmed_password(): void
    {
        $this->withoutVite();

        $this->post('/setup', [
            'name' => 'Ninox Admin',
            'email' => 'admin@example.test',
            'password' => 'short',
            'password_confirmation' => 'different',
        ])
            ->assertSessionHasErrors(['password']);

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_environment_admin_bootstrap_creates_first_user_and_redirects_to_login(): void
    {
        $this->withoutVite();

        config()->set('app.env', 'local');
        putenv('TALOS_ADMIN_NAME=Bootstrap Admin');
        putenv('TALOS_ADMIN_EMAIL=bootstrap@example.test');
        putenv('TALOS_ADMIN_PASSWORD=bootstrap-password-123');

        try {
            $this->get('/')
                ->assertRedirect('/login');

            $this->assertGuest();
            $this->assertDatabaseHas('users', [
                'name' => 'Bootstrap Admin',
                'email' => 'bootstrap@example.test',
            ]);
        } finally {
            putenv('TALOS_ADMIN_NAME');
            putenv('TALOS_ADMIN_EMAIL');
            putenv('TALOS_ADMIN_PASSWORD');
        }
    }

    public function test_legacy_routes_cannot_bypass_auth_gate(): void
    {
        $this->withoutVite();
        User::factory()->create();

        $this->get('/chat')
            ->assertRedirect('/');

        $this->get('/dashboard')
            ->assertRedirect('/');

        $this->followRedirects($this->get('/chat'))
            ->assertSee('TALOS Access')
            ->assertDontSee('talos-workspace-root');
    }

    public function test_invalid_login_returns_a_controlled_validation_error(): void
    {
        $this->withoutVite();
        User::factory()->create();

        $this->post('/login', [
            'email' => 'missing@example.test',
            'password' => 'wrong-password',
        ])
            ->assertSessionHasErrors('email')
            ->assertRedirect();

        $this->assertGuest();
    }

    public function test_valid_login_authenticates_the_user_and_returns_to_root(): void
    {
        $this->withoutVite();

        $user = User::factory()->create([
            'email' => 'operator@example.test',
            'password' => 'password',
        ]);

        $this->post('/login', [
            'email' => 'operator@example.test',
            'password' => 'password',
        ])
            ->assertRedirect('/');

        $this->assertAuthenticatedAs($user);
    }

    public function test_login_preserves_safe_redirect_after_api_auth_expiry(): void
    {
        $this->withoutVite();

        $user = User::factory()->create([
            'email' => 'operator@example.test',
            'password' => 'password',
        ]);

        $this->get('/login?redirect='.rawurlencode('/?panel=doctor'))
            ->assertOk()
            ->assertSee('name="redirect"', false)
            ->assertSee('value="/?panel=doctor"', false);

        $this->post('/login', [
            'email' => 'operator@example.test',
            'password' => 'password',
            'redirect' => '/?panel=doctor',
        ])
            ->assertRedirect('/?panel=doctor');

        $this->assertAuthenticatedAs($user);
    }

    public function test_login_rejects_external_redirect_targets(): void
    {
        $this->withoutVite();

        $user = User::factory()->create([
            'email' => 'operator@example.test',
            'password' => 'password',
        ]);

        $this->post('/login', [
            'email' => 'operator@example.test',
            'password' => 'password',
            'redirect' => 'https://example.test/steal-session',
        ])
            ->assertRedirect('/');

        $this->assertAuthenticatedAs($user);
    }

    public function test_logout_clears_the_session_and_returns_to_login(): void
    {
        $this->withoutVite();

        $user = User::factory()->create();

        $this->actingAs($user)
            ->post('/logout')
            ->assertRedirect('/login');

        $this->assertGuest();
    }
}
