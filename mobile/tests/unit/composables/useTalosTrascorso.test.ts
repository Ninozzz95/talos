// @vitest-environment jsdom
/**
 * TRASC-01..05 — i secondi delle righe in corso contano dall'ORA DELL'EVENTO, non dal montaggio (owner 27/10/2026: «ogni riga in
 * corso deve essere animata e con un counter di secondi»; bozzetto approvato il 28/10; desktop ATTESA-DA-CAPO, `app.js:14066-14071`).
 * Un solo orologio per pagina, spento quando nessuno lo guarda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { talosTrascorsoEtichetta, useTalosTrascorso } from '@/composables/useTalosTrascorso'

const ADESSO = new Date('2026-10-28T10:00:00Z').getTime()
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(ADESSO) })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

const Riga = defineComponent({
    props: { inizio: { type: Number, default: null } },
    setup(props) {
        const secondi = useTalosTrascorso(() => props.inizio)
        return () => h('span', { 'data-testid': 'secondi' }, secondi.value === null ? 'nessuno' : String(secondi.value))
    },
})
const secondi = (w: ReturnType<typeof mount>) => w.get('[data-testid="secondi"]').text()

describe('TRASC i secondi dall\'ora dell\'evento', () => {
    it('TRASC-01 un evento di 12 secondi fa: la riga nasce con 12 e va avanti', async () => {
        const w = mount(Riga, { props: { inizio: ADESSO - 12_000 } })
        expect(secondi(w)).toBe('12')
        await vi.advanceTimersByTimeAsync(1_000)
        expect(secondi(w)).toBe('13')
        w.unmount()
    })

    it('TRASC-02 «0s» al primo istante, poi il formato del telefono', () => {
        expect(talosTrascorsoEtichetta(0)).toBe('0s')
        expect(talosTrascorsoEtichetta(12)).toBe('12s')
        expect(talosTrascorsoEtichetta(64)).toBe('1m 4s')
    })

    it('TRASC-03 (ATTESA-DA-CAPO) rimontata, la riga NON riparte da zero', async () => {
        const inizio = ADESSO
        const prima = mount(Riga, { props: { inizio } })
        await vi.advanceTimersByTimeAsync(5_000)
        expect(secondi(prima)).toBe('5')
        prima.unmount()
        await vi.advanceTimersByTimeAsync(2_000)
        const dopo = mount(Riga, { props: { inizio } })
        expect(secondi(dopo)).toBe('7')
        dopo.unmount()
    })

    it('TRASC-04 un solo orologio per molte righe, spento quando l\'ultima se ne va', () => {
        const avvia = vi.spyOn(globalThis, 'setInterval')
        const righe = Array.from({ length: 50 }, (_, i) => mount(Riga, { props: { inizio: ADESSO - i * 1_000 } }))
        expect(avvia).toHaveBeenCalledTimes(1)
        for (const r of righe) r.unmount()
        expect(vi.getTimerCount()).toBe(0)
        avvia.mockRestore()
    })

    it('TRASC-06 una riga che nasce fra due battiti legge l\'ora di adesso, non quella dell\'ultimo battito (difetto visto sul Pad, 29/10)', async () => {
        // un'altra riga tiene acceso l'orologio unico, che batte a +1 s, +2 s…
        const altra = mount(Riga, { props: { inizio: ADESSO } })
        await vi.advanceTimersByTimeAsync(1_500) // l'ultimo battito era a +1 s: l'ora condivisa è vecchia di mezzo secondo
        const nuova = mount(Riga, { props: { inizio: ADESSO + 1_500 - 2_000 } }) // un evento di 2 s fa
        expect(secondi(nuova)).toBe('2')
        nuova.unmount()
        altra.unmount()
    })

    it('TRASC-05 senza ora d\'evento niente secondi: meglio che inventarli', () => {
        const w = mount(Riga, { props: { inizio: null } })
        expect(secondi(w)).toBe('nessuno')
        w.unmount()
    })
})
