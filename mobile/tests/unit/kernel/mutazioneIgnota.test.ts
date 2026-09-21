import { describe, expect, it, vi } from 'vitest'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⛔⛔ IL RAMO CHE NESSUN TEST COPRIVA, un piano più su.
 *
 * Una mutazione l'ha trovato: facendo autorizzare la modifica quando il cancello
 * semantico risponde `ignoto`, nessun test diventava rosso.
 *
 * ⇒ Su una **mutazione strutturale** «non lo so» non autorizza. È la stessa
 * regola di `premiseUnknownPolicy: 'reject'`: su una capacità del telefono un
 * dubbio può ancora passare — «non riesco a provare che la torcia sia spenta» —
 * su un cambiamento di codice no.
 */

vi.mock('@/lib/kernel/semantica', async (originale) => ({
    ...(await originale<typeof import('@/lib/kernel/semantica')>()),
    cancelloSemantico: async () => ({
        stato: 'ignoto' as const,
        perche: 'il compilatore non ha risposto',
    }),
}))

const { sostituisciEsistente } = await import('@/lib/kernel/mutazione')

const PREZZO = 'src/prezzo.ts'
const base = (): TalosSorgente[] => ([
    { percorso: PREZZO, testo: 'export function totale(r: number) { return r }\n' },
])

describe('quando il cancello semantico non sa rispondere', () => {
    it('⛔⛔ la mutazione NON si fa: su una modifica strutturale «non lo so» non autorizza', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'totale' },
            'export function totale(r: number) { return r * 2 }')
        expect(esito.stato).toBe('rifiutata')
        if (esito.stato !== 'rifiutata') return
        expect(esito.perche).toBe('ignoto')
    })

    it('⛔ e il motivo arriva intero: un rifiuto senza perché si riprova identico', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'totale' },
            'export function totale(r: number) { return r * 2 }')
        expect(esito.stato === 'rifiutata' && esito.messaggio).toContain('non ha risposto')
    })

    it('⛔ e il bersaglio ASSENTE resta assente, non diventa ignoto', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'maiEsistito' }, 'x')
        expect(esito.stato === 'rifiutata' && esito.perche).toBe('premessa')
        // G1 viene PRIMA di G2: se il bersaglio non c'è, il cancello semantico
        // non viene nemmeno consultato.
    })
})
