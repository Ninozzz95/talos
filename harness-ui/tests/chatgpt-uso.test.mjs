/**
 * 11/10/2026 — il conteggio NOSTRO di ciò che TALOS consuma col piano ChatGPT (decisione owner 11/10: «Link + conteggio nostro,
 * barra con Codex dopo»). Il servizio non comunica i limiti su questa strada (PIANO-OAUTH §10-§11): qui si conta solo ciò che
 * TALOS ha mandato, nelle due finestre che Codex usa per il piano (5 ore e 7 giorni, `codex-rs/codex-api/src/rate_limits.rs`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaRegistroUsoChatgpt, FINESTRE_USO_CHATGPT } from '../src/chatgpt-uso.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const ORA = Date.UTC(2026, 9, 11, 12, 0, 0)
const ORE = 60 * 60 * 1000
function scena(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-uso-chatgpt-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  let adesso = ORA
  const file = join(dir, 'chatgpt-uso.json')
  return { dir, file, avanza: (ms) => { adesso += ms }, crea: () => creaRegistroUsoChatgpt({ file, ora: () => adesso }) }
}

test('USO-01 — le due finestre sono quelle del piano: 5 ore e 7 giorni', () => {
  assert.deepEqual(FINESTRE_USO_CHATGPT, { cinqueOre: 5 * ORE, setteGiorni: 7 * 24 * ORE })
})

test('USO-02 — conta richieste e token per finestra; una richiesta di 6 ore fa esce dalle 5 ore e resta nei 7 giorni', async (t) => {
  const s = scena(t); const r = s.crea()
  await r.registra({ esito: 'completato', usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 } })
  s.avanza(6 * ORE)
  await r.registra({ esito: 'completato', usage: { input_tokens: 300, output_tokens: 50 } }) // la forma di Responses, senza total
  assert.deepEqual(r.riepilogo(), {
    cinqueOre: { richieste: 1, token: 350, senzaMisura: 0 },
    setteGiorni: { richieste: 2, token: 1550, senzaMisura: 0 },
  })
})

test('USO-03 AL CONTRARIO — una richiesta fermata o fallita non conta; una completata senza misura conta come richiesta, mai come zero token', async (t) => {
  const s = scena(t); const r = s.crea()
  await r.registra({ esito: 'fermato', usage: null })
  await r.registra({ esito: 'errore', usage: { total_tokens: 999 } })
  await r.registra({ esito: 'completato', usage: null })
  await r.registra({ esito: 'completato', usage: { total_tokens: -5 } })
  assert.deepEqual(r.riepilogo().cinqueOre, { richieste: 2, token: 0, senzaMisura: 2 })
})

test('USO-04 — sopravvive al riavvio (file su disco) e butta ciò che ha più di 7 giorni', async (t) => {
  const s = scena(t)
  await s.crea().registra({ esito: 'completato', usage: { total_tokens: 500 } })
  s.avanza(3 * 24 * ORE)
  const dopo = s.crea()
  assert.equal(dopo.riepilogo().setteGiorni.token, 500, 'riletto dal disco')
  s.avanza(5 * 24 * ORE)
  await dopo.registra({ esito: 'completato', usage: { total_tokens: 40 } })
  assert.deepEqual(dopo.riepilogo().setteGiorni, { richieste: 1, token: 40, senzaMisura: 0 })
  assert.equal(JSON.parse(readFileSync(s.file, 'utf8')).voci.length, 1, 'la voce vecchia non resta sul disco')
  assert.deepEqual(readdirSync(s.dir), ['chatgpt-uso.json'], 'nessun file temporaneo lasciato')
})

test('USO-05 AL CONTRARIO — un file rotto o di un\'altra forma non ferma niente: si riparte da vuoto, e il file non contiene mai testo della richiesta', async (t) => {
  const s = scena(t)
  writeFileSync(s.file, '{ rotto')
  const r = s.crea()
  assert.deepEqual(r.riepilogo().setteGiorni, { richieste: 0, token: 0, senzaMisura: 0 })
  await r.registra({ esito: 'completato', usage: { total_tokens: 7, prompt: 'segreto', cost: 1 }, modello: 'gpt-x', testo: 'segreto' })
  const scritto = readFileSync(s.file, 'utf8')
  assert.doesNotMatch(scritto, /segreto/u)
  assert.deepEqual(Object.keys(JSON.parse(scritto).voci[0]).sort(), ['quando', 'token'])
  writeFileSync(s.file, JSON.stringify({ voci: [{ quando: 'ieri', token: 3 }, { quando: ORA, token: '9' }, null] }))
  assert.deepEqual(s.crea().riepilogo().setteGiorni, { richieste: 0, token: 0, senzaMisura: 0 }, 'voci storte scartate')
})

test('USO-06 — senza file (portachiavi di prova, cartella assente) conta in memoria; azzera() svuota tutto, per lo scollegamento', async (t) => {
  const r = creaRegistroUsoChatgpt({ file: null, ora: () => ORA })
  await r.registra({ esito: 'completato', usage: { total_tokens: 10 } })
  assert.equal(r.riepilogo().cinqueOre.token, 10)
  const s = scena(t); const conFile = s.crea()
  await conFile.registra({ esito: 'completato', usage: { total_tokens: 10 } })
  await conFile.azzera()
  assert.deepEqual(conFile.riepilogo().setteGiorni, { richieste: 0, token: 0, senzaMisura: 0 })
  assert.deepEqual(s.crea().riepilogo().setteGiorni, { richieste: 0, token: 0, senzaMisura: 0 }, 'anche sul disco')
})

test('USO-07 — scollegare azzera il conteggio (era di quell\'account), da qualunque porta: la rotta e l\'attrezzo della chat usano lo stesso accesso', async () => {
  const { accessoConUso } = await import('../src/chatgpt-uso.mjs')
  const r = creaRegistroUsoChatgpt({ file: null, ora: () => ORA })
  await r.registra({ esito: 'completato', usage: { total_tokens: 10 } })
  const base = Object.freeze({ stato: () => ({ collegato: true }), tokenDiAccesso: async () => 'T', esci: async () => ({ revocaConfermata: false }) })
  const accesso = accessoConUso(base, r)
  assert.equal(await accesso.tokenDiAccesso(), 'T', 'il resto passa com\'è')
  assert.deepEqual(await accesso.esci(), { revocaConfermata: false })
  assert.equal(r.riepilogo().setteGiorni.richieste, 0)
  assert.equal(accessoConUso(null, r), null, 'senza accesso (niente portachiavi) resta null')
})
