<script setup lang="ts">
import { CircleAlert, ExternalLink, ShieldCheck } from '@lucide/vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import type { TalosBrowserHmiMode } from '@/lib/talosBrowserHmiPolicy'
import type { TalosMobileBrowserPresentation } from '@/lib/browser/browserContracts'
import { useSettingsStore } from '@/stores/settings'

withDefaults(defineProps<{
    developmentMode?: boolean
}>(), {
    developmentMode: false,
})

const settings = useSettingsStore()
const policyItems = [
    { value: 'read_only', label: 'Read only' },
    { value: 'confirm_sensitive', label: 'Confirm sensitive only' },
    { value: 'confirm_every_interaction', label: 'Confirm every interaction' },
]
const presentationItems = [
    { value: 'isolated_webview', label: 'Isolated in-app browser' },
    { value: 'system_browser', label: 'System browser' },
]

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
    event: Event,
): void {
    void settings.setBrowserPreferences({ [key]: (event.target as HTMLInputElement).checked })
}
</script>

<template>
    <div class="space-y-5" data-testid="talos-mobile-browser-settings">
        <section class="grid gap-4 sm:grid-cols-2" aria-label="Browser behavior">
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Interaction policy</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.browser.hmi_mode"
                    :items="policyItems"
                    aria-label="Browser interaction policy"
                    @update:model-value="setPolicy"
                />
            </label>
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Open links in</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.browser.presentation"
                    :items="presentationItems"
                    aria-label="Open browser links in"
                    @update:model-value="setPresentation"
                />
            </label>
        </section>

        <div class="flex items-start gap-3 border-y border-[var(--talos-border)] py-3">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <p class="text-xs leading-5 text-[var(--talos-muted)]">
                Confirm sensitive only removes repeated prompts for routine navigation. TALOS still evaluates every action; payments, credentials, uploads, downloads and external writes always keep mandatory policy gates.
            </p>
        </div>

        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 py-2">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Suggest Browse for links</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Show an isolated open action when a message contains an HTTP or HTTPS URL.</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                aria-label="Suggest Browse for links"
                :checked="settings.state.browser.suggest_for_urls"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setBoolean('suggest_for_urls', $event)"
            >
        </label>

        <label v-if="developmentMode" class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-t border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Untrusted browser evidence</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Developer-only raw snapshot nodes. Page content remains untrusted.</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                aria-label="Show untrusted browser evidence"
                :checked="settings.state.browser.developer_untrusted_evidence"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setBoolean('developer_untrusted_evidence', $event)"
            >
        </label>

        <section class="border-t border-[var(--talos-border)] pt-4" aria-label="Trusted browser node status">
            <div class="flex items-start gap-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3">
                <CircleAlert class="mt-0.5 size-4 shrink-0 text-[var(--talos-warning)]" aria-hidden="true" />
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-[var(--talos-text)]">Trusted node not paired</p>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Manual pages are fully interactive, but the model cannot inspect, capture or control them until a user-authenticated TALOS node is paired.
                    </p>
                </div>
            </div>
            <p class="mt-3 flex items-center gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
                Raw worker URLs, service tokens and signing keys are never stored on this device.
            </p>
        </section>
    </div>
</template>
