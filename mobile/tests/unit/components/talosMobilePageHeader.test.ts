// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosMobilePageHeader from '@/components/talos/ui/TalosMobilePageHeader.vue'
import { __resetTalosTabletLayoutForTests } from '@/composables/useTalosTabletLayout'

/**
 * ⛔ G1 (owner 14/10/2026: «un rifacimento di tutte le pagine interne con lo stesso stile e la grammatica delle pagine
 * libreria»; ledger `LEDGER-G1-PAGINE-INTERNE-2026-10-14.md` §3). L'intestazione delle stazioni scritta una volta sola:
 * titolo grande, la riga che dice che posto è, l'azione principale sul telefono.
 */

let wrapper: VueWrapper | null = null
const matchMediaOriginale = window.matchMedia

function suTablet(si: boolean): void {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: si, addEventListener() {}, removeEventListener() {} })
    __resetTalosTabletLayoutForTests()
}

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    ;(window as unknown as { matchMedia: unknown }).matchMedia = matchMediaOriginale
    __resetTalosTabletLayoutForTests()
})

describe('TalosMobilePageHeader (G1)', () => {
    it('G1-HDR-01 titolo e riga sotto con le misure delle stazioni; l\'azione nello slot', () => {
        suTablet(false)
        wrapper = mount(TalosMobilePageHeader, {
            props: { title: 'Note', subtitle: 'Le idee, prima che diventino un piano.' },
            slots: { action: () => h('button', { 'data-testid': 'azione' }, '+') },
        })
        const h1 = wrapper.get('h1')
        expect(h1.text()).toBe('Note')
        expect(h1.classes()).toEqual(expect.arrayContaining(['font-semibold', 'leading-[1.15]', 'tracking-[-0.03em]', 'text-2xl']))
        expect(h1.attributes()).toHaveProperty('data-talos-sheet-title')
        const riga = wrapper.get('header > div')
        expect(riga.classes()).toEqual(expect.arrayContaining(['flex', 'items-center', 'justify-between', 'gap-[var(--talos-space-section)]']))
        expect(riga.find('[data-testid="azione"]').exists()).toBe(true)
        const sotto = wrapper.get('header > p')
        expect(sotto.text()).toBe('Le idee, prima che diventino un piano.')
        expect(sotto.classes()).toEqual(expect.arrayContaining(['mt-[var(--talos-space-inline)]', 'text-sm', 'leading-6', 'text-[var(--talos-muted)]']))
    })

    it('G1-HDR-02 sul tablet il titolo è più grande; senza sheetTitle niente segno del foglio; testid del sottotitolo', () => {
        suTablet(true)
        wrapper = mount(TalosMobilePageHeader, {
            props: { title: 'Chat', subtitle: 'Le tue conversazioni', sheetTitle: false, subtitleTestid: 'talos-chats-subtitle' },
            attrs: { class: 'pt-[var(--talos-space-section)]' },
        })
        expect(wrapper.get('h1').classes()).toContain('text-3xl')
        expect(wrapper.get('h1').attributes()).not.toHaveProperty('data-talos-sheet-title')
        expect(wrapper.get('header').classes()).toContain('pt-[var(--talos-space-section)]')
        expect(wrapper.get('[data-testid="talos-chats-subtitle"]').text()).toBe('Le tue conversazioni')
    })

    it('G1-CANCELLO-01 le sei stazioni usano l\'intestazione comune, non un blocco copiato', () => {
        for (const stazione of ['ContextScreen', 'NotesScreen', 'MemoryScreen', 'TasksScreen', 'ResearchScreen', 'ChatsScreen']) {
            const sorgente = readFileSync(resolve(process.cwd(), 'src', 'screens', `${stazione}.vue`), 'utf8')
            expect(sorgente, stazione).toContain('<TalosMobilePageHeader')
            expect(sorgente, stazione).not.toMatch(/tracking-\[-0\.03em\]/)
        }
    })

    it('G1-CANCELLO-03 le pagine «nuova…»: titolo con l’intestazione comune, un solo riquadro, niente etichette in maiuscolo', () => {
        const riquadro = 'rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/60 p-[var(--talos-space-page)]'
        for (const pagina of ['NoteNewScreen', 'MemoryNewScreen', 'TaskNewScreen', 'ResearchNewScreen']) {
            const sorgente = readFileSync(resolve(process.cwd(), 'src', 'screens', `${pagina}.vue`), 'utf8')
            expect(sorgente, pagina).toContain('<TalosMobilePageHeader')
            expect(sorgente, pagina).toContain(riquadro)
            expect(sorgente, pagina).not.toMatch(/uppercase tracking-wide/)
        }
    })

    it('G1-CANCELLO-04 le pagine dei modelli e le Impostazioni usano l’intestazione comune', () => {
        for (const file of [
            'components/talos/models/TalosMobileModelLabHub.vue', 'screens/SettingsModelsProvidersScreen.vue',
            'screens/SettingsModelsCatalogScreen.vue', 'screens/SettingsModelsLocalScreen.vue',
            'components/talos/settings/TalosMobileSettingsCenter.vue',
        ]) {
            const sorgente = readFileSync(resolve(process.cwd(), 'src', file), 'utf8')
            expect(sorgente, file).toContain('<TalosMobilePageHeader')
            expect(sorgente, file).not.toMatch(/tracking-\[-0\.03em\]/)
        }
    })

    it('G1-CANCELLO-05 le pagine della ricerca: niente etichette in maiuscolo, titoli di affermazione e fonte come il rapporto', () => {
        for (const pagina of ['ResearchReportScreen', 'ResearchClaimScreen', 'ResearchSourceScreen']) {
            const sorgente = readFileSync(resolve(process.cwd(), 'src', 'screens', `${pagina}.vue`), 'utf8')
            expect(sorgente, pagina).not.toMatch(/uppercase tracking-wide/)
            expect(sorgente, pagina).toMatch(/<h1 data-talos-sheet-title class="talos-title [^"]*text-xl font-semibold leading-7/)
        }
    })

    it('G1-CANCELLO-02 Diagnostica, Controllo del telefono e Tool Forge: intestazione comune e margini delle stazioni', () => {
        for (const file of ['screens/DoctorScreen.vue', 'screens/PrivilegeScreen.vue', 'components/talos/tools/TalosToolForgeStation.vue']) {
            const sorgente = readFileSync(resolve(process.cwd(), 'src', file), 'utf8')
            expect(sorgente, file).toContain('<TalosMobilePageHeader')
            expect(sorgente, file).toContain('px-[var(--talos-space-page)]')
            expect(sorgente, file).not.toMatch(/flex min-h-full flex-col gap-3 px-4/)
        }
    })
})
