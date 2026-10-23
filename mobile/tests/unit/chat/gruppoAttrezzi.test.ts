// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import TalosMobileAttivitaDelTurno from '@/components/chat/TalosMobileAttivitaDelTurno.vue'
import { TALOS_EN_MESSAGES as en } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES as it_ } from '@/i18n/locales/it'

/*
 * ⛔ Difetto 2 dell'owner (20/10/2026, foto dal Pad): con tante chiamate in un giro le righe degli attrezzi occupano troppo
 * spazio. Si raggruppano in un collassabile: una riga di riassunto che si apre al tocco (Hermes `fallback.tsx:1012-1043`,
 * `run-summary.ts:160`; Codex `exec_cell/render.rs:318`). Righe CONSECUTIVE soltanto: un testo o un ragionamento in mezzo
 * le separa (ordine cronologico, decisione owner 09/10). Ledger: `LEDGER-RIGHE-ATTREZZI-2026-10-20.md`.
 */
const giro = (attrezzi: Array<[string, string | null]>) => ({ tipo: 'attrezzi', attrezzi: attrezzi.map(([name, detail]) => ({ name, detail })) })

/** Il componente ha più radici: lo si monta dentro un contenitore, come nella lista. */
function monta(props: Record<string, unknown>) {
    return mount(defineComponent({ setup: () => () => h('div', [h(TalosMobileAttivitaDelTurno, props)]) }))
}

async function salvata(sequenza: unknown[]) {
    const w = monta({ salvata: sequenza, testo: '' })
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}

describe('difetto 2: tante righe di attrezzi in un collassabile', () => {
    it('GRP-01 quattro righe in giri consecutivi: un riassunto chiuso, «4 steps»; al tocco si aprono tutte', async () => {
        const w = await salvata([
            { tipo: 'ragionamento', testo: 'Cerco.' },
            giro([['web_search', 'caffè moka'], ['web_search', 'espresso 3D']]),
            giro([['web_read', 'it.wikipedia.org']]),
            giro([['web_read', 'illy.com']]),
            { tipo: 'testo', testo: 'Ecco.' },
        ])
        const gruppo = w.get('[data-testid="talos-tool-group"]')
        const pulsante = gruppo.get('button')
        expect(pulsante.attributes('aria-expanded')).toBe('false')
        expect(pulsante.text()).toContain('4 steps')
        expect(pulsante.text()).toContain('Searching the web')
        expect(pulsante.text()).toContain('Reading a web page')
        expect(gruppo.text()).not.toContain('illy.com')
        // un solo contenitore per le righe consecutive
        expect(w.findAll('[data-segmento="attrezzi"]')).toHaveLength(1)
        await pulsante.trigger('click')
        expect(pulsante.attributes('aria-expanded')).toBe('true')
        for (const parola of ['caffè moka', 'espresso 3D', 'it.wikipedia.org', 'illy.com']) expect(gruppo.text()).toContain(parola)
        const controllato = pulsante.attributes('aria-controls')!
        expect(w.find(`#${controllato}`).exists()).toBe(true)
        await pulsante.trigger('click')
        expect(gruppo.text()).not.toContain('illy.com')
    })

    it('GRP-02 sotto la soglia (due righe) resta tutto com’era: nessun riassunto, righe figlie dirette', async () => {
        const w = await salvata([giro([['web_search', 'caffè'], ['web_read', 'illy.com']])])
        expect(w.find('[data-testid="talos-tool-group"]').exists()).toBe(false)
        expect(w.get('[data-segmento="attrezzi"]').element.children).toHaveLength(2)
        expect(w.text()).toContain('illy.com')
    })

    it('GRP-03 mentre scrive, chiuso: il riassunto vivo e SOLO le righe ancora in corso', async () => {
        const confini = [
            { testo: 0, ragionamento: 0, attrezzi: [{ name: 'web_search', detail: 'caffè' }] },
            { testo: 0, ragionamento: 0, attrezzi: [{ name: 'web_read', detail: 'wikipedia' }] },
            { testo: 0, ragionamento: 0, attrezzi: [{ name: 'web_read', detail: 'illy.com' }] },
        ]
        const w = monta({ confini, testo: '', ragionamento: '', vivo: true })
        await flushPromises()
        const gruppo = w.get('[data-testid="talos-tool-group"]')
        expect(gruppo.get('button').attributes('aria-expanded')).toBe('false')
        expect(gruppo.text()).toContain('illy.com')
        expect(gruppo.text()).not.toContain('wikipedia')
        expect(w.get('[data-segmento="attrezzi"]').attributes('data-testid')).toBe('talos-tool-activity')
    })

    it('GRP-03b un giro solo che corre (tutte le righe in corso) non si piega: ogni riga col suo orologio', async () => {
        const w = monta({ attivi: [
            { name: 'web_read', detail: 'a.it' }, { name: 'web_read', detail: 'b.it' }, { name: 'web_read', detail: 'c.it' },
        ] })
        await flushPromises()
        expect(w.find('[data-testid="talos-tool-group"]').exists()).toBe(false)
        for (const sito of ['a.it', 'b.it', 'c.it']) expect(w.text()).toContain(sito)
    })

    /*
     * ⛔ Owner 22/10/2026, foto dal Pad («guarda che casino»): nel Codice col modello locale 17 righe «Scrittura di un file…» una sotto
     * l'altra, TUTTE coi puntini e l'orologio che corre (16 min, 14 min…), nessun gruppo. Senza testo fra una chiamata e l'altra r4
     * mette tutte le chiamate nello STESSO confine, e «in corso» si decideva per confine: l'ultimo era tutto «in corso», anche le
     * chiamate col risultato già arrivato. Una chiamata finita (`finita`, dal suo `ToolCallResult`) non è mai in corso.
     */
    it('GRP-06 nello stesso confine le chiamate finite non sono in corso: il gruppo le piega e resta solo quella viva', async () => {
        const finita = (detail: string) => ({ name: 'scrivi', detail, finita: true })
        const confini = [{ testo: 0, ragionamento: 0, attrezzi: [
            finita('calcolatrice.js'), finita('test.js'), finita('calcolatrice.js'), finita('calcolatrice.js'), finita('test.js'),
            { name: 'shell', detail: 'node test.js' },
        ] }]
        const w = monta({ confini, testo: '', ragionamento: '', vivo: true })
        await flushPromises()
        const gruppo = w.get('[data-testid="talos-tool-group"]')
        expect(gruppo.get('button').attributes('aria-expanded')).toBe('false')
        expect(gruppo.get('button').text()).toContain('6 steps')
        expect(gruppo.text()).toContain('node test.js')
        expect(gruppo.text()).not.toContain('calcolatrice.js')
    })

    /*
     * ⛔ DECISIONE OWNER 22/10/2026 («Ragionamento dentro il gruppo», dopo la foto del Codice con LFM2.5: «Ragionamento ›» / attrezzo /
     * «Ragionamento ›»… 36 righe per 18 passi). Supera la regola del 09/10: i ragionamenti fra un attrezzo e l'altro stanno DENTRO il
     * gruppo; aperto, tutto in ordine cronologico; solo il testo per la persona lo spezza. Ricerca:
     * `RICERCA-RAGIONAMENTO-NEI-GRUPPI-2026-10-22.md` (Claude Code, Codex `activity_groups.rs:1-41`, opencode, Jan).
     */
    it('GRP-07 i ragionamenti fra gli attrezzi stanno nel gruppo: chiuso si vedono solo «N passi», aperto tutto in ordine', async () => {
        const w = await salvata([
            { tipo: 'ragionamento', testo: 'PENSIERO-1' },
            giro([['web_search', 'a']]),
            { tipo: 'ragionamento', testo: 'PENSIERO-2' },
            giro([['web_read', 'b']]),
            { tipo: 'ragionamento', testo: 'PENSIERO-3' },
            giro([['web_read', 'c']]),
            { tipo: 'ragionamento', testo: 'PENSIERO-4' },
            giro([['web_read', 'd']]),
            { tipo: 'testo', testo: 'Ecco il risultato.' },
        ])
        // un solo gruppo, chiuso: niente righe «Ragionamento» né attrezzi a vista, il testo per la persona resta fuori
        expect(w.findAll('[data-testid="talos-tool-group"]')).toHaveLength(1)
        const gruppo = w.get('[data-testid="talos-tool-group"]')
        expect(gruppo.get('button').text()).toContain('4 steps')
        expect(w.findAll('[data-segmento="ragionamento"]')).toHaveLength(0)
        expect(w.text()).toContain('Ecco il risultato.')
        // aperto: pensieri e attrezzi nell'ordine in cui sono successi
        await gruppo.get('button').trigger('click')
        await flushPromises()
        expect(w.findAll('[data-segmento="ragionamento"]')).toHaveLength(4)
        const html = gruppo.html()
        const posizioni = ['a', 'b', 'c', 'd'].map((d) => html.indexOf(`: ${d}<`) >= 0 ? html.indexOf(`: ${d}<`) : html.indexOf(d))
        expect([...posizioni].sort((x, y) => x - y)).toEqual(posizioni)
    })

    it('GRP-08 a turno finito l\'ultimo gruppo dice per quanto ha lavorato; senza durata dice solo i passi', async () => {
        const sequenza = [
            { tipo: 'ragionamento', testo: 'P1' }, giro([['web_search', 'a']]), giro([['web_read', 'b']]), giro([['web_read', 'c']]),
            { tipo: 'testo', testo: 'Fatto.' },
        ]
        const conDurata = monta({ salvata: sequenza, testo: '', durataMs: 95_000 })
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(conDurata.get('[data-testid="talos-tool-group"] button').text()).toContain('Worked for 1m 35s · 3 steps')
        const senza = await salvata(sequenza)
        const testo = senza.get('[data-testid="talos-tool-group"] button').text()
        expect(testo).toContain('3 steps')
        expect(testo).not.toContain('Worked for')
    })

    it('GRP-07b un testo per la persona fra due passi spezza il gruppo anche coi ragionamenti', async () => {
        const w = await salvata([
            { tipo: 'ragionamento', testo: 'P1' }, giro([['web_search', 'a']]), { tipo: 'ragionamento', testo: 'P2' }, giro([['web_read', 'b']]),
            { tipo: 'testo', testo: 'Ho trovato due pagine.' },
            { tipo: 'ragionamento', testo: 'P3' }, giro([['web_read', 'c']]),
        ])
        expect(w.find('[data-testid="talos-tool-group"]').exists()).toBe(false)
        expect(w.findAll('[data-segmento="attrezzi"]')).toHaveLength(2)
    })

    it('GRP-04 un testo fra le righe le separa: niente gruppo che scavalchi l’ordine cronologico', async () => {
        const w = await salvata([
            giro([['web_search', 'a'], ['web_search', 'b']]),
            { tipo: 'testo', testo: 'Leggo.' },
            giro([['web_read', 'c'], ['web_read', 'd']]),
        ])
        expect(w.find('[data-testid="talos-tool-group"]').exists()).toBe(false)
        expect(w.findAll('[data-segmento="attrezzi"]')).toHaveLength(2)
    })

    it('GRP-05 le parole nuove esistono in inglese E in italiano', () => {
        const chat = (lingua: unknown) => (lingua as { chat: Record<string, unknown> }).chat
        for (const chiave of ['toolGroupSteps', 'toolDraftSize']) {
            expect(typeof chat(en)[chiave]).toBe('string')
            expect(typeof chat(it_)[chiave]).toBe('string')
            expect(chat(en)[chiave]).not.toBe(chat(it_)[chiave])
        }
    })
})
