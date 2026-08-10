import { describe, expect, it } from 'vitest'
import { talosPacchettoPerNome } from '@/lib/device/manoDelloSchermo'

/**
 * ⛔⛔ «apri Chrome» → «non installato», su un telefono che ha Chrome.
 *
 * MISURATO sul Pad il 2026-08-10, PRIMA corsa vera del pilota. Il modello ha
 * chiesto `apri_app` con «Chrome», la porta voleva `com.android.chrome`, e la
 * risposta è stata «non installato». La grammatica prometteva «il nome
 * dell'app» e sotto pretendeva un identificativo: la colpa non è del modello,
 * è di chi ha scritto due contratti diversi ai due capi della stessa azione.
 */
const ELENCO = [
    'Chrome\tcom.android.chrome',
    'Chrome Beta\tcom.chrome.beta',
    'Telegram\torg.thunderdog.challegram',
    'Impostazioni\tcom.android.settings',
].join('\n')

describe('⛔ il nome dell\'app diventa il pacchetto', () => {
    it('il caso misurato: «Chrome» trova com.android.chrome', () => {
        expect(talosPacchettoPerNome(ELENCO, 'Chrome')).toBe('com.android.chrome')
    })

    it('⛔ e NON Chrome Beta: l\'uguaglianza esatta viene prima', () => {
        // Aprire l'app sbagliata mentre si guida uno schermo vuol dire toccare
        // dentro un'app che nessuno ha chiesto.
        expect(talosPacchettoPerNome(ELENCO, 'chrome')).toBe('com.android.chrome')
        expect(talosPacchettoPerNome(ELENCO, 'Chrome Beta')).toBe('com.chrome.beta')
    })

    it('un nome che non dice il pacchetto si risolve lo stesso', () => {
        // `org.thunderdog.challegram` non contiene «telegram»: senza elenco
        // nessun modello ci arriverebbe.
        expect(talosPacchettoPerNome(ELENCO, 'Telegram')).toBe('org.thunderdog.challegram')
    })

    it('⛔ e ciò che non c\'è torna null, invece di aprire qualcosa a caso', () => {
        expect(talosPacchettoPerNome(ELENCO, 'Banca')).toBeNull()
        expect(talosPacchettoPerNome(ELENCO, '  ')).toBeNull()
        expect(talosPacchettoPerNome('', 'Chrome')).toBeNull()
    })
})
