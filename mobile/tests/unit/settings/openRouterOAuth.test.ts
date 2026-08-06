// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
    TALOS_OAUTH_CALLBACK_PATH,
    talosBase64Url,
    talosCreateCodeChallenge,
    talosCreateCodeVerifier,
    talosExchangeOpenRouterCode,
    talosOpenRouterAuthUrl,
    talosOpenRouterCallbackUrl,
    talosReadOpenRouterCode,
} from '@/lib/auth/openRouterOAuth'
import { talosLoginWithOpenRouter, type TalosOpenRouterLoginDeps } from '@/services/openRouterLogin'

/**
 * Accedere a OpenRouter senza incollare una chiave.
 *
 * Owner 2026-08-06: «oauth per i provider assieme ad api key». La ricerca ha
 * ristretto il campo a uno solo — TALOS è distribuita, quindi un
 * `client_secret` dentro l'APK non è un segreto, e degli altri quattro provider
 * nessuno offre un flusso per client pubblici.
 *
 * Queste prove guardano i conti, non il telefono: la porta nativa e il browser
 * sono sostituiti, così le decisioni che contano restano provabili su qualunque
 * macchina.
 */
describe('i conti di PKCE', () => {
    it('il verificatore ha la lunghezza giusta e solo caratteri ammessi', () => {
        const verifier = talosCreateCodeVerifier()
        expect(verifier.length).toBeGreaterThanOrEqual(43)
        expect(verifier.length).toBeLessThanOrEqual(128)
        expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    })

    it('due verificatori di fila non sono lo stesso', () => {
        expect(talosCreateCodeVerifier()).not.toBe(talosCreateCodeVerifier())
    })

    /**
     * Il vettore di RFC 7636 appendice B: se questo passa, la sfida che
     * mandiamo è quella che il server si aspetta. Un conto sbagliato qui non
     * fallirebbe a compilazione né in prova manuale — fallirebbe soltanto
     * sull'ultimo passo, sul telefono di chi accede.
     */
    it('la sfida è quella dello standard, byte per byte', async () => {
        const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
        expect(await talosCreateCodeChallenge(verifier))
            .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    })

    it('base64url non lascia passare +, / o riempimento', () => {
        expect(talosBase64Url(new Uint8Array([251, 255, 190]))).toBe('-_--')
    })
})

describe('l\'indirizzo di autorizzazione', () => {
    it('porta la sfida con il metodo S256, mai in chiaro', () => {
        const url = new URL(talosOpenRouterAuthUrl({
            callbackUrl: 'http://127.0.0.1:51423/talos-openrouter',
            challenge: 'sfida',
        }))
        expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth')
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
        expect(url.searchParams.get('code_challenge')).toBe('sfida')
        expect(url.searchParams.get('callback_url')).toBe('http://127.0.0.1:51423/talos-openrouter')
    })

    /**
     * ⛔ Solo l'anello di ritorno. Legarsi a un indirizzo raggiungibile dalla
     * rete vorrebbe dire che chiunque sul Wi-Fi può bussare alla porta aperta
     * durante un accesso.
     */
    it('il ritorno è sempre su 127.0.0.1', () => {
        expect(talosOpenRouterCallbackUrl(51423)).toBe(`http://127.0.0.1:51423${TALOS_OAUTH_CALLBACK_PATH}`)
        expect(() => talosOpenRouterCallbackUrl(0)).toThrow()
        expect(() => talosOpenRouterCallbackUrl(70000)).toThrow()
    })
})

describe('leggere il codice che rientra', () => {
    it('lo prende dal nostro percorso', () => {
        expect(talosReadOpenRouterCode(`${TALOS_OAUTH_CALLBACK_PATH}?code=abc123`)).toBe('abc123')
    })

    /**
     * Sull'anello locale può bussare qualunque cosa giri sulla macchina. Una
     * richiesta che non riconosciamo non deve nemmeno cominciare uno scambio.
     */
    it('rifiuta un percorso che non è il nostro, e un ritorno senza codice', () => {
        expect(talosReadOpenRouterCode('/altro?code=abc123')).toBeNull()
        expect(talosReadOpenRouterCode(TALOS_OAUTH_CALLBACK_PATH)).toBeNull()
        expect(talosReadOpenRouterCode(`${TALOS_OAUTH_CALLBACK_PATH}?code=`)).toBeNull()
        expect(talosReadOpenRouterCode('')).toBeNull()
    })
})

describe('lo scambio', () => {
    it('manda il codice e il verificatore, e non manda nessun segreto', async () => {
        const chiamate: Array<{ url: string; body: unknown }> = []
        const fetchFinto = vi.fn(async (url: string, init: RequestInit) => {
            chiamate.push({ url, body: JSON.parse(String(init.body)) })
            return { ok: true, json: async () => ({ key: 'sk-or-v1-vera' }) } as Response
        }) as unknown as typeof fetch

        const key = await talosExchangeOpenRouterCode({ code: 'abc', verifier: 'ver' }, fetchFinto)

        expect(key).toBe('sk-or-v1-vera')
        expect(chiamate[0]!.url).toBe('https://openrouter.ai/api/v1/auth/keys')
        expect(chiamate[0]!.body).toEqual({
            code: 'abc',
            code_verifier: 'ver',
            code_challenge_method: 'S256',
        })
        expect(JSON.stringify(chiamate[0]!.body)).not.toContain('secret')
    })

    it('una risposta senza chiave è un fallimento, non una chiave vuota', async () => {
        const senzaChiave = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
        await expect(talosExchangeOpenRouterCode({ code: 'a', verifier: 'v' }, senzaChiave)).rejects.toThrow('TALOS_OAUTH_NO_KEY')
    })
})

describe('il giro completo dell\'accesso', () => {
    function deps(overrides: Partial<TalosOpenRouterLoginDeps> = {}): TalosOpenRouterLoginDeps {
        return {
            loopback: {
                open: vi.fn(async () => ({ port: 51423 })),
                awaitCallback: vi.fn(async () => ({ target: `${TALOS_OAUTH_CALLBACK_PATH}?code=abc` })),
                close: vi.fn(async () => undefined),
            },
            openBrowser: vi.fn(async () => true),
            exchange: vi.fn(async () => 'sk-or-v1-vera'),
            ...overrides,
        }
    }

    it('restituisce la chiave a chi ha chiamato, senza salvarla di nascosto', async () => {
        const d = deps()
        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: true, key: 'sk-or-v1-vera' })
        expect(d.exchange).toHaveBeenCalledWith({ code: 'abc', verifier: expect.any(String) })
    })

    /**
     * ⛔ L'ordine che evita il difetto irriproducibile: se il browser partisse
     * prima dell'ascolto, ogni tanto la risposta arriverebbe su una porta che
     * nessuno sta ascoltando.
     */
    it('si mette in ascolto PRIMA di aprire il browser', async () => {
        const ordine: string[] = []
        const d = deps({
            loopback: {
                open: vi.fn(async () => { ordine.push('apri-porta'); return { port: 51423 } }),
                awaitCallback: vi.fn(async () => {
                    ordine.push('ascolta')
                    return { target: `${TALOS_OAUTH_CALLBACK_PATH}?code=abc` }
                }),
                close: vi.fn(async () => undefined),
            },
            openBrowser: vi.fn(async () => { ordine.push('browser'); return true }),
        })
        await talosLoginWithOpenRouter(d)
        expect(ordine).toEqual(['apri-porta', 'ascolta', 'browser'])
    })

    it('se il browser non si apre, la porta viene richiusa', async () => {
        const chiudi = vi.fn(async () => undefined)
        const d = deps({
            openBrowser: vi.fn(async () => false),
            loopback: {
                open: vi.fn(async () => ({ port: 51423 })),
                awaitCallback: vi.fn(() => new Promise<{ target: string }>(() => {})),
                close: chiudi,
            },
        })
        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: false, reason: 'browser' })
        expect(chiudi).toHaveBeenCalled()
    })

    it('un ritorno senza codice è un annullamento, non un guasto', async () => {
        const d = deps({
            loopback: {
                open: vi.fn(async () => ({ port: 51423 })),
                awaitCallback: vi.fn(async () => ({ target: '/favicon.ico' })),
                close: vi.fn(async () => undefined),
            },
        })
        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: false, reason: 'cancelled' })
    })

    it('una porta che non si apre non manda nessuno sul browser', async () => {
        const apriBrowser = vi.fn(async () => true)
        const d = deps({
            openBrowser: apriBrowser,
            loopback: {
                open: vi.fn(async () => { throw new Error('TALOS_OAUTH_PORT_UNAVAILABLE') }),
                awaitCallback: vi.fn(async () => ({ target: '' })),
                close: vi.fn(async () => undefined),
            },
        })
        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: false, reason: 'port' })
        expect(apriBrowser).not.toHaveBeenCalled()
    })

    it('uno scambio fallito lo dice, e non salva niente', async () => {
        const d = deps({ exchange: vi.fn(async () => { throw new Error('boom') }) })
        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: false, reason: 'exchange' })
    })
})
