import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ I CINQUANTA SECONDI CHE NESSUN NUMERO DICHIARAVA.
 *
 * Misurato sul Pad il 2026-09-10 (ledger §44): il primo messaggio di una chat
 * nuova con `gemma-4-E2B-it-Q4_0` sulla GPU costa **76 secondi** alla prima
 * parola, e **50** sono i soli pesi che si spostano dal file alla scheda
 * grafica. Per tutti e 50 lo schermo mostrava l'animazione dei tre puntini e
 * nient'altro — e la riga dei numeri, dopo, ne dichiarava **24,2**.
 *
 * ## ⛔ Perche' queste prove guardano il `null`
 *
 * Il difetto naturale qui e' trattare «non lo so» come «zero». Una barra che
 * torna a zero sembra un caricamento **ricominciato da capo**, ed e' la cosa
 * peggiore da mostrare a chi sta aspettando da quaranta secondi. Il nativo
 * distingue i due stati con `-1`, e questa e' la meta' che deve continuare a
 * distinguerli anche quando il ponte non risponde affatto.
 */

const ponte = vi.hoisted(() => ({
    loadProgress: vi.fn(),
    cancelLoad: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => ponte,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))

vi.mock('@capacitor/preferences', () => ({
    Preferences: { get: vi.fn(async () => ({ value: null })), set: vi.fn(async () => {}) },
}))

const { talosLocalModelLoadProgress, talosCancelLocalModelLoad } =
    await import('@/services/localEngine')

describe('CARICO — a che punto e\' il modello', () => {
    beforeEach(() => {
        ponte.loadProgress.mockReset()
        ponte.cancelLoad.mockReset()
    })

    it('CAR-01 mentre carica torna la FRAZIONE, non i millesimi', async () => {
        ponte.loadProgress.mockResolvedValue({ permille: 342, loading: true })
        expect(await talosLocalModelLoadProgress()).toBeCloseTo(0.342, 5)
    })

    /**
     * ⛔ IL TEST CHE MORDE. `loading: false` arriva col `permille: -1` del
     * nativo: chi lo dividesse per mille senza guardare `loading` disegnerebbe
     * una barra a **-0,1%**, cioe' un numero impossibile che nessun tipo
     * impedisce.
     */
    it('CAR-02 quando NON carica torna null, non un numero negativo', async () => {
        ponte.loadProgress.mockResolvedValue({ permille: -1, loading: false })
        expect(await talosLocalModelLoadProgress()).toBeNull()
    })

    it('CAR-03 un ponte che non risponde e\' «non lo so», non zero', async () => {
        ponte.loadProgress.mockRejectedValue(new Error('bridge'))
        expect(await talosLocalModelLoadProgress()).toBeNull()
    })

    /**
     * ⛔ Il verso contrario del CAR-02: un `loading: true` con un valore
     * assurdo non deve passare per buono. Il nativo gia' lo limita, ma il ponte
     * non e' l'unico chiamante possibile di questa funzione.
     */
    it('CAR-04 un valore fuori scala viene tagliato a 1, mai oltre', async () => {
        ponte.loadProgress.mockResolvedValue({ permille: 4000, loading: true })
        expect(await talosLocalModelLoadProgress()).toBe(1)
    })

    it('CAR-05 un permille che non e\' un numero e\' «non lo so»', async () => {
        ponte.loadProgress.mockResolvedValue({ permille: Number.NaN, loading: true })
        expect(await talosLocalModelLoadProgress()).toBeNull()
    })

    it('CAR-06 annullare chiede al motore e riporta il suo si\'', async () => {
        ponte.cancelLoad.mockResolvedValue({ ok: true })
        expect(await talosCancelLocalModelLoad()).toBe(true)
        expect(ponte.cancelLoad).toHaveBeenCalledTimes(1)
    })

    /**
     * ⛔ AL CONTRARIO: se il ponte cade, «annullato» sarebbe una bugia —
     * il caricamento sta ancora andando avanti, e a schermo il pulsante deve
     * restare premibile invece di sparire come se avesse funzionato.
     */
    it('CAR-07 se il ponte cade, annullare dichiara di NON esserci riuscito', async () => {
        ponte.cancelLoad.mockRejectedValue(new Error('bridge'))
        expect(await talosCancelLocalModelLoad()).toBe(false)
    })
})
