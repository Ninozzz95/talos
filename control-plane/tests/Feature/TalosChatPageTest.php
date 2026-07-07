<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosChatPageTest extends TestCase
{
    public function test_chat_route_serves_a_dedicated_chat_mount(): void
    {
        $this->withoutVite();

        $response = $this->get('/chat');

        $response
            ->assertOk()
            ->assertSee('Talos Chat')
            ->assertSee('talos-chat-root')
            ->assertDontSee('talos-product-contract');
    }

    public function test_chat_page_component_is_chat_only_and_uses_real_kadmos_endpoint(): void
    {
        $component = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));

        $this->assertIsString($component);
        $this->assertStringContainsString('/api/talos/chat', $component);
        $this->assertStringContainsString('talos_settings', $component);
        $this->assertStringContainsString('sendChat', $component);
        $this->assertStringNotContainsString('AVM comparison', $component);
        $this->assertStringNotContainsString('Dropzone massiva', $component);
        $this->assertStringNotContainsString('Failure policy', $component);
    }
}
