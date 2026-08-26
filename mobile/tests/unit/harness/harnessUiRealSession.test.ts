// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⭐⭐⭐ 26/8 — riconciliazione desktop→mobile (DEC-053). Prova la sola
 * pipeline di CONSUMO eventi AG-UI portata dentro il bundle mobile (vedi il
 * blocco "LA SESSIONE VERA" in public/harness-ui/app.js): apiPost reale via
 * fetch mockato, EventSource fittizio (jsdom non lo implementa), handleRealEvent
 * sui casi che contano. NON prova forkSession/resumeSession/compactSession/
 * openRealTaskSheet — non ancora portate, vedi la nota di testa del blocco.
 */

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

type RuntimeGlobals = {
    __talosHarnessUiRuntime?: {
        startRealSession(task: { id: string, consegna?: string }): Promise<void>
        stopRealSession(): Promise<void>
        handleRealEvent(evento: Record<string, unknown>, generation: number): void
        realSessionState: {
            id: string | null
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
        const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ ok: true, data: { sessionId: 'sess-abc123' } }), { status: 200 }),
        )

        await runtime().startRealSession({ id: 'storia-0b81c88', consegna: 'Sistema il test rosso.' })

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions', expect.objectContaining({ method: 'POST' }))
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(FakeEventSource.instances[0].url).toBe('/api/v1/sessions/sess-abc123/events')
        expect(runtime().realSessionState.id).toBe('sess-abc123')
    })

    it('REAL-SESSION-START-02 AL CONTRARIO: un avvio fallito non apre nessuno stream e non finge un id', async () => {
        vi.spyOn(window, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ ok: false, error: { code: 'BAD_TASK', message: 'task ignoto' } }), { status: 404 }),
        )

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
        const fetchMock = vi.spyOn(window, 'fetch')
        await runtime().stopRealSession()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('REAL-SESSION-FINISH-01 RunFinished chiude lo stream della sua generazione', async () => {
        vi.spyOn(window, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ ok: true, data: { sessionId: 'sess-fine' } }), { status: 200 }),
        )
        await runtime().startRealSession({ id: 'storia-x' })
        const generation = runtime().realSessionState.generation
        const source = FakeEventSource.instances.at(-1)

        runtime().handleRealEvent({ type: 'RunFinished', result: { detto: 'Fatto.' } }, generation)

        expect(source?.readyState).toBe(FakeEventSource.CLOSED)
        expect(runtime().realSessionState.eventSource).toBeNull()
    })
})
