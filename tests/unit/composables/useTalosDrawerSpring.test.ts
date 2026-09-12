import { describe, expect, it } from 'vitest'

import {
    talosDrawerGestureMove,
    talosDrawerGestureStart,
    talosDrawerShouldOpen,
    talosSamplePointer,
    talosScalarSpring,
    talosVelocityAt,
    type TalosPointerSample,
} from '@/composables/useTalosDrawerSpring'

/**
 * ⭐⭐⭐ IL GESTO DELLA SIDEBAR, portato dal mockup così com'è (U-1) — provato
 * come calcolo, prima che come tocco sul Pad.
 *
 * I numeri sono quelli di `src/app.js` del pacchetto «Talos Calm Finale»: ω 23,
 * velocità limitata a ±2.600 px/s, fermata a 0,15 px e 5 px/s, finestra di 90
 * ms per la velocità, soglie di 9/8 px per agganciare o abbandonare, rilascio
 * proiettato con `vx · 160` contro metà larghezza.
 */

/** Uno scheduler finto: ogni `avanza(ms)` esegue il frame in coda con quel tempo. */
function orologio() {
    let t = 0
    let coda: ((at: number) => void) | null = null
    return {
        now: () => t,
        schedule: (cb: (at: number) => void) => { coda = cb; return 1 },
        cancelSchedule: () => { coda = null },
        avanza(ms: number) { t += ms; const cb = coda; coda = null; cb?.(t) },
        inCoda: () => coda !== null,
    }
}

describe('la molla criticamente smorzata', () => {
    it('SPR-01 converge da −320 a 0 senza mai superare l’arrivo, e chiama finish una volta', () => {
        const o = orologio()
        const tracce: number[] = []
        let finiti = 0
        const h = talosScalarSpring(-320, 0, (x) => tracce.push(x), () => { finiti += 1 }, { ...o })
        expect(h?.playState).toBe('running')
        for (let i = 0; i < 200 && o.inCoda(); i += 1) o.avanza(16)
        expect(h?.playState).toBe('finished')
        expect(finiti).toBe(1)
        expect(tracce[tracce.length - 1]).toBe(0)
        // Critica: mai oltre lo zero (nessun rimbalzo), sempre in salita.
        expect(Math.max(...tracce)).toBeLessThanOrEqual(0)
        for (let i = 1; i < tracce.length; i += 1) expect(tracce[i]!).toBeGreaterThanOrEqual(tracce[i - 1]! - 1e-9)
    })

    it('SPR-02 parte con la velocità del dito: con v₀ verso l’arrivo copre più strada nel primo frame', () => {
        const o1 = orologio(); const o2 = orologio()
        const senza: number[] = []; const con: number[] = []
        talosScalarSpring(-320, 0, (x) => senza.push(x), undefined, { ...o1, velocity: 0 })
        talosScalarSpring(-320, 0, (x) => con.push(x), undefined, { ...o2, velocity: 2000 })
        o1.avanza(16); o2.avanza(16)
        expect(con[con.length - 1]!).toBeGreaterThan(senza[senza.length - 1]!)
    })

    it('SPR-03 la velocità è limitata a ±2.600 px/s, come nel mockup', () => {
        const oA = orologio(); const oB = orologio()
        const a: number[] = []; const b: number[] = []
        talosScalarSpring(-320, 0, (x) => a.push(x), undefined, { ...oA, velocity: 2600 })
        talosScalarSpring(-320, 0, (x) => b.push(x), undefined, { ...oB, velocity: 99_999 })
        oA.avanza(16); oB.avanza(16)
        expect(a[a.length - 1]).toBeCloseTo(b[b.length - 1]!, 9)
    })

    /** ⛔ Riduzione movimento: niente molla, arrivo subito, finish sincrono. */
    it('SPR-04 con riduzione movimento dipinge direttamente l’arrivo', () => {
        const o = orologio()
        const tracce: number[] = []
        let finiti = 0
        const h = talosScalarSpring(-320, 0, (x) => tracce.push(x), () => { finiti += 1 }, { ...o, reduced: true })
        expect(h).toBeNull()
        expect(tracce).toEqual([0])
        expect(finiti).toBe(1)
        expect(o.inCoda()).toBe(false)
    })

    /** ⛔ AL CONTRARIO: annullata, non chiama finish e non dipinge più. */
    it('SPR-05 cancel ferma tutto senza finish', () => {
        const o = orologio()
        const tracce: number[] = []
        let finiti = 0
        const h = talosScalarSpring(-320, 0, (x) => tracce.push(x), () => { finiti += 1 }, { ...o })
        o.avanza(16)
        h!.cancel()
        const prima = tracce.length
        o.avanza(16); o.avanza(16)
        expect(tracce.length).toBe(prima)
        expect(finiti).toBe(0)
        expect(h!.playState).toBe('idle')
    })

    /** ⭐ U-15: la molla segue il cursore «Durata transizioni» come nel mockup (`ω/factor`, `t > 1,1·factor`). */
    it('SPR-07 con timeScale 2 la molla impiega circa il doppio a fermarsi; con 0,5 la metà; mai sotto 0,25', () => {
        const fotogrammi = (timeScale: number): number => {
            const o = orologio(); let n = 0
            talosScalarSpring(-320, 0, () => { n += 1 }, undefined, { ...o, timeScale })
            for (let i = 0; i < 400 && o.inCoda(); i += 1) o.avanza(16)
            return n
        }
        const serie = fotogrammi(1), doppio = fotogrammi(2), meta = fotogrammi(0.5)
        expect(doppio).toBeGreaterThan(serie * 1.6)
        expect(doppio).toBeLessThan(serie * 2.4)
        expect(meta).toBeLessThan(serie * 0.7)
        // Sotto 0,25 si tronca a 0,25: 0,1 e 0,25 danno lo stesso conto.
        expect(fotogrammi(0.1)).toBe(fotogrammi(0.25))
        // Alle preferenze di serie (fattore 1) il conto è quello di SPR-01: la sensazione di U-1 non cambia.
        expect(fotogrammi(1)).toBe(fotogrammi(undefined as unknown as number))
    })

    it('SPR-06 si ferma comunque entro 1,1 s', () => {
        const o = orologio()
        const h = talosScalarSpring(-320, 0, () => {}, undefined, { ...o, feel: 'quiet' })
        for (let i = 0; i < 80 && o.inCoda(); i += 1) o.avanza(16)
        expect(h?.playState).toBe('finished')
    })
})

describe('la velocità del rilascio, sugli ultimi 90 ms', () => {
    it('VEL-01 tiene solo gli ultimi 90 ms e al massimo 12 campioni', () => {
        const s: TalosPointerSample[] = []
        for (let i = 0; i < 20; i += 1) talosSamplePointer(s, i * 10, 0, i * 10)
        expect(s.length).toBeLessThanOrEqual(12)
        expect(s[s.length - 1]!.t - s[0]!.t).toBeLessThanOrEqual(90)
    })

    it('VEL-02 velocità in px/ms, limitata a ±2,6', () => {
        const s: TalosPointerSample[] = []
        talosSamplePointer(s, 0, 0, 0)
        talosSamplePointer(s, 100, 0, 50)
        expect(talosVelocityAt(s, 50, 'x')).toBeCloseTo(2, 6)
        const veloce: TalosPointerSample[] = []
        talosSamplePointer(veloce, 0, 0, 0)
        talosSamplePointer(veloce, 1000, 0, 10)
        expect(talosVelocityAt(veloce, 10, 'x')).toBe(2.6)
    })

    /** ⛔ Un dito fermo da più di 90 ms non ha velocità: il rilascio non «scatta». */
    it('VEL-03 se l’ultimo campione è vecchio la velocità è zero', () => {
        const s: TalosPointerSample[] = []
        talosSamplePointer(s, 0, 0, 0)
        talosSamplePointer(s, 100, 0, 50)
        expect(talosVelocityAt(s, 200, 'x')).toBe(0)
    })
})

describe('il rilascio decide', () => {
    const W = 352
    it('REL-01 oltre metà larghezza resta aperto, sotto si chiude', () => {
        expect(talosDrawerShouldOpen(-100, -100, 0, W)).toBe(true)
        expect(talosDrawerShouldOpen(-250, -250, 0, W)).toBe(false)
    })

    it('REL-02 una spinta veloce verso la chiusura chiude anche da quasi aperto', () => {
        // x = −60 (quasi aperto), ma il dito corre a −2 px/ms: −60 − 320 = −380 < −176.
        expect(talosDrawerShouldOpen(-60, -60, -2, W)).toBe(false)
    })

    /** ⛔ Sotto 18 px di spostamento la velocità NON conta: un tremito non è un'intenzione. */
    it('REL-03 con meno di 18 px la velocità è ignorata', () => {
        expect(talosDrawerShouldOpen(-10, -10, -2.6, W)).toBe(true)
    })
})

describe('l’aggancio del gesto', () => {
    it('GES-01 sotto le soglie non decide niente', () => {
        const g = talosDrawerGestureStart(1, 100, 100, 0, 0)
        expect(talosDrawerGestureMove(g, 105, 102, 10)).toBe('ignore')
        expect(g.locked).toBe(false)
    })

    it('GES-02 uno scorrimento verticale prevalente abbandona il gesto', () => {
        const g = talosDrawerGestureStart(1, 100, 100, 0, 0)
        expect(talosDrawerGestureMove(g, 103, 120, 10)).toBe('abandon')
    })

    it('GES-03 nove pixel orizzontali agganciano, e da lì è sempre drag', () => {
        const g = talosDrawerGestureStart(1, 100, 100, 0, 0)
        expect(talosDrawerGestureMove(g, 110, 101, 10)).toBe('drag')
        expect(g.locked).toBe(true)
        // Agganciato: anche un movimento verticale non lo abbandona più.
        expect(talosDrawerGestureMove(g, 112, 140, 20)).toBe('drag')
        expect(g.dx).toBe(12)
    })
})
