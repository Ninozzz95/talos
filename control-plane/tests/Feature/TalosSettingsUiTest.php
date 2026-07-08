<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosSettingsUiTest extends TestCase
{
    public function test_settings_center_exposes_operational_categories_without_fake_action_copy(): void
    {
        $settingsCenter = file_get_contents(base_path('resources/js/components/talos/settings/TalosSettingsCenter.vue'));
        $themeEngine = file_get_contents(base_path('resources/js/components/talos/settings/TalosThemeEngine.vue'));

        $this->assertIsString($settingsCenter);
        $this->assertIsString($themeEngine);

        foreach ([
            'Models',
            'AI Defaults',
            'Search',
            'Integrations',
            'Email',
            'Reminders',
            'Appearance',
            'Shortcuts',
            'Account',
            'Agent Tools',
            'System',
        ] as $category) {
            $this->assertStringContainsString($category, $settingsCenter);
        }

        $this->assertStringContainsString('/api/talos/settings', $settingsCenter);
        $this->assertStringContainsString('TALOS_THEME_PRESETS', $themeEngine);
        $this->assertStringContainsString('data-testid="talos-theme-preset"', $themeEngine);

        foreach (['coming soon', 'not wired', 'fake', 'mock'] as $blockedCopy) {
            $this->assertStringNotContainsStringIgnoringCase($blockedCopy, $settingsCenter);
            $this->assertStringNotContainsStringIgnoringCase($blockedCopy, $themeEngine);
        }
    }
}
