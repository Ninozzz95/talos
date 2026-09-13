// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import TalosMobileLocalMetricsRow from '@/components/chat/TalosMobileLocalMetricsRow.vue'
import type { TalosLocalGenerationMetrics } from '@/lib/chat/providers/localTrace'
import { useSettingsStore, __resetSettingsStoreForTests } from '@/stores/settings'

vi.mock('@capacitor/preferences', () => {
    const memoria = new Map<string, string>()
    return {
        Preferences: {
            get: vi.fn(async ({ key }: { key: string }) => ({ value: memoria.get(key) ?? null })),
            set: vi.fn(async ({ key, value }: { key: string, value: string }) => {
                memoria.set(key, value)
            }),
        },
    }
})

/**
 * ⭐⭐⭐ UN NUMERO SOLO DI SERIE, TRE CON L'INTERRUTTORE.
 *
 * Owner, 2026-09-10: *«di default, se il modello è locale, mostra i token al
 * secondo; il resto solo con lo switch diagnostico»*.
 *
 * ## Perché è un test e non una riga di codice fidata
 *
 * La regola ha due versi, e sono facili da rompere uno alla volta: chi domani
 * aggiunge un numero alla riga lo mette in fondo alla lista **senza il
 * cancello**, e da lì compare a tutti; chi «semplifica» il cancello lo applica
 * a tutta la lista, e sparisce anche l'unico numero che deve restare. Nessuna
 * delle due rompe il typecheck, nessuna delle due fa cadere gli altri test.
 *
 * ⇒ Qui si prova il **contrasto**: acceso mostra di più, spento mostra
 * esattamente uno, e quell'uno è sempre lo stesso.
 */

const BASE: TalosLocalGenerationMetrics = {
    traceId: 't-uno',
    finishedAt: 1_757_500_000_000,
    firstVisibleMs: 4_300,
    tokensPerSecond: 16.3,
    msPerToken: 61,
    producedTokens: 42,
    promptTokens: 2849,
    prefillMs: 720,
    engineFirstTokenMs: 820,
    reusedTokens: 2780,
    partialTrimRefused: false,
    prefixOutcome: 'reused',
}

function riga(): string {
    return mount(TalosMobileLocalMetricsRow, { props: { misure: BASE } })
        .get('[data-testid="talos-local-metrics"]').text()
}

describe('RIGA/DEFAULT — quanto si vede senza l\'interruttore', () => {
    beforeEach(() => {
        __resetSettingsStoreForTests()
    })

    it('DEF-01 spento: i token al secondo CI SONO', () => {
        expect(riga()).toContain('16.3')
    })

    /**
     * ⛔ I due che devono sparire, uno per uno e per il loro NUMERO, non per
     * l'etichetta: un domani l'etichetta si può tradurre diversamente, il
     * valore no.
     */
    it('DEF-02 spento: il tempo alla prima parola NON c\'è', () => {
        expect(riga()).not.toContain('4.3')
    })

    it('DEF-03 spento: i ms per token NON ci sono', () => {
        expect(riga()).not.toContain('61')
    })

    it('DEF-04 spento: il riuso NON c\'è', () => {
        expect(riga()).not.toContain('2780')
    })

    /**
     * ⛔ Il separatore esiste solo fra due cose. Con un numero solo, un «·»
     * a schermo vorrebbe dire che manca qualcosa — è il modo in cui una riga
     * corretta sembra rotta.
     */
    it('DEF-05 spento: nessun separatore, perché non c\'è niente da separare', () => {
        expect(riga()).not.toContain('·')
    })

    /**
     * Il verso contrario, che è quello che rende il test un cancello: se il
     * cancello finisse per sbaglio anche sui token al secondo, DEF-01 resterebbe
     * verde solo finché qualcuno non spegne tutto — questo lo prova acceso.
     */
    it('DEF-06 acceso: tornano tutti, più il riuso', async () => {
        await useSettingsStore().setShell({ debug_diagnostics: true })
        const testo = riga()
        expect(testo).toContain('16.3')
        expect(testo).toContain('4.3')
        expect(testo).toContain('61')
        expect(testo).toContain('2780')
        expect(testo).toContain('·')
    })

    /**
     * ⛔⛔ I DUE OROLOGI, e il test che impedisce di confonderli.
     *
     * «Alla prima parola» e' il primo token VISIBILE (TTFV); «al primo token del
     * motore» e' il primo token in assoluto (TTFT). Sui modelli che ragionano
     * divergono, ed e' esattamente la differenza che stiamo cercando: se un
     * domani qualcuno mappasse i due sullo stesso valore «tanto e' quasi
     * uguale», questa prova cade.
     */
    it('DEF-07 acceso: i due orologi sono DUE, e dicono numeri diversi', async () => {
        await useSettingsStore().setShell({ debug_diagnostics: true })
        const testo = riga()
        expect(testo).toContain('4.3')
        expect(testo).toContain('820')
        expect(testo).not.toBe(testo.replace('820', ''))
    })

    it('DEF-08 spento: il primo token del motore NON si vede', () => {
        expect(riga()).not.toContain('820')
    })
})
