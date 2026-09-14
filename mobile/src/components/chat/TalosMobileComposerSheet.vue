<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { talosPrefersReducedMotion, talosScalarSpring, type TalosSpringHandle } from '@/composables/useTalosDrawerSpring'
import { talosDurataMs } from '@/composables/useTalosCalmMotion'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'

/**
 * F4-#26 — shared bottom-sheet shell for the composer drawers (Add to chat /
 * Model & reasoning / Improve prompt). Teleported to body: the composer
 * card's backdrop-blur creates a containing block that would trap a fixed
 * overlay inside the card. Modal semantics: initial focus, Escape, backdrop
 * tap to close.
 */
defineProps<{
    title: string
    testid: string
}>()

const emit = defineEmits<{ close: [] }>()

const closing = ref(false)
/** Il velo dietro al foglio: dissolve in ingresso (spec `veil`), sparisce con la chiusura. */
const entered = ref(false)
/**
 * U-14 (12/09, owner: «il mockup aveva lo slide nel drawer +»): il foglio SALE
 * con la molla del mockup — `settle(d, min(altezza, 550), 0, translateY, 440)`
 * (Talos_Calm_Finale_Interattivo.html r. 3583) — e non con una transizione di
 * 6 px. La durata segue il motore: il token `--talos-motion-calm-sheet` (440 di
 * serie) diventa il fattore di tempo della molla, come U-15 per la sidebar.
 *
 * ⛔ Mentre la molla dipinge, sulla sezione NON c'è `transition-transform`:
 * una transizione CSS sullo stesso `transform` interpolerebbe ogni fotogramma
 * scritto dalla molla e la farebbe arrancare (ricerca 12/09: hackernoon
 * «requestAnimationFrame, linear interpolation and CSS transitions»;
 * ktsn/css-spring-animation). La transizione torna solo per l'uscita.
 */
const SALITA_MASSIMA_PX = 550
const SALITA_SERIE_MS = 440
let molla: TalosSpringHandle | null = null
const root = ref<HTMLElement | null>(null)

// SF-7 / SF5-4: shared real modality — inert app root (ref-counted), Tab
// trap, opener focus restore.
const { trapTab } = useTalosModalSurface(root)

// Owner 2026-07-24: (1) close ANIMATES out — reuse the enter transform, then
// emit close so the parent unmounts; (2) the system Back gesture closes THIS
// drawer instead of exiting the app (overlay-back registry). Reduced-motion
// zeroes the delay honestly. `closing` drives a FULL slide-out (not the tiny
// 24px enter offset, which looked like it stalled then vanished).
function requestClose(): void {
    if (closing.value) return
    molla?.cancel()
    molla = null
    const d = root.value
    if (d) d.style.transform = ''
    closing.value = true
    entered.value = false
    const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => emit('close'), reduce ? 0 : USCITA_MS)
}
useTalosOverlayBack(requestClose)

/** Il mockup esce in 210 ms (`sheet-exit`), non nei 300 di prima. */
const USCITA_MS = 210

onMounted(() => {
    requestAnimationFrame(() => { entered.value = true })
    const d = root.value
    if (!d) return
    const da = Math.min(d.offsetHeight || SALITA_MASSIMA_PX, SALITA_MASSIMA_PX)
    const durata = talosDurataMs(d, '--talos-motion-calm-sheet', SALITA_SERIE_MS)
    molla = talosScalarSpring(
        da,
        0,
        (y) => { d.style.transform = y === 0 ? '' : `translateY(${y}px)` },
        () => { molla = null; d.style.transform = '' },
        { reduced: talosPrefersReducedMotion(), timeScale: Math.max(0.25, durata / SALITA_SERIE_MS) },
    )
})
/**
 * ⛔ Owner 2026-09-13, dal Pad: «i drawer, TUTTI i drawer, devono reagire al
 * tocco. Se io trascino il drawer, anche il drawer si deve trascinare».
 *
 * Prima di oggi nei fogli non c'era UN SOLO gestore di puntatore: le frecce da
 * tastiera sì (tablist secondo l'APG), il dito no. Il foglio si apriva e si
 * chiudeva a scatto e basta.
 *
 * Sta QUI e non negli otto fogli che lo importano: una presa sola, un
 * comportamento solo. E si aggancia all'INTESTAZIONE, non a tutta la
 * superficie, perché il contenuto scorre: prendere il gesto ovunque
 * significherebbe chiudere il foglio mentre la persona legge.
 *
 * Al rilascio decide la distanza, non la velocità del dito: oltre la soglia
 * chiude con l'uscita che c'era già, sotto torna al suo posto con la STESSA
 * molla dell'entrata, così il movimento è uno e non due.
 */
const CHIUSURA_SOGLIA_PX = 96
const trascinamento = ref(0)
let presa: { y: number; id: number } | null = null

function iniziaTrascinamento(e: PointerEvent): void {
    if (closing.value || e.button !== 0) return
    const corpo = (e.target as HTMLElement | null)?.closest?.('[data-talos-sheet-body]') as HTMLElement | null
    if (corpo && corpo.scrollTop > 0) return
    molla?.cancel()
    molla = null
    presa = { y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
}

function muoviTrascinamento(e: PointerEvent): void {
    if (!presa || e.pointerId !== presa.id) return
    // Solo verso il basso: tirare verso l'alto un foglio già in alto non vuol dire niente.
    trascinamento.value = Math.max(0, e.clientY - presa.y)
    const d = root.value
    if (d) d.style.transform = trascinamento.value === 0 ? '' : `translateY(${trascinamento.value}px)`
}

function finisciTrascinamento(e: PointerEvent): void {
    if (!presa || e.pointerId !== presa.id) return
    const percorso = trascinamento.value
    presa = null
    trascinamento.value = 0
    const d = root.value
    if (percorso >= CHIUSURA_SOGLIA_PX) { requestClose(); return }
    if (!d) return
    const durata = talosDurataMs(d, '--talos-motion-calm-sheet', SALITA_SERIE_MS)
    molla = talosScalarSpring(
        percorso,
        0,
        (y) => { d.style.transform = y === 0 ? '' : `translateY(${y}px)` },
        () => { molla = null; d.style.transform = '' },
        { reduced: talosPrefersReducedMotion(), timeScale: Math.max(0.25, durata / SALITA_SERIE_MS) },
    )
}

onBeforeUnmount(() => { molla?.cancel(); molla = null })
</script>

<template>
    <Teleport to="body">
    <div class="pointer-events-auto fixed inset-0 z-[75] flex flex-col justify-end">
        <div
            class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-250"
            :class="entered && !closing ? 'opacity-100' : 'opacity-0'"
            aria-hidden="true"
            @click="requestClose"
        />
        <section
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            :data-testid="testid"
            class="relative z-10 flex max-h-[85dvh] touch-none flex-col overflow-hidden rounded-t-2xl border-t border-[var(--talos-border)] bg-[var(--talos-window-bg)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-[var(--talos-text)] outline-none md:mx-auto md:w-[clamp(480px,50vw,600px)] md:border-x"
            :class="closing ? 'translate-y-full transition-transform duration-[210ms] ease-in-out' : ''"
            @keydown.escape="requestClose"
            @keydown="trapTab"
            @pointerdown="iniziaTrascinamento"
            @pointermove="muoviTrascinamento"
            @pointerup="finisciTrascinamento"
            @pointercancel="finisciTrascinamento"
        >
            <header
                class="flex shrink-0 cursor-grab select-none items-center gap-2 px-3 py-2 active:cursor-grabbing"
                data-testid="talos-sheet-grab"
            >
                <span
                    class="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--talos-border-strong)]"
                    aria-hidden="true"
                />
                <button
                    type="button"
                    :aria-label="$t('common.close')"
                    class="talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="requestClose"
                >
                    <X class="size-5" aria-hidden="true" />
                </button>
                <h2 class="flex-1 text-center text-base font-semibold">{{ title }}</h2>
                <span class="min-w-touch" aria-hidden="true" />
            </header>

            <!-- ⛔ `pb-3`: il mockup «Talos Calm Finale» dà il respiro DENTRO la parte che scorre
                 (`.sheet-body{overflow:auto;padding:12px}`). Senza, misurato sul Pad il 14/09, l'ultima
                 voce finiva a filo dell'area della barra dei gesti (16 px) senza un pixel di aria. -->
            <div data-talos-sheet-body class="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto px-4 pb-3 pt-1">
                <slot />
            </div>
        </section>
    </div>
    </Teleport>
</template>
