<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosMobilePageHeader from '@/components/talos/ui/TalosMobilePageHeader.vue'

const TalosMobileLocalModels = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileLocalModels.vue'),
)
const { t } = useTalosI18n()
</script>

<template>
    <section data-testid="settings-models-local-screen" class="h-full min-w-0 overflow-y-auto bg-[var(--talos-background)] p-[var(--talos-space-page)] text-[var(--talos-text)]">
        <!-- ⛔ G1 (14/10/2026): l'intestazione delle stazioni, col titolo e la riga della scheda del centro Modelli. -->
        <TalosMobilePageHeader
            class="pb-[var(--talos-space-section)]"
            :title="t('models.localTitle')"
            :subtitle="t('models.localDescription')"
        />
        <TalosMobileLocalModels />
    </section>
</template>
