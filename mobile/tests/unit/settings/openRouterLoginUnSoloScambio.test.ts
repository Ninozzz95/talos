// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TALOS_OAUTH_CALLBACK_PATH } from '@/lib/auth/openRouterOAuth'
import {
    talosLoginWithOpenRouter,
    talosRiprendiAccessoOpenRouter,
    type TalosOpenRouterLoginDeps,
} from '@/services/openRouterLogin'

/**
 * N14 — «OpenRouter finicky» (owner 02/10/2026 sera): un codice di autorizzazione vale UN uso.
 *
 * Misurato il 02/10 con i diagnostici dell'owner: `TALOS_OPENROUTER_EXCHANGE` 403 «Invalid code or
 * code_verifier» ×2. Hermes (`auth_openrouter.py:37-40`) lo spiega così: codice non valido, GIÀ USATO o
 * più vecchio di 10 minuti. Qui il codice veniva scambiato due volte: dal flusso vivo e dalla ripresa
 * (`visibilitychange` → `talosRiprendiAccessoOpenRouter`), perché il plugin nativo lascia il target in
 * `pendingTarget` anche quando lo consegna dal vivo e il flusso vivo non lo consumava.
 */
const memoria = vi.hoisted(() => new Map<string, string>())
const registro = vi.hoisted(() => ({ problemi: [] as Array<[string, string]> }))

vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        set: async ({ key, value }: { key: string, value: string }) => { memoria.set(key, value) },
        get: async ({ key }: { key: string }) => ({ value: memoria.get(key) ?? null }),
        remove: async ({ key }: { key: string }) => { memoria.delete(key) },
    },
}))
vi.mock('@/lib/talosDeviceLog', () => ({
    talosLogDeviceIssue: (tag: string, dettaglio: string) => { registro.problemi.push([tag, dettaglio]) },
}))

const TARGET = `${TALOS_OAUTH_CALLBACK_PATH}?code=codice-vero`
const CHIAVE_PKCE = 'talos.openrouter.pkce'

/** Il plugin nativo com'è (`TalosOAuthLoopbackPlugin.java:115-159`): consegna dal vivo E tiene da parte. */
function nativo(opzioni: { consegnaSubito?: boolean } = {}) {
    let inAttesa: string | null = null
    let risolvi: ((valore: { target: string }) => void) | null = null
    const loopback = {
        open: vi.fn(async () => ({ port: 51423 })),
        awaitCallback: vi.fn(() => new Promise<{ target: string }>((fatto) => {
            risolvi = fatto
            if (opzioni.consegnaSubito !== false) {
                inAttesa = TARGET
                fatto({ target: TARGET })
            }
        })),
        pendingCallback: vi.fn(async () => {
            const target = inAttesa
            inAttesa = null
            return { target: target ?? '' }
        }),
        close: vi.fn(async () => undefined),
    }
    return {
        loopback,
        /** Il browser rientra: il nativo tiene da parte il target e risolve chi aspetta. */
        consegna() { inAttesa = TARGET; risolvi?.({ target: TARGET }) },
        soloTieniDaParte() { inAttesa = TARGET },
    }
}

function deps(
    n: ReturnType<typeof nativo>,
    overrides: Partial<TalosOpenRouterLoginDeps> = {},
): TalosOpenRouterLoginDeps {
    return {
        loopback: n.loopback,
        openBrowser: vi.fn(async () => true),
        exchange: vi.fn(async () => 'sk-or-v1-vera'),
        ...overrides,
    }
}

beforeEach(() => {
    memoria.clear()
    registro.problemi.length = 0
})

describe('un codice di autorizzazione, un solo scambio (N14)', () => {
    it('OAUTH-ONCE-01 — accesso vivo e poi ripresa: lo scambio è UNO, la ripresa non trova niente', async () => {
        const n = nativo()
        const d = deps(n)

        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: true, key: 'sk-or-v1-vera' })
        // La pagina torna visibile (visibilitychange): la ripresa non deve rifare lo scambio dello stesso codice.
        await expect(talosRiprendiAccessoOpenRouter(d)).resolves.toBeNull()

        expect(d.exchange).toHaveBeenCalledTimes(1)
        expect(memoria.has(CHIAVE_PKCE)).toBe(false)
    })

    it('OAUTH-ONCE-02 — la ripresa non ruba il codice a un accesso ancora vivo', async () => {
        const n = nativo({ consegnaSubito: false })
        const d = deps(n)

        const login = talosLoginWithOpenRouter(d)
        await vi.waitFor(() => expect(d.openBrowser).toHaveBeenCalled())

        // Il browser ha risposto e la pagina è tornata visibile PRIMA che il flusso vivo abbia finito.
        n.consegna()
        await expect(talosRiprendiAccessoOpenRouter(d)).resolves.toBeNull()
        expect(d.exchange).not.toHaveBeenCalled()

        await expect(login).resolves.toEqual({ ok: true, key: 'sk-or-v1-vera' })
        expect(d.exchange).toHaveBeenCalledTimes(1)
    })

    it('OAUTH-ONCE-03 — attività ricreata (nessun accesso vivo): la ripresa scambia UNA volta e consuma', async () => {
        const n = nativo({ consegnaSubito: false })
        const d = deps(n)
        const verifier = 'v'.repeat(43)
        memoria.set(CHIAVE_PKCE, verifier)
        n.soloTieniDaParte()

        await expect(talosRiprendiAccessoOpenRouter(d)).resolves.toEqual({ ok: true, key: 'sk-or-v1-vera' })
        expect(d.exchange).toHaveBeenCalledWith({ code: 'codice-vero', verifier })
        // Alla visibilitychange successiva non c'è più niente da riprendere.
        await expect(talosRiprendiAccessoOpenRouter(d)).resolves.toBeNull()
        expect(d.exchange).toHaveBeenCalledTimes(1)
    })

    it('OAUTH-ONCE-04 — scambio vivo fallito: la ripresa non ritenta il codice bruciato', async () => {
        const n = nativo()
        const d = deps(n, {
            exchange: vi.fn(async () => { throw new Error('TALOS_OAUTH_EXCHANGE_FAILED:403:{"error":{"message":"Invalid code or code_verifier"}}') }),
        })

        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: false, reason: 'exchange' })
        await expect(talosRiprendiAccessoOpenRouter(d)).resolves.toBeNull()

        expect(d.exchange).toHaveBeenCalledTimes(1)
        expect(memoria.has(CHIAVE_PKCE)).toBe(false)
    })

    it('OAUTH-ONCE-06 — il codice si consuma PRIMA dello scambio: un contesto nuovo non lo ritrova mentre è in volo', async () => {
        const n = nativo()
        let trovatoDuranteLoScambio: { nativo: string, verificatore: boolean } | null = null
        const d = deps(n, {
            exchange: vi.fn(async () => {
                // L'attività viene ricreata proprio ora: cosa vedrebbe la ripresa del contesto nuovo?
                trovatoDuranteLoScambio = {
                    nativo: (await n.loopback.pendingCallback()).target,
                    verificatore: memoria.has(CHIAVE_PKCE),
                }
                return 'sk-or-v1-vera'
            }),
        })

        await talosLoginWithOpenRouter(d)

        expect(trovatoDuranteLoScambio).toEqual({ nativo: '', verificatore: false })
    })

    it('OAUTH-ONCE-07 — un browser che non parte non lascia niente da riprendere', async () => {
        const n = nativo({ consegnaSubito: false })
        n.soloTieniDaParte()
        const d = deps(n, { openBrowser: vi.fn(async () => false) })

        await expect(talosLoginWithOpenRouter(d)).resolves.toEqual({ ok: false, reason: 'browser' })

        expect(memoria.has(CHIAVE_PKCE)).toBe(false)
        expect((await n.loopback.pendingCallback()).target).toBe('')
    })

    it('OAUTH-ONCE-08 — due tocchi di fila: il primo che finisce non spegne la difesa del secondo', async () => {
        const primoRifiuta: Array<(motivo: Error) => void> = []
        let secondoRisolve: ((v: { target: string }) => void) | null = null
        let chiamate = 0
        const loopback = {
            open: vi.fn(async () => ({ port: 51423 })),
            awaitCallback: vi.fn(() => new Promise<{ target: string }>((fatto, rifiuta) => {
                chiamate += 1
                if (chiamate === 1) primoRifiuta.push(rifiuta)
                else secondoRisolve = fatto
            })),
            pendingCallback: vi.fn(async () => ({ target: TARGET })),
            close: vi.fn(async () => undefined),
        }
        const d: TalosOpenRouterLoginDeps = {
            loopback,
            openBrowser: vi.fn(async () => true),
            exchange: vi.fn(async () => 'sk-or-v1-vera'),
        }

        const primo = talosLoginWithOpenRouter(d)
        await vi.waitFor(() => expect(d.openBrowser).toHaveBeenCalledTimes(1))
        const secondo = talosLoginWithOpenRouter(d)
        await vi.waitFor(() => expect(d.openBrowser).toHaveBeenCalledTimes(2))

        // Aprire la porta del secondo chiude quella del primo: il primo finisce annullato.
        primoRifiuta[0]!(new Error('TALOS_OAUTH_CANCELLED'))
        await expect(primo).resolves.toEqual({ ok: false, reason: 'cancelled' })

        // Il secondo è ancora vivo: il suo verificatore resta, e la ripresa non gli ruba il codice.
        expect(memoria.has(CHIAVE_PKCE)).toBe(true)
        await expect(talosRiprendiAccessoOpenRouter(d)).resolves.toBeNull()
        expect(d.exchange).not.toHaveBeenCalled()

        secondoRisolve!({ target: TARGET })
        await expect(secondo).resolves.toEqual({ ok: true, key: 'sk-or-v1-vera' })
        expect(d.exchange).toHaveBeenCalledTimes(1)
    })

    it('OAUTH-ONCE-05 — il log dello scambio fallito dice quale dei due ha fallito', async () => {
        const n = nativo()
        const fallisce = vi.fn(async () => { throw new Error('403') })

        await talosLoginWithOpenRouter(deps(n, { exchange: fallisce }))
        expect(registro.problemi.at(-1)?.[0]).toBe('TALOS_OPENROUTER_EXCHANGE')
        expect(registro.problemi.at(-1)?.[1]).toContain('vivo')

        // Attività ricreata: la ripresa fallisce e lo dice con la propria origine.
        const n2 = nativo({ consegnaSubito: false })
        memoria.set(CHIAVE_PKCE, 'v'.repeat(43))
        n2.soloTieniDaParte()
        await talosRiprendiAccessoOpenRouter(deps(n2, { exchange: fallisce }))
        expect(registro.problemi.at(-1)?.[1]).toContain('ripresa')
    })
})
