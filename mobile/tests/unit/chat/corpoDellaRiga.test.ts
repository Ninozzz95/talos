// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileAttivitaDelTurno from '@/components/chat/TalosMobileAttivitaDelTurno.vue'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'

/*
 * ⛔ T8 (censimento «Avvisi ed errori», punto c; mockup approvato dal Desktop il 27/10/2026, forma A): la riga d'attrezzo finita si
 * apre SUL POSTO come sul PC (`creaRigaAttrezzo` con `conDettaglio`) e mostra argomenti e risultato; una riga senza niente dentro non
 * si apre (`nonApribileSeVuota`). Il gruppo chiuso dice i fallimenti accanto ai passi, con le frasi del PC, e colora l'icona.
 */
const rifiutata = {
    name: 'scrivi', detail: 'sub/pagina.html', esito: 'errore', argomenti: '{"percorso":"sub/pagina.html"}',
    risultato: { contenuto: 'REFUSED. Nothing was written: sub/pagina.html is inside a folder the person blocked for this device.' },
}
const comando = {
    name: 'shell', detail: 'npm test', esito: 'errore', argomenti: '{"comando":"npm test"}',
    risultato: { contenuto: 'exit 1 [sandbox: wsl2]\nx', stdout: 'fail', stderr: 'warn' },
}

async function monta(attrezzi: Record<string, unknown>[]) {
    const w = mount(TalosMobileAttivitaDelTurno, { props: { salvata: [{ tipo: 'attrezzi', attrezzi }, { tipo: 'testo', testo: 'ok' }], testo: 'ok' } })
    await flushPromises()
    return w
}

describe('T8 — la riga d’attrezzo si apre sul posto, come il PC', () => {
    it('T8-UI-01 una riga con il corpo è un disclosure chiuso; al tocco si apre col NO del kernel e il suo testo, e si richiude', async () => {
        const w = await monta([rifiutata])
        const bottone = w.get('[data-testid="talos-tool-row-toggle"]')
        expect(bottone.attributes('aria-expanded')).toBe('false')
        expect(w.find('[data-testid="talos-tool-body"]').exists()).toBe(false)
        // Desktop 27/10: chiuso, nessun aria-controls verso un id che non c'è
        expect(bottone.attributes('aria-controls')).toBeUndefined()
        await bottone.trigger('click')
        expect(bottone.attributes('aria-expanded')).toBe('true')
        // il corpo si carica a richiesta (pezzo a parte): la prima apertura aspetta il modulo
        await vi.waitFor(() => expect(w.find('[data-testid="talos-tool-body"]').exists()).toBe(true))
        const corpo = w.get('[data-testid="talos-tool-body"]')
        expect(corpo.attributes('id')).toBe(bottone.attributes('aria-controls'))
        // il riquadro scorre dentro di sé: raggiungibile da tastiera e da TalkBack (axe «scrollable-region-focusable»)
        expect(corpo.find('[data-altro-sotto]').attributes('tabindex')).toBe('0')
        expect(corpo.find('[data-pezzo="no"]').text()).toBe('The tool rejected the request.')
        expect(corpo.find('[data-pezzo="blocco"]').text()).toContain('REFUSED. Nothing was written')
        // il nome del campo nella lingua dell'app, dalla voce del desktop (`app.activity.arg.percorso` @ r4 b000e7253)
        expect(corpo.find('[data-pezzo="argomento"]').text()).toBe('path: sub/pagina.html')
        await bottone.trigger('click')
        expect(w.find('[data-testid="talos-tool-body"]').exists()).toBe(false)
        w.unmount()
    })

    it('T8-UI-02 un comando fallito: riga d’esito, «Output» e «Diagnostics», nell’ordine del PC', async () => {
        const w = await monta([comando])
        await w.get('[data-testid="talos-tool-row-toggle"]').trigger('click')
        await vi.waitFor(() => expect(w.find('[data-testid="talos-tool-body"]').exists()).toBe(true))
        const pezzi = w.findAll('[data-testid="talos-tool-body"] [data-pezzo]').map((p) => p.attributes('data-pezzo'))
        expect(pezzi).toEqual(['argomento', 'esito', 'flusso', 'flusso'])
        expect(w.findAll('[data-pezzo="flusso"]').map((f) => f.find('p').text())).toEqual(['Output', 'Diagnostics'])
        w.unmount()
    })

    it('T8-UI-05 un valore lungo si dice con i suoi caratteri e si apre a richiesta, come il `<details>` del PC (Pad 27/10)', async () => {
        const lungo = 'x'.repeat(1653)
        const w = await monta([{ name: 'scrivi', detail: 'r.md', argomenti: JSON.stringify({ percorso: 'r.md', contenuto: lungo }), risultato: { contenuto: 'written: r.md' } }])
        await w.get('[data-testid="talos-tool-row-toggle"]').trigger('click')
        await vi.waitFor(() => expect(w.find('[data-testid="talos-tool-body"]').exists()).toBe(true))
        const apri = w.get('[data-testid="talos-tool-arg-long"]')
        expect(apri.text()).toBe('1,653 characters')
        expect(apri.attributes('aria-expanded')).toBe('false')
        expect(w.text()).not.toContain(lungo)
        await apri.trigger('click')
        expect(apri.attributes('aria-expanded')).toBe('true')
        expect(w.get('[data-testid="talos-tool-body"]').text()).toContain(lungo)
        w.unmount()
    })

    it('T8-UI-03 ⛔ verso contrario: senza corpo la riga resta com’era (niente bottone, niente freccia)', async () => {
        const w = await monta([{ name: 'leggi', detail: 'NOTA.md' }, { name: 'leggi', detail: 'a.md', argomenti: '{"descrizione":"Leggo"}' }])
        expect(w.find('[data-testid="talos-tool-row-toggle"]').exists()).toBe(false)
        expect(w.findAllComponents(TalosMobileTraceRow).every((r) => r.find('button').exists() === false)).toBe(true)
        w.unmount()
    })

    it('T8-UI-04 il gruppo chiuso dice i fallimenti accanto ai passi e colora l’icona; solo interrotte = attenzione', async () => {
        const w = await monta([{ name: 'leggi', detail: 'NOTA.md' }, rifiutata, comando])
        expect(w.get('[data-testid="talos-tool-group-steps"]').text()).toBe('3 steps · 2 steps failed')
        expect(w.get('[data-testid="talos-tool-group"] button svg').classes()).toContain('text-[var(--talos-danger)]')
        w.unmount()
        const solo = await monta([{ name: 'leggi', detail: 'NOTA.md' }, { name: 'leggi', detail: 'b' }, { name: 'shell', detail: 'sleep 9', esito: 'interrotta' }])
        expect(solo.get('[data-testid="talos-tool-group-steps"]').text()).toBe('3 steps · 1 step interrupted')
        expect(solo.get('[data-testid="talos-tool-group"] button svg').classes()).toContain('text-[var(--talos-warning)]')
        solo.unmount()
        const pulito = await monta([{ name: 'leggi', detail: 'a' }, { name: 'leggi', detail: 'b' }, { name: 'leggi', detail: 'c' }])
        expect(pulito.get('[data-testid="talos-tool-group-steps"]').text()).toBe('3 steps')
        pulito.unmount()
    })
})
