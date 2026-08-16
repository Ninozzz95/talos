// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * ⭐⭐⭐ DIVENTARE L'ASSISTENTE SENZA IL PONTE.
 *
 * Owner, 2026-08-16: «bisogna fare in modo di trovare un sotterfugio per
 * impostare talos come assistente anche senza ponte».
 *
 * ## Il fatto che rende necessario questo test
 *
 * `createRequestRoleIntent(ROLE_ASSISTANT)` non apre nessuna finestra, e non e'
 * una stranezza di ColorOS: in `roles.xml` di AOSP il ruolo assistente e'
 * dichiarato `requestable="false"`. MISURATO sul Pad togliendo il ruolo a TALOS
 * per la prova:
 *
 *     {"opened":true,"shown":false,"elapsedMs":53,"granted":false,"resultCode":0}
 *
 * 53 ms e RESULT_CANCELED. ⇒ Il ramo `shown: false` NON e' un caso raro: e'
 * l'unico che capita, su ogni telefono. E fino a oggi portava dritto al ponte
 * ADB, cioe' chi non aveva il ponte non poteva diventare assistente. Mai.
 *
 * ⛔ Questi test guardano l'ORDINE, che e' la cosa che si romperebbe in
 * silenzio: la pagina di sistema prima, il ponte solo se quella non si apre.
 * Un test che si limitasse a «la pagina viene chiamata» resterebbe verde anche
 * se il ponte partisse per primo.
 */

const chiamate = vi.hoisted(() => ({
    ordine: [] as string[],
    /** Se la finestra del ruolo si e' vista davvero (di norma: no). */
    finestraVista: false,
    /** Se la pagina di sistema si apre su questa ROM. */
    paginaSiApre: true,
    /** Se dopo il giro il ruolo risulta preso. */
    ruoloPreso: false,
}))

vi.mock('@/lib/device/ruoloAssistente', () => ({
    talosLeggiRuoloAssistente: vi.fn(async () => ({
        held: chiamate.ruoloPreso,
        canRequest: true,
    })),
    talosChiediRuoloAssistente: vi.fn(async () => {
        chiamate.ordine.push('finestra')
        return { opened: true, shown: chiamate.finestraVista, granted: false }
    }),
    talosApriPaginaAssistente: vi.fn(async () => {
        chiamate.ordine.push('pagina')
        return chiamate.paginaSiApre
    }),
    talosNominaAssistenteColPonte: vi.fn(async () => {
        chiamate.ordine.push('ponte')
        return { ok: false }
    }),
}))

vi.mock('@/lib/device/parola', () => ({
    talosAccendiLaParola: vi.fn(async () => ({ attiva: false })),
    talosLeggiLaParola: vi.fn(async () => ({ attiva: false })),
    talosSpegniLaParola: vi.fn(async () => ({ attiva: false })),
}))

vi.mock('@/lib/device/scorciatoie', () => ({
    talosLeggiScorciatoie: vi.fn(async () => ({ preset: [] })),
    talosPannelloDeiModiAperto: vi.fn(async () => false),
    talosPreset: vi.fn(() => []),
}))

vi.mock('@/services/devicePermissions', () => ({
    openTalosAppSettings: vi.fn(async () => ({ opened: true })),
    readTalosDeviceState: vi.fn(async () => ({
        microphone: 'prompt',
        notifications: 'prompt',
        notificationsRuntime: false,
        biometricHardware: false,
        batteryExempt: false,
        manufacturer: '',
        brand: '',
        runtime: {},
    })),
    requestTalosNotifications: vi.fn(async () => 'prompt'),
}))

vi.mock('@capacitor/app', () => ({
    App: {
        getInfo: vi.fn(async () => ({ id: 'ai.talos.dev' })),
        addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
    },
}))

/*
 * ⛔ La schermata registra `TalosPrivilege` per conto suo, per la sezione del
 * ponte, e su web ogni suo metodo lancia «not implemented». Quelle promesse
 * rifiutate non riguardano il ruolo, ma cadono come «unhandled rejection» e
 * fanno rossa la corsa senza che nessuna asserzione sia fallita — cioe' un
 * rosso che parla della cosa sbagliata.
 *
 * Il finto risponde `{}` a qualunque metodo: la sezione del ponte resta muta,
 * che e' esattamente cio' che serve a un test sul ruolo.
 */
vi.mock('@capacitor/core', () => {
    const finto = new Proxy({}, { get: () => async () => ({}) })
    return {
        Capacitor: {
            isNativePlatform: () => false,
            getPlatform: () => 'web',
            registerPlugin: () => finto,
        },
        registerPlugin: () => finto,
    }
})

import {
    talosApriPaginaAssistente,
    talosNominaAssistenteColPonte,
} from '@/lib/device/ruoloAssistente'
import PrivilegeScreen from '@/screens/PrivilegeScreen.vue'

beforeEach(() => {
    chiamate.ordine.length = 0
    chiamate.finestraVista = false
    chiamate.paginaSiApre = true
    chiamate.ruoloPreso = false
    vi.clearAllMocks()
})

/** Preme il pulsante «rendi TALOS il tuo assistente» e aspetta il giro. */
async function premiIlPulsante() {
    const schermo = mount(PrivilegeScreen)
    await flushPromises()
    const pulsante = schermo.find('[data-testid="talos-ruolo-chiedi"]')
    expect(pulsante.exists()).toBe(true)
    await pulsante.trigger('click')
    await flushPromises()
    return schermo
}

describe('quando Android non mostra nessuna finestra', () => {
    it('apre la PAGINA DI SISTEMA, e non tocca il ponte', async () => {
        const schermo = await premiIlPulsante()
        /*
         * ⛔ Il cuore della richiesta dell'owner: senza ponte si deve poter
         * diventare assistente lo stesso. Se il ponte parte qui, chi non ce
         * l'ha resta fuori.
         */
        expect(chiamate.ordine).toEqual(['finestra', 'pagina'])
        expect(talosNominaAssistenteColPonte).not.toHaveBeenCalled()
        schermo.unmount()
    })

    it('il ponte resta l ULTIMA carta: parte solo se quella pagina non esiste', async () => {
        chiamate.paginaSiApre = false
        const schermo = await premiIlPulsante()
        // ⛔ E anche qui l'ordine conta: prima si prova la pagina, POI il ponte.
        expect(chiamate.ordine).toEqual(['finestra', 'pagina', 'ponte'])
        schermo.unmount()
    })
})

describe('il verso contrario — quando la persona ha detto di NO', () => {
    it('non apre niente: un rifiuto visto si rispetta', async () => {
        /*
         * ⛔ Questa e' la meta' che rende il test capace di mordere. Se la
         * pagina si aprisse SEMPRE, il primo test resterebbe verde e avremmo
         * scritto una schermata che riapre le impostazioni in faccia a chi ha
         * appena scelto «no» — cioe' il comportamento che questo progetto
         * chiama «prendersi col ponte cio' che e' stato rifiutato».
         */
        chiamate.finestraVista = true
        const schermo = await premiIlPulsante()
        expect(chiamate.ordine).toEqual(['finestra'])
        expect(talosApriPaginaAssistente).not.toHaveBeenCalled()
        expect(talosNominaAssistenteColPonte).not.toHaveBeenCalled()
        schermo.unmount()
    })

    it('se TALOS e GIA l assistente non c e nessun pulsante da premere', async () => {
        /*
         * ⛔ La prima stesura di questo test premeva il pulsante anche qui, e
         * falliva — giustamente. Quando il ruolo c'e' gia', la scheda non
         * mostra nessun comando: `comando: undefined`. Il test aveva torto, non
         * il codice, ed e' un esito che vale la pena fissare: una schermata che
         * offrisse «rendi TALOS il tuo assistente» a chi lo e' gia' sarebbe una
         * bugia gentile.
         */
        chiamate.ruoloPreso = true
        const schermo = mount(PrivilegeScreen)
        await flushPromises()
        expect(schermo.find('[data-testid="talos-ruolo-chiedi"]').exists()).toBe(false)
        expect(chiamate.ordine).toEqual([])
        expect(talosApriPaginaAssistente).not.toHaveBeenCalled()
        schermo.unmount()
    })
})
