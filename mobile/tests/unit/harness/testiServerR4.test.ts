import { describe, expect, it } from 'vitest'
import { TESTI_SERVER_R4, testoDelServerR4 } from '@/lib/harness/r4/testiServerR4'

/**
 * ⛔ K3-C3a2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): i testi che r4 manda alla persona (`<campo>Chiave`,
 * `<campo>Params`, la frase inglese di riserva) detti nella lingua dell'app, con il dizionario di r4 e le regole di
 * `harness-ui/frontend/src/components/testo-server.js` @ 99ffa3d38. Le frasi attese sono quelle della fixture di r4
 * `harness-ui/tests/fixtures/k4b-guasti-provider-it.json` allo stesso commit.
 */
const INTERROTTA_IT = 'La risposta del fornitore si è interrotta e l’esito della richiesta è incerto. Riprendi esplicitamente quando vuoi continuare: una nuova richiesta può comportare un altro costo.'
const INTERROTTA_EN = 'The provider response was interrupted and the outcome of the request is uncertain. Resume explicitly when you want to continue: a new request may incur another cost.'
const ESAURITA_10_IT = 'La risposta del fornitore si è interrotta e il suo esito è rimasto incerto anche dopo 10 reinvii automatici senza effetti intermedi. La richiesta può essere stata prodotta e pagata: riprendi esplicitamente quando vuoi continuare.'

describe('testi del server r4 (K3-C3a2)', () => {
    it('TSR4-03 una chiave del dizionario si dice in italiano o in inglese, parola per parola come r4', () => {
        expect(testoDelServerR4('server.providerOutcome.interrupted', undefined, INTERROTTA_EN, 'it')).toBe(INTERROTTA_IT)
        expect(testoDelServerR4('server.providerOutcome.interrupted', undefined, 'riserva', 'en')).toBe(INTERROTTA_EN)
        expect(testoDelServerR4('server.providerOutcome.noData', { minutes: 2 }, 'x', 'it'))
            .toBe('Connessione con il fornitore interrotta: nessun dato per 2 minuti.')
    })

    it('TSR4-04 il plurale: la chiave senza suffisso e `n` scelgono One o Many con le regole della lingua', () => {
        expect(testoDelServerR4('server.providerOutcome.exhausted', { n: 10 }, 'x', 'it')).toBe(ESAURITA_10_IT)
        expect(testoDelServerR4('server.providerOutcome.exhausted', { n: 1 }, 'x', 'it')).toContain('dopo 1 reinvio automatico senza')
        expect(testoDelServerR4('server.providerOutcome.exhausted', { n: 1 }, 'x', 'en')).toContain('after 1 automatic resend with')
    })

    it('TSR4-05 una chiave sconosciuta, di un\'altra area o storta dà la frase del server, mai la chiave grezza', () => {
        expect(testoDelServerR4('server.nonEsiste.mai', undefined, 'Server sentence', 'it')).toBe('Server sentence')
        expect(testoDelServerR4('kernel.contenutoSospetto.domanda', undefined, 'Server sentence', 'it')).toBe('Server sentence')
        expect(testoDelServerR4('Frase italiana vecchia', undefined, 'Server sentence', 'it')).toBe('Server sentence')
        expect(testoDelServerR4(undefined, undefined, 'Server sentence', 'it')).toBe('Server sentence')
        expect(testoDelServerR4('server.toString', undefined, 'Server sentence', 'it')).toBe('Server sentence')
        expect(testoDelServerR4('server.providerOutcome.interrupted', undefined, 'x', 'it-IT')).toBe(INTERROTTA_IT)
        expect(testoDelServerR4('server.providerOutcome.exhausted', { n: 'tanti' }, 'Server sentence', 'it')).toBe('Server sentence')
        // una lingua che il dizionario non ha ricade sull'inglese, come `t()` di r4
        expect(testoDelServerR4('server.providerOutcome.interrupted', undefined, 'x', 'fr')).toBe(INTERROTTA_EN)
    })

    it('TSR4-06 il dizionario viene dal commit fissato di r4, con le stesse chiavi e gli stessi segnaposto nelle due lingue', () => {
        expect(TESTI_SERVER_R4.origine).toEqual({
            commit: '701c6c0d2d711879b53aa21bddad5a06d33538e7',
            percorso: 'harness-ui/frontend/src/i18n/testi/server.js',
            sha256: '17b5a67cf4314693d6fdf5ade4cb941442cda56ca78e2377930395083dd37e34',
        })
        const it_ = Object.keys(TESTI_SERVER_R4.it).sort()
        expect(it_).toEqual(Object.keys(TESTI_SERVER_R4.en).sort())
        expect(it_.length).toBeGreaterThan(250)
        const segnaposto = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort()
        for (const k of it_) expect(segnaposto(TESTI_SERVER_R4.it[k]), k).toEqual(segnaposto(TESTI_SERVER_R4.en[k]))
    })
})
