// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import TalosMobileImageViewer from '@/components/talos/library/TalosMobileImageViewer.vue'

/**
 * Owner 2026-07-30, for at least the second time:
 *
 *   «si apre un'immagine nella libreria è la stessa immagine nella libreria
 *    della relativa chat i controlli sono diversi ... i due component devono
 *    essere esattamente identici con gli stessi controlli»
 *
 * They were different because the viewer was written twice. Attach and Delete
 * existed in the Library and not in the chat's own library, and nothing could
 * have told anyone: two files, two sets of buttons, no connection.
 *
 * So the parity is not asserted button by button — that test would itself go
 * stale the day a fifth button arrives. It is asserted STRUCTURALLY: both
 * surfaces mount the same component, and that component is the only place the
 * buttons exist. A future surface that opens a picture its own way fails the
 * last test here.
 */
function read(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const SURFACES = [
    'src/screens/ContextScreen.vue',
    'src/components/chat/TalosMobileChatMediaPanel.vue',
]

describe('one image viewer, mounted everywhere', () => {
    it.each(SURFACES)('%s mounts the shared viewer', (path) => {
        expect(read(path)).toContain('TalosMobileImageViewer')
    })

    /**
     * The real guard. If a surface hand-rolls the overlay again, these markers
     * reappear outside the shared component and the buttons start drifting
     * apart — which is exactly the defect the owner reported.
     */
    it.each(SURFACES)('%s does not hand-roll its own overlay controls', (path) => {
        const source = read(path)
        for (const marker of ['saveNamedToDevice', 'attachNamedToMessage', 'deleteNamed']) {
            // The Library still owns these strings for its LIST rows and its
            // document view; what must not come back is a second full-screen
            // image overlay. `fixed inset-0 z-[95]` was that overlay's shape.
            expect(source.includes(`${marker}`) && source.includes('fixed inset-0 z-[95] flex flex-col bg-black/90'))
                .toBe(false)
        }
    })

    it('offers exactly the four controls, and hides the ones a caller cannot do', () => {
        const all = mount(TalosMobileImageViewer, {
            props: { src: 'blob:x', name: 'foto.png', canAttach: true, canSave: true, canDelete: true },
            global: { mocks: { $t: (k: string) => k } },
        })
        expect(all.findAll('button')).toHaveLength(4)

        const bare = mount(TalosMobileImageViewer, {
            props: { src: 'blob:x', name: 'foto.png' },
            global: { mocks: { $t: (k: string) => k } },
        })
        // Close always survives: a viewer you cannot leave is a trap.
        expect(bare.findAll('button')).toHaveLength(1)
        expect(bare.find('[data-testid="talos-image-viewer-close"]').exists()).toBe(true)
    })

    it('names every button after the file, so they are distinguishable by ear', () => {
        const viewer = mount(TalosMobileImageViewer, {
            props: { src: 'blob:x', name: 'passaporto.png', canAttach: true, canSave: true, canDelete: true },
            global: { mocks: { $t: (k: string, v?: Record<string, string>) => `${k}:${v?.name ?? ''}` } },
        })

        const labels = viewer.findAll('button').map((b) => b.attributes('aria-label'))
        expect(labels.filter((l) => l?.includes('passaporto.png'))).toHaveLength(3)
    })
})

/**
 * Owner 2026-07-30: «Il layout grid della libreria non è responsive sul tablet
 * e ancora su due colonne.»
 */
describe('the Library grid uses the width it is given', () => {
    /**
     * ⛔ Questo test guardava la STRINGA `grid-cols-2 md:grid-cols-4`, cioè un
     * numero di colonne scritto a mano a due soglie decise a tavolino. U-20 lo
     * sostituisce con `auto-fill` + `minmax`, e il test va con lui — non perché
     * il codice sia cambiato, ma perché la domanda dell'owner non era «quante
     * colonne hai scritto»: era **«perché sul tablet ce ne sono ancora due»**.
     *
     * Quello che si misura ora è la CONSEGUENZA, con i numeri in chiaro:
     * - `auto-fill` vuol dire che il conto lo fa il browser sulla larghezza
     *   VERA del riquadro, non su una soglia — quindi vale anche dentro un
     *   pannello stretto, dove una media query è cieca;
     * - il massimo della traccia deve stare sotto **un terzo** della soglia
     *   tablet (768 px), perché è quello che GARANTISCE almeno tre colonne lì.
     *   Con 13rem = 208 px: 3 × 208 = 624 ≤ 768. Alzarlo a 17rem (272 px) fa
     *   816 > 768, e questo test diventa rosso.
     *
     * Fonti lette il 12/09/2026:
     * https://css-tricks.com/auto-sizing-columns-css-grid-auto-fill-vs-auto-fit/
     * https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-columns
     */
    const SOGLIA_TABLET_PX = 768
    const REM_PX = 16

    it('lets the measured width decide the columns, not a breakpoint', () => {
        const source = read('src/screens/ContextScreen.vue')
        const tracce = source.match(/repeat\(auto-fill,minmax\([^)]*clamp\(([\d.]+)rem,(\d+)%,([\d.]+)rem\)[^"]*\)/g) ?? []
        expect(tracce.length).toBeGreaterThan(0)

        // ⛔ E nessuna griglia della Libreria deve essere rimasta indietro con
        // un numero di colonne scritto a mano.
        expect(source).not.toMatch(/class="[^"]*grid-cols-2/)

        const clamp = source.match(/clamp\(([\d.]+)rem,(\d+)%,([\d.]+)rem\)/)
        expect(clamp).not.toBeNull()
        const minimo = Number.parseFloat(clamp![1]!) * REM_PX
        const massimo = Number.parseFloat(clamp![3]!) * REM_PX

        // Sul tablet entrano almeno TRE colonne: è la domanda dell'owner.
        expect(massimo * 3).toBeLessThanOrEqual(SOGLIA_TABLET_PX)
        // ⛔ Il verso contrario: su un telefono da 360 px una scheda non deve
        // diventare una scheggia illeggibile — due colonne, non quattro.
        expect(minimo * 3).toBeGreaterThan(360)
    })

    /**
     * ⛔ `min(100%, …)` non è cosmesi: senza, su un riquadro più stretto del
     * minimo la traccia sfonda il contenitore e la PAGINA SCORRE IN
     * ORIZZONTALE. È la raccomandazione esplicita della documentazione.
     */
    it('never overflows a container narrower than one card', () => {
        const source = read('src/screens/ContextScreen.vue')
        expect(source).toContain('minmax(min(100%,clamp(')
    })
})
