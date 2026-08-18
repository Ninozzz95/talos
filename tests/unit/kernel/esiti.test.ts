import { describe, expect, it } from 'vitest'
import { classificaCorsa, frasePubblicazione, type TalosOsservazioneCorsa } from '@/lib/kernel/esiti'

/**
 * ⭐⭐⭐ IL VOCABOLARIO CHE NON SA MENTIRE.
 *
 * Il kernel impedisce di *scrivere* una cosa non provata. Questo impedisce di
 * *dirla*. È la stessa lezione di «APERTA non è FATTA» e «Collegato non è in
 * carica», portata sul codice: il codice di uscita e l'esito dei test sono
 * **due fatti diversi**, e confonderli è la bugia più facile da raccontare.
 */

const o = (p: Partial<TalosOsservazioneCorsa>): TalosOsservazioneCorsa => ({
    codiceUscita: 0, eseguiti: null, passati: null, falliti: null, ...p,
})

describe('⛔⛔⛔ le due misure che ho pagato di persona', () => {
    it('⛔ uscita 0 e ZERO test eseguiti NON è «passati»', () => {
        // La CI era verde e non aveva eseguito niente: moriva prima di partire.
        const e = classificaCorsa(o({ codiceUscita: 0, eseguiti: 0, passati: 0, falliti: 0 }))
        expect(e.stato).toBe('ignoto')
        expect(e.perche).toContain('no test was executed')
    })

    it('⛔ uscita ≠ 0 con ZERO test rossi NON è «falliti»', () => {
        // Il teardown intermittente: exit 1 e nessun test rosso. Chiamarlo
        // «falliti» manda a caccia di un difetto che non è nei test.
        const e = classificaCorsa(o({ codiceUscita: 1, eseguiti: 340, passati: 340, falliti: 0 }))
        expect(e.stato).toBe('ignoto')
        expect(e.perche).toContain('outside the tests')
    })
})

describe('quando il runner ha davvero osservato qualcosa', () => {
    it('⭐ uscita 0, test eseguiti, nessun rosso → passati', () => {
        expect(classificaCorsa(o({ codiceUscita: 0, eseguiti: 12, passati: 12, falliti: 0 })).stato)
            .toBe('passati')
    })

    it('⭐ dei rossi contati → falliti, e il numero arriva', () => {
        const e = classificaCorsa(o({ codiceUscita: 1, eseguiti: 12, passati: 9, falliti: 3 }))
        expect(e.stato).toBe('falliti')
        expect(e.perche).toContain('3')
    })

    it('⛔ e dei rossi contati restano FALLITI anche con uscita 0', () => {
        // Un runner che dimentica di propagare il codice non trasforma un rosso
        // in un verde: l'osservazione batte il codice di uscita.
        expect(classificaCorsa(o({ codiceUscita: 0, eseguiti: 12, passati: 9, falliti: 3 })).stato)
            .toBe('falliti')
    })
})

describe('⛔⛔ i quattro divieti', () => {
    it('un processo ucciso non è un esito', () => {
        expect(classificaCorsa(o({ codiceUscita: null, eseguiti: 12, passati: 12, falliti: 0 })).stato)
            .toBe('ignoto')
    })

    it('numeri non estratti non sono un esito, nemmeno con uscita 0', () => {
        // È il caso più insidioso: «il comando è andato a buon fine» NON è
        // «i test sono passati». Senza conteggi non si sa nemmeno se sia un
        // runner di test.
        expect(classificaCorsa(o({ codiceUscita: 0 })).stato).toBe('ignoto')
    })

    it('⭐ un impedimento STRUTTURALE si dichiara, e non è un fallimento', () => {
        const e = classificaCorsa(o({
            codiceUscita: 1, eseguiti: 0, passati: 0, falliti: 0,
            impedimento: { genere: 'addon-nativo', dettaglio: 'better-sqlite3 has no android-arm64 build' },
        }))
        expect(e.stato).toBe('non-eseguibili')
        expect(e.perche).toContain('better-sqlite3')
        // ⛔ Chiamarlo «falliti» manderebbe il modello a «riparare» codice sano.
    })

    it('⛔ e l\'impedimento vince anche su una corsa apparentemente verde', () => {
        // Un runner che salta i test impossibili ed esce 0: verde su niente.
        expect(classificaCorsa(o({
            codiceUscita: 0, eseguiti: 0, passati: 0, falliti: 0,
            impedimento: { genere: 'browser', dettaglio: 'a real browser is required' },
        })).stato).toBe('non-eseguibili')
    })
})

describe('⛔⛔ pubblicare i file non è scrivere la storia', () => {
    it('senza `.git` si dice ESATTAMENTE che cosa è successo', () => {
        const f = frasePubblicazione({ stato: 'solo-file', perche: '.git is not readable through the granted folder' })
        expect(f).toContain('Files were written')
        expect(f).toContain('no commit')
        expect(f).not.toContain('committed')
    })

    it('⭐ e con la storia scritta si nomina il riferimento', () => {
        const f = frasePubblicazione({ stato: 'pubblicata', albero: 'a1b2c3d', riferimento: 'refs/heads/main' })
        expect(f).toContain('refs/heads/main')
        expect(f).toContain('a1b2c3d')
    })
})
