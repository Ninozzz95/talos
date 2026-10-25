import { describe, expect, it } from 'vitest'
import sorgente from '@/components/chat/TalosMobileMessageContent.vue?raw'

/**
 * Bug in coda (24/10/2026): una pillola di codice in linea che va a capo era UNA scatola tagliata (`slice`, il comportamento di
 * serie): il primo pezzo senza bordo e angoli a destra, il secondo a sinistra. Con `clone` ogni pezzo ha i suoi (MDN
 * `box-decoration-break`, 21/07/2026: non ancora Baseline, quindi anche col prefisso `-webkit-`; Open WebUI `src/app.css:535`).
 */
describe('le pillole di codice in linea a capo', () => {
    it('CODICE-LINEA-01 ogni pezzo della pillola ha bordo e angoli suoi, con e senza prefisso', () => {
        const regola = /\.talos-message-content :not\(pre\) > code \{([^}]*)\}/u.exec(sorgente)?.[1] ?? ''
        expect(regola).toMatch(/(^|[;\s])box-decoration-break:\s*clone/u)
        expect(regola).toMatch(/-webkit-box-decoration-break:\s*clone/u)
    })
})
