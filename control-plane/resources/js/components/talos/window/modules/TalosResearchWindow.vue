<script setup lang="ts">
import TalosResearchWorkbench from '../../research/TalosResearchWorkbench.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template><TalosResearchWorkbench @open-library="context.openWindow('library')" /></template>
