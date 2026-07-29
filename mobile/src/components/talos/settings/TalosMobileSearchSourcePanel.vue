<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Check, ExternalLink, Loader2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { TALOS_SEARCH_SOURCES, type TalosSearchSourceId } from '@/lib/search/searchSources'

/**
 * F1 — choosing where web search comes from.
 *
 * TALOS has no index of the web. Nobody does: an index is bought or licensed.
 * What TALOS adds is the part that matters — the pages are fetched and read on
 * this device, so only the QUERY leaves it.
 *
 * D3: until a source is chosen, the web tools are not offered to the model at
 * all. That is why this screen exists before the feature does anything, and why
 * it says so out loud rather than letting the model promise a search it cannot
 * run.
 *
 * The key never enters app state: it goes straight to the OS secure storage,
 * like every provider key, and this screen only ever learns whether one is set.
 */
const settings = useSettingsStore()
const { t } = useTalosI18n()

const selected = computed<TalosSearchSourceId | null>(() => settings.state.search.source)
const source = computed(() => TALOS_SEARCH_SOURCES.find((entry) => entry.id === selected.value) ?? null)

const keyDraft = ref('')
const endpointDraft = ref('')
const hasKey = ref(false)
const busy = ref(false)
const tavilyOpening = ref(false)
const feedback = ref<string | null>(null)
const TAVILY_PLATFORM_URL = 'https://app.tavily.com/'

const NOTE_KEYS: Record<TalosSearchSourceId, string> = {
    tavily: 'search.tavilyNote',
    brave: 'search.braveNote',
    searxng: 'search.searxngNote',
    custom: 'search.customNote',
}

async function refreshKeyState(): Promise<void> {
    if (!selected.value) { hasKey.value = false; return }
    const { hasProviderKey } = await import('@/services/secureKeyStore')
    hasKey.value = await hasProviderKey(`search.${selected.value}`).catch(() => false)
}

onMounted(() => {
    endpointDraft.value = settings.state.search.endpoint ?? ''
    void refreshKeyState()
})

async function choose(id: TalosSearchSourceId): Promise<void> {
    await settings.setSearchPreferences({ source: id })
    feedback.value = null
    keyDraft.value = ''
    await refreshKeyState()
}

async function saveKey(): Promise<void> {
    if (!selected.value || keyDraft.value.trim() === '' || busy.value) return
    busy.value = true
    feedback.value = null
    try {
        const { setProviderKey } = await import('@/services/secureKeyStore')
        await setProviderKey(`search.${selected.value}`, keyDraft.value)
        keyDraft.value = ''
        await refreshKeyState()
        feedback.value = t('search.keySaved')
    } catch {
        feedback.value = t('search.keySaveFailed')
    } finally {
        busy.value = false
    }
}

async function openTavilyPlatform(): Promise<void> {
    if (tavilyOpening.value) return
    tavilyOpening.value = true
    feedback.value = null
    try {
        const { openTalosLinkOnce } = await import('@/services/inAppBrowserService')
        const opened = await openTalosLinkOnce(TAVILY_PLATFORM_URL, 'system_browser')
        if (!opened) feedback.value = t('search.tavilyOpenFailed')
    } catch {
        feedback.value = t('search.tavilyOpenFailed')
    } finally {
        tavilyOpening.value = false
    }
}

async function saveEndpoint(): Promise<void> {
    await settings.setSearchPreferences({ endpoint: endpointDraft.value.trim() || null })
    feedback.value = t('search.addressSaved')
}

async function clearSource(): Promise<void> {
    if (selected.value) {
        const { clearProviderKey } = await import('@/services/secureKeyStore')
        await clearProviderKey(`search.${selected.value}`).catch(() => {})
    }
    await settings.setSearchPreferences({ source: null, endpoint: null })
    hasKey.value = false
    feedback.value = null
}

/** What the model will actually be offered, said plainly. */
const readiness = computed(() => {
    if (!source.value) return t('search.noSource')
    if (source.value.needsKey && !hasKey.value) return t('search.keyNeeded')
    if (source.value.needsEndpoint && !settings.state.search.endpoint) {
        return t('search.addressNeeded')
    }
    return t('search.ready')
})
</script>

<template>
    <section class="pt-4" data-testid="talos-search-source">
        <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('search.title') }}</h3>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('search.description') }}
        </p>

        <ul class="mt-3 space-y-2">
            <li v-for="entry in TALOS_SEARCH_SOURCES" :key="entry.id">
                <button
                    type="button"
                    :data-testid="`talos-search-source-${entry.id}`"
                    class="talos-pressable flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left"
                    :class="selected === entry.id
                        ? 'border-[var(--talos-accent-border)] bg-[var(--talos-panel)]'
                        : 'border-[var(--talos-border)]'"
                    :aria-pressed="selected === entry.id"
                    @click="choose(entry.id)"
                >
                    <Check
                        class="mt-0.5 size-3.5 shrink-0"
                        :class="selected === entry.id ? 'text-[var(--talos-accent)]' : 'opacity-0'"
                        aria-hidden="true"
                    />
                    <span class="min-w-0">
                        <span class="block text-sm text-[var(--talos-text)]">{{ entry.label }}</span>
                        <span class="mt-0.5 block text-2xs leading-4 text-[var(--talos-muted)]">{{ t(NOTE_KEYS[entry.id]) }}</span>
                    </span>
                </button>
            </li>
        </ul>

        <template v-if="source">
            <Button
                v-if="selected === 'tavily'"
                type="button"
                variant="outline"
                data-testid="talos-tavily-api-key-link"
                class="mt-3 min-h-11 w-full justify-start"
                :disabled="tavilyOpening"
                @click="openTavilyPlatform"
            >
                <Loader2 v-if="tavilyOpening" class="size-3.5 animate-spin" aria-hidden="true" />
                <ExternalLink v-else class="size-3.5" aria-hidden="true" />
                {{ t('search.tavilyKeyLink') }}
            </Button>

            <label v-if="source.needsKey" class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">
                    {{ t('search.apiKey') }}
                    <span v-if="hasKey" data-testid="talos-search-key-set">{{ t('search.keyAlreadySaved') }}</span>
                </span>
                <input
                    v-model="keyDraft"
                    type="password"
                    inputmode="text"
                    autocomplete="off"
                    data-testid="talos-search-key"
                    :placeholder="hasKey ? t('search.replaceKey') : t('search.pasteKey')"
                    class="mt-1 min-h-11 w-full rounded-lg border border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)]"
                >
                <Button class="mt-2" :disabled="busy || !keyDraft.trim()" @click="saveKey">
                    <Loader2 v-if="busy" class="mr-1 size-3.5 animate-spin" aria-hidden="true" />
                    {{ t('search.saveKey') }}
                </Button>
            </label>

            <label v-if="source.needsEndpoint" class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('search.instanceAddress') }}</span>
                <input
                    v-model="endpointDraft"
                    type="url"
                    inputmode="url"
                    autocomplete="off"
                    data-testid="talos-search-endpoint"
                    :placeholder="t('search.endpointPlaceholder')"
                    class="mt-1 min-h-11 w-full rounded-lg border border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)]"
                    @blur="saveEndpoint"
                >
            </label>

            <Button variant="ghost" class="mt-2" data-testid="talos-search-clear" @click="clearSource">
                {{ t('search.turnOff') }}
            </Button>
        </template>

        <p
            data-testid="talos-search-readiness"
            class="mt-3 text-2xs leading-4 text-[var(--talos-muted)]"
        >{{ readiness }}</p>
        <p v-if="feedback" role="status" class="mt-1 text-2xs text-[var(--talos-text)]">{{ feedback }}</p>
    </section>
</template>
