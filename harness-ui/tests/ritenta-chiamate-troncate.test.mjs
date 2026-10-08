import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trovaTroncate, trovaTroncateSenzaId, decidiRitentaTroncate } from '../src/ritenta-chiamate-troncate.mjs'

// ⛔ P6 — RITENTA DELLE CHIAMATE TRONCATE (stile Hermes) — 05/10/2026.
// Contratto dal BRIEF-CURA-STALL-IBRIDO-HERMES-CLAUDE-2026-10-05.md §P6: risposta con argomenti
// JSON monchi → ritenta la STESSA chiamata ≤4× con cap di output potenziato (base·2ⁿ, mai sopra
// il limite noto del modello: «a ceiling past the model limit only buys a provider 400»), e la
// risposta rotta NON si appende; al termine, il fallback resta il ramo onesto BC-11 del kernel
// (argomenti `{}` + esito che dice il vero), così la storia resta accoppiata e coerente.
// Modulo PURO: nessuna I/O, nessun tocco al kernel (avviso BUG-16: collegamento sotto «Risposte CLI»).

test('TRC-TROVA: segna solo gli id con argomenti non-parsabili, senza mutare la risposta', () => {
    const risposta = {
        tool_calls: [
            { id: 'sana', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } },
            { id: 'monca', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"b.txt"' } },
        ],
    }
    const prima = JSON.stringify(risposta)
    assert.deepEqual(trovaTroncate(risposta), ['monca'])
    assert.equal(JSON.stringify(risposta), prima, 'la risposta è stata mutata: mai')
})

test('TRC-TROVA-NONE: argomenti assenti o vuoti NON sono troncamenti (BC-11 resta il loro ramo)', () => {
    assert.deepEqual(trovaTroncate({ tool_calls: [{ id: 'a', function: { name: 'leggi', arguments: '' } }] }), [])
    assert.deepEqual(trovaTroncate({ tool_calls: [{ id: 'b', function: { name: 'leggi' } }] }), [])
    assert.deepEqual(trovaTroncate({ tool_calls: [] }), [])
    assert.deepEqual(trovaTroncate({}), [])
    assert.deepEqual(trovaTroncate(null), [])
})

test('TRC-RITENTA-1: primo ritenta raddoppia il cap (base·2⁰·2 = base·2)', () => {
    const d = decidiRitentaTroncate({ troncate: ['monca'], tentativiFatti: 0, capBase: 8192 })
    assert.equal(d.azione, 'ritenta')
    assert.equal(d.tentativo, 1)
    assert.equal(d.capOutput, 16384)
})

test('TRC-RITENTA-RADDOPPIA: a ogni tentativo il cap raddoppia', () => {
    const d = decidiRitentaTroncate({ troncate: ['monca'], tentativiFatti: 1, capBase: 8192 })
    assert.equal(d.azione, 'ritenta')
    assert.equal(d.capOutput, 32768)
})

test('TRC-RITENTA-TETTO: mai sopra il limite noto del modello', () => {
    const d = decidiRitentaTroncate({ troncate: ['monca'], tentativiFatti: 3, capBase: 8192, capMassimoModello: 40000 })
    assert.equal(d.azione, 'ritenta')
    assert.equal(d.capOutput, 40000, '65536 sopra il tetto: il fornitore risponde 400')
    const sopra = decidiRitentaTroncate({ troncate: ['monca'], tentativiFatti: 0, capBase: 50000, capMassimoModello: 40000 })
    assert.equal(sopra.capOutput, 40000, 'nemmeno la base può superare il tetto')
})

test('TRC-RITENTA-MAX: quattro tentativi, poi arrenditi al ramo onesto BC-11', () => {
    for (const fatti of [0, 1, 2, 3]) {
        assert.equal(decidiRitentaTroncate({ troncate: ['monca'], tentativiFatti: fatti, capBase: 1024 }).azione, 'ritenta')
    }
    const d = decidiRitentaTroncate({ troncate: ['monca'], tentativiFatti: 4, capBase: 1024 })
    assert.equal(d.azione, 'arrenditi')
    assert.deepEqual(d.troncate, ['monca'], 'l\u2019arrenditi porta gli id, per il ramo BC-11')
})

test('TRC-RITENTA-SENZA-CAP: senza un cap di base non c\u2019è boost, si arrende (niente magia)', () => {
    assert.equal(decidiRitentaTroncate({ troncate: ['monca'], tentativiFatti: 0, capBase: undefined }).azione, 'arrenditi')
})

test('TRC-PROCEDI: nessuna chiamata troncata = il giro procede come oggi', () => {
    assert.deepEqual(decidiRitentaTroncate({ troncate: [], tentativiFatti: 0, capBase: 8192 }), { azione: 'procedi' })
})

test('TRC-CAP-INVALIDO: capBase o capMassimoModello insani si rifiutano, non si inferiscono', () => {
    for (const capBase of [0, -1, 1.5, '8192']) {
        assert.throws(() => decidiRitentaTroncate({ troncate: ['x'], tentativiFatti: 0, capBase }),
            (e) => e.code === 'TRC_CAP_INVALIDO')
    }
    assert.throws(() => decidiRitentaTroncate({ troncate: ['x'], tentativiFatti: 0, capBase: 8192, capMassimoModello: -5 }),
        (e) => e.code === 'TRC_CAP_INVALIDO')
})

test('TRC-SOGLIA-CUSTOM: maxTentativi si rispetta', () => {
    assert.equal(decidiRitentaTroncate({ troncate: ['x'], tentativiFatti: 1, capBase: 8, maxTentativi: 2 }).azione, 'ritenta')
    assert.equal(decidiRitentaTroncate({ troncate: ['x'], tentativiFatti: 2, capBase: 8, maxTentativi: 2 }).azione, 'arrenditi')
})

// ⛔ Revisione stall P6 (06/10/2026) — le troncate SENZA id: prima sparivano in silenzio
// (`trovaTroncate` le scartava) e la risposta monca entrava in storia con un «procedi» finto.

test('TRC-SENZA-ID-TROVA: il senza-id si vede, come posizioni, senza mutare la risposta', () => {
    const risposta = {
        tool_calls: [
            { id: 'sana', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } },
            { function: { name: 'leggi', arguments: '{"percorso":"b.txt"' } },
            { id: '', type: 'function', function: { name: 'leggi', arguments: '{"x":' } },
            { id: 'parsabile', type: 'function', function: { name: 'leggi', arguments: '{"ok":1}' } },
        ],
    }
    const prima = JSON.stringify(risposta)
    assert.deepEqual(trovaTroncateSenzaId(risposta), [1, 2], 'posizioni delle monche senza id; con id va in trovaTroncate, parsabile da nessuna parte')
    assert.equal(JSON.stringify(risposta), prima, 'la risposta è stata mutata: mai')
    assert.deepEqual(trovaTroncateSenzaId({}), [])
    assert.deepEqual(trovaTroncateSenzaId(null), [])
})

test('TRC-SENZA-ID-RITENTA: il senza-id da solo NON è un «procedi»', () => {
    const d = decidiRitentaTroncate({ troncate: [], troncateSenzaId: 1, tentativiFatti: 0, capBase: 8192 })
    assert.equal(d.azione, 'ritenta', 'la risposta monca non entra in storia: si ritenta col cap potenziato')
    assert.equal(d.tentativo, 1)
    assert.equal(d.capOutput, 16384)
    assert.equal(d.troncateSenzaId, 1)
})

test('TRC-SENZA-ID-ARRENDIMENTO: all\u2019arrenditi il conto resta, per il ramo onesto senza id', () => {
    const d = decidiRitentaTroncate({ troncate: [], troncateSenzaId: 2, tentativiFatti: 4, capBase: 1024 })
    assert.equal(d.azione, 'arrenditi')
    assert.deepEqual(d.troncate, [])
    assert.equal(d.troncateSenzaId, 2, 'il chiamante deve segnalare le incomplete senza id, mai pusharle com\u2019erano')
    assert.equal(d.tentativiFatti, 4)
})

test('TRC-MISTO: id e senza-id si sommano nella decisione e viaggiano insieme', () => {
    const d = decidiRitentaTroncate({ troncate: ['monca'], troncateSenzaId: 2, tentativiFatti: 0, capBase: 8192 })
    assert.equal(d.azione, 'ritenta')
    assert.deepEqual(d.troncate, ['monca'])
    assert.equal(d.troncateSenzaId, 2)
    assert.deepEqual(decidiRitentaTroncate({ troncate: [], troncateSenzaId: 0, tentativiFatti: 0, capBase: 8192 }), { azione: 'procedi' },
        'zero troncate in assoluto: il procedi com\u2019era')
})

test('TRC-SENZA-ID-INVALIDO: un conto negativo o frastagliato si rifiuta, non si tace', () => {
    for (const male of [-1, 1.5, '2']) {
        assert.throws(() => decidiRitentaTroncate({ troncate: [], troncateSenzaId: male, tentativiFatti: 0, capBase: 8 }),
            (e) => e.code === 'TRC_TRONCATE_INVALIDE')
    }
})
