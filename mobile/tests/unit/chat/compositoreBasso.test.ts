/**
 * BASSO-01..02 — D1, trovato sul Pad il 28/10/2026 (vc325, modalità telefono ORIZZONTALE con la tastiera aperta: restano 148 px).
 * Il compositore aperto su due righe (108 px) saliva sotto la barra di stato, copriva i tondi in alto e i comandi della seconda riga
 * uscivano dal bordo. Sotto la regola che c'era già (`orientation: landscape` e `max-height: 180px`) il compositore aperto resta su
 * UNA riga: «+» · campo · scudo · chip · Libreria · microfono · invio. Il chip, se non ci sta, si accorcia coi puntini: non va a capo.
 * La media query non si valuta in jsdom: la guardia legge il sorgente, come CODE-COMPOSER-LANDSCAPE-IME-SAFE-01.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sorgente = readFileSync(resolve(__dirname, '../../../src/components/chat/TalosMobileComposer.vue'), 'utf8')
const css = readFileSync(resolve(__dirname, '../../../src/style.css'), 'utf8')
/** Il blocco della media query «schermo bassissimo», intero (le graffe annidate contate). */
function bloccoBasso(): string {
    const inizio = sorgente.indexOf('@media (orientation: landscape) and (max-height: 500px) and (max-width: 1100px)')
    expect(inizio, 'la media query del telefono in orizzontale').toBeGreaterThan(-1)
    let profondita = 0
    for (let i = sorgente.indexOf('{', inizio); i < sorgente.length; i++) {
        if (sorgente[i] === '{') profondita++
        if (sorgente[i] === '}' && --profondita === 0) return sorgente.slice(inizio, i + 1)
    }
    throw new Error('media query non chiusa')
}
const regola = (blocco: string, selettore: string) => {
    const i = blocco.indexOf(`${selettore} {`)
    expect(i, selettore).toBeGreaterThan(-1)
    return blocco.slice(i, blocco.indexOf('}', i) + 1)
}

describe('BASSO il compositore aperto in uno schermo bassissimo', () => {
    it('BASSO-01 aperto resta su UNA riga: niente griglia, il campo prende lo spazio, la colonna in alto si stende', () => {
        const b = bloccoBasso()
        expect(regola(b, '[data-testid="talos-mobile-composer"] .talos-composer-field-row.is-aperto')).toContain('display: flex;')
        const campo = regola(b, '[data-testid="talos-mobile-composer"] .is-aperto > .talos-calm-prompt')
        expect(campo).toContain('grid-area: auto;')
        // il campo parte da metà riga e non scende sotto 7rem: è il NOME del modello che cede (coi puntini), non il campo — a 640 px il
        // nome lungo lasciava al campo il segnaposto su due righe (banco, 28/10)
        expect(campo).toContain('flex: 1 1 45%;')
        expect(campo).toContain('min-width: 7rem;')
        // il testo centrato con le icone: a tastiera aperta (180 px) il campo è forzato a 48 px, e senza respiro il testo stava in cima
        const i180 = sorgente.indexOf('@media (orientation: landscape) and (max-height: 180px)')
        const blocco180 = sorgente.slice(i180, sorgente.indexOf('@media (orientation: landscape) and (max-height: 500px) and (max-width: 1100px)'))
        expect(blocco180).toContain('.is-aperto > .talos-calm-prompt { box-sizing: border-box; padding-block: 0.75rem; }')
        expect(regola(b, '[data-testid="talos-mobile-composer"] .is-aperto > .talos-composer-alto')).toContain('flex-direction: row;')
    })

    it('BASSO-02 il chip cede lo spazio coi puntini, mai a capo', () => {
        const strumenti = regola(bloccoBasso(), '[data-testid="talos-mobile-composer"] .is-aperto > .talos-composer-tools')
        expect(strumenti).toContain('min-width: 0;')
        expect(strumenti).toContain('flex: 0 1 auto;')
        // i puntini del nome e il chip che non va a capo sono le regole di sempre (PILL-RIGHE-01)
        expect(css).toContain('.talos-composer-tools .talos-model-chip__nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }')
        expect(css).toContain('.talos-composer-tools > .talos-model-chip { flex-wrap: nowrap; min-width: 0; }')
    })
})
