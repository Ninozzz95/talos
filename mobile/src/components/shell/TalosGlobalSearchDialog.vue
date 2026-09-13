<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch, type Component, type Ref } from 'vue'
import { NavigationFailureType, isNavigationFailure, useRouter, type RouteLocationRaw } from 'vue-router'
import {
    Bell, BookMarked, BookOpen, Bot, BrainCircuit, CheckSquare, ChevronRight, DatabaseBackup,
    Globe2, Languages, Mail, MessageSquareText, Palette, Search, Settings, Shield, ShieldCheck,
    Smartphone, StickyNote, User, Volume2, Wrench,
} from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { TALOS_MOBILE_SETTINGS_TABS, type TalosMobileSettingsTabId } from '@/components/talos/settings/settingsTabs'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { talosDaIntitolare } from '@/stores/chat'
import { useTalosMessageSearch } from '@/composables/useTalosMessageSearch'
import { normalizeTalosLibrarySearchText, scoreTalosLibrarySearchFields, type TalosLibrarySearchField } from '@/lib/librarySearchText'
import type { TalosLocalMemory, TalosLocalNote, TalosLocalTask, TalosLocalVaultFileSummary } from '@/repositories/chatRepository'

const emit = defineEmits<{ close: [opened?: boolean] }>()
const { t } = useTalosI18n()
const controller = useChatController()
const router = useRouter()
const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const listId = `talos-search-${useId()}`
const activeIndex = ref(0)
const opening = ref(false)
const openFailed = ref(false)
const loading = ref(true)
const loadFailed = ref(false)
const notes = ref<TalosLocalNote[]>([])
const tasks = ref<TalosLocalTask[]>([])
const memories = ref<TalosLocalMemory[]>([])
const files = ref<TalosLocalVaultFileSummary[]>([])
const messages = useTalosMessageSearch(query, (term, options) => controller.searchMessages(term, options),
    () => controller.chat.history.map((session) => `${session.id}:${session.updated_at}`).join('|'))

const settingIcons: Record<TalosMobileSettingsTabId, Component> = {
    models: Bot, ai_defaults: BrainCircuit, search: Search, browser: Globe2, integrations: Wrench,
    email: Mail, reminders: Bell, appearance: Palette, voice: Volume2, language: Languages,
    privacy: ShieldCheck, backup: DatabaseBackup, account: User, agent_tools: Shield, system: Settings,
}
interface SearchEntry {
    id: string
    title: string
    subtitle: string
    icon: Component
    fields: TalosLibrarySearchField[]
    route: RouteLocationRaw
    sessionId?: string
}
const entries = computed<SearchEntry[]>(() => {
    const result: SearchEntry[] = []
    for (const session of controller.chat.history) {
        if (session.metadata?.codice === true || session.persistence_mode === 'temporary') continue
        const title = talosDaIntitolare(session.title) ? t('chat.newChat') : session.title
        result.push({ id: `chat:${session.id}`, title, subtitle: t('globalSearch.conversation'), icon: MessageSquareText,
            fields: (messages.bySession.value.get(session.id) ?? []).map((text) => ({ text })),
            route: { name: 'chat' }, sessionId: session.id })
    }
    for (const note of notes.value) result.push({ id: `note:${note.id}`, title: note.title,
        subtitle: t('navigation.notes'), icon: StickyNote, fields: [{ text: note.content }],
        route: { name: 'note-item', params: { id: note.id } } })
    for (const task of tasks.value) result.push({ id: `task:${task.id}`, title: task.title,
        subtitle: t('navigation.tasks'), icon: CheckSquare, fields: [{ text: task.description }, { text: task.instruction }],
        route: { name: 'task-item', params: { id: task.id } } })
    for (const memory of memories.value) result.push({ id: `memory:${memory.id}`, title: memory.title,
        subtitle: t('navigation.memory'), icon: BookMarked, fields: [{ text: memory.content }],
        route: { name: 'memory-item', params: { id: memory.id } } })
    for (const file of files.value) {
        if (file.status === 'revoked') continue
        result.push({ id: `file:${file.id}`, title: file.display_name, subtitle: t('navigation.library'), icon: BookOpen,
            fields: [], route: { name: 'context' } })
    }
    // Search the same translated categories that Settings actually offers.
    for (const tab of TALOS_MOBILE_SETTINGS_TABS) {
        if (tab.availability !== 'available') continue
        const description = t(`settingsCenter.tabs.${tab.id}.description`)
        result.push({ id: `setting:${tab.id}`, title: t(`settingsCenter.tabs.${tab.id}.label`),
            subtitle: t('globalSearch.settingDescription', { description }), icon: settingIcons[tab.id], fields: [],
            route: tab.id === 'models' ? { name: 'settings-models' } : { name: 'settings', query: { tab: tab.id } } })
    }
    result.push({ id: 'setting:phone', title: t('privilege.pageTitle'),
        subtitle: t('globalSearch.settingDescription', { description: t('settingsCenter.phoneDescription') }),
        icon: Smartphone, fields: [], route: { name: 'settings-privilege' } })
    return result
})
const results = computed(() => {
    const empty = normalizeTalosLibrarySearchText(query.value) === ''
    return entries.value.map((entry, order) => ({ ...entry, order,
        score: scoreTalosLibrarySearchFields(query.value, [
            { text: entry.title, weight: 3 }, { text: entry.subtitle }, ...entry.fields,
        ]),
    })).filter((entry) => empty || entry.score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 16)
})
const pending = computed(() => loading.value || messages.pending.value)
const failed = computed(() => loadFailed.value || messages.failed.value)
const activeId = computed(() => results.value[activeIndex.value] ? `${listId}-${activeIndex.value}` : undefined)
watch(results, () => { activeIndex.value = 0 })
watch(activeId, async (id) => {
    await nextTick()
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
})

async function read<T>(target: Ref<T[]>, list: () => Promise<T[]>): Promise<void> {
    try { target.value = await list() } catch { loadFailed.value = true }
}
onMounted(async () => {
    // The shared sheet first establishes modality, then the combobox takes focus.
    await nextTick()
    input.value?.focus()
    await Promise.all([
        read(notes, () => controller.notes.list()), read(tasks, () => controller.tasks.list()),
        read(memories, () => controller.memories.list()), read(files, () => controller.listSearchFiles()),
    ])
    loading.value = false
})

async function open(entry: SearchEntry | undefined): Promise<void> {
    if (!entry || opening.value) return
    input.value?.focus()
    opening.value = true
    openFailed.value = false
    try {
        if (entry.sessionId) await controller.sessionLifecycle.selectSession(entry.sessionId)
        const failure = await router.push(entry.route)
        if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) throw failure
        emit('close', true)
    } catch {
        openFailed.value = true
    } finally { opening.value = false }
}
function keydown(event: KeyboardEvent): void {
    if (event.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        activeIndex.value = Math.max(0, Math.min(results.value.length - 1, activeIndex.value + direction))
    } else if (event.key === 'Enter') {
        event.preventDefault()
        void open(results.value[activeIndex.value])
    }
    // Escape bubbles to the existing sheet, including its exit spring/back handling.
}
</script>

<template>
    <TalosMobileComposerSheet :title="t('shell.searchTalos')" testid="talos-global-search" @close="emit('close')">
        <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-3 size-5 text-[var(--talos-muted)]" aria-hidden="true" />
            <input
                ref="input" v-model="query" type="text" role="combobox" autocomplete="off" maxlength="256"
                :aria-label="t('shell.searchTalos')" :placeholder="t('globalSearch.placeholder')"
                aria-autocomplete="list" aria-haspopup="listbox" :aria-expanded="results.length > 0"
                :aria-controls="listId" :aria-activedescendant="activeId"
                class="min-h-touch w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] py-3 pl-10 pr-3 text-sm outline-none focus:border-[var(--talos-ring)]"
                @keydown="keydown"
            >
        </div>
        <p v-if="failed" role="alert" class="text-sm text-[var(--talos-muted)]">{{ t('globalSearch.loadFailed') }}</p>
        <p v-if="openFailed" role="alert" class="text-sm text-[var(--talos-muted)]">{{ t('globalSearch.openFailed') }}</p>
        <p role="status" class="sr-only">{{ pending ? t('globalSearch.searching') : t('globalSearch.resultCount', { count: results.length }) }}</p>
        <ul :id="listId" role="listbox" :aria-label="t('globalSearch.results')" :aria-busy="pending" class="talos-action-options">
            <li
                v-for="(entry, index) in results" :id="`${listId}-${index}`" :key="entry.id"
                role="option" :aria-selected="index === activeIndex" :aria-disabled="opening || undefined"
                :data-result-id="entry.id" class="talos-action-row cursor-pointer"
                :class="index === activeIndex ? 'bg-[var(--talos-active)]' : ''"
                @mousedown.prevent @click="open(entry)"
            >
                <span class="talos-action-row-icon"><component :is="entry.icon" class="size-5" aria-hidden="true" /></span>
                <span class="min-w-0 flex-1"><strong class="truncate">{{ entry.title }}</strong><small>{{ entry.subtitle }}</small></span>
                <ChevronRight class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
            </li>
        </ul>
        <div v-if="!results.length && !pending && !failed" class="py-8 text-center">
            <p class="font-medium">{{ t('globalSearch.empty') }}</p>
            <p class="mt-2 text-sm text-[var(--talos-muted)]">{{ t('globalSearch.emptyHint') }}</p>
        </div>
    </TalosMobileComposerSheet>
</template>

<style scoped>
/* Reuse the composer's sheet and spring; only this search surface is centred on tablets. */
@media (max-width: 860px) {
    :global([data-testid="talos-global-search"]) { width: 100%; margin-inline: 0; }
}
@media (min-width: 861px) {
    :global(div:has(> [data-testid="talos-global-search"])) { justify-content: center; padding: 1.5rem; }
    :global([data-testid="talos-global-search"]) {
        width: min(600px, 100%); border: 1px solid var(--talos-border); border-radius: var(--talos-radius-card);
    }
}
</style>
