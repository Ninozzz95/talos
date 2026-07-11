<script setup lang="ts">
import TalosBenchmarkWorkbench from '../../benchmarks/TalosBenchmarkWorkbench.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <TalosBenchmarkWorkbench
        compare-endpoint="/api/benchmarks/compare"
        groups-endpoint="/api/talos/benchmark-groups"
        export-endpoint="/api/talos/benchmark-groups/{id}/export"
        :default-runs="1"
        :initial-benchmark-group-id="context.selectedBenchmarkGroupId"
        :initial-scenario-ref="context.selectedBenchmarkScenarioRef"
    />
</template>
