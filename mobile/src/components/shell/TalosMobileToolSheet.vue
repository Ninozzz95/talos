<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, type Component } from 'vue'
import { TALOS_SHEET_TITLE_KEY, type TalosSheetTitleRegistry } from '@/lib/sheetTitle'
import { ArrowLeft, Menu, X } from '@lucide/vue'
import { TALOS_SHEET_CONTEXT_KEY } from '@/lib/sheetContext'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
import { useTalosI18n } from '@/i18n'

/*
 * ⛔ Campanella e centro download NON stanno piu' nel foglio: owner 2026-09-14, «solo dalla
 * chat». E' una scelta esplicita, non una funzione nascosta per svista — la chat e la
 * sidebar le hanno (vedi downloadCenterReachability.test.ts).
 */

// Station sheet presented over the persistent chat base — mirror of the desktop
// TalosMobileToolSheet (window/TalosMobileToolSheet.vue): Back-to-chat header,
// title/description, close, scrollable body honoring the safe-area insets.
// F3-T2 (owner #4/#8/#3): honours the `mobile_window_presentation` preference —
// fullscreen (default) covers the viewport; drawer keeps ONE fixed tall height
// so every station matches. Motion timing comes from the canonical TALOS
// interaction contract; a 0ms resolved token settles the final state directly.
const props = withDefaults(defineProps<{
    title: string
    description?: string
    presentation?: 'fullscreen' | 'drawer'
    /**
     * Come si risale di UN passo, quando questa pagina ne ha uno sopra.
     *
     * Lo sa solo chi conosce le rotte, cioe' App: qui arriva come una funzione
     * gia' pronta, e la sua presenza e' anche la risposta alla domanda «sono
     * dentro qualcosa?».
     */
    parentBack?: (() => void) | null
    /**
     * La decisione UNICA del guscio, la stessa che esegue il gesto di sistema.
     *
     * Quando c'è, vince su tutto il resto: è il punto in cui il tasto e il gesto
     * smettono di essere due strade.
     */
    shellBack?: ((canGoBack: boolean) => 'handled' | 'history' | 'exit') | null
    /**
     * ⛔ Campanella e centro download, come nell'intestazione della chat.
     *
     * FOTOGRAFATO sul Pad il 2026-08-20: due campanelle sullo stesso schermo,
     * con lo stesso pallino «1» — una nel pannello del tablet e una qui. Il
     * pannello ce l'ha sempre, quindi sul tablet questa e' la seconda.
     *
     * ⛔ E vale SOLO per queste due: il foglio non ha le opzioni della chat, e
     * non deve prenderle. Sono tre gruppi, non uno — contarli male si e' visto
     * a schermo due volte nello stesso giorno.
     */
    hideAppActions?: boolean
    /**
     * U-7 (owner 11/09/2026) — la topbar del mockup «Talos Calm Finale»
     * (`renderTopbar`, `src/app.js:945`): sulla RADICE di una stazione niente
     * freccia — icona + titolo, con ☰ sul telefono e niente sul tablet, dove
     * la sidebar e' fissa (U-5). La freccia resta solo dentro (pagina figlia
     * o sotto-vista). Alla chat si torna dalla sidebar o col Back di sistema.
     */
    icon?: Component | null
    hideMenu?: boolean
    /**
     * Sul tablet dentro Impostazioni la sidebar fissa non c'e' (le categorie
     * prendono il suo posto) e il ☰ nemmeno: senza questo la radice non
     * avrebbe NESSUNA via visibile per tornare alla chat. Qui la freccia
     * «Torna alla chat» resta.
     */
    rootBack?: boolean
    /** Il nome del posto dove si torna, per dirlo invece di farlo indovinare. */
    parentTitle?: string
    /** The embedded station owns its internal scrollports; the shell must not
     * create a second, competing vertical scroller around it. */
    lockBodyScroll?: boolean
    /** Hide the redundant station-sheet chrome when the embedded surface
     * already owns the visible session header. The dialog keeps its name. */
    hideChrome?: boolean
    /** Let the one app-level procedural scene remain visible through a station
     * whose own panels already provide the necessary readable glass surfaces. */
    sceneBackground?: boolean
}>(), {
    presentation: 'fullscreen',
    parentBack: null,
})
const emit = defineEmits<{ close: [], openMenu: [] }>()

const { subView } = useTalosSheetNav()
const { t } = useTalosI18n()

/**
 * Un passo indietro, e sempre il piu' vicino.
 *
 * L'ordine non e' arbitrario: si esce prima dalla cosa piu' interna. Saltare
 * al livello sbagliato e' esattamente il difetto che l'owner ha visto —
 * chiudere tutto da una pagina di dettaglio butta via due passi invece di uno.
 */
function goBack(): void {
    /*
     * ⛔ Il tasto passa dalla STESSA decisione del gesto di sistema.
     *
     * Owner 2026-08-06: «il pulsante indietro in alto a sinistra non si comporta
     * come la gesture indietro». La decisione era già una funzione pura e
     * provata, ma la usava solo il gesto: questo tasto ne aveva una sua, che
     * conosceva la sotto-vista e il genitore e ignorava l'overlay del
     * compositore, l'intro e la sidebar.
     *
     * La linea guida Android dice la stessa cosa: gesto e tasto devono
     * percorrere lo stesso codice, o l'anteprima del gesto predittivo mostra
     * una destinazione e il tasto ne raggiunge un'altra.
     *
     * Il ripiego locale resta per il caso in cui la guscio non abbia passato
     * l'handler — una schermata montata da sola nei test, per esempio: meglio un
     * passo indietro imperfetto che un tasto morto.
     */
    if (props.shellBack) {
        // L'esito lo gestisce QUI e non nel guscio: `history.back()` non serve
        // all'avvio dell'app, e questo componente è un pezzo caricato a
        // richiesta — misurato, il tetto d'avvio è già oltre il limite di 73
        // byte quando la stessa riga sta in `App.vue`.
        if (props.shellBack(window.history.length > 1) === 'history') window.history.back()
        return
    }
    if (subView.value) { subView.value.back(); return }
    if (props.parentBack) { props.parentBack(); return }
    emit('close')
}

const backLabel = computed(() => {
    if (subView.value) return t('common.back')
    if (props.parentBack) {
        return props.parentTitle
            ? t('navigation.backToNamed', { name: props.parentTitle })
            : t('common.back')
    }
    return t('navigation.backToChat')
})

const entered = ref(false)
const root = ref<HTMLElement | null>(null)

/**
 * U-14 — LA STAZIONE SALE DA SOTTO, come il foglio del mockup.
 *
 * Misurato sul mockup l'11/09/2026 aprendo il pannello «+» e il menu di una
 * riga (`app.js:2071`, `Motion.upgradeDialog`):
 *
 *     DIALOG.overlay motion-sheet | dur=440 ease=linear fr=33
 *       {"transform":"translateY(550px)"} -> {"transform":"translateY(0px)"}
 *
 * Cioe' il foglio arriva da `min(la sua altezza, 550px)`, con una molla in 33
 * fotogrammi. Fino a oggi la stazione saliva di `translate-y-6` — **24 px** —
 * e a schermo quella non e' una superficie che arriva: e' una superficie gia'
 * li' che si aggiusta. La distanza e' l'intera informazione del movimento.
 *
 * Il valore sta in `--talos-motion-sheet-rise` (blocco U-14 di `style.css`),
 * `min(88dvh, 550px)`: 88dvh e' l'altezza vera di questa stazione, 550px e' il
 * tetto del mockup.
 *
 * ⛔ Solo nella forma a cassetto. A schermo intero la superficie COPRE la
 * finestra: farla scendere di mezzo schermo scoprirebbe la chat dietro per
 * mezzo secondo, che e' il contrario di cio' che una stazione a schermo intero
 * promette. La' resta il gesto corto.
 */
const sheetTransform = computed(() => {
    if (entered.value) return 'translateY(0)'
    return props.presentation === 'fullscreen'
        ? 'translateY(1.5rem)'
        : 'translateY(var(--talos-motion-sheet-rise, 1.5rem))'
})

onMounted(() => {
    requestAnimationFrame(() => { entered.value = true })
    // SF-critic F3 #3: modal semantics need at least initial focus + Escape.
    root.value?.focus()
})

// F3-T3 chrome dedup: the sheet titles the surface — screens inside drop
// their own duplicate header via this context.
provide(TALOS_SHEET_CONTEXT_KEY, true)

/*
 * La barra che si ripiega — owner 2026-09-13/14: a riposo nessuna barra, il titolo grande sta
 * nella pagina; scorrendo, il titolo si rimpicciolisce e sfuma mentre compare una barra col
 * fondo pieno e un filo sotto (Material 3, «Top app bar»: la Large si ripiega e il
 * contenitore si riempie). Il movimento SEGUE IL DITO: `animation-timeline` legato allo
 * scorrimento del corpo (Chrome 115+, `timeline-scope` 116+; WebView del Pad 154 —
 * developer.chrome.com/docs/css-ui/scroll-driven-animations, letto il 2026-09-14). Dove non
 * c'e', un ripiego in JS la fa comparire oltre 48 px.
 */
const pageTitles = ref<Array<{ id: symbol, title: string }>>([])
const titleRegistry: TalosSheetTitleRegistry = {
    set(id, title) {
        const index = pageTitles.value.findIndex((entry) => entry.id === id)
        if (index >= 0) pageTitles.value.splice(index, 1, { id, title })
        else pageTitles.value.push({ id, title })
    },
    clear(id) {
        pageTitles.value = pageTitles.value.filter((entry) => entry.id !== id)
    },
}
provide(TALOS_SHEET_TITLE_KEY, titleRegistry)
/** Il titolo della pagina aperta (sottopagina compresa), poi la sottovista, poi la stazione. */
const barTitle = computed(() => pageTitles.value.at(-1)?.title ?? (subView.value ? subView.value.title : props.title))
/** C'e' almeno un tondo in alto? Solo allora il contenuto scende sotto la loro riga. */
const hasControls = computed(() => Boolean(subView.value || props.parentBack || props.rootBack) || !props.hideMenu || props.presentation === 'drawer')
const scrollLinked = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: scroll()')
const scrolled = ref(false)
/*
 * ⛔ CHI SCORRE DAVVERO — misurato sul Pad il 14/09. Nella Libreria il corpo del foglio non
 * si muove: scorre `mobile-screen-body` di TalosMobileScreen, un livello piu' dentro (13.754 px
 * di contenuto su 1.276). In una nota invece scorre il corpo del foglio. Legare la linea di
 * scorrimento al corpo lasciava la barra ferma per sempre.
 *
 * ⇒ Lo scorrimento non risale, ma si CATTURA sul foglio: il primo elemento che scorre in
 * verticale diventa lo scorritore (`data-talos-sheet-scroller`) e la linea del CSS si lega a
 * lui. Prima di ogni scorrimento nessuno e' marcato, la linea e' inattiva e la pagina resta nel
 * suo stato di riposo — che e' esattamente quello giusto (barra nascosta, titolo pieno). Le
 * righe orizzontali (le schede) non contano: non hanno contenuto piu' alto del riquadro.
 */
let scroller: HTMLElement | null = null
/*
 * ⛔ QUANDO NON SI SCORRE PIÙ — misurato sul Pad il 14/09 (fase 4B). Nella Libreria, entrando
 * in selezione, la griglia passa da 80 schede a 1: lo scorritore scende a `scrollMax 0` e
 * `scrollTop 0`, eppure la barra restava piena e il titolo grande invisibile. La specifica dice
 * che senza overflow la linea diventa inattiva e l'animazione non ha effetto
 * (https://www.w3.org/TR/scroll-animations-1/, letto il 2026-09-14); la WebView del Pad invece
 * la teneva `running` col tempo VECCHIO. Non si scommette sul motore: quando lo scorritore non
 * ha più niente da scorrere, le animazioni si spengono qui (`data-scroll-rest`) e tornano gli
 * stili di riposo. Il contenuto che si accorcia non lancia `scroll`, quindi lo si OSSERVA.
 */
const scrollAtRest = ref(false)
let osservatore: ResizeObserver | null = null
function verificaOverflow(): void {
    if (!scroller) return
    const fermo = scroller.scrollHeight <= scroller.clientHeight + 1
    scrollAtRest.value = fermo
    if (fermo) scrolled.value = false
}
function osservaScorritore(el: HTMLElement): void {
    osservatore?.disconnect()
    if (typeof ResizeObserver === 'undefined') return
    osservatore = new ResizeObserver(verificaOverflow)
    osservatore.observe(el)
    for (const figlio of Array.from(el.children)) osservatore.observe(figlio)
}
onBeforeUnmount(() => { osservatore?.disconnect(); osservatore = null })
function onSheetScroll(event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLElement) || target.scrollHeight <= target.clientHeight + 1) return
    if (target !== scroller) {
        scroller?.removeAttribute('data-talos-sheet-scroller')
        target.setAttribute('data-talos-sheet-scroller', '')
        scroller = target
        osservaScorritore(target)
    }
    scrollAtRest.value = false
    if (!scrollLinked) scrolled.value = target.scrollTop > 48
}
</script>

<template>
    <!-- F6: on tablet the sheet covers only the CONTENT area — the persistent
         chat panel stays usable (--talos-tablet-rail is 0 on phones). -->
    <div class="pointer-events-auto fixed inset-y-0 right-0 z-[70] flex flex-col justify-end" :style="{ left: 'var(--talos-tablet-rail, 0px)' }">
        <div
            data-testid="talos-mobile-sheet-backdrop"
            class="talos-mobile-tool-sheet-backdrop absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            :class="[
                entered ? 'opacity-100' : 'opacity-0',
                sceneBackground || hideChrome ? 'talos-mobile-tool-sheet-backdrop-scene' : '',
            ]"
            aria-hidden="true"
            @click="emit('close')"
        ></div>
        <section
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            data-testid="talos-mobile-tool-sheet"
            :data-presentation="presentation"
            :data-scene-background="String(sceneBackground === true || hideChrome === true)"
            :data-scrolled="String(scrolled)"
            :data-scroll-rest="String(scrollAtRest)"
            class="talos-mobile-tool-sheet-surface relative z-10 flex flex-col overflow-clip border-[var(--talos-border)] text-[var(--talos-text)] outline-none"
            @keydown.escape="emit('close')"
            @scroll.capture.passive="onSheetScroll"
            :class="[
                presentation === 'fullscreen'
                    ? 'h-[100dvh] max-h-none rounded-none border-0'
                    : 'h-[88dvh] max-h-[900px] rounded-t-2xl border-t',
                sceneBackground || hideChrome ? 'talos-mobile-tool-sheet-scene' : '',
            ]"
            :style="{ transform: sheetTransform }"
        >
            <!--
                Owner 2026-09-13/14: la barra fissa se ne va. Restano i comandi tondi (indietro o menu
                a sinistra, chiudi in finestra a destra) e una barra che compare scorrendo col titolo
                della pagina. Un solo indietro contestuale, come prima (owner 2026-07-24).
            -->
            <div v-if="!hideChrome" data-testid="talos-sheet-chrome" class="talos-sheet-chrome pointer-events-none absolute inset-x-0 top-0 z-20">
                <div data-testid="talos-sheet-bar" aria-hidden="true" class="talos-sheet-bar pointer-events-auto absolute inset-0 border-b border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-background))]">
                    <div class="flex h-full items-center justify-center px-16 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                        <p class="talos-title truncate text-sm font-medium text-[var(--talos-text)]">{{ barTitle }}</p>
                    </div>
                </div>
                <div class="relative flex min-h-16 items-center justify-between gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                    <button
                        v-if="subView || parentBack || rootBack"
                        type="button"
                        data-testid="talos-sheet-back"
                        :data-back-target="subView ? 'subview' : (parentBack ? 'parent' : 'chat')"
                        :aria-label="backLabel"
                        class="talos-pressable pointer-events-auto inline-flex min-h-touch min-w-touch items-center justify-center rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 text-[var(--talos-text)] backdrop-blur"
                        @click="goBack"
                    >
                        <ArrowLeft class="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        v-else-if="!hideMenu"
                        type="button"
                        data-testid="talos-sheet-menu"
                        :aria-label="t('navigation.openMenu')"
                        class="talos-pressable pointer-events-auto inline-flex min-h-touch min-w-touch items-center justify-center rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 text-[var(--talos-text)] backdrop-blur"
                        @click="emit('openMenu')"
                    >
                        <Menu class="size-5" aria-hidden="true" />
                    </button>
                    <span v-else aria-hidden="true" />
                    <button
                        v-if="presentation === 'drawer'"
                        type="button"
                        :aria-label="`Close ${title}`"
                        class="talos-pressable pointer-events-auto inline-flex min-h-touch min-w-touch items-center justify-center rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 text-[var(--talos-text)] backdrop-blur"
                        @click="emit('close')"
                    >
                        <X class="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
            <div
                data-testid="talos-mobile-sheet-body"
                class="talos-sheet-body min-h-0 flex-1"
                :data-under-controls="String(!hideChrome && hasControls)"
                :class="[
                    lockBodyScroll
                        ? 'overflow-hidden'
                        : 'overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]',
                    hideChrome ? 'talos-mobile-tool-sheet-body-chromeless' : '',
                ]"
            >
                <slot />
            </div>
        </section>
    </div>
</template>

<style>
.talos-mobile-tool-sheet-backdrop {
    /* U-14: il velo del mockup dura 220 ms (`--motion-time`). Il token del
       motore resta come secondo ripiego, per il fotogramma prima che i token
       `calm` siano scritti. */
    transition: opacity var(--talos-motion-calm-veil, var(--talos-motion-duration-surface-enter, 220ms)) var(--talos-motion-ease, ease-out);
}

/*
 * U-14: la superficie ha la durata di una FINESTRA, non di un menu.
 *
 * `surface-enter` (intento `menu-open`, base 150 ms) resta giusta per il velo,
 * che e' solo un'opacita'. La superficie invece ora percorre l'intera altezza
 * del foglio: con 150 ms quella distanza diventa uno scatto. L'intento giusto
 * e' `window-open` — una stazione E' una finestra — categoria Finestre, base
 * 320 ms. Il valore di serie 440 ms e' quello misurato sul mockup.
 */
.talos-mobile-tool-sheet-surface {
    background: var(--talos-window-bg);
    transition: transform var(--talos-motion-calm-sheet, var(--talos-motion-duration-window-open, 440ms)) var(--talos-motion-ease, ease-out);
    will-change: transform;
}

.talos-mobile-tool-sheet-scene {
    background: transparent;
}

.talos-mobile-tool-sheet-backdrop-scene {
    background: transparent;
    backdrop-filter: none;
}

/*
 * U-14 — LA STAZIONE ESCE SCENDENDO, e non svanisce.
 *
 * Misurato sul mockup chiudendo il foglio (`app.js:2092`, `Motion.dismiss`):
 *
 *     DIALOG.overlay motion-sheet | dur=210 ease=cubic-bezier(0.3, 0, 0.8, 0.15)
 *       {"opacity":"1","transform":"none"} -> {"opacity":1,"transform":"translateY(871px)"}
 *
 * ⛔ Si guardi l'opacita': resta **1**. Il foglio del mockup non si dissolve,
 * se ne va. A dissolversi e' il velo dietro, e basta. La differenza si vede: un
 * pannello che sbiadisce sul posto non dice dov'e' andato, uno che scende dice
 * che e' tornato da dove era venuto — e che lo stesso gesto lo riporta su.
 *
 * Percio' qui l'uscita e' divisa in due bersagli invece di essere una sola
 * regola sulla radice: il velo perde opacita', la superficie trasla. La radice
 * non tocca piu' la propria opacita' — se lo facesse, sfumerebbe anche il
 * foglio e le due cose tornerebbero indistinguibili.
 */
.station-leave-active .talos-mobile-tool-sheet-backdrop,
.station-leave-active .talos-mobile-tool-sheet-surface {
    transition:
        opacity var(--talos-motion-calm-sheet-exit, var(--talos-motion-duration-window-close, 210ms)) var(--talos-motion-ease-exit, var(--talos-motion-calm-ease-exit)),
        transform var(--talos-motion-calm-sheet-exit, var(--talos-motion-duration-window-close, 210ms)) var(--talos-motion-ease-exit, var(--talos-motion-calm-ease-exit));
}

.station-leave-to .talos-mobile-tool-sheet-backdrop {
    opacity: 0;
}

.station-leave-to .talos-mobile-tool-sheet-surface {
    transform: translateY(var(--talos-motion-sheet-rise, 1rem));
}

/*
 * La durata dell'uscita resta dichiarata anche sulla radice: e' lei a reggere
 * il nodo in vita finche' i due figli hanno finito. Senza, Vue lo staccherebbe
 * al primo fotogramma e non si vedrebbe niente.
 */
.station-leave-active {
    transition: opacity var(--talos-motion-calm-sheet-exit, var(--talos-motion-duration-surface-exit, 210ms)) var(--talos-motion-ease-exit, ease-in);
}

/*
 * Al verso contrario: niente entrata, niente uscita, e lo stato finale
 * identico a quello a riposo. Con durata 0 la trasformazione si assesta nello
 * stesso fotogramma, quindi il foglio e' gia' al suo posto quando compare.
 */
@media (prefers-reduced-motion: reduce) {
    .talos-mobile-tool-sheet-backdrop,
    .talos-mobile-tool-sheet-surface,
    .station-leave-active,
    .station-leave-active .talos-mobile-tool-sheet-backdrop,
    .station-leave-active .talos-mobile-tool-sheet-surface {
        transition-duration: 0ms;
    }
}

/* With the landscape keyboard open the native resize leaves less height than
   this header alone consumes. Harness already exposes its own focused composer;
   temporarily yield the sheet chrome, then restore it on keyboardWillHide. */
@media (max-height: 500px) and (orientation: landscape) {
    body.keyboard-open .talos-sheet-chrome {
        display: none;
    }

    body.keyboard-open .talos-sheet-body[data-under-controls="true"] {
        padding-top: env(safe-area-inset-top);
    }

    body.keyboard-open .talos-mobile-tool-sheet-body-chromeless {
        padding-top: env(safe-area-inset-top);
    }
}
/* ─── La barra che si ripiega (owner 2026-09-13/14) ─────────────────────────── */
.talos-mobile-tool-sheet-surface { timeline-scope: --talos-sheet-scroll; }
/* La linea sta sullo scorritore VERO, marcato al primo scorrimento (vedi onSheetScroll). */
.talos-mobile-tool-sheet-surface [data-talos-sheet-scroller] { scroll-timeline: --talos-sheet-scroll block; }
/*
 * ⛔ Foto del Pad, 14/09: senza tondi alla radice (tablet) il titolo «Libreria» e «Aggiungi file»
 * finivano SOTTO la barra di stato, con Wi-Fi e batteria disegnati sopra il pulsante: la barra fissa
 * garantiva quello spazio, e togliendola l'avevo tolto. Ora c'e' sempre (tranne Codice, che ha la
 * sua barra). E sotto i tondi 3,25rem, non 4: il margine della pagina si somma (vuoto di ~90 px).
 */
.talos-sheet-body[data-under-controls="false"]:not(.talos-mobile-tool-sheet-body-chromeless) { padding-top: env(safe-area-inset-top); }
.talos-sheet-body[data-under-controls="true"] { padding-top: calc(3.25rem + env(safe-area-inset-top)); }
/* Nascosta non ruba i tocchi: `visibility` passa a visible solo quando la barra c'e'. */
.talos-sheet-bar { opacity: 0; visibility: hidden; }
.talos-mobile-tool-sheet-surface[data-scrolled="true"] .talos-sheet-bar { opacity: 1; visibility: visible; }
@supports (animation-timeline: scroll()) {
    /*
     * ⛔ Foto a 48 px, 14/09: una barra semitrasparente lasciava vedere il campo di ricerca e ci
     * scriveva sopra «Libreria» — sembrava rotta. Il FONDO diventa pieno nei primi 16 px (il
     * contenuto passa sotto un fondo, non attraverso un velo); il TITOLO piccolo sfuma dentro fra
     * 32 e 72 px, mentre quello grande se ne va. E' questa la «fusione».
     */
    .talos-sheet-bar {
        animation: talos-sheet-bar-in linear both;
        animation-timeline: --talos-sheet-scroll;
        animation-range: 0px 16px;
    }
    .talos-sheet-bar .talos-title {
        animation: talos-sheet-bar-title-in linear both;
        animation-timeline: --talos-sheet-scroll;
        animation-range: 32px 72px;
    }
    .talos-sheet-body [data-talos-sheet-title] {
        transform-origin: 0 100%;
        animation: talos-sheet-title-out linear both;
        animation-timeline: --talos-sheet-scroll;
        animation-range: 0px 72px;
    }
    /* Niente da scorrere: niente ripiegamento (vedi `verificaOverflow`). */
    .talos-mobile-tool-sheet-surface[data-scroll-rest="true"] .talos-sheet-bar,
    .talos-mobile-tool-sheet-surface[data-scroll-rest="true"] .talos-sheet-bar .talos-title,
    .talos-mobile-tool-sheet-surface[data-scroll-rest="true"] .talos-sheet-body [data-talos-sheet-title] {
        animation: none;
    }
}
@keyframes talos-sheet-bar-in { from { opacity: 0; visibility: hidden; } to { opacity: 1; visibility: visible; } }
@keyframes talos-sheet-title-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-0.5rem) scale(0.92); } }
@keyframes talos-sheet-title-fade { from { opacity: 1; } to { opacity: 0; } }
@keyframes talos-sheet-bar-title-in { from { opacity: 0; } to { opacity: 1; } }
/* Con la riduzione del movimento il titolo SFUMA soltanto: niente spostamento ne' scala. */
@media (prefers-reduced-motion: reduce) {
    .talos-sheet-body [data-talos-sheet-title] { animation-name: talos-sheet-title-fade; }
}
</style>
