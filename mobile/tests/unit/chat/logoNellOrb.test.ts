import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * ⭐ Owner 02/10/2026: «il logo dentro lo spinner orb, logo TALOS deve essere più grande» ⇒ «Tre quarti del cerchio»,
 * sull'orb che gira (attesa) e su quello fermo in testa alle risposte («Orb che gira e orb fermo»): un solo segno, una
 * sola misura. Prima: logo 1,2 rem in un orb da 2,25 rem.
 *
 * ⛔ Regressione del 02/10: la prima cura misurava l'ELEMENTO (1,6875 rem = 75%), ma sul Pad il disegno era il 48% del
 * cerchio, perché l'SVG generato ha margine nel suo riquadro e il segno stava al 92%. Qui si misura il DISEGNO: i
 * limiti si leggono dall'SVG vero (cerchio in cima e arco in fondo all'esagono, tratti compresi).
 */
const radice = process.cwd()
const css = readFileSync(resolve(radice, 'src/components/chat/talosCalmMessages.css'), 'utf8')
const svg = readFileSync(resolve(radice, 'public/talos/brand/logo-short.svg'), 'utf8')

function frazioneDelDisegno(): number {
    const lato = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)![1])
    const cima = /<circle cx="250" cy="([0-9.]+)" r="([0-9.]+)" stroke-width="([0-9.]+)"/.exec(svg)!
    const altoY = Number(cima[1]) - Number(cima[2]) - Number(cima[3]) / 2
    // L'arco più basso dell'esagono: corda fra i due punti a quota `y`, raggio `r`, tratto `w` (il primo path).
    const fondo = /L ([0-9.]+) ([0-9.]+) A ([0-9.]+) [0-9.]+ 0 0 0 ([0-9.]+) \2/.exec(svg)!
    const meta = (Number(fondo[4]) - Number(fondo[1])) / 2
    const r = Number(fondo[3])
    const freccia = r - Math.sqrt(r * r - meta * meta)
    const tratto = Number(/stroke-width="([0-9.]+)" opacity/.exec(svg)![1])
    const bassoY = Number(fondo[2]) + freccia + tratto / 2
    return (bassoY - altoY) / lato
}

describe('il logo TALOS nell\'orb', () => {
    it('LOGO-ORB-01 il disegno visibile occupa tre quarti del cerchio, in attesa e in testa alle risposte', () => {
        const orb = /\.talos-orb \{[^}]*width: ([0-9.]+)rem; height: ([0-9.]+)rem;[^}]*border: ([0-9.]+)px/.exec(css)!
        expect(orb).not.toBeNull()
        const diametroPx = Number(orb[1]) * 16
        const internoPx = diametroPx - 2 * Number(orb[3])
        expect(css).toMatch(/\.talos-orb \.talos-short-logo \{ width: 100%; height: 100%; \}/)
        const segno = /\.talos-orb \.talos-short-logo-mark \{ width: 100%; height: 100%; mask-size: ([0-9.]+)%; -webkit-mask-size: \1%; \}/.exec(css)
        expect(segno).not.toBeNull()
        const disegnoPx = frazioneDelDisegno() * internoPx * Number(segno![1]) / 100
        expect(disegnoPx / diametroPx).toBeGreaterThanOrEqual(0.74)
        expect(disegnoPx / diametroPx).toBeLessThanOrEqual(0.77)
        // Una sola regola per il logo nell'orb: l'attesa (.working) non ne ha una sua.
        expect(css).not.toMatch(/\.talos-orb\.working \.talos-short-logo/)
    })
})
