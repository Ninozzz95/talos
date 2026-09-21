import { describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ IL RAMO CHE NESSUN TEST COPRIVA: cosa succede se il compilatore esplode.
 *
 * Una mutazione l'ha scoperto — trasformando quel `catch` in un via libera,
 * nessun test diventava rosso. Ed è il ramo più pericoloso di tutti: non sapere
 * se una modifica introduca riferimenti rotti **non significa** che non ne
 * introduca.
 */

vi.mock('@/lib/kernel/simboli', async (originale) => ({
    ...(await originale<typeof import('@/lib/kernel/simboli')>()),
    caricaCompilatore: async () => { throw new Error('il compilatore non si è aperto') },
}))

const { cancelloSemantico } = await import('@/lib/kernel/semantica')

describe('quando il compilatore non risponde', () => {
    it('⛔⛔ è IGNOTO, mai un via libera', async () => {
        const albero = [{ percorso: '/a.ts', testo: 'export const x = 1\n' }]
        const esito = await cancelloSemantico(albero, albero)
        expect(esito.stato).toBe('ignoto')
        expect(esito.stato).not.toBe('presente')
        expect(esito.stato === 'ignoto' && esito.perche).toContain('could not run')
    })

    it('⛔ e nemmeno un ASSENTE: un controllo rotto non è la prova di un difetto', async () => {
        const albero = [{ percorso: '/a.ts', testo: 'export const x = 1\n' }]
        expect((await cancelloSemantico(albero, albero)).stato).not.toBe('assente')
    })
})
