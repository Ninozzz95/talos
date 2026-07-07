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

    public function test_talos_vue_shell_keeps_chat_as_the_primary_surface(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));

        $this->assertIsString($shell);
        $this->assertStringContainsString('talos-chat-thread', $shell);
        $this->assertStringContainsString('Chat conversation', $shell);
        $this->assertStringContainsString('Ask Talos', $shell);
        $this->assertStringContainsString('/api/talos/chat', $shell);
        $this->assertStringContainsString('talos_settings', $shell);
        $this->assertStringContainsString('sendChat', $shell);
    }
}
