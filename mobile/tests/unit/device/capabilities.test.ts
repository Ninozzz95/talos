import { describe, expect, it } from 'vitest'
import {
    TALOS_DEVICE_CAPABILITIES,
    talosCapability,
    talosCapabilityGap,
    talosNoGuessing,
} from '@/lib/device/capabilities'

/**
 * ⛔ LA REGOLA CHE CI TIENE FUORI DAL 43%.
 *
 * Owner 2026-08-08: «il fatto che già dici anche il migliore arriva al 43% è un
 * self limiting che non accetto per principio. NOI DOBBIAMO FARE DI MEGLIO».
 *
 * Aveva ragione, e la ragione è tecnica: il 43% è la riuscita di chi
 * **indovina** — pixel, inferenza, clic sperato. È la misura di un metodo, non
 * un limite fisico. Leggere un albero strutturato è deterministico; un intent
 * non ha una percentuale di riuscita, o la schermata esiste o non esiste.
 *
 * ⇒ Questi test non chiedono «quanto ci avviciniamo». Chiedono che **nessuna
 * capacità viva nel regime che ha una percentuale**.
 */

describe('⛔ nessuna capacità indovina', () => {
    it('l’inventario è interamente in «chiedi» o «leggi», mai in «indovina»', () => {
        const { clean, guessing } = talosNoGuessing()
        expect(clean, `capacità che indovinano: ${guessing.join(', ')}`).toBe(true)
    })

    it('e ogni capacità dichiara il suo regime, senza scorciatoie', () => {
        const senza = TALOS_DEVICE_CAPABILITIES
            .filter((c) => !['ask', 'read', 'guess'].includes(c.regime))
            .map((c) => c.id)
        expect(senza).toEqual([])
    })

    /**
     * L'accessibilità è il caso in cui è più facile sbagliare regime: dà
     * l'albero, e chi la usa per interpretare uno screenshot butta via la sola
     * cosa che la rende diversa da una fotografia.
     */
    it('l’accessibilità LEGGE, non indovina', () => {
        expect(talosCapability('screen_read')?.regime).toBe('read')
    })

    it('i tocchi partono dall’albero, non dall’occhio', () => {
        expect(talosCapability('screen_touch')?.regime).toBe('read')
    })
})

describe('l’inventario è coerente con sé stesso', () => {
    it('nessun id doppio', () => {
        const ids = TALOS_DEVICE_CAPABILITIES.map((c) => c.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('ogni capacità «speciale» sa DOVE si concede', () => {
        // È la differenza fra «non posso» e «ti ci porto»: senza la schermata,
        // una capacità speciale è un vicolo cieco con una frase gentile davanti.
        const cieche = TALOS_DEVICE_CAPABILITIES
            .filter((c) => c.tier === 'special' && !c.settingsAction)
            .map((c) => c.id)
        expect(cieche, `speciali senza schermata: ${cieche.join(', ')}`).toEqual([])
    })

    it('e nessuna capacità gratuita finge di avere un cancello', () => {
        const finte = TALOS_DEVICE_CAPABILITIES
            .filter((c) => c.tier === 'free' && c.settingsAction !== null)
            .map((c) => c.id)
        expect(finte).toEqual([])
    })

    /**
     * ⭐ Le tre che non chiedono NIENTE, e sono quelle che si notano di più.
     * Se un giorno qualcuno ci mette un permesso per prudenza, questo test
     * chiede perché.
     */
    it('torcia, voce e «apri un’app» non chiedono nessun permesso', () => {
        for (const id of ['torch', 'speak', 'open_app', 'open_settings_screen']) {
            expect(talosCapability(id)?.permission, id).toBeNull()
            expect(talosCapability(id)?.tier, id).toBe('free')
        }
    })
})

/**
 * ⭐ IL METODO CHE VALE IL FILE: mai «non posso» e basta.
 *
 * Gemini dice «non posso farlo». Tasker esegue e non succede niente. Nessuno
 * dei due dice perché, e nessuno porta all'interruttore.
 */
describe('quando non si può, si dice COSA MANCA e DOVE', () => {
    const niente = { shizukuReady: false, granted: new Set<string>() }

    it('una capacità gratuita non ha mai un buco', () => {
        for (const id of ['vibrate', 'torch', 'speak', 'device_status']) {
            expect(talosCapabilityGap(id, niente), id).toBeNull()
        }
    })

    it('una speciale non concessa dice la schermata esatta', () => {
        const gap = talosCapabilityGap('do_not_disturb', niente)
        expect(gap?.settingsAction).toBe('android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS')
        expect(gap?.manualOnly).toBe(false)
    })

    it('e concessa, il buco sparisce', () => {
        const gap = talosCapabilityGap('do_not_disturb', {
            shizukuReady: false,
            granted: new Set(['android.permission.ACCESS_NOTIFICATION_POLICY']),
        })
        expect(gap).toBeNull()
    })

    /**
     * ⛔ Per una capacità Shizuku NON si manda alle impostazioni di sistema.
     * Mandare al Wi-Fi di sistema chi non ha Shizuku è dargli il posto giusto
     * per la ragione sbagliata: crederà di aver risolto, e non avrà risolto.
     */
    it('una capacità Shizuku manda alla NOSTRA pagina, non a quella di sistema', () => {
        const gap = talosCapabilityGap('wifi_toggle', niente)
        expect(gap?.tier).toBe('shell')
        expect(gap?.settingsAction).toBeNull()
        expect(gap?.reasonKey).toBe('deviceGap.needsShizuku')
    })

    it('e con Shizuku pronto non c’è più nessun buco', () => {
        expect(talosCapabilityGap('wifi_toggle', {
            shizukuReady: true, granted: new Set(),
        })).toBeNull()
    })

    it('ogni buco porta una FRASE, mai un codice', () => {
        const senzaFrase: string[] = []
        for (const c of TALOS_DEVICE_CAPABILITIES) {
            const gap = talosCapabilityGap(c.id, niente)
            if (gap && !gap.reasonKey.startsWith('deviceGap.')) senzaFrase.push(c.id)
        }
        expect(senzaFrase).toEqual([])
    })

    it('una capacità che non esiste risponde null, non inventa un buco', () => {
        expect(talosCapabilityGap('teletrasporto', niente)).toBeNull()
    })
})
