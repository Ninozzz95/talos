import { describe, expect, it, vi } from 'vitest'
import {
    TalosMobileProviderError,
    isTransientProviderStatus,
    malformedProviderResponse,
    normalizeHttpEndpoint,
    parseRetryAfterMs,
    providerRetryDelayMs,
    requireProviderApiKey,
    sendWithProviderRetry,
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

describe('DEBT-MOBILE-016 — a 429 is a traffic limit, not a failure', () => {
    it('marks 429/408/5xx as transient, everything else as not', () => {
        expect(isTransientProviderStatus(429)).toBe(true)
        expect(isTransientProviderStatus(408)).toBe(true)
        expect(isTransientProviderStatus(500)).toBe(true)
        expect(isTransientProviderStatus(599)).toBe(true)
        expect(isTransientProviderStatus(200)).toBe(false)
        expect(isTransientProviderStatus(400)).toBe(false)
        expect(isTransientProviderStatus(401)).toBe(false)
        expect(isTransientProviderStatus(402)).toBe(false)
        expect(isTransientProviderStatus(404)).toBe(false)
    })

    it('reads Retry-After as seconds per RFC 9110, case-insensitively upstream', () => {
        expect(parseRetryAfterMs('120')).toBe(120_000)
        expect(parseRetryAfterMs('0')).toBe(0)
    })

    it('reads Retry-After as an HTTP-date, clamped to zero if already past', () => {
        const now = () => Date.parse('2026-08-28T00:00:00Z')
        expect(parseRetryAfterMs('Fri, 28 Aug 2026 00:00:30 GMT', now)).toBe(30_000)
        expect(parseRetryAfterMs('Fri, 28 Aug 2026 00:00:00 GMT', now)).toBe(0)
        // AL CONTRARIO — a date in the past never produces a negative wait.
        expect(parseRetryAfterMs('Thu, 27 Aug 2026 00:00:00 GMT', now)).toBe(0)
    })

    it('AL CONTRARIO — missing or unparseable Retry-After never invents a number', () => {
        expect(parseRetryAfterMs(undefined)).toBeNull()
        expect(parseRetryAfterMs('')).toBeNull()
        expect(parseRetryAfterMs('not a duration')).toBeNull()
    })

    it('grows the computed backoff exponentially with jitter up to half the base, same formula as attesaDelTentativo', () => {
        expect(providerRetryDelayMs(0, () => 0)).toBe(500)
        expect(providerRetryDelayMs(0, () => 1)).toBe(750)
        expect(providerRetryDelayMs(2, () => 0)).toBe(2000)
        expect(providerRetryDelayMs(2, () => 1)).toBe(3000)
    })

    it('retries a transient status until it succeeds, waiting between attempts', async () => {
        const send = vi.fn()
            .mockResolvedValueOnce({ status: 429, data: null })
            .mockResolvedValueOnce({ status: 429, data: null })
            .mockResolvedValueOnce({ status: 200, data: { ok: true } })
        const wait = vi.fn().mockResolvedValue(undefined)
        const result = await sendWithProviderRetry(send, { wait, random: () => 0 })
        expect(result).toEqual({ status: 200, data: { ok: true } })
        expect(send).toHaveBeenCalledTimes(3)
        expect(wait).toHaveBeenCalledTimes(2)
    })

    it('AL CONTRARIO — a non-transient status returns on the first attempt, never waits', async () => {
        const send = vi.fn().mockResolvedValue({ status: 400, data: { error: 'bad request' } })
        const wait = vi.fn().mockResolvedValue(undefined)
        const result = await sendWithProviderRetry(send, { wait })
        expect(result).toEqual({ status: 400, data: { error: 'bad request' } })
        expect(send).toHaveBeenCalledTimes(1)
        expect(wait).not.toHaveBeenCalled()
    })

    it('honors Retry-After over the computed backoff when the provider sends one', async () => {
        const send = vi.fn()
            .mockResolvedValueOnce({ status: 429, data: null, headers: { 'Retry-After': '7' } })
            .mockResolvedValueOnce({ status: 200, data: {} })
        const wait = vi.fn().mockResolvedValue(undefined)
        await sendWithProviderRetry(send, { wait, random: () => 1 })
        // random: () => 1 would push the computed fallback to 750ms — 7000 proves the header won.
        expect(wait).toHaveBeenCalledWith(7_000)
    })

    it('gives up after maxAttempts and returns the last response unchanged, never loops forever', async () => {
        const send = vi.fn().mockResolvedValue({ status: 429, data: null })
        const wait = vi.fn().mockResolvedValue(undefined)
        const result = await sendWithProviderRetry(send, { wait, maxAttempts: 3 })
        expect(result).toEqual({ status: 429, data: null })
        expect(send).toHaveBeenCalledTimes(3)
        expect(wait).toHaveBeenCalledTimes(2)
    })
})

