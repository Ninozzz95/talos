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
        window.localStorage.clear()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
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

    it('CODE-PROVIDERS-UI-01 mostra card richiudibili e salva/rimuove senza lasciare la chiave nel browser', async () => {
        let openAiConfigured = false
        const rows = [
            ['openai', 'OpenAI', true, 'https://api.openai.com/v1'],
            ['deepseek', 'DeepSeek', true, 'https://api.deepseek.com'],
            ['anthropic', 'Anthropic', true, 'https://api.anthropic.com/v1'],
            ['gemini', 'Gemini', true, 'https://generativelanguage.googleapis.com/v1beta'],
            ['openrouter', 'OpenRouter', true, 'https://openrouter.ai/api/v1'],
            ['ollama', 'Ollama', false, 'http://127.0.0.1:11434'],
            ['huggingface', 'Hugging Face', false, null],
        ].map(([id, label, requiresKey, endpoint]) => ({
            id, label, requiresKey, keyConfigured: id === 'openai' ? openAiConfigured : false,
            supportsEndpoint: !['anthropic', 'gemini', 'huggingface'].includes(id as string), endpoint, endpointConfigured: false, timeoutSeconds: 60,
            execution: id === 'openrouter' ? 'collegato' : 'in preparazione',
        }))
        const response = (data: unknown) => ({ ok: true, json: async () => ({ ok: true, data }) })
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = String(input)
            if (path.endsWith('/api/v1/providers')) { rows[0].keyConfigured = openAiConfigured; return response({ items: rows }) }
            if (path.includes('/api/v1/providers/openai/key/remove')) { openAiConfigured = false; return response({ provider: 'openai', keyConfigured: false }) }
            if (path.includes('/api/v1/providers/openai/key')) { openAiConfigured = true; return response({ provider: 'openai', keyConfigured: true }) }
            if (path.includes('/api/v1/model-lab/capacity')) return response({ memory: {}, storage: {} })
            if (path.endsWith('/api/v1/runtime') || path.endsWith('/api/v1/local-models')) return response({ items: [] })
            return response({ items: [] })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()

        document.querySelector<HTMLButtonElement>('[data-settings-tab="models"]')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.querySelectorAll('[data-provider-id]')).toHaveLength(7)
        expect([...document.querySelectorAll<HTMLElement>('[data-provider-detail]')].every((detail) => detail.hidden)).toBe(true)

        const card = document.querySelector<HTMLElement>('[data-provider-id="openai"]')!
        card.querySelector<HTMLButtonElement>('[data-provider-toggle]')!.click()
        expect(card.querySelector<HTMLElement>('[data-provider-detail]')!.hidden).toBe(false)
        const input = card.querySelector<HTMLInputElement>('[data-provider-key]')!
        input.value = 'sk-ui-secret-never-stored'
        card.querySelector<HTMLButtonElement>('[data-provider-action="save-key"]')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(input.value).toBe('')
        expect(window.localStorage.getItem('sk-ui-secret-never-stored')).toBeNull()
        expect(document.body.textContent).not.toContain('sk-ui-secret-never-stored')
        expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes('/providers/openai/key') && (options as RequestInit)?.method === 'POST')).toBe(true)
        expect(card.querySelector<HTMLElement>('[data-provider-action="remove-key"]')!.hidden).toBe(false)

        card.querySelector<HTMLButtonElement>('[data-provider-action="remove-key"]')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(card.querySelector<HTMLElement>('[data-provider-action="remove-key"]')!.hidden).toBe(true)
    })

    it('CODE-PROVIDERS-UI-02 non mette endpoint per Hugging Face e mantiene il tempo massimo separato dalla chiave', async () => {
        const rows = ['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama', 'huggingface'].map((id) => ({
            id, label: id, requiresKey: id !== 'ollama' && id !== 'huggingface', keyConfigured: false,
            supportsEndpoint: !['anthropic', 'gemini', 'huggingface'].includes(id), endpoint: id === 'huggingface' ? null : 'https://example.test', endpointConfigured: false, timeoutSeconds: 60, execution: 'in preparazione',
        }))
        const response = (data: unknown) => ({ ok: true, json: async () => ({ ok: true, data }) })
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input)
            if (path.endsWith('/api/v1/providers')) return response({ items: rows })
            if (path.endsWith('/api/v1/model-lab/capacity')) return response({ memory: {}, storage: {} })
            if (path.endsWith('/api/v1/runtime') || path.endsWith('/api/v1/local-models')) return response({ items: [] })
            return response({ items: [] })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-settings-tab="models"]')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        const hf = document.querySelector<HTMLElement>('[data-provider-id="huggingface"]')!
        hf.querySelector<HTMLButtonElement>('[data-provider-toggle]')!.click()
        expect(hf.querySelector<HTMLElement>('[data-provider-endpoint-block]')).toBeNull()
        const ollama = document.querySelector<HTMLElement>('[data-provider-id="ollama"]')!
        ollama.querySelector<HTMLButtonElement>('[data-provider-toggle]')!.click()
        expect(ollama.querySelector<HTMLInputElement>('[data-provider-timeout]')?.value).toBe('60')
        const anthropic = document.querySelector<HTMLElement>('[data-provider-id="anthropic"]')!
        anthropic.querySelector<HTMLButtonElement>('[data-provider-toggle]')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(anthropic.querySelector<HTMLElement>('[data-provider-endpoint]')?.closest('label')?.hidden).toBe(true)
        expect(anthropic.querySelector<HTMLInputElement>('[data-provider-timeout]')?.value).toBe('60')
        expect(anthropic.querySelector<HTMLElement>('.provider-help')?.textContent).toBe('La chiave resta nel portachiavi del computer.')
        const gemini = document.querySelector<HTMLElement>('[data-provider-id="gemini"]')!
        gemini.querySelector<HTMLButtonElement>('[data-provider-toggle]')!.click()
        expect(gemini.querySelector<HTMLElement>('.provider-help')?.textContent).toBe('La chiave resta nel portachiavi del computer.')
    })

    it('CODE-PROVIDERS-UI-03 closed provider details stay out of layout and expanded card gets the full grid', () => {
        const css = asset('styles.css')
        expect(css).toMatch(/\.provider-card-detail\[hidden\]\s*\{[^}]*display:\s*none/s)
        expect(css).toMatch(/\.provider-card\s+\.provider-field\[hidden\]\s*\{[^}]*display:\s*none/s)
        expect(css).toMatch(/\.provider-card\.is-expanded\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-settings-tab="models"]')!.click()
        const card = document.querySelector<HTMLElement>('[data-provider-id="openai"]')!
        expect(card.querySelector<HTMLElement>('[data-provider-detail]')?.hidden).toBe(true)
        card.querySelector<HTMLButtonElement>('[data-provider-toggle]')!.click()
        expect(card.classList.contains('is-expanded')).toBe(true)
    })

    it('HARNESS-EMBEDDED-HEIGHT-01 sizes the embedded app and workspace from their real host', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.app-shell\s*\{[^}]*height:\s*100%/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.workspace-shell\s*\{[^}]*height:\s*100%/s)
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

    it('CODE-SETTINGS-CATEGORIES-01 organizza tutte le categorie in un list-detail con un solo pannello attivo', () => {
        mountStaticRuntime()

        const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')]
        expect(tabs.map((tab) => tab.dataset.settingsTab)).toEqual([
            'appearance', 'chat', 'models', 'providers', 'tools', 'privacy', 'workspace', 'account',
        ])
        expect(tabs.every((tab) => tab.getAttribute('role') === 'tab')).toBe(true)
        expect(document.querySelectorAll('[data-settings-panel]:not([hidden])')).toHaveLength(1)
        expect(document.querySelector('[data-settings-panel="appearance"]')?.classList.contains('active')).toBe(true)

        tabs.find((tab) => tab.dataset.settingsTab === 'models')!.click()
        expect(document.querySelector('[data-settings-tab="models"]')?.getAttribute('aria-selected')).toBe('true')
        expect(document.querySelectorAll('[data-settings-panel]:not([hidden])')).toHaveLength(1)
        expect(document.querySelector('[data-settings-panel="models"]')?.classList.contains('active')).toBe(true)
        expect(document.querySelector('[data-settings-panel="appearance"]')?.hasAttribute('hidden')).toBe(true)
    })

    it('CODE-SETTINGS-CATEGORIES-02 persiste la categoria e offre la barra compatta scorrevole', () => {
        const css = asset('styles.css')
        expect(css).toMatch(/\.settings-category-nav\s*\{[^}]*display:\s*grid/s)
        expect(css).toMatch(/@media\s*\(max-width:\s*780px\)[\s\S]*\.settings-category-nav\s*\{[^}]*overflow-x:\s*auto/s)
        expect(css).toMatch(/\.view-pane\[data-view="settings"\]\s*>\s*\.generic-shell\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s)
        expect(css).toMatch(/\.settings-detail-panels\s*\{[^}]*container-type:\s*inline-size/s)
        expect(css).toMatch(/@container\s+settings-detail\s*\(max-width:\s*540px\)[\s\S]*grid-template-columns:\s*1fr/s)

        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-settings-tab="privacy"]')!.click()
        expect(window.localStorage.getItem('talos.harness.desktop.settings.section.v1')).toBe('privacy')
    })

    it('CODE-SETTINGS-APPEARANCE-HYDRATE-01 hydrates local appearance preferences and applies separate scales', () => {
        window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
            version: 1,
            appearance: { uiFontScale: 'large', chatFontScale: 'expanded', reducedMotion: true },
            apiKey: 'must-not-survive',
        }))

        mountStaticRuntime()

        const host = document.documentElement
        expect(host.style.getPropertyValue('--talos-ui-font-scale')).toBe('1.15')
        expect(host.style.getPropertyValue('--talos-chat-font-size')).toBe('1.1875rem')
        expect(document.body.classList.contains('reduce-motion')).toBe(true)
        expect(document.querySelector<HTMLSelectElement>('#uiFontScaleSelect')?.value).toBe('large')
        expect(document.querySelector<HTMLSelectElement>('#chatFontScaleSelect')?.value).toBe('expanded')
        expect(document.querySelector<HTMLInputElement>('#reducedMotionToggle')?.checked).toBe(true)
    })

    it('CODE-SETTINGS-APPEARANCE-PERSIST-01 persists changes in the existing versioned document', () => {
        mountStaticRuntime()

        const ui = document.querySelector<HTMLSelectElement>('#uiFontScaleSelect')!
        const chat = document.querySelector<HTMLSelectElement>('#chatFontScaleSelect')!
        const motion = document.querySelector<HTMLInputElement>('#reducedMotionToggle')!
        ui.value = 'xlarge'
        ui.dispatchEvent(new Event('change', { bubbles: true }))
        chat.value = 'compact'
        chat.dispatchEvent(new Event('change', { bubbles: true }))
        motion.checked = true
        motion.dispatchEvent(new Event('change', { bubbles: true }))

        const stored = JSON.parse(window.localStorage.getItem('talos.harness.desktop.settings.v1') || '{}')
        expect(stored.appearance).toEqual({ uiFontScale: 'xlarge', chatFontScale: 'compact', reducedMotion: true })
        expect(stored.apiKey).toBeUndefined()
    })

    it('CODE-SETTINGS-APPEARANCE-FAIL-CLOSED-01 ignores malformed values and secret-like keys', () => {
        window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
            version: 999,
            appearance: { uiFontScale: 'huge', chatFontScale: {}, reducedMotion: 'yes', token: 'secret' },
            workspaces: { 'project:p1': { expandedPaths: ['src'], filter: 'composer', apiKey: 'secret' } },
        }))

        mountStaticRuntime()

        expect(document.querySelector<HTMLSelectElement>('#uiFontScaleSelect')?.value).toBe('default')
        expect(document.querySelector<HTMLSelectElement>('#chatFontScaleSelect')?.value).toBe('xcompact')
        expect(document.querySelector<HTMLInputElement>('#reducedMotionToggle')?.checked).toBe(false)
        document.querySelector<HTMLSelectElement>('#uiFontScaleSelect')!.value = 'small'
        document.querySelector<HTMLSelectElement>('#uiFontScaleSelect')!.dispatchEvent(new Event('change', { bubbles: true }))
        const stored = JSON.parse(window.localStorage.getItem('talos.harness.desktop.settings.v1') || '{}')
        expect(stored.apiKey).toBeUndefined()
        expect(stored.appearance.token).toBeUndefined()
        expect(stored.workspaces['project:p1'].apiKey).toBeUndefined()
    })

    it('CODE-SETTINGS-APPEARANCE-COMPLETE-01 exposes every mobile Appearance control in desktop language', () => {
        mountStaticRuntime()

        const required = [
            'themePresetSelect', 'colorModeSelect', 'sceneOverrideSelect',
            'backgroundMotionToggle', 'interfaceMotionToggle', 'motionModeSelect',
            'motionQualitySelect', 'motionSpeedRange', 'motionIntensityRange',
            'motionGlowRange', 'motionDensityRange', 'motionDepthRange',
            'motionTrailsRange', 'motionContrastRange', 'motionParallaxRange',
            'pauseWhenHiddenToggle', 'respectDataSaverToggle', 'motionProfileSelect',
            'motionEasingSelect', 'motionDurationRange', 'motionUiIntensityRange',
            'motionStaggerRange', 'motionWindowsToggle', 'motionSurfacesToggle',
            'motionNavigationToggle', 'motionComposerToggle', 'motionMessagesToggle',
            'motionFeedbackToggle', 'composerShapeSelect', 'composerPlusSelect',
            'messageStyleSelect', 'streamingAnimationSelect', 'windowPresentationSelect',
            'immersiveHeaderToggle', 'resetMotionButton',
        ]

        for (const id of required) expect(document.getElementById(id), id).toBeTruthy()
    })

    it('CODE-SETTINGS-THEME-REAL-01 applies the selected theme and color mode to the host', () => {
        mountStaticRuntime()

        const theme = document.querySelector<HTMLSelectElement>('#themePresetSelect')!
        const mode = document.querySelector<HTMLSelectElement>('#colorModeSelect')!
        theme.value = 'terminal'
        theme.dispatchEvent(new Event('change', { bubbles: true }))
        mode.value = 'light'
        mode.dispatchEvent(new Event('change', { bubbles: true }))

        expect(document.documentElement.dataset.talosTheme).toBe('terminal')
        expect(document.documentElement.dataset.talosColorMode).toBe('light')
        const stored = JSON.parse(window.localStorage.getItem('talos.harness.desktop.settings.v1') || '{}')
        expect(stored.appearance.themePreset).toBe('terminal')
        expect(stored.appearance.colorMode).toBe('light')
    })

    it('CODE-SETTINGS-MOTION-REAL-01 applies scene, motion flags and numeric tokens', () => {
        mountStaticRuntime()

        const scene = document.querySelector<HTMLSelectElement>('#sceneOverrideSelect')!
        const speed = document.querySelector<HTMLInputElement>('#motionSpeedRange')!
        const background = document.querySelector<HTMLInputElement>('#backgroundMotionToggle')!
        scene.value = 'aurora'
        scene.dispatchEvent(new Event('change', { bubbles: true }))
        speed.value = '150'
        speed.dispatchEvent(new Event('input', { bubbles: true }))
        background.checked = false
        background.dispatchEvent(new Event('change', { bubbles: true }))

        expect(document.documentElement.dataset.talosScene).toBe('aurora')
        expect(document.body.classList.contains('background-motion-off')).toBe(true)
        expect(document.documentElement.style.getPropertyValue('--talos-motion-speed')).toBe('1.5')
    })

    it('CODE-SETTINGS-MOTION-VISIBILITY-01 pauses the renderer contract while hidden', () => {
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { backgroundAnimationRunning?: boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.backgroundAnimationRunning).toBe(true)
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
        expect(runtime?.backgroundAnimationRunning).toBe(false)
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
        expect(runtime?.backgroundAnimationRunning).toBe(true)
    })

    it('CODE-SETTINGS-MOTION-STATIC-01 keeps the scene still without scheduling frames', () => {
        mountStaticRuntime()
        const mode = document.querySelector<HTMLSelectElement>('#motionModeSelect')!
        mode.value = 'static'
        mode.dispatchEvent(new Event('change', { bubbles: true }))

        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { backgroundAnimationRunning?: boolean }
        }).__talosHarnessUiRuntime
        expect(runtime?.backgroundAnimationRunning).toBe(false)
        expect(document.body.classList.contains('background-motion-off')).toBe(false)
    })

    it('CODE-SETTINGS-MOTION-RESET-01 restores only Motion defaults', () => {
        mountStaticRuntime()
        const scene = document.querySelector<HTMLSelectElement>('#sceneOverrideSelect')!
        const reset = document.querySelector<HTMLButtonElement>('#resetMotionButton')!
        scene.value = 'aurora'
        scene.dispatchEvent(new Event('change', { bubbles: true }))
        reset.click()

        expect(scene.value).toBe('follow-theme')
        const stored = JSON.parse(window.localStorage.getItem('talos.harness.desktop.settings.v1') || '{}')
        expect(stored.appearance.sceneOverride ?? 'follow-theme').toBe('follow-theme')
        expect(stored.appearance.uiFontScale ?? 'default').toBe('default')
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

    /*
     * ⭐⭐⭐ 29/8 — FASE H, piano `elegant-spinning-dongarra.md`. Push-to-talk
     * vero è arrivato (Web Speech API, SpeechRecognition) — ma jsdom non la
     * implementa affatto (zero polyfill in questo progetto, verificato
     * prima di scrivere): `window.SpeechRecognition` è undefined qui,
     * esattamente come in un browser che non la supporta davvero. Il test
     * resta lo stesso in SPIRITO (mai un bottone che finge di registrare),
     * aggiornato al messaggio onesto VERO per questo caso — "non
     * disponibile", non più "demo non collegata".
     */
    it('HARNESS-MIC-HONEST-01 answers the microphone control without pretending to record when SpeechRecognition is unavailable', () => {
        mountStaticRuntime()
        const microphone = document.querySelector<HTMLButtonElement>('.composer-mic')

        microphone?.click()

        expect(microphone?.getAttribute('aria-pressed')).not.toBe('true')
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Voce non disponibile')
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

    /*
     * ⛔ 28/8, riscritto dopo la cura "la sessione non parte quando scrivo
     * dal composer" (owner) — submitPrompt() ora controlla QUANTE
     * cartelle sono configurate (GET /api/v1/projects) prima di rifiutare:
     * con zero (o un fetch che fallisce, come qui: fetchMock senza
     * implementazione) resta il rifiuto onesto di sempre, ma il controllo
     * è ASINCRONO — serve un giro di eventi prima che il toast compaia.
     * `fetchMock` viene chiamato ora (non più mai): è il comportamento
     * NUOVO e corretto, non una regressione.
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
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Nessuna sessione attiva')
        expect(fetchMock).toHaveBeenCalled() // ⭐ NUOVO: controlla se esiste una sola cartella prima di rifiutare
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

        // ⛔ 30/8 — riscritta dopo la rimozione della vista campagne TALOS-BANCO
        // (piano "Board — da campagne TALOS-BANCO a cruscotto sessioni"): il
        // widget dedicato [data-connection-state]/#campaignReadMeta è sparito
        // insieme al resto della UI campagne — l'onestà "demo, non collegato"
        // ora vive in #boardEyebrow/#boardDescription e nella lista stessa.
        expect(fetchMock).not.toHaveBeenCalled()
        expect(document.querySelector('#boardEyebrow')?.textContent).toContain('Demo UI')
        expect(document.querySelector('#boardDescription')?.textContent).toContain('non ha un backend')
        expect(document.querySelector('#sessionsBoardList')?.textContent).toContain('Nessun dato mobile collegato')
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

        // ⛔ 30/8 — /api/v1/campaigns rimossa insieme a TALOS-BANCO; la Board
        // ora legge le sessioni reali di Harness Desktop stesso.
        expect(fetchMock).toHaveBeenCalledWith('http://localhost:4174/api/v1/sessions', expect.anything())
    })

    it('HARNESS-ALL-CONTROLS-01 leaves no decorative or inert element exposed as an enabled button', () => {
        mountStaticRuntime()
        const handled = [
            '[type="submit"]', '[data-close-panel]', '[data-open-view]', '[data-open-panel]',
            '[data-open-sheet]', '[data-mode]', '[data-mobile-view]', '[data-message-action]',
            '[data-copy-message]', '[data-collapse-target]', '[data-tool-detail]', '[data-browser-action]',
            '[data-automation-action]', '[data-review-action]', '[data-review-file]', '[data-session-action]',
            '[data-control-action]', '[data-command]', '[data-approve]', '[data-allow-session]', '[data-deny]',
            '[data-action]', '[data-demo-action]', '[data-file-entry]', '[data-settings-go]', '[role="tab"]', '.session-item',
            '#overlayBackdrop', '#newSessionBtn', '#sessionsCollapseBtn', '#sessionTitleButton',
            '#runStateToggle', '.stop-run', '#commandPaletteBtn', '#capabilityBtn', '#manageCapabilitiesBtn',
            '#resumeSessionBtn', '#compactSessionBtn',
            '#closeSheet', '#closeCommand', '#cancelQueued', '.composer-mic', '#queueToggle',
            '#approveAllDiffs', '#harnessDialogBackdrop',
            '#modelLabRefreshButton',
            '#modelLabRuntimeRefresh', '#modelLabCancelButton',
            '#modelLabHfSearchButton',
            '[data-provider-toggle]', '[data-provider-action]',
        ].join(',')
        const inert = [...document.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
            .filter((button) => !button.matches(handled))
            .map((button) => button.textContent?.trim().replace(/\s+/g, ' ') || button.getAttribute('aria-label'))

        expect(inert).toEqual([])
    })

    it('CODE-MODEL-LAB-SHELL-01 exposes the complete preparatory desktop model lab shell', () => {
        mountStaticRuntime()

        const requiredTabs = ['overview', 'providers', 'catalog', 'installed', 'huggingface', 'downloads']
        for (const section of requiredTabs) {
            expect(document.querySelector(`[data-model-lab-tab="${section}"]`), section).toBeTruthy()
            expect(document.querySelector(`[data-model-lab-panel="${section}"]`), section).toBeTruthy()
        }
        expect(document.querySelectorAll('[data-model-lab-panel]')).toHaveLength(requiredTabs.length)
        expect(document.querySelectorAll('[data-disabled-reason]')).not.toHaveLength(0)
        expect(document.querySelector('#modelLabRuntimeBadge')?.textContent).toContain('non scelto')
    })

    it('CODE-MODEL-LAB-CAPACITY-01 renders measured machine capacity without exposing secrets', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/api/v1/model-lab/capacity')) {
                return new Response(JSON.stringify({ ok: true, data: {
                    schema: 'talos.model-lab.capacity/1', platform: 'win32', arch: 'x64', measuredAt: '2026-08-30T10:00:00.000Z',
                    memory: { totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3 },
                    storage: { totalBytes: 512 * 1024 ** 3, availableBytes: 128 * 1024 ** 3, allocatableBytes: 127 * 1024 ** 3 },
                    runtime: { status: 'unconfigured' },
                } }), { status: 200 })
            }
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: false } }), { status: 200 })
            if (url.endsWith('/api/v1/tasks')) return new Response(JSON.stringify({ ok: true, data: { items: [{ id: 'task-probe' }] } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()

        expect(document.querySelector('#machineCapacityStatus')?.textContent).toBe('Misurata')
        expect(document.querySelector('#machineMemoryMetric')?.textContent).toBe('16 GB')
        expect(document.querySelector('#machineFreeMemoryMetric')?.textContent).toBe('8 GB')
        expect(document.querySelector('#machineAllocatableMetric')?.textContent).toBe('127 GB')
        expect(document.querySelector('#modelLabProviderStatus')?.textContent).toContain('non configurato')
        const stored = window.localStorage.getItem('talos.harness.desktop.settings.v1') || ''
        expect(stored).not.toMatch(/apiKey|token|secret/i)
    })

    it('CODE-MODEL-LAB-CATALOG-01 loads, filters and selects the real catalog shape', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/api/v1/models')) return new Response(JSON.stringify({ ok: true, data: { modelli: [
                { id: 'openai/gpt-test', provider: 'openai', nome: 'GPT Test', contextLength: 128000, inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'], prezzoPrompt: '1', prezzoCompletion: '2', description: 'Test model' },
                { id: 'anthropic/claude-test', provider: 'anthropic', nome: 'Claude Test', contextLength: 200000, inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [], prezzoPrompt: '3', prezzoCompletion: '4', description: 'Second model' },
            ], daCache: false, aggiornatoAlle: '2026-08-30T10:00:00.000Z' } }), { status: 200 })
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: true } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        document.querySelector<HTMLButtonElement>('[data-model-lab-tab="catalog"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()

        expect(document.querySelector('#modelLabCatalogCount')?.textContent).toContain('2 di 2')
        expect(document.querySelectorAll('#modelLabCatalogList .model-lab-list-item')).toHaveLength(2)
        expect(document.querySelector('#modelLabModelDetail')?.textContent).toContain('GPT Test')

        const search = document.querySelector<HTMLInputElement>('#modelLabSearch')!
        search.value = 'claude'
        search.dispatchEvent(new Event('input', { bubbles: true }))
        expect(document.querySelectorAll('#modelLabCatalogList .model-lab-list-item')).toHaveLength(1)
        expect(document.querySelector('#modelLabCatalogList')?.textContent).toContain('Claude Test')
    })

    it('CODE-MODEL-LAB-CATALOG-ERROR-01 states upstream failure instead of showing an empty success', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/api/v1/models')) return new Response(JSON.stringify({ ok: false, error: { code: 'CATALOG_UNAVAILABLE', message: 'Catalogo non raggiungibile' } }), { status: 503 })
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: false } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        document.querySelector<HTMLButtonElement>('[data-model-lab-tab="catalog"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()

        expect(document.querySelector('#modelLabCatalogCount')?.textContent).toContain('non disponibile')
        expect(document.querySelector('#modelLabCatalogList')?.textContent).toContain('Catalogo non disponibile')
    })

    it('CODE-MODEL-LAB-RUNTIME-GATE-01 keeps runtime-dependent actions disabled with an explicit reason', () => {
        mountStaticRuntime()
        const gated = [...document.querySelectorAll<HTMLButtonElement>('[data-disabled-reason]')]
        expect(gated.length).toBeGreaterThanOrEqual(3)
        expect(gated.every((button) => button.disabled)).toBe(true)
        expect(gated.some((button) => button.dataset.disabledReason?.toLowerCase().includes('runtime'))).toBe(true)
    })

    it('CODE-MODEL-LAB-LAPTOP-01 compacts the lab before the persistent session sidebar makes it overflow', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/@media \(max-width:\s*1180px\)\s*\{[^}]*\.model-lab-ledger\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s)
    })

    it('CODE-MODEL-LAB-HF-DOWNLOAD-01 searches Hugging Face and starts a verified-set download', async () => {
        const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
            if (url.includes('/api/v1/huggingface/search')) return new Response(JSON.stringify({ ok: true, data: { items: [{ repo: 'org/model', revision: 'a'.repeat(40), downloads: 10, gated: false }] } }), { status: 200 })
            if (url.includes('/api/v1/huggingface/repo')) return new Response(JSON.stringify({ ok: true, data: { repo: 'org/model', revision: 'a'.repeat(40), license: 'apache-2.0', files: [{ path: 'model.gguf', sizeBytes: 4, sha256: 'b'.repeat(64) }] } }), { status: 200 })
            if (url.endsWith('/api/v1/huggingface/downloads')) return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
            if (url.endsWith('/api/v1/huggingface/download')) return new Response(JSON.stringify({ ok: true, data: { id: 'org-model', state: 'queued', progress: 0 } }), { status: 200 })
            if (url.endsWith('/api/v1/model-lab/capacity')) return new Response(JSON.stringify({ ok: true, data: { memory: {}, storage: {} } }), { status: 200 })
            if (url.endsWith('/api/v1/runtime')) return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: false } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        document.querySelector<HTMLButtonElement>('[data-model-lab-tab="huggingface"]')?.click()
        const input = document.querySelector<HTMLInputElement>('#modelLabHfSearch')!
        input.value = 'model'
        document.querySelector<HTMLButtonElement>('#modelLabHfSearchButton')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve()
        expect(document.querySelector('#modelLabHfResults')?.textContent).toContain('org/model')
        document.querySelector<HTMLButtonElement>('#modelLabHfResults .model-lab-list-item')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve()
        expect(document.querySelector('#modelLabHfDetail')?.textContent).toContain('Scarica')
    })

    it('CODE-MODEL-LAB-RUNTIME-STATUS-01 renders observed runtimes and enables only a real model choice', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/api/v1/runtime')) return new Response(JSON.stringify({ ok: true, data: { items: [
                { runtimeId: 'ollama', provider: 'ollama', state: 'observed', baseUrl: 'http://127.0.0.1:11434', observedAt: '2026-08-31T10:00:00.000Z', models: [
                    { id: 'qwen3:8b', name: 'qwen3:8b', source: 'ollama', context: { state: 'observed', value: 65536 }, verifiedContext: true },
                ] },
                { runtimeId: 'lmstudio', provider: 'lmstudio', state: 'unknown', baseUrl: 'http://127.0.0.1:1234', models: [] },
            ] } }), { status: 200 })
            if (url.endsWith('/api/v1/model-lab/capacity')) return new Response(JSON.stringify({ ok: true, data: { measuredAt: '2026-08-31T10:00:00.000Z', memory: {}, storage: {} } }), { status: 200 })
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: false } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()

        expect(document.querySelector('#modelLabRuntimeStatus')?.textContent).toContain('1 runtime pronto')
        expect(document.querySelector('#modelLabRuntimeList')?.textContent).toContain('ollama')
        expect(document.querySelector('#modelLabRuntimeList')?.textContent).toContain('qwen3:8b')
        expect(document.querySelector('#modelLabRuntimeList')?.textContent).toContain('non raggiunto')
        expect(document.querySelector<HTMLButtonElement>('#modelLabRunButton')?.disabled).toBe(false)
        expect(document.querySelector<HTMLSelectElement>('#modelLabRuntimeSelect')?.value).toBe('ollama')
        expect(document.querySelector<HTMLSelectElement>('#modelLabModelSelect')?.value).toBe('qwen3:8b')
    })

    it('CODE-MODEL-LAB-INSTALLED-01 renders local manifests without leaking absolute paths or secrets', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/api/v1/local-models')) return new Response(JSON.stringify({ ok: true, data: { items: [{
                id: 'qwen3', repo: 'Qwen/Qwen3-GGUF', revision: 'a'.repeat(40), bytes: 123456, sha256: 'b'.repeat(64), license: 'Apache-2.0', path: 'qwen3/model.gguf', state: 'ready', updatedAt: '2026-08-31T10:00:00.000Z', files: [],
            }] } }), { status: 200 })
            if (url.endsWith('/api/v1/runtime')) return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
            if (url.endsWith('/api/v1/model-lab/capacity')) return new Response(JSON.stringify({ ok: true, data: { measuredAt: '2026-08-31T10:00:00.000Z', memory: {}, storage: {} } }), { status: 200 })
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: false } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        document.querySelector<HTMLButtonElement>('[data-model-lab-tab="installed"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()

        expect(document.querySelector('#modelLabInstalledList')?.textContent).toContain('qwen3')
        expect(document.querySelector('#modelLabInstalledList')?.textContent).toContain('Apache-2.0')
        expect(document.querySelector('#modelLabInstalledList')?.textContent).toContain('bbbbbbbbbbbb')
        expect(document.querySelector('#modelLabInstalledList')?.textContent).not.toContain('C:\\')
        expect(document.querySelector('#modelLabInstalledList')?.textContent).not.toMatch(/token|api[_-]?key|secret/i)
    })

    it('CODE-MODEL-LAB-GATED-01 keeps runtime test disabled when no adapter is ready', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/api/v1/runtime')) return new Response(JSON.stringify({ ok: true, data: { items: [{ runtimeId: 'ollama', state: 'unknown', models: [] }] } }), { status: 200 })
            if (url.endsWith('/api/v1/model-lab/capacity')) return new Response(JSON.stringify({ ok: true, data: { measuredAt: '2026-08-31T10:00:00.000Z', memory: {}, storage: {} } }), { status: 200 })
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: false } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()

        expect(document.querySelector<HTMLButtonElement>('#modelLabRunButton')?.disabled).toBe(true)
        expect(document.querySelector('#modelLabRuntimeStatus')?.textContent).toContain('Nessun runtime pronto')
        expect(document.querySelector('#modelLabRuntimeGate')?.textContent).toContain('non disponibile')
    })

    it('CODE-MODEL-LAB-STREAM-01 keeps text, reasoning, tool call and error in separate blocks', async () => {
        class FakeEventSource {
            static OPEN = 1
            static CLOSED = 2
            readyState = 1
            onmessage: ((event: MessageEvent) => void) | null = null
            onerror: (() => void) | null = null
            close = vi.fn(() => { this.readyState = FakeEventSource.CLOSED })
            constructor(public readonly url: string) { void url }
            emit(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent) }
        }
        const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
            if (url.endsWith('/api/v1/runtime')) return new Response(JSON.stringify({ ok: true, data: { items: [{ runtimeId: 'ollama', state: 'observed', models: [{ id: 'qwen3:8b', name: 'qwen3:8b', source: 'ollama', context: { state: 'observed', value: 65536 } }] }] } }), { status: 200 })
            if (url.endsWith('/api/v1/model-lab/capacity')) return new Response(JSON.stringify({ ok: true, data: { measuredAt: '2026-08-31T10:00:00.000Z', memory: {}, storage: {} } }), { status: 200 })
            if (url.endsWith('/api/v1/doctor')) return new Response(JSON.stringify({ ok: true, data: { chiaveApi: false } }), { status: 200 })
            if (url.endsWith('/api/v1/tasks')) return new Response(JSON.stringify({ ok: true, data: { items: [{ id: 'task-probe' }] } }), { status: 200 })
            if (url.endsWith('/api/v1/sessions') && options?.method === 'POST') return new Response(JSON.stringify({ ok: true, data: { sessionId: 'local-1' } }), { status: 200 })
            return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('EventSource', FakeEventSource)
        mountStaticRuntime()
        document.querySelector<HTMLButtonElement>('[data-open-view="settings"]')?.click()
        await new Promise((resolve) => setTimeout(resolve, 40))
        expect(document.querySelector<HTMLButtonElement>('#modelLabRunButton')?.disabled).toBe(false)
        document.querySelector<HTMLButtonElement>('#modelLabRunButton')?.click()
        await new Promise((resolve) => setTimeout(resolve, 40))
        const source = [...([] as FakeEventSource[])][0]
        // The implementation exposes the active source on the test seam to avoid using chat state.
        const active = (window as unknown as { __talosHarnessModelLabEventSource?: FakeEventSource }).__talosHarnessModelLabEventSource
        expect(active).toBeTruthy()
        active?.emit({ type: 'TextMessageContent', delta: 'risposta' })
        active?.emit({ type: 'ReasoningMessageContent', delta: 'interno' })
        active?.emit({ type: 'ToolCallStart', toolCallId: 'tool-1', toolCallName: 'leggi' })
        active?.emit({ type: 'ToolCallArgs', toolCallId: 'tool-1', delta: '{"path":"README.md"}' })
        active?.emit({ type: 'RunError', code: 'LOCAL_RUNTIME_FAILED', message: 'runtime fermato' })

        expect(document.querySelector('[data-model-lab-stream-block="text"]')?.textContent).toContain('risposta')
        expect(document.querySelector('[data-model-lab-stream-block="reasoning"]')?.textContent).toContain('interno')
        expect(document.querySelector('[data-model-lab-stream-block="tool"]')?.textContent).toContain('leggi')
        expect(document.querySelector('[data-model-lab-stream-block="error"]')?.textContent).toContain('runtime fermato')
        expect(document.querySelector('[data-model-lab-stream-block="text"]')?.textContent).not.toContain('interno')
        expect(document.querySelector('[data-model-lab-stream-block="text"]')?.textContent).not.toContain('README.md')
        expect(source).toBeUndefined()
    })

    it('CODE-MODEL-LAB-NO-SECRET-02 keeps provider credentials out of the shipped bundle', () => {
        const js = asset('app.js')
        expect(js).not.toMatch(/OPENROUTER_API_KEY|Authorization\s*:/i)
        expect(js).not.toMatch(/(?:api[_-]?key|secret)\s*[:=]\s*['"][^'"]+['"]/i)
    })
})
