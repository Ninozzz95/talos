/*
 * Revisione avversaria del blocco 13 (28/10/2026) — prove ROSSE dei difetti trovati. Non fa parte del prodotto: vive solo nel worktree
 * della revisione (r4-rev13) e si cancella con lui.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, INIZIO_NOTA_LINGUA_DEL_MESSAGGIO, INIZIO_CAMBIO_LINGUA } from '../src/kernel/talosHarness.mjs'
import { dividiPerCompattazione, costruisciProiezione, riduciCodaSottoPressione, budgetCoda } from '../src/kernel/compattazione-desktop.mjs'
import { INIZIO_AGGIORNAMENTO, aggiornamentoInCoda } from '../src/contesto-del-progetto.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const testo = (m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join(''))

async function inviati({ consegna = 'ciao', linguaDelleRisposte, linguaInterfaccia, linguaDelMessaggio, messaggiIniziali } = {}) {
  let ricevuti = null
  let esito = null
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rev13-'))
  try {
    esito = await talosLavora({
      cartella, task: { consegna }, modello: 'x', chiave: 'y', _giriMassimiInterno: 1,
      ...(linguaDelleRisposte !== undefined ? { linguaDelleRisposte } : {}),
      ...(linguaInterfaccia !== undefined ? { linguaInterfaccia } : {}),
      ...(linguaDelMessaggio !== undefined ? { linguaDelMessaggio } : {}),
      ...(messaggiIniziali ? { messaggiIniziali } : {}),
      fetchDiRete: async (_url, init) => {
        ricevuti ??= JSON.parse(init.body).messages
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
      },
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  /* 28/10, cura di R13-A: la storia che il nucleo SALVA (`messaggiFinali`) accanto a ciò che la richiesta ha mandato */
  return Object.assign(ricevuti, { salvati: esito?.messaggiFinali ?? null })
}

/* ─── R13-A: la nota «The person's last message is in X» resta vera solo fino al messaggio dopo ─── */
test('R13-A — dopo un messaggio DETTATO in persiano, un messaggio SCRITTO in inglese non deve trovare davanti «il suo ultimo messaggio è in persiano»', async () => {
  // giro 1: dettato in persiano (il PC sa la lingua) — Automatica
  const giro1 = await inviati({ consegna: 'سلام، حالت چطوره؟', linguaDelMessaggio: 'fa', linguaInterfaccia: 'it' })
  assert.equal(testo(giro1.at(-1)), "The person's last message is in Persian: reply in Persian.", 'premessa: la nota del giro 1 c\'è')
  // giro 2: la persona SCRIVE in inglese (nessuna lingua nota: il registro azzera `voce.linguaDelMessaggio`)
  assert.ok(Array.isArray(giro1.salvati), 'premessa: il nucleo rende la storia salvata')
  const storia = [...giro1.salvati, { role: 'assistant', content: 'سلام!' }, { role: 'user', content: 'Please switch to English: what is 2+2?' }]
  const giro2 = await inviati({ linguaInterfaccia: 'it', messaggiIniziali: storia })
  const ultimaUser = giro2.findLastIndex((m) => m.role === 'user')
  const note = giro2.map((m, i) => ({ i, t: testo(m) })).filter(({ t }) => t.startsWith(INIZIO_NOTA_LINGUA_DEL_MESSAGGIO))
  const ultimaNota = note.at(-1)
  // la nota più recente che il modello vede descrive l'ULTIMO messaggio: se dice persiano, mente sul messaggio inglese appena scritto
  assert.ok(!(ultimaNota && ultimaNota.t.includes('Persian') && ultimaNota.i < ultimaUser),
    `il modello riceve come ultima notizia sulla lingua «${ultimaNota?.t}» (indice ${ultimaNota?.i}) prima del messaggio inglese (indice ${ultimaUser})`)
})

/* ─── R13-B: le note «Project context update» (che SOSTITUISCONO le precedenti) si accumulano tutte nella coda tenuta ─── */
function aggiornamento(n) {
  const mappa = `Structure of «progetto» (files):\n${Array.from({ length: 400 }, (_, k) => `src/modulo-${n}-${k}.mjs`).join('\n')}`
  const precedente = { role: 'system', content: `${INIZIO_AGGIORNAMENTO} x\n\nmappa-${n - 1}` }
  const nota = aggiornamentoInCoda({ storia: [precedente], testo: mappa })
  assert.ok(nota?.startsWith(INIZIO_AGGIORNAMENTO), 'premessa: è la nota vera del server')
  return { role: 'system', content: nota }
}
const scambio = (n) => [
  { role: 'user', content: `richiesta ${n}` },
  { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: 'scrivi', arguments: `{"percorso":"f${n}"}` } }] },
  { role: 'tool', tool_call_id: `c${n}`, content: `scritto ${n}` },
  { role: 'assistant', content: `fatto ${n}` },
]

test('R13-B1 — di cinque «Project context update» (ognuna sostituisce la precedente) la coda deve tenerne UNA, l\'ultima', () => {
  const storia = [{ role: 'system', content: 'base' }]
  for (let n = 1; n <= 5; n += 1) storia.push(...scambio(n), aggiornamento(n))
  storia.push(...scambio(6), ...scambio(7))
  const parti = dividiPerCompattazione(storia)
  const tenute = parti.coda.filter((m) => m.role === 'system' && testo(m).startsWith(INIZIO_AGGIORNAMENTO))
  assert.equal(tenute.length, 1, `tenute ${tenute.length} mappe intere del progetto, ognuna «REPLACES … Those no longer apply»`)
})

test('R13-B2 — compattazioni ripetute: le mappe vecchie sopravvivono a ogni riassunto e la coda non rientra più nel budget', () => {
  let storia = [{ role: 'system', content: 'base' }]
  let n = 0
  for (let compattazione = 1; compattazione <= 3; compattazione += 1) {
    for (let k = 0; k < 3; k += 1) { n += 1; storia.push(...scambio(n), aggiornamento(n)) }
    storia.push(...scambio(++n), ...scambio(++n))
    const parti = dividiPerCompattazione(storia)
    storia = costruisciProiezione({ testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: '## Objective\nx', indice: '', coda: parti.coda })
  }
  const mappe = storia.filter((m) => m.role === 'system' && testo(m).startsWith(INIZIO_AGGIORNAMENTO)).length
  const parti = dividiPerCompattazione([...storia, ...scambio(++n), ...scambio(++n)])
  const pressione = riduciCodaSottoPressione(parti.coda, { budgetToken: budgetCoda(20_000) })
  assert.equal(mappe, 1, `dopo tre riassunti la proiezione porta ancora ${mappe} mappe intere; coda al minimo: ${pressione.alMinimo}`)
})

/* ─── R13-C: un cambio della sola lingua dei MENU (PC in italiano, dispositivo in inglese) si annuncia come «language setting changed» ─── */
test('R13-C — Automatica sempre: chi scrive da un\'interfaccia in un\'altra lingua non cambia l\'impostazione, ma il modello legge «The language setting changed»', async () => {
  const giro1 = await inviati({ linguaInterfaccia: 'it' })
  const storia = [...giro1, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'from the phone' }]
  const giro2 = await inviati({ linguaInterfaccia: 'en', messaggiIniziali: storia })
  const cambi = giro2.filter((m) => m.role === 'system' && testo(m).startsWith(INIZIO_CAMBIO_LINGUA))
  assert.equal(cambi.length, 0, `nota di cambio aggiunta senza che nessuno abbia cambiato la lingua delle risposte: «${cambi[0] && testo(cambi[0]).slice(0, 120)}…»`)
})
