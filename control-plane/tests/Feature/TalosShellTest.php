<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosShellTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_control_plane_serves_talos_shell_mount(): void
    {
        $this->withoutVite();

        $response = $this->get('/dashboard');

        $response
            ->assertRedirect('/');
    }

    public function test_root_serves_the_unified_workspace(): void
    {
        $this->withoutVite();

        $response = $this->get('/');

        $response
            ->assertOk()
            ->assertSee('talos-workspace-root')
            ->assertSee('data-talos-surface="workspace"', false);
    }

    public function test_dashboard_shell_exposes_glass_box_product_contract(): void
    {
        $this->withoutVite();

        $response = $this->get('/dashboard');

        $response
            ->assertRedirect('/');
    }

    public function test_talos_vue_shell_is_a_dashboard_focus_wrapper_for_the_unified_workspace(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));

        $this->assertIsString($shell);
        $this->assertStringContainsString('TalosWorkspace', $shell);
        $this->assertStringContainsString('initial-surface="dashboard"', $shell);
        $this->assertStringNotContainsString('dashboardTabGroups', $shell);
        $this->assertStringNotContainsString('/api/talos/chat', $shell);
        $this->assertStringNotContainsString('talos_settings', $shell);
        $this->assertStringNotContainsString('sendChat', $shell);
    }

    public function test_talos_vue_shell_does_not_present_fake_live_capabilities(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));

        $this->assertIsString($shell);
        $this->assertStringNotContainsString("value: '96%'", $shell);
        $this->assertStringNotContainsString("value: '71%'", $shell);
        $this->assertStringNotContainsString("value: '83%'", $shell);
        $this->assertStringNotContainsString('validator gate online', $shell);
        $this->assertStringNotContainsString('Operazione verificata', $shell);
        $this->assertStringNotContainsString('Dropzone massiva', $shell);
        $this->assertStringNotContainsString('3.2M righe indicizzate', $shell);
        $this->assertStringNotContainsString('Coverage</span>', $shell);
        $this->assertStringNotContainsString('Resistenza errori</span>', $shell);
        $this->assertStringNotContainsString('Provider key dev-only', $shell);
        $this->assertStringNotContainsString('DAG from chat', $shell);
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $registry = file_get_contents(base_path('resources/js/lib/talosWindowRegistry.ts'));

        $this->assertIsString($workspace);
        $this->assertIsString($registry);
        $this->assertStringContainsString('TalosWindowLayer', $workspace);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosRuntimeWindow.vue')", $registry);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosCompareWindow.vue')", $registry);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosToolsWindow.vue')", $registry);
        $this->assertStringNotContainsString('Run events unavailable', $shell);
        $this->assertStringNotContainsString('Benchmark data unavailable', $shell);
    }
}
