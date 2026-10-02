/*
 * ⛔⛔ F-001 (owner 01/10/2026: «come Hermes, `leggi` estrae il testo di docx/xlsx/pptx/pdf»; 02/10: «PDF.js anche nel server»,
 *   «docx, xlsx, pptx, pdf, limiti di Hermes», pacchetto sfoltito a ~5 MB). Prima il modello riceveva di un allegato Office o PDF
 *   solo il percorso e «binary file: its content was not read».
 *
 * Riferimento: Hermes `tools/read_extract.py` (`65ad529`/`4e74031`):
 *   · docx `:474-487` — paragrafi `w:p`, testo `w:t`, `w:tab` → tabulazione, `w:br`/`w:cr` → a capo, guide fonetiche `w:rt` escluse;
 *   · xlsx `:497-560` — solo fogli visibili, `# ── Sheet: <nome> ──`, celle separate da tabulazione, righe vuote finali tolte,
 *     al più 5.000 righe e 256 colonne per foglio;
 *   · pdf `:245-321` — avviso di copertura in TESTA quando molte pagine non danno testo (scansioni), con la mappa dei buchi;
 *   · 50 MB al massimo; un documento senza testo è un errore DICHIARATO, mai un vuoto muto.
 * Da noi: docx e pptx con `jszip` + una lettura a gettoni dell'XML (niente parser nuovo); xlsx con SheetJS 0.20.3 (oltre le
 *   correzioni dei CVE di lettura 0.19.3 e 0.20.2); pdf con `pdfjs-dist` 6.3.289 build legacy (la stessa del lettore F5),
 *   caricato solo quando serve, senza eval e senza font di sistema. Il testo estratto passa poi dalla STESSA paginazione a
 *   righe di `leggi` (talosHarness.mjs, `leggiTestoLimitato`).
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const FORMATI_ESTRAIBILI = Object.freeze(['docx', 'xlsx', 'pptx', 'pdf'])
export const MAX_BYTE_DOCUMENTO = 50 * 1024 * 1024
export const MAX_RIGHE_FOGLIO = 5_000
export const MAX_COLONNE_FOGLIO = 256
/* Le soglie dell'avviso di copertura dei PDF, quelle di Hermes (`read_extract.py:245-250`). */
const PAGINA_VUOTA_SOTTO = 20
const COPERTURA_MIN_VUOTE = 2, COPERTURA_MIN_QUOTA = 0.2, COPERTURA_VUOTE_ASSOLUTE = 10
const MAX_BUCHI_ELENCATI = 20, CONTESTO_DEL_BUCO = 60

export class ErroreEstrazione extends Error {
    constructor(messaggio) { super(messaggio); this.name = 'ErroreEstrazione'; this.code = 'READ_EXTRACT_FAILED' }
}

/** Il formato estraibile di un percorso (dall'estensione), o `null`. */
export function formatoEstraibile(percorso) {
    const estensione = /\.([A-Za-z0-9]{1,8})$/u.exec(String(percorso ?? ''))?.[1]?.toLowerCase()
    return FORMATI_ESTRAIBILI.includes(estensione) ? estensione : null
}

const richiedi = createRequire(import.meta.url)

/* ── XML a gettoni: abbastanza per WordprocessingML e DrawingML, senza un parser in più ──────────────────────────────── */
const GETTONE = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s[^>]*?)?)(\/?)>|([^<]+)/gu
function* gettoniXml(xml) {
    for (const m of String(xml).matchAll(GETTONE)) {
        if (m[1] !== undefined) { yield { tipo: 'testo', testo: m[1] }; continue }
        if (m[6] !== undefined) { yield { tipo: 'testo', testo: decodificaEntita(m[6]) }; continue }
        if (m[3] === undefined) continue // dichiarazioni e commenti
        const locale = m[3].includes(':') ? m[3].slice(m[3].indexOf(':') + 1) : m[3]
        yield { tipo: m[2] ? 'chiudi' : (m[5] ? 'vuoto' : 'apri'), locale, attributi: m[4] ?? '' }
    }
}
function decodificaEntita(testo) {
    return testo.replace(/&(#x[0-9A-Fa-f]+|#\d+|lt|gt|amp|quot|apos);/gu, (_, e) => {
        if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&'; if (e === 'quot') return '"'; if (e === "apos") return "'"
        const n = e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10)
        return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
    })
}
/* Il nome si cerca ESATTO, prefisso compreso: in `<p:sldId id="256" r:id="rId2"/>` `id` e `r:id` sono due attributi diversi. */
const attributo = (attributi, nome) => new RegExp(`(?:^|\\s)${nome.replace(/\./gu, '\\.')}\\s*=\\s*"([^"]*)"`, 'u').exec(attributi)?.[1] ?? null

async function apriZip(dati, formato) {
    const JSZip = richiedi('jszip')
    try { return await JSZip.loadAsync(dati) } catch (e) { throw new ErroreEstrazione(`not a valid ${formato.toUpperCase()} file (${e?.message ?? e})`) }
}
async function parteDelZip(zip, nome, { facoltativa = false } = {}) {
    const voce = zip.file(nome)
    if (!voce) { if (facoltativa) return null; throw new ErroreEstrazione(`the package has no ${nome}`) }
    return voce.async('string')
}
/* Righe pulite: niente NUL (la paginazione di `leggi` li prende per un binario), a capo uniformi. */
function unite(righe, senzaTesto) {
    if (!righe.some((r) => r.trim())) throw new ErroreEstrazione(senzaTesto)
    return righe.join('\n').replace(/\0/gu, '').replace(/\r\n?/gu, '\n').replace(/\n+$/u, '') + '\n'
}

/* ── docx ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** I paragrafi di un XML Wordprocessing/DrawingML: `p` apre un paragrafo (anche annidato, come nelle caselle di testo: ognuno
 *  esce per conto suo, senza doppioni), `t` è testo, `tab`/`br`/`cr` diventano tabulazione e a capo, `rt` (guida fonetica) no. */
function paragrafiXml(xml, { tabulazione = true } = {}) {
    const righe = [], pila = []
    let dentroTesto = 0, guida = 0
    for (const g of gettoniXml(xml)) {
        if (g.tipo === 'apri') {
            if (g.locale === 'p') pila.push('')
            else if (g.locale === 'rt') guida++
            else if (g.locale === 't') dentroTesto++
        } else if (g.tipo === 'vuoto') {
            if (!pila.length || guida) continue
            if (g.locale === 'tab' && tabulazione) pila[pila.length - 1] += '\t'
            else if (g.locale === 'br' || g.locale === 'cr') pila[pila.length - 1] += '\n'
        } else if (g.tipo === 'chiudi') {
            if (g.locale === 'p' && pila.length) righe.push(...pila.pop().split('\n'))
            else if (g.locale === 'rt') guida = Math.max(0, guida - 1)
            else if (g.locale === 't') dentroTesto = Math.max(0, dentroTesto - 1)
        } else if (dentroTesto && !guida && pila.length) pila[pila.length - 1] += g.testo
    }
    return righe
}
async function estraiDocx(dati) {
    const zip = await apriZip(dati, 'docx')
    return { testo: unite(paragrafiXml(await parteDelZip(zip, 'word/document.xml')), 'the DOCX file contains no extractable text') }
}

/* ── pptx ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function estraiPptx(dati) {
    const zip = await apriZip(dati, 'pptx')
    const presentazione = await parteDelZip(zip, 'ppt/presentation.xml')
    const relazioni = new Map()
    for (const g of gettoniXml(await parteDelZip(zip, 'ppt/_rels/presentation.xml.rels', { facoltativa: true }) ?? '')) {
        if ((g.tipo === 'vuoto' || g.tipo === 'apri') && g.locale === 'Relationship') relazioni.set(attributo(g.attributi, 'Id'), attributo(g.attributi, 'Target'))
    }
    // l'ordine delle diapositive è quello di `sldIdLst`, non quello dei nomi dei file
    const diapositive = []
    for (const g of gettoniXml(presentazione)) {
        if ((g.tipo === 'vuoto' || g.tipo === 'apri') && g.locale === 'sldId') {
            const bersaglio = relazioni.get(attributo(g.attributi, 'r:id'))
            if (bersaglio) diapositive.push(bersaglio.startsWith('/') ? bersaglio.slice(1) : `ppt/${bersaglio.replace(/^\.\//u, '')}`)
        }
    }
    const righe = []
    for (const [i, parte] of diapositive.entries()) {
        const xml = await parteDelZip(zip, parte, { facoltativa: true })
        if (xml === null) continue
        const nascosta = /<p:sld\b[^>]*\bshow\s*=\s*"0"/u.test(xml)
        righe.push(`# ── Slide ${i + 1}${nascosta ? ' (hidden)' : ''} ──`, ...paragrafiXml(xml, { tabulazione: false }).filter((r) => r.trim()), '')
    }
    const conTesto = righe.some((r) => r.trim() && !r.startsWith('# ── Slide'))
    return { testo: unite(conTesto ? righe : [], 'the PPTX file contains no extractable text') }
}

/* ── xlsx ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function estraiXlsx(dati) {
    const XLSX = richiedi('xlsx')
    let libro
    try {
        libro = XLSX.read(dati, { type: 'buffer', sheetRows: MAX_RIGHE_FOGLIO, cellFormula: false, cellHTML: false, cellStyles: false, cellDates: false })
    } catch (e) { throw new ErroreEstrazione(`not a valid XLSX file (${e?.message ?? e})`) }
    const righe = []
    for (const [i, nome] of (libro.SheetNames ?? []).entries()) {
        if ((libro.Workbook?.Sheets?.[i]?.Hidden ?? 0) !== 0) continue // 1 nascosto, 2 molto nascosto (come Hermes)
        const foglio = libro.Sheets[nome]
        const tabella = foglio ? XLSX.utils.sheet_to_json(foglio, { header: 1, raw: false, defval: '', blankrows: true }) : []
        const contenuto = tabella.map((riga) => (Array.isArray(riga) ? riga : []).slice(0, MAX_COLONNE_FOGLIO)
            .map((v) => String(v ?? '').replace(/\t/gu, '\\t').replace(/\r?\n/gu, '\\n')).join('\t').replace(/\t+$/u, ''))
        while (contenuto.length && !contenuto.at(-1).trim()) contenuto.pop()
        righe.push(`# ── Sheet: ${nome} ──`, ...(contenuto.length ? contenuto : ['(empty)']), '')
    }
    return { testo: unite(righe.some((r) => r && !r.startsWith('# ── Sheet:') && r !== '(empty)') ? righe : [], 'the XLSX file has no visible sheet with content') }
}

/* ── pdf ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
let pdfjs = null
async function caricaPdfjs() {
    if (pdfjs) return pdfjs
    const base = dirname(richiedi.resolve('pdfjs-dist/package.json'))
    const modulo = await import(pathToFileURL(join(base, 'legacy', 'build', 'pdf.min.mjs')).href)
    pdfjs = { getDocument: modulo.getDocument, cmaps: `${join(base, 'cmaps')}/`, font: `${join(base, 'standard_fonts')}/` }
    return pdfjs
}
/* L'avviso di copertura di Hermes: in testa, con i buchi e il testo che li precede, quando molte pagine non danno testo. */
export function avvisoDiCopertura(pagine) {
    if (pagine.length < 2) return ''
    const vuote = pagine.map((p, i) => (p.trim().length < PAGINA_VUOTA_SOTTO ? i + 1 : 0)).filter(Boolean)
    const abbastanza = vuote.length / pagine.length >= COPERTURA_MIN_QUOTA || vuote.length >= COPERTURA_VUOTE_ASSOLUTE
    if (vuote.length < COPERTURA_MIN_VUOTE || !abbastanza) return ''
    const tratti = []
    for (const n of vuote) { const ultimo = tratti.at(-1); if (ultimo && ultimo[1] === n - 1) ultimo[1] = n; else tratti.push([n, n]) }
    const righe = tratti.slice(0, MAX_BUCHI_ELENCATI).map(([a, b]) => {
        let prima = ''
        for (let p = a - 2; p >= 0; p--) if (pagine[p].trim().length >= PAGINA_VUOTA_SOTTO) { prima = ` — after "${pagine[p].split(/\s+/u).join(' ').trim().slice(0, CONTESTO_DEL_BUCO)}" (p${p + 1})`; break }
        const n = b - a + 1
        return `  ${a === b ? `page ${a}` : `pages ${a}-${b}`} (${n} page${n === 1 ? '' : 's'})${prima}`
    })
    if (tratti.length > MAX_BUCHI_ELENCATI) {
        const resto = tratti.slice(MAX_BUCHI_ELENCATI)
        righe.push(`  … ${resto.length} more gaps (${resto.reduce((s, [a, b]) => s + b - a + 1, 0)} pages)`)
    }
    return `EXTRACTION COVERAGE WARNING: ${vuote.length} of ${pagine.length} pages in this PDF yielded no text. Those pages are likely `
        + 'scanned images (or blank): their content is MISSING from the text below, even where section headers appear with empty '
        + `bodies. Gaps, each labeled with the last text before it:\n${righe.join('\n')}`
}
async function estraiPdf(dati, { segnale } = {}) {
    const { getDocument, cmaps, font } = await caricaPdfjs()
    const compito = getDocument({ data: new Uint8Array(dati), cMapUrl: cmaps, cMapPacked: true, standardFontDataUrl: font,
        isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 })
    try {
        let documento
        try { documento = await compito.promise }
        catch (e) {
            if (e?.name === 'PasswordException') throw new ErroreEstrazione('the PDF is protected by a password')
            throw new ErroreEstrazione(`not a valid PDF file (${e?.message ?? e})`)
        }
        const pagine = []
        for (let n = 1; n <= documento.numPages; n++) {
            segnale?.throwIfAborted()
            const pagina = await documento.getPage(n)
            const contenuto = await pagina.getTextContent()
            pagine.push(contenuto.items.map((v) => (typeof v.str === 'string' ? v.str : '') + (v.hasEOL ? '\n' : '')).join(''))
            pagina.cleanup()
        }
        const righe = pagine.flatMap((testo, i) => [`# ── Page ${i + 1} ──`, ...testo.split('\n'), ''])
        return { testo: unite(pagine.some((p) => p.trim()) ? righe : [], 'the PDF contains no extractable text (its pages are likely scanned images)'), avviso: avvisoDiCopertura(pagine) }
    } finally {
        await compito.destroy().catch(() => {})
    }
}

/**
 * Il testo di un documento. `dati` = i byte del file; `formato` da `formatoEstraibile`. Lancia `ErroreEstrazione` (codice
 * `READ_EXTRACT_FAILED`) quando il file è troppo grande, non è valido o non ha testo — la ragione si dice al modello.
 * @returns {Promise<{ testo: string, avviso: string }>}
 */
export async function estraiTestoDocumento(dati, formato, { segnale } = {}) {
    if (dati.length > MAX_BYTE_DOCUMENTO) {
        throw new ErroreEstrazione(`the document is too large to convert (${dati.length} bytes; the limit is ${MAX_BYTE_DOCUMENTO})`)
    }
    segnale?.throwIfAborted()
    const esito = formato === 'docx' ? await estraiDocx(dati)
        : formato === 'pptx' ? await estraiPptx(dati)
            : formato === 'xlsx' ? await estraiXlsx(dati)
                : formato === 'pdf' ? await estraiPdf(dati, { segnale })
                    : null
    if (!esito) throw new ErroreEstrazione(`unsupported document type: .${formato}`)
    return { testo: esito.testo, avviso: esito.avviso ?? '' }
}
