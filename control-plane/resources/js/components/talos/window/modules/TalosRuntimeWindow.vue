<script setup lang="ts">
import TalosRunTimeline from '../../runs/TalosRunTimeline.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <TalosRunTimeline
        :requested-tab="context.runtimeRequestedTab"
        :requested-tab-revision="context.runtimeRequestedTabRevision"
        @open-audit-log="context.openAuditLog"
    />
</template>
