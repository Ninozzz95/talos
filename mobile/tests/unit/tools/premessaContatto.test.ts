import { describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ LA PRIMA PREMESSA VERA, sul caso che costa: mandare a chi non c'è.
 *
 * Fino a ieri la domanda «questo contatto esiste?» si faceva dentro `run` —
 * cioè DOPO che la persona aveva già toccato «Consenti». Le si chiedeva di
 * autorizzare un invio a qualcuno che non è in rubrica, e solo dopo le si
 * diceva che non c'era.
 *
 * ⛔ E la riga che conta di più non è quella dell'assente: è **il permesso
 * negato**. Senza il permesso ai contatti TALOS non sa se «Marco» esista, e
 * dire «non esiste» a chi ce l'ha in rubrica è una bugia detta con l'aria di
 * aver controllato.
 */

const risolvi = vi.fn()
vi.mock('@/lib/intenti/rubrica', () => ({
    talosRisolviContatto: (nome: string) => risolvi(nome),
}))

const { talosPremessaContatto } = await import('@/lib/tools/intentiTools')

describe('la premessa del contatto', () => {
    it('un contatto solo ⇒ presente', async () => {
        risolvi.mockResolvedValueOnce({ stato: 'uno', contatto: { nome: 'Marco', numeri: ['3921234567'] } })
        expect(await talosPremessaContatto('Marco')).toEqual({ stato: 'presente' })
    })

    it('⭐ PIÙ contatti ⇒ presente lo stesso: chi sia lo decide dopo', async () => {
        risolvi.mockResolvedValueOnce({ stato: 'molti', trovati: [{ nome: 'Marco R' }, { nome: 'Marco B' }] })
        expect(await talosPremessaContatto('Marco')).toEqual({ stato: 'presente' })
        // Ambiguo non è assente: il destinatario esiste, va solo scelto.
    })

    it('⛔ nessun contatto ⇒ ASSENTE, e nomina chi', async () => {
        risolvi.mockResolvedValueOnce({ stato: 'nessuno' })
        const esito = await talosPremessaContatto('Marco')
        expect(esito.stato).toBe('assente')
        expect(esito.stato === 'assente' && esito.perche).toContain('"Marco"')
    })

    it('⛔⛔ PERMESSO NEGATO ⇒ IGNOTO, mai assente', async () => {
        risolvi.mockResolvedValueOnce({ stato: 'permesso-mancante' })
        const esito = await talosPremessaContatto('Marco')
        expect(esito.stato).toBe('ignoto')
        expect(esito.stato).not.toBe('assente')
        expect(esito.stato === 'ignoto' && esito.perche).toContain('permission')
        // Dire «Marco non esiste» a chi ce l'ha in rubrica è la bugia peggiore
        // che questo tipo esiste per impedire.
    })

    it('⛔ ponte caduto ⇒ IGNOTO: non aver potuto guardare non è aver guardato', async () => {
        risolvi.mockResolvedValueOnce({ stato: 'ponte-chiuso' })
        expect((await talosPremessaContatto('Marco')).stato).toBe('ignoto')
    })

    it('⛔ e se la rubrica ESPLODE è ignoto, non assente', async () => {
        risolvi.mockRejectedValueOnce(new Error('crash'))
        expect((await talosPremessaContatto('Marco')).stato).toBe('ignoto')
    })

    it('nessun destinatario nominato ⇒ non c\'è niente da controllare', async () => {
        expect(await talosPremessaContatto(undefined)).toEqual({ stato: 'presente' })
        expect(await talosPremessaContatto('   ')).toEqual({ stato: 'presente' })
        expect(risolvi).not.toHaveBeenCalledWith('   ')
    })

    it('⭐⭐ i CINQUE stati della rubrica arrivano tutti, e nessuno si perde', async () => {
        const mappa: Array<[string, string]> = [
            ['uno', 'presente'],
            ['molti', 'presente'],
            ['nessuno', 'assente'],
            ['permesso-mancante', 'ignoto'],
            ['ponte-chiuso', 'ignoto'],
        ]
        for (const [rubrica, atteso] of mappa) {
            risolvi.mockResolvedValueOnce({ stato: rubrica, trovati: [], contatto: { nome: 'x', numeri: [] } })
            expect((await talosPremessaContatto('Marco')).stato).toBe(atteso)
        }
        // ⛔ Se domani la rubrica guadagna un sesto stato, questo test non lo
        // vedrà: è il limite di una tabella scritta a mano, e va detto.
    })
})

describe('gli attrezzi che la dichiarano', () => {
    it('⭐⭐ invia_file E app_azione la portano: sono le due vie che escono dal telefono', async () => {
        const { talosIntentiTools } = await import('@/lib/tools/intentiTools')
        /*
         * ⛔ Senza le sorgenti dei file `invia_file` non viene offerto affatto —
         * ed è giusto: un attrezzo che manda file, dove non ci sono file, è una
         * capacità dichiarata e morta. Il test l'ha scoperto, e va detto qui.
         */
        const tutti = talosIntentiTools({
            fileDellaLibreria: async () => [],
            fileDalTelefono: async () => null,
        } as never)
        const conPremesse = tutti
            .filter((t) => typeof (t as { premesse?: unknown }).premesse === 'function')
            .map((t) => t.name).sort()

        expect(conPremesse).toContain('app_azione')
        expect(conPremesse).toContain('invia_file')

        /*
         * ⛔ IL VERSO CONTRARIO, e la prima stesura lo sbagliava: chiedeva che
         * esistesse un attrezzo SENZA premesse in questo elenco. Ma questo
         * fabbricante ne produce due, e tutti e due nominano un contatto —
         * l'asserzione era rossa su un codice sano.
         *
         * ⇒ L'invariante vero è un altro: la premessa del contatto sta **solo**
         * dove lo schema ha un campo `contatto`. Attaccata altrove costerebbe
         * una lettura della rubrica a ogni uso — cioè un permesso chiesto per
         * niente, alla persona, per una domanda che non la riguarda.
         */
        for (const attrezzo of tutti) {
            const haPremesse = typeof (attrezzo as { premesse?: unknown }).premesse === 'function'
            const forma = (attrezzo.input as { shape?: Record<string, unknown> }).shape ?? {}
            expect(haPremesse).toBe('contatto' in forma)
        }
    })
})
