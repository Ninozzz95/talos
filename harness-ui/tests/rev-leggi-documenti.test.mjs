/*
 * ⛔⛔ F-001 (owner 01/10/2026 «come Hermes»; 02/10: PDF.js nel server, docx/xlsx/pptx/pdf, limiti di Hermes) — `leggi` dà il
 *   TESTO dei documenti. Misure e fonti in `src/kernel/estrai-documento.mjs`. I documenti si generano qui con le librerie che il
 *   server ha già (docx, pptxgenjs, xlsx, pdf-lib, jszip): sono file veri, non stringhe che somigliano a un file.
 */
import test from 'node:test'
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatoEstraibile, estraiTestoDocumento, avvisoDiCopertura, MAX_RIGHE_FOGLIO, MAX_COLONNE_FOGLIO, MAX_BYTE_DOCUMENTO } from '../src/kernel/estrai-documento.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const richiedi = createRequire(import.meta.url)
const cartellaDiProva = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-f001-')); t.after(() => rimuoviCartellaDiProva(c)); return c }

async function docxVero(paragrafi) {
    const { Document, Packer, Paragraph, TextRun } = richiedi('docx')
    return Packer.toBuffer(new Document({ sections: [{ children: paragrafi.map((p) => new Paragraph({ children: [new TextRun(p)] })) }] }))
}
/* Un docx scritto a mano, per ciò che `docx` non genera: guida fonetica (`w:rt`), casella di testo con un paragrafo annidato. */
async function docxAMano(corpo) {
    const JSZip = richiedi('jszip'), zip = new JSZip()
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`)
    return zip.generateAsync({ type: 'nodebuffer' })
}
async function pdfVero(pagine) {
    const { PDFDocument, StandardFonts } = richiedi('pdf-lib')
    const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica)
    for (const righe of pagine) { const p = doc.addPage(); righe.forEach((r, i) => p.drawText(r, { x: 50, y: 700 - i * 18, size: 12, font })) }
    return Buffer.from(await doc.save())
}
function xlsxVero(fogli, nascosti = []) {
    const XLSX = richiedi('xlsx'), libro = XLSX.utils.book_new()
    for (const [nome, righe] of fogli) XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(righe), nome)
    libro.Workbook = { Sheets: fogli.map(([nome]) => ({ Hidden: nascosti.includes(nome) ? 1 : 0 })) }
    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}

test('F001-01: i formati si riconoscono dall\'estensione, in qualunque maiuscola; gli altri no', () => {
    for (const [p, f] of [['a.docx', 'docx'], ['B.XLSX', 'xlsx'], ['c/d.PpTx', 'pptx'], ['rapporto.pdf', 'pdf']]) assert.equal(formatoEstraibile(p), f)
    for (const p of ['a.doc', 'a.xls', 'a.ppt', 'a.rtf', 'a.txt', 'docx', 'a.docx.bak', '', null]) assert.equal(formatoEstraibile(p), null, String(p))
})

test('F001-02: docx — paragrafi, entità, a capo e tabulazioni; la guida fonetica no; una casella di testo senza doppioni', async () => {
    assert.equal((await estraiTestoDocumento(await docxVero(['Titolo', 'Città & perché <ok>']), 'docx')).testo, 'Titolo\nCittà & perché <ok>\n')
    const aMano = await docxAMano('<w:p><w:r><w:t>uno</w:t><w:tab/><w:t xml:space="preserve">due </w:t><w:br/><w:t>tre</w:t></w:r></w:p>'
        + '<w:p><w:ruby><w:rt><w:r><w:t>kan</w:t></w:r></w:rt><w:rubyBase><w:r><w:t>漢</w:t></w:r></w:rubyBase></w:ruby></w:p>'
        + '<w:p><w:r><w:t>prima</w:t><w:pict><w:txbxContent><w:p><w:r><w:t>nella casella</w:t></w:r></w:p></w:txbxContent></w:pict><w:t> dopo</w:t></w:r></w:p>'
        + '<w:p><w:r><w:delText>cancellato</w:delText><w:t>&#x263A;&#9731;&amp;</w:t></w:r></w:p>')
    assert.equal((await estraiTestoDocumento(aMano, 'docx')).testo, 'uno\tdue \ntre\n漢\nnella casella\nprima dopo\n☺☃&\n')
})

test('F001-03: pptx — le diapositive nell\'ordine della presentazione, una intestazione ciascuna', async () => {
    const PptxGenJS = richiedi('pptxgenjs'), pres = new PptxGenJS()
    pres.addSlide().addText('Diapositiva uno\nseconda riga', { x: 1, y: 1 })
    pres.addSlide().addText('Diapositiva due', { x: 1, y: 1 })
    const testo = (await estraiTestoDocumento(await pres.write({ outputType: 'nodebuffer' }), 'pptx')).testo
    assert.equal(testo, '# ── Slide 1 ──\nDiapositiva uno\nseconda riga\n\n# ── Slide 2 ──\nDiapositiva due\n')
})

test('F001-04: xlsx — solo fogli visibili, tabulazioni, booleani; a capo nelle celle scappati; tetto di righe e colonne', async () => {
    const testo = (await estraiTestoDocumento(xlsxVero([['Persone', [['Nome', 'Attivo'], ['Anna', true], ['a\tb\nc', false], [], []]], ['Segreto', [['nascosto']]]], ['Segreto']), 'xlsx')).testo
    assert.equal(testo, '# ── Sheet: Persone ──\nNome\tAttivo\nAnna\tTRUE\na\\tb\\nc\tFALSE\n')
    const grande = Array.from({ length: MAX_RIGHE_FOGLIO + 3 }, (_, r) => Array.from({ length: MAX_COLONNE_FOGLIO + 10 }, (_, c) => (c === 0 ? `r${r}` : c)))
    const righe = (await estraiTestoDocumento(xlsxVero([['Grande', grande]]), 'xlsx')).testo.trimEnd().split('\n')
    assert.equal(righe.length, 1 + MAX_RIGHE_FOGLIO, 'intestazione + 5.000 righe')
    assert.equal(righe[1].split('\t').length, MAX_COLONNE_FOGLIO)
})

test('F001-05: pdf — il testo per pagina, accenti compresi; le pagine scansionate si DICONO in testa', async () => {
    // una pagina sotto i 20 caratteri vale vuota (Hermes, PDF_EMPTY_PAGE_CHARS): la quarta deve averne di più
    const r = await estraiTestoDocumento(await pdfVero([['Pagina uno, perché città'], [], [], ['Pagina quattro, testo sufficiente']]), 'pdf')
    assert.match(r.testo, /^# ── Page 1 ──\nPagina uno, perché città\n/u)
    assert.match(r.testo, /# ── Page 4 ──\nPagina quattro, testo sufficiente\n$/u)
    assert.match(r.avviso, /^EXTRACTION COVERAGE WARNING: 2 of 4 pages/u)
    assert.match(r.avviso, /pages 2-3 \(2 pages\) — after "Pagina uno, perché città" \(p1\)/u)
    assert.equal((await estraiTestoDocumento(await pdfVero([['solo testo'], ['ancora testo qui dentro']]), 'pdf')).avviso, '', 'tutto testo: nessun avviso')
    assert.equal(avvisoDiCopertura(['testo abbastanza lungo qui', '', 'altro testo abbastanza lungo', 'e ancora testo lungo', 'fine del testo lunga']), '', 'una pagina vuota su cinque non basta')
    // una scansione col solo numero di pagina NON è una pagina di testo (Hermes: sotto i 20 caratteri vale vuota)
    const numerate = await estraiTestoDocumento(await pdfVero([['Introduzione, con testo vero'], ['2'], ['3'], ['4']]), 'pdf')
    assert.match(numerate.avviso, /^EXTRACTION COVERAGE WARNING: 3 of 4 pages/u)
    assert.match(numerate.avviso, /pages 2-4 \(3 pages\) — after "Introduzione, con testo vero" \(p1\)/u)
})

test('F001-06: un documento rotto o senza testo è un errore DICHIARATO, mai un vuoto muto', async () => {
    for (const [dati, formato, attesa] of [
        [Buffer.from('non sono uno zip'), 'docx', /not a valid DOCX file/u],
        [await docxAMano(''), 'docx', /contains no extractable text/u],
        [Buffer.from('%PDF-1.7 rotto'), 'pdf', /not a valid PDF file/u],
        [await pdfVero([[], []]), 'pdf', /no extractable text \(its pages are likely scanned images\)/u],
        [xlsxVero([['Solo', [['x']]]], ['Solo']), 'xlsx', /no visible sheet with content/u],
    ]) await assert.rejects(estraiTestoDocumento(dati, formato), (e) => e.code === 'READ_EXTRACT_FAILED' && attesa.test(e.message), String(attesa))
    // il tetto vale anche per chi chiama il modulo direttamente (il server Linux, la CLI), non solo per `leggi`
    await assert.rejects(estraiTestoDocumento(Buffer.alloc(MAX_BYTE_DOCUMENTO + 1), 'pdf'),
        (e) => e.code === 'READ_EXTRACT_FAILED' && /too large to convert \(52428801 bytes; the limit is 52428800\)/u.test(e.message))
})

/* ── La porta vera: l'attrezzo `leggi` del kernel, come lo usa il modello ──────────────────────────────────────────────── */
async function giro(cartella, chiamate) {
    const esiti = []
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: chiamate.length + 2, livelloAccesso: 'accesso-pieno',
        fetchDiRete: async () => {
            const c = chiamate[n++]
            const message = c ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] } : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))) },
    })
    return esiti
}

test('F001-07 (porta vera): leggi dà il testo con l\'intestazione, pagina per righe, e il formato hex resta sui byte veri', async (t) => {
    const c = cartellaDiProva(t)
    writeFileSync(join(c, 'relazione.docx'), await docxVero(Array.from({ length: 30 }, (_, i) => `paragrafo ${i + 1}`)))
    writeFileSync(join(c, 'scansione.pdf'), await pdfVero([['Pagina uno con del testo'], [], [], ['Pagina quattro con testo']]))
    const [tutto, pagina, hex, pdf] = await giro(c, [
        ['leggi', { percorso: 'relazione.docx' }], ['leggi', { percorso: 'relazione.docx', offset: 10, limit: 3 }],
        ['leggi', { percorso: 'relazione.docx', format: 'hex', limit: 4 }], ['leggi', { percorso: 'scansione.pdf' }],
    ])
    assert.match(tutto, /^\[TALOS extracted text: "relazione\.docx" is a DOCX document, \d+ bytes on disk\. Below is its text, not its bytes/u)
    assert.match(tutto, /paragrafo 1\n[\s\S]*paragrafo 30\n?$/u)
    assert.match(pagina, /lines 10-12 of 30 in "relazione\.docx"; continue with leggi offset=13/u)
    assert.match(pagina, /paragrafo 10\nparagrafo 11\nparagrafo 12/u)
    assert.match(hex, /TALOS HEX byte inspection/u)
    assert.match(hex, /50 ?4b ?03 ?04/iu, 'i byte veri: la firma di uno zip')
    assert.match(pdf, /\n\[EXTRACTION COVERAGE WARNING: 2 of 4 pages/u)
    for (const e of [tutto, pagina, pdf]) assert.doesNotMatch(e, /is a binary file/u, 'prima diceva solo «binary file: its content was not read»')
})

test('F001-08 (porta vera): un falso .docx di testo si legge come testo e dice perché; uno troppo grande non si converte', async (t) => {
    const c = cartellaDiProva(t)
    writeFileSync(join(c, 'finto.docx'), 'sono solo testo\n')
    writeFileSync(join(c, 'enorme.pdf'), '%PDF-1.7\n'); truncateSync(join(c, 'enorme.pdf'), 50 * 1024 * 1024 + 1)
    const [finto, enorme] = await giro(c, [['leggi', { percorso: 'finto.docx' }], ['leggi', { percorso: 'enorme.pdf' }]])
    assert.match(finto, /^\[TALOS could not extract the text of "finto\.docx" as a DOCX document: not a valid DOCX file.*Below is what a plain read gives\.\]\nsono solo testo/su)
    assert.match(enorme, /could not extract the text of "enorme\.pdf" as a PDF document: the document is too large to convert \(52428801 bytes; the limit is 52428800\)/u)
})

test('F001-09 (porta vera): leggere il TESTO di un docx non autorizza a sovrascriverlo con testo; un .txt letto sì', async (t) => {
    const c = cartellaDiProva(t)
    const docx = await docxVero(['contenuto vero'])
    writeFileSync(join(c, 'contratto.docx'), docx)
    writeFileSync(join(c, 'nota.txt'), 'vecchia\n')
    const [, rifiuto] = await giro(c, [
        ['leggi', { percorso: 'contratto.docx' }], ['scrivi', { percorso: 'contratto.docx', contenuto: 'contenuto vero' }],
        ['leggi', { percorso: 'nota.txt' }], ['scrivi', { percorso: 'nota.txt', contenuto: 'nuova\n' }],
    ])
    // il motivo VERO (la guardia dei documenti, tests/rev-scrittura-su-binari.test.mjs), non «è cambiato dopo che l'hai letto»
    assert.match(rifiuto, /^REFUSED\. "contratto\.docx" is a DOCX document: a plain-text write can never produce a valid DOCX file/u)
    assert.deepEqual(readFileSync(join(c, 'contratto.docx')), docx, 'il documento non è stato toccato')
    assert.equal(readFileSync(join(c, 'nota.txt'), 'utf8'), 'nuova\n', 'controllo del verso: un file di testo letto per intero si sovrascrive')
})
