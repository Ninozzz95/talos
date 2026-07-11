<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosResearchWorkbenchTest extends TestCase
{
    public function test_dashboard_mounts_real_research_workbench_only_in_dashboard(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $modulePath = base_path('resources/js/components/talos/window/modules/TalosResearchWindow.vue');
        $registry = file_get_contents(base_path('resources/js/lib/talosWindowRegistry.ts'));
        $chat = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $composablePath = base_path('resources/js/composables/useTalosResearch.ts');
        $workbenchPath = base_path('resources/js/components/talos/research/TalosResearchWorkbench.vue');
        $sourceTablePath = base_path('resources/js/components/talos/research/TalosSourceTable.vue');
        $claimVerifierPath = base_path('resources/js/components/talos/research/TalosClaimVerifier.vue');
        $queuePath = base_path('resources/js/components/talos/research/TalosResearchQueue.vue');
        $settingsPath = base_path('resources/js/components/talos/research/TalosResearchSettingsPanel.vue');
        $graphPath = base_path('resources/js/components/talos/research/TalosClaimSourceGraph.vue');

        $this->assertIsString($shell);
        $this->assertIsString($registry);
        $this->assertIsString($chat);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($workbenchPath);
        $this->assertFileExists($sourceTablePath);
        $this->assertFileExists($claimVerifierPath);
        $this->assertFileExists($queuePath);
        $this->assertFileExists($settingsPath);
        $this->assertFileExists($graphPath);
        $this->assertFileExists($modulePath);

        $composable = file_get_contents($composablePath);
        $workbench = file_get_contents($workbenchPath);
        $sourceTable = file_get_contents($sourceTablePath);
        $claimVerifier = file_get_contents($claimVerifierPath);
        $queue = file_get_contents($queuePath);
        $settings = file_get_contents($settingsPath);
        $graph = file_get_contents($graphPath);
        $module = file_get_contents($modulePath);

        $this->assertIsString($composable);
        $this->assertIsString($workbench);
        $this->assertIsString($sourceTable);
        $this->assertIsString($claimVerifier);
        $this->assertIsString($queue);
        $this->assertIsString($settings);
        $this->assertIsString($graph);
        $this->assertIsString($module);
        $this->assertStringContainsString('/api/talos/research-reports', $composable);
        $this->assertStringContainsString('createResearchReport', $composable);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosResearchWorkbench', $module);
        $this->assertStringContainsString('<TalosResearchWorkbench', $module);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosResearchWindow.vue')", $registry);
        $this->assertStringContainsString('TalosSourceTable', $workbench);
        $this->assertStringContainsString('TalosClaimVerifier', $workbench);
        $this->assertStringContainsString('TalosResearchQueue', $workbench);
        $this->assertStringContainsString('TalosResearchSettingsPanel', $workbench);
        $this->assertStringContainsString('TalosClaimSourceGraph', $workbench);
        $this->assertStringContainsString('Research query', $workbench);
        $this->assertStringContainsString('Queue report', $workbench);
        $this->assertStringContainsString('Start research', $workbench);
        $this->assertStringContainsString('Rounds selector', $settings);
        $this->assertStringContainsString('Format selector', $settings);
        $this->assertStringContainsString('Search engine selector', $settings);
        $this->assertStringContainsString('Endpoint selector', $settings);
        $this->assertStringContainsString('Model selector', $settings);
        $this->assertStringContainsString('Claim-source graph', $graph);
        $this->assertStringContainsString('queue_status', $queue);
        $this->assertStringContainsString("status: 'planned'", $workbench);
        $this->assertStringContainsString("status: 'pending'", $workbench);
        $this->assertStringNotContainsString("status: 'fetched'", $workbench);
        $this->assertStringNotContainsString("status: 'verified'", $workbench);
        $this->assertStringContainsString('blocked_by_source', $claimVerifier);
        $this->assertStringContainsString('failure_reason', $sourceTable);
        $this->assertStringContainsString('claim-source mapping', strtolower($claimVerifier));
        $this->assertStringNotContainsString('TalosResearchWorkbench', $chat);
        $this->assertStringNotContainsString('mock', strtolower($workbench.$sourceTable.$claimVerifier.$queue.$settings.$graph));
        $this->assertStringNotContainsString('fake', strtolower($workbench.$sourceTable.$claimVerifier.$queue.$settings.$graph));
        $this->assertStringNotContainsString('placeholder action', strtolower($workbench.$sourceTable.$claimVerifier.$queue.$settings.$graph));
    }
}
