<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosToolRegistryTest extends TestCase
{
    public function test_dashboard_mounts_real_tool_registry_backed_by_connector_and_tool_apis(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $windowLayer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWindowLayer.vue'));
        $composablePath = base_path('resources/js/composables/useTalosTools.ts');
        $registryPath = base_path('resources/js/components/talos/tools/TalosToolRegistry.vue');
        $healthPath = base_path('resources/js/components/talos/tools/TalosConnectorHealth.vue');
        $schemaPath = base_path('resources/js/components/talos/tools/TalosToolSchemaViewer.vue');

        $this->assertIsString($shell);
        $this->assertIsString($windowLayer);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($registryPath);
        $this->assertFileExists($healthPath);
        $this->assertFileExists($schemaPath);

        $composable = file_get_contents($composablePath);
        $registry = file_get_contents($registryPath);
        $health = file_get_contents($healthPath);
        $schema = file_get_contents($schemaPath);

        $this->assertIsString($composable);
        $this->assertIsString($registry);
        $this->assertIsString($health);
        $this->assertIsString($schema);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosToolRegistry', $windowLayer);
        $this->assertStringContainsString('<TalosToolRegistry', $windowLayer);
        $this->assertStringContainsString('/api/talos/connectors', $composable);
        $this->assertStringContainsString('/api/talos/tools', $composable);
        $this->assertStringContainsString('/api/talos/tools/planning-context', $composable);
        $this->assertStringContainsString('loadConnectors', $composable);
        $this->assertStringContainsString('loadTools', $composable);
        $this->assertStringContainsString('loadPlanningContext', $composable);
        $this->assertStringContainsString('TalosConnectorHealth', $registry);
        $this->assertStringContainsString('TalosToolSchemaViewer', $registry);
        $this->assertStringContainsString('health_status', $health);
        $this->assertStringContainsString('input_schema', $schema);
        $this->assertStringNotContainsString('mock', strtolower($registry));
        $this->assertStringNotContainsString('fake', strtolower($registry));
        $this->assertStringNotContainsString('placeholder action', strtolower($registry));
    }
}
