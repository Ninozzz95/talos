<script setup lang="ts">
import { LockKeyhole } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { TalosMobileSettingsTab } from './settingsTabs'

defineProps<{ tab: TalosMobileSettingsTab }>()
const { t } = useTalosI18n()
</script>

<template>
    <section
        :data-capability="tab.id"
        data-capability-state="gated"
        class="border-t border-[var(--talos-border)] pt-4"
        :aria-label="t('settingsCenter.availabilityLabel', { tab: tab.label })"
    >
        <div class="flex items-start gap-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3">
            <LockKeyhole class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" aria-hidden="true" />
            <div class="min-w-0">
                <p class="text-sm font-semibold text-[var(--talos-text)]">{{ t('settingsCenter.notAvailableYet') }}</p>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ tab.gateReason }}</p>
            </div>
        </div>
        <p class="mt-3 text-xs leading-5 text-[var(--talos-muted)]">
            {{ tab.description }} {{ t('settingsCenter.gatedExplanation') }}
        </p>
    </section>
</template>
