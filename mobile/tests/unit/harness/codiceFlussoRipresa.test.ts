// @vitest-environment jsdom

/*
 * ⛔⛔ RIPRESA-SSE (14/10/2026, riprodotto dal vivo sul Pad, Android 16) — il Codice segue la sessione col flusso degli
 * eventi (`apriEventiServerCodice`, libreria `eventsource@5.1.2`). L'utente manda un compito lungo, preme Home dopo
 * ~20 s: l'app resta viva (servizio in primo piano) e il server finisce il giro, ma il renderer della WebView è
 * congelato. Al ritorno la conversazione resta al gruppo degli attrezzi, la spia dice ancora «In corso» e la risposta
 * finale non arriva mai: la connessione è ferma e nessuno se ne accorge (nessun `error`, quindi nessuna riconnessione
 * con `Last-Event-ID` e nessun replay di quello che si è perso).
 *
 * Qui il server finto parla SSE come quello vero (`http-app.mjs`: riga `id:` = `_sequenza`, `:battito` ogni 15 s,
 * replay dopo `Last-Event-ID`) e la libreria è quella vera. Il congelamento si imita spostando l'orologio senza far
 * scattare i timer (in una pagina congelata «JavaScript timers and fetch callbacks don't run»,
 * https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EventSource as EventSourceLibreria } from 'eventsource'

vi.mock('@/lib/harness/terminalePonte', () => ({
    // Senza ponte adb il segreto non c'è e le intestazioni restano vuote: qui conta solo il flusso.
    talosTerminaleDisponibile: () => false,
    leggiSegretoServerDalPonte: vi.fn(),
}))

const BATTITO_MS = 15_000
const codifica = new TextEncoder()

type Evento = { type: string, _sequenza: number, [chiave: string]: unknown }

/** Un server SSE finto con la stessa grammatica di `http-app.mjs`. Ogni connessione resta aperta finché il test vuole. */
function serverFinto(eventi: Evento[]) {
    const connessioni: Array<{ ultimoVisto: string | null, scrivi: (testo: string) => void, chiusa: boolean }> = []
    const finto = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const intestazioni = new Headers(init?.headers)
        const ultimoVisto = intestazioni.get('Last-Event-ID')
        let controllore!: ReadableStreamDefaultController<Uint8Array>
        const connessione = {
            ultimoVisto,
            chiusa: false,
            scrivi: (testo: string) => { if (!connessione.chiusa) controllore.enqueue(codifica.encode(testo)) },
        }
        const corpo = new ReadableStream<Uint8Array>({
            start(c) { controllore = c },
            cancel() { connessione.chiusa = true },
        })
        init?.signal?.addEventListener('abort', () => { connessione.chiusa = true })
        connessioni.push(connessione)
        // Replay come `iscriviti(sessionId, ascoltatore, daSequenza)`: solo gli eventi dopo l'ultimo visto.
        const da = Number.parseInt(ultimoVisto ?? '', 10)
        queueMicrotask(() => {
            connessione.scrivi(':ok\n\n')
            for (const evento of eventi) {
                if (Number.isFinite(da) && evento._sequenza <= da) continue
                connessione.scrivi(`id: ${evento._sequenza}\ndata: ${JSON.stringify(evento)}\n\n`)
            }
        })
        void input
        return new Response(corpo, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
    })
    return { finto, connessioni, eventi }
}

let visibilita: DocumentVisibilityState = 'visible'
function rendiVisibile(stato: DocumentVisibilityState) {
    visibilita = stato
    document.dispatchEvent(new Event('visibilitychange'))
}

/** Fa girare timer e microtask (i flussi web si muovono a microtask). */
async function scorri(ms = 0) {
    await vi.advanceTimersByTimeAsync(ms)
    for (let i = 0; i < 30; i += 1) await Promise.resolve()
}

/** Il congelamento: l'orologio va avanti, nessun timer scatta, nessun byte viene letto. */
function congela(ms: number) {
    vi.setSystemTime(Date.now() + ms)
}

async function modulo() {
    vi.resetModules()
    return import('@/lib/harness/harnessUiSegreto')
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    visibilita = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilita })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibilita === 'hidden' })
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (document as unknown as { visibilityState?: unknown }).visibilityState
    delete (document as unknown as { hidden?: unknown }).hidden
})

describe('RIPRESA-SSE — il flusso degli eventi del Codice sopravvive al congelamento della WebView', () => {
    const primi: Evento[] = [
        { type: 'RunStarted', threadId: 's', runId: 'r1', _sequenza: 1 },
        { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell', _sequenza: 2 },
    ]
    const dopo: Evento[] = [
        { type: 'ToolCallResult', toolCallId: 't1', content: 'fatto', _sequenza: 3 },
        { type: 'RunFinished', threadId: 's', runId: 'r1', _sequenza: 4 },
    ]

    it('RIPRESA-SSE-01 al ritorno in primo piano dopo un congelamento lungo si ricollega con Last-Event-ID e riceve solo quello che mancava', async () => {
        const server = serverFinto([...primi])
        vi.stubGlobal('fetch', server.finto)
        const { apriEventiServerCodice } = await modulo()
        const flusso = apriEventiServerCodice('http://localhost:4174/api/v1/sessions/s/events')
        const viste: number[] = []
        flusso.onmessage = (messaggio) => { viste.push((JSON.parse(messaggio.data) as Evento)._sequenza) }
        await scorri()
        expect(viste).toEqual([1, 2])

        // Home: la pagina si nasconde e viene congelata. Il server intanto finisce il giro, ma questa connessione è
        // ferma: i byte nuovi non arrivano più (la connessione vecchia è morta in silenzio).
        rendiVisibile('hidden')
        server.connessioni[0].chiusa = true
        server.eventi.push(...dopo)
        congela(60_000)

        // Ritorno in primo piano.
        rendiVisibile('visible')
        await scorri(3_500)

        expect(server.finto).toHaveBeenCalledTimes(2)
        expect(server.connessioni[1].ultimoVisto).toBe('2')
        expect(viste).toEqual([1, 2, 3, 4])
        flusso.close()
    })

    it('RIPRESA-SSE-02 in primo piano, una connessione che tace oltre tre battiti del server si riapre da sola', async () => {
        const server = serverFinto([...primi])
        vi.stubGlobal('fetch', server.finto)
        const { apriEventiServerCodice } = await modulo()
        const flusso = apriEventiServerCodice('http://localhost:4174/api/v1/sessions/s/events')
        const viste: number[] = []
        flusso.onmessage = (messaggio) => { viste.push((JSON.parse(messaggio.data) as Evento)._sequenza) }
        await scorri()

        server.connessioni[0].chiusa = true // muta: niente battito, niente errore
        server.eventi.push(...dopo)
        await scorri(3 * BATTITO_MS + 10_000)

        expect(server.finto).toHaveBeenCalledTimes(2)
        expect(server.connessioni[1].ultimoVisto).toBe('2')
        expect(viste).toEqual([1, 2, 3, 4])
        flusso.close()
    })

    it('RIPRESA-SSE-03 una connessione sana col battito ogni 15 s non viene mai riaperta, neanche dopo una pausa breve', async () => {
        const server = serverFinto([...primi])
        vi.stubGlobal('fetch', server.finto)
        const { apriEventiServerCodice } = await modulo()
        const flusso = apriEventiServerCodice('http://localhost:4174/api/v1/sessions/s/events')
        await scorri()
        for (let giro = 0; giro < 12; giro += 1) {
            await scorri(BATTITO_MS)
            server.connessioni[0].scrivi(':battito\n\n')
            await scorri()
            if (giro === 5) { rendiVisibile('hidden'); rendiVisibile('visible') }
        }
        expect(server.finto).toHaveBeenCalledTimes(1)
        expect(flusso.readyState).toBe(EventSourceLibreria.OPEN)
        flusso.close()
    })

    it('RIPRESA-SSE-04 chiuso dal Codice, il flusso non si riapre più: né al ritorno in primo piano né per il silenzio', async () => {
        const server = serverFinto([...primi])
        vi.stubGlobal('fetch', server.finto)
        const { apriEventiServerCodice } = await modulo()
        const flusso = apriEventiServerCodice('http://localhost:4174/api/v1/sessions/s/events')
        await scorri()
        flusso.close()
        congela(120_000)
        rendiVisibile('visible')
        await scorri(5 * 60_000)
        expect(server.finto).toHaveBeenCalledTimes(1)
        expect(flusso.readyState).toBe(EventSourceLibreria.CLOSED)
    })
})

/*
 * Lo stesso scenario dentro il Codice vero (`app.js`), col ponte vero dell'app: dopo il ritorno la risposta finale è a
 * schermo UNA volta sola, la spia passa a «Finished» e nessun evento già visto si ripete.
 */
describe('RIPRESA-SSE-UI — il Codice mostra la fine del giro dopo il ritorno in primo piano', () => {
    function asset(nome: string): string {
        return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', nome), 'utf8')
    }
    type Runtime = {
        startRealSession(task: { id: string }): Promise<void>
        realSessionState: { id: string | null, eventoTerminaleVisto: boolean }
    }
    function monta() {
        const pagina = new DOMParser().parseFromString(asset('index.html'), 'text/html')
        pagina.querySelectorAll('script').forEach((script) => script.remove())
        document.body.replaceChildren(...Array.from(pagina.body.childNodes))
        document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialogo) => {
            dialogo.show ??= () => { dialogo.setAttribute('open', '') }
            dialogo.close ??= () => { dialogo.removeAttribute('open') }
        })
        ;(window as unknown as { __talosHarnessRoot?: ParentNode }).__talosHarnessRoot = document
        ;(window as unknown as { __talosHarnessHost?: HTMLElement }).__talosHarnessHost = document.documentElement
        window.eval(asset('app.js'))
        return (window as unknown as { __talosHarnessUiRuntime: Runtime }).__talosHarnessUiRuntime
    }

    afterEach(() => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessApriEventi?: unknown }).__talosHarnessApriEventi
        document.body.replaceChildren()
    })

    it('RIPRESA-SSE-UI-01 Home durante gli attrezzi, ritorno dopo la fine: risposta finale una volta, spia «Finished»', async () => {
        const FINALE = 'Lo script ha finito: 120 righe scritte.'
        const sse = serverFinto([
            { type: 'RunStarted', threadId: 'sess-r', runId: 'r1', _sequenza: 1 },
            { type: 'TextMessageStart', messageId: 'm1', role: 'assistant', _sequenza: 2 },
            { type: 'TextMessageContent', messageId: 'm1', delta: 'Avvio lo script.', _sequenza: 3 },
            { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 4 },
            { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell', parentMessageId: 'm1', _sequenza: 5 },
        ])
        const fetchFinto = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const indirizzo = new URL(String(input instanceof Request ? input.url : input), 'http://localhost:3000')
            const metodo = (init?.method ?? 'GET').toUpperCase()
            if (/\/events$/.test(indirizzo.pathname)) return sse.finto(input, init)
            if (metodo === 'POST' && indirizzo.pathname === '/api/v1/sessions') {
                return new Response(JSON.stringify({ ok: true, data: { sessionId: 'sess-r' } }))
            }
            // Elenco sessioni, albero dei file e il resto: vuoti, come una sessione appena nata.
            return new Response(JSON.stringify({ ok: true, data: { items: [], voci: [] } }))
        })
        vi.stubGlobal('fetch', fetchFinto)
        vi.stubGlobal('EventSource', EventSourceLibreria)
        const { apriEventiServerCodice } = await modulo()
        ;(window as unknown as { __talosHarnessApriEventi?: (url: string) => unknown }).__talosHarnessApriEventi = (url) => apriEventiServerCodice(url)

        const runtime = monta()
        await runtime.startRealSession({ id: 'storia-x' })
        await scorri()
        expect(runtime.realSessionState.id).toBe('sess-r')
        const spia = () => document.querySelector('#runStateToggle strong')?.textContent
        expect(spia()).toBe('Running')

        rendiVisibile('hidden')
        sse.connessioni[0].chiusa = true
        sse.eventi.push(
            { type: 'ToolCallResult', toolCallId: 't1', content: 'ok', _sequenza: 6 },
            { type: 'TextMessageStart', messageId: 'm2', role: 'assistant', _sequenza: 7 },
            { type: 'TextMessageContent', messageId: 'm2', delta: FINALE, _sequenza: 8 },
            { type: 'TextMessageEnd', messageId: 'm2', _sequenza: 9 },
            { type: 'RunFinished', threadId: 'sess-r', runId: 'r1', _sequenza: 10 },
        )
        congela(90_000)
        rendiVisibile('visible')
        await scorri(3_500)
        await scorri(100)

        expect(runtime.realSessionState.eventoTerminaleVisto).toBe(true)
        expect(spia()).toBe('Finished')
        const testo = document.querySelector('#conversation')?.textContent ?? ''
        expect(testo.split(FINALE).length - 1).toBe(1)
        expect(testo.split('Avvio lo script.').length - 1).toBe(1)
        expect(document.querySelector('.error-card')).toBeNull()
    })
})
