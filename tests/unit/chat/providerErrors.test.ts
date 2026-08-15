import { describe, expect, it } from 'vitest'
import {
    TalosMobileProviderError,
    malformedProviderResponse,
    normalizeHttpEndpoint,
    requireProviderApiKey,
} from '@/lib/chat/providerErrors'

function capture(run: () => unknown): TalosMobileProviderError {
    try {
        run()
    } catch (error) {
        expect(error).toBeInstanceOf(TalosMobileProviderError)
        return error as TalosMobileProviderError
    }
    throw new Error('Expected provider error')
}

describe('provider error localization metadata', () => {
    it('I18N-TS-04 keeps missing-key and endpoint validation machine-stable and localizable', () => {
        const key = capture(() => requireProviderApiKey('anthropic', 'complete', { apiKey: null }))
        expect(key.message).toBe('TALOS_PROVIDER_KEY_REQUIRED')
        expect(key.uiMessageKey).toBe('models.providerKeyRequired')
        expect(key.uiMessageParameters).toEqual({ provider: 'anthropic' })

        const endpoint = capture(() => normalizeHttpEndpoint('ollama', 'complete', 'ftp://localhost'))
        expect(endpoint.message).toBe('TALOS_PROVIDER_ENDPOINT_PROTOCOL')
        expect(endpoint.uiMessageKey).toBe('models.providerEndpointProtocol')
        expect(endpoint.uiMessageParameters).toEqual({ provider: 'ollama' })
    })

    it('I18N-TS-04 describes malformed provider responses without localizing wire values', () => {
        const error = malformedProviderResponse('gemini', 'list_models')
        expect(error.message).toBe('TALOS_PROVIDER_RESPONSE_MALFORMED')
        expect(error.uiMessageKey).toBe('models.providerCatalogMalformed')
        expect(error.uiMessageParameters).toEqual({ provider: 'gemini' })
    })
})

