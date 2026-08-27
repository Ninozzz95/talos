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

    it('⛔ REAL-SESSION-RESUME-03 AL CONTRARIO: un follow-up su una sessione ANCORA IN CORSO non chiama /resume, rifiuto onesto', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-in-corso' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-in-corso' })
        expect(runtime().realSessionState.eventoTerminaleVisto).toBe(false) // nessun RunFinished ancora

        const fetchMock = vi.spyOn(window, 'fetch')
        const chiamateSuResume = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/resume')).length
        const prima = chiamateSuResume()

        expect(runtime().submitPrompt('Domanda mentre gira')).toBe(true)
        await new Promise((r) => setTimeout(r, 0))

        expect(chiamateSuResume()).toBe(prima) // zero chiamate a /resume
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Messaggio non consegnato')
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

    it('REAL-SESSION-SHELL-03 il risultato di un tool-call "shell" arriva anche nella vista Terminale dedicata, non solo nella chat', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ comando: 'echo prova' }) }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c1', content: 'exit 0 [sandbox: wsl2]\nprova\n' }, generation)

        const terminale = document.querySelector('[data-view="terminal"] .terminal-window code')
        expect(terminale?.textContent).toContain('echo prova')
        expect(terminale?.textContent).toContain('exit 0 [sandbox: wsl2]')
        const badge = document.querySelector('[data-view="terminal"] .demo-surface-badge') as HTMLElement | null
        expect(badge?.hidden).toBe(true)
    })

    it('⛔ REAL-SESSION-SHELL-04 AL CONTRARIO: il risultato di un tool-call DIVERSO da "shell" (es. "leggi") NON tocca la vista Terminale', () => {
        const contenutoPrima = document.querySelector('[data-view="terminal"] .terminal-window code')?.textContent
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c2', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c2', content: 'contenuto del file' }, generation)

        expect(document.querySelector('[data-view="terminal"] .terminal-window code')?.textContent).toBe(contenutoPrima)
    })

    // ⛔⛔ 27/8, trovato dalla pipeline QA visiva (iniettando un ToolCallResult
    // finto via handleRealEvent, zero costo — mai una chiamata vera al
    // modello per una prova che deve solo verificare il reset del DOM):
    // passando dalla sessione A (che aveva usato "shell") alla sessione B,
    // il Terminale mostrava ANCORA l'output di A, concatenato con quello di
    // B — nuovaGenerazioneSessione() resettava conversazione/reviewFiles/
    // albero ma non il dataset.reale di Terminale/Browser, che vive nel DOM
    // e non in state.realSession.
    it('⛔⛔ REAL-SESSION-SHELL-05 AL CONTRARIO: una NUOVA sessione reale non eredita l\'output shell della sessione precedente nella vista Terminale', async () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c3', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c3', delta: JSON.stringify({ comando: 'echo marcatore-sessione-precedente' }) }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c3', content: 'marcatore-sessione-precedente-output' }, generation)
        expect(document.querySelector('[data-view="terminal"] .terminal-window code')?.textContent).toContain('marcatore-sessione-precedente')

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-nuova-pulita' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-nuova-pulita' })

        const terminaleDopo = document.querySelector('[data-view="terminal"] .terminal-window code') as HTMLElement | null
        expect(terminaleDopo?.textContent).not.toContain('marcatore-sessione-precedente')
        expect(terminaleDopo?.dataset.reale).toBeUndefined()
        // ⛔ 27/8, seconda passata: il reset mostra uno stato ONESTO E VUOTO
        // ("Nessun comando eseguito..."), non più il demo originale — il
        // badge resta nascosto perché non è un dato finto da segnalare.
        expect(terminaleDopo?.textContent).toContain('Nessun comando eseguito')
        const badge = document.querySelector('[data-view="terminal"] .demo-surface-badge') as HTMLElement | null
        expect(badge?.hidden).toBe(true)
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

    it('REAL-SESSION-TASKSHEET-03 senza una sessione pendente, il composer resta onesto (nessun campo compito nella modale a cui affidarsi)', async () => {
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'qualcosa scritto senza mai aprire Nuova'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()

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
})
