<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosRunTimelineTest extends TestCase
{
    public function test_dashboard_mounts_real_run_timeline_components(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));
        $composablePath = base_path('resources/js/composables/useTalosRuns.ts');
        $timelinePath = base_path('resources/js/components/talos/runs/TalosRunTimeline.vue');
        $graphPath = base_path('resources/js/components/talos/runs/TalosNodeGraph.vue');
        $inspectorPath = base_path('resources/js/components/talos/runs/TalosNodeInspector.vue');
        $replayPath = base_path('resources/js/components/talos/runs/TalosTraceReplay.vue');
        $recoveryPath = base_path('resources/js/components/talos/runs/TalosRecoveryPanel.vue');
        $commandRegistryPath = base_path('resources/js/lib/commandRegistry.ts');

        $this->assertIsString($shell);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($timelinePath);
        $this->assertFileExists($graphPath);
        $this->assertFileExists($inspectorPath);
        $this->assertFileExists($replayPath);
        $this->assertFileExists($recoveryPath);

        $composable = file_get_contents($composablePath);
        $timeline = file_get_contents($timelinePath);
        $commandRegistry = file_get_contents($commandRegistryPath);

        $this->assertIsString($composable);
        $this->assertIsString($timeline);
        $this->assertIsString($commandRegistry);
        $this->assertStringContainsString('/api/talos/runs', $composable);
        $this->assertStringContainsString('/api/talos/runs/${runId}/events', $composable);
        $this->assertStringContainsString('/api/talos/runs/${runId}/recover', $composable);
        $this->assertStringContainsString('/api/talos/runs/${runId}/replay', $composable);
        $this->assertStringContainsString('loadRuns', $composable);
        $this->assertStringContainsString('loadRunEvents', $composable);
        $this->assertStringContainsString('recoverRunNode', $composable);
        $this->assertStringContainsString('loadRunReplay', $composable);
        $this->assertStringContainsString('TalosRunTimeline', $shell);
        $this->assertStringContainsString('<TalosRunTimeline', $shell);
        $this->assertStringContainsString('TalosTraceReplay', $timeline);
        $this->assertStringContainsString('TalosRecoveryPanel', $timeline);
        $this->assertStringContainsString('<TalosTraceReplay', $timeline);
        $this->assertStringContainsString('<TalosRecoveryPanel', $timeline);
        $this->assertStringContainsString('Run timeline', $timeline);
        $this->assertStringContainsString('Select a run in the dashboard timeline.', $commandRegistry);
        $this->assertStringNotContainsString('mock', strtolower($timeline));
        $this->assertStringNotContainsString('fake', strtolower($timeline));
    }
}
