import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — `caricaProfiliModelloCodice`
 * sostituisce il profilo unico finto (`CODE_MODEL_PROFILES`,
 * `gpt-5.6-sol`) con un catalogo VERO, riusando esattamente i pezzi che
 * `chatController.ts` chiama per Chat. Qui tutto è finto — plugin
 * nativi, chiavi, rete — per provare SOLO la logica di aggregazione e
 * il caso speciale "un provider fallisce, gli altri restano".
 */
const providerRegistryMock = vi.hoisted(() => ({
    providerAdapterFor: vi.fn(),
}))
vi.mock('@/lib/chat/providerRegistry', () => providerRegistryMock)

const secureKeyStoreMock = vi.hoisted(() => ({
    getProviderKey: vi.fn(),
    hasProviderKey: vi.fn(),
}))
vi.mock('@/services/secureKeyStore', () => secureKeyStoreMock)

const providerEndpointStoreMock = vi.hoisted(() => ({
    getProviderEndpoint: vi.fn(),
}))
vi.mock('@/services/providerEndpointStore', () => providerEndpointStoreMock)

vi.mock('@/lib/chat/httpTransport', () => ({ talosMobileHttpTransport: { name: 'transport-finto' } }))

vi.mock('@/lib/mobileProviders', () => ({
    TALOS_MOBILE_PROVIDERS: [
        { id: 'openrouter', label: 'OpenRouter', shortLabel: 'OR', requiresSecret: true, tone: 'blue', logoAlt: '', configurable: true },
        { id: 'openai', label: 'OpenAI', shortLabel: 'OA', requiresSecret: true, tone: 'green', logoAlt: '', configurable: true },
        { id: 'local', label: 'Locale', shortLabel: 'L', requiresSecret: false, tone: 'neutral', logoAlt: '', configurable: true },
    ],
}))

const { caricaProfiliModelloCodice } = await import('@/lib/harness/codiceModelProfiles')

function adapterFinto(opzioni: { requiresSecret?: boolean, requiresEndpoint?: boolean, listModels: (...args: unknown[]) => Promise<{ models: unknown[] }> }) {
    return { requiresSecret: opzioni.requiresSecret ?? true, requiresEndpoint: opzioni.requiresEndpoint ?? false, listModels: opzioni.listModels }
}

beforeEach(() => {
    providerRegistryMock.providerAdapterFor.mockReset()
    secureKeyStoreMock.getProviderKey.mockReset()
    secureKeyStoreMock.hasProviderKey.mockReset()
    providerEndpointStoreMock.getProviderEndpoint.mockReset().mockResolvedValue(null)
})

describe('caricaProfiliModelloCodice()', () => {
    it('scarica il catalogo VERO per un provider con la chiave configurata', async () => {
        secureKeyStoreMock.getProviderKey.mockImplementation(async (provider: string) => (provider === 'openrouter' ? 'sk-or-vera' : null))
        secureKeyStoreMock.hasProviderKey.mockImplementation(async (provider: string) => provider === 'openrouter')
        const listModelsOpenRouter = vi.fn(async () => ({
            models: [{
                id: 'z-ai/glm-4.7-flash', provider: 'openrouter', displayName: 'GLM 4.7 Flash',
                chatCompatibility: 'supported', inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
            }],
        }))
        providerRegistryMock.providerAdapterFor.mockImplementation((provider: string) => {
            if (provider === 'openrouter') return adapterFinto({ listModels: listModelsOpenRouter })
            return adapterFinto({ listModels: vi.fn(async () => ({ models: [] })) })
        })

        const profili = await caricaProfiliModelloCodice()

        expect(listModelsOpenRouter).toHaveBeenCalledWith({ apiKey: 'sk-or-vera', endpoint: null, timeoutMs: undefined }, { name: 'transport-finto' })
        expect(profili).toHaveLength(1)
        expect(profili[0]).toMatchObject({ id: 'openrouter:z-ai/glm-4.7-flash', provider: 'openrouter', model: 'z-ai/glm-4.7-flash', has_secret: true })
    })

    /**
     * AL CONTRARIO: senza chiave, il provider non viene NEMMENO interrogato
     * — stessa guardia di refreshProvider() in chatController.ts.
     */
    it('AL CONTRARIO: un provider SENZA chiave non viene interrogato affatto', async () => {
        secureKeyStoreMock.getProviderKey.mockResolvedValue(null)
        secureKeyStoreMock.hasProviderKey.mockResolvedValue(false)
        const listModels = vi.fn(async () => ({ models: [] }))
        providerRegistryMock.providerAdapterFor.mockImplementation((provider: string) => (
            provider === 'local' ? adapterFinto({ requiresSecret: false, listModels }) : adapterFinto({ listModels })
        ))

        await caricaProfiliModelloCodice()

        // Solo 'local' (requiresSecret:false) viene interrogato — openrouter/openai no.
        expect(listModels).toHaveBeenCalledTimes(1)
    })

    it('un provider che fallisce (rete, chiave scaduta) non svuota gli altri', async () => {
        secureKeyStoreMock.getProviderKey.mockResolvedValue('sk-qualunque')
        secureKeyStoreMock.hasProviderKey.mockResolvedValue(true)
        const listModelsRotto = vi.fn(async () => { throw new Error('rete giù') })
        const listModelsBuono = vi.fn(async () => ({
            models: [{
                id: 'gpt-5.6-sol', provider: 'openai', displayName: 'gpt-5.6-sol',
                chatCompatibility: 'supported', inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
            }],
        }))
        providerRegistryMock.providerAdapterFor.mockImplementation((provider: string) => (
            provider === 'openrouter' ? adapterFinto({ listModels: listModelsRotto }) : adapterFinto({ listModels: listModelsBuono })
        ))

        const profili = await caricaProfiliModelloCodice()

        expect(profili.some((p) => p.provider === 'openai' && p.model === 'gpt-5.6-sol')).toBe(true)
        expect(profili.some((p) => p.provider === 'openrouter')).toBe(false)
    })

    it('"local" ha sempre has_secret:true, per costruzione — mai chiedere una chiave che non esiste', async () => {
        secureKeyStoreMock.getProviderKey.mockResolvedValue(null)
        secureKeyStoreMock.hasProviderKey.mockResolvedValue(false)
        const listModelsLocale = vi.fn(async () => ({
            models: [{
                id: 'modello-sul-disco', provider: 'local', displayName: 'Modello locale',
                chatCompatibility: 'supported', inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
            }],
        }))
        providerRegistryMock.providerAdapterFor.mockImplementation((provider: string) => (
            provider === 'local' ? adapterFinto({ requiresSecret: false, listModels: listModelsLocale }) : adapterFinto({ listModels: vi.fn(async () => ({ models: [] })) })
        ))

        const profili = await caricaProfiliModelloCodice()

        expect(profili).toHaveLength(1)
        expect(profili[0].has_secret).toBe(true)
    })
})
