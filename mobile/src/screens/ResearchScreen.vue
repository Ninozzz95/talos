<script setup lang="ts">
import { FileSearch } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'

const { t } = useTalosI18n()
</script>

<template>
    <TalosMobileScreen :title="t('stations.deepResearchTitle')" :eyebrow="t('stations.deepResearchEyebrow')">
        <template #eyebrow-icon>
            <FileSearch class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            {{ t('stations.deepResearchUnavailable') }}
        </div>
    </TalosMobileScreen>
</template>
