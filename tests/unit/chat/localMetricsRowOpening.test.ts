// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import TalosMobileLocalMetricsRow from '@/components/chat/TalosMobileLocalMetricsRow.vue'
import type { TalosLocalGenerationMetrics } from '@/lib/chat/providers/localTrace'
import type { TalosPrefixOutcome } from '@/lib/models/prefixCache'
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
 * ⭐⭐⭐ IL MOTIVO, IN PAROLE, SOTTO LA RISPOSTA.
 *
 * La riga diceva già «0 token della richiesta su 2847 riusati» e si fermava lì:
 * il PERCHÉ era calcolato e buttato. Questi test provano che ogni causa arriva
 * a schermo con una frase SUA — non che «esiste una frase».
 *
 * ⛔ Il verso contrario è metà del file: l'interruttore spento non deve
 * mostrare niente, e nessuna delle undici frasi può contenere un nome interno.
 */

const BASE: TalosLocalGenerationMetrics = {
    traceId: 't1',
    finishedAt: 1_757_500_000_000,
    firstVisibleMs: 351,
    tokensPerSecond: 9.69,
    msPerToken: 103.2,
    producedTokens: 42,
    promptTokens: 3104,
    prefillMs: 300,
    engineFirstTokenMs: 351,
    reusedTokens: 0,
    partialTrimRefused: null,
    prefixOutcome: 'preparing',
}

const UNDICI: TalosPrefixOutcome[] = [
    'reused', 'not-reused', 'preparing', 'engine-refused', 'save-failed',
    'unknown-shape', 'too-short', 'no-space', 'too-large', 'unavailable',
    'check-failed',
]

async function accendiDettagliTecnici(): Promise<void> {
    await useSettingsStore().setShell({ debug_diagnostics: true })
}

function frase(esito: TalosPrefixOutcome): string {
    const vista = mount(TalosMobileLocalMetricsRow, {
        props: { misure: { ...BASE, prefixOutcome: esito } },
    })
    return vista.get('[data-testid="talos-local-metrics-opening"]').text()
}

describe('RIGA/INIZIO — il perché del prefisso, sotto la risposta locale', () => {
    beforeEach(() => {
        __resetSettingsStoreForTests()
    })

    /**
     * ⛔⛔ IL TEST CHE MORDE.
     *
     * Undici cause, undici frasi DIVERSE e nessuna vuota. Se qualcuno mappasse
     * due esiti sulla stessa frase «tanto si capisce lo stesso», o rimettesse
     * un `default: return ''`, questa riga diventa rossa. Provato anche al
     * verso contrario prima di consegnare: fatte puntare `unknown-shape` e
     * `too-short` alla stessa chiave, l'insieme scende a 10 e il test cade.
     */
    it('INIZIO-01 undici cause ⇒ undici frasi diverse, nessuna vuota', async () => {
        await accendiDettagliTecnici()
        const frasi = UNDICI.map(frase)
        for (const testo of frasi) expect(testo.trim().length).toBeGreaterThan(0)
        expect(new Set(frasi).size).toBe(UNDICI.length)
    })

    /**
     * ⛔ Owner, regola esplicita: mai i nomi interni davanti alla persona.
     * Non `shape`, non `freeze`, non `KV`, non `seq_rm`, non `prefix`.
     */
    it('INIZIO-02 nessuna delle undici frasi porta un nome interno', async () => {
        await accendiDettagliTecnici()
        for (const esito of UNDICI) {
            expect(frase(esito)).not.toMatch(
                /shape|freeze|frozen|prefix|\bKV\b|seq_rm|cache|congelat|token/i,
            )
        }
    })

    /**
     * ⛔ AL CONTRARIO (a): sono dettagli di diagnosi, e restano dietro
     * l'interruttore che c'è già — «Mostra dettagli tecnici». Con quello
     * spento la frase non esiste, non è solo nascosta.
     */
    it('INIZIO-03 AL CONTRARIO: interruttore spento ⇒ nessuna frase', () => {
        const vista = mount(TalosMobileLocalMetricsRow, {
            props: { misure: { ...BASE, prefixOutcome: 'unknown-shape' } },
        })
        expect(vista.find('[data-testid="talos-local-metrics-opening"]').exists()).toBe(false)
        /*
         * ⛔ La riga NON sparisce: sparisce il dettaglio. L'ancora era «351 ms
         * to first token», ma dal 2026-09-10 anche quello sta dietro
         * l'interruttore (owner: di serie resta il solo «token al secondo»).
         * L'ancora diventa il numero che resta — la domanda della prova e' la
         * stessa, cambia solo cio' che si puo' usare per rispondere.
         */
        expect(vista.text()).toContain('9.7 tokens/sec')
    })

    /** ⛔ AL CONTRARIO (b): senza misure non c'è riga, e quindi nessuna frase. */
    it('INIZIO-04 AL CONTRARIO: nessuna misura ⇒ nessuna riga e nessuna frase', async () => {
        await accendiDettagliTecnici()
        const vista = mount(TalosMobileLocalMetricsRow, { props: { misure: null } })
        expect(vista.find('[data-testid="talos-local-metrics"]').exists()).toBe(false)
    })

    /**
     * ⛔ IL RITARDO, DETTO A CHI LEGGE.
     *
     * I due esiti che riguardano la scrittura arrivano per costruzione un
     * messaggio dopo: la loro frase deve dirlo con parole sue, o chi legge
     * crederebbe che parlino di questa risposta. E «in preparazione» deve
     * promettere il turno DOPO, non questo.
     */
    it('INIZIO-05 le frasi in ritardo dichiarano di parlare del turno precedente', async () => {
        await accendiDettagliTecnici()
        expect(frase('engine-refused')).toContain('last time')
        expect(frase('save-failed')).toContain('last time')
        expect(frase('preparing')).toContain('next message')
        // E il caso buono NON promette niente per dopo: è già successo.
        expect(frase('reused')).not.toContain('next message')
    })

    /**
     * ⛔ La frase sta su una riga sua, non in fila coi numeri col puntino:
     * i tre numeri sono pari fra loro, questa è la prosa che ne spiega uno.
     * `basis-full` è ciò che glielo dà, e se sparisse la riga tornerebbe un
     * muro di testo illeggibile su un telefono.
     */
    it('INIZIO-06 la frase va a capo da sola, non diventa un quarto dato', async () => {
        await accendiDettagliTecnici()
        const vista = mount(TalosMobileLocalMetricsRow, {
            props: { misure: { ...BASE, prefixOutcome: 'unknown-shape' } },
        })
        const spiegazione = vista.get('[data-testid="talos-local-metrics-opening"]')
        expect(spiegazione.classes()).toContain('basis-full')
        // ⛔ E nessun `·` davanti: quello separa dati pari, non una spiegazione.
        expect(spiegazione.text().startsWith('·')).toBe(false)
    })
})
