import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import { executeTalosTool, type TalosToolExecutionDeps } from '@/lib/tools/executor'

/**
 * A5 — la postcondizione, dentro l'esecutore.
 *
 * Il motivo per cui esiste, con i numeri: c'è una classe di guasti in cui
 * **l'effetto avviene e la risposta si perde** — il ponte scade dopo aver
 * consegnato, Android uccide l'app fra la scrittura e la conferma. Chi ritenta
 * senza controllare produce doppioni nel **72%** dei casi, che scendono al
 * **20%** verificando lo stato prima; e l'ablazione dice che quasi tutto il
 * guadagno viene dalla **sola verifica** (arXiv 2608.02645).
 *
 * Da noi il ritentativo automatico non c'è: lo fa il modello appena legge
 * `ok: false`. Quindi «fallito» detto a sproposito **è** l'istruzione che crea
 * il doppione, ed è quello che questi test difendono.
 */

function deps(patch: Partial<TalosToolExecutionDeps> = {}): TalosToolExecutionDeps {
    return {
        permissions: { read: 'allow', write: 'allow', outbound: 'allow' },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => true),
        audit: vi.fn(async () => {}),
        context: { sessionId: 's1' },
        ...patch,
    }
}

/** Un tool di scrittura con una postcondizione governabile dal test. */
function scrittore(opzioni: {
    run: () => Promise<{ ok: boolean, content: string }>
    verify?: () => Promise<{ held: true } | { held: false, reason: string }>
}) {
    return defineTalosTool({
        name: 'notes_delete',
        title: 'Delete a note',
        description: 'x',
        action: 'write',
        input: z.object({ id: z.string() }),
        run: opzioni.run as never,
        ...(opzioni.verify ? { verify: opzioni.verify as never } : {}),
    })
}

describe('A5 — un successo che non regge viene DEGRADATO', () => {
    it('«fatto» diventa un errore che nomina la postcondizione', async () => {
        const audit = vi.fn(async () => {})
        const esito = await executeTalosTool(
            scrittore({
                run: async () => ({ ok: true, content: 'That note has been deleted.' }),
                verify: async () => ({ held: false, reason: 'the note "Spesa" is still there' }),
            }),
            { id: 'n1' },
            deps({ audit }),
        )

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_TOOL_POSTCONDITION_FAILED')
        // La ragione arriva al modello: senza, riproverebbe identico.
        expect(esito.content).toContain('Spesa')
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed', verified: false,
        }))
    })

    it('e un successo che regge resta un successo', async () => {
        const audit = vi.fn(async () => {})
        const esito = await executeTalosTool(
            scrittore({
                run: async () => ({ ok: true, content: 'That note has been deleted.' }),
                verify: async () => ({ held: true }),
            }),
            { id: 'n1' },
            deps({ audit }),
        )

        expect(esito.ok).toBe(true)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            status: 'succeeded', verified: true,
        }))
    })
})

describe('A5 — un errore su un effetto REALE viene PROMOSSO', () => {
    it('il caso non atomico: la chiamata solleva, ma la cosa e fatta', async () => {
        const audit = vi.fn(async () => {})
        const esito = await executeTalosTool(
            scrittore({
                run: async () => { throw new Error('bridge timeout') },
                verify: async () => ({ held: true }),
            }),
            { id: 'n1' },
            deps({ audit }),
        )

        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('the change is there')
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            status: 'succeeded',
            verified: true,
            // L'errore vero resta nel registro: la promozione non lo cancella.
            evidence: expect.objectContaining({ recovered_from_error: 'bridge timeout' }),
        }))
    })

    it('ma se l effetto NON c e, l errore resta un errore', async () => {
        const audit = vi.fn(async () => {})
        const esito = await executeTalosTool(
            scrittore({
                run: async () => { throw new Error('bridge timeout') },
                verify: async () => ({ held: false, reason: 'still there' }),
            }),
            { id: 'n1' },
            deps({ audit }),
        )

        expect(esito.ok).toBe(false)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed', verified: false,
        }))
    })
})

describe('A5 — la verifica non puo rompere il tool', () => {
    it('se verify stessa solleva, non vince NESSUNO dei due', async () => {
        const esito = await executeTalosTool(
            scrittore({
                run: async () => ({ ok: true, content: 'fatto' }),
                verify: async () => { throw new Error('il deposito e chiuso') },
            }),
            { id: 'n1' },
            deps(),
        )

        /*
         * ⛔⛔⛔ QUESTO TEST DIFENDEVA IL DIFETTO, con una motivazione che suona
         * giusta: diceva «non lo so» non e' «non e' andata», e concludeva
         * `ok: true`.
         *
         * La premessa era vera. La conclusione no: «non lo so» non e' «non e'
         * andata», ma non e' nemmeno «e' andata». Il terzo stato veniva
         * schiacciato sul primo dei due, cioe' sulla lettura piu' comoda — ed e'
         * esattamente il modo in cui si arriva a dire «inviato» di un messaggio
         * che nessuno ha visto partire.
         *
         * ⇒ Restano vere tutte e due le meta: non e' un fallimento (dirlo farebbe
         * ritentare, e ritentare duplica l'effetto) e non e' una riuscita.
         */
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_TOOL_EFFECT_UNKNOWN')
        expect(esito.content).toMatch(/may or may not/i)
    })
    it('un tool senza postcondizione non ne paga il costo, e l audit lo dice', async () => {
        const audit = vi.fn(async () => {})
        const esito = await executeTalosTool(
            scrittore({ run: async () => ({ ok: true, content: 'fatto' }) }),
            { id: 'n1' },
            deps({ audit }),
        )

        expect(esito.ok).toBe(true)
        // Assente, non `false`: la differenza fra «non dichiarata» e
        // «chiesta e non regge» e' la differenza fra una lacuna e una difesa.
        const riga = audit.mock.calls[0]![0] as Record<string, unknown>
        expect('verified' in riga).toBe(false)
    })
})

describe('A7 — la riga di audit porta il rischio della catena', () => {
    it('anche su un tool riuscito e senza postcondizione', async () => {
        const audit = vi.fn(async () => {})
        await executeTalosTool(
            scrittore({ run: async () => ({ ok: true, content: 'fatto' }) }),
            { id: 'n1' },
            deps({ audit }),
        )

        const riga = audit.mock.calls[0]![0] as Record<string, unknown>
        expect(riga.risk).toMatch(/^R[0-4]$/)
    })
})
