// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⭐⭐⭐ 26/8 — riconciliazione desktop→mobile (DEC-053). Prova la pipeline di
 * CONSUMO eventi AG-UI portata dentro il bundle mobile (vedi il blocco "LA
 * SESSIONE VERA" in public/harness-ui/app.js), INCLUSA la seconda metà
 * (fork/resume/compact/passaASessione/elenco sessioni/avvio da corpus).
 * apiPost/apiGet reali via fetch mockato per metodo+percorso (mai una
 * risposta ambigua: rispecchia il contratto vero, non un caso limite
 * inventato), EventSource fittizio (jsdom non lo implementa). Nessuna di
 * queste funzioni è ancora agganciata a un tocco reale — le prove chiamano
 * il runtime esposto direttamente, stesso motivo già dichiarato nella nota
 * di testa del blocco in app.js.
 */

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

type RuntimeGlobals = {
    __talosHarnessUiRuntime?: {
        startRealSession(task: { id: string, consegna?: string }): Promise<void>
        stopRealSession(): Promise<void>
        handleRealEvent(evento: Record<string, unknown>, generation: number): void
        forkSession(): Promise<void>
        resumeSession(messaggioFollowUp?: string): Promise<void>
        compactSession(): Promise<void>
        passaASessione(sessionId: string, taskId: string, nome?: string): void
        openRealTaskSheet(): Promise<void>
        aggiornaElencoSessioniReali(): Promise<void>
        runDirectShell(comando: string, silenzioso: boolean): Promise<void>
        submitPrompt(text: string): boolean
        executeCommand(command: string): void
        costruisciTrascrizioneMarkdown(esportato: Record<string, unknown>): string
        titoloDalPrimoMessaggio(testo: string): string
        // ⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md).
        apriVistaTerminaleReale(): void
        scollegaTerminaleReale(): void
        statoTerminale(): {
            ws: { close(): void, onclose?: unknown, readyState?: number } | null
            idConnesso: string | null
            term: { clear(): void, write(dati: string): void, writeln(dati: string): void, cols: number, rows: number } | null
            fit: { fit(): void } | null
            montato: boolean
            standaloneId: string | null
            resizeObserver: unknown
        }
        realSessionState: {
            id: string | null
            taskId: string | null
            generation: number
            eventSource: FakeEventSource | null
            messageElements: Map<string, HTMLElement>
            reviewFiles: Map<string, { path: string, nuovo: boolean, diffVero: boolean, code: [string, string][] }>
            eventoTerminaleVisto: boolean
            followUpBubbleInAttesa: boolean
            treeCache: Map<string, Array<{ nome: string, cartella: boolean }>>
            treeOpen: Set<string>
            usage: { prompt_tokens: number, completion_tokens: number, prompt_tokens_details?: { cached_tokens: number }, giri: number } | null
        }
    }
}

/** Fake minimo: jsdom non implementa EventSource. Registra l'URL aperto, niente rete vera. */
class FakeEventSource {
    static instances: FakeEventSource[] = []
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2

    url: string
    readyState = FakeEventSource.OPEN
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null

    constructor(url: string) {
        this.url = url
        FakeEventSource.instances.push(this)
    }

    emit(data: unknown): void {
        this.onmessage?.({ data: JSON.stringify(data) })
    }

    close(): void {
        this.readyState = FakeEventSource.CLOSED
    }
}

type RegolaFetch = { metodo: string, percorso: string, corpo: unknown, ok?: boolean, status?: number }

/**
 * Finge `fetch` per METODO+percorso esatto — mai una risposta generica per
 * "qualunque richiesta", perché apiGet('/api/v1/sessions') e
 * apiPost('/api/v1/sessions', …) condividono lo stesso pathname: solo il
 * metodo li distingue, esattamente come farebbe il server vero.
 */
function mockFetch(regole: RegolaFetch[]) {
    return vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : String(input)
        const metodo = (init?.method ?? 'GET').toUpperCase()
        const percorso = url.split('?')[0]
        const regola = regole.find((r) => r.metodo === metodo && percorso === r.percorso)
        if (!regola) throw new Error(`nessuna risposta finta per ${metodo} ${percorso}`)
        return new Response(
            JSON.stringify(regola.ok === false ? { ok: false, error: regola.corpo } : { ok: true, data: regola.corpo }),
            { status: regola.status ?? 200 },
        )
    })
}

/**
 * ⭐⭐⭐ 27/8 — l'albero VERO chiama LO STESSO endpoint
 * (/api/v1/sessions/:id/tree) con `?percorso=` diverso per ogni livello:
 * `mockFetch` sopra confronta solo il pathname (senza query), quindi non
 * può dare risposte diverse a root e a una sottocartella sullo STESSO
 * endpoint. Questo aiutante confronta la query per intero, e conta le
 * chiamate per livello — la prova che la cache NON ri-scarica un livello
 * già visto passa da questo conteggio, non da un'supposizione.
 */
function mockFetchAlbero(livelli: Record<string, Array<{ nome: string, cartella: boolean }>>, extra: RegolaFetch[] = []) {
    const chiamatePerLivello: Record<string, number> = {}
    const spia = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : String(input)
        const metodo = (init?.method ?? 'GET').toUpperCase()
        const [percorsoBase, query] = url.split('?')
        const treeMatch = /^\/api\/v1\/sessions\/[^/]+\/tree$/.exec(percorsoBase)
        if (metodo === 'GET' && treeMatch) {
            const parametri = new URLSearchParams(query ?? '')
            const livello = parametri.get('percorso') ?? ''
            chiamatePerLivello[livello] = (chiamatePerLivello[livello] ?? 0) + 1
            if (!(livello in livelli)) throw new Error(`nessuna risposta finta per il livello "${livello}"`)
            return new Response(JSON.stringify({ ok: true, data: { voci: livelli[livello] } }), { status: 200 })
        }
        const regola = extra.find((r) => r.metodo === metodo && percorsoBase === r.percorso)
        if (!regola) throw new Error(`nessuna risposta finta per ${metodo} ${percorsoBase}`)
        return new Response(
            JSON.stringify(regola.ok === false ? { ok: false, error: regola.corpo } : { ok: true, data: regola.corpo }),
            { status: regola.status ?? 200 },
        )
    })
    return { spia, chiamatePerLivello }
}

function mountStaticRuntime(): void {
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html')
    parsed.querySelectorAll('script').forEach((script) => script.remove())
    document.body.replaceChildren(...Array.from(parsed.body.childNodes))
    document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
        dialog.show ??= () => { dialog.setAttribute('open', '') }
        dialog.close ??= () => { dialog.removeAttribute('open') }
    })
    ;(window as unknown as { __talosHarnessRoot?: ParentNode }).__talosHarnessRoot = document
    ;(window as unknown as { __talosHarnessHost?: HTMLElement }).__talosHarnessHost = document.documentElement
    window.eval(asset('app.js'))
}

function runtime() {
    const rt = (window as unknown as RuntimeGlobals).__talosHarnessUiRuntime
    if (!rt) throw new Error('runtime not mounted')
    return rt
}

describe('Harness UI — real session, la parte portata da lane/harness-ui', () => {
    beforeEach(() => {
        document.body.className = ''
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        mountStaticRuntime()
    })

    afterEach(() => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessApiBase?: unknown }).__talosHarnessApiBase
        document.body.replaceChildren()
        document.body.className = ''
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    /**
     * ⭐⭐⭐ Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3
     * (`adb reverse`). Su desktop `window.__talosHarnessApiBase` non esiste
     * (nessuno lo pianta, esattamente come in ogni altro test di questo
     * file) — `API()` torna il percorso invariato, che è esattamente ciò
     * che REAL-SESSION-START-01 già prova senza saperlo (nessuna modifica
     * a quel test: è la prova "AL CONTRARIO" di questa coppia). Qui si
     * prova l'altro verso: quando `HarnessSessionScreen.vue` pianta la
     * base PRIMA di eseguire `app.js` (stesso momento di ROOT()/HOST()),
     * ogni fetch/EventSource verso `/api/v1/...` diventa assoluto.
     */
    it('API-BASE-01 con window.__talosHarnessApiBase impostato, fetch e EventSource usano l\'URL assoluto (mobile)', async () => {
        // API() legge window.__talosHarnessApiBase AD OGNI chiamata, non solo
        // al caricamento dello script (come ROOT()/HOST()) — impostarlo dopo
        // il mount di beforeEach, prima di agire, prova esattamente questo.
        ;(window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase = 'http://localhost:4174'
        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: 'http://localhost:4174/api/v1/sessions', corpo: { sessionId: 'sess-mobile' } },
            { metodo: 'GET', percorso: 'http://localhost:4174/api/v1/sessions', corpo: { items: [] } },
        ])

        await runtime().startRealSession({ id: 'storia-0b81c88', consegna: 'Sistema il test rosso.' })

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:4174/api/v1/sessions', expect.objectContaining({
            method: 'POST',
            // ⭐ 'client' riusa lo STESSO segnale di __talosHarnessApiBase —
            // il server sa che questa sessione è mobile senza un secondo flag.
            body: JSON.stringify({ taskId: 'storia-0b81c88', client: 'mobile' }),
        }))
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(FakeEventSource.instances[0].url).toBe('http://localhost:4174/api/v1/sessions/sess-mobile/events')
    })

    it('REAL-SESSION-START-01 posts to /api/v1/sessions and opens the SSE stream for the returned id', async () => {
        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-abc123' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])

        await runtime().startRealSession({ id: 'storia-0b81c88', consegna: 'Sistema il test rosso.' })

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions', expect.objectContaining({ method: 'POST' }))
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(FakeEventSource.instances[0].url).toBe('/api/v1/sessions/sess-abc123/events')
        expect(runtime().realSessionState.id).toBe('sess-abc123')
    })

    it('REAL-SESSION-AUTOMATION-01 "Esegui ora" su una riga con data-task-id avvia per davvero quel task (standalone)', async () => {
        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-automazione' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const bottone = document.querySelector('[data-automation-action="run"][data-task-id]') as HTMLButtonElement
        expect(bottone).not.toBeNull()

        bottone.click()
        await new Promise((r) => setTimeout(r, 0)) // il click non è awaitable dall'esterno: si aspetta che startRealSession finisca da sé

        // Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3: 'client'
        // riusa lo stesso segnale di window.__talosHarnessApiBase (Fase 1) —
        // assente qui, quindi 'desktop', il valore di sempre.
        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ taskId: bottone.dataset.taskId, client: 'desktop' }) }))
        expect(runtime().realSessionState.id).toBe('sess-automazione')
    })

    it('⛔ REAL-SESSION-AUTOMATION-02 AL CONTRARIO: sullo stesso bottone, embedded SENZA tunnel non chiama MAI il backend', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = mockFetch([])
        const bottone = document.querySelector('[data-automation-action="run"][data-task-id]') as HTMLButtonElement

        bottone.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalled()
        expect(runtime().realSessionState.id).toBeNull()
    })

    /**
     * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 — trovato
     * verificando dal vivo (owner, in sessione: "il moka è completamente non
     * funzionante... basta collegarlo ai componenti front end"): il cancello
     * `talos-embedded` da solo bloccava OGNI fetch reale su mobile, ANCHE col
     * tunnel Fase 1-3 attivo. embeddedDemoOnly() lo corregge — embedded E CON
     * window.__talosHarnessApiBase impostato (tunnel attivo) DEVE chiamare il
     * backend vero, esattamente come standalone.
     */
    it('REAL-SESSION-AUTOMATION-03 embedded CON tunnel attivo (window.__talosHarnessApiBase) chiama il backend per davvero', async () => {
        document.documentElement.classList.add('talos-embedded')
        ;(window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase = 'http://localhost:4174'
        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: 'http://localhost:4174/api/v1/sessions', corpo: { sessionId: 'sess-mobile-tunnel' } },
            { metodo: 'GET', percorso: 'http://localhost:4174/api/v1/sessions', corpo: { items: [] } },
        ])
        const bottone = document.querySelector('[data-automation-action="run"][data-task-id]') as HTMLButtonElement

        bottone.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:4174/api/v1/sessions', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ taskId: bottone.dataset.taskId, client: 'mobile' }),
        }))
        expect(runtime().realSessionState.id).toBe('sess-mobile-tunnel')
    })

    it('REAL-SESSION-START-01b il badge "Demo UI" della chat sparisce con una sessione vera, e MAI quello di una superficie diversa', async () => {
        // ⛔ nuovaGenerazioneSessione() svuota #conversation con replaceChildren():
        // il badge della chat (dentro #conversation) e quello di .approval-card
        // (idem) spariscono con lui — resta solo quello di .queued-message, FUORI
        // da #conversation. Un fix che cerca "il primo badge sotto .chat-view"
        // colpirebbe quello per coincidenza: qui si prova che non lo tocca.
        const badgeCoda = document.querySelector('[data-demo-surface="queue"] .demo-surface-badge') as HTMLElement
        expect(badgeCoda).not.toBeNull()
        expect(badgeCoda.hidden).toBe(false)

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-abc123' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-0b81c88', consegna: 'Sistema il test rosso.' })

        expect(fetchMock).toHaveBeenCalled()
        expect(document.querySelector('#conversation .demo-surface-badge')).toBeNull()
        expect(badgeCoda.hidden).toBe(false) // AL CONTRARIO: una superficie non correlata resta intatta
    })

    it('REAL-SESSION-START-01c AL CONTRARIO: nessuna sessione mai partita, il badge resta visibile', () => {
        const badge = document.querySelector('.chat-view .demo-surface-badge') as HTMLElement | null
        expect(badge).not.toBeNull()
        expect(badge!.hidden).toBe(false)
    })

    it('REAL-SESSION-START-02 AL CONTRARIO: un avvio fallito non apre nessuno stream e non finge un id', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { code: 'BAD_TASK', message: 'task ignoto' }, ok: false, status: 404 },
        ])

        await runtime().startRealSession({ id: 'non-esiste' })

        expect(FakeEventSource.instances).toHaveLength(0)
        expect(runtime().realSessionState.id).toBeNull()
    })

    it('REAL-SESSION-TEXT-01 TextMessageContent accumula il testo nella bolla assistente, non la sostituisce', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Leggo ' }, generation)
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'il file.' }, generation)

        const bubble = document.querySelector('.real-session-status')
        expect(bubble).toBeNull() // nessuno stato/errore ancora — solo testo
        const copies = [...document.querySelectorAll('.assistant-copy')].map((el) => el.textContent)
        expect(copies).toContain('Leggo il file.')
    })

    /*
     * ⭐⭐⭐ 29/8 — FASE J: il bottone "ascolta" (TTS) è costruito SOLO se
     * `speechSynthesis` esiste — jsdom non la implementa affatto (zero
     * polyfill in questo progetto, verificato prima di scrivere: `'speechSynthesis' in window` è `false` qui, esattamente come in un
     * browser che non la supporta) — stessa disciplina "mai un bottone
     * che sembra funzionare e non fa niente" già provata per il
     * microfono. La verifica del percorso POSITIVO (bottone presente,
     * click→speak/cancel) resta fuori da questo ambiente per lo stesso
     * motivo — non testabile senza un vero motore di sintesi vocale.
     */
    it('⛔ REAL-SESSION-TTS-01 AL CONTRARIO: senza speechSynthesis, nessun bottone "ascolta" nella bolla assistente', () => {
        expect('speechSynthesis' in window).toBe(false)
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-tts', delta: 'Risposta senza sintesi vocale disponibile.' }, generation)

        expect(document.querySelector('.assistant-listen-btn')).toBeNull()
    })

    // ⛔⛔⛔ 27/8, owner: "le risposte non sono formattate, cioè le basi" — il
    // testo del modello arrivava con .textContent += : un elenco puntato
    // diventava una riga sola senza a-capo, nessun grassetto/corsivo/codice.
    it('REAL-SESSION-TEXT-02 un elenco puntato del modello diventa una lista VERA (<li>), non una riga sola', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-lista', delta: 'Posso:\n- Uno\n- Due\n- Tre' }, generation)

        const elemento = document.querySelector('.assistant-copy ul')
        expect(elemento).not.toBeNull()
        const voci = [...document.querySelectorAll('.assistant-copy ul li')].map((el) => el.textContent)
        expect(voci).toEqual(['Uno', 'Due', 'Tre'])
    })

    it('REAL-SESSION-TEXT-03 grassetto/corsivo/codice inline diventano nodi veri, non asterischi a schermo', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-inline', delta: 'Uso **grassetto**, *corsivo* e `codice()`.' }, generation)

        const copia = document.querySelector('.assistant-copy')
        expect(copia?.querySelector('strong')?.textContent).toBe('grassetto')
        expect(copia?.querySelector('em')?.textContent).toBe('corsivo')
        expect(copia?.querySelector('code')?.textContent).toBe('codice()')
        expect(copia?.textContent).not.toContain('**') // mai asterischi letterali a schermo
    })

    it('⛔ REAL-SESSION-TEXT-04 AL CONTRARIO: testo del modello che sembra HTML resta testo letterale, mai eseguito', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-xss', delta: '<img src=x onerror="window.__provaXss=true">' }, generation)

        const copia = document.querySelector('.assistant-copy')
        expect(copia?.querySelector('img')).toBeNull() // mai un <img> VERO nel DOM
        expect(copia?.textContent).toContain('<img') // il testo letterale resta visibile
        expect((window as unknown as { __provaXss?: boolean }).__provaXss).toBeUndefined()
    })

    // ⛔⛔ 27/8, trovato dalla pipeline QA visiva: un RunStarted per un comando
    // diretto (agent-service.mjs: input:{comandoDiretto:comando}, niente id
    // né consegna) mostrava "Task reale · undefined" — un undefined crudo,
    // mai un fatto dichiarato — la prima volta che appare in una sessione.
    it('REAL-SESSION-COMANDO-DIRETTO-01 un RunStarted senza id/consegna (comando diretto) non mostra mai "undefined", dichiara "Comando diretto"', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'RunStarted', input: { comandoDiretto: 'echo test' } }, generation)

        const conversationText = document.querySelector('#conversation')?.textContent ?? ''
        expect(conversationText).not.toContain('undefined')
        expect(conversationText).toContain('Comando diretto')
    })

    // ⛔⛔⛔ 27/8, trovato ricaricando la pagina (F5) su una sessione VERA di
    // "compito libero": lo stesso RunStarted, replayato dopo il reload (non
    // più coperto dal bubble ottimista di avviaSessionePendente), mostrava
    // "Comando diretto" per una conversazione reale — task.consegna esiste
    // (custom-task.mjs: {consegna, consegnaCorta, progetto}, NESSUN .id).
    it('⛔ REAL-SESSION-COMANDO-DIRETTO-02 AL CONTRARIO: un RunStarted di un compito libero (consegna, senza id) dichiara "Compito libero", mai "Comando diretto"', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'Ciao, chi sei?', consegnaCorta: 'Ciao, chi sei?', progetto: 'talos-prova-harness' } }, generation)

        const conversationText = document.querySelector('#conversation')?.textContent ?? ''
        expect(conversationText).not.toContain('Comando diretto')
        expect(conversationText).toContain('Compito libero')
        expect(conversationText).toContain('talos-prova-harness')
    })

    it('REAL-SESSION-STALE-01 un evento di una generazione VECCHIA viene scartato, mai renderizzato', () => {
        const generazioneAttuale = runtime().realSessionState.generation
        const generazioneVecchia = generazioneAttuale - 1

        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'scaduto', delta: 'fantasma' }, generazioneVecchia)

        expect(document.querySelector('.assistant-copy')?.textContent ?? '').not.toContain('fantasma')
    })

    it('REAL-SESSION-REVIEW-01 StateDelta popola state.realSession.reviewFiles con chiave "real:<percorso>"', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{ op: 'add', path: '/file/src/prezzo.mjs', value: 'export const prezzo = 1\n' }],
        }, generation)

        expect(runtime().realSessionState.reviewFiles.has('src/prezzo.mjs')).toBe(true)
        const voce = runtime().realSessionState.reviewFiles.get('src/prezzo.mjs')
        expect(voce?.nuovo).toBe(true)
    })

    it('REAL-SESSION-REVIEW-02 StateDelta con "prima" produce un diff VERO — righe rosse/verdi/neutre, non tutto "add" — 27/8, il formattatore diff', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{
                op: 'replace', path: '/file/src/prezzo.mjs',
                value: 'export const prezzo = 2\nexport const iva = 1\n',
                prima: 'export const prezzo = 1\n',
            }],
        }, generation)

        const voce = runtime().realSessionState.reviewFiles.get('src/prezzo.mjs')
        expect(voce?.diffVero).toBe(true)
        // la riga invariata è testo diverso solo perché il valore è cambiato — qui
        // NIENTE è invariato riga per riga (prezzo passa da 1 a 2), quindi la
        // prova vera è: c'è almeno una riga marcata '-' (rimossa) e una '+' (aggiunta).
        const tipi = voce!.code.map(([tipo]) => tipo)
        expect(tipi).toContain('del')
        expect(tipi).toContain('add')
        expect(voce!.code.some(([, testo]) => testo.includes('- export const prezzo = 1'))).toBe(true)
        expect(voce!.code.some(([, testo]) => testo.includes('+ export const prezzo = 2'))).toBe(true)
    })

    /*
     * ⭐⭐⭐ Riconciliazione Fase 3 (piano procedi-col-generare-un-snoopy-neumann.md,
     * 27/8) — il contatore costo/token per una sessione VIVA, prima
     * assente. path /usage è uno smistamento NUOVO nel case 'StateDelta':
     * deve popolare realSessionState.usage, e MAI toccare reviewFiles
     * (che REVIEW-01/02 sopra già provano per /file/*).
     */
    it('⭐⭐⭐ USAGE-01 StateDelta path /usage popola realSessionState.usage, non reviewFiles', () => {
        const generation = runtime().realSessionState.generation
        const totali = { prompt_tokens: 900, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 50 }, giri: 3 }
        runtime().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: totali }] }, generation)

        expect(runtime().realSessionState.usage).toEqual(totali)
        expect(runtime().realSessionState.reviewFiles.size).toBe(0)
    })

    it('⛔ AL CONTRARIO: USAGE-02 uno StateDelta /file/* non tocca mai realSessionState.usage', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{ op: 'add', path: '/file/altro.mjs', value: 'x' }],
        }, generation)

        expect(runtime().realSessionState.usage).toBeNull()
    })

    /*
     * ⭐⭐⭐ 28/8 — owner: "tutti i tool come la generazione di artefatti".
     * L'HTML entra SOLO come `srcdoc` di un iframe sandboxato: mai
     * innerHTML sul documento reale, mai eseguito nel contesto della
     * pagina — verificato leggendo gli attributi veri dell'elemento, non
     * assunto dal solo fatto che la card compaia.
     */
    /*
     * ⭐⭐⭐ 28/8, riscritto dopo la scoperta dal vivo: `srcdoc` EREDITA la
     * CSP della pagina (script-src 'self' di questo bundle), quindi lo
     * script di un artefatto non partiva mai — vedi la doc in
     * artifact-store.mjs (harness-ui/src). La cura: `frame.src` punta a
     * `/api/v1/artifacts/:id`, una risposta HTTP con la SUA CSP. Qui si
     * prova SOLO che il frontend costruisca l'URL/gli attributi giusti —
     * la risposta vera (e la sua CSP) è provata in http-app.test.mjs.
     */
    it('⭐⭐⭐ ARTIFACT-01 ArtifactCreated monta un iframe sandboxato con src verso /api/v1/artifacts/:id, MAI srcdoc', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ArtifactCreated', messageId: 'm1', id: 'a1', titolo: 'Spirografo' }, generation)

        const frame = document.querySelector<HTMLIFrameElement>('#conversation .artifact-card-frame')
        expect(frame).not.toBeNull()
        expect(frame!.getAttribute('sandbox')).toBe('allow-scripts')
        // ⛔ AL CONTRARIO del confine giusto: allow-same-origin/allow-top-navigation/allow-popups NON devono mai comparire nel valore.
        expect(frame!.getAttribute('sandbox')).not.toMatch(/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/)
        expect(frame!.getAttribute('src')).toBe('/api/v1/artifacts/a1')
        expect(frame!.getAttribute('srcdoc')).toBeNull()
        expect(document.querySelector('#conversation .artifact-card-title')?.textContent).toBe('Spirografo')
    })

    it('⛔ AL CONTRARIO: ARTIFACT-02 senza titolo, la card mostra comunque un\'etichetta onesta, mai vuota', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ArtifactCreated', messageId: 'm2', id: 'a2', titolo: '' }, generation)

        expect(document.querySelector('#conversation .artifact-card-title')?.textContent).toBe('Artefatto')
    })

    it('REAL-SESSION-REVIEW-03 StateDelta SENZA "prima" (chiamante vecchio) resta onesto: nessun diff inventato, diffVero:false — verso contrario del test sopra', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{ op: 'replace', path: '/file/src/senza-prima.mjs', value: 'x\n' }],
        }, generation)

        const voce = runtime().realSessionState.reviewFiles.get('src/senza-prima.mjs')
        expect(voce?.diffVero).toBe(false)
        expect(voce!.code.every(([tipo]) => tipo !== 'del')).toBe(true)
    })

    /*
     * ⭐⭐⭐ 27/8, owner: "un componente allo stato dell'arte" per Files,
     * "renditelo funzionante" — il pannello Files reale: albero vero
     * (più cartelle aperte insieme, non un livello con su/giù), stato
     * git incrociato con reviewFiles, cache per livello, ricerca dal vivo.
     */
    describe('FILE-TREE — il pannello Files reale', () => {
        async function avviaSessioneConAlbero(livelli: Record<string, Array<{ nome: string, cartella: boolean }>>) {
            const { chiamatePerLivello } = mockFetchAlbero(livelli, [
                { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-ft' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            ])
            await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test albero' })
            const generation = runtime().realSessionState.generation
            runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test albero' } }, generation)
            await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })
            return { chiamatePerLivello, generation }
        }

        const LIVELLO_RADICE = [
            { nome: 'src', cartella: true },
            { nome: 'README.md', cartella: false },
        ]
        const LIVELLO_SRC = [
            { nome: 'app.js', cartella: false },
            { nome: 'styles.css', cartella: false },
        ]

        it('FILE-TREE-01 la radice mostra cartelle PRIMA dei file, con i ruoli ARIA giusti — role=tree/treeitem, un solo tabstop', async () => {
            await avviaSessioneConAlbero({ '': LIVELLO_RADICE })

            const albero = document.querySelector('.ft-tree')!
            expect(albero.getAttribute('role')).toBe('tree')
            const righe = [...albero.querySelectorAll('.ft-row')]
            expect(righe.map((r) => r.querySelector('.ft-name')?.textContent)).toEqual(['src', 'README.md'])
            expect(righe[0].closest('.ft-node')?.getAttribute('role')).toBe('treeitem')
            // un solo tabstop nell'intero albero (pattern ARIA APG), non uno per riga
            expect(righe.filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1)
            expect(righe[0].getAttribute('tabindex')).toBe('0')
        })

        it('FILE-TREE-02 espandere una cartella scarica i suoi figli UNA volta sola — richiuderla e riaprirla NON ripete la richiesta (cache)', async () => {
            const { chiamatePerLivello } = await avviaSessioneConAlbero({ '': LIVELLO_RADICE, src: LIVELLO_SRC })

            const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            await vi.waitFor(() => { expect(document.querySelector('.ft-node[data-percorso="src/app.js"]')).toBeTruthy() })
            expect(chiamatePerLivello.src).toBe(1)

            // richiudi, riapri: la cache tiene, zero seconda richiesta
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true })) // chiude
            expect(document.querySelector('.ft-node[data-percorso="src"]')?.classList.contains('ft-open')).toBe(false)
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true })) // riapre
            expect(document.querySelector('.ft-node[data-percorso="src"]')?.classList.contains('ft-open')).toBe(true)
            expect(chiamatePerLivello.src).toBe(1)
        })

        it('FILE-TREE-03 un file scritto in questa sessione porta il pallino di stato giusto — nuovo vs modificato, nessun pallino se non toccato', async () => {
            await avviaSessioneConAlbero({ '': [{ nome: 'src', cartella: true }, { nome: 'giatoccato.txt', cartella: false }, { nome: 'maitoccato.txt', cartella: false }] })
            const generation = runtime().realSessionState.generation

            runtime().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'add', path: '/file/giatoccato.txt', value: 'x' }] }, generation)
            await vi.waitFor(() => {
                const riga = [...document.querySelectorAll('.ft-row')].find((r) => r.querySelector('.ft-name')?.textContent === 'giatoccato.txt')!
                expect(riga.querySelector('.ft-status-dot.ft-new')).toBeTruthy()
            })
            const rigaIntoccato = [...document.querySelectorAll('.ft-row')].find((r) => r.querySelector('.ft-name')?.textContent === 'maitoccato.txt')!
            expect(rigaIntoccato.querySelector('.ft-status-dot')).toBeFalsy()
        })

        it('FILE-TREE-04 un file NUOVO scritto dentro una cartella già aperta invalida SOLO quel livello e ricompare — verso contrario del test 02', async () => {
            const { chiamatePerLivello } = await avviaSessioneConAlbero({ '': LIVELLO_RADICE, src: LIVELLO_SRC })
            const generation = runtime().realSessionState.generation

            const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            await vi.waitFor(() => { expect(document.querySelector('.ft-node[data-percorso="src/app.js"]')).toBeTruthy() })
            expect(chiamatePerLivello.src).toBe(1)
            expect(document.querySelector('.ft-node[data-percorso="src/nuovo.mjs"]')).toBeFalsy()

            // il PROSSIMO fetch di "src" (dopo l'invalidazione) porta il file nuovo
            LIVELLO_SRC.push({ nome: 'nuovo.mjs', cartella: false })
            runtime().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'add', path: '/file/src/nuovo.mjs', value: 'x' }] }, generation)
            await vi.waitFor(() => {
                expect(document.querySelector('.ft-node[data-percorso="src/nuovo.mjs"]')).toBeTruthy()
            })
            expect(chiamatePerLivello.src).toBe(2) // esattamente un secondo fetch, non uno per ogni scrittura futura
            LIVELLO_SRC.pop() // non inquina gli altri test: l'array è condiviso per riferimento
        })

        it('FILE-TREE-05 un file GIÀ noto a quel livello NON invalida niente — solo il pallino si aggiorna, zero fetch in più', async () => {
            const { chiamatePerLivello } = await avviaSessioneConAlbero({ '': LIVELLO_RADICE, src: LIVELLO_SRC })
            const generation = runtime().realSessionState.generation
            const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            await vi.waitFor(() => { expect(document.querySelector('.ft-node[data-percorso="src/app.js"]')).toBeTruthy() })
            expect(chiamatePerLivello.src).toBe(1)

            runtime().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/app.js', value: 'x2' }] }, generation)
            await vi.waitFor(() => {
                const riga = [...document.querySelectorAll('.ft-row')].find((r) => r.querySelector('.ft-name')?.textContent === 'app.js')!
                expect(riga.querySelector('.ft-status-dot.ft-modified')).toBeTruthy()
            })
            expect(chiamatePerLivello.src).toBe(1) // il file era già nella lista: nessun secondo fetch serviva
        })

        it('FILE-TREE-06 la ricerca sottolinea i risultati, attenua gli altri, e riapre una cartella già caricata ma chiusa che contiene un risultato', async () => {
            const { chiamatePerLivello } = await avviaSessioneConAlbero({ '': LIVELLO_RADICE, src: LIVELLO_SRC })
            const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true })) // apre e cachea src/
            await vi.waitFor(() => { expect(document.querySelector('.ft-node[data-percorso="src/app.js"]')).toBeTruthy() })
            expect(chiamatePerLivello.src).toBe(1)
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true })) // richiude — ma resta in cache
            expect(document.querySelector('.ft-node[data-percorso="src"]')?.classList.contains('ft-open')).toBe(false)

            const input = document.getElementById('fileTreeFilter') as HTMLInputElement
            input.value = 'app.js'
            input.dispatchEvent(new Event('input', { bubbles: true }))

            expect(document.querySelector('.ft-node[data-percorso="src"]')?.classList.contains('ft-open')).toBe(true) // riaperta da sola
            const rigaApp = [...document.querySelectorAll('.ft-row')].find((r) => r.querySelector('.ft-name')?.textContent?.includes('app.js'))!
            expect(rigaApp.classList.contains('ft-match')).toBe(true)
            expect(rigaApp.querySelector('mark')?.textContent).toBe('app.js')
            const rigaReadme = [...document.querySelectorAll('.ft-row')].find((r) => r.querySelector('.ft-name')?.textContent === 'README.md')!
            expect(rigaReadme.classList.contains('ft-dimmed')).toBe(true)
            expect(document.getElementById('fileTreeFilterHint')?.textContent).toContain('1')
            expect(chiamatePerLivello.src).toBe(1) // riaprire dalla ricerca non ha ri-scaricato: era già in cache

            input.value = ''
            input.dispatchEvent(new Event('input', { bubbles: true }))
            expect(rigaReadme.classList.contains('ft-dimmed')).toBe(false)
            expect(document.getElementById('fileTreeFilterHint')?.textContent).toBe('')
        })

        /*
         * ⭐⭐⭐ 28/8 — workspace-watcher.mjs (backend), owner 27/8: "se
         * muovo i file il work tree non si aggiorna automaticamente". A
         * differenza di FILE-TREE-04 (un percorso preciso, dal MODELLO)
         * qui il backend non sa esattamente cosa è cambiato fuori
         * dall'app — quindi invalida TUTTA la cache, non solo un livello.
         */
        it('FILE-TREE-07 WorkspaceChanged svuota TUTTA la cache dati e ri-scarica ogni livello aperto — "src" resta aperta, con dati freschi', async () => {
            const { chiamatePerLivello, generation } = await avviaSessioneConAlbero({ '': LIVELLO_RADICE, src: LIVELLO_SRC })
            const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
            rigaSrc.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            await vi.waitFor(() => { expect(document.querySelector('.ft-node[data-percorso="src/app.js"]')).toBeTruthy() })
            expect(chiamatePerLivello['']).toBe(1)
            expect(chiamatePerLivello.src).toBe(1)

            runtime().handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['esterno.txt'] }, generation)
            // ⭐ renderizzaAlberoReale() ri-scarica la radice PIÙ tutto ciò che
            // era in treeOpen (sua stessa doc, riga "radice + tutto ciò che
            // era già aperto") — "src" non si richiude, torna aperta con
            // dati VERI appena letti, non semplicemente "resta come prima".
            await vi.waitFor(() => { expect(chiamatePerLivello['']).toBe(2) })
            await vi.waitFor(() => { expect(chiamatePerLivello.src).toBe(2) })
            expect(document.querySelector('.ft-node[data-percorso="src"]')?.classList.contains('ft-open')).toBe(true)
            expect(document.querySelector('.ft-node[data-percorso="src/app.js"]')).toBeTruthy()
        })

        it('⛔ AL CONTRARIO — FILE-TREE-08 WorkspaceChanged senza una sessione reale attiva non tocca l\'albero, zero fetch al tree', async () => {
            // ⭐ Nessuna sessione avviata in questo test: chiamatePerLivello resta vuoto se e solo se renderizzaAlberoReale non viene mai invocata.
            const { chiamatePerLivello } = mockFetchAlbero({})
            runtime().handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['x.txt'] }, runtime().realSessionState.generation)
            await new Promise((r) => setTimeout(r, 0))
            expect(chiamatePerLivello).toEqual({})
        })

        /*
         * ⭐⭐⭐ 29/8, owner dal vivo: "in una sessione vuota la tab files ha
         * ancora la scritta demo UI non collegato". Lo scenario preciso:
         * l'id della sessione è già noto, ma NESSUN `RunStarted` è ancora
         * arrivato — a differenza di `avviaSessioneConAlbero()` sopra, che
         * lo dispatcha sempre come parte del proprio setup.
         */
        it('FILE-TREE-09 aprire la tab Files SENZA che nessun RunStarted sia mai arrivato carica comunque l\'albero vero', async () => {
            const { chiamatePerLivello } = mockFetchAlbero({ '': LIVELLO_RADICE }, [
                { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-vuota' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            ])
            await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test sessione vuota' })
            expect(chiamatePerLivello).toEqual({}) // niente ancora, prima del click — coerente con la cura: pigra, non a connessione
            document.getElementById('inspector-tab-files')!.click()
            await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })
            expect(chiamatePerLivello['']).toBe(1)
        })

        it('⛔ AL CONTRARIO — FILE-TREE-10 se la radice è già in cache (un RunStarted l\'ha già caricata), riaprire la tab Files NON ripete il fetch', async () => {
            const { chiamatePerLivello } = await avviaSessioneConAlbero({ '': LIVELLO_RADICE })
            expect(chiamatePerLivello['']).toBe(1) // caricata dal RunStarted del setup
            document.getElementById('inspector-tab-files')!.click()
            document.getElementById('inspector-tab-files')!.click()
            await new Promise((r) => setTimeout(r, 0))
            expect(chiamatePerLivello['']).toBe(1) // MAI raddoppiato: la stessa corsa che FILE-TREE-07 aveva scoperto rotta
        })

        /*
         * ⭐⭐⭐ 28/8 — owner: "nella lista files devo poter draggare i
         * file... non esiste il comando copia... e comandi crud in
         * generale". jsdom non implementa affatto DragEvent/DataTransfer
         * (verificato: `undefined`) — un oggetto finto con
         * setData/getData/types basta per esercitare la logica reale di
         * app.js, che legge solo quei tre.
         */
        describe('Drag&drop, "Copia", "Nuovo file"/"Nuova cartella"', () => {
            function creaDataTransferFinto() {
                const dati = new Map<string, string>()
                return {
                    setData: (tipo: string, valore: string) => { dati.set(tipo, valore) },
                    getData: (tipo: string) => dati.get(tipo) ?? '',
                    get types() { return [...dati.keys()] },
                    effectAllowed: 'none',
                    dropEffect: 'none',
                }
            }
            function dispatchDrag(elemento: Element, tipo: string, dataTransfer: ReturnType<typeof creaDataTransferFinto>) {
                const evento = new Event(tipo, { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown }
                evento.dataTransfer = dataTransfer
                elemento.dispatchEvent(evento)
            }

            it('⭐⭐⭐ CRUD-01: il menu di una cartella mostra "Nuovo file"/"Nuova cartella"/"Copia", oltre a quelle già note', async () => {
                await avviaSessioneConAlbero({ '': [{ nome: 'src', cartella: true }] })
                const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
                rigaSrc.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()

                const etichette = [...document.querySelectorAll('.ft-actions-menu-item')].map((b) => b.textContent)
                expect(etichette.some((e) => e?.includes('Nuovo file'))).toBe(true)
                expect(etichette.some((e) => e?.includes('Nuova cartella'))).toBe(true)
                expect(etichette.some((e) => e?.includes('Copia'))).toBe(true)
            })

            it('⭐⭐⭐ CRUD-02: il menu di un FILE mostra anche "Copia"', async () => {
                await avviaSessioneConAlbero({ '': [{ nome: 'README.md', cartella: false }] })
                const rigaFile = [...document.querySelectorAll('.ft-row-leaf')].find((r) => r.querySelector('.ft-name')?.textContent === 'README.md')!
                rigaFile.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()

                const etichette = [...document.querySelectorAll('.ft-actions-menu-item')].map((b) => b.textContent)
                expect(etichette.some((e) => e?.includes('Copia'))).toBe(true)
            })

            it('⭐⭐⭐ CRUD-03: cliccare "Copia" chiama POST .../tree/copy col percorso VERO, mostra il nuovo nome nel toast', async () => {
                const { spia } = mockFetchAlbero({ '': [{ nome: 'a.txt', cartella: false }] }, [
                    { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-copia' } },
                    { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                    { metodo: 'POST', percorso: '/api/v1/sessions/sess-copia/tree/copy', corpo: { nuovoPercorso: 'a (copia).txt' } },
                ])
                await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test copia' })
                const generation = runtime().realSessionState.generation
                runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test copia' } }, generation)
                await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })

                const rigaFile = [...document.querySelectorAll('.ft-row-leaf')].find((r) => r.querySelector('.ft-name')?.textContent === 'a.txt')!
                rigaFile.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()
                const voceCopia = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent?.includes('Copia'))!
                voceCopia.click()
                await new Promise((r) => setTimeout(r, 0))

                const chiamata = spia.mock.calls.find(([url]) => String(url).includes('/tree/copy'))!
                expect(JSON.parse(String((chiamata[1] as RequestInit).body))).toEqual({ percorso: 'a.txt' })
                expect(document.querySelector('#toastRegion')?.textContent).toContain('a (copia).txt')
            })

            it('⭐⭐⭐ CRUD-04: "Nuovo file" apre un foglio col titolo giusto, e il submit chiama POST .../tree/create con tipo:"file"', async () => {
                const { spia } = mockFetchAlbero({ '': [{ nome: 'src', cartella: true }] }, [
                    { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-crea-file' } },
                    { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                    { metodo: 'POST', percorso: '/api/v1/sessions/sess-crea-file/tree/create', corpo: { percorso: 'src/nuovo.txt' } },
                ])
                await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test crea' })
                const generation = runtime().realSessionState.generation
                runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test crea' } }, generation)
                await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })

                const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
                rigaSrc.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()
                const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent === 'Nuovo file')!
                voceMenu.click()

                expect(document.querySelector('#sheetTitle')?.textContent).toBe('Nuovo file')
                const input = document.querySelector<HTMLInputElement>('#createFileInput')!
                input.value = 'nuovo.txt'
                document.querySelector<HTMLFormElement>('#createFileForm')!.requestSubmit()
                await new Promise((r) => setTimeout(r, 0))

                const chiamata = spia.mock.calls.find(([url]) => String(url).includes('/tree/create'))!
                expect(JSON.parse(String((chiamata[1] as RequestInit).body))).toEqual({ percorsoBase: 'src', nome: 'nuovo.txt', tipo: 'file' })
                expect(document.querySelector('#toastRegion')?.textContent).toContain('src/nuovo.txt')
            })

            it('⭐⭐ CRUD-05: "Nuova cartella" porta tipo:"cartella" e il titolo "Nuova cartella"', async () => {
                mockFetchAlbero({ '': [{ nome: 'src', cartella: true }] }, [
                    { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-crea-cartella' } },
                    { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                    { metodo: 'POST', percorso: '/api/v1/sessions/sess-crea-cartella/tree/create', corpo: { percorso: 'src/nuova' } },
                ])
                await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test crea cartella' })
                const generation = runtime().realSessionState.generation
                runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test crea cartella' } }, generation)
                await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })

                const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
                rigaSrc.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()
                const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent === 'Nuova cartella')!
                voceMenu.click()

                expect(document.querySelector('#sheetTitle')?.textContent).toBe('Nuova cartella')
            })

            it('⭐⭐⭐ CRUD-06: trascinare un file su una cartella chiama POST .../tree/move con percorso e cartellaDestinazione VERI', async () => {
                const { spia } = mockFetchAlbero({ '': [{ nome: 'src', cartella: true }, { nome: 'a.txt', cartella: false }] }, [
                    { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-drag' } },
                    { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                    { metodo: 'POST', percorso: '/api/v1/sessions/sess-drag/tree/move', corpo: { nuovoPercorso: 'src/a.txt' } },
                ])
                await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test drag' })
                const generation = runtime().realSessionState.generation
                runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test drag' } }, generation)
                await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })

                const rigaFile = [...document.querySelectorAll('.ft-row-leaf')].find((r) => r.querySelector('.ft-name')?.textContent === 'a.txt')!
                const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!

                const dt = creaDataTransferFinto()
                dispatchDrag(rigaFile, 'dragstart', dt)
                dispatchDrag(rigaSrc, 'dragover', dt)
                dispatchDrag(rigaSrc, 'drop', dt)
                await new Promise((r) => setTimeout(r, 0))

                const chiamata = spia.mock.calls.find(([url]) => String(url).includes('/tree/move'))!
                expect(JSON.parse(String((chiamata[1] as RequestInit).body))).toEqual({ percorso: 'a.txt', cartellaDestinazione: 'src' })
                expect(document.querySelector('#toastRegion')?.textContent).toContain('src/a.txt')
            })

            it('⛔⛔⛔ CRUD-07 AL CONTRARIO: trascinare una cartella su SE STESSA non chiama MAI la POST — guardia lato client, prima ancora del server', async () => {
                const { spia } = mockFetchAlbero({ '': [{ nome: 'src', cartella: true }] }, [
                    { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-self-drag' } },
                    { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                ])
                await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test self drag' })
                const generation = runtime().realSessionState.generation
                runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test self drag' } }, generation)
                await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })

                const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
                const dt = creaDataTransferFinto()
                dispatchDrag(rigaSrc, 'dragstart', dt)
                dispatchDrag(rigaSrc, 'drop', dt)
                await new Promise((r) => setTimeout(r, 0))

                expect(spia.mock.calls.some(([url]) => String(url).includes('/tree/move'))).toBe(false)
            })

            it('⛔⛔ CRUD-08 AL CONTRARIO: il menu di un FILE non mostra MAI "Nuovo file"/"Nuova cartella" — solo le cartelle possono contenere qualcosa', async () => {
                await avviaSessioneConAlbero({ '': [{ nome: 'README.md', cartella: false }] })
                const rigaFile = [...document.querySelectorAll('.ft-row-leaf')].find((r) => r.querySelector('.ft-name')?.textContent === 'README.md')!
                rigaFile.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()

                const etichette = [...document.querySelectorAll('.ft-actions-menu-item')].map((b) => b.textContent)
                expect(etichette.some((e) => e?.includes('Nuovo file'))).toBe(false)
                expect(etichette.some((e) => e?.includes('Nuova cartella'))).toBe(false)
            })

            it('⭐⭐⭐ CRUD-09: tasto destro sulla RADICE dell\'albero apre un menu con SOLO "Nuovo file"/"Nuova cartella"', async () => {
                await avviaSessioneConAlbero({ '': [{ nome: 'src', cartella: true }] })
                const radice = document.querySelector('.tree-root')!
                radice.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }))

                const etichette = [...document.querySelectorAll('.ft-actions-menu-item')].map((b) => b.textContent)
                expect(etichette).toEqual(['Nuovo file', 'Nuova cartella'])
            })

            /*
             * ⛔⛔⛔ 28/8 — BUG REALE trovato dalla verifica DAL VIVO
             * (screenshot ispezionato, non da un test): il foglio "Nuovo
             * file" mostrava "Demo UI · non collegato" anche durante una
             * sessione REALE — TIPI_FOGLIO_INTERAMENTE_ONESTI (il badge
             * condiviso da 13 tipi di foglio sullo stesso sheetDialog,
             * già trovato mancante due volte in una sessione precedente
             * per altri tipi) non includeva ancora 'createFile', il tipo
             * appena aggiunto oggi stesso. Corretto aggiungendolo alla
             * whitelist.
             */
            it('⭐⭐⭐ CRUD-10: il foglio "Nuovo file"/"Nuova cartella" NON mostra il badge "Demo UI" durante una sessione reale', async () => {
                await avviaSessioneConAlbero({ '': [{ nome: 'src', cartella: true }] })
                const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
                rigaSrc.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()
                const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent === 'Nuovo file')!
                voceMenu.click()

                const badge = document.querySelector<HTMLElement>('#sheetDialog .demo-surface-badge')
                expect(badge?.hidden).toBe(true)
            })
        })
    })

    it('REAL-SESSION-STOP-01 stopRealSession non fa nulla senza una sessione reale attiva (nessun POST)', async () => {
        const fetchMock = mockFetch([])
        await runtime().stopRealSession()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('REAL-SESSION-FINISH-01 RunFinished NON chiude subito lo stream — solo quando la connessione cade DAVVERO, e senza avviso', async () => {
        // ⛔ 27/8: chiudere subito su un RunFinished era il difetto — una
        // cronologia con PIÙ giri (resume, comando diretto) troncava il
        // replay al primo. Ora RunFinished si limita a segnare "visto un
        // terminale"; è onerror (il segnale reale che la connessione è
        // caduta — qui simulato) a chiudere, e solo SE quel segnale arriva
        // dopo un terminale: mai un "connessione interrotta" per una fine
        // attesa.
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-fine' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: 'sess-fine', taskId: 'storia-x', conclusa: true, avviataAlle: '2026-08-26T10:00:00.000Z' }] } },
        ])
        await runtime().startRealSession({ id: 'storia-x' })
        const generation = runtime().realSessionState.generation
        const source = FakeEventSource.instances.at(-1)

        runtime().handleRealEvent({ type: 'RunFinished', result: { detto: 'Fatto.' } }, generation)
        // RunFinished da solo non chiude più niente: potrebbero seguire altri eventi (un secondo giro) sulla stessa connessione.
        expect(source?.readyState).toBe(FakeEventSource.OPEN)
        expect(runtime().realSessionState.eventSource).not.toBeNull()

        source?.onerror?.() // il server ha chiuso lo stream per davvero, ora che il replay/giro è finito

        expect(source?.readyState).toBe(FakeEventSource.CLOSED)
        expect(runtime().realSessionState.eventSource).toBeNull()
        expect(document.querySelector('#conversation')?.textContent).not.toContain('interrotta')
    })

    it('⛔ REAL-SESSION-FINISH-02 AL CONTRARIO: una connessione che cade PRIMA di qualunque evento terminale mostra l\'avviso di interruzione', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-caduta' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-y' })
        const source = FakeEventSource.instances.at(-1)
        source!.readyState = FakeEventSource.CLOSED // la caduta di rete vera: il browser ha già rinunciato

        source?.onerror?.()

        expect(document.querySelector('#conversation')?.textContent).toContain('interrotta')
    })

    it('REAL-SESSION-LIST-01 aggiornaElencoSessioniReali popola #sessionList con un blocco "Sessioni reali"', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [
                { sessionId: 'sess-1', taskId: 'storia-a', nome: null, conclusa: false, avviataAlle: '2026-08-26T10:00:00.000Z' },
                { sessionId: 'sess-2', taskId: 'storia-b', nome: 'Rinominata', conclusa: true, forkDa: 'sess-1', avviataAlle: '2026-08-26T11:00:00.000Z' },
            ] } },
        ])

        await runtime().aggiornaElencoSessioniReali()

        const blocco = document.querySelector('#realSessionsBlock')
        expect(blocco).not.toBeNull()
        expect(blocco?.textContent).toContain('storia-a')
        expect(blocco?.textContent).toContain('Rinominata · fork')
        const bottoni = blocco?.querySelectorAll('.real-session-item')
        expect(bottoni?.length).toBe(2)
    })

    it('REAL-SESSION-LIST-02 AL CONTRARIO: elenco vuoto svuota il blocco invece di lasciare righe vecchie', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: 'sess-1', taskId: 'storia-a', conclusa: false, avviataAlle: '2026-08-26T10:00:00.000Z' }] } },
        ])
        await runtime().aggiornaElencoSessioniReali()
        expect(document.querySelector('#realSessionsBlock')?.children.length).toBeGreaterThan(0)

        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } }])
        await runtime().aggiornaElencoSessioniReali()

        expect(document.querySelector('#realSessionsBlock')?.children.length).toBe(0)
    })

    it('REAL-SESSION-PASSA-01 passaASessione naviga a una sessione esistente e apre il suo stream', () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } }])

        runtime().passaASessione('sess-9', 'storia-z', 'Il mio nome')

        expect(FakeEventSource.instances).toHaveLength(1)
        expect(FakeEventSource.instances[0].url).toBe('/api/v1/sessions/sess-9/events')
        expect(runtime().realSessionState.id).toBe('sess-9')
    })

    it('REAL-SESSION-FORK-01 senza sessione attiva resta il comportamento demo (nessun POST)', async () => {
        const fetchMock = mockFetch([])
        await runtime().forkSession()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('REAL-SESSION-FORK-02 con sessione attiva chiama /fork e apre un nuovo stream', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-origine' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-fork' })
        expect(FakeEventSource.instances).toHaveLength(1)

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-origine/fork', corpo: { sessionId: 'sess-forked' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().forkSession()

        expect(FakeEventSource.instances).toHaveLength(2)
        expect(FakeEventSource.instances[1].url).toBe('/api/v1/sessions/sess-forked/events')
    })

    it('REAL-SESSION-RESUME-01 con sessione attiva chiama /resume e riparte SULLO STESSO id', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-riprendi' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-resume' })

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-riprendi/resume', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().resumeSession()

        expect(FakeEventSource.instances).toHaveLength(2)
        expect(FakeEventSource.instances[1].url).toBe('/api/v1/sessions/sess-riprendi/events')
        expect(runtime().realSessionState.id).toBe('sess-riprendi')
    })

    // ⛔⛔⛔ 27/8, owner: "non riesco ad avere una conversazione base col
    // modello" — submitPrompt() rifiutava SEMPRE un secondo messaggio con
    // una sessione reale avviata, anche a run CONCLUSO: il composer
    // diventava inutilizzabile dopo la primissima risposta.
    it('REAL-SESSION-RESUME-02 un follow-up su una sessione CONCLUSA chiama /resume con il messaggio, e lo mostra subito in chat', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-concluso' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-concluso' })
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'RunFinished', result: { detto: 'Fatto.' } }, generation)
        expect(runtime().realSessionState.eventoTerminaleVisto).toBe(true)

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-concluso/resume', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        expect(runtime().submitPrompt('Un\'altra domanda')).toBe(true)
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-concluso/resume', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ messaggio: "Un'altra domanda" }),
        }))
        expect(document.querySelector('#conversation')?.textContent).toContain("Un'altra domanda")
        expect(runtime().realSessionState.id).toBe('sess-concluso') // STESSO id, non una sessione nuova
    })

    // ⛔⛔⛔ 27/8, owner: "verifica che i messaggi... persistano dopo il
    // refresh" — riprodotto: un F5 perdeva OGNI follow-up per sempre, e
    // ripeteva il primo messaggio 3 volte — session-registry.mjs resume()
    // annunciava SEMPRE il task ORIGINALE, mai il nuovo messaggio: un
    // replay (nessun appendUserFollowUp ottimista l'ha già mostrato) non
    // aveva NESSUN evento da cui ricostruire il follow-up.
    it('REAL-SESSION-RESUME-04 un RunStarted di replay (seguito:true, MAI preceduto da un resumeSession ottimista) mostra il follow-up dal server', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'Primo messaggio' } }, generation)
        expect(runtime().realSessionState.followUpBubbleInAttesa).toBe(false) // nessun resumeSession() l'ha mai impostato

        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'Secondo messaggio dal server', seguito: true } }, generation)

        expect(document.querySelector('#conversation')?.textContent).toContain('Secondo messaggio dal server')
    })

    it('⛔ REAL-SESSION-RESUME-05 AL CONTRARIO: un RunStarted di replay MAI mostra il follow-up due volte se resumeSession lo ha già mostrato dal vivo', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-vivo' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-vivo' })
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'RunFinished', result: { detto: 'Fatto.' } }, generation)

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-vivo/resume', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        expect(runtime().submitPrompt('Domanda dal vivo')).toBe(true) // appendUserFollowUp ottimista + followUpBubbleInAttesa=true
        await new Promise((r) => setTimeout(r, 0))
        expect(document.querySelectorAll('#conversation .user-message').length).toBe(2) // task iniziale + follow-up ottimista, non 3

        // l'evento VERO arriva (stessa generazione, ancora consumabile visto che siamo nella stessa sessione)
        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'Domanda dal vivo', seguito: true } }, runtime().realSessionState.generation)

        expect(document.querySelectorAll('#conversation .user-message').length).toBe(2) // ANCORA 2 — non duplicato
        expect(runtime().realSessionState.followUpBubbleInAttesa).toBe(false) // consumato
    })

    it('⛔ REAL-SESSION-RESUME-03 AL CONTRARIO: un follow-up su una sessione ANCORA IN CORSO non chiama /resume — FASE D (28/8), va in coda per davvero', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-in-corso' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-in-corso' })
        expect(runtime().realSessionState.eventoTerminaleVisto).toBe(false) // nessun RunFinished ancora

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-in-corso/queue', corpo: { ok: true, posizione: 1 } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const fetchMock = vi.spyOn(window, 'fetch')
        const chiamateSuResume = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/resume')).length
        const chiamateSuQueue = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/queue')).length
        const primaResume = chiamateSuResume()

        expect(runtime().submitPrompt('Domanda mentre gira')).toBe(true)
        await new Promise((r) => setTimeout(r, 0))

        expect(chiamateSuResume()).toBe(primaResume) // zero chiamate a /resume — una sessione IN CORSO non le usa mai
        expect(chiamateSuQueue()).toBe(1) // la STRADA giusta per una sessione in corso, ORA reale
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Messaggio in coda')
    })

    it('⭐⭐⭐⭐ REAL-SESSION-QUEUE-01 FILO INTERO — FASE D (28/8): accodare mostra il banner (mai un bubble ancora), QueuedMessageDelivered mostra il bubble e svuota il banner', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-coda' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-coda' })
        const generation = runtime().realSessionState.generation

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-coda/queue', corpo: { ok: true, posizione: 1 } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        expect(runtime().submitPrompt('e adesso aggiungi anche i test')).toBe(true)
        await new Promise((r) => setTimeout(r, 0))

        // in coda, NON ancora un bubble — il modello non l'ha ancora visto
        expect(document.querySelector('#queuedMessage')?.classList.contains('show')).toBe(true)
        expect(document.querySelector('#queuedMessageText')?.textContent).toContain('e adesso aggiungi anche i test')
        const primaDelDelivered = document.querySelectorAll('#conversation .user-message').length

        runtime().handleRealEvent({ type: 'QueuedMessageDelivered', testo: 'e adesso aggiungi anche i test' }, generation)

        expect(document.querySelectorAll('#conversation .user-message').length).toBe(primaDelDelivered + 1) // ORA il bubble c'è
        expect(document.querySelector('#conversation')?.textContent).toContain('e adesso aggiungi anche i test')
        expect(document.querySelector('#queuedMessage')?.classList.contains('show')).toBe(false) // coda vuota: il banner sparisce da solo
    })

    it('⛔ REAL-SESSION-QUEUE-02 AL CONTRARIO — due messaggi accodati: il banner mostra "+1 altro" finché SOLO un QueuedMessageDelivered arriva', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-coda-2' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-coda-2' })
        const generation = runtime().realSessionState.generation

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-coda-2/queue', corpo: { ok: true, posizione: 1 } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        expect(runtime().submitPrompt('primo')).toBe(true)
        await new Promise((r) => setTimeout(r, 0))
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-coda-2/queue', corpo: { ok: true, posizione: 2 } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        expect(runtime().submitPrompt('secondo')).toBe(true)
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('#queuedMessageText')?.textContent).toContain('+1 altro')

        runtime().handleRealEvent({ type: 'QueuedMessageDelivered', testo: 'primo' }, generation)

        expect(document.querySelector('#conversation')?.textContent).toContain('primo')
        expect(document.querySelector('#queuedMessage')?.classList.contains('show')).toBe(true) // ANCORA visibile: "secondo" resta in coda
        expect(document.querySelector('#queuedMessageText')?.textContent).toContain('secondo')
        expect(document.querySelector('#queuedMessageText')?.textContent).not.toContain('+1 altro')
    })

    it('REAL-SESSION-SHELL-01 runDirectShell senza sessione attiva non chiama niente — rifiuto onesto, mai una finta esecuzione', async () => {
        const fetchMock = mockFetch([])
        await runtime().runDirectShell('echo x', false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('REAL-SESSION-SHELL-02 con sessione attiva chiama POST .../shell e apre una connessione FRESCA sullo STESSO id — mai quella vecchia', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-shell' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-shell' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-shell/shell', corpo: { ok: true } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().runDirectShell('npm test', false)

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-shell/shell',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ comando: 'npm test' }) }))
        expect(FakeEventSource.instances).toHaveLength(2)
        expect(FakeEventSource.instances[1].url).toBe('/api/v1/sessions/sess-shell/events')
        expect(runtime().realSessionState.id).toBe('sess-shell')
    })

    // ⛔ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md): la vista
    // Terminale non è più uno specchio dei tool-call `shell` dell'agente —
    // è una PTY vera, indipendente dal ciclo dell'agente, digitabile
    // dall'utente. Queste due prove (SHELL-03/04, prima "il tool-call
    // shell arriva anche nel Terminale") sono state RISCRITTE, non solo
    // fatte passare: verificano ora il contratto opposto, deliberato.
    it('⛔⛔ REAL-SESSION-SHELL-03 AL CONTRARIO: un tool-call "shell" dell\'AGENTE non monta/tocca più il Terminale REALE', () => {
        const generation = runtime().realSessionState.generation
        const primaMontato = runtime().statoTerminale().montato
        const primaWs = runtime().statoTerminale().ws
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ comando: 'echo prova' }) }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c1', content: 'exit 0 [sandbox: wsl2]\nprova\n' }, generation)

        // niente xterm montata, niente WebSocket aperta a vuoto per un tool-call dell'agente — resta un evento di chat, invariato lì.
        expect(runtime().statoTerminale().montato).toBe(primaMontato)
        expect(runtime().statoTerminale().ws).toBe(primaWs)
        expect(document.querySelector('#realTerminalMount')?.childElementCount ?? 0).toBe(0)
    })

    it('⛔ REAL-SESSION-SHELL-04 AL CONTRARIO: un tool-call diverso ("leggi") non tocca il Terminale REALE nemmeno lui — stessa indifferenza', () => {
        const generation = runtime().realSessionState.generation
        const primaMontato = runtime().statoTerminale().montato
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c2', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c2', content: 'contenuto del file' }, generation)

        expect(runtime().statoTerminale().montato).toBe(primaMontato)
    })

    /*
     * ⭐⭐⭐ 29/8 — owner, riferimento diretto al proprio Bash tool di
     * Claude Code: `descrizione` (nuova, opzionale, schema in
     * talosHarness.mjs) diventa la riga della bolla invece del comando
     * grezzo, quando il modello la manda.
     */
    it('⭐⭐⭐ REAL-SESSION-SHELL-06 un tool-call "shell" con descrizione mostra la descrizione nella riga RIASSUNTO (collassata), non il comando grezzo', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c-descr', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c-descr', delta: JSON.stringify({ comando: 'git diff --stat', descrizione: 'Mostra i file cambiati' }) }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c-descr', content: 'exit 0 [sandbox: wsl2]\n' }, generation)

        // ⭐ la riga RIASSUNTO (sempre visibile, collassata) mostra la descrizione — il comando grezzo resta comunque
        // raggiungibile nel dettaglio espandibile (.tool-note-detail, hidden finché non si clicca): non sparisce,
        // semplicemente non è più la prima cosa che si legge. Stesso equilibrio del Bash tool di Claude Code.
        const righe = [...document.querySelectorAll('.tool-note-summary-text')].map((el) => el.textContent)
        expect(righe.some((r) => r === 'Mostra i file cambiati')).toBe(true)
        expect(righe.some((r) => (r ?? '').includes('git diff --stat'))).toBe(false)
    })

    it('⛔ AL CONTRARIO — REAL-SESSION-SHELL-07 senza descrizione: PARITÀ, il comando grezzo resta la riga RIASSUNTO come oggi', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c-senza-descr', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c-senza-descr', delta: JSON.stringify({ comando: 'echo prova-parita' }) }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c-senza-descr', content: 'exit 0 [sandbox: wsl2]\nprova-parita\n' }, generation)

        const righe = [...document.querySelectorAll('.tool-note-summary-text')].map((el) => el.textContent)
        expect(righe.some((r) => r === 'Comando: echo prova-parita')).toBe(true)
    })

    // ⛔⛔ 28/8 — Terminale REALE: il reset al cambio sessione oggi significa
    // "chiudi la WebSocket della sessione precedente" (mai un output che
    // sopravvive al cambio) — non più "ripulisci un log testuale". jsdom
    // non ha una vera WebSocket: si inietta un finto oggetto con un
    // .close() osservabile, stesso principio "mai una rete vera nei test
    // unitari" già in uso in tutta questa suite (FakeEventSource sopra).
    it('⛔⛔ REAL-SESSION-SHELL-05 AL CONTRARIO: avviare una sessione NUOVA disconnette il Terminale REALE della sessione precedente', async () => {
        const t = runtime().statoTerminale()
        const chiudiChiamato = vi.fn()
        t.ws = { close: chiudiChiamato, readyState: 1 }
        t.idConnesso = runtime().realSessionState.id

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-nuova-pulita' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-nuova-pulita' })

        expect(chiudiChiamato).toHaveBeenCalledTimes(1)
        expect(runtime().statoTerminale().ws).toBeNull()
        expect(runtime().statoTerminale().idConnesso).toBeNull()
    })

    // ⛔⛔⛔ 27/8, trovato nell'ispezione visiva finale (owner: "IMPORTANTISSIMA"):
    // una sessione VERA senza nessuna scrittura mostrava ANCORA "3 file
    // modificati" con un diff rosso/verde — il markup demo di index.html,
    // mai sostituito perché renderRealReviewList()/aggiornaSommarioReviewReale()
    // partono solo da un vero StateDelta (una scrittura), mai da una sessione
    // che non ne fa nessuna. Stessa famiglia del difetto Terminale/Browser.
    it('⛔⛔ REAL-SESSION-REVIEW-01 AL CONTRARIO: una sessione senza nessuna scrittura mostra "0 file modificati", mai il demo mai ripulito', async () => {
        const delta = [{ op: 'add', path: '/file/src/nuovo.mjs', value: 'export const x = 1;' }]
        runtime().handleRealEvent({ type: 'StateDelta', delta }, runtime().realSessionState.generation)
        expect(document.querySelector('[data-view="diff"] h2')?.textContent).toContain('1 file')

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-solo-domanda' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-solo-domanda' })

        expect(document.querySelector('[data-view="diff"] h2')?.textContent).toContain('0 file')
        expect(document.querySelector('[data-view="diff"] .file-review-list')?.children.length).toBe(0)
        expect(document.querySelector('#reviewSummaryNuovi')?.textContent).toBe('0')
        expect(document.querySelector('#reviewSummaryModificati')?.textContent).toBe('0')
    })

    it('REAL-SESSION-COMPACT-01 con sessione attiva chiama /compact senza aprire nessuno stream nuovo', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-compatta' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-compact' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-compatta/compact', corpo: { compattato: true } },
        ])
        await runtime().compactSession()

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-compatta/compact', expect.objectContaining({ method: 'POST' }))
        expect(FakeEventSource.instances).toHaveLength(1) // nessun giro nuovo avviato
    })

    /*
     * ⛔⛔⛔ Riconciliazione Fase 2 (piano procedi-col-generare-un-snoopy-neumann.md,
     * 27/8) — trovato dal vivo: il command palette (⌘K) mostrava sempre lo
     * stesso toast finto per "compatta"/"fork", ANCHE con una sessione
     * reale attiva, perché non chiamava mai le funzioni vere. Buco senza
     * un test dedicato prima di questo giro — ecco perché è passato
     * inosservato: REAL-SESSION-COMPACT-01 sopra chiama compactSession()
     * direttamente, mai attraverso il palette.
     */
    it('⭐⭐⭐ PALETTE-COMPACT-01: executeCommand(\'compact\') con sessione attiva chiama /compact per davvero, non il toast finto', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-palette-compatta' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-compact-palette' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-palette-compatta/compact', corpo: { compattato: true } },
        ])
        runtime().executeCommand('compact')
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-palette-compatta/compact', expect.objectContaining({ method: 'POST' }))
    })

    /*
     * ⭐⭐⭐ FASE M (29/8) — 'resume' non aveva NEMMENO un caso nel
     * palette: resumeSession() esisteva, testata, ma raggiungibile solo
     * scrivendo un messaggio (submitPrompt) o mai da un umano. Stesso
     * principio del test COMPACT/FORK sopra: verificare che il comando
     * chiami la funzione VERA, non solo che la funzione esista.
     */
    it('⭐⭐⭐ PALETTE-RESUME-01: executeCommand(\'resume\') con sessione attiva chiama /resume per davvero', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-palette-riprendi' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-resume-palette' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-palette-riprendi/resume', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        runtime().executeCommand('resume')
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-palette-riprendi/resume', expect.objectContaining({ method: 'POST' }))
    })

    /*
     * ⭐⭐⭐ FASE M (29/8) — i due nuovi bottoni della topbar. Stesso
     * principio: un bottone visibile che non chiama niente di vero è
     * peggio di un bottone assente, vedi la nota gemella sul palette.
     */
    it('⭐⭐⭐ TOPBAR-RESUME-01: il bottone Riprendi della topbar chiama /resume per davvero', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-topbar-riprendi' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-resume-topbar' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-topbar-riprendi/resume', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        ;(document.querySelector('#resumeSessionBtn') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-topbar-riprendi/resume', expect.objectContaining({ method: 'POST' }))
    })

    it('⭐⭐⭐ TOPBAR-COMPACT-01: il bottone Comprimi della topbar chiama /compact per davvero', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-topbar-compatta' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-compact-topbar' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-topbar-compatta/compact', corpo: { compattato: true } },
        ])
        ;(document.querySelector('#compactSessionBtn') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-topbar-compatta/compact', expect.objectContaining({ method: 'POST' }))
    })

    it('⭐⭐⭐ PALETTE-FORK-01: executeCommand(\'fork\') con sessione attiva chiama /fork per davvero, non il toast finto', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-palette-fork' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-fork-palette' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-palette-fork/fork', corpo: { sessionId: 'sess-palette-fork-2' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        runtime().executeCommand('fork')
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/sess-palette-fork/fork', expect.objectContaining({ method: 'POST' }))
    })

    it('⛔ AL CONTRARIO: executeCommand(\'compact\'/\'fork\') SENZA sessione reale non chiama nessun fetch (resta il toast demo)', async () => {
        const fetchMock = mockFetch([])
        runtime().executeCommand('compact')
        runtime().executeCommand('fork')
        await new Promise((r) => setTimeout(r, 0))
        expect(fetchMock).not.toHaveBeenCalled()
    })

    /**
     * ⭐⭐⭐ 28/8 — owner: "una modale di esportazione in diversi formati, in
     * modo che se c'è qualche errore io ti possa esportare interamente la
     * conversazione con errori e output tecnici". Due gruppi di prove:
     * (A) costruisciTrascrizioneMarkdown come funzione pura, un caso per
     * ogni garanzia che conta davvero; (B) il foglio vero, aperto da
     * executeCommand('export') come ogni altro comando della palette.
     */
    describe('Esporta sessione — modale multi-formato', () => {
        it('EXPORT-MD-01: la trascrizione porta OGNI evento — testo, tool-call con esito MAI troncato (a differenza della UI dal vivo, che tronca a 4000 caratteri)', () => {
            const esitoLungo = 'x'.repeat(5000) // più lungo del tetto di 4000 usato da ToolCallResult in handleRealEvent
            const md = runtime().costruisciTrascrizioneMarkdown({
                sessionId: 'sess-md-1', nome: 'Prova export', modello: 'z-ai/glm-4.7-flash',
                avviataAlle: '2026-08-28T10:00:00.000Z', conclusa: true, forkDa: null,
                eventi: [
                    { type: 'RunStarted', input: { consegna: 'Scrivi una funzione somma()' } },
                    { type: 'TextMessageContent', messageId: 'm1', delta: 'Fatto, ' },
                    { type: 'TextMessageContent', messageId: 'm1', delta: 'ecco il codice.' },
                    { type: 'TextMessageEnd', messageId: 'm1' },
                    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'scrivi' },
                    { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"percorso":"somma.js"' },
                    { type: 'ToolCallArgs', toolCallId: 'c1', delta: ',"contenuto":"..."}' },
                    { type: 'ToolCallResult', toolCallId: 'c1', content: esitoLungo },
                    { type: 'RunFinished', outcome: { type: 'success' } },
                ],
            })
            expect(md).toContain('sess-md-1')
            expect(md).toContain('z-ai/glm-4.7-flash')
            expect(md).toContain('Scrivi una funzione somma()')
            expect(md).toContain('Fatto, ecco il codice.')
            expect(md).toContain('scrivi')
            expect(md).toContain('somma.js')
            expect(md).toContain(esitoLungo) // per intero: niente slice(0, 4000)
            expect(md).toContain('giro concluso')
        })

        it('EXPORT-MD-02: un RunError porta codice e messaggio per intero, mai riassunti', () => {
            const messaggioLungo = `Errore reale: ${'dettaglio '.repeat(100)}`
            const md = runtime().costruisciTrascrizioneMarkdown({
                sessionId: 'sess-md-err', nome: null, modello: null, avviataAlle: '2026-08-28T10:00:00.000Z',
                conclusa: true, forkDa: null,
                eventi: [{ type: 'RunError', code: 'GIRI_ESAURITI', message: messaggioLungo }],
            })
            expect(md).toContain('GIRI_ESAURITI')
            expect(md).toContain(messaggioLungo)
        })

        /*
         * ⛔ 28/8 — trovato da una verifica dal vivo (screenshot + file
         * scaricato per davvero, non un fixture a mano): TextMessageStart e
         * ReasoningMessageStart finivano nel ramo "evento non riconosciuto"
         * — non un dato perso, ma rumore vero in ogni singola trascrizione,
         * perché OGNI messaggio/ragionamento reale parte con uno di questi
         * due eventi. Regressione con la sequenza ESATTA vista dal vivo.
         */
        it('⛔ EXPORT-MD-02-BIS: TextMessageStart/ReasoningMessageStart sono eventi CONOSCIUTI — mai "evento non riconosciuto"', () => {
            const md = runtime().costruisciTrascrizioneMarkdown({
                sessionId: 'sess-md-start', nome: null, modello: null, avviataAlle: '2026-08-28T10:00:00.000Z',
                conclusa: true, forkDa: null,
                eventi: [
                    { type: 'ReasoningMessageStart', messageId: 'r1', role: 'reasoning' },
                    { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'penso...' },
                    { type: 'ReasoningMessageEnd', messageId: 'r1' },
                    { type: 'TextMessageStart', messageId: 't1', role: 'assistant' },
                    { type: 'TextMessageContent', messageId: 't1', delta: '42' },
                    { type: 'TextMessageEnd', messageId: 't1' },
                ],
            })
            expect(md).not.toContain('non riconosciuto')
            expect(md).toContain('42')
            expect(md).toContain('penso...')
        })

        it('⛔⛔ EXPORT-MD-03 AL CONTRARIO: un tipo di evento MAI visto prima non sparisce — finisce nell\'output come JSON grezzo', () => {
            const md = runtime().costruisciTrascrizioneMarkdown({
                sessionId: 'sess-md-ignoto', nome: null, modello: null, avviataAlle: '2026-08-28T10:00:00.000Z',
                conclusa: false, forkDa: null,
                eventi: [{ type: 'FuturoEventoMaiVisto', dettaglio: 'valore-sentinella-9137' }],
            })
            expect(md).toContain('FuturoEventoMaiVisto')
            expect(md).toContain('valore-sentinella-9137')
        })

        it('⛔ EXPORT-MD-04 AL CONTRARIO: zero eventi produce un avviso esplicito, mai una stringa vuota', () => {
            const md = runtime().costruisciTrascrizioneMarkdown({
                sessionId: 'sess-md-vuota', nome: null, modello: null, avviataAlle: '2026-08-28T10:00:00.000Z',
                conclusa: false, forkDa: null, eventi: [],
            })
            expect(md.trim().length).toBeGreaterThan(0)
            expect(md).toContain('Nessun evento')
        })

        it('⭐⭐⭐ EXPORT-MD-05: ApprovalRequested/ApprovalResolved (permesso "On request") sono eventi CONOSCIUTI nella trascrizione, con l\'azione vera', () => {
            const md = runtime().costruisciTrascrizioneMarkdown({
                sessionId: 'sess-md-approval', nome: null, modello: null, avviataAlle: '2026-08-28T10:00:00.000Z',
                conclusa: true, forkDa: null,
                eventi: [
                    { type: 'ApprovalRequested', requestId: 'r1', azione: { tipo: 'shell', comando: 'npm install' } },
                    { type: 'ApprovalResolved', requestId: 'r1', approvato: true },
                ],
            })
            expect(md).not.toContain('non riconosciuto')
            expect(md).toContain('npm install')
            expect(md).toContain('CONCESSA')
        })

        it('⭐⭐⭐ EXPORT-SHEET-01: con sessione reale, executeCommand(\'export\') apre il foglio di scelta formato — non un download istantaneo', async () => {
            mockFetch([
                { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-export-sheet' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            ])
            await runtime().startRealSession({ id: 'storia-export-sheet' })
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()

            runtime().executeCommand('export')

            expect(sheetDialog.hasAttribute('open')).toBe(true)
            expect(document.querySelector('[data-export-choice="markdown"]')).not.toBeNull()
            expect(document.querySelector('[data-export-choice="json"]')).not.toBeNull()
            expect(sheetDialog.querySelector('.demo-surface-badge')?.hasAttribute('hidden')).toBe(true) // foglio interamente onesto — badge condiviso, va cercato DENTRO sheetDialog (14 superfici lo condividono nel resto della pagina)
        })

        it('⛔ EXPORT-SHEET-02 AL CONTRARIO: SENZA sessione reale, executeCommand(\'export\') NON apre il foglio — resta il download demo diretto', () => {
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()
            // jsdom non garantisce URL.createObjectURL: stessa cura di
            // EXPORT-SHEET-03, qui solo per non far dipendere l'esito da un
            // dettaglio d'ambiente estraneo a ciò che la prova vuole verificare.
            const origCreate = URL.createObjectURL
            URL.createObjectURL = vi.fn(() => 'blob:fake')
            const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

            try {
                runtime().executeCommand('export')

                expect(sheetDialog.hasAttribute('open')).toBe(false)
                expect(clickSpy).toHaveBeenCalled() // il vecchio percorso demo, invariato
            } finally {
                URL.createObjectURL = origCreate
            }
        })

        it('⭐⭐⭐ EXPORT-SHEET-03: scegliere "JSON completo" chiama GET .../export e scarica il payload vero, byte per byte', async () => {
            mockFetch([
                { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-export-json' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            ])
            await runtime().startRealSession({ id: 'storia-export-json' })
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()
            runtime().executeCommand('export')

            const payloadVero = { schema: 'talos.harness-ui.session-export.v1', sessionId: 'sess-export-json', eventi: [{ type: 'RunFinished' }] }
            mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions/sess-export-json/export', corpo: payloadVero }])
            const blobParts: unknown[][] = []
            class FakeBlob { constructor(parts: unknown[]) { blobParts.push(parts) } }
            vi.stubGlobal('Blob', FakeBlob)
            // ⛔ NON vi.stubGlobal('URL', ...): sostituirebbe l'intero costruttore
            // URL (usato altrove per il parsing indirizzi), non solo i due
            // metodi statici che scaricaTesto() chiama davvero — si salvano e
            // ripristinano SOLO quelli.
            const origCreate = URL.createObjectURL
            const origRevoke = URL.revokeObjectURL
            URL.createObjectURL = vi.fn(() => 'blob:fake')
            URL.revokeObjectURL = vi.fn()
            const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

            try {
                document.querySelector<HTMLButtonElement>('[data-export-choice="json"]')!.click()
                await new Promise((r) => setTimeout(r, 0))

                expect(clickSpy).toHaveBeenCalled()
                expect(JSON.parse(String(blobParts[0][0]))).toEqual(payloadVero)
                expect(sheetDialog.hasAttribute('open')).toBe(false) // il foglio si chiude dopo un export riuscito
                expect(document.querySelector('#toastRegion')?.textContent).toContain('esportata')
            } finally {
                URL.createObjectURL = origCreate
                URL.revokeObjectURL = origRevoke
            }
        })

        it('⛔⛔ EXPORT-SHEET-04 AL CONTRARIO: un export vuoto non scarica MAI un file silenzioso — tocca il toast di errore', async () => {
            mockFetch([
                { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-export-vuota' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            ])
            await runtime().startRealSession({ id: 'storia-export-vuota' })
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()
            runtime().executeCommand('export')

            // stesso principio del bug reale trovato nell'/export di Claude Code
            // (vedi il commento su costruisciTrascrizioneMarkdown): un payload che
            // serializza a stringa vuota (qui: `data` assente dalla busta, quindi
            // apiGet torna `undefined`, e JSON.stringify(undefined) è `undefined`,
            // non una stringa) non deve MAI passare per un successo.
            mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions/sess-export-vuota/export', corpo: undefined }])
            const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

            document.querySelector<HTMLButtonElement>('[data-export-choice="json"]')!.click()
            await new Promise((r) => setTimeout(r, 0))

            expect(clickSpy).not.toHaveBeenCalled()
            expect(document.querySelector('#toastRegion')?.textContent).toContain('non riuscita')
        })
    })

    /*
     * ⭐⭐⭐ 28/8 — owner: "rinominare automaticamente il titolo della
     * sessione con il primo messaggio inviato (già fatto su mobile per
     * la chat, non bisogna inventare nulla)". Porting di titleFromPrompt
     * (mobile/src/stores/chat.ts) — vedi titoloDalPrimoMessaggio.
     */
    describe('Titolo sessione auto-rinominato dal primo messaggio', () => {
        it('⭐⭐⭐ TITOLO-01: titoloDalPrimoMessaggio collassa spazi multipli, fa il trim, e taglia a 80 caratteri (NON 255 — il tetto vero di rinomina())', () => {
            expect(runtime().titoloDalPrimoMessaggio('  aggiungi   una   funzione   sottrai(a,b)  ')).toBe('aggiungi una funzione sottrai(a,b)')
            expect(runtime().titoloDalPrimoMessaggio('riga uno\nriga due\tcon tab')).toBe('riga uno riga due con tab')
            const lungo = 'x'.repeat(200)
            expect(runtime().titoloDalPrimoMessaggio(lungo).length).toBe(80)
        })

        it('⭐⭐⭐ TITOLO-02: avviare un compito libero rinomina DAVVERO la sessione col primo messaggio — POST .../rename con la consegna pulita', async () => {
            mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } }])
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()
            await runtime().openRealTaskSheet()
            document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))

            const fetchMock = mockFetch([
                { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-titolo' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                { metodo: 'POST', percorso: '/api/v1/sessions/sess-titolo/rename', corpo: { ok: true } },
            ])
            const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
            composerInput.value = '  aggiungi   una funzione sottrai(a, b)  '
            document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))

            expect(fetchMock).toHaveBeenCalledWith(
                '/api/v1/sessions/sess-titolo/rename',
                expect.objectContaining({ method: 'POST', body: JSON.stringify({ nome: 'aggiungi una funzione sottrai(a, b)' }) }),
            )
            expect(document.querySelector('#sessionTitle')?.textContent).toBe('aggiungi una funzione sottrai(a, b)')
        })

        it('⛔⛔ TITOLO-03 AL CONTRARIO: un rename fallito NON rompe la sessione — nessun toast, nessun errore, resta usabile', async () => {
            mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } }])
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()
            await runtime().openRealTaskSheet()
            document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))

            mockFetch([
                { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-titolo-fail' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                { metodo: 'POST', percorso: '/api/v1/sessions/sess-titolo-fail/rename', corpo: { code: 'QUERY_INVALID' }, ok: false, status: 400 },
            ])
            const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
            composerInput.value = 'un messaggio qualunque'
            document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))

            expect(FakeEventSource.instances.at(-1)?.url).toBe('/api/v1/sessions/sess-titolo-fail/events') // la sessione è comunque partita
            expect(document.querySelector('#toastRegion')?.textContent ?? '').not.toContain('rename')
            expect(document.querySelector('#toastRegion')?.textContent ?? '').not.toContain('rinomina')
        })

        it('⛔⛔⛔ TITOLO-04 AL CONTRARIO: se una sessione NUOVA parte prima che il rename della vecchia risponda, il titolo vecchio non si applica MAI alla nuova', async () => {
            mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } }])
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()
            await runtime().openRealTaskSheet()
            document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))

            // ⛔ oggetto-contenitore, non un `let` nudo: TypeScript restringe il tipo di un `let` riassegnato dentro una closure annidata (l'executor di `new Promise`) fino a renderlo `never` al punto d'uso — un difetto noto della narrowing su chiusure, non del test.
            const rifRename: { risolvi: (() => void) | null } = { risolvi: null }
            const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
                const url = typeof input === 'string' ? input : String(input)
                const metodo = (init?.method ?? 'GET').toUpperCase()
                if (metodo === 'POST' && url === '/api/v1/sessions/custom') {
                    return new Response(JSON.stringify({ ok: true, data: { sessionId: 'sess-vecchia' } }), { status: 200 })
                }
                if (metodo === 'GET' && url.split('?')[0] === '/api/v1/sessions') {
                    return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
                }
                if (metodo === 'POST' && url === '/api/v1/sessions/sess-vecchia/rename') {
                    return new Promise<Response>((resolve) => { rifRename.risolvi = () => resolve(new Response(JSON.stringify({ ok: true, data: { ok: true } }), { status: 200 })) })
                }
                throw new Error(`nessuna risposta finta per ${metodo} ${url}`)
            })
            const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
            composerInput.value = 'messaggio della sessione vecchia'
            document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))
            // ⛔ il rename della sessione VECCHIA è ancora in sospeso qui (risolviRename non ancora chiamato) — esattamente il momento in cui una NUOVA sessione può partire. Aprire "Nuova sessione" di nuovo chiama nuovaGenerazioneSessione() DA SOLO, dentro startCustomSession (prima riga della funzione) — non serve toccarla a mano.
            fetchMock.mockRestore()
            mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } }])
            await runtime().openRealTaskSheet()
            document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))
            mockFetch([
                { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-nuova' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
                { metodo: 'POST', percorso: '/api/v1/sessions/sess-nuova/rename', corpo: { ok: true } },
            ])
            composerInput.value = 'messaggio della sessione NUOVA'
            document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
            await new Promise((r) => setTimeout(r, 0))

            // ⭐ ORA la vecchia risposta di rename arriva, tardiva — non deve scavalcare il titolo della sessione nuova già a schermo.
            rifRename.risolvi?.()
            await new Promise((r) => setTimeout(r, 0))

            expect(document.querySelector('#sessionTitle')?.textContent).toBe('messaggio della sessione NUOVA')
        })
    })

    /*
     * ⛔⛔⛔ Riconciliazione Fase 2, 27/8 — trovato dal vivo: il foglio
     * "Rinomina sessione" mutava solo lo stato client, l'endpoint reale
     * (`POST .../rename`, già scritto e già provato lato backend) non
     * veniva MAI chiamato — il nome tornava a quello vecchio a ogni
     * ricostruzione della sidebar/refresh pagina.
     */
    it('⭐⭐⭐ PALETTE-RENAME-01: il foglio rinomina, con sessione attiva, chiama /rename per davvero', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-palette-rename' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-rename-palette' })

        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        runtime().executeCommand('rename')

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-palette-rename/rename', corpo: { ok: true } },
        ])
        const input = document.querySelector<HTMLInputElement>('#renameSessionInput')!
        input.value = 'Nome scelto dal vivo'
        document.querySelector<HTMLFormElement>('#renameSessionForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/sessions/sess-palette-rename/rename',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ nome: 'Nome scelto dal vivo' }) }),
        )
    })

    it('⛔ AL CONTRARIO: il foglio rinomina SENZA sessione reale non chiama nessun fetch (resta il rename solo-client, demo)', async () => {
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        runtime().executeCommand('rename')

        const fetchMock = mockFetch([])
        const input = document.querySelector<HTMLInputElement>('#renameSessionInput')!
        input.value = 'Nome demo'
        document.querySelector<HTMLFormElement>('#renameSessionForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalled()
    })

    /**
     * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 — lo
     * stesso cancello di REAL-SESSION-AUTOMATION-03, ma sul bottone "Nuova
     * sessione" vero (#newSessionBtn -> createNewSession()): col tunnel
     * attivo apre il foglio dei task veri, non più il reset demo.
     *
     * ⛔ Riconciliazione Fase 1 (branch merge, 27/8): l'endpoint atteso qui
     * era `/api/v1/tasks`, scritto PRIMA che l'owner chiedesse di togliere
     * l'elenco corpus dalla modale "Nuova sessione" (vedi il commento sopra
     * REAL-SESSION-TASKSHEET-01 sotto). `createNewSession()` chiama
     * `openRealTaskSheet()`, che oggi fetcha `/api/v1/projects` — corretto
     * qui per restare vero contro il codice attuale, non contro quello di
     * quando l'ho scritto.
     */
    it('NEWSESSION-EMBEDDED-01 col tunnel attivo, "Nuova sessione" apre il foglio dei task veri (GET /api/v1/projects), non il reset demo', async () => {
        document.documentElement.classList.add('talos-embedded')
        ;(window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase = 'http://localhost:4174'
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: 'http://localhost:4174/api/v1/projects', corpo: { items: [] } },
        ])

        ;(document.querySelector('#newSessionBtn') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:4174/api/v1/projects', expect.objectContaining({ method: 'GET' }))
    })

    it('⛔ NEWSESSION-EMBEDDED-02 AL CONTRARIO: stesso bottone, embedded SENZA tunnel resta il reset demo, zero fetch', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = mockFetch([])

        ;(document.querySelector('#newSessionBtn') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalled()
    })

    // ⛔ 27/8 — owner: "quando faccio nuova dalla modale devi levare tutte
    // le prove per banco". openRealTaskSheet() non elenca più i task del
    // corpus (rimossi da app.js): fetcha SOLO /api/v1/projects e mostra
    // il form "Compito libero" — stesso pattern di Claude Code/Codex/
    // Cline/Aider (nessun elenco predefinito, testo libero).
    // ⛔⛔ 27/8, secondo giro — owner: "nella modale nuova sessione non deve
    // esserci il campo text per cosa chiedere, quello si fa direttamente da
    // interfaccia chat". La modale ora chiede SOLO cartella+modello; il
    // compito si scrive nel composer normale, che avvia la sessione vera.
    it('REAL-SESSION-TASKSHEET-01 openRealTaskSheet chiede SOLO cartella+modello (non i task del banco, non un campo compito) e il primo messaggio in chat avvia la sessione vera', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        const showModalSpy = vi.fn()
        sheetDialog.showModal = showModalSpy

        await runtime().openRealTaskSheet()

        expect(showModalSpy).not.toHaveBeenCalled()
        expect(sheetDialog.hasAttribute('open')).toBe(true)
        expect(document.querySelector('[data-start-task]')).toBeNull() // nessuna prova per banco
        const form = document.querySelector<HTMLFormElement>('#customTaskForm')
        expect(form).not.toBeNull()
        const cartellaSelect = document.querySelector<HTMLSelectElement>('#customTaskCartella')
        expect(cartellaSelect?.options.length).toBe(1)
        expect(document.querySelector('.model-picker')).not.toBeNull() // il picker del modello è nella modale
        expect(document.querySelector('#customTaskConsegna')).toBeNull() // niente campo compito qui

        form!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        // la modale si chiude, ma NESSUNA sessione è ancora partita — solo cartella+modello sono in attesa
        expect(sheetDialog.hasAttribute('open')).toBe(false)
        expect(FakeEventSource.instances.length).toBe(0)
        expect(document.querySelector('#conversationEmptyState')?.textContent).toContain('Progetto di prova')

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-libero' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'aggiungi una funzione sottrai(a, b)'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        expect(FakeEventSource.instances.at(-1)?.url).toBe('/api/v1/sessions/sess-libero/events')
    })

    /*
     * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, owner: "read only/workspace write/
     * on request/full access". Ricerca fatta prima di scrivere (REGOLA
     * ZERO, e HERMES AGENT è il primo competitor — vedi memoria
     * [[harness-da-battere-uno-a-uno]]: la sua stessa doc dichiara
     * "there is no approval prompt and no way to override from the chat
     * UI" — la card di approvazione sotto è il pareggio-e-supera diretto).
     *
     * La scelta del permesso passa dalla pillola VERA del composer
     * (`[data-open-sheet="permissions"]` → foglio → click), non da uno
     * stato interno forzato a mano: esercita lo stesso percorso che un
     * owner vero userebbe.
     */
    function sceglierPermesso(nome: string): void {
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        document.querySelector<HTMLButtonElement>('[data-open-sheet="permissions"]')!.click()
        document.querySelector<HTMLButtonElement>(`[data-permission-choice="${nome}"]`)!.click()
    }

    it('⭐⭐⭐ PERMESSI-01: "Full access" scelto dalla pillola sostituisce il select cartella con un campo percorso libero', async () => {
        sceglierPermesso('Full access')
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        // ⭐ 28/8 — NON più "nessuna chiamata": /api/v1/frequent-dirs (le scorciatoie Desktop/Download) è l'UNICA, best-effort — mai /api/v1/projects, "Full access" non usa l'allowlist. Vedi FREQUENTI-01/02/03 per quella funzione nello specifico.
        const fetchMock = mockFetch([{ metodo: 'GET', percorso: '/api/v1/frequent-dirs', corpo: { items: [] } }])

        await runtime().openRealTaskSheet()

        expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/projects', expect.anything())
        expect(document.querySelector('#customTaskCartella')).toBeNull()
        const inputLibera = document.querySelector<HTMLInputElement>('#customTaskCartellaLibera')
        expect(inputLibera).not.toBeNull()
        expect(document.querySelector('.model-picker')).not.toBeNull() // il resto della modale resta identico
    })

    it('⭐⭐⭐ PERMESSI-02: sottomettere il percorso libero avvia startCustomSession con cartellaLibera+permessi nel corpo, MAI cartellaId', async () => {
        sceglierPermesso('Full access')
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        mockFetch([])
        await runtime().openRealTaskSheet()

        const input = document.querySelector<HTMLInputElement>('#customTaskCartellaLibera')!
        input.value = 'C:/Users/prova/progetto-libero'
        document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-full-access' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'fai qualcosa'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        const corpoInviato = JSON.parse((fetchMock.mock.calls.find(([url]) => url === '/api/v1/sessions/custom')![1] as RequestInit).body as string)
        expect(corpoInviato.cartellaLibera).toBe('C:/Users/prova/progetto-libero')
        expect(corpoInviato.cartellaId).toBeUndefined()
        expect(corpoInviato.permessi).toBe('Full access')
    })

    it('⭐⭐ PERMESSI-03: senza scegliere "Full access", il corpo porta comunque permessi ("Workspace write", il default)', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        await runtime().openRealTaskSheet()
        document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-default' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'fai qualcosa'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        const corpoInviato = JSON.parse((fetchMock.mock.calls.find(([url]) => url === '/api/v1/sessions/custom')![1] as RequestInit).body as string)
        expect(corpoInviato.permessi).toBe('Workspace write')
        expect(corpoInviato.cartellaId).toBe('proj-1')
    })

    /*
     * ⭐⭐⭐ 28/8 — owner, coda: "nella lista file quando si crea una
     * sessione, bisogna mettere directory più usate (tipo desktop
     * downloads etc)". Scorciatoie SOLO nel campo "Full access": mai
     * una seconda allowlist, vedi la doc di frequent-dirs.mjs.
     */
    it('⭐⭐⭐ FREQUENTI-01: con "Full access", il campo percorso mostra le scorciatoie vere, e cliccarne una lo riempie', async () => {
        sceglierPermesso('Full access')
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/frequent-dirs', corpo: { items: [{ etichetta: 'Desktop', percorso: 'C:/Users/prova/Desktop' }, { etichetta: 'Download', percorso: 'C:/Users/prova/Downloads' }] } }])

        await runtime().openRealTaskSheet()

        const chip = [...document.querySelectorAll<HTMLButtonElement>('.sheet-shortcut-chip')]
        expect(chip.map((c) => c.textContent)).toEqual(['Desktop', 'Download'])
        chip[1].click()
        expect(document.querySelector<HTMLInputElement>('#customTaskCartellaLibera')?.value).toBe('C:/Users/prova/Downloads')
    })

    it('⛔⛔ FREQUENTI-02 AL CONTRARIO: SENZA "Full access", nessuna chiamata a /frequent-dirs — non serve, il campo non esiste nemmeno', async () => {
        const fetchMock = mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } }])
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()

        await runtime().openRealTaskSheet()

        expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/frequent-dirs', expect.anything())
        expect(document.querySelector('.sheet-shortcut-chip')).toBeNull()
    })

    it('⛔⛔⛔ FREQUENTI-03 AL CONTRARIO: /frequent-dirs che fallisce non rompe "Full access" — il campo percorso resta usabile, solo senza scorciatoie', async () => {
        sceglierPermesso('Full access')
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        mockFetch([]) // nessuna risposta finta per /frequent-dirs: mockFetch lancia, come una rete giù per davvero

        await runtime().openRealTaskSheet()

        expect(document.querySelector('#customTaskCartellaLibera')).not.toBeNull()
        expect(document.querySelector('.sheet-shortcut-chip')).toBeNull()
    })

    /*
     * ⛔⛔⛔ 28/8 — BUG REALE trovato dalla verifica DAL VIVO (screenshot) della
     * feature scorciatoie sopra, non da un test — vedi la regola "screenshot
     * obbligatorio e fonte di anomalie". Uno script CDP con 150ms fra "scegli
     * Full access dalla pillola" e "apri Nuova sessione" (la sequenza che
     * RADICE-01 sotto esegue in un solo giro sincrono, e che uno script di
     * verifica veloce può comprimere) mostrava NESSUN dialog visibile,
     * nonostante ogni controllo DOM avesse successo.
     *
     * Misurato con una sonda millisecondo-per-millisecondo (mai un'ipotesi):
     * a 150ms dal click sulla scelta di permesso, sheetDialog era ANCORA a
     * metà della sua animazione di chiusura (classe motion-exit, opacity
     * ~0,3 — closeEmbeddedDialog/animateExit dura ~180ms via WAAPI).
     * openRealTaskSheet() lo riapre (open resta true), ma la VECCHIA
     * callback di chiusura arriva comunque ~30ms dopo (quando la SUA
     * animazione, mai cancellata, raggiunge il naturale compimento):
     * controllava solo `dialog.open` — vero — e lo richiudeva in silenzio.
     * 25ms dopo: open:false, display:none, per sempre.
     *
     * Cura in app.js, due parti: `cancelMotionAnimationsFor(dialog)` in
     * showEmbeddedDialog ferma SUBITO l'animazione di chiusura bloccata a
     * metà quando l'elemento viene riaperto; e un contatore esplicito
     * `motionGenerazione`/`prossimaGenerazione()` (non la classe CSS
     * motion-enter — una prima versione di questa cura usava quella,
     * bocciata perché jsdom non emette mai l'evento `animationend` che la
     * rimuove, quindi restava "vera" per sempre nei test e bloccava anche
     * chiusure legittime successive) fa sì che closeEmbeddedDialog (e il
     * gemello syncEmbeddedDialogBackdrop) chiudano solo se NESSUNA
     * riapertura più recente dello stesso elemento è avvenuta nel
     * frattempo — sheetDialog monta 13 tipi di foglio diversi sullo stesso
     * nodo condiviso.
     *
     * Riprodotto qui mockando Element.prototype.animate con un resolver
     * manuale (stesso pattern di CODE-MOTION-EXIT-01 in
     * harnessUiFrontend.test.ts) — jsdom non implementa affatto
     * Element.prototype.animate di default (verificato: `undefined`), motivo
     * per cui nessun test precedente aveva mai potuto incontrare questa
     * corsa. Verificato AL CONTRARIO due volte prima di fissare la cura:
     * senza alcuna guardia il test fallisce (sheetDialog.open torna false
     * dopo la risoluzione tardiva); con la prima versione (classe CSS) il
     * test passava ma ROMPEVA 5 altri test della suite (chiusure legittime
     * mai più permesse) — la versione a contatore non ha questo effetto.
     */
    it('⛔⛔⛔ DIALOG-RACE-01: una chiusura in corso non richiude un foglio riaperto nel frattempo per un contenuto diverso', async () => {
        const originalAnimate = Element.prototype.animate
        const pendenti: Array<() => void> = []
        Object.defineProperty(Element.prototype, 'animate', {
            configurable: true,
            value: function mockAnimate(this: Element) {
                let risolviRef: () => void = () => {}
                const finished = new Promise<void>((risolvi) => { risolviRef = risolvi })
                pendenti.push(risolviRef)
                return { cancel: vi.fn(), finished, effect: { target: this } }
            },
        })

        try {
            mockFetch([{ metodo: 'GET', percorso: '/api/v1/frequent-dirs', corpo: { items: [] } }])
            sceglierPermesso('Full access') // apre il foglio permessi, poi lo chiude scegliendo Full access — closeEmbeddedDialog avvia QUI l'animazione mockata, mai ancora risolta
            const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
            sheetDialog.showModal = vi.fn()
            expect(sheetDialog.open).toBe(true) // la vecchia chiusura non ha ancora effetto: l'animazione mockata non si è mai risolta
            expect(pendenti).toHaveLength(1)

            await runtime().openRealTaskSheet() // riapre LO STESSO elemento per un contenuto diverso, PRIMA che la vecchia chiusura sia arrivata a compimento

            expect(sheetDialog.open).toBe(true)
            expect(sheetDialog.className).not.toContain('motion-exit')
            expect(document.querySelector('#customTaskCartellaLibera')).not.toBeNull() // il contenuto è già "Nuova sessione" (Full access resta impostato)

            // ora la vecchia animazione di chiusura arriva (tardivamente) a naturale compimento
            pendenti[0]?.()
            await Promise.resolve()
            await Promise.resolve()

            expect(sheetDialog.open).toBe(true) // la guardia impedisce alla callback tardiva di richiudere un foglio riaperto nel frattempo
            expect(document.querySelector('#customTaskCartellaLibera')).not.toBeNull() // il contenuto resta quello nuovo, non un fantasma del vecchio foglio permessi
        } finally {
            Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: originalAnimate })
        }
    })

    /*
     * ⭐⭐⭐ 28/8 — owner, coda: "bisogna aggiungere una nuova funzione che
     * con tasto destro su una cartella ti permette di impostare come
     * directory principale quella cartella".
     */
    describe('Tasto destro su una cartella — "Imposta come radice"', () => {
        async function avviaSessioneConAlberoERadice(livelli: Record<string, Array<{ nome: string, cartella: boolean }>>, radice: string) {
            const { chiamatePerLivello } = mockFetchAlbero(livelli, [
                { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-radice' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            ])
            await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test radice' })
            const generation = runtime().realSessionState.generation
            // ⭐ un RunStarted CON contesto — avviaSessioneConAlbero (sopra, FILE-TREE) non lo manda mai: qui serve DAVVERO, è quello che valorizza cartellaAssoluta.
            runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test radice' }, contesto: { cartella: radice, progetto: 'talos-prova-harness', branch: 'master' } }, generation)
            await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })
            return { chiamatePerLivello, generation }
        }

        it('⭐⭐⭐ RADICE-01: cliccare "Imposta come radice" su una sottocartella passa a Full access e avvia una sessione pendente sul percorso assoluto giusto', async () => {
            await avviaSessioneConAlberoERadice({ '': [{ nome: 'src', cartella: true }] }, 'C:/Users/prova/talos-prova-harness')
            const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
            const bottoneAzioni = rigaSrc.querySelector<HTMLButtonElement>('.ft-actions-btn')!
            expect(bottoneAzioni).toBeTruthy() // il bottone "···" ora esiste ANCHE per le cartelle, non solo per i file

            bottoneAzioni.click()
            const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent?.includes('Imposta come radice'))!
            expect(voceMenu).toBeTruthy()
            voceMenu.click()

            expect(document.querySelector('[data-open-sheet="permissions"] span')?.textContent).toBe('Full access')
            await new Promise((r) => setTimeout(r, 0))
            document.querySelector<HTMLTextAreaElement>('#composerInput')!.value = 'x'
            // ⭐ non sottometto: basta verificare che la sessione PENDENTE porti la cartella giusta, senza spendere una seconda POST/sessione vera in questo test.
            expect(document.querySelector('#sessionTitle')?.textContent).toContain('src')
        })

        it('⛔⛔ RADICE-02 AL CONTRARIO: un FILE (non una cartella) non mostra MAI "Imposta come radice" nel suo menu', async () => {
            await avviaSessioneConAlberoERadice({ '': [{ nome: 'README.md', cartella: false }] }, 'C:/Users/prova/talos-prova-harness')
            const rigaFile = [...document.querySelectorAll('.ft-row-leaf')].find((r) => r.querySelector('.ft-name')?.textContent === 'README.md')!
            rigaFile.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()

            const etichette = [...document.querySelectorAll('.ft-actions-menu-item')].map((b) => b.textContent)
            expect(etichette.some((e) => e?.includes('Imposta come radice'))).toBe(false)
            expect(etichette.some((e) => e?.includes('Apri'))).toBe(true) // il menu file resta quello di sempre
        })

        it('⛔⛔⛔ RADICE-03 AL CONTRARIO: senza ancora una cartellaAssoluta nota (nessun RunStarted con contesto), "Imposta come radice" avvisa e NON avvia nulla', async () => {
            // avviaSessioneConAlbero "normale" (senza contesto) — la funzione condivisa con FILE-TREE-*, mai chiamata con radice.
            mockFetchAlbero({ '': [{ nome: 'src', cartella: true }] }, [
                { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-senza-radice' } },
                { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            ])
            await runtime().startRealSession({ id: 'talos-prova-harness', consegna: 'test' })
            const generation = runtime().realSessionState.generation
            runtime().handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'test' } }, generation) // NESSUN contesto
            await vi.waitFor(() => { expect(document.querySelector('.ft-tree .ft-row')).toBeTruthy() })

            const rigaSrc = [...document.querySelectorAll('.ft-row-folder')].find((r) => r.querySelector('.ft-name')?.textContent === 'src')!
            rigaSrc.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()
            const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent?.includes('Imposta come radice'))!
            voceMenu.click()

            expect(document.querySelector('#toastRegion')?.textContent).toContain('sconosciuta')
            expect(document.querySelector('[data-open-sheet="permissions"] span')?.textContent).not.toBe('Full access')
        })
    })

    /*
     * ⭐⭐⭐ 28/8 — la card interattiva del permesso "On request":
     * talosHarness.mjs è DAVVERO in pausa (session-registry.mjs tiene la
     * Promise), l'evento ApprovalRequested lo rende visibile — verificato
     * che il click POSTI per davvero, non solo che l'evento sia gestito.
     */
    /*
     * ⛔⛔⛔ 28/8 — riscritte dopo un bug trovato DAL VIVO (screenshot
     * ispezionato, non solo la corsa di uno script): "Approvato (da un
     * altro client). — Approvato." Il testo raddoppiava perché il click
     * locale scriveva il testo SUBITO dopo la POST, e l'evento SSE
     * ApprovalResolved (che il server manda SEMPRE, anche per questa
     * stessa risposta) lo riscriveva una seconda volta arrivando per un
     * canale indipendente. Cura: il click DISABILITA SOLO i bottoni — il
     * testo/la rimozione dei bottoni arrivano SOLO quando ApprovalResolved
     * è dispatchato (qui, a mano, com'è la SSE reale). Due fasi, non una.
     */
    it('⭐⭐⭐ APPROVAL-01: "Approva" fa POST .../approve e disabilita i bottoni SUBITO — ma li toglie solo quando arriva ApprovalResolved (mai due volte)', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-approval' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-approval' })
        const generation = runtime().realSessionState.generation

        runtime().handleRealEvent({ type: 'ApprovalRequested', requestId: 'req-1', azione: { tipo: 'scrivi', percorso: 'nuovo.txt' } }, generation)

        const card = document.querySelector('.real-approval-card')
        expect(card).not.toBeNull()
        expect(card!.textContent).toContain('nuovo.txt')
        const approvaBtn = Array.from(card!.querySelectorAll('button')).find((b) => b.textContent === 'Approva')!
        expect(approvaBtn).toBeDefined()

        const fetchMock = mockFetch([{ metodo: 'POST', percorso: '/api/v1/sessions/sess-approval/approve', corpo: { ok: true } }])
        approvaBtn.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/sessions/sess-approval/approve',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ requestId: 'req-1', approvato: true }) }),
        )
        // ⭐ FASE 1: la POST è già tornata, ma i bottoni restano nel DOM — solo disabilitati, non ancora rimossi, e nessun testo aggiunto ancora.
        expect(card!.querySelector('.sheet-actions')).not.toBeNull()
        expect(approvaBtn.disabled).toBe(true)
        expect(card!.textContent).not.toContain('Approvato')

        // ⭐ FASE 2: l'evento SSE vero arriva (qui simulato, com'è ApprovalRequested sopra) — SOLO ora la card si finalizza, UNA volta sola.
        runtime().handleRealEvent({ type: 'ApprovalResolved', requestId: 'req-1', approvato: true }, generation)

        expect(card!.querySelector('.sheet-actions')).toBeNull()
        const occorrenze = (card!.textContent!.match(/Approvato/g) || []).length
        expect(occorrenze, 'mai due volte — il bug reale trovato dal vivo').toBe(1)
        expect(card!.textContent).not.toContain('altro client') // la risposta È partita da questa stessa card
    })

    it('⛔ APPROVAL-02 AL CONTRARIO: "Nega" fa POST con approvato:false, mai true, e la finalizzazione dice "Negato" non "Approvato"', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-approval-2' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-approval-2' })
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ApprovalRequested', requestId: 'req-2', azione: { tipo: 'shell', comando: 'rm -rf /' } }, generation)

        const card = document.querySelector('.real-approval-card')!
        const negaBtn = Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'Nega')!
        const fetchMock = mockFetch([{ metodo: 'POST', percorso: '/api/v1/sessions/sess-approval-2/approve', corpo: { ok: true } }])
        negaBtn.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/sessions/sess-approval-2/approve',
            expect.objectContaining({ body: JSON.stringify({ requestId: 'req-2', approvato: false }) }),
        )

        runtime().handleRealEvent({ type: 'ApprovalResolved', requestId: 'req-2', approvato: false }, generation)
        expect(card.textContent).toContain('Negato')
        expect(card.textContent).not.toContain('Approvato')
    })

    it('⛔⛔ APPROVAL-02-BIS AL CONTRARIO: un fallimento della POST riabilita i bottoni, mai una card bloccata per sempre', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-approval-fail' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-approval-fail' })
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ApprovalRequested', requestId: 'req-fail', azione: { tipo: 'scrivi', percorso: 'x.txt' } }, generation)
        const card = document.querySelector('.real-approval-card')!
        const approvaBtn = Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'Approva') as HTMLButtonElement

        mockFetch([{ metodo: 'POST', percorso: '/api/v1/sessions/sess-approval-fail/approve', corpo: { code: 'QUERY_INVALID' }, ok: false, status: 400 }])
        approvaBtn.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(approvaBtn.disabled, 'un fallimento non deve lasciare la card bloccata su "in corso" per sempre').toBe(false)
        expect(card.querySelector('.sheet-actions')).not.toBeNull()
    })

    it('⛔⛔ APPROVAL-03 AL CONTRARIO: ApprovalResolved arrivato da un ALTRO client toglie i bottoni senza un click locale', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-approval-3' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-approval-3' })
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ApprovalRequested', requestId: 'req-3', azione: { tipo: 'document_create', formato: 'pdf' } }, generation)
        const card = document.querySelector('.real-approval-card')!
        expect(card.querySelector('.sheet-actions')).not.toBeNull()

        runtime().handleRealEvent({ type: 'ApprovalResolved', requestId: 'req-3', approvato: true }, generation)

        expect(card.querySelector('.sheet-actions')).toBeNull()
        expect(card.textContent).toContain('altro client')
    })

    /*
     * ⛔ 28/8 — riscritto dopo la cura "la sessione non parte quando
     * scrivo dal composer": submitPrompt() ora controlla QUANTE cartelle
     * sono configurate prima di rifiutare (GET /api/v1/projects,
     * asincrono) — con zero configurate (nessun mockFetch qui, stesso
     * setup di prima) il rifiuto onesto resta identico, solo dopo un
     * giro di eventi invece che subito.
     */
    it('REAL-SESSION-TASKSHEET-03 senza una sessione pendente, il composer resta onesto (nessun campo compito nella modale a cui affidarsi)', async () => {
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'qualcosa scritto senza mai aprire Nuova'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(document.querySelector('#toastRegion')?.textContent).toContain('Nessuna sessione attiva')
        expect(FakeEventSource.instances.length).toBe(0)
    })

    /*
     * ⭐⭐⭐ 28/8, owner: "la sessione non parte quando scrivo semplicemente
     * dal composer, devo per forza premere nuova sessione" — verso
     * POSITIVO del test sopra: con ESATTAMENTE una cartella configurata,
     * scrivere subito nel composer (senza mai aprire "Nuova") avvia
     * DAVVERO una sessione, come un vero terminale con un solo cwd.
     */
    it('⭐⭐⭐ REAL-SESSION-COMPOSER-IMPLICIT-01 con UNA sola cartella configurata, scrivere subito nel composer avvia la sessione senza passare da "Nuova"', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: '0', nome: 'unico-progetto' }] } },
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-implicita' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'aggiungi una funzione di prova'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(FakeEventSource.instances.at(-1)?.url).toBe('/api/v1/sessions/sess-implicita/events')
        expect(document.querySelector('#toastRegion')?.textContent ?? '').not.toContain('Nessuna sessione attiva')
    })

    /*
     * ⛔ AL CONTRARIO: con PIÙ cartelle configurate l'ambiguità è reale —
     * resta il rifiuto onesto di sempre, mai una scelta indovinata.
     */
    it('⛔ REAL-SESSION-COMPOSER-IMPLICIT-02 con PIÙ cartelle configurate, scrivere subito nel composer resta un rifiuto onesto — l\'ambiguità è vera', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: '0', nome: 'a' }, { id: '1', nome: 'b' }] } },
        ])
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'qualcosa'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(document.querySelector('#toastRegion')?.textContent).toContain('Nessuna sessione attiva')
        expect(FakeEventSource.instances.length).toBe(0)
    })

    it('REAL-SESSION-TASKSHEET-02 senza cartelle configurate, mostra un messaggio onesto invece di un form rotto', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [] } }])

        await runtime().openRealTaskSheet()

        expect(document.querySelector('#customTaskCartella')).toBeNull()
        expect(document.querySelector('#sheetBody')?.textContent).toContain('TALOS_HARNESS_UI_PROJECT_DIRS')
    })

    it('MODEL-PICKER-01 apre il catalogo vero (GET /api/v1/models), raggruppato per provider, e la scelta viaggia nella POST', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        await runtime().openRealTaskSheet()

        mockFetch([
            {
                metodo: 'GET',
                percorso: '/api/v1/models',
                corpo: {
                    modelli: [
                        { id: 'deepseek/deepseek-chat', provider: 'deepseek', nome: 'DeepSeek: Chat', contextLength: 64000, prezzoPrompt: '0.0000002', prezzoCompletion: '0.0000006' },
                        { id: 'qwen/qwen3.8-flash', provider: 'qwen', nome: 'Qwen: Qwen3.8 Flash', contextLength: 1000000, prezzoPrompt: '0.00000015', prezzoCompletion: '0.00000047' },
                    ],
                    daCache: false,
                    aggiornatoAlle: '2026-08-27T10:00:00.000Z',
                },
            },
        ])
        document.querySelector<HTMLButtonElement>('.model-picker-trigger')!.click()
        await new Promise((r) => setTimeout(r, 0))

        const gruppi = [...document.querySelectorAll('.model-picker-group-name')].map((el) => el.textContent)
        expect(gruppi).toEqual(['deepseek', 'qwen']) // ordinati per provider

        document.querySelector<HTMLButtonElement>('.model-picker-group-header')!.click() // apre il gruppo "deepseek"
        const opzione = document.querySelector<HTMLButtonElement>('.model-picker-option')!
        expect(opzione.textContent).toContain('deepseek/deepseek-chat')
        opzione.click()

        expect(document.querySelector('.model-picker-trigger-label')?.textContent).toBe('deepseek/deepseek-chat')
        expect(document.querySelector('.model-picker-panel')?.hasAttribute('hidden')).toBe(true) // si chiude da solo

        document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit() // conferma cartella+modello — il compito si scrive nel composer, non qui

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-modello' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const postSpy = vi.spyOn(window, 'fetch')
        document.querySelector<HTMLTextAreaElement>('#composerInput')!.value = 'usa questo modello'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        const chiamataPost = postSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
        const corpoInviato = JSON.parse(String((chiamataPost?.[1] as RequestInit).body))
        expect(corpoInviato.modello).toBe('deepseek/deepseek-chat')
    })

    it('MODEL-PICKER-02 un errore di rete sul catalogo è dichiarato, mai "zero modelli" silenzioso', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto' }] } }])
        await runtime().openRealTaskSheet()

        vi.spyOn(window, 'fetch').mockRejectedValueOnce(new Error('rete giù'))
        document.querySelector<HTMLButtonElement>('.model-picker-trigger')!.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('.model-picker-list')?.textContent).toContain('rete giù')
    })

    /*
     * ⭐⭐⭐ 28/8, owner: "nella modale della nuova sessione e nella pill del
     * modello metti lo slider del selettore effort" — stesso schema di
     * MODEL-PICKER-01 sopra: presenza del controllo, interazione,
     * verifica che il valore viaggi DAVVERO nella POST.
     */
    it('⭐⭐⭐ EFFORT-PICKER-01 lo slider è nella modale accanto al model picker, e la scelta viaggia nella POST come reasoning.effort', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        await runtime().openRealTaskSheet()

        const range = document.querySelector<HTMLInputElement>('.effort-picker-range')!
        expect(range).not.toBeNull()
        expect(document.querySelector('.effort-picker-selected')?.textContent).toBe('Predefinito del server') // mai toccato ancora

        range.value = '1' // 'minimal'
        range.dispatchEvent(new Event('input', { bubbles: true }))
        expect(document.querySelector('.effort-picker-selected')?.textContent).toBe('Minimo')

        document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-effort' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const postSpy = vi.spyOn(window, 'fetch')
        document.querySelector<HTMLTextAreaElement>('#composerInput')!.value = 'usa questo livello di ragionamento'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        const chiamataPost = postSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
        const corpoInviato = JSON.parse(String((chiamataPost?.[1] as RequestInit).body))
        expect(corpoInviato.reasoning).toEqual({ effort: 'minimal' })
    })

    it('⛔ AL CONTRARIO: EFFORT-PICKER-02 senza mai toccare lo slider, la POST non porta MAI il campo reasoning — comportamento di sempre', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        await runtime().openRealTaskSheet()
        document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit()

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-senza-effort' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const postSpy = vi.spyOn(window, 'fetch')
        document.querySelector<HTMLTextAreaElement>('#composerInput')!.value = 'nessuna scelta di ragionamento'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((r) => setTimeout(r, 0))

        const chiamataPost = postSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
        const corpoInviato = JSON.parse(String((chiamataPost?.[1] as RequestInit).body))
        expect('reasoning' in corpoInviato).toBe(false)
    })

    it('⭐ EFFORT-PICKER-03 lo stesso slider è ANCHE nella pill del modello (foglio aperto dal composer), non solo nella modale "Nuova sessione"', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        await runtime().openRealTaskSheet()
        document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit() // pendingCustomSession, mai un fetch qui

        document.querySelector<HTMLButtonElement>('[data-open-sheet="model"]')!.click()

        expect(document.querySelector('#modelPickerMount .effort-picker-range')).not.toBeNull()
    })
})
