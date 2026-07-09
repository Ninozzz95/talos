<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosModelCenterTest extends TestCase
{
    public function test_dashboard_mounts_a_real_model_center_backed_by_profile_apis(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $windowLayer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWindowLayer.vue'));
        $componentPath = base_path('resources/js/components/talos/models/TalosModelCenter.vue');
        $quickAddPath = base_path('resources/js/components/talos/models/TalosModelQuickAdd.vue');
        $advancedOptionsPath = base_path('resources/js/components/talos/models/TalosModelAdvancedOptions.vue');
        $providerIconPath = base_path('resources/js/components/talos/models/TalosProviderIcon.vue');
        $providerCatalogPath = base_path('resources/js/lib/talosProviders.ts');
        $composable = file_get_contents(base_path('resources/js/composables/useTalosModelProfiles.ts'));

        $this->assertIsString($shell);
        $this->assertIsString($windowLayer);
        $this->assertIsString($composable);
        $this->assertFileExists($componentPath);
        $this->assertFileExists($quickAddPath);
        $this->assertFileExists($advancedOptionsPath);
        $this->assertFileExists($providerIconPath);
        $this->assertFileExists($providerCatalogPath);

        $component = file_get_contents($componentPath);
        $quickAdd = file_get_contents($quickAddPath);
        $providerCatalog = file_get_contents($providerCatalogPath);

        $this->assertIsString($component);
        $this->assertIsString($quickAdd);
        $this->assertIsString($providerCatalog);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosModelCenter', $windowLayer);
        $this->assertStringContainsString('<TalosModelCenter', $windowLayer);
        $this->assertStringContainsString('/api/talos/model-profiles', $composable);
        $this->assertStringContainsString('createModelProfile', $composable);
        $this->assertStringContainsString('updateModelProfile', $composable);
        $this->assertStringContainsString('deleteModelProfile', $composable);
        $this->assertStringContainsString('probeModelProfile', $composable);
        $this->assertStringContainsString('createModelProfile', $quickAdd);
        $this->assertStringContainsString('probeDraftModelProfile', $quickAdd);
        $this->assertStringContainsString('probeModelProfile', $component);
        $this->assertStringContainsString('deleteModelProfile', $component);
        $this->assertStringContainsString('TalosModelQuickAdd', $component);
        $this->assertStringContainsString('TalosProviderIcon', $component);
        $this->assertStringContainsString('Test and add', $quickAdd);
        $this->assertStringContainsString('Advanced options', $quickAdd);
        $this->assertStringContainsString('timeout_seconds', $quickAdd);
        $this->assertStringContainsString('Timeout seconds', file_get_contents($advancedOptionsPath));
        $this->assertStringContainsString('openrouter', $providerCatalog);
        $this->assertStringContainsString('anthropic', $providerCatalog);
        $this->assertStringContainsString('gemini', $providerCatalog);
        $this->assertStringContainsString('ollama', $providerCatalog);
        $this->assertStringContainsString('secret', $component);
        $this->assertStringContainsString('has_secret', $component);
        $this->assertStringContainsString('Provider-first model setup', $quickAdd);
        $this->assertStringNotContainsString('mock', strtolower($component));
        $this->assertStringNotContainsString('placeholder action', strtolower($component));
    }
}
