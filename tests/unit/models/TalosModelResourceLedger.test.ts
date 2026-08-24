// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TalosModelResourceLedger from '@/components/talos/models/TalosModelResourceLedger.vue'
import type { TalosResourceLedgerRow } from '@/lib/models/fit'

/**
 * Model Lab Blocco 4 — il componente di sola presentazione.
 *
 * Riceve `rows` già calcolate (mai le calcola da solo — la parità con
 * `talosModelFit` è garanzia dello STORE, non di questo componente, provata
 * altrove: `resourceLedger.test.ts` per `talosResourceLedger` puro,
 * `unaLetturaPerModello.test.ts` per il campo `examination.ledger`). Qui si
 * prova solo che ogni riga si vede, con l'etichetta giusta, il numero
 * giusto e il colore di provenienza giusto — mai un numero senza dire da
 * dove viene, la disciplina che questo componente esiste per mostrare.
 */
const RIGHE: TalosResourceLedgerRow[] = [
    { label: 'weights', bytes: 4_680_000_000, provenance: 'exact' },
    { label: 'kvCache', bytes: 268_435_456, provenance: 'exact' },
    { label: 'compute', bytes: 300_000_000, provenance: 'policy' },
    { label: 'runtime', bytes: 200_000_000, provenance: 'policy' },
    { label: 'safetyMargin', bytes: 500_000_000, provenance: 'policy' },
    { label: 'totalRuntime', bytes: 5_948_435_456, provenance: 'policy' },
    { label: 'availableRam', bytes: 8_000_000_000, provenance: 'exact' },
    { label: 'margin', bytes: 2_051_564_544, provenance: 'policy' },
]

describe('TalosModelResourceLedger — mai un numero senza dire da dove viene', () => {
    it('mostra le otto righe, nello stesso ordine ricevuto', () => {
        const wrapper = mount(TalosModelResourceLedger, { props: { rows: RIGHE } })

        const righe = wrapper.findAll('[data-testid^="talos-ledger-row-"]')
        expect(righe).toHaveLength(8)
        expect(righe.map((riga) => riga.attributes('data-testid'))).toEqual([
            'talos-ledger-row-weights', 'talos-ledger-row-kvCache', 'talos-ledger-row-compute',
            'talos-ledger-row-runtime', 'talos-ledger-row-safetyMargin', 'talos-ledger-row-totalRuntime',
            'talos-ledger-row-availableRam', 'talos-ledger-row-margin',
        ])
    })

    it('formatta i byte con la stessa funzione condivisa del resto del Model Lab', () => {
        const wrapper = mount(TalosModelResourceLedger, { props: { rows: RIGHE } })

        // 4.68 GB, non 4680000000: talosFormatBytes, non un numero grezzo.
        expect(wrapper.get('[data-testid="talos-ledger-row-weights"]').text()).toContain('GB')
        expect(wrapper.get('[data-testid="talos-ledger-row-weights"]').text()).not.toContain('4680000000')
    })

    it('etichetta ogni provenienza col nome tradotto, mai la stringa grezza "exact"/"predicted"/"policy"', () => {
        const wrapper = mount(TalosModelResourceLedger, { props: { rows: RIGHE } })

        const pesi = wrapper.get('[data-testid="talos-ledger-provenance-weights"]')
        expect(pesi.text()).not.toBe('exact')
        expect(pesi.text().length).toBeGreaterThan(0)
    })

    it('le tre provenienze usano tre colori diversi, tutti token del tema — mai un quarto inventato', () => {
        const wrapper = mount(TalosModelResourceLedger, { props: { rows: RIGHE } })

        const exact = wrapper.get('[data-testid="talos-ledger-provenance-weights"]')
        const policy = wrapper.get('[data-testid="talos-ledger-provenance-compute"]')
        const coloreExact = exact.attributes('style')
        const colorePolicy = policy.attributes('style')
        expect(coloreExact).toContain('--talos-success')
        expect(colorePolicy).toContain('--talos-muted')
        expect(coloreExact).not.toBe(colorePolicy)
    })

    it('forzando un tipo di cache la riga kvCache diventa "predicted" e cambia colore', () => {
        const conForzatura = RIGHE.map((row) => row.label === 'kvCache'
            ? { ...row, provenance: 'predicted' as const }
            : row)
        const wrapper = mount(TalosModelResourceLedger, { props: { rows: conForzatura } })

        const kvCache = wrapper.get('[data-testid="talos-ledger-provenance-kvCache"]')
        expect(kvCache.attributes('style')).toContain('--talos-info')
    })

    /**
     * AL CONTRARIO: `margin` può essere un deficit vero (il modello NON sta
     * in memoria). `talosFormatBytes` da sola clampa i negativi a "0 B"
     * (progettata per una grandezza, mai un segno) — questo componente deve
     * portare il segno a parte, non perderlo.
     */
    it('un margine negativo si vede come deficit, non sparisce in "0 B"', () => {
        const conDeficit = RIGHE.map((row) => row.label === 'margin'
            ? { ...row, bytes: -734_003_200 }
            : row)
        const wrapper = mount(TalosModelResourceLedger, { props: { rows: conDeficit } })

        const margine = wrapper.get('[data-testid="talos-ledger-row-margin"]')
        expect(margine.text()).not.toContain('0 B')
        expect(margine.text()).toContain('−')
        expect(margine.text()).toContain('MB')
    })
})
