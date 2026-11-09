/*
 * Decisioni 173, 189 e 196 sul PC (owner 04/11/2026), cure della revisione permessi 2.
 * - 173: la fiducia data DOPO dalla pillola dei permessi rimette l'Accesso pieno che la persona aveva scelto (`riapplicaFiducia`); al
 *   ripristino una sessione abbassata non tiene la cartella allargata alla radice del disco.
 * - 196: col «No» non partono i ganci (hooks) del progetto e non si collegano gli strumenti della cartella (server MCP, plugin), come
 *   nella CLI (`firstrun.trust.plain`: «instructions, hooks and connected tools»); col «Sì» sì.
 * - Condizione di Performance: il passaggio cambia livello e attrezzi offerti nello STESSO giro, una volta (un solo cambio del prefisso).
 * Giro finto (`avviaSessioneFn`), store in una cartella temporanea, nessuna chiave.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse as parsePath } from 'node:path'
import test from 'node:test'

import { createSessionRegistry } from '../src/session-registry.mjs'

const finito = { esito: 'completato', motivo: 'fine' }
function banco(t, { fiduciaDellaCartellaFn, senzaIstruzioniDelProgettoFn, store = mkdtempSync(join(tmpdir(), 'talos-196-store-')), radice = mkdtempSync(join(tmpdir(), 'talos-196-banco-')), ganci = null, attrezziNelGiro = 0 } = {}) {
  const corse = []
  const eseguiti = []
  const registro = createSessionRegistry({ cartellaStore: store, modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...(fiduciaDellaCartellaFn ? { fiduciaDellaCartellaFn } : {}),
    ...(senzaIstruzioniDelProgettoFn ? { senzaIstruzioniDelProgettoFn } : {}),
    ...(ganci ? {
      caricaHooksFn: async () => ({ hooks: ganci }),
      verificaTrustFn: async () => true, // il gancio è fidato da solo (impronta): resta spento solo per la cartella
      eseguiHookFn: async ({ hook, evento }) => { eseguiti.push(`${hook.id}:${evento.tipo}`); return { consentito: true } },
    } : {}),
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: radice, task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    preparaEsecuzioneLiberaFn: (_c, { consegna }) => ({ ok: true, cartella: radice, task: { id: 'libero', consegna }, comandoProva: null }),
    avviaSessioneFn: async (input) => {
      const livelli = []
      input.onEvento({ type: 'RunStarted' })
      for (let i = 0; i < attrezziNelGiro; i++) livelli.push(input.permessiCorrentiFn?.().livelloAccesso)
      if (ganci) await input.hookFn({ tipo: 'pre_tool_call', azione: { tipo: 'shell', comando: 'echo x' } })
      corse.push({ ...input, livelliDelleChiamate: livelli })
      input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } }
    } })
  t.after(() => registro.chiudi())
  return { registro, corse, eseguiti, radice, store }
}
const pausa = () => new Promise((r) => { setTimeout(r, 60) })

test('173 PILLOLA ROSSA→VERDE — «No» all\'avvio in Accesso pieno, poi la fiducia dalla pillola: il giro dopo torna in Accesso pieno, le istruzioni restano com\'erano nate', async (t) => {
  let fidata = false
  const b = banco(t, { fiduciaDellaCartellaFn: () => fidata, senzaIstruzioniDelProgettoFn: () => fidata === false })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(b.corse[0].livelloAccesso, 'su-richiesta')
  assert.equal(b.corse[0].senzaIstruzioniDelProgetto, true)
  fidata = true
  assert.equal(typeof b.registro.riapplicaFiducia, 'function', 'il server la chiama quando la persona dà o toglie la fiducia')
  b.registro.riapplicaFiducia()
  assert.equal(b.registro.impostazioniCorrenti(sessionId)?.permessi, 'Full access', 'la pillola lo mostra subito')
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'accesso-pieno')
  assert.equal(b.corse.at(-1).senzaIstruzioniDelProgetto, true, 'forma B della CLI: le istruzioni si leggono alla nascita, la conversazione dopo le ha')
})

test('173 PILLOLA AL CONTRARIO — chi non aveva scelto l\'Accesso pieno non sale; nessuna fonte, niente cambia', async (t) => {
  let fidata = false
  const b = banco(t, { fiduciaDellaCartellaFn: () => fidata })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'On request' })
  await pausa()
  fidata = true
  b.registro.riapplicaFiducia()
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta')
  const c = banco(t, {})
  const altra = c.registro.avvia('b', { permessiScelto: 'Full access' })
  await pausa()
  c.registro.riapplicaFiducia()
  assert.equal(c.registro.impostazioniCorrenti(altra.sessionId)?.permessi, 'Full access')
})

test('173 RIPRISTINO ROSSA — salvata in Accesso pieno, ripristinata in una cartella ora non fidata: «On request» col progetto, non con la radice del disco; la fiducia dopo la rimette piena', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'talos-196-store-'))
  const radice = mkdtempSync(join(tmpdir(), 'talos-196-banco-'))
  const a = banco(t, { store, radice })
  const { sessionId } = a.registro.avviaLibero({ cartellaId: 'default', consegna: 'f', permessi: 'Full access' }) // la cartella dell'elenco: la sola che si allarga
  await pausa()
  assert.equal(a.corse[0].livelloAccesso, 'accesso-pieno')
  await a.registro.chiudi()
  let fidata = false
  const b = banco(t, { store, radice, fiduciaDellaCartellaFn: () => fidata })
  await b.registro.ripristina()
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta')
  assert.notEqual(b.corse.at(-1).cartella, parsePath(radice).root, 'in «On request» la cartella del giro è il progetto')
  assert.equal(b.corse.at(-1).cartella, radice)
  fidata = true
  b.registro.riapplicaFiducia()
  await b.registro.resume(sessionId, 'e ora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'accesso-pieno', 'aveva scelto l\'Accesso pieno: torna senza rifarlo')
})

test('196 ROSSA — col «No» il gancio del progetto non parte e i server MCP e i plugin della cartella non si collegano; col «Sì» sì', async (t) => {
  const ganci = [{ id: 'g1', eventi: ['pre_tool_call'], hash: 'h', comando: 'node g.mjs' }]
  const no = banco(t, { fiduciaDellaCartellaFn: () => false, ganci })
  no.registro.avvia('a', { permessiScelto: 'On request' })
  await pausa()
  assert.deepEqual(no.eseguiti, [], 'il gancio del progetto non parte')
  assert.equal(no.corse[0].cartellaTrustMcp, undefined, 'nessun server MCP della cartella si collega')
  assert.equal(no.corse[0].cartellaTrustPlugin, undefined, 'nessun plugin della cartella si carica')
  for (const fiducia of [() => true, () => null, null]) {
    const si = banco(t, { ...(fiducia ? { fiduciaDellaCartellaFn: fiducia } : {}), ganci })
    si.registro.avvia('b', { permessiScelto: 'On request' })
    await pausa()
    assert.deepEqual(si.eseguiti, ['g1:pre_tool_call'], 'fidata, non ancora chiesta o nessuna fonte: il gancio parte (golden)')
    assert.equal(typeof si.corse[0].cartellaTrustMcp, 'string')
    assert.equal(typeof si.corse[0].cartellaTrustPlugin, 'string')
  }
})

test('196 — «No» a sessione aperta: dal giro dopo ganci, MCP e plugin spenti; il gancio si spegne anche dentro il giro', async (t) => {
  let fidata = true
  const ganci = [{ id: 'g1', eventi: ['pre_tool_call'], hash: 'h', comando: 'node g.mjs' }]
  const b = banco(t, { fiduciaDellaCartellaFn: () => fidata, ganci })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'On request' })
  await pausa()
  assert.equal(b.eseguiti.length, 1)
  fidata = false
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.eseguiti.length, 1, 'nessun gancio in più')
  assert.equal(b.corse.at(-1).cartellaTrustMcp, undefined)
})

test('PERFORMANCE — il passaggio da Accesso pieno a «On request» cambia livello e attrezzi offerti in UN giro solo (un cambio del prefisso), e dentro un giro di 20 attrezzi si legge solo la memoria', async (t) => {
  let fidata = true
  let letture = 0
  const b = banco(t, { fiduciaDellaCartellaFn: () => { letture++; return fidata }, attrezziNelGiro: 20 })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'Full access' })
  await pausa()
  fidata = false
  await b.registro.resume(sessionId, 'due')
  await pausa()
  await b.registro.resume(sessionId, 'tre')
  await pausa()
  const forma = (c) => JSON.stringify([c.livelloAccesso, c.cartellaTrustMcp === undefined, c.cartellaTrustPlugin === undefined, c.senzaIstruzioniDelProgetto === true])
  const forme = b.corse.map(forma)
  assert.notEqual(forme[0], forme[1], 'il giro dopo il «No» cambia')
  assert.equal(forme[1], forme[2], 'e poi resta uguale: un cambio solo')
  assert.ok(b.corse[1].livelliDelleChiamate.every((l) => l === 'su-richiesta'))
  assert.ok(letture > 0, 'la fonte si chiede (è una funzione in memoria: il file lo conta la prova dello store)')
})

test('RIGA FISSA — l\'istantanea delle impostazioni porta `cartellaNonFidata` (e `pienoTrattenuto`); fidata o senza fonte non porta niente (golden); la fiducia data la annuncia', async (t) => {
  let fidata = false
  const b = banco(t, { fiduciaDellaCartellaFn: () => fidata })
  const normale = b.registro.avvia('a', { permessiScelto: 'On request' })
  const pieno = b.registro.avvia('b', { permessiScelto: 'Full access' })
  await pausa()
  const n = b.registro.impostazioniCorrenti(normale.sessionId)
  const p = b.registro.impostazioniCorrenti(pieno.sessionId)
  assert.equal(n.cartellaNonFidata, true)
  assert.equal('pienoTrattenuto' in n, false)
  assert.equal(p.cartellaNonFidata, true)
  assert.equal(p.pienoTrattenuto, true)
  fidata = true
  const esito = b.registro.riapplicaFiducia()
  assert.deepEqual(new Set(esito.cambiate), new Set([normale.sessionId, pieno.sessionId]), 'tutte e due: una cambia modo, l\'altra solo la riga')
  const dopo = b.registro.impostazioniCorrenti(normale.sessionId)
  assert.equal('cartellaNonFidata' in dopo, false)
  assert.deepEqual(b.registro.riapplicaFiducia().cambiate, [], 'niente cambia: niente annunci')
  const c = banco(t, {})
  const senza = c.registro.avvia('c', { permessiScelto: 'Full access' })
  await pausa()
  const golden = c.registro.impostazioniCorrenti(senza.sessionId)
  assert.equal('cartellaNonFidata' in golden || 'pienoTrattenuto' in golden, false)
})

test('189 A SESSIONE APERTA ROSSA — «No» dopo la nascita: dal giro dopo le istruzioni sono spente, nello stesso cambio del livello; un «Sì» dopo non le riaccende (forma B)', async (t) => {
  let fidata = true
  const b = banco(t, { fiduciaDellaCartellaFn: () => fidata, senzaIstruzioniDelProgettoFn: () => fidata === false })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal('senzaIstruzioniDelProgetto' in b.corse[0], false)
  fidata = false
  await b.registro.resume(sessionId, 'due')
  await pausa()
  assert.equal(b.corse[1].senzaIstruzioniDelProgetto, true, 'il «No» spegne le istruzioni dal giro dopo')
  assert.equal(b.corse[1].livelloAccesso, 'su-richiesta', 'nello stesso giro del livello: un cambio solo del prefisso')
  fidata = true
  b.registro.riapplicaFiducia()
  await b.registro.resume(sessionId, 'tre')
  await pausa()
  assert.equal(b.corse[2].livelloAccesso, 'accesso-pieno')
  assert.equal(b.corse[2].senzaIstruzioniDelProgetto, true, 'le istruzioni tornano solo in una conversazione nuova')
})

test('189 A SESSIONE APERTA AL CONTRARIO — senza la fonte della fiducia (la CLI) il segno resta quello della nascita', async (t) => {
  let spente = false
  const b = banco(t, { senzaIstruzioniDelProgettoFn: () => spente })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'On request' })
  await pausa()
  spente = true
  await b.registro.resume(sessionId, 'due')
  await pausa()
  assert.equal('senzaIstruzioniDelProgetto' in b.corse[1], false, 'forma B della CLI: letta una volta, alla nascita')
})
