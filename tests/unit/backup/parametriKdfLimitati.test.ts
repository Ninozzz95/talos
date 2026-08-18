import { describe, expect, it } from 'vitest'
import { talosDecryptBackup, talosEncryptBackup } from '@/lib/backup/backupCrypto'

/**
 * ⛔⛔⛔ I PARAMETRI DI UN FILE NON SONO UN ORDINE.
 *
 * `talosDecryptBackup` legge memoria, iterazioni e parallelismo dall'intestazione
 * del file — ed è giusto: un backup scritto quando i numeri raccomandati erano
 * altri deve continuare ad aprirsi.
 *
 * Ma li passava ad Argon2id **senza limiti**. Un file fabbricato che dichiara
 * `memoryKiB: 4_000_000` chiede quattro gigabyte a un telefono. Non è una
 * decifratura che fallisce: è l'app che si pianta o viene uccisa, per un file
 * che qualcuno ha mandato via chat.
 *
 * ⇒ Il file dice CON QUALI parametri è stato scritto. Non decide quanto lavoro
 * questo dispositivo è disposto a fare.
 *
 * ⛔ Questo non era nella revisione esterna: lei aveva trovato lo stesso difetto
 * sul record del PIN. È venuto fuori guardando dove ALTRO si leggono parametri
 * da un posto non fidato — che è il modo giusto di usare un rilievo, invece di
 * chiudere solo la riga indicata.
 */

const SEGRETO = 'una passphrase qualunque'

describe('i parametri fuori limite non si eseguono', () => {
    it('⛔ memoria assurda: rifiutato SUBITO, senza provare ad allocarla', async () => {
        const { envelope, ciphertext } = await talosEncryptBackup(
            new TextEncoder().encode('ciao'), SEGRETO,
        )
        const gonfio = { ...envelope, memoryKiB: 4_000_000 }
        await expect(talosDecryptBackup(gonfio, ciphertext, SEGRETO))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_KDF_PARAMS_REFUSED' })
    })

    it('⛔ iterazioni assurde: idem', async () => {
        const { envelope, ciphertext } = await talosEncryptBackup(
            new TextEncoder().encode('ciao'), SEGRETO,
        )
        await expect(talosDecryptBackup({ ...envelope, iterations: 100_000 }, ciphertext, SEGRETO))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_KDF_PARAMS_REFUSED' })
    })

    it('⛔ e parallelismo assurdo', async () => {
        const { envelope, ciphertext } = await talosEncryptBackup(
            new TextEncoder().encode('ciao'), SEGRETO,
        )
        await expect(talosDecryptBackup({ ...envelope, parallelism: 1024 }, ciphertext, SEGRETO))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_KDF_PARAMS_REFUSED' })
    })

    it('⭐ ma un backup VERO continua ad aprirsi', async () => {
        const { envelope, ciphertext } = await talosEncryptBackup(
            new TextEncoder().encode('il contenuto'), SEGRETO,
        )
        const aperto = await talosDecryptBackup(envelope, ciphertext, SEGRETO)
        expect(new TextDecoder().decode(aperto)).toBe('il contenuto')
    })

    it('⭐ e parametri PIÙ BASSI ma sensati passano il cancello', async () => {
        /*
         * ⛔ Il limite non è «esattamente i nostri numeri»: un file vecchio,
         * scritto quando le raccomandazioni erano altre, deve restare leggibile.
         * Il cancello ferma l'assurdo, non il diverso.
         */
        const { envelope, ciphertext } = await talosEncryptBackup(
            new TextEncoder().encode('vecchio'), SEGRETO,
        )
        let codice: unknown = null
        try {
            await talosDecryptBackup({ ...envelope, memoryKiB: 8_192, iterations: 1 }, ciphertext, SEGRETO)
        }
        catch (errore) { codice = (errore as { code?: string }).code }

        // Fallisce per la CHIAVE (parametri diversi ⇒ chiave diversa), non per
        // il cancello: quello li ha lasciati passare, che è il punto.
        expect(codice).not.toBe('TALOS_BACKUP_KDF_PARAMS_REFUSED')
    })
})
