<script setup lang="ts">
import TalosNotes from '../../productivity/TalosNotes.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template><TalosNotes /></template>
