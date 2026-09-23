<script setup lang="ts">
/**
 * Il foglio «+» del compositore, sul pannello «Cosa vuoi fare?» del mockup
 * «Talos Calm Finale» (`quick()`, r. 2942): una ricerca, quattro categorie
 * (Allega · Crea · Strumenti · Agente) e le voci della categoria scelta.
 *
 * Owner 12/09 19:22, dal Pad: «il drawer + non e' quello del mockup, perche'?».
 * Era il foglio precedente (una griglia di sei riquadri): la forma del mockup
 * era stata rimandata. Ora e' questa — con SOLE funzioni vere: le voci demo del
 * mockup (crea immagine/audio/video, skill) non ci sono, perche' non c'e' un
 * generatore dietro e una voce che promette e non mantiene e' una bugia.
 *
 * ⛔ Niente sparisce rispetto al foglio precedente: allega, foto, fotocamera,
 * Libreria, Laboratorio modelli e Migliora prompt restano (stessi
 * `data-testid`), ognuno nella sua categoria. «Naviga sul web» NON c'e' qui,
 * per decisione dell'owner (6/9 e 12/09): resta il comando slash.
 *
 * Le categorie seguono il pattern Tabs dell'APG WAI-ARIA
 * (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/, letto il 2026-09-12):
 * `role=tablist` con orientamento orizzontale, `aria-selected` sulla scheda
 * attiva, `aria-controls` verso il pannello, `tabindex` rotante e frecce
 * sinistra/destra che spostano il fuoco e attivano la scheda.
 */
import { computed, nextTick, ref, watch } from 'vue'
import {
    BookMarked, Camera as CameraIcon, CheckSquare, Code2, Database, FileText, FlaskConical, Images,
    Paperclip, Presentation, Search, Smartphone, Sparkles, Wrench, Zap,
} from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { talosCurva, talosDurataMs, talosMotionConsentito } from '@/composables/useTalosCalmMotion'
import { useTalosSlidingIndicator } from '@/composables/useTalosSlidingIndicator'
import { useTalosI18n } from '@/i18n'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'

type Categoria = 'attach' | 'create' | 'tools' | 'agent'
export type TalosComposerPreset = 'slides' | 'document' | 'analyze'

const props = defineProps<{
    canEnhance: boolean
    enhanceReason?: string | null
    thinking: boolean
    supportsThinking: boolean
    effortLevels: readonly string[]
    selectedEffort: string
    attachmentsAvailable: boolean
    contextAvailable: boolean
    attachmentDisabledReason?: string
    contextDisabledReason?: string
    enhancing?: boolean
    /** Gli attrezzi del modello per questa chat (owner 15:45): qui, sotto «Agente». */
    agentToolsEnabled?: boolean
    /** Codice c'e' solo dove il ponte nativo esiste (build di sviluppo). */
    harnessAvailable?: boolean
}>()
const emit = defineEmits<{
    close: []
    attach: []
    takePhoto: []
    pickPhotos: []
    openContext: []
    openModelLab: []
    selectThinking: [enabled: boolean]
    selectEffort: [level: TalosMobileEffortLevel]
    enhancePrompt: []
    /** Le voci «Crea …» precompilano il compositore (owner 15:45): la schermata decide il testo. */
    preset: [id: TalosComposerPreset]
    /** Le voci che aprono un'altra stazione: la schermata naviga. */
    navigate: [route: TalosMobileRouteName]
    setAgentToolsEnabled: [enabled: boolean]
}>()
const { t } = useTalosI18n()

interface Voce {
    readonly id: string
    readonly categoria: Categoria
    readonly testId: string
    readonly icon: unknown
    readonly title: string
    /** Il nome per chi ascolta lo schermo, quando il titolo visibile non basta. */
    readonly label?: string
    readonly subtitle: string
    readonly disabled?: boolean
    readonly reason?: string
    readonly run: () => void
    /** Una voce a due stati (interruttore) invece di un'azione che chiude il foglio. */
    readonly checked?: boolean
}

const ORDINE: readonly Categoria[] = ['attach', 'create', 'tools', 'agent']
const categoria = ref<Categoria>('attach')
const ricerca = ref('')
const schede = ref<HTMLButtonElement[]>([])
const gruppoSchede = ref<HTMLElement | null>(null)
const pannello = ref<HTMLElement | null>(null)

/**
 * U-14, owner 12/09 («il mockup aveva lo slide nel drawer +»). Due movimenti,
 * entrambi dal mockup:
 * 1. il riquadro acceso SCIVOLA da una categoria all'altra (`animateIndicators`
 *    sulle `.action-categories`, pillola, 300 ms) — lo stesso filo delle
 *    stazioni, `useTalosSlidingIndicator`;
 * 2. le voci della categoria nuova ENTRANO da destra: opacità .25→1 e
 *    translateX 8px→0 in 180 ms (r. 3577). Durata dal motore
 *    (`--talos-motion-calm-panel`), curva di `tab-change`, niente se la persona
 *    ha chiesto meno movimento.
 */
useTalosSlidingIndicator(gruppoSchede, categoria)
const PANNELLO_TOKEN = '--talos-motion-calm-panel'
const PANNELLO_SERIE_MS = 180
let entrata: Animation | null = null
/** ±18 px quando il cambio arriva dal dito, null quando arriva da tastiera. */
let entrataDalGesto: number | null = null
watch(categoria, async () => {
    // Il mockup non lascia RESTRINGERE il foglio al cambio di categoria (r. 3579):
    // il pannello tiene l'altezza più grande vista, così le schede non saltano.
    const prima = pannello.value?.offsetHeight ?? 0
    await nextTick()
    const el = pannello.value
    if (!el) return
    const tenuta = Number.parseFloat(el.style.minHeight || '0') || 0
    if (prima > tenuta) el.style.minHeight = `${prima}px`
    if (typeof el.animate !== 'function' || !talosMotionConsentito(el, PANNELLO_TOKEN)) return
    if (entrata && entrata.playState !== 'finished') entrata.cancel()
    const daGesto = entrataDalGesto
    entrataDalGesto = null
    entrata = el.animate(
        daGesto === null
            ? [{ opacity: 0.25, transform: 'translateX(8px)' }, { opacity: 1, transform: 'translateX(0)' }]
            : [{ opacity: 0.4, transform: `translateX(${daGesto}px)` }, { opacity: 1, transform: 'translateX(0)' }],
        {
            duration: daGesto === null ? talosDurataMs(el, PANNELLO_TOKEN, PANNELLO_SERIE_MS) : SCHEDA_ENTRATA_MS,
            easing: talosCurva(el, '--talos-motion-ease-tab-change'), fill: 'none',
        },
    )
    entrata.finished.then(() => { entrata = null }, () => { entrata = null })
})

const categorie = computed<Array<{ id: Categoria, icon: unknown, title: string, subtitle: string }>>(() => [
    { id: 'attach', icon: Paperclip, title: t('chat.drawerAttach'), subtitle: t('chat.drawerAttachHint') },
    { id: 'create', icon: FileText, title: t('chat.drawerCreate'), subtitle: t('chat.drawerCreateHint') },
    { id: 'tools', icon: Wrench, title: t('chat.drawerTools'), subtitle: t('chat.drawerToolsHint') },
    { id: 'agent', icon: Zap, title: t('chat.drawerAgent'), subtitle: t('chat.drawerAgentHint') },
])

/** Frecce sinistra/destra: fuoco E attivazione, come nell'APG (scheda attivata al fuoco). */
/**
 * Una sola strada per cambiare scheda, usata dalla tastiera E dal dito.
 * ⛔ Se il gesto ne avesse una sua, le due potrebbero divergere in silenzio: il
 * giro circolare, il fuoco sulla scheda e la scheda attivata al fuoco (APG)
 * resterebbero in una sola delle due. Qui la funzione è una.
 */
function vaiAllaScheda(passo: number): void {
    const indice = (ORDINE.indexOf(categoria.value) + passo + ORDINE.length) % ORDINE.length
    categoria.value = ORDINE[indice]!
    schede.value[indice]?.focus()
}

function onTabKeydown(event: KeyboardEvent): void {
    const passo = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!passo) return
    event.preventDefault()
    vaiAllaScheda(passo)
}

/**
 * ⛔ Owner 2026-09-13, dal Pad: «non c'è lo slide nel drawer. Nel mockup se io
 * facevo slide a destra e sinistra, le schede Strumenti, Crea eccetera
 * cambiavano dinamicamente».
 *
 * Il gesto conta solo se è ORIZZONTALE per davvero: si esige che lo spostamento
 * laterale superi la soglia E sia maggiore di quello verticale. Senza questa
 * seconda condizione uno scorrimento in giù con un filo di deriva cambierebbe
 * scheda mentre la persona sta solo leggendo l'elenco — e il foglio sotto ha il
 * proprio trascinamento verticale, quindi i due gesti devono restare distinti.
 *
 * Trascinare a SINISTRA porta alla scheda successiva, come sfogliare.
 */
/**
 * ⛔ Visto sul Pad il 13/09 con un tocco reale, e NON dai test: lo swipe
 * orizzontale partiva sopra l'elenco delle voci, e al rilascio la voce sotto il
 * dito riceveva il CLIC — eseguiva un'azione e chiudeva il foglio. Cioè il
 * gesto nuovo rompeva quello vecchio.
 *
 * ⛔ La guardia che avevo scritto non poteva vederlo: montava il pannello e
 * mandava i due eventi del puntatore, ma non c'era nessun bottone sotto il dito
 * a raccogliere il clic. Una prova più debole della realtà — la famiglia di
 * difetti di oggi, vista un'altra volta.
 *
 * ⇒ Quando il dito ha percorso più della soglia, il clic che segue viene
 * soffocato in fase di cattura, prima che arrivi alla voce. Il flag si spegne
 * subito dopo: soffoca UN clic, quello del gesto, non i tocchi successivi.
 */
const scorrimentoAppenaFatto = ref(false)

function soffocaIlClicDelloScorrimento(e: MouseEvent): void {
    if (!scorrimentoAppenaFatto.value) return
    scorrimentoAppenaFatto.value = false
    e.preventDefault()
    e.stopPropagation()
}

/**
 * ⛔ I NUMERI SONO DEL MOCKUP, NON MIEI. Owner 13/09: «lo scroll orizzontale
 * c'era nel mockup, non devi inventare nulla, fai riferimento ad esso».
 * Letto alla fonte (`Talos_Calm_Finale_Interattivo.html`, ramo `quick-swipe`):
 *
 *   const ids = ['attach','create','tools','agent'], at = ids.indexOf(startTab)
 *   const next = at + (dx < 0 ? 1 : -1)
 *   if ((|dx| > 52 || (|dx| > 24 && |vx| > .5)) && next >= 0 && next < ids.length)
 *
 * Tre cose che avevo sbagliato inventando:
 *  1. la soglia: 52 px, oppure 24 px se il dito va veloce (oltre 0,5 px/ms);
 *  2. NESSUN giro circolare — il mockup si ferma ai bordi; io ruotavo;
 *  3. al cambio il PANNELLO si anima (230 ms, translateX ±18px, opacità da .4):
 *     è quello che rende il gesto visibile. Senza, la scheda cambiava in
 *     silenzio e sembrava che non fosse successo niente.
 */

// Numeri del mockup, presi uno per uno (vedi il commento del gesto).
const SCHEDA_SEGUE = 0.42
const SCHEDA_SEGUE_AL_BORDO = 0.12
const SCHEDA_OPACITA_CORSA = 400
const SCHEDA_OPACITA_MINIMA = 0.6
const SCHEDA_RITORNO_MS = 250
const SCHEDA_ENTRATA_MS = 230
const SCHEDA_ENTRATA_PX = 18
const SCHEDA_SOGLIA_PX = 52
const SCHEDA_SOGLIA_VELOCE_PX = 24
const SCHEDA_VELOCITA = 0.5
let presaScheda: { x: number; y: number; t: number; id: number } | null = null
/** Quanto il pannello e' spostato adesso. Lo so perche' l'ho applicato io: non
 *  si richiede al browser (DOMMatrixReadOnly non esiste ovunque, e una prova
 *  che cade sull'ambiente non dice niente sul prodotto). */
let scostamentoScheda = 0

function iniziaScorrimentoSchede(e: PointerEvent): void {
    if (e.button !== 0) return
    presaScheda = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }
    /*
     * ⛔ Misurato sul Pad con una sonda: il pointerdown arriva, il pointerup
     * finisce ALTROVE — nella WebView la cattura del puntatore non tiene. Invece
     * di inseguire il bersaglio si ascolta dove il rilascio arriva sempre: il
     * documento. Gli ascoltatori vivono quanto il gesto e si tolgono da soli.
     */
    // ⛔ Niente { once: true }: si consumerebbe al primo pointerup che passa dal
    //    documento, anche di un altro gesto. Si tolgono a mano, alla fine.
    staccaAscolti()
    document.addEventListener('pointermove', segueIlDito)
    document.addEventListener('pointerup', finisceScorrimentoSchede)
    document.addEventListener('pointercancel', annullaScorrimentoSchede)
}

/**
 * Il pannello segue il dito, come nel mockup: si sposta di una FRAZIONE dello
 * spostamento — 0,42 — cosi' il movimento si vede senza che la scheda esca di
 * scena prima di essere stata scelta. All'ultima scheda la frazione scende a
 * 0,12: si muove quel tanto che dice «di qua non si va oltre».
 */
function segueIlDito(e: PointerEvent): void {
    if (!presaScheda) return
    const el = pannello.value
    if (!el) return
    const dx = e.clientX - presaScheda.x
    const dy = e.clientY - presaScheda.y
    // Finche' il gesto e' piu' verticale che orizzontale non e' il nostro: il
    // foglio sotto deve poter scorrere senza che il pannello si sposti.
    if (Math.abs(dx) <= Math.abs(dy)) return
    const indice = ORDINE.indexOf(categoria.value)
    const alBordo = (indice === 0 && dx > 0) || (indice === ORDINE.length - 1 && dx < 0)
    const x = dx * (alBordo ? SCHEDA_SEGUE_AL_BORDO : SCHEDA_SEGUE)
    scostamentoScheda = x
    el.style.transform = `translateX(${x}px)`
    el.style.opacity = String(Math.min(1, Math.max(SCHEDA_OPACITA_MINIMA, 1 - Math.abs(x) / SCHEDA_OPACITA_CORSA)))
}

/** Il pannello torna dov'era, a molla, senza cambiare scheda (mockup: 250 ms). */
function riportaIlPannello(): void {
    const el = pannello.value
    if (!el) return
    const da = scostamentoScheda
    scostamentoScheda = 0
    el.style.transform = ''
    el.style.opacity = ''
    if (!da || typeof el.animate !== 'function' || !talosMotionConsentito(el, PANNELLO_TOKEN)) return
    el.animate([{ transform: `translateX(${da}px)` }, { transform: 'translateX(0)' }],
        { duration: SCHEDA_RITORNO_MS, easing: talosCurva(el, '--talos-motion-ease-tab-change'), fill: 'none' })
}

/** Gli ascoltatori del gesto in corso, tolti in un punto solo. */
function staccaAscolti(): void {
    document.removeEventListener('pointermove', segueIlDito)
    document.removeEventListener('pointerup', finisceScorrimentoSchede)
    document.removeEventListener('pointercancel', annullaScorrimentoSchede)
}

/** Il browser si e' preso il gesto: si dimentica la presa, senza cambiare scheda. */
function annullaScorrimentoSchede(): void {
    presaScheda = null
    staccaAscolti()
    riportaIlPannello()
}

function finisceScorrimentoSchede(e: PointerEvent): void {
    staccaAscolti()
    // ⛔ L'identificatore si confronta solo se c'e' da entrambe le parti: un
    //    evento sintetico non lo porta, e pretenderlo escluderebbe il gesto vero.
    if (!presaScheda) return
    if (e.pointerId !== undefined && presaScheda.id !== undefined && e.pointerId !== presaScheda.id) return
    const dx = e.clientX - presaScheda.x
    const dy = e.clientY - presaScheda.y
    const durata = Math.max(1, e.timeStamp - presaScheda.t)
    const vx = Math.abs(dx) / durata
    presaScheda = null
    if (Math.abs(dx) <= Math.abs(dy)) { riportaIlPannello(); return }
    const abbastanza = Math.abs(dx) > SCHEDA_SOGLIA_PX
        || (Math.abs(dx) > SCHEDA_SOGLIA_VELOCE_PX && vx > SCHEDA_VELOCITA)
    if (!abbastanza) { riportaIlPannello(); return }
    const passo = dx < 0 ? 1 : -1
    const prossima = ORDINE.indexOf(categoria.value) + passo
    // ⛔ Il mockup si ferma ai bordi: niente giro circolare.
    if (prossima < 0 || prossima >= ORDINE.length) { riportaIlPannello(); return }
    // La scheda cambia: il pannello lascia la posizione del dito e rientra con
    // l'animazione del mockup (0,4 -> 1, ±18 px, 230 ms), curata dal watch.
    pannello.value?.style.removeProperty('transform')
    pannello.value?.style.removeProperty('opacity')
    entrataDalGesto = dx < 0 ? SCHEDA_ENTRATA_PX : -SCHEDA_ENTRATA_PX
    scostamentoScheda = 0
    scorrimentoAppenaFatto.value = true
    categoria.value = ORDINE[prossima]!
    // Il pannello lo anima il watch(categoria) che c'e' gia': guarda il VALORE,
    // quindi vale per tastiera, tocco e gesto senza doverlo richiamare qui.
    schede.value[prossima]?.focus()
}


function chiudi(action: () => void): () => void {
    return () => { action(); emit('close') }
}

const voci = computed<Voce[]>(() => {
    const elenco: Voce[] = [
        { id: 'attach', categoria: 'attach', testId: 'talos-drawer-attach', icon: Paperclip, title: t('chat.attachFile'), subtitle: t('chat.drawerAttachFileHint'), disabled: !props.attachmentsAvailable, reason: props.attachmentDisabledReason, run: chiudi(() => emit('attach')) },
        { id: 'pick-photos', categoria: 'attach', testId: 'talos-drawer-pick-photos', icon: Images, title: t('chat.drawerPickImage'), subtitle: t('chat.drawerPickImageHint'), disabled: !props.attachmentsAvailable, reason: props.attachmentDisabledReason, run: chiudi(() => emit('pickPhotos')) },
        { id: 'take-photo', categoria: 'attach', testId: 'talos-drawer-take-photo', icon: CameraIcon, title: t('chat.takePhoto'), subtitle: t('chat.drawerTakePhotoHint'), disabled: !props.attachmentsAvailable, reason: props.attachmentDisabledReason, run: chiudi(() => emit('takePhoto')) },
        { id: 'context', categoria: 'attach', testId: 'talos-drawer-context', icon: Database, title: t('chat.drawerFromLibrary'), label: t('chat.chooseGroundingContext'), subtitle: t('chat.drawerFromLibraryHint'), disabled: !props.contextAvailable, reason: props.contextDisabledReason, run: chiudi(() => emit('openContext')) },
        { id: 'enhance', categoria: 'create', testId: 'talos-drawer-enhance', icon: Sparkles, title: t('chat.improvePrompt'), subtitle: props.canEnhance ? t('chat.drawerEnhanceHint') : (props.enhanceReason ?? t('chat.drawerEnhanceHint')), disabled: props.enhancing === true, reason: props.enhanceReason ?? undefined, run: chiudi(() => emit('enhancePrompt')) },
        { id: 'slides', categoria: 'create', testId: 'talos-drawer-preset-slides', icon: Presentation, title: t('chat.drawerPresetSlides'), subtitle: t('chat.drawerPresetHint'), run: chiudi(() => emit('preset', 'slides')) },
        { id: 'document', categoria: 'create', testId: 'talos-drawer-preset-document', icon: FileText, title: t('chat.promptDocument'), subtitle: t('chat.drawerPresetHint'), run: chiudi(() => emit('preset', 'document')) },
        { id: 'analyze', categoria: 'create', testId: 'talos-drawer-preset-analyze', icon: Search, title: t('chat.promptAnalyze'), subtitle: t('chat.drawerAnalyzeHint'), run: chiudi(() => emit('preset', 'analyze')) },
        { id: 'note-new', categoria: 'tools', testId: 'talos-drawer-note-new', icon: FileText, title: t('notes.add'), subtitle: t('chat.drawerNoteHint'), run: chiudi(() => emit('navigate', 'note-new')) },
        { id: 'memory-new', categoria: 'tools', testId: 'talos-drawer-memory-new', icon: BookMarked, title: t('memory.newMemory'), subtitle: t('chat.drawerMemoryHint'), run: chiudi(() => emit('navigate', 'memory-new')) },
        { id: 'privilege', categoria: 'tools', testId: 'talos-drawer-privilege', icon: Smartphone, title: t('chat.drawerPhoneControl'), subtitle: t('chat.drawerPhoneControlHint'), run: chiudi(() => emit('navigate', 'settings-privilege')) },
        { id: 'toolforge', categoria: 'tools', testId: 'talos-drawer-toolforge', icon: Wrench, title: t('navigation.toolForge'), subtitle: t('chat.drawerToolForgeHint'), run: chiudi(() => emit('navigate', 'toolforge')) },
        { id: 'model-lab', categoria: 'tools', testId: 'talos-drawer-model-lab', icon: FlaskConical, title: t('navigation.models'), subtitle: t('chat.drawerModelLabHint'), run: chiudi(() => emit('openModelLab')) },
        { id: 'agent-tools', categoria: 'agent', testId: 'talos-drawer-agent-tools', icon: Zap, title: t('chat.drawerAgentTools'), subtitle: props.agentToolsEnabled === false ? t('chat.agentToolsOff') : t('chat.agentToolsOn'), checked: props.agentToolsEnabled !== false, run: () => emit('setAgentToolsEnabled', props.agentToolsEnabled === false) },
        { id: 'task-new', categoria: 'agent', testId: 'talos-drawer-task-new', icon: CheckSquare, title: t('chat.drawerPlanTask'), subtitle: t('chat.drawerPlanTaskHint'), run: chiudi(() => emit('navigate', 'task-new')) },
        { id: 'research-new', categoria: 'agent', testId: 'talos-drawer-research-new', icon: Search, title: t('navigation.research'), subtitle: t('chat.drawerResearchHint'), run: chiudi(() => emit('navigate', 'research-new')) },
    ]
    if (props.harnessAvailable) {
        elenco.push({ id: 'harness', categoria: 'agent', testId: 'talos-drawer-harness', icon: Code2, title: t('chat.drawerCode'), subtitle: t('chat.drawerCodeHint'), run: chiudi(() => emit('navigate', 'harness')) })
    }
    return elenco
})

/** Con una ricerca si guardano TUTTE le categorie; senza, quella scelta. */
const vociVisibili = computed(() => {
    const q = ricerca.value.trim().toLowerCase()
    if (q) return voci.value.filter(v => `${v.title} ${v.subtitle}`.toLowerCase().includes(q))
    return voci.value.filter(v => v.categoria === categoria.value)
})
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.drawerTitle')" testid="talos-composer-drawer" @close="emit('close')">
        <label class="talos-action-search">
            <Search class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
            <input
                v-model="ricerca"
                type="search"
                data-testid="talos-drawer-search"
                :placeholder="$t('chat.drawerSearch')"
                :aria-label="$t('chat.drawerSearch')"
                class="min-w-0 flex-1 bg-transparent text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)]"
            >
        </label>
        <div
            v-if="!ricerca.trim()"
            ref="gruppoSchede"
            class="talos-action-categories"
            @pointerdown="iniziaScorrimentoSchede"
            @click.capture="soffocaIlClicDelloScorrimento"
            role="tablist"
            aria-orientation="horizontal"
            :aria-label="$t('chat.drawerCategories')"
        >
            <button
                v-for="c in categorie"
                :key="c.id"
                ref="schede"
                type="button"
                role="tab"
                :id="`talos-drawer-tab-${c.id}`"
                aria-controls="talos-drawer-options"
                :data-testid="`talos-drawer-tab-${c.id}`"
                :aria-selected="categoria === c.id"
                :tabindex="categoria === c.id ? 0 : -1"
                class="talos-pressable talos-action-category"
                @click="categoria = c.id"
                @keydown="onTabKeydown"
            >
                <span v-if="categoria === c.id" data-talos-indicator class="talos-action-category-indicator" aria-hidden="true" />
                <component :is="c.icon" class="size-5 shrink-0" aria-hidden="true" />
                <span class="min-w-0">
                    <strong>{{ c.title }}</strong>
                    <small>{{ c.subtitle }}</small>
                </span>
            </button>
        </div>
        <div
            id="talos-drawer-options"
            ref="pannello"
            class="talos-action-options"
            data-testid-gesture="talos-drawer-swipe"
            @pointerdown="iniziaScorrimentoSchede"
            @click.capture="soffocaIlClicDelloScorrimento"
            role="tabpanel"
            :aria-labelledby="ricerca.trim() ? undefined : `talos-drawer-tab-${categoria}`"
            data-testid="talos-drawer-options"
        >
            <button
                v-for="v in vociVisibili"
                :key="v.id"
                type="button"
                :data-testid="v.testId"
                :aria-label="v.label ?? v.title"
                :role="v.checked === undefined ? undefined : 'switch'"
                :aria-checked="v.checked === undefined ? undefined : v.checked"
                :disabled="v.disabled === true"
                :title="v.disabled && v.reason ? v.reason : undefined"
                class="talos-pressable talos-action-row talos-drawer-row min-h-13 w-full"
                @click="v.run()"
            >
                <component :is="v.icon" class="talos-drawer-row-icon size-5 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1">
                    <strong>{{ v.title }}</strong>
                    <small>{{ v.disabled && v.reason ? v.reason : v.subtitle }}</small>
                </span>
                <span v-if="v.checked !== undefined" class="talos-action-switch" :data-on="v.checked" aria-hidden="true"><span /></span>
            </button>
            <p v-if="!vociVisibili.length" class="px-2 py-4 text-sm text-[var(--talos-muted)]">{{ $t('chat.drawerNoResults') }}</p>
        </div>
    </TalosMobileComposerSheet>
</template>

<style scoped>
/*
 * Fase 7 — owner 13/09: nel foglio «+» icone NUDE in ambra e UNA sola verticale sinistra.
 * Misurato sul Pad il 14/09 (px dal bordo del foglio): schede con icona a 29 e testo a 58; righe
 * con icona a 39 e testo a 81, per la piastrella da 2,5rem e lo spazio 0,875rem. Le righe prendono
 * le misure delle schede: icona nuda, rientro 0,7rem, spazio 0,6rem.
 * Voci sulla stessa verticale, dal centro delle icone al bordo del testo: Material Lists
 * (https://m3.material.io/components/lists/guidelines) e keyline alignment
 * (https://uxcel.com/lessons/lists-best-practices-814), letti il 2026-09-14.
 * ⛔ `talos-action-row-icon` resta com'è in style.css: la usa ancora la ricerca globale.
 */
.talos-drawer-row { gap: 0.6rem; padding-left: 0.7rem; }
.talos-drawer-row-icon { color: var(--talos-accent); }
</style>
