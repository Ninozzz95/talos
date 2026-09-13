<script setup lang="ts">
/**
 * La puntina: «tieni questa nota in cima».
 *
 * ## Perché un componente per un bottone solo
 *
 * Perché i posti sono tre — la scheda, la riga e la pagina della nota — e la
 * puntina deve dire la stessa cosa allo stesso modo in tutti e tre, anche a chi
 * non la vede. È uno stato acceso/spento, quindi `aria-pressed`: un bottone che
 * cambia colore e tace è un bottone che esiste solo per chi guarda.
 *
 * Il nome accessibile porta il TITOLO della nota, non solo la parola «evidenza»:
 * in un elenco di dodici note, dodici bottoni chiamati «Metti in evidenza» sono
 * dodici fermate identiche per chi naviga a voce o per scorrimento.
 *
 * ⛔ Il colore NON è l'unico segnale. Acceso: l'icona prende l'accento E si
 * accende la pastiglia dietro (`--talos-accent-soft`). È il fondo a farla
 * riconoscere anche a chi non distingue quell'accento dal grigio accanto.
 */
import { Pin } from '@lucide/vue'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'

const props = withDefaults(defineProps<{
    pinned: boolean
    /** Il nome accessibile, col titolo della nota dentro. */
    label: string
    /** Cosa succede se lo tocco: «Metti in evidenza» / «Togli dall'evidenza». */
    hint: string
    testId?: string
    /** `compact` nella riga dell'elenco, dove lo spazio è quello di un rigo. */
    density?: 'comfortable' | 'compact'
}>(), { density: 'comfortable' })

const emit = defineEmits<{ toggle: [] }>()

/**
 * U-14 — la puntina è fra i bersagli dell'onda nel mockup (`.p-pin`,
 * `app.js:2210`). È il comando più piccolo della scheda: senza un riscontro
 * al tocco, premerlo e mancarlo si assomigliano troppo.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <button
        type="button"
        :data-testid="props.testId ?? 'talos-note-pin'"
        :aria-pressed="props.pinned"
        :aria-label="props.label"
        :title="props.hint"
        :class="[
            'talos-pressable talos-wave-host relative grid shrink-0 place-items-center rounded-[var(--talos-radius-control)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]',
            props.density === 'compact' ? 'size-10' : 'min-h-touch min-w-touch',
            props.pinned ? 'text-[var(--talos-accent)]' : 'text-[var(--talos-muted)]',
        ]"
        @click.stop="emit('toggle')"
        @pointerdown="onda.onPointerDown"
    >
        <!-- La pastiglia dietro l'icona, non un bordo: nel mockup è
             `inset: 7px` sul bottone da 48, cioè un quadrato morbido che sta
             dentro l'area di tocco senza allargarla. -->
        <span
            v-if="props.pinned"
            aria-hidden="true"
            class="talos-calm-marker absolute inset-[7px] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent-soft)]"
        />
        <Pin :class="['relative', props.density === 'compact' ? 'size-4' : 'size-5']" aria-hidden="true" />
    </button>
</template>
