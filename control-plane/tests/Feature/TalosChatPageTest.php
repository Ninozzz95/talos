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

    public function test_chat_page_component_is_chat_only_and_uses_real_persistent_sessions(): void
    {
        $component = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $sessionsComposable = file_get_contents(base_path('resources/js/composables/useTalosSessions.ts'));
        $chatComposable = file_get_contents(base_path('resources/js/composables/useTalosChat.ts'));
        $modelProfilesPath = base_path('resources/js/composables/useTalosModelProfiles.ts');
        $contextVaultPath = base_path('resources/js/composables/useTalosContextVault.ts');

        $this->assertIsString($component);
        $this->assertIsString($sessionsComposable);
        $this->assertIsString($chatComposable);
        $this->assertFileExists($modelProfilesPath);
        $this->assertFileExists($contextVaultPath);

        $modelProfilesComposable = file_get_contents($modelProfilesPath);
        $contextVaultComposable = file_get_contents($contextVaultPath);

        $this->assertIsString($modelProfilesComposable);
        $this->assertIsString($contextVaultComposable);
        $this->assertStringContainsString('/api/talos/sessions', $sessionsComposable);
        $this->assertStringContainsString('/api/talos/sessions/${sessionId}/messages', $sessionsComposable);
        $this->assertStringContainsString('/api/talos/model-profiles', $modelProfilesComposable);
        $this->assertStringContainsString('/api/talos/context-sets', $contextVaultComposable);
        $this->assertStringContainsString('talosFetch<', $sessionsComposable);
        $this->assertStringContainsString('talosFetch<', $modelProfilesComposable);
        $this->assertStringContainsString('persistUserMessage', $chatComposable);
        $this->assertStringContainsString('persistAssistantMessage', $chatComposable);
        $this->assertStringContainsString('persistSystemMessage', $chatComposable);
        $this->assertStringContainsString('session_id', $chatComposable);
        $this->assertStringContainsString('model_profile_id', $chatComposable);
        $this->assertStringContainsString('context_set_id', $chatComposable);
        $this->assertStringContainsString('run_id', $chatComposable);
        $this->assertStringContainsString('/api/talos/runs/${message.run_id}/benchmark', $component);
        $this->assertStringContainsString('Benchmark run', $component);
        $this->assertStringContainsString('/api/talos/chat', $component);
        $this->assertStringContainsString('selectedModelProfileId', $component);
        $this->assertStringContainsString('selectedContextSetId', $component);
        $this->assertStringContainsString('Server-side model profile', $component);
        $this->assertStringContainsString('Grounding context set', $component);
        $this->assertStringContainsString('talos_settings', $component);
        $this->assertStringContainsString('sendChat', $component);
        $this->assertStringContainsString('dev-only', $component);
        $this->assertStringNotContainsString('AVM comparison', $component);
        $this->assertStringNotContainsString('Dropzone massiva', $component);
        $this->assertStringNotContainsString('Failure policy', $component);
        $this->assertStringNotContainsString('TalosTraceReplay', $component);
        $this->assertStringNotContainsString('TalosRecoveryPanel', $component);
        $this->assertStringNotContainsString('dropzone', strtolower($component));
    }
}
