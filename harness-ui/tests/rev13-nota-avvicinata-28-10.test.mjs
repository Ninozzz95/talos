/* Revisione avversaria del blocco 13 — R13-A aggravata dalla compattazione: la nota vecchia si sposta davanti agli ultimi scambi. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { dividiPerCompattazione, costruisciProiezione } from '../src/kernel/compattazione-desktop.mjs'
import { notaLinguaDelMessaggio, INIZIO_NOTA_LINGUA_DEL_MESSAGGIO } from '../src/kernel/talosHarness.mjs'

test('R13-A2 — dopo la compattazione la nota «last message is in Persian» di 20 scambi fa sta subito prima degli ultimi messaggi inglesi', () => {
  const nota = notaLinguaDelMessaggio([], { linguaDelMessaggio: 'fa' }, (c) => c)
  const storia = [{ role: 'system', content: 'base' }, { role: 'user', content: 'سلام' }, { role: 'system', content: nota }, { role: 'assistant', content: 'سلام!' }]
  for (let n = 1; n <= 20; n += 1) storia.push({ role: 'user', content: `English question ${n}` }, { role: 'assistant', content: `English answer ${n}` })
  const parti = dividiPerCompattazione(storia)
  const proiezione = costruisciProiezione({ testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: 'x', indice: '', coda: parti.coda })
  const i = proiezione.findIndex((m) => m.role === 'system' && String(m.content).startsWith(INIZIO_NOTA_LINGUA_DEL_MESSAGGIO))
  const dopo = proiezione.slice(i + 1).filter((m) => m.role === 'user').map((m) => m.content)
  assert.equal(i, -1, `la nota persiana sta all'indice ${i} di ${proiezione.length}, seguita solo da: ${JSON.stringify(dopo)}`)
})
