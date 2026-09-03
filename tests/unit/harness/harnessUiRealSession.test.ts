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
        startRealSessionFromMessage(text: string, modello?: string): Promise<void>
        stopRealSession(): Promise<void>
        handleRealEvent(evento: Record<string, unknown>, generation: number): void
        forkSession(): Promise<void>
        resumeSession(messaggioFollowUp?: string): Promise<void>
        compactSession(): Promise<void>
        passaASessione(sessionId: string, taskId: string, nome?: string): void
        // ⭐ 29/8 — bug reale trovato sul dispositivo (vedi il describe dedicato in fondo al file)
        selectSession(selection: { id: string, title: string }): boolean
        // ⭐ 2/9 — esposta per la prova di de-dup (vedi il describe SELECT-SESSION-REAL-ID)
        riprendiSessioneDalHost(): Promise<void>
        openRealTaskSheet(): Promise<void>
        aggiornaElencoSessioniReali(): Promise<void>
        runDirectShell(comando: string, silenzioso: boolean): Promise<void>
        // ⭐ 29/8, porta canonico (ledger §21, FASE D coda messaggi) — già esposto a runtime da tempo (blocco window.__talosHarnessUiRuntime), mancava solo dal tipo dei test.
        submitPrompt(text: string, modello?: string): boolean
        executeCommand(command: string): void
        costruisciTrascrizioneMarkdown(esportato: Record<string, unknown>): string
        titoloDalPrimoMessaggio(testo: string): string
        realSessionState: {
            id: string | null
            taskId: string | null
            generation: number
            eventSource: FakeEventSource | null
            messageElements: Map<string, HTMLElement>
            reviewFiles: Map<string, { path: string, nuovo: boolean, code: [string, string][] }>
            ultimoEsitoProva: number | null
            // ⭐ 29/8, porta canonico (ledger §21, FASE D)
            eventoTerminaleVisto: boolean
            followUpBubbleInAttesa: boolean
            codaMessaggi: string[]
        }
        // ⭐ 29/8, porting dal bundle desktop (FASE A/C)
        eseguiDoctor(): Promise<void>
        refreshDoctorBadge(): Promise<void>
        caricaPannelloHooks(): Promise<void>
        caricaAlberoSessione(): Promise<void>
        openSheet(type: string): void
        // ⭐ 29/8, porting dal bundle desktop — Automazioni
        renderAutomationsReali(): Promise<void>
        openNewAutomationSheet(): Promise<void>
        setView(view: string, options?: Record<string, unknown>): void
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

    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 3 — un messaggio semplice (senza
     * `!`) avvia ORA una sessione reale invece del copione scriptato
     * (`appendUserMessage`, rimosso: rispondeva sempre "Ricevuto. Ho
     * aggiunto il messaggio..." senza mai leggere `text`).
     *
     * ⛔⛔⛔ 29/8 — RISCRITTE dopo un bug reale trovato SUL DISPOSITIVO
     * (owner: "non provare e verificare visivamente è una violazione
     * delle regole vincolanti"): `POST /api/v1/sessions {messaggio}`
     * falliva sempre con "Query non valida" — `requireMessaggioBody`
     * (il contratto che queste prove verificavano) non esiste più in
     * `http-app.mjs` (grep sul sorgente vero, zero corrispondenze); la
     * rotta valida oggi con `requireTaskIdBody`, `taskId` obbligatorio.
     * Il rimpiazzo è `avviaSessioneImplicitaSeUnaSolaCartella` (bundle
     * desktop, mai portato prima): un messaggio senza cartella scelta
     * chiede `/api/v1/projects` e, se ce n'è esattamente una, apre un
     * compito libero su `/api/v1/sessions/custom` (contratto vero e
     * tuttora esistente).
     */
    it('REAL-SESSION-MESSAGE-01 con una sola cartella progetto configurata, apre un compito libero su /api/v1/sessions/custom', async () => {
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'p1', nome: 'talos' }] } },
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-msg-1' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])

        await runtime().startRealSessionFromMessage('ciao')

        // corpo verificato campo per campo (non una stringa JSON esatta): `modello` può comparire o no a seconda dello stato del picker in questo mount, non è materia di QUESTA prova.
        const chiamataCustom = fetchMock.mock.calls.find((c) => c[0] === '/api/v1/sessions/custom')
        const init = chiamataCustom?.[1] ?? {}
        expect(chiamataCustom).toBeDefined()
        expect(init).toMatchObject({ method: 'POST' })
        expect(JSON.parse(String(init.body))).toMatchObject({ cartellaId: 'p1', consegna: 'ciao', client: 'desktop', permessi: 'Workspace write' })
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(FakeEventSource.instances[0].url).toBe('/api/v1/sessions/sess-msg-1/events')
        expect(runtime().realSessionState.id).toBe('sess-msg-1')
    })

    /**
     * ⭐⭐⭐ AL CONTRARIO delle due prove sotto: `appendRealTaskStart` (app.js)
     * leggeva SEMPRE `task.id` per l'etichetta — un messaggio senza `id`
     * avrebbe mostrato "Task reale · undefined". Le due prove insieme
     * coprono ENTRAMBI i versi: un task del corpus mantiene l'etichetta di
     * sempre, un compito libero (id sintetico `libero:<cartella>`, MAI
     * `undefined`) ne mostra una propria.
     */
    it('REAL-SESSION-MESSAGE-02 the plain-message bubble reads "Task reale · libero:<cartella>", never "Task reale · undefined"', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'p1', nome: 'talos' }] } },
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-msg-2' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])

        await runtime().startRealSessionFromMessage('ciao')

        const meta = document.querySelector('.user-message .message-meta')
        expect(meta?.textContent).toContain('Real task · libero:talos') // ⭐ 3/9 — etichetta tradotta in inglese (avm-03, commit 8398f860), asserzione aggiornata a pari passo
        expect(meta?.textContent).not.toContain('undefined')
        expect(document.querySelector('.user-message .message-bubble')?.textContent).toBe('ciao')
    })

    it('⛔ REAL-SESSION-MESSAGE-05 AL CONTRARIO: zero o più di una cartella configurata, nessun tentativo destinato a fallire — stato onesto', async () => {
        const fetchMockZero = mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [] } }])
        await runtime().startRealSessionFromMessage('ciao')
        expect(fetchMockZero).toHaveBeenCalledTimes(1) // solo il GET di projects, mai un POST destinato a fallire
        expect(runtime().realSessionState.id).toBeNull()

        const fetchMockMolte = mockFetch([{ metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'a', nome: 'uno' }, { id: 'b', nome: 'due' }] } }])
        await runtime().startRealSessionFromMessage('ciao')
        expect(fetchMockMolte).toHaveBeenCalledTimes(2) // 1 (caso zero, sopra) + 1 (questo): mockFetch riusa lo stesso spy sottostante, la cronologia è cumulativa nello stesso test — vedi lo stesso pattern in AUTOMATIONS-07.
        expect(runtime().realSessionState.id).toBeNull()
    })

    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — il modello scelto nel
     * composer di Codice arriva fino al corpo della POST (ora verso
     * /api/v1/sessions/custom, non più /api/v1/sessions — vedi sopra).
     */
    it('REAL-SESSION-MESSAGE-04 con un modello scelto, il corpo del compito libero include modello', async () => {
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'p1', nome: 'talos' }] } },
            { metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { sessionId: 'sess-msg-modello' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])

        await runtime().startRealSessionFromMessage('ciao', 'z-ai/glm-4.7-flash')

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/custom', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ cartellaId: 'p1', consegna: 'ciao', client: 'desktop', modello: 'z-ai/glm-4.7-flash', permessi: 'Workspace write' }),
        }))
    })

    it('REAL-SESSION-MESSAGE-03 AL CONTRARIO: a real corpus task keeps its own "Task reale · <id>" label, unchanged', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-task-label' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])

        await runtime().startRealSession({ id: 'storia-0b81c88', consegna: 'Sistema il test rosso.' })

        const meta = document.querySelector('.user-message .message-meta')
        expect(meta?.textContent).toContain('Real task · storia-0b81c88') // ⭐ 3/9 — vedi nota sopra, stessa etichetta tradotta
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

    it('REAL-SESSION-TEXT-01 TextMessageContent accumula il testo nella bolla assistente, non la sostituisce', async () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Leggo ' }, generation)
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'il file.' }, generation)
        // ⭐ 2/9 — il render è ora coalescente/differito a un frame (§R4):
        // jsdom non ha requestAnimationFrame (verificato), quindi
        // programmaRenderMessaggioStreaming() usa sempre il ripiego
        // setTimeout(...,16) — 20ms lo supera in sicurezza.
        await new Promise((resolve) => setTimeout(resolve, 20))

        const bubble = document.querySelector('.real-session-status')
        expect(bubble).toBeNull() // nessuno stato/errore ancora — solo testo
        const copies = [...document.querySelectorAll('.assistant-copy')].map((el) => el.textContent)
        expect(copies).toContain('Leggo il file.')
    })

    // ⛔⛔⛔ 27/8, owner: "le risposte non sono formattate, cioè le basi" — il
    // testo del modello arrivava con .textContent += : un elenco puntato
    // diventava una riga sola senza a-capo, nessun grassetto/corsivo/codice.
    it('REAL-SESSION-TEXT-02 un elenco puntato del modello diventa una lista VERA (<li>), non una riga sola', async () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-lista', delta: 'Posso:\n- Uno\n- Due\n- Tre' }, generation)
        await new Promise((resolve) => setTimeout(resolve, 20))

        const elemento = document.querySelector('.assistant-copy ul')
        expect(elemento).not.toBeNull()
        const voci = [...document.querySelectorAll('.assistant-copy ul li')].map((el) => el.textContent)
        expect(voci).toEqual(['Uno', 'Due', 'Tre'])
    })

    it('REAL-SESSION-TEXT-03 grassetto/corsivo/codice inline diventano nodi veri, non asterischi a schermo', async () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-inline', delta: 'Uso **grassetto**, *corsivo* e `codice()`.' }, generation)
        await new Promise((resolve) => setTimeout(resolve, 20))

        const copia = document.querySelector('.assistant-copy')
        expect(copia?.querySelector('strong')?.textContent).toBe('grassetto')
        expect(copia?.querySelector('em')?.textContent).toBe('corsivo')
        expect(copia?.querySelector('code')?.textContent).toBe('codice()')
        expect(copia?.textContent).not.toContain('**') // mai asterischi letterali a schermo
    })

    it('⛔ REAL-SESSION-TEXT-04 AL CONTRARIO: testo del modello che sembra HTML resta testo letterale, mai eseguito', async () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-xss', delta: '<img src=x onerror="window.__provaXss=true">' }, generation)
        await new Promise((resolve) => setTimeout(resolve, 20))

        const copia = document.querySelector('.assistant-copy')
        expect(copia?.querySelector('img')).toBeNull() // mai un <img> VERO nel DOM
        expect(copia?.textContent).toContain('<img') // il testo letterale resta visibile
        expect((window as unknown as { __provaXss?: boolean }).__provaXss).toBeUndefined()
    })

    /*
     * ⭐⭐⭐ 2/9 — review Fable R4: `renderizzaMarkdownSemplice()` veniva
     * richiamato per INTERO a ogni delta, O(n²) sul testo (misurato dal
     * desktop: 1,28s→0,35s con la cura). Questa prova il contratto
     * osservabile, non l'implementazione: più delta nello stesso giro
     * sincrono non toccano il DOM finché non arriva un frame — se
     * rendesse ancora a ogni delta come prima, il primo `expect` sotto
     * (PRIMA del flush) fallirebbe già.
     */
    it('⭐ STREAMING-COALESCE-01 più delta nello stesso giro producono UN SOLO render, non uno a delta', async () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-coalesce', delta: 'Uno ' }, generation)
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-coalesce', delta: 'due ' }, generation)
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-coalesce', delta: 'tre.' }, generation)

        // PRIMA del flush: il render è differito, il DOM non ha ancora niente.
        const copiaPrima = document.querySelector('.assistant-copy')
        expect(copiaPrima?.textContent ?? '').toBe('')

        await new Promise((resolve) => setTimeout(resolve, 20))

        // DOPO un solo flush: tutti e tre i delta sono a schermo insieme.
        const copiaDopo = document.querySelector('.assistant-copy')
        expect(copiaDopo?.textContent).toBe('Uno due tre.')
    })

    /*
     * ⭐⭐⭐ 2/9 — review Fable R4, la prova di correttezza che l'ottimizzazione
     * DEVE superare: il rendering incrementale (blocchi stabili riusati,
     * solo la coda si ridisegna) deve produrre ESATTAMENTE lo stesso DOM
     * di un rendering in un colpo solo — altrimenti la velocità sarebbe
     * comprata con un difetto visivo. Caso scelto apposta: un blocco di
     * codice ```fence``` che ATTRAVERSA una riga vuota (l'unico costrutto
     * che lo fa, per costruzione dell'algoritmo) tagliato a metà da un
     * delta, più un paragrafo dopo — se confineBlocchiStabili() lo
     * trattasse come un blocco chiuso a metà fence, il fence si
     * spezzerebbe in due `<pre>` invece di uno.
     */
    it('⭐ STREAMING-INCREMENTALE-PARITA-01 tanti delta piccoli producono lo STESSO DOM di un delta solo, anche con un fence che attraversa una riga vuota', async () => {
        const testoCompleto = 'Ecco il codice:\n\n```js\nfunction somma(a, b) {\n\n  return a + b;\n}\n```\n\nFatto.'
        const generation = runtime().realSessionState.generation

        // Messaggio A: un delta solo, il testo intero in un colpo.
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-intero', delta: testoCompleto }, generation)

        // Messaggio B: lo STESSO testo, spezzato in tanti delta piccoli —
        // tagli scelti apposta a metà parola e a metà del fence.
        const pezzi = [
            'Ecco il ', 'codice:\n\n```js\nfun', 'ction somma(a, b) {\n', '\n  return a', ' + b;\n}\n', '```\n\nFat', 'to.',
        ]
        expect(pezzi.join('')).toBe(testoCompleto) // precondizione: i pezzi ricompongono esattamente il testo atteso
        for (const delta of pezzi) {
            runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm-a-pezzi', delta }, generation)
        }

        await new Promise((resolve) => setTimeout(resolve, 20))

        // Due bolle distinte, create nell'ordine in cui gli eventi sono
        // arrivati sopra: m-intero prima, m-a-pezzi dopo — .assistant-copy
        // non porta un id proprio, l'ordine nel DOM è la fonte di verità.
        const copie = [...document.querySelectorAll('.assistant-copy')]
        expect(copie).toHaveLength(2)
        const [interoEl, aPezziEl] = copie
        // Un solo <pre> (il fence non si è spezzato in due) in ENTRAMBI.
        expect(interoEl.querySelectorAll('pre').length).toBe(1)
        expect(aPezziEl.querySelectorAll('pre').length).toBe(1)
        // Stesso testo del blocco di codice, carattere per carattere.
        expect(aPezziEl.querySelector('pre code')?.textContent).toBe(interoEl.querySelector('pre code')?.textContent)
        // Stesso DOM finale, per intero — non solo il fence.
        expect(aPezziEl.innerHTML).toBe(interoEl.innerHTML)
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
        expect(conversationText).toContain('Direct command') // ⭐ 3/9 — etichetta tradotta in inglese (avm-03, commit 8398f860), asserzione aggiornata a pari passo
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
        expect(conversationText).not.toContain('Direct command') // ⭐ 3/9 — vedi nota sopra, stesse etichette tradotte
        expect(conversationText).toContain('Free task')
        expect(conversationText).toContain('talos-prova-harness')
    })

    it('REAL-SESSION-STALE-01 un evento di una generazione VECCHIA viene scartato, mai renderizzato', () => {
        const generazioneAttuale = runtime().realSessionState.generation
        const generazioneVecchia = generazioneAttuale - 1

        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'scaduto', delta: 'fantasma' }, generazioneVecchia)

        expect(document.querySelector('.assistant-copy')?.textContent ?? '').not.toContain('fantasma')
    })

    /**
     * ⭐⭐⭐ 2/9 — M1: Stadio A (talosHarness.mjs, 23/8) compatta la
     * conversazione da sola da tempo, ma il giro che lo fa non emetteva mai
     * un evento — un turno senza testo, indistinguibile da un modello
     * bloccato (vedi il commento sopra CompactionStart/CompactionEnd in
     * app.js). talosLavora ora chiama onGiro({tipo:'compattazione-inizio'})
     * / ({tipo:'compattazione-fine'}), agent-service.mjs li traduce in
     * CompactionStart/CompactionEnd (agui-events.mjs) — questa prova copre
     * solo l'ultimo miglio, il consumo lato client, già coperto a monte dai
     * 194/194 test del kernel e dal ciclo dedicato in agent-service.
     * Anche il guardiano "non raddoppiare" (mostraCompattazioneInCorso
     * ritorna subito se una bolla è già a schermo) è provato qui, non in un
     * test a parte — un secondo CompactionStart può arrivare da un replay
     * SSE dopo una riconnessione, come già successo per altri eventi in
     * questo stesso file (vedi la nota su _sequenza sopra handleRealEvent).
     */
    it('REAL-SESSION-COMPACTION-01 CompactionStart mostra "Sto riassumendo…" (senza raddoppiare), CompactionEnd la rimuove', () => {
        const generation = runtime().realSessionState.generation

        // ⭐ 3/9 — bolla tradotta in inglese (avm-03, commit 8398f860), asserzioni aggiornate a pari passo
        runtime().handleRealEvent({ type: 'CompactionStart' }, generation)
        expect(document.querySelector('#conversation')?.textContent ?? '').toContain('Summarising the conversation so far…')
        expect(document.querySelectorAll('.real-compaction-note')).toHaveLength(1)

        runtime().handleRealEvent({ type: 'CompactionStart' }, generation) // replay SSE dopo una riconnessione: stessa bolla, non una seconda
        expect(document.querySelectorAll('.real-compaction-note')).toHaveLength(1)

        runtime().handleRealEvent({ type: 'CompactionEnd' }, generation)
        expect(document.querySelector('.real-compaction-note')).toBeNull()
        expect(document.querySelector('#conversation')?.textContent ?? '').not.toContain('Summarising')
    })

    it('⛔ REAL-SESSION-COMPACTION-02 AL CONTRARIO: un CompactionStart di una generazione VECCHIA non mostra mai la bolla', () => {
        const generazioneAttuale = runtime().realSessionState.generation
        const generazioneVecchia = generazioneAttuale - 1

        runtime().handleRealEvent({ type: 'CompactionStart' }, generazioneVecchia)

        expect(document.querySelector('.real-compaction-note')).toBeNull()
        expect(document.querySelector('#conversation')?.textContent ?? '').not.toContain('Sto riassumendo')
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

    it('REAL-SESSION-REVIEW-02 con un file scritto ma NESSUNA prova ancora arrivata, i badge test/rischio restano "—" (ignoto, mai un verdetto finto)', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{ op: 'add', path: '/file/src/riga02.mjs', value: 'export const x = 1\n' }],
        }, generation)

        expect(runtime().realSessionState.ultimoEsitoProva).toBeNull()
        const badgeTest = document.querySelector('[data-review-stat="test"] span')
        const badgeRischio = document.querySelector('[data-review-stat="risk"] span')
        expect(badgeTest?.textContent).toBe('—')
        expect(badgeRischio?.textContent).toBe('—')
    })

    it('REAL-SESSION-REVIEW-03 prova con exit 0, file piccolo, nessun percorso sensibile -> Verdi/Basso', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{ op: 'add', path: '/file/src/riga03.mjs', value: 'export const x = 1\n' }],
        }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'p1', toolCallName: 'prova' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'p1', content: 'exit 0\n> test\n✔ tutto ok\n' }, generation)

        expect(runtime().realSessionState.ultimoEsitoProva).toBe(0)
        expect(document.querySelector('[data-review-stat="test"] span')?.textContent).toBe('Verdi')
        expect(document.querySelector('[data-review-stat="risk"] span')?.textContent).toBe('Basso')
    })

    it('⛔ REAL-SESSION-REVIEW-04 AL CONTRARIO: prova con exit 1 porta Rossi/Alto anche su un file piccolo e non sensibile', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{ op: 'add', path: '/file/src/riga04.mjs', value: 'export const x = 1\n' }],
        }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'p2', toolCallName: 'prova' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'p2', content: 'exit 1\n✖ un test fallisce\n' }, generation)

        expect(runtime().realSessionState.ultimoEsitoProva).toBe(1)
        expect(document.querySelector('[data-review-stat="test"] span')?.textContent).toBe('Rossi')
        expect(document.querySelector('[data-review-stat="risk"] span')?.textContent).toBe('Alto')
    })

    it('⛔ REAL-SESSION-REVIEW-05 AL CONTRARIO: test verdi ma un percorso sensibile (.env) porta comunque ad Alto rischio', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({
            type: 'StateDelta',
            delta: [{ op: 'add', path: '/file/.env', value: 'SEGRETO=1\n' }],
        }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'p3', toolCallName: 'prova' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'p3', content: 'exit 0\n✔ tutto ok\n' }, generation)

        expect(document.querySelector('[data-review-stat="test"] span')?.textContent).toBe('Verdi')
        expect(document.querySelector('[data-review-stat="risk"] span')?.textContent).toBe('Alto')
    })

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
         * ⭐ 29/8 — portato da e079bf3f DOPO 969b1a38 (che l'aveva
         * dichiarato non portabile: il case 'WorkspaceChanged' lato
         * client esisteva già su questa copia, verificato PRIMA di
         * accettare, ma il commit che lo introduceva non era mai stato
         * cherry-pickato per suo conto — trovato e chiuso qui).
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
         * ⭐ 29/8 — portato da 46940ae4 dopo che i suoi prerequisiti
         * (b3df4e98: `cartella` threading su apriMenuAzioniFile,
         * impostaPermesso, avviaSessionePendente esteso) sono stati
         * chiusi — 969b1a38 lo aveva trovato per primo e correttamente
         * NON portato, verificato allora con grep che nessuna rotta
         * esisteva ancora su questa copia.
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
                // ⭐ 3/9 — etichette tradotte in inglese, apriMenuAzioniFile completata nello stesso giro
                expect(etichette.some((e) => e?.includes('New file'))).toBe(true)
                expect(etichette.some((e) => e?.includes('New folder'))).toBe(true)
                expect(etichette.some((e) => e?.includes('Copy'))).toBe(true)
            })

            it('⭐⭐⭐ CRUD-02: il menu di un FILE mostra anche "Copia"', async () => {
                await avviaSessioneConAlbero({ '': [{ nome: 'README.md', cartella: false }] })
                const rigaFile = [...document.querySelectorAll('.ft-row-leaf')].find((r) => r.querySelector('.ft-name')?.textContent === 'README.md')!
                rigaFile.querySelector<HTMLButtonElement>('.ft-actions-btn')!.click()

                const etichette = [...document.querySelectorAll('.ft-actions-menu-item')].map((b) => b.textContent)
                expect(etichette.some((e) => e?.includes('Copy'))).toBe(true)
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
                const voceCopia = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent?.includes('Copy'))! // ⭐ 3/9 — etichetta tradotta
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
                const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent === 'New file')! // ⭐ 3/9 — etichetta tradotta
                voceMenu.click()

                expect(document.querySelector('#sheetTitle')?.textContent).toBe('New file')
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
                const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent === 'New folder')! // ⭐ 3/9 — etichetta tradotta
                voceMenu.click()

                expect(document.querySelector('#sheetTitle')?.textContent).toBe('New folder')
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
                // ⭐ 3/9 — etichette tradotte in inglese, apriMenuAzioniFile completata nello stesso giro
                expect(etichette.some((e) => e?.includes('New file'))).toBe(false)
                expect(etichette.some((e) => e?.includes('New folder'))).toBe(false)
            })

            it('⭐⭐⭐ CRUD-09: tasto destro sulla RADICE dell\'albero apre un menu con SOLO "Nuovo file"/"Nuova cartella"', async () => {
                await avviaSessioneConAlbero({ '': [{ nome: 'src', cartella: true }] })
                const radice = document.querySelector('.tree-root')!
                radice.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }))

                const etichette = [...document.querySelectorAll('.ft-actions-menu-item')].map((b) => b.textContent)
                expect(etichette).toEqual(['New file', 'New folder']) // ⭐ 3/9 — etichette tradotte
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
                const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent === 'New file')! // ⭐ 3/9 — etichetta tradotta
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

    it('REAL-SESSION-STOP-02 il bottone Stop, con una sessione reale attiva, chiama la POST vera invece del solo toggle demo', async () => {
        // ⭐ 29/8 — ledger §10: stopRealSession() esisteva già ma nessun bottone la chiamava mai — trovato leggendo il codice, non da un test che già passava.
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-stop' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: 'sess-stop', taskId: 'storia-x', conclusa: false, avviataAlle: '2026-08-26T10:00:00.000Z' }] } },
        ])
        await runtime().startRealSession({ id: 'storia-x' })
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'x' } }, generation)

        const fetchMock = mockFetch([{ metodo: 'POST', percorso: '/api/v1/sessions/sess-stop/stop', corpo: {} }])
        document.querySelector('.stop-run')?.dispatchEvent(new Event('click', { bubbles: true }))
        await Promise.resolve()

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/api/v1/sessions/sess-stop/stop'),
            expect.objectContaining({ method: 'POST' }),
        )
    })

    it('REAL-SESSION-RUNSTATE-01 RunStarted/RunFinished/RunError accendono e spengono DAVVERO la striscia "In esecuzione"', async () => {
        // ⭐ 29/8 — ledger §10: nessuno di questi tre case chiamava mai setRunState — la striscia non ha MAI riflesso un giro vero, solo il default statico del modulo.
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-running' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: 'sess-running', taskId: 'storia-x', conclusa: false, avviataAlle: '2026-08-26T10:00:00.000Z' }] } },
        ])
        await runtime().startRealSession({ id: 'storia-x' })
        const generation = runtime().realSessionState.generation
        const strip = () => document.querySelector('.run-strip')
        const label = () => document.querySelector('#runStateToggle strong')?.textContent

        // ⭐ 3/9 — etichette tradotte in inglese (avm-03, commit 8398f860): setRunState() ha solo due stati (Running/Stopped, mai un terzo "Interrotto" — RunFinished e RunError chiamano entrambi setRunState(false)), asserzione allineata al codice vero
        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'x' } }, generation)
        expect(strip()?.classList.contains('is-stopped')).toBe(false)
        expect(label()).toBe('Running')

        runtime().handleRealEvent({ type: 'RunFinished', result: { detto: 'Fatto.' } }, generation)
        expect(strip()?.classList.contains('is-stopped')).toBe(true)
        expect(label()).toBe('Stopped')

        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'y' } }, generation)
        expect(strip()?.classList.contains('is-stopped')).toBe(false)

        runtime().handleRealEvent({ type: 'RunError', code: 'INTERNAL_ERROR', message: 'boom' }, generation)
        expect(strip()?.classList.contains('is-stopped')).toBe(true)
        expect(label()).toBe('Stopped') // ⭐ 3/9 — vedi nota sopra, stessa etichetta a due stati
    })

    /*
     * ⛔⛔⛔ 3/9 — BUG REALE trovato SOLO dal dispositivo (CDP su un giro vero,
     * tablet landscape): aggiornaRunKpis() (app.js) cercava i tre valori con
     * $('[data-run-kpi="…"] b'), ma index.html non portava MAI quell'attributo
     * — sempre null, sempre "—" a schermo, anche con state.realSession.usage
     * (giri:4, token veri) e erroriStrumento (1) corretti nello stato interno.
     * Nessun test l'aveva preso perché ognuno controllava lo STATO, mai il DOM
     * che dovrebbe rifletterlo — esattamente il tipo di buco che [[screenshot-obbligatorio-e-fonte-di-anomalie]]
     * descrive. Qui si controlla il DOM, non lo stato.
     */
    it('⭐⭐⭐ REAL-SESSION-RUNKPIS-01 step/ctx/errors del run-strip riflettono DAVVERO lo stato — mai il trattino statico', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-kpis' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: 'sess-kpis', taskId: 'storia-x', conclusa: false, avviataAlle: '2026-08-26T10:00:00.000Z' }] } },
        ])
        await runtime().startRealSession({ id: 'storia-x' })
        const generation = runtime().realSessionState.generation
        const kpi = (nome: string) => document.querySelector(`[data-run-kpi="${nome}"] b`)?.textContent

        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'x' } }, generation)
        expect(kpi('step')).toBe('—') // nessun /usage ancora arrivato: onestamente ignoto
        expect(kpi('ctx')).toBe('—')
        expect(kpi('errors')).toBe('0') // gli errori si SANNO da subito (zero finora), non "ignoti" come i token

        runtime().handleRealEvent({ type: 'StateDelta', delta: [{ path: '/usage', value: { prompt_tokens: 900, completion_tokens: 100, giri: 2 } }] }, generation)
        expect(kpi('step')).toBe('2')
        expect(kpi('ctx')).toBe('1.0k') // 900+100, stessa formattaKilo di formattaUsageBreve

        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tk1', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'tk1', content: "error: ENOENT: no such file or directory, open 'nonexistent-xyz.txt'" }, generation)
        expect(kpi('errors')).toBe('1')

        // ⭐ un giro NUOVO (follow-up sulla stessa sessione) riparte da zero — mai i numeri del giro precedente appesi a schermo
        runtime().handleRealEvent({ type: 'RunStarted', input: { consegna: 'y', seguito: true } }, generation)
        expect(kpi('step')).toBe('—')
        expect(kpi('ctx')).toBe('—')
        expect(kpi('errors')).toBe('0')
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

        expect(document.querySelector('#conversation')?.textContent).toContain('Event connection lost.') // ⭐ 3/9 — testo tradotto in inglese
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

    // ⛔⛔⛔ 27/8, owner: "non riesco ad avere una conversazione base col
    // modello" — submitPrompt() rifiutava SEMPRE un secondo messaggio con
    // una sessione reale avviata, anche a run CONCLUSO: il composer
    // diventava inutilizzabile dopo la primissima risposta.
    // ⛔ 29/8 — RESUME-06, non RESUME-02: quel numero appartiene già a un
    // altro test (il bottone della palette, riga sotto in questo stesso
    // file) portato prima, sotto lo stesso nome usato dal canonico per
    // QUESTO test — mai due test con lo stesso identificatore.
    it('REAL-SESSION-RESUME-06 un follow-up su una sessione CONCLUSA chiama /resume con il messaggio, e lo mostra subito in chat', async () => {
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
        expect(terminaleDopo?.textContent).toContain('No command run in this session.') // ⭐ 3/9 — testo tradotto in inglese
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
            expect(md).toContain('No event recorded') // ⭐ 3/9 — testo tradotto in inglese
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
                expect(document.querySelector('#toastRegion')?.textContent).toContain('exported') // ⭐ 3/9 — testo tradotto in inglese
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
            expect(document.querySelector('#toastRegion')?.textContent).toContain('failed') // ⭐ 3/9 — testo tradotto in inglese ("Export failed")
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
            mockFetch([
                { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
                { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
            ])
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
            mockFetch([
                { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
                { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
            ])
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
            mockFetch([
                { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
                { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
            ])
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
            mockFetch([
                { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
                { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
            ])
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
     * ⭐⭐⭐ 28/8, ledger Fase 1/resume-compact §3.A — a differenza del test
     * sopra (che chiama `runtime().compactSession()` direttamente, e quindi
     * NON esercita mai il dispatcher), questo clicca il bottone VERO della
     * palette comandi (`data-command="compact"`) — lo stesso percorso che una
     * persona userebbe. Prima del fix chiamava un toast con un numero finto
     * e fisso, mai l'endpoint reale: questo test sarebbe passato ANCHE col
     * difetto (il toast non lancia), quindi verifica il FETCH, non solo
     * l'assenza di un errore.
     */
    it('REAL-SESSION-COMPACT-02 il bottone VERO della palette (data-command="compact") chiama /compact, non un toast finto', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-compatta-bottone' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-compact-bottone' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-compatta-bottone/compact', corpo: { compattato: true } },
        ])
        ;(document.querySelector('[data-command="compact"]') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/sessions/sess-compatta-bottone/compact',
            expect.objectContaining({ method: 'POST' }),
        )
    })

    /**
     * ⭐⭐⭐ 28/8, stesso ledger §3.B: 'resume' non era nemmeno un comando
     * riconosciuto — data-command="resume" non esisteva in index.html prima
     * di questo fix. Stesso principio del test sopra: clicca il bottone
     * vero, non la funzione sottostante.
     */
    it('REAL-SESSION-RESUME-02 il bottone VERO della palette (data-command="resume") chiama /resume, non ignora il click', async () => {
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-riprendi-bottone' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().startRealSession({ id: 'storia-resume-bottone' })

        const fetchMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-riprendi-bottone/resume', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        const bottone = document.querySelector('[data-command="resume"]')
        expect(bottone, 'il bottone "Riprendi sessione" deve esistere in index.html').not.toBeNull()
        ;(bottone as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/sessions/sess-riprendi-bottone/resume',
            expect.objectContaining({ method: 'POST' }),
        )
    })

    /**
     * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 — lo
     * stesso cancello di REAL-SESSION-AUTOMATION-03, ma sul bottone "Nuova
     * sessione" vero (#newSessionBtn -> createNewSession()): col tunnel
     * attivo apre il foglio dei task veri, non più il reset demo.
     */
    it('NEWSESSION-EMBEDDED-01 col tunnel attivo, "Nuova sessione" apre il foglio dei task veri (GET /api/v1/tasks), non il reset demo', async () => {
        document.documentElement.classList.add('talos-embedded')
        ;(window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase = 'http://localhost:4174'
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: 'http://localhost:4174/api/v1/tasks', corpo: { items: [] } },
        ])

        ;(document.querySelector('#newSessionBtn') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:4174/api/v1/tasks', expect.objectContaining({ method: 'GET' }))
    })

    it('⛔ NEWSESSION-EMBEDDED-02 AL CONTRARIO: stesso bottone, embedded SENZA tunnel resta il reset demo, zero fetch', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = mockFetch([])

        ;(document.querySelector('#newSessionBtn') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('REAL-SESSION-TASKSHEET-01 openRealTaskSheet elenca i task e li avvia SENZA .showModal() nativo', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [{ id: 'storia-t1', consegnaCorta: 'Sistema il test', difficolta: 2 }] } },
        ])
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        const showModalSpy = vi.fn()
        sheetDialog.showModal = showModalSpy

        await runtime().openRealTaskSheet()

        expect(showModalSpy).not.toHaveBeenCalled()
        expect(sheetDialog.hasAttribute('open')).toBe(true)
        const bottone = document.querySelector<HTMLButtonElement>('[data-start-task="storia-t1"]')
        expect(bottone).not.toBeNull()

        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions', corpo: { sessionId: 'sess-da-sheet' } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        bottone!.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(sheetDialog.hasAttribute('open')).toBe(false)
        expect(FakeEventSource.instances.at(-1)?.url).toBe('/api/v1/sessions/sess-da-sheet/events')
    })

    /*
     * ⭐⭐⭐ 28/8 — adattato da REAL-SESSION-TASKSHEET-01 del canonico
     * (b3df4e98): lì questo ERA lo stesso test di sopra, perché il
     * redesign desktop toglie del tutto la sezione 'task del banco' dalla
     * modale 'Nuova sessione'. Su questa copia i due flussi COESISTONO
     * (deciso durante il cherry-pick: il corpus resta secondario, mai il
     * default, ma reale) — quindi restano due test separati, non uno
     * fuso: il primo prova il compito del banco, questo prova il compito
     * libero (cartella+modello, poi il testo nel composer).
     */
    it('REAL-SESSION-TASKSHEET-01-BIS un compito libero (cartella+modello) avvia una sessione pendente, e il primo messaggio in chat la avvia per davvero', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        const sheetDialog = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        sheetDialog.showModal = vi.fn()
        await runtime().openRealTaskSheet()

        const form = document.querySelector<HTMLFormElement>('#customTaskForm')
        expect(form).not.toBeNull()
        expect(document.querySelector<HTMLSelectElement>('#customTaskCartella')?.options.length).toBe(1)
        expect(document.querySelector('.model-picker')).not.toBeNull()

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
        // ⭐ 29/8 — /api/v1/tasks aggiunto: su questa copia i task del banco restano una sezione secondaria SEMPRE scaricata (vedi ledger §26/nota su REAL-SESSION-TASKSHEET-01-BIS), in entrambe le modalità.
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
            { metodo: 'GET', percorso: '/api/v1/frequent-dirs', corpo: { items: [] } },
        ])

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
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } }])
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
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
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
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
            { metodo: 'GET', percorso: '/api/v1/frequent-dirs', corpo: { items: [{ etichetta: 'Desktop', percorso: 'C:/Users/prova/Desktop' }, { etichetta: 'Download', percorso: 'C:/Users/prova/Downloads' }] } },
        ])

        await runtime().openRealTaskSheet()

        const chip = [...document.querySelectorAll<HTMLButtonElement>('.sheet-shortcut-chip')]
        expect(chip.map((c) => c.textContent)).toEqual(['Desktop', 'Download'])
        chip[1].click()
        expect(document.querySelector<HTMLInputElement>('#customTaskCartellaLibera')?.value).toBe('C:/Users/prova/Downloads')
    })

    it('⛔⛔ FREQUENTI-02 AL CONTRARIO: SENZA "Full access", nessuna chiamata a /frequent-dirs — non serve, il campo non esiste nemmeno', async () => {
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
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
        // nessuna risposta finta per /frequent-dirs: mockFetch lancia, come una rete giù per davvero — catturato localmente, non blocca il resto.
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } }])

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
            mockFetch([
                { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
                { metodo: 'GET', percorso: '/api/v1/frequent-dirs', corpo: { items: [] } },
            ])
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
            const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent?.includes('Set as root'))! // ⭐ 3/9 — etichetta tradotta
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
            // ⭐ 3/9 — etichette tradotte in inglese (stesso giro: apriMenuAzioniFile completata, non solo le due voci già inglesi)
            expect(etichette.some((e) => e?.includes('Set as root'))).toBe(false)
            expect(etichette.some((e) => e?.includes('Open'))).toBe(true) // il menu file resta quello di sempre
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
            const voceMenu = [...document.querySelectorAll<HTMLButtonElement>('.ft-actions-menu-item')].find((b) => b.textContent?.includes('Set as root'))! // ⭐ 3/9 — etichetta tradotta
            voceMenu.click()

            expect(document.querySelector('#toastRegion')?.textContent).toContain('Unknown root') // ⭐ 3/9 — testo tradotto in inglese
            expect(document.querySelector('[data-open-sheet="permissions"] span')?.textContent).not.toBe('Full access')
        })
    })

    /*
     * ⭐⭐⭐ 28/8 — la card interattiva del permesso "On request", ORA
     * REALMENTE PORTATA (29/8, cherry-pick di 6c37f8d5): la nota qui sotto
     * diceva "NON portati, fase dedicata" — quella fase è arrivata.
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
     * giro di eventi invece che subito. ⭐ 29/8 — sostituisce la versione
     * di 68ad2ad6 con lo stesso nome, NON portata allora perché assumeva
     * un rifiuto sincrono ormai superato: questa versione, di f053d8c1,
     * è quella davvero allineata al comportamento asincrono attuale.
     */
    it('REAL-SESSION-TASKSHEET-03 senza una sessione pendente, il composer resta onesto (nessun campo compito nella modale a cui affidarsi)', async () => {
        const composerInput = document.querySelector<HTMLTextAreaElement>('#composerInput')!
        composerInput.value = 'qualcosa scritto senza mai aprire Nuova'
        document.querySelector<HTMLFormElement>('#composerForm')!.requestSubmit()
        await new Promise((resolve) => setTimeout(resolve, 0))

        // ⭐ 29/8 — testo vero di startRealSessionFromMessage (toast('No session started', ...)), non 'Nessuna sessione attiva' come assunto dal canonico in questo punto.
        expect(document.querySelector('#toastRegion')?.textContent).toContain('No session started')
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
        expect(document.querySelector('#toastRegion')?.textContent ?? '').not.toContain('No session started')
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

        expect(document.querySelector('#toastRegion')?.textContent).toContain('No session started')
        expect(FakeEventSource.instances.length).toBe(0)
    })

    /*
     * ⛔ 29/8 — la versione di REAL-SESSION-TASKSHEET-03 di 68ad2ad6
     * (canonico) NON è stata portata quel giorno: provava un rifiuto
     * SINCRONO ("Nessuna sessione attiva", zero fetch), comportamento già
     * sostituito da 80295fa5. f053d8c1 (sopra) ha portato la sua STESSA
     * versione con lo stesso nome, riallineata al flusso asincrono vero —
     * quel buco è chiuso, non più aperto.
     *
     * MODEL-PICKER-01/02 di 68ad2ad6 restano NON portati, ma per un motivo
     * diverso da quello scritto qui il 29/8 mattina: f053d8c1 (sopra) HA
     * portato un selettore modello dentro #customTaskForm
     * (creaModelPicker/creaEffortPicker) — la premessa "questa copia non
     * ha un model-picker qui" non vale più. Il motivo vero ora è che
     * MODEL-PICKER-01/02 assumevano il VECCHIO submit sincrono
     * (#customTaskForm → POST /api/v1/sessions/custom diretto); col nuovo
     * flusso (submit → pendingCustomSession → il POST vero parte dal
     * composer, stesso schema di EFFORT-PICKER-01/02/03 sopra) andrebbero
     * riscritti, non semplicemente riportati. 🔜 EFFORT-PICKER-01 prova
     * già che il valore del picker raggiunge la POST per `effort`; lo
     * stesso per `modello` in questo flusso resta un buco di copertura
     * dichiarato, non un comportamento mancante (il codice lo fa: vedi
     * `modelPicker.getValore()` in avviaSessionePendente).
     */
    it('REAL-SESSION-TASKSHEET-02 senza cartelle configurate, mostra un messaggio onesto invece di un form rotto', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [] } },
        ])

        await runtime().openRealTaskSheet()

        expect(document.querySelector('#customTaskCartella')).toBeNull()
        expect(document.querySelector('#sheetBody')?.textContent).toContain('TALOS_HARNESS_UI_PROJECT_DIRS')
    })
})

/**
 * ⭐⭐⭐ 29/8 — porting dal bundle desktop (FASE A/C del ledger basso livello,
 * chiuse 28/8 su desktop, vedi LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md). Il
 * foglio "control" (Doctor/Hooks) e "sessionTree" (deleghe sub-agenti)
 * mostravano lo stesso bluff che desktop aveva PRIMA della FASE A: contatori
 * inventati, zero fetch. Stesso schema di mock del blocco sopra.
 */
describe('Harness UI — Doctor, Hooks, deleghe sub-agenti (porting FASE A/C dal desktop)', () => {
    beforeEach(() => {
        document.body.className = ''
        // ⛔ jsdom persiste UN documento per file: un test embedded altrove nel file (NEWSESSION-EMBEDDED-*) può lasciare la classe qui — pulita per isolamento, anche se questo blocco non la legge oggi.
        document.documentElement.classList.remove('talos-embedded')
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

    it('DOCTOR-01 il foglio control mostra "Verifica…" finché la fetch non torna, poi il badge reale', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/doctor', corpo: { chiaveApi: true, shell: 'wsl2', git: true, naviga: true } },
        ])

        runtime().openSheet('control')
        const badge = document.querySelector('[data-doctor-status]')
        expect(badge?.textContent).toBe('Verifica…')
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('[data-doctor-status]')?.textContent).toBe('Healthy')
    })

    it('DOCTOR-02 problemi reali (shell non wsl2, git assente) contano nel badge, non un booleano solo', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/doctor', corpo: { chiaveApi: true, shell: 'none', git: false, naviga: true } },
        ])

        runtime().openSheet('control')
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('[data-doctor-status]')?.textContent).toBe('2 da rivedere')
    })

    it('⛔ DOCTOR-03 AL CONTRARIO: /api/v1/doctor fallisce, il badge dice "Non disponibile", nessun crash', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/doctor', corpo: { message: 'offline' }, ok: false, status: 500 }])

        runtime().openSheet('control')
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('[data-doctor-status]')?.textContent).toBe('Not available') // ⭐ 3/9 — testo tradotto in inglese
    })

    it('⛔ DOCTOR-04 AL CONTRARIO: refreshDoctorBadge() senza il foglio aperto non lancia e non chiama fetch', async () => {
        const fetchMock = mockFetch([])
        await expect(runtime().refreshDoctorBadge()).resolves.toBeUndefined()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('DOCTOR-05 il SECONDO bottone Doctor (card "Control plane" di Impostazioni) chiama /api/v1/doctor per davvero, non il toast finto', async () => {
        /*
         * ⭐ 30/8 — porta canonico (b84e61df, dimenticato dal 27/8): questo
         * bottone (fuori dal foglio "control", vive nella card "Control
         * plane" di Impostazioni) mostrava ANCORA `toast('Doctor:
         * Healthy', ...)` hardcoded — un SECONDO punto d'ingresso mai
         * riallineato quando il primo (dentro il foglio, DOCTOR-01/02/03)
         * era già diventato reale. Stesso principio di HOOKS-05: si clicca
         * il bottone VERO, non si chiama eseguiDoctor() direttamente.
         */
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/doctor', corpo: { chiaveApi: true, shell: 'none', git: false, naviga: true } },
        ])
        const bottone = document.querySelector('[data-control-action="doctor"]') as HTMLButtonElement | null
        expect(bottone).not.toBeNull()
        bottone?.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/doctor'), expect.anything())
    })

    it('⛔ DOCTOR-06 AL CONTRARIO: se /api/v1/doctor fallisce dal SECONDO bottone, niente crash e niente più "Healthy" finto', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/doctor', corpo: { message: 'offline' }, ok: false, status: 500 }])
        const bottone = document.querySelector('[data-control-action="doctor"]') as HTMLButtonElement | null
        expect(() => bottone?.click()).not.toThrow()
        await new Promise((r) => setTimeout(r, 0))
        // nessuna assert sul testo del toast qui (mockToast non è nello scope di questo describe) — la sola garanzia provata è che il fetch reale è stato tentato e il click non ha lanciato, mai più il ramo hardcoded che non chiamava nessuna API.
    })

    it('HOOKS-01 nessuna sessione attiva: stato onesto, ZERO fetch (fail-closed, non un elenco vuoto finto)', async () => {
        const fetchMock = mockFetch([])
        runtime().openSheet('control')
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/hooks'), expect.anything())
        expect(document.querySelector('#hooksListMount')?.textContent).toContain('No active session') // ⭐ 3/9 — testo tradotto in inglese
    })

    it('HOOKS-02 con sessione attiva, elenca gli hook veri; un hook non fidato mostra "Fida", uno fidato mostra "attivo"', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/doctor', corpo: { chiaveApi: true, shell: 'wsl2', git: true, naviga: true } },
            {
                metodo: 'GET', percorso: '/api/v1/sessions/sess-hooks/hooks',
                corpo: { hooks: [{ id: 'pre-tool-lint', eventi: ['PreToolUse'], fidato: false }, { id: 'post-tool-log', eventi: ['PostToolUse'], fidato: true }] },
            },
        ])
        runtime().realSessionState.id = 'sess-hooks'

        runtime().openSheet('control')
        await new Promise((r) => setTimeout(r, 0))

        const mount = document.querySelector('#hooksListMount')!
        expect(mount.textContent).toContain('pre-tool-lint')
        expect(mount.textContent).toContain('post-tool-log')
        expect(mount.querySelectorAll('button').length).toBe(1) // solo l'hook non fidato ha un bottone "Fida"
        expect(mount.textContent).toContain('attivo')
    })

    it('HOOKS-03 "Fida" chiama POST .../trust e ricarica l\'elenco: l\'hook risulta attivo', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/doctor', corpo: { chiaveApi: true, shell: 'wsl2', git: true, naviga: true } },
            { metodo: 'GET', percorso: '/api/v1/sessions/sess-hooks/hooks', corpo: { hooks: [{ id: 'pre-tool-lint', eventi: ['PreToolUse'], fidato: false }] } },
        ])
        runtime().realSessionState.id = 'sess-hooks'
        runtime().openSheet('control')
        await new Promise((r) => setTimeout(r, 0))

        const fidaBtn = document.querySelector('#hooksListMount button') as HTMLButtonElement
        const postMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/sessions/sess-hooks/hooks/pre-tool-lint/trust', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/sessions/sess-hooks/hooks', corpo: { hooks: [{ id: 'pre-tool-lint', eventi: ['PreToolUse'], fidato: true }] } },
        ])
        fidaBtn.click()
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 0))

        expect(postMock).toHaveBeenCalledWith('/api/v1/sessions/sess-hooks/hooks/pre-tool-lint/trust', expect.objectContaining({ method: 'POST' }))
        expect(document.querySelector('#hooksListMount')?.textContent).toContain('attivo')
        expect(document.querySelector('#hooksListMount button')).toBeNull()
    })

    it('⛔ HOOKS-04 AL CONTRARIO: "Fida" fallisce, il bottone torna cliccabile con lo stesso testo, l\'hook resta non fidato', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/doctor', corpo: { chiaveApi: true, shell: 'wsl2', git: true, naviga: true } },
            { metodo: 'GET', percorso: '/api/v1/sessions/sess-hooks/hooks', corpo: { hooks: [{ id: 'pre-tool-lint', eventi: ['PreToolUse'], fidato: false }] } },
        ])
        runtime().realSessionState.id = 'sess-hooks'
        runtime().openSheet('control')
        await new Promise((r) => setTimeout(r, 0))

        const fidaBtn = document.querySelector('#hooksListMount button') as HTMLButtonElement
        mockFetch([{ metodo: 'POST', percorso: '/api/v1/sessions/sess-hooks/hooks/pre-tool-lint/trust', corpo: { message: 'negato' }, ok: false, status: 403 }])
        fidaBtn.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fidaBtn.disabled).toBe(false)
        expect(fidaBtn.textContent).toBe('Fida')
    })

    it('⛔ HOOKS-05 AL CONTRARIO: il bottone VERO che apre il foglio control resta raggiungibile per una sessione reale, non solo runtime().openSheet()', async () => {
        // ⭐ 29/8 — ledger §13: ogni test DOCTOR-*/HOOKS-* sopra apre il foglio chiamando runtime().openSheet('control') direttamente — nessuno clicca il bottone vero. Trovato leggendo index.html: quel bottone viveva SOLO dentro .mission-card, il mockup che selectSession() (§9) sostituisce con l'hero per ogni sessione reale — irraggiungibile da quel momento, e questa intera batteria di test non se ne sarebbe mai accorta.
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/doctor', corpo: { chiaveApi: true, shell: 'wsl2', git: true, naviga: true } },
        ])
        runtime().selectSession({ id: '4d1136ce-e514-4e6e-944d-bd083bce224b', title: 'Sessione reale' })
        expect(document.querySelector('.mission-card')).toBeNull() // precondizione: il mockup è sparito

        const bottone = document.querySelector('[data-open-sheet="control"]') as HTMLButtonElement | null
        expect(bottone).not.toBeNull()
        expect(document.querySelector('.mission-card [data-open-sheet="control"]')).toBeNull() // mai dentro il mockup: vive in testata, persistente
        bottone?.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('#hooksListMount')).not.toBeNull()
    })

    /*
     * ⛔ 29/8, ledger §22: "zero fetch" ridefinito come "zero fetch verso
     * .../children" — 582dffcf (già portato) ha aggiunto un refresh al
     * boot (aggiornaElencoSessioniReali/renderAutomationsReali,
     * window.setTimeout(...,0) in mountStaticRuntime), che questo test
     * (scritto prima) non anticipava: `await new Promise(...,0)` fa
     * scattare ANCHE quel timer di boot, non solo l'azione del test.
     * Le due chiamate innocue vanno soddisfatte, non più assunte
     * assenti — l'assert vero di questo test resta sulla rotta
     * children, mai chiamata senza una sessione attiva.
     */
    it('SUBAGENTI-01 nessuna sessione attiva: stato onesto nel foglio "Albero sessione", zero fetch verso .../children', async () => {
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
            { metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [] } },
        ])
        runtime().openSheet('sessionTree')
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/children'))).toBe(false)
        expect(document.querySelector('#subagentTreeMount')?.textContent).toContain('No active session') // ⭐ 3/9 — testo tradotto in inglese
    })

    it('SUBAGENTI-02 con deleghe reali, ogni riga passa alla sessione figlia e chiude il foglio', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/sessions/sess-parent/children', corpo: { figli: [{ sessionId: 'sess-child-1', task: 'Rivedi il diff CSS', conclusa: true, esitoDelega: 'riuscita' }] } },
        ])
        runtime().realSessionState.id = 'sess-parent'

        runtime().openSheet('sessionTree')
        await new Promise((r) => setTimeout(r, 0))

        const riga = document.querySelector('#subagentTreeMount button') as HTMLButtonElement
        expect(riga.textContent).toContain('Rivedi il diff CSS')
        expect(riga.textContent).toContain('riuscita')

        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } }])
        riga.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(runtime().realSessionState.id).toBe('sess-child-1')
        expect(document.querySelector('#sheetDialog')?.hasAttribute('open')).toBe(false)
    })

    it('⛔ SUBAGENTI-03 AL CONTRARIO: nessuna delega ancora, messaggio onesto e nessuna riga cliccabile', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions/sess-parent/children', corpo: { figli: [] } }])
        runtime().realSessionState.id = 'sess-parent'

        runtime().openSheet('sessionTree')
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('#subagentTreeMount')?.textContent).toContain('No delegation yet') // ⭐ 3/9 — testo tradotto in inglese
        expect(document.querySelectorAll('#subagentTreeMount button').length).toBe(0)
    })
})

/**
 * ⭐⭐⭐ 29/8 — porting dal bundle desktop, blocco Automazioni (commit desktop
 * `582dffcf`/27/8, vedi LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md). Stesso
 * schema di mock del blocco sopra. Nota sul cancello: desktop usa un check
 * grezzo `talos-embedded` per 'new' e per il boot (mai vero su desktop
 * stesso, quindi mai esercitato lì) — qui porto `embeddedDemoOnly()`, già
 * corretto e già in uso per 'run' nello stesso file, non il check grezzo:
 * le prove AL CONTRARIO sotto provano ESATTAMENTE perché (con `talos-embedded`
 * da solo, l'automazione non partirebbe mai nemmeno col tunnel attivo).
 */
describe('Harness UI — Automazioni (porting dal bundle desktop)', () => {
    beforeEach(() => {
        document.body.className = ''
        // ⛔ CAUSA REALE trovata provando (non ipotizzata): NEWSESSION-EMBEDDED-01/02, altrove nel file, lasciano 'talos-embedded' su document.documentElement — jsdom persiste UN documento per file, la classe sopravvive fra describe diversi. embeddedDemoOnly() la legge per davvero qui (gate su 'new' e sul boot): senza questa riga, AUTOMATIONS-01/04/08 fallivano non per un difetto del porting ma per una fuga di stato del test precedente.
        document.documentElement.classList.remove('talos-embedded')
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

    it('AUTOMATIONS-01 renderAutomationsReali() aggiorna la card della sidebar col conteggio vero e la prossima esecuzione vera', async () => {
        mockFetch([{
            metodo: 'GET', percorso: '/api/v1/automations',
            corpo: { items: [{ id: 'a1', nome: 'Weekly audit', attiva: true, intervalloMinuti: 60, limiteAlGiorno: 3, prossimaEsecuzione: '2026-08-29T10:00:00.000Z' }] },
        }])

        await runtime().renderAutomationsReali()

        const card = document.querySelector('.attention-card')!
        expect(card.hasAttribute('hidden')).toBe(false)
        expect(card.querySelector('strong')?.textContent).toBe('1 automazione')
    })

    it('⛔ AUTOMATIONS-02 AL CONTRARIO: embedded SENZA tunnel, entrare nella vista Automazioni non fa nessuna fetch (zero fetch fantasma)', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = mockFetch([])

        runtime().setView('automations')
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('AUTOMATIONS-03 zero automazioni: la card sparisce (hidden), non resta il testo scritto a mano', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [] } }])

        await runtime().renderAutomationsReali()

        expect(document.querySelector('.attention-card')?.hasAttribute('hidden')).toBe(true)
    })

    it('AUTOMATIONS-04 setView("automations") carica l\'elenco vero nel mount point, in aggiunta alla riga reale già esistente', async () => {
        mockFetch([{
            metodo: 'GET', percorso: '/api/v1/automations',
            corpo: { items: [{ id: 'a1', nome: 'Weekly audit', attiva: false, intervalloMinuti: 60, limiteAlGiorno: 3 }] },
        }])

        runtime().setView('automations')
        await new Promise((r) => setTimeout(r, 0))

        const mount = document.querySelector('#automationListReal')!
        expect(mount.textContent).toContain('Weekly audit')
        expect(mount.querySelector('.status-chip')?.textContent).toBe('Pausa')
        // la riga statica reale (Sconto a scaglioni, avvio manuale) resta intatta accanto al mount point
        expect(document.querySelector('[data-task-id="sconto-a-scaglioni"]')).not.toBeNull()
    })

    it('AUTOMATIONS-05 "Pausa"/"Attiva" chiama POST .../toggle e ricarica l\'elenco', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [{ id: 'a1', nome: 'Weekly audit', attiva: true, intervalloMinuti: 60, limiteAlGiorno: 3 }] } }])
        await runtime().renderAutomationsReali()

        const toggleBtn = Array.from(document.querySelectorAll('#automationListReal button')).find((b) => b.textContent === 'Pausa') as HTMLButtonElement
        const postMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/automations/a1/toggle', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [{ id: 'a1', nome: 'Weekly audit', attiva: false, intervalloMinuti: 60, limiteAlGiorno: 3 }] } },
        ])
        toggleBtn.click()
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 0))

        expect(postMock).toHaveBeenCalledWith('/api/v1/automations/a1/toggle', expect.objectContaining({ method: 'POST', body: JSON.stringify({ attiva: false }) }))
        expect(document.querySelector('#automationListReal .status-chip')?.textContent).toBe('Pausa')
    })

    it('AUTOMATIONS-06 "Elimina" chiama POST .../elimina e la riga sparisce dopo il ricarico', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [{ id: 'a1', nome: 'Weekly audit', attiva: false, intervalloMinuti: 60, limiteAlGiorno: 3 }] } }])
        await runtime().renderAutomationsReali()

        const eliminaBtn = Array.from(document.querySelectorAll('#automationListReal button')).find((b) => b.textContent === 'Delete') as HTMLButtonElement // ⭐ 3/9 — etichetta tradotta in inglese
        mockFetch([
            { metodo: 'POST', percorso: '/api/v1/automations/a1/elimina', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [] } },
        ])
        eliminaBtn.click()
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('#automationListReal')?.children.length).toBe(0)
    })

    /*
     * ⛔ 29/8, ledger §22: 582dffcf (già portato) ha aggiunto un refresh
     * al boot (window.setTimeout(...,0) in mountStaticRuntime chiama
     * aggiornaElencoSessioniReali()/renderAutomationsReali() una volta
     * sola per test) — questo test (scritto prima) non lo anticipava.
     * Smaltito ESPLICITAMENTE con un primo giro di macrotask PRIMA di
     * azzerare la cronologia della spy (mockClear): il conteggio/ultima
     * chiamata che contano DAVVERO restano quelli del toggle, non
     * mescolati col rumore del boot.
     */
    it('⛔ AUTOMATIONS-07 AL CONTRARIO: toggle fallito mostra un errore e NON ricarica (l\'elenco resta quello di prima)', async () => {
        const fetchMock = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [{ id: 'a1', nome: 'Weekly audit', attiva: true, intervalloMinuti: 60, limiteAlGiorno: 3 }] } },
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } },
        ])
        await runtime().renderAutomationsReali()
        await new Promise((r) => setTimeout(r, 0)) // smaltisce il refresh al boot, se non era già passato
        fetchMock.mockClear()

        const toggleBtn = document.querySelector('#automationListReal button') as HTMLButtonElement
        mockFetch([{ metodo: 'POST', percorso: '/api/v1/automations/a1/toggle', corpo: { message: 'negato' }, ok: false, status: 403 }])
        toggleBtn.click()
        await new Promise((r) => setTimeout(r, 0))

        // 1 = solo il POST fallito — NESSUN GET di ricarico dopo l'errore, quello è il punto della prova (la cronologia è stata azzerata sopra, il rumore del boot non conta più).
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/automations/a1/toggle', expect.objectContaining({ method: 'POST' }))
        expect(document.querySelector('#automationListReal .status-chip')?.textContent).toBe('Attiva')
    })

    it('AUTOMATIONS-08 "Nuova automazione" (non embedded) apre il vero form coi task del corpus', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [{ id: 'storia-t1', difficolta: 2 }] } }])

        ;(document.querySelector('[data-automation-action="new"]') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 0))

        expect(document.querySelector('#sheetDialog')?.hasAttribute('open')).toBe(true)
        expect(document.querySelector('#sheetTitle')?.textContent).toBe('Nuova automazione')
        // scoped a #sheetBody: la pagina ha già un altro <select> (#campaignSelect, Board) con un <option> statico "Caricamento…" più in alto nel DOM.
        expect(document.querySelector('#sheetBody select option')?.textContent).toContain('storia-t1')
    })

    it('⛔ AUTOMATIONS-09 AL CONTRARIO: stesso bottone, embedded SENZA tunnel, resta il toast finto — zero fetch, foglio non aperto', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = mockFetch([])

        ;(document.querySelector('[data-automation-action="new"]') as HTMLButtonElement).click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalled()
        expect(document.querySelector('#sheetDialog')?.hasAttribute('open')).toBe(false)
    })

    it('AUTOMATIONS-10 inviare il form crea l\'automazione, chiude il foglio e ricarica l\'elenco', async () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [{ id: 'storia-t1', difficolta: 2 }] } }])
        await runtime().openNewAutomationSheet()

        const postMock = mockFetch([
            { metodo: 'POST', percorso: '/api/v1/automations', corpo: {} },
            { metodo: 'GET', percorso: '/api/v1/automations', corpo: { items: [] } },
        ])
        document.querySelector('#sheetBody form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 0))

        expect(postMock).toHaveBeenCalledWith('/api/v1/automations', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ taskId: 'storia-t1', intervalloMinuti: 30, limiteAlGiorno: 3 }),
        }))
        expect(document.querySelector('#sheetDialog')?.hasAttribute('open')).toBe(false)
    })
})

/**
 * ⭐⭐⭐ 29/8 — porting dal bundle desktop, tool-call collassabile (commit
 * desktop `09bcd0cb`/27/8, vedi LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md).
 * Prima: appendToolNote(text) scriveva un blocco sempre aperto col testo
 * grezzo, e ToolCallArgs aggiornava ".real-tool-note .assistant-copy" più
 * in fondo alla pagina — fragile con più tool-call in corsa o altre card
 * real-tool-note nel mezzo (Terminale/Browser). TOOLCALL-06 prova
 * esattamente questa correzione.
 */
describe('Harness UI — gruppo di tool-call collassato, con diff per-file (owner 30/8, due screenshot di Claude Code come riferimento)', () => {
    beforeEach(() => {
        document.body.className = ''
        document.documentElement.classList.remove('talos-embedded')
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

    it('TOOLGROUP-01 ToolCallStart crea un GRUPPO (non più un bubble singolo), riassunto per categoria, avviso chiuso', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell' }, generation)

        expect(document.querySelectorAll('.real-tool-group').length).toBe(1)
        expect(document.querySelector('.tool-note-summary-text')?.textContent).toBe('Ran a command') // ⭐ 3/9 — testo tradotto in inglese
        expect(document.querySelector('.tool-group-warn')?.hasAttribute('hidden')).toBe(true)
    })

    it('TOOLGROUP-02 tool-call CONSECUTIVI (categorie diverse) restano nello STESSO gruppo, riassunto nell\'ordine di comparsa', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'scrivi' }, generation)

        expect(document.querySelectorAll('.real-tool-group').length).toBe(1)
        expect(document.querySelector('.tool-note-summary-text')?.textContent).toBe('Ran a command, modified a file') // ⭐ 3/9 — testo tradotto in inglese
    })

    it('TOOLGROUP-03 un messaggio di testo NUOVO chiude il gruppo: il prossimo tool-call ne apre uno SEPARATO', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Ecco cosa faccio ora:' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'shell' }, generation)

        expect(document.querySelectorAll('.real-tool-group').length).toBe(2)
    })

    it('⛔ TOOLGROUP-03B AL CONTRARIO: un SECONDO delta dello STESSO messaggio (messageId già visto) non apre un terzo gruppo', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Ecco ' }, generation)
        runtime().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'cosa faccio:' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'shell' }, generation)

        expect(document.querySelectorAll('.real-tool-group').length).toBe(2) // non 3: il secondo delta non ha richiuso un gruppo già chiuso/inesistente
    })

    it('TOOLGROUP-04 un tocco sul riassunto apre il foglio con la lista COMPLETA (comportamento attuale conservato) — icona+etichetta+bersaglio per riga', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't1', delta: JSON.stringify({ percorso: 'README.md' }) }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't2', delta: JSON.stringify({ comando: 'npm test' }) }, generation)

        document.querySelector<HTMLButtonElement>('.tool-group-summary')!.click()

        expect(document.querySelector('#sheetTitle')?.textContent).toBe('Read a file, ran a command') // ⭐ 3/9 — testo tradotto in inglese
        const righe = document.querySelectorAll('.tool-group-sheet-row')
        expect(righe.length).toBe(2)
        // ⭐ 3/9 — ETICHETTA_CATEGORIA tradotta in inglese
        expect(righe[0].querySelector('strong')?.textContent).toBe('Read')
        expect(righe[0].querySelector('.tool-group-sheet-target')?.textContent).toBe('README.md')
        expect(righe[1].querySelector('strong')?.textContent).toBe('Ran')
        expect(righe[1].querySelector('.tool-group-sheet-target')?.textContent).toBe('npm test')
    })

    it('TOOLGROUP-05 una scrittura su un file ESISTENTE calcola un diff VERO (+n/-n) — sul totale del gruppo E sulla riga del foglio', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'scrivi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't1', delta: JSON.stringify({ percorso: 'src/index.ts', contenuto: 'a\nb\nc\nd' }) }, generation)
        runtime().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/index.ts', value: 'a\nb\nc\nd', previous: 'a\nx\nc' }] }, generation)

        expect(document.querySelector('.tool-note-summary-text')?.textContent).toBe('Modified a file') // ⭐ 3/9 — tradotto; esisteva già: "modificato", non "creato"
        const conteggi = document.querySelector('.tool-group-counts')!
        expect(conteggi.querySelector('.diff-add')?.textContent).toBe('+2') // 'b' e 'd' sono nuove
        expect(conteggi.querySelector('.diff-del')?.textContent).toBe('-1') // 'x' sparisce

        document.querySelector<HTMLButtonElement>('.tool-group-summary')!.click()
        const riga = document.querySelector('.tool-group-sheet-row')!
        expect(riga.querySelector('.diff-add')?.textContent).toBe('+2')
        expect(riga.querySelector('.diff-del')?.textContent).toBe('-1')
    })

    it('TOOLGROUP-06 una scrittura su un file NUOVO (op "add") dice "Creato", non "Modificato" — ogni riga è un\'aggiunta, zero rimozioni', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'scrivi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't1', delta: JSON.stringify({ percorso: 'nuovo.ts', contenuto: 'uno\ndue\ntre' }) }, generation)
        runtime().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'add', path: '/file/nuovo.ts', value: 'uno\ndue\ntre', previous: null }] }, generation)

        expect(document.querySelector('.tool-note-summary-text')?.textContent).toBe('Created a file') // ⭐ 3/9 — testo tradotto in inglese
        expect(document.querySelector('.diff-add')?.textContent).toBe('+3')
        expect(document.querySelector('.diff-del')?.textContent).toBe('') // mai "-0": zero non si mostra, vedi aggiornaRiassuntoGruppoTool
    })

    it('⛔ TOOLGROUP-06B AL CONTRARIO: un file troppo grande per il diff (oltre RIGHE_MASSIME_DIFF) non mostra NESSUN numero, mai un "+0 -0" inventato', () => {
        const generation = runtime().realSessionState.generation
        const enorme = Array.from({ length: 1600 }, (_, i) => `riga ${i}`).join('\n')
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'scrivi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't1', delta: JSON.stringify({ percorso: 'grande.txt', contenuto: enorme }) }, generation)
        runtime().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/grande.txt', value: enorme, previous: enorme.replace('riga 5', 'RIGA 5') }] }, generation)

        const conteggi = document.querySelector('.tool-group-counts')!
        expect(conteggi.querySelector('.diff-add')?.textContent).toBe('')
        expect(conteggi.querySelector('.diff-del')?.textContent).toBe('')
        expect(document.querySelector('.tool-note-summary-text')?.textContent).toBe('Modified a file') // ⭐ 3/9 — tradotto; esisteva già, anche se il diff non si può calcolare
    })

    it('TOOLGROUP-07 ⚠️ un esito che "pare fallito" (stesso vocabolario REFUSED./exit N≠0 del kernel, talosHarness.mjs) accende l\'avviso sul gruppo', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 't1', content: 'exit 1 [sandbox: none]\ncomando non trovato' }, generation)

        expect(document.querySelector('.tool-group-warn')?.hasAttribute('hidden')).toBe(false)
    })

    it('⛔ TOOLGROUP-08 AL CONTRARIO: un esito PULITO (exit 0) NON accende l\'avviso — non è acceso di default', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 't1', content: 'exit 0 [sandbox: none]\ntutto ok' }, generation)

        expect(document.querySelector('.tool-group-warn')?.hasAttribute('hidden')).toBe(true)
    })

    it('TOOLGROUP-09 due tool-call in corsa insieme aggiornano OGNUNO il proprio item, mai quello dell\'altro (prova la correzione della fragilità .at(-1))', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'b', toolCallName: 'cerca' }, generation)
        // gli argomenti di "b" (l'ULTIMO item creato) arrivano per "a" (il PRIMO) — indicizzare per posizione invece che per toolCallId finirebbe nell'item sbagliato.
        runtime().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'a', delta: JSON.stringify({ percorso: 'README.md' }) }, generation)

        document.querySelector<HTMLButtonElement>('.tool-group-summary')!.click()
        const bersagli = Array.from(document.querySelectorAll('.tool-group-sheet-target')).map((el) => el.textContent)
        expect(bersagli).toEqual(['README.md', 'nel progetto'])
    })

    it('TOOLGROUP-10 un tocco su una riga del foglio apre il SUO dettaglio (argomenti+esito) — "comportamento attuale" conservato, niente va perso rispetto a prima', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'prova' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallResult', toolCallId: 't1', content: 'exit 0\nℹ pass 12\nℹ fail 0\n' }, generation)

        document.querySelector<HTMLButtonElement>('.tool-group-summary')!.click()
        const riga = document.querySelector<HTMLButtonElement>('.tool-group-sheet-row')!
        expect(riga.querySelector('.tool-group-sheet-target')?.textContent).toBe('✓ Test verdi — 12/12')
        expect(riga.getAttribute('aria-expanded')).toBe('false')

        riga.click()

        expect(riga.getAttribute('aria-expanded')).toBe('true')
        const dettaglio = riga.nextElementSibling as HTMLElement
        expect(dettaglio.hidden).toBe(false)
        const chiavi = Array.from(dettaglio.querySelectorAll('.tool-arg-key')).map((el) => el.textContent)
        expect(chiavi).toContain('Esito:')
        expect(dettaglio.textContent).toContain('pass 12')
    })

    it('TOOLGROUP-11 QueuedMessageDelivered/ApprovalRequested/ArtifactCreated chiudono il gruppo corrente come un messaggio di testo', () => {
        const generation = runtime().realSessionState.generation
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi' }, generation)
        runtime().handleRealEvent({ type: 'ArtifactCreated', titolo: 'Grafico', id: 'art-1' }, generation)
        runtime().handleRealEvent({ type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'shell' }, generation)

        expect(document.querySelectorAll('.real-tool-group').length).toBe(2)
    })
})

/**
 * ⭐⭐⭐ 29/8 — BUG REALE trovato SUL DISPOSITIVO (owner: "nella schermata
 * principale c'è ancora tutto il component mockup"), non da una grep.
 * `selectSession()` usciva subito (`return false`, MAI aggiornando
 * `state.session`/il titolo) quando l'id selezionato non corrispondeva a
 * nessuna delle 5 righe statiche `.session-item` del mockup — cioè
 * SEMPRE, per ogni sessione mobile vera (un UUID reale non può comparire
 * in un elenco scritto a mano). Il chiamante (harnessUiBridge.ts) aveva
 * un secondo difetto gemello che nascondeva il primo: ignorava il valore
 * di ritorno e riportava sempre successo — coperto separatamente in
 * harnessUiBridge.test.ts/harnessSessionScreen.test.ts. Qui solo il
 * livello app.js: la funzione vera, non un mock.
 */
describe('Harness UI — selectSession con un id reale, senza una riga statica corrispondente (bug reale, 29/8)', () => {
    beforeEach(() => {
        document.body.className = ''
        document.documentElement.classList.remove('talos-embedded')
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

    it('SELECT-SESSION-REAL-ID-01 un id reale (nessuna riga statica corrispondente) aggiorna comunque il titolo e torna true', () => {
        const esito = runtime().selectSession({ id: '4d1136ce-e514-4e6e-944d-bd083bce224b', title: 'Elenca i file del workspace' })

        expect(esito).toBe(true)
        expect(document.querySelector('#sessionTitle')?.textContent).toBe('Elenca i file del workspace')
    })

    /**
     * ⛔⛔⛔ 29/8 — la seconda metà dello stesso bug, owner: "deve mostrare il
     * logo, la scritta Talos, il messaggio di benvenuto, puoi usare
     * esattamente lo stesso component [della chat]". Prima di questa prova,
     * il titolo si aggiornava (dopo il primo fix) ma #conversation restava
     * il Mission/Plan/Attività statico del mockup — mai reale per una
     * sessione mobile vera, nemmeno un istante.
     */
    /*
     * ⛔ 29/8, ledger §24 (cherry-pick 80295fa5, applicato retroattivamente):
     * `.mission-card` e le 5 session-item statiche di "parità desktop" non
     * esistono più — 80295fa5 le ha rimosse per intero da index.html
     * (owner: "cancella tutte le sessioni mockup"). La precondizione di
     * SELECT-SESSION-REAL-ID-04 aggiornata su #conversationEmptyState (il
     * nuovo stato onesto che la sostituisce); SELECT-SESSION-REAL-ID-05 e
     * -02 (entrambe sul "combacia con una riga demo") rimosse — lo
     * scenario che provano non può più accadere, non esiste più nessuna
     * riga demo con cui combaciare.
     */
    /*
     * ⭐⭐⭐ 2/9 — riscritta: owner dal vivo, DUE segnalazioni sullo stesso
     * hero nello stesso giro. (1) "quando clicco su una sessione i
     * messaggi... non compaiono" — l'hero mostrato qui non era più
     * "vuota, mai avviata" (quel caso resta a costruisciConversationHero,
     * invariato) ma "sto CARICANDO la vera cronologia" — un `void
     * caricaCronologiaSessione(...)` risolve l'hero con lo stream reale
     * o un messaggio onesto di non-disponibilità (vedi il describe
     * dedicato per quei due esiti). (2) "quando il loader è visibile
     * devi nascondere il logo e la scritta talos" — quell'hero NON porta
     * più `.hero-logo`/`.hero-wordmark`: non è un momento di marca, è
     * un'attesa. Il vecchio nome/assert ("hero logo+TALOS+messaggio")
     * descriveva ESATTAMENTE il difetto segnalato dall'owner.
     */
    it('SELECT-SESSION-REAL-ID-04 un id reale sostituisce SUBITO lo stato onesto vuoto con l\'hero di CARICAMENTO (niente logo/wordmark)', () => {
        expect(document.querySelector('#conversationEmptyState')).not.toBeNull() // precondizione: lo stato vuoto onesto è ancora lì prima della selezione

        const esito = runtime().selectSession({ id: '4d1136ce-e514-4e6e-944d-bd083bce224b', title: 'Elenca i file del workspace' })

        expect(esito).toBe(true)
        // ⛔ 29/8: costruisciConversationHero()/costruisciConversationHeroCaricamento() riusano DELIBERATAMENTE lo stesso id
        // 'conversationEmptyState' sull'hero che generano (stesso id, classe diversa) —
        // l'id non sparisce mai. Quello che cambia davvero è la classe e il contenuto:
        // lo stato onesto statico portava class="board-empty conversation-empty" e il
        // testo "Nessuna sessione attiva"; l'hero di caricamento porta class="conversation-hero conversation-hero-loading".
        expect(document.querySelector('#conversationEmptyState')?.classList.contains('conversation-hero')).toBe(true)
        expect(document.querySelector('#conversationEmptyState')?.classList.contains('conversation-hero-loading')).toBe(true)
        expect(document.querySelector('#conversationEmptyState')?.textContent).not.toContain('No active session') // ⭐ 3/9 — testo tradotto in inglese
        const hero = document.querySelector('#conversation .conversation-hero')
        expect(hero).not.toBeNull()
        // ⭐ 2/9 — niente logo/wordmark durante il caricamento (owner dal vivo).
        expect(hero?.querySelector('.hero-logo')).toBeNull()
        expect(hero?.querySelector('.hero-wordmark')).toBeNull()
        expect(hero?.querySelector('.hero-welcome-title')?.textContent).toBe('Elenca i file del workspace')
        expect(hero?.querySelector('.talos-line-loader')).not.toBeNull()
        expect(hero?.querySelector('.hero-subtitle')?.textContent).toBe('Fetching the history…') // ⭐ 3/9 — testo tradotto in inglese
        // ⭐ 29/8 — ledger §10: la striscia "In esecuzione" (default running:true del modulo) non deve restare appesa su una sessione appena selezionata di cui non sappiamo ancora lo stato vero.
        expect(document.querySelector('.run-strip')?.classList.contains('is-stopped')).toBe(true)
        expect(document.querySelector('#runStateToggle strong')?.textContent).toBe('Stopped') // ⭐ 3/9 — vedi nota su RUNSTATE-01, stessa etichetta a due stati
    })

    /*
     * ⭐⭐⭐ 2/9 — la prova diretta del secondo bug dell'owner ("clicco su
     * una sessione e i messaggi non compaiono"): l'hero di CARICAMENTO
     * di SELECT-SESSION-REAL-ID-04 deve risolversi DAVVERO, non restare
     * a girare. Trovata → stream reale (passaASessione); non trovata →
     * messaggio onesto, mai il vecchio "scrivi qui sotto per continuare
     * questa sessione" (quello mentiva: implicava che la cronologia ci
     * fosse sempre stata).
     */
    it('SELECT-SESSION-REAL-ID-04B trovata: l\'hero di caricamento si risolve nello stream reale (SSE), non resta a girare', async () => {
        const ID = '4d1136ce-e514-4e6e-944d-bd083bce224b'
        FakeEventSource.instances = []
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: ID, taskId: 'elenca-file', nome: 'Elenca i file del workspace', forkDa: null, conclusa: false, avviataAlle: '2026-09-02T00:00:00.000Z' }] } }])

        runtime().selectSession({ id: ID, title: 'Elenca i file del workspace' })
        expect(document.querySelector('.conversation-hero-loading')).not.toBeNull() // subito dopo: ancora in caricamento
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(document.querySelector('.conversation-hero-loading')).toBeNull() // risolto: l'hero di caricamento è sparito
        expect(runtime().realSessionState.id).toBe(ID)
        expect(FakeEventSource.instances.at(-1)?.url).toContain(`/api/v1/sessions/${ID}/events`)
    })

    it('⛔ SELECT-SESSION-REAL-ID-04C AL CONTRARIO — non trovata: messaggio onesto, MAI il vecchio "scrivi qui sotto per continuare questa sessione"', async () => {
        const ID = '4d1136ce-e514-4e6e-944d-bd083bce224b'
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } }])

        runtime().selectSession({ id: ID, title: 'Elenca i file del workspace' })
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(document.querySelector('.conversation-hero-loading')).toBeNull()
        const hero = document.querySelector('#conversation .conversation-hero')
        expect(hero?.querySelector('.hero-subtitle')?.textContent).not.toBe('Scrivi qui sotto per continuare questa sessione.')
        expect(hero?.querySelector('.hero-subtitle')?.textContent).toContain('No history found') // ⭐ 3/9 — testo tradotto in inglese
        expect(runtime().realSessionState.id).toBeNull() // mai finto un id che il server non ha
    })

    /*
     * ⭐⭐⭐ 2/9 — SETTIMA causa dello stesso bug (§14.2.1), trovata dal
     * vivo dopo un riavvio vero: aggiornaElencoSessioniReali popola
     * `.session-item[data-real-session-id]` per OGNI sessione reale già
     * vista in questo avvio (riga ~5534) — non solo per righe demo
     * statiche. Il vecchio `if (item) {...} else { ricarica }` saltava
     * l'INTERO ricaricamento appena una sessione era già "nota" alla
     * sidebar interna: header/titolo si aggiornavano (fuori da quel
     * blocco), il corpo restava quello della sessione PRECEDENTE,
     * invariato — riprodotto dal vivo, non a tavolino.
     */
    it('⛔ SELECT-SESSION-REAL-ID-04D AL CONTRARIO — un .session-item[data-real-session-id] già noto NON deve saltare il ricaricamento', async () => {
        const ID = '4d1136ce-e514-4e6e-944d-bd083bce224b'
        // Simula aggiornaElencoSessioniReali(): questa sessione è già "nota" alla sidebar interna da un giro precedente in questo stesso avvio.
        const rigaGiaNota = document.createElement('button')
        rigaGiaNota.className = 'session-item real-session-item'
        rigaGiaNota.dataset.realSessionId = ID
        document.body.appendChild(rigaGiaNota)
        FakeEventSource.instances = []
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: ID, taskId: 'elenca-file', nome: 'Elenca i file del workspace', forkDa: null, conclusa: false, avviataAlle: '2026-09-02T00:00:00.000Z' }] } }])

        const esito = runtime().selectSession({ id: ID, title: 'Elenca i file del workspace' })

        expect(esito).toBe(true)
        expect(rigaGiaNota.classList.contains('active')).toBe(true) // il bonus di evidenziazione resta
        expect(document.querySelector('.conversation-hero-loading')).not.toBeNull() // MA il ricaricamento è partito comunque
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(runtime().realSessionState.id).toBe(ID) // risolto: lo stream reale ha sostituito il caricamento
        rigaGiaNota.remove()
    })

    /*
     * ⭐⭐⭐ 2/9 — owner dal vivo: "c'è troppo caricamento se clicco su
     * una, clicco su un'altra e ritorno su quelle precedenti... deve
     * essere veloce, rimane bloccato". Ricerca fatta (owner: "ad ogni
     * passo") — pattern standard di ogni chat: cache client per
     * un'apertura istantanea di una conversazione già vista. Questa
     * prova è la garanzia diretta: un SECONDO giro sullo STESSO id, in
     * questo stesso avvio, non deve fare NESSUNA nuova fetch — niente
     * spinner, contenuto già lì appena selectSession() torna.
     */
    it('⭐ cache: rivisitare una sessione già caricata è ISTANTANEO, zero fetch in più', async () => {
        const ID = '4d1136ce-e514-4e6e-944d-bd083bce224b'
        const ALTRA = '99999999-9999-9999-9999-999999999999'
        FakeEventSource.instances = []
        const spia = mockFetch([
            { metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: ID, taskId: 'elenca-file', nome: 'Prima sessione', forkDa: null, conclusa: false, avviataAlle: '2026-09-02T00:00:00.000Z' }] } },
        ])

        // Primo giro: carica DAVVERO (fetch + EventSource), come un click reale.
        runtime().selectSession({ id: ID, title: 'Prima sessione' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(runtime().realSessionState.id).toBe(ID)
        FakeEventSource.instances.at(-1)?.emit({ type: 'TextMessageContent', messageId: 'm1', delta: 'Ciao dal vivo', _sequenza: 1 })

        // Navigo altrove (sessione mai vista: onestamente non trovata, non è quello che sto provando qui).
        runtime().selectSession({ id: ALTRA, title: 'Altra sessione' })
        await new Promise((resolve) => setTimeout(resolve, 0))

        // Torno sulla PRIMA: deve essere istantanea, zero fetch aggiuntive.
        const chiamateFinPrima = spia.mock.calls.length
        const esito = runtime().selectSession({ id: ID, title: 'Prima sessione' })
        // ⭐ 2/9 — il replay dalla cache passa DA handleRealEvent come un
        // evento vero: il render del testo è ora coalescente/differito
        // (§R4), quindi "istantaneo" per l'utente (zero fetch, zero
        // spinner) non vuol dire "sincrono nel DOM" — un frame ci vuole
        // comunque, qui simulato col ripiego setTimeout(...,16) di jsdom.
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(esito).toBe(true)
        expect(spia.mock.calls.length).toBe(chiamateFinPrima) // nessuna fetch in più: rigiocato dalla cache
        expect(document.querySelector('.conversation-hero-loading')).toBeNull() // niente spinner: già risolto
        expect(runtime().realSessionState.id).toBe(ID)
        expect(document.querySelector('#conversation')?.textContent).toContain('Ciao dal vivo')
    })

    /*
     * ⭐⭐⭐ 2/9 — HarnessSessionScreen.vue chiama SEMPRE
     * selectTalosHarnessUiSession subito dopo aver montato lo script:
     * al boot, riprendiSessioneDalHost() (che legge lo STESSO id dal
     * DOM) e selectSession corrono in parallelo per forza. Senza de-dup
     * sarebbero DUE EventSource aperte per la stessa sessione (una
     * scartata a metà da nuovaGenerazioneSessione() dell'altra) — non
     * si conta il totale delle fetch (passaASessione ne innesca altre
     * per conto suo, es. aggiornaElencoSessioniReali, non parte di
     * questa garanzia): si conta quante EventSource si aprono DAVVERO.
     */
    it('⭐ de-dup: selectSession + riprendiSessioneDalHost per lo STESSO id in corsa aprono UNA EventSource sola', async () => {
        const ID = '4d1136ce-e514-4e6e-944d-bd083bce224b'
        document.documentElement.setAttribute('data-harness-session-id', ID)
        FakeEventSource.instances = []
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [{ sessionId: ID, taskId: 'elenca-file', nome: 'Elenca i file del workspace', forkDa: null, conclusa: false, avviataAlle: '2026-09-02T00:00:00.000Z' }] } }])

        // selectSession (il bridge nativo) parte per primo, come dopo un mount reale.
        runtime().selectSession({ id: ID, title: 'Elenca i file del workspace' })
        // riprendiSessioneDalHost (il boot) parte a ruota, PRIMA che il primo fetch risolva.
        await runtime().riprendiSessioneDalHost()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(FakeEventSource.instances).toHaveLength(1)
        expect(runtime().realSessionState.id).toBe(ID)
    })

    /*
     * ⭐⭐⭐ 2/9 — TERZA corsa, trovata dal vivo (owner, sullo stesso
     * bug del click): sessione A cliccata, poi sessione B PRIMA che il
     * fetch di A sia tornato — de-dup (sopra) non la vede, id diversi.
     * Se la risposta di A arriva DOPO quella di B, sovrascriveva il
     * body appena riempito da B — riprodotto dal vivo: header
     * corretto (B), corpo ancora di A. Qui si controlla l'ordine di
     * arrivo a mano (A resta pending finché B non ha già scritto),
     * per provare esattamente quella sequenza, non solo "chiama due
     * volte e spera".
     */
    it('⛔ AL CONTRARIO — click su A poi B, la risposta di A arriva DOPO quella di B: B vince, A non la sovrascrive', async () => {
        const A = '11111111-1111-1111-1111-111111111111'
        const B = '22222222-2222-2222-2222-222222222222'
        let risolviA: (value: Response) => void = () => {}
        const rispostaA = new Promise<Response>((resolve) => { risolviA = resolve })
        const corpoB = { ok: true, data: { items: [{ sessionId: B, taskId: 'elenca-file', nome: 'Sessione B', forkDa: null, conclusa: false, avviataAlle: '2026-09-02T00:00:00.000Z' }] } }
        // Stesso URL per A e B (entrambe leggono la LISTA, /api/v1/sessions —
        // nessun id nel percorso): si distinguono per ORDINE di chiamata, non
        // per url. La prima (A) resta pending, la seconda (B) risolve subito.
        let chiamate = 0
        vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
            const url = typeof input === 'string' ? input : String(input)
            if (!url.includes('/api/v1/sessions')) throw new Error(`nessuna risposta finta per ${url}`)
            chiamate += 1
            if (chiamate === 1) return rispostaA
            return new Response(JSON.stringify(corpoB), { status: 200 })
        })
        FakeEventSource.instances = []

        runtime().selectSession({ id: A, title: 'Sessione A' }) // fetch di A parte e resta PENDING (rispostaA non ancora risolta)
        runtime().selectSession({ id: B, title: 'Sessione B' }) // fetch di B parte e risolve subito (implementazione sopra, ramo else)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.querySelector('#sessionTitle')?.textContent).toBe('Sessione B') // precondizione: B ha già vinto la UI

        risolviA(new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })) // ORA arriva la risposta (tardiva) di A: lista vuota, "non trovata"
        await new Promise((resolve) => setTimeout(resolve, 0))

        // Se A avesse sovrascritto, qui ci sarebbe il messaggio onesto "non trovata" al posto dello stream di B.
        expect(runtime().realSessionState.id).toBe(B)
        expect(document.querySelector('.conversation-hero')).toBeNull()
        expect(document.querySelector('#sessionTitle')?.textContent).toBe('Sessione B')
    })

    it('⛔ SELECT-SESSION-REAL-ID-03 AL CONTRARIO: id/title non validi tornano false e NON toccano il titolo esistente', () => {
        runtime().selectSession({ id: 'audit-api-permissions', title: 'Audit API permissions' })
        const titoloPrima = document.querySelector('#sessionTitle')?.textContent

        // @ts-expect-error prova deliberata di un contratto rotto (title mancante)
        const esito = runtime().selectSession({ id: 'qualunque' })

        expect(esito).toBe(false)
        expect(document.querySelector('#sessionTitle')?.textContent).toBe(titoloPrima)
    })

    /*
     * ⭐⭐⭐ 28/8, owner: "nella modale della nuova sessione e nella pill del
     * modello metti lo slider del selettore effort" — stesso schema di
     * MODEL-PICKER-01 sopra: presenza del controllo, interazione,
     * verifica che il valore viaggi DAVVERO nella POST.
     */
    it('⭐⭐⭐ EFFORT-PICKER-01 lo slider è nella modale accanto al model picker, e la scelta viaggia nella POST come reasoning.effort', async () => {
        mockFetch([
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
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
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
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
            { metodo: 'GET', percorso: '/api/v1/tasks', corpo: { items: [] } },
            { metodo: 'GET', percorso: '/api/v1/projects', corpo: { items: [{ id: 'proj-1', nome: 'Progetto di prova' }] } },
        ])
        await runtime().openRealTaskSheet()
        document.querySelector<HTMLFormElement>('#customTaskForm')!.requestSubmit() // pendingCustomSession, mai un fetch qui

        document.querySelector<HTMLButtonElement>('[data-open-sheet="model"]')!.click()

        expect(document.querySelector('#modelPickerMount .effort-picker-range')).not.toBeNull()
    })
})

/**
 * ⭐⭐⭐ 30/8, ledger §25/§31 — chiude il SECONDO bug dell'owner: riaprire
 * una sessione storica lasciava Files/Context/Ambiente sui dati mock
 * statici per sempre. Riprodotto dal vivo via CDP prima della cura
 * (Context panel: `talos`/`feat/mobile-code`/`~/dev/talos` — gli stessi
 * valori di `index.html`, mai sostituiti). Causa: `HarnessSessionScreen.vue`
 * pianta `data-harness-session-id` su un antenato di `HOST()`, ma
 * nessuno lo leggeva al boot — `riprendiSessioneDalHost()` lo fa ora,
 * SOLO quando l'attributo esiste ed è diverso da `'new'` (mai un fetch
 * incondizionato: `mountStaticRuntime()` non pianta mai l'attributo,
 * quindi non tocca `CODE-COMPOSER-DEMO-SEND-01`/`HARNESS-BOARD-MOBILE-
 * HONESTY-01`, verificato eseguendo l'intera suite dopo la cura).
 *
 * `beforeEach` DEDICATO (non quello condiviso sopra): pianta l'attributo
 * su `document.documentElement` PRIMA di `mountStaticRuntime()`, perché
 * `riprendiSessioneDalHost()` parte SINCRONA dentro lo stesso giro in cui
 * app.js viene eseguito (`window.eval`).
 */
describe('Harness UI — riprendiSessioneDalHost(), riapertura di una sessione storica dal boot (bug reale, 30/8)', () => {
    const ID_SESSIONE = '933d97f7-9b65-4c0b-a9cd-8b8acf039545'

    beforeEach(() => {
        /*
         * ⛔ Trovato eseguendo questo stesso test, non assunto: il boot ha
         * ANCHE un window.setTimeout(...,0) differito che chiama
         * aggiornaElencoSessioniReali()/renderAutomationsReali() quando
         * HOST() NON porta la classe `talos-embedded` — un secondo fetch,
         * indipendente da riprendiSessioneDalHost(), che il mio primo giro
         * di test non aveva messo in conto (fetch inatteso su /api/v1/
         * sessions e /api/v1/automations nei due casi AL CONTRARIO). La
         * schermata reale (HarnessSessionScreen.vue) monta sempre con
         * `embedded`, quindi questa classe è quella del contesto vero, non
         * un aggiustamento per far passare il test.
         */
        document.documentElement.classList.add('talos-embedded')
    })

    afterEach(() => {
        document.documentElement.classList.remove('talos-embedded')
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessApiBase?: unknown }).__talosHarnessApiBase
        document.documentElement.removeAttribute('data-harness-session-id')
        document.body.replaceChildren()
        document.body.className = ''
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('un id reale (presente fra le sessioni del server) riconnette DA SOLO al boot — Context panel esce dai dati mock', async () => {
        document.documentElement.setAttribute('data-harness-session-id', ID_SESSIONE)
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        mockFetch([
            {
                metodo: 'GET', percorso: '/api/v1/sessions',
                corpo: { items: [{ sessionId: ID_SESSIONE, taskId: 'elenca-file', nome: 'Elenca i file di questa cartella', forkDa: null, conclusa: false, avviataAlle: '2026-08-29T00:00:00.000Z' }] },
            },
        ])
        mountStaticRuntime()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(runtime().realSessionState.id).toBe(ID_SESSIONE)
        expect(document.querySelector('#sessionTitle')?.textContent).toBe('Elenca i file di questa cartella')
        expect(FakeEventSource.instances.at(-1)?.url).toContain(`/api/v1/sessions/${ID_SESSIONE}/events`)
    })

    it('⭐ i dati reali arrivano DAVVERO nel Context panel, non solo l\'id — RunStarted rimpiazza i valori statici di index.html', async () => {
        document.documentElement.setAttribute('data-harness-session-id', ID_SESSIONE)
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        mockFetch([
            {
                metodo: 'GET', percorso: '/api/v1/sessions',
                corpo: { items: [{ sessionId: ID_SESSIONE, taskId: 'elenca-file', nome: 'Elenca i file di questa cartella', forkDa: null, conclusa: false, avviataAlle: '2026-08-29T00:00:00.000Z' }] },
            },
        ])
        mountStaticRuntime()
        await new Promise((resolve) => setTimeout(resolve, 0))
        /*
         * precondizione, AGGIORNATA 3/9 (avm-03, dal vivo — item 8): prima
         * del RunStarted vero il pannello mostra un trattino onesto, non
         * più un dato d'esempio verosimile ("feat/mobile-code") accanto a
         * un badge che intanto dichiara "not connected" — vedi il commento
         * in index.html sopra <dl id="envWorkspace">... per il resoconto
         * completo. Il resto del test (RunStarted rimpiazza con dati veri)
         * è invariato: solo il DEFAULT prima dell'evento è cambiato.
         */
        expect(document.querySelector('#envBranch')?.textContent).toBe('—')

        FakeEventSource.instances.at(-1)?.emit({
            type: 'RunStarted', threadId: 't1', runId: 'r1',
            input: { consegna: 'elenca' },
            contesto: { progetto: 'progetto-vero', branch: 'lane/vero', cartella: '/data/vero' },
        })

        expect(document.querySelector('#envWorkspace')?.textContent).toBe('progetto-vero')
        expect(document.querySelector('#envBranch')?.textContent).toBe('lane/vero')
        expect(document.querySelector('#envRoot')?.textContent).toBe('/data/vero')
    })

    it('⛔ AL CONTRARIO — id \'new\' (sessione mai avviata, isDraft lato Vue): nessun fetch, stato onesto vuoto invariato', async () => {
        document.documentElement.setAttribute('data-harness-session-id', 'new')
        const spia = mockFetch([])
        mountStaticRuntime()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(spia).not.toHaveBeenCalled()
        expect(runtime().realSessionState.id).toBeNull()
    })

    it('⛔ AL CONTRARIO — nessun attributo (mount standalone/test, come mountStaticRuntime senza Vue): nessun fetch', async () => {
        // Nessun setAttribute qui apposta — replica esattamente CODE-COMPOSER-DEMO-SEND-01.
        const spia = mockFetch([])
        mountStaticRuntime()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(spia).not.toHaveBeenCalled()
    })

    it('⛔ AL CONTRARIO — id presente ma il server non lo conosce (creata lato nativo, mai avviata davvero): stato vuoto onesto, mai un errore', async () => {
        document.documentElement.setAttribute('data-harness-session-id', ID_SESSIONE)
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } }])
        mountStaticRuntime()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(runtime().realSessionState.id).toBeNull()
    })

    it('⛔ AL CONTRARIO — il server non risponde: fallisce in silenzio, mai un toast per un\'azione che l\'utente non ha chiesto', async () => {
        document.documentElement.setAttribute('data-harness-session-id', ID_SESSIONE)
        vi.spyOn(window, 'fetch').mockRejectedValue(new Error('rete assente'))
        mountStaticRuntime()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(runtime().realSessionState.id).toBeNull()
        expect(document.querySelector('#toastRegion')?.textContent ?? '').toBe('')
    })
})

/**
 * ⭐⭐⭐ 30/8, owner: "non riesco a vedere i messaggi di una sessione già
 * iniziata... estremamente macchinoso" — riprodotto due volte,
 * indipendentemente (owner e questa sessione), su una sessione che il
 * server conferma intatta. Causa isolata in `passaASessione()`: il
 * corto-circuito "stesso sessionId = non fare nulla" presumeva che un
 * id già corrente implicasse contenuto già a schermo — falso quando
 * quell'id è rimasto "corrente" da un tentativo PRECEDENTE che non ha
 * mai renderizzato nulla di reale (una connessione caduta prima del
 * replay, un secondo tentativo rapido superato dalla generation-guard
 * in handleRealEvent): l'hero/stato vuoto restava a schermo per
 * sempre, perché lo stesso id "già corrente" bloccava ogni riprova.
 * Vedi ledger §43, piano procedi-col-generare-un-snoopy-neumann.md
 * §14.2.1.
 */
describe('Harness UI — passaASessione() non si arrende più su un id già corrente ma senza contenuto reale (bug reale, 30/8)', () => {
    beforeEach(() => {
        document.body.className = ''
        document.documentElement.classList.remove('talos-embedded')
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

    it('PASSA-SESSIONE-RITENTA-01 stesso id, MA l\'hero è ancora a schermo (nessun replay mai arrivato): un secondo tentativo riapre davvero la connessione', () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } }])

        runtime().passaASessione('sess-vuota', 'task-vuota', 'Sessione senza replay')
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(document.querySelector('#conversation')?.children.length).toBe(0) // precondizione del bug: nessun evento è mai arrivato, #conversation resta vuoto

        runtime().passaASessione('sess-vuota', 'task-vuota', 'Sessione senza replay')

        expect(FakeEventSource.instances).toHaveLength(2) // prima della cura restava 1 per sempre
        expect(FakeEventSource.instances[1].url).toBe('/api/v1/sessions/sess-vuota/events')
    })

    it('⛔ PASSA-SESSIONE-RITENTA-02 AL CONTRARIO: stesso id, contenuto REALMENTE arrivato — il secondo tocco resta un no-op, nessuna riconnessione sprecata', () => {
        mockFetch([{ metodo: 'GET', percorso: '/api/v1/sessions', corpo: { items: [] } }])

        runtime().passaASessione('sess-piena', 'task-piena', 'Sessione con contenuto')
        expect(FakeEventSource.instances).toHaveLength(1)
        FakeEventSource.instances[0].emit({ type: 'TextMessageStart', messageId: 'm1' })
        FakeEventSource.instances[0].emit({ type: 'TextMessageContent', messageId: 'm1', delta: 'Ecco il contenuto reale.' })
        expect(document.querySelector('#conversation')?.children.length).toBeGreaterThan(0) // il testo vero è stato renderizzato davvero

        runtime().passaASessione('sess-piena', 'task-piena', 'Sessione con contenuto')

        expect(FakeEventSource.instances).toHaveLength(1) // nessuna seconda connessione: il contenuto c'era già
    })
})
