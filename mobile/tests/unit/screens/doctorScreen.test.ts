// @vitest-environment jsdom

/**
 * The Doctor had no unit test at all — only an end-to-end pass. Which is how
 * the screen kept its own `data-doctor-tab` hook, its own hand-drawn segmented
 * row and its own section list long after every other screen had been folded
 * into one: nothing on this side of the build ever looked at it.
 *
 * These do not try to cover the probes. They cover the part this migration
 * touched: the strip comes from the register, and the section you left is where
 * the screen opens next time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const harness = vi.hoisted(() => ({
    settings: {
        state: { shell: { debug_diagnostics: false } },
        setShell: vi.fn().mockResolvedValue(undefined),
    },
    controller: {
        /*
         * ⛔ `activeSession` MANCAVA, e non era un dettaglio del finto: la
         * scansione legge `controller.chat.activeSession.value?.id`, quindi
         * qui lanciava «Cannot read properties of undefined» a OGNI caso —
         * sei rejection non gestite, con sei test verdi. Il finto
         * incompleto nascondeva il difetto vero al posto di trovarlo.
         */
        chat: { state: { persistenceStatus: 'ready', persistenceError: null }, activeSession: { value: null } },
        selectedProviderModel: { value: null as null | {
            id: string, provider: 'local', displayName: string,
            chatCompatibility: 'unknown', supportedParameters: string[],
            inputModalities: string[], outputModalities: string[],
        } },
        traces: () => [],
        clearTraces: vi.fn(),
    },
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => harness.settings }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => harness.controller }))
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}))
vi.mock('@/services/dictationDiagnostica', () => ({
    talosDictationDiagnostics: () => Promise.resolve({
        buildId: 'test-build', pluginLoaded: true, available: true, error: null, trace: '',
    }),
}))
// Voice synthesis row (24/8): stessa scelta di dictationDiagnostica sopra —
// si mocka il MODULO di diagnosi, non la catena di registerPlugin che sta
// dietro (personalVoice.ts la userebbe per davvero, e questo file di test
// non vuole saperne la forma).
vi.mock('@/services/personalVoiceDiagnostica', () => ({
    talosPersonalVoiceDiagnostics: () => Promise.resolve({
        registered: true, supported: true, installed: true, ready: false,
        backend: null, engineBuild: null, modelState: null, failure: null,
        profileCount: 0, compatibleProfileCount: 0, diario: [], trace: '', error: null,
    }),
}))
vi.mock('@/services/databaseProtection', () => ({
    talosDatabaseLockState: () => 'engaged',
    talosDatabaseLockFailure: () => null,
}))
vi.mock('@/services/appLock', () => ({ biometricUnlockAvailable: () => Promise.resolve(true) }))
// The share probe is a dynamic import inside the scan, and the strip is behind
// `v-if="!scanning"` — an unmocked one leaves the screen showing a spinner and
// every selector below failing for the wrong reason.
vi.mock('@capacitor/share', () => ({ Share: { canShare: () => Promise.resolve({ value: true }) } }))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: vi.fn().mockResolvedValue(undefined) }))
const parityRunner = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@/services/localModelParityDiagnostics', () => ({
    runTalosLocalModelParityDiagnostics: parityRunner.run,
}))
vi.mock('@/lib/talosDeviceLog', () => ({
    talosDeviceIssues: () => [],
    talosWithTimeout: <T>(work: Promise<T>) => work,
}))

import DoctorScreen from '@/screens/DoctorScreen.vue'

async function openDoctor() {
    const wrapper = mount(DoctorScreen, { attachTo: document.body })
    await vi.dynamicImportSettled()
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
}

async function chooseSection(wrapper: Awaited<ReturnType<typeof openDoctor>>, id: string): Promise<void> {
    // Reka commits on pointerdown, so a bare click never reaches it.
    const tab = wrapper.get(`[data-talos-tab="${id}"]`).element as HTMLElement
    tab.focus()
    tab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await flushPromises()
    await wrapper.vm.$nextTick()
}

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    harness.controller.selectedProviderModel.value = null
    parityRunner.run.mockResolvedValue({
        schema: 'talos.local-model-parity/1',
        verdict: 'compatible',
        model: { name: 'gemma.gguf', bytes: 123, modifiedAt: 7 },
        appBuild: 'R-test',
        engineBuild: 'llama-test',
        toolTransport: 'prompt-json-v1',
        templateCapabilities: {
            supportsTools: false, supportsToolCalls: false, supportsSystemRole: true,
        },
        fingerprint: '0123456789abcdef',
        summary: { passed: 6, failed: 0, skipped: 0 },
        checks: [
            { id: 'plain_text', status: 'pass', durationMs: 10, code: 'TALOS_LOCAL_PARITY_OK' },
        ],
    })
})

describe('DoctorScreen', () => {
    it('draws its three segments from the register, as a real tablist', async () => {
        const wrapper = await openDoctor()

        expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Diagnostics sections')
        expect(wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('data-talos-tab')))
            .toEqual(['status', 'data', 'advanced'])
        expect(wrapper.get('[data-talos-tab="status"]').attributes('aria-selected')).toBe('true')
        // The Doctor was left out of the shared panel animation when the other
        // two got it, so its sections changed with no transition at all — found
        // by looking at the phone, not by reading the diff.
        expect(wrapper.get('[role="tabpanel"]').classes()).toContain('talos-motion-tab-panel')
        expect(wrapper.get('[data-talos-tabs]').attributes('data-talos-tabs')).toBe('doctor')
        wrapper.unmount()
    })

    it('opens again on the section you left', async () => {
        const first = await openDoctor()
        await chooseSection(first, 'advanced')
        expect(first.get('[data-talos-tab="advanced"]').attributes('aria-selected')).toBe('true')
        first.unmount()

        const second = await openDoctor()
        expect(second.get('[data-talos-tab="advanced"]').attributes('aria-selected')).toBe('true')
        second.unmount()
    })

    it('does not open on a section a release has removed', async () => {
        // A device can hold the name of a view that no longer ships. A strip
        // pointed at one renders with nothing selected and no panel under it.
        localStorage.setItem('talos.view.doctor', 'timings')
        const wrapper = await openDoctor()

        expect(wrapper.get('[data-talos-tab="status"]').attributes('aria-selected')).toBe('true')
        wrapper.unmount()
    })

    /**
     * The gap flagged on 2026-08-02: turning the technical detail OFF discards
     * what was measured, and nothing on this side of the build checked it. The
     * report otherwise says `timingsRecorded: false` beside a list of sends,
     * which contradicts itself.
     */
    it('throws away the recorded timings when technical detail is switched off', async () => {
        harness.settings.state.shell.debug_diagnostics = true
        const wrapper = await openDoctor()
        await chooseSection(wrapper, 'advanced')

        await wrapper.get('[role="switch"][data-testid="talos-debug-diagnostics"]').trigger('click')

        expect(harness.settings.setShell).toHaveBeenCalledWith({ debug_diagnostics: false })
        expect(harness.controller.clearTraces).toHaveBeenCalled()
        harness.settings.state.shell.debug_diagnostics = false
        wrapper.unmount()
    })

    it('keeps the timings when it is switched on, because there is nothing to discard', async () => {
        harness.settings.state.shell.debug_diagnostics = false
        const wrapper = await openDoctor()
        await chooseSection(wrapper, 'advanced')

        await wrapper.get('[role="switch"][data-testid="talos-debug-diagnostics"]').trigger('click')

        expect(harness.settings.setShell).toHaveBeenCalledWith({ debug_diagnostics: true })
        expect(harness.controller.clearTraces).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('prova esplicitamente il locale selezionato e mostra un verdetto compatto', async () => {
        harness.controller.selectedProviderModel.value = {
            id: '/models/gemma.gguf', provider: 'local', displayName: 'Gemma',
            chatCompatibility: 'unknown', supportedParameters: [],
            inputModalities: ['text'], outputModalities: ['text'],
        }
        const wrapper = await openDoctor()
        await chooseSection(wrapper, 'advanced')

        await wrapper.get('[data-testid="talos-doctor-local-parity-run"]').trigger('click')
        await flushPromises()

        expect(parityRunner.run).toHaveBeenCalledWith({
            model: harness.controller.selectedProviderModel.value,
        })
        const result = wrapper.get('[data-testid="talos-doctor-local-parity-result"]')
        expect(result.text()).toMatch(/compatibile|compatible/i)
        expect(result.text()).toContain('6')
        expect(result.get('[data-testid="talos-doctor-local-parity-transport"]').text())
            .toMatch(/prompt JSON v1/i)
        wrapper.unmount()
    })

    it('non mostra il banco di parità senza un modello locale selezionato', async () => {
        const wrapper = await openDoctor()
        await chooseSection(wrapper, 'advanced')
        expect(wrapper.find('[data-testid="talos-doctor-local-parity-run"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

/* -------------------------------------------------------------------------- *
 * ⛔⛔ UNA SONDA CHE LANCIA COSTA LA SUA RIGA, NON TUTTA LA STAZIONE
 * -------------------------------------------------------------------------- */

describe('⛔ la Diagnostica non resta MUTA quando la scansione cade', () => {
    /*
     * Il commento su `runScan` prometteva già questo comportamento — ma il
     * codice era `try { … } finally { … }` SENZA `catch`, e un `finally` non
     * ferma il lancio: spegne la rotellina e rilancia.
     *
     * Conseguenza: `rows` non veniva mai assegnato e la stazione restava
     * BIANCA. Trovato il 2026-08-10 dalle rejection della suite (compito #57):
     * sei da questo file solo, tutte cadute nel vuoto perché nessuno aspettava
     * la promessa di `onMounted`.
     */
    it('un guasto durante la scansione diventa una riga con il suo motivo', async () => {
        // La sonda esplode dove esplodeva davvero: leggendo la sessione attiva.
        const sano = harness.controller.chat.activeSession
        Object.defineProperty(harness.controller.chat, 'activeSession', {
            configurable: true,
            get() { throw new Error('sonda esplosa') },
        })
        let testo = ''
        try {
            testo = (await openDoctor()).text()
        } finally {
            Object.defineProperty(harness.controller.chat, 'activeSession', {
                configurable: true, writable: true, value: sano,
            })
        }
        expect(testo, 'la stazione deve dire che la diagnosi non è finita')
            .toMatch(/non è riuscita fino in fondo|did not finish/i)
        expect(testo, 'e deve portare il MOTIVO, non solo il fatto')
            .toContain('sonda esplosa')
    })
})
