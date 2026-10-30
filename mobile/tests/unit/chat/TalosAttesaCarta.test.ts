// @vitest-environment jsdom
/**
 * ATTESA-01..03 — l'attesa della Chat, una per tutta l'app (owner 29/10 sera, mockup v6 approvato: «Quella della Chat ovunque»;
 * ledger `LEDGER-CARICAMENTI-VIVI-MOBILE-2026-10-29.md`, emendamento «piano del codice sul mockup v6 APPROVATO»).
 * Il velo e la carta sono quelli di `ChatScreen.vue` (prima di questo commit `:1879-1893`), IDENTICI; i secondi arrivano dopo 2 s,
 * «12s · 1m 4s» (D4), e a un solo spazio dal testo (D5, prova RIGA-SPAZIO-01 nella riga).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount as montaVue, type VueWrapper } from '@vue/test-utils'
import TalosAttesaCarta from '@/components/chat/TalosAttesaCarta.vue'
import TalosRigaInCorso from '@/components/chat/TalosRigaInCorso.vue'

const ADESSO = new Date('2026-10-29T18:00:00Z').getTime()
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(ADESSO) })
const montate: VueWrapper[] = []
const mount = ((c: unknown, o: unknown) => { const w = montaVue(c as never, o as never); montate.push(w as VueWrapper); return w }) as typeof montaVue
afterEach(() => { for (const w of montate.splice(0)) w.unmount(); vi.useRealTimers(); document.body.innerHTML = '' })

// le classi del velo, della carta e della rotella della Chat (owner 09/08: «uno spinner al centro con una scritta caricamento chat»):
// se cambiano, cambiano qui e lo si vede
const VELO = 'fixed inset-0 z-[80] flex items-center justify-center bg-[var(--talos-background)]/75 supports-backdrop-filter:backdrop-blur-sm'
const CARTA = 'flex flex-col items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-card)] px-7 py-6 shadow-xl'
const ROTELLA = ['size-7', 'text-[var(--talos-accent)]', 'animate-spin']
const durata = (w: VueWrapper) => w.find('[data-testid="talos-riga-in-corso-durata"]')

describe('ATTESA-04 la carta senza velo (owner 29/10 notte, voce personale)', () => {
    it('ATTESA-04 `inline`: la stessa carta, al suo posto, senza il velo su tutta la pagina', () => {
        const w = mount(TalosAttesaCarta, { props: { testo: 'Elaboro la voce', inline: true } })
        expect(w.classes()).not.toContain('fixed')
        expect(w.find('[data-talos-attesa-carta]').exists()).toBe(true)
        expect(w.findAll('[role="status"]')).toHaveLength(1)
    })
})

describe('ATTESA l\'attesa della Chat', () => {
    it('ATTESA-01 velo, carta e rotella con le classi della Chat; la riga in linea, senza segno suo', () => {
        const w = mount(TalosAttesaCarta, { props: { testo: 'Caricamento Libreria', inizio: null, testid: 'talos-library-loading' } })
        expect(w.classes().join(' ')).toBe(VELO)
        expect(w.attributes('data-testid')).toBe('talos-library-loading')
        expect(w.get('[data-talos-attesa-carta]').classes().join(' ')).toBe(CARTA)
        const rotelle = w.findAll('svg')
        expect(rotelle).toHaveLength(1)
        expect(rotelle[0]!.classes()).toEqual(expect.arrayContaining(ROTELLA))
        expect(rotelle[0]!.attributes('aria-hidden')).toBe('true')
        const riga = w.getComponent(TalosRigaInCorso)
        // la rotella grande è già il segno (regola del 28/10): la riga porta solo frase e secondi, ed è in linea (`compatta`)
        expect(riga.props('segno')).toBe('nessuno')
        expect(riga.props('compatta')).toBe(true)
        expect(w.text()).toContain('Caricamento Libreria')
    })

    it('ATTESA-02 niente secondi prima dei 2 s; poi «· 2s», «· 1m 4s»', async () => {
        const w = mount(TalosAttesaCarta, { props: { testo: 'Caricamento sessioni…', inizio: ADESSO } })
        expect(durata(w).exists()).toBe(false)
        await vi.advanceTimersByTimeAsync(1_900)
        expect(durata(w).exists()).toBe(false)
        await vi.advanceTimersByTimeAsync(200)
        expect(durata(w).text()).toBe('· 2s')
        await vi.advanceTimersByTimeAsync(62_000)
        expect(durata(w).text()).toBe('· 1m 4s')
    })

    it('ATTESA-02 senza un\'ora d\'evento conta dal momento in cui la carta compare (è lì che l\'attesa comincia)', async () => {
        const w = mount(TalosAttesaCarta, { props: { testo: 'Caricamento chat', inizio: null } })
        await vi.advanceTimersByTimeAsync(1_999)
        expect(durata(w).exists()).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        expect(durata(w).text()).toBe('· 2s')
    })

    it('ATTESA-02 a 2 s esatti dice «· 2s» anche con l\'orologio della pagina già acceso a metà secondo (mai «· 1s», TRASC-06)', async () => {
        // un'altra riga in corso accende l'orologio unico della pagina: batte a +1 s, +2 s, +3 s…
        mount(TalosRigaInCorso, { props: { testo: 'Altro lavoro', inizio: ADESSO } })
        await vi.advanceTimersByTimeAsync(500)
        const w = mount(TalosAttesaCarta, { props: { testo: 'Sto cercando…', inizio: ADESSO + 500 } })
        // la soglia scade a +2,5 s, fra due battiti: l'ora letta deve essere quella vera, non quella del battito di +2 s
        await vi.advanceTimersByTimeAsync(2_000)
        expect(durata(w).text()).toBe('· 2s')
    })

    it('ATTESA-02 smontata, non lascia timer accesi', async () => {
        const w = mount(TalosAttesaCarta, { props: { testo: 'Caricamento chat', inizio: ADESSO } })
        await vi.advanceTimersByTimeAsync(500)
        w.unmount()
        montate.splice(montate.indexOf(w), 1)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('ATTESA-03 un solo role="status": lo tiene la riga, non il velo', async () => {
        const w = mount(TalosAttesaCarta, { props: { testo: 'Sto cercando…', inizio: ADESSO } })
        expect(w.findAll('[role="status"]')).toHaveLength(1)
        expect(w.attributes('role')).toBeUndefined()
        expect(w.attributes('aria-live')).toBeUndefined()
        expect(w.get('[role="status"]').attributes('aria-label')).toBe('Sto cercando…')
        await vi.advanceTimersByTimeAsync(3_000)
        expect(w.findAll('[role="status"]')).toHaveLength(1)
        expect(w.get('[role="status"]').attributes('aria-label')).toBe('Sto cercando…, 3s')
    })
})
