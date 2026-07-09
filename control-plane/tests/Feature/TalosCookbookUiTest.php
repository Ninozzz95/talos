<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosCookbookUiTest extends TestCase
{
    public function test_cookbook_dependencies_panel_uses_real_policy_and_dependency_endpoints(): void
    {
        $composablePath = base_path('resources/js/composables/useTalosCookbook.ts');
        $cookbookPath = base_path('resources/js/components/talos/cookbook/TalosCookbook.vue');
        $dependenciesPath = base_path('resources/js/components/talos/cookbook/TalosCookbookDependencies.vue');
        $typesPath = base_path('resources/js/lib/talosTypes.ts');

        $this->assertFileExists($composablePath);
        $this->assertFileExists($cookbookPath);
        $this->assertFileExists($dependenciesPath);
        $this->assertFileExists($typesPath);

        $composable = file_get_contents($composablePath);
        $cookbook = file_get_contents($cookbookPath);
        $dependencies = file_get_contents($dependenciesPath);
        $types = file_get_contents($typesPath);

        $this->assertIsString($composable);
        $this->assertIsString($cookbook);
        $this->assertIsString($dependencies);
        $this->assertIsString($types);

        $this->assertStringContainsString('/api/talos/cookbook/dependencies', $composable);
        $this->assertStringContainsString('/api/talos/cookbook/dependencies/preview', $composable);
        $this->assertStringContainsString('/api/talos/cookbook/policy', $composable);
        $this->assertStringContainsString('loadDependencies', $cookbook);
        $this->assertStringContainsString('previewDependencyPlan', $cookbook);
        $this->assertStringContainsString('dependencyCatalog', $cookbook);
        $this->assertStringContainsString('Preview dependency plan', $dependencies);
        $this->assertStringContainsString('execution_allowed', $dependencies);
        $this->assertStringContainsString('Install dependency', $dependencies);
        $this->assertStringContainsString('disabled', $dependencies);
        $this->assertStringContainsString('TalosCookbookDependencyCatalog', $types);
        $this->assertStringNotContainsString('mock', strtolower($dependencies));
        $this->assertStringNotContainsString('fake', strtolower($dependencies));
        $this->assertStringNotContainsString('placeholder action', strtolower($dependencies));
    }
}
