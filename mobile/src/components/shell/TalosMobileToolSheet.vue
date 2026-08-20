<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide, ref } from 'vue'
import { ArrowLeft, X } from '@lucide/vue'
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
// so every station matches — and animates in (slide-up + backdrop fade, 250ms,
// globally zeroed under reduced-motion).
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
    /** Il nome del posto dove si torna, per dirlo invece di farlo indovinare. */
    parentTitle?: string
}>(), {
    presentation: 'fullscreen',
    parentBack: null,
})
const emit = defineEmits<{ close: [] }>()

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
            class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-250"
            :class="entered ? 'opacity-100' : 'opacity-0'"
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
            class="relative z-10 flex flex-col overflow-hidden border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)] outline-none transition-transform duration-250 ease-out"
            @keydown.escape="emit('close')"
            :class="[
                presentation === 'fullscreen'
                    ? 'h-[100dvh] max-h-none rounded-none border-0'
                    : 'h-[88dvh] max-h-[900px] rounded-t-2xl border-t',
                entered ? 'translate-y-0' : 'translate-y-6',
            ]"
        >
            <!-- Owner 2026-07-24: ONE contextual back. When a station pushes a
                 sub-view, the header shows the subsection title and Back returns
                 to the station (not a second in-body arrow). -->
            <header class="flex shrink-0 items-center gap-2 border-b border-[var(--talos-border)] bg-transparent px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
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
                    type="button"
                    data-testid="talos-sheet-back"
                    :data-back-target="subView ? 'subview' : (parentBack ? 'parent' : 'chat')"
                    :aria-label="backLabel"
                    class="talos-pressable inline-flex min-h-touch min-w-touch items-center justify-center rounded-md text-[var(--talos-muted)]"
                    @click="goBack"
                >
                    <ArrowLeft class="h-4 w-4" aria-hidden="true" />
                </button>
                <div class="min-w-0 flex-1">
                    <p class="talos-title truncate text-md font-semibold text-[var(--talos-text)]">{{ subView ? subView.title : title }}</p>
                    <p v-if="!subView && description" class="truncate text-2xs text-[var(--talos-muted)]">{{ description }}</p>
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
                class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
                <slot />
            </div>
        </section>
    </div>
</template>
