<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Loader2 } from '@lucide/vue'
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

const selected = computed<TalosSearchSourceId | null>(() => settings.state.search.source)
const source = computed(() => TALOS_SEARCH_SOURCES.find((entry) => entry.id === selected.value) ?? null)

const keyDraft = ref('')
const endpointDraft = ref('')
const hasKey = ref(false)
const busy = ref(false)
const feedback = ref<string | null>(null)

const NOTES: Record<TalosSearchSourceId, string> = {
    tavily: '1,000 searches a month at no cost and no card required. Built for agents, so results come back clean.',
    brave: 'An independent index — Brave does not resell Google or Bing. Since February 2026 it needs a credit card, keeps its $5 monthly credit only while you attribute Brave publicly, and has no spending cap.',
    searxng: 'Your own SearXNG, so no third party sees the query at all. One Docker container. JSON output ships disabled — turn it on in the instance settings or TALOS gets an HTML page back.',
    custom: 'Any other search API that answers with a top-level "results" array.',
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
        feedback.value = 'Key saved to this device.'
    } catch {
        feedback.value = 'The key could not be saved. Nothing was changed.'
    } finally {
        busy.value = false
    }
}

async function saveEndpoint(): Promise<void> {
    await settings.setSearchPreferences({ endpoint: endpointDraft.value.trim() || null })
    feedback.value = 'Address saved.'
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
    if (!source.value) return 'No source chosen — TALOS will not offer web search to the model.'
    if (source.value.needsKey && !hasKey.value) return 'A key is still needed. Web search stays off until it is set.'
    if (source.value.needsEndpoint && !settings.state.search.endpoint) {
        return 'The instance address is still needed. Web search stays off until it is set.'
    }
    return 'Ready — the model can search the web, and only the query leaves this device.'
})
</script>

<template>
    <section class="pt-4" data-testid="talos-search-source">
        <h3 class="text-sm font-semibold text-[var(--talos-text)]">Where web search comes from</h3>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
            TALOS has no index of the web, so it asks one of these. The pages themselves are
            downloaded and read <strong>on this device</strong> — only the query leaves it.
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
                        <span class="mt-0.5 block text-2xs leading-4 text-[var(--talos-muted)]">{{ NOTES[entry.id] }}</span>
                    </span>
                </button>
            </li>
        </ul>

        <template v-if="source">
            <label v-if="source.needsKey" class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">
                    API key <span v-if="hasKey" data-testid="talos-search-key-set">· one is already saved</span>
                </span>
                <input
                    v-model="keyDraft"
                    type="password"
                    inputmode="text"
                    autocomplete="off"
                    data-testid="talos-search-key"
                    :placeholder="hasKey ? 'Replace the saved key' : 'Paste the key'"
                    class="mt-1 min-h-11 w-full rounded-lg border border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)]"
                >
                <Button class="mt-2" :disabled="busy || !keyDraft.trim()" @click="saveKey">
                    <Loader2 v-if="busy" class="mr-1 size-3.5 animate-spin" aria-hidden="true" />
                    Save key
                </Button>
            </label>

            <label v-if="source.needsEndpoint" class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">Instance address</span>
                <input
                    v-model="endpointDraft"
                    type="url"
                    inputmode="url"
                    autocomplete="off"
                    data-testid="talos-search-endpoint"
                    placeholder="https://searx.example.org"
                    class="mt-1 min-h-11 w-full rounded-lg border border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)]"
                    @blur="saveEndpoint"
                >
            </label>

            <Button variant="ghost" class="mt-2" data-testid="talos-search-clear" @click="clearSource">
                Turn web search off
            </Button>
        </template>

        <p
            data-testid="talos-search-readiness"
            class="mt-3 text-2xs leading-4 text-[var(--talos-muted)]"
        >{{ readiness }}</p>
        <p v-if="feedback" role="status" class="mt-1 text-2xs text-[var(--talos-text)]">{{ feedback }}</p>
    </section>
</template>
