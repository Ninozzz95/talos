<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosBrowseUiTest extends TestCase
{
    public function test_workspace_mounts_the_owned_read_only_browse_page_surface(): void
    {
        $types = file_get_contents(base_path('resources/js/lib/talosTypes.ts'));
        $composablePath = base_path('resources/js/composables/useTalosBrowse.ts');
        $panelPath = base_path('resources/js/components/talos/workspace/panels/TalosBrowsePanel.vue');
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $leftRail = file_get_contents(base_path('resources/js/components/talos/workspace/TalosLeftRail.vue'));
        $mobileRail = file_get_contents(base_path('resources/js/components/talos/workspace/TalosMobileRail.vue'));
        $windowLayer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWindowLayer.vue'));
        $routes = file_get_contents(base_path('resources/js/lib/talosWorkspaceCommandRoutes.ts'));

        $this->assertIsString($types);
        $this->assertIsString($workspace);
        $this->assertIsString($leftRail);
        $this->assertIsString($mobileRail);
        $this->assertIsString($windowLayer);
        $this->assertIsString($routes);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($panelPath);

        $composable = file_get_contents($composablePath);
        $panel = file_get_contents($panelPath);

        $this->assertIsString($composable);
        $this->assertIsString($panel);
        $this->assertStringContainsString("id: 'browse'", $leftRail);
        $this->assertStringContainsString("id: 'browse'", $mobileRail);
        $this->assertStringNotContainsString("'browse'", $routes);
        $this->assertStringNotContainsString('TalosBrowsePanel', $windowLayer);
        $this->assertStringContainsString("initialSurface === 'browse'", $workspace);
        $this->assertStringContainsString('data-testid="talos-browse-page-controls"', $workspace);
        $this->assertStringContainsString('<TalosBrowsePanel', $workspace);
        $this->assertStringContainsString("window.location.assign('/browse')", $workspace);
        $this->assertStringContainsString('/api/talos/browser/sessions', $composable);
        $this->assertStringContainsString('/api/talos/browser/artifacts/', $composable);
        $this->assertStringContainsString('encodeURIComponent', $composable);
        $this->assertStringContainsString('latestSnapshot', $composable);
        $this->assertStringContainsString('untrusted', strtolower($panel));
        $this->assertStringContainsString('Start session', $panel);
        $this->assertStringContainsString('Capture screenshot', $panel);
        $this->assertStringContainsString('Capture snapshot', $panel);
        $this->assertStringNotContainsString('v-html', $panel);
        $this->assertStringNotContainsString('click selector', strtolower($panel));
        $this->assertStringNotContainsString('type text', strtolower($panel));
    }

    public function test_browse_audit_guards_preserve_evidence_gate_actions_and_keep_the_page_panel_reachable(): void
    {
        $composable = file_get_contents(base_path('resources/js/composables/useTalosBrowse.ts'));
        $panel = file_get_contents(base_path('resources/js/components/talos/workspace/panels/TalosBrowsePanel.vue'));
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));

        $this->assertIsString($composable);
        $this->assertIsString($panel);
        $this->assertIsString($workspace);

        $this->assertStringNotContainsString('latestScreenshot.value = null', $composable);
        $this->assertStringNotContainsString('latestSnapshot.value = null', $composable);
        $this->assertStringContainsString('canNavigate', $panel);
        $this->assertStringContainsString('canCaptureScreenshot', $panel);
        $this->assertStringContainsString('canCaptureSnapshot', $panel);
        $this->assertStringContainsString('data-testid="talos-browse-scroll-region"', $panel);
        $this->assertStringContainsString("'flex-col lg:flex-row'", $workspace);
        $this->assertStringContainsString('h-[38vh]', $workspace);
        $this->assertStringContainsString('min-h-0', $workspace);
        $this->assertStringContainsString('overflow-hidden', $workspace);
    }

    public function test_browse_chat_bridge_serializes_only_the_owned_browser_session_id(): void
    {
        $chat = file_get_contents(base_path('resources/js/composables/useTalosChat.ts'));
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $composer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosComposerDock.vue'));

        $this->assertIsString($chat);
        $this->assertIsString($workspace);
        $this->assertIsString($composer);
        $this->assertStringContainsString('browserContextSessionId', $chat);
        $this->assertStringContainsString('browser_session_id', $chat);
        $this->assertStringContainsString('browserContextEligible', $workspace);
        $this->assertStringContainsString('browser-context', $composer);
    }
}
