<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { CircleAlert, ExternalLink, ShieldCheck } from '@lucide/vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import type { TalosBrowserHmiMode } from '@/lib/talosBrowserHmiPolicy'
import type { TalosMobileBrowserPresentation } from '@/lib/browser/browserContracts'
import { useSettingsStore } from '@/stores/settings'

withDefaults(defineProps<{
    developmentMode?: boolean
}>(), {
    developmentMode: false,
})

const settings = useSettingsStore()
const { t } = useTalosI18n()
const policyItems = computed(() => [
    { value: 'read_only', label: t('browser.readOnly') },
    { value: 'confirm_sensitive', label: t('browser.confirmSensitive') },
    { value: 'confirm_every_interaction', label: t('browser.confirmEveryInteraction') },
])
const presentationItems = computed(() => [
    { value: 'isolated_webview', label: t('browser.isolatedBrowser') },
    { value: 'system_browser', label: t('browser.systemBrowser') },
])

function setPolicy(value: string): void {
    if (!['read_only', 'confirm_sensitive', 'confirm_every_interaction'].includes(value)) return
    void settings.setBrowserPreferences({ hmi_mode: value as TalosBrowserHmiMode })
}

function setPresentation(value: string): void {
    if (value !== 'isolated_webview' && value !== 'system_browser') return
    void settings.setBrowserPreferences({ presentation: value as TalosMobileBrowserPresentation })
}

function setBoolean(
    key: 'suggest_for_urls' | 'developer_untrusted_evidence',
    enabled: boolean,
): void {
    void settings.setBrowserPreferences({ [key]: enabled })
}
</script>

<template>
    <div class="space-y-5" data-testid="talos-mobile-browser-settings">
        <section class="grid gap-4 sm:grid-cols-2" :aria-label="t('browser.behavior')">
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ t('browser.interactionPolicy') }}</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.browser.hmi_mode"
                    :items="policyItems"
                    :aria-label="t('browser.interactionPolicyAria')"
                    @update:model-value="setPolicy"
                />
            </label>
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ t('browser.openLinksIn') }}</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.browser.presentation"
                    :items="presentationItems"
                    :aria-label="t('browser.openLinksInAria')"
                    @update:model-value="setPresentation"
                />
            </label>
        </section>

        <div class="flex items-start gap-3 border-y border-[var(--talos-border)] py-3">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <p class="text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('browser.policyBody') }}
            </p>
        </div>

        <div class="flex min-h-14 cursor-pointer items-start justify-between gap-3 py-2">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('browser.suggestBrowse') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('browser.suggestBrowseBody') }}</span>
            </span>
            <TalosThemedSwitch
                class="mt-1"
                :aria-label="t('browser.suggestBrowse')"
                :model-value="settings.state.browser.suggest_for_urls"
                @update:model-value="setBoolean('suggest_for_urls', $event)"
                @click.stop
            />
        </div>

        <div v-if="developmentMode" class="flex min-h-14 items-start justify-between gap-3 border-t border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('browser.untrustedBrowserEvidence') }}</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ t('browser.untrustedBrowserEvidenceBody') }}</span>
            </span>
            <TalosThemedSwitch
                class="mt-1"
                :aria-label="t('browser.showUntrustedBrowserEvidence')"
                :model-value="settings.state.browser.developer_untrusted_evidence"
                @update:model-value="setBoolean('developer_untrusted_evidence', $event)"
                @click.stop
            />
        </div>

        <section class="border-t border-[var(--talos-border)] pt-4" :aria-label="t('browser.trustedNodeStatus')">
            <div class="flex items-start gap-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3">
                <CircleAlert class="mt-0.5 size-4 shrink-0 text-[var(--talos-warning)]" aria-hidden="true" />
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-[var(--talos-text)]">{{ t('browser.trustedNodeNotPaired') }}</p>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        {{ t('browser.trustedNodeNotPairedBody') }}
                    </p>
                </div>
            </div>
            <p class="mt-3 flex items-center gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
                {{ t('browser.secretsNeverStored') }}
            </p>
        </section>
    </div>
</template>
