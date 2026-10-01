/*
 * T25/B09 (audit 29/09), decisione owner 30/09/2026 notte «Come Hermes e Claude Code»: `scrivi` rifiuta, PRIMA di toccare il
 * disco, di sostituire un file esistente che la sessione non ha letto per intero o che è cambiato dopo la lettura.
 * Hermes `tools/file_tools_write_guards.py:492-525` (`_stale_overwrite_blocker`); Claude Code Write («File has not been read
 * yet. Read it first before writing to it.»). Giri veri del kernel, fornitore finto che chiama gli attrezzi in sequenza.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { creaRegistroLetture } from '../src/letture-prima-di-sovrascrivere.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-sovrascrivi-'))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}

/* Un fornitore che fa UNA chiamata di attrezzo per richiesta, nell'ordine dato, poi chiude. `prima(i)` gira prima della
   richiesta i (per cambiare il file «da fuori» fra due attrezzi). */
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

async function giro(dir, chiamate, { registroLetture, prima } = {}) {
    const esiti = []
    await talosLavora({ cartella: dir, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', livelloAccesso: 'accesso-pieno',
        permessiPerAttrezzo: { scrivi: 'sempre', file_edit: 'sempre' }, strumentiEstesi: ['file_edit'], giriMassimi: chiamate.length + 2,
        fetchDiRete: fornitore(chiamate, { prima }), onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
        ...(registroLetture ? { registroLetture } : {}) })
    return esiti
}

test('OVERWRITE-01: un file esistente MAI letto non si sostituisce, e resta intatto', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'a.txt'), 'CONTENUTO_ORIGINALE\n')
    const [esito] = await giro(dir, [['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]])
    assert.match(esito, /^REFUSED\. "a\.txt" already exists \(20 bytes\) and you have not read it in this session/)
    assert.match(esito, /Nothing was written\. Read it with `leggi` first/)
    assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'CONTENUTO_ORIGINALE\n')
})

test('OVERWRITE-02: letto per intero, si sostituisce, e l esito dice che ha sostituito', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'a.txt'), 'CONTENUTO_ORIGINALE\n')
    const esiti = await giro(dir, [['leggi', { percorso: 'a.txt' }], ['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]])
    assert.equal(esiti[1], 'written: a.txt (replaced an existing file of 20 characters)')
    assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'nuovo')
})

test('OVERWRITE-03: cambiato dopo la lettura ⇒ rifiuto, e il cambiamento esterno resta', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'a.txt'), 'CONTENUTO_ORIGINALE\n')
    const esiti = await giro(dir, [['leggi', { percorso: 'a.txt' }], ['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]],
        { prima: (i) => { if (i === 1) writeFileSync(join(dir, 'a.txt'), 'CAMBIATO DA UN ALTRO PROCESSO\n') } })
    assert.match(esiti[1], /^REFUSED\..*it changed after you last read it/)
    assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'CAMBIATO DA UN ALTRO PROCESSO\n')
})

test('OVERWRITE-04: file nuovi, file vuoti e aggiunte passano senza lettura', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'vuoto.txt'), '')
    writeFileSync(join(dir, 'log.txt'), 'riga 1\n')
    const esiti = await giro(dir, [
        ['scrivi', { percorso: 'nuovo.txt', contenuto: 'x' }],
        ['scrivi', { percorso: 'vuoto.txt', contenuto: 'y' }],
        ['scrivi', { percorso: 'log.txt', contenuto: 'riga 2', mode: 'append' }],
    ])
    assert.equal(esiti[0], 'written: nuovo.txt')
    assert.equal(esiti[1], 'written: vuoto.txt')
    assert.match(esiti[2], /^appended to: log\.txt/)
    assert.equal(readFileSync(join(dir, 'log.txt'), 'utf8'), 'riga 1\nriga 2')
})

test('OVERWRITE-05: una sola pagina di un file lungo NON basta; tutte le pagine di fila sì', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'lungo.txt'), Array.from({ length: 30 }, (_, i) => `riga ${i + 1}`).join('\n') + '\n')
    const parziale = await giro(dir, [['leggi', { percorso: 'lungo.txt', offset: 1, limit: 10 }], ['scrivi', { percorso: 'lungo.txt', contenuto: 'x' }]])
    assert.match(parziale[1], /^REFUSED\..*you have read only part of it/)
    const intero = await giro(dir, [
        ['leggi', { percorso: 'lungo.txt', offset: 1, limit: 10 }],
        ['leggi', { percorso: 'lungo.txt', offset: 11, limit: 10 }],
        ['leggi', { percorso: 'lungo.txt', offset: 21, limit: 10 }],
        ['scrivi', { percorso: 'lungo.txt', contenuto: 'x' }],
    ])
    assert.match(intero[3], /^written: lungo\.txt \(replaced an existing file/)
})

test('OVERWRITE-06: un file scritto dal modello stesso si riscrive senza rileggerlo; la sua modifica mirata non lo rende «cambiato»', async (t) => {
    const dir = cartella(t)
    const esiti = await giro(dir, [
        ['scrivi', { percorso: 'mio.txt', contenuto: 'versione 1\n' }],
        ['file_edit', { percorso: 'mio.txt', vecchio: 'versione 1', nuovo: 'versione 2' }],
        ['scrivi', { percorso: 'mio.txt', contenuto: 'versione 3\n' }],
    ])
    assert.match(esiti[1], /^edited: mio\.txt/)
    assert.match(esiti[2], /^written: mio\.txt/)
    assert.equal(readFileSync(join(dir, 'mio.txt'), 'utf8'), 'versione 3\n')
})

test('OVERWRITE-07: il registro della SESSIONE vale fra un giro e l altro; senza, ogni giro parte da zero', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'a.txt'), 'CONTENUTO_ORIGINALE\n')
    const registroLetture = creaRegistroLetture()
    await giro(dir, [['leggi', { percorso: 'a.txt' }]], { registroLetture })
    const [dopo] = await giro(dir, [['scrivi', { percorso: 'a.txt', contenuto: 'nuovo' }]], { registroLetture })
    assert.match(dopo, /^written: a\.txt \(replaced/)
    writeFileSync(join(dir, 'b.txt'), 'ALTRO\n')
    await giro(dir, [['leggi', { percorso: 'b.txt' }]])
    const [senza] = await giro(dir, [['scrivi', { percorso: 'b.txt', contenuto: 'nuovo' }]])
    assert.match(senza, /^REFUSED\./)
})

test('OVERWRITE-08: il registro delle sessioni passa lo STESSO registro al giro ripreso, e uno diverso a un altra sessione', async () => {
    const { createSessionRegistry } = await import('../src/session-registry.mjs')
    const runs = []
    const avviaSessioneFn = (input) => {
        let risolvi
        const promessa = new Promise((r) => { risolvi = r })
        const i = runs.length
        runs.push({ input, risolvi })
        input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` })
        return promessa
    }
    const fine = (i) => { runs[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` }); runs[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } }) }
    const registro = createSessionRegistry({ avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
        preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) })
    const { sessionId } = registro.avvia('task')
    fine(0)
    await registro.attendiAssestamento(sessionId)
    assert.equal(registro.resume(sessionId, 'continua').sessionId, sessionId)
    assert.ok(runs[0].input.registroLetture instanceof Map)
    assert.equal(runs[1].input.registroLetture, runs[0].input.registroLetture, 'same session, same reads')
    fine(1)
    await registro.attendiAssestamento(sessionId)
    const altra = registro.avvia('task')
    assert.notEqual(runs[2].input.registroLetture, runs[0].input.registroLetture, 'another session starts from zero')
    fine(2)
    await registro.attendiAssestamento(altra.sessionId)
    await registro.chiudi?.()
})

test('OVERWRITE-09: le pagine contano solo DI FILA dalla prima — l ultima pagina da sola non basta', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'lungo.txt'), Array.from({ length: 30 }, (_, i) => `riga ${i + 1}`).join('\n') + '\n')
    const esiti = await giro(dir, [['leggi', { percorso: 'lungo.txt', offset: 21, limit: 10 }], ['scrivi', { percorso: 'lungo.txt', contenuto: 'x' }]])
    assert.match(esiti[1], /^REFUSED\..*you have read only part of it/)
})

test('OVERWRITE-10: una riga lunga vista a metà blocca; letta fino in fondo con byteOffset, sblocca', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'min.js'), 'x'.repeat(3000) + '\n')
    const meta = await giro(dir, [['leggi', { percorso: 'min.js' }], ['scrivi', { percorso: 'min.js', contenuto: 'y' }]])
    assert.match(meta[0], /continue inside it with leggi byteOffset=2000/)
    assert.match(meta[1], /^REFUSED\..*you have read only part of it/)
    const intera = await giro(dir, [['leggi', { percorso: 'min.js' }], ['leggi', { percorso: 'min.js', byteOffset: 2000 }], ['scrivi', { percorso: 'min.js', contenuto: 'y' }]])
    assert.match(intera[2], /^written: min\.js \(replaced/)
})
