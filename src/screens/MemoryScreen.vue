<script setup lang="ts">
/**
 * F4 Memory station — desktop `TalosMemoryManager` parity on the calm mobile
 * shell: create untrusted memories (title/content/kind/scope), list them with
 * status + provenance, disable/enable and delete. Every row is disclosed
 * context only — the banner says so exactly like the desktop.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Search, BookMarked, Plus, RotateCcw, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import type { TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import { useRouter } from 'vue-router'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosLocalMemory } from '@/repositories/chatRepository'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'

const controller = useChatController()
const router = useRouter()

/** Voce → pagina → dettaglio, sempre nello stesso verso. */
function open(item: TalosLocalMemory): void {
    void router.push({ name: 'memory-item', params: { id: item.id } })
}
const { t } = useTalosI18n()

const entries = ref<TalosLocalMemory[]>([])

/**
 * Il campo di ricerca dell'impalcatura che l'owner ha approvato: titolo,
 * ricerca, lista, FAB. Mancava qui, e una lista che cresce senza un modo per
 * restringerla si scorre finche' non ci si arrende.
 *
 * Filtra su cio' che una persona ricorda — le parole che ha scritto lei —
 * non su un identificativo.
 */
const query = ref('')
const shown = computed(() => {
    const termine = query.value.trim().toLowerCase()
    if (termine.length === 0) return entries.value
    return entries.value.filter((memory) => ((memory.title ?? '').toLowerCase().includes(termine)) || ((memory.content ?? '').toLowerCase().includes(termine)))
})
const loading = ref(false)
const error = ref<string | null>(null)
const actionMessage = ref<string | null>(null)

type MemoryKind = 'preference' | 'project_fact' | 'procedure' | 'policy_note'
type MemoryScope = 'global' | 'project' | 'session'
const KINDS = computed(() => [
    { id: 'preference' as const, label: t('memory.preference') },
    { id: 'project_fact' as const, label: t('memory.projectFact') },
    { id: 'procedure' as const, label: t('memory.procedure') },
    { id: 'policy_note' as const, label: t('memory.policyNote') },
])

const SCOPES = computed(() => [
    { id: 'global' as const, label: t('memory.global') },
    { id: 'project' as const, label: t('memory.project') },
    { id: 'session' as const, label: t('memory.thisChat') },
])

const kindItems = computed<TalosThemedSelectItem[]>(() => KINDS.value.map((entry) => ({ value: entry.id, label: entry.label })))
const scopeItems = computed<TalosThemedSelectItem[]>(() => SCOPES.value.map((entry) => ({ value: entry.id, label: entry.label })))

const form = ref({
    title: '',
    content: '',
    kind: 'project_fact' as MemoryKind,
    scope_type: 'global' as MemoryScope,
    scope_id: 'avm',
})

// The shared picker speaks plain strings. Rather than casting one back into the
// union — which would let an unknown value into the form — the choice is looked
// up in the list it came from: if it is not there, nothing changes.
function chooseKind(value: string): void {
    const found = KINDS.value.find((entry) => entry.id === value)
    if (found) form.value.kind = found.id
}
function chooseScope(value: string): void {
    const found = SCOPES.value.find((entry) => entry.id === value)
    if (found) form.value.scope_type = found.id
}
const saving = ref(false)
const formOpen = ref(false)
const deleteTarget = ref<TalosLocalMemory | null>(null)

const canSave = computed(() => form.value.title.trim().length > 0 && form.value.content.trim().length > 0)
const relativeTimeLabels = computed(() => ({
    justNow: t('chat.justNow'),
    minutesAgo: (count: number) => t('chat.minutesAgo', { count }),
    hoursAgo: (count: number) => t('chat.hoursAgo', { count }),
    daysAgo: (count: number) => t('chat.daysAgo', { count }),
}))
function relativeTime(value: string): string {
    return talosRelativeTime(value, new Date(), relativeTimeLabels.value)
}

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
        entries.value = await controller.memories.list()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        loading.value = false
    }
}

onMounted(refresh)

async function submit(): Promise<void> {
    if (!canSave.value || saving.value) return
    saving.value = true
    error.value = null
    try {
        await controller.memories.create({
            title: form.value.title.trim(),
            content: form.value.content.trim(),
            kind: form.value.kind,
            scope_type: form.value.scope_type,
            scope_id: form.value.scope_type === 'project' ? (form.value.scope_id.trim() || null) : null,
        })
        form.value.title = ''
        form.value.content = ''
        formOpen.value = false
        actionMessage.value = t('memory.saved')
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        saving.value = false
    }
}

async function toggleStatus(memory: TalosLocalMemory): Promise<void> {
    error.value = null
    actionMessage.value = null
    try {
        await controller.memories.setStatus(memory.id, memory.status === 'active' ? 'disabled' : 'active')
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target) return
    error.value = null
    try {
        await controller.memories.remove(target.id)
        deleteTarget.value = null
        actionMessage.value = t('memory.deleted')
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

function scopeLabel(memory: TalosLocalMemory): string {
    if (memory.scope_type === 'global') return t('memory.global')
    if (memory.scope_type === 'session') return t('memory.chatScope')
    return memory.scope_id ? t('memory.projectScoped', { id: memory.scope_id }) : t('memory.project')
}
function kindLabel(memory: TalosLocalMemory): string {
    const key: Record<string, string> = {
        preference: 'memory.preference',
        project_fact: 'memory.projectFact',
        procedure: 'memory.procedure',
        policy_note: 'memory.policyNote',
    }
    return t(key[memory.kind] ?? 'memory.projectFact')
}
function statusLabel(memory: TalosLocalMemory): string {
    return t(memory.status === 'active' ? 'memory.statusActive' : 'memory.statusDisabled')
}
</script>

<template>
    <div class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" data-testid="talos-memory-screen">
        <!-- L'impalcatura approvata dall'owner: ricerca, lista, FAB. Mancava
             qui, e una lista che cresce senza un modo per restringerla si
             scorre finche' non ci si arrende.
             Sta FUORI da ogni catena `v-if`: infilarlo in mezzo a un
             `v-if`/`v-else` rompe la coppia, e il campo deve restare visibile
             anche quando la lista e' vuota — e' con la lista vuota che si
             cancella il filtro. -->
        <label class="relative block">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
            <input
                v-model="query"
                type="search"
                inputmode="search"
                data-testid="talos-memory-search"
                :placeholder="t('memory.searchPlaceholder')"
                :aria-label="t('memory.searchPlaceholder')"
                class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
            >
        </label>

        <p class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('memory.explanation') }}
        </p>

        <Button
            type="button"
            data-testid="talos-memory-new"
            class="talos-pressable min-h-touch gap-2 rounded-xl bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
            @click="formOpen = !formOpen"
        >
            <Plus class="size-4" aria-hidden="true" />
            {{ t('memory.newMemory') }}
        </Button>

        <form v-if="formOpen" class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3" @submit.prevent="submit">
            <input
                v-model="form.title"
                data-testid="talos-memory-title"
                maxlength="255"
                :aria-label="t('memory.memoryTitle')"
                :placeholder="t('memory.titlePlaceholder')"
                class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <textarea
                v-model="form.content"
                data-testid="talos-memory-content"
                :aria-label="t('memory.memoryContent')"
                :placeholder="t('memory.content')"
                rows="3"
                class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />
            <div class="flex flex-wrap gap-2">
                <TalosThemedSelect
                    data-testid="talos-memory-kind"
                    class="flex-1"
                    :model-value="form.kind"
                    :items="kindItems"
                    :aria-label="t('memory.kind')"
                    @update:model-value="chooseKind"
                />
                <TalosThemedSelect
                    data-testid="talos-memory-scope"
                    class="flex-1"
                    :model-value="form.scope_type"
                    :items="scopeItems"
                    :aria-label="t('memory.scope')"
                    @update:model-value="chooseScope"
                />
            </div>
            <input
                v-if="form.scope_type === 'project'"
                v-model="form.scope_id"
                :aria-label="t('memory.projectId')"
                :placeholder="t('memory.projectId')"
                class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none"
            >
            <Button
                type="submit"
                data-testid="talos-memory-save"
                :disabled="!canSave || saving"
                class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
            >
                {{ t('memory.save') }}
            </Button>
        </form>

        <p v-if="actionMessage" role="status" class="text-xs text-[var(--talos-success,#3f9d6b)]">{{ actionMessage }}</p>
        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <p v-if="!entries.length && !loading" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('memory.empty') }}
        </p>
<ul v-else class="flex flex-col gap-2">
            <li
                v-for="memory in shown"
                :key="memory.id"
                data-testid="talos-memory-row"
                :data-memory-status="memory.status"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
                :class="memory.status !== 'active' ? 'opacity-60' : ''"
            >
                <div class="flex items-start gap-2">
                    <BookMarked class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <!-- Il blocco di testo APRE la pagina. Non tutta la riga:
                         accanto ci sono gia' dei bottoni, e un bottone dentro
                         un bottone non e' HTML valido — il tocco finirebbe a
                         quello sbagliato. -->
                    <button
                        type="button"
                        data-testid="talos-memory-open"
                        class="talos-pressable min-w-0 flex-1 text-left"
                        @click="open(memory)"
                    >
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-sm font-semibold text-[var(--talos-text)]">{{ memory.title }}</span>
                            <span class="rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ kindLabel(memory) }}</span>
                            <span class="rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ scopeLabel(memory) }}</span>
                            <span
                                v-if="memory.status !== 'active'"
                                class="rounded-full bg-[var(--talos-danger,#dc5b5b)]/15 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-danger,#dc5b5b)]"
                            >{{ statusLabel(memory) }}</span>
                        </div>
                        <p class="mt-1 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ memory.content }}</p>
                        <p v-if="memory.last_used_at" class="mt-1 text-2xs text-[var(--talos-muted)]">
                            {{ t('memory.used', { time: relativeTime(memory.last_used_at) }) }}
                        </p>
                    </button>
                    <button
                        type="button"
                        :aria-label="t(memory.status === 'active' ? 'memory.disableNamed' : 'memory.enableNamed', { title: memory.title })"
                        class="talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
                        @click="toggleStatus(memory)"
                    >
                        <RotateCcw class="size-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        :aria-label="t('memory.deleteNamed', { title: memory.title })"
                        class="talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
                        @click="deleteTarget = memory"
                    >
                        <Trash2 class="size-4" aria-hidden="true" />
                    </button>
                </div>
            </li>
        </ul>

        <!-- R1-1: reka Dialog never renders on the owner's WebView (F5.2
             evidence) — Delete looked like a silent no-op. Device-proven
             surface now. -->
        <TalosMobileConfirmDialog
            v-if="deleteTarget !== null"
            :title="t('memory.deleteTitle')"
            :description="t('memory.deleteDescription', { title: deleteTarget?.title ?? '' })"
            @close="deleteTarget = null"
        >
            <template #footer>
                <Button type="button" variant="ghost" @click="deleteTarget = null">{{ t('common.cancel') }}</Button>
                <Button type="button" variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" @click="confirmDelete">
                    <Trash2 class="size-4" aria-hidden="true" /> {{ t('common.delete') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </div>
</template>
