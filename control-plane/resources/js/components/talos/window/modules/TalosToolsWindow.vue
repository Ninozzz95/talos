<script setup lang="ts">
import TalosToolRegistry from '../../tools/TalosToolRegistry.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template><TalosToolRegistry /></template>
