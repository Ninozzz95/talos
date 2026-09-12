<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide, ref, type Component } from 'vue'
import { ArrowLeft, Menu, X } from '@lucide/vue'
import { TALOS_SHEET_CONTEXT_KEY } from '@/lib/sheetContext'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
import { useTalosI18n } from '@/i18n'

const TalosMobileNotificationBell = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileNotificationBell.vue'),
)
const TalosMobileDownloadCenterTrigger = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileDownloadCenterTrigger.vue'),
)

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
            class="talos-mobile-tool-sheet-surface relative z-10 flex flex-col overflow-clip border-[var(--talos-border)] text-[var(--talos-text)] outline-none"
            @keydown.escape="emit('close')"
            :class="[
                presentation === 'fullscreen'
                    ? 'h-[100dvh] max-h-none rounded-none border-0'
                    : 'h-[88dvh] max-h-[900px] rounded-t-2xl border-t',
                sceneBackground || hideChrome ? 'talos-mobile-tool-sheet-scene' : '',
            ]"
            :style="{ transform: sheetTransform }"
        >
            <!-- Owner 2026-07-24: ONE contextual back. When a station pushes a
                 sub-view, the header shows the subsection title and Back returns
                 to the station (not a second in-body arrow). -->
            <!-- U-7: la barra del mockup — `.topbar`: min 4rem, fondo `--talos-header`,
                 bordo sotto; `.top-title`: icona + titolo, non un titolo centrato. -->
            <header v-if="!hideChrome" class="talos-mobile-tool-sheet-header flex min-h-16 shrink-0 items-center gap-1 border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-2 py-1 pt-[max(0.25rem,env(safe-area-inset-top))]">
                <!--
                    Owner 2026-08-04, provato sul telefono: «il pulsante
                    indietro in alto a sinistra fa chiudere tutto».

                    Aveva ragione. Questo bottone conosceva i `subView` — il
                    vecchio meccanismo dei fogli — ma NON le pagine-figlie di
                    rotta, che sono quelle nate con la navigazione lineare.
                    Aperta una nota, `subView` era nullo e il ramo `else`
                    chiudeva la stazione intera. La gesture di sistema
                    funzionava perche' passa da `stationParent`, che questo
                    bottone non consultava: due comandi per lo stesso gesto,
                    con due destinazioni diverse.

                    Tre casi, tre destinazioni, e ognuno DICE la sua: un
                    pulsante che si chiama «Back to chat» e va da un'altra
                    parte e' peggio di uno che non c'e'.
                -->
                <button
                    v-if="subView || parentBack || rootBack"
                    type="button"
                    data-testid="talos-sheet-back"
                    :data-back-target="subView ? 'subview' : (parentBack ? 'parent' : 'chat')"
                    :aria-label="backLabel"
                    class="talos-pressable inline-flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="goBack"
                >
                    <ArrowLeft class="h-4 w-4" aria-hidden="true" />
                </button>
                <!-- U-7: sulla radice della stazione, il ☰ del mockup (solo telefono). -->
                <button
                    v-else-if="!hideMenu"
                    type="button"
                    data-testid="talos-sheet-menu"
                    :aria-label="t('navigation.openMenu')"
                    class="talos-pressable inline-flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-text)]"
                    @click="emit('openMenu')"
                >
                    <Menu class="size-5" aria-hidden="true" />
                </button>
                <div class="flex min-w-0 flex-1 items-center gap-2 px-1">
                    <component :is="icon" v-if="icon && !subView" class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                    <div class="min-w-0">
                        <p class="talos-title truncate text-sm font-medium text-[var(--talos-text)]">{{ subView ? subView.title : title }}</p>
                        <p v-if="!subView && description" class="truncate text-2xs text-[var(--talos-muted)]">{{ description }}</p>
                    </div>
                </div>
                <template v-if="!hideAppActions">
                    <TalosMobileNotificationBell />
                    <TalosMobileDownloadCenterTrigger />
                </template>
                <button
                    v-if="presentation === 'drawer'"
                    type="button"
                    :aria-label="`Close ${title}`"
                    class="talos-pressable inline-flex min-h-touch min-w-touch items-center justify-center rounded-md text-[var(--talos-muted)]"
                    @click="emit('close')"
                >
                    <X class="h-4 w-4" aria-hidden="true" />
                </button>
            </header>
            <div
                data-testid="talos-mobile-sheet-body"
                class="min-h-0 flex-1"
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
    body.keyboard-open .talos-mobile-tool-sheet-header {
        display: none;
    }

    body.keyboard-open .talos-mobile-tool-sheet-header + [data-testid="talos-mobile-sheet-body"] {
        padding-top: env(safe-area-inset-top);
    }

    body.keyboard-open .talos-mobile-tool-sheet-body-chromeless {
        padding-top: env(safe-area-inset-top);
    }
}
</style>
