<script setup lang="ts">
import TalosCalendar from '../../productivity/TalosCalendar.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template><TalosCalendar /></template>
