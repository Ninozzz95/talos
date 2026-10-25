<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import TalosMobileAssistantHeader from './TalosMobileAssistantHeader.vue'
import './talosCalmMessages.css'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import { stabilizeStreamingTalosMarkdown } from '@/lib/streamingMarkdown'
import { createTalosFrameScheduler } from '@/lib/streamingTailScheduler'
import { useTalosTypewriterReveal } from '@/composables/useTalosTypewriterReveal'
import { useTalosSmoothReveal } from '@/composables/useTalosSmoothReveal'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { TALOS_SORGENTE_STREAMING, talosSorgenteStreamingDellaChat } from '@/lib/chat/sorgenteStreaming'
import { creaScansione } from '@/lib/streaming/desktop/markdown-in-arrivo.js'
import { languageClass } from '@/lib/talosMessageMarkdown'
import { aperturaDelRecinto } from '@/lib/streaming/aperturaDelRecinto'
import { codaDaDipingere } from '@/lib/streaming/codaDaDipingere'
import { useTalosI18n } from '@/i18n'

/**
 * R1-5 — the in-flight assistant reply, isolated. This component alone
 * subscribes to `streamingText`, so a token burst re-renders THIS subtree only.
 *
 * Owner 2026-07-25: "il rendering del messaggio progressivo è troppo scattante…
 * ogni lettera stampata in modo fluido… stile typewriter con mini prompt alla
 * fine". Two halves:
 *  - PACING: characters are revealed on a frame clock, not at chunk-arrival
 *    pace (see lib/typewriterPacing.ts).
 *  - PAINTING: markdown re-parsing costs 4–16ms — impossible at 60fps — so the
 *    parsed prefix stays throttled while the freshly revealed TAIL is written
 *    straight into the DOM as small inline fragments, appended to the last
 *    rendered block so it flows inline instead of jumping to a new line.
 * The caret rides at the end of that tail, so it sits exactly where the next
 * letter will appear.
 */
const controller = useChatController()
const { t } = useTalosI18n()
/**
 * ⛔ K3-B2 (owner 15/10 «Stessi componenti della chat»): il giro che arriva viene dalla sorgente iniettata (il Codice su r4) o, di
 * serie, dalla chat, con la logica di sempre (`lib/chat/sorgenteStreaming.ts`).
 */
const sorgente = inject(TALOS_SORGENTE_STREAMING, null) ?? talosSorgenteStreamingDellaChat(controller)

/**
 * ⛔ Owner 20/10/2026 (righe perse dopo le approvazioni, Pad): quando questa risposta è la ripresa dopo «Consenti», la lista le
 * passa la bolla sospesa che continua e la sua catena — le ricevute dei permessi e la linea del tempo dei giri già salvati —: le
 * disegna lei, sopra quello che sta arrivando. Prima erano due bolle, e i giri delle sospese più vecchie non si vedevano.
 */
const props = defineProps<{
    ereditata?: { esiti: readonly { tool: string, concesso: boolean }[], sequenza: readonly unknown[] } | null
}>()
const TalosMobileEsitiPermesso = defineAsyncComponent(() => import('@/components/chat/TalosMobileEsitiPermesso.vue'))
const esitiEreditati = computed(() => props.ereditata?.esiti ?? [])
const sequenzaEreditata = computed(() => props.ereditata?.sequenza ?? [])
const haEreditata = computed(() => esitiEreditati.value.length > 0 || sequenzaEreditata.value.length > 0)

const streamingText = computed(() => sorgente.testo.value.slice(sorgente.confini.value.at(-1)?.testo ?? 0))
/**
 * ⭐⭐⭐ N13 (owner 02/10/2026, decisioni del 09/10): ragionamento, righe degli attrezzi e testo nell'ordine in cui sono successi.
 * I giri già chiusi (confini registrati dallo store a ogni giro di attrezzi) li disegna `TalosMobileAttivitaDelTurno`, caricato a
 * richiesta; qui restano solo la coda viva, cioè il ragionamento e il testo arrivati dopo l'ultimo giro, col loro ritmo di scrittura.
 * Prima la riga degli attrezzi in corso stava SOPRA il ragionamento, ed era un elenco sovrascritto a ogni giro: senza storia.
 */
const TalosMobileAttivitaDelTurno = defineAsyncComponent(() => import('@/components/chat/TalosMobileAttivitaDelTurno.vue'))
const confini = computed(() => sorgente.confini.value)
const attivi = computed(() => sorgente.attivi.value)
/**
 * ⛔ Owner 20/10/2026: gli attrezzi che il modello sta ancora scrivendo (`TalosMobileBozzeAttrezzi`). Una bozza vuol dire che il
 * giro prima è finito: la sua riga non è più «in corso» (era «Cerco come si fa…» per 52 s).
 */
const TalosMobileBozzeAttrezzi = defineAsyncComponent(() => import('@/components/chat/TalosMobileBozzeAttrezzi.vue'))
const bozze = computed(() => sorgente.bozze?.value ?? [])
/** Le righe dell'ultimo giro sono «in corso» finché dopo di loro non arriva niente. */
const codaVuota = computed(() => !/\S/.test(streamingText.value) && !haRagionamento.value && !bozze.value.length)
// Defect #5: reasoning streams on its own channel, so it can appear before the
// first letter of the answer — which is exactly when it is most useful.
const streamingReasoning = computed(() => sorgente.ragionamento.value.slice(sorgente.confini.value.at(-1)?.ragionamento ?? 0))
/**
 * Stesso motivo del blocco ragionamento: al `v-if` serve sapere se c'è
 * qualcosa, non ottenere una copia ripulita della traccia intera a ogni
 * aggiornamento.
 */
const haRagionamento = computed(() => /\S/.test(streamingReasoning.value))
/** Only while the in-flight reply belongs to the conversation on screen (the rule lives in the source: `sorgenteStreaming.ts`). */
const sending = sorgente.sending

/**
 * Owner 2026-07-26: a second way for the answer to arrive — "un'animazione più
 * smooth con un leggero fade in, pulitissima".
 *
 * Typewriter PACES the reveal on a frame clock, which is what makes it feel
 * mechanical to some eyes. Fade does not pace at all: the text appears at the
 * model's own speed and each new letter simply eases in. So the choice is not
 * cosmetic — it changes whether TALOS holds text back.
 */
const settings = useSettingsStore()

/**
 * ⭐⭐⭐ I CINQUANTA SECONDI IN CUI NON DICEVAMO NIENTE.
 *
 * Misurato sul Pad il 10/09 (ledger §44): il primo messaggio di una chat nuova
 * con `gemma-4-E2B-it-Q4_0` sulla GPU costa **76 secondi** alla prima parola, e
 * **50** sono i soli pesi che si spostano dal file alla scheda grafica. Per
 * tutti e 50 lo schermo mostrava questa animazione e nient'altro — e la riga
 * dei numeri, dopo, ne dichiarava 24,2: il suo orologio parte a modello gia'
 * aperto.
 *
 * ⛔ NON e' cosmetica. Un'attesa senza fine dichiarata e un'app bloccata si
 * vedono uguali, e chi aspetta non ha modo di sapere se conviene aspettare
 * ancora o chiudere tutto. La barra dice **quanto manca**, e il pulsante
 * restituisce la scelta.
 *
 * ⛔ Si INTERROGA il motore invece di ricevere eventi: il nativo tiene un
 * contatore atomico che il caricamento aggiorna a ogni tensore, e una callback
 * per tensore attraverserebbe il confine JNI 601 volte per un modello da 2,8
 * GiB. Il perche' per esteso e' in testa a `talos_llama_jni.cpp`.
 *
 * ⛔ La sonda parte **dopo mezzo secondo**, non subito: una risposta che arriva
 * in fretta non deve far lampeggiare una barra di caricamento per un istante.
 * E' la stessa soglia con cui gia' oggi si decide se mostrare un'attesa.
 *
 * ⛔ `null` NON riporta la barra a zero: vuol dire «non lo so» — o non sta
 * caricando, o il ponte non ha risposto. Un progresso che torna indietro
 * sembrerebbe un caricamento ricominciato da capo.
 */
const RITARDO_SONDA_MS = 500
const PASSO_SONDA_MS = 500
const caricoFrazione = ref<number | null>(null)
const annullamentoChiesto = ref(false)
let sondaTimer: ReturnType<typeof setInterval> | null = null
let sondaRitardo: ReturnType<typeof setTimeout> | null = null

function fermaSonda(): void {
    if (sondaTimer !== null) { clearInterval(sondaTimer); sondaTimer = null }
    if (sondaRitardo !== null) { clearTimeout(sondaRitardo); sondaRitardo = null }
}

/**
 * ⭐ Punto 2 (01/10/2026) — la GPU sta compilando i suoi programmi (prima apertura a cache vuota, ~16 s sul Pad in release, 41-69 s nella build debuggable).
 * Owner: «Sì» alla riga onesta, solo in quel caso.
 */
const gpuInPreparazione = ref(false)

async function guardaIlCarico(): Promise<void> {
    const { talosLocalModelLoadState } = await import('@/services/localEngine')
    const { fraction: frazione, preparingGpu } = await talosLocalModelLoadState()
    gpuInPreparazione.value = preparingGpu
    // ⛔ Solo un valore VERO sovrascrive: vedi il cappello sul `null`.
    if (frazione !== null) caricoFrazione.value = frazione
    else if (caricoFrazione.value !== null) caricoFrazione.value = null
}

watch(sending, (adesso) => {
    fermaSonda()
    if (!adesso) {
        caricoFrazione.value = null
        gpuInPreparazione.value = false
        annullamentoChiesto.value = false
        return
    }
    sondaRitardo = setTimeout(() => {
        void guardaIlCarico()
        sondaTimer = setInterval(() => { void guardaIlCarico() }, PASSO_SONDA_MS)
    }, RITARDO_SONDA_MS)
}, { immediate: true })

onBeforeUnmount(fermaSonda)

/** Da 0..1 a una percentuale intera. Mai 100 finche' non ha finito davvero. */
const caricoPercento = computed(() => (caricoFrazione.value === null
    ? null
    : Math.min(99, Math.floor(caricoFrazione.value * 100))))

/**
 * ⛔⛔ ANNULLA DEVE ANNULLARE — e fermare il caricamento non basta.
 *
 * Provato sul Pad il 2026-09-10 (ledger §47): premuto «Annulla» al 56,6%, il
 * motore ha davvero interrotto — `modello non caricato (annullato da chi usa
 * l'app)` — e trentacinque secondi dopo **il modello si e' riaperto da solo** e
 * il turno e' proseguito. Alla persona resta lo stesso cerchio che girava
 * prima, solo piu' a lungo: un pulsante che sembra non aver fatto niente.
 *
 * ⇒ Le due cose si fermano insieme: il caricamento nel motore, e il turno nella
 * chat — la stessa `stopStreaming` del quadratino nel campo di scrittura, che
 * quella catena la conosce gia' tutta.
 *
 * ⛔ L'ordine conta. Prima si ferma il turno, poi il caricamento: al contrario
 * ci sarebbe una finestra in cui il caricamento e' morto e il turno e' ancora
 * vivo, e la chat proverebbe a riaprire proprio in quell'istante.
 */
async function annullaIlCarico(): Promise<void> {
    annullamentoChiesto.value = true
    controller.chat.stopStreaming()
    const { talosCancelLocalModelLoad } = await import('@/services/localEngine')
    await talosCancelLocalModelLoad()
}
const fadeMode = computed(() => settings.state.shell.streaming_animation === 'fade')

/**
 * BOTH modes are paced now.
 *
 * Owner 2026-07-26: fade "non è smooth". The cause was this line: fade mode
 * rendered `streamingText` directly, at NETWORK cadence — and SSE chunks arrive
 * in lumps, so the fade had lumps to dissolve. The research found that every
 * credible implementation decouples the two cadences; the fade is the second
 * half of the effect, never the first.
 *
 * Typewriter keeps its own reveal (it is a different intent: a mechanical
 * clock). Fade gets the adaptive smoother, which follows the model's real speed
 * instead of imposing one.
 */
const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const { revealed: typed } = useTalosTypewriterReveal(streamingText, {
    enabled: () => !fadeMode.value,
})
const { revealed: smoothed } = useTalosSmoothReveal(streamingText, {
    // Reduced motion kills BOTH the fade and the pacing: text marching across
    // the screen is itself the animation, so removing only the fade is half a
    // fix.
    paced: () => !reducedMotion,
    settled: () => !sending.value,
    enabled: () => fadeMode.value,
})
const revealed = computed(() => (fadeMode.value ? smoothed.value : typed.value))

const PlainMessage = defineComponent({
    props: { content: { type: String, required: true } },
    setup(plainProps) {
        return () => h('p', { class: 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' }, plainProps.content)
    },
})
const TalosMobileMessageContent = defineAsyncComponent({
    loader: () => import('@/components/chat/TalosMobileMessageContent.vue'),
    delay: 0,
    loadingComponent: PlainMessage,
})

// The markdown prefix: throttled on purpose (measured 4–16ms per parse).
const parsedSource = ref('')
const parsedMarkdown = ref('')
let parseThrottle: ReturnType<typeof setTimeout> | null = null

function parseNow(text: string): void {
    parsedSource.value = text
    parsedMarkdown.value = stabilizeStreamingTalosMarkdown(text)
}

// ---- il recinto aperto cresce sul posto (#24) --------------------------------
/*
 * ⛔ #24, owner 23/10/2026 dal Pad: «il testo lagga un casino». Misurato su vc159 (Spark che scrive una pagina HTML): frame da 39 ms
 * continui. Causa: dentro un blocco di codice ogni riga finisce con un a capo, e un a capo nella coda faceva ripartire il parse
 * INTERO della risposta (`syncTail`), mentre il recinto si ricostruiva col `v-html` a ogni giro: costo che cresce col file (O(n²)).
 * Come il desktop (3cf97a30d, r4 1164aee98): la scansione dei confini stabili dei moduli copiati (`markdown-in-arrivo.js`) dice se
 * l'ultima riga completa sta in un recinto aperto; allora il testo prima del recinto si analizza UNA volta, e il recinto è un
 * elemento disegnato qui, con la stessa forma del renderer (`talosMessageMarkdown.ts` fence), il cui codice cresce con `appendData`.
 * Quando il recinto si chiude, si torna al parse di sempre: un solo cambio per blocco di codice, invisibile.
 */
const corpo = ref<HTMLElement | null>(null)
let scansione = creaScansione()
let recinto: { inizio: number, host: HTMLElement, testo: Text, mostrato: string } | null = null

function chiudiRecinto(): void {
    recinto?.host.remove()
    recinto = null
}

function disegnaRecinto(testo: string, inizio: number): void {
    const fineApertura = testo.indexOf(NEWLINE, inizio)
    const codice = fineApertura < 0 ? '' : testo.slice(fineApertura + 1)
    if (!recinto || recinto.inizio !== inizio) {
        chiudiRecinto()
        // la lingua come la legge il blocco finale (`languageClass` del renderer): stessa etichetta e stessa classe prima e dopo
        // la chiusura, mai «Python» che diventa «python» o «c#» che diventa «Code» (revisione del Desktop 23/10, voce 1a)
        const lingua = languageClass(testo.slice(inizio, fineApertura < 0 ? testo.length : fineApertura).trim().replace(/^```+/, ''))
        const host = document.createElement('div')
        host.className = 'talos-message-block'
        host.setAttribute('data-testid', 'talos-stream-fence')
        const blocco = document.createElement('div')
        blocco.className = 'talos-code-block'
        const testa = document.createElement('div')
        testa.className = 'talos-code-block-header'
        const etichetta = document.createElement('span')
        etichetta.textContent = lingua || t('messageMarkdown.code')
        // «Copia» c'è già mentre il codice arriva, nello stesso posto del blocco finale (se comparisse solo alla chiusura sarebbe
        // uno scatto), ma SPENTO e con «Incoming…»: niente si copia a metà in silenzio. Lo accende il blocco finale. Come il desktop
        // (revisione del Desktop 23/10, voce 1b; bozzetto dei blocchi di codice approvato dall'owner).
        const copia = document.createElement('button')
        copia.type = 'button'
        copia.disabled = true
        copia.setAttribute('data-talos-copy-code', '')
        copia.setAttribute('aria-label', t('messageMarkdown.copyCode'))
        copia.textContent = t('messageMarkdown.codeIncoming')
        // il ⋯ del bozzetto dei blocchi, spento come «Copia»: alla chiusura la testata non cambia forma
        const altro = document.createElement('button')
        altro.type = 'button'
        altro.disabled = true
        altro.setAttribute('data-talos-code-menu', '')
        altro.setAttribute('aria-haspopup', 'menu')
        altro.setAttribute('aria-label', t('messageMarkdown.codeMore'))
        altro.textContent = '⋯'
        testa.append(etichetta, copia, altro)
        const pre = document.createElement('pre')
        pre.tabIndex = 0
        const code = document.createElement('code')
        if (lingua) code.className = `language-${lingua}`
        const nodo = document.createTextNode('')
        // il cursore di scrittura, come nella coda a parole: FRATELLO dopo il nodo di testo, mai dentro, così `appendData` resta
        // la via veloce e il cursore resta l'ultimo (regressione della #24 vista sul Pad, vc161, 23/10)
        const cursore = document.createElement('span')
        cursore.className = 'talos-stream-caret live-cursor'
        cursore.setAttribute('data-testid', 'talos-stream-caret')
        cursore.setAttribute('aria-hidden', 'true')
        code.append(nodo, cursore)
        pre.append(code)
        blocco.append(testa, pre)
        host.append(blocco)
        recinto = { inizio, host, testo: nodo, mostrato: '' }
    }
    // Il recinto è l'ULTIMO blocco della radice del contenuto, con la forma del blocco finale (`.talos-message-block >
    // .talos-code-block`): stessi stili, stessi margini, stessa copia, e alla chiusura nessuno scatto. Vive fuori dai `v-html`
    // dei blocchi; finché il recinto è aperto il testo prima non cambia, quindi Vue non aggiunge blocchi dopo di lui.
    const radice = corpo.value?.querySelector<HTMLElement>('[data-testid="talos-mobile-message-content"]')
    if (radice && recinto.host.parentElement !== radice) radice.append(recinto.host)
    if (codice.startsWith(recinto.mostrato)) recinto.testo.appendData(codice.slice(recinto.mostrato.length))
    else recinto.testo.data = codice
    recinto.mostrato = codice
}

watch(revealed, (text) => {
    if (!text) {
        if (parseThrottle !== null) clearTimeout(parseThrottle)
        parseThrottle = null
        parsedSource.value = ''
        parsedMarkdown.value = ''
        scansione = creaScansione()
        chiudiRecinto()
        return
    }
    const apertura = aperturaDelRecinto(scansione, text)
    if (apertura >= 0) {
        // dentro un recinto aperto: il prima si analizza solo quando cambia, il codice cresce sul posto
        if (parseThrottle !== null) clearTimeout(parseThrottle)
        parseThrottle = null
        const prima = text.slice(0, apertura)
        if (parsedSource.value !== prima) parseNow(prima)
        void nextTick(() => disegnaRecinto(text, apertura))
        return
    }
    if (recinto) {
        // il recinto si è chiuso: il parse di sempre lo prende, e quello disegnato a mano se ne va
        chiudiRecinto()
        parseNow(text)
        return
    }
    if (!parsedMarkdown.value) parseNow(text)
    if (parseThrottle !== null) return
    parseThrottle = setTimeout(() => {
        parseThrottle = null
        parseNow(revealed.value)
    }, 110)
}, { immediate: true })

const NEWLINE = String.fromCharCode(10)
const TAB = String.fromCharCode(9)

// ---- the smooth tail -------------------------------------------------------
const contentHost = ref<HTMLElement | null>(null)
let tailHost: HTMLElement | null = null
let caretEl: HTMLElement | null = null
let paintedTail = ''
let cachedTailTarget: HTMLElement | null | undefined
const tailScheduler = createTalosFrameScheduler(
    (callback) => requestAnimationFrame(callback),
    (handle) => cancelAnimationFrame(handle),
)

// SF-MINOR: void and table-structural elements cannot hold the tail — letters
// appended into an <hr> or a <tr> are simply never painted.
const TAIL_REFUSED = new Set(['HR', 'BR', 'IMG', 'INPUT', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'COL', 'COLGROUP'])

/** Vero se dopo `el`, fra i suoi fratelli, c'è testo visibile (la coda esclusa). */
function testoDopo(el: Element): boolean {
    for (let n = el.nextSibling; n; n = n.nextSibling) {
        if (n !== tailHost && n.nodeType === Node.TEXT_NODE && /\S/.test(n.textContent ?? '')) return true
    }
    return false
}

/** The deepest last block, so the tail continues the current line. */
function tailTarget(): HTMLElement | null {
    if (cachedTailTarget !== undefined && cachedTailTarget?.isConnected) {
        return cachedTailTarget
    }
    // SF-CRITICAL: the markdown renderer is a lazy chunk. While it loads there
    // is no `.talos-message-content`, and falling back to the <article> put the
    // tail inside the sr-only aria-live region — orphaned there for the rest of
    // the reply, re-announcing the whole text on every frame.
    const root = contentHost.value?.querySelector<HTMLElement>('.talos-message-content')
    if (!root) {
        cachedTailTarget = null
        return null
    }
    let node: HTMLElement = root
    for (;;) {
        const children = [...node.children].filter((child) => child !== tailHost)
        const last = children.at(-1) as HTMLElement | undefined
        // ⛔ D-VIS-9 (23/10, prova «Marco»): `children` conta solo gli ELEMENTI. Se dopo l'ultimo (un <strong>, un <code>) c'è
        // ancora testo, la riga continua lì: scendere dentro l'elemento metteva le parole nuove in mezzo alla riga
        // («virgoletteontenuto: ven |, virgole e a capo sono c»). La coda resta in fondo al nodo corrente.
        if (!last || TAIL_REFUSED.has(last.tagName) || testoDopo(last)) {
            cachedTailTarget = node
            return node
        }
        // Inside a fence the tail belongs to the <code>, never after the <pre>.
        if (last.tagName === 'PRE') {
            cachedTailTarget = last.querySelector('code') ?? last
            return cachedTailTarget
        }
        node = last
    }
}

function ensureTail(): HTMLElement | null {
    const target = tailTarget()
    if (!target) return null
    if (!tailHost) {
        tailHost = document.createElement('span')
        tailHost.className = 'talos-stream-tail'
        tailHost.setAttribute('data-testid', 'talos-stream-tail')
    }
    // Fase 4, owner 12/09: cursore sottile anche in Fade. Il ritmo dei due
    // modi resta distinto; il cursore indica soltanto il punto di arrivo.
    // Il bersaglio è sempre esterno agli elementi strutturali rifiutati:
    // anche dopo una tabella il cursore segue la risposta senza diventare
    // contenuto di una cella.

    if (!caretEl) {
        caretEl = document.createElement('span')
        caretEl.className = 'talos-stream-caret live-cursor'
        caretEl.setAttribute('data-testid', 'talos-stream-caret')
        caretEl.setAttribute('aria-hidden', 'true')
    }
    if (tailHost.parentElement !== target) target.append(tailHost)
    if (caretEl && caretEl.parentElement !== tailHost) tailHost.append(caretEl)
    return tailHost
}

function appendChars(host: HTMLElement, text: string, structural = false): void {
    /**
     * Batch each delivered fragment at whitespace boundaries.
     *
     * Fade normally arrives on whole-word boundaries. Typewriter can deliver a
     * smaller frame slice, so claiming every node is a whole word would be
     * false; the throttled Markdown prefix absorbs these temporary tail nodes
     * every 110 ms and keeps the live DOM bounded.
     *
     * The trailing space goes INSIDE the span rather than beside it: a
     * whitespace-only span fragments copied text and makes a link's underline
     * appear before its words.
     */
    let word = ''
    const flush = (): void => {
        if (word === '') return
        const span = document.createElement('span')
        span.className = fadeMode.value || structural
            ? 'talos-stream-char talos-stream-char--fade'
            : 'talos-stream-char'
        span.textContent = word
        host.insertBefore(span, caretEl ?? null)
        word = ''
    }
    for (const char of text) {
        if (char === NEWLINE) {
            // A newline is block structure, not part of a word: it must be a
            // real text node or the line never breaks.
            flush()
            host.insertBefore(document.createTextNode(char), caretEl ?? null)
            continue
        }
        word += char
        if (char === ' ' || char === TAB) flush()
    }
    flush()
}

function syncTail(): void {
    if (!sending.value) return
    // dentro un recinto aperto il codice lo disegna `disegnaRecinto`: la coda a parole non serve, e il suo «a capo» non deve
    // far ripartire il parse intero (#24)
    if (recinto) {
        tailHost?.remove()
        paintedTail = ''
        return
    }
    const pending = revealed.value.slice(parsedSource.value.length)
    // ⛔ D-VIS-9b (23/10): la coda non si attacca alla parola prima (`codaDaDipingere`)
    const tail = codaDaDipingere(parsedSource.value, pending)
    // SF-MAJOR: everything after a newline is BLOCK syntax (`- `, `## `, `|`,
    // `---`). Painted as raw text into the previous block it shows the markers
    // and lands in the wrong container (inside the last <li>, the last <td>)
    // until the next parse moves it. Let the parse own it right away instead.
    if (pending.includes(NEWLINE)) {
        if (parseThrottle !== null) clearTimeout(parseThrottle)
        parseThrottle = null
        parseNow(revealed.value)
        return
    }
    const target = tailTarget()
    // #24 (23/10, STREAM-RECINTO-06): un recinto appena CHIUSO è ancora l'ultimo blocco analizzato, e `tailTarget` mette la coda
    // nel suo <code>: la frase dopo il codice compariva dentro il riquadro del codice fino al parse seguente. Se il testo analizzato
    // ha i recinti tutti chiusi (la stessa regola di `stabilizeStreamingTalosMarkdown`), la coda è testo nuovo: la prende il parse.
    // Limite noto e voluto (revisione del Desktop): conta le righe-recinto senza distinguere ``` da ~~~, quindi un ~~~ con dentro
    // un ``` torna solo al parse intero; a schermo nessun difetto, solo un parse in più.
    if (/\S/.test(tail) && target?.closest('pre') && (parsedSource.value.match(/^\s{0,3}(```|~~~)/gm)?.length ?? 0) % 2 === 0) {
        if (parseThrottle !== null) clearTimeout(parseThrottle)
        parseThrottle = null
        parseNow(revealed.value)
        return
    }
    // BUG (found finishing Pass 2, 2/9): `lastElementChild` also matches the
    // tailHost span itself once `ensureTail` has appended it to `target` — on
    // the FOLLOWING call this read the tail's own `<span>` instead of the real
    // last content element, so a table mid-row could read as non-structural
    // for one frame and grow a caret nothing ever removed (DEBT-MOBILE-003).
    // Skip the tailHost the same way `tailTarget()` already does.
    let lastTag = ''
    if (target) {
        for (let i = target.children.length - 1; i >= 0; i -= 1) {
            const child = target.children[i]
            if (child === tailHost) continue
            lastTag = child.tagName
            break
        }
    }
    // I frammenti strutturali mantengono il Fade; il parser resta la fonte
    // del layout. tailTarget tiene il cursore fuori da tabelle e celle.
    // Il cursore Calm è presente in entrambi i modi, mentre il loro ritmo
    // di rivelazione resta quello scelto nelle preferenze.
    const structural = TAIL_REFUSED.has(lastTag) || /^\s*\|/.test(tail)
    const host = ensureTail()
    if (!host) return
    if (tail === paintedTail) return
    if (!tail.startsWith(paintedTail)) {
        // The parse absorbed the tail (or the reply reset): start it over.
        while (host.firstChild && host.firstChild !== caretEl) host.firstChild.remove()
        paintedTail = ''
    }
    appendChars(host, tail.slice(paintedTail.length), structural)
    paintedTail = tail
}

watch(revealed, () => {
    tailScheduler.schedule(() => { void nextTick(syncTail) })
}, { immediate: true })
watch(parsedMarkdown, () => {
    // v-html replaces the subtree, but a tail injected OUTSIDE it (or into a
    // node the new render kept) would survive — remove it explicitly.
    tailHost?.remove()
    tailHost = null
    caretEl = null
    paintedTail = ''
    cachedTailTarget = undefined
    tailScheduler.schedule(() => { void nextTick(syncTail) })
})

onBeforeUnmount(() => {
    if (parseThrottle !== null) clearTimeout(parseThrottle)
    tailScheduler.cancel()
    chiudiRecinto()
    tailHost = null
    caretEl = null
    cachedTailTarget = undefined
})
</script>

<template>
    <article
        v-if="haEreditata || (sending && (revealed || haRagionamento || confini.length || attivi.length || bozze.length))"
        ref="contentHost"
        data-testid="talos-mobile-streaming"
        class="chat-message assistant-message w-full max-w-full text-[var(--talos-text)]"
    >
        <!-- The growing text stays OUTSIDE any live region: re-announcing
             the whole reply on every token is screen-reader noise. -->
        <!-- Owner 2026-07-26: in the Claude screenshot the tool line and the
             reasoning line are the SAME muted row. These used to be bordered
             chips, which sat next to a borderless reasoning row and looked like
             two different features. -->
        <TalosMobileAssistantHeader working />
        <TalosMobileEsitiPermesso v-if="esitiEreditati.length" :esiti="esitiEreditati" />
        <TalosMobileAttivitaDelTurno
            v-if="confini.length || attivi.length || sequenzaEreditata.length"
            :prima="sequenzaEreditata"
            :confini="confini"
            :testo="sorgente.testo.value"
            :ragionamento="sorgente.ragionamento.value"
            :attivi="attivi"
            :vivo="codaVuota"
        />
        <TalosMobileReasoningBlock v-if="streamingReasoning" :reasoning="streamingReasoning" live />
        <!-- Owner 2026-07-27: "si compenetra con le parole già renderizzate".
             The entrance animation is scoped HERE, to the streaming body, and
             deliberately not to the finished message. Both render the same
             component, so when a reply finalises the list creates fresh
             elements — and every block would animate in at once, over text that
             was already on screen. Fading while it arrives is the effect; fading
             again once it has arrived is the bug. -->
        <div ref="corpo" class="talos-streaming-body assistant-text">
            <TalosMobileMessageContent :content="parsedMarkdown" line-breaks />
        </div>
        <TalosMobileBozzeAttrezzi v-if="bozze.length" :bozze="bozze" />
        <span class="sr-only" role="status" aria-live="polite">{{ $t('chat.receivingResponse') }}</span>
    </article>
    <!-- Owner 2026-07-25: while waiting there is NO container — just the mark.
         It disappears the instant the first letter is painted. -->
    <div
        v-else-if="sending"
        data-testid="talos-mobile-typing"
        class="self-start px-1 py-1 text-[var(--talos-muted,var(--muted-foreground))]"
        role="status"
        aria-live="polite"
    >
        <!-- Owner 2026-09-13, dal Pad: «rimuovere il segnavia con i tre pallini
             animato e lasciare solo orb con ring a scorrimento». Il segno
             dell'attesa e' UNO — l'orb del marchio con l'anello che gira
             (.talos-orb.working::after) — e sparisce alla prima lettera. -->
        <TalosMobileAssistantHeader working />
        <span class="sr-only">{{ $t('chat.processing') }}</span>
        <!--
            ⛔ Compare SOLO quando il motore sta davvero caricando: fuori da
            quel caso `caricoPercento` resta `null` e qui non c'e' niente. Non
            e' una barra che si accende a ogni attesa.

            ⛔ Una sola azione, quindi un solo pulsante: la regola dell'owner
            («mai piu' di due azioni affiancate») non chiede un menu qui, chiede
            di non affiancarne tre.
        -->
        <!-- ⭐ Punto 2 (01/10/2026): la GPU compila i suoi programmi, una volta per llama.cpp e sistema. -->
        <p
            v-if="gpuInPreparazione"
            data-testid="talos-local-gpu-preparing"
            class="mt-1.5 font-mono text-2xs text-[var(--talos-muted)]"
        >{{ $t('chat.localPreparingGpu') }}</p>
        <div
            v-if="caricoPercento !== null"
            data-testid="talos-local-load-progress"
            class="mt-1.5 flex items-center gap-2.5"
        >
            <!--
                ⛔ ZERO NON SI SCRIVE. Misurato sul Pad (ledger §46): con i pesi
                mappati dal file, `size_done/size_data` resta a **0 per dodici
                secondi** e poi risale di colpo — 0 → 70 → 566 → 951 su
                millesimi. Un «0%» fermo per dodici secondi si legge come
                «bloccato», che e' esattamente la cosa che questa riga esiste
                per smentire. ⇒ finche' non si muove si dice cosa sta
                succedendo, senza numero; il numero compare quando ha qualcosa
                da dire.
            -->
            <span class="font-mono text-2xs text-[var(--talos-muted)]">
                {{ caricoPercento === 0
                    ? $t('chat.localLoadingModelStarting')
                    : $t('chat.localLoadingModel', { percent: caricoPercento }) }}
            </span>
            <button
                v-if="!annullamentoChiesto"
                type="button"
                data-testid="talos-local-load-cancel"
                class="talos-pressable rounded-lg px-1.5 py-0.5 text-2xs text-[var(--talos-muted)] underline underline-offset-2"
                @click="annullaIlCarico"
            >{{ $t('chat.localLoadingCancel') }}</button>
            <span
                v-else
                class="text-2xs text-[var(--talos-muted)]"
            >{{ $t('chat.localLoadingCancelling') }}</span>
        </div>
    </div>
</template>
