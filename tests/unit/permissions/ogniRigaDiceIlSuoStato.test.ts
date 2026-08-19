// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * ⭐⭐ OGNI RIGA DEI PERMESSI DICE IN CHE STATO E' — o tace per una ragione.
 *
 * MISURATO sul Pad il 2026-08-16, riga per riga:
 *
 *     Microfono         → aria «Microfono, Consentito»
 *     Fotocamera        → aria «Fotocamera, Consentito»
 *     Dove ti trovi     → aria «Dove ti trovi»            ⛔ niente
 *     File scelti da te → aria «File scelti da te»        ⛔ niente
 *
 * Otto righe dicevano «Consentito» e due non dicevano NIENTE: l'assenza di una
 * parola faceva il lavoro di una parola, su una pagina il cui unico mestiere e'
 * rispondere «ce l'ha, o no?». E' la ricaduta del difetto del 14 agosto, quando
 * quattro righe comparivano con un cerchio vuoto e nient'altro.
 *
 * Due cause diverse:
 *  - `location` era dichiarata `kind: 'runtime'` — cioe' PROMETTE uno stato — e
 *    il plugin nativo non la raccontava: `stateOf()` tornava `null` per sempre.
 *  - `files` uno stato non ce l'ha per natura: si concede SCEGLIENDO il file.
 *
 * ⛔ E il verso contrario, che e' la meta' che rende questo test capace di
 * mordere: quando lo stato e' IGNOTO perche' il sistema non ha risposto, la
 * riga deve continuare a TACERE. Riempire quel silenzio con «non richiesto»
 * sarebbe inventare un fatto, ed e' esattamente cio' che il pannello vieta a se
 * stesso.
 */
const finto = vi.hoisted(() => ({
    /** Cosa risponde il telefono: vuoto = il ponte non ha risposto. */
    runtime: {} as Record<string, string>,
}))

vi.mock('@/services/devicePermissions', () => ({
    openTalosAppSettings: vi.fn(async () => ({ opened: true })),
    requestTalosNotifications: vi.fn(async () => 'granted'),
    requestTalosRuntimePermission: vi.fn(async () => 'granted'),
    requestTalosBatteryExemption: vi.fn(async () => true),
    readTalosDeviceState: vi.fn(async () => ({
        microphone: 'granted',
        notifications: 'granted',
        notificationsRuntime: true,
        biometricHardware: true,
        batteryExempt: true,
        accessibilityEnabled: false,
        manufacturer: 'oneplus',
        brand: 'oneplus',
        runtime: finto.runtime,
    })),
}))

import TalosMobileSettingsPrivacyPanel from '@/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue'

beforeEach(() => {
    finto.runtime = {}
})

/** Il nome accessibile di una riga: e' cio' che sente chi non vede lo schermo. */
async function nomiDelleRighe() {
    const pannello = mount(TalosMobileSettingsPrivacyPanel)
    await flushPromises()
    const nomi = new Map<string, string>()
    for (const riga of pannello.findAll('[data-permission-row]')) {
        nomi.set(
            riga.attributes('data-permission-row') ?? '',
            riga.attributes('aria-label') ?? '',
        )
    }
    return { nomi, pannello }
}

describe('cosa dice una riga di se stessa', () => {
    it('la POSIZIONE dice il suo stato, come le altre righe runtime', async () => {
        finto.runtime = { location: 'granted', camera: 'granted' }
        const { nomi, pannello } = await nomiDelleRighe()
        expect(nomi.get('location')).toMatch(/,/)
        expect(nomi.get('location')).not.toBe('Where you are')
        // La stessa forma della fotocamera: titolo, virgola, stato.
        expect(nomi.get('location')?.split(',').length)
            .toBe(nomi.get('camera')?.split(',').length)
        pannello.unmount()
    })

    it('i FILE dicono che non c e niente da concedere, invece di tacere', async () => {
        const { nomi, pannello } = await nomiDelleRighe()
        expect(nomi.get('files')).toMatch(/,/)
        pannello.unmount()
    })

    it('⛔ AL CONTRARIO: se il sistema non ha risposto, la riga TACE', async () => {
        /*
         * Nessuna chiave in `runtime`: il ponte non ha risposto. Le righe
         * `runtime` non devono inventarsi uno stato — devono restare il titolo
         * e basta. Se questa asserzione cadesse, avremmo scritto una pagina che
         * dice «non richiesto» a un permesso che magari c'e'.
         */
        finto.runtime = {}
        const { nomi, pannello } = await nomiDelleRighe()
        expect(nomi.get('camera')).not.toMatch(/,/)
        expect(nomi.get('contacts')).not.toMatch(/,/)
        expect(nomi.get('location')).not.toMatch(/,/)
        // ⛔ Ma i file parlano lo stesso: la loro non e' ignoranza, e' natura.
        expect(nomi.get('files')).toMatch(/,/)
        pannello.unmount()
    })
})
