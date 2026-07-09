<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosUiStructureTest extends TestCase
{
    public function test_workspace_and_settings_are_split_into_focused_components(): void
    {
        $workspacePath = base_path('resources/js/components/talos/workspace/TalosWorkspace.vue');
        $settingsPath = base_path('resources/js/components/talos/settings/TalosSettingsCenter.vue');

        $workspace = file_get_contents($workspacePath);
        $settings = file_get_contents($settingsPath);

        $this->assertIsString($workspace);
        $this->assertIsString($settings);

        foreach ([
            'resources/js/components/talos/workspace/TalosWorkspaceHeader.vue' => 'TalosWorkspaceHeader',
            'resources/js/components/talos/workspace/TalosWindowLayer.vue' => 'TalosWindowLayer',
            'resources/js/components/talos/workspace/TalosChatSurface.vue' => 'TalosChatSurface',
            'resources/js/components/talos/workspace/TalosComposerDock.vue' => 'TalosComposerDock',
            'resources/js/components/talos/workspace/TalosMobileRail.vue' => 'TalosMobileRail',
        ] as $path => $componentName) {
            $this->assertFileExists(base_path($path));
            $this->assertStringContainsString($componentName, $workspace);
        }

        foreach ([
            'resources/js/components/talos/settings/TalosSettingsModelsPanel.vue' => 'TalosSettingsModelsPanel',
            'resources/js/components/talos/settings/TalosSettingsSearchPanel.vue' => 'TalosSettingsSearchPanel',
            'resources/js/components/talos/settings/TalosSettingsAppearancePanel.vue' => 'TalosSettingsAppearancePanel',
            'resources/js/components/talos/settings/TalosSettingsToolsPanel.vue' => 'TalosSettingsToolsPanel',
            'resources/js/components/talos/settings/TalosSettingsIntegrationsPanel.vue' => 'TalosSettingsIntegrationsPanel',
        ] as $path => $componentName) {
            $this->assertFileExists(base_path($path));
            $this->assertStringContainsString($componentName, $settings);
        }

        $this->assertLessThan(1200, substr_count($workspace, "\n"));
        $this->assertLessThan(900, substr_count($settings, "\n"));
    }

    public function test_slice_one_workspace_controls_are_wired_to_real_state(): void
    {
        $workspace = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $windowLayer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWindowLayer.vue'));
        $toolWindow = file_get_contents(base_path('resources/js/components/talos/window/TalosToolWindow.vue'));
        $settings = file_get_contents(base_path('resources/js/components/talos/settings/TalosSettingsCenter.vue'));
        $appearancePanel = file_get_contents(base_path('resources/js/components/talos/settings/TalosSettingsAppearancePanel.vue'));
        $shortcutsPanel = file_get_contents(base_path('resources/js/components/talos/settings/TalosSettingsShortcutsPanel.vue'));
        $shortcuts = file_get_contents(base_path('resources/js/lib/talosShortcuts.ts'));
        $appearance = file_get_contents(base_path('resources/js/lib/talosAppearancePreferences.ts'));
        $brandSurfaces = implode("\n", [
            (string) file_get_contents(base_path('resources/js/components/talos/workspace/TalosChatSurface.vue')),
            (string) file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspaceHeader.vue')),
            (string) file_get_contents(base_path('resources/js/components/talos/workspace/TalosLeftRail.vue')),
        ]);
        $css = file_get_contents(base_path('resources/css/app.css'));

        foreach ([$workspace, $windowLayer, $toolWindow, $settings, $appearancePanel, $shortcutsPanel, $shortcuts, $appearance, $brandSurfaces, $css] as $source) {
            $this->assertIsString($source);
        }

        $this->assertStringContainsString('fullscreenWindowIds', $workspace);
        $this->assertStringContainsString(':fullscreen-window-ids="fullscreenWindowIds"', $workspace);
        $this->assertStringContainsString('@fullscreen-window="toggleFullscreenWindow"', $workspace);
        $this->assertStringContainsString('talos-floating-window-fullscreen', $windowLayer);
        $this->assertStringContainsString('data-window-fullscreen', $toolWindow);
        $this->assertStringContainsString('talos-tool-window-fullscreen', $css);

        $this->assertStringContainsString('appearance_visibility', $settings);
        $this->assertStringContainsString('appearanceGroups', $appearancePanel);
        $this->assertStringContainsString('TALOS_APPEARANCE_GROUPS', $appearance);
        $this->assertStringContainsString('chat_area', $appearance);
        $this->assertStringContainsString('chat_bar', $appearance);
        $this->assertStringContainsString('sidebar', $appearance);

        $this->assertStringContainsString('keyboard_shortcuts', $settings);
        $this->assertStringContainsString('TalosSettingsShortcutsPanel', $settings);
        $this->assertStringContainsString('shortcutFromKeyboardEvent', $shortcutsPanel);
        $this->assertStringContainsString('toggle_sidebar', $shortcuts);
        $this->assertStringContainsString('open_compare', $shortcuts);

        $this->assertStringContainsString('talos-short-logo-mark', $brandSurfaces);
        $this->assertFileExists(base_path('public/talos/brand/logo-short.svg'));
        $this->assertStringContainsString('--talos-scrollbar-thumb', $css);
    }
}
