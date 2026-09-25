// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⭐ Il Codice parla la lingua dell'app (24/09/2026, ledger `.claude/codice-italiano/`).
 *
 * Misurato sul Pad dal DOM vivo, 12 superfici: il pannello laterale, la palette dei comandi, i pannelli dei pulsanti in
 * alto, l'albero della sessione e la conversazione erano in inglese dentro l'app italiana, comprese una ventina di
 * etichette di accessibilità — che un lettore di schermo pronuncia con le regole italiane (WCAG 2.2, 3.1.2: i nomi
 * accessibili sono stringhe «piatte»). Il Codice ha già il suo dizionario (`DIZIONARIO_IT`, chiavi = testo inglese):
 * qui si prova che arrivi dappertutto, e mai dove non deve (testo del modello, nomi dati dall'utente).
 *
 * E l'etichetta dell'ambiente in alto, mostrata come «w.» in 43 px: si nasconde sullo spazio VERO della barra
 * (container query), non sulla larghezza dello schermo.
 */

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

type Runtime = {
    handleRealEvent(evento: Record<string, unknown>, generation: number): void
    realSessionState: { generation: number }
    openSheet(type: string): void
    resumeSession(): Promise<void>
    passaASessione(sessionId: string, taskId: string, nome?: string): void
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

function monta(lingua: 'it' | 'en'): void {
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html')
    parsed.querySelectorAll('script').forEach((script) => script.remove())
    document.body.replaceChildren(...Array.from(parsed.body.childNodes))
    document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
        dialog.show ??= () => { dialog.setAttribute('open', '') }
        dialog.close ??= () => { dialog.removeAttribute('open') }
    })
    ;(window as unknown as { __talosHarnessRoot?: ParentNode }).__talosHarnessRoot = document
    ;(window as unknown as { __talosHarnessHost?: HTMLElement }).__talosHarnessHost = document.documentElement
    ;(window as unknown as { __talosHarnessLocale?: string }).__talosHarnessLocale = lingua
    window.eval(asset('app.js'))
}

function rt(): Runtime {
    const r = (window as unknown as { __talosHarnessUiRuntime?: Runtime }).__talosHarnessUiRuntime
    if (!r) throw new Error('runtime non montato')
    return r
}

/** Ogni testo e ogni etichetta (aria-label, title, placeholder) sotto `radice`, ripuliti. */
function scritte(radice: ParentNode = document.body): string[] {
    const trovate: string[] = []
    const scorri = document.createTreeWalker(radice as Node, NodeFilter.SHOW_TEXT)
    let nodo: Node | null
    while ((nodo = scorri.nextNode())) {
        const testo = (nodo.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (testo && !(nodo.parentElement?.closest('script, style, svg'))) trovate.push(testo)
    }
    ;(radice as Element).querySelectorAll?.('[aria-label], [title], [placeholder]').forEach((el) => {
        for (const nome of ['aria-label', 'title', 'placeholder']) {
            const valore = el.getAttribute(nome)
            if (valore) trovate.push(valore.trim())
        }
    })
    return trovate
}

/** Dall'inventario del Pad (`scratchpad/inventario-superfici.json`): le scritte inglesi viste a schermo. */
const INGLESI_DELLA_PAGINA = [
    'Context rail', 'Session', 'Context', 'Files', 'Agents', 'Environment', 'Workspace', 'Branch', 'Worktree', 'Root',
    'Capability', 'Tools', 'Web search', 'Manage capabilities', 'Memory',
    'Not implemented yet — this agent has no project memory system today.', 'Session topology', 'current session',
    'Fork this session', 'Open session details and tree', 'Doctor and project hooks', 'Resume this session',
    'Compact the context', 'Commands', 'Show or hide the inspector', 'Run state', 'Turn the follow-up queue on or off',
    'Run progress', 'Inspector', 'Resize the inspector', 'Session inspector', 'Filter files by name',
    'Filter loaded files…', 'Demo UI · not connected', 'Built-in terminal', 'Terminal', 'Close the Code window',
    'Close panel', 'TALOS commands', 'New session', 'Open review', 'Open terminal', 'Open browser', 'Resume session',
    'Fork session', 'Compact context', 'Permissions', 'Session tree and side threads',
    'Skills, MCP, plugins and gateways', 'Agents, hooks and doctor', 'Rename session', 'Export session',
    'Share snapshot', 'Search a command or action', 'Search a command or action...', 'Close commands', 'new', 'changed',
    // ⛔ ITA-STATO-01 (Pad, 25/09/2026, scansione del DOM vivo): le note di stato rimaste in inglese.
    'Press and hold a chat for actions.', 'No sessions yet — press “New” to start.', 'Follow-up queued', 'after the current run',
    'press “New” to start',
]

const INGLESI_DEI_PANNELLI = [
    'Control plane', 'Agent runtime', 'Doctor', 'Open', 'Hooks', 'Agents', 'Sub-agents, delegation, isolation and limits',
    'Approval policy per-tool',
    'No per-tool permission grammar today — the semantic gate on writes is always on, and not optional',
    'Agents, non implementato', 'Approval policy per-tool, non implementato', 'Capability hub', 'Skills',
    'Plugin market', 'Toolsets', 'Web search', 'Computer use', 'Images', 'Voice',
    'Gateways · Telegram, Discord, Slack, WhatsApp', 'Profiles', 'Skills, non implementato',
    'Voice, non implementato', 'Environment proof', 'Conversation graph', 'Session tree',
    'Code does not delegate: every step runs in this single session.', 'Safety lens', 'Run permissions', 'Read only',
    'Full access', 'On request', 'Workspace write', 'Context reference', 'Export session', 'Rename session',
    // Caricati dopo l'apertura (trovati sul Pad e dalla scansione di app.js, 24/09).
    'No active session.', 'Loading delegations…', 'Loading hooks…',
    'No active session — open or start a task to see the project hooks.', 'Not available',
]

function inglesiRimasti(elenco: string[], radice?: ParentNode): string[] {
    const viste = new Set(scritte(radice))
    return elenco.filter((frase) => viste.has(frase))
}

describe('il Codice in italiano', () => {
    beforeEach(() => {
        document.body.className = ''
        vi.stubGlobal('EventSource', FakeEventSource)
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { items: [], voci: [] } }), { status: 200 })))
    })
    afterEach(() => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        document.body.replaceChildren()
        delete (window as unknown as { __talosHarnessLocale?: string }).__talosHarnessLocale
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('ITA-01 all’avvio la pagina non ha più le scritte inglesi viste sul Pad, nemmeno nelle etichette di accessibilità', () => {
        monta('it')
        expect(inglesiRimasti(INGLESI_DELLA_PAGINA)).toEqual([])
        const viste = scritte()
        for (const attesa of ['Pannello di contesto', 'Cartella di lavoro', 'Crea una diramazione', 'Comandi']) {
            expect(viste).toContain(attesa)
        }
    })

    it('ITA-02 i pannelli che si aprono dai pulsanti parlano italiano, occhiello, titolo e contenuto caricato dopo compresi', async () => {
        monta('it')
        const pannello = document.querySelector('#sheetDialog') as HTMLElement
        const rimasti: string[] = []
        for (const tipo of ['control', 'capabilities', 'environment', 'sessionTree', 'permissions', 'references', 'rename']) {
            rt().openSheet(tipo)
            // Alcune righe arrivano dopo (hook, diagnostica, albero della sessione): trovato sul Pad il 24/09.
            await new Promise((ok) => setTimeout(ok, 30))
            rimasti.push(...inglesiRimasti(INGLESI_DEI_PANNELLI, pannello).map((frase) => `${tipo}: ${frase}`))
        }
        expect(rimasti).toEqual([])
    })

    it('ITA-03 i messaggi a comparsa passano dal dizionario', async () => {
        monta('it')
        await rt().resumeSession()
        const avvisi = [...document.querySelectorAll('.toast')].map((e) => e.textContent ?? '').join(' / ')
        expect(avvisi).toContain('Nessuna sessione reale da riprendere')
        expect(avvisi).not.toContain('No real session to resume')
    })

    it('ITA-04 la conversazione: riga dell’autore, riassunto e categorie dei gruppi di strumenti in italiano', () => {
        monta('it')
        const generazione = rt().realSessionState.generation
        rt().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'l1', toolCallName: 'leggi' }, generazione)
        rt().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'l1', delta: '{"percorso":"a.txt"}' }, generazione)
        rt().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'l1', content: 'ciao' }, generazione)
        rt().handleRealEvent({ type: 'ToolCallStart', toolCallId: 'l2', toolCallName: 'leggi' }, generazione)
        rt().handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'l2', delta: '{"percorso":"b.txt"}' }, generazione)
        rt().handleRealEvent({ type: 'ToolCallResult', toolCallId: 'l2', content: 'ciao' }, generazione)
        rt().handleRealEvent({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' }, generazione)
        rt().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Tools' }, generazione)

        const conversazione = document.querySelector('.conversation') as HTMLElement
        const testo = conversazione.textContent ?? ''
        expect(testo).toContain('Letti 2 file')
        expect(testo).not.toMatch(/Read 2 files|real session/)
        expect(testo).toContain('TALOS · sessione reale')
        // Le righe con la categoria di ogni strumento stanno nel pannello che si apre toccando il riassunto.
        ;(conversazione.querySelector('.tool-group-summary') as HTMLElement).click()
        expect(scritte()).toContain('Letto')
        expect(scritte()).not.toContain('Read')
    })

    it('ITA-05 mai tradotto ciò che non è dell’interfaccia: testo del modello e nomi dati dall’utente', async () => {
        monta('it')
        const generazione = rt().realSessionState.generation
        rt().handleRealEvent({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' }, generazione)
        rt().handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Tools' }, generazione)
        await new Promise((ok) => setTimeout(ok, 40))
        expect(document.querySelector('.assistant-copy')?.textContent).toBe('Tools')

        rt().passaASessione('s-1', 'libero', 'Doctor')
        rt().openSheet('sessionTree')
        expect(document.querySelector('#sheetDialog [data-current-session-title]')?.textContent).toBe('Doctor')
    })

    it('ITA-07 la traduzione di un pezzo di pagina salta testo del modello, codice, terminale e dati marcati dell’utente', async () => {
        monta('it')
        const prova = document.createElement('div')
        prova.innerHTML = `
            <div class="assistant-copy"><p>Tools</p></div>
            <div class="message-bubble">Doctor</div>
            <pre>Open</pre><code>Files</code>
            <div class="terminal-window">Session</div>
            <strong data-no-i18n>Hooks</strong>
            <span class="libera">Tools</span>
            <span class="eredita">toString</span>
            <button aria-label="Commands" title="toString"></button>`
        document.body.append(prova)

        ;(rt() as unknown as { traduciAlbero(radice: ParentNode): void }).traduciAlbero(prova)

        expect(prova.querySelector('.assistant-copy')?.textContent).toBe('Tools')
        expect(prova.querySelector('.message-bubble')?.textContent).toBe('Doctor')
        expect(prova.querySelector('pre')?.textContent).toBe('Open')
        expect(prova.querySelector('code')?.textContent).toBe('Files')
        expect(prova.querySelector('.terminal-window')?.textContent).toBe('Session')
        expect(prova.querySelector('[data-no-i18n]')?.textContent).toBe('Hooks')
        // Ciò che è interfaccia sì; ciò che è solo ereditato da Object no. «toString» e non «constructor»: con una
        // funzione come sostituto `replace` la chiama, e `Object(…)` ridarebbe per caso la stessa parola.
        expect(prova.querySelector('.libera')?.textContent).toBe('Strumenti')
        expect(prova.querySelector('.eredita')?.textContent).toBe('toString')
        expect(prova.querySelector('button')?.getAttribute('aria-label')).toBe('Comandi')
        expect(prova.querySelector('button')?.getAttribute('title')).toBe('toString')
    })

    it('ITA-08 ogni messaggio a comparsa scritto in app.js ha la sua voce italiana (quelli nuovi compresi)', () => {
        monta('it')
        const traduci = (rt() as unknown as { traduci(testo: string): string }).traduci
        // Già scritti in italiano nel sorgente: non hanno bisogno di una voce.
        const GIA_ITALIANI = new Set([
            'Avvio in corso', 'Hook fidato', 'File rinominato', 'Messaggio in coda', 'Movimento', 'Snapshot copiato',
            'Snapshot pronto', 'Pronto da condividere.', 'Stato, diff e output restano disponibili per la review.',
            'Un nuovo giro è iniziato sulla stessa conversazione.', 'Scrivi qualcosa dopo "!".',
        ])
        const sorgente = asset('app.js')
        const letterali = [...sorgente.matchAll(/toast\(\s*'((?:[^'\\]|\\.)*)'(?:\s*,\s*'((?:[^'\\]|\\.)*)')?/g)]
            .flatMap((m) => [m[1], m[2]])
            .filter((testo): testo is string => Boolean(testo))
            .map((testo) => testo.replace(/\\'/g, '\''))
        const senzaVoce = [...new Set(letterali)]
            .filter((testo) => !GIA_ITALIANI.has(testo) && !testo.startsWith('In pausa'))
            .filter((testo) => traduci(testo) === testo)
        expect(letterali.length).toBeGreaterThan(40)
        expect(senzaVoce).toEqual([])
    })

    it('ITA-09 con una sessione reale, l’albero della sessione dice in italiano che il Codice non delega', async () => {
        monta('it')
        rt().passaASessione('s-1', 'libero', 'Una sessione')
        rt().openSheet('sessionTree')
        await new Promise((ok) => setTimeout(ok, 40))
        const pannello = document.querySelector('#sheetDialog') as HTMLElement
        expect(pannello.textContent).toContain('Il Codice non delega: ogni passo gira in questa sola sessione.')
        expect(pannello.textContent).not.toContain('Code does not delegate')
    })

    it('ITA-10 le viste Revisione, Browser, Impostazioni e Automazioni parlano italiano (erano fuori dal primo giro)', () => {
        monta('it')
        const INGLESI_DELLE_VISTE = [
            'Review center', 'A gate before you finish: diff, tests and risk.', 'Approve all', 'risk', 'Comment',
            'Open file', 'Annotate', 'Inspect', 'Back', 'Forward', 'Reload', 'Code settings',
            'The surface follows the active TALOS theme tokens.', 'Appearance', 'Preset',
            'Colour, type, radius and density tokens, inherited', 'Interaction', 'Reduce motion',
            'Diffs expanded by default and compact tool activity: not implemented yet.', 'Agentic',
            'Everything the CLI does, without forcing you into a terminal.', 'Plugins', 'Automations', 'Scheduled runs',
            'Isolated tasks, each with its own state, history and model.', 'New automation', 'Tiered discount',
            'Real task', 'Run now',
            // ⭐ 24/09 (AUT-3): la vista Automazioni del desktop
            'Scheduled tasks', 'All', 'Active', 'Paused', 'Refresh', 'No automations created.',
        ]
        const rimasti: string[] = []
        for (const vista of ['diff', 'browser', 'settings', 'automations']) {
            ;(rt() as unknown as { setView(v: string): void }).setView(vista)
            const pannello = document.querySelector(`[data-view="${vista}"]`) as HTMLElement
            rimasti.push(...inglesiRimasti(INGLESI_DELLE_VISTE, pannello).map((frase) => `${vista}: ${frase}`))
        }
        expect(rimasti).toEqual([])
        expect(asset('index.html')).not.toContain('steering queue')
    })

    it('ITA-11 una sola riga è «1 riga», non «1 righe»', () => {
        monta('it')
        const generazione = rt().realSessionState.generation
        rt().handleRealEvent({ type: 'StateDelta', delta: [{ op: 'add', path: '/file/uno.txt', value: 'ciao' }] }, generazione)
        ;(rt() as unknown as { setView(v: string): void }).setView('diff')
        const statistiche = [...document.querySelectorAll('.diff-stats')].map((e) => e.textContent)
        expect(statistiche).toContain('nuovo · 1 riga')
    })

    it('ITA-06 in inglese resta tutto com’era', async () => {
        monta('en')
        const viste = scritte()
        expect(viste).toContain('Context rail')
        expect(viste).toContain('Fork this session')
        await rt().resumeSession()
        expect([...document.querySelectorAll('.toast')].map((e) => e.textContent ?? '').join(' ')).toContain('No real session to resume')
    })
})

describe('il pulsante «Crea una diramazione»', () => {
    it('TOPO-01 sta su una riga: niente griglia a tre colonne per un pulsante solo', () => {
        // Misurato sul Pad il 24/09: 93 px (un terzo di 290), alto 36 fissi, testo su due righe che sborda (scrollHeight
        // 39). Le altre due colonne erano per pulsanti finti tolti in B1.
        const css = asset('styles.css')
        expect(css).not.toMatch(/\.topology-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3/)
        expect(css).toMatch(/\.topology-actions \.secondary-btn\s*\{[^}]*white-space:\s*nowrap/)
    })
})

/*
 * ⛔ TOPO-02 (voce aperta «titolo della struttura della sessione», misurata sul Pad il 25/09/2026): nel riquadro
 * «Struttura della sessione» il titolo era l'intera prima domanda, in grassetto su due righe. Il desktop lo accorcia
 * (`legacy/app.js`, `tronca(…, 52)`) e sotto dice lo stato. Qui: una riga sola coi puntini, il nome intero nel
 * suggerimento, e lo stato accanto a «sessione corrente».
 */
describe('il titolo nella «Struttura della sessione»', () => {
    it('TOPO-02 sta su una riga coi puntini', () => {
        const css = asset('styles.css')
        expect(css).toMatch(/\.topology-row strong\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/)
    })
})

describe('l’etichetta dell’ambiente in alto', () => {
    it('CHIP-01 si nasconde sullo spazio vero della barra (container query), non sulla larghezza dello schermo', () => {
        const css = asset('styles.css')
        expect(css).toMatch(/\.topbar\s*\{[^}]*container:\s*topbar\s*\/\s*inline-size/)
        expect(css).toMatch(/@container topbar \(max-width: 720px\)\s*\{\s*\.environment-chip\s*\{\s*display:\s*none;?\s*\}/)
    })
})
