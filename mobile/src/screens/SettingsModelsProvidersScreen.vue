<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { SlidersHorizontal } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileProviderRuntimePanel from '@/components/talos/models/TalosMobileProviderRuntimePanel.vue'
import TalosMobileHuggingFaceAccessCard from '@/components/talos/models/TalosMobileHuggingFaceAccessCard.vue'

const { t } = useTalosI18n()
const TalosMobileModelAdvancedOptions = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileModelAdvancedOptions.vue'),
)
</script>

<template>
    <section data-testid="settings-models-providers-screen" class="flex h-full min-w-0 flex-col gap-[var(--talos-space-section)] overflow-y-auto bg-[var(--talos-background)] p-[var(--talos-space-page)] text-[var(--talos-text)]">
        <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('models.providerAccessDescription') }}</p>
        <TalosMobileHuggingFaceAccessCard />
        <TalosMobileProviderRuntimePanel />
        <details class="rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]">
            <summary class="flex min-h-touch cursor-pointer items-center gap-[var(--talos-space-inline)] text-sm font-semibold">
                <SlidersHorizontal class="size-[var(--talos-icon-size)] text-[var(--talos-accent)]" aria-hidden="true" />
                {{ t('models.advancedManualModels') }}
            </summary>
            <div class="pt-[var(--talos-space-inline)]"><TalosMobileModelAdvancedOptions /></div>
        </details>
    </section>
</template>
