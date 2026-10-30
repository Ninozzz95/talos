/**
 * ⛔ Owner 28/10/2026 notte, bozzetto «Forge leggibile», variante B «Corridoio velato» (desktop dc4859dd6, `desktop-background.js`
 * `VELO_DELLE_SCENE` / `velaLaScena`: stessa regola e stesse costanti, una volta sola per le due app).
 *
 * Misurato sul Pad il 28/10 col metodo a foto di riferimento (scena nascosta vs accesa, dentro una chat): Forge acceso portava il testo
 * principale a 3,76:1 in scuro e 4,31:1 in chiaro, il grigio secondario a 1,77:1 e 1,58:1. Due passi, dopo il disegno della scena:
 * - la scena resta al 70%: si toglie il 30% di ogni pixel (`destination-out`), come moltiplicare ogni opacità per 0,7;
 * - nella colonna della chat se ne toglie l'85%, con 80 px di sfumatura per lato, FUORI dai bordi della colonna.
 * Il fondo pieno dietro il canvas fa il resto. La colonna si misura quando cambia (ResizeObserver), mai a ogni fotogramma.
 */

export type VeloDellaScena = Readonly<{ opacita: number, corridoio: number, morbido: number }>

export const VELO_DELLE_SCENE: Readonly<Record<string, VeloDellaScena>> = Object.freeze({
    forge: Object.freeze({ opacita: 0.7, corridoio: 0.85, morbido: 80 }),
})

type ContestoVelo = {
    save(): void
    restore(): void
    fillRect(x: number, y: number, w: number, h: number): void
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(offset: number, color: string): void }
    globalCompositeOperation: string
    globalAlpha: number
    fillStyle: unknown
}

/** `colonna` = [x0, x1] della colonna della chat in coordinate della scena; `null` per l'anteprima o senza chat a schermo. */
export function velaLaScena(context: ContestoVelo, sceneId: string, width: number, height: number, colonna: readonly [number, number] | null): void {
    const velo = Object.hasOwn(VELO_DELLE_SCENE, sceneId) ? VELO_DELLE_SCENE[sceneId] : undefined
    if (!velo) return
    context.save()
    context.globalCompositeOperation = 'destination-out'
    context.fillStyle = '#000'
    context.globalAlpha = 1 - velo.opacita
    context.fillRect(0, 0, width, height)
    if (colonna) {
        const [x0, x1] = colonna
        const c0 = x0 - velo.morbido
        const largo = x1 + velo.morbido - c0
        const sfumatura = context.createLinearGradient(c0, 0, c0 + largo, 0)
        sfumatura.addColorStop(0, 'rgba(0,0,0,0)')
        sfumatura.addColorStop(velo.morbido / largo, 'rgba(0,0,0,1)')
        sfumatura.addColorStop(1 - velo.morbido / largo, 'rgba(0,0,0,1)')
        sfumatura.addColorStop(1, 'rgba(0,0,0,0)')
        context.globalAlpha = velo.corridoio
        context.fillStyle = sfumatura
        context.fillRect(c0, 0, largo, height)
    }
    context.restore()
}
