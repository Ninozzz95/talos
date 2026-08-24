import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Owner 24/8: «mockup visibile solo nella apk di debug, in quello di
 * release lo nascondiamo». Qui si prova SOLO la decisione — che legge
 * `Capacitor.isPluginAvailable`, non `import.meta.env.DEV` (quello
 * riflette il bundle Vite, non la variante Android, vedi il commento nel
 * sorgente). Il vero cancello (la classe che non compila in release) vive
 * in Kotlin/Gradle e non è provabile da qui: questo test prova che il
 * lato JS legge il segnale giusto, non che Gradle lo produca.
 */
const nativo = vi.hoisted(() => ({ disponibile: false }))
vi.mock('@capacitor/core', () => ({
    Capacitor: { isPluginAvailable: (nome: string) => nativo.disponibile && nome === 'TalosHarnessUi' },
    registerPlugin: () => ({}),
}))

import { talosHarnessUiAvailable, TALOS_HARNESS_UI_PATH } from '@/services/harnessUi'

describe('talosHarnessUiAvailable', () => {
    afterEach(() => { nativo.disponibile = false })

    it('è false quando il plugin nativo non esiste (build di release, il caso di oggi)', () => {
        nativo.disponibile = false
        expect(talosHarnessUiAvailable()).toBe(false)
    })

    it('è true solo quando il plugin nativo TalosHarnessUi è registrato (build di debug)', () => {
        nativo.disponibile = true
        expect(talosHarnessUiAvailable()).toBe(true)
    })
})

describe('TALOS_HARNESS_UI_PATH', () => {
    it('è un percorso assoluto, non relativo alla pagina corrente', () => {
        // AL CONTRARIO del bug che questo previene: un percorso relativo
        // toccato da /settings risolverebbe a /settings/harness-ui/..., che
        // non esiste — il bundle statico vive alla radice (public/harness-ui/).
        expect(TALOS_HARNESS_UI_PATH.startsWith('/')).toBe(true)
        expect(TALOS_HARNESS_UI_PATH).toBe('/harness-ui/index.html')
    })
})
