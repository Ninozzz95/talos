<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosShellTest extends TestCase
{
    public function test_control_plane_serves_talos_shell_mount(): void
    {
        $this->withoutVite();

        $response = $this->get('/dashboard');

        $response
            ->assertOk()
            ->assertSee('Talos | Kadmos Control Plane')
            ->assertSee('talos-root');
    }

    public function test_root_routes_to_the_dedicated_chat_page(): void
    {
        $response = $this->get('/');

        $response
            ->assertRedirect('/chat');
    }

    public function test_dashboard_shell_exposes_glass_box_product_contract(): void
    {
        $this->withoutVite();

        $response = $this->get('/dashboard');

        $response
            ->assertOk()
            ->assertSee('Glass Box')
            ->assertSee('/api/files/ingest')
            ->assertSee('/api/benchmarks/compare')
            ->assertSee('/api/traces/replay');
    }

    public function test_talos_vue_shell_links_to_dedicated_persistent_chat_without_local_chat_controls(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));

        $this->assertIsString($shell);
        $this->assertStringContainsString('Open persistent chat', $shell);
        $this->assertStringContainsString('href="/chat"', $shell);
        $this->assertStringNotContainsString('talos-chat-thread', $shell);
        $this->assertStringNotContainsString('Chat conversation', $shell);
        $this->assertStringNotContainsString('Ask Talos', $shell);
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
        $this->assertStringContainsString('TalosRunTimeline', $shell);
        $this->assertStringContainsString('TalosBenchmarkWorkbench', $shell);
        $this->assertStringContainsString('TalosToolRegistry', $shell);
        $this->assertStringNotContainsString('Run events unavailable', $shell);
        $this->assertStringNotContainsString('Benchmark data unavailable', $shell);
    }
}
