import { describe, expect, it } from 'vitest'
import { codaDaDipingere } from '@/lib/streaming/codaDaDipingere'

/**
 * D-VIS-9b da sola, senza il ritmo dello svelamento: lo svelamento dà i caratteri a gruppi e il parse cade di rado proprio dopo
 * l'a capo, quindi il componente da solo non colpisce ogni caso in modo deterministico (mutante v4, 23/10).
 */
describe('codaDaDipingere (D-VIS-9b)', () => {
    it.each([
        ['dopo uno spazio', 'Il parser legge un campo ', 'quotato', ' quotato'],
        ['dopo un a capo dentro il paragrafo (revisione del Desktop)', 'Il parser legge un campo\n', 'quotato', ' quotato'],
        ['dopo una tabulazione', 'colonna\t', 'valore', ' valore'],
    ])('CODA-PURA-01 %s: la coda parte con uno spazio', (_nome, analizzato, inAttesa, attesa) => {
        expect(codaDaDipingere(analizzato, inAttesa)).toBe(attesa)
    })

    it('CODA-PURA-02 nessuno spazio in più se la parola continua, se la coda ha già lo spazio, o se non c\'è coda', () => {
        expect(codaDaDipingere('Il parser legge un cam', 'po')).toBe('po')
        expect(codaDaDipingere('Il parser legge un campo ', ' quotato')).toBe(' quotato')
        expect(codaDaDipingere('Il parser legge un campo ', '')).toBe('')
    })
})
