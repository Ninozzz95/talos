import { describe, expect, it } from 'vitest'
import {
    INTESTAZIONE_GIORNALE,
    cifraGiornale,
    decifraGiornale,
    giornaleECifrato,
} from '@/persistence/giornaleMigrazione'

/**
 * ⛔⛔⛔ IL GIORNALE È UNA COPIA DELL'INTERO DATABASE.
 *
 * Se sbaglio qui, non «un test diventa rosso»: spariscono le chat di qualcuno,
 * durante un aggiornamento fatto per proteggerle.
 */

const CHIAVE = 'chiave-gestita-a-caso-che-nessuno-legge'
const EXPORT = JSON.stringify({
    database: 'talos-chat', version: 12,
    tables: [{ name: 'messages', values: [[1, 'un messaggio privato']] }],
})

describe('il giornale non sta più in chiaro', () => {
    it('⭐ andata e ritorno: torna byte per byte', async () => {
        const su = await cifraGiornale(EXPORT, CHIAVE)
        expect(await decifraGiornale(su, CHIAVE)).toBe(EXPORT)
    })

    it('⛔ e il testo del database NON compare nel file scritto', async () => {
        const su = await cifraGiornale(EXPORT, CHIAVE)
        expect(su).not.toContain('un messaggio privato')
        expect(su).not.toContain('messages')
        // ⛔ È la ragione per cui esiste tutto il file: quel testo stava su disco
        // in chiaro mentre il resto della sua vita sta dietro un PIN.
    })

    it('⛔ con la chiave sbagliata non si apre', async () => {
        const su = await cifraGiornale(EXPORT, CHIAVE)
        await expect(decifraGiornale(su, 'un altra chiave')).rejects.toThrow()
    })

    it('⛔⛔ e un corpo MANOMESSO non si apre: non è solo riservatezza', async () => {
        const su = await cifraGiornale(EXPORT, CHIAVE)
        const aCapo = su.indexOf('\n')
        const dentro = JSON.parse(su.slice(aCapo + 1)) as { corpo: string }
        // un byte cambiato in mezzo al corpo
        const rotto = dentro.corpo.slice(0, 20)
            + (dentro.corpo[20] === 'A' ? 'B' : 'A')
            + dentro.corpo.slice(21)
        const manomesso = `${su.slice(0, aCapo + 1)}${JSON.stringify({ ...dentro, corpo: rotto })}`

        await expect(decifraGiornale(manomesso, CHIAVE)).rejects.toThrow()
        /*
         * ⛔ GCM autentica: un giornale alterato viene RIFIUTATO invece di essere
         * reimportato. Senza, un file mezzo scritto o toccato da fuori tornerebbe
         * dentro il database come se fosse la copia buona.
         */
    })
})

describe('⛔⛔⛔ e i giornali VECCHI si leggono ancora', () => {
    it('un file in chiaro passa intatto', async () => {
        expect(await decifraGiornale(EXPORT, CHIAVE)).toBe(EXPORT)
        /*
         * ⛔ È il caso che conta più di tutti gli altri messi insieme.
         *
         * Qualcuno ha una migrazione interrotta a metà — Android ha ucciso l'app
         * — e aggiorna TALOS prima di riaprirla. Al riavvio il codice nuovo trova
         * un giornale vecchio, in chiaro, e il database È GIÀ STATO DISTRUTTO.
         *
         * Se il codice nuovo non sapesse leggerlo, quella persona perderebbe
         * tutte le sue chat durante un aggiornamento pensato per proteggerle.
         */
    })

    it('⛔ e il riconoscimento NON indovina dalla forma', async () => {
        // Un giornale vecchio È JSON: chi si basasse su «sembra JSON» per
        // decidere sceglierebbe la strada sbagliata proprio nel caso che conta.
        expect(giornaleECifrato(EXPORT)).toBe(false)
        expect(giornaleECifrato(await cifraGiornale(EXPORT, CHIAVE))).toBe(true)
    })

    it('⛔ un file che comincia con qualcosa di SIMILE non viene scambiato', async () => {
        expect(giornaleECifrato(`${INTESTAZIONE_GIORNALE}-2\n{}`)).toBe(false)
        expect(giornaleECifrato(`prima riga\n${INTESTAZIONE_GIORNALE}\n{}`)).toBe(false)
        // ⛔ Scambiarlo per cifrato lo manderebbe al decifratore, che fallirebbe
        // — e un giornale leggibile diventerebbe una perdita di dati.
    })

    it('⛔ un giornale vuoto resta vuoto invece di esplodere', async () => {
        expect(await decifraGiornale('', CHIAVE)).toBe('')
    })
})
