/*
 * C25 (owner 10/10/2026, coda Codex: «Edit/append — byte intatti, limite dimensione e lettura prima di sovrascrivere»; audit
 *   A-OVERWRITE-GAP e A-APPEND-SIZE-BOUND, «rischi statici da riprodurre»). Qui si riproducono, sul kernel vero e su
 *   `creaFileWorkspace`:
 *   1. `scrivi` sostituisce un file CAMBIATO mentre la carta di permesso aspettava la persona (`file_edit` lo rifiuta da UTF8-07,
 *      revisione Codex 01/10 rilievo 4: i due attrezzi fratelli non avevano la stessa guardia);
 *   2. leggere la sola FINE di una riga lunga accorciata la conta vista tutta, e autorizza a sostituire il suo centro mai visto;
 *   3. una modifica esterna che conserva mtime e dimensione non si vede (Hermes tiene lo sha256 dei byte:
 *      `tools/file_tools_read_tracking.py:257-276`, «A byte snapshot, not just mtime (editors/copy tools can preserve that)»);
 *   4. `document_create` in aggiunta controlla il tetto PRIMA del separatore `\n` e lo supera di un byte.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, utimesSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { creaFileWorkspace, DIMENSIONE_MASSIMA_CREAZIONE } from '../src/workspace-files.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-c25-'))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}

/* Un fornitore che fa UNA chiamata di attrezzo per richiesta, nell'ordine dato, poi chiude. `prima(i)` gira prima della richiesta i. */
function fornitore(chiamate, { prima = () => {} } = {}) {
    let n = 0
    return async () => {
        prima(n)
        const c = chiamate[n]
        n++
        const message = c
            ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
            : { role: 'assistant', content: 'fatto' }
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    }
}

async function giro(dir, chiamate, { prima, ...extra } = {}) {
    const esiti = []
    const ricevute = []
    await talosLavora({ cartella: dir, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', livelloAccesso: 'accesso-pieno',
        permessiPerAttrezzo: { scrivi: 'sempre', file_edit: 'sempre' }, strumentiEstesi: ['file_edit'], giriMassimi: chiamate.length + 2,
        fetchDiRete: fornitore(chiamate, { prima }),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)); if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        ...extra })
    return { esiti, ricevute }
}

test('C25-01 ATTESA: a file that changes while the approval card waits is not replaced; its new bytes stay (like file_edit, UTF8-07)', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'CONTENUTO_ORIGINALE\n')
    const { esiti, ricevute } = await giro(dir, [['leggi', { percorso: 'a.txt' }], ['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]], {
        livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'chiedi' },
        chiediApprovazioneFn: async () => { writeFileSync(p, 'SCRITTO DALLA PERSONA MENTRE DECIDEVA\n'); return true },
    })
    assert.equal(readFileSync(p, 'utf8'), 'SCRITTO DALLA PERSONA MENTRE DECIDEVA\n', 'the content written during the wait stays')
    assert.match(esiti[1], /^REFUSED\. Nothing was written: a\.txt changed while waiting for approval/)
    // `leggi` non firma ricevute: l'unica è quella di `scrivi`, come in UTF8-07 per `file_edit`
    assert.deepEqual(ricevute.map((r) => r.status), ['failed'], 'the signed receipt does not say «succeeded» for a write that did not happen')
})

test('C25-01b ATTESA, AL CONTRARIO: a file that did NOT change while the card waited is replaced as approved', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'CONTENUTO_ORIGINALE\n')
    const { esiti } = await giro(dir, [['leggi', { percorso: 'a.txt' }], ['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]], {
        livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'chiedi' }, chiediApprovazioneFn: async () => true,
    })
    assert.equal(readFileSync(p, 'utf8'), 'nuovo')
    assert.match(esiti[1], /^written: a\.txt/)
})

test('C25-01c ATTESA: a file CREATED by someone else while the card for a new file waited is not replaced', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'nuovo.txt')
    const { esiti } = await giro(dir, [['scrivi', { percorso: 'nuovo.txt', contenuto: 'del modello' }]], {
        livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'chiedi' },
        chiediApprovazioneFn: async () => { writeFileSync(p, 'creato da un altro mentre decidevi\n'); return true },
    })
    assert.equal(readFileSync(p, 'utf8'), 'creato da un altro mentre decidevi\n')
    assert.match(esiti[0], /^REFUSED\. Nothing was written: nuovo\.txt changed while waiting for approval/)
})

test('C25-02 RIGA LUNGA: reading only the END of a shortened line does not count as reading its middle', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'lungo.txt')
    const lunga = `${'a'.repeat(2500)}MEZZO_MAI_VISTO${'b'.repeat(2500)}`
    writeFileSync(p, `prima\n${lunga}\nultima\n`)
    const inizioRiga = Buffer.byteLength('prima\n')
    const fineRiga = inizioRiga + Buffer.byteLength(lunga)
    const { esiti } = await giro(dir, [
        ['leggi', { percorso: 'lungo.txt' }],
        ['leggi', { percorso: 'lungo.txt', byteOffset: fineRiga - 20 }], // salta dritto alla fine della riga
        ['scrivi', { percorso: 'lungo.txt', contenuto: 'sostituito' }],
    ])
    assert.doesNotMatch(esiti[0], /MEZZO_MAI_VISTO/, 'premise: the first read shows only the first 2000 characters of the long line')
    assert.doesNotMatch(esiti[1], /MEZZO_MAI_VISTO/, 'premise: the jump shows only the end of the line')
    assert.match(esiti[2], /^REFUSED\..*you have read only part of it/)
    assert.match(readFileSync(p, 'utf8'), /MEZZO_MAI_VISTO/, 'the unseen middle is still there')
})

test('C25-02b RIGA LUNGA, AL CONTRARIO: reading the line to its end from where the first page stopped does count', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'lungo.txt')
    const lunga = `${'a'.repeat(2500)}MEZZO${'b'.repeat(2500)}`
    writeFileSync(p, `prima\n${lunga}\nultima\n`)
    const primo = await giro(dir, [['leggi', { percorso: 'lungo.txt' }]])
    const offset = Number(/byteOffset[^0-9]*(\d+)/u.exec(primo.esiti[0])?.[1])
    assert.ok(Number.isSafeInteger(offset), `premise: the first page gives a byteOffset to continue (${primo.esiti[0].slice(-200)})`)
    const { esiti } = await giro(dir, [
        ['leggi', { percorso: 'lungo.txt' }],
        ['leggi', { percorso: 'lungo.txt', byteOffset: offset }],
        ['scrivi', { percorso: 'lungo.txt', contenuto: 'sostituito' }],
    ])
    assert.match(esiti[1], /MEZZO/)
    assert.match(esiti[2], /^written: lungo\.txt/)
})

test('C25-03 STESSA MTIME E DIMENSIONE: an outside change that keeps mtime and size is still a change (Hermes keeps the bytes\' sha256)', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'VERSIONE_UNO\n')
    const istante = new Date('2026-10-10T12:00:00.000Z')
    utimesSync(p, istante, istante)
    let premessa = null
    const { esiti } = await giro(dir, [['leggi', { percorso: 'a.txt' }], ['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]], {
        prima: (i) => {
            if (i !== 1) return
            writeFileSync(p, 'VERSIONE_DUE\n') // stessa lunghezza
            utimesSync(p, istante, istante) // e stessa mtime, come un editor o una copia che la conservano
            premessa = { size: statSync(p).size, mtimeMs: statSync(p).mtimeMs }
        },
    })
    assert.deepEqual(premessa, { size: Buffer.byteLength('VERSIONE_UNO\n'), mtimeMs: istante.getTime() }, 'premise: same size and same mtime')
    assert.match(esiti[1], /^REFUSED\..*it changed after you last read it/)
    assert.equal(readFileSync(p, 'utf8'), 'VERSIONE_DUE\n')
})

test('C25-04 TETTO: an append counts its newline separator against the size limit', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'log.txt'), 'abc') // senza a capo finale: l'aggiunta avrà il separatore
    const pezzo = 'x'.repeat(10)
    const scritti = []
    await assert.rejects(
        creaFileWorkspace({ cartella: dir, nome: 'log.txt', bytes: pezzo, modalita: 'accoda' }, {
            // il file «pesa» esattamente quanto manca al tetto per il solo pezzo: col separatore lo supera di un byte
            statFn: async () => ({ isFile: () => true, size: DIMENSIONE_MASSIMA_CREAZIONE - pezzo.length }),
            appendFileFn: async (_p, dati) => { scritti.push(dati) },
        }),
        (e) => e?.code === 'CONTENT_TOO_LARGE',
    )
    assert.deepEqual(scritti, [], 'nothing appended')
    // al contrario: con un byte di margine per il separatore passa
    const ok = await creaFileWorkspace({ cartella: dir, nome: 'log.txt', bytes: pezzo, modalita: 'accoda' }, {
        statFn: async () => ({ isFile: () => true, size: DIMENSIONE_MASSIMA_CREAZIONE - pezzo.length - 1 }),
        appendFileFn: async (_p, dati) => { scritti.push(dati) },
    })
    assert.equal(ok.byteTotali, DIMENSIONE_MASSIMA_CREAZIONE)
    assert.deepEqual(scritti, [`\n${pezzo}`])
})

/* Il registro puro: le due difese di C25-03 una per una, così ognuna ha la sua prova (sul disco vero cattura quella che arriva prima). */
import { creaRegistroLetture, registraLetturaRighe, registraLetturaDentroRiga, motivoPerNonSovrascrivere, serveImpronta, haImpronta, registraImpronta, registraScritturaPropria } from '../src/letture-prima-di-sovrascrivere.mjs'

const LETTO = { mtimeMs: 1000, size: 13, ctimeMs: 2000 }
function lettoPerIntero() {
    const r = creaRegistroLetture()
    registraLetturaRighe(r, 'k', { ...LETTO, primaRiga: 1, ultimaRiga: 1, righeTotali: 1 })
    return r
}

test('C25-REG-01 CTIME: same mtime and size, different change time ⇒ changed', () => {
    const r = lettoPerIntero()
    assert.equal(motivoPerNonSovrascrivere(r, 'k', LETTO), null)
    assert.equal(motivoPerNonSovrascrivere(r, 'k', { ...LETTO, ctimeMs: 2001 }), 'cambiato')
    // un chiamante vecchio senza ctime resta com'era
    assert.equal(motivoPerNonSovrascrivere(r, 'k', { mtimeMs: 1000, size: 13 }), null)
})

test('C25-REG-02 IMPRONTA: same mtime, size AND change time, different bytes ⇒ changed', () => {
    const r = lettoPerIntero()
    assert.equal(serveImpronta(r, 'k'), true, 'a file read in full asks for its fingerprint')
    registraImpronta(r, 'k', { ...LETTO, impronta: 'aaa' })
    assert.equal(haImpronta(r, 'k'), true)
    assert.equal(serveImpronta(r, 'k'), false, 'once')
    assert.equal(motivoPerNonSovrascrivere(r, 'k', { ...LETTO, impronta: 'aaa' }), null)
    assert.equal(motivoPerNonSovrascrivere(r, 'k', { ...LETTO, impronta: 'bbb' }), 'cambiato')
})

test('C25-REG-03 IMPRONTA presa su un file già cambiato non vale, e un file letto a metà non la chiede', () => {
    const r = lettoPerIntero()
    registraImpronta(r, 'k', { ...LETTO, ctimeMs: 9999, impronta: 'ccc' })
    assert.equal(haImpronta(r, 'k'), false, 'the disk had moved on: no fingerprint for the read version')
    const parziale = creaRegistroLetture()
    registraLetturaRighe(parziale, 'k', { ...LETTO, primaRiga: 1, ultimaRiga: 1, righeTotali: 5 })
    assert.equal(serveImpronta(parziale, 'k'), false)
})

test('C25-REG-04 SCRITTURA PROPRIA: the own write carries its fingerprint; an append keeps the file known', () => {
    const r = creaRegistroLetture()
    registraScritturaPropria(r, 'k', { ...LETTO, intera: true, impronta: 'ddd' })
    assert.equal(motivoPerNonSovrascrivere(r, 'k', { ...LETTO, impronta: 'ddd' }), null)
    registraScritturaPropria(r, 'k', { mtimeMs: 1100, size: 20, ctimeMs: 2100, intera: false, impronta: 'eee' })
    assert.equal(motivoPerNonSovrascrivere(r, 'k', { mtimeMs: 1100, size: 20, ctimeMs: 2100, impronta: 'eee' }), null)
    assert.equal(motivoPerNonSovrascrivere(r, 'k', { mtimeMs: 1100, size: 20, ctimeMs: 2100, impronta: 'fff' }), 'cambiato')
})

test('C25-REG-05 RIGA LUNGA: contiguous byte reads complete a shortened line; a jump does not', () => {
    const r = creaRegistroLetture()
    registraLetturaRighe(r, 'k', { ...LETTO, primaRiga: 1, ultimaRiga: 1, righeTotali: 1, righeAccorciate: [{ riga: 1, daByte: 2000 }] })
    registraLetturaDentroRiga(r, 'k', { ...LETTO, riga: 1, rigaFinita: true, daByte: 4000, aByte: 5000 })
    assert.equal(motivoPerNonSovrascrivere(r, 'k', LETTO), 'letto-in-parte', 'a jump to the end does not count')
    registraLetturaDentroRiga(r, 'k', { ...LETTO, riga: 1, rigaFinita: false, daByte: 2000, aByte: 3000 })
    assert.equal(motivoPerNonSovrascrivere(r, 'k', LETTO), 'letto-in-parte', 'half way')
    registraLetturaDentroRiga(r, 'k', { ...LETTO, riga: 1, rigaFinita: true, daByte: 3000, aByte: 5000 })
    assert.equal(motivoPerNonSovrascrivere(r, 'k', LETTO), null, 'contiguous to the end')
})

/* Il caso «stesso istante» sul KERNEL: qui il ctime cambia a scatti di ~0,5 ms (misurato il 10/10), troppo fini perché un giro lo
   riproduca. Il registro della sessione è iniettabile (come in rev-overwrite-guard): si semina la voce della versione LETTA, con
   mtime, dimensione e ctime uguali al disco ma byte diversi — esattamente ciò che uno stesso istante lascia. */
import { createHash } from 'node:crypto'

test('C25-05 IMPRONTA NEL KERNEL: same mtime, size and change time but different bytes ⇒ scrivi refuses', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'VERSIONE_DUE\n')
    const s = statSync(p)
    const chiave = process.platform === 'win32' ? p.toLowerCase() : p
    const registroLetture = creaRegistroLetture()
    registraLetturaRighe(registroLetture, chiave, { mtimeMs: s.mtimeMs, size: s.size, ctimeMs: s.ctimeMs, primaRiga: 1, ultimaRiga: 1, righeTotali: 1 })
    registraImpronta(registroLetture, chiave, { mtimeMs: s.mtimeMs, size: s.size, ctimeMs: s.ctimeMs,
        impronta: createHash('sha256').update('VERSIONE_UNO\n').digest('hex') }) // la versione che il modello aveva letto
    const { esiti } = await giro(dir, [['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]], { registroLetture })
    assert.match(esiti[0], /^REFUSED\..*it changed after you last read it/)
    assert.equal(readFileSync(p, 'utf8'), 'VERSIONE_DUE\n')
})

test('C25-06 IMPRONTA ALLA LETTURA: reading a file in full stores the sha256 of its bytes', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'riga uno\nriga due\n')
    const registroLetture = creaRegistroLetture()
    await giro(dir, [['leggi', { percorso: 'a.txt' }]], { registroLetture })
    const chiave = process.platform === 'win32' ? p.toLowerCase() : p
    assert.equal(registroLetture.get(chiave)?.impronta, createHash('sha256').update(readFileSync(p)).digest('hex'))
})

/* Review YELLOW del desktop su 22111e946: i due mutanti vivi (R1 il confine del salto, R2 «le aggiunte passano») e la nota sui byte. */
test('C25-01d ATTESA, AGGIUNTA: an append still goes through when the file changed while the card waited (it replaces nothing)', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'log.txt')
    writeFileSync(p, 'riga 1\n')
    const { esiti } = await giro(dir, [['scrivi', { percorso: 'log.txt', contenuto: 'riga 2', mode: 'append' }]], {
        livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'chiedi' },
        chiediApprovazioneFn: async () => { writeFileSync(p, 'CAMBIATO\n'); return true },
    })
    assert.match(esiti[0], /^appended to: log\.txt/)
    assert.equal(readFileSync(p, 'utf8'), 'CAMBIATO\nriga 2', 'the outside change stays, and the piece is added after it')
})

test('C25-01e ATTESA, BYTE: two invalid-byte variants that decode to the same text are still a change', async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'a.txt')
    const prima = Buffer.from([0x78, 0x92, 0x79, 0x0a]) // «x?y» in Windows-1252, non UTF-8
    const dopo = Buffer.from([0x78, 0x93, 0x79, 0x0a]) // un altro byte non valido: decodificati sono uguali («x�y»)
    assert.equal(new TextDecoder().decode(prima), new TextDecoder().decode(dopo), 'premise: the decoded text is identical')
    writeFileSync(p, prima)
    const { esiti } = await giro(dir, [['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]], {
        livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'chiedi' },
        registroLetture: (() => { // il modello l'ha «letto per intero»: la guardia di prima della carta passa
            const r = creaRegistroLetture()
            const s = statSync(p)
            registraLetturaRighe(r, process.platform === 'win32' ? p.toLowerCase() : p, { mtimeMs: s.mtimeMs, size: s.size, ctimeMs: s.ctimeMs, primaRiga: 1, ultimaRiga: 1, righeTotali: 1 })
            return r
        })(),
        chiediApprovazioneFn: async () => { writeFileSync(p, dopo); return true },
    })
    assert.match(esiti[0], /^REFUSED\. Nothing was written: a\.txt changed while waiting for approval/)
    assert.deepEqual(readFileSync(p), dopo)
})

test('C25-REG-05b RIGA LUNGA, IL CONFINE: a read starting exactly where the unseen part starts continues; one byte later is a jump', () => {
    const conLettura = (daByte) => {
        const r = creaRegistroLetture()
        registraLetturaRighe(r, 'k', { ...LETTO, primaRiga: 1, ultimaRiga: 1, righeTotali: 1, righeAccorciate: [{ riga: 1, daByte: 2000 }] })
        registraLetturaDentroRiga(r, 'k', { ...LETTO, riga: 1, rigaFinita: true, daByte, aByte: 5000 })
        return motivoPerNonSovrascrivere(r, 'k', LETTO)
    }
    assert.equal(conLettura(2000), null, 'exactly from the unseen part: the line is complete')
    assert.equal(conLettura(1999), null, 'from one byte before: overlapping is fine')
    assert.equal(conLettura(2001), 'letto-in-parte', 'one byte after: byte 2000 was never seen')
})

/* Review del desktop su 07598d97e (nota): se l'impronta non si calcola né prima né dopo la carta (file illeggibile, o una casa Linux
   con un servente senza `impronta`) era `null === null` e il controllo dopo il sì passava in silenzio. Il file esiste e i suoi byte
   non si possono verificare ⇒ rifiuto. Si riproduce con un'ACL di Windows che nega la LETTURA DEI DATI e lascia `stat` e la
   scrittura (misurato il 10/10: stat ok, lettura EPERM, scrittura ok); il registro è seminato come «letto per intero». */
import { spawnSync } from 'node:child_process'
test('C25-08 NON VERIFICABILE: an existing file whose bytes cannot be read before nor after the card is not replaced', { skip: process.platform !== 'win32' }, async (t) => {
    const dir = cartella(t)
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'VERSIONE_UNO\n')
    assert.equal(spawnSync('icacls', [p, '/deny', '*S-1-1-0:(RD)']).status, 0, 'premise: data reading denied')
    t.after(() => spawnSync('icacls', [p, '/remove:d', '*S-1-1-0']))
    // l'istantanea DOPO l'ACL: cambiarla aggiorna il ctime, e la guardia di prima della carta lo vedrebbe (giustamente) come un cambio
    const s = statSync(p)
    const registroLetture = creaRegistroLetture()
    registraLetturaRighe(registroLetture, p.toLowerCase(), { mtimeMs: s.mtimeMs, size: s.size, ctimeMs: s.ctimeMs, primaRiga: 1, ultimaRiga: 1, righeTotali: 1 })
    const { esiti } = await giro(dir, [['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]], {
        livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'chiedi' }, registroLetture,
        chiediApprovazioneFn: async () => { writeFileSync(p, 'VERSIONE_DUE\n'); return true },
    })
    spawnSync('icacls', [p, '/remove:d', '*S-1-1-0'])
    assert.match(esiti[0], /^REFUSED\. Nothing was written: a\.txt could not be verified after the approval/)
    assert.equal(readFileSync(p, 'utf8'), 'VERSIONE_DUE\n', 'what was written during the card stays')
})
