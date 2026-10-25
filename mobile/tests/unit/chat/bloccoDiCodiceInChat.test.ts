// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * Blocchi di codice nella chat: bozzetto approvato dall'owner il 23/10/2026 (via Desktop, «quattro consigliate»), specifica unica
 * col desktop. La testata ha lingua · «Copy» · «⋯», mai più di due pulsanti. Il menu ⋯ (lo stesso col tocco prolungato sulla
 * testata, mai sul codice) offre «Download as .<ext>» / Markdown / testo, un separatore e «Collapse» solo sopra 40 righe.
 * Compresso = 12 righe e «Show all {n} lines». Download e copia prendono il testo GREZZO. Il file passa per la consegna nativa
 * (`deliverTalosSessionExport`: Filesystem + foglio di condivisione), perché un `a[download]` nella WebView non salva.
 */
const consegne = vi.hoisted(() => ({ fatte: [] as Array<{ fileName: string, content: string, contentType: string }> }))
vi.mock('@/services/sessionExportDelivery', () => ({
    deliverTalosSessionExport: async (file: { fileName: string, content: string, contentType: string }) => {
        consegne.fatte.push(file)
        return 'shared'
    },
}))

import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'

const righe = (n: number) => Array.from({ length: n }, (_, i) => `print(${i})`).join('\n')
const montati: Array<{ unmount(): void }> = []
afterEach(() => {
    for (const w of montati.splice(0)) w.unmount()
    document.body.innerHTML = ''
    consegne.fatte.length = 0
})
async function monta(content: string) {
    const w = mount(TalosMobileMessageContent, { attachTo: document.body, props: { content } })
    montati.push(w)
    await flushPromises()
    return w
}
const menuAperto = () => document.body.querySelector<HTMLElement>('[data-testid="talos-row-actions-menu"]')
const voci = () => [...(menuAperto()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].map((v) => v.textContent?.trim())

describe('blocchi di codice nella chat (bozzetto approvato 23/10)', () => {
    it('BLOCCO-UI-01 la testata ha lingua · Copia · ⋯, e mai più di due pulsanti', async () => {
        const w = await monta('```python\nprint(1)\n```')
        const testa = w.get('.talos-code-block-header')
        expect(testa.get('span').text()).toBe('python')
        const pulsanti = testa.findAll('button')
        expect(pulsanti).toHaveLength(2)
        expect(pulsanti[0]!.attributes('data-talos-copy-code')).toBeDefined()
        expect(pulsanti[1]!.attributes('data-talos-code-menu')).toBeDefined()
        expect(pulsanti[1]!.attributes('aria-haspopup')).toBe('menu')
        expect(pulsanti[1]!.attributes('aria-label')).toBe('More code actions')
        expect(w.get('.talos-code-block').attributes('data-righe')).toBe('1')
    })

    it('BLOCCO-UI-02 il menu ha titolo e voci; «Collapse» solo sopra 40 righe', async () => {
        const corto = await monta('```python\n' + righe(40) + '\n```')
        await corto.get('[data-talos-code-menu]').trigger('click')
        expect(menuAperto()?.querySelector('[data-testid="talos-row-actions-title"]')?.textContent?.trim()).toBe('Python code · 40 lines')
        expect(voci()).toEqual(['Download as .py', 'Download as Markdown (.md)', 'Download as text (.txt)'])
        expect(menuAperto()?.querySelector('[role="separator"]')).toBeNull()
        corto.unmount()
        document.body.innerHTML = ''

        const lungo = await monta('```python\n' + righe(41) + '\n```')
        await lungo.get('[data-talos-code-menu]').trigger('click')
        expect(voci()).toEqual(['Download as .py', 'Download as Markdown (.md)', 'Download as text (.txt)', 'Collapse'])
        expect(menuAperto()?.querySelector('[role="separator"]')).not.toBeNull()
    })

    it.each([
        ['```python\nprint(1)\n```', 'Python code · 1 line'],
        ['```\nuno\n```', 'Code · 1 line'],
        ['```\nuno\ndue\n```', 'Code · 2 lines'],
    ])('BLOCCO-UI-07 il titolo del menu ha singolare e plurale, «1 lines» non esiste (%j)', async (sorgente, titolo) => {
        const w = await monta(sorgente)
        await w.get('[data-talos-code-menu]').trigger('click')
        expect(menuAperto()?.querySelector('[data-testid="talos-row-actions-title"]')?.textContent?.trim()).toBe(titolo)
    })

    it('BLOCCO-UI-03 compresso: 12 righe in vista e «Show all {n} lines», che lo riapre', async () => {
        const w = await monta('```python\n' + righe(120) + '\n```')
        await w.get('[data-talos-code-menu]').trigger('click')
        const comprimi = [...menuAperto()!.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((v) => v.textContent?.trim() === 'Collapse')!
        comprimi.click()
        await flushPromises()
        const blocco = w.get('.talos-code-block')
        expect(blocco.attributes('data-compresso')).toBeDefined()
        const mostra = w.get('[data-talos-code-expand]')
        expect(mostra.text()).toBe('Show all 120 lines')
        expect(menuAperto()).toBeNull()
        await mostra.trigger('click')
        expect(w.get('.talos-code-block').attributes('data-compresso')).toBeUndefined()
        expect(w.find('[data-talos-code-expand]').exists()).toBe(false)
    })

    it('BLOCCO-UI-04 «Download as .py» consegna il testo GREZZO col nome del modello; Markdown e testo coi loro tipi', async () => {
        const codice = 'x = "<b>&amp;</b>"\nprint(x)'
        const w = await monta('```python sync.py\n' + codice + '\n```')
        for (const voce of ['Download as .py', 'Download as Markdown (.md)', 'Download as text (.txt)']) {
            await w.get('[data-talos-code-menu]').trigger('click')
            ;[...menuAperto()!.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((v) => v.textContent?.trim() === voce)!.click()
            await flushPromises()
        }
        expect(consegne.fatte.map((f) => f.fileName)).toEqual(['sync.py', 'sync.md', 'sync.txt'])
        expect(consegne.fatte[0]!.content).toBe(codice)
        expect(consegne.fatte[1]!.content).toBe('```python\n' + codice + '\n```\n')
        expect(consegne.fatte[1]!.contentType).toBe('text/markdown')
        expect(consegne.fatte[2]!.contentType).toBe('text/plain')
    })

    // Revisione del Desktop 23/10: dopo una voce del menu il fuoco non finisce mai sul body.
    it('BLOCCO-UI-12 il fuoco: dopo uno scaricamento torna sul ⋯, dopo «Collapse» va su «Show all», dopo «Show all» torna sul ⋯', async () => {
        const w = await monta('```python\n' + righe(60) + '\n```')
        const menu = w.get('[data-talos-code-menu]').element as HTMLElement
        const scegli = async (voce: string) => {
            menu.focus()
            await w.get('[data-talos-code-menu]').trigger('click')
            // come una persona: la voce si sceglie a menu aperto, quando il fuoco è già sulla prima voce
            await flushPromises()
            expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
            ;[...menuAperto()!.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((v) => v.textContent?.trim() === voce)!.click()
            await flushPromises()
        }
        await scegli('Download as .py')
        expect(document.activeElement).toBe(menu)
        await scegli('Collapse')
        const mostra = w.get('[data-talos-code-expand]').element as HTMLElement
        expect(document.activeElement).toBe(mostra)
        mostra.click()
        await flushPromises()
        expect(document.activeElement).toBe(menu)
    })

    // Trovato scrivendo la UI-12 (OK del Desktop 23/10): `TalosRowActions.show()` dava il fuoco alla prima voce DOPO un tick;
    // se la voce era già stata scelta (dito o Invio rapidi) il fuoco finiva su una voce che spariva, cioè sul body.
    it('BLOCCO-UI-13 una voce scelta prima che il menu finisca di aprirsi: il fuoco torna sul ⋯, mai sul body', async () => {
        const w = await monta('```python\nprint(1)\n```')
        const menu = w.get('[data-talos-code-menu]').element as HTMLElement
        menu.focus()
        await w.get('[data-talos-code-menu]').trigger('click')
        ;[...menuAperto()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]!.click()
        await flushPromises()
        expect(document.activeElement).toBe(menu)
    })

    // Pad, vc169 (24/10, foto 33-tocco-lungo): il tocco prolungato sull'etichetta apriva il menu del blocco E la barra di
    // selezione di Android («Traduci · Copia · Seleziona tutto») sulla parola «TEXT»: due menu. La testata non si seleziona e
    // il menu contestuale di sistema lì non parte; sul codice la selezione resta libera.
    it('BLOCCO-UI-15 il tocco prolungato sulla testata non apre la selezione di sistema; sul codice sì', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const sorgente = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'components', 'chat', 'TalosMobileMessageContent.vue'), 'utf8')
        const testata = [...sorgente.matchAll(/\.talos-message-content \.talos-code-block-header \{([^}]*)\}/g)].map((m) => m[1]).join(' ')
        expect(testata).toMatch(/(^|[;\s])user-select:\s*none/)
        expect(testata).toMatch(/-webkit-user-select:\s*none/)
        // `-webkit-touch-callout` è fuori standard e vale solo su Safari iOS (MDN, 10/09/2026): su Android non fa niente, e una
        // riga che non fa niente è un falso ricordo (Desktop 24/10). Il giorno di un iOS si ricerca da capo.
        expect(testata).not.toMatch(/touch-callout/)
        const w = await monta('```text\nuno\n```')
        const suTestata = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        w.get('.talos-code-block-header span').element.dispatchEvent(suTestata)
        expect(suTestata.defaultPrevented).toBe(true)
        const sulCodice = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        w.get('pre code').element.dispatchEvent(sulCodice)
        expect(sulCodice.defaultPrevented).toBe(false)
    })

    // Revisione del Desktop 23/10: «Comprimi» dove il <pre> ha già un tetto suo non cambierebbe niente.
    it('BLOCCO-UI-11 «Collapse» non si offre se il <pre> ha già un tetto d\'altezza suo', async () => {
        const stile = document.createElement('style')
        stile.textContent = '.talos-message-content pre { max-height: 10rem; }'
        document.head.append(stile)
        try {
            const w = await monta('```python\n' + righe(60) + '\n```')
            await w.get('[data-talos-code-menu]').trigger('click')
            expect(voci()).toEqual(['Download as .py', 'Download as Markdown (.md)', 'Download as text (.txt)'])
        } finally {
            stile.remove()
        }
    })

    it('BLOCCO-UI-10 a messaggio finito un recinto mai chiuso (risposta troncata) è un blocco chiuso: Copia e ⋯ accesi', async () => {
        const w = await monta('Ecco:\n\n```python\nprint(1)\nprint(2)')
        const copia = w.get('[data-talos-copy-code]')
        expect(copia.attributes('disabled')).toBeUndefined()
        expect(copia.text()).toBe('Copy')
        expect(w.get('[data-talos-code-menu]').attributes('disabled')).toBeUndefined()
        expect(w.get('.talos-code-block').attributes('data-righe')).toBe('2')
    })

    // Desktop 24/10: se il file della lingua è già .txt resta solo «Download as text (.txt)», e il titolo non nomina «Text».
    it('BLOCCO-UI-16 un blocco di testo semplice: niente «Download as .txt» doppio, titolo «Code · 2 lines»', async () => {
        const w = await monta('```text\nuno\ndue\n```')
        await w.get('[data-talos-code-menu]').trigger('click')
        expect(menuAperto()?.querySelector('[data-testid="talos-row-actions-title"]')?.textContent?.trim()).toBe('Code · 2 lines')
        expect(voci()).toEqual(['Download as Markdown (.md)', 'Download as text (.txt)'])
    })

    it('BLOCCO-UI-09 il BOM segue il file finale: «sql dati.csv» esce come dati.csv col BOM; il .txt dello stesso blocco no', async () => {
        const w = await monta('```sql dati.csv\na,b\nè,1\n```')
        for (const voce of ['Download as .sql', 'Download as text (.txt)']) {
            await w.get('[data-talos-code-menu]').trigger('click')
            ;[...menuAperto()!.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((v) => v.textContent?.trim() === voce)!.click()
            await flushPromises()
        }
        expect(consegne.fatte.map((f) => f.fileName)).toEqual(['dati.csv', 'dati.txt'])
        expect(consegne.fatte[0]!.content).toBe('﻿a,b\nè,1')
        expect(consegne.fatte[1]!.content).toBe('a,b\nè,1')
    })

    it('BLOCCO-UI-05 il tocco prolungato sulla testata apre lo stesso menu; sul codice no', async () => {
        vi.useFakeTimers()
        try {
            const w = await monta('```python\nprint(1)\n```')
            w.get('pre').element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
            vi.advanceTimersByTime(700)
            w.get('pre').element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
            expect(menuAperto()).toBeNull()
            w.get('.talos-code-block-header').element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
            vi.advanceTimersByTime(700)
            await vi.runAllTimersAsync()
            expect(menuAperto()).not.toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    it('BLOCCO-UI-06 nessun tetto all\'altezza e niente overflow:hidden sul blocco: la testata può restare ferma', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const sorgente = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'components', 'chat', 'TalosMobileMessageContent.vue'), 'utf8')
        // tutte le regole del selettore insieme (ce ne sono più d'una: margini, forma, compresso)
        const regola = (selettore: string) => [...sorgente.matchAll(new RegExp(`\\.talos-message-content ${selettore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ')
        expect(regola('.talos-code-block')).toMatch(/overflow:\s*clip/)
        expect(regola('.talos-code-block')).not.toMatch(/overflow:\s*hidden/)
        expect(regola('.talos-code-block-header')).toMatch(/position:\s*sticky/)
        expect(regola('.talos-code-block-header')).toMatch(/top:\s*var\(--talos-code-header-top/)
        expect(regola('pre')).not.toMatch(/max-height:\s*24rem/)
    })

    // Owner 24/10 08:41 (foto dal Pad): con la testata ferma, sopra di lei si vedeva ancora il codice sotto il velo delle pillole,
    // e la testata sembrava galleggiare a metà. Scelta dell'owner: la striscia sopra la testata ferma è piena del colore della chat.
    // Solo CSS: una fascia sopra la testata, alta quanto il margine delle pillole. Il blocco ha `overflow: clip`, quindi quando la
    // testata è al suo posto la fascia cade fuori dal blocco ed è tagliata; quando è ferma copre il codice che le scorre sopra.
    it('BLOCCO-UI-17 sopra la testata ferma una fascia piena del colore della chat, tagliata dal blocco quando la testata è al suo posto', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const sorgente = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'components', 'chat', 'TalosMobileMessageContent.vue'), 'utf8')
        const fascia = [...sorgente.matchAll(/\.talos-message-content \.talos-code-block-header::before \{([^}]*)\}/g)].map((m) => m[1]).join(' ')
        expect(fascia).toMatch(/content:\s*''/)
        expect(fascia).toMatch(/position:\s*absolute/)
        expect(fascia).toMatch(/bottom:\s*100%/)
        expect(fascia).toMatch(/height:\s*calc\(3\.5rem \+ env\(safe-area-inset-top\)\)/)
        expect(fascia).toMatch(/background:\s*var\(--talos-background\)/)
        expect(fascia).toMatch(/pointer-events:\s*none/)
        // il taglio che la nasconde quando la testata non è ferma: senza `overflow: clip` sul blocco la fascia coprirebbe il messaggio sopra
        const blocco = [...sorgente.matchAll(/\.talos-message-content \.talos-code-block \{([^}]*)\}/g)].map((m) => m[1]).join(' ')
        expect(blocco).toMatch(/overflow:\s*clip/)
    })
})
