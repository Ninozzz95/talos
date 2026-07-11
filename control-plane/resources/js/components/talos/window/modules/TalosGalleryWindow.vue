<script setup lang="ts">
import TalosArtifactGallery from '../../documents/TalosArtifactGallery.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template><TalosArtifactGallery /></template>
