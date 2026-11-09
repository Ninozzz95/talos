/*
 * Decisioni 173, 189 e 196 sul PC: GET e POST /api/v1/folder-trust col registro vero (giro finto, nessuna chiave, porta di prova chiusa a
 * fine prova). Un «No» abbassa subito l'Accesso pieno della conversazione viva; un «Sì» lo rimette. Senza store (il telefono): 503.
 * E il filo del server: server.mjs passa le due funzioni insieme (189) e mai sul telefono.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { creaFiduciaCartelle, opzioniFiduciaPerIlRegistro } from '../src/fiducia-cartelle.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'

const finito = { esito: 'completato', motivo: 'fine' }
async function servi(t, opzioni) {
  const server = http.createServer(createHttpApp({ senzaGettone: 'prove', ...opzioni }))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => new Promise((r) => server.close(r)))
  return `http://127.0.0.1:${server.address().port}/api/v1/folder-trust`
}
const posta = (url, corpo) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

test('ROTTA — GET dice null, POST «No» abbassa la conversazione viva in Accesso pieno, POST «Sì» la rimette; i corpi sbagliati non cambiano niente', async (t) => {
  const progetto = realpathSync(mkdtempSync(join(tmpdir(), 'talos-fiducia-rotta-')))
  const fiduciaCartelle = creaFiduciaCartelle({ file: join(mkdtempSync(join(tmpdir(), 'talos-fiducia-dati-')), 'f.json'), avvisa: () => {} })
  const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-fiducia-store-')), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, ...opzioniFiduciaPerIlRegistro(fiduciaCartelle),
    avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  const base = await servi(t, { fiduciaCartelle, sessionRegistry: registro })
  const prima = await (await fetch(`${base}?cartellaLibera=${encodeURIComponent(progetto)}`)).json()
  assert.deepEqual(prima.data, { cartella: progetto, fidata: null }, JSON.stringify(prima))
  const { sessionId } = registro.avviaLibero({ cartellaLibera: progetto, consegna: 'x', permessi: 'Full access' })
  await new Promise((r) => { setTimeout(r, 60) })
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access')
  const no = await (await posta(base, { sessionId, fidata: false })).json()
  assert.equal(no.data.fidata, false)
  assert.deepEqual(no.data.cambiate, [sessionId])
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'On request')
  assert.equal(registro.impostazioniCorrenti(sessionId).cartellaNonFidata, true)
  const si = await (await posta(base, { cartellaLibera: progetto, fidata: true })).json()
  assert.equal(si.data.fidata, true)
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access')
  for (const corpo of [{ fidata: true }, { sessionId, fidata: 'si' }, { sessionId, cartellaLibera: progetto, fidata: true }, { sessionId, fidata: true, altro: 1 }]) {
    const r = await posta(base, corpo)
    assert.equal(r.status, 400, JSON.stringify(corpo))
  }
  assert.equal((await fetch(`${base}?sessionId=nessuna`)).status, 404)
  assert.equal(fiduciaCartelle.stato(progetto), true, 'i corpi sbagliati non hanno scritto')
})

test('ROTTA — senza store (il server del telefono): 503 FOLDER_TRUST_UNAVAILABLE, mai un errore imprevisto', async (t) => {
  const base = await servi(t, {})
  const r = await fetch(`${base}?cartellaId=default`)
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error.code, 'FOLDER_TRUST_UNAVAILABLE')
})

test('FILO DEL SERVER — server.mjs dà al registro le due funzioni insieme e mai sul telefono; la rotta riceve lo store', () => {
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(sorgente, /\.\.\.opzioniFiduciaPerIlRegistro\(fiduciaCartelle, \{ telefono: accessoLocaleOspite\.attivo \}\)/)
  assert.match(sorgente, /const fiduciaCartelle = config\.cartellaStore && !accessoLocaleOspite\.attivo/)
  assert.match(sorgente, /\n {4}fiduciaCartelle, \/\/ decisioni 173\/189\/196/)
})

test('189 FILO INTERO — col «No» CLAUDE.md e AGENTS.md della cartella non arrivano al modello; col «Sì» e «mai chiesta» sì', async (t) => {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { avviaSessione } = await import('../src/agent-service.mjs')
  const SEGRETO = 'ISTRUZIONE-189-4471'
  const fiduciaCartelle = creaFiduciaCartelle({ file: join(mkdtempSync(join(tmpdir(), 'talos-189-dati-')), 'f.json'), avvisa: () => {} })
  const visto = async (fidata) => {
    const progetto = realpathSync(mkdtempSync(join(tmpdir(), 'talos-189-progetto-')))
    mkdirSync(join(progetto, '.git'))
    writeFileSync(join(progetto, 'AGENTS.md'), `# Regole\n${SEGRETO}-AGENTS\n`)
    writeFileSync(join(progetto, 'CLAUDE.md'), `# Regole\n${SEGRETO}-CLAUDE\n`)
    if (fidata !== null) await fiduciaCartelle.imposta(progetto, fidata)
    let contesto = null
    const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-189-store-')), modello: 'fixture', chiave: 'fixture',
      guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, ...opzioniFiduciaPerIlRegistro(fiduciaCartelle),
      avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async (i) => { contesto = String(i.contestoDelProgetto ?? ''); return { ...finito, messaggiFinali: [] } } }) })
    t.after(() => registro.chiudi())
    registro.avviaLibero({ cartellaLibera: progetto, consegna: 'x', permessi: 'On request' })
    for (let i = 0; i < 50 && contesto === null; i++) await new Promise((r) => { setTimeout(r, 40) })
    return contesto
  }
  const no = await visto(false)
  assert.notEqual(no, null, 'il giro è partito')
  assert.doesNotMatch(no, new RegExp(SEGRETO), '«No»: niente istruzioni della cartella')
  assert.match(await visto(true), new RegExp(`${SEGRETO}-AGENTS`), '«Sì»: le istruzioni ci sono')
  assert.match(await visto(null), new RegExp(SEGRETO), 'mai chiesta: come oggi (con i due file il preambolo ne porta uno, AGENTS.md)')
})
