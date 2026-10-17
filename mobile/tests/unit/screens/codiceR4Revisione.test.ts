// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import { applicaEventoPannelloR4, creaPannelloR4, type PannelloR4 } from '@/lib/harness/r4/pannelloR4'
import { riassuntoReviewR4, testoDiffCompletoR4, testoDiffDiUnFileR4 } from '@/lib/harness/r4/revisioneR4'
import TalosCodiceR4Revisione from '@/components/codice/TalosCodiceR4Revisione.vue'
import TalosCodiceR4Viste from '@/components/codice/TalosCodiceR4Viste.vue'

/*
 * ⛔ K3 Revisione (ledger `LEDGER-K3-REVISIONE-2026-10-17.md`): la vista «Review» del Codice su r4, dal flusso VERO di r4 @ 701c6c0d2
 * (`registra-golden-r4.mjs … revisione`: slugify.mjs scritto e corretto, poi src/util.js con somma e sottrai, lib/util.js, e src/util.js
 * riscritto senza sottrai). Le parole e le regole sono quelle del desktop (`review.js`, `#schermoReview`), provate in `revisioneR4.test.ts`.
 */
const appunti = vi.hoisted(() => ({ testi: [] as string[], rifiuta: false }))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: async (testo: string) => { if (appunti.rifiuta) throw new Error('no'); appunti.testi.push(testo) } }))
afterEach(() => { document.body.innerHTML = ''; appunti.testi = []; appunti.rifiuta = false })

const flusso = (): Record<string, unknown>[] => leggiFlussoSse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'r4-701c6c0d2-revisione-vivo.sse'), 'utf8'))
    .map((e) => e.dati as Record<string, unknown>)
const pannelloDi = (eventi: Record<string, unknown>[]): PannelloR4 => eventi.reduce((p, e) => applicaEventoPannelloR4(p, e), creaPannelloR4())

async function monta(pannello: PannelloR4, puoAprire = true) {
    const { useTalosMobileToasts } = await import('@/stores/toasts')
    const toasts = useTalosMobileToasts()
    for (const t of [...toasts.items.value]) toasts.dismiss(t.id)
    const w = mount(TalosCodiceR4Revisione, { attachTo: document.body, props: { file: pannello.file, ultimoFile: pannello.ultimoFile, puoAprire } })
    await flushPromises()
    return { w, toasts }
}
const linguette = (w: ReturnType<typeof mount>) => w.findAll('[role="tab"][data-file]')
const testa = (w: ReturnType<typeof mount>) => w.get('[data-testid="talos-codice-r4-revisione-testa"]')

describe('la vista «Review» del Codice su r4 (K3 Revisione)', () => {
    it('CRV-01 senza file scritti: lo stato vuoto del desktop, niente linguette né diff', async () => {
        const { w } = await monta(creaPannelloR4())
        const vuoto = w.get('[data-testid="talos-codice-r4-revisione-vuoto"]')
        expect(vuoto.text()).toContain('No file written so far')
        expect(vuoto.text()).toContain('When TALOS writes or edits a file, the difference appears here, turn by turn.')
        expect(linguette(w)).toHaveLength(0)
        expect(w.find('[data-testid="talos-codice-r4-revisione-testa"]').exists()).toBe(false)
        w.unmount()
    })

    it('CRV-02 dal flusso vero: una linguetta per file, il riassunto, il diff dell\'ULTIMO file scritto con l\'avviso dei simboli', async () => {
        const p = pannelloDi(flusso())
        const { w } = await monta(p)
        expect(linguette(w).map((l) => l.get('[data-parte="nome"]').text())).toEqual(['slugify.mjs', 'src/util.js', 'lib/util.js'])
        expect(linguette(w).map((l) => l.findAll('span').map((s) => s.text()))).toEqual([['slugify.mjs', '+4', '−1'], ['src/util.js', '+0', '−4'], ['lib/util.js', '+1']])
        expect(linguette(w)[1].attributes('title')).toBe('src/util.js — turn 4 · modified file · ⚠ 1 symbol gone')
        expect(w.get('[data-testid="talos-codice-r4-revisione-sommario"]').text()).toBe(riassuntoReviewR4(p.file, 'en'))
        expect(linguette(w).map((l) => l.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
        expect(testa(w).get('[data-parte="percorso"]').text()).toBe('src/util.js')
        expect(testa(w).get('[data-parte="piu"]').text()).toBe('+0')
        expect(testa(w).get('[data-parte="meno"]').text()).toBe('−4')
        expect(testa(w).get('[data-parte="giro"]').text()).toBe('turn 4')
        const avviso = w.get('[data-testid="talos-codice-r4-revisione-avviso"]')
        expect(avviso.text()).toContain('Warning')
        expect(avviso.text()).toContain('sottrai')
        const righe = w.findAll('[data-testid="talos-codice-r4-revisione-righe"] [data-tipo]')
        expect(righe.map((r) => r.attributes('data-tipo'))).toEqual(['ctx', 'ctx', 'ctx', 'del', 'del', 'del', 'del'])
        expect(righe[4].text()).toBe('- export function sottrai(a, b) {')
        expect(righe[0].element.textContent).toBe('   1   export function somma(a, b) {')
        w.unmount()
    })

    it('CRV-03 un tocco o le frecce cambiano file; un file senza righe tolte non scrive «−0» né l\'avviso', async () => {
        // visto sul Pad (telefono, 17/10): la linguetta scelta restava tagliata a «lib» in fondo alla striscia. Ora scorre in vista.
        const inVista = vi.fn()
        HTMLElement.prototype.scrollIntoView = inVista
        const { w } = await monta(pannelloDi(flusso()))
        await linguette(w)[2].trigger('click')
        await flushPromises()
        expect(inVista.mock.contexts.at(-1)).toBe(linguette(w)[2].element)
        expect(inVista).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' })
        // e sotto i 34rem le linguette hanno la riga intera: riassunto e «Copia i diff» vanno sotto
        const css = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'components', 'codice', 'codiceR4.css'), 'utf8')
        const stretto = css.slice(css.indexOf('@container (max-width: 34rem)'))
        expect(css).toContain('.talos-codice-r4-revisione { display: flex; min-height: 0; flex-direction: column; background: var(--talos-window-bg); container-type: inline-size; }')
        expect(stretto).toContain('.talos-codice-r4-revisione .talos-codice-r4-terminale-testa { flex-wrap: wrap; }')
        expect(stretto).toContain('.talos-codice-r4-revisione .talos-codice-r4-terminale-schede { flex-basis: 100%; }')
        expect(testa(w).get('[data-parte="percorso"]').text()).toBe('lib/util.js')
        expect(testa(w).find('[data-parte="meno"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-codice-r4-revisione-avviso"]').exists()).toBe(false)
        await linguette(w)[2].trigger('keydown', { key: 'Home' })
        expect(testa(w).get('[data-parte="percorso"]').text()).toBe('slugify.mjs')
        await linguette(w)[0].trigger('keydown', { key: 'ArrowRight' })
        expect(testa(w).get('[data-parte="percorso"]').text()).toBe('src/util.js')
        expect(document.activeElement?.getAttribute('data-file')).toBe('src/util.js')
        w.unmount()
    })

    it('CRV-04 «…»: copia il percorso, copia il diff di questo file, apri il file; senza sessione «Apri» è spento', async () => {
        const p = pannelloDi(flusso())
        const { w, toasts } = await monta(p)
        await w.get('[data-azione="menu"]').trigger('click')
        const voci = () => w.findAll('[role="menu"] [role="menuitem"]')
        expect(voci().map((v) => v.text())).toEqual(['Open the file', 'Copy the path', 'Copy this file’s diff'])
        await voci()[1].trigger('click')
        await flushPromises()
        expect(appunti.testi.at(-1)).toBe('src/util.js')
        expect(toasts.items.value.map((t) => t.message)).toContain('Path copied')
        await w.get('[data-azione="menu"]').trigger('click')
        await voci()[2].trigger('click')
        await flushPromises()
        expect(appunti.testi.at(-1)).toBe(testoDiffDiUnFileR4(p.file[1], 'en'))
        expect(toasts.items.value.map((t) => t.message)).toContain('Diff of util.js copied')
        await w.get('[data-azione="menu"]').trigger('click')
        await voci()[0].trigger('click')
        expect(w.emitted('apri')).toEqual([['src/util.js']])
        w.unmount()
        const senza = await monta(p, false)
        await senza.w.get('[data-azione="menu"]').trigger('click')
        expect(senza.w.findAll('[role="menu"] [role="menuitem"]')[0].attributes('aria-disabled')).toBe('true')
        senza.w.unmount()
    })

    it('CRV-05 «Copia i diff» copia tutti i file; una copia rifiutata lo dice', async () => {
        const p = pannelloDi(flusso())
        const { w, toasts } = await monta(p)
        const copia = w.get('[data-azione="copia-tutti"]')
        expect(copia.attributes('aria-label')).toBe('Copy the diffs')
        await copia.trigger('click')
        await flushPromises()
        expect(appunti.testi.at(-1)).toBe(testoDiffCompletoR4(p.file, 'en'))
        expect(toasts.items.value.map((t) => t.message)).toContain('Diff of 3 files copied')
        appunti.rifiuta = true
        await copia.trigger('click')
        await flushPromises()
        expect(toasts.items.value.map((t) => t.message)).toContain('Copy failed')
        w.unmount()
    })

    it('CRV-06 dal vivo: una scrittura nuova porta in vista il file appena scritto', async () => {
        const eventi = flusso()
        const finoA = eventi.findIndex((e) => (e.delta as { path?: string }[] | undefined)?.[0]?.path === '/file/lib/util.js')
        const prima = pannelloDi(eventi.slice(0, finoA))
        const { w } = await monta(prima)
        expect(testa(w).get('[data-parte="percorso"]').text()).toBe('src/util.js')
        await linguette(w)[0].trigger('click')
        const dopo = pannelloDi(eventi.slice(0, finoA + 1))
        await w.setProps({ file: dopo.file, ultimoFile: dopo.ultimoFile })
        expect(testa(w).get('[data-parte="percorso"]').text()).toBe('lib/util.js')
        w.unmount()
    })

    it('CRV-08 «Apri il file» arriva al pannello: scheda File, anteprima di quel file, la richiesta si consuma', async () => {
        const { creaMemoriaPannelloR4 } = await import('@/lib/harness/r4/memoriaPannelloR4')
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        const memoria = creaMemoriaPannelloR4()
        // come `apriFileDallaRevisione` della schermata
        memoria.scheda.value = 'file'
        memoria.file.daAprire.value = 'src/util.js'
        const apriFile = vi.fn(async () => ({ ok: true as const, contenuto: 'export function somma(a, b) {\n  return a + b\n}\n', dimensione: 44 }))
        const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: {
            pannello: creaPannelloR4(), caricaPolitica: async () => null, caricaCache: async () => null, giriFiniti: 0, azioneProcesso: vi.fn(),
            caricaRisorse: vi.fn(async () => null), caricaSessioni: vi.fn(async () => []), caricaFigli: vi.fn(async () => []), sessioneId: 's1',
            caricaAlbero: vi.fn(async () => ({ ok: true as const, voci: [] })), cercaFile: vi.fn(), apriFile, memoria,
        } as never })
        await flushPromises()
        expect(w.get('[data-scheda="file"]').attributes('aria-selected')).toBe('true')
        expect(apriFile).toHaveBeenCalledWith('src/util.js')
        expect(w.get('[data-testid="talos-codice-r4-anteprima"]').text()).toContain('src/util.js')
        expect(memoria.file.daAprire.value).toBeNull()
        w.unmount()
    })

    it('CRV-07 la scheda «Review» fra Chat e Terminale come il desktop, col numero dei file (niente a zero o senza misura)', async () => {
        const w = mount(TalosCodiceR4Viste, { props: { vista: 'chat', forma: 'schede', fileRevisione: 3 } })
        expect(w.findAll('[role="tab"]').map((b) => b.attributes('data-testid'))).toEqual(['talos-codice-r4-vista-chat', 'talos-codice-r4-vista-terminale', 'talos-codice-r4-vista-revisione'])
        expect(w.get('[data-testid="talos-codice-r4-vista-revisione-numero"]').text()).toBe('3')
        expect(w.get('[data-testid="talos-codice-r4-vista-revisione"]').text()).toBe('Review3')
        await w.get('[data-testid="talos-codice-r4-vista-revisione"]').trigger('click')
        expect(w.emitted('scegli')).toEqual([['revisione']])
        await w.setProps({ fileRevisione: 0 })
        expect(w.get('[data-testid="talos-codice-r4-vista-revisione"]').text()).toBe('Review')
        await w.setProps({ fileRevisione: null })
        expect(w.find('[data-testid="talos-codice-r4-vista-revisione-numero"]').exists()).toBe(false)
        w.unmount()
    })
})
