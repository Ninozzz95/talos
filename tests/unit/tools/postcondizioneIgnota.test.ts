import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'

/**
 * ⛔⛔⛔ «NON SONO RIUSCITO A VERIFICARE» NON È «FATTO».
 *
 * La postcondizione c'era ed era giusta: un attrezzo che dice «fatto» viene
 * controllato. Ma se a esplodere è **il controllore**, il risultato di `run`
 * restava l'ultima parola — cioè successo pieno, senza una parola di dubbio.
 *
 * ## E il difetto vero è più in basso
 *
 * `postcondizione()` tornava `null` in DUE casi diversi:
 *
 * ```
 * l'attrezzo non dichiara un verificatore   → null   (non c'era niente da controllare)
 * il verificatore ha lanciato               → null   (c'era, e non si sa com'e andata)
 * ```
 *
 * Due stati collassati in uno, e l'audit non poteva distinguerli: un attrezzo
 * senza controllo e un attrezzo il cui controllo è morto lasciano la stessa
 * identica riga. È la stessa forma di «ok:false su un elenco vero» — tre stati
 * schiacciati in due, e chi legge riempie il vuoto per conto suo.
 *
 * ⛔ Per un attrezzo che CAMBIA qualcosa la conseguenza è pesante: ripetere una
 * chiamata il cui effetto è ignoto può applicarlo due volte. Un messaggio
 * mandato due volte non si ritira.
 */

const deps = () => ({
    permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'allow' as const, read: 'allow' as const },
    isToolEnabled: () => true,
    requestConsent: vi.fn(async () => true),
    audit: vi.fn(async () => {}),
    context: { sessionId: 's1' },
})

const attrezzo = (opzioni: {
    action: 'read' | 'write'
    verify?: () => Promise<{ held: boolean, reason?: string }>
}) => defineTalosTool({
    name: 'prova_effetto',
    title: 'Prova effetto',
    description: 'x',
    action: opzioni.action,
    requiredActions: [opzioni.action],
    input: z.object({}),
    run: async () => ({ ok: true as const, content: 'done' }),
    ...(opzioni.verify ? { verify: opzioni.verify as never } : {}),
}) as never

describe('⛔⛔ quando il VERIFICATORE esplode', () => {
    it('un attrezzo che CAMBIA qualcosa non deve dire «fatto»', async () => {
        const esito = await executeTalosTool(attrezzo({
            action: 'write',
            verify: async () => { throw new Error('il ponte non risponde') },
        }), {}, deps())

        expect(esito.code).toBe('TALOS_TOOL_EFFECT_UNKNOWN')
        expect(esito.content).toMatch(/may or may not/i)
        // ⛔ E deve dire di NON ripetere alla cieca: ripetere un effetto già
        // applicato è il modo di mandare due volte lo stesso messaggio.
        expect(esito.content).toMatch(/without checking|do not repeat/i)
    })

    it('⭐ ma un attrezzo che LEGGE resta un successo: non ha cambiato niente', async () => {
        const esito = await executeTalosTool(attrezzo({
            action: 'read',
            verify: async () => { throw new Error('il ponte non risponde') },
        }), {}, deps())
        expect(esito.ok).toBe(true)
        expect(esito.code).toBeUndefined()
    })

    it('⛔⛔ e l\'audit distingue «nessun controllo» da «controllo morto»', async () => {
        const d1 = deps()
        await executeTalosTool(attrezzo({ action: 'read' }), {}, d1)
        const senzaControllo = d1.audit.mock.calls.at(-1)![0] as Record<string, unknown>

        const d2 = deps()
        await executeTalosTool(attrezzo({
            action: 'read',
            verify: async () => { throw new Error('morto') },
        }), {}, d2)
        const controlloMorto = d2.audit.mock.calls.at(-1)![0] as Record<string, unknown>

        expect(senzaControllo.postcondizione).toBe('nessuna')
        expect(controlloMorto.postcondizione).toBe('ignota')
        /*
         * ⛔ Prima erano identiche. Chi guarda l'audit per capire se un effetto
         * è avvenuto non poteva sapere se nessuno avesse controllato o se il
         * controllo fosse morto — e quelle due righe portano a due decisioni
         * opposte.
         */
    })

    it('⭐ e un controllo che REGGE resta scritto come tale', async () => {
        const d = deps()
        await executeTalosTool(attrezzo({
            action: 'write', verify: async () => ({ held: true }),
        }), {}, d)
        expect((d.audit.mock.calls.at(-1)![0] as Record<string, unknown>).postcondizione).toBe('retta')
    })

    it('⛔ un controllo che SMENTISCE resta un fallimento, come prima', async () => {
        const esito = await executeTalosTool(attrezzo({
            action: 'write', verify: async () => ({ held: false, reason: 'non c\'e' }),
        }), {}, deps())
        expect(esito.code).toBe('TALOS_TOOL_POSTCONDITION_FAILED')
    })
})

const esplode = (opzioni: { verify?: () => Promise<{ held: boolean, reason?: string }> }) =>
    defineTalosTool({
        name: 'prova_esplode',
        title: 'Prova esplode',
        description: 'x',
        action: 'write',
        requiredActions: ['write'],
        input: z.object({}),
        run: async () => { throw new Error('il ponte e caduto a meta') },
        ...(opzioni.verify ? { verify: opzioni.verify as never } : {}),
    }) as never

describe('⛔⛔⛔ quando falliscono TUTTI E DUE', () => {
    it('run esplode e anche il controllore: non e un fallimento, e un dubbio', async () => {
        const esito = await executeTalosTool(esplode({
            verify: async () => { throw new Error('non riesco a rileggere') },
        }), {}, deps())

        expect(esito.code).toBe('TALOS_TOOL_EFFECT_UNKNOWN')
        expect(esito.content).toMatch(/may or may not/i)
        /*
         * ⛔ Dire «fallito» qui e la parola che sembra prudente ed e la peggiore:
         * e l'istruzione che fa ritentare, e ritentare un effetto gia applicato
         * manda due volte lo stesso messaggio. Un secondo invio non si ritira.
         */
    })

    it('⭐ ma se il controllore REGGE, l esito si promuove ancora', async () => {
        const esito = await executeTalosTool(esplode({
            verify: async () => ({ held: true }),
        }), {}, deps())
        expect(esito.ok).toBe(true)
        expect(esito.content).toMatch(/reported an error, but the change is there/i)
    })

    it('⛔ e se il controllore SMENTISCE resta un fallimento vero', async () => {
        const esito = await executeTalosTool(esplode({
            verify: async () => ({ held: false, reason: 'niente e cambiato' }),
        }), {}, deps())
        expect(esito.ok).toBe(false)
        expect(esito.code).not.toBe('TALOS_TOOL_EFFECT_UNKNOWN')
    })
})
