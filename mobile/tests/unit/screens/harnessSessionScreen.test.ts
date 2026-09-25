// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { compileStyle, parse } from '@vue/compiler-sfc'
import { Capacitor } from '@capacitor/core'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

const keyboardMock = vi.hoisted(() => ({
    listeners: new Map<string, (...args: unknown[]) => void>(),
    removers: new Map<string, ReturnType<typeof vi.fn>>(),
}))
vi.mock('@capacitor/keyboard', () => ({
    Keyboard: {
        addListener: vi.fn(async (eventName: string, listener: (...args: unknown[]) => void) => {
            const remove = vi.fn()
            keyboardMock.listeners.set(eventName, listener)
            keyboardMock.removers.set(eventName, remove)
            return { remove }
        }),
    },
}))

// Harness UI (24/8): NOT a trampoline anymore — `useRoute` is mocked directly
// (rather than mounted under a real router) because the only thing this
// screen reads from it is `params.id`, kept purely for diagnosis — see
// the component's opening comment for why it moved off `window.location.assign`.
//
// 28/8: `routerReplace` MUTATES `mockState.params` (a plain-object stand-in
// for real router reactivity — `useRoute()` re-reads it fresh on every
// call, so a test that re-mounts after a replace sees the new id; a test
// that stays mounted across a replace does not, by construction of this
// mock — the draft→real transition is verified as "createCodiceSession +
// router.replace called correctly", the ACTUAL cross-navigation mount is
// device-verified, not fought out of jsdom's router mock).
const mockState = vi.hoisted(() => ({
    params: { id: 'refactor-auth-flow' } as Record<string, string>,
    routerPush: vi.fn(),
    routerReplace: vi.fn((to: { params?: Record<string, string> }) => {
        if (to?.params) mockState.params = { ...to.params }
    }),
}))
vi.mock('vue-router', () => ({
    useRoute: () => ({ params: mockState.params }),
    useRouter: () => ({ push: mockState.routerPush, replace: mockState.routerReplace }),
}))

// 28/8: real sessions replace the five-row demo array — `findCodiceSession`
// looks up a small local fixture map (not the app's own demo data, so a
// name collision could never make a test pass for the wrong reason);
// `createCodiceSession` is what the DRAFT ('new') composer calls on first send.
const FIXTURES: Record<string, { id: string, title: string }> = {
    'refactor-auth-flow': { id: 'refactor-auth-flow', title: 'Refactor auth flow' },
    'audit-api-permissions': { id: 'audit-api-permissions', title: 'Audit API permissions' },
    'fix-mobile-composer': { id: 'fix-mobile-composer', title: 'Fix mobile composer' },
}
const codiceMock = vi.hoisted(() => ({
    findCodiceSession: vi.fn(),
    createCodiceSession: vi.fn(),
}))
vi.mock('@/lib/harness/codiceSessions', () => codiceMock)

/**
 * ⭐⭐⭐ 30/8 — il ponte verso Note/Attività/Memoria/Libreria (owner,
 * correggendo un errore: quei sistemi esistono già, mature e testati —
 * `codiceDati.ts` ha i suoi test propri, codiceDati.test.ts). Qui si
 * prova SOLO la wiring dentro HarnessSessionScreen.vue, stesso principio
 * di `codiceModelProfilesMock` sopra.
 */
const codiceDatiMock = vi.hoisted(() => ({
    listCodiceNotes: vi.fn(), createCodiceNote: vi.fn(), updateCodiceNote: vi.fn(), deleteCodiceNote: vi.fn(),
    listCodiceTasks: vi.fn(), createCodiceTask: vi.fn(), setCodiceTaskStatus: vi.fn(), updateCodiceTask: vi.fn(), deleteCodiceTask: vi.fn(),
    searchCodiceMemories: vi.fn(), createCodiceMemory: vi.fn(), updateCodiceMemoryByTitle: vi.fn(), deleteCodiceMemoryByTitle: vi.fn(),
    listCodiceLibraryEntries: vi.fn(), readCodiceLibraryDoc: vi.fn(), renameCodiceLibraryFile: vi.fn(), deleteCodiceLibraryFile: vi.fn(),
    searchCodiceLibrary: vi.fn(), readCodiceLibraryFileOrigin: vi.fn(),
    listCodiceResearch: vi.fn(), readCodiceResearchReport: vi.fn(),
}))
vi.mock('@/lib/harness/codiceDati', () => codiceDatiMock)

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 3 — mockato per NOME di funzione, non
 * per `Capacitor.isPluginAvailable('TalosTerminal')`: gli altri test di
 * questo file usano `vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)`
 * SENZA controllare l'argomento, quindi risponderebbe `true` anche per
 * `'TalosTerminal'` — mockare qui la funzione stessa evita di dipendere
 * da quella imprecisione (mai presunta innocua senza guardarla).
 */
const terminalePonteMock = vi.hoisted(() => ({
    talosTerminaleDisponibile: vi.fn(() => false),
    avviaServerHarnessConChiaveProvider: vi.fn(async () => ({
        ok: true, giaAttivo: false, stdout: '', stderr: '', exitCode: 0, motivo: null,
    })),
}))
vi.mock('@/lib/harness/terminalePonte', () => terminalePonteMock)

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — mockato allo stesso modo: il
 * catalogo reale ha i suoi test propri (codiceModelProfiles.test.ts).
 * Qui si prova SOLO la wiring dentro HarnessSessionScreen.vue.
 */
const codiceModelProfilesMock = vi.hoisted(() => ({
    caricaProfiliModelloCodice: vi.fn(async (): Promise<TalosMobileModelProfileView[]> => []),
}))
vi.mock('@/lib/harness/codiceModelProfiles', () => codiceModelProfilesMock)

/**
 * ⭐⭐⭐ 2/9 — "Migliora prompt": stesso principio di
 * codiceModelProfilesMock qui sopra, provano SOLO il filo dentro
 * HarnessSessionScreen.vue — runTalosMobilePromptEnhancement ha i suoi
 * test propri (promptEnhancement.test.ts). providerRegistry/
 * secureKeyStore/providerEndpointStore mockati perché
 * risolviProviderModelPerEnhance() (locale, non esportata) li chiama
 * per davvero — senza mock qui proverebbe una rete vera.
 */
const promptEnhancementMock = vi.hoisted(() => ({
    runTalosMobilePromptEnhancement: vi.fn(),
}))
vi.mock('@/lib/chat/promptEnhancement', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/chat/promptEnhancement')>()),
    runTalosMobilePromptEnhancement: promptEnhancementMock.runTalosMobilePromptEnhancement,
}))
const providerRegistryMock = vi.hoisted(() => ({
    providerAdapterFor: vi.fn(() => ({ listModels: vi.fn(async () => ({ provider: 'openrouter', models: [] })) })),
}))
vi.mock('@/lib/chat/providerRegistry', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/chat/providerRegistry')>()),
    ...providerRegistryMock,
}))
vi.mock('@/services/providerEndpointStore', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/providerEndpointStore')>()),
    getProviderEndpoint: vi.fn(async () => null),
}))
// ⭐ Il resto del modulo resta vero: la bozza carica in differita
// `TalosWelcomeTitle`, che passa da `chatController` e legge `hasProviderKey`
// — con un doppio parziale l'import fallisce DOPO la fine della prova.
vi.mock('@/services/secureKeyStore', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/secureKeyStore')>()),
    getProviderKey: vi.fn(async () => 'chiave-prova'),
}))

/**
 * ⭐ B1-14 (owner 23/09: «attiva la dettatura anche in codice») — il MOTORE
 * di dettatura finto, non il composable: `useTalosMobileDictation` resta
 * quello vero, così la prova copre le stesse regole della chat (bozza di
 * partenza, annulla, invio che chiude, errori). Si pilota a mano: `eventi`
 * sono i callback che il composable consegna a `start()`.
 */
const dettaturaMock = vi.hoisted(() => {
    const stato = {
        eventi: null as null | {
            onStart?: () => void
            onPartial: (text: string) => void
            onEnd: () => void
            onError: (code: string) => void
        },
        opzioni: null as null | Record<string, unknown>,
    }
    const motore = {
        // Spento per difetto (web senza Web Speech): le prove che vogliono il
        // microfono lo accendono dichiarando la piattaforma nativa.
        supported: vi.fn(async () => false),
        requestPermission: vi.fn(async () => true),
        start: vi.fn(async (eventi: NonNullable<typeof stato.eventi>, opzioni?: Record<string, unknown>) => {
            stato.eventi = eventi
            stato.opzioni = opzioni ?? null
        }),
        stop: vi.fn(async () => undefined),
    }
    return { stato, motore }
})
vi.mock('@/services/dictation', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/dictation')>()),
    talosDictationEngine: () => dettaturaMock.motore,
    talosDettaturaAnnota: vi.fn(),
}))
const vocePrestoMock = vi.hoisted(() => ({ stop: vi.fn(async () => undefined) }))
vi.mock('@/composables/useTalosSpeech', () => ({ useTalosSpeech: () => vocePrestoMock }))

/**
 * ⭐ B1-12 — la STESSA colonna che la chat usa per ricordare il modello di
 * una conversazione (`active_model_profile_id`, `stores/chat.ts`
 * `setActiveModelProfile`). Il doppio conserva ciò che si scrive, così
 * uscire e rientrare (smonta → rimonta) rilegge davvero la scelta.
 */
const repositoryMock = vi.hoisted(() => ({
    modelliSalvati: new Map<string, string | null>(),
    updateSession: vi.fn(),
}))
vi.mock('@/repositories/productionChatRepositorySingleton', () => ({
    productionChatRepository: { updateSession: repositoryMock.updateSession },
}))

import HarnessSessionScreen from '@/screens/HarnessSessionScreen.vue'
import {
    __resetTalosOverlayBackForTests,
    handleTalosOverlayBack,
    talosOverlayBackActive,
} from '@/composables/useTalosOverlayBack'
import { __resetToastsForTests, useTalosMobileToasts } from '@/stores/toasts'

const FAKE_MOCKUP_HTML = '<!doctype html><html><head></head><body>'
    + '<svg class="icon-sprite" aria-hidden="true"><symbol id="i-test" viewBox="0 0 24 24"></symbol></svg>'
    + '<div id="app" class="app-shell"><main class="workspace-shell">stub chat</main>'
    + '<aside class="inspector-panel">stub inspector</aside></div>'
    + '<script src="app.js"></script>'
    + '</body></html>'

function fixedRect(left: number, right: number, top = 0, bottom = 800): DOMRect {
    return {
        x: left,
        y: top,
        top,
        right,
        bottom,
        left,
        width: right - left,
        height: bottom - top,
        toJSON: () => ({}),
    }
}

/** app.js never really runs under jsdom (no script execution configured) —
 * this simulates the ONE contract HarnessSessionScreen.vue depends on it
 * for: the load event that resolves `mountMockup()`'s awaited promise. */
async function resolveScriptLoad(host: HTMLElement): Promise<void> {
    await flushPromises()
    ;(window as unknown as {
        __talosHarnessUiRuntime?: { selectSession(selection: { id: string; title: string }): void }
    }).__talosHarnessUiRuntime ??= { selectSession: vi.fn(() => true) }
    const script = host.shadowRoot?.querySelector('script')
    script?.dispatchEvent(new Event('load'))
    await flushPromises()
}

describe('HarnessSessionScreen (28/8) — real sessions + a DRAFT state, shadow root inside the SPA', () => {
    beforeEach(() => {
        __resetTalosOverlayBackForTests()
        mockState.params = { id: 'refactor-auth-flow' }
        mockState.routerPush.mockReset()
        mockState.routerReplace.mockClear()
        codiceMock.findCodiceSession.mockReset()
        codiceMock.findCodiceSession.mockImplementation(async (id: string) => (FIXTURES[id]
            ? { ...FIXTURES[id], active_model_profile_id: repositoryMock.modelliSalvati.get(id) ?? null }
            : null))
        repositoryMock.modelliSalvati.clear()
        repositoryMock.updateSession.mockReset().mockImplementation(async (id: string, input: { active_model_profile_id?: string | null }) => {
            if (input.active_model_profile_id !== undefined) repositoryMock.modelliSalvati.set(id, input.active_model_profile_id)
            return { ...(FIXTURES[id] ?? { id, title: id }), active_model_profile_id: repositoryMock.modelliSalvati.get(id) ?? null }
        })
        dettaturaMock.stato.eventi = null
        dettaturaMock.stato.opzioni = null
        dettaturaMock.motore.supported.mockClear()
        dettaturaMock.motore.requestPermission.mockReset().mockResolvedValue(true)
        dettaturaMock.motore.start.mockClear()
        dettaturaMock.motore.stop.mockClear()
        vocePrestoMock.stop.mockClear()
        codiceMock.createCodiceSession.mockReset()
        codiceMock.createCodiceSession.mockImplementation(async (title: string) => ({ id: 'created-session-id', title }))
        terminalePonteMock.talosTerminaleDisponibile.mockReset().mockReturnValue(false)
        terminalePonteMock.avviaServerHarnessConChiaveProvider.mockReset().mockResolvedValue({
            ok: true, giaAttivo: false, stdout: '', stderr: '', exitCode: 0, motivo: null,
        })
        codiceModelProfilesMock.caricaProfiliModelloCodice.mockReset().mockResolvedValue([])
        promptEnhancementMock.runTalosMobilePromptEnhancement.mockReset()
        providerRegistryMock.providerAdapterFor.mockReset().mockReturnValue({ listModels: vi.fn(async () => ({ provider: 'openrouter', models: [] })) })
        for (const fn of Object.values(codiceDatiMock)) fn.mockReset()
        codiceDatiMock.listCodiceNotes.mockResolvedValue([])
        keyboardMock.listeners.clear()
        keyboardMock.removers.clear()
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, assign: vi.fn() },
        })
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input), 'https://localhost')
            if (url.pathname === '/harness-ui/index.html') return new Response(FAKE_MOCKUP_HTML, { status: 200 })
            return new Response('', { status: 404 })
        }))
    })

    afterEach(() => {
        __resetTalosOverlayBackForTests()
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessDestroy?: unknown }).__talosHarnessDestroy
        delete (window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime
        delete (window as unknown as { __talosHarnessHostBack?: unknown }).__talosHarnessHostBack
        delete (window as unknown as { __talosHarnessHostPermissionChange?: unknown }).__talosHarnessHostPermissionChange
        delete (window as unknown as { __talosHarnessApiBase?: unknown }).__talosHarnessApiBase
        delete (window as unknown as { __talosHarnessRichiediDato?: unknown }).__talosHarnessRichiediDato
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('mounts the mockup into a shadow root on the host element — never a top-level navigation', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        expect(window.location.assign).not.toHaveBeenCalled()
        expect(host.shadowRoot).not.toBeNull()
        expect(host.shadowRoot?.querySelector('.icon-sprite')).not.toBeNull()
        const link = host.shadowRoot?.querySelector('link[rel="stylesheet"]')
        expect(window.fetch).toHaveBeenCalledWith('/harness-ui/index.html?build=dev', { cache: 'no-cache' })
        expect(link?.getAttribute('href')).toBe('/harness-ui/styles.css?build=dev')
        expect(host.shadowRoot?.querySelector('script')?.getAttribute('src')).toBe('/harness-ui/app.js?build=dev')
        expect(host.shadowRoot?.querySelectorAll('script').length).toBe(1)
        expect(w.find('[data-testid="talos-harness-session-opening"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-harness-session-error"]').exists()).toBe(false)
    })

    /**
     * ⭐⭐⭐ Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3
     * (`adb reverse`) — la base che `app.js` legge tramite `API()` per
     * distinguere desktop (URL relativi, invariati) da mobile (assoluti,
     * verso il tunnel). Pianta PRIMA che lo script esegua, stesso momento
     * di `__talosHarnessRoot`/`__talosHarnessHost`.
     */
    it('HARNESS-API-BASE-01 pianta window.__talosHarnessApiBase su piattaforma nativa (mobile)', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        expect((window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase).toBe('http://localhost:4174')
    })

    it('HARNESS-API-BASE-02 AL CONTRARIO: su web/desktop resta una stringa vuota, MAI l\'URL del tunnel', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        expect((window as unknown as { __talosHarnessApiBase?: string }).__talosHarnessApiBase).toBe('')
    })

    /**
     * ⭐⭐⭐ 30/8 — il ponte verso Note/Attività/Memoria/Libreria. Owner,
     * correggendo un errore: quei sistemi esistono già, maturi e testati
     * — non vanno ricostruiti, vanno collegati. Stesso schema di
     * HARNESS-API-BASE-01: piantata sullo STESSO window, PRIMA che
     * app.js esegua.
     */
    it('HARNESS-DATI-01 pianta window.__talosHarnessRichiediDato, e "notes_list" torna le note vere', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const NOTE_FINTE = [{ id: 'n1', title: 'Spesa', content: 'latte', updatedAt: '2026-08-30T00:00:00.000Z' }]
        codiceDatiMock.listCodiceNotes.mockResolvedValue(NOTE_FINTE)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const ponte = (window as unknown as { __talosHarnessRichiediDato?: (tipo: string, args: unknown) => Promise<unknown> }).__talosHarnessRichiediDato
        expect(typeof ponte).toBe('function')
        await expect(ponte!('notes_list', null)).resolves.toEqual(NOTE_FINTE)
        expect(codiceDatiMock.listCodiceNotes).toHaveBeenCalledTimes(1)
    })

    it('⛔ HARNESS-DATI-02 AL CONTRARIO: un tipo non collegato viene RIFIUTATO, mai un dato inventato o un elenco vuoto ambiguo', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const ponte = (window as unknown as { __talosHarnessRichiediDato?: (tipo: string, args: unknown) => Promise<unknown> }).__talosHarnessRichiediDato
        // ⭐ un tipo mai esistito in nessuno schema del kernel — non "research_report"
        // o un altro tipo oggi solo rimandato: quello, un domani, potrebbe diventare
        // reale e far tornare falso questo test senza che nessuno se ne accorga.
        await expect(ponte!('un_tipo_mai_esistito', null)).rejects.toThrow(/non collegato/)
        expect(codiceDatiMock.listCodiceNotes).not.toHaveBeenCalled()
        expect(codiceDatiMock.listCodiceTasks).not.toHaveBeenCalled()
        expect(codiceDatiMock.searchCodiceMemories).not.toHaveBeenCalled()
        expect(codiceDatiMock.listCodiceLibraryEntries).not.toHaveBeenCalled()
    })

    it('HARNESS-DATI-04: "library_rename" spacchetta {id, name} e chiama renameCodiceLibraryFile posizionale', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        codiceDatiMock.renameCodiceLibraryFile.mockResolvedValue({ id: 'f1', name: 'nuovo-nome.pdf' })
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        const ponte = (window as unknown as { __talosHarnessRichiediDato?: (tipo: string, args: unknown) => Promise<unknown> }).__talosHarnessRichiediDato
        await expect(ponte!('library_rename', { id: 'f1', name: 'nuovo-nome.pdf' })).resolves.toEqual({ id: 'f1', name: 'nuovo-nome.pdf' })
        expect(codiceDatiMock.renameCodiceLibraryFile).toHaveBeenCalledWith('f1', 'nuovo-nome.pdf')
        w.unmount()
    })

    it('HARNESS-DATI-07: "library_search" spacchetta {query, limit} e "library_file_origin" chiama readCodiceLibraryFileOrigin — gap chiuso 2/9', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const TROVATI = [{ id: 'f1', displayName: 'quarzo.txt', mediaType: 'text/plain', excerpt: 'proprietà del quarzo' }]
        codiceDatiMock.searchCodiceLibrary.mockResolvedValue(TROVATI)
        codiceDatiMock.readCodiceLibraryFileOrigin.mockResolvedValue({
            name: 'quarzo.txt', origin: 'uploaded', model: null, provider: null, createdAt: null, sourceUrl: null,
        })
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        const ponte = (window as unknown as { __talosHarnessRichiediDato?: (tipo: string, args: unknown) => Promise<unknown> }).__talosHarnessRichiediDato

        await expect(ponte!('library_search', { query: 'quarzo', limit: 3 })).resolves.toEqual(TROVATI)
        expect(codiceDatiMock.searchCodiceLibrary).toHaveBeenCalledWith('quarzo', 3)

        await expect(ponte!('library_file_origin', { id: 'f1' })).resolves.toMatchObject({ name: 'quarzo.txt', origin: 'uploaded' })
        expect(codiceDatiMock.readCodiceLibraryFileOrigin).toHaveBeenCalledWith('f1')
        w.unmount()
    })

    it('HARNESS-DATI-06: "research_list"/"research_read" arrivano a codiceDati.ts — terzo passo dello stesso giorno', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const RICERCHE_FINTE = [{ id: 'r1', title: 'Fornitori', status: 'done', startedAt: '2026-08-29T00:00:00.000Z' }]
        codiceDatiMock.listCodiceResearch.mockResolvedValue(RICERCHE_FINTE)
        codiceDatiMock.readCodiceResearchReport.mockResolvedValue('# Fornitori\n\nrapporto vero')
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        const ponte = (window as unknown as { __talosHarnessRichiediDato?: (tipo: string, args: unknown) => Promise<unknown> }).__talosHarnessRichiediDato

        await expect(ponte!('research_list', null)).resolves.toEqual(RICERCHE_FINTE)
        expect(codiceDatiMock.listCodiceResearch).toHaveBeenCalledTimes(1)

        await expect(ponte!('research_read', { id: 'r1' })).resolves.toBe('# Fornitori\n\nrapporto vero')
        expect(codiceDatiMock.readCodiceResearchReport).toHaveBeenCalledWith('r1')
        w.unmount()
    })

    it('HARNESS-DATI-05: "tasks_update" spacchetta {id, patch} e chiama updateCodiceTask con la patch intatta', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const TASK_AGGIORNATA = { id: 't1', title: 'nuovo titolo', description: null, status: 'todo' as const, priority: 'high' as const, updatedAt: '2026-08-30T00:00:00.000Z' }
        codiceDatiMock.updateCodiceTask.mockResolvedValue(TASK_AGGIORNATA)
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        const ponte = (window as unknown as { __talosHarnessRichiediDato?: (tipo: string, args: unknown) => Promise<unknown> }).__talosHarnessRichiediDato
        const patch = { title: 'nuovo titolo', priority: 'high' as const }
        await expect(ponte!('tasks_update', { id: 't1', patch })).resolves.toEqual(TASK_AGGIORNATA)
        expect(codiceDatiMock.updateCodiceTask).toHaveBeenCalledWith('t1', patch)
        w.unmount()
    })

    it('⛔ HARNESS-DATI-03 AL CONTRARIO: il ponte sparisce dopo lo smontaggio — mai chiamabile su una schermata già chiusa', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        expect(typeof (window as unknown as { __talosHarnessRichiediDato?: unknown }).__talosHarnessRichiediDato).toBe('function')

        w.unmount()
        expect((window as unknown as { __talosHarnessRichiediDato?: unknown }).__talosHarnessRichiediDato).toBeUndefined()
    })

    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 3 — item 3 (un messaggio reale)
     * vuole un server harness-ui reale già in ascolto (item 2): senza
     * questa chiamata al mount, il primo messaggio di una sessione nuova
     * (inoltrato SENZA che la persona tocchi altro, vedi pendingFirstPrompt
     * in mountMockup) arriverebbe a un server ancora spento.
     */
    it('HARNESS-SERVER-AUTOSTART-01 chiama avviaServerHarnessConChiaveProvider al mount quando il terminale è disponibile (debug)', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        terminalePonteMock.talosTerminaleDisponibile.mockReturnValue(true)
        // ⭐⭐⭐ 28/8 — trovato sul device: avviaServerHarness torna ok:true
        // quando il LANCIO è partito, non quando il server ascolta. Il
        // componente attende /api/v1/health prima di considerarlo pronto
        // (attendiServerHarnessPronto) — qui risponde subito 200, altrimenti
        // il test aspetterebbe per davvero fino a 15×300ms.
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input), 'https://localhost')
            if (url.pathname === '/harness-ui/index.html') return new Response(FAKE_MOCKUP_HTML, { status: 200 })
            if (url.pathname === '/api/v1/health') return new Response('{"ok":true}', { status: 200 })
            return new Response('', { status: 404 })
        }))
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        await flushPromises()

        expect(terminalePonteMock.avviaServerHarnessConChiaveProvider).toHaveBeenCalledTimes(1)
    })

    /**
     * ⭐⭐⭐ 28/8 — la prova DIRETTA della cura: /api/v1/health rifiuta due
     * volte (server ancora spento) prima di rispondere 200 — il polling
     * (attendiServerHarnessPronto) deve riprovare, non arrendersi al primo
     * tentativo, e non richiamare avviaServerHarness una seconda volta
     * (il lancio è già partito, non va ripetuto).
     */
    it('HARNESS-SERVER-AUTOSTART-03 attende /api/v1/health con retry — non basta che il lancio sia partito', async () => {
        vi.useFakeTimers()
        try {
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            terminalePonteMock.talosTerminaleDisponibile.mockReturnValue(true)
            let chiamateHealth = 0
            vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
                const url = new URL(String(input), 'https://localhost')
                if (url.pathname === '/harness-ui/index.html') return new Response(FAKE_MOCKUP_HTML, { status: 200 })
                if (url.pathname === '/api/v1/health') {
                    chiamateHealth += 1
                    return new Response('', { status: chiamateHealth < 3 ? 503 : 200 })
                }
                return new Response('', { status: 404 })
            }))
            const w = mount(HarnessSessionScreen)
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
            await vi.advanceTimersByTimeAsync(0)
            const script = host.shadowRoot?.querySelector('script')
            script?.dispatchEvent(new Event('load'))
            ;(window as unknown as {
                __talosHarnessUiRuntime?: { selectSession(selection: { id: string, title: string }): void }
            }).__talosHarnessUiRuntime ??= { selectSession: vi.fn(() => true) }
            await vi.advanceTimersByTimeAsync(0)
            // Due tentativi fallati (503) + l'intervallo fra loro, poi il terzo riesce.
            await vi.advanceTimersByTimeAsync(1000)

            expect(chiamateHealth).toBeGreaterThanOrEqual(3)
            expect(terminalePonteMock.avviaServerHarnessConChiaveProvider).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    /**
     * AL CONTRARIO: in release (o comunque senza il plugin di debug) non si
     * chiama mai — `talosTerminaleDisponibile()` è la stessa domanda già
     * usata da `terminalePonte.ts`, non una seconda convenzione.
     */
    it('HARNESS-SERVER-AUTOSTART-02 AL CONTRARIO: mai chiamata quando il terminale non è disponibile (release)', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        terminalePonteMock.talosTerminaleDisponibile.mockReturnValue(false)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        expect(terminalePonteMock.avviaServerHarnessConChiaveProvider).not.toHaveBeenCalled()
    })

    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — owner: «io devo poter usare
     * qualunque modello di qualunque provider voglio, esattamente come
     * abbiamo fatto nella sezione Chat». Sostituisce il profilo unico
     * finto (`gpt-5.6-sol`) con il catalogo VERO — qui si prova solo che
     * il composer riceva ciò che `caricaProfiliModelloCodice` restituisce,
     * FILTRATO a `provider === 'openrouter'` (dichiarato in codice: il
     * kernel chiama solo OpenRouter oggi).
     */
    it('HARNESS-MODEL-CATALOG-01 popola il composer col catalogo reale, filtrato a OpenRouter', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([
            { id: 'openrouter:z-ai/glm-4.7-flash', provider: 'openrouter', model: 'z-ai/glm-4.7-flash', display_name: 'GLM 4.7 Flash', status: 'untested', has_secret: true, effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null },
            { id: 'openai:gpt-5.6-sol', provider: 'openai', model: 'gpt-5.6-sol', display_name: 'gpt-5.6-sol', status: 'untested', has_secret: true, effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null },
        ])
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        await flushPromises()

        const composer = w.get('[data-testid="talos-mobile-composer"]')
        await composer.get('textarea').trigger('focus')
        // Solo il profilo OpenRouter è arrivato al composer — quello OpenAI
        // (il kernel non lo può chiamare) non è mai stato offerto.
        expect(composer.text()).toContain('GLM 4.7 Flash')
        expect(composer.text()).not.toContain('gpt-5.6-sol')
    })

    /*
     * ⭐⭐⭐ 2/9 — chiude una riga della tabella mockup (piano §14.3):
     * "Aggiorna" nel picker modello chiamava SOLO un toast finto
     * ("Nessuna discovery di rete eseguita"), mai un refresh vero.
     * refreshCodeModels() richiama DAVVERO caricaProfiliModelloCodice()
     * — questa prova che l'evento del composer arriva fino a quella
     * chiamata reale, una SECONDA volta oltre a quella del mount.
     */
    it('HARNESS-MODEL-CATALOG-02 "Aggiorna" richiama DAVVERO il catalogo, non solo un toast finto', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([])
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        await flushPromises()
        const chiamateAlMount = codiceModelProfilesMock.caricaProfiliModelloCodice.mock.calls.length
        expect(chiamateAlMount).toBeGreaterThan(0) // precondizione: il mount l'ha già chiamata una volta

        const composer = w.getComponent({ name: 'TalosMobileComposer' })
        composer.vm.$emit('refreshModels')
        await flushPromises()

        expect(codiceModelProfilesMock.caricaProfiliModelloCodice.mock.calls.length).toBeGreaterThan(chiamateAlMount)
    })

    /*
     * ⭐⭐⭐ 2/9 — AL CONTRARIO di HARNESS-MODEL-CATALOG-02: un refresh che
     * FALLISCE davvero (provider irraggiungibile) non deve annunciare lo
     * stesso "Modelli aggiornati" del caso riuscito — caricaModelliCodice()
     * inghiotte l'errore internamente (per non rompere la sessione), quindi
     * senza questa distinzione il toast avrebbe dichiarato un successo mai
     * avvenuto, esattamente il difetto che questa fase dell'UX esiste per
     * eliminare altrove nel composer.
     */
    it('HARNESS-MODEL-CATALOG-03 ⛔ un refresh fallito annuncia l\'esito onesto, mai "Modelli aggiornati"', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        codiceModelProfilesMock.caricaProfiliModelloCodice.mockRejectedValue(new Error('provider unreachable'))
        const announceComposerAction = vi.fn(() => true)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: {
                selectSession(): void
                announceComposerAction(action: string): boolean
            }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true), announceComposerAction }

        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        await flushPromises()

        const composer = w.getComponent({ name: 'TalosMobileComposer' })
        composer.vm.$emit('refreshModels')
        await flushPromises()

        expect(announceComposerAction).toHaveBeenCalledWith('refresh-models-failed')
        expect(announceComposerAction).not.toHaveBeenCalledWith('refresh-models')
    })

    /*
     * ⭐⭐⭐ 2/9 — "Migliora prompt" era nella tabella mockup del composer
     * (piano §14.3/§15.6, R5): il tasto chiamava solo
     * announceComposerAction('enhance'), un toast "demo" — il drawer
     * REALE (TalosMobileEnhancerDrawer, già montato da TalosMobileComposer
     * stesso) si apriva comunque, ma senza mai un risultato vero. Questa
     * prova che @enhance-prompt richiama DAVVERO
     * runTalosMobilePromptEnhancement() e il risultato torna al composer
     * come prop reale — non solo che "qualcosa" è stato chiamato.
     */
    it('HARNESS-ENHANCE-01 "Migliora prompt" richiama DAVVERO il modello, il risultato torna al composer', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([
            { id: 'openrouter:z-ai/glm-4.7-flash', provider: 'openrouter', model: 'z-ai/glm-4.7-flash', display_name: 'GLM 4.7 Flash', status: 'untested', has_secret: true, effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null },
        ])
        promptEnhancementMock.runTalosMobilePromptEnhancement.mockResolvedValue({
            enhanced_prompt: 'Riscrittura vera del prompt.',
            summary: 'Reso più specifico.',
            applied_principles: ['Obiettivo esplicito'],
            model_profile_id: 'openrouter:z-ai/glm-4.7-flash',
            provider: 'openrouter',
            model: 'z-ai/glm-4.7-flash',
            enhancement_mode: 'model',
            original_prompt: 'scrivi qualcosa',
        })
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { selectSession(): void }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true) }

        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        await flushPromises()

        const composer = w.getComponent({ name: 'TalosMobileComposer' })
        composer.vm.$emit('enhancePrompt')
        await flushPromises()

        expect(promptEnhancementMock.runTalosMobilePromptEnhancement).toHaveBeenCalledTimes(1)
        expect(composer.props('promptEnhancement')).toMatchObject({ enhanced_prompt: 'Riscrittura vera del prompt.' })
        expect(composer.props('enhancingPrompt')).toBe(false) // finito, non più "in corso"
    })

    /*
     * ⭐⭐⭐ 2/9 — AL CONTRARIO: TalosMobileComposer.vue calcola GIÀ un
     * motivo vero quando "Migliora prompt" non può partire (nessun
     * modello selezionabile, prompt vuoto) — prima questo motivo veniva
     * buttato via e sostituito da un toast fisso ("Miglioramento non
     * collegato") che non diceva PERCHÉ. Questa prova che il motivo
     * ESATTO arriva all'utente, non una frase generica.
     */
    it('⛔ HARNESS-ENHANCE-02 AL CONTRARIO: enhance-blocked mostra il MOTIVO vero, mai un messaggio generico', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        __resetToastsForTests()
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { selectSession(): void }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true) }

        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        await flushPromises()

        const composer = w.getComponent({ name: 'TalosMobileComposer' })
        composer.vm.$emit('enhanceBlocked', 'Scrivi un prompt prima di migliorarlo.')
        await flushPromises()

        const ultimo = useTalosMobileToasts().items.value.at(-1)
        expect(ultimo?.message).toBe('Scrivi un prompt prima di migliorarlo.')
        expect(ultimo?.message).not.toContain('non collegato') // mai il vecchio toast generico
        expect(promptEnhancementMock.runTalosMobilePromptEnhancement).not.toHaveBeenCalled()
    })

    it('shows an honest "not available" state and never fetches when the plugin is absent (release build)', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false)
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        expect(window.fetch).not.toHaveBeenCalled()
        expect(window.location.assign).not.toHaveBeenCalled()
        expect(w.find('[data-testid="talos-harness-session-unavailable"]').exists()).toBe(true)
    })

    it('shows an honest load-failed state when the fetch fails, instead of a silent blank host', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        expect(w.find('[data-testid="talos-harness-session-error"]').exists()).toBe(true)
        expect(window.location.assign).not.toHaveBeenCalled()
    })

    it('carries the tapped session id through as a diagnostic data attribute', async () => {
        mockState.params = { id: 'audit-api-permissions' }
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        expect(w.get('[data-testid="talos-harness-session-screen"]').attributes('data-harness-session-id')).toBe('audit-api-permissions')
    })

    it('CODE-MOBILE-GUTTER-01 uses the Code surface as the single owner of horizontal gutters', () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const body = w.get('[data-testid="mobile-screen-body"]')

        expect(body.classes()).toContain('p-0')
        expect(body.classes()).not.toContain('px-4')
    })

    it('CODE-COMPOSER-SINGLE-SOURCE-01 mounts the exact chat composer instead of a rewritten Code clone', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        expect(w.get('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        expect(source.default).toContain("import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'")
        expect(source.default).not.toContain('useChatController')
    })

    it('CODE-COMPOSER-AUTONOMY-PILL-01 keeps the mockup policy selector beside the model in the shared composer', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const announceComposerAction = vi.fn(() => true)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: {
                selectSession(): void
                announceComposerAction(action: string): boolean
            }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true), announceComposerAction }

        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const composer = w.get('[data-testid="talos-mobile-composer"]')
        await composer.get('textarea').trigger('focus')
        const autonomy = composer.get('[data-testid="talos-code-autonomy-chip"]')
        expect(autonomy.text()).toContain('Workspace write')

        await autonomy.trigger('click')
        expect(announceComposerAction).toHaveBeenCalledWith('permissions')

        ;(window as unknown as {
            __talosHarnessHostPermissionChange?: (permission: string) => void
        }).__talosHarnessHostPermissionChange?.('Full access')
        await flushPromises()
        expect(autonomy.text()).toContain('Full access')
    })

    it('CODE-COMPOSER-DEMO-SEND-01 forwards a local prompt to Code and clears the shared component', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const submitPrompt = vi.fn(() => true)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { selectSession(): void, submitPrompt(text: string): boolean }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true), submitPrompt }
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const composer = w.get('[data-testid="talos-mobile-composer"]')
        await composer.get('textarea').setValue('Local Code prompt')
        await composer.get('[data-testid="talos-composer-action"]').trigger('click')
        await flushPromises()

        expect(submitPrompt).toHaveBeenCalledWith('Local Code prompt')
        expect((composer.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    })

    /**
     * ⭐⭐⭐ 2/9 — picker Planner (piano §15.6, K): l'esecutore scelto nel
     * drawer condiviso raggiunge DAVVERO l'avvio sessione, come terzo
     * argomento — stessa forma provata isolatamente nel drawer
     * (TalosMobileComposer.drawer.test.ts, EXECUTOR-MODEL-02) e nel ponte
     * (harnessUiBridge.test.ts, HARNESS-EXECUTOR-MODEL-01); qui la CATENA
     * intera, dallo stato dello schermo alla chiamata reale.
     *
     * ⛔ AL CONTRARIO ("Automatico" → nessun terzo argomento) non è
     * riprovato in QUESTO test con un secondo invio: `sendGate`
     * (sendGate.ts, "one tap, one message") latcha 1500ms reali fra due
     * invii dello STESSO composer — un secondo click a distanza di
     * millisecondi verrebbe respinto a monte, un falso negativo che non
     * parlerebbe di questa feature. Il verso contrario resta comunque
     * provato per intero: a livello di ponte (harnessUiBridge.test.ts,
     * HARNESS-EXECUTOR-MODEL-01) e a livello di drawer (EXECUTOR-MODEL-02,
     * click su "Automatico"); e CODE-COMPOSER-DEMO-SEND-01 qui sopra —
     * invariata da questa feature — è già l'esatto caso "Automatico dal
     * primo invio", mai toccato da `codeModelloEsecutoreId`.
     */
    it('HARNESS-EXECUTOR-MODEL-01 forwards a chosen executor model to session start, as the third argument', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([
            { id: 'openrouter:z-ai/glm-4.7-flash', provider: 'openrouter', model: 'z-ai/glm-4.7-flash', display_name: 'GLM 4.7 Flash', status: 'untested', has_secret: true, effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null },
            { id: 'openrouter:inclusionai/ling-3.0-flash-fin', provider: 'openrouter', model: 'inclusionai/ling-3.0-flash-fin:free', display_name: 'Ling 3.0 Flash (free)', status: 'untested', has_secret: true, effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null },
        ])
        const submitPrompt = vi.fn(() => true)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { selectSession(): void, submitPrompt(text: string, modello?: string, modelloEsecutore?: string): boolean }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true), submitPrompt }

        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)
        await flushPromises() // lascia risolvere caricaModelliCodice() e autoselezionare il modello principale

        const composer = w.getComponent({ name: 'TalosMobileComposer' })
        // Il modello principale si autoseleziona da catalogo (nessun tocco necessario) — verificato dal computed `codeModeloSelezionato` esistente, non ridimostrato qui.
        const modelloAtteso = 'z-ai/glm-4.7-flash'
        expect(composer.props('selectedModelProfileId')).toBe('openrouter:z-ai/glm-4.7-flash')

        // Sceglie l'esecutore economico — stessa forma di evento provata a livello di drawer.
        composer.vm.$emit('selectExecutorModelProfile', 'openrouter:inclusionai/ling-3.0-flash-fin')
        await flushPromises()
        expect(composer.props('selectedExecutorModelProfileId')).toBe('openrouter:inclusionai/ling-3.0-flash-fin')

        await composer.get('textarea').setValue('Sistema lo sconto a scaglioni')
        await composer.get('[data-testid="talos-composer-action"]').trigger('click')
        await flushPromises()

        expect(submitPrompt).toHaveBeenCalledWith('Sistema lo sconto a scaglioni', modelloAtteso, 'inclusionai/ling-3.0-flash-fin:free')
    })

    it('CODE-COMPOSER-KEYBOARD-01 compiles the keyboard selector onto the composer instead of body', async () => {
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        const { descriptor } = parse(source.default, { filename: 'HarnessSessionScreen.vue' })
        const style = descriptor.styles.find((candidate) => candidate.scoped)
        expect(style).toBeDefined()

        const compiled = compileStyle({
            filename: 'HarnessSessionScreen.vue',
            id: 'data-v-code-keyboard',
            scoped: true,
            source: style?.content ?? '',
        })

        expect(compiled.errors).toHaveLength(0)
        expect(compiled.code).toMatch(/body\.keyboard-open\s+\.talos-code-composer-dock(?:\[[^\]]+\])?\s*\{[^}]*bottom:\s*0/s)
        expect(compiled.code).not.toMatch(/body\.keyboard-open\s*\{[^}]*bottom:\s*0/s)
    })

    it('CODE-COMPOSER-TABLET-RAIL-01 anchors the dock once inside the already-offset tool surface', async () => {
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        const { descriptor } = parse(source.default, { filename: 'HarnessSessionScreen.vue' })
        const style = descriptor.styles.find((candidate) => candidate.scoped)
        expect(style).toBeDefined()

        const dockRule = style?.content.match(/\.talos-code-composer-dock\s*\{([^}]*)\}/s)?.[1] ?? ''
        expect(dockRule).toContain('position: absolute')
        expect(dockRule).toContain('left: 0')
        expect(dockRule).not.toContain('--talos-tablet-rail')
    })

    it('CODE-COMPOSER-MAX-WIDTH-01 caps and centers the shared composer when both rails collapse', async () => {
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        const { descriptor } = parse(source.default, { filename: 'HarnessSessionScreen.vue' })
        const style = descriptor.styles.find((candidate) => candidate.scoped)
        expect(style).toBeDefined()

        const compiled = compileStyle({
            filename: 'HarnessSessionScreen.vue',
            id: 'data-v-code-composer-width',
            scoped: true,
            source: style?.content ?? '',
        })

        expect(compiled.errors).toHaveLength(0)
        const composerRule = compiled.code.match(/\.talos-code-composer-dock[^}]*\[data-testid="talos-mobile-composer"\][^{]*\{([^}]*)\}/s)?.[1] ?? ''
        expect(composerRule).toContain('width: calc(100% - 1.5rem)')
        expect(composerRule).toContain('max-width: 920px')
        expect(composerRule).toContain('margin-inline: auto')
        expect(composerRule).toContain('box-sizing: border-box')
    })

    it('CODE-COMPOSER-CONTEXT-RAIL-01 stops at the live workspace edge and follows Context collapse', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        let resizeCallback: ResizeObserverCallback | null = null
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        })

        const w = mount(HarnessSessionScreen)
        await flushPromises()
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        const dock = w.get('[data-testid="talos-code-composer-dock"]').element as HTMLElement
        const workspace = host.shadowRoot?.querySelector<HTMLElement>('.workspace-shell')
        expect(workspace).not.toBeNull()

        let workspaceRect = fixedRect(0, 860)
        vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => fixedRect(0, 1200))
        vi.spyOn(workspace as HTMLElement, 'getBoundingClientRect').mockImplementation(() => workspaceRect)
        await resolveScriptLoad(host)

        expect(dock.style.right).toBe('340px')
        expect(dock.style.left).toBe('0px')

        workspaceRect = fixedRect(0, 1200)
        resizeCallback?.([], {} as ResizeObserver)
        await flushPromises()
        expect(dock.style.right).toBe('0px')
    })

    it.each(Object.values(FIXTURES))(
        'HARNESS-ROUTE-SESSION-SYNC-01 forwards route $id to the mounted mockup runtime',
        async (session) => {
            mockState.params = { id: session.id }
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            const selectSession = vi.fn()
            const w = mount(HarnessSessionScreen)
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement

            await flushPromises()
            ;(window as unknown as {
                __talosHarnessUiRuntime?: { selectSession(selection: { id: string; title: string }): void }
            }).__talosHarnessUiRuntime = { selectSession }
            host.shadowRoot?.querySelector('script')?.dispatchEvent(new Event('load'))
            await flushPromises()

            expect(selectSession).toHaveBeenCalledWith({ id: session.id, title: session.title })
        },
    )

    it('HARNESS-UNKNOWN-SESSION-01 shows an explicit state without loading the static runtime', async () => {
        mockState.params = { id: 'not-a-real-session' }
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)

        const w = mount(HarnessSessionScreen)
        await flushPromises()

        expect(w.find('[data-testid="talos-harness-session-unknown"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-harness-session-host"]').exists()).toBe(false)
        expect(window.fetch).not.toHaveBeenCalled()
    })

    it('HARNESS-UNKNOWN-SESSION-VISUAL-01 offers the TALOS empty-state action back to the list', async () => {
        mockState.params = { id: 'not-a-real-session' }
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)

        const w = mount(HarnessSessionScreen)
        await flushPromises()
        await w.get('[data-testid="talos-harness-session-unknown-back"]').trigger('click')

        expect(w.get('[data-testid="talos-harness-session-unknown-title"]').text()).not.toBe('')
        expect(w.get('[data-testid="talos-harness-session-unknown-back"]').text()).toBe('Back to Code')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness' })
    })

    it('calls the destroyer contract on unmount, so window-level listeners cannot outlive the screen', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        // app.js never really executes under jsdom; stand in for the
        // destroyer it would have installed by the time 'load' fired.
        const destroy = vi.fn()
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy = destroy
        ;(window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot = host.shadowRoot

        w.unmount()

        expect(destroy).toHaveBeenCalledTimes(1)
        expect((window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot).toBeUndefined()
    })

    it('HARNESS-KEYBOARD-NATIVE-RESIZE-01 forwards native show/hide and removes both listeners', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const setKeyboardOpen = vi.fn()
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { setKeyboardOpen(open: boolean): void }
        }).__talosHarnessUiRuntime = { setKeyboardOpen }

        const w = mount(HarnessSessionScreen)
        await flushPromises()

        expect([...keyboardMock.listeners.keys()].sort()).toEqual([
            'keyboardWillHide',
            'keyboardWillShow',
        ])

        keyboardMock.listeners.get('keyboardWillShow')?.({ keyboardHeight: 320 })
        keyboardMock.listeners.get('keyboardWillHide')?.()
        expect(setKeyboardOpen).toHaveBeenNthCalledWith(1, true)
        expect(setKeyboardOpen).toHaveBeenNthCalledWith(2, false)

        w.unmount()
        await flushPromises()
        expect(keyboardMock.removers.get('keyboardWillShow')).toHaveBeenCalledTimes(1)
        expect(keyboardMock.removers.get('keyboardWillHide')).toHaveBeenCalledTimes(1)
    })

    it('HARNESS-PALETTE-BACK-02 registers only an open Code layer in the shared TALOS back stack', () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        let open = true
        const dismissTransientLayers = vi.fn(() => {
            if (!open) return false
            open = false
            return true
        })
        ;(window as unknown as {
            __talosHarnessUiRuntime?: {
                dismissTransientLayers: () => boolean
                transientLayersActive: () => boolean
            }
        }).__talosHarnessUiRuntime = {
            dismissTransientLayers,
            transientLayersActive: () => open,
        }

        const w = mount(HarnessSessionScreen)
        expect(talosOverlayBackActive()).toBe(true)
        expect(handleTalosOverlayBack()).toBe(true)
        expect(dismissTransientLayers).toHaveBeenCalledTimes(1)
        expect(talosOverlayBackActive()).toBe(false)
        w.unmount()
    })

    it('CODE-PHONE-UP-01 exposes one host-owned return to the Code list and removes it on unmount', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const hostBack = (window as unknown as { __talosHarnessHostBack?: () => void })
            .__talosHarnessHostBack
        expect(hostBack).toBeTypeOf('function')
        hostBack?.()
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness' })

        w.unmount()
        expect((window as unknown as { __talosHarnessHostBack?: unknown }).__talosHarnessHostBack)
            .toBeUndefined()
    })

    // 28/8 — DRAFT ('new'): no row exists yet, composer-only, real creation on first send.
    describe('draft state — id "new", no session created until the first send', () => {
        beforeEach(() => {
            mockState.params = { id: 'new' }
        })

        it('CODE-DRAFT-01 shows the draft hint and composer, never the mockup host or the unknown-session state', async () => {
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            const w = mount(HarnessSessionScreen)
            await flushPromises()

            expect(w.find('[data-testid="talos-harness-session-draft-hint"]').exists()).toBe(true)
            expect(w.find('[data-testid="talos-harness-session-unknown"]').exists()).toBe(false)
            expect(w.find('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
            expect(window.fetch).not.toHaveBeenCalled()
            expect(codiceMock.findCodiceSession).not.toHaveBeenCalled()
        })

        it('CODE-DRAFT-02 sending the first message creates the real session and navigates to it — never eagerly on mount', async () => {
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            codiceMock.createCodiceSession.mockResolvedValue({ id: 'brand-new-id', title: 'Fix the flaky test' })
            const w = mount(HarnessSessionScreen)
            await flushPromises()
            // Verso contrario, first: opening the draft page alone must never
            // have created anything.
            expect(codiceMock.createCodiceSession).not.toHaveBeenCalled()

            const composer = w.get('[data-testid="talos-mobile-composer"]')
            await composer.get('textarea').setValue('Fix the flaky test')
            await composer.get('[data-testid="talos-composer-action"]').trigger('click')
            await flushPromises()

            expect(codiceMock.createCodiceSession).toHaveBeenCalledWith('Fix the flaky test')
            expect(mockState.routerReplace).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'brand-new-id' } })
            expect((composer.get('textarea').element as HTMLTextAreaElement).value).toBe('')
        })

        it('CODE-DRAFT-03 verso contrario: an empty/whitespace-only draft never creates a session', async () => {
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            const w = mount(HarnessSessionScreen)
            await flushPromises()

            const composer = w.get('[data-testid="talos-mobile-composer"]')
            await composer.get('textarea').setValue('   ')
            await flushPromises()

            expect(w.get('[data-testid="talos-composer-action"]').attributes('disabled')).toBeDefined()
            expect(codiceMock.createCodiceSession).not.toHaveBeenCalled()
        })
    })

    /**
     * ⭐ B1-14 — owner 23/09: «attiva la dettatura anche in codice». Il
     * compositore del Codice È quello della chat, ma senza i fili della
     * dettatura il microfono diceva «La dettatura non è disponibile qui».
     * Qui si prova che il filo è lo STESSO della chat (ChatScreen.vue):
     * stessa lingua, stessa bozza di partenza, annulla che la rimette,
     * invio che chiude l'ascolto, stessi errori sopra il compositore.
     */
    describe('B1-14 dettatura nel Codice — gli stessi fili della chat', () => {
        async function montaSessioneConMicrofono() {
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
            const w = mount(HarnessSessionScreen)
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
            await resolveScriptLoad(host)
            await flushPromises()
            return w
        }

        it('CODE-DICTATION-01 il microfono del Codice è acceso, mai più «La dettatura non è disponibile qui»', async () => {
            const w = await montaSessioneConMicrofono()
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            expect(composer.props('dictationSupported')).toBe(true)
            await composer.get('textarea').trigger('focus')
            expect(composer.text()).not.toContain('La dettatura non è disponibile qui')
        })

        it('CODE-DICTATION-02 anche nella BOZZA (sessione nuova) il microfono è acceso', async () => {
            mockState.params = { id: 'new' }
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
            const w = mount(HarnessSessionScreen)
            await flushPromises()
            expect(w.getComponent({ name: 'TalosMobileComposer' }).props('dictationSupported')).toBe(true)
            // Col campo vuoto il tasto a destra è il microfono: ascolta, e non
            // crea MAI una sessione (CODE-DRAFT-03 resta vero anche qui).
            await w.get('[data-testid="talos-composer-action"]').trigger('click')
            await flushPromises()
            expect(dettaturaMock.motore.start).toHaveBeenCalledTimes(1)
            expect(codiceMock.createCodiceSession).not.toHaveBeenCalled()
        })

        it('CODE-DICTATION-03 il dettato si compone sul testo già scritto, con la lingua delle impostazioni, e la voce tace prima', async () => {
            const { useSettingsStore } = await import('@/stores/settings')
            const { resolveTalosDictationLanguageTag, talosRilevamentoAcceso } = await import('@/lib/dictationPolicy')
            const w = await montaSessioneConMicrofono()
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            await composer.get('textarea').setValue('Rifattorizza')
            composer.vm.$emit('toggleDictation')
            await flushPromises()

            expect(vocePrestoMock.stop).toHaveBeenCalled()
            expect(dettaturaMock.motore.start).toHaveBeenCalledTimes(1)
            const lingua = useSettingsStore().state.voice.dictation_language
            expect(dettaturaMock.stato.opzioni).toMatchObject({
                language: resolveTalosDictationLanguageTag(lingua),
                autoLanguage: talosRilevamentoAcceso(lingua),
            })
            expect(composer.props('dictationStarting')).toBe(true)

            dettaturaMock.stato.eventi!.onPartial('il modulo auth')
            await flushPromises()
            expect(composer.props('dictationListening')).toBe(true)
            expect(composer.props('prompt')).toBe('Rifattorizza il modulo auth')
            // Solo il pezzo NUOVO nella barra, come in chat.
            expect(composer.props('dictationTranscript')).toBe('il modulo auth')
        })

        it('CODE-DICTATION-04 annulla butta il dettato e rimette la bozza com\'era', async () => {
            const w = await montaSessioneConMicrofono()
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            await composer.get('textarea').setValue('Rifattorizza')
            composer.vm.$emit('toggleDictation')
            await flushPromises()
            dettaturaMock.stato.eventi!.onPartial('parole sbagliate')
            await flushPromises()

            composer.vm.$emit('discardDictation')
            await flushPromises()
            expect(composer.props('prompt')).toBe('Rifattorizza')
            expect(composer.props('dictationListening')).toBe(false)
            expect(dettaturaMock.motore.stop).toHaveBeenCalled()
        })

        it('CODE-DICTATION-05 «invia» dalla barra chiude l\'ascolto e manda il dettato; una parziale tardiva non lo resuscita', async () => {
            const submitPrompt = vi.fn(() => true)
            ;(window as unknown as {
                __talosHarnessUiRuntime?: { selectSession(): void, submitPrompt(text: string): boolean }
            }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true), submitPrompt }
            const w = await montaSessioneConMicrofono()
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            composer.vm.$emit('toggleDictation')
            await flushPromises()
            const eventi = dettaturaMock.stato.eventi!
            eventi.onPartial('sistema il test instabile')
            await flushPromises()

            composer.vm.$emit('sendDictation')
            await flushPromises()
            expect(submitPrompt).toHaveBeenCalledTimes(1)
            expect((submitPrompt.mock.calls[0] as unknown[])[0]).toBe('sistema il test instabile')
            expect(composer.props('dictationListening')).toBe(false)
            expect(composer.props('prompt')).toBe('')

            eventi.onPartial('sistema il test instabile adesso')
            await flushPromises()
            expect(composer.props('prompt')).toBe('')
        })

        it('CODE-DICTATION-06 un errore vero parla sopra il compositore in rosso; il silenzio no', async () => {
            const w = await montaSessioneConMicrofono()
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            composer.vm.$emit('toggleDictation')
            await flushPromises()
            dettaturaMock.stato.eventi!.onError('recognitionFailed')
            await flushPromises()
            const errore = w.get('[data-testid="talos-dictation-error"]')
            expect(errore.attributes('role')).toBe('alert')
            expect(errore.attributes('data-esito')).toBe('recognitionFailed')
            expect(errore.text().length).toBeGreaterThan(0)

            composer.vm.$emit('toggleDictation')
            await flushPromises()
            dettaturaMock.stato.eventi!.onEnd()
            await flushPromises()
            const silenzio = w.get('[data-testid="talos-dictation-error"]')
            expect(silenzio.attributes('role')).toBe('status')
            expect(silenzio.attributes('data-esito')).toBe('noSpeech')
        })

        it('CODE-DICTATION-07 uscire dal Codice col microfono aperto lo restituisce', async () => {
            const w = await montaSessioneConMicrofono()
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            composer.vm.$emit('toggleDictation')
            await flushPromises()
            dettaturaMock.stato.eventi!.onPartial('ciao')
            await flushPromises()
            dettaturaMock.motore.stop.mockClear()
            w.unmount()
            expect(dettaturaMock.motore.stop).toHaveBeenCalled()
        })
    })

    /**
     * ⭐ B1-12 — MISURATO sul Pad il 23/09: scelto GLM 5.3 Flash, riaprendo
     * la sessione il Codice tornava a Gemini 3.7 Flash. La cura usa la
     * colonna che la chat usa già per ricordare il modello di OGNI
     * conversazione (`active_model_profile_id` della riga di sessione, la
     * stessa tabella — Open WebUI chiede la stessa cosa, issue #27672).
     */
    describe('B1-12 il modello del Codice si ricorda per sessione', () => {
        // L'ultimo modello del Codice vive nelle impostazioni (un singleton): ogni prova parte senza.
        beforeEach(async () => {
            const { useSettingsStore } = await import('@/stores/settings')
            await useSettingsStore().setShell({ codice_model: null })
        })
        const profilo = (id: string, model: string, display_name: string): TalosMobileModelProfileView => ({
            id, provider: 'openrouter', model, display_name, status: 'untested', has_secret: true, effort_levels: [],
            supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null,
        } as unknown as TalosMobileModelProfileView)
        const GEMINI = profilo('openrouter:google/gemini-3.7-flash', 'google/gemini-3.7-flash', 'Gemini 3.7 Flash')
        const GLM = profilo('openrouter:z-ai/glm-5.3-flash', 'z-ai/glm-5.3-flash', 'GLM 5.3 Flash')

        async function montaSessione() {
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([GEMINI, GLM])
            const w = mount(HarnessSessionScreen)
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
            await resolveScriptLoad(host)
            await flushPromises()
            return w
        }

        // ⭐ 24/09/2026 (AUT-2): il Codice incorporato conosceva il modello solo a un invio; le Automazioni, aperte prima di
        // scrivere, sarebbero partite col modello predefinito del server invece di quello scelto qui.
        it('CODE-MODEL-BRIDGE-01 il Codice incorporato riceve il modello scelto: all’aggancio e a ogni cambio', async () => {
            const impostaModello = vi.fn(() => true)
            // L'ordine vero: i profili modello arrivano PRIMA che il Codice incorporato esista (il suo script si carica
            // dopo) — il modello va consegnato anche all'aggancio, non solo ai cambi.
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([GEMINI, GLM])
            const w = mount(HarnessSessionScreen)
            await flushPromises()
            expect(impostaModello).not.toHaveBeenCalled()
            ;(window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime = { selectSession: vi.fn(() => true), impostaModello }
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
            host.shadowRoot?.querySelector('script')?.dispatchEvent(new Event('load'))
            await flushPromises()
            // NOME-MODELLO-01 (25/09/2026): col modello viaggia il suo nome — il server del Codice sul telefono non ha il
            // catalogo (`/api/v1/models` → 404), e senza nome la pagina mostrava la sigla.
            expect(impostaModello).toHaveBeenLastCalledWith(GEMINI.model, 'Gemini 3.7 Flash')
            w.getComponent({ name: 'TalosMobileComposer' }).vm.$emit('selectModelProfile', GLM.id)
            await flushPromises()
            expect(impostaModello).toHaveBeenLastCalledWith(GLM.model, 'GLM 5.3 Flash')
        })

        /*
         * RAG-COD (24/09/2026, owner «collegarla»): la barra dell'impegno del composer del Codice cambiava solo il
         * miglioramento del prompt; il giro del Codice partiva senza `reasoning`. Ora il livello (coi livelli veri del
         * modello: GLM 5.3 niente «off») arriva al Codice incorporato; un modello senza livelli non manda niente.
         */
        it('RAG-COD-11 il Codice incorporato riceve il livello di ragionamento del composer, già regolato sul modello', async () => {
            const impostaEffort = vi.fn(() => true)
            const GLM_OBBLIGATORIO = { ...GLM, effort_levels: ['max', 'high', 'low'], supports_thinking: true, reasoning_mandatory: true }
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([GEMINI, GLM_OBBLIGATORIO])
            const w = mount(HarnessSessionScreen)
            await flushPromises()
            ;(window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime = {
                selectSession: vi.fn(() => true), impostaModello: vi.fn(() => true), impostaEffort,
            }
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
            host.shadowRoot?.querySelector('script')?.dispatchEvent(new Event('load'))
            await flushPromises()
            // Gemini qui non ha livelli: nessun `reasoning` (il predefinito del server), e la sessione salvata non si tocca.
            expect(impostaEffort).toHaveBeenLastCalledWith(null, false)
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            composer.vm.$emit('selectModelProfile', GLM_OBBLIGATORIO.id)
            await flushPromises()
            expect(impostaEffort).toHaveBeenLastCalledWith('high', true)
            composer.vm.$emit('selectEffort', 'off')
            await flushPromises()
            expect(impostaEffort).toHaveBeenLastCalledWith('low', true)
        })

        it('CODE-MODEL-MEMORY-01 scelto GLM, si esce e si rientra: resta GLM, non torna Gemini', async () => {
            const primo = await montaSessione()
            expect(primo.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GEMINI.id)
            primo.getComponent({ name: 'TalosMobileComposer' }).vm.$emit('selectModelProfile', GLM.id)
            await flushPromises()
            expect(repositoryMock.updateSession).toHaveBeenCalledWith('refactor-auth-flow', { active_model_profile_id: GLM.id })
            primo.unmount()

            const secondo = await montaSessione()
            expect(secondo.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GLM.id)
        })

        it('CODE-MODEL-MEMORY-02 il modello scelto nella BOZZA nasce già scritto sulla sessione creata', async () => {
            mockState.params = { id: 'new' }
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([GEMINI, GLM])
            codiceMock.createCodiceSession.mockResolvedValue({ id: 'brand-new-id', title: 'Fix' })
            const w = mount(HarnessSessionScreen)
            await flushPromises()
            const composer = w.getComponent({ name: 'TalosMobileComposer' })
            composer.vm.$emit('selectModelProfile', GLM.id)
            await flushPromises()
            // Nella bozza non c'è ancora una riga: niente da scrivere.
            expect(repositoryMock.updateSession).not.toHaveBeenCalled()

            await composer.get('textarea').setValue('Fix')
            await composer.get('[data-testid="talos-composer-action"]').trigger('click')
            await flushPromises()
            expect(repositoryMock.updateSession).toHaveBeenCalledWith('brand-new-id', { active_model_profile_id: GLM.id })
        })

        it('CODE-MODEL-MEMORY-03 al contrario: un modello salvato che non c\'è più nel catalogo lascia il predefinito, e l\'autoselezione non si scrive', async () => {
            repositoryMock.modelliSalvati.set('refactor-auth-flow', 'openrouter:modello/sparito')
            const w = await montaSessione()
            expect(w.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GEMINI.id)
            // ⛔ Un ripiego non è una scelta: non si consacra a preferenza.
            expect(repositoryMock.updateSession).not.toHaveBeenCalled()
        })

        it('CODE-MODEL-MEMORY-04 il modello salvato vince anche se il catalogo arriva PRIMA della sessione', async () => {
            repositoryMock.modelliSalvati.set('refactor-auth-flow', GLM.id)
            let rilascia: (() => void) | null = null
            codiceMock.findCodiceSession.mockImplementation(async (id: string) => {
                await new Promise<void>((resolve) => { rilascia = resolve })
                return { ...FIXTURES[id], active_model_profile_id: repositoryMock.modelliSalvati.get(id) ?? null }
            })
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([GEMINI, GLM])
            const w = mount(HarnessSessionScreen)
            await flushPromises()
            expect(w.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GEMINI.id)
            ;(rilascia as (() => void) | null)?.()
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
            await resolveScriptLoad(host)
            await flushPromises()
            expect(w.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GLM.id)
            expect(repositoryMock.updateSession).not.toHaveBeenCalled()
        })

        /*
         * ⭐ Owner 23/09, «sì»: anche le sessioni NUOVE partono dall'ultimo modello
         * scelto nel Codice, non da Gemini. Stesso comportamento di LibreChat (le
         * chat nuove partono dal modello della conversazione precedente) e di
         * Hermes Agent (la scelta vale per le sessioni nuove, quelle aperte tengono
         * il loro modello) — letti il 23/09/2026.
         */
        describe('le sessioni nuove partono dall’ultimo modello scelto nel Codice', () => {
            it('CODE-MODEL-LAST-01 scelto GLM in una sessione, la bozza nuova parte da GLM', async () => {
                const primo = await montaSessione()
                primo.getComponent({ name: 'TalosMobileComposer' }).vm.$emit('selectModelProfile', GLM.id)
                await flushPromises()
                primo.unmount()

                mockState.params = { id: 'new' }
                const bozza = mount(HarnessSessionScreen)
                await flushPromises()
                expect(bozza.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GLM.id)
            })

            it('CODE-MODEL-LAST-02 il modello salvato nella sessione vince sull’ultimo scelto altrove', async () => {
                const { useSettingsStore } = await import('@/stores/settings')
                await useSettingsStore().setShell({ codice_model: GLM.id })
                repositoryMock.modelliSalvati.set('refactor-auth-flow', GEMINI.id)
                const w = await montaSessione()
                expect(w.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GEMINI.id)
            })

            it('CODE-MODEL-LAST-03 al contrario: un ultimo modello sparito dal catalogo lascia Gemini e non si riscrive', async () => {
                const { useSettingsStore } = await import('@/stores/settings')
                await useSettingsStore().setShell({ codice_model: 'openrouter:modello/sparito' })
                mockState.params = { id: 'new' }
                vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
                codiceModelProfilesMock.caricaProfiliModelloCodice.mockResolvedValue([GEMINI, GLM])
                const w = mount(HarnessSessionScreen)
                await flushPromises()
                expect(w.getComponent({ name: 'TalosMobileComposer' }).props('selectedModelProfileId')).toBe(GEMINI.id)
                expect(useSettingsStore().state.shell.codice_model).toBe('openrouter:modello/sparito')
            })
        })
    })
})
