// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileRunDetailsSheet from '@/components/chat/TalosMobileRunDetailsSheet.vue'
import type { TalosRunRecord } from '@/lib/chat/runDetails'

/**
 * Owner 2026-09-13, foto del Pad: «Dettagli esecuzione» mostrava quattro righe
 * «Ricerca sul web» identiche, e quella fallita non si distingueva dalle altre.
 * E se la lettura non riesce, il foglio non deve fingere «nessun attrezzo».
 */
afterEach(() => { document.body.innerHTML = '' })
const tools = () => document.body.querySelector<HTMLElement>('[data-testid="talos-run-tools"]')!

describe('TalosMobileRunDetailsSheet', () => {
    it('ogni riga porta la sua query, e l\'errore resta sulla riga giusta', async () => {
        const wrapper = mount(TalosMobileRunDetailsSheet, {
            attachTo: document.body,
            props: {
                activities: [
                    { id: 'a', operation: 'tool.web_search', status: 'failed', payload: { input: { query: 'tokyo time' } } },
                    { id: 'b', operation: 'tool.web_search', status: 'succeeded', payload: { input: { query: 'android 16 jobs' } } },
                ],
            },
        })
        await flushPromises()
        const rows = [...tools().querySelectorAll<HTMLElement>('[data-status]')]
        expect(rows.map((row) => row.dataset.status)).toEqual(['failed', 'succeeded'])
        expect(rows[0].textContent).toContain('tokyo time')
        expect(rows[0].textContent).toContain('failed')
        expect(rows[1].textContent).toContain('android 16 jobs')
        // ⛔ Il verso contrario: il nome grezzo dell'operazione non arriva a schermo.
        expect(tools().textContent).not.toContain('tool.web_search')
        wrapper.unmount()
    })

    it('se la lettura non riesce lo dice, e non scrive «nessun attrezzo»', async () => {
        const wrapper = mount(TalosMobileRunDetailsSheet, { attachTo: document.body, props: { activities: 'unavailable' } })
        await flushPromises()
        expect(tools().textContent).toContain('could not be read')
        expect(tools().textContent).not.toContain('No tools were recorded')
        wrapper.unmount()
    })

    it('un elenco vuoto dice «nessuno registrato», non «nessuno usato»', async () => {
        const wrapper = mount(TalosMobileRunDetailsSheet, { attachTo: document.body, props: { activities: [] } })
        await flushPromises()
        expect(tools().textContent).toContain('No tools were recorded')
        wrapper.unmount()
    })
})

/**
 * Owner 2026-09-13 — «Dettagli esecuzione», fase 1b: token e costo, tempi. Quattro costi,
 * e ciò che il fornitore non manda si legge «not reported», mai 0.
 */
describe('TalosMobileRunDetailsSheet — token, costo e tempi', () => {
    const run: TalosRunRecord = {
        v: 1, provider: 'openrouter', model: 'z-ai/glm-5.3-flash', rounds: 3,
        tokens: { input: 1200, output: 340, reasoning: null, cached: 800 },
        reportedCostUsd: 0.000412, reportedCostRounds: 3, callIds: ['gen-1'],
        startedAt: '2026-09-13T22:00:00.000Z', firstChunkMs: 850, totalMs: 4230,
    }
    const testo = (id: string) => document.body.querySelector<HTMLElement>('[data-testid="' + id + '"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

    it('mostra i token, la cache, il costo vero e i tempi coi passaggi', async () => {
        const wrapper = mount(TalosMobileRunDetailsSheet, { attachTo: document.body, props: { activities: [], run, cost: { kind: 'real', usd: 0.000412 } } })
        await flushPromises()
        expect(testo('talos-run-input')).toContain('1,200')
        expect(testo('talos-run-input')).toContain('800 from cache')
        expect(testo('talos-run-output')).toContain('340')
        // ⛔ Il ragionamento che il fornitore non ha mandato NON diventa «0 of reasoning».
        expect(testo('talos-run-output')).not.toContain('reasoning')
        expect(testo('talos-run-cost')).toContain('0.000412')
        expect(testo('talos-run-first-chunk')).toContain('0.9 s')
        expect(testo('talos-run-total')).toContain('4.2 s')
        expect(testo('talos-run-rounds')).toContain('3')
        wrapper.unmount()
    })

    it('le altre tre forme del costo: gratis, stima con la data, non comunicato', async () => {
        for (const [cost, atteso] of [
            [{ kind: 'free' }, 'Free, on this phone'],
            [{ kind: 'estimate', usd: 0.0105, priceListDate: '2026-09-13' }, 'Estimate:'],
            [{ kind: 'unknown' }, 'Not reported by the provider'],
        ] as const) {
            const wrapper = mount(TalosMobileRunDetailsSheet, { attachTo: document.body, props: { activities: [], run: { ...run, provider: 'anthropic' }, cost } })
            await flushPromises()
            expect(testo('talos-run-cost')).toContain(atteso)
            if (cost.kind === 'estimate') expect(testo('talos-run-cost')).toContain('OpenRouter price list')
            wrapper.unmount()
            document.body.innerHTML = ''
        }
    })

    it('un token assente si legge «not reported», e senza run tutto è «non registrato»', async () => {
        const senza = mount(TalosMobileRunDetailsSheet, { attachTo: document.body, props: { activities: [], run: { ...run, tokens: { input: null, output: 5, reasoning: null, cached: null } }, cost: { kind: 'unknown' } } })
        await flushPromises()
        expect(testo('talos-run-input')).toContain('not reported')
        senza.unmount()
        document.body.innerHTML = ''
        const vecchio = mount(TalosMobileRunDetailsSheet, { attachTo: document.body, props: { activities: [] } })
        await flushPromises()
        expect(testo('talos-run-usage')).toContain('Not recorded')
        expect(testo('talos-run-timings')).toContain('Not recorded')
        expect(document.body.querySelector('[data-testid="talos-run-cost"]')).toBeNull()
        vecchio.unmount()
    })
})
