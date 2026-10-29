/*
 * Revisione avversaria del blocco 11 (27/10/2026), riserva A-R5 — K1 a metà. K1 (CLI, 27/10, prova dal vivo col Pad) dava ai rifiuti
 *   ANTICIPATI di `scrivi` la ricevuta `denied` e l'`isError` (la CLI mostrava «● edited 1 file» per una scrittura rifiutata), ma tre
 *   rifiuti di `scrivi` prima del cancello restavano solo testo:
 *     K1a sostituire un file esistente mai letto (T25, il rifiuto più comune);
 *     K1b testo su un file binario (F-001);
 *     K1c una `mode` che non esiste.
 *   Prova portata da `revisione-blocco-11-prove-2026-10-27/A-k1-rifiuti-b11.test.mjs`. Rossa = il difetto c'è.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])

async function giro(cartella, chiamate, opzioni = {}) {
    const esiti = new Map()
    const ricevute = new Map()
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
        fetchDiRete: async () => {
            const risposta = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: chiamate.map(([id, nome, a]) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(a) } })) }
                : { role: 'assistant', content: 'fatto', tool_calls: [] }
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' }
        },
        onGiro: (e) => {
            if (e.tipo === 'tool-esito') esiti.set(e.toolCallId, { isError: e.isError, testo: String(e.content) })
            if (e.tipo === 'ricevuta') ricevute.set(e.ricevuta.toolCallId, e.ricevuta)
        },
        ...opzioni,
    })
    return { esiti, ricevute }
}

function banco(t) {
    const cartella = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-k1-rifiuti-')))
    t.after(() => rimuoviCartellaDiProva(cartella))
    writeFileSync(join(cartella, 'esistente.txt'), 'contenuto di prima, mai letto dal modello\n')
    writeFileSync(join(cartella, 'foto.png'), PNG)
    mkdirSync(join(cartella, 'Documenti'))
    return cartella
}

test('K1-RIF-01 i tre rifiuti di scrivi prima del cancello hanno la ricevuta «denied» con la loro via, e l\'attrezzo è un errore', async (t) => {
    const cartella = banco(t)
    const { esiti, ricevute } = await giro(cartella, [
        ['K1a', 'scrivi', { percorso: 'esistente.txt', contenuto: 'nuovo' }],
        ['K1b', 'scrivi', { percorso: 'foto.png', contenuto: 'testo', mode: 'append' }],
        ['K1c', 'scrivi', { percorso: 'nuovo.txt', contenuto: 'x', mode: 'patch' }],
        ['K1d', 'scrivi', { percorso: 'Documenti/x.txt', contenuto: 'x' }],
    ], { percorsiBloccatiFn: Object.assign(async () => [join(cartella, 'Documenti')], { attiva: () => true }) })
    const vie = { K1a: 'sovrascrittura-non-letta', K1b: 'testo-su-binario', K1c: 'modalita-sconosciuta', K1d: 'cartella-bloccata' }
    for (const [id, via] of Object.entries(vie)) {
        const r = ricevute.get(id)
        assert.ok(r, `${id}: una ricevuta c'è`)
        assert.equal(r.status, 'denied', `${id}: rifiutata, non riuscita`)
        assert.equal(r.consentito, false, id)
        assert.equal(r.via, via, id)
        assert.equal(r.motivo, esiti.get(id)?.testo, `${id}: il motivo della ricevuta è la frase data al modello`)
        assert.equal(esiti.get(id)?.isError, true, `${id}: l'attrezzo è un errore`)
    }
    /* le frasi non cambiano */
    assert.match(esiti.get('K1a').testo, /^REFUSED\. "esistente\.txt" already exists/u)
    assert.match(esiti.get('K1b').testo, /^REFUSED\. "foto\.png" is an existing binary file/u)
    assert.match(esiti.get('K1c').testo, /^"patch" is not a mode, so nothing was written\./u)
    /* niente sul disco */
    assert.equal(readFileSync(join(cartella, 'esistente.txt'), 'utf8'), 'contenuto di prima, mai letto dal modello\n')
    assert.deepEqual(readFileSync(join(cartella, 'foto.png')), PNG)
    assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
})

test('K1-RIF-02 al contrario: dopo la lettura la sostituzione riesce con la ricevuta di successo, e un file nuovo pure; senza la funzione dei blocchi', async (t) => {
    const cartella = banco(t)
    let n = 0
    const passi = [
        [['L', 'leggi', { percorso: 'esistente.txt' }]],
        [['S', 'scrivi', { percorso: 'esistente.txt', contenuto: 'nuovo' }], ['N', 'scrivi', { percorso: 'nuovo.txt', contenuto: 'x' }]],
    ]
    const ricevute = new Map(); const esiti = new Map()
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
        fetchDiRete: async () => {
            const c = passi[n++]
            const risposta = c
                ? { role: 'assistant', content: null, tool_calls: c.map(([id, nome, a]) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(a) } })) }
                : { role: 'assistant', content: 'fatto', tool_calls: [] }
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' }
        },
        onGiro: (e) => {
            if (e.tipo === 'tool-esito') esiti.set(e.toolCallId, e)
            if (e.tipo === 'ricevuta') ricevute.set(e.ricevuta.toolCallId, e.ricevuta)
        },
    })
    for (const id of ['S', 'N']) {
        assert.equal(ricevute.get(id)?.status, 'succeeded', id)
        assert.notEqual(esiti.get(id)?.isError, true, id)
    }
    assert.equal(readFileSync(join(cartella, 'esistente.txt'), 'utf8'), 'nuovo')
})
