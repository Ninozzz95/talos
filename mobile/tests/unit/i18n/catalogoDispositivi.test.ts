import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Owner 22/10/2026: «dispositivo/device», mai «telefono/phone», in tutto ciò che si legge — TALOS gira su telefoni E tablet (il Pad
 * dell'owner è un tablet). Cancello permanente sui due cataloghi: nessuna voce nomina il telefono. Ledger:
 * `.claude/ragionamento/LEDGER-DISPOSITIVI-2026-10-22.md`.
 */
const TELEFONO = {
    en: /\b(?:phones?|smartphones?|cellphones?|mobile phones?)\b/i,
    it: /\b(?:telefon[oi]|smartphone|cellular[ei]|telefonin[oi])\b/i,
}

function vociCon(lingua: 'en' | 'it'): string[] {
    const sorgente = readFileSync(resolve(__dirname, `../../../src/i18n/locales/${lingua}.ts`), 'utf8')
    // ⛔ apici E virgolette doppie: il 22/10 dal vivo «Collegamento al telefono» era sfuggito perché scritto fra virgolette doppie
    const voce = /^\s*([A-Za-z0-9_]+):\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2/gm
    const trovate: string[] = []
    for (let m = voce.exec(sorgente); m; m = voce.exec(sorgente)) if (TELEFONO[lingua].test(m[3])) trovate.push(`${m[1]}: ${m[3]}`)
    return trovate
}

describe('dispositivi, non telefoni', () => {
    it('I18N-DEV-01 nessuna voce inglese o italiana nomina il telefono', () => {
        expect(vociCon('en')).toEqual([])
        expect(vociCon('it')).toEqual([])
        // AL CONTRARIO: il controllo vede davvero la parola, e non scambia «device» o «dispositivo» per telefono
        expect(TELEFONO.en.test('An AI that runs on your phone')).toBe(true)
        expect(TELEFONO.it.test('sul telefono')).toBe(true)
        expect(TELEFONO.en.test('An AI that runs on your device')).toBe(false)
        expect(TELEFONO.it.test('sul dispositivo')).toBe(false)
    })
})
