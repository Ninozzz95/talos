import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * D-VIS-1 (Pad, vc153, 23/10, foto occhio-22..29): mentre Spark scriveva un documento HTML lungo dentro un blocco di
 * codice, a schermo sono rimaste per dieci minuti le prime 20 righe. CDP: il `pre` aveva `max-height: 24rem` e
 * `overflow: auto`, con `scrollTop 0` su `scrollHeight 1540`; la lista fuori dal blocco seguiva, il `pre` no.
 *
 * Come Jan (`web-app/src/containers/RenderMarkdown.tsx:89-95`, `StreamingCode`): durante lo streaming il blocco non ha
 * tetto verticale e cresce, così la lista che segue il fondo mostra l'ultima riga. Dal bozzetto dei blocchi di codice
 * (owner 23/10, «quattro consigliate», specifica unica col desktop) il tetto non torna nemmeno a messaggio finito: il blocco è a
 * tutta altezza con la testata ferma, e alla fine del messaggio la pagina non si accorcia più di colpo (foto vc165 07-js-30 →
 * 08-chiusura-01). Per i blocchi lunghi c'è «Comprimi» nel menu ⋯.
 */
describe('D-VIS-1 il blocco di codice che arriva mostra l’ultima riga', () => {
    const sorgente = readFileSync(resolve(process.cwd(), 'src/components/chat/TalosMobileMessageContent.vue'), 'utf8')

    it('VIS-01 durante lo streaming il pre non ha altezza massima', () => {
        expect(sorgente).toMatch(/\.talos-streaming-body \.talos-message-content pre\s*\{\s*max-height:\s*none;\s*\}/)
    })

    it('VIS-02 a messaggio finito il blocco resta a tutta altezza: nessun tetto di 24rem (bozzetto dei blocchi, 23/10)', () => {
        expect(sorgente).not.toMatch(/max-height:\s*24rem/)
        // l'unico tetto è quello che sceglie chi legge, «Comprimi»
        expect(sorgente).toMatch(/\.talos-code-block\[data-compresso\] pre\s*\{[^}]*max-height:/)
    })
})

/**
 * D-VIS-6 (Pad, vc153, 23/10, foto occhio-33): nel testo grezzo c'era `<!-- ===== CONTATTI ===== -->`, a schermo si
 * leggeva `<!— … —>`. JetBrains Mono ha le legature di programmazione accese di serie, e nel codice ogni carattere
 * deve restare quello scritto. VS Code le tiene spente di serie (`src/vs/monaco.d.ts:3437-3440`, «Defaults to false»).
 */
describe('D-VIS-6 il codice si legge carattere per carattere', () => {
    const stile = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

    it('LIG-01 code, pre, kbd e samp senza legature', () => {
        expect(stile).toMatch(/code,\s*pre,\s*kbd,\s*samp\s*\{\s*font-variant-ligatures:\s*none;\s*\}/)
    })
})
