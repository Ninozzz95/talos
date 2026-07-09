<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosChatPageTest extends TestCase
{
    public function test_chat_route_serves_the_unified_workspace_with_chat_focus(): void
    {
        $this->withoutVite();

        $response = $this->get('/chat');

        $response
            ->assertRedirect('/');
    }

    public function test_chat_page_component_delegates_to_the_unified_workspace_chat_engine(): void
    {
        $component = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $chatSurface = file_get_contents(base_path('resources/js/components/talos/workspace/TalosChatSurface.vue'));
        $composer = file_get_contents(base_path('resources/js/components/talos/chat/TalosSlimComposer.vue'));
        $sessionsComposable = file_get_contents(base_path('resources/js/composables/useTalosSessions.ts'));
        $chatComposable = file_get_contents(base_path('resources/js/composables/useTalosChat.ts'));
        $exportDialogPath = base_path('resources/js/components/talos/chat/TalosExportDialog.vue');
        $modelProfilesPath = base_path('resources/js/composables/useTalosModelProfiles.ts');
        $contextVaultPath = base_path('resources/js/composables/useTalosContextVault.ts');

        $this->assertIsString($component);
        $this->assertIsString($workspace);
        $this->assertIsString($chatSurface);
        $this->assertIsString($composer);
        $this->assertIsString($sessionsComposable);
        $this->assertIsString($chatComposable);
        $this->assertFileExists($exportDialogPath);
        $this->assertFileExists($modelProfilesPath);
        $this->assertFileExists($contextVaultPath);

        $exportDialog = file_get_contents($exportDialogPath);
        $modelProfilesComposable = file_get_contents($modelProfilesPath);
        $contextVaultComposable = file_get_contents($contextVaultPath);

        $this->assertIsString($exportDialog);
        $this->assertIsString($modelProfilesComposable);
        $this->assertIsString($contextVaultComposable);
        $this->assertStringContainsString('/api/talos/sessions', $sessionsComposable);
        $this->assertStringContainsString('/api/talos/sessions/${sessionId}/messages', $sessionsComposable);
        $this->assertStringContainsString('/api/talos/sessions/${sessionId}/export', $sessionsComposable);
        $this->assertStringContainsString('exportSession', $sessionsComposable);
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
        $this->assertStringContainsString('TalosWorkspace', $component);
        $this->assertStringContainsString('initial-surface="chat"', $component);
        $this->assertStringContainsString('TalosExportDialog', $workspace);
        $this->assertStringContainsString('Export session evidence', $exportDialog);
        $this->assertStringContainsString('JSON evidence pack', $exportDialog);
        $this->assertStringContainsString('Markdown transcript', $exportDialog);
        $this->assertStringContainsString('Context manifest', $exportDialog);
        $this->assertStringContainsString('Benchmark scenario', $exportDialog);
        $this->assertStringContainsString('/api/talos/runs/${message.run_id}/benchmark', $workspace);
        $this->assertStringContainsString('Benchmark run', $workspace);
        $this->assertStringContainsString('/api/talos/chat', $workspace);
        $this->assertStringContainsString('selectedModelProfileId', $workspace);
        $this->assertStringContainsString('selectedContextSetId', $workspace);
        $this->assertStringContainsString('talos-chat-layout', $workspace);
        $this->assertStringContainsString('TalosChatSurface', $workspace);
        $this->assertStringContainsString('talos-chat-composer-shell', $composer);
        $this->assertStringContainsString('talos-chat-thread', $chatSurface);
        $this->assertStringContainsString('sendChat', $workspace);
        $this->assertStringNotContainsString('No server-side model profiles', $composer);
        $this->assertStringNotContainsString('No Context Vault sets', $composer);
        $this->assertStringNotContainsString('AVM comparison', $component);
        $this->assertStringNotContainsString('Dropzone massiva', $component);
        $this->assertStringNotContainsString('Failure policy', $component);
        $this->assertStringNotContainsString('TalosTraceReplay', $component);
        $this->assertStringNotContainsString('TalosRecoveryPanel', $component);
        $this->assertStringNotContainsString('dropzone', strtolower($component));
    }
}
