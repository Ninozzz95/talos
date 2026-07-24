<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { BadgeCheck, ChevronDown, KeyRound, RefreshCw, RotateCcw, Server, Trash2 } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import { TALOS_MOBILE_PROVIDERS } from '@/lib/mobileProviders'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const providers = TALOS_MOBILE_PROVIDERS.filter(
    (provider): provider is typeof provider & { id: TalosMobileProviderId } => provider.id !== 'unknown',
)
const endpointProviders = new Set<TalosMobileProviderId>(['openai', 'deepseek', 'openrouter', 'ollama'])
const keyDrafts = reactive<Partial<Record<TalosMobileProviderId, string>>>({})
const endpointDrafts = reactive<Partial<Record<TalosMobileProviderId, string>>>({})
const timeoutDrafts = reactive<Partial<Record<TalosMobileProviderId, number>>>({})
const busyProvider = ref<TalosMobileProviderId | null>(null)
const error = ref('')

// Owner 2026-07-24: each provider is a collapsible accordion, default
// COLLAPSED to declutter the long list. Accessible disclosure — button header,
// aria-expanded/controls, body display:none when collapsed (v-show → out of
// tab order + SR). The header shows status (model count / Key saved / Not
// configured) so state is legible without expanding; tap to configure.
const expanded = reactive<Partial<Record<TalosMobileProviderId, boolean>>>({})
function isExpanded(id: TalosMobileProviderId): boolean {
    return expanded[id] === true
}
function toggleProvider(id: TalosMobileProviderId): void {
    expanded[id] = !isExpanded(id)
}

watch(() => controller.endpoints, (value) => {
    for (const provider of providers) {
        if (!endpointProviders.has(provider.id)) continue
        endpointDrafts[provider.id] = value[provider.id] ?? ''
    }
}, { immediate: true, deep: true })

watch(() => controller.modelLabPreferences.value.provider_runtime, (value) => {
    for (const provider of providers) {
        timeoutDrafts[provider.id] = value[provider.id]?.timeout_seconds ?? 60
    }
}, { immediate: true, deep: true })

function modelCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'model' : 'models'} available`
}

async function run(provider: TalosMobileProviderId, action: () => Promise<unknown>): Promise<void> {
    if (busyProvider.value) return
    busyProvider.value = provider
    error.value = ''
    try {
        await action()
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'The provider operation failed.'
    } finally {
        busyProvider.value = null
    }
}

async function saveKey(provider: TalosMobileProviderId): Promise<void> {
    const key = keyDrafts[provider]?.trim() ?? ''
    if (!key) return
    await run(provider, async () => {
        await controller.saveKey(provider, key)
        keyDrafts[provider] = ''
    })
}

async function saveRuntime(provider: TalosMobileProviderId): Promise<void> {
    const timeout = Number(timeoutDrafts[provider])
    const endpoint = endpointDrafts[provider]?.trim() ?? ''
    await run(provider, async () => {
        await controller.setProviderTimeout(provider, timeout)
        if (!endpointProviders.has(provider)) {
            await controller.refreshProvider(provider)
            return
        }
        if (!endpoint) {
            if (provider === 'ollama') throw new Error('Ollama requires an endpoint reachable from this device.')
            await controller.removeEndpoint(provider)
            await controller.refreshProvider(provider)
            return
        }
        await controller.saveEndpoint(provider, endpoint)
    })
}

async function resetEndpoint(provider: TalosMobileProviderId): Promise<void> {
    await run(provider, async () => {
        await controller.removeEndpoint(provider)
        endpointDrafts[provider] = ''
        if (provider !== 'ollama') await controller.refreshProvider(provider)
    })
}
</script>

<template>
    <div data-testid="settings-provider-keys" class="space-y-4">
        <p v-if="error" role="alert" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            {{ error }}
        </p>

        <section
            v-for="provider in providers"
            :key="provider.id"
            data-provider-runtime
            :data-provider="provider.id"
            :aria-labelledby="`provider-${provider.id}-title`"
            class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)]"
        >
            <button
                type="button"
                :aria-expanded="isExpanded(provider.id)"
                :aria-controls="`provider-${provider.id}-body`"
                class="talos-pressable flex w-full min-w-0 items-center gap-2 rounded-md p-3 text-left"
                @click="toggleProvider(provider.id)"
            >
                <TalosMobileProviderIcon :provider="provider.id" class="size-7 shrink-0" />
                <div class="min-w-0 flex-1">
                    <h5 :id="`provider-${provider.id}-title`" class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ provider.label }}</h5>
                    <p class="text-[11px] text-[var(--talos-muted)]">
                        <template v-if="controller.catalogs[provider.id].status === 'ready'">{{ modelCountLabel(controller.catalogs[provider.id].models.length) }}</template>
                        <template v-else-if="controller.catalogs[provider.id].status === 'loading'">Discovering models...</template>
                        <template v-else-if="controller.catalogs[provider.id].status === 'error'">Discovery failed</template>
                        <template v-else>Not configured</template>
                    </p>
                </div>
                <span v-if="controller.secrets[provider.id]" data-testid="key-present" class="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--talos-success,var(--talos-accent))]">
                    <BadgeCheck class="size-3.5" aria-hidden="true" /> Key saved
                </span>
                <ChevronDown
                    class="size-4 shrink-0 text-[var(--talos-muted)] transition-transform"
                    :class="isExpanded(provider.id) ? '' : '-rotate-90'"
                    aria-hidden="true"
                />
            </button>

            <div v-show="isExpanded(provider.id)" :id="`provider-${provider.id}-body`" class="px-3 pb-3">
            <div v-if="provider.requiresSecret" class="flex gap-2">
                <label class="min-w-0 flex-1">
                    <span class="sr-only">{{ provider.label }} API key</span>
                    <input
                        v-model="keyDrafts[provider.id]"
                        type="password"
                        autocomplete="new-password"
                        :aria-label="`${provider.label} API key`"
                        :placeholder="controller.secrets[provider.id] ? 'Enter a replacement key' : 'Paste API key'"
                        class="h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    >
                </label>
                <button type="button" :aria-label="`Save ${provider.label} key`" :disabled="busyProvider === provider.id || !keyDrafts[provider.id]?.trim()" class="h-11 rounded-md bg-[var(--talos-accent)] px-3 text-sm font-medium text-[var(--talos-accent-contrast,var(--talos-accent-text))] disabled:opacity-50" @click="saveKey(provider.id)">
                    Save
                </button>
                <button v-if="controller.secrets[provider.id]" type="button" :aria-label="`Remove ${provider.label} key`" :disabled="busyProvider === provider.id" class="inline-flex size-11 items-center justify-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)] disabled:opacity-50" @click="run(provider.id, () => controller.removeKey(provider.id))">
                    <Trash2 class="size-4" aria-hidden="true" />
                </button>
            </div>

            <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <label v-if="endpointProviders.has(provider.id)" class="min-w-0">
                    <span class="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--talos-muted)]">
                        <Server class="size-3.5" aria-hidden="true" /> {{ provider.id === 'ollama' ? 'Endpoint' : 'Custom endpoint' }}
                    </span>
                    <input
                        v-model="endpointDrafts[provider.id]"
                        type="url"
                        inputmode="url"
                        autocapitalize="none"
                        autocomplete="url"
                        :aria-label="provider.id === 'ollama' ? 'Ollama endpoint' : `${provider.label} custom endpoint`"
                        :placeholder="provider.id === 'ollama' ? 'http://192.168.1.20:11434' : 'Official endpoint'"
                        class="h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    >
                </label>
                <div :class="endpointProviders.has(provider.id) ? '' : 'sm:col-span-2'">
                    <label :for="`provider-${provider.id}-timeout`" class="mb-1 block text-xs font-medium text-[var(--talos-muted)]">Timeout</label>
                    <div class="flex items-center gap-2">
                        <input :id="`provider-${provider.id}-timeout`" v-model.number="timeoutDrafts[provider.id]" type="range" min="5" max="300" step="5" class="min-w-0 flex-1 accent-[var(--talos-accent)]" :aria-label="`${provider.label} timeout`">
                        <input v-model.number="timeoutDrafts[provider.id]" type="number" min="5" max="300" step="1" :aria-label="`${provider.label} timeout seconds`" class="h-11 w-20 rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-2 text-sm text-[var(--talos-text)]">
                    </div>
                </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" :aria-label="`Save ${provider.label} runtime options`" :disabled="busyProvider === provider.id" class="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--talos-accent)] px-3 text-xs font-semibold text-[var(--talos-accent-contrast,var(--talos-accent-text))] disabled:opacity-50" @click="saveRuntime(provider.id)">
                    <KeyRound class="size-3.5" aria-hidden="true" /> Save runtime
                </button>
                <button type="button" :aria-label="`Refresh ${provider.label} models`" :disabled="busyProvider === provider.id" class="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--talos-border)] px-3 text-xs font-semibold text-[var(--talos-text)] disabled:opacity-50" @click="run(provider.id, () => controller.refreshProvider(provider.id))">
                    <RefreshCw class="size-3.5" aria-hidden="true" /> Refresh
                </button>
                <button v-if="endpointProviders.has(provider.id) && controller.endpoints[provider.id]" type="button" :aria-label="`Reset ${provider.label} endpoint`" :disabled="busyProvider === provider.id" class="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--talos-muted)] disabled:opacity-50" @click="resetEndpoint(provider.id)">
                    <RotateCcw class="size-3.5" aria-hidden="true" /> Reset endpoint
                </button>
            </div>

            <p v-if="controller.catalogs[provider.id].error" role="status" class="mt-2 text-xs text-[var(--talos-danger,var(--talos-muted))]">
                {{ controller.catalogs[provider.id].error }}
            </p>
            </div>
        </section>
    </div>
</template>
