<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosContextVaultTest extends TestCase
{
    public function test_dashboard_mounts_real_context_vault_backed_by_file_and_context_apis(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $modulePath = base_path('resources/js/components/talos/window/modules/TalosKnowledgeWindow.vue');
        $registry = file_get_contents(base_path('resources/js/lib/talosWindowRegistry.ts'));
        $composablePath = base_path('resources/js/composables/useTalosContextVault.ts');
        $vaultPath = base_path('resources/js/components/talos/context/TalosContextVault.vue');
        $dropzonePath = base_path('resources/js/components/talos/context/TalosFileDropzone.vue');
        $statusListPath = base_path('resources/js/components/talos/context/TalosFileStatusList.vue');
        $sourceDrawerPath = base_path('resources/js/components/talos/context/TalosSourceDrawer.vue');

        $this->assertIsString($shell);
        $this->assertIsString($registry);
        $this->assertFileExists($modulePath);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($vaultPath);
        $this->assertFileExists($dropzonePath);
        $this->assertFileExists($statusListPath);
        $this->assertFileExists($sourceDrawerPath);

        $composable = file_get_contents($composablePath);
        $vault = file_get_contents($vaultPath);
        $statusList = file_get_contents($statusListPath);
        $module = file_get_contents($modulePath);

        $this->assertIsString($composable);
        $this->assertIsString($vault);
        $this->assertIsString($statusList);
        $this->assertIsString($module);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosContextVault', $module);
        $this->assertStringContainsString('<TalosContextVault', $module);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosKnowledgeWindow.vue')", $registry);
        $this->assertStringContainsString('/api/talos/files', $composable);
        $this->assertStringContainsString('/api/files/ingest', $composable);
        $this->assertStringContainsString('/api/talos/context-sets', $composable);
        $this->assertStringContainsString('loadFiles', $composable);
        $this->assertStringContainsString('uploadFile', $composable);
        $this->assertStringContainsString('createContextSet', $composable);
        $this->assertStringContainsString('Context Vault', $vault);
        $this->assertStringContainsString('selectedFileIds', $vault);
        $this->assertStringContainsString('uploadFile', $vault);
        $this->assertStringContainsString('createContextSet', $vault);
        $this->assertStringContainsString("uploaded.status !== 'available'", $vault);
        $this->assertStringContainsString("file.status !== 'available'", $vault);
        $this->assertStringContainsString(':disabled="file.status !== \'available\'', $statusList);
        $this->assertStringNotContainsString('mock', strtolower($vault));
        $this->assertStringNotContainsString('fake', strtolower($vault));
        $this->assertStringNotContainsString('placeholder action', strtolower($vault));
    }
}
