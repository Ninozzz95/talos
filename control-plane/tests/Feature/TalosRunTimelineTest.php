<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosRunTimelineTest extends TestCase
{
    public function test_dashboard_mounts_real_run_timeline_components(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $modulePath = base_path('resources/js/components/talos/window/modules/TalosRuntimeWindow.vue');
        $registry = file_get_contents(base_path('resources/js/lib/talosWindowRegistry.ts'));
        $composablePath = base_path('resources/js/composables/useTalosRuns.ts');
        $timelinePath = base_path('resources/js/components/talos/runs/TalosRunTimeline.vue');
        $graphPath = base_path('resources/js/components/talos/runs/TalosNodeGraph.vue');
        $inspectorPath = base_path('resources/js/components/talos/runs/TalosNodeInspector.vue');
        $replayPath = base_path('resources/js/components/talos/runs/TalosTraceReplay.vue');
        $recoveryPath = base_path('resources/js/components/talos/runs/TalosRecoveryPanel.vue');
        $commandRegistryPath = base_path('resources/js/lib/commandRegistry.ts');

        $this->assertIsString($shell);
        $this->assertIsString($registry);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($timelinePath);
        $this->assertFileExists($graphPath);
        $this->assertFileExists($inspectorPath);
        $this->assertFileExists($replayPath);
        $this->assertFileExists($recoveryPath);
        $this->assertFileExists($modulePath);

        $composable = file_get_contents($composablePath);
        $timeline = file_get_contents($timelinePath);
        $recovery = file_get_contents($recoveryPath);
        $commandRegistry = file_get_contents($commandRegistryPath);
        $module = file_get_contents($modulePath);

        $this->assertIsString($composable);
        $this->assertIsString($timeline);
        $this->assertIsString($recovery);
        $this->assertIsString($commandRegistry);
        $this->assertIsString($module);
        $this->assertStringContainsString('/api/talos/runs', $composable);
        $this->assertStringContainsString('/api/talos/runs/${runId}/events', $composable);
        $this->assertStringContainsString('/api/talos/runs/${runId}/recover', $composable);
        $this->assertStringContainsString('/api/talos/runs/${runId}/replay', $composable);
        $this->assertStringContainsString('/api/talos/runs/${runId}/artifacts', $composable);
        $this->assertStringContainsString('loadRuns', $composable);
        $this->assertStringContainsString('loadRunEvents', $composable);
        $this->assertStringContainsString('recoverRunNode', $composable);
        $this->assertStringContainsString('loadRunReplay', $composable);
        $this->assertStringContainsString('loadRunArtifacts', $composable);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosRunTimeline', $module);
        $this->assertStringContainsString('<TalosRunTimeline', $module);
        $this->assertStringContainsString('@open-audit-log="context.openAuditLog"', $module);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosRuntimeWindow.vue')", $registry);
        $this->assertStringContainsString('TalosTraceReplay', $timeline);
        $this->assertStringContainsString('TalosRecoveryPanel', $timeline);
        $this->assertStringContainsString('<TalosTraceReplay', $timeline);
        $this->assertStringContainsString('<TalosRecoveryPanel', $timeline);
        $this->assertStringContainsString('Runtime cockpit', $timeline);
        $this->assertStringContainsString('<Tabs', $timeline);
        $this->assertStringContainsString('label="Runtime panels"', $timeline);
        $this->assertStringContainsString('Run summary', $timeline);
        $this->assertStringContainsString('Artifacts', $timeline);
        $this->assertStringContainsString('artifact.id', $timeline);
        $this->assertStringContainsString('artifact.run_id', $timeline);
        $this->assertStringNotContainsString('{{ artifact.uri }}', $timeline);
        $this->assertStringContainsString('Open audit log', $timeline);
        $this->assertStringContainsString('Run timeline', $timeline);
        $this->assertStringContainsString('This run succeeded; recovery is not available.', $recovery);
        $this->assertStringContainsString('Select a failed node in the dashboard timeline.', $commandRegistry);
        $this->assertStringNotContainsString('mock', strtolower($timeline));
        $this->assertStringNotContainsString('fake', strtolower($timeline));
    }
}
