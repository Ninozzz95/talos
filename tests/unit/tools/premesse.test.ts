import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'

/**
 * ⭐⭐⭐ LE PREMESSE — «esiste ciò che questa azione presume?», chiesta PRIMA.
 *
 * `verify` impedisce di dire «fatto» su una cosa non fatta. Queste impediscono
 * una cosa peggiore: **chiedere alla persona di autorizzare un'azione che è già
 * impossibile**. Ogni scheda mostrata per una premessa falsa è un consenso speso
 * per niente, e insegna a toccare «Consenti» senza leggere.
 *
 * ⛔ Il test che conta di più non è «rifiuta»: è **l'ORDINE**. Un controllo dopo
 * la scheda non impedisce niente, e passerebbe qualunque prova scritta male.
 */

function strumento(overrides: Record<string, unknown> = {}) {
    return defineTalosTool({
        name: 'talos_prova',
        title: 'Prova',
        description: 'Un tool di prova',
        action: 'write',
        input: z.object({ chi: z.string() }),
        run: vi.fn(async () => ({ ok: true, content: 'fatto' })),
        ...overrides,
    })
}

function deps(overrides: Record<string, unknown> = {}) {
    return {
        permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'ask' as const },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => true),
        audit: vi.fn(async () => {}),
        context: { sessionId: 's1' },
        ...overrides,
    }
}

describe('le premesse, prima del consenso', () => {
    it('⛔⛔ ASSENTE: non chiede NIENTE alla persona e non esegue', async () => {
        const tool = strumento({
            premesse: vi.fn(async () => ({ stato: 'assente', perche: 'il contatto «Marco» non è in rubrica' })),
        })
        const d = deps()
        const result = await executeTalosTool(tool as never, { chi: 'Marco' }, d)

        expect(result.ok).toBe(false)
        expect(d.requestConsent).not.toHaveBeenCalled()
        expect(tool.run).not.toHaveBeenCalled()
        expect(result.code).toBe('TALOS_TOOL_PREMISE_ABSENT')
    })

    it('⛔ e dice COSA manca: senza, il modello riprova identico', async () => {
        const tool = strumento({
            premesse: async () => ({ stato: 'assente', perche: 'il contatto «Marco» non è in rubrica' }),
        })
        const result = await executeTalosTool(tool as never, { chi: 'Marco' }, deps())
        expect(result.content).toContain('«Marco» non è in rubrica')
    })

    it('⭐ l\'audit distingue «il runtime non ha chiesto» da «la persona ha detto no»', async () => {
        const righe: Array<Record<string, unknown>> = []
        const tool = strumento({
            premesse: async () => ({ stato: 'assente', perche: 'non c\'è' }),
        })
        await executeTalosTool(tool as never, { chi: 'x' }, deps({
            audit: async (r: Record<string, unknown>) => { righe.push(r) },
        }))
        expect(righe[0]?.status).toBe('premise_absent')
        expect(righe[0]?.status).not.toBe('denied')
    })

    it('PRESENTE: si prosegue come sempre — scheda e esecuzione', async () => {
        const tool = strumento({ premesse: async () => ({ stato: 'presente' }) })
        const d = deps()
        const result = await executeTalosTool(tool as never, { chi: 'Marco' }, d)

        expect(result.ok).toBe(true)
        expect(d.requestConsent).toHaveBeenCalledOnce()
        expect(tool.run).toHaveBeenCalledOnce()
    })

    it('⛔⛔ IGNOTO PROSEGUE: non sapere non autorizza a rifiutare', async () => {
        const tool = strumento({
            premesse: async () => ({ stato: 'ignoto', perche: 'permesso contatti negato' }),
        })
        const d = deps()
        const result = await executeTalosTool(tool as never, { chi: 'Marco' }, d)

        expect(result.ok).toBe(true)
        expect(tool.run).toHaveBeenCalledOnce()
        // Bloccare qui renderebbe TALOS inutile appena un permesso è negato, e
        // insegnerebbe che «non lo so» è un «no» — il difetto al contrario.
    })

    it('⛔ una premessa che ESPLODE è ignota, non assente', async () => {
        const tool = strumento({
            premesse: async () => { throw new Error('il ponte è giù') },
        })
        const result = await executeTalosTool(tool as never, { chi: 'Marco' }, deps())
        expect(result.ok).toBe(true)
        expect(tool.run).toHaveBeenCalledOnce()
        // Un controllo rotto non è la prova che una cosa non esista.
    })

    it('un tool che non dichiara premesse non cambia di una riga', async () => {
        const tool = strumento()
        const d = deps()
        const result = await executeTalosTool(tool as never, { chi: 'Marco' }, d)
        expect(result.ok).toBe(true)
        expect(d.requestConsent).toHaveBeenCalledOnce()
    })

    it('⭐⭐ L\'ORDINE: la premessa si chiede PRIMA del consenso, non dopo', async () => {
        const ordine: string[] = []
        const tool = strumento({
            premesse: async () => { ordine.push('premessa'); return { stato: 'presente' } },
            run: async () => { ordine.push('run'); return { ok: true, content: 'fatto' } },
        })
        await executeTalosTool(tool as never, { chi: 'Marco' }, deps({
            requestConsent: async () => { ordine.push('consenso'); return true },
        }))
        expect(ordine).toEqual(['premessa', 'consenso', 'run'])
    })

    it('⛔ e il permesso NEGATO vince comunque: la premessa non è un lasciapassare', async () => {
        const tool = strumento({ premesse: async () => ({ stato: 'presente' }) })
        const result = await executeTalosTool(tool as never, { chi: 'Marco' }, deps({
            permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'deny' as const },
        }))
        expect(result.ok).toBe(false)
        expect(tool.run).not.toHaveBeenCalled()
    })
})
