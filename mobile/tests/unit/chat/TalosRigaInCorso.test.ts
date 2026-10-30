// @vitest-environment jsdom
/**
 * RIGA-01..05 — LA riga in corso, una per tutta l'app (bozzetto approvato dall'owner il 28/10/2026): segno animato · frase · secondi
 * dall'ora dell'evento. I tre segni sono quelli che l'app ha già.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount as montaVue, type VueWrapper } from '@vue/test-utils'
import TalosRigaInCorso from '@/components/chat/TalosRigaInCorso.vue'

const ADESSO = new Date('2026-10-28T10:00:00Z').getTime()
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(ADESSO) })
// l'orologio è uno per pagina: ogni riga montata si smonta, sennò il suo orologio (coi timer finti del test prima) resta acceso
const montate: VueWrapper[] = []
const mount = ((c: unknown, o: unknown) => { const w = montaVue(c as never, o as never); montate.push(w as VueWrapper); return w }) as typeof montaVue
afterEach(() => { for (const w of montate.splice(0)) w.unmount(); vi.useRealTimers(); document.body.innerHTML = '' })

describe('RIGA la riga in corso', () => {
    it('RIGA-01 tre segni: il puntino che pulsa (lavoro), la linea del marchio (attesa di altri), il cerchio che gira (apro…)', () => {
        const puntino = mount(TalosRigaInCorso, { props: { testo: 'Comando', inizio: ADESSO } })
        expect(puntino.find('.talos-typing-pulse').exists()).toBe(true)
        const linea = mount(TalosRigaInCorso, { props: { testo: 'Mi collego', inizio: ADESSO, segno: 'linea' } })
        expect(linea.find('.talos-line-loader').exists()).toBe(true)
        const giro = mount(TalosRigaInCorso, { props: { testo: 'Apro', inizio: ADESSO, segno: 'giro' } })
        expect(giro.find('[data-testid="talos-riga-in-corso-giro"]').exists()).toBe(true)
    })

    it('RIGA-02 frase, dettaglio e secondi; i secondi dall\'ora dell\'evento, «0s» al primo istante', async () => {
        const w = mount(TalosRigaInCorso, { props: { testo: 'Carico il modello', dettaglio: '64%', inizio: ADESSO } })
        expect(w.get('[data-testid="talos-riga-in-corso-durata"]').text()).toBe('· 0s')
        await vi.advanceTimersByTimeAsync(12_000)
        expect(w.text()).toContain('Carico il modello')
        expect(w.text()).toContain('64%')
        expect(w.get('[data-testid="talos-riga-in-corso-durata"]').text()).toBe('· 12s')
    })

    it('RIGA-03 chi ascolta lo schermo sente tutto: role="status" e un nome con frase, dettaglio e durata', async () => {
        const w = mount(TalosRigaInCorso, { props: { testo: 'Mi collego a DESKTOP', dettaglio: 'tentativo 2', inizio: ADESSO - 4_000 } })
        expect(w.attributes('role')).toBe('status')
        expect(w.attributes('aria-label')).toBe('Mi collego a DESKTOP, tentativo 2, 4s')
    })

    it('RIGA-04 senza ora d\'evento niente secondi; la frase resta', () => {
        const w = mount(TalosRigaInCorso, { props: { testo: 'In corso', inizio: null } })
        expect(w.text()).toContain('In corso')
        expect(w.find('[data-testid="talos-riga-in-corso-durata"]').exists()).toBe(false)
    })

    it('RIGA-05 il tono «avviso» (la linea caduta) si vede', () => {
        const w = mount(TalosRigaInCorso, { props: { testo: 'Connessione persa', inizio: ADESSO, tono: 'avviso' } })
        expect(w.classes()).toContain('is-avviso')
        expect(w.classes()).toContain('text-[var(--talos-warning)]')
        expect(w.classes()).not.toContain('text-[var(--talos-muted)]')
    })

    /*
     * Owner 29/10 sera, mockup «Caricamenti vivi» v6 approvato (ledger `LEDGER-CARICAMENTI-VIVI-MOBILE-2026-10-29.md`):
     * D5 «un solo spazio prima di «· Ns»», D1 «la rotella della Chat ovunque» (arancione), e la riga in linea per le attese nei fogli.
     * ⛔ Lo stile della riga sta in classi Tailwind già usate dall'app, non in uno `<style>`: la riga entra nel pezzo d'avvio con la carta
     * della Chat e il CSS d'avvio ha 212 byte di margine (239.788 su 240.000).
     */
    it('RIGA-SPAZIO-01 un solo spazio prima dei dati: lo spazio della riga (0,5rem) meno 0,25rem', () => {
        const w = mount(TalosRigaInCorso, { props: { testo: 'Carico il modello', dettaglio: '64%', inizio: ADESSO } })
        expect(w.classes()).toContain('gap-2')
        const dati = w.findAll('.talos-riga-in-corso__dato')
        expect(dati).toHaveLength(2)
        for (const dato of dati) expect(dato.classes()).toContain('-ml-1')
        // il testo e il segno restano alla distanza di sempre
        expect(w.get('.talos-riga-in-corso__testo').classes()).not.toContain('-ml-1')
    })

    it('RIGA-GIRO-01 il cerchio che gira ha il colore della rotella della Chat; gli altri segni restano i loro', () => {
        const giro = mount(TalosRigaInCorso, { props: { testo: 'Apro', inizio: ADESSO, segno: 'giro' } })
        expect(giro.get('[data-testid="talos-riga-in-corso-giro"]').classes()).toEqual(expect.arrayContaining(['size-4', 'text-[var(--talos-accent)]', 'animate-spin']))
        const puntino = mount(TalosRigaInCorso, { props: { testo: 'Comando', inizio: ADESSO } })
        expect(puntino.get('.talos-riga-in-corso__segno').classes()).not.toContain('text-[var(--talos-accent)]')
    })

    it('RIGA-COMPATTA-01 `compatta` = in linea, senza l\'altezza minima della riga; di serie l\'altezza resta (righe del 28/10)', () => {
        const normale = mount(TalosRigaInCorso, { props: { testo: 'Comando', inizio: ADESSO } })
        expect(normale.classes()).toContain('min-h-8')
        const compatta = mount(TalosRigaInCorso, { props: { testo: 'Caricamento chat', inizio: null, segno: 'nessuno', compatta: true } })
        expect(compatta.classes()).not.toContain('min-h-8')
        expect(compatta.classes()).toEqual(expect.arrayContaining(['flex', 'min-w-0', 'items-center', 'gap-2', 'text-sm', 'text-[var(--talos-muted)]']))
        expect(compatta.find('.talos-riga-in-corso__segno').exists()).toBe(false)
    })
})
