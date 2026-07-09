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

        $this->assertLessThan(1100, substr_count($workspace, "\n"));
        $this->assertLessThan(900, substr_count($settings, "\n"));
    }
}
