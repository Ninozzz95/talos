// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⭐⭐⭐ B1 — ONESTÀ DEL CODICE (23/09/2026).
 *
 * Misurato sul Pad (`.claude/b1/MISURA-CODICE-PAD-2026-09-23.md`): la copia
 * incorporata dell'harness dichiarava successi mai avvenuti («Context
 * compacted 18.7k → 9.3k», «Fork created», «Review approvata · 3 file») e
 * mostrava viste inventate (un diff di TalosComposer.vue, un terminale col
 * prompt dell'owner, una pagina browser finta, ambienti mai esistiti).
 *
 * Decisioni dell'owner 23/09, dopo il dossier
 * `.claude/ricerche/2026-09-23-B1-funzioni-non-disponibili.md` («nessuna
 * fonte sostiene un toast di successo senza un'azione avvenuta»):
 *  1. i controlli sono veri con una sessione reale, spenti con il motivo senza;
 *  2. le viste senza dati veri mostrano uno stato vuoto onesto;
 *  3. i testi dicono il vero su ciò che il Codice fa.
 */

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

/**
 * Il codice di app.js SENZA commenti: le note storiche raccontano i difetti
 * citandone le frasi, e un commento non arriva a schermo. Tolti i blocchi
 * `/* … *\/` e le righe `// …` (non dentro una stringa: nel bundle nessuna
 * stringa contiene `//` a inizio riga dopo spazi).
 */
function codiceSenzaCommenti(sorgente: string): string {
    return sorgente
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((riga) => riga.replace(/(^|\s)\/\/(?!\/).*$/, '$1'))
        .join('\n')
}

type Runtime = {
    compactSession(): Promise<void>
    forkSession(): Promise<void>
    passaASessione(sessionId: string, taskId: string, nome?: string): void
    handleRealEvent(evento: Record<string, unknown>, generation: number): void
    realSessionState: { generation: number }
    openSheet(type: string): void
    setView(view: string, options?: Record<string, unknown>): void
}

class FakeEventSource {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2
    readyState = 0
    url: string
    onmessage: ((evento: MessageEvent) => void) | null = null
    onerror: ((evento: Event) => void) | null = null
    onopen: ((evento: Event) => void) | null = null
    constructor(url: string) { this.url = url }
    addEventListener(): void {}
    removeEventListener(): void {}
    close(): void { this.readyState = 2 }
}

function monta(): void {
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

function rt(): Runtime {
    const r = (window as unknown as { __talosHarnessUiRuntime?: Runtime }).__talosHarnessUiRuntime
    if (!r) throw new Error('runtime non montato')
    return r
}

/** Il testo di tutti i toast visibili adesso. */
function toast(): string {
    return [...document.querySelectorAll('.toast, [role="status"]')].map((e) => e.textContent ?? '').join(' / ')
}

/** Un controllo spento dichiara di esserlo e perché (W3C APG: aria-disabled + motivo). */
function spentoConMotivo(el: Element | null): boolean {
    if (!el) return false
    const spento = el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled
    const motivo = (el.getAttribute('title') ?? '').trim().length > 0
    return spento && motivo
}

describe('B1 — onestà del Codice: il sorgente non porta dati inventati', () => {
    const inventati = [
        'pty demo', 'feat/mobile-code', 'wt/auth', '3 file modificati', 'TalosComposer.vue',
        'gpt-5.6-sol', '127.0.0.1:4173', '18.7k', 'File picker simulato', 'Cattura visiva pronta',
        'Regeneration started', 'Feedback registrato', 'Review approvata', 'Commento inline pronto',
        'File aperto nel workspace', 'Side thread created', 'WSL2', 'delega_sottotask tool',
        'Azione simulata',
    ]
    for (const frase of inventati) {
        it(`ONESTA-01 «${frase}» non compare né in index.html né in app.js`, () => {
            expect(asset('index.html').includes(frase), 'index.html').toBe(false)
            expect(codiceSenzaCommenti(asset('app.js')).includes(frase), 'app.js').toBe(false)
        })
    }
})

describe('B1 — onestà del Codice: comportamento', () => {
    beforeEach(() => {
        document.body.className = ''
        vi.stubGlobal('EventSource', FakeEventSource)
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { items: [], voci: [] } }), { status: 200 })))
        monta()
    })
    afterEach(() => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        document.body.replaceChildren()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('ONESTA-02 Compatta senza sessione reale: nessun successo e nessuna chiamata', async () => {
        await rt().compactSession()
        expect(toast()).not.toMatch(/compacted|compattat/i)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('ONESTA-03 Fork senza sessione reale: nessun «creato» e nessuna chiamata', async () => {
        await rt().forkSession()
        expect(toast()).not.toMatch(/fork created|creat/i)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('ONESTA-04 senza sessione reale Compatta e Fork sono spenti con il motivo; con la sessione si accendono', () => {
        const compatta = document.querySelector('[aria-label="Compact the context"]')
        const fork = document.querySelector('[data-action="fork-session"]')
        expect(spentoConMotivo(compatta), 'compatta spenta').toBe(true)
        expect(spentoConMotivo(fork), 'fork spento').toBe(true)
        rt().passaASessione('sess-1', 'libero:0', 'prova')
        expect(compatta?.getAttribute('aria-disabled')).not.toBe('true')
        expect(fork?.getAttribute('aria-disabled')).not.toBe('true')
    })

    it('ONESTA-05 la Bacheca delle campagne non esiste più', () => {
        expect(document.querySelector('[data-mode="dashboard"]')).toBeNull()
        expect(document.querySelector('[data-view="dashboard"]')).toBeNull()
    })

    it('ONESTA-06 Review, Browser e Terminale partono vuoti e onesti, senza badge Demo', () => {
        for (const vista of ['diff', 'browser', 'terminal']) {
            const pane = document.querySelector(`[data-view="${vista}"]`)
            expect(pane, vista).not.toBeNull()
            const badge = pane!.querySelector('.demo-surface-badge') as HTMLElement | null
            expect(badge === null || badge.hidden, `${vista}: niente badge demo`).toBe(true)
        }
        expect(document.querySelector('[data-view="diff"]')!.textContent).toMatch(/0 file/)
    })

    it('ONESTA-07 i controlli di Review e Browser senza dati veri sono spenti con il motivo', () => {
        const controlli = [
            ...document.querySelectorAll('[data-browser-action]'),
            ...document.querySelectorAll('[data-review-action]'),
        ]
        expect(controlli.length).toBeGreaterThan(0)
        for (const c of controlli) expect(spentoConMotivo(c), c.outerHTML.slice(0, 80)).toBe(true)
    })

    it('ONESTA-08 Capability: «Allega file» e «Screenshot» spenti con il motivo, nessun successo al tocco', () => {
        rt().openSheet('capabilities')
        const rapidi = [...document.querySelectorAll('[data-capability-action]')]
        expect(rapidi.length).toBeGreaterThan(0)
        for (const b of rapidi) {
            expect(spentoConMotivo(b), b.outerHTML.slice(0, 80)).toBe(true)
            ;(b as HTMLElement).click()
        }
        expect(toast()).not.toMatch(/simulat|pronta/i)
    })

    it('ONESTA-09 la topologia dice la stessa cosa del pannello Agents: il Codice non delega', () => {
        const topologia = document.querySelector('.session-topology')?.textContent ?? ''
        expect(topologia).not.toMatch(/delega_sottotask/)
        expect(topologia).toMatch(/non delega|does not delegate/i)
    })

    it('ONESTA-10 il chip dell\'ambiente non mostra un ambiente inventato', () => {
        const chip = document.querySelector('.environment-chip')?.textContent ?? ''
        expect(chip).not.toMatch(/wt\/|feat\//)
    })

    it('ONESTA-11 Capability elenca gli attrezzi DAVVERO offerti nell’ultimo giro, non un elenco scritto a mano', () => {
        rt().passaASessione('sess-1', 'libero:0', 'prova')
        rt().openSheet('capabilities')
        const foglio = () => document.querySelector('#sheetBody')?.textContent ?? ''
        expect(foglio()).toMatch(/Known after the first reply/)
        expect(foglio()).not.toMatch(/sempre attiv/i)
        rt().handleRealEvent({ type: 'RunFinished', result: { detto: 'ok', attrezziOfferti: ['elenca', 'leggi', 'time_now'] } }, rt().realSessionState.generation)
        rt().openSheet('capabilities')
        const nomi = [...document.querySelectorAll('#sheetBody .sheet-option strong')].map((e) => e.textContent)
        expect(nomi).toEqual(expect.arrayContaining(['elenca', 'leggi', 'time_now']))
        expect(nomi).not.toContain('naviga')
        expect(nomi).not.toContain('web_search')
    })

    it('ONESTA-12 il Terminale non dice «ancora in corso» mentre la testata dice «Stopped» (D-B1-02)', () => {
        const avviso = () => document.querySelector('[data-terminal-hint]') as HTMLElement
        const etichetta = () => document.querySelector('#runStateToggle strong, .run-state-toggle strong')?.textContent ?? ''
        rt().passaASessione('sess-1', 'libero:0', 'prova')
        rt().setView('terminal')
        expect(etichetta(), 'nessun giro partito: la striscia non finge «Running»').toMatch(/Stopped/)
        expect(avviso().hidden, 'fermo: nessun «ancora in corso»').toBe(true)
        rt().handleRealEvent({ type: 'RunStarted', threadId: 'sess-1', runId: 'r1' }, rt().realSessionState.generation)
        expect(etichetta()).toMatch(/Running/)
        expect(avviso().hidden, 'in corso: avviso visibile').toBe(false)
        rt().handleRealEvent({ type: 'RunFinished', result: { detto: 'ok' } }, rt().realSessionState.generation)
        expect(etichetta()).toMatch(/Stopped/)
        expect(avviso().hidden, 'concluso: avviso nascosto').toBe(true)
    })

    it('ONESTA-13 in una sessione vera il chip dell’ambiente mostra il workspace vero (misurato sul Pad: restava «—»)', () => {
        rt().passaASessione('sess-1', 'libero:0', 'prova')
        rt().handleRealEvent({ type: 'RunStarted', threadId: 'sess-1', runId: 'r1', contesto: { progetto: 'workspace', branch: null, cartella: '/data/local/tmp/talos/workspace' } }, rt().realSessionState.generation)
        expect(document.querySelector('.environment-chip')?.textContent?.trim()).toBe('workspace')
    })

    it('ONESTA-14 lo stato vuoto del Browser parla la lingua dell’app (misurato sul Pad: restava inglese)', () => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        ;(window as unknown as { __talosHarnessLocale?: string }).__talosHarnessLocale = 'it'
        try {
            monta()
            rt().passaASessione('sess-1', 'libero:0', 'prova')
            expect(document.querySelector('[data-view="browser"] .device-preview')?.textContent).toContain('Nessuna pagina letta in questa sessione.')
        } finally {
            delete (window as unknown as { __talosHarnessLocale?: string }).__talosHarnessLocale
        }
    })

    it('ONESTA-15 il titolo della Review parla la lingua dell’app (misurato sul Pad: «1 file changed»)', () => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        ;(window as unknown as { __talosHarnessLocale?: string }).__talosHarnessLocale = 'it'
        try {
            monta()
            expect(document.querySelector('[data-view="diff"] h2')?.textContent).toBe('0 file modificati')
            rt().passaASessione('sess-1', 'libero:0', 'prova')
            expect(document.querySelector('[data-view="diff"] h2')?.textContent).toBe('0 file modificati')
        } finally {
            delete (window as unknown as { __talosHarnessLocale?: string }).__talosHarnessLocale
        }
    })

    it('ONESTA-16 la scheda Capability non porta numeri scritti a mano: si riempie dagli attrezzi offerti (foto del Pad: «Tools 7», «Browser Scoped»)', () => {
        const valore = (etichetta: string) => [...document.querySelectorAll('.capability-row')]
            .find((riga) => riga.querySelector('span')?.textContent === etichetta)?.querySelector('b')?.textContent
        expect(valore('Tools')).toBe('—')
        expect(valore('Browser')).toBe('—')
        rt().passaASessione('sess-1', 'libero:0', 'prova')
        rt().handleRealEvent({ type: 'RunFinished', result: { detto: 'ok', attrezziOfferti: ['elenca', 'leggi', 'naviga'] } }, rt().realSessionState.generation)
        expect(valore('Tools')).toBe('3')
        expect(valore('Browser')).toBe('naviga')
        expect(valore('Web search')).toBe('—')
    })

    it('ONESTA-17 un controllo spento con aria-disabled si VEDE spento (foto del Pad: «Approve all» pieno e dorato)', () => {
        const css = asset('styles.css')
        expect(css).toMatch(/button\[aria-disabled="true"\][^{]*\{[^}]*opacity:\s*0?\.\d+/)
        expect(css).toMatch(/button\[aria-disabled="true"\][^{]*\{[^}]*cursor:\s*not-allowed/)
    })
})
