// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

const originalElementAnimate = Element.prototype.animate

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

describe('Harness UI embedded host and keyboard runtime', () => {
    beforeEach(() => {
        document.body.className = ''
    })

    afterEach(() => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime
        delete (window as unknown as { __talosHarnessHostPermissionChange?: unknown }).__talosHarnessHostPermissionChange
        delete (window as unknown as { __talosHarnessApiBase?: unknown }).__talosHarnessApiBase
        document.body.replaceChildren()
        document.body.className = ''
        document.documentElement.className = ''
        document.documentElement.style.removeProperty('--talos-motion-duration-surface-exit')
        Object.defineProperty(Element.prototype, 'animate', {
            configurable: true,
            value: originalElementAnimate,
        })
        vi.unstubAllGlobals()
    })

    it('HARNESS-EMBEDDED-HEIGHT-01 sizes the embedded app and workspace from their real host', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.app-shell\s*\{[^}]*height:\s*100%/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.workspace-shell\s*\{[^}]*height:\s*100%/s)
    })

    /**
     * ⛔⛔⛔ 29/8 — trovato sul device: `.demo-surface-badge { display:
     * inline-flex }` (regola di classe) ha la STESSA specificità della
     * regola user-agent per `[hidden]` — una regola d'autore vince sempre
     * a parità di specificità, quindi `badge.hidden = true`
     * (`aggiornaPannelloAmbiente`/`collegaEventiSessione`, verificato che
     * la PROPRIETÀ viene impostata) non aveva MAI un effetto visivo: il
     * badge "Demo UI · non collegato" restava a schermo su una sessione
     * reale. jsdom non implementa il foglio di stile dello user-agent
     * (nessun modo affidabile di riprodurre il bug/la cura via
     * `getComputedStyle` in questo ambiente) — si prova sul TESTO del
     * CSS, stesso schema già usato sopra per l'altezza embedded.
     */
    it('HARNESS-DEMO-BADGE-HIDDEN-01 [hidden] batte "display: inline-flex" con una specificità reale', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/\.demo-surface-badge\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s)
    })

    it('CODE-SINGLE-SAFE-AREA-02 lets the session-first topbar own the safe area after outer chrome is removed', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.topbar\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top\)/s)
    })

    it.each([
        ['portrait', 392, 872],
        ['landscape', 872, 392],
    ])('HARNESS-KEYBOARD-%s-01 keeps native keyboard state across viewport resize', (_name, width, height) => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
        mountStaticRuntime()

        const composer = document.querySelector<HTMLTextAreaElement>('#composerInput')
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { setKeyboardOpen?(open: boolean): void }
        }).__talosHarnessUiRuntime
        expect(runtime?.setKeyboardOpen).toBeTypeOf('function')

        composer?.focus()
        runtime?.setKeyboardOpen?.(true)
        window.dispatchEvent(new Event('resize'))
        expect(document.body.classList.contains('keyboard-open')).toBe(true)

        runtime?.setKeyboardOpen?.(false)
        expect(document.body.classList.contains('keyboard-open')).toBe(false)
        expect(document.activeElement).not.toBe(composer)
    })

    it('HARNESS-BOTTOM-NAV-END-01 clears keyboard state when the embedded runtime is destroyed', () => {
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { setKeyboardOpen?(open: boolean): void }
        }).__talosHarnessUiRuntime

        expect(runtime?.setKeyboardOpen).toBeTypeOf('function')
        runtime?.setKeyboardOpen?.(true)
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()

        expect(document.body.classList.contains('keyboard-open')).toBe(false)
    })

    it('HARNESS-WIDE-SHORT-HOST-01 derives compact landscape from the real embedded host', () => {
        let height = 297
        document.documentElement.classList.add('talos-embedded')
        vi.spyOn(document.documentElement, 'getBoundingClientRect').mockImplementation(() => ({
            width: 872,
            height,
            top: 0,
            right: 872,
            bottom: height,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }))

        mountStaticRuntime()
        expect(document.documentElement.classList.contains('talos-embedded-wide-short')).toBe(true)

        height = 700
        window.dispatchEvent(new Event('resize'))
        expect(document.documentElement.classList.contains('talos-embedded-wide-short')).toBe(false)
    })

    it('HARNESS-COMPOSER-BOTTOM-01 gives wide-short a visible nav and compact keyboard composer', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.mobile-nav\s*\{[^}]*display:\s*grid/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\):host-context\(body\.keyboard-open\)\s+\.composer-wrap\s*\{[^}]*bottom:\s*0/s)
    })

    it('CODE-PALETTE-LANDSCAPE-01 keeps the command dialog inside the short embedded host', () => {
        const css = asset('styles.css')

        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.command-dialog\s*\{[^}]*margin-top:\s*8px[^}]*max-height:\s*calc\(100dvh\s*-\s*40px\)/s,
        )
        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.command-results\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*140px\)/s,
        )
    })

    it('CODE-TOAST-WIDE-SHORT-01 keeps action feedback below the run strip and clear of controls', () => {
        const css = asset('styles.css')

        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.toast-region\s*\{[^}]*top:\s*calc\(52px\s*\+\s*env\(safe-area-inset-top\)\s*\+\s*var\(--wide-short-run-h\)\s*\+\s*var\(--wide-short-toast-gap\)\)[^}]*right:\s*8px[^}]*bottom:\s*auto/s,
        )
    })

    it('CODE-REVIEW-WIDE-SHORT-01 does not add a desktop-sized empty tail after a short diff', () => {
        const css = asset('styles.css')

        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.diff-panel\s+pre\s*\{[^}]*min-height:\s*min\(180px,\s*calc\(100dvh\s*-\s*180px\)\)/s,
        )
    })

    it('CODE-SETTINGS-REACHABLE-01 reaches Code settings through the existing control sheet', () => {
        mountStaticRuntime()

        document.querySelector<HTMLButtonElement>('[data-command="control"]')?.click()
        const sheet = document.querySelector<HTMLDialogElement>('#sheetDialog')
        const settings = sheet?.querySelector<HTMLButtonElement>('[data-control-action="settings"]')

        expect(sheet?.open).toBe(true)
        expect(settings?.textContent).toContain('Impostazioni Codice')

        settings?.click()

        expect(sheet?.open).toBe(false)
        expect(document.querySelector('[data-view="settings"]')?.classList.contains('active')).toBe(true)
    })

    it('CODE-COMPOSER-AUTONOMY-SHEET-01 opens the original policy sheet and reports its selection to Vue', () => {
        const permissionChanged = vi.fn()
        ;(window as unknown as {
            __talosHarnessHostPermissionChange?: (permission: string) => void
        }).__talosHarnessHostPermissionChange = permissionChanged
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { announceComposerAction?(action: string): boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.announceComposerAction?.('permissions')).toBe(true)
        const sheet = document.querySelector<HTMLDialogElement>('#sheetDialog')
        expect(sheet?.open).toBe(true)
        const fullAccess = [...(sheet?.querySelectorAll<HTMLButtonElement>('[data-permission-choice]') ?? [])]
            .find((button) => button.dataset.permissionChoice === 'Full access')
        expect(fullAccess).toBeDefined()

        fullAccess?.click()
        expect(permissionChanged).toHaveBeenCalledWith('Full access')
        expect(sheet?.open).toBe(false)
    })

    /*
     * ⭐⭐⭐ 2/9 — export_report (piano §14.3/§15.6, R5): il comando slash
     * `/export` ricadeva sul toast fisso "Export demo" — exportSession()
     * esiste già (poche righe sotto in app.js, già onesta: sessione
     * reale → il foglio vero, bozza → un JSON scaricato per davvero con
     * un toast che lo dichiara). Prova che la NUOVA eccezione in
     * announceComposerAction() richiama quella funzione vera, mai più
     * il vecchio toast fisso.
     */
    it('⭐ CODE-COMPOSER-EXPORT-REPORT-01 export_report richiama exportSession() vera, mai il vecchio toast fisso', () => {
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { announceComposerAction?(action: string): boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.announceComposerAction?.('export_report')).toBe(true)

        const toastTitle = document.querySelector('.toast strong')?.textContent
        expect(toastTitle).not.toBe('Export demo') // il vecchio mockup fisso
        expect(toastTitle).toBe('Sessione esportata') // il toast VERO di exportSession(), ramo bozza
    })

    it('CODE-MODE-STATE-TRUTH-01 never leaves Chat selected while another surface is visible', () => {
        mountStaticRuntime()

        document.querySelector<HTMLElement>('#commandPaletteBtn')?.click()
        document.querySelector<HTMLButtonElement>('[data-command="browser"]')?.click()

        expect(document.querySelector('[data-view="browser"]')?.classList.contains('active')).toBe(true)
        expect([...document.querySelectorAll('.mode-tab')].every((tab) => !tab.classList.contains('active'))).toBe(true)
        expect([...document.querySelectorAll('.mode-tab')].every((tab) => tab.getAttribute('aria-pressed') === 'false')).toBe(true)

        document.querySelector<HTMLButtonElement>('[data-mode="chat"]')?.click()

        expect(document.querySelector('[data-view="chat"]')?.classList.contains('active')).toBe(true)
        expect(document.querySelector('[data-mode="chat"]')?.classList.contains('active')).toBe(true)
        expect(document.querySelector('[data-mode="chat"]')?.getAttribute('aria-pressed')).toBe('true')
    })

    it('HARNESS-COMPOSER-AFTER-SCROLL-01 scrolls the transcript without moving the composer', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/\.chat-view\s*\{[^}]*overflow:\s*hidden/s)
        expect(css).toMatch(/\.chat-view\s+\.conversation\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/s)
    })

    it('CODE-TOPBAR-ENTER-ALWAYS-01 hides on downward content scroll, returns upward and detaches on destroy', () => {
        document.documentElement.classList.add('talos-embedded')
        mountStaticRuntime()
        const conversation = document.querySelector<HTMLElement>('.conversation')
        const topbar = document.querySelector<HTMLElement>('.topbar')
        expect(conversation).not.toBeNull()
        expect(topbar).not.toBeNull()

        if (!conversation || !topbar) return
        conversation.scrollTop = 48
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)

        conversation.scrollTop = 36
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)

        conversation.scrollTop = 64
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)
        document.querySelector<HTMLButtonElement>('[data-mobile-view="browser"]')?.click()
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)

        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        conversation.scrollTop = 96
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)
    })

    it('CODE-TOPBAR-NO-FLAP-01 ignores the layout clamp at the new bottom but still returns on a real upward scroll', () => {
        document.documentElement.classList.add('talos-embedded')
        mountStaticRuntime()
        const conversation = document.querySelector<HTMLElement>('.conversation')
        const topbar = document.querySelector<HTMLElement>('.topbar')
        expect(conversation).not.toBeNull()
        expect(topbar).not.toBeNull()

        if (!conversation || !topbar) return
        Object.defineProperties(conversation, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 300 },
        })

        conversation.scrollTop = 650
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)

        // Collapsing the topbar gives the transcript 64px more room. Near the
        // end, the browser clamps scrollTop to the new maximum (636): that
        // negative delta is layout feedback, not a finger reversing direction.
        Object.defineProperty(conversation, 'clientHeight', { configurable: true, value: 364 })
        conversation.scrollTop = 636
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)

        // A real upward gesture leaves the maximum instead, so the header must
        // return immediately and exactly once.
        conversation.scrollTop = 600
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)
    })

    it.each([
        ['sess-refactor-auth-flow', 'Refactor auth flow'],
        ['sess-audit-api-permissions', 'Audit API permissions'],
        ['sess-fix-mobile-composer', 'Fix mobile composer'],
        ['sess-prepare-release-notes', 'Prepare release notes'],
        ['sess-investigate-flaky-tests', 'Investigate flaky tests'],
    ])('HARNESS-ROUTE-SESSION-SYNC-01 selects %s through the public runtime', (id, title) => {
        mountStaticRuntime()
        // ⛔ 27/8 — le sessioni demo statiche sono state rimosse dall'index.html
        // (owner: "cancella tutte le sessioni mockup"). La sidebar mostra oggi
        // SOLO sessioni reali, popolate da aggiornaElencoSessioniReali() con
        // l'attributo data-real-session-id — quello che il router mobile
        // sincronizza attraverso selectSession() deve poter trovare.
        const item = document.createElement('button')
        item.className = 'session-item real-session-item'
        item.dataset.realSessionId = id
        item.innerHTML = '<span class="session-main"><strong>placeholder</strong></span>'
        document.querySelector('#sessionList')?.appendChild(item)

        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { selectSession?(selection: { id: string; title: string }): void }
        }).__talosHarnessUiRuntime

        expect(runtime?.selectSession).toBeTypeOf('function')
        runtime?.selectSession?.({ id, title })

        expect(document.querySelector('#sessionTitle')?.textContent).toBe(title)
        expect(document.querySelector('.session-item.active')?.getAttribute('data-real-session-id')).toBe(id)
        const synchronizedLabels = [...document.querySelectorAll('[data-current-session-title]')]
        expect(synchronizedLabels.length).toBeGreaterThan(0)
        expect(synchronizedLabels.every((label) => label.textContent === title)).toBe(true)
    })

    it('CODE-PRODUCT-NAME-01 renders every visible static product reference as Codice', () => {
        const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html')
        mountStaticRuntime()

        expect(parsed.title).toContain('Codice')
        expect(document.body.textContent).not.toMatch(/Harness/i)
        expect(document.querySelector('[aria-label*="Harness" i]')).toBeNull()
    })

    it('HARNESS-PALETTE-BACK-01 consumes only the Back that actually closes a transient layer', () => {
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { dismissTransientLayers?(): boolean }
        }).__talosHarnessUiRuntime

        document.querySelector<HTMLElement>('#commandPaletteBtn')?.click()
        expect(document.querySelector<HTMLDialogElement>('#commandDialog')?.open).toBe(true)
        expect(runtime?.dismissTransientLayers?.()).toBe(true)
        expect(document.querySelector<HTMLDialogElement>('#commandDialog')?.open).toBe(false)
        expect(runtime?.dismissTransientLayers?.()).toBe(false)
    })

    it('HARNESS-MIC-HONEST-01 answers the microphone control without pretending to record', () => {
        mountStaticRuntime()
        const microphone = document.querySelector<HTMLButtonElement>('.composer-mic')

        microphone?.click()

        expect(microphone?.getAttribute('aria-pressed')).not.toBe('true')
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Voce demo non collegata')
    })

    // ⛔ 27/8 — l'approval-card demo (che questi due test usavano come veicolo)
    // è stata rimossa da index.html (owner: "cancella tutte le sessioni
    // mockup"). animateExit() con la durata di default (surface-exit) e una
    // rimozione dal DOM resta un meccanismo REALE altrove: il toast più
    // vecchio, quando ce ne sono già 3, usa esattamente lo stesso percorso
    // (vedi toast() in app.js). announceComposerAction('attach') è la via
    // pubblica per generarne uno.
    it('CODE-MOTION-EXIT-01 removes the oldest toast only after its exit animation finishes', async () => {
        let finishAnimation: (() => void) | undefined
        const cancel = vi.fn()
        const animate = vi.fn(() => ({
            cancel,
            finished: new Promise<void>((resolve) => { finishAnimation = resolve }),
        }))
        Object.defineProperty(Element.prototype, 'animate', {
            configurable: true,
            value: animate,
        })
        document.documentElement.style.setProperty('--talos-motion-duration-surface-exit', '120ms')
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { announceComposerAction?(action: string): boolean }
        }).__talosHarnessUiRuntime

        for (let i = 0; i < 3; i += 1) runtime?.announceComposerAction?.('attach')
        const oldest = document.querySelector('#toastRegion')?.firstElementChild
        animate.mockClear()
        runtime?.announceComposerAction?.('attach') // il 4° toast fa scattare la rimozione animata del più vecchio

        expect(animate).toHaveBeenCalled()
        expect(oldest?.isConnected).toBe(true)
        finishAnimation?.()
        await Promise.resolve()
        await Promise.resolve()
        expect(oldest?.isConnected).toBe(false)
    })

    it('CODE-MOTION-REDUCED-01 removes immediately when the app motion token is zero', () => {
        const animate = vi.fn()
        Object.defineProperty(Element.prototype, 'animate', {
            configurable: true,
            value: animate,
        })
        document.documentElement.style.setProperty('--talos-motion-duration-surface-exit', '0ms')
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { announceComposerAction?(action: string): boolean }
        }).__talosHarnessUiRuntime

        for (let i = 0; i < 3; i += 1) runtime?.announceComposerAction?.('attach')
        const oldest = document.querySelector('#toastRegion')?.firstElementChild
        runtime?.announceComposerAction?.('attach')

        expect(animate).not.toHaveBeenCalled()
        expect(oldest?.isConnected).toBe(false)
    })

    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 3 — RINOMINATO da
     * "CODE-COMPOSER-DEMO-SEND-01 ... without a network request": era il
     * mockup stesso (`appendUserMessage`, risposta scriptata) che questo
     * punto elimina. Un messaggio semplice avvia ORA una sessione reale
     * (`startRealSessionFromMessage`, ledger FASE-5-EXECUTION-PLANE) — la
     * prova END-TO-END del contratto (corpo esatto, SSE) vive in
     * harnessUiRealSession.test.ts, che ha già l'infrastruttura
     * `FakeEventSource`; questo file resta sulla sua materia (composer ↔
     * runtime) e verifica solo che il fetch VERO parta con la forma
     * giusta — senza istanziare un `EventSource` che jsdom non implementa,
     * la POST finale RIFIUTA di proposito.
     *
     * ⛔⛔⛔ 29/8 — RISCRITTA dopo il bug reale trovato sul dispositivo (vedi
     * la nota gemella in harnessUiRealSession.test.ts): `startRealSessionFromMessage`
     * ora controlla `/api/v1/projects` PRIMA di disegnare qualunque bolla —
     * niente più eco ottimistico prima di sapere se esiste una cartella
     * unica da usare (il vecchio corpo `{messaggio}` non è più un
     * contratto valido lato server). La bolla appare dopo quel giro,
     * dentro `startCustomSession`.
     */
    it('CODE-COMPOSER-REAL-SEND-01 accepts the shared Vue composer and starts a real session', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/api/v1/projects')) {
                return new Response(JSON.stringify({ ok: true, data: { items: [{ id: 'p1', nome: 'talos' }] } }), { status: 200 })
            }
            throw new Error('rete finta: nessuna risposta in questo test')
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { submitPrompt?(text: string): boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.submitPrompt?.('Prompt from the real composer')).toBe(true)
        await new Promise((r) => setTimeout(r, 0)) // startRealSessionFromMessage non è awaitable dall'esterno via submitPrompt: prima il GET /api/v1/projects...
        await new Promise((r) => setTimeout(r, 0)) // ...poi il POST /api/v1/sessions/custom che disegna la bolla.

        const userMessages = document.querySelectorAll('.user-message')
        expect(userMessages.item(userMessages.length - 1).textContent)
            .toContain('Prompt from the real composer')
        // corpo verificato campo per campo: `modello` può comparire o no a seconda dello stato del picker in questo mount, non è materia di questa prova.
        const chiamataCustom = fetchMock.mock.calls.find((c) => c[0] === '/api/v1/sessions/custom')
        expect(chiamataCustom).toBeDefined()
        const init = (chiamataCustom?.[1] ?? {}) as RequestInit
        expect(init).toMatchObject({ method: 'POST' })
        expect(JSON.parse(String(init.body))).toMatchObject({ cartellaId: 'p1', consegna: 'Prompt from the real composer', client: 'desktop', permessi: 'Workspace write' })
    })

    /*
     * ⛔ 28/8, riscritto dopo la cura "la sessione non parte quando scrivo
     * dal composer" (owner) — submitPrompt() ora controlla QUANTE
     * cartelle sono configurate (GET /api/v1/projects) prima di rifiutare:
     * con zero (o un fetch che fallisce, come qui: fetchMock senza
     * implementazione) resta il rifiuto onesto di sempre, ma il controllo
     * è ASINCRONO — serve un giro di eventi prima che il toast compaia.
     * `fetchMock` viene chiamato ora (non più mai): è il comportamento
     * NUOVO e corretto, non una regressione. Gemella AL CONTRARIO del test
     * sopra: zero cartelle invece di una sola, rifiuto onesto invece di
     * un avvio vero — stessa funzione (startRealSessionFromMessage),
     * l'altro ramo.
     */
    it('CODE-COMPOSER-DEMO-SEND-01 without any active session, refuses honestly instead of faking a reply — no demo conversation is preloaded any more', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { submitPrompt?(text: string): boolean }
        }).__talosHarnessUiRuntime
        const before = document.querySelectorAll('.user-message').length

        expect(runtime?.submitPrompt?.('Prompt from the real composer')).toBe(true)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.querySelectorAll('.user-message').length).toBe(before) // mai un messaggio finto aggiunto
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Nessuna sessione avviata')
        expect(fetchMock).toHaveBeenCalled() // ⭐ controlla se esiste una sola cartella prima di rifiutare
    })

    it('CODE-COMPOSER-DEMO-SEND-01 "!"/"!!" switch to the terminal view and, without an active real session, refuse honestly instead of faking success', () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { submitPrompt?(text: string): boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.submitPrompt?.('!! pwd')).toBe(true)
        expect(document.querySelector('[data-view="terminal"]')?.classList.contains('active')).toBe(true)
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Nessuna sessione reale attiva')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('CODE-COMPOSER-QUEUE-HONEST-01 — FASE D (28/8): with a real session active, the composer now queues the follow-up for real (POST .../queue) instead of refusing it', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { ok: true, posizione: 1 } }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: {
                submitPrompt?(text: string): boolean
                realSessionState?: { id: string | null; codaMessaggi?: string[] }
            }
        }).__talosHarnessUiRuntime
        expect(runtime?.realSessionState).toBeTruthy()
        // ⛔ stesso oggetto di state.realSession (assegnazione diretta, non una copia) — impostarlo qui muove lo stato reale del modulo.
        runtime!.realSessionState!.id = 'sess-fake-for-test'

        const before = document.querySelectorAll('#conversation .user-message').length
        expect(runtime?.submitPrompt?.('follow-up mentre gira una sessione reale')).toBe(true)
        await new Promise((resolve) => setTimeout(resolve, 0))
        const after = document.querySelectorAll('#conversation .user-message').length

        // ⛔ 28/8 — onestà del NUOVO comportamento: il messaggio è solo IN CODA, non
        // ancora visto dal modello — nessun bubble ottimistico finché il kernel
        // non lo consegna davvero (evento QueuedMessageDelivered, vedi
        // harnessUiRealSession.test.ts per il filo intero).
        expect(after).toBe(before)
        expect(document.querySelector('#queuedMessage')?.classList.contains('show')).toBe(true) // il banner "Follow-up in coda" ORA mostra dati veri
        expect(document.querySelector('#queuedMessageText')?.textContent).toContain('follow-up mentre gira')
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Messaggio in coda')
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/sessions/sess-fake-for-test/queue'), expect.objectContaining({ method: 'POST' }))
    })

    it('HARNESS-BOARD-MOBILE-HONESTY-01 never calls a local backend from the embedded mobile demo', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()

        document.querySelector<HTMLElement>('[data-mode="dashboard"]')?.click()
        await Promise.resolve()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(document.querySelector('[data-connection-state]')?.textContent).toBe('Demo UI · non collegato')
        expect(document.querySelector('#campaignReadMeta')?.textContent).toContain('backend mobile')
    })

    /**
     * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 — la
     * Board mobile è la STESSA superficie che §3.1 punto 4 del piano
     * promette raggiungibile col tunnel, senza nuovo codice — tranne
     * questo cancello, trovato solo verificando dal vivo. Col tunnel
     * attivo la Board fa la stessa richiesta reale del desktop.
     */
    it('HARNESS-BOARD-MOBILE-HONESTY-02 col tunnel attivo (window.__talosHarnessApiBase) la Board chiama il backend vero', async () => {
        document.documentElement.classList.add('talos-embedded')
        ;(window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase = 'http://localhost:4174'
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()

        document.querySelector<HTMLElement>('[data-mode="dashboard"]')?.click()
        await Promise.resolve()
        await Promise.resolve()

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:4174/api/v1/campaigns', expect.anything())
    })

    it('HARNESS-ALL-CONTROLS-01 leaves no decorative or inert element exposed as an enabled button', () => {
        mountStaticRuntime()
        const handled = [
            '[type="submit"]', '[data-close-panel]', '[data-open-view]', '[data-open-panel]',
            '[data-open-sheet]', '[data-mode]', '[data-mobile-view]', '[data-message-action]',
            '[data-copy-message]', '[data-collapse-target]', '[data-tool-detail]', '[data-browser-action]',
            '[data-automation-action]', '[data-review-action]', '[data-review-file]', '[data-session-action]',
            '[data-control-action]', '[data-command]', '[data-approve]', '[data-allow-session]', '[data-deny]',
            '[data-action]', '[data-demo-action]', '[data-file-entry]', '[role="tab"]', '.session-item',
            '#overlayBackdrop', '#newSessionBtn', '#sessionsCollapseBtn', '#sessionTitleButton',
            '#runStateToggle', '.stop-run', '#commandPaletteBtn', '#capabilityBtn', '#manageCapabilitiesBtn',
            '#resumeSessionBtn', '#compactSessionBtn',
            '#closeSheet', '#closeCommand', '#cancelQueued', '.composer-mic', '#queueToggle',
            '#approveAllDiffs', '#harnessDialogBackdrop',
        ].join(',')
        const inert = [...document.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
            .filter((button) => !button.matches(handled))
            .map((button) => button.textContent?.trim().replace(/\s+/g, ' ') || button.getAttribute('aria-label'))

        expect(inert).toEqual([])
    })
})
