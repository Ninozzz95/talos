// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⭐ Le Automazioni del Codice dicono il vero (24/09/2026, ledger `.claude/codice-italiano/`).
 *
 * Annotato in B1 (23/09) e misurato ora: senza server i pulsanti della vista mostravano un avviso finto («Run started» —
 * falso — / «Il mockup rappresenta il flusso senza backend»), l'azione «edit» non aveva un pulsante, la scheda del
 * pannello sessioni diceva «2 automazioni · Next run 10:00» scritti a mano, e con il server VERO ma zero automazioni la
 * vista portava ancora il badge «non collegata». Il server le ha davvero (`/api/v1/automations`, archivio e
 * pianificatore): la regola è quella decisa dall'owner in B1 — controlli veri col server, spenti col motivo senza, niente
 * dati inventati.
 */

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

type Runtime = {
    setView(view: string): void
    openSheet(type: string): void
    executeCommand(command: string): void
    realSessionState: { id: string | null }
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

function monta({ server }: { server: boolean }): void {
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html')
    parsed.querySelectorAll('script').forEach((script) => script.remove())
    document.body.replaceChildren(...Array.from(parsed.body.childNodes))
    document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
        dialog.show ??= () => { dialog.setAttribute('open', '') }
        dialog.close ??= () => { dialog.removeAttribute('open') }
    })
    document.documentElement.classList.add('talos-embedded')
    const w = window as unknown as Record<string, unknown>
    w.__talosHarnessRoot = document
    w.__talosHarnessHost = document.documentElement
    w.__talosHarnessLocale = 'it'
    if (server) w.__talosHarnessApiBase = 'http://127.0.0.1:4174'
    window.eval(asset('app.js'))
}

function rt(): Runtime {
    const r = (window as unknown as { __talosHarnessUiRuntime?: Runtime }).__talosHarnessUiRuntime
    if (!r) throw new Error('runtime non montato')
    return r
}

function avvisi(): string {
    return [...document.querySelectorAll('.toast')].map((e) => e.textContent ?? '').join(' / ')
}

function rispostaAutomazioni(items: unknown[]) {
    return vi.fn(async (url: string) => {
        const dati = String(url).includes('/api/v1/automations') ? { items } : { items: [], voci: [] }
        return new Response(JSON.stringify({ ok: true, data: dati }), { status: 200 })
    })
}


type Rotta = { metodo?: string, percorso: string, corpo: unknown }
/** Risponde per metodo e percorso (il primo che combacia); tutto il resto è un elenco vuoto. */
function server(rotte: Rotta[]) {
    return vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = (init?.method ?? 'GET').toUpperCase()
        const rotta = rotte.find((r) => (r.metodo ?? 'GET') === metodo && String(url).endsWith(r.percorso))
        const dati = rotta ? rotta.corpo : { items: [], voci: [] }
        return new Response(JSON.stringify({ ok: true, data: dati }), { status: 200 })
    })
}
const attesa = (ms = 40) => new Promise((ok) => setTimeout(ok, ms))
function vistaAttiva(): string | null {
    return document.querySelector('.view-pane.active')?.getAttribute('data-view') ?? null
}
function chiamate(metodo: string, percorso: string): Array<Record<string, unknown>> {
    return (fetch as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls
        .filter(([url, init]) => (init?.method ?? 'GET').toUpperCase() === metodo && String(url).endsWith(percorso))
        .map(([, init]) => JSON.parse(String(init?.body ?? '{}')))
}
/** Le classi usate sotto `radice` che nel CSS del Codice non esistono (AUT-2d/AUT-3: una classe senza regola non disegna). */
function classiMancanti(radice: Element): string[] {
    const css = asset('styles.css')
    return [...new Set([...radice.querySelectorAll('[class]')].flatMap((e) => [...e.classList]))]
        .filter((c) => !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css))
}
const testiDi = (radice: ParentNode, sel: string) => [...radice.querySelectorAll(sel)].map((e) => e.textContent?.trim() ?? '')
const kvDi = (radice: ParentNode) => [...radice.querySelectorAll('.talos-kv')].map((e) => [
    e.querySelector('.talos-kv__k')?.textContent ?? '', e.querySelector('.talos-kv__v')?.textContent ?? '',
])
const AUTOMAZIONE = {
    id: 'a1', nome: 'Controllo notturno', consegna: 'Controlla la cartella', cartellaId: 'workspace', attiva: false,
    intervalloMinuti: 30, limiteAlGiorno: 5, prossimaEsecuzione: null, ultimaSessioneId: 's-7', ultimoErrore: null,
}

describe('le Automazioni del Codice', () => {
    beforeEach(() => {
        document.body.className = ''
        vi.stubGlobal('EventSource', FakeEventSource)
    })
    afterEach(() => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        document.body.replaceChildren()
        document.documentElement.classList.remove('talos-embedded')
        const w = window as unknown as Record<string, unknown>
        delete w.__talosHarnessLocale
        delete w.__talosHarnessApiBase
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.useRealTimers()
        delete (document as unknown as { visibilityState?: string }).visibilityState
    })

    it('AUTO-01 senza server i pulsanti sono spenti col motivo, e toccarli non inventa niente', () => {
        vi.stubGlobal('fetch', rispostaAutomazioni([]))
        monta({ server: false })
        rt().setView('automations')
        const pulsanti = [...document.querySelectorAll<HTMLElement>('[data-automation-action]')]
        expect(pulsanti.length).toBeGreaterThan(0)
        for (const pulsante of pulsanti) {
            expect(pulsante.getAttribute('aria-disabled'), pulsante.outerHTML).toBe('true')
            expect((pulsante.getAttribute('title') ?? '').length, pulsante.outerHTML).toBeGreaterThan(0)
            pulsante.click()
        }
        expect(avvisi()).not.toMatch(/mockup|Run started|avviat|aperta/i)
        // La scheda del pannello sessioni non parte con numeri inventati né vuota: nasce nascosta e la accende l'elenco vero.
        expect((document.querySelector('.attention-card') as HTMLElement).hidden).toBe(true)
        expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/sessions'), expect.anything())
    })

    it('AUTO-02 nel sorgente niente avvisi finti né conteggi scritti a mano', () => {
        const js = asset('app.js')
        const html = asset('index.html')
        for (const frase of ['Il mockup rappresenta il flusso senza backend', "'Run started'", "'Automazione aperta'"]) {
            expect(js.includes(frase), frase).toBe(false)
        }
        for (const frase of ['2 automazioni', 'Next run 10:00']) {
            expect(html.includes(frase), frase).toBe(false)
        }
    })

    it('AUTO-03 col server e zero automazioni: niente badge «non collegata», niente scheda, uno stato vuoto che dice cosa fare', async () => {
        vi.stubGlobal('fetch', rispostaAutomazioni([]))
        monta({ server: true })
        rt().setView('automations')
        await new Promise((ok) => setTimeout(ok, 40))
        const vista = document.querySelector('[data-view="automations"]') as HTMLElement
        const badge = vista.querySelector('.demo-surface-badge') as HTMLElement | null
        expect(!badge || badge.hidden).toBe(true)
        expect((document.querySelector('.attention-card') as HTMLElement).hidden).toBe(true)
        // ⭐ AUT-3: il testo del desktop (automazioni.js: «Nessuna automazione creata.»), e l'esito lo conta
        expect(vista.querySelector('#automationListReal')?.textContent).toBe('Nessuna automazione creata.')
        expect(vista.querySelector('[data-auto-esito]')?.textContent).toBe('0 automazioni · 0 attive')
    })

    it('AUTO-05 niente attività del banco scritta a mano, e la vista dice quando partono davvero', () => {
        const html = asset('index.html')
        expect(html).not.toContain('sconto-a-scaglioni')
        vi.stubGlobal('fetch', server([]))
        monta({ server: true })
        rt().setView('automations')
        const vista = document.querySelector('[data-view="automations"]') as HTMLElement
        const nota = [...vista.querySelectorAll<HTMLElement>('p')].find((p) => p.textContent?.includes('quando il server del Codice è acceso: si accende quando apri il Codice e si spegne se riavvii il telefono'))
        expect(nota).toBeDefined()
        expect(nota?.hidden).toBe(false)
    })

    it('AUTO-06 si arriva alle Automazioni dal pannello di controllo e dalla palette dei comandi', async () => {
        vi.stubGlobal('fetch', server([]))
        monta({ server: true })
        rt().openSheet('control')
        const riga = document.querySelector('#sheetDialog [data-control-action="automations"]') as HTMLElement | null
        expect(riga?.textContent).toContain('Automazioni')
        riga?.click()
        await attesa()
        expect(vistaAttiva()).toBe('automations')

        rt().setView('chat')
        expect(document.querySelector('#commandDialog [data-command="automations"]')?.textContent).toContain('Automazioni')
        rt().executeCommand('automations')
        expect(vistaAttiva()).toBe('automations')
    })

    it('AUTO-07 una nuova automazione è una richiesta scritta: cartella di progetto, intervallo, massimo', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } },
            { metodo: 'POST', percorso: '/api/v1/automations', corpo: { ...AUTOMAZIONE } },
        ]))
        monta({ server: true })
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        const foglio = document.querySelector('#sheetDialog') as HTMLElement
        const richiesta = foglio.querySelector('textarea[name="consegna"]') as HTMLTextAreaElement
        expect(richiesta).not.toBeNull()
        richiesta.value = 'Controlla la cartella e dimmi cosa è cambiato'
        ;(foglio.querySelector('input[name="intervalloMinuti"]') as HTMLInputElement).value = '30'
        ;(foglio.querySelector('input[name="limiteAlGiorno"]') as HTMLInputElement).value = '2'
        ;(foglio.querySelector('form') as HTMLFormElement).requestSubmit()
        await attesa()
        expect(chiamate('POST', '/api/v1/automations')).toEqual([{
            consegna: 'Controlla la cartella e dimmi cosa è cambiato', cartellaId: 'workspace',
            nome: 'Controlla la cartella e dimmi cosa è cambiato', intervalloMinuti: 30, limiteAlGiorno: 2,
        }])
    })

    it('AUTO-08 «Elimina» chiede conferma nominando l\u2019automazione; solo la conferma elimina', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/automations', corpo: { items: [AUTOMAZIONE] } },
            { metodo: 'POST', percorso: '/api/v1/automations/a1/elimina', corpo: {} },
        ]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const elimina = [...document.querySelectorAll<HTMLButtonElement>('#automationListReal button')].find((b) => b.textContent === 'Elimina')
        elimina?.click()
        await attesa()
        expect(chiamate('POST', '/api/v1/automations/a1/elimina')).toEqual([])
        const foglio = document.querySelector('#sheetDialog') as HTMLElement
        expect(foglio.textContent).toContain('Controllo notturno')
        expect([...foglio.querySelectorAll('button')].some((b) => b.textContent === 'Tieni')).toBe(true)
        const conferma = [...foglio.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Elimina automazione')
        conferma?.click()
        await attesa()
        expect(chiamate('POST', '/api/v1/automations/a1/elimina')).toHaveLength(1)
    })

    // ⭐ 24/09/2026 (AUT-2e, owner: «deve essere identico a quello del desktop… in versione mobile semplificata»). Il
    // modulo desktop (AVM-integrazione-r4 harness-ui/frontend/src/legacy/app.js:20554-20586, misurato in sola lettura sul
    // 4174): UN form.sheet-section, etichetta + campo in sequenza, nota .sheet-hint, «Crea automazione» primary-btn
    // compact. Il mobile cambia solo il primo campo (la richiesta scritta, decisione owner) e non mostra cartella e modello.
    it('AUTO-14 il modulo è quello del desktop: stessa sequenza, stesse classi, e ogni classe esiste nel CSS', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } },
            { percorso: '/api/v1/automations', corpo: { items: [AUTOMAZIONE] } },
        ]))
        const css = asset('styles.css')
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        const corpo = document.querySelector('#sheetBody') as HTMLElement
        const modulo = corpo.querySelector(':scope > form') as HTMLFormElement
        expect(modulo.className).toBe('sheet-section')
        expect([...modulo.children].map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}|${e.tagName === 'SPAN' ? e.textContent : ''}`)).toEqual([
            'span.sheet-label|Cosa deve fare', 'textarea.sheet-input|',
            'span.sheet-label|Ogni quanti minuti', 'input.sheet-input|',
            'span.sheet-label|Massimo esecuzioni al giorno', 'input.sheet-input|',
            'small.sheet-hint|', 'button.primary-btn.compact|',
        ])
        expect(modulo.querySelector('button')?.textContent).toBe('Crea automazione')
        expect(modulo.querySelector('.sheet-hint')?.textContent).toBe('Userà il modello predefinito del server. Nasce sempre in pausa: la attivi tu dall\'elenco quando vuoi che parta da sola.')
        // la regola della nota è quella del desktop (lì: dialog.sheet-dialog .sheet-hint, font con --talos-ui-font-scale)
        const nota = /\.sheet-hint \{([^}]*)\}/.exec(css)?.[1] ?? ''
        expect(nota).toMatch(/display:\s*block/)
        expect(nota).toMatch(/margin:\s*8px 3px 0/)
        expect(nota).toMatch(/color:\s*var\(--muted\)/)
        expect(nota).toMatch(/font-size:\s*11px/)
        expect(classiMancanti(corpo)).toEqual([])

        const elimina = [...document.querySelectorAll<HTMLButtonElement>('#automationListReal button')].find((b) => b.textContent === 'Elimina')
        elimina?.click()
        await attesa()
        expect(classiMancanti(document.querySelector('#sheetBody') as HTMLElement)).toEqual([])
    })

    it('AUTO-15 con più cartelle di progetto si sceglie la cartella, come si sceglie il task sul desktop', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'a', nome: 'alfa' }, { id: 'b', nome: 'beta' }] } },
            { metodo: 'POST', percorso: '/api/v1/automations', corpo: { ...AUTOMAZIONE } },
        ]))
        monta({ server: true })
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        const modulo = document.querySelector('#sheetBody > form') as HTMLFormElement
        expect([...modulo.children].slice(0, 4).map((e) => `${e.tagName.toLowerCase()}|${e.tagName === 'SPAN' ? e.textContent : ''}`))
            .toEqual(['span|Cosa deve fare', 'textarea|', 'span|Cartella', 'div|'])
        // ⛔ SCELTA-CARTELLA (25/09/2026): niente `<select>` nativo (regola dell'owner, 13/09): il menu a elenco del Codice.
        expect(modulo.querySelector('select')).toBeNull()
        ;(modulo.querySelector('textarea') as HTMLTextAreaElement).value = 'Controlla'
        const scelta = modulo.querySelector('[role="combobox"]') as HTMLElement
        scelta.click()
        ;([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('beta')) as HTMLElement).click()
        expect(scelta.textContent).toContain('beta')
        modulo.requestSubmit()
        await attesa()
        expect(chiamate('POST', '/api/v1/automations')[0]).toMatchObject({ consegna: 'Controlla', cartellaId: 'b' })
    })

    /*
     * ⛔ SCELTA-CARTELLA-01 (25/09/2026): con più cartelle il modulo usava un `<select>` nativo, disegnato da Android fuori
     * dalla palette (regola dell'owner del 13/09: niente controlli nativi). Ora è un menu a elenco secondo il modello W3C
     * APG «Select-Only Combobox» (aggiornato il 12/08/2025): il fuoco resta sul pulsante, la voce evidenziata la dice
     * `aria-activedescendant`, frecce/Invio/Esc/Home/Fine come da tabella.
     */
    it('SCELTA-CARTELLA-01 il menu delle cartelle si usa da tastiera come il modello APG, e Esc non sceglie', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'a', nome: 'alfa' }, { id: 'b', nome: 'beta' }, { id: 'c', nome: 'gamma' }] } },
        ]))
        monta({ server: true })
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        const scelta = document.querySelector('#sheetBody [role="combobox"]') as HTMLElement
        const tasto = (key: string) => scelta.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
        expect(scelta.getAttribute('aria-expanded')).toBe('false')
        expect(scelta.getAttribute('aria-haspopup')).toBe('listbox')
        scelta.focus()
        tasto('ArrowDown')
        expect(scelta.getAttribute('aria-expanded')).toBe('true')
        const lista = document.getElementById(scelta.getAttribute('aria-controls')!) as HTMLElement
        expect(lista.getAttribute('role')).toBe('listbox')
        const evidenziata = () => document.getElementById(scelta.getAttribute('aria-activedescendant') ?? '')?.textContent
        expect(evidenziata()).toContain('alfa')
        tasto('ArrowDown')
        expect(evidenziata()).toContain('beta')
        tasto('End')
        expect(evidenziata()).toContain('gamma')
        tasto('Home')
        expect(evidenziata()).toContain('alfa')
        tasto('ArrowDown')
        tasto('Enter')
        expect(scelta.getAttribute('aria-expanded')).toBe('false')
        expect(scelta.textContent).toContain('beta')
        expect(document.activeElement).toBe(scelta)
        tasto('ArrowDown')
        tasto('ArrowDown')
        tasto('Escape')
        expect(scelta.getAttribute('aria-expanded')).toBe('false')
        expect(scelta.textContent).toContain('beta')
        const selezionata = [...lista.querySelectorAll('[role="option"]')].filter((o) => o.getAttribute('aria-selected') === 'true')
        expect(selezionata.map((o) => o.textContent?.trim())).toEqual(['beta'])
    })

    it('AUTO-09 il nome apre l\u2019ultima esecuzione; una pausa dopo un errore dice il motivo', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/automations', corpo: { items: [{ ...AUTOMAZIONE, ultimoErrore: 'Credito esaurito' }] } },
        ]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const elenco = document.querySelector('#automationListReal') as HTMLElement
        const visibili = elenco.querySelector('.talos-automation__runs:not([hidden])') as HTMLElement
        expect(kvDi(visibili)).toContainEqual(['Motivo della pausa', 'Credito esaurito'])
        const apri = elenco.querySelector('[data-apri-esecuzione]') as HTMLElement
        expect(apri.textContent).toBe('Controllo notturno')
        apri.click()
        await attesa()
        expect(rt().realSessionState.id).toBe('s-7')
        expect(vistaAttiva()).toBe('chat')
    })

    it('AUTO-10 il modello scelto nel Codice arriva al modulo e all’automazione', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } },
            { metodo: 'POST', percorso: '/api/v1/automations', corpo: { ...AUTOMAZIONE } },
        ]))
        monta({ server: true })
        ;(rt() as unknown as { impostaModello(m: string): boolean }).impostaModello('z-ai/glm-5.3-flash')
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        const foglio = document.querySelector('#sheetDialog') as HTMLElement
        ;(foglio.querySelector('textarea[name="consegna"]') as HTMLTextAreaElement).value = 'Controlla'
        ;(foglio.querySelector('form') as HTMLFormElement).requestSubmit()
        await attesa()
        expect(chiamate('POST', '/api/v1/automations')[0]).toMatchObject({ consegna: 'Controlla', modello: 'z-ai/glm-5.3-flash' })
    })

    // ⭐ 24/09/2026 (AUT-2b, trovato sul Pad): «Nuova automazione» andava a capo dentro il pulsante. Con la vista del
    // desktop (AUT-3) il pulsante sta nella testata della pagina: non si restringe e non va a capo.
    it('AUTO-11 il pulsante di testata non va a capo e non si restringe', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [{ ...AUTOMAZIONE }] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const css = asset('styles.css')
        const nuovo = document.querySelector('[data-view="automations"] [data-automation-action="new"]') as HTMLElement
        expect(nuovo.parentElement?.classList.contains('talos-page__head')).toBe(true)
        const regola = /^\.talos-page__head > \.talos-button[^{]*\{([^}]*)\}/m.exec(css)?.[1] ?? ''
        expect(regola).toMatch(/flex:\s*none/)
        expect(/^\.talos-button \{([^}]*)\}/m.exec(css)?.[1] ?? '').toMatch(/white-space:\s*nowrap/)
    })

    // ⭐ 24/09/2026 (AUT-2c, trovato sul Pad alla prima esecuzione vera): la vista aperta non si rileggeva — dopo il giro
    // diceva ancora «prossima 16:28» e il nome non apriva l'esecuzione. Schema TanStack Query «Polling»: si rilegge a
    // intervalli solo con la pagina visibile (refetchIntervalInBackground: false).
    it('AUTO-12 la vista aperta si rilegge da sola ogni 30 s, solo se visibile, e smette quando la si lascia', async () => {
        vi.useFakeTimers()
        let items: unknown[] = [{ ...AUTOMAZIONE, attiva: true, ultimaSessioneId: null, prossimaEsecuzione: '2026-09-24T14:28:00.000Z' }]
        vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({
            ok: true, data: String(url).endsWith('/api/v1/automations') ? { items } : { items: [], voci: [] },
        }), { status: 200 })))
        const letture = () => chiamate('GET', '/api/v1/automations').length
        const aggiunte = vi.spyOn(document, 'addEventListener')
        monta({ server: true })
        rt().setView('automations')
        await vi.advanceTimersByTimeAsync(50)
        expect(document.querySelector('[data-apri-esecuzione]')).toBeNull()
        const rigaPrima = document.querySelector('#automationListReal .talos-automation')

        // dati uguali: si rilegge, ma la riga non si ricostruisce (il fuoco resta dov'è)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(document.querySelector('#automationListReal .talos-automation')).toBe(rigaPrima)

        // il pianificatore ha fatto il giro: la riga lo mostra senza toccare niente
        items = [{ ...AUTOMAZIONE, attiva: true, ultimaSessioneId: 's-9', prossimaEsecuzione: '2026-09-24T14:33:00.000Z' }]
        await vi.advanceTimersByTimeAsync(30_000)
        expect(document.querySelector('[data-apri-esecuzione]')?.getAttribute('data-apri-esecuzione')).toBe('s-9')

        // pagina nascosta: nessuna lettura; tornata visibile: una lettura subito
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
        let prima = letture()
        await vi.advanceTimersByTimeAsync(90_000)
        expect(letture()).toBe(prima)
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(10)
        expect(letture()).toBe(prima + 1)

        // lasciata la vista: nessuna lettura, nemmeno tornando visibile
        rt().setView('chat')
        prima = letture()
        await vi.advanceTimersByTimeAsync(90_000)
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(10)
        expect(letture()).toBe(prima)

        // smontato il Codice: nessuna lettura, e niente resta appeso — né il timer né l'ascoltatore su `document`, che
        // terrebbe in vita il runtime smontato
        const timerSpento = vi.getTimerCount()
        rt().setView('automations')
        await vi.advanceTimersByTimeAsync(50)
        expect(vi.getTimerCount()).toBe(timerSpento + 1)
        const ascoltatore = aggiunte.mock.calls.find(([tipo]) => tipo === 'visibilitychange')?.[1]
        expect(ascoltatore).toBeTypeOf('function')
        const tolte = vi.spyOn(document, 'removeEventListener')
        ;(window as unknown as { __talosHarnessDestroy: () => void }).__talosHarnessDestroy()
        expect(vi.getTimerCount()).toBe(timerSpento)
        expect(tolte).toHaveBeenCalledWith('visibilitychange', ascoltatore)
        prima = letture()
        await vi.advanceTimersByTimeAsync(90_000)
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(10)
        expect(letture()).toBe(prima)
    })

    // ⭐ 24/09/2026 (AUT-2c): al limite di oggi la riga non annuncia un orario che il pianificatore non rispetterà.
    it('AUTO-13 raggiunto il limite di oggi, la riga lo dice come il desktop e la scheda laterale dice l’orario vero', async () => {
        // GIORNO-LOCALE-01 (owner 25/09/2026): il giorno è quello del telefono, e la ripresa è la sua mezzanotte.
        const adesso = new Date()
        const oggi = `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, '0')}-${String(adesso.getDate()).padStart(2, '0')}`
        const mezzanotte = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + 1)
        // un orario salvato prima della cura del server (ora + intervallo, già passato): la riga dice comunque quello vero
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [{
            ...AUTOMAZIONE, attiva: true, eseguiteOggi: 1, limiteAlGiorno: 1, giornoContatore: oggi,
            prossimaEsecuzione: new Date(Date.now() - 60_000).toISOString(),
        }] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const riga = document.querySelector('#automationListReal .talos-automation') as HTMLElement
        expect(kvDi(riga.querySelector('.talos-automation__runs') as HTMLElement)).toEqual([
            ['Prossimo avvio', 'Limite giornaliero raggiunto'], ['Avvii oggi / limite', '1 di 1'],
        ])
        const ora = mezzanotte.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        // la scheda della barra laterale dice lo stesso orario, non quello salvato
        expect(document.querySelector('.attention-card span')?.textContent).toBe(`Prossima esecuzione ${ora}`)
    })

    // ⭐⭐ 24/09/2026 (AUT-3, owner «B, sì»): la vista come il desktop (harness-ui/frontend/index.template.html:1252-1262 e
    // src/components/automazioni.js, misurati in sola lettura sul 4174), in versione mobile. APG Switch e Tabs.
    it('AUTO-16 la vista ha la struttura del desktop: testata, barra con ricerca e schede, righe con interruttore e dettagli', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [{
            ...AUTOMAZIONE, modello: 'z-ai/glm-5.3-flash', creataAlle: '2026-09-24T10:00:00.000Z', ultimaEsecuzione: null,
        }] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const vista = document.querySelector('[data-view="automations"]') as HTMLElement
        const testa = vista.querySelector('.talos-page__head') as HTMLElement
        expect(testa.querySelector('.talos-eyebrow')?.textContent).toBe('Automazioni')
        expect(testa.querySelector('h2')?.textContent).toBe('Attività programmate')
        expect(testa.querySelector('[data-auto-esito]')?.textContent).toBe('1 automazione · 0 attive')
        expect(testa.querySelector('[data-auto-esito]')?.getAttribute('role')).toBe('status')
        expect(testa.querySelector('[data-automation-action="new"]')?.textContent?.trim()).toBe('Nuova automazione')

        const barra = vista.querySelector('.talos-toolbar') as HTMLElement
        const cerca = barra.querySelector('input[type="search"][data-auto-query]') as HTMLInputElement
        expect(cerca.placeholder).toBe('Cerca le automazioni…')
        expect(testiDi(barra, '[role="tablist"] [role="tab"]')).toEqual(['Tutte', 'Attive', 'In pausa'])
        expect([...barra.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
        expect(barra.querySelector('[data-auto-refresh]')?.textContent).toBe('Aggiorna')

        const riga = vista.querySelector('#automationListReal > article.talos-card.talos-automation[role="listitem"]') as HTMLElement
        const testaRiga = riga.querySelector('.talos-automation__head') as HTMLElement
        expect([...testaRiga.children].map((e) => [...e.classList].filter((c) => c !== 'talos-grow').join('.'))).toEqual([
            'talos-dot', 'talos-automation__name', 'talos-badge.talos-badge--sm', 'talos-badge.talos-badge--sm', 'talos-switch',
        ])
        expect(testiDi(testaRiga, '.talos-badge')).toEqual(['Ogni 30 min', 'In pausa'])
        expect(kvDi(riga.querySelector('.talos-automation__runs') as HTMLElement)).toEqual([
            ['Prossimo avvio', 'In pausa'], ['Avvii oggi / limite', '0 di 5'],
        ])
        expect(testiDi(riga, ':scope > .talos-automation__head:nth-of-type(3) button')).toEqual(['Dettagli', 'Elimina'])
        const pannello = riga.querySelector('[data-auto-dettaglio]') as HTMLElement
        expect(pannello.hidden).toBe(true)
        expect(kvDi(pannello).map(([k]) => k)).toEqual(['Ultimo avvio registrato', 'Creata', 'Richiesta', 'Modello', 'Ragionamento'])
        expect(vista.querySelector('.talos-scope-note')?.textContent).toContain('a mezzanotte del telefono')
        expect(vista.querySelector('.talos-scope-note')?.textContent).not.toContain('UTC')
        expect(classiMancanti(vista)).toEqual([])
        // AUT-3b (Pad, 24/09): il fuoco della ricerca è SOLO l'anello, come il desktop — niente bordo né alone in più
        const fuoco = /\.talos-field__input:focus-visible\s*\{([^}]*)\}/.exec(asset('styles.css'))?.[1] ?? ''
        expect(fuoco).toMatch(/outline:\s*2px solid var\(--focus\)/)
        expect(fuoco).not.toMatch(/box-shadow|border-color/)
    })

    it('AUTO-17 ricerca e schede filtrano senza rileggere; le schede si muovono con le frecce, Home e Fine', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [
            { ...AUTOMAZIONE },
            { ...AUTOMAZIONE, id: 'a2', nome: 'Riepilogo mattutino', consegna: 'Riassumi le novità', attiva: true, prossimaEsecuzione: '2026-09-24T18:00:00.000Z' },
        ] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const letture = chiamate('GET', '/api/v1/automations').length
        const nomi = () => testiDi(document, '#automationListReal .talos-automation__name')
        const scheda = (testo: string) => [...document.querySelectorAll<HTMLElement>('[data-view="automations"] [role="tab"]')].find((t) => t.textContent === testo) as HTMLElement
        const esito = () => document.querySelector('[data-auto-esito]')?.textContent

        scheda('Attive').click()
        expect(nomi()).toEqual(['Riepilogo mattutino'])
        expect(esito()).toBe('1 di 2 automazioni')
        expect(scheda('Attive').getAttribute('aria-selected')).toBe('true')
        expect([...document.querySelectorAll('[data-view="automations"] [role="tab"]')].map((t) => (t as HTMLElement).tabIndex)).toEqual([-1, 0, -1])

        scheda('Attive').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        expect(nomi()).toEqual(['Controllo notturno'])
        expect(document.activeElement).toBe(scheda('In pausa'))
        scheda('In pausa').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
        expect(scheda('Tutte').getAttribute('aria-selected')).toBe('true')
        scheda('Tutte').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
        expect(scheda('In pausa').getAttribute('aria-selected')).toBe('true')
        scheda('In pausa').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        expect(scheda('Tutte').getAttribute('aria-selected')).toBe('true')

        const cerca = document.querySelector('[data-auto-query]') as HTMLInputElement
        cerca.value = 'novità'
        cerca.dispatchEvent(new Event('input', { bubbles: true }))
        expect(nomi()).toEqual(['Riepilogo mattutino'])
        cerca.value = 'zzz'
        cerca.dispatchEvent(new Event('input', { bubbles: true }))
        expect(document.querySelector('#automationListReal')?.textContent).toBe('Nessuna automazione corrisponde ai filtri.')
        expect(chiamate('GET', '/api/v1/automations').length).toBe(letture)
    })

    it('AUTO-18 l’interruttore è un role=switch con etichetta fissa, e accende o spegne sul server', async () => {
        let items: unknown[] = [{ ...AUTOMAZIONE }]
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if ((init?.method ?? 'GET') === 'POST') items = [{ ...AUTOMAZIONE, attiva: true, prossimaEsecuzione: '2026-09-24T18:00:00.000Z' }]
            return new Response(JSON.stringify({ ok: true, data: String(url).endsWith('/api/v1/automations') ? { items } : {} }), { status: 200 })
        }))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const interruttore = () => document.querySelector('#automationListReal [data-auto-toggle]') as HTMLButtonElement
        expect(interruttore().getAttribute('role')).toBe('switch')
        expect(interruttore().getAttribute('aria-checked')).toBe('false')
        expect(interruttore().getAttribute('aria-label')).toBe('Automazione Controllo notturno')
        interruttore().click()
        await attesa()
        expect(chiamate('POST', '/api/v1/automations/a1/toggle')).toEqual([{ attiva: true }])
        expect(interruttore().getAttribute('aria-checked')).toBe('true')
        expect(interruttore().getAttribute('aria-label')).toBe('Automazione Controllo notturno')
        // la riga è ridisegnata: il fuoco torna sull'interruttore toccato (come AutomationRow del desktop)
        expect(document.activeElement).toBe(interruttore())
    })

    it('AUTO-19 i dettagli dicono richiesta e modello, e restano aperti quando la vista si ridisegna', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [
            { ...AUTOMAZIONE, modello: 'z-ai/glm-5.3-flash' },
            { ...AUTOMAZIONE, id: 'a2', nome: 'Senza modello', modello: null },
        ] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const righe = () => [...document.querySelectorAll<HTMLElement>('#automationListReal .talos-automation')]
        const dettagli = righe()[0].querySelector('[data-auto-details]') as HTMLButtonElement
        dettagli.click()
        expect(dettagli.getAttribute('aria-expanded')).toBe('true')
        const pannello = () => righe()[0].querySelector('[data-auto-dettaglio]') as HTMLElement
        expect(pannello().hidden).toBe(false)
        expect(kvDi(pannello()).slice(2, 4)).toEqual([['Richiesta', 'Controlla la cartella'], ['Modello', 'z-ai/glm-5.3-flash']])
        expect(kvDi(righe()[1].querySelector('[data-auto-dettaglio]') as HTMLElement).at(-2)).toEqual(['Modello', 'Modello predefinito del server'])
        ;(document.querySelector('[data-view="automations"] [role="tab"]') as HTMLElement).click()
        expect(pannello().hidden).toBe(false)
    })

    it('AUTO-20 la nota del modulo dice con quale modello girerà l’automazione (decisione owner, A)', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } }]))
        monta({ server: true })
        ;(rt() as unknown as { impostaModello(m: string): boolean }).impostaModello('z-ai/glm-5.3-flash')
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        expect(document.querySelector('#sheetBody .sheet-hint')?.textContent)
            .toBe('Userà z-ai/glm-5.3-flash, il modello scelto nel Codice. Nasce sempre in pausa: la attivi tu dall\'elenco quando vuoi che parta da sola.')
    })

    /*
     * AUTO-23/24 (25/09/2026, owner «Salvato alla creazione»): un'automazione partiva senza livello e il server mandava
     * il predefinito del catalogo (GLM 5.3: max, il più lento e caro). Ora, come il modello, il livello del composer del
     * Codice si salva alla creazione, la nota lo dice e i Dettagli lo mostrano (Hermes: livello per job, #23524).
     */
    it('AUTO-23 la nota dice anche il livello, e la creazione lo salva', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } },
            { metodo: 'POST', percorso: '/api/v1/automations', corpo: { ...AUTOMAZIONE } },
        ]))
        monta({ server: true })
        const runtime = rt() as unknown as { impostaModello(m: string): boolean, impostaEffort(e: string | null, s?: boolean): boolean }
        runtime.impostaModello('z-ai/glm-5.3-flash')
        runtime.impostaEffort('high', false)
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        expect(document.querySelector('#sheetBody .sheet-hint')?.textContent)
            .toBe('Userà z-ai/glm-5.3-flash con ragionamento Alto, scelti nel Codice. Nasce sempre in pausa: la attivi tu dall\'elenco quando vuoi che parta da sola.')
        const foglio = document.querySelector('#sheetDialog') as HTMLElement
        ;(foglio.querySelector('textarea[name="consegna"]') as HTMLTextAreaElement).value = 'Controlla'
        ;(foglio.querySelector('form') as HTMLFormElement).requestSubmit()
        await attesa()
        expect(chiamate('POST', '/api/v1/automations')[0]).toMatchObject({ modello: 'z-ai/glm-5.3-flash', reasoning: { effort: 'high' } })
    })

    /*
     * ⛔ NOME-MODELLO-01 (Pad, 25/09/2026): nel Codice il modello si leggeva come sigla («z-ai/glm-5.3-flash») nella
     * pillola del compositore e nella nota del modulo. Ora il nome del catalogo che il Codice scarica già
     * (`/api/v1/models`); se il catalogo non risponde resta la sigla, mai un vuoto.
     */
    it('NOME-MODELLO-01 pillola e nota dicono il nome del modello, non la sigla', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } },
            { percorso: '/api/v1/models', corpo: { modelli: [{ id: 'z-ai/glm-5.3-flash', nome: 'Z.ai: GLM 5.3 Flash', provider: 'Z.ai' }] } },
        ]))
        monta({ server: true })
        const runtime = rt() as unknown as { impostaModello(m: string): boolean, impostaEffort(e: string | null, s?: boolean): boolean }
        runtime.impostaModello('z-ai/glm-5.3-flash')
        runtime.impostaEffort('high', false)
        await attesa()
        expect(document.querySelector('[data-open-sheet="model"] span')?.textContent).toBe('Z.ai: GLM 5.3 Flash')
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        expect(document.querySelector('#sheetBody .sheet-hint')?.textContent)
            .toMatch(/^Userà Z\.ai: GLM 5\.3 Flash con ragionamento Alto, scelti nel Codice\./)
    })

    // NOME-MODELLO-01, la via vera del telefono: il nome arriva dall'app col modello (il server non ha il catalogo).
    it('NOME-MODELLO-02 il nome passato dall’app vale per pillola e nota, senza chiedere il catalogo', async () => {
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } },
        ]))
        monta({ server: true })
        const runtime = rt() as unknown as { impostaModello(m: string, n?: string): boolean, impostaEffort(e: string | null, s?: boolean): boolean }
        runtime.impostaModello('z-ai/glm-5.3-flash', 'Z.ai: GLM 5.3 Flash')
        runtime.impostaEffort('high', false)
        expect(document.querySelector('[data-open-sheet="model"] span')?.textContent).toBe('Z.ai: GLM 5.3 Flash')
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        expect(document.querySelector('#sheetBody .sheet-hint')?.textContent)
            .toMatch(/^Userà Z\.ai: GLM 5\.3 Flash con ragionamento Alto/)
        expect(chiamate('GET', '/api/v1/models')).toHaveLength(0)
    })

    /*
     * ⛔ ANTEPRIMA-01 (Pad, 25/09/2026): in cima al modulo «Nuova automazione» c'era l'etichetta «Anteprima · non
     * collegata» del foglio condiviso — ma il modulo è collegato davvero al server (lo crea con una POST vera). Un'etichetta
     * che dice il falso sul contrario del vero; il foglio «Nuova sessione» la nasconde già.
     */
    it('ANTEPRIMA-01 il modulo «Nuova automazione», collegato al server, non dice «non collegata»', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } }]))
        monta({ server: true })
        rt().setView('automations')
        ;(document.querySelector('[data-automation-action="new"]') as HTMLElement).click()
        await attesa()
        const etichette = [...document.querySelectorAll<HTMLElement>('#sheetDialog .demo-surface-badge')]
        expect(etichette.every((etichetta) => etichetta.hidden)).toBe(true)
    })

    it('AUTO-24 i Dettagli dicono il livello salvato, o il predefinito del server', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [
            { ...AUTOMAZIONE, modello: 'z-ai/glm-5.3-flash', reasoning: { effort: 'max' } },
            { ...AUTOMAZIONE, id: 'a2', nome: 'Senza livello', modello: null },
        ] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const righe = [...document.querySelectorAll<HTMLElement>('#automationListReal .talos-automation')]
        expect(kvDi(righe[0].querySelector('[data-auto-dettaglio]') as HTMLElement).at(-1)).toEqual(['Ragionamento', 'Massimo'])
        expect(kvDi(righe[1].querySelector('[data-auto-dettaglio]') as HTMLElement).at(-1)).toEqual(['Ragionamento', 'Livello predefinito del server'])
    })

    it('AUTO-21 «Aggiorna» rilegge; senza server è spento col motivo e non chiama niente', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        const prima = chiamate('GET', '/api/v1/automations').length
        ;(document.querySelector('[data-auto-refresh]') as HTMLElement).click()
        await attesa()
        expect(chiamate('GET', '/api/v1/automations').length).toBe(prima + 1)

        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        delete (window as unknown as Record<string, unknown>).__talosHarnessApiBase
        vi.stubGlobal('fetch', rispostaAutomazioni([]))
        monta({ server: false })
        rt().setView('automations')
        const aggiorna = document.querySelector('[data-auto-refresh]') as HTMLElement
        expect(aggiorna.getAttribute('aria-disabled')).toBe('true')
        expect((aggiorna.getAttribute('title') ?? '').length).toBeGreaterThan(0)
        aggiorna.click()
        await attesa()
        expect(fetch).not.toHaveBeenCalled()
    })

    // ⭐ 24/09/2026 sera (AUT-3c, owner «Conferma ridisegnata»): la domanda era in 10px dentro un riquadro tratteggiato.
    // Grammatica di `confermaModale` del desktop (modale-td.js:163): domanda in prosa, conseguenza in grigio, «Tieni» e
    // l'azione distruttiva come pulsanti secondari, fuoco sulla via d'uscita (W3C APG Alert Dialog).
    it('AUTO-22 la conferma è una domanda leggibile, dice la conseguenza e parte dal «Tieni»', async () => {
        vi.stubGlobal('fetch', server([{ percorso: '/api/v1/automations', corpo: { items: [AUTOMAZIONE] } }]))
        monta({ server: true })
        rt().setView('automations')
        await attesa()
        ;(document.querySelector('#automationListReal [data-auto-elimina]') as HTMLElement).click()
        await attesa()
        const corpo = document.querySelector('#sheetBody') as HTMLElement
        expect(corpo.querySelector('.board-empty')).toBeNull()
        expect(corpo.querySelector('.talos-conferma__domanda')?.textContent)
            .toBe('Eliminare l’automazione «Controllo notturno»? Smette di partire e sparisce dall’elenco.')
        expect(corpo.querySelector('.talos-conferma__conseguenza')?.textContent).toBe('Non si annulla.')
        const pulsanti = [...corpo.querySelectorAll('.talos-conferma__piede button')]
        expect(pulsanti.map((b) => [b.textContent, b.className])).toEqual([
            ['Tieni', 'talos-button talos-button--secondary talos-button--sm'],
            ['Elimina automazione', 'talos-button talos-button--secondary talos-button--danger talos-button--sm'],
        ])
        expect(document.activeElement).toBe(pulsanti[0])
        expect(classiMancanti(corpo)).toEqual([])
        // la coppia di pericolo dell'app: il rosso sta sul suo fondo tenue (sul Pad, da solo, era quasi bianco)
        const pericolo = /\.talos-button--danger\s*\{([^}]*)\}/.exec(asset('styles.css'))?.[1] ?? ''
        expect(pericolo).toMatch(/color:\s*var\(--danger\)/)
        expect(pericolo).toMatch(/background:\s*var\(--danger-soft\)/)
    })

    it('AUTO-04 una automazione attiva si descrive in italiano, con la prossima esecuzione', async () => {
        vi.stubGlobal('fetch', rispostaAutomazioni([{
            id: 'a1', nome: 'Controllo notturno', attiva: true, intervalloMinuti: 30, limiteAlGiorno: 5,
            prossimaEsecuzione: '2026-09-24T12:30:00.000Z', taskId: 'libero',
        }]))
        monta({ server: true })
        rt().setView('automations')
        await new Promise((ok) => setTimeout(ok, 40))
        const riga = document.querySelector('#automationListReal .talos-automation') as HTMLElement
        expect(testiDi(riga, '.talos-automation__head:first-child .talos-badge')).toEqual(['Ogni 30 min', 'Attiva'])
        expect(kvDi(riga.querySelector('.talos-automation__runs') as HTMLElement)).toEqual([
            ['Prossimo avvio', new Date('2026-09-24T12:30:00.000Z').toLocaleString('it-IT')], ['Avvii oggi / limite', '0 di 5'],
        ])
        expect(riga.textContent).not.toMatch(/Every|Active|Next start|Details/)
        expect(document.querySelector('.attention-card strong')?.textContent).toBe('1 automazione')
        expect(document.querySelector('.attention-card span')?.textContent).toMatch(/^Prossima esecuzione /)
    })
})

/*
 * ⭐ PICKER-TASTIERA-01 (owner 25/09/2026, «come il selettore dell'app»; dossier
 * `.claude/ricerche/2026-09-25-dubbi-punto-6-10x4.md`): aprendo il selettore del modello del Codice la ricerca prendeva
 * il fuoco e sul Pad la tastiera copriva metà del foglio (due righe visibili). Il selettore dell'app non lo fa. Su uno
 * schermo a tocco (`pointer: coarse`) si vede l'elenco intero e la tastiera sale solo toccando «Cerca»; con mouse e
 * tastiera fisica resta il comportamento del desktop.
 */
describe('PICKER-TASTIERA-01 il selettore del modello non apre la tastiera sul telefono', () => {
    async function apriSelettore(tocco: boolean): Promise<HTMLInputElement> {
        vi.stubGlobal('matchMedia', (query: string) => ({ matches: tocco && query === '(pointer: coarse)', media: query, addEventListener() {}, removeEventListener() {} }))
        vi.stubGlobal('fetch', server([
            { percorso: '/api/v1/projects', corpo: { items: [{ id: 'workspace', nome: 'workspace' }] } },
            { percorso: '/api/v1/models', corpo: { modelli: [{ id: 'z-ai/glm-5.3-flash', nome: 'Z.ai: GLM 5.3 Flash', provider: 'z-ai' }] } },
        ]))
        monta({ server: true })
        const dialogo = document.querySelector<HTMLDialogElement>('#sheetDialog')!
        dialogo.showModal = () => { dialogo.setAttribute('open', '') }
        await (rt() as unknown as { openRealTaskSheet(): Promise<void> }).openRealTaskSheet()
        await attesa()
        const selettore = [...document.querySelectorAll<HTMLElement>('.model-picker:not(.scelta-singola)')].at(-1)!
        selettore.querySelector<HTMLButtonElement>('.model-picker-trigger')!.click()
        await attesa()
        return selettore.querySelector<HTMLInputElement>('.model-picker-search input')!
    }

    it('PICKER-TASTIERA-01 a tocco: l’elenco si apre e la ricerca NON prende il fuoco', async () => {
        const ricerca = await apriSelettore(true)
        expect(ricerca.closest('.model-picker-panel')?.hasAttribute('hidden')).toBe(false)
        expect(document.activeElement).not.toBe(ricerca)
    })

    // ITA-PICKER-01 (foto del Pad 13:08): il pulsante in fondo al selettore diceva «Refresh» (creato dopo l'avvio, fuori da
    // `t()`), e il conteggio era scritto in italiano nel codice (restava italiano anche in inglese).
    it('ITA-PICKER-01 il piede del selettore è tradotto: «Aggiorna» e «1 modello»', async () => {
        const ricerca = await apriSelettore(true)
        const piede = ricerca.closest('.model-picker-panel')!.querySelector('.model-picker-footer')!
        expect(piede.querySelector('button')?.textContent?.trim()).toBe('Aggiorna')
        expect(piede.textContent).toContain('1 modello')
        expect(piede.textContent).not.toContain('Refresh')
    })

    it('PICKER-TASTIERA-02 con mouse e tastiera fisica la ricerca prende il fuoco, come sul desktop', async () => {
        const ricerca = await apriSelettore(false)
        expect(document.activeElement).toBe(ricerca)
    })
})
