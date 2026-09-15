<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const TalosMobileModelCatalog = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileModelCatalog.vue'),
)
</script>

<template>
    <section data-testid="settings-models-catalog-screen" class="h-full min-w-0 overflow-y-auto bg-[var(--talos-background)] p-[var(--talos-space-page)] text-[var(--talos-text)]">
        <TalosMobileModelCatalog />
    </section>
</template>
