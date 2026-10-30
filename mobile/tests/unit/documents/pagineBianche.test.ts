import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTalosReportDefinition } from '@/lib/documents/reportBuilder'
import type { TalosReportSpec } from '@/lib/documents/reportBuilder'

/**
 * BIANCHE-01..06 (CHAT-141, LEDGER-CHAT-141-PDF-PAGINE-BIANCHE-2026-10-28.md, OK del Desktop 28/10).
 *
 * Il PDF dell'audit v2 dell'owner aveva 6 pagine, e la 5 era interamente bianca. Riprodotto con pdfmake 0.3.11 (la versione fissata):
 * il blocco `pb` era un nodo `{ text: '', pageBreak: 'after' }` che occupa una riga, e i margini erano tutti INFERIORI. Quando una sezione
 * finisce negli ultimi punti della pagina, il margine o la riga del `pb` aprono la pagina dopo, e il salto ne apre un'altra: quella in
 * mezzo resta col solo piè di pagina. Su 135 impaginazioni realistiche: 135 con una bianca in coda, 5 anche in mezzo.
 *
 * Il PDF è vero: lo stesso `buildTalosReportDefinition` dell'app, pdfmake 0.3.11, testo per pagina letto con pdfjs-dist. Le soglie si
 * SCANSIONANO invece di fissarle, perché il carattere può spostarle di qualche riga.
 */

const require = createRequire(import.meta.url)
const radice = path.resolve(__dirname, '../../..')
const pdfmake = require('pdfmake') as {
    setFonts(f: unknown): void
    setUrlAccessPolicy?(f: () => boolean): void
    createPdf(d: unknown): { getBuffer(): Promise<Uint8Array> }
}
const F = path.join(radice, 'node_modules/pdfmake/fonts/Roboto')
pdfmake.setFonts({ Roboto: {
    normal: path.join(F, 'Roboto-Regular.ttf'), bold: path.join(F, 'Roboto-Medium.ttf'),
    italics: path.join(F, 'Roboto-Italic.ttf'), bolditalics: path.join(F, 'Roboto-Medium.ttf'),
} })
pdfmake.setUrlAccessPolicy?.(() => false)

type Blocco = TalosReportSpec['blocks'][number]

/** Il testo di ogni pagina senza il piè di pagina «F n / N»: una pagina è bianca se non resta niente. */
async function pagine(blocks: Blocco[]): Promise<string[]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const def = buildTalosReportDefinition({ meta: { title: 'T' }, footer: { text: 'F', pageNo: true }, blocks } as TalosReportSpec)
    const buf = await pdfmake.createPdf(def).getBuffer()
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise
    const testi: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
        const t = await (await doc.getPage(i)).getTextContent()
        const testo = t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/gu, ' ').trim()
        testi.push(testo.replace(/F?\s*\d+\s*\/\s*\d+\s*$/u, '').replace(/^F\s*/u, '').trim())
    }
    return testi
}

const bianche = (testi: string[]) => testi.flatMap((t, i) => (t === '' ? [i + 1] : []))
const para = (i: number): Blocco => ({ t: 'p', x: `Paragrafo numero ${i} con un testo abbastanza lungo da occupare una riga piena della pagina A4.` })
const riga = (i: number) => [`Negozio ${i}`, `${1000 + i}`, `${i}%`]

describe('CHAT-141 il PDF non ha pagine bianche', () => {
    it('BIANCHE-01 n paragrafi + pb + titolo: nessuna pagina col solo piè di pagina, per ogni n da 25 a 45', async () => {
        const difetti: string[] = []
        for (let n = 25; n <= 45; n++) {
            const b = bianche(await pagine([...Array.from({ length: n }, (_, i) => para(i)), { t: 'pb' }, { t: 'h', lvl: 1, x: 'Sezione dopo' }] as Blocco[]))
            if (b.length) difetti.push(`n=${n}: bianche ${b.join(',')}`)
        }
        expect(difetti).toEqual([])
    }, 60_000)

    it('BIANCHE-02 tabella di r righe + pb + titolo: nessuna pagina bianca, per ogni r da 20 a 60', async () => {
        const difetti: string[] = []
        for (let r = 20; r <= 60; r++) {
            const b = bianche(await pagine([
                { t: 'h', lvl: 1, x: 'Tabella' },
                { t: 'table', head: ['Negozio', 'Ricavi', 'Var'], rows: Array.from({ length: r }, (_, i) => riga(i)) },
                { t: 'pb' },
                { t: 'h', lvl: 1, x: 'Sezione dopo' },
            ] as Blocco[]))
            if (b.length) difetti.push(`r=${r}: bianche ${b.join(',')}`)
        }
        expect(difetti).toEqual([])
    }, 120_000)

    it('BIANCHE-03 un pb come ultimo blocco non apre una pagina vuota', async () => {
        expect(await pagine([{ t: 'p', x: 'Contenuto.' }, { t: 'pb' }] as Blocco[])).toHaveLength(1)
    })

    it('BIANCHE-04 pb + spazio + pb vale un salto solo', async () => {
        const testi = await pagine([{ t: 'p', x: 'Prima.' }, { t: 'pb' }, { t: 'spacer' }, { t: 'pb' }, { t: 'p', x: 'Dopo.' }] as Blocco[])
        expect(testi).toHaveLength(2)
        expect(bianche(testi)).toEqual([])
    })

    it('BIANCHE-05 solo paragrafi: nessuna pagina bianca in coda, per ogni n da 25 a 45', async () => {
        const difetti: string[] = []
        for (let n = 25; n <= 45; n++) {
            const b = bianche(await pagine(Array.from({ length: n }, (_, i) => para(i))))
            if (b.length) difetti.push(`n=${n}: bianche ${b.join(',')}`)
        }
        expect(difetti).toEqual([])
    }, 60_000)

    it('BIANCHE-06 il salto resta un salto: due sezioni separate da pb stanno su due pagine', async () => {
        const testi = await pagine([{ t: 'h', lvl: 1, x: 'Uno' }, { t: 'p', x: 'Testo uno.' }, { t: 'pb' }, { t: 'h', lvl: 1, x: 'Due' }, { t: 'p', x: 'Testo due.' }] as Blocco[])
        expect(testi).toHaveLength(2)
        expect(testi[1]).toMatch(/^Due/u)
    })

    it('BIANCHE-07 un salto in testa, anche dopo uno spazio, non apre una prima pagina vuota', async () => {
        // trovato dal Desktop (29/10) con un mutante sopravvissuto: uno spazio non è contenuto, quindi il salto dopo non ha niente da separare
        for (const blocchi of [[{ t: 'pb' }, { t: 'h', lvl: 1, x: 'Uno' }], [{ t: 'spacer' }, { t: 'pb' }, { t: 'p', x: 'Uno.' }]]) {
            const testi = await pagine(blocchi as Blocco[])
            expect(bianche(testi), JSON.stringify(blocchi)).toEqual([])
            expect(testi, JSON.stringify(blocchi)).toHaveLength(1)
        }
    })
})
