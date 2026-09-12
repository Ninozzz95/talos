import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { generateTalosDocument } from '../src/document-generator.mjs'
import { costruisciEsportazione, DICITURA_SENZA_VERIFICHE } from '../src/research/esportazioni.mjs'
import { talosResearchReportDocument } from '../src/research/report.mjs'
import { markdownInBlocchiReport } from '../src/research/markdown-server.mjs'

const corpo = '# Capitolo\n\nParagrafo normale.\n\n## Sezione\n\nTesto **forte**.\n\n### Dettaglio\n\n- Padre\n  1. Primo\n     - Nipote\n  2. Secondo\n- Fratello\n\n1. Nuovo elenco'
const report = talosResearchReportDocument({ question: 'Domanda', summary: corpo, judge: null, claims: [], sources: [] })
const ricerca = { domanda: 'Domanda', stato: 'done', contenutoRapporto: `${corpo}\n\n${report}` }

async function parti(documento) {
    const zip = await JSZip.loadAsync(documento.bytes)
    return Object.fromEntries(await Promise.all(['document', 'styles', 'numbering'].map(async nome => [nome, await zip.file(`word/${nome}.xml`).async('string')])))
}

function paragrafi(xml) {
    return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([p]) => ({
        xml: p,
        testo: [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join(''),
        stile: /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1],
        livello: /<w:ilvl w:val="(\d+)"/.exec(p)?.[1],
        numero: /<w:numId w:val="(\d+)"/.exec(p)?.[1],
    }))
}

// Lettura della CMap reale emessa da pdfmake: una posizione senza testo non prova l'annidamento.
function testiPosizionati(pdf) {
    const risultato = []
    for (const pagina of pdf.getPages()) {
        const fonts = pagina.node.Resources().lookup(PDFName.of('Font'))
        const mappe = new Map()
        for (const nome of fonts.keys()) {
            const unicode = fonts.lookup(nome).lookup(PDFName.of('ToUnicode'))
            if (!(unicode instanceof PDFRawStream)) continue
            const cmap = Buffer.from(decodePDFRawStream(unicode).decode()).toString('latin1')
            const mappa = new Map()
            const decodifica = h => String.fromCharCode(...(h.match(/.{4}/g) ?? []).map(x => parseInt(x, 16)))
            for (const blocco of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
                for (const m of blocco[1].matchAll(/<([\da-f]+)>\s*<([\da-f]*)>/gi)) mappa.set(parseInt(m[1], 16), decodifica(m[2]))
            }
            for (const blocco of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
                const array = /<([\da-f]+)>\s*<([\da-f]+)>\s*\[([^\]]*)\]/gi
                for (const m of blocco[1].matchAll(array)) {
                    [...m[3].matchAll(/<([\da-f]*)>/gi)].forEach((v, i) => mappa.set(parseInt(m[1], 16) + i, decodifica(v[1])))
                }
                for (const m of blocco[1].replace(array, '').matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
                    const da = parseInt(m[1], 16), a = parseInt(m[2], 16), base = parseInt(m[3], 16)
                    for (let c = da; c <= a; c++) mappa.set(c, String.fromCharCode(base + c - da))
                }
            }
            mappe.set(nome.asString(), mappa)
        }
        const contenuti = pagina.node.Contents()
        const flussi = contenuti instanceof PDFArray ? contenuti.asArray().map(r => pdf.context.lookup(r)) : [contenuti]
        for (const flusso of flussi) {
            const raw = Buffer.from(decodePDFRawStream(flusso).decode()).toString('latin1')
            let x = 0, y = 0, font = new Map()
            for (const m of raw.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm|\/(F\d+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ/g)) {
                if (m[1]) { x = Number(m[1]); y = Number(m[2]); continue }
                if (m[3]) { font = mappe.get(`/${m[3]}`); continue }
                const testo = [...m[4].matchAll(/<([\da-f]+)>/gi)].map(v => (v[1].match(/.{4}/g) ?? []).map(h => font.get(parseInt(h, 16)) ?? '').join('')).join('')
                risultato.push({ testo, x, y })
            }
        }
    }
    return risultato
}

for (const origine of ['document_create', 'ricerca']) {
    test(`BC35 — ${origine}: veri Heading1/2/3 solo sui titoli`, async () => {
        const documento = origine === 'ricerca'
            ? await costruisciEsportazione({ ricerca, formato: 'docx' })
            : await generateTalosDocument({ format: 'docx', title: 'Domanda', body: corpo })
        const xml = await parti(documento)
        const p = paragrafi(xml.document)
        for (const [testo, stile] of [['Capitolo', 'Heading1'], ['Sezione', 'Heading2'], ['Dettaglio', 'Heading3']]) {
            assert.equal(p.find(x => x.testo === testo)?.stile, stile)
            assert.match(xml.styles, new RegExp(`w:styleId="${stile}"`))
        }
        for (const testo of ['Paragrafo normale.', 'Testo forte.', 'Padre', 'Nipote']) {
            assert.ok(p.some(x => x.testo === testo), testo)
            assert.doesNotMatch(p.find(x => x.testo === testo).stile ?? '', /^Heading/)
        }
        assert.doesNotMatch(xml.document, /talos-research-report|## |\*\*/)
    })
}

test('BC35 — ricerca e document_create producono la stessa styles.xml byte per byte', async () => {
    const a = await parti(await costruisciEsportazione({ ricerca, formato: 'docx' }))
    const b = await parti(await generateTalosDocument({ format: 'docx', title: 'Altro titolo', body: 'Testo qualunque.' }))
    assert.equal(a.styles, b.styles)
})

test('BC35 — stili Word completi per navigazione e gerarchia visiva', async () => {
    const xml = await parti(await generateTalosDocument({ format: 'docx', title: 'Titolo', body: corpo }))
    for (const [indice, dimensione] of [32, 26, 24].entries()) {
        const stile = xml.styles.match(new RegExp(`<w:style[^>]*w:styleId="Heading${indice + 1}"[^>]*>[\\s\\S]*?</w:style>`))?.[0]
        assert.ok(stile)
        assert.match(stile, new RegExp(`<w:outlineLvl w:val="${indice}"`))
        assert.match(stile, new RegExp(`<w:sz w:val="${dimensione}"`))
        assert.match(stile, /<w:b\/>/)
        assert.match(stile, /<w:keepNext\/>/)
    }
    const normali = paragrafi(xml.document).filter(p => !p.stile?.startsWith('Heading'))
    assert.ok(normali.length > 0)
    for (const p of normali) assert.doesNotMatch(p.xml, /<w:outlineLvl/)
})

test('BC35 — Word conserva livelli, tipi misti e numerazione indipendente', async () => {
    const xml = await parti(await costruisciEsportazione({ ricerca, formato: 'docx' }))
    const p = paragrafi(xml.document)
    for (const [testo, livello] of [['Padre', '0'], ['Primo', '1'], ['Nipote', '2'], ['Secondo', '1'], ['Fratello', '0']]) {
        assert.equal(p.find(x => x.testo === testo)?.livello, livello)
    }
    assert.equal(p.find(x => x.testo === 'Primo').numero, p.find(x => x.testo === 'Secondo').numero)
    assert.notEqual(p.find(x => x.testo === 'Primo').numero, p.find(x => x.testo === 'Nuovo elenco').numero)
    assert.match(xml.numbering, /w:numFmt w:val="bullet"/)
    assert.match(xml.numbering, /w:numFmt w:val="decimal"/)
})

test('BC35 — prosa senza record conserva avviso, titoli e figli', async () => {
    const xml = await parti(await costruisciEsportazione({ ricerca: { domanda: 'Domanda', stato: 'senza-rapporto', contenutoRespinto: corpo }, formato: 'docx' }))
    const p = paragrafi(xml.document)
    assert.ok(p.some(x => x.testo === DICITURA_SENZA_VERIFICHE && !x.stile))
    assert.equal(p.find(x => x.testo === 'Dettaglio').stile, 'Heading3')
    assert.equal(p.find(x => x.testo === 'Nipote').livello, '2')
})

test('BC35 — pdfmake reale impagina i blocchi annidati senza perdere testo', async () => {
    const documento = await generateTalosDocument({ format: 'pdf', title: 'Elenchi', report: {
        meta: { title: 'Elenchi' }, blocks: markdownInBlocchiReport(corpo),
    } })
    const pdf = await PDFDocument.load(documento.bytes)
    assert.ok(pdf.getPageCount() >= 1)
    const testi = testiPosizionati(pdf)
    const posizione = parola => {
        const voce = testi.find(p => p.testo === parola)
        assert.ok(voce, `testo presente nel PDF: ${parola}`)
        return voce
    }
    assert.ok(posizione('Primo').x > posizione('Padre').x)
    assert.ok(posizione('Nipote').x > posizione('Primo').x)
    assert.equal(posizione('Secondo').x, posizione('Primo').x)
    assert.equal(posizione('Fratello').x, posizione('Padre').x)
    assert.ok(posizione('Nipote').y < posizione('Primo').y)
})
