<script setup lang="ts">
/**
 * Una nota, per intero, con il suo indirizzo — nella forma del mockup
 * «Talos Calm Finale».
 *
 * Owner 2026-08-04, con quattro schermate di riferimento: «ogni scheda apre una
 * pagina dedicata, il pulsante indietro va alla precedente, dev'essere
 * lineare». La Ricerca aveva gia' questa catena; le Note no — la scheda non si
 * apriva affatto.
 *
 * E la pagina non e' solo coerenza: la riga dell'elenco mostrava il contenuto
 * INTERO, senza taglio, quindi una nota lunga rendeva la lista impossibile da
 * scorrere. Ora la riga anticipa e la pagina contiene, che e' il lavoro che
 * ognuna delle due sa fare bene.
 *
 * ## Il foglio
 *
 * La nota vive dentro un riquadro con un filo d'accento in testa e margini
 * larghi: non è un pannello di controlli, è qualcosa da leggere, e la larghezza
 * dei margini è ciò che lo dice prima di qualunque etichetta. Sotto il testo, su
 * una riga separata da un filo, il piede dichiara **di chi è il contenuto** e
 * offre la sola azione che lo cambia: «Modifica».
 *
 * ## ⛔ U-12 — qui, e solo qui, si dice da dove viene il testo
 *
 * L'etichetta «non attendibile» stava su ogni riga e su ogni scheda dell'elenco.
 * Adesso è una frase sola, nel piede della nota aperta: «Contenuto fornito
 * dall'utente». **La disciplina non cambia** — `trust_level` resta `untrusted`
 * e il prompt continua a trattare le note come contesto dichiarato che non può
 * impartire istruzioni. La frase lunga che lo spiega è rimasta come descrizione
 * estesa dello stesso piede, per chi vuole sapere cosa vuol dire.
 *
 * ## Perché l'eliminazione vive QUI e si conferma in linea
 *
 * Cancellare dalla lista costringeva a decidere su un testo tagliato, e su una
 * nota lunga voleva dire scegliere senza aver letto. E la conferma sta qui
 * accanto, non in una finestra sopra: la nota resta visibile mentre si decide
 * di cancellarla. (Dall'ELENCO, dove la nota non si vede tutta, la conferma è
 * invece una finestra vera — vedi `NotesScreen.vue`.)
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import { useRoute, useRouter } from 'vue-router'
import { Download, FileText, SquarePen, Trash2 } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { Button } from '@/components/ui/button'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'
import { talosNotify } from '@/stores/notificationCentre'
import TalosMobileNotePin from '@/components/talos/notes/TalosMobileNotePin.vue'
import TalosMobileNoteProse from '@/components/talos/notes/TalosMobileNoteProse.vue'
import TalosMobileNoteChecklist from '@/components/talos/notes/TalosMobileNoteChecklist.vue'
import {
    talosNoteBlocks,
    talosNoteChecklist,
    talosNoteDate,
} from '@/components/talos/notes/noteShape'
import { exportTalosNoteText } from '@/components/talos/notes/noteExport'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const route = useRoute()
const router = useRouter()
const { t, locale } = useTalosI18n()
const controller = useChatController()

const note = ref<TalosLocalNote | null>(null)
const loading = ref(true)
const confirming = ref(false)
const error = ref<string | null>(null)

const id = computed(() => String(route.params.id ?? ''))

const checklist = computed(() => talosNoteChecklist(note.value?.content))
const blocks = computed(() => talosNoteBlocks(note.value?.content))
const done = computed(() => checklist.value.filter((item) => item.done).length)
const modified = computed(() => t('notes.modifiedOn', {
    date: talosNoteDate(note.value?.updated_at, locale.value, true),
}))

async function load(): Promise<void> {
    try {
        const all = await controller.notes.list()
        note.value = all.find((entry) => entry.id === id.value) ?? null
    } finally {
        loading.value = false
    }
}

onMounted(load)

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

/**
 * Dopo aver cancellato si torna all'elenco, non si resta su una pagina vuota.
 *
 * `replace` e non `push`: la nota non c'e' piu', e lasciarla nella cronologia
 * vuol dire che Indietro riporta a una pagina che non puo' esistere.
 */
async function remove(): Promise<void> {
    if (!note.value) return
    await controller.notes.remove(note.value.id)
    await router.replace({ name: 'notes' })
}

async function togglePin(): Promise<void> {
    const current = note.value
    if (!current) return
    try {
        // La riga tornata dal deposito, non una copia modificata a mano: è
        // l'unica che sa se la data di modifica si è mossa (non deve).
        note.value = await controller.notes.update({ id: current.id, pinned: !current.pinned })
    } catch (cause) {
        error.value = describeError(cause)
    }
}

function edit(): void {
    void router.push({ name: 'note-edit', params: { id: id.value } })
}

async function exportText(): Promise<void> {
    const current = note.value
    if (!current) return
    try {
        const outcome = await exportTalosNoteText(current, t('notes.exportText'))
        // Il foglio di Android l'ha già visto: ridirglielo sarebbe rumore. Il
        // ripiego invece va detto, perché è successo qualcosa di diverso da
        // quello che il pulsante prometteva.
        if (outcome !== 'copied') return
        talosNotify({
            key: `note:exported:${current.id}`,
            channel: 'jobs',
            weight: 'notable',
            title: t('notes.exportCopied'),
            body: current.title,
            at: Date.now(),
        })
    } catch {
        error.value = t('notes.exportFailed')
    }
}

/**
 * U-14 — l'onda che parte dal dito.
 *
 * Nel mockup la ricevono TUTTI i bottoni: `Motion.enhance` (`app.js:2228`)
 * marca `button,.row-main,summary` a ogni render. Qui la si mette a mano, sulle
 * azioni di questa pagina, perché l'app non ha ancora un punto unico dove
 * applicarla a tutti — una direttiva globale registrata in `main.ts`, che
 * questo giro di lavoro non poteva toccare. Debito scritto nell'inventario.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <div
        data-testid="talos-note-item"
        class="mx-auto flex w-full max-w-[46rem] flex-col px-[var(--talos-space-page)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-section)]"
    >
        <p v-if="loading" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('common.loading') }}
        </p>

        <!-- La nota puo' essere stata cancellata da un'altra parte, o
             l'indirizzo copiato a mano. Si dice, invece di mostrare una pagina
             vuota che sembra un guasto. -->
        <p
            v-else-if="!note"
            data-testid="talos-note-item-missing"
            class="py-6 text-center text-sm text-[var(--talos-muted)]"
        >
            {{ t('notes.itemMissing') }}
        </p>

        <template v-else>
            <!-- Dove sono e quando l'ho toccata. Il nome della stazione è un
                 bottone vero: è la via di ritorno che si vede, oltre a
                 Indietro. -->
            <div class="mb-[var(--talos-space-section)] flex min-h-touch flex-wrap items-center gap-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">
                <FileText class="size-4 shrink-0" aria-hidden="true" />
                <button
                    type="button"
                    data-testid="talos-note-item-back"
                    class="talos-pressable talos-wave-host min-h-touch max-w-[80%] rounded-[var(--talos-radius-control)] text-left leading-[1.5] text-[var(--talos-text)]"
                    @click="router.push({ name: 'notes' })"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('navigation.notes') }}
                </button>
                <span class="ml-auto text-2xs">{{ modified }}</span>
            </div>

            <article class="relative overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]">
                <!-- Il filo in testa al foglio: lo stesso segno della linguetta
                     sulla scheda, qui alla misura della pagina. -->
                <span
                    aria-hidden="true"
                    class="block h-[3px] w-14 bg-[var(--talos-accent)]"
                    :style="{ marginLeft: 'calc(var(--talos-space-page) * 2)' }"
                />
                <header class="flex items-start justify-between gap-[var(--talos-space-section)] p-[calc(var(--talos-space-page)*2)] pb-[var(--talos-space-page)]">
                    <div class="min-w-0">
                        <span class="mb-[var(--talos-space-card)] block text-xs text-[var(--talos-muted)]">
                            {{ checklist.length > 0 ? t('notes.kindChecklist') : t('notes.kicker') }}
                        </span>
                        <h1 class="text-2xl font-semibold leading-[1.35] tracking-[-0.025em] text-[var(--talos-text)] [overflow-wrap:anywhere]">
                            {{ note.title }}
                        </h1>
                    </div>
                    <TalosMobileNotePin
                        :pinned="note.pinned"
                        :label="t('notes.pinNamed', { title: note.title })"
                        :hint="note.pinned ? t('notes.pinOff') : t('notes.pinOn')"
                        test-id="talos-note-item-pin"
                        @toggle="togglePin"
                    />
                </header>

                <div class="min-h-[16rem] px-[calc(var(--talos-space-page)*2)] pb-[calc(var(--talos-space-page)*2)] pt-[var(--talos-space-section)]">
                    <TalosMobileNoteChecklist
                        v-if="checklist.length > 0"
                        :items="checklist"
                        variant="full"
                        :state-label="t('notes.checkState', { done, total: checklist.length })"
                    />
                    <TalosMobileNoteProse v-else :blocks="blocks" variant="full" />
                </div>

                <!-- Il piede dichiara di chi è il contenuto e offre l'unica
                     azione che lo cambia. La frase corta è quella che si legge;
                     quella lunga spiega cosa vuol dire, a chi la cerca. -->
                <div class="flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)] border-t border-[var(--talos-border)] px-[calc(var(--talos-space-page)*2)] py-[var(--talos-space-control)] text-2xs text-[var(--talos-muted)]">
                    <span data-testid="talos-note-item-origin" :title="t('notes.intro')">
                        {{ t('notes.userProvided') }}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-note-item-edit"
                        class="talos-pressable talos-wave-host min-h-touch rounded-[var(--talos-radius-control)] text-xs"
                        @click="edit"
                        @pointerdown="onda.onPointerDown"
                    >
                        <SquarePen class="size-4" aria-hidden="true" />
                        {{ t('notes.edit') }}
                    </Button>
                </div>
            </article>

            <p v-if="error" role="alert" data-testid="talos-note-item-error" class="mt-[var(--talos-space-card)] text-xs text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- Due azioni, mai di più affiancate: quella che porta la nota
                 fuori e quella che la toglie di mezzo, agli estremi opposti
                 della riga perché non si tocchi l'una per l'altra. -->
            <div v-if="!confirming" class="mt-[var(--talos-space-section)] flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)]">
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-note-item-export"
                    class="talos-pressable talos-wave-host min-h-touch rounded-[var(--talos-radius-control)] text-xs"
                    @click="exportText"
                    @pointerdown="onda.onPointerDown"
                >
                    <Download class="size-4" aria-hidden="true" />
                    {{ t('notes.exportText') }}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    data-testid="talos-note-item-delete"
                    class="talos-pressable talos-wave-host min-h-touch text-xs text-[var(--talos-muted)]"
                    @click="confirming = true"
                    @pointerdown="onda.onPointerDown"
                >
                    <Trash2 class="size-4" aria-hidden="true" />
                    {{ t('common.delete') }}
                </Button>
            </div>
            <!-- Mentre si decide, la riga dice UNA cosa sola: la domanda e le
                 due risposte. Lasciarci anche «Esporta» vorrebbe dire tre
                 bottoni in fila su una domanda che ne ammette due. -->
            <div v-else class="mt-[var(--talos-space-section)] flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)]">
                <p class="min-w-0 text-xs text-[var(--talos-text)]">{{ t('notes.deleteTitle') }}</p>
                <div class="flex items-center gap-[var(--talos-space-inline)]">
                    <Button type="button" variant="ghost" class="min-h-touch text-xs" @click="confirming = false">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid="talos-note-item-delete-confirm"
                        :class="['min-h-touch text-xs', TALOS_DANGER_ACTION_CLASS]"
                        @click="remove"
                    >
                        {{ t('common.delete') }}
                    </Button>
                </div>
            </div>
        </template>
    </div>
</template>
