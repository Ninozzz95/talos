import { describe, expect, it } from 'vitest'
import {
    TALOS_SCHERMATE_DI_SISTEMA,
    talosSchermataDiSistema,
} from '@/lib/device/capabilities'

/**
 * ⛔⛔ «Il telefono non offre questa schermata» — e la schermata c'era.
 *
 * ## La misura che ha smascherato la frase, col telefono in mano
 *
 * Owner 2026-08-10, screenshot: TALOS rifiuta di aprire l'accesso alle
 * notifiche dicendo che il telefono non ha quella pagina. Trenta secondi dopo,
 * sullo stesso telefono:
 *
 * ```
 *   am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
 *     → topResumedActivity=… com.android.settings/.Settings$NotificationAccessSettingsActivity
 *   am start -a android.settings.NOTIFICATION_LISTENER_SETTINGS
 *     → Error: Activity not started, unable to resolve Intent
 * ```
 *
 * Quattro caratteri. Android consegna le due cose con lo STESSO errore
 * (`ActivityNotFoundException`), e TALOS lo raccontava come un difetto del
 * telefono di chi legge invece che come un nome sbagliato scritto a memoria da
 * un modello.
 *
 * ⛔ Questi casi mordono perché usano le stringhe VERE misurate sopra: se la
 * correzione sparisse, la prima riga tornerebbe `null` e il tool riproverebbe
 * l'azione inesistente — cioè si tornerebbe alla bugia.
 */
describe('⛔ la schermata di sistema non si fa indovinare al modello', () => {
    it('il caso misurato: manca `ACTION_`, e la si riconosce lo stesso', () => {
        expect(talosSchermataDiSistema('android.settings.NOTIFICATION_LISTENER_SETTINGS'))
            .toBe('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS')
    })

    it('l\'azione giusta passa intatta', () => {
        expect(talosSchermataDiSistema('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS'))
            .toBe('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS')
    })

    it('e anche il nome nudo, senza nessun prefisso', () => {
        expect(talosSchermataDiSistema('NOTIFICATION_LISTENER_SETTINGS'))
            .toBe('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS')
        expect(talosSchermataDiSistema('WIFI_SETTINGS'))
            .toBe('android.settings.WIFI_SETTINGS')
    })

    it('⛔ e il verso opposto: `action.` in mezzo, dove Android lo mette davvero', () => {
        // Alcune delle nostre schermate scrivono `android.settings.action.X`,
        // non `android.settings.ACTION_X`. Un modello le confonde in entrambi i
        // versi, e tutte e due le forme devono arrivare alla stessa pagina.
        //
        // ⛔ Qui c'era anche `MANAGE_OVERLAY_PERMISSION`, tolta il 2026-08-15
        // insieme al pulsante flottante: una schermata che non serve piu' a
        // nessuna nostra capacita' non si tiene in elenco «per sicurezza», se
        // no il modello la puo' proporre e la persona ci finisce dentro senza
        // motivo.
        expect(talosSchermataDiSistema('android.settings.ACTION_MANAGE_WRITE_SETTINGS'))
            .toBe('android.settings.action.MANAGE_WRITE_SETTINGS')
        expect(talosSchermataDiSistema('MANAGE_WRITE_SETTINGS'))
            .toBe('android.settings.action.MANAGE_WRITE_SETTINGS')
    })

    it('l\'id di una capacità vale come nome della sua schermata', () => {
        expect(talosSchermataDiSistema('notifications_read'))
            .toBe('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS')
        expect(talosSchermataDiSistema('do_not_disturb'))
            .toBe('android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS')
    })

    it('⛔ ciò che non conosciamo torna `null`, e NON viene rifiutato dal tool', () => {
        // Le schermate di Android sono centinaia: questo catalogo copre le
        // nostre. Chi chiama passa avanti la richiesta com'è — un elenco
        // incompleto non deve diventare un divieto.
        expect(talosSchermataDiSistema('android.settings.SOUND_SETTINGS')).toBeNull()
        expect(talosSchermataDiSistema('   ')).toBeNull()
        expect(talosSchermataDiSistema('torch')).toBeNull()
    })

    it('l\'elenco offerto al modello è quello del catalogo, senza doppioni', () => {
        expect(TALOS_SCHERMATE_DI_SISTEMA.length)
            .toBe(new Set(TALOS_SCHERMATE_DI_SISTEMA).size)
        expect(TALOS_SCHERMATE_DI_SISTEMA)
            .toContain('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS')
        // Nessuna capacità senza schermata deve aver lasciato un buco.
        expect(TALOS_SCHERMATE_DI_SISTEMA.every((a) => a.startsWith('android.settings.')))
            .toBe(true)
    })
})
