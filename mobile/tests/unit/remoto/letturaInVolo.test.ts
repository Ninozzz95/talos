// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { ATTESA_CONTROLLO_MS, creaComputerRemoti, type PluginComputer } from '@/lib/remoto/computerRemoti'

/**
 * ⛔ D-MOCK-2 (dal Pad, vc175, 24/10/2026): nella lista del Codice tutti e 7 i PC «non rispondono», anche quello che un attimo prima
 * era in linea con 14 sessioni. Il collegamento nativo verso un PC spento resta aperto fino a 2 × 30 s, oltre il tetto di 10 s della
 * schermata; ogni nuova lettura (Computer, poi la colonna e la pagina del Codice sul tablet) ne apriva un altro, e quello verso il PC
 * acceso restava in coda. Una lettura per PC alla volta: chi la chiede mentre è in volo riceve la stessa.
 */
function pluginMuto(): PluginComputer {
    return {
        accoppia: vi.fn(), concludiAccoppiamento: vi.fn(), invia: vi.fn(async () => {}), chiudi: vi.fn(async () => {}),
        // il PC spento: il collegamento non finisce mai (il nativo aspetta)
        collega: vi.fn(() => new Promise<{ canale: string }>(() => {})),
        percorso: vi.fn(), elenco: vi.fn(async () => ({ computer: [] })), dimentica: vi.fn(), nomeDelTelefono: vi.fn(), scansiona: vi.fn(),
        addListener: vi.fn(async () => ({ remove: async () => {} })) as PluginComputer['addListener'],
    } as unknown as PluginComputer
}

describe('una lettura per PC alla volta', () => {
    it('INVOLO-01 due riepiloghi dello stesso PC mentre il primo è in volo aprono UN solo collegamento', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        try {
            const plugin = pluginMuto()
            const c = creaComputerRemoti(plugin)
            const primo = c.riepilogo('spento')
            const secondo = c.riepilogo('spento')
            await vi.advanceTimersByTimeAsync(ATTESA_CONTROLLO_MS)
            expect(await primo).toEqual({ inLinea: false, code: 'TIMEOUT' })
            expect(await secondo).toEqual({ inLinea: false, code: 'TIMEOUT' })
            // scaduto il tetto della schermata il collegamento nativo è ancora aperto: un terzo riepilogo non ne apre un altro
            const terzo = c.riepilogo('spento')
            await vi.advanceTimersByTimeAsync(ATTESA_CONTROLLO_MS)
            expect(await terzo).toEqual({ inLinea: false, code: 'TIMEOUT' })
            expect(plugin.collega).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('INVOLO-02 ⛔ verso contrario: PC diversi si leggono insieme, e finita una lettura la successiva riparte', async () => {
        const plugin = pluginMuto()
        let fallisci = true
        plugin.collega = vi.fn(async () => {
            if (fallisci) throw Object.assign(new Error('x'), { code: 'UNREACHABLE' })
            return new Promise<{ canale: string }>(() => {})
        }) as PluginComputer['collega']
        const c = creaComputerRemoti(plugin)
        await Promise.all([c.riepilogo('a'), c.riepilogo('b')])
        expect((plugin.collega as ReturnType<typeof vi.fn>).mock.calls.map((x) => x[0].pcId).sort()).toEqual(['a', 'b'])
        await c.riepilogo('a')
        expect(plugin.collega).toHaveBeenCalledTimes(3)
        fallisci = false
    })
})
