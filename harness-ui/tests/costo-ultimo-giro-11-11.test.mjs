/*
 * Costo S9/S2, ultimo giro «che lo chiude» (owner 11/11/2026 10:48, giudice v1435-v1436; reperti del controllore delle 10:45).
 *   S9 — la nota sulla lingua si dà per consegnata solo quando la risposta PORTA QUALCOSA (attrezzi, o testo non tagliato dal tetto):
 *        una risposta vuota, solo ragionamento o tagliata dal tetto fa rimandare la stessa domanda, e quella porta di nuovo la nota.
 *        Rischio inverso (giudice v1436): una risposta di SOLE chiamate di attrezzi porta qualcosa ⇒ 6 passi di attrezzi e il testo: 1 su 7.
 *   S2 — «compattazione» solo quando la storia è riscritta da un RIASSUNTO; istruzioni nuove con una storia accorciata senza riassunto ⇒ «sistema».
 * Flusso finto (`onDelta`: la scala della risposta vuota vive sulla strada in flusso), zero rete, zero dollari.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, INIZIO_NOTA_LINGUA_DEL_MESSAGGIO, improntaDellaRichiesta, motivoDellaCacheRicominciata } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const testo = (m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join(''))
const notaDi = (m) => m.role === 'system' && testo(m).startsWith(INIZIO_NOTA_LINGUA_DEL_MESSAGGIO)
const enc = new TextEncoder()
const flusso = (fotogrammi) => () => {
  let p = 0
  return new Response(new ReadableStream({
    pull(c) {
      if (p < fotogrammi.length) { c.enqueue(enc.encode(`data: ${JSON.stringify(fotogrammi[p])}\n\n`)); p += 1; return }
      c.enqueue(enc.encode('data: [DONE]\n\n')); c.close()
    },
  }))
}
const fine = (motivo, usage) => ({ choices: [{ delta: {}, finish_reason: motivo }], ...(usage ? { usage } : {}) })
/* due vuote con un'uscita diversa: la scala non le prende per la stessa risposta deterministica */
const vuota = (uscita = 2) => flusso([fine('stop', { prompt_tokens: 100, completion_tokens: uscita })])
const ragionamento = (t) => flusso([{ choices: [{ delta: { reasoning: t } }] }, fine('stop')])
const fatto = flusso([{ choices: [{ delta: { content: 'Fatto.' } }] }, fine('stop')])
const tagliata = flusso([{ choices: [{ delta: { content: 'Ecco i file: a.t' } }] }, fine('length')])
const seguito = flusso([{ choices: [{ delta: { content: 'xt.' } }] }, fine('stop')])
const elenca = (k) => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id: `c${k}`, type: 'function', function: { name: 'elenca', arguments: '{}' } }] } }] }, fine('tool_calls')])

/** Un invio in flusso con la lingua del messaggio nota; restituisce le note per richiesta e l'errore, se il giro finisce in errore. */
async function note(risposte) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-costo-ultimo-'))
  writeFileSync(join(cartella, 'a.txt'), 'prova')
  const corpi = []
  let errore = null
  try {
    await talosLavora({
      cartella, task: { consegna: 'Guarda i file, per favore.' }, modello: 'finto/modello', chiave: 'finta', linguaDelMessaggio: 'it',
      onDelta: () => {}, attesaRitentaMassimaMs: 1, _giriMassimiInterno: 12,
      fetchDiRete: async (url, init) => {
        if (!init?.body) throw new Error(`rete vietata: ${url}`)
        corpi.push(JSON.parse(init.body).messages)
        return risposte[Math.min(corpi.length - 1, risposte.length - 1)]()
      },
    })
  } catch (e) { errore = e?.code ?? String(e?.message ?? e) } finally { rimuoviCartellaDiProva(cartella) }
  return { note: corpi.map((m) => m.filter(notaDi).length), errore }
}

test('COSTO-ULT-S9-01 — risposta VUOTA e poi testo: la domanda rimandata porta di nuovo la nota [1,1] (oggi [1,0])', async () => {
  assert.deepEqual(await note([vuota(), fatto]), { note: [1, 1], errore: null })
})

/* ⛔ Superata dall'owner 11/11 12:24 (b), «Una volta sola per messaggio»: il testo tagliato porta qualcosa, la continuazione non
   rimanda la nota ([1,0]; 2 e 3 continuazioni in `costo-correzione-piccola-11-11.test.mjs`). Le risposte vuote restano [1,1]. */
test('COSTO-ULT-S9-02 — risposta tagliata dal tetto e poi il seguito: la nota una volta sola per messaggio [1,0] (owner 11/11 12:24)', async () => {
  assert.deepEqual(await note([tagliata, seguito]), { note: [1, 0], errore: null })
})

test('COSTO-ULT-S9-03 — la scala INTERA: ogni gradino che rimanda la stessa domanda porta la nota, fino all\'ultimo', async () => {
  /* due ritentativi, poi il testo */
  assert.deepEqual(await note([vuota(2), vuota(3), fatto]), { note: [1, 1, 1], errore: null })
  /* due continuazioni sul ragionamento, due ritentativi, poi il testo */
  assert.deepEqual(await note([ragionamento('Penso.'), ragionamento('Penso ancora.'), vuota(2), vuota(3), fatto]), { note: [1, 1, 1, 1, 1], errore: null })
  /* l'ultimo gradino: la scala finisce in errore, e ogni richiesta l'aveva portata */
  const finita = await note([vuota(2), vuota(3), vuota(4)])
  assert.deepEqual(finita.note, [1, 1, 1])
  assert.equal(finita.errore, 'PROVIDER_EMPTY_RESPONSE')
})

test('COSTO-ULT-S9-04 — rischio inverso (giudice v1436): una risposta di SOLE chiamate di attrezzi porta qualcosa ⇒ 6 passi e il testo: 1 su 7', async () => {
  assert.deepEqual(await note([elenca(1), elenca(2), elenca(3), elenca(4), elenca(5), elenca(6), fatto]), { note: [1, 0, 0, 0, 0, 0, 0], errore: null })
  /* insieme: vuota, poi un attrezzo (consegnata lì), poi il testo */
  assert.deepEqual(await note([vuota(), elenca(1), fatto]), { note: [1, 1, 0], errore: null })
  /* e dopo un attrezzo la vuota (spinta) non la rimette: era già consegnata */
  assert.deepEqual(await note([elenca(1), vuota(), fatto]), { note: [1, 0, 0], errore: null })
  /* una chiamata di attrezzo che arriva col motivo «length» porta comunque qualcosa (l'attrezzo gira): consegnata lì */
  const elencaTagliata = flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'ct', type: 'function', function: { name: 'elenca', arguments: '{}' } }] } }] }, fine('length')])
  assert.deepEqual(await note([elencaTagliata, fatto]), { note: [1, 0], errore: null })
})

/* ── S2, il caso raro ── */
const imp = (messaggi) => improntaDellaRichiesta({ modello: 'm', messaggi, attrezzi: [] })
const pre = (l) => ({ ...imp(l), tokenDaCache: 100, at: 1_000, durataMs: 300_000 })
const S = { role: 'system', content: 'Sei TALOS.' }
const S2 = { role: 'system', content: 'Sei TALOS. Istruzioni NUOVE.' }
const u1 = { role: 'user', content: 'uno' }, a1 = { role: 'assistant', content: 'ok' }, u2 = { role: 'user', content: 'due' }, a2 = { role: 'assistant', content: 'ok2' }
const t1 = { role: 'assistant', content: null, tool_calls: [{ id: 't', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }
const r1 = { role: 'tool', tool_call_id: 't', content: 'contenuto lungo del file' }
const r1c = { role: 'tool', tool_call_id: 't', content: '[output cleared]' }
/* le tre forme di riassunto che il nucleo può vedere: motore del contesto, desktop di prima, ciclo di base */
const RIASSUNTI = [
  { role: 'user', content: '{"kind":"talos-context-memory","summary":{"text":"Riassunto."},"protectedFacts":[]}' },
  { role: 'user', content: '[conversation compacted: what follows is a summary, not the original history]\n\nRiassunto.' },
  { role: 'user', content: '[conversazione compattata: quanto segue è un riassunto, non la cronologia originale]\n\nRiassunto.' },
  { role: 'user', content: '[conversation compacted at turn 40: what follows is a summary, not the original history]\n\nRiassunto.' },
  /* la stessa forma col contenuto a parti (come lo scrive chi allega immagini) */
  { role: 'user', content: [{ type: 'text', text: '[conversation compacted: what follows is a summary, not the original history]\n\nRiassunto.' }] },
]

test('COSTO-ULT-S2-01 — istruzioni nuove INSIEME a una storia accorciata SENZA riassunto: «sistema», non «compattazione» (oggi «compattazione»)', () => {
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1, u2, a2]), imp([S2, u1, a1, u2]), { tokenDaCache: 0 }), 'sistema', 'giro abbandonato tolto')
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, t1, r1, a1]), imp([S2, u1, t1, r1c, a1, u2]), { tokenDaCache: 0 }), 'sistema', 'uscita di attrezzo accorciata')
})

test('COSTO-ULT-S2-02 — al contrario: con un riassunto NUOVO (in ognuna delle sue forme) testa e storia cambiate insieme danno «compattazione»', () => {
  for (const r of RIASSUNTI) {
    assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1, { role: 'system', content: 'nota' }, u2]), imp([S, { role: 'system', content: 'nota' }, r, u2]), { tokenDaCache: 0 }), 'compattazione', testo(r).slice(0, 30))
  }
  /* un riassunto che c'era già non è una compattazione nuova: le istruzioni cambiate dopo restano «sistema» */
  assert.equal(motivoDellaCacheRicominciata(pre([S, RIASSUNTI[0], u1, a1, u2, a2]), imp([S2, RIASSUNTI[0], u1, a1, u2]), { tokenDaCache: 0 }), 'sistema')
  /* la storia riscritta senza istruzioni nuove resta «compattazione» (la parola dice «compattata o riscritta»), come oggi */
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, t1, r1, a1]), imp([S, u1, t1, r1c, a1, u2]), { tokenDaCache: 0 }), 'compattazione')
  /* le istruzioni nuove con la storia che cresce: «sistema», come oggi */
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1]), imp([S2, u1, a1, u2]), { tokenDaCache: 0 }), 'sistema')
})
