// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ 28/8, owner "procedi in ordine" punto 1 — il ponte fra il terminale
 * on-device e la chiave del provider. Il plugin nativo e `getProviderKey`
 * sono entrambi finti qui: questo file prova SOLO la logica di
 * `terminalePonte.ts` (costruire `ambiente`, mai loggare la chiave), non
 * `secureKeyStore.ts` (già provato altrove) né il plugin Kotlin (provato
 * sul device vero, ledger FASE-5-EXECUTION-PLANE).
 */
const bridge = vi.hoisted(() => ({
    sonda: vi.fn(),
    eseguiComando: vi.fn(),
    avviaServerHarness: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isPluginAvailable: () => true,
    },
    registerPlugin: () => bridge,
}))

const getProviderKeyFinta = vi.hoisted(() => vi.fn())
vi.mock('@/services/secureKeyStore', () => ({
    getProviderKey: getProviderKeyFinta,
}))

// ⭐⭐⭐ 03/9 — multi-provider: avviaServerHarnessConChiaveProvider ora legge anche l'indirizzo Ollama (nessuna chiave, provider-endpoint separato dal portachiavi segreto).
const getProviderEndpointFinta = vi.hoisted(() => vi.fn())
vi.mock('@/services/providerEndpointStore', () => ({
    getProviderEndpoint: getProviderEndpointFinta,
}))

const { talosTerminaleDisponibile, eseguiComandoConChiaveProvider, avviaServerHarnessConChiaveProvider } = await import('@/lib/harness/terminalePonte')

beforeEach(() => {
    bridge.sonda.mockReset()
    bridge.eseguiComando.mockReset().mockResolvedValue({ ok: true, stdout: '', stderr: '', exitCode: 0, motivo: null })
    bridge.avviaServerHarness.mockReset().mockResolvedValue({ ok: true, giaAttivo: false, stdout: '', stderr: '', exitCode: 0, motivo: null })
    getProviderKeyFinta.mockReset()
    getProviderEndpointFinta.mockReset().mockResolvedValue(null)
})

describe('talosTerminaleDisponibile()', () => {
    it('rispecchia Capacitor.isPluginAvailable(\'TalosTerminal\')', () => {
        expect(talosTerminaleDisponibile()).toBe(true)
    })
})

describe('eseguiComandoConChiaveProvider()', () => {
    it('legge la chiave OpenRouter e la passa come OPENROUTER_API_KEY', async () => {
        getProviderKeyFinta.mockResolvedValue('sk-or-v1-vera')

        await eseguiComandoConChiaveProvider('node --version')

        expect(getProviderKeyFinta).toHaveBeenCalledWith('openrouter')
        expect(bridge.eseguiComando).toHaveBeenCalledWith({
            comando: 'node --version',
            ambiente: { OPENROUTER_API_KEY: 'sk-or-v1-vera' },
        })
    })

    it('un provider esplicito diverso viene passato a getProviderKey, mai "openrouter" a forza', async () => {
        getProviderKeyFinta.mockResolvedValue('sk-ant-vera')

        await eseguiComandoConChiaveProvider('echo ciao', 'anthropic')

        expect(getProviderKeyFinta).toHaveBeenCalledWith('anthropic')
    })

    /**
     * AL CONTRARIO: senza chiave configurata, il comando parte comunque —
     * non è compito di questo ponte decidere se quel comando ne ha bisogno.
     */
    it('senza chiave configurata (null), il comando parte SENZA OPENROUTER_API_KEY nell\'ambiente', async () => {
        getProviderKeyFinta.mockResolvedValue(null)

        await eseguiComandoConChiaveProvider('echo test')

        expect(bridge.eseguiComando).toHaveBeenCalledWith({ comando: 'echo test', ambiente: {} })
        const [[argomenti]] = bridge.eseguiComando.mock.calls
        expect(Object.hasOwn(argomenti.ambiente, 'OPENROUTER_API_KEY')).toBe(false)
    })

    it('torna l\'esito reale del plugin, non un valore inventato', async () => {
        getProviderKeyFinta.mockResolvedValue('sk-x')
        bridge.eseguiComando.mockResolvedValue({ ok: false, stdout: '', stderr: 'boom', exitCode: 1, motivo: 'bridge-timeout' })

        const esito = await eseguiComandoConChiaveProvider('qualunque')

        expect(esito).toEqual({ ok: false, stdout: '', stderr: 'boom', exitCode: 1, motivo: 'bridge-timeout' })
    })
})

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 2 — far partire il server
 * `harness-ui` dall'app stessa (`TalosTerminalPlugin.avviaServerHarness`,
 * provata sul device vero nel ledger FASE-5-EXECUTION-PLANE). Qui, come
 * sopra, solo la logica di `terminalePonte.ts`: costruire `ambiente`,
 * passarlo al plugin, tornare l'esito reale.
 *
 * ⭐⭐⭐ 03/9 — estesa a CINQUE provider di rete (owner: "colleghiamo i 5,
 * poi pensiamo ai locali" — model-destination.mjs). `chiaviPerProvider`
 * rende il doppio finto CONSAPEVOLE dell'argomento, non un valore piatto
 * per ogni chiamata: senza, tutti e cinque i provider riceverebbero la
 * STESSA chiave finta, che non è quello che succede davvero.
 */
function chiaviPerProvider(mappa: Record<string, string | null>) {
    return (provider: string) => Promise.resolve(mappa[provider] ?? null)
}

describe('avviaServerHarnessConChiaveProvider()', () => {
    it('legge la chiave OpenRouter e la passa come OPENROUTER_API_KEY (le altre assenti restano fuori)', async () => {
        getProviderKeyFinta.mockImplementation(chiaviPerProvider({ openrouter: 'sk-or-v1-vera' }))

        await avviaServerHarnessConChiaveProvider()

        expect(getProviderKeyFinta).toHaveBeenCalledWith('openrouter')
        expect(bridge.avviaServerHarness).toHaveBeenCalledWith({
            ambiente: { OPENROUTER_API_KEY: 'sk-or-v1-vera' },
        })
    })

    it('con TUTTE e cinque le chiavi configurate, tutte e cinque arrivano nell\'ambiente coi nomi giusti', async () => {
        getProviderKeyFinta.mockImplementation(chiaviPerProvider({
            openrouter: 'sk-or', openai: 'sk-oa', deepseek: 'sk-ds', anthropic: 'sk-an', gemini: 'sk-ge',
        }))
        getProviderEndpointFinta.mockResolvedValue('http://192.168.1.20:11434')

        await avviaServerHarnessConChiaveProvider()

        expect(bridge.avviaServerHarness).toHaveBeenCalledWith({
            ambiente: {
                OPENROUTER_API_KEY: 'sk-or',
                OPENAI_API_KEY: 'sk-oa',
                DEEPSEEK_API_KEY: 'sk-ds',
                ANTHROPIC_API_KEY: 'sk-an',
                GEMINI_API_KEY: 'sk-ge',
                OLLAMA_ENDPOINT: 'http://192.168.1.20:11434',
            },
        })
    })

    it('legge l\'indirizzo Ollama da providerEndpointStore, non dal portachiavi segreto', async () => {
        getProviderEndpointFinta.mockResolvedValue('http://ollama.locale:11434')

        await avviaServerHarnessConChiaveProvider()

        expect(getProviderEndpointFinta).toHaveBeenCalledWith('ollama')
        expect(getProviderKeyFinta).not.toHaveBeenCalledWith('ollama')
        const [[argomenti]] = bridge.avviaServerHarness.mock.calls
        expect(argomenti.ambiente.OLLAMA_ENDPOINT).toBe('http://ollama.locale:11434')
    })

    /**
     * AL CONTRARIO: senza NESSUNA credenziale configurata, l'avvio parte
     * comunque — il server resta usabile in sola lettura (elenco task,
     * stato campagne) anche senza un provider, come già fa `config.mjs`
     * lato server.
     */
    it('⛔ AL CONTRARIO — senza nessuna chiave né indirizzo configurato, l\'avvio parte con un ambiente vuoto', async () => {
        getProviderKeyFinta.mockResolvedValue(null)

        await avviaServerHarnessConChiaveProvider()

        expect(bridge.avviaServerHarness).toHaveBeenCalledWith({ ambiente: {} })
    })

    it('⛔ AL CONTRARIO — una sola chiave assente (deepseek) resta fuori dall\'ambiente, le altre quattro no', async () => {
        getProviderKeyFinta.mockImplementation(chiaviPerProvider({
            openrouter: 'sk-or', openai: 'sk-oa', anthropic: 'sk-an', gemini: 'sk-ge', deepseek: null,
        }))

        await avviaServerHarnessConChiaveProvider()

        const [[argomenti]] = bridge.avviaServerHarness.mock.calls
        expect(Object.hasOwn(argomenti.ambiente, 'DEEPSEEK_API_KEY')).toBe(false)
        expect(Object.keys(argomenti.ambiente)).toHaveLength(4)
    })

    it('torna l\'esito reale del plugin (giaAttivo incluso), non un valore inventato', async () => {
        getProviderKeyFinta.mockResolvedValue('sk-x')
        bridge.avviaServerHarness.mockResolvedValue({
            ok: true, giaAttivo: true, stdout: '12345', stderr: '', exitCode: 0, motivo: null,
        })

        const esito = await avviaServerHarnessConChiaveProvider()

        expect(esito).toEqual({ ok: true, giaAttivo: true, stdout: '12345', stderr: '', exitCode: 0, motivo: null })
    })
})
