<script setup lang="ts">
/**
 * F5 station — desktop `TalosNotes` parity, local-first: notes are UNTRUSTED
 * disclosed context (same trust discipline as memories); the banner says so.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { ChevronRight, Search, StickyNote, Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useRouter } from 'vue-router'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const controller = useChatController()
const { t } = useTalosI18n()

const entries = ref<TalosLocalNote[]>([])
const router = useRouter()

/** Voce → pagina → dettaglio, sempre nello stesso verso. */
function open(note: TalosLocalNote): void {
    void router.push({ name: 'note-item', params: { id: note.id } })
}

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
    return entries.value.filter((note) => ((note.title ?? '').toLowerCase().includes(termine)) || ((note.content ?? '').toLowerCase().includes(termine)))
})
const error = ref<string | null>(null)
const title = ref('')
const content = ref('')
const saving = ref(false)

const canCreate = computed(() =>
    title.value.trim().length > 0 && content.value.trim().length > 0 && !saving.value)
const relativeTimeLabels = computed(() => ({
    justNow: t('chat.justNow'),
    minutesAgo: (count: number) => t('chat.minutesAgo', { count }),
    hoursAgo: (count: number) => t('chat.hoursAgo', { count }),
    daysAgo: (count: number) => t('chat.daysAgo', { count }),
}))
function updatedAt(value: string): string {
    return talosRelativeTime(value, new Date(), relativeTimeLabels.value)
}

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    try {
        entries.value = await controller.notes.list()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

onMounted(refresh)

async function submit(): Promise<void> {
    if (!canCreate.value) return
    saving.value = true
    error.value = null
    try {
        await controller.notes.create({ title: title.value.trim(), content: content.value.trim() })
        title.value = ''
        content.value = ''
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        saving.value = false
    }
}

</script>

<template>
    <div class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" data-testid="talos-notes-screen">
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
                data-testid="talos-notes-search"
                :placeholder="t('notes.searchPlaceholder')"
                :aria-label="t('notes.searchPlaceholder')"
                class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
            >
        </label>

        <p class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('notes.intro') }}
        </p>

        <form class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3" @submit.prevent="submit">
            <input
                v-model="title"
                data-testid="talos-note-title"
                maxlength="255"
                :aria-label="t('notes.title')"
                :placeholder="t('notes.title')"
                class="min-h-11 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <textarea
                v-model="content"
                data-testid="talos-note-content"
                :aria-label="t('notes.content')"
                :placeholder="t('notes.content')"
                rows="3"
                class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />
            <Button
                type="submit"
                data-testid="talos-note-save"
                :disabled="!canCreate"
                class="talos-pressable min-h-11 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
            >
                <Plus class="size-4" aria-hidden="true" />
                {{ t('notes.add') }}
            </Button>
        </form>

        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <p v-if="!entries.length" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('notes.empty') }}
        </p>
<ul v-else class="flex flex-col gap-2">
            <li
                v-for="note in shown"
                :key="note.id"
                data-testid="talos-note-row"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <!-- La riga APRE la nota. Owner 2026-08-04: «ogni scheda apre
                     una pagina dedicata». Prima non si apriva affatto: aveva
                     solo il cestino, e il contenuto intero riversato dentro. -->
                <button
                    type="button"
                    data-testid="talos-note-open"
                    class="talos-pressable flex w-full items-start gap-2 text-left"
                    @click="open(note)"
                >
                    <StickyNote class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-sm font-semibold text-[var(--talos-text)]">{{ note.title }}</span>
                            <span class="rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('notes.untrusted') }}</span>
                        </div>
                        <!-- Due righe, non tutta la nota: la riga ANTICIPA, la
                             pagina CONTIENE. Prima una nota lunga occupava lo
                             schermo intero e scorrere l'elenco era impossibile. -->
                        <p class="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-[var(--talos-muted)]">{{ note.content }}</p>
                        <p class="mt-1 text-2xs text-[var(--talos-muted)]">{{ updatedAt(note.updated_at) }}</p>
                    </div>
                    <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                </button>
            </li>
        </ul>
    </div>
</template>
