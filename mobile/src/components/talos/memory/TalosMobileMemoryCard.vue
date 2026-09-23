<script setup lang="ts">
/**
 * Una memoria come SCHEDA, nella forma del mockup «Talos Calm Finale».
 *
 * Mockup: `pMemoryCard` (`src/app.js:183`) e `.p-memory*`
 * (`section-personalities.css:74-82`). Tre fasce, dall'alto:
 *
 *   1. **che cosa è** — l'icona del tipo e il suo nome, più i tre puntini;
 *   2. **cosa dice** — il titolo, e sotto la frase con un FILO a sinistra;
 *   3. **dove vale e in che stato è** — «Globale» e il badge, separati da un filo.
 *
 * ## Il filo a sinistra della frase non è decorazione
 *
 * È una CITAZIONE. Una memoria è una frase che l'utente ha deciso di far
 * rileggere al modello in ogni conversazione futura, e il filo è il modo in cui
 * la tipografia dice da sempre «queste sono parole di qualcuno». Sulle
 * preferenze prende l'accento (mockup, `:79`), perché sono le uniche che
 * parlano di CHI legge invece che di cosa.
 *
 * ## Il bordo tratteggiato di una memoria in pausa
 *
 * Mockup `:81` — `border-style: dashed`. Un secondo segnale accanto al badge, e
 * un segnale di FORMA: si vede anche con la coda dell'occhio, scorrendo, senza
 * leggere nessuna parola.
 *
 * ## Chi apre, chi agisce
 *
 * Il corpo APRE la memoria (owner 2026-08-04: «ogni scheda apre una pagina
 * dedicata, il pulsante indietro va alla precedente, dev'essere lineare»).
 * Accanto c'è UNA sola azione diretta — i tre puntini — e tutto il resto vive
 * nel menu: mai più di due azioni affiancate (owner 10/09/2026).
 */
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Globe } from '@lucide/vue'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileMemoryState from '@/components/talos/memory/TalosMobileMemoryState.vue'
import {
    talosMemoryKindIcon,
    talosMemoryKindLabelKey,
    talosMemoryKindOf,
    talosMemoryPreview,
    talosMemoryScope,
    talosMemoryStateOf,
} from '@/components/talos/memory/memoryShape'
import { talosMemoryRowActions, type TalosMemoryActionId } from '@/components/talos/memory/memoryActions'
/*
 * ⛔ Il menu si apre anche col TASTO DESTRO e con la pressione lunga, e il
 * codice che lo fa vive in `notes/`.
 *
 * Non è una svista: quel file dichiara da sé che il suo posto giusto è dentro
 * `TalosRowActions`, e che sta nelle Note solo perché il giro di lavoro che lo
 * ha scritto poteva toccare solo quelle. Questa è la SECONDA stazione che lo
 * usa — cioè la conferma del debito, non la sua ripetizione: copiarlo qui
 * vorrebbe dire avere due soglie di pressione lunga che prima o poi divergono.
 * 🔜 Risale dentro `TalosRowActions` appena quel componente si tocca.
 */
import { useTalosNoteRowMenu } from '@/components/talos/notes/useTalosNoteRowMenu'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import type { TalosLocalMemory } from '@/repositories/chatRepository'

/**
 * ⛔ La scheda NON porta la data, e la riga sì.
 *
 * È la scelta del mockup, e ha un motivo: il piede della scheda ha due soli
 * posti — «dove vale» e «in che stato è» — e sono i due fatti per cui si guarda
 * una memoria. La data serve a CERCARE, non a leggere, e chi cerca sta nella
 * vista a lista, dove la riga la mostra per esteso accanto al tipo e
 * all'ambito.
 */
const props = defineProps<{
    memory: TalosLocalMemory
}>()

const emit = defineEmits<{ open: []; action: [TalosMemoryActionId] }>()

const { t } = useTalosI18n()
const menu = useTalosNoteRowMenu()

const kind = computed(() => talosMemoryKindOf(props.memory.kind))
const kindIcon = computed(() => talosMemoryKindIcon(props.memory.kind))
const kindLabel = computed(() => t(talosMemoryKindLabelKey(props.memory.kind)))
const stato = computed(() => talosMemoryStateOf(props.memory))
const preview = computed(() => talosMemoryPreview(props.memory.content))

/** «Globale», «Progetto · id», «Questa chat» — dalla stessa tabella della riga. */
const scopeLabel = computed(() => {
    const ambito = talosMemoryScope(props.memory)
    return t(ambito.key, ambito.params)
})

const actions = computed(() => talosMemoryRowActions(props.memory, {
    open: t('memory.open'),
    edit: t('memory.edit'),
    activate: t('memory.activate'),
    pause: t('memory.pause'),
    exportText: t('memory.exportText'),
    remove: t('common.delete'),
    removeNamed: t('memory.deleteNamed', { title: props.memory.title }),
}))

function open(): void {
    // Una pressione lunga ha già aperto il menu: il rilascio non deve anche
    // aprire la memoria, o un gesto solo farebbe due cose.
    if (menu.consumeLongPress()) return
    emit('open')
}

/**
 * U-14 — l'onda che parte dal dito, sul corpo della scheda.
 *
 * Il mockup elenca `.p-card-main` fra i bersagli (`app.js:2210`), ed è
 * coerente: è la superficie che si TOCCA per aprire. Categoria Feedback — se
 * l'utente la spegne, il cerchio non nasce.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <article
        :data-testid="`talos-memory-tile-${props.memory.id}`"
        data-talos-memory-tile
        :data-memory-state="stato"
        :data-memory-kind="props.memory.kind"
        role="listitem"
        class="talos-calm-marker relative flex min-h-[16rem] min-w-0 flex-col rounded-[var(--talos-radius-card)] border bg-[var(--talos-panel)] pt-[var(--talos-space-inline)] text-left [overflow-wrap:anywhere]"
        :class="stato === 'active'
            ? 'border-solid border-[var(--talos-border)]'
            : 'border-dashed border-[var(--talos-border-strong)]'"
        @contextmenu="menu.onContextMenu"
        @pointerdown="menu.onPointerDown"
        @pointerup="menu.onPointerEnd"
        @pointercancel="menu.onPointerEnd"
        @pointerleave="menu.onPointerEnd"
    >
        <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] px-[var(--talos-space-control)]">
            <span class="inline-flex min-w-0 items-center gap-[var(--talos-space-inline)] pl-[6px] text-2xs font-medium text-[var(--talos-muted)]">
                <component :is="kindIcon" class="size-5 shrink-0 text-[var(--talos-text)]" aria-hidden="true" />
                <span class="truncate">{{ kindLabel }}</span>
            </span>
            <span :ref="menu.menuHost" class="flex shrink-0 items-center">
                <TalosRowActions
                    :label="t('memory.actionsFor', { title: props.memory.title })"
                    :items="actions"
                    :test-id="`talos-memory-actions-${props.memory.id}`"
                    @select="(id) => emit('action', id as TalosMemoryActionId)"
                />
            </span>
        </div>

        <button
            type="button"
            data-testid="talos-memory-open"
            class="talos-pressable talos-pressable-row talos-wave-host flex min-w-0 flex-1 flex-col items-stretch gap-[var(--talos-space-section)] rounded-[var(--talos-radius-control)] px-[calc(var(--talos-space-card)*1.5)] py-[var(--talos-space-control)] text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :aria-label="props.memory.title"
            @click="open"
            @pointerdown="onda.onPointerDown"
        >
            <h2 class="line-clamp-3 text-lg font-semibold leading-[1.4] tracking-[-0.02em] text-[var(--talos-text)]">
                {{ props.memory.title }}
            </h2>
            <!-- La frase, citata. Cinque righe al massimo (mockup, `:78`): la
                 scheda ANTICIPA, la pagina CONTIENE. -->
            <p
                data-testid="talos-memory-statement"
                class="line-clamp-5 whitespace-pre-line border-l-2 pl-[var(--talos-space-control)] text-sm leading-[1.7] text-[var(--talos-muted)]"
                :class="kind === 'preference'
                    ? 'border-[var(--talos-accent-border)]'
                    : 'border-[var(--talos-border-strong)]'"
            >{{ preview }}</p>
        </button>

        <!-- Dove vale, e in che stato è. Separati dal resto da un filo, come nel
             mockup (`:82`): sono i due fatti che non cambiano leggendo. -->
        <div class="mt-[var(--talos-space-card)] flex min-h-[3.5rem] items-center justify-between gap-[var(--talos-space-inline)] border-t border-[var(--talos-border)] pl-[calc(var(--talos-space-card)*1.5)] pr-[var(--talos-space-card)] text-2xs text-[var(--talos-muted)]">
            <span class="inline-flex min-w-0 items-center gap-[6px]">
                <Globe class="size-4 shrink-0" aria-hidden="true" />
                <span class="truncate">{{ scopeLabel }}</span>
            </span>
            <TalosMobileMemoryState :state="stato" :test-id="`talos-memory-state-${props.memory.id}`" />
        </div>
    </article>
</template>
