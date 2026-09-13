// @vitest-environment jsdom

/**
 * U-14 — il movimento del mockup «Talos Calm Finale» nella SHELL.
 *
 * Quattro superfici, e per ognuna la domanda è la stessa: il movimento passa
 * dal motore, o è scritto a mano?
 *
 *   - la stazione (`TalosMobileToolSheet`) → sale da sotto, e di quanto
 *   - il menu di riga (`TalosRowActions`)  → arriva, e dalla parte giusta
 *   - il ventaglio (`TalosMobileSpeedDial`) → già c'era, più l'onda
 *   - la sidebar                            → righe con la pressione da riga
 *
 * ⛔ Alcune asserzioni leggono il SORGENTE invece del DOM, e non è pigrizia: la
 * cosa che si rompe in silenzio è una durata cablata nel template, e quella nel
 * DOM non si distingue da una che viene dal motore — `getComputedStyle` in
 * jsdom non risolve nessuna `var()`. Il sorgente invece lo dice.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: { value: 'it' } }),
}))

function sorgente(...parti: string[]): string {
    return readFileSync(resolve(process.cwd(), 'src', ...parti), 'utf8')
}

describe('U-14 · SHELL-SHEET — la stazione sale da sotto', () => {
    it('SHELL-SHEET-01 nella forma a cassetto parte dall\'altezza del foglio, non da 24px', async () => {
        // Misurato sul mockup: `translateY(550px) -> translateY(0)`. Prima qui
        // c'era `translate-y-6`, cioè 24 px: a schermo non è una superficie che
        // arriva, è una superficie già lì che si aggiusta.
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Note', presentation: 'drawer' },
        })
        const foglio = wrapper.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(foglio.attributes('style')).toContain('var(--talos-motion-sheet-rise')
    })

    it('SHELL-SHEET-02 a schermo intero resta il gesto corto', async () => {
        // Farla scendere di mezzo schermo scoprirebbe la chat dietro, che è il
        // contrario di quello che una stazione a schermo intero promette.
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Note', presentation: 'fullscreen' },
        })
        const foglio = wrapper.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(foglio.attributes('style')).toContain('1.5rem')
        expect(foglio.attributes('style')).not.toContain('sheet-rise')
    })

    it('SHELL-SHEET-03 entrata e uscita vengono dai token, nessun numero cablato', () => {
        const codice = sorgente('components', 'shell', 'TalosMobileToolSheet.vue')
        // entrata: una FINESTRA, non un menu — la distanza ora è tutta l'altezza
        expect(codice).toContain('--talos-motion-duration-window-open')
        // uscita: la durata di chiusura finestra, con la curva d'uscita
        expect(codice).toContain('--talos-motion-duration-window-close')
        expect(codice).toContain('--talos-motion-ease-exit')
        // e i token storici restano dove servono (velo e durata del nodo)
        expect(codice).toContain('--talos-motion-duration-surface-enter')
        expect(codice).toContain('--talos-motion-duration-surface-exit')
        expect(codice).not.toContain('duration-250')
    })

    it('SHELL-SHEET-04 uscendo il VELO sbiadisce e il foglio SCENDE: due cose diverse', () => {
        // Mockup misurato, `Motion.dismiss`: l'opacità del foglio resta **1**.
        // Un pannello che sbiadisce sul posto non dice dov'è andato.
        const codice = sorgente('components', 'shell', 'TalosMobileToolSheet.vue')
        expect(codice).toContain('.station-leave-to .talos-mobile-tool-sheet-backdrop')
        expect(codice).toContain('.station-leave-to .talos-mobile-tool-sheet-surface')
        expect(codice).toMatch(/\.station-leave-to \.talos-mobile-tool-sheet-surface \{\s*transform: translateY/)
    })

    it('SHELL-SHEET-05 AL CONTRARIO: con la riduzione ogni durata va a zero', () => {
        const codice = sorgente('components', 'shell', 'TalosMobileToolSheet.vue')
        const blocco = codice.slice(codice.indexOf('@media (prefers-reduced-motion: reduce)'))
        expect(blocco).toContain('transition-duration: 0ms')
        // e copre anche i due bersagli NUOVI, o l'uscita resterebbe animata
        expect(blocco).toContain('.station-leave-active .talos-mobile-tool-sheet-surface')
        expect(blocco).toContain('.station-leave-active .talos-mobile-tool-sheet-backdrop')
    })
})

describe('U-14 · SHELL-MENU — il menu di riga arriva invece di comparire', () => {
    const voci = [
        { id: 'apri', label: 'Apri' },
        { id: 'elimina', label: 'Elimina', danger: true },
    ]

    it('SHELL-MENU-01 il pannello dichiara l\'intento `menu-open`', async () => {
        // Era l'unica superficie della shell a comparire di scatto: nessuna
        // `<Transition>`, nessun intento, niente.
        const wrapper = mount(TalosRowActions, {
            props: { label: 'Azioni', items: voci },
            attachTo: document.body,
        })
        await wrapper.get('[data-testid="talos-row-actions"]').trigger('click')
        const pannello = document.querySelector('[data-testid="talos-row-actions-menu"]')
        expect(pannello?.getAttribute('data-talos-motion-intent')).toBe('menu-open')
        wrapper.unmount()
    })

    it('SHELL-MENU-02 aprendosi verso il BASSO l\'origine è sotto', async () => {
        const wrapper = mount(TalosRowActions, {
            props: { label: 'Azioni', items: voci },
            attachTo: document.body,
        })
        await wrapper.get('[data-testid="talos-row-actions"]').trigger('click')
        const pannello = document.querySelector('[data-testid="talos-row-actions-menu"]') as HTMLElement
        expect(pannello.style.getPropertyValue('--talos-motion-surface-rise')).toBe('8px')
        wrapper.unmount()
    })

    it('SHELL-MENU-03 un menu RIBALTATO scende invece di salire', async () => {
        // Il verso è l'unica cosa che il mockup non poteva insegnarci, perché
        // là il menu è un foglio dal basso. Un pannello ancorato sopra la riga
        // che sale contraddice la propria posizione.
        const wrapper = mount(TalosRowActions, {
            props: { label: 'Azioni', items: voci },
            attachTo: document.body,
        })
        // Si forza il ribaltamento: il grilletto sta in fondo allo schermo.
        const grilletto = wrapper.get('[data-testid="talos-row-actions"]').element as HTMLElement
        grilletto.getBoundingClientRect = () => ({
            top: 700, bottom: 740, left: 0, right: 40, width: 40, height: 40, x: 0, y: 700, toJSON: () => ({}),
        }) as DOMRect
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 760 })
        await wrapper.get('[data-testid="talos-row-actions"]').trigger('click')
        const pannello = document.querySelector('[data-testid="talos-row-actions-menu"]') as HTMLElement
        expect(pannello.style.getPropertyValue('--talos-motion-surface-rise')).toBe('-8px')
        wrapper.unmount()
    })

    it('SHELL-MENU-05 il pannello porta il gancio che sopravvive al TELEPORT', async () => {
        /**
         * ⛔ Misurato sul Pad il 12/09/2026, con «Movimento interfaccia»
         * ACCESO: `talos-row-actions-menu | 0ms | linear`.
         *
         * Non era una preferenza spenta: è la firma di una `var()` caduta sul
         * proprio ripiego. La regola del motore scrive
         * `var(--talos-motion-duration-surface-enter, 0ms)`, e quel token vive
         * sul `<div>` radice di `App.vue` — mentre questo pannello è
         * TELEPORTATO nel `body`. Fuori da quel sottoalbero l'ereditarietà non
         * arriva, quindi `0ms` dal fallback della durata e `linear` da quello
         * della curva.
         *
         * `data-talos-calm-menu` è il secondo attributo che dà alla regola U-14
         * la specificità per vincere, e quella regola legge un token scritto
         * sulla RADICE DEL DOCUMENTO — visibile anche da dentro un `Teleport`.
         */
        const wrapper = mount(TalosRowActions, {
            props: { label: 'Azioni', items: voci },
            attachTo: document.body,
        })
        await wrapper.get('[data-testid="talos-row-actions"]').trigger('click')
        const pannello = document.querySelector('[data-testid="talos-row-actions-menu"]') as HTMLElement
        expect(pannello.hasAttribute('data-talos-calm-menu')).toBe(true)
        wrapper.unmount()
    })

    it('SHELL-MENU-06 la regola U-14 batte quella del motore e non cade su 0ms', () => {
        const css = readFileSync(resolve(process.cwd(), 'src', 'style.css'), 'utf8')
        // due attributi: la specificità che serve per vincere su quella del
        // motore, che ne ha uno solo
        expect(css).toContain('[data-talos-motion-intent="menu-open"][data-talos-calm-menu]')
        // e il ripiego NON è più `0ms`: se un giorno anche il token `calm`
        // mancasse, il menu si muoverebbe comunque invece di sparire
        const regola = css.slice(css.indexOf('[data-talos-motion-intent="menu-open"][data-talos-calm-menu]'))
        expect(regola.slice(0, 260)).toContain('var(--talos-motion-calm-menu, 440ms)')
    })

    it('SHELL-MENU-04 grilletto e voci ospitano l\'onda al tocco', async () => {
        const wrapper = mount(TalosRowActions, {
            props: { label: 'Azioni', items: voci },
            attachTo: document.body,
        })
        expect(wrapper.get('[data-testid="talos-row-actions"]').classes()).toContain('talos-wave-host')
        await wrapper.get('[data-testid="talos-row-actions"]').trigger('click')
        const voce = document.querySelector('[role="menuitem"]') as HTMLElement
        expect(voce.className).toContain('talos-wave-host')
        wrapper.unmount()
    })
})

describe('U-14 · SHELL-ROWS — la pressione di una riga è più leggera', () => {
    it('SHELL-ROWS-01 le righe della sidebar usano la pressione da riga, non da bottone', () => {
        // Mockup, `Motion.pulse`: `.nav-row` e `.recent-row` sono nell'elenco
        // dei grandi (0,992). Con la pressione dei bottoni piccoli (0,965)
        // sembrerebbero cedere.
        const codice = sorgente('components', 'shell', 'TalosMobileSidebar.vue')
        expect(codice).toContain('class="nav-row talos-pressable talos-pressable-row talos-wave-host"')
        expect(codice).toContain('class="recent-row talos-pressable talos-pressable-row talos-wave-host"')
    })

    it('SHELL-ROWS-02 il ventaglio tiene lo scaglionamento che aveva, e guadagna l\'onda', () => {
        const codice = sorgente('components', 'shell', 'TalosMobileSpeedDial.vue')
        // quello che c'era, e non deve sparire
        expect(codice).toContain('data-talos-motion-intent="menu-open"')
        expect(codice).toContain('--talos-motion-duration-surface-enter')
        // quello che si aggiunge
        expect(codice).toContain('talos-wave-host')
        expect(codice).toContain('onda.onPointerDown')
    })
})

describe('U-14 · SHELL-CSS — il vocabolario condiviso, e il suo verso contrario', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'style.css'), 'utf8')
    const blocco = css.slice(css.indexOf('U-14'))

    it('SHELL-CSS-01 il blocco U-14 esiste ed è uno solo', () => {
        expect(css.match(/U-14 — IL MOVIMENTO DEL MOCKUP/g)).toHaveLength(1)
    })

    it('SHELL-CSS-02 ogni durata del blocco viene da un token del motore', () => {
        // Si estraggono le durate scritte fuori da una `var()`: devono essere
        // zero. Un `240ms` nudo sarebbe un numero che nessuna preferenza tocca.
        //
        // ⛔ Si salta il `:root`, e SOLO quello: lì i numeri sono le DEFINIZIONI
        // dei token di forma del mockup — è il posto dove il numero del mockup
        // deve stare. Altrove sarebbe un numero cablato.
        //
        // ⭐ Questa riga si è già guadagnata l'esistenza: ha trovato l'onda del
        // tocco che girava a 470 ms fissi, cioè l'unica animazione nuova che il
        // cursore «Durata transizioni» non toccava.
        const senzaRoot = blocco.replace(/:root \{[\s\S]*?\n\}/g, '')
        const senzaVar = senzaRoot
            .replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, 'VAR')
            .replace(/\/\*[\s\S]*?\*\//g, '')
        const nude = senzaVar.match(/(?<![-\w.])\d+(\.\d+)?m?s\b/g) ?? []
        expect(nude).toEqual([])
    })

    it('SHELL-CSS-03 i numeri di FORMA del mockup ci sono, come token', () => {
        expect(blocco).toContain('--talos-motion-row-rise: 10px')
        expect(blocco).toContain('--talos-motion-press-row: 0.992')
        expect(blocco).toContain('--talos-motion-press-control: 0.965')
        expect(blocco).toContain('--talos-motion-wave-opacity: 0.16')
        expect(blocco).toContain('--talos-motion-wave-spread: 1.7')
        expect(blocco).toContain('--talos-motion-calm-ease: cubic-bezier(0.22, 0.8, 0.24, 1)')
        expect(blocco).toContain('--talos-motion-calm-ease-exit: cubic-bezier(0.3, 0, 0.8, 0.15)')
        expect(blocco).toContain('--talos-motion-calm-ease-wave: cubic-bezier(0.2, 0, 0, 1)')
    })

    it('SHELL-CSS-04 AL CONTRARIO: ogni classe nuova è spenta sotto riduzione movimento', () => {
        // ⛔ Il cancello che conta. Le regole su `[data-talos-motion-intent]`
        // sono già coperte dal blocco in fondo a
        // `css/talos-interaction-motion-v6.css`; queste no, perché hanno
        // selettori propri — e una dimenticata resterebbe animata senza che
        // nessuno se ne accorga.
        const spegnimento = blocco.slice(blocco.indexOf('@media (prefers-reduced-motion: reduce)'))
        for (const classe of [
            '.talos-pressable-row:active',
            '.talos-touch-wave',
            '.talos-calm-marker',
            '.talos-calm-move',
            '.talos-calm-leave-active',
            '.talos-calm-leave-to',
            '.talos-calm-line-art [data-talos-draw]',
        ]) {
            expect(spegnimento).toContain(classe)
        }
    })

    it('SHELL-CSS-05 il disegno vuoto torna al suo stato a RIPOSO, non a metà', () => {
        // Uno `stroke-dashoffset` lasciato a 420 sotto riduzione movimento
        // vorrebbe dire un disegno invisibile: lo stato finale dev'essere
        // identico a quello che si vedrebbe senza animazione.
        const spegnimento = blocco.slice(blocco.indexOf('@media (prefers-reduced-motion: reduce)'))
        expect(spegnimento).toMatch(/stroke-dashoffset: 0;\s*opacity: 1;/)
    })
})
