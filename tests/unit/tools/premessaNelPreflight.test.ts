import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, preflightTalosToolExecution } from '@/lib/tools/executor'

/**
 * ⛔⛔⛔ IL PERCORSO DELLA CHAT, non quello diretto.
 *
 * `premesse.test.ts` chiama `executeTalosTool()` e passa. Ma la chat non chiama
 * quello: chiama PRIMA `preflightTalosToolExecution()`, e se quello risponde
 * `authorization_required` crea il checkpoint e mostra la scheda — **poi**
 * esegue.
 *
 * ⇒ Se la premessa vive solo dentro `executeTalosTool`, in produzione la
 * persona spende un consenso per un'azione già impossibile: esattamente ciò che
 * il commento di `premesse()` dice di impedire.
 */

const tool = defineTalosTool({
    name: 'talos_prova_preflight',
    title: 'Prova',
    description: 'Un tool di prova',
    action: 'write',
    input: z.object({ chi: z.string() }),
    premesse: vi.fn(async () => ({
        stato: 'assente' as const,
        perche: 'il contatto «Marco» non è in rubrica',
        copertura: 'completa' as const,
    })),
    run: vi.fn(async () => ({ ok: true, content: 'fatto' })),
})

const deps = () => ({
    permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'ask' as const },
    isToolEnabled: () => true,
    requestConsent: async () => 'unanswered' as const,
    audit: async () => {},
    context: { sessionId: 's1' },
})

describe('la premessa nel preflight della chat', () => {
    it('⛔⛔ premessa ASSENTE ⇒ il preflight è TERMINALE, non «chiedi il consenso»', async () => {
        const esito = await preflightTalosToolExecution(tool as never, { chi: 'Marco' }, deps())
        expect(esito.status).toBe('terminal')
        expect(esito.status !== 'terminal' && 'request' in esito).toBe(false)
    })

    it('⛔ e porta il motivo giusto, così il modello non riprova identico', async () => {
        const esito = await preflightTalosToolExecution(tool as never, { chi: 'Marco' }, deps())
        expect(esito.status === 'terminal' && esito.result.code).toBe('TALOS_TOOL_PREMISE_ABSENT')
        expect(esito.status === 'terminal' && esito.audit.status).toBe('premise_absent')
    })
})

describe('la policy su «non lo so»', () => {
    const conIgnoto = (policy?: 'continue' | 'reject') => defineTalosTool({
        name: 'talos_ignoto',
        title: 'Prova',
        description: 'Un tool di prova',
        action: 'write',
        ...(policy ? { premiseUnknownPolicy: policy } : {}),
        input: z.object({ chi: z.string() }),
        premesse: async () => ({ stato: 'ignoto' as const, perche: 'il ponte non ha risposto' }),
        run: async () => ({ ok: true, content: 'fatto' }),
    })

    it('⛔⛔ per DIFETTO «ignoto» prosegue: non sapere non autorizza a rifiutare', async () => {
        const esito = await preflightTalosToolExecution(conIgnoto() as never, { chi: 'x' }, deps())
        expect(esito.status).toBe('authorization_required')
    })

    it('e «continue» dichiarato si comporta come il difetto', async () => {
        const esito = await preflightTalosToolExecution(conIgnoto('continue') as never, { chi: 'x' }, deps())
        expect(esito.status).toBe('authorization_required')
    })

    it('⭐⭐ ma «reject» ferma: su una mutazione strutturale «non lo so» non basta', async () => {
        const esito = await preflightTalosToolExecution(conIgnoto('reject') as never, { chi: 'x' }, deps())
        expect(esito.status).toBe('terminal')
        expect(esito.status === 'terminal' && esito.result.code).toBe('TALOS_TOOL_PREMISE_UNKNOWN')
    })

    it('⛔ un tool NEGATO non fa nemmeno valutare la premessa: un diniego non deve costare una lettura', async () => {
        let chiamata = false
        const tool = defineTalosTool({
            name: 'talos_negato',
            title: 'Prova',
            description: 'Un tool di prova',
            action: 'write',
            input: z.object({ chi: z.string() }),
            premesse: async () => { chiamata = true; return { stato: 'presente' as const } },
            run: async () => ({ ok: true, content: 'fatto' }),
        })
        const esito = await preflightTalosToolExecution(tool as never, { chi: 'x' }, {
            ...deps(),
            permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'deny' as const },
        })
        expect(esito.status).toBe('terminal')
        expect(chiamata).toBe(false)
    })
})
