/*
 * R5.12 — la SECONDA PORTA dei telefoni collegati (owner 18/10/2026: «Elenca, apre il QR, revoca»; «Carta sempre, anche in Accesso
 *   pieno» per il QR). Quattro piani: il kernel (offerta, carta, Accesso pieno), il registro (l'ospite: che cosa vede il modello, chi
 *   ha la porta), il coordinatore del remoto (il QR dalla chat non accende niente) e la rotta della finestra (`soloSeAcceso`).
 *   Le condizioni della CLI (18/10): senza ospite nessuna traccia nel testo del modello; al modello mai chiavi, gettoni o codici;
 *   senza nessuno davanti `pair` e `revoke` non si legano.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ATTREZZI_TELEFONI } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { creaRemoto } from '../src/remoto/index.mjs'
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-telefoni-k-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
async function giro(c, risposte, opzioni = {}) {
  let n = 0
  const offerti = []
  const sistemi = []
  const domande = []
  const ospite = []
  const r = await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: [...ATTREZZI_TELEFONI],
    fetchDiRete: async (_url, init) => {
      const corpo = JSON.parse(init?.body ?? '{}')
      offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
      sistemi.push(JSON.stringify(corpo.messages ?? []))
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    ...(opzioni.ospite ? { onTelefoniFn: async (nome, argomenti, fase) => { ospite.push([nome, argomenti, fase.fase]); return opzioni.ospite(nome, argomenti, fase) } } : {}),
    ...(opzioni.extra ?? {}),
    chiediApprovazioneFn: opzioni.risposta === undefined ? undefined : async (azione) => { domande.push(azione); return opzioni.risposta },
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti, sistemi, domande, ospite }
}
const OSPITE = (nome, _argomenti, { fase }) => {
  if (nome === 'remote_phones') return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: 'Remote control is on. Paired devices: 1.' }
  if (fase === 'anteprima') return { ok: true, carta: true, azione: { tipo: nome } }
  return { ok: true, testo: nome === 'remote_phone_pair' ? 'The pairing QR code is now on the person\'s screen.' : 'Disconnected "Pixel".' }
}
const soloTelefoni = (elenco) => elenco.filter((n) => ATTREZZI_TELEFONI.has(n))

test('TEL-K-01 — si offrono SOLO con l\'ospite; senza (la CLI) nessuna traccia; a una figlia no; in Piano solo l\'elenco', async (t) => {
  const c = cartella(t)
  assert.deepEqual(soloTelefoni((await giro(c, [], { ospite: OSPITE })).offerti[0]), ['remote_phones', 'remote_phone_pair', 'remote_phone_revoke'])
  const senza = await giro(c, [])
  assert.deepEqual(soloTelefoni(senza.offerti[0]), [])
  assert.doesNotMatch(senza.sistemi[0], /remote_phone/u, 'richiesta CLI 18/10: nessuna traccia nel testo che riceve il modello')
  assert.deepEqual(soloTelefoni((await giro(c, [], { ospite: OSPITE, extra: { agentRole: 'child' } })).offerti[0]), [])
  assert.deepEqual(soloTelefoni((await giro(c, [], { ospite: OSPITE, extra: { modalitaOperativa: 'piano' } })).offerti[0]), ['remote_phones'])
})

test('TEL-K-02 — l\'elenco non chiede niente; il QR e la revoca passano dalla carta: sì ⇒ esegue, no ⇒ REFUSED senza esecuzione', async (t) => {
  const c = cartella(t)
  const elenco = await giro(c, [chiama('a', 'remote_phones', {})], { ospite: OSPITE, risposta: true })
  assert.deepEqual(elenco.domande, [])
  assert.match(elenco.esito('a'), /^Remote control is on/u)
  const si = await giro(c, [chiama('b', 'remote_phone_pair', {})], { ospite: OSPITE, risposta: true })
  assert.equal(si.domande[0].tipo, 'remote_phone_pair')
  assert.deepEqual(si.ospite.map(([, , f]) => f), ['anteprima', 'esegui'])
  const no = await giro(c, [chiama('c', 'remote_phone_revoke', { phone: 'abcd1234' })], { ospite: OSPITE, risposta: false })
  assert.equal(no.domande[0].tipo, 'remote_phone_revoke')
  assert.deepEqual(no.ospite.map(([, , f]) => f), ['anteprima'])
  assert.match(no.esito('c'), /^REFUSED\./u)
})

test('TEL-K-03 — Accesso pieno (owner 18/10): la revoca senza carta, il QR CON la carta, sempre', async (t) => {
  const c = cartella(t)
  const pieno = { livelloAccesso: 'accesso-pieno' }
  const revoca = await giro(c, [chiama('a', 'remote_phone_revoke', { phone: 'abcd1234' })], { ospite: OSPITE, risposta: true, extra: pieno })
  assert.deepEqual(revoca.domande, [])
  assert.match(revoca.esito('a'), /Full access: done without asking the person\./u)
  const qr = await giro(c, [chiama('b', 'remote_phone_pair', {})], { ospite: OSPITE, risposta: false, extra: pieno })
  assert.equal(qr.domande.length, 1, 'la carta del QR c\'è anche in Accesso pieno')
  assert.deepEqual(qr.ospite.map(([, , f]) => f), ['anteprima'])
  assert.match(qr.esito('b'), /^REFUSED\./u)
})

/* ——— il registro: l'ospite vero, con un remoto finto ——— */
function remotoFinto({ acceso = true, disponibile = true } = {}) {
  const chiamate = []
  const telefoni = [
    { id: 'abcd1234efgh5678', endpointId: 'ENDPOINT-SEGRETO', nome: 'Pixel di Nino‮', piattaforma: 'Android', ultimaVoltaAlle: Date.UTC(2026, 9, 18, 14, 20), inLinea: false, sveglia: true, revocatoAlle: null },
    { id: 'zzzz9999yyyy8888', endpointId: 'ALTRO', nome: 'iPad', inLinea: true, revocatoAlle: null },
    { id: 'rrrr0000rrrr0000', endpointId: 'VECCHIO', nome: 'Vecchio', revocatoAlle: 1, revocatoDa: 'pc' },
  ]
  return {
    chiamate,
    stato: async () => ({ disponibile, acceso, sceltaFatta: true, relay: { modo: 'proprio', url: 'https://relay.example/' }, telefoni, attese: [{ id: 'a', codice: '123456' }] }),
    revoca: async (id) => { chiamate.push(['revoca', id]); return { id } },
    apriAccoppiamento: async () => { chiamate.push(['apri']); return { gettone: 'GETTONE', qr: 'talos-remote:1?t=GETTONE' } },
  }
}
function giriFinti() {
  const giri = []
  return {
    avviaSessioneFn: async (input) => {
      let risolvi
      const fine = new Promise((ok) => { risolvi = ok })
      giri.push({ input, risolvi })
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` })
      return fine
    },
    giro: (k) => giri[k],
    chiudiTutti() { giri.forEach((g, k) => { if (!g.risolvi) return; g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` }); g.risolvi({ ok: true }); g.risolvi = null }) },
  }
}
async function registroCon({ remoto, senzaInterfaccia = false } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-telefoni-reg-'))
  const progetto = join(radice, 'progetto')
  await mkdir(progetto, { recursive: true })
  const finta = giriFinti()
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    ...(remoto !== undefined ? { remotoFn: () => remoto } : {}),
  })
  registro.avvia('task-vero', senzaInterfaccia ? { senzaInterfaccia: true } : {})
  return { finta, via: async () => { finta.chiudiTutti(); await rimuoviCartellaDiProvaAttesa(radice) } }
}

test('TEL-R-01 — al modello solo nome, stato, ultimo contatto e id corto: mai endpoint, relay, gettone o codice; i revocati no', async () => {
  const remoto = remotoFinto()
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    assert.equal(typeof ospite, 'function')
    assert.deepEqual(await ospite('remote_phones', {}, { fase: 'anteprima' }), { ok: true, carta: false })
    const { testo } = await ospite('remote_phones', {}, { fase: 'esegui' })
    assert.match(testo, /^Remote control is on\. Paired devices: 2\./u)
    assert.match(testo, /"Pixel di Nino " · id abcd1234 · last seen 2026-10-18T14:20:00\.000Z/u, 'il carattere di controllo bidi diventa uno spazio')
    assert.match(testo, /"iPad" · id zzzz9999 · connected now/u)
    for (const segreto of ['ENDPOINT-SEGRETO', 'relay.example', 'GETTONE', '123456', 'Vecchio', 'efgh5678']) assert.equal(testo.includes(segreto), false, segreto)
  } finally { await b.via() }
})

test('TEL-R-02 — il QR: col remoto acceso la carta, e l\'ospite NON apre l\'offerta (il gettone non passa dal kernel); spento ⇒ rifiuto senza carta', async () => {
  const remoto = remotoFinto()
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    assert.deepEqual(await ospite('remote_phone_pair', {}, { fase: 'anteprima' }), { ok: true, carta: true, azione: { tipo: 'remote_phone_pair', telefoni: 2 } })
    const fatto = await ospite('remote_phone_pair', {}, { fase: 'esegui' })
    assert.match(fatto.testo, /^The pairing QR code is now on the person's screen/u)
    assert.deepEqual(remoto.chiamate, [], 'nessun QR aperto dal registro')
  } finally { await b.via() }
  const spento = await registroCon({ remoto: remotoFinto({ acceso: false }) })
  try {
    const r = await spento.finta.giro(0).input.onTelefoniFn('remote_phone_pair', {}, { fase: 'anteprima' })
    assert.deepEqual([r.ok, /^Remote control is off: only the person can turn it on/u.test(r.messaggio)], [false, true])
  } finally { await spento.via() }
})

test('TEL-R-03 — la revoca per id corto: la carta col telefono, poi la revoca dell\'id INTERO; un id ambiguo, sconosciuto o revocato si rifiuta', async () => {
  const remoto = remotoFinto()
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    const anteprima = await ospite('remote_phone_revoke', { phone: 'abcd1234' }, { fase: 'anteprima' })
    assert.deepEqual([anteprima.carta, anteprima.azione.tipo, anteprima.azione.telefono.idCorto, anteprima.azione.telefono.endpointId], [true, 'remote_phone_revoke', 'abcd1234', undefined])
    assert.deepEqual(remoto.chiamate, [], 'l\'anteprima non revoca')
    const fatto = await ospite('remote_phone_revoke', { phone: 'abcd1234' }, { fase: 'esegui' })
    assert.match(fatto.testo, /^Disconnected "Pixel di Nino " \(id abcd1234\)/u)
    assert.deepEqual(remoto.chiamate, [['revoca', 'abcd1234efgh5678']])
    for (const phone of ['rrrr0000', 'nessuno1', '', 'a b']) {
      const r = await ospite('remote_phone_revoke', { phone }, { fase: 'anteprima' })
      assert.equal(r.ok, false, phone)
    }
  } finally { await b.via() }
})

test('TEL-R-04 — al contrario: senza nessuno davanti, senza remoto sul server, o a una figlia, la porta non c\'è', async () => {
  const senza = await registroCon({ remoto: remotoFinto(), senzaInterfaccia: true })
  try { assert.equal(senza.finta.giro(0).input.onTelefoniFn, undefined) } finally { await senza.via() }
  const cli = await registroCon({})
  try { assert.equal(cli.finta.giro(0).input.onTelefoniFn, undefined) } finally { await cli.via() }
  const nulla = await registroCon({ remoto: null })
  try {
    const r = await nulla.finta.giro(0).input.onTelefoniFn('remote_phones', {}, { fase: 'esegui' })
    assert.deepEqual([r.ok, r.messaggio], [false, 'Remote control is not available on this computer.'], 'il remoto nasce dopo il registro: fino ad allora lo dice')
  } finally { await nulla.via() }
})

/* ——— il coordinatore e la rotta: il QR chiesto dalla chat non accende il remoto ——— */
function bancoRemoto(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-telefoni-idx-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const avvii = []
  const r = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => ({}), nomePc: 'PC',
    avviaTrasporto: async () => { avvii.push(1); return { id: 'pc-id', relayDiCasa: () => 'https://relay.n0.example/', indirizziDiretti: () => [], ferma: async () => {} } },
  })
  return { r, avvii }
}

test('TEL-I-01 — `soloSeAcceso`: a remoto spento il QR dalla chat si rifiuta e NON accende; acceso dalla schermata, si apre', async (t) => {
  const { r, avvii } = bancoRemoto(t)
  await r.imposta({ relay: { modo: 'n0' } })
  await assert.rejects(r.apriAccoppiamento({ soloSeAcceso: true }), { code: 'REMOTE_OFF' })
  assert.deepEqual([avvii.length, (await r.stato()).acceso], [0, false])
  await r.imposta({ acceso: true })
  const o = await r.apriAccoppiamento({ soloSeAcceso: true })
  assert.match(o.qr, /^talos-remote:1\?pc=pc-id/u)
  assert.equal(avvii.length, 1)
})

test('TEL-H-01 — la rotta della finestra: `{ soloSeAcceso: true }` arriva al remoto; ogni altro corpo non vuoto è QUERY_INVALID; REMOTE_OFF è 409', async (t) => {
  const chiamate = []
  const remoto = {
    apriAccoppiamento: async (o) => { chiamate.push(o); if (o.soloSeAcceso) throw Object.assign(new Error('off'), { code: 'REMOTE_OFF' }); return { gettone: 'g' } },
  }
  const server = createServer(createHttpApp({ staticHandler: async () => null, remotoFn: () => remoto }))
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  t.after(() => new Promise((ok) => server.close(ok)))
  const base = `http://127.0.0.1:${server.address().port}`
  const posta = async (corpo) => {
    const x = await fetch(`${base}/api/v1/remote/pair`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(corpo) })
    return { stato: x.status, json: await x.json() }
  }
  const spento = await posta({ soloSeAcceso: true })
  assert.deepEqual([spento.stato, spento.json.error.code], [409, 'REMOTE_OFF'])
  assert.equal((await posta({})).stato, 200)
  for (const corpo of [{ soloSeAcceso: false }, { soloSeAcceso: 'si' }, { altro: 1 }]) assert.equal((await posta(corpo)).json.error.code, 'QUERY_INVALID', JSON.stringify(corpo))
  assert.deepEqual(chiamate, [{ soloSeAcceso: true }, { soloSeAcceso: false }])
})
