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
        resumeSession(): Promise<void>
        compactSession(): Promise<void>
        passaASessione(sessionId: string, taskId: string, nome?: string): void
        openRealTaskSheet(): Promise<void>
        aggiornaElencoSessioniReali(): Promise<void>
        runDirectShell(comando: string, silenzioso: boolean): Promise<void>
        realSessionState: {
            id: string | null
            taskId: string | null
            generation: number
            eventSource: FakeEventSource | null
            messageElements: Map<string, HTMLElement>
            reviewFiles: Map<string, { path: string, nuovo: boolean, code: [string, string][] }>
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
        document.body.replaceChildren()
        document.body.className = ''
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
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

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ taskId: bottone.dataset.taskId }) }))
        expect(runtime().realSessionState.id).toBe('sess-automazione')
    })

    it('⛔ REAL-SESSION-AUTOMATION-02 AL CONTRARIO: sullo stesso bottone, embedded mobile non chiama MAI il backend', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = mockFetch([])
        const bottone = document.querySelector('[data-automation-action="run"][data-task-id]') as HTMLButtonElement

        bottone.click()
        await new Promise((r) => setTimeout(r, 0))

        expect(fetchMock).not.toHaveBeenCalled()
        expect(runtime().realSessionState.id).toBeNull()
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
})
