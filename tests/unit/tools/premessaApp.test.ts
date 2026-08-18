import { describe, expect, it, vi } from 'vitest'
import { talosPremessaApp } from '@/lib/tools/premessaApp'

/**
 * ⛔⛔ La riga che conta è la seconda: su Android 11+ «non l'ho trovata» copre
 * DUE fatti — non installata, oppure installata e invisibile a noi. Dire
 * «Telegram non è installato» a chi ha Telegram è la stessa bugia del contatto,
 * un piano più in là.
 */

const ELENCO = 'Telegram\torg.telegram.messenger\nWhatsApp\tcom.whatsapp\nMappe\tcom.google.android.apps.maps\n'
const da = (testo: string) => async () => testo

describe('la premessa dell\'app', () => {
    it('l\'app c\'è ⇒ presente, e porta il pacchetto', async () => {
        const esito = await talosPremessaApp('Telegram', da(ELENCO))
        expect(esito.stato).toBe('presente')
        expect(esito.fatto?.ambito).toBe('org.telegram.messenger')
    })

    it('⭐ e la trova anche con il nome parziale, come fa chi apre', async () => {
        expect((await talosPremessaApp('whats', da(ELENCO))).stato).toBe('presente')
    })

    it('⛔ non c\'è ⇒ ASSENTE, con la copertura dichiarata', async () => {
        const esito = await talosPremessaApp('Signal', da(ELENCO))
        expect(esito.stato).toBe('assente')
        expect(esito.stato === 'assente' && esito.copertura).toBe('completa')
        expect(esito.stato === 'assente' && esito.perche).toContain('"Signal"')
    })

    it('⛔⛔ ELENCO VUOTO ⇒ IGNOTO, mai assente', async () => {
        for (const vuoto of ['', '   ', '\n\n']) {
            const esito = await talosPremessaApp('Telegram', da(vuoto))
            expect(esito.stato).toBe('ignoto')
            expect(esito.stato).not.toBe('assente')
        }
        // Nessun telefono ha zero app con un'icona: un elenco vuoto è un ponte
        // che non ha parlato. Su Android 11+ `queryIntentActivities` torna zero
        // risultati senza le dichiarazioni nel manifesto — e non è un errore.
    })

    it('⛔ il ponte che esplode ⇒ IGNOTO', async () => {
        const esito = await talosPremessaApp('Telegram', async () => { throw new Error('ponte giù') })
        expect(esito.stato).toBe('ignoto')
        expect(esito.stato === 'ignoto' && esito.perche).toMatch(/could not be read/)
    })

    it('nessuna app nominata ⇒ niente da controllare, e non si chiede l\'elenco', async () => {
        const elenco = vi.fn(async () => ELENCO)
        expect(await talosPremessaApp(undefined, elenco)).toEqual({ stato: 'presente' })
        expect(await talosPremessaApp('  ', elenco)).toEqual({ stato: 'presente' })
        expect(elenco).not.toHaveBeenCalled()
    })

    it('⭐ l\'elenco si chiede UNA volta sola: due risposte a due istanti sono due mondi', async () => {
        const elenco = vi.fn(async () => ELENCO)
        await talosPremessaApp('Telegram', elenco)
        expect(elenco).toHaveBeenCalledOnce()
    })

    it('⛔ ogni esito porta la famiglia del fatto, per l\'audit', async () => {
        for (const [nome, lista] of [['Telegram', ELENCO], ['Signal', ELENCO], ['Telegram', '']] as const) {
            const esito = await talosPremessaApp(nome, da(lista))
            expect(esito.fatto?.famiglia).toBe('app-installed')
            expect(esito.fatto?.nome).toBe(nome)
        }
    })
})
