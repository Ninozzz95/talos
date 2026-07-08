<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosModelCenterTest extends TestCase
{
    public function test_dashboard_mounts_a_real_model_center_backed_by_profile_apis(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));
        $componentPath = base_path('resources/js/components/talos/models/TalosModelCenter.vue');
        $composable = file_get_contents(base_path('resources/js/composables/useTalosModelProfiles.ts'));

        $this->assertIsString($shell);
        $this->assertIsString($composable);
        $this->assertFileExists($componentPath);

        $component = file_get_contents($componentPath);

        $this->assertIsString($component);
        $this->assertStringContainsString('TalosModelCenter', $shell);
        $this->assertStringContainsString('<TalosModelCenter', $shell);
        $this->assertStringContainsString('/api/talos/model-profiles', $composable);
        $this->assertStringContainsString('createModelProfile', $composable);
        $this->assertStringContainsString('updateModelProfile', $composable);
        $this->assertStringContainsString('deleteModelProfile', $composable);
        $this->assertStringContainsString('probeModelProfile', $composable);
        $this->assertStringContainsString('createModelProfile', $component);
        $this->assertStringContainsString('probeModelProfile', $component);
        $this->assertStringContainsString('deleteModelProfile', $component);
        $this->assertStringContainsString('secret', $component);
        $this->assertStringContainsString('has_secret', $component);
        $this->assertStringContainsString('Server-side provider profiles', $component);
        $this->assertStringNotContainsString('mock', strtolower($component));
        $this->assertStringNotContainsString('placeholder action', strtolower($component));
    }
}
