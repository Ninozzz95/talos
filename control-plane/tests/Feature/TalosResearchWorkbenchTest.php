<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosResearchWorkbenchTest extends TestCase
{
    public function test_dashboard_mounts_real_research_workbench_only_in_dashboard(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));
        $chat = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $composablePath = base_path('resources/js/composables/useTalosResearch.ts');
        $workbenchPath = base_path('resources/js/components/talos/research/TalosResearchWorkbench.vue');
        $sourceTablePath = base_path('resources/js/components/talos/research/TalosSourceTable.vue');
        $claimVerifierPath = base_path('resources/js/components/talos/research/TalosClaimVerifier.vue');

        $this->assertIsString($shell);
        $this->assertIsString($chat);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($workbenchPath);
        $this->assertFileExists($sourceTablePath);
        $this->assertFileExists($claimVerifierPath);

        $composable = file_get_contents($composablePath);
        $workbench = file_get_contents($workbenchPath);
        $sourceTable = file_get_contents($sourceTablePath);
        $claimVerifier = file_get_contents($claimVerifierPath);

        $this->assertIsString($composable);
        $this->assertIsString($workbench);
        $this->assertIsString($sourceTable);
        $this->assertIsString($claimVerifier);
        $this->assertStringContainsString('/api/talos/research-reports', $composable);
        $this->assertStringContainsString('createResearchReport', $composable);
        $this->assertStringContainsString('TalosResearchWorkbench', $shell);
        $this->assertStringContainsString('<TalosResearchWorkbench', $shell);
        $this->assertStringContainsString('TalosSourceTable', $workbench);
        $this->assertStringContainsString('TalosClaimVerifier', $workbench);
        $this->assertStringContainsString("status: 'planned'", $workbench);
        $this->assertStringContainsString("status: 'pending'", $workbench);
        $this->assertStringNotContainsString("status: 'fetched'", $workbench);
        $this->assertStringNotContainsString("status: 'verified'", $workbench);
        $this->assertStringContainsString('blocked_by_source', $claimVerifier);
        $this->assertStringContainsString('failure_reason', $sourceTable);
        $this->assertStringContainsString('claim-source mapping', strtolower($claimVerifier));
        $this->assertStringNotContainsString('TalosResearchWorkbench', $chat);
        $this->assertStringNotContainsString('mock', strtolower($workbench.$sourceTable.$claimVerifier));
        $this->assertStringNotContainsString('fake', strtolower($workbench.$sourceTable.$claimVerifier));
        $this->assertStringNotContainsString('placeholder action', strtolower($workbench.$sourceTable.$claimVerifier));
    }
}
