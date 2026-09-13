import { describe, expect, it } from 'vitest'

import { conversationOf } from '@/lib/chat/providers/localAdapter'

/**
 * ⭐⭐⭐ IL COLLEGAMENTO — la normalizzazione arriva davvero al modello, e SOLO
 * dove deve.
 *
 * `aritmeticaItaliana.test.ts` prova la funzione. Queste prove provano che la
 * funzione viene CHIAMATA: i 52 test dell'adattatore passavano identici anche
 * prima del collegamento, perché nessuno di loro usa aritmetica. Una cura coi
 * suoi test verdi e nessun chiamante è esattamente
 * `funzione-con-i-test-e-nessun-chiamante`.
 *
 * ## Il perimetro
 *
 * - il turno `user` si normalizza: è la domanda, ed è lì che cinque modelli
 *   locali su sette leggevano «sette per otto» come 7 ÷ 8 (Pad, 11/09/2026);
 * - il turno `assistant` NO: sono le parole che il modello ha già detto, e
 *   riscriverle vorrebbe dire fargli ricordare una conversazione diversa;
 * - il turno `system` NO: è il nostro prompt, e ha un tetto di 600 caratteri
 *   misurato (`linguaDelRagionamento.test.ts`).
 */

const RICHIESTA = {
    model: { id: 'm', provider: 'local', displayName: 'm' },
    effort: 'low',
    thinking: false,
} as never

function contenuti(input: object): Array<{ role: string, content?: string }> {
    return conversationOf({ ...(RICHIESTA as object), ...input } as never)
        .map((m) => ({ role: m.role, content: (m as { content?: string }).content }))
}

describe('ARITMETICA NEL TURNO UTENTE — il modello legge la forma misurata', () => {
    it('ARU-01 la domanda della persona arriva al modello come «7 x 8»', () => {
        const messaggi = contenuti({ turns: [{ role: 'user', content: 'Quanto fa sette per otto?' }] })
        expect(messaggi).toEqual([{ role: 'user', content: 'Quanto fa 7 x 8?' }])
    })

    /**
     * ⛔ AL CONTRARIO: la risposta che il modello ha GIÀ dato resta sua. Se la
     * riscrivessimo, al turno dopo ricorderebbe di aver detto una cosa che non
     * ha detto.
     */
    it('ARU-02 il turno assistant non si tocca', () => {
        const messaggi = contenuti({
            turns: [
                { role: 'user', content: 'Quanto fa sette per otto?' },
                { role: 'assistant', content: 'Sette per otto fa cinquantasei.' },
                { role: 'user', content: 'E tre per quattro?' },
            ],
        })
        expect(messaggi.map((m) => m.content)).toEqual([
            'Quanto fa 7 x 8?',
            'Sette per otto fa cinquantasei.',
            'E 3 x 4?',
        ])
    })

    it('ARU-03 il prompt di sistema non si tocca', () => {
        const messaggi = contenuti({
            system: 'Conta sette per otto elementi.',
            turns: [{ role: 'user', content: 'ciao' }],
        })
        expect(messaggi[0]).toEqual({ role: 'system', content: 'Conta sette per otto elementi.' })
    })

    /**
     * ⛔ E il perimetro della funzione sopravvive al collegamento: le frasi che
     * non sono aritmetica attraversano l'adattatore identiche.
     */
    it('ARU-04 «uno per uno» e «per cento» arrivano al modello come la persona li ha scritti', () => {
        const messaggi = contenuti({
            turns: [{ role: 'user', content: 'Controlla i file uno per uno, lo sconto è del cinque per cento.' }],
        })
        expect(messaggi[0]!.content).toBe('Controlla i file uno per uno, lo sconto è del cinque per cento.')
    })
})
