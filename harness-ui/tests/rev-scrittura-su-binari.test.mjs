/*
 * ⛔⛔ F-001, owner 02/10/2026 «Tutta la guardia di Hermes» — `scrivi` e `file_edit` non mettono testo su un documento o su un
 *   binario. Fonte: Hermes `tools/file_tools_write_guards.py:469-533` e `tools/binary_extensions.py` (65ad529). Il modulo è
 *   `src/kernel/guardia-scrittura-binari.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    ESTENSIONI_BINARIE, DOCUMENTI_OPACHI, eLateraleSqlite, haEstensioneBinaria, eDocumentoOpaco, ePdf, serveLoStatoDelBersaglio,
    motivoPerNonScrivereTesto,
} from '../src/kernel/guardia-scrittura-binari.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const richiedi = createRequire(import.meta.url)
const cartellaDiProva = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-binari-')); t.after(() => rimuoviCartellaDiProva(c)); return c }

test('BINARI-01: le liste sono quelle di Hermes, una per una', () => {
    // copiate da tools/binary_extensions.py:7-30 (65ad529): una voce in più o in meno è una deviazione da dichiarare
    assert.equal(ESTENSIONI_BINARIE.size, 93)
    assert.equal(DOCUMENTI_OPACHI.size, 19)
    for (const e of ['.png', '.z', '.lockb', '.data', '.idx', '.sqlite3', '.docx', '.odp', '.wasm', '.max']) assert.ok(ESTENSIONI_BINARIE.has(e), e)
    for (const e of ['.pdf', '.svg', '.txt', '.json', '.md', '.csv', '.html']) assert.equal(ESTENSIONI_BINARIE.has(e), false, e)
    for (const e of ['.docm', '.xlsb', '.pps', '.pot', '.ppsm', '.rtf', '.epub']) assert.ok(DOCUMENTI_OPACHI.has(e), e)
    assert.equal(DOCUMENTI_OPACHI.has('.pdf'), false, 'il PDF manca apposta: la sua sintassi si scrive a mano')
})

test('BINARI-02: estensioni — maiuscole, file laterali di SQLite, punti in coda su Windows', () => {
    assert.ok(eDocumentoOpaco('Relazione.DOCX'))
    assert.ok(ePdf('a/b/Scansione.PDF'))
    assert.ok(haEstensioneBinaria('foto.JPeG'))
    for (const p of ['dati.db-wal', 'dati.sqlite3-shm', 'dati.sqlite-journal', 'DATI.DB-WAL']) { assert.ok(eLateraleSqlite(p), p); assert.ok(haEstensioneBinaria(p), p) }
    for (const p of ['relazione.docx-wal', 'note.txt-journal', 'db-wal', 'x.dbwal']) assert.equal(eLateraleSqlite(p), false, p)
    assert.equal(eDocumentoOpaco('relazione.docx-wal'), false, '`x.docx-wal` non è un documento')
    assert.equal(haEstensioneBinaria('cartella.zip/leggimi'), false, 'il suffisso dall’ultimo punto: «.zip/leggimi» non è un’estensione')
    // Win32 toglie punti e spazi in coda scrivendo: `x.docx.` finisce su `x.docx`
    for (const p of ['relazione.docx.', 'relazione.docx ', 'relazione.docx. .']) {
        assert.ok(eDocumentoOpaco(p, { windows: true }), p)
        assert.equal(eDocumentoOpaco(p), false, `${p}: fuori da Windows il nome è un altro`)
    }
    assert.equal(serveLoStatoDelBersaglio('a.docx'), false, 'un opaco si rifiuta comunque')
    assert.equal(serveLoStatoDelBersaglio('a.db-wal'), false, 'un laterale si rifiuta comunque')
    assert.ok(serveLoStatoDelBersaglio('a.pdf'))
    assert.ok(serveLoStatoDelBersaglio('a.png'))
    assert.equal(serveLoStatoDelBersaglio('a.txt'), false)
})

test('BINARI-03: chi si rifiuta, quando, e con quale frase', () => {
    for (const stato of ['esiste', 'assente', 'ignoto', null]) {
        assert.match(motivoPerNonScrivereTesto('a.docx', { stato }), /^REFUSED\. "a\.docx" is a DOCX document: a plain-text write can never produce a valid DOCX file/u, `opaco, ${stato}`)
        assert.match(motivoPerNonScrivereTesto('a.db-wal', { stato }), /^REFUSED\. "a\.db-wal" is a SQLite -wal file: it holds raw database pages/u, `laterale, ${stato}`)
        assert.equal(motivoPerNonScrivereTesto('a.txt', { stato }), null, `testo, ${stato}`)
    }
    assert.match(motivoPerNonScrivereTesto('a.docx'), /EXTRACTED text, not its bytes\)\. Nothing was written\. To create or change this document, use a library through shell/u)
    assert.match(motivoPerNonScrivereTesto('a.docx', { documentCreate: true }), /To make a new DOCX, use document_create; to change this document, use a library through shell/u)
    assert.doesNotMatch(motivoPerNonScrivereTesto('a.odt', { documentCreate: true }), /document_create/u, 'document_create non fa ODT: non si suggerisce')
    assert.match(motivoPerNonScrivereTesto('s.pdf', { stato: 'esiste' }), /^REFUSED\. "s\.pdf" is an existing PDF: what leggi shows you of it is its EXTRACTED text/u)
    assert.match(motivoPerNonScrivereTesto('s.pdf', { stato: 'esiste', documentCreate: true }), /or make a new PDF with document_create\. \(Writing a NEW \.pdf file is allowed\.\)$/u)
    assert.equal(motivoPerNonScrivereTesto('s.pdf', { stato: 'assente' }), null, 'un PDF NUOVO si scrive: la sintassi PDF è testo')
    assert.match(motivoPerNonScrivereTesto('f.png', { stato: 'esiste' }), /^REFUSED\. "f\.png" is an existing binary file \(\.png\): leggi does not show you its real content/u)
    assert.equal(motivoPerNonScrivereTesto('f.png', { stato: 'assente' }), null)
    for (const p of ['s.pdf', 'f.png']) {
        assert.match(motivoPerNonScrivereTesto(p, { stato: 'ignoto' }), /^REFUSED\. Could not establish whether/u, `${p}: chiuso, non aperto`)
        assert.match(motivoPerNonScrivereTesto(p), /^REFUSED\. Could not establish whether/u, `${p}: senza stato si rifiuta`)
    }
    assert.match(motivoPerNonScrivereTesto('C:/x/a.docx', { mostrato: '/mnt/c/x/a.docx' }), /^REFUSED\. "\/mnt\/c\/x\/a\.docx" is a DOCX/u, 'si mostra il percorso del modello')
})

/* ── La porta vera ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function giro(cartella, chiamate, opzioni = {}) {
    const esiti = []
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: chiamate.length + 2, livelloAccesso: 'accesso-pieno',
        fetchDiRete: async () => {
            const c = chiamate[n++]
            const message = c ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] } : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
        ...opzioni,
    })
    return esiti
}
async function docxVero(testo) {
    const { Document, Packer, Paragraph, TextRun } = richiedi('docx')
    return Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(testo)] })] }] }))
}

test('BINARI-04 (porta vera): un docx letto non si riscrive né si accoda né si modifica; uno nuovo non si crea come testo', async (t) => {
    const c = cartellaDiProva(t)
    const docx = await docxVero('contenuto vero')
    writeFileSync(join(c, 'contratto.docx'), docx)
    const [, sostituisci, accoda, modifica, nuovo] = await giro(c, [
        ['leggi', { percorso: 'contratto.docx' }],
        ['scrivi', { percorso: 'contratto.docx', contenuto: 'contenuto nuovo' }],
        ['scrivi', { percorso: 'contratto.docx', contenuto: 'in coda', mode: 'append' }],
        ['file_edit', { percorso: 'contratto.docx', old_string: 'contenuto vero', new_string: 'contenuto nuovo' }],
        ['scrivi', { percorso: 'nuovo.docx', contenuto: 'testo' }],
    ])
    for (const [esito, nome] of [[sostituisci, 'contratto.docx'], [accoda, 'contratto.docx'], [modifica, 'contratto.docx'], [nuovo, 'nuovo.docx']]) {
        assert.match(esito, new RegExp(`^REFUSED\\. "${nome.replace('.', '\\.')}" is a DOCX document`, 'u'), esito)
    }
    assert.doesNotMatch(sostituisci, /changed after you last read it/u, 'prima il motivo era FALSO')
    assert.doesNotMatch(modifica, /UTF-8/u, 'non il rifiuto di F4-01: il modello riproverebbe in un altro modo')
    assert.deepEqual(readFileSync(join(c, 'contratto.docx')), docx, 'il documento è intatto')
    assert.equal(existsSync(join(c, 'nuovo.docx')), false, 'un testo non diventa un docx')
})

test('BINARI-05 (porta vera): PDF e binari solo se ESISTONO; un laterale di SQLite mai; il testo e i file nuovi passano', async (t) => {
    const c = cartellaDiProva(t)
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    writeFileSync(join(c, 'foto.png'), png)
    writeFileSync(join(c, 'scansione.pdf'), '%PDF-1.4\n%%EOF\n')
    const [pngVecchio, pdfVecchio, laterale, pdfNuovo, datNuovo, testo] = await giro(c, [
        ['scrivi', { percorso: 'foto.png', contenuto: 'x' }],
        ['scrivi', { percorso: 'scansione.pdf', contenuto: '%PDF-1.4\n' }],
        ['scrivi', { percorso: 'archivio.db-wal', contenuto: 'x' }],
        ['scrivi', { percorso: 'nuovo.pdf', contenuto: '%PDF-1.4\n%%EOF\n' }],
        ['scrivi', { percorso: 'misure.dat', contenuto: '1 2 3\n' }],
        ['scrivi', { percorso: 'note.txt', contenuto: 'ciao\n' }],
    ])
    assert.match(pngVecchio, /^REFUSED\. "foto\.png" is an existing binary file \(\.png\)/u)
    assert.match(pdfVecchio, /^REFUSED\. "scansione\.pdf" is an existing PDF/u)
    assert.match(laterale, /^REFUSED\. "archivio\.db-wal" is a SQLite -wal file/u)
    assert.deepEqual(readFileSync(join(c, 'foto.png')), png)
    assert.equal(readFileSync(join(c, 'scansione.pdf'), 'utf8'), '%PDF-1.4\n%%EOF\n')
    assert.equal(existsSync(join(c, 'archivio.db-wal')), false)
    // il verso contrario: ciò che la guardia NON deve fermare
    for (const e of [pdfNuovo, datNuovo, testo]) assert.doesNotMatch(e, /REFUSED/u, e)
    assert.equal(readFileSync(join(c, 'nuovo.pdf'), 'utf8'), '%PDF-1.4\n%%EOF\n')
    assert.equal(readFileSync(join(c, 'misure.dat'), 'utf8'), '1 2 3\n')
    assert.equal(readFileSync(join(c, 'note.txt'), 'utf8'), 'ciao\n')
})

test('BINARI-06 (porta vera): document_create si suggerisce solo quando è offerto', async (t) => {
    const c = cartellaDiProva(t)
    const [con] = await giro(c, [['scrivi', { percorso: 'r.docx', contenuto: 'x' }]], { strumentiEstesi: ['document_create'], onDocumento: async () => ({ ok: false, esito: 'no' }) })
    const [senza] = await giro(c, [['scrivi', { percorso: 'r.docx', contenuto: 'x' }]])
    assert.match(con, /To make a new DOCX, use document_create/u)
    assert.doesNotMatch(senza, /document_create/u)
})

/* La casa Linux che non risponde: WSL vero serve solo a far scegliere al giro la casa Linux; la casa è finta e non risponde. */
const wsl = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'echo ok'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null
test('BINARI-07 (casa Linux che non risponde): se non si sa se un binario esiste, si rifiuta — chiuso, non aperto', { skip: wsl?.status === 0 ? false : 'WSL non disponibile' }, async (t) => {
    const c = cartellaDiProva(t)
    const chiamate = []
    const sessione = { prendi: () => ({ chiama: async (op) => { chiamate.push(op); throw Object.assign(new Error('casa giù'), { code: 'CASA_GIU' }) } }), chiudi() {} }
    const [esito] = await giro(c, [['scrivi', { percorso: 'foto.png', contenuto: 'x' }]],
        { casaLinuxSessione: sessione, ambienteComandiFn: async () => ({ dove: null, revisione: 0 }) })
    assert.ok(chiamate.includes('istantanea'), `la domanda va alla casa che scriverebbe: ${chiamate}`)
    assert.match(esito, /^REFUSED\. Could not establish whether "foto\.png" already exists where this write would run/u, esito)
    assert.equal(existsSync(join(c, 'foto.png')), false)
})
