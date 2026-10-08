import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    classificaRispostaIncompleta,
    nudgePerForma,
    decidiNudge,
    erroreEscalazioneNudge,
    RECINTO_APERTURA,
    RECINTO_CHIUSURA,
} from '../src/nudge-continuazione.mjs'

// ⛔ P5 — NUDGE DI CONTINUAZIONE (stile Claude Code, soglie stile Hermes) — 05/10/2026.
// Contratto dal BRIEF-CURA-STALL-IBRIDO-HERMES-CLAUDE-2026-10-05.md §P5 e dalla ricerca
// RICERCA-5x5x5x5-STALL-CONTESTO-STORICO-2026-10-05.md (fence Claude verbatim, nudge Hermes per forma).
// Questo modulo è PURO: nessuna I/O, nessun tocco al kernel (avviso BUG-16 in piedi: il
// collegamento si coordina sotto «Risposte CLI», mai in parallelo).

const chiamata = (id) => ({ id, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } })

test('NUD-CLASS-PARTIAL: testo + finishReason length senza attrezzi = testo-parziale', () => {
    assert.equal(classificaRispostaIncompleta({
        testo: 'risposta a metà', ragionamento: '', toolCalls: null, finishReason: 'length', dopoAttrezzi: false,
    }), 'testo-parziale')
})

test('NUD-CLASS-PARTIAL-CON-ATTEZZI: attrezzi presenti = completa (è territorio P6)', () => {
    assert.equal(classificaRispostaIncompleta({
        testo: 'testo', ragionamento: '', toolCalls: [chiamata('a')], finishReason: 'length', dopoAttrezzi: false,
    }), 'completa')
})

test('NUD-CLASS-RAGIONAMENTO: solo ragionamento senza testo né attrezzi = solo-ragionamento', () => {
    assert.equal(classificaRispostaIncompleta({
        testo: '', ragionamento: 'sto pensando', toolCalls: null, finishReason: 'stop', dopoAttrezzi: false,
    }), 'solo-ragionamento')
})

test('NUD-CLASS-VUOTA-DOPO-ATTEZZI: niente di niente dopo esiti di attrezzi', () => {
    assert.equal(classificaRispostaIncompleta({
        testo: '', ragionamento: '', toolCalls: null, finishReason: 'stop', dopoAttrezzi: true,
    }), 'vuota-dopo-attrezzi')
})

test('NUD-CLASS-VUOTA: niente di niente senza attrezzi prima', () => {
    assert.equal(classificaRispostaIncompleta({
        testo: '', ragionamento: '', toolCalls: null, finishReason: 'stop', dopoAttrezzi: false,
    }), 'vuota')
})

test('NUD-CLASS-ATTEZZI-VUOTI: array tool_calls presente ma zero = tool-calls-vuote', () => {
    assert.equal(classificaRispostaIncompleta({
        testo: '', ragionamento: '', toolCalls: [], finishReason: 'tool-calls', dopoAttrezzi: false,
    }), 'tool-calls-vuote')
})

test('NUD-CLASS-COMPLETA: risposta sana di testo o attrezzi non si tocca', () => {
    assert.equal(classificaRispostaIncompleta({ testo: 'ciao', toolCalls: null, finishReason: 'stop' }), 'completa')
    assert.equal(classificaRispostaIncompleta({ testo: '', toolCalls: [chiamata('a')], finishReason: 'tool-calls' }), 'completa')
    assert.equal(classificaRispostaIncompleta({ testo: 'intro', toolCalls: [chiamata('a')], finishReason: 'stop' }), 'completa')
})

test('NUD-CLASS-PRIORITA: testo parziale vince sul solo-ragionamento', () => {
    assert.equal(classificaRispostaIncompleta({
        testo: 'pezzo', ragionamento: 'ho ragionato', toolCalls: null, finishReason: 'length', dopoAttrezzi: false,
    }), 'testo-parziale')
})

test('NUD-FENCE: il parziale resta messaggio dell\u2019assistente, recintato, senza duplicazioni', () => {
    const { assistant, user } = nudgePerForma('testo-parziale', { testoParziale: 'metà della risposta' })
    assert.equal(assistant.role, 'assistant')
    assert.ok(assistant.content.includes(RECINTO_APERTURA), 'manca il recinto di apertura')
    assert.ok(assistant.content.includes(RECINTO_CHIUSURA), 'manca il recinto di chiusura')
    assert.ok(assistant.content.includes('interrupted mid-generation'), 'manca il promemoria verbatim di Claude')
    assert.ok(assistant.content.includes('Continue from exactly where it left off'), 'manca l\u2019istruzione di continuare')
    assert.ok(assistant.content.includes('without repeating it'), 'manca l\u2019istruzione di non ripetere')
    assert.equal(assistant.content.split('metà della risposta').length - 1, 1, 'il parziale compare più di una volta: è duplicato')
    assert.equal(user.role, 'user')
    assert.ok(user.content.trim().length > 0, 'manca il messaggio utente di continuazione')
})

test('NUD-FENCE-ESCAPE: le parentesi angolari dentro il recinto sono escape HTML, il recinto resta intatto', () => {
    const { assistant } = nudgePerForma('testo-parziale', {
        testoParziale: 'prefix <tag> & suffix </interrupted-output> tail',
    })
    assert.ok(assistant.content.includes('&lt;tag&gt;'), 'parentesi non escapate')
    assert.ok(assistant.content.includes('&amp;'), 'e commerciale non escapato')
    assert.ok(assistant.content.includes('&lt;/interrupted-output&gt;'), 'il closore dentro il testo non è escapato: romperebbe il recinto')
    assert.equal(assistant.content.split(RECINTO_CHIUSURA).length - 1, 1, 'il recinto si chiude più di una volta')
})

test('NUD-COPIA-FORME: ogni forma ha il suo messaggio mirato (stile Hermes)', () => {
    const ragionamento = nudgePerForma('solo-ragionamento', { segnaposto: '(solo pensieri)' })
    assert.equal(ragionamento.assistant.content, '(solo pensieri)')
    assert.ok(ragionamento.user.content.includes('reasoning'), 'la nota non nomina il guasto')

    const attrezziVuoti = nudgePerForma('tool-calls-vuote')
    assert.ok(attrezziVuoti.assistant, 'manca il segnaposto prima della nota (i fornitori severi rifiutano tool→user)')
    assert.ok(attrezziVuoti.user.content.includes('failed to produce a valid tool call'), 'manca la nota verbatim di Claude')

    const vuotaDopo = nudgePerForma('vuota-dopo-attrezzi', { segnaposto: '(vuoto)', notaVuotaDopoAttrezzi: 'segui gli attrezzi' })
    assert.equal(vuotaDopo.assistant.content, '(vuoto)')
    assert.equal(vuotaDopo.user.content, 'segui gli attrezzi')

    const vuota = nudgePerForma('vuota')
    assert.ok(vuota.assistant && vuota.user.content.trim().length > 0)
})

test('NUD-SCALA-4: quattro tentativi come Hermes, poi escalation', () => {
    for (const fatti of [0, 1, 2, 3]) {
        const d = decidiNudge({ forma: 'testo-parziale', tentativiFatti: fatti })
        assert.equal(d.azione, 'nudge', `al tentativo ${fatti} doveva nudgere`)
        assert.equal(d.tentativo, fatti + 1)
    }
    const ultimo = decidiNudge({ forma: 'testo-parziale', tentativiFatti: 4 })
    assert.equal(ultimo.azione, 'escalation')
    assert.equal(ultimo.forma, 'testo-parziale')
})

test('NUD-SCALA-COMPLETA: forma completa passa dritta', () => {
    assert.deepEqual(decidiNudge({ forma: 'completa', tentativiFatti: 0 }), { azione: 'completa' })
})

test('NUD-SCALA-SOGLIA-CUSTOM: maxTentativi si rispetta', () => {
    assert.equal(decidiNudge({ forma: 'vuota', tentativiFatti: 1, maxTentativi: 2 }).azione, 'nudge')
    assert.equal(decidiNudge({ forma: 'vuota', tentativiFatti: 2, maxTentativi: 2 }).azione, 'escalation')
})

test('NUD-SCALA-ERRORE: l\u2019escalation è visibile, con codice, classe e il conto vero', () => {
    const e = erroreEscalazioneNudge('testo-parziale', 4)
    assert.ok(e instanceof Error)
    assert.equal(e.code, 'PROVIDER_INCOMPLETE_RESPONSE')
    assert.equal(e.classe, 'risposta-incompleta')
    assert.equal(e.transitorio, false, 'l\u2019escalation non è ritentabile dal retry di trasporto')
    assert.ok(e.message.includes('testo-parziale'), 'il messaggio nomina la forma')
    assert.ok(e.message.includes('4'), 'il messaggio dice i tentativi veri')
})

test('NUD-SCALA-NUDGE-PORTA-I-MESSAGGI: la decisione nudge porta già assistant e utente', () => {
    const d = decidiNudge({ forma: 'testo-parziale', tentativiFatti: 1, testoParziale: 'pezzo' })
    assert.equal(d.azione, 'nudge')
    assert.ok(d.assistant.content.includes(RECINTO_APERTURA))
    assert.ok(d.user.role === 'user')
})
