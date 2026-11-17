/*
 * Costo, la correzione piccola prima dell'unione (owner 11/11/2026 12:24: (a) «Prima la correzione piccola», (b) nota della lingua
 * «Una volta sola per messaggio»; giudice v1453, VERDE v1456 con 5 correzioni; reperti BASSI R1, R2, R4 del controllore dell'ultimo giro).
 *   (b) / R1 — la nota della lingua arriva al modello al massimo UNA volta per messaggio della persona, anche quando la risposta viene
 *        tagliata dal tetto e continua (al più `CONTINUAZIONI_MASSIME` = 3 volte): [1,0], [1,0,0], [1,0,0,0]. Il messaggio DOPO della
 *        persona la riceve di nuovo: una volta per messaggio, non una volta per chat.
 *   (2) / R2 — la memoria del motore del contesto c'è anche SENZA riassunto quando la conversazione ha fatti protetti o fonti
 *        (`context-engine/src/engine.mjs:295-297`, `"summary":null`): un fatto protetto nuovo insieme a istruzioni nuove, senza
 *        compattazione, dice «sistema», non «compattazione».
 *   (Q5) / R4 — il prefisso del riassunto conta SOLO all'inizio del messaggio: lo stesso testo a metà (un'uscita di attrezzo che
 *        legge `compattazione-desktop.mjs`, una frase della persona che lo cita) non è un riassunto.
 * Flusso finto, zero rete, zero dollari.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, INIZIO_NOTA_LINGUA_DEL_MESSAGGIO, CONTINUAZIONI_MASSIME, improntaDellaRichiesta, motivoDellaCacheRicominciata } from '../src/kernel/talosHarness.mjs'
import { composeActiveContext } from '../../context-engine/src/summary.mjs'
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
const fine = (motivo) => ({ choices: [{ delta: {}, finish_reason: motivo }] })
const tagliata = flusso([{ choices: [{ delta: { content: 'Ecco i file: a.t' } }] }, fine('length')])
const seguito = flusso([{ choices: [{ delta: { content: 'xt.' } }] }, fine('stop')])

/** Un messaggio della persona in flusso, con la lingua del messaggio nota: le richieste mandate e l'errore, se finisce in errore. */
async function invio(risposte, { messaggiIniziali, consegna = 'Guarda i file, per favore.' } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-costo-correzione-'))
  writeFileSync(join(cartella, 'a.txt'), 'prova')
  const richieste = []
  let errore = null
  try {
    await talosLavora({
      cartella, task: { consegna }, modello: 'finto/modello', chiave: 'finta', linguaDelMessaggio: 'it',
      onDelta: () => {}, attesaRitentaMassimaMs: 1, _giriMassimiInterno: 12, ...(messaggiIniziali ? { messaggiIniziali } : {}),
      fetchDiRete: async (url, init) => {
        if (!init?.body) throw new Error(`rete vietata: ${url}`)
        richieste.push(JSON.parse(init.body).messages)
        return risposte[Math.min(richieste.length - 1, risposte.length - 1)]()
      },
    })
  } catch (e) { errore = e?.code ?? String(e?.message ?? e) } finally { rimuoviCartellaDiProva(cartella) }
  return { richieste, note: richieste.map((m) => m.filter(notaDi).length), errore }
}

test('COSTO-CORR-B-01 — le continuazioni sono al più 3: è il tetto che le prove qui sotto coprono tutto', () => {
  assert.equal(CONTINUAZIONI_MASSIME, 3)
})

test('COSTO-CORR-B-02 — risposta tagliata dal tetto che continua 1, 2 e 3 volte: la nota UNA volta sola, [1,0], [1,0,0], [1,0,0,0] (oggi [1,1], [1,1,1], [1,1,1,1])', async () => {
  assert.deepEqual((await invio([tagliata, seguito])).note, [1, 0], 'una continuazione')
  assert.deepEqual((await invio([tagliata, tagliata, seguito])).note, [1, 0, 0], 'due continuazioni')
  assert.deepEqual((await invio([tagliata, tagliata, tagliata, seguito])).note, [1, 0, 0, 0], 'tre continuazioni, il tetto')
  /* oltre il tetto il giro si chiude sulla risposta tagliata: 4 richieste, sempre una nota sola */
  const oltre = await invio([tagliata, tagliata, tagliata, tagliata, seguito])
  assert.deepEqual(oltre.note, [1, 0, 0, 0], 'oltre le continuazioni')
})

test('COSTO-CORR-B-03 — una volta per MESSAGGIO, non per chat: il messaggio dopo della persona riceve di nuovo la nota, una volta, anche se continua', async () => {
  const primo = await invio([tagliata, tagliata, seguito])
  assert.deepEqual(primo.note, [1, 0, 0])
  const storia = [...primo.richieste.at(-1).filter((m) => !notaDi(m)), { role: 'assistant', content: 'xt.' }, { role: 'user', content: 'E adesso leggili.' }]
  const secondo = await invio([tagliata, seguito], { messaggiIniziali: storia, consegna: 'E adesso leggili.' })
  assert.deepEqual(secondo.note, [1, 0], 'il messaggio dopo: di nuovo una nota, una volta sola')
  assert.equal(secondo.errore, null)
})

/* ── (2) e (Q5): il motivo della cache ── */
const imp = (messaggi) => improntaDellaRichiesta({ modello: 'm', messaggi, attrezzi: [] })
const pre = (l) => ({ ...imp(l), tokenDaCache: 100, at: 1_000, durataMs: 300_000 })
const S = { role: 'system', content: 'Sei TALOS.' }
const S2 = { role: 'system', content: 'Sei TALOS. Istruzioni NUOVE.' }
const u1 = { role: 'user', content: 'uno' }, a1 = { role: 'assistant', content: 'ok' }, u2 = { role: 'user', content: 'due' }, a2 = { role: 'assistant', content: 'ok2' }
const fatto = { id: 'f1', text: 'Il progetto usa Node 22.', status: 'active' }

test('COSTO-CORR-2-01 — fatto protetto nuovo + istruzioni nuove SENZA compattazione: «sistema», non «compattazione» (oggi «compattazione»)', () => {
  /* il testo VERO del motore, senza riassunto ma con un fatto protetto (`engine.mjs:295-297` → `composeActiveContext` con `summary: null`) */
  const conMemoria = composeActiveContext({ systemMessages: [S2], summary: null, facts: [fatto], tailMessages: [u1, a1, u2] })
  const memoria = conMemoria.find((m) => m.role === 'user' && testo(m).startsWith('{"kind":"talos-context-memory"'))
  assert.ok(memoria, 'la memoria del motore senza riassunto esiste davvero')
  assert.match(testo(memoria), /"summary":null/u)
  assert.deepEqual(imp(conMemoria).riassunti, [], 'una memoria senza riassunto non è un riassunto')
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1, u2, a2]), imp(conMemoria), { tokenDaCache: 0 }), 'sistema')
  /* anche con le fonti al posto dei fatti (`!evidence.length` nella stessa riga del motore) */
  const conFonti = composeActiveContext({ systemMessages: [S2], summary: null, facts: [], evidence: [{ id: 'e1', text: 'fonte' }], tailMessages: [u1, a1, u2] })
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1, u2, a2]), imp(conFonti), { tokenDaCache: 0 }), 'sistema', 'fonti senza riassunto')
})

test('COSTO-CORR-2-02 — al contrario: la memoria del motore CON un riassunto nuovo resta «compattazione», anche coi fatti protetti', () => {
  const compattata = composeActiveContext({ systemMessages: [S2], summary: { text: 'Riassunto della prima parte.' }, facts: [fatto], tailMessages: [u2] })
  assert.equal(imp(compattata).riassunti.length, 1)
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1, u2, a2]), imp(compattata), { tokenDaCache: 0 }), 'compattazione')
  /* un riassunto scritto come testo semplice (stringa) vale uguale */
  const aStringa = composeActiveContext({ systemMessages: [S2], summary: 'Riassunto.', facts: [], tailMessages: [u2] })
  assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1, u2, a2]), imp(aStringa), { tokenDaCache: 0 }), 'compattazione', 'riassunto a stringa')
})

const MARCATORI = [
  '{"kind":"talos-context-memory","summary":{"text":"Riassunto."},"protectedFacts":[]}',
  '[conversation compacted: what follows is a summary, not the original history]\n\nRiassunto.',
  '[conversazione compattata: quanto segue è un riassunto, non la cronologia originale]\n\nRiassunto.',
  '[conversation compacted at turn 40: what follows is a summary, not the original history]\n\nRiassunto.',
]

test('COSTO-CORR-Q5-01 — il prefisso del riassunto conta SOLO all\'inizio del messaggio: lo stesso testo a metà non è un riassunto', () => {
  for (const marcatore of MARCATORI) {
    const etichetta = marcatore.slice(0, 30)
    /* controprova: all'inizio sì */
    assert.equal(imp([S, { role: 'user', content: marcatore }]).riassunti.length, 1, `all'inizio: ${etichetta}`)
    /* a metà di un messaggio della persona, di un'uscita di attrezzo, dell'assistente, anche a parti: no */
    const aMeta = [
      { role: 'user', content: `Che cosa vuol dire questa riga? ${marcatore}` },
      { role: 'tool', tool_call_id: 't', content: `const MARCATORE = '${marcatore}'` },
      { role: 'assistant', content: `Il file scrive ${marcatore}` },
      { role: 'user', content: [{ type: 'text', text: 'Leggi: ' }, { type: 'text', text: marcatore }] },
    ]
    for (const m of aMeta) assert.deepEqual(imp([S, m]).riassunti, [], `a metà (${m.role}): ${etichetta}`)
    /* e quindi il motivo: istruzioni nuove con la storia cambiata da un messaggio che CITA il marcatore ⇒ «sistema» */
    const citazione = { role: 'tool', tool_call_id: 't', content: `riga 127: ${marcatore}` }
    assert.equal(motivoDellaCacheRicominciata(pre([S, u1, a1, u2, a2]), imp([S2, u1, citazione, u2]), { tokenDaCache: 0 }), 'sistema', `motivo: ${etichetta}`)
  }
})
