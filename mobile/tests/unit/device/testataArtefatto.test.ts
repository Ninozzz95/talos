// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * TESTATA-WEB-01..04 (UI-108, owner 28/10; scelte del 29/10: visual BIANCO, filo da 1 px; OK del Desktop). Il visual si apre con la
 * testata nativa: il titolo e i colori del tema attivo viaggiano in `open`. I colori sono i `--talos-*` vivi (quindi ogni tema, non solo
 * Calm), risolti in `#rrggbb`; se non si leggono non si passano e il nativo usa quelli di serie, mai trasparenti.
 */
const ponte = vi.hoisted(() => ({ aperture: [] as unknown[] }))
vi.mock('@/lib/device/artifactPlugin', () => ({
    TalosArtifactBridge: { open: async (o: unknown) => { ponte.aperture.push(o); return { opened: true } } },
}))

import { coloriDellaTestataArtefatto, talosApriArtefatto } from '@/lib/device/apriArtefatto'

function radiceCon(vars: Record<string, string>): HTMLElement {
    const el = document.createElement('div')
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
    return el
}

describe('TESTATA-WEB la testata del visual', () => {
    it('TESTATA-WEB-01 i colori vivi del tema diventano #rrggbb, color-mix compreso, e lo schema segue la testata', () => {
        const c = coloriDellaTestataArtefatto(radiceCon({
            '--talos-header': '#1b1c20', '--talos-background': '#1e1f22', '--talos-text': '#edf2f7',
            '--talos-border': 'color-mix(in srgb, #edf2f7 12%, #1e1f22)', '--talos-ring': '#c08b3c',
        }))
        expect(c).toMatchObject({ scheme: 'dark', header: '#1b1c20', background: '#1e1f22', text: '#edf2f7', ring: '#c08b3c' })
        expect(c?.border).toMatch(/^#[0-9a-f]{6}$/u)
        expect(coloriDellaTestataArtefatto(radiceCon({ '--talos-header': '#f3f4f5' }))?.scheme).toBe('light')
    })

    it('TESTATA-WEB-02 senza colori leggibili non si passa niente: decide il nativo coi colori di serie', () => {
        expect(coloriDellaTestataArtefatto(radiceCon({}))).toBeNull()
        expect(coloriDellaTestataArtefatto(radiceCon({ '--talos-header': 'non-un-colore' }))).toBeNull()
    })

    it('TESTATA-WEB-03 l\'apertura porta titolo e colori', async () => {
        document.documentElement.style.setProperty('--talos-header', '#1b1c20')
        await talosApriArtefatto('a'.repeat(32), 'Calcolatore della rata')
        expect(ponte.aperture.at(-1)).toMatchObject({ id: 'a'.repeat(32), title: 'Calcolatore della rata', chrome: { scheme: 'dark', header: '#1b1c20' } })
    })

    it('TESTATA-WEB-04 i tre posti che aprono un visual passano il titolo', () => {
        const leggi = (p: string) => readFileSync(resolve(__dirname, '../../../src', p), 'utf8')
        expect(leggi('lib/tools/schedaComandi.ts')).toMatch(/talosApriArtefattoDaScheda\(id: string, titolo: string\)/u)
        expect(leggi('components/chat/TalosMobileSchedaAzione.vue')).toMatch(/apriArtefatto\(s\.id, s\.titolo\)/u)
        expect(leggi('lib/harness/harnessUiArtefatti.ts')).toMatch(/talosApriArtefatto\(copia\.idNativo, titolo\)/u)
        expect(leggi('screens/ContextScreen.vue')).toMatch(/talosApriArtefatto\(id, titolo\)/u)
    })
})
