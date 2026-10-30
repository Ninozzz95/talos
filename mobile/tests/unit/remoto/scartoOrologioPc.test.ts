import { afterEach, describe, expect, it } from 'vitest'
import { talosRelativeTime } from '@/lib/relativeTime'
import {
    annotaOraDelPc, dimenticaScartoDelPc, oraSulDispositivo, scartoDelPc, stimaScarto,
} from '@/lib/remoto/scartoOrologioPc'

/*
 * D-0145-6 (Desktop 25/10, sessione del PC sul Pad): «Tu · 2 min fa» dopo ~30 s. Misurato il 26/10: l'orologio del PC è ~2 min
 * INDIETRO (−118 s contro Google, −109 s contro GitHub), il Pad è giusto. r4 stampa le ore col SUO orologio; il dispositivo le
 * confrontava col proprio. Cura (b) concordata col Desktop: lo scarto si misura dal vivo, solo per mostrare.
 */
const PC = 'pc-esempio'
const ORA = Date.parse('2026-10-26T20:00:00.000Z')

afterEach(() => { dimenticaScartoDelPc(PC); dimenticaScartoDelPc('altro-pc') })

describe('lo scarto d\'orologio di un PC (D-0145-6)', () => {
    it('SCARTO-01 PC indietro di 2 min: il messaggio appena scritto dice «adesso», non «2 min fa»', () => {
        const oraDelPc = ORA - 118_000
        annotaOraDelPc(PC, oraDelPc + 400, ORA + 400)
        const scarto = scartoDelPc(PC)
        expect(scarto).toBe(118_000)
        const iso = new Date(oraDelPc).toISOString()
        expect(talosRelativeTime(iso, new Date(ORA + 30_000))).toBe('2m ago')
        expect(talosRelativeTime(oraSulDispositivo(iso, scarto), new Date(ORA + 30_000))).toBe('just now')
    })

    it('SCARTO-02 nessuno scarto vero: niente si sposta (sotto i 30 s è il ritardo della rete, non l\'orologio)', () => {
        annotaOraDelPc(PC, ORA - 1_200, ORA)
        annotaOraDelPc(PC, ORA + 5_000 - 25_000, ORA + 5_000)
        expect(scartoDelPc(PC)).toBe(0)
        const iso = new Date(ORA).toISOString()
        expect(oraSulDispositivo(iso, scartoDelPc(PC))).toBe(iso)
        expect(scartoDelPc('mai-visto')).toBe(0)
        expect(scartoDelPc(null)).toBe(0)
    })

    it('SCARTO-03 PC AVANTI di 2 min: nessuna ora nel futuro e nessun «−1 min», si resta a «adesso»', () => {
        const oraDelPc = ORA + 120_000
        annotaOraDelPc(PC, oraDelPc, ORA + 300)
        const scarto = scartoDelPc(PC)
        expect(scarto).toBe(-119_700)
        const iso = new Date(oraDelPc).toISOString()
        const corretta = oraSulDispositivo(iso, scarto)
        expect(Date.parse(corretta)).toBeLessThanOrEqual(ORA + 300)
        expect(talosRelativeTime(corretta, new Date(ORA + 300))).toBe('just now')
        expect(talosRelativeTime(corretta, new Date(ORA + 90_000))).toBe('1m ago')
    })

    it('SCARTO-04 il minimo nella finestra di 2 min: un evento arrivato tardi non gonfia lo scarto; un campione vecchio esce', () => {
        expect(stimaScarto([])).toBeNull()
        expect(stimaScarto([{ visto: ORA, scarto: 119_000 }, { visto: ORA + 1_000, scarto: 140_000 }, { visto: ORA + 2_000, scarto: 118_200 }])).toBe(118_200)
        // il campione di 3 minuti prima non conta più: vale la finestra dell'ultimo
        expect(stimaScarto([{ visto: ORA - 180_000, scarto: 50_000 }, { visto: ORA, scarto: 118_000 }])).toBe(118_000)
    })

    it('SCARTO-05 ogni PC ha il suo scarto; dimenticato (flusso riaperto, PC cambiato) torna a zero', () => {
        annotaOraDelPc(PC, ORA - 118_000, ORA)
        annotaOraDelPc('altro-pc', ORA, ORA)
        expect(scartoDelPc(PC)).toBe(118_000)
        expect(scartoDelPc('altro-pc')).toBe(0)
        dimenticaScartoDelPc(PC)
        expect(scartoDelPc(PC)).toBe(0)
    })

    it('SCARTO-06 un\'ora storta non è un campione e un iso storto resta com\'è', () => {
        annotaOraDelPc(PC, Number.NaN, ORA)
        annotaOraDelPc(PC, 0, ORA)
        expect(scartoDelPc(PC)).toBe(0)
        expect(oraSulDispositivo('non-una-data', 118_000)).toBe('non-una-data')
        expect(oraSulDispositivo('', 118_000)).toBe('')
    })
})
