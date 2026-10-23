// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'

/*
 * ⭐⭐⭐ N13 (owner 02/10/2026, decisioni del 09/10) — a risposta finita e dopo il reload le righe degli attrezzi restano al loro
 * posto, un ragionamento per giro, solo l'ordine cronologico; le chat vecchie (senza sequenza) restano come oggi.
 */
function risposta(extra: Record<string, unknown>) {
    return {
        id: 'm1',
        role: 'assistant',
        content: 'Leggo la pagina. Domani piove.',
        createdAt: new Date('2026-10-11T10:00:00Z').toISOString(),
        status: 'complete',
        metadata: {},
        ...extra,
    }
}

async function lista(extra: Record<string, unknown>) {
    const w = mount(TalosMobileMessageList, {
        props: { messages: [risposta(extra)] as never, sending: false },
        global: { stubs: { teleport: true } },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}

/** Le posizioni nel documento: ragionamento, righe degli attrezzi, testo. */
function ordine(w: Awaited<ReturnType<typeof lista>>): string[] {
    // 22/10/2026 (owner: «ragionamento dentro il gruppo»): il ragionamento sta DENTRO il contenitore degli attrezzi, quindi si leggono
    // le righe a vista una per una (`data-voce="attrezzo"`), non i contenitori
    const nodi = w.element.querySelectorAll('[data-segmento="ragionamento"], [data-voce="attrezzo"], [data-segmento="testo"]')
    return [...nodi].map((nodo) => {
        if (nodo.matches('[data-segmento="ragionamento"]')) return `R:${nodo.textContent?.trim().slice(0, 12)}`
        if (nodo.matches('[data-voce="attrezzo"]')) return `A:${nodo.textContent?.trim()}`
        return `T:${nodo.textContent?.trim()}`
    })
}

describe('N13 — la sequenza nel messaggio salvato', () => {
    it('SEQ-UI-01 ragionamento → riga dell’attrezzo → testo → riga → ragionamento → testo, in quest’ordine', async () => {
        const w = await lista({
            reasoning: 'Cerco il meteo.La pagina dice pioggia.',
            metadata: {
                talos_sequenza: [
                    { tipo: 'ragionamento', testo: 'Cerco il meteo.' },
                    { tipo: 'attrezzi', attrezzi: [{ name: 'web_search', detail: 'meteo Messina' }] },
                    { tipo: 'testo', testo: 'Leggo la pagina. ' },
                    { tipo: 'attrezzi', attrezzi: [{ name: 'web_read', detail: 'ilmeteo.it' }] },
                    { tipo: 'ragionamento', testo: 'La pagina dice pioggia.' },
                    { tipo: 'testo', testo: 'Domani piove.' },
                ],
            },
        })
        const visti = ordine(w)
        expect(visti.map((voce) => voce[0])).toEqual(['R', 'A', 'T', 'A', 'R', 'T'])
        expect(visti[1]).toContain('meteo Messina')
        expect(visti[3]).toContain('ilmeteo.it')
        expect(visti[2]).toBe('T:Leggo la pagina.')
        // Un ragionamento per giro: quello intero del messaggio non si ripete anche in cima.
        expect(w.findAll('[data-testid="talos-reasoning-block"]')).toHaveLength(2)
        // Le righe di una risposta finita non sono «in corso», e nessuna stringa tecnica arriva allo schermo.
        expect(w.find('[data-testid="talos-tool-activity"]').exists()).toBe(false)
        expect(w.text()).not.toContain('web_search')
    })

    it('SEQ-UI-02 senza sequenza la risposta resta come oggi: un ragionamento sopra, poi il testo, nessuna riga', async () => {
        const w = await lista({ reasoning: 'Penso.' })
        expect(w.findAll('[data-testid="talos-reasoning-block"]')).toHaveLength(1)
        expect(w.text()).toContain('Leggo la pagina. Domani piove.')
        expect(ordine(w)).toEqual([])
        expect(w.find('[data-segmento="attrezzi"]').exists()).toBe(false)
    })

    // ⛔ SEQ-REG-PAD-01 (Pad, 11/10/2026): un attrezzo senza nome salvato nella sequenza faceva sparire TUTTE le righe.
    it('SEQ-UI-04 con un attrezzo senza nome nella sequenza le altre righe restano al loro posto', async () => {
        const w = await lista({
            metadata: {
                talos_sequenza: [
                    { tipo: 'attrezzi', attrezzi: [{ name: 'web_search', detail: 'meteo Messina' }] },
                    { tipo: 'ragionamento', testo: 'Leggo i risultati.' },
                    { tipo: 'attrezzi', attrezzi: [{ name: '', detail: null }] },
                    { tipo: 'ragionamento', testo: 'Non bastano.' },
                    { tipo: 'testo', testo: 'Leggo la pagina. Domani piove.' },
                ],
            },
        })
        expect(ordine(w).map((voce) => voce[0])).toEqual(['A', 'R', 'R', 'T'])
        expect(ordine(w)[0]).toContain('meteo Messina')
    })

    it('SEQ-UI-03 una sequenza storta non nasconde la risposta: si mostra il testo', async () => {
        const w = await lista({ metadata: { talos_sequenza: [{ tipo: 'boh' }] } })
        expect(w.text()).toContain('Leggo la pagina. Domani piove.')
    })
})
