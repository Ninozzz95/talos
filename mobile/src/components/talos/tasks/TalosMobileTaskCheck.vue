<script setup lang="ts">
/**
 * La casella che COMPLETA un'attività, in un tocco.
 *
 * ## ⛔ Un tocco, due stati, e basta — decisione dell'owner (12/09/2026)
 *
 * Prima questo posto ospitava un ciclo a tre: da fare → in corso → completata
 * → da fare. Un controllo che gira su tre stati non ha un verso: per tornare
 * dov'era si tocca due volte, e chi voleva spuntare una cosa la mette «in
 * corso» senza capire cosa è successo. Adesso la casella fa la domanda che una
 * casella fa da sempre — **è fatta?** — e «in corso» vive dove vivono le altre
 * decisioni, cioè nel menu e nella pagina.
 *
 * ## Perché è un `role="checkbox"` e non un bottone
 *
 * Perché è esattamente una casella: ha due stati, `aria-checked` li dice, e chi
 * naviga a voce o con lo screen reader riceve la stessa cosa che vede chi
 * guarda. Il mockup usa la stessa forma (`pTaskCheck`, `app.js:186`).
 *
 * ## ⛔ Perché NON prende l'onda del tocco
 *
 * Perché il mockup gliela toglie esplicitamente (`ripple`, `app.js:2209`:
 * `el.classList.contains('task-check')` → esce). Il riscontro di questa casella
 * è il rimbalzo e il segno che si traccia; aggiungere anche l'onda vorrebbe dire
 * tre riscontri sovrapposti su un quadrato di ventidue pixel.
 */
import { nextTick, ref } from 'vue'
import { talosAnimaSpunta, TALOS_CHECK_DASH } from '@/components/talos/tasks/useTalosTaskCheckMotion'

const props = defineProps<{
    /** Vero quando l'attività è completata. */
    done: boolean
    /** «Completa: {titolo}» — il verbo da solo non dice su cosa. */
    label: string
    testId?: string
    /** `sm` sulla riga stretta, `md` sulla scheda e nella pagina. */
    size?: 'sm' | 'md'
}>()

const emit = defineEmits<{ (event: 'toggle'): void }>()

const control = ref<HTMLButtonElement | null>(null)
const stroke = ref<SVGPathElement | null>(null)

/**
 * Prima si chiede il cambiamento, poi si anima il risultato.
 *
 * ⛔ L'animazione parte DOPO `nextTick`, non insieme all'emissione: il segno che
 * si disegna deve raccontare lo stato nuovo, e partendo subito racconterebbe
 * quello vecchio — cioè disegnerebbe una spunta mentre la spunta se ne va.
 * `props.done` a quel punto è già quello aggiornato, perché chi ci sta sopra
 * ha ricaricato.
 *
 * Se il salvataggio fallisce, `props.done` NON cambia e l'animazione racconta
 * la verità: la casella rimbalza e resta vuota.
 */
async function alterna(): Promise<void> {
    emit('toggle')
    await nextTick()
    talosAnimaSpunta({
        control: control.value,
        stroke: stroke.value,
        completata: props.done,
    })
}
</script>

<template>
    <button
        ref="control"
        type="button"
        role="checkbox"
        :aria-checked="props.done"
        :aria-label="props.label"
        :data-testid="props.testId ?? 'talos-task-check'"
        class="grid min-h-touch min-w-touch shrink-0 place-items-center rounded-[var(--talos-radius-control)]"
        @click.stop="alterna"
    >
        <!-- Il riquadro: pieno d'accento quando è fatta, contornato quando no.
             La transizione passa da `.talos-calm-marker`, cioè dal token del
             motore: un segno che cambia forma è movimento come gli altri, e un
             `duration-150` scritto addosso sarebbe un numero che nessuna
             preferenza può toccare (è il difetto già corretto sulla linguetta
             delle note, N8). -->
        <span
            aria-hidden="true"
            class="talos-calm-marker grid place-items-center rounded-[calc(var(--talos-radius-control)/2)] border-[1.5px]"
            :class="[
                props.size === 'sm' ? 'size-5' : 'size-[22px]',
                props.done
                    ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)]'
                    : 'border-[var(--talos-border-strong)]',
            ]"
        >
            <svg
                :class="props.size === 'sm' ? 'size-4' : 'size-[18px]'"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
            >
                <!-- `stroke-dasharray` e `stroke-dashoffset` stanno QUI e non
                     in un foglio di stile: sono la geometria del segno, e
                     `talosAnimaSpunta` anima proprio quell'offset da 22 a 0.
                     A riposo il tratto è tutto fuori (non spuntata) o tutto
                     dentro (spuntata), e l'animazione fa solo il viaggio. -->
                <path
                    ref="stroke"
                    d="m4 10 4 4 8-9"
                    stroke="var(--talos-accent-text)"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    :stroke-dasharray="TALOS_CHECK_DASH"
                    :stroke-dashoffset="props.done ? 0 : TALOS_CHECK_DASH"
                />
            </svg>
        </span>
    </button>
</template>
