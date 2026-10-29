/*
 * Owner 27/10/2026 — CARTELLE BLOCCATE, la seconda porta di «Sblocca» (contratto CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2, B4).
 * L'attrezzo del modello `remote_phone_folder_unblock`: sbloccare ALLARGA l'accesso, quindi la carta c'è SEMPRE (Accesso pieno compreso,
 * come `remote_phone_folder_allow`); e mai dal giro di un dispositivo — un dispositivo non sblocca le proprie cartelle.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ATTREZZI_TELEFONI, SENZA_CARTA_IN_ACCESSO_PIENO } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const ID_PIXEL = 'abcd1234efgh5678'

test('SBLOC-K-01 il kernel: lo offre col resto dei dispositivi; la carta c\'è anche in Accesso pieno; un no non lo esegue', async (t) => {
  assert.ok(ATTREZZI_TELEFONI.has('remote_phone_folder_unblock'))
  assert.equal(SENZA_CARTA_IN_ACCESSO_PIENO.has('remote_phone_folder_unblock'), false, 'allarga l\'accesso: carta sempre')
  const c = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-sblocca-k-')))
  t.after(() => rimuoviCartellaDiProva(c))
  for (const [risposta, attese] of [[false, ['anteprima']], [true, ['anteprima', 'esegui']]]) {
    let n = 0
    const fasi = []
    const domande = []
    const offerti = []
    await talosLavora({
      cartella: c, task: { consegna: 'sblocca' }, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
      strumentiEstesi: ['remote_phones', 'remote_phone_folders', 'remote_phone_folder_unblock'],
      fetchDiRete: async (_u, init) => {
        offerti.push((JSON.parse(init.body).tools ?? []).map((a) => a.function?.name))
        const message = n++ === 0
          ? { role: 'assistant', content: null, tool_calls: [{ id: 'u', type: 'function', function: { name: 'remote_phone_folder_unblock', arguments: JSON.stringify({ phone: 'abcd1234', folder: 'f1' }) } }] }
          : { role: 'assistant', content: 'fatto' }
        return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
      },
      onTelefoniFn: async (nome, _a, { fase }) => { fasi.push(fase); return fase === 'anteprima' ? { ok: true, carta: true, azione: { tipo: nome } } : { ok: true, testo: 'Unblocked.' } },
      chiediApprovazioneFn: async (azione) => { domande.push(azione.tipo); return risposta },
    })
    assert.ok(offerti[0].includes('remote_phone_folder_unblock'))
    assert.deepEqual(domande, ['remote_phone_folder_unblock'], `la carta in Accesso pieno (risposta ${risposta})`)
    assert.deepEqual(fasi, attese)
  }
})

function ambiente(t) {
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-sblocca-r-')))
  t.after(() => rimuoviCartellaDiProva(radice))
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return p }
  const dati = crea('dati')
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto'),
    sessionRegistry: { cartellePiuUsate: () => [] }, cartelleEscluse: [dati] })
  const remoto = {
    cartelle,
    stato: async () => ({ disponibile: true, acceso: true, sceltaFatta: true, relay: { modo: 'n0' }, telefoni: [{ id: ID_PIXEL, endpointId: 'E', nome: 'Pixel', inLinea: true, revocatoAlle: null }], attese: [] }),
  }
  return { crea, cartelle, remoto }
}
async function registroCon(remoto) {
  const radice = realpathSync.native(await mkdtemp(join(tmpdir(), 'talos-sblocca-reg-')))
  await mkdir(join(radice, 'p'), { recursive: true })
  const giri = []
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => { let risolvi; const fine = new Promise((ok) => { risolvi = ok }); giri.push({ input, risolvi }); input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` }); return fine },
    modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: join(radice, 'p'), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    remotoFn: () => remoto,
  })
  const { sessionId } = registro.avvia('task-vero')
  return {
    registro, sessionId, giri,
    via: async () => { giri.forEach((g, k) => { g.input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${k + 1}` }); g.risolvi({ ok: true }) }); await rimuoviCartellaDiProvaAttesa(radice) },
  }
}
async function bloccaUno(a) {
  const lavori = a.crea('lavori')
  const uno = a.crea('lavori', 'uno')
  await a.cartelle.consentiInAnticipo(ID_PIXEL, lavori)
  await a.cartelle.consentiInAnticipo(ID_PIXEL, uno)
  const cUno = (await a.cartelle.consensiDi(ID_PIXEL)).find((c) => c.nome === 'uno')
  await a.cartelle.revoca(ID_PIXEL, cUno.cartellaId)
  const bloccata = (await a.cartelle.consensiDi(ID_PIXEL)).find((c) => c.bloccata)
  assert.ok(bloccata, 'la revoca l\'ha bloccata')
  return { uno, bloccata }
}

test('SBLOC-R-01 il registro: la carta nomina dispositivo e cartella e non scrive; eseguito, il blocco va via e la cartella NON diventa consentita', async (t) => {
  const a = ambiente(t)
  const { uno, bloccata } = await bloccaUno(a)
  const b = await registroCon(a.remoto)
  try {
    const ospite = b.giri[0].input.onTelefoniFn
    const carta = await ospite('remote_phone_folder_unblock', { phone: 'abcd1234', folder: bloccata.cartellaId }, { fase: 'anteprima', toolCallId: 'c1' })
    assert.equal(carta.carta, true)
    assert.equal(carta.azione.tipo, 'remote_phone_folder_unblock')
    assert.equal(carta.azione.cartella.nome, 'uno')
    assert.equal(carta.azione.telefono.nome, 'Pixel')
    assert.ok((await a.cartelle.consensiDi(ID_PIXEL)).some((c) => c.bloccata), 'l\'anteprima non ha sbloccato')
    const fatto = await ospite('remote_phone_folder_unblock', { phone: 'abcd1234', folder: uno }, { fase: 'esegui', toolCallId: 'c1' })
    assert.match(fatto.testo, /^Unblocked "uno" .* it is not allowed by itself\.$/u)
    const dopo = await a.cartelle.consensiDi(ID_PIXEL)
    assert.equal(dopo.some((c) => c.bloccata), false, 'non è più bloccata')
    assert.equal(dopo.some((c) => c.nome === 'uno'), false, 'e non è diventata consentita da sola')
    const ancora = await ospite('remote_phone_folder_unblock', { phone: 'abcd1234', folder: bloccata.cartellaId }, { fase: 'anteprima', toolCallId: 'c2' })
    assert.equal(ancora.ok, false, 'una cartella non bloccata si rifiuta')
    assert.match(ancora.messaggio, /No folder blocked for .* Nothing was unblocked\.$/u)
  } finally { await b.via() }
})

test('SBLOC-R-02 dal giro di un dispositivo non si sblocca, né in anteprima né eseguito (il verso del PC è SBLOC-R-01)', async (t) => {
  const a = ambiente(t)
  const { bloccata } = await bloccaUno(a)
  const b = await registroCon(a.remoto)
  try {
    b.giri[0].input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r1' }); b.giri[0].risolvi({ ok: true })
    await b.registro.attendiAssestamento?.(b.sessionId)
    const r = b.registro.resume(b.sessionId, 'dal tablet: sblocca uno', [], { dispositivoDelGiro: ID_PIXEL })
    assert.equal(r?.erroreAvvio, undefined, JSON.stringify(r))
    const ospite = b.giri.at(-1).input.onTelefoniFn
    for (const fase of ['anteprima', 'esegui']) {
      const no = await ospite('remote_phone_folder_unblock', { phone: 'abcd1234', folder: bloccata.cartellaId }, { fase, toolCallId: 'd1' })
      assert.equal(no.ok, false, fase)
      assert.match(no.messaggio, /only from a conversation on this computer, not from a device's turn\. Nothing was unblocked\.$/u)
    }
    assert.ok((await a.cartelle.consensiDi(ID_PIXEL)).some((c) => c.bloccata), 'ancora bloccata')
  } finally { await b.via() }
})
