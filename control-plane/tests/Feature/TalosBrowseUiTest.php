<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosBrowseUiTest extends TestCase
{
    public function test_workspace_exposes_browse_as_an_in_place_chat_capability(): void
    {
        $composablePath = base_path('resources/js/composables/useTalosBrowse.ts');
        $workspaceBrowsePath = base_path('resources/js/composables/useTalosWorkspaceBrowse.ts');
        $obsoletePanelPath = base_path('resources/js/components/talos/workspace/panels/TalosBrowsePanel.vue');
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $leftRail = file_get_contents(base_path('resources/js/components/talos/workspace/TalosLeftRail.vue'));
        $mobileRail = file_get_contents(base_path('resources/js/components/talos/workspace/TalosMobileRail.vue'));
        $windowLayer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWindowLayer.vue'));
        $routes = file_get_contents(base_path('resources/js/lib/talosWorkspaceCommandRoutes.ts'));
        $composable = file_get_contents($composablePath);
        $workspaceBrowse = file_get_contents($workspaceBrowsePath);

        $this->assertIsString($workspace);
        $this->assertIsString($leftRail);
        $this->assertIsString($mobileRail);
        $this->assertIsString($windowLayer);
        $this->assertIsString($routes);
        $this->assertIsString($composable);
        $this->assertIsString($workspaceBrowse);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($workspaceBrowsePath);
        $this->assertFileDoesNotExist($obsoletePanelPath);

        $this->assertStringContainsString("id: 'browse'", $leftRail);
        $this->assertStringContainsString("id: 'browse'", $mobileRail);
        $this->assertStringNotContainsString("'browse'", $routes);
        $this->assertStringNotContainsString('TalosBrowsePanel', $windowLayer);
        $this->assertStringNotContainsString('TalosBrowsePanel', $workspace);
        $this->assertStringNotContainsString('talos-browse-page-controls', $workspace);
        $this->assertStringContainsString("initialSurface === 'browse'", $workspace);
        $this->assertStringContainsString('toggleBrowseMode', $workspace);
        $this->assertStringContainsString('<TalosWindowLayer', $workspace);
        $this->assertStringContainsString('<TalosChatSurface', $workspace);
        $this->assertStringContainsString('<TalosComposerDock', $workspace);
        $this->assertStringContainsString('useTalosWorkspaceBrowse', $workspace);
        $this->assertStringContainsString("window.history.replaceState({}, '', '/')", $workspaceBrowse);
        $this->assertStringContainsString('/api/talos/browser/sessions', $composable);
        $this->assertStringContainsString('/api/talos/browser/artifacts/', $composable);
        $this->assertStringContainsString('encodeURIComponent', $composable);
        $this->assertStringContainsString('latestSnapshot', $composable);
        $this->assertStringContainsString('talos_session_id', $composable);
        $this->assertStringContainsString('bindTalosSession', $composable);
        $this->assertStringContainsString('activeTalosSessionId', $workspaceBrowse);
        $this->assertStringContainsString('chatActivities.value = []', $workspaceBrowse);
        $this->assertStringContainsString('latestBrowserSnapshot', $workspaceBrowse);
        $this->assertStringContainsString(':snapshot="browserSnapshot"', file_get_contents(base_path('resources/js/components/talos/workspace/TalosChatSurface.vue')));
        $this->assertStringContainsString('talos-browser-snapshot-viewer', file_get_contents(base_path('resources/js/components/talos/chat/TalosBrowserActivity.vue')));
    }

    public function test_browse_chat_bridge_sends_only_typed_browser_mode_identity(): void
    {
        $chat = file_get_contents(base_path('resources/js/composables/useTalosChat.ts'));
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $workspaceBrowse = file_get_contents(base_path('resources/js/composables/useTalosWorkspaceBrowse.ts'));
        $composer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosComposerDock.vue'));

        $this->assertIsString($chat);
        $this->assertIsString($workspace);
        $this->assertIsString($workspaceBrowse);
        $this->assertIsString($composer);
        $this->assertStringContainsString('browserMode', $chat);
        $this->assertStringContainsString('browser_mode', $chat);
        $this->assertStringContainsString('browser_session_id', $chat);
        $this->assertStringContainsString('browserContextEligible', $workspaceBrowse);
        $this->assertStringContainsString(':browser-mode="browserMode"', $workspace);
        $this->assertStringContainsString('browserMode: TalosBrowserMode', $composer);
    }
}
