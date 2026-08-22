import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop, type TalosAgentLoopDeps } from '@/lib/tools/agentLoop'

/**
 * B2 — il cancello del piano dentro il giro dell'agente.
 *
 * Una regola sola, ed è quella che conta: **nessuna chiamata parte prima che la
 * risposta del piano sia arrivata**. Il resto — se il piano serva, quali passi
 * contenga, quanto duri — lo decide chi implementa il gancio, che conosce
 * rischio e soglia; il loop non deve saperne niente.
 */

function deps(patch: Partial<TalosAgentLoopDeps> = {}): TalosAgentLoopDeps {
    let giro = 0
    return {
        complete: vi.fn(async () => {
            giro += 1
            return giro === 1
                ? {
                    text: '',
                    toolCalls: [
                        { id: 'c1', name: 'notes_list', arguments: {} },
                        { id: 'c2', name: 'web_search', arguments: { q: 'x' } },
                    ],
                }
                : { text: 'ecco la risposta', toolCalls: [] }
        }) as never,
        execute: vi.fn(async (call) => ({ ok: true, content: `fatto ${call.name}` })) as never,
        ...patch,
    }
}

describe('il cancello del piano', () => {
    it('senza il gancio, tutto parte come prima: nulla regredisce', async () => {
        const execute = vi.fn(async () => ({ ok: true, content: 'fatto' }))
        await runTalosAgentLoop([{ role: 'user', content: 'x' }], deps({ execute: execute as never }))

        expect(execute).toHaveBeenCalledTimes(2)
    })

    it('⛔ nessuna chiamata parte prima che il piano abbia risposto', async () => {
        const ordine: string[] = []
        const plan = vi.fn(async () => {
            ordine.push('piano')
            return { admitted: ['c1', 'c2'], cancelled: false }
        })
        const execute = vi.fn(async () => {
            ordine.push('esecuzione')
            return { ok: true, content: 'fatto' }
        })
        await runTalosAgentLoop(
            [{ role: 'user', content: 'x' }],
            deps({ plan: plan as never, execute: execute as never }),
        )

        expect(ordine[0]).toBe('piano')
        expect(ordine).toEqual(['piano', 'esecuzione', 'esecuzione'])
    })

    it('un passo TOLTO non parte, e il modello riceve comunque la sua riga', async () => {
        const execute = vi.fn(async (call: { name: string }) => ({
            ok: true, content: `fatto ${call.name}`,
        }))
        const esito = await runTalosAgentLoop([{ role: 'user', content: 'x' }], deps({
            plan: vi.fn(async () => ({ admitted: ['c1'], cancelled: false })) as never,
            execute: execute as never,
        }))

        // Solo il passo ammesso ha girato.
        expect(execute).toHaveBeenCalledTimes(1)
        expect(esito.text).toContain('ecco la risposta')
    })

    it('un piano RIFIUTATO non fa partire niente, e non e un errore', async () => {
        const execute = vi.fn(async () => ({ ok: true, content: 'fatto' }))
        const esito = await runTalosAgentLoop([{ role: 'user', content: 'x' }], deps({
            plan: vi.fn(async () => ({ admitted: [], cancelled: true })) as never,
            execute: execute as never,
        }))

        expect(execute).not.toHaveBeenCalled()
        // Il modello risponde lo stesso: un «no» non lascia la persona senza risposta.
        expect(esito.text).toContain('ecco la risposta')
    })

    it('e al modello viene detto di NON riprovare', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({
                text: '',
                toolCalls: [{ id: 'c1', name: 'notes_list', arguments: {} }],
            })
            .mockResolvedValueOnce({ text: 'va bene', toolCalls: [] })

        await runTalosAgentLoop([{ role: 'user', content: 'x' }], deps({
            complete: complete as never,
            plan: vi.fn(async () => ({ admitted: [], cancelled: true })) as never,
        }))

        const secondaChiamata = complete.mock.calls[1]![0] as Array<{ role: string, content: string }>
        const rigaDelTool = secondaChiamata.find((turno) => turno.role === 'tool')
        expect(rigaDelTool?.content).toMatch(/did not approve/i)
        expect(rigaDelTool?.content).toMatch(/do not try again/i)
    })
})
