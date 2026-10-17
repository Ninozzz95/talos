// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}), CapacitorHttp: { request: vi.fn() }, Capacitor: { Plugins: {} } }))
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {} }))
vi.mock('@/services/inAppBrowserService', () => ({ openTalosLinkOnce: vi.fn(async () => true) }))

import { talosFetchSenzaCors } from '@/services/chatgptAccesso'

/**
 * N15 (mobile, 13/10/2026): dalla WebView (`https://localhost`) `auth.openai.com` non si chiama con `fetch` (CORS); i conti
 * dell'accesso passano dal trasporto nativo dell'app. Qui si prova solo la forma: ciò che parte e ciò che torna.
 */
describe('N15 — la rete dell accesso passa dal trasporto nativo', () => {
    it('N15-RETE-01: un POST a modulo parte com è e la risposta JSON torna leggibile, con lo stato', async () => {
        const request = vi.fn(async () => ({ status: 400, data: { error: 'invalid_grant' }, headers: { 'content-type': 'application/json' } }))
        const r = await talosFetchSenzaCors({ request })('https://auth.openai.com/api/accounts/oauth/token', {
            method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: 'grant_type=refresh_token',
        })
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: 'https://auth.openai.com/api/accounts/oauth/token',
            data: 'grant_type=refresh_token', headers: expect.objectContaining({ 'content-type': 'application/x-www-form-urlencoded' }) }))
        expect(r.status).toBe(400)
        expect(r.ok).toBe(false)
        expect(await r.json()).toEqual({ error: 'invalid_grant' })
    })

    it('N15-RETE-02: un corpo già di testo resta testo; una revoca senza corpo non rompe; un metodo non previsto si rifiuta', async () => {
        const testo = await talosFetchSenzaCors({ request: async () => ({ status: 200, data: '{"issuer":"x"}' }) })('https://auth.openai.com/.well-known/openid-configuration')
        expect(await testo.json()).toEqual({ issuer: 'x' })
        const vuota = await talosFetchSenzaCors({ request: async () => ({ status: 204, data: '' }) })('https://auth.openai.com/revoke', { method: 'POST', body: 'token=x' })
        expect(vuota.status).toBe(204)
        await expect(talosFetchSenzaCors({ request: async () => ({ status: 200, data: '' }) })('https://x', { method: 'DELETE' })).rejects.toThrow(/Unsupported/)
    })
})
