<script setup lang="ts">
import TalosKnowledgeWindow from './TalosKnowledgeWindow.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <TalosKnowledgeWindow :context="context" />
</template>
