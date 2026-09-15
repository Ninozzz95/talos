<script setup lang="ts">
/**
 * I punti di un'attività, e qui si SPUNTANO.
 *
 * ## ⛔ La differenza con le note, scritta per intero
 *
 * `TalosMobileNoteChecklist.vue` dice, in testa al file, perché le sue caselle
 * non sono premibili: spuntarle vorrebbe dire riscrivere il contenuto della
 * nota a ogni tocco, ed era una funzione a sé con le sue domande. Per le
 * attività l'owner ha deciso il contrario (12/09/2026): **qui sono azioni**, e
 * la ragione è nella cosa stessa — un appunto si rilegge, un'attività si porta
 * a termine, e portarla a termine un punto alla volta è letteralmente cosa fa
 * chi ce l'ha davanti.
 *
 * ⇒ Le caselle sono `role="checkbox"` vere. La riscrittura della riga vive in
 * `taskShape.ts` (`talosTaskToggleCheck`), dove si prova come un calcolo; qui
 * c'è il disegno e il tocco.
 *
 * ## Perché anche il testo NON spuntabile passa da qui
 *
 * Perché una descrizione è quasi sempre una frase seguita da un elenco — «apri
 * le sei slide e controlla i contenuti», poi i tre punti — e mostrare solo le
 * caselle butterebbe via la frase che dice di cosa si tratta. È il mockup
 * (`pChecklistFull`, `app.js:217`): le righe che non sono caselle restano
 * paragrafi, e le righe vuote spariscono invece di lasciare buchi.
 */
import { computed, ref } from 'vue'
import { talosAnimaSpunta, TALOS_CHECK_DASH } from '@/components/talos/tasks/useTalosTaskCheckMotion'

const props = defineProps<{
    /** La descrizione intera, righe comprese. */
    description: string
    /** «N di M punti spuntati», già composta da chi ha l'i18n. */
    stateLabel: string
    /** Falso mentre una scrittura è in volo: due tocchi in fila si perdono. */
    busy?: boolean
}>()

const emit = defineEmits<{ (event: 'toggle', index: number): void }>()

const CASELLA = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/

/**
 * Le righe, come si disegnano: o una casella, o un paragrafo, o niente.
 *
 * L'indice è quello della RIGA nel testo, non della casella: è quello che serve
 * per riscriverla, e contare le caselle produrrebbe un indice che sbaglia
 * appena qualcuno scrive una frase in mezzo all'elenco.
 */
interface TalosTaskDetailLine {
    kind: 'check' | 'text'
    index: number
    done: boolean
    text: string
}

const righe = computed<TalosTaskDetailLine[]>(() => (
    props.description.split('\n').flatMap((riga, index): TalosTaskDetailLine[] => {
        const m = CASELLA.exec(riga)
        if (m) return [{ kind: 'check', index, done: m[1] !== ' ', text: m[2]! }]
        const testo = riga.replace(/^#{1,3}\s+/, '').trim()
        return testo ? [{ kind: 'text', index, done: false, text: testo }] : []
    })
))

/** I nodi del segno, per indice di riga: l'animazione ne tocca uno solo. */
const strokes = ref<Record<number, SVGPathElement | null>>({})
const controls = ref<Record<number, HTMLButtonElement | null>>({})

function registra(index: number, el: unknown, dove: 'control' | 'stroke'): void {
    if (dove === 'control') controls.value[index] = (el as HTMLButtonElement | null) ?? null
    else strokes.value[index] = (el as SVGPathElement | null) ?? null
}

/**
 * Il tocco: si chiede il cambiamento, e si anima ciò che si vedrà.
 *
 * ⛔ L'animazione guarda lo stato NUOVO (`!done`), non quello vecchio: il segno
 * si disegna solo quando il punto viene spuntato. Toccando una casella già
 * fatta il segno se ne va, e ridisegnarlo mentre sparisce sarebbe un riscontro
 * che contraddice il risultato.
 *
 * Parte subito e non dopo la risposta del deposito perché è un riscontro al
 * dito, non una conferma di scrittura: se il salvataggio fallisce, la riga
 * torna com'era e l'errore lo dice la pagina.
 */
function alterna(index: number, done: boolean): void {
    if (props.busy) return
    emit('toggle', index)
    talosAnimaSpunta({
        control: controls.value[index] ?? null,
        stroke: strokes.value[index] ?? null,
        completata: !done,
    })
}
</script>

<template>
    <div
        data-testid="talos-task-checklist"
        :aria-label="props.stateLabel"
        class="flex min-w-0 flex-col"
    >
        <template v-for="riga in righe" :key="riga.index">
            <p
                v-if="riga.kind === 'text'"
                data-testid="talos-task-detail-text"
                class="py-[var(--talos-space-inline)] text-sm leading-[1.8] text-[var(--talos-text)]"
            >{{ riga.text }}</p>

            <!-- Una casella vera: larga tutta la riga, alta quanto un bersaglio
                 da dito, e con l'onda del tocco — nel mockup `.p-check-item` è
                 esplicitamente nell'elenco di chi la riceve (`app.js:2210`).
                 L'onda però la mette chi ci sta sopra, che ha il gestore
                 condiviso della pagina: qui basta essere un ospite valido. -->
            <button
                v-else
                :ref="(el) => registra(riga.index, el, 'control')"
                type="button"
                role="checkbox"
                :aria-checked="riga.done"
                :disabled="props.busy"
                data-testid="talos-task-check-item"
                :data-index="riga.index"
                :data-checked="riga.done"
                class="talos-pressable-row flex min-h-touch w-full items-center gap-[var(--talos-space-control)] rounded-[var(--talos-radius-control)] p-[var(--talos-space-inline)] text-left text-sm leading-[1.7] disabled:opacity-60"
                @click="alterna(riga.index, riga.done)"
            >
                <span
                    aria-hidden="true"
                    class="talos-calm-marker grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px]"
                    :class="riga.done
                        ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)]'
                        : 'border-[var(--talos-border-strong)]'"
                >
                    <svg class="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path
                            :ref="(el) => registra(riga.index, el, 'stroke')"
                            d="m4 10 4 4 8-9"
                            stroke="var(--talos-accent-text)"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            :stroke-dasharray="TALOS_CHECK_DASH"
                            :stroke-dashoffset="riga.done ? 0 : TALOS_CHECK_DASH"
                        />
                    </svg>
                </span>
                <!-- Barrato E smorzato: due segnali, perché il barrato da solo
                     su un punto corto si legge male e il colore da solo non
                     basta a chi non lo distingue. -->
                <span
                    :class="riga.done
                        ? 'line-through decoration-[var(--talos-border-strong)] text-[var(--talos-muted)]'
                        : 'text-[var(--talos-text)]'"
                >{{ riga.text }}</span>
            </button>
        </template>
    </div>
</template>
