// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileAttivitaDelTurno from '@/components/chat/TalosMobileAttivitaDelTurno.vue'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'

/*
 * ⛔ ESITO-RIGA (Pad, 27/10/2026, prova dal vivo con la CLI): la scrittura nella cartella bloccata rifiutata dal PC sul dispositivo
 * era «Scrittura di un file: …» come una riuscita. Parità col PC (Desktop, 27/10): la frase di `riassuntoAttrezzoConcluso`, il tono
 * sull'icona (il PC ha il pallino), `data-tool-state` come `impostaEsitoRiga`. Si prova sul SALVATO: deve reggere al ricaricamento.
 */
async function righe(attrezzi: Record<string, unknown>[]) {
    const w = mount(TalosMobileAttivitaDelTurno, { props: { salvata: attrezzi.flatMap((a) => [{ tipo: 'attrezzi', attrezzi: [a] }, { tipo: 'testo', testo: 'ok' }]), testo: 'ok'.repeat(attrezzi.length) } })
    await flushPromises()
    const viste = w.findAllComponents(TalosMobileTraceRow).map((r) => ({
        label: r.props('label'),
        stato: r.attributes('data-tool-state') ?? null,
        icona: r.find('svg').classes().join(' '),
    }))
    w.unmount()
    return viste
}

describe('ESITO-RIGA — la riga dice com\'è andata, come il PC', () => {
    it('ESITO-UI-01 non riuscita, interrotta, non eseguita, saltata e riuscita', async () => {
        const viste = await righe([
            { name: 'scrivi', detail: 'sub\blocked.txt', esito: 'errore' },
            { name: 'notes_create', detail: null, esito: 'errore' },
            { name: 'shell', detail: 'sleep 99', esito: 'interrotta' },
            { name: 'prova', detail: null, esito: 'non-eseguita' },
            { name: 'leggi', detail: 'NOTA.md', esito: 'doppione' },
            { name: 'scrivi', detail: 'ok.txt' },
        ])
        expect(viste.map((v) => v.label)).toEqual([
            '1 write failed: sub\blocked.txt',
            'Step failed',
            'Terminal command: sleep 99',
            expect.not.stringMatching(/failed/u),
            'Reading a file: same request again, skipped',
            'Writing a file: ok.txt',
        ])
        expect(viste.map((v) => v.stato)).toEqual(['error', 'error', 'interrupted', 'not-run', 'duplicate', null])
        expect(viste[0].icona).toContain('text-[var(--talos-danger)]')
        expect(viste[2].icona).toContain('text-[var(--talos-warning)]')
        expect(viste[3].icona).toContain('text-[var(--talos-warning)]')
        expect(viste[4].icona).not.toMatch(/talos-(danger|warning)/u)
        expect(viste[5].icona).not.toMatch(/talos-(danger|warning)/u)
    })
})
