<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import { useTalosI18n } from '@/i18n'
import {
    BookMarked, BookOpen, CheckSquare, FlaskConical, MessageSquareText,
    Check, Cpu, Search, Settings, StickyNote, Stethoscope, X,
} from '@lucide/vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileDeleteChatDialog from '@/components/shell/TalosMobileDeleteChatDialog.vue'
import { type TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'
import TalosMobileSpeedDial from '@/components/shell/TalosMobileSpeedDial.vue'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'
import { useTalosAccountStore } from '@/stores/account'
import { useSettingsStore } from '@/stores/settings'
import { TALOS_MOTION_V6_DEFAULTS } from '@/motion-v6/defaults'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'
import { talosHarnessUiAvailable } from '@/services/harnessUi'
import {
    talosDrawerGestureMove,
    talosDrawerGestureStart,
    talosDrawerShouldOpen,
    talosPrefersReducedMotion,
    talosScalarSpring,
    talosVelocityAt,
    type TalosDrawerGestureState,
    type TalosSpringHandle,
} from '@/composables/useTalosDrawerSpring'

const TalosMobileNotificationBell = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileNotificationBell.vue'),
)
const TalosMobileDownloadCenterTrigger = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileDownloadCenterTrigger.vue'),
)

/**
 * ⭐⭐⭐ LA SIDEBAR DEL MOCKUP «TALOS CALM FINALE», portata così com'è — U-1.
 *
 * Decisione owner, 11/09/2026 (`LEDGER-UI-CALM-2026-09-11.md`): struttura e
 * controller del mockup, non i nostri. Struttura (`renderNav` in `src/app.js`
 * del pacchetto): marchio con «+» e chiusura · «Cerca in Talos» · le sezioni ·
 * «Recenti» con il conteggio · Doctor e Impostazioni fissi in fondo · il piede
 * con l'account. Il gesto è in `useTalosDrawerSpring.ts`, numero per numero.
 *
 * ## Il pannello è un `<dialog>` nativo, come nel mockup
 *
 * `showModal()` lo mette nel top layer con il suo `::backdrop`, rende inerte
 * il resto della pagina e porta il fuoco al primo elemento focalizzabile — tre
 * cose che prima si rifacevano a mano con una libreria (`vaul`). Supportato
 * dalla WebView Android dalla 37 (MDN, «<dialog>: The Dialog element»,
 * https://developer.mozilla.org/docs/Web/HTML/Reference/Elements/dialog, e
 * Chrome for Developers, «dialog element - modals made easy»,
 * https://developer.chrome.com/blog/dialog-element-modals-made-easy — letti
 * l'11/09/2026). ⛔ Dove `showModal` non esiste (jsdom) il pannello si mostra
 * lo stesso con `open`: le prove non devono dipendere dal top layer.
 *
 * ## Cosa NON cambia
 *
 * Il contratto verso l'app — `sessions`, `select`, `rename`, `delete`,
 * `navigate`, `openSettings`, `newChat` — è identico: la sidebar è la stessa
 * porta, con un'altra facciata e un altro modo di aprirsi.
 *
 * ⛔ «Modelli» NON entra fra le sezioni, anche se il mockup ce l'ha: la
 * decisione precedente dell'owner (F2-RED-20) tiene il Laboratorio modelli
 * sotto Impostazioni, e una decisione non si cambia di nascosto portando un
 * disegno. Segnato nel ledger UI come domanda per la sezione Chat.
 */
const props = defineProps<{
    open: boolean
    sessions: readonly TalosLocalChatSession[]
    activeSessionId: string | null
    busy: boolean
    creatingSession: boolean
    cleanupPlanFor?: (sessionId: string) => TalosSessionCleanupPlan
    /**
     * ⭐ U-5 (owner, 11/09/2026): sul TABLET la sidebar del mockup e' FISSA —
     * `matchMedia('(max-width: 860px)')` decide il cassetto solo sotto 860 px,
     * sopra il mockup mostra `aside#sidebar` di 14,5 rem sempre visibile, senza
     * ☰. Qui vuol dire: stesso pannello, stesse voci, ma niente `<dialog>`,
     * niente gesto, niente pulsante «chiudi», e `open` non conta. Una sola
     * implementazione per le due forme: e' la stessa `renderNav(mobile)` del
     * mockup.
     */
    fixed?: boolean
}>()

const emit = defineEmits<{
    'update:open': [open: boolean]
    newChat: []
    select: [sessionId: string]
    rename: [sessionId: string, title: string]
    delete: [sessionId: string, choice: { deleteMedia: boolean }]
    navigate: [route: TalosMobileRouteName]
    openSettings: []
}>()

const account = useTalosAccountStore()
const impostazioni = useSettingsStore()
/**
 * U-15: il fattore di tempo della molla = cursore «Durata transizioni» /
 * valore di serie del motore (50, `motion-v6/defaults.ts`): 1 alle
 * preferenze di serie, come nel mockup dove `motionDuration` è 100 di serie.
 */
function fattoreDurata(): number {
    const scala = impostazioni.state.motion_v6?.interface?.duration_scale
    const serie = TALOS_MOTION_V6_DEFAULTS.interface.duration_scale
    return typeof scala === 'number' && scala > 0 ? scala / serie : 1
}
const { t } = useTalosI18n()
const harnessAvailable = talosHarnessUiAvailable()

/** Le sezioni, nell'ordine del mockup; le voci gated restano gated. */
const sezioni = computed<Array<{ route: TalosMobileRouteName, key: string, icon: typeof BookOpen }>>(() => [
    { route: 'tasks', key: 'navigation.tasks', icon: CheckSquare },
    { route: 'context', key: 'navigation.library', icon: BookOpen },
    // U-6 (owner 11/09): «Modelli» in sidebar come nel mockup — sostituisce
    // F2-RED-20 (Laboratorio modelli solo sotto Impostazioni). La schermata
    // resta quella: il hub dei modelli sotto Impostazioni.
    { route: 'settings-models', key: 'navigation.models', icon: Cpu },
    { route: 'research', key: 'navigation.research', icon: FlaskConical },
    { route: 'memory', key: 'navigation.memory', icon: BookMarked },
    { route: 'notes', key: 'navigation.notes', icon: StickyNote },
    ...(harnessAvailable ? [{ route: 'harness' as TalosMobileRouteName, key: 'navigation.harness', icon: Settings }] : []),
])

/* ------------------------------------------------------------------ pannello */
/** `<dialog>` nel cassetto, `<div>` nella forma fissa: i metodi del dialog si usano solo se ci sono. */
const dialogo = ref<(HTMLElement & Partial<Pick<HTMLDialogElement, 'open' | 'showModal' | 'close'>>) | null>(null)
const LARGHEZZA_PREDEFINITA = 352 // 22rem: la larghezza del cassetto nel mockup
let larghezza = LARGHEZZA_PREDEFINITA
let offset = -LARGHEZZA_PREDEFINITA
let molla: TalosSpringHandle | null = null
let apertore: Element | null = null
const restoreSidebarFocusOnClose = ref(true)

function larghezzaAttuale(): number {
    const w = dialogo.value?.offsetWidth ?? 0
    larghezza = w > 0 ? w : LARGHEZZA_PREDEFINITA
    return larghezza
}

/** Il dito (o la molla) dipinge: nessun easing CSS, la posizione è un numero. */
function dipingi(x: number): void {
    const d = dialogo.value
    if (!d) return
    offset = Math.max(-larghezza, Math.min(0, x))
    d.style.transform = `translate3d(${offset}px, 0px, 0px)`
    d.style.setProperty('--talos-drawer-backdrop', String(Math.max(0, Math.min(1, 1 + offset / Math.max(1, larghezza)))))
}

function mostra(): void {
    const d = dialogo.value
    if (props.fixed || !d || d.open) return
    apertore = document.activeElement
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
}

function nascondi(): void {
    const d = dialogo.value
    if (props.fixed || !d) return
    if (d.open && typeof d.close === 'function') d.close()
    else d.removeAttribute('open')
    d.style.transform = ''
    d.style.removeProperty('--talos-drawer-backdrop')
    const daRiportare = apertore
    apertore = null
    if (restoreSidebarFocusOnClose.value && daRiportare instanceof HTMLElement) daRiportare.focus({ preventScroll: true })
    restoreSidebarFocusOnClose.value = true
}

function assesta(aperto: boolean, velocitaPxPerMs = 0): void {
    molla?.cancel()
    const a = larghezzaAttuale()
    molla = talosScalarSpring(
        offset,
        aperto ? 0 : -a,
        dipingi,
        () => {
            molla = null
            if (aperto) {
                const d = dialogo.value
                if (d) d.style.transform = ''
            } else {
                emit('update:open', false)
            }
        },
        { velocity: velocitaPxPerMs * 1000, reduced: talosPrefersReducedMotion(), timeScale: fattoreDurata() },
    )
}

watch(() => props.open, (aperto) => {
    if (props.fixed) return
    if (aperto) {
        mostra()
        larghezzaAttuale()
        dipingi(-larghezza)
        assesta(true)
    } else {
        molla?.cancel()
        molla = null
        nascondi()
    }
}, { flush: 'post' })

onMounted(() => {
    if (props.open && !props.fixed) {
        mostra()
        larghezzaAttuale()
        dipingi(0)
        const d = dialogo.value
        if (d) d.style.transform = ''
    }
})

onBeforeUnmount(() => {
    molla?.cancel()
    molla = null
})

/** Esc dal `<dialog>`: si chiude con la molla, non di colpo. */
function onCancel(event: Event): void {
    event.preventDefault()
    chiudi()
}

/**
 * Un tocco sullo sfondo chiude. Su un `<dialog>` modale il click sul
 * `::backdrop` arriva con `target === dialog`; per distinguerlo da un click
 * dentro il pannello si guarda il rettangolo (mockup `src/app.js:3169`, stesso
 * criterio di Go Make Things, «How to dismiss native HTML dialog elements when
 * the backdrop is clicked», letto l'11/09/2026:
 * https://gomakethings.com/articles/how-to-dismiss-native-html-dialog-elements-when-the-backdrop-is-clicked/).
 * Dopo un trascinamento non si chiude: quel click e' la coda del gesto.
 */
function onClickDialogo(event: MouseEvent): void {
    const d = dialogo.value
    if (props.fixed || !d || event.target !== d || gesto) return
    const r = d.getBoundingClientRect()
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) chiudi()
}

function chiudi(): void {
    if (props.fixed || !props.open) return
    larghezzaAttuale()
    assesta(false)
}

/* -------------------------------------------------------------------- gesto */
let gesto: TalosDrawerGestureState | null = null
let gestoDaTocco = false

function inizioGesto(pointer: number | null, x: number, y: number, t: number, daTocco: boolean): void {
    if (props.fixed || !props.open) return
    if (gesto && gestoDaTocco && !daTocco) return // il tocco possiede già il gesto
    if (molla) { molla.cancel(); molla = null } // il dito interrompe la molla dove si trova
    larghezzaAttuale()
    gesto = talosDrawerGestureStart(pointer, x, y, offset, t)
    // Come nel mockup (`dataset.gestureActive`): `will-change` solo mentre il
    // dito comanda. A riposo il dialog NON deve essere un contenitore per i
    // figli `position: fixed` — il menu di riga vive dentro di lui (top layer)
    // e il suo velo deve coprire lo schermo intero, non il cassetto.
    dialogo.value?.setAttribute('data-gesture-active', 'true')
    gestoDaTocco = daTocco
}

function muoviGesto(x: number, y: number, t: number, daTocco: boolean, event?: Event): void {
    const g = gesto
    if (!g || gestoDaTocco !== daTocco) return
    const esito = talosDrawerGestureMove(g, x, y, t)
    if (esito === 'abandon') { gesto = null; return }
    if (esito === 'ignore') return
    if (event?.cancelable) event.preventDefault()
    dipingi(g.startOffset + g.dx)
}

function gestoFinito(): void {
    dialogo.value?.removeAttribute('data-gesture-active')
}
function fineGesto(t: number, daTocco: boolean): void {
    const g = gesto
    if (!g || gestoDaTocco !== daTocco) return
    gesto = null
    gestoFinito()
    if (!g.locked) return
    const vx = talosVelocityAt(g.samples, t, 'x')
    assesta(talosDrawerShouldOpen(offset, g.dx, vx, larghezza), vx)
}

/** `pointercancel`/orientamento: si torna alla posizione valida di partenza. */
function annullaGesto(daTocco: boolean): void {
    const g = gesto
    if (!g || gestoDaTocco !== daTocco) return
    gesto = null
    gestoFinito()
    if (g.locked) assesta(g.startOffset >= -larghezza / 2)
}

function onPointerDown(e: PointerEvent): void {
    if (!e.isPrimary || e.button !== 0) return
    if ((e.target as Element | null)?.closest('input,textarea,select,[contenteditable=true]')) return
    inizioGesto(e.pointerId, e.clientX, e.clientY, e.timeStamp, false)
}
function onPointerMove(e: PointerEvent): void { muoviGesto(e.clientX, e.clientY, e.timeStamp, false, e) }
function onPointerUp(e: PointerEvent): void { fineGesto(e.timeStamp, false) }
function onPointerCancel(): void { annullaGesto(false) }

function onTouchStart(e: TouchEvent): void {
    const tocco = e.touches[0]
    if (!tocco) return
    if ((e.target as Element | null)?.closest('input,textarea,select,[contenteditable=true]')) return
    // Il tocco ha la precedenza sul pointer: sulla WebView Android un
    // `pointercancel` arriva appena la lista scorre, e non deve buttare il gesto.
    gesto = null
    inizioGesto(null, tocco.clientX, tocco.clientY, e.timeStamp, true)
}
function onTouchMove(e: TouchEvent): void {
    const tocco = e.touches[0]
    if (tocco) muoviGesto(tocco.clientX, tocco.clientY, e.timeStamp, true, e)
}
function onTouchEnd(e: TouchEvent): void {
    const tocco = e.changedTouches[0]
    if (tocco) fineGesto(e.timeStamp, true)
}
function onTouchCancel(): void { annullaGesto(true) }

function onOrientamento(): void {
    if (gesto) annullaGesto(gestoDaTocco)
    if (props.open && !molla) { larghezzaAttuale(); dipingi(0); const d = dialogo.value; if (d) d.style.transform = '' }
}
onMounted(() => window.addEventListener('orientationchange', onOrientamento))
onBeforeUnmount(() => window.removeEventListener('orientationchange', onOrientamento))
/**
 * La riga della sezione in cui ci si trova e' evidenziata, come nel mockup
 * (`.nav-row.active`: fondo `--talos-active`, icona in accento). La rotta si
 * legge dal router; le pagine di dettaglio contano per la loro sezione.
 */
const rotta = useRoute()
const sezioneAttiva = computed<TalosMobileRouteName | null>(() => {
    const nome = String(rotta.name ?? '')
    if (nome === 'chat' || nome === 'chats') return 'chats'
    if (nome.startsWith('settings-models')) return 'settings-models'
    if (nome.startsWith('task')) return 'tasks'
    if (nome.startsWith('memory')) return 'memory'
    if (nome.startsWith('note')) return 'notes'
    if (nome.startsWith('research')) return 'research'
    if (nome.startsWith('harness')) return 'harness'
    if (nome === 'context' || nome === 'doctor') return nome
    return null
})
function attiva(route: TalosMobileRouteName): 'page' | undefined {
    return sezioneAttiva.value === route ? 'page' : undefined
}

/** Le ultime sei, come nel mockup (`recent.slice(0,6)`): l'elenco intero sta in «Chat». */
const RECENTI_MASSIME = 6
const recenti = computed(() => props.sessions.slice(0, RECENTI_MASSIME))

/**
 * Le azioni di una chat stanno in UN menu di riga (tre puntini, pressione
 * lunga, tasto destro) e non in due bottoni affiancati: regola owner 10/09
 * («piu' di due azioni ⇒ menu overflow»), e la riga del mockup e' pulita —
 * icona e titolo, nient'altro.
 */
const azioniDiRiga = computed<TalosRowAction[]>(() => [
    { id: 'rename', label: t('common.rename'), testId: 'talos-sidebar-chat-rename' },
    { id: 'delete', label: t('common.delete'), danger: true, testId: 'talos-sidebar-chat-delete' },
])
function azioneDiRiga(session: TalosLocalChatSession, id: string): void {
    if (id === 'rename') void openRename(session)
    else if (id === 'delete') openDelete(session)
}

/* ----------------------------------------------------------- voci e dialoghi */
function suppressSidebarFocusRestore(): void {
    restoreSidebarFocusOnClose.value = false
}
function vaiA(route: TalosMobileRouteName): void {
    suppressSidebarFocusRestore()
    emit('navigate', route)
}
function sessionTitle(session: TalosLocalChatSession): string {
    return session.title || t('chat.untitledChat')
}

const renameTarget = ref<TalosLocalChatSession | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<TalosLocalChatSession | null>(null)

async function openRename(session: TalosLocalChatSession): Promise<void> {
    suppressSidebarFocusRestore()
    emit('update:open', false)
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}
function submitRename(): void {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title || props.busy) return
    emit('rename', target.id, title)
    renameTarget.value = null
    renameValue.value = ''
}
function openDelete(session: TalosLocalChatSession): void {
    suppressSidebarFocusRestore()
    emit('update:open', false)
    deleteTarget.value = session
}
function confirmDelete(choice: { deleteMedia: boolean }): void {
    if (!deleteTarget.value) return
    emit('delete', deleteTarget.value.id, choice)
}
const deletePlan = computed<TalosSessionCleanupPlan>(() => (
    deleteTarget.value && props.cleanupPlanFor
        ? props.cleanupPlanFor(deleteTarget.value.id)
        : { documents: [], sources: [] }
))

/**
 * U-14 — le righe della sidebar rispondono al tocco.
 *
 * Nel mockup `.nav-row` e `.recent-row` sono nominate due volte: nell'elenco
 * delle pressioni LEGGERE (`app.js:2205`, scala 0,992 e non 0,965) e in quello
 * dei bersagli dell'onda (`app.js:2210`). Sono righe larghe quanto il cassetto:
 * con la pressione dei bottoni piccoli sembrerebbero cedere.
 *
 * ⛔ L'onda non tocca il gesto del cassetto. Appende uno `<span>` e basta: non
 * cattura il puntatore, non chiama `preventDefault`, non ferma la
 * propagazione — il `pointerdown` in fase di cattura sull'`<aside>` continua a
 * vedere lo stesso evento. È lo stesso ordine del mockup, dove `pointerDown`
 * disegna l'onda e poi decide il gesto.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <!-- U-5: un solo pannello, due contenitori. Sul telefono un <dialog> nel top
         layer (teleportato in body); sul tablet un contenitore in linea, fisso,
         nella colonna sinistra della vista divisa — come `aside#sidebar` del
         mockup sopra 860 px. -->
    <Teleport to="body" :disabled="props.fixed">
        <component
            :is="props.fixed ? 'div' : 'dialog'"
            ref="dialogo"
            data-testid="talos-mobile-sidebar"
            class="talos-drawer"
            :class="props.fixed ? 'sidebar-fixed' : 'z-[var(--talos-z-global-navigation)]'"
            :data-fixed="props.fixed ? 'true' : undefined"
            :aria-label="$t('navigation.primary')"
            @cancel="onCancel"
            @click="onClickDialogo"
        >
            <aside
                data-testid="talos-sidebar-swipe-surface"
                class="sidebar"
                :aria-label="$t('navigation.primary')"
                @pointerdown.capture="onPointerDown"
                @pointermove.capture="onPointerMove"
                @pointerup.capture="onPointerUp"
                @pointercancel.capture="onPointerCancel"
                @touchstart.capture.passive="onTouchStart"
                @touchmove.capture="onTouchMove"
                @touchend.capture="onTouchEnd"
                @touchcancel.capture="onTouchCancel"
            >
                <!-- Il marchio VERO di TALOS al posto del segnaposto del mockup (owner
                     11/09: «fai molta attenzione a sostituire i loghi mockup»), la
                     parola in Orbitron come in tutta l'app, e le sole due azioni
                     affiancate che il mockup prevede: «+» e chiudi. -->
                <div class="brand">
                    <span class="talos-short-logo brand-mark" aria-hidden="true"><span class="talos-short-logo-mark"></span></span>
                    <span class="brand-name talos-orbitron-brand">TALOS</span>
                    <TalosMobileSpeedDial
                        icon-only
                        :creating-chat="props.creatingSession"
                        @started="emit('update:open', false)"
                        @chat="emit('newChat')"
                    />
                    <Button v-if="!props.fixed" type="button" size="icon-lg" variant="ghost" class="min-h-touch min-w-touch" :aria-label="$t('navigation.closeMenu')" @click="chiudi">
                        <X aria-hidden="true" />
                    </Button>
                </div>

                <button type="button" class="nav-search" @click="vaiA('chats')">
                    <Search class="icon" aria-hidden="true" />
                    <span>{{ $t('shell.searchTalos') }}</span>
                </button>

                <div data-testid="talos-sidebar-scroll-surface" class="sidebar-scroll min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
                    <nav data-testid="talos-sidebar-tools" class="nav" :aria-label="$t('shell.tools')">
                        <button
                            type="button"
                            data-testid="talos-sidebar-chats-entry"
                            class="nav-row talos-pressable talos-pressable-row talos-wave-host"
                            :aria-label="$t('shell.openItem', { item: $t('navigation.chats') })"
                            :aria-current="attiva('chats')"
                            @pointerdown="onda.onPointerDown"
                            @click="vaiA('chats')"
                        >
                            <MessageSquareText class="icon" aria-hidden="true" />
                            <span>{{ $t('navigation.chats') }}</span>
                        </button>
                        <button
                            v-for="voce in sezioni"
                            :key="voce.route"
                            type="button"
                            class="nav-row talos-pressable talos-pressable-row talos-wave-host"
                            :aria-label="$t('shell.openItem', { item: $t(voce.key) })"
                            :aria-current="attiva(voce.route)"
                            @pointerdown="onda.onPointerDown"
                            @click="vaiA(voce.route)"
                        >
                            <component :is="voce.icon" class="icon" aria-hidden="true" />
                            <span>{{ $t(voce.key) }}</span>
                        </button>
                    </nav>

                    <section data-testid="talos-sidebar-recents" class="nav-section" :aria-label="$t('shell.recentChats')">
                        <div class="nav-section-head">{{ $t('shell.recents') }}<span>{{ props.sessions.length }}</span></div>
                        <p v-if="!props.sessions.length" class="nav-empty">{{ $t('shell.noChats') }}</p>
                        <ul v-else :aria-label="$t('shell.chatHistory')">
                            <li v-for="session in recenti" :key="session.id" class="recent-line">
                                <button
                                    type="button"
                                    class="recent-row talos-pressable talos-pressable-row talos-wave-host"
                                    :aria-label="$t('chat.openNamed', { title: sessionTitle(session) })"
                                    :aria-current="session.id === props.activeSessionId ? 'page' : undefined"
                                    @pointerdown="onda.onPointerDown"
                                    @click="emit('select', session.id)"
                                >
                                    <MessageSquareText class="icon" aria-hidden="true" />
                                    <span class="recent-title">{{ sessionTitle(session) }}</span>
                                </button>
                                <div class="recent-menu">
                                    <TalosRowActions
                                        :teleport-to="dialogo ?? 'body'"
                                        :test-id="`talos-sidebar-chat-menu-${session.id}`"
                                        :label="$t('chats.actionsFor', { title: sessionTitle(session) })"
                                        :items="azioniDiRiga"
                                        @select="(id: string) => azioneDiRiga(session, id)"
                                    />
                                </div>
                            </li>
                        </ul>
                    </section>
                </div>

                <div class="nav-fixed">
                    <button type="button" class="nav-row" :aria-label="$t('shell.openItem', { item: $t('navigation.doctor') })" :aria-current="attiva('doctor')" @click="vaiA('doctor')">
                        <Stethoscope class="icon" aria-hidden="true" />
                        <span>{{ $t('navigation.doctor') }}</span>
                    </button>
                    <button type="button" class="nav-row" :aria-label="$t('shell.openSettings')" @click="suppressSidebarFocusRestore(); emit('openSettings')">
                        <Settings class="icon" aria-hidden="true" />
                        <span>{{ $t('navigation.settings') }}</span>
                    </button>
                </div>

                <div data-testid="talos-sidebar-settings" class="sidebar-foot">
                    <button type="button" class="account-button" :aria-label="$t('navigation.account')" @click="suppressSidebarFocusRestore(); emit('openSettings')">
                        <TalosAccountAvatar size="sm" />
                        <span class="account-copy">
                            <span class="account-name">{{ account.state.display_name || $t('navigation.account') }}</span>
                            <small>{{ $t('shell.sidebarDescription') }}</small>
                        </span>
                        <span class="local-indicator" aria-hidden="true" />
                    </button>
                    <TalosMobileNotificationBell />
                    <TalosMobileDownloadCenterTrigger />
                </div>
            </aside>
        </component>
    </Teleport>

    <TalosMobileConfirmDialog
        v-if="renameTarget !== null"
        :title="$t('chat.renameChat')"
        :description="$t('chat.renameDescription')"
        @close="renameTarget = null"
    >
        <input
            ref="renameInput"
            v-model="renameValue"
            :aria-label="$t('chat.chatName')"
            class="min-h-touch w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
            @keydown.enter.prevent="submitRename"
        >
        <template #footer>
            <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> {{ $t('common.cancel') }}</Button>
            <Button type="button" data-testid="talos-session-rename-submit" :disabled="!renameValue.trim() || props.busy" @click="submitRename">
                <Check class="size-4" aria-hidden="true" /> {{ $t('common.save') }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>

    <TalosMobileDeleteChatDialog
        v-if="deleteTarget !== null"
        :title="deleteTarget ? sessionTitle(deleteTarget) : ''"
        :plan="deletePlan"
        :busy="props.busy"
        @close="deleteTarget = null"
        @confirm="confirmDelete"
    />
</template>

<style scoped>
/* Geometria del cassetto e stile della sidebar: `components.css` e
   `gesture-refinement.css` del mockup, sui nostri token — nessuna tinta nuova. */
.talos-drawer {
    position: fixed;
    inset: 0 auto 0 0;
    margin: 0;
    padding: 0;
    width: 22rem;
    max-width: calc(100vw - 36px);
    height: 100dvh;
    max-height: 100dvh;
    border: 0;
    border-right: 1px solid var(--talos-border);
    border-radius: 0;
    background: var(--talos-sidebar);
    color: var(--talos-text);
    z-index: var(--talos-z-global-navigation);
    touch-action: pan-y pinch-zoom;
    user-select: none;
    -webkit-user-select: none;
}
.talos-drawer::backdrop {
    background: rgba(0, 0, 0, 0.54);
    opacity: var(--talos-drawer-backdrop, 1);
    transition: none;
}
.sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: var(--talos-space-card);
    padding: max(var(--talos-space-page), env(safe-area-inset-top)) var(--talos-space-card) max(var(--talos-space-card), env(safe-area-inset-bottom));
    background: var(--talos-sidebar);
}
.brand {
    display: flex;
    align-items: center;
    gap: var(--talos-space-inline);
    min-height: var(--talos-touch-target);
}
/* Il marchio: 2rem in accento, come `.brand-mark` del mockup — ma e' il logo vero (`logo-short.svg`). */
.brand-mark.talos-short-logo {
    width: 2rem;
    height: 2rem;
    color: var(--talos-accent);
}
.brand-name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-base);
    letter-spacing: 0.2em;
}
.nav-search {
    display: flex;
    align-items: center;
    gap: var(--talos-space-control);
    width: 100%;
    min-height: var(--talos-touch-target);
    padding: var(--talos-space-inline) var(--talos-space-control);
    border: 1px solid var(--talos-border);
    border-radius: var(--talos-radius-control);
    background: var(--talos-panel-soft);
    color: var(--talos-muted);
    font-size: var(--text-xs);
    text-align: left;
}
/* U-5 — la forma FISSA del tablet: `aside#sidebar` del mockup sopra 860 px,
   `--mockup-sidebar-width: 14.5rem`, bordo a destra, nella colonna della vista
   divisa (niente `position: fixed`, niente z-index di navigazione globale). */
.talos-drawer.sidebar-fixed {
    position: relative;
    inset: auto;
    width: 14.5rem;
    max-width: 14.5rem;
    flex: none;
    height: 100%;
    max-height: none;
    z-index: auto;
    transform: none !important;
}
/* `will-change` solo mentre il dito comanda (vedi `inizioGesto`); durante la molla il transform inline basta. */
.talos-drawer[data-gesture-active] { will-change: transform; }
.sidebar-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--talos-border-strong) transparent;
    /* L'ultima riga visibile sfuma invece di tagliarsi a meta' sotto le voci
       fisse: sul Pad (11/09) si vedeva un pezzo d'icona e un puntino del menu. */
    mask-image: linear-gradient(to bottom, #000 calc(100% - 1.75rem), transparent);
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 1.75rem), transparent);
}
.nav { display: flex; flex-direction: column; gap: 0; }
.nav-row, .recent-row {
    display: flex;
    align-items: center;
    gap: var(--talos-space-control);
    width: 100%;
    min-height: var(--talos-touch-target);
    padding: var(--talos-space-inline) var(--talos-space-control);
    border-radius: var(--talos-radius-control);
    text-align: left;
    font-size: var(--text-xsm);
    color: var(--talos-text);
    position: relative;
}
.nav-row:hover, .recent-row:hover { background: var(--talos-active); }
/* La sezione in cui si e': come `.nav-row.active` del mockup. */
.nav-row[aria-current="page"] { background: var(--talos-active); color: var(--talos-text); }
.nav-row[aria-current="page"] .icon { color: var(--talos-accent); }
.nav-row .icon, .recent-row .icon, .nav-search .icon { width: var(--talos-icon-size); height: var(--talos-icon-size); flex: none; }
.nav-row .count {
    margin-left: auto;
    min-width: 1.125rem;
    min-height: 1.125rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--talos-accent);
    color: var(--talos-accent-text);
    font-size: var(--text-3xs);
    font-variant-numeric: tabular-nums;
}
.nav-section { margin-top: var(--talos-space-section); }
.nav-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 2rem;
    padding: 0 var(--talos-space-control);
    font-size: var(--text-2xs);
    color: var(--talos-muted);
    opacity: 0.85;
}
.nav-empty { padding: var(--talos-space-inline) var(--talos-space-control); font-size: var(--text-sm); color: var(--talos-muted); }
.nav-section ul { list-style: none; margin: 0; padding: 0; }
.recent-line { position: relative; display: flex; align-items: center; }
/* La riga resta pulita come nel mockup; il menu sta sopra, a destra, e la riga gli lascia il posto. */
/* Le recenti sono in `--talos-muted` e diventano testo pieno al tocco/hover: cosi' `.recent-row` del mockup. */
.recent-row { flex: 1; min-width: 0; padding-right: 3.25rem; font-size: var(--text-xs); gap: var(--talos-space-control); color: var(--talos-muted); }
.recent-row:hover, .recent-row[aria-current="page"] { color: var(--talos-text); }
.recent-menu { position: absolute; right: 0.25rem; top: 50%; transform: translateY(-50%); z-index: 1; }
.recent-row .icon { color: var(--talos-muted); }
.recent-row[aria-current="page"] { background: var(--talos-active); box-shadow: inset 0 0 0 1px var(--talos-accent-soft); }
.recent-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-fixed { border-top: 1px solid var(--talos-border); padding-top: var(--talos-space-inline); }
.sidebar-foot {
    display: flex;
    align-items: center;
    gap: var(--talos-space-inline);
    padding: var(--talos-space-inline);
    border-radius: var(--talos-radius-card);
    background: var(--talos-panel);
}
.account-button {
    display: flex;
    align-items: center;
    gap: var(--talos-space-control);
    flex: 1;
    min-width: 0;
    min-height: var(--talos-touch-target);
    border-radius: var(--talos-radius-control);
    text-align: left;
}
.account-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.account-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-sm); }
/* Una riga sola anche a 14,5 rem (tablet, U-5): il sottotitolo si tronca, non va a capo. */
.account-copy small { font-size: var(--text-3xs); color: var(--talos-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-indicator { width: 0.35rem; height: 0.35rem; border-radius: 50%; background: var(--talos-success); }
@media (max-width: 520px) {
    .talos-drawer { width: calc(100vw - 36px); max-width: 22rem; }
}
/* Telefono in orizzontale (11/09, 915x412 CSS px): le voci fisse in fondo
   mangiavano tutta l'altezza e della navigazione restava UNA riga, per giunta
   sfumata. Sotto i 520 px di altezza scorre la colonna intera, senza fondo fisso. */
@media (max-height: 520px) {
    .sidebar { overflow-y: auto; overscroll-behavior-y: contain; }
    .sidebar-scroll { flex: none; overflow: visible; mask-image: none; -webkit-mask-image: none; }
}
@media (prefers-reduced-motion: reduce) {
    .talos-drawer::backdrop { transition: none !important; }
}
</style>
