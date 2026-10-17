import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artefattoEsportazioneR4, trascrizioneMarkdownR4 } from '@/lib/harness/r4/trascrizioneR4'

/**
 * ⛔ K3-C Esporta e Condividi (ledger `LEDGER-K3-ESPORTA-CONDIVIDI-2026-10-17.md`; owner 17/10 «Markdown + JSON, come il desktop»):
 * la trascrizione Markdown è il porto 1:1 di `costruisciTrascrizioneMarkdown` del desktop r4 @ 2161afb32. Il golden è calcolato
 * dal codice VERO del pin (`trascrizione-golden-701c6c0d2.json`) su un `/export` VERO del Pad (`export-701c6c0d2.json`), su una
 * sessione sintetica che tocca tutti i rami e su una sessione vuota, in italiano e in inglese.
 */
const fixture = (nome: string) => JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', nome), 'utf8'))
const golden = fixture('trascrizione-golden-701c6c0d2.json')
const vero = fixture('export-701c6c0d2.json').risposta.data

describe('la trascrizione Markdown del Codice su r4 (K3-C Esporta)', () => {
    it('TRS-01 l\'export vero del Pad: come il desktop, riga per riga, in italiano e in inglese', () => {
        expect(trascrizioneMarkdownR4(vero, 'it').split('\n')).toEqual(golden.uscite.it.vera.split('\n'))
        expect(trascrizioneMarkdownR4(vero, 'en-US').split('\n')).toEqual(golden.uscite.en.vera.split('\n'))
    })

    it('TRS-02 tutti i rami: ordine di comparsa, esito mai troncato, nessun evento scartato', () => {
        expect(trascrizioneMarkdownR4(golden.sintetico, 'it').split('\n')).toEqual(golden.uscite.it.sintetica.split('\n'))
        expect(trascrizioneMarkdownR4(golden.sintetico, 'en').split('\n')).toEqual(golden.uscite.en.sintetica.split('\n'))
    })

    it('TRS-03 una sessione senza eventi lo dice', () => {
        expect(trascrizioneMarkdownR4({ sessionId: 'vuota', eventi: [] }, 'it')).toBe(golden.uscite.it.vuota)
        expect(trascrizioneMarkdownR4({ sessionId: 'vuota', eventi: [] }, 'en')).toBe(golden.uscite.en.vuota)
    })

    it('TRS-04 i due artefatti: Markdown e JSON grezzo, col nome del file del desktop', () => {
        const md = artefattoEsportazioneR4(vero, 'markdown', 'it')
        expect(md).toMatchObject({ contentType: 'text/markdown', extension: 'md', content: golden.uscite.it.vera })
        expect(md.fileName).toBe(`talos-sessione-${vero.sessionId}.md`)
        const json = artefattoEsportazioneR4(vero, 'json', 'en')
        expect(json).toMatchObject({ contentType: 'application/json', extension: 'json', content: JSON.stringify(vero, null, 2) })
        expect(json.fileName).toBe(`talos-session-${vero.sessionId}.json`)
    })
})
