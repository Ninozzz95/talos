import { beforeEach, describe, expect, it, vi } from 'vitest'

const prefs = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => {
            if (key === 'rotto') throw new Error('magazzino illeggibile')
            return { value: prefs.get(key) ?? null }
        },
        set: async ({ key, value }: { key: string, value: string }) => { prefs.set(key, value) },
    },
}))

const {
    TALOS_LOCAL_BACKEND_PREFERENCE_KEY,
    talosStoredLocalBackendPreference,
} = await import('@/lib/models/localBackendPreferenceStore')

/**
 * La metà che LEGGE la scelta «CPU · GPU · Hexagon».
 *
 * ⛔ Il verso contrario è la parte che conta: qualunque cosa non sia
 * esattamente la forma attesa deve tornare al predefinito, mai una modalità a
 * metà — una preferenza `manual` senza una scelta dentro bloccherebbe la
 * misura senza avere niente da rispettare.
 */
describe('talosStoredLocalBackendPreference', () => {
    beforeEach(() => { prefs.clear() })

    it('niente salvato: la modalità è `auto` e non c è nessuna scelta', async () => {
        await expect(talosStoredLocalBackendPreference()).resolves.toEqual({
            mode: 'auto', manual: null,
        })
    })

    it('rilegge una scelta manuale esattamente com era stata scritta', async () => {
        prefs.set(TALOS_LOCAL_BACKEND_PREFERENCE_KEY, JSON.stringify({ mode: 'manual', manual: 'gpu' }))

        await expect(talosStoredLocalBackendPreference()).resolves.toEqual({
            mode: 'manual', manual: 'gpu',
        })
    })

    it('AL CONTRARIO — un JSON storto vale «nessuna scelta», non un guasto', async () => {
        prefs.set(TALOS_LOCAL_BACKEND_PREFERENCE_KEY, '{questo non è json')

        await expect(talosStoredLocalBackendPreference()).resolves.toEqual({
            mode: 'auto', manual: null,
        })
    })

    it('AL CONTRARIO — `manual` senza una scelta dentro torna al predefinito', async () => {
        prefs.set(TALOS_LOCAL_BACKEND_PREFERENCE_KEY, JSON.stringify({ mode: 'manual' }))

        await expect(talosStoredLocalBackendPreference()).resolves.toEqual({
            mode: 'auto', manual: null,
        })
    })

    it('AL CONTRARIO — un backend che non esiste non diventa una scelta', async () => {
        prefs.set(
            TALOS_LOCAL_BACKEND_PREFERENCE_KEY,
            JSON.stringify({ mode: 'manual', manual: 'quantum' }),
        )

        await expect(talosStoredLocalBackendPreference()).resolves.toEqual({
            mode: 'auto', manual: null,
        })
    })

    /** La chiave è una costante condivisa: la fase dell'interfaccia scriverà QUESTA. */
    it('la chiave è quella dichiarata, e non cambia di nascosto', () => {
        expect(TALOS_LOCAL_BACKEND_PREFERENCE_KEY).toBe('talos.engine.backend.v1')
    })
})
