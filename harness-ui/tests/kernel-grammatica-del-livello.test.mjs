/*
 * Riga del bugfixer (owner 10/10/2026: «kernel chiuso», poi «irrobustisci con ricerca paper docs e competitor») — UNA GRAMMATICA SOLA
 *   PER IL LIVELLO DEL KERNEL. Prima ogni valore che non era uno dei sei livelli faceva fallire tutti i confronti: «On request»
 *   passato come parola non faceva chiedere niente, e un refuso girava senza vincoli. Ora `livelloLetto` legge il valore una volta,
 *   all'ingresso del giro, nella rilettura viva (C16) e nel cancello esportato: livello → sé stesso, parola della pillola → il suo
 *   livello, assente → assente, il resto → «Sola lettura». Fonti nel commento sopra `livelloLetto`.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { livelloLetto, talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const LIVELLI = ['lettura', 'ricerca', 'su-richiesta', 'scrittura-area', 'scrittura-progetto', 'accesso-pieno']

test('GRAM-01 the reader: levels stay, the five pill words become their level, absent stays absent, anything else is read-only', () => {
    for (const l of LIVELLI) assert.equal(livelloLetto(l), l)
    assert.deepEqual(['Read only', 'Research', 'On request', 'Workspace write', 'Full access'].map(livelloLetto),
        ['lettura', 'ricerca', 'su-richiesta', 'scrittura-progetto', 'accesso-pieno'])
    assert.equal(livelloLetto(undefined), undefined)
})

test('GRAM-07 every name the kernel prints for a level reads back as that level (review N1: «Area write»)', async () => {
    const { frasePermessiCambiati } = await import('../src/kernel/talosHarness.mjs')
    for (const l of ['lettura', 'ricerca', 'su-richiesta', 'scrittura-area', 'scrittura-progetto', 'accesso-pieno']) {
        const nome = /to "([^"]+)"/u.exec(frasePermessiCambiati('lettura' === l ? 'accesso-pieno' : 'lettura', l))?.[1]
        assert.ok(nome, `premise: the kernel prints a name for ${l}`)
        assert.equal(livelloLetto(nome), l, `«${nome}» reads back as ${l}`)
    }
    for (const v of [null, '', 'Boh', 'completo', 'workspace', 'full access', ' lettura', 42, {}, ['accesso-pieno']]) assert.equal(livelloLetto(v), 'lettura', JSON.stringify(v))
})

/** Un giro vero del kernel che prova a scrivere un file; `livelli` è ciò che legge la rilettura viva a ogni chiamata (se c'è). */
async function giroCheScrive(t, { livelloAccesso, rilettura = null }) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-grammatica-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    let offerti = null
    let domande = 0
    let n = 0
    const esiti = []
    await talosLavora({
        cartella, task: { consegna: 'scrivi' }, modello: 'f', chiave: 'k', giriMassimi: 3,
        ...(livelloAccesso === 'ASSENTE' ? {} : { livelloAccesso }),
        ...(rilettura ? { permessiCorrentiFn: () => ({ livelloAccesso: rilettura, permessiPerAttrezzo: {} }) } : {}),
        chiediApprovazioneFn: async () => { domande += 1; return false },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
        fetchDiRete: async (_url, init) => {
            offerti ??= (JSON.parse(init.body).tools ?? []).map((a) => a.function?.name)
            const message = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'x' }) } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
    })
    return { offerti, domande, esiti, scritto: existsSync(join(cartella, 'a.txt')) }
}

test('GRAM-02 «On request» passed as a WORD now asks before writing (before: no question at all), exactly as the level does', async (t) => {
    for (const livello of ['On request', 'su-richiesta']) {
        const r = await giroCheScrive(t, { livelloAccesso: livello })
        assert.equal(r.offerti.includes('scrivi'), true, `${livello}: on request still offers scrivi (it asks)`)
        assert.equal(r.domande, 1, `${livello}: one question`)
        assert.equal(r.scritto, false, `${livello}: refused, so nothing written`)
    }
})

test('GRAM-03 an unreadable level (a typo, null, a number) and «Read only» as a word are read-only: no write offered, nothing written', async (t) => {
    for (const livello of ['Boh', null, 7, 'Read only']) {
        const r = await giroCheScrive(t, { livelloAccesso: livello })
        assert.equal(r.offerti.includes('scrivi'), false, `${JSON.stringify(livello)}: scrivi not offered`)
        assert.equal(r.scritto, false)
        assert.equal(r.domande, 0)
    }
})

test('GRAM-04 AL CONTRARIO: an absent level, a real level and its pill word still write, with no question', async (t) => {
    for (const livello of ['ASSENTE', 'scrittura-progetto', 'Workspace write', 'Full access']) {
        const r = await giroCheScrive(t, { livelloAccesso: livello })
        assert.equal(r.scritto, true, `${livello}: written`)
        assert.equal(r.domande, 0, `${livello}: no question`)
    }
})

test('GRAM-05 the live re-read (C16) goes through the same reader: a typo read mid-turn refuses, a pill word grants', async (t) => {
    const chiuso = await giroCheScrive(t, { livelloAccesso: 'accesso-pieno', rilettura: 'Boh' })
    assert.equal(chiuso.scritto, false, 'a typo read back mid-turn is read-only')
    assert.match(chiuso.esiti[0], /^\[TALOS\] The person changed this session's permissions from "Full access" to "Read only"/, 'and the model is told the real level')
    const aperto = await giroCheScrive(t, { livelloAccesso: 'lettura', rilettura: 'Full access' })
    assert.equal(aperto.scritto, true, 'the word «Full access» read back mid-turn is full access')
    assert.match(aperto.esiti[0], /^\[TALOS\] The person changed this session's permissions from "Read only" to "Full access"/)
})

test('GRAM-06 the exported gate reads the same grammar: a word equals its level, a typo equals read-only', async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-grammatica-cancello-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const azione = { tipo: 'scrivi', percorso: join(cartella, 'b.txt') }
    const esito = async (livelloAccesso) => (await verificaPermessoScrittura(azione, { livelloAccesso, cartella })).consentito
    assert.equal(await esito('Workspace write'), await esito('scrittura-progetto'))
    assert.equal(await esito('Workspace write'), true, 'premise: workspace write may write in the project')
    assert.equal(await esito('Boh'), false)
    assert.equal(await esito('Boh'), await esito('lettura'))
})
