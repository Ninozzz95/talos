/*
 * Revisione avversaria del blocco 13 — prova ROSSA (fuori dal glob della suite: tests/rev13/).
 * `ultimaRigaLinguaDellaStoria` prende per «regola della lingua» QUALUNQUE riga che comincia con «Always reply in » in QUALUNQUE
 * messaggio di sistema: anche le istruzioni del progetto (AGENTS.md, nel preambolo) o una memoria della persona.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, rigaLinguaDelleRisposte, INIZIO_CAMBIO_LINGUA, aggiornamentoLinguaInCoda } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const testo = (m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join(''))

test('R13-E — una riga «Always reply in English.» nelle istruzioni del progetto fa annunciare un cambio d\'impostazione che non c\'è stato', async () => {
  const riga = rigaLinguaDelleRisposte({ linguaInterfaccia: 'it' })
  const progetto = 'Project instructions — AGENTS.md\nUse two-space indentation.\nAlways reply in English.\n\nWorking sheet — branch main.'
  const storia = [
    { role: 'system', content: `You are TALOS.\n\n${riga}` },
    { role: 'system', content: progetto },
    { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }, { role: 'user', content: 'come va?' },
  ]
  // funzione pura: stessa impostazione (Automatica, interfaccia italiana) del primo messaggio
  const pura = aggiornamentoLinguaInCoda(storia, riga, (c) => (typeof c === 'string' ? c : ''))
  let ricevuti = null
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rev13e-'))
  try {
    await talosLavora({ cartella, task: { consegna: 'come va?' }, modello: 'x', chiave: 'y', _giriMassimiInterno: 1, linguaInterfaccia: 'it', messaggiIniziali: storia,
      fetchDiRete: async (_u, init) => { ricevuti ??= JSON.parse(init.body).messages; return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) } })
  } finally { rimuoviCartellaDiProva(cartella) }
  const cambi = ricevuti.filter((m) => m.role === 'system' && testo(m).startsWith(INIZIO_CAMBIO_LINGUA))
  assert.equal(cambi.length + (pura === null ? 0 : 100), 0, `dal giro vero: ${cambi.length} note di cambio; ` + `funzione pura: «${pura?.slice(0, 90)}…» — l'impostazione non è cambiata`)
  assert.equal(cambi.length, 0, 'il modello legge che la regola del progetto è stata «sostituita»')
})
