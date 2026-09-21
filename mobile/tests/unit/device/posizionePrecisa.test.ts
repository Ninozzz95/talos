import { describe, expect, it, vi } from 'vitest'
import { talosLeggiPosizione } from '@/lib/device/posizione'
import { createTalosDeviceTools } from '@/lib/tools/deviceTools'

/**
 * ⛔⛔⛔ POSIZIONE-APPROSSIMATA-01 — TALOS diceva ROMA a chi era a CATANIA.
 *
 * ## Cosa è successo, misurato sul Pad il 2026-08-19
 *
 * Owner, mentre provavo la lingua: «io mi trovo a **Catania** comunque».
 * TALOS aveva appena risposto «La posizione del telefono è: 41.8996° N,
 * 12.4347° E» — che è **Roma**, cioè 500 km più a nord.
 *
 * Ho chiesto al telefono, non alla risposta:
 *
 * ```
 *   ACCESS_FINE_LOCATION:   granted=false   USER_FIXED
 *   ACCESS_COARSE_LOCATION: granted=true
 *
 *   dumpsys location
 *     fused    last location = 37.55…, 15.08…   hAcc=100 m
 *     network  last location = 37.55…, 15.08…   hAcc=42,9 m     ← Catania
 * ```
 *
 * ⇒ Due fatti distinti, e vanno tenuti distinti:
 *
 * 1. **Il sistema sapeva**: 37,55 / 15,08 con 43 metri di incertezza. Catania.
 * 2. **Il permesso PRECISO è negato**, e negato con `USER_FIXED` — cioè Android
 *    non mostrerà più il dialogo. TALOS aveva solo l'**approssimata**, e la
 *    usava **senza dirlo a nessuno**.
 *
 * ## ⛔ Il difetto qui NON è l'imprecisione: è il SILENZIO
 *
 * `const concesso = stato.location === 'granted' || stato.coarseLocation === 'granted'`
 *
 * Una riga sola, e dentro c'è tutto: con l'approssimata concessa il codice non
 * chiedeva **mai** la precisa e non distingueva **mai** i due casi. Il risultato
 * usciva identico a quello di un fix GPS — stesse due coordinate, stessa frase —
 * e la persona non aveva modo di sapere che le stavamo dando l'isolato sbagliato.
 *
 * Owner 2026-08-19: «**DEVI USARE POSIZIONE PRECISA**».
 *
 * ⇒ Si chiede la precisa; se c'è solo l'approssimata si legge lo stesso — un
 * dato approssimato è meglio del silenzio — ma **si dichiara**, e si dice dove
 * si cambia. Un numero che non sai quanto vale è peggio di un numero grande.
 */

const CATANIA = { latitude: 37.5512, longitude: 15.0846, accuracy: 43 }

function pluginCon(permessi: { location: string, coarseLocation?: string }, dopoRichiesta = permessi) {
    return {
        getCurrentPosition: vi.fn().mockResolvedValue({ coords: CATANIA, timestamp: 1_000_000 }),
        checkPermissions: vi.fn().mockResolvedValue(permessi),
        requestPermissions: vi.fn().mockResolvedValue(dopoRichiesta),
    }
}

const ORA = () => 1_000_000

describe('POSIZIONE-APPROSSIMATA-01 la precisa si chiede, e l\'approssimata si dichiara', () => {
    it('col permesso PRECISO concesso la lettura è dichiarata precisa', async () => {
        const plugin = pluginCon({ location: 'granted', coarseLocation: 'granted' })
        const esito = await talosLeggiPosizione({ plugin, platform: 'android', now: ORA })

        expect(esito.stato).toBe('letta')
        expect(esito.precisa).toBe(true)
    })

    it('⛔ con la sola APPROSSIMATA la precisa viene CHIESTA', async () => {
        const plugin = pluginCon({ location: 'denied', coarseLocation: 'granted' })
        await talosLeggiPosizione({ plugin, platform: 'android', now: ORA })

        expect(plugin.requestPermissions).toHaveBeenCalled()
        const chiesti = plugin.requestPermissions.mock.calls.at(-1)?.[0]?.permissions
        expect(chiesti).toContain('location')
    })

    it('⛔ se la precisa resta negata si legge lo stesso, ma NON si spaccia per precisa', async () => {
        // Il caso vero del Pad: `USER_FIXED`, quindi la richiesta torna subito
        // negata senza mostrare niente. Rifiutare qui vorrebbe dire perdere una
        // posizione che il telefono ha.
        const plugin = pluginCon({ location: 'denied', coarseLocation: 'granted' })
        const esito = await talosLeggiPosizione({ plugin, platform: 'android', now: ORA })

        expect(esito.stato).toBe('letta')
        expect(esito.precisa).toBe(false)
        expect(esito.latitudine).toBe(37.5512)
    })

    it('senza NESSUN permesso resta un rifiuto, come prima', async () => {
        const plugin = pluginCon({ location: 'denied', coarseLocation: 'denied' })
        const esito = await talosLeggiPosizione({ plugin, platform: 'android', now: ORA })

        expect(esito.stato).toBe('negato')
        expect(plugin.getCurrentPosition).not.toHaveBeenCalled()
    })

    it('⛔ la precisa si chiede UNA volta sola: concessa, non si richiede più', async () => {
        const plugin = pluginCon({ location: 'granted', coarseLocation: 'granted' })
        await talosLeggiPosizione({ plugin, platform: 'android', now: ORA })

        expect(plugin.requestPermissions).not.toHaveBeenCalled()
    })
})

function fonti(posizione: unknown) {
    return {
        location: async () => posizione,
        torch: async () => ({ done: true }),
        vibrate: async () => ({ done: true, appliedMs: 0 }),
        volume: async () => ({ done: true, percent: 0 }),
        alarm: async () => ({ done: true }),
        openApp: async () => ({ done: true }),
        openSettingsScreen: async () => ({ done: true }),
        compose: async () => ({ done: true }),
        status: async () => ({}),
        wallpaper: async () => ({ done: true, appliedTo: 'home' }),
        keepAwake: async () => ({ done: true, on: true }),
        media: async () => ({ done: true, playing: false }),
        speak: async () => ({ done: true }),
        stopSpeaking: async () => ({ done: true }),
    } as never
}

const LETTA = {
    stato: 'letta' as const,
    latitudine: 37.5512,
    longitudine: 15.0846,
    precisioneMetri: 43,
    etaSecondi: 5,
}

const strumento = (posizione: unknown) =>
    createTalosDeviceTools(fonti(posizione)).find((tool) => tool.name === 'device_location')!

describe('POSIZIONE-APPROSSIMATA-01 il tool dice quando il dato è approssimato', () => {
    it('⛔ un fix APPROSSIMATO viene dichiarato tale nel risultato', async () => {
        const esito = await strumento({ ...LETTA, precisa: false }).run({} as never, {} as never)

        expect(esito.content).toMatch(/approximate/i)
        // E si dice DOVE si cambia: un avviso senza rimedio è solo un rimprovero.
        expect(esito.content).toMatch(/precise/i)
    })

    it('⛔ e al contrario: un fix PRECISO non porta nessun avviso', async () => {
        const esito = await strumento({ ...LETTA, precisa: true }).run({} as never, {} as never)

        expect(esito.content).not.toMatch(/approximate/i)
        expect(esito.content).toContain('37.5512')
    })

    it('le coordinate e l\'età restano quelle di prima, in entrambi i casi', async () => {
        for (const precisa of [true, false]) {
            const esito = await strumento({ ...LETTA, precisa }).run({} as never, {} as never)
            expect(esito.content).toContain('37.5512')
            expect(esito.content).toContain('15.0846')
            expect(esito.content).toMatch(/43\s*m/)
        }
    })
})
