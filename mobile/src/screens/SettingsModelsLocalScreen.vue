<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const TalosMobileLocalModels = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileLocalModels.vue'),
)
</script>

<template>
    <section data-testid="settings-models-local-screen" class="h-full min-w-0 overflow-y-auto bg-[var(--talos-background)] p-[var(--talos-space-page)] text-[var(--talos-text)]">
        <TalosMobileLocalModels />
    </section>
</template>
