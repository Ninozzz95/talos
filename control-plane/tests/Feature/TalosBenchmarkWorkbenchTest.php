<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosBenchmarkWorkbenchTest extends TestCase
{
    public function test_dashboard_mounts_real_benchmark_workbench_components(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $windowLayer = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWindowLayer.vue'));
        $chat = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $composablePath = base_path('resources/js/composables/useTalosBenchmarks.ts');
        $workbenchPath = base_path('resources/js/components/talos/benchmarks/TalosBenchmarkWorkbench.vue');
        $lanePath = base_path('resources/js/components/talos/benchmarks/TalosBenchmarkLane.vue');
        $metricPath = base_path('resources/js/components/talos/benchmarks/TalosMetricCard.vue');
        $diffPath = base_path('resources/js/components/talos/benchmarks/TalosDiffViewer.vue');
        $commandRegistryPath = base_path('resources/js/lib/commandRegistry.ts');

        $this->assertIsString($shell);
        $this->assertIsString($windowLayer);
        $this->assertIsString($chat);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($workbenchPath);
        $this->assertFileExists($lanePath);
        $this->assertFileExists($metricPath);
        $this->assertFileExists($diffPath);

        $composable = file_get_contents($composablePath);
        $workbench = file_get_contents($workbenchPath);
        $lane = file_get_contents($lanePath);
        $commandRegistry = file_get_contents($commandRegistryPath);

        $this->assertIsString($composable);
        $this->assertIsString($workbench);
        $this->assertIsString($lane);
        $this->assertIsString($commandRegistry);
        $this->assertStringContainsString('/api/benchmarks/compare', $composable);
        $this->assertStringContainsString('/api/talos/benchmark-groups', $composable);
        $this->assertStringContainsString('runBenchmarkComparison', $composable);
        $this->assertStringContainsString('loadBenchmarkGroups', $composable);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosBenchmarkWorkbench', $windowLayer);
        $this->assertStringContainsString('<TalosBenchmarkWorkbench', $windowLayer);
        $this->assertStringContainsString('TalosBenchmarkLane', $workbench);
        $this->assertStringContainsString('TalosMetricCard', $lane);
        $this->assertStringContainsString('TalosDiffViewer', $workbench);
        $this->assertStringContainsString("mode === 'tool_agent'", $workbench);
        $this->assertStringContainsString('downloadBenchmarkReport', $workbench);
        $this->assertStringContainsString('/api/talos/benchmark-groups/{id}/export', $windowLayer);
        $this->assertStringContainsString('same prompt', strtolower($workbench));
        $this->assertStringContainsString('same context', strtolower($workbench));
        $this->assertStringContainsString('same evaluator', strtolower($workbench));
        $this->assertStringContainsString('Open the dashboard workbench for AVM evidence comparisons.', $commandRegistry);
        $this->assertStringNotContainsString('Benchmark workbench is available in the dashboard.', $commandRegistry);
        $this->assertStringNotContainsString('TalosBenchmarkWorkbench', $chat);
        $this->assertStringNotContainsString('hardcoded', strtolower($workbench));
        $this->assertStringNotContainsString('fake', strtolower($workbench));
    }
}
