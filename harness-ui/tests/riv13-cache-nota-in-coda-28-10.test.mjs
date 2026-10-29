/*
 * Riverifica avversaria del blocco 13 (28/10/2026) — fuori dal glob della suite (tests/riv13/).
 * La nota sulla lingua del messaggio ora viaggia IN CODA a ogni richiesta (`noteInCoda`). `conMarcatoreDiCache` mette il marcatore
 * sull'ULTIMO messaggio `system` della richiesta: con la nota in coda, il marcatore sta sull'ultimo messaggio di ogni richiesta, e il
 * prefisso marcato di una richiesta non è più un prefisso della richiesta dopo (la nota si sposta in fondo).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

async function richieste({ linguaDelMessaggio } = {}) {
  const corpi = []
  const cartella = mkdtempSync(join(tmpdir(), 'talos-riv13-cache-'))
  const lungo = 'Istruzioni lunghe del sistema. '.repeat(800) // > 16.000 caratteri: il marcatore si mette
  const storia = [
    { role: 'system', content: lungo },
    { role: 'user', content: 'domanda vecchia' }, { role: 'assistant', content: 'risposta vecchia' },
    { role: 'user', content: 'سلام، فایل‌ها را بشمار' },
  ]
  let n = 0
  try {
    await talosLavora({
      cartella, task: { consegna: 'سلام، فایل‌ها را بشمار' }, modello: 'x', chiave: 'y', _giriMassimiInterno: 3, messaggiIniziali: storia,
      ...(linguaDelMessaggio ? { linguaDelMessaggio } : {}),
      fetchDiRete: async (_url, init) => {
        corpi.push(JSON.parse(init.body).messages)
        n += 1
        const msg = n === 1
          ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'elenca', arguments: '{}' } }] }
          : { role: 'assistant', content: 'ok' }
        return Response.json({ choices: [{ message: msg, finish_reason: n === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
      },
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  return corpi
}
const marcato = (msgs) => msgs.findIndex((m) => Array.isArray(m.content) && m.content.some((p) => p?.cache_control))
const senzaMarcatore = (m) => (Array.isArray(m.content) ? { ...m, content: m.content.map((p) => p.text ?? '').join('') } : m)

test('RIV13-1 — con la lingua del messaggio nota, il prefisso marcato per la cache della 1ª richiesta è ancora un prefisso della 2ª', async () => {
  for (const linguaDelMessaggio of [undefined, 'fa']) {
    const [r1, r2] = await richieste({ linguaDelMessaggio })
    assert.ok(r1 && r2, 'premessa: due richieste nello stesso giro (attrezzo, poi risposta)')
    const i = marcato(r1)
    assert.ok(i >= 0, 'premessa: la prima richiesta porta il marcatore')
    const prefisso1 = JSON.stringify(r1.slice(0, i + 1).map(senzaMarcatore))
    const prefisso2 = JSON.stringify(r2.slice(0, i + 1).map(senzaMarcatore))
    assert.equal(prefisso2, prefisso1,
      `linguaDelMessaggio=${linguaDelMessaggio}: marcatore all'indice ${i} di ${r1.length} (${r1[i].role}: «${JSON.stringify(r1[i].content).slice(0, 80)}»); `
      + `nella 2ª richiesta quell'indice è «${JSON.stringify(r2[i]?.content).slice(0, 60)}»`)
  }
})
