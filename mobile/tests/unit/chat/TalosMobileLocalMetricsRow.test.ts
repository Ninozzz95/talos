// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import TalosMobileLocalMetricsRow from '@/components/chat/TalosMobileLocalMetricsRow.vue'
import type { TalosLocalGenerationMetrics } from '@/lib/chat/providers/localTrace'
import { useSettingsStore, __resetSettingsStoreForTests } from '@/stores/settings'

/**
 * ⛔ Lo store VERO, non un finto: il punto di questi test è che la riga legga
 * lo STESSO interruttore che la persona tocca in Diagnostica → Avanzate
 * (`shell.debug_diagnostics`). Un finto proverebbe solo che il componente
 * legge qualcosa. Serve solo togliere di mezzo il ponte nativo che scrive su
 * disco, che in Node non esiste.
 */
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

/** Accende «Mostra dettagli tecnici», l'interruttore che c'è già. */
async function accendiDettagliTecnici(): Promise<void> {
    await useSettingsStore().setShell({ debug_diagnostics: true })
}

/**
 * ⭐⭐⭐ FASE 2 — la riga sotto la risposta, provata anche al verso contrario.
 *
 * ⛔ Il caso che conta di più non è quello pieno: è quello VUOTO. Una riga
 * che si mostra sempre passerebbe il primo test e fallirebbe la promessa —
 * mostrare uno zero al posto di un dato mancante è la stessa famiglia di
 * bugia di `ok:false` su un elenco vero.
 */

const PIENA: TalosLocalGenerationMetrics = {
    traceId: 't1',
    finishedAt: 1_757_500_000_000,
    firstVisibleMs: 351,
    tokensPerSecond: 9.69,
    msPerToken: 103.2,
    producedTokens: 42,
    promptTokens: 120,
    prefillMs: 300,
    engineFirstTokenMs: 351,
    reusedTokens: 2847,
    partialTrimRefused: false,
    // ⛔ NON 'reused': la sua frase contiene la parola «reused», e RIGA-10
    // controlla proprio che quella parola sparisca quando il CONTEGGIO del
    // riuso non c'è. Una fixture che la porta dentro renderebbe quel test
    // verde o rosso per la ragione sbagliata.
    prefixOutcome: 'preparing',
}

function monta(misure: TalosLocalGenerationMetrics | null) {
    return mount(TalosMobileLocalMetricsRow, {
        props: { misure },
        global: { mocks: {} },
    })
}

describe('TalosMobileLocalMetricsRow — la velocità sotto la risposta locale', () => {
    // Ogni prova parte con l'interruttore SPENTO, come lo trova una persona.
    beforeEach(() => {
        __resetSettingsStoreForTests()
    })

    /**
     * ⛔ Dal 2026-09-10 i tre numeri esistono INSIEME solo con l'interruttore
     * acceso (owner: di serie resta il solo «token al secondo» — vedi
     * `localMetricsUnNumeroSolo.test.ts`). La domanda di questa prova non e'
     * cambiata: quando ci sono, sono in parole umane. Quindi si accende
     * l'interruttore invece di ammorbidire l'asserzione.
     */
    it('RIGA-01 dice i tre numeri in parole umane, mai i nomi tecnici', async () => {
        await accendiDettagliTecnici()
        const testo = monta(PIENA).text()
        expect(testo).toContain('351 ms to first token')
        expect(testo).toContain('9.7 tokens/sec')
        expect(testo).toContain('103 ms per token')
        // ⛔ Owner, esplicito: nessun nome interno davanti alla persona.
        expect(testo).not.toMatch(/ttft|pp\/tg|prefill|_ms/i)
    })

    it('RIGA-02 AL CONTRARIO: senza misure non c è nessuna riga, e nessuno zero', () => {
        const vista = monta(null)
        expect(vista.find('[data-testid="talos-local-metrics"]').exists()).toBe(false)
        expect(vista.text()).toBe('')
    })

    it('RIGA-03 AL CONTRARIO: i pezzi mancanti si tolgono, non diventano 0', async () => {
        // Con l'interruttore acceso: e' li' che il tempo alla prima parola
        // esiste, e la prova riguarda cosa succede quando gli ALTRI mancano.
        await accendiDettagliTecnici()
        const vista = monta({
            ...PIENA, tokensPerSecond: null, msPerToken: null, promptTokens: null, prefillMs: null,
        })
        const testo = vista.text()
        expect(testo).toContain('351 ms to first token')
        expect(testo).not.toContain('tokens/sec')
        expect(testo).not.toContain('0')
    })

    it('RIGA-04 AL CONTRARIO: se non è stato misurato NIENTE la riga sparisce del tutto', () => {
        const vista = monta({
            ...PIENA, firstVisibleMs: null, tokensPerSecond: null, msPerToken: null,
        })
        expect(vista.find('[data-testid="talos-local-metrics"]').exists()).toBe(false)
    })

    it('RIGA-05 sopra il secondo si cambia unità: «8.4 s», non «8417 ms»', async () => {
        await accendiDettagliTecnici()
        const testo = monta({ ...PIENA, firstVisibleMs: 8417 }).text()
        expect(testo).toContain('8.4 s to first token')
        expect(testo).not.toContain('8417')
    })

    it('RIGA-06 il prefill non ruba spazio alla riga: sta nel titolo, e solo se misurato', () => {
        const conPrefill = monta(PIENA)
        expect(conPrefill.get('[data-testid="talos-local-metrics"]').attributes('title'))
            .toBe('Prompt: 120 tokens read in 300 ms')
        expect(conPrefill.text()).not.toContain('120')

        const senzaPrefill = monta({ ...PIENA, promptTokens: null, prefillMs: null })
        expect(senzaPrefill.get('[data-testid="talos-local-metrics"]').attributes('title'))
            .toBeUndefined()
    })

    it('RIGA-07bis la didascalia è NASCOSTA e non sostituisce i numeri per chi ascolta', () => {
        const riga = monta(PIENA).get('[data-testid="talos-local-metrics"]')
        // ⛔ `aria-label` qui SOSTITUIREBBE il testo: chi usa un lettore di
        // schermo sentirebbe il titolo e non i tre numeri. Guardia contro il
        // ritorno di quell errore.
        expect(riga.attributes('aria-label')).toBeUndefined()
        expect(riga.get('.sr-only').text()).toBe('Speed of this answer on this phone')
        expect(riga.text()).toContain('9.7 tokens/sec')
    })

    /**
     * ⭐⭐⭐ IL RIUSO DELLA CACHE — il numero che esisteva e nessuno vedeva.
     *
     * Misurato dall'owner sul Pad il 2026-09-10 con `LFM2.5-2.6B-Q4_0`: il 2º
     * messaggio è arrivato alla prima parola in 38,9 s contro i 32,0 s del 1º,
     * col modello GIÀ CALDO. Sapere se la cache lavora dipende da questi due
     * pezzi, e in una build di rilascio il JNI non scrive in logcat: o si
     * leggono qui, o non si leggono.
     */
    it('RIGA-08 con «Mostra dettagli tecnici» ACCESO compare il riuso, in parole umane', async () => {
        await accendiDettagliTecnici()
        const testo = monta({ ...PIENA, promptTokens: 3104, reusedTokens: 2847 }).text()
        expect(testo).toContain('2847 of 3104 prompt tokens reused')
        // I tre numeri di prima non se ne vanno: si aggiunge, non si sostituisce.
        expect(testo).toContain('9.7 tokens/sec')
        // ⛔ Owner, esplicito: nessun nome interno davanti alla persona.
        expect(testo).not.toMatch(/partialTrim|seq_rm|reusedContext|KV|prefill/i)
    })

    it('RIGA-09 AL CONTRARIO (a): con l interruttore SPENTO il riuso non compare', () => {
        const testo = monta({
            ...PIENA, promptTokens: 3104, reusedTokens: 2847, partialTrimRefused: true,
        }).text()
        expect(testo).not.toContain('reused')
        expect(testo).not.toContain('cache reset')
        // E la riga di sempre resta intera: spegnere non toglie ciò che c era.
        expect(testo).toContain('9.7 tokens/sec')
    })

    it('RIGA-10 AL CONTRARIO (b): riuso NON riportato ⇒ il pezzo sparisce, non diventa 0', async () => {
        await accendiDettagliTecnici()
        const testo = monta({ ...PIENA, promptTokens: 3104, reusedTokens: null }).text()
        expect(testo).not.toContain('reused')
        expect(testo).not.toContain('0 of')
        // ⛔ E nemmeno al rovescio: senza il totale non si inventa un totale.
        const senzaTotale = monta({ ...PIENA, promptTokens: null, reusedTokens: 2847 }).text()
        expect(senzaTotale).not.toContain('reused')
    })

    it('RIGA-11 lo ZERO MISURATO invece si mostra: «niente riusato» è la diagnosi, non un buco', async () => {
        await accendiDettagliTecnici()
        const testo = monta({ ...PIENA, promptTokens: 3104, reusedTokens: 0 }).text()
        expect(testo).toContain('0 of 3104 prompt tokens reused')
    })

    it('RIGA-12 AL CONTRARIO (c): l avviso appare SOLO su un rifiuto dichiarato', async () => {
        await accendiDettagliTecnici()
        const rifiutato = monta({ ...PIENA, partialTrimRefused: true }).text()
        expect(rifiutato).toContain('cache reset by the engine')

        // `false` = il motore ha detto che NON è successo ⇒ niente da dire.
        expect(monta({ ...PIENA, partialTrimRefused: false }).text())
            .not.toContain('cache reset')
        // `null` = il motore non l ha detto ⇒ non lo si accusa lo stesso.
        expect(monta({ ...PIENA, partialTrimRefused: null }).text())
            .not.toContain('cache reset')
    })

    it('RIGA-07 stile Calm: testo attenuato, nessun colore d accento, nessun bordo', () => {
        const classi = monta(PIENA).get('[data-testid="talos-local-metrics"]').classes().join(' ')
        expect(classi).toContain('text-[var(--talos-muted)]')
        expect(classi).toContain('text-2xs')
        expect(classi).not.toMatch(/accent|border|bg-/)
    })
})
