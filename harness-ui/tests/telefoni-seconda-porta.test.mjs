/*
 * R5.12 — la SECONDA PORTA dei telefoni collegati (owner 18/10/2026: «Elenca, apre il QR, revoca»; «Carta sempre, anche in Accesso
 *   pieno» per il QR). Quattro piani: il kernel (offerta, carta, Accesso pieno), il registro (l'ospite: che cosa vede il modello, chi
 *   ha la porta), il coordinatore del remoto (il QR dalla chat non accende niente) e la rotta della finestra (`soloSeAcceso`).
 *   Le condizioni della CLI (18/10): senza ospite nessuna traccia nel testo del modello; al modello mai chiavi, gettoni o codici;
 *   senza nessuno davanti `pair` e `revoke` non si legano.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
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
  assert.deepEqual(soloTelefoni((await giro(c, [], { ospite: OSPITE })).offerti[0]), ['remote_phones', 'remote_phone_pair', 'remote_control', 'remote_phone_revoke', 'remote_phone_folders', 'remote_phone_folder_allow', 'remote_phone_folder_revoke', 'remote_phone_folder_unblock', 'remote_device_send_file']) // 27/10: + sbloccare (cartelle bloccate, B4) · R5.12 23/10: + le cartelle · R5.14: + remote_control, accanto al QR · R5.13 (24/10): + mandare un file
  const senza = await giro(c, [])
  assert.deepEqual(soloTelefoni(senza.offerti[0]), [])
  assert.doesNotMatch(senza.sistemi[0], /remote_phone/u, 'richiesta CLI 18/10: nessuna traccia nel testo che riceve il modello')
  assert.deepEqual(soloTelefoni((await giro(c, [], { ospite: OSPITE, extra: { agentRole: 'child' } })).offerti[0]), [])
  assert.deepEqual(soloTelefoni((await giro(c, [], { ospite: OSPITE, extra: { modalitaOperativa: 'piano' } })).offerti[0]), ['remote_phones', 'remote_phone_folders'])
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
  /* R5.14 (owner 23/10/2026, seconda tornata): accendere e spegnere il remoto dal modello, carta SEMPRE, anche in Accesso pieno */
  for (const on of [true, false]) {
    const acc = await giro(c, [chiama('d', 'remote_control', { on })], { ospite: OSPITE, risposta: false, extra: pieno })
    assert.equal(acc.domande.length, 1, `la carta di remote_control on=${on} c'è anche in Accesso pieno`)
    assert.deepEqual(acc.ospite.map(([, , f]) => f), ['anteprima'])
    assert.match(acc.esito('d'), /^REFUSED\./u)
  }
})

/* ——— il registro: l'ospite vero, con un remoto finto ——— */
function remotoFinto({ acceso = true, disponibile = true, sceltaFatta = true, relay = { modo: 'proprio', url: 'https://relay.example/' }, impostaFallisce = false } = {}) {
  const chiamate = []
  /* R5.14: lo stato si cambia con `imposta`, come il coordinatore vero (`remoto/index.mjs`): acceso solo col ponte scelto */
  const s = { acceso, sceltaFatta, relay }
  const telefoni = [
    { id: 'abcd1234efgh5678', endpointId: 'ENDPOINT-SEGRETO', nome: 'Pixel di Nino‮', piattaforma: 'Android', ultimaVoltaAlle: Date.UTC(2026, 9, 18, 14, 20), inLinea: false, sveglia: true, revocatoAlle: null },
    { id: 'zzzz9999yyyy8888', endpointId: 'ALTRO', nome: 'iPad', inLinea: true, revocatoAlle: null },
    { id: 'rrrr0000rrrr0000', endpointId: 'VECCHIO', nome: 'Vecchio', revocatoAlle: 1, revocatoDa: 'pc' },
  ]
  return {
    chiamate,
    stato: async () => ({ disponibile, acceso: s.acceso, sceltaFatta: s.sceltaFatta, relay: s.relay, telefoni, attese: [{ id: 'a', codice: '123456' }] }),
    imposta: async (x) => {
      chiamate.push(['imposta', x])
      if (impostaFallisce) throw Object.assign(new Error('no'), { code: 'REMOTE_START_FAILED' })
      if (x.relay !== undefined) { s.relay = x.relay; s.sceltaFatta = true }
      if (x.acceso !== undefined) { if (x.acceso && !s.sceltaFatta) throw Object.assign(new Error('no'), { code: 'REMOTE_RELAY_NOT_CHOSEN' }); s.acceso = x.acceso }
    },
    /* la finestra che risponde alla carta scrive il ponte scelto PRIMA del sì (l'indirizzo non passa dal kernel) */
    sceglieLaPersona: (r) => { s.relay = r; s.sceltaFatta = true },
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

test('TEL-R-02 — il QR: col remoto acceso la carta, e l\'ospite NON apre l\'offerta (il gettone non passa dal kernel); spento ⇒ la carta lo dice (R5.14)', async () => {
  const remoto = remotoFinto()
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    assert.deepEqual(await ospite('remote_phone_pair', {}, { fase: 'anteprima' }), { ok: true, carta: true, azione: { tipo: 'remote_phone_pair', telefoni: 2 } })
    const fatto = await ospite('remote_phone_pair', {}, { fase: 'esegui' })
    assert.match(fatto.testo, /^The pairing QR code is now on the person's screen/u)
    assert.deepEqual(remoto.chiamate, [], 'nessun QR aperto dal registro')
  } finally { await b.via() }
  /* R5.14 (owner 23/10/2026: «spento ⇒ si accende dalla carta col clic della persona») — niente più rifiuto: la carta dice che è spento */
  const remotoSpento = remotoFinto({ acceso: false })
  const spento = await registroCon({ remoto: remotoSpento })
  try {
    const r = await spento.finta.giro(0).input.onTelefoniFn('remote_phone_pair', {}, { fase: 'anteprima' })
    assert.deepEqual(r, { ok: true, carta: true, azione: { tipo: 'remote_phone_pair', telefoni: 2, acceso: false, ponte: 'proprio' } })
    assert.deepEqual(remotoSpento.chiamate, [], 'l\'anteprima non accende niente')
  } finally { await spento.via() }
})

test('TEL-R-05 — R5.14, il QR a remoto spento: dopo il sì si accende e poi c\'è il QR; senza ponte scelto o se l\'accensione fallisce, resta spento e lo dice', async () => {
  const remoto = remotoFinto({ acceso: false, sceltaFatta: false, relay: null })
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    const carta = await ospite('remote_phone_pair', {}, { fase: 'anteprima' })
    assert.deepEqual(carta.azione, { tipo: 'remote_phone_pair', telefoni: 2, acceso: false, ponte: null })
    // AL CONTRARIO: un sì senza ponte scelto non accende (la finestra non l'ha scritto)
    const senzaPonte = await ospite('remote_phone_pair', {}, { fase: 'esegui' })
    assert.deepEqual([senzaPonte.ok, /did not choose how devices reach this computer, so remote control stays off\. No QR code was shown\.$/u.test(senzaPonte.messaggio)], [false, true])
    assert.deepEqual(remoto.chiamate, [])
    // la persona sceglie sulla carta, la finestra lo scrive, poi il sì: si accende
    remoto.sceglieLaPersona({ modo: 'n0' })
    const fatto = await ospite('remote_phone_pair', {}, { fase: 'esegui' })
    assert.match(fatto.testo, /^Remote control is now on\. The pairing QR code is now on the person's screen/u)
    assert.deepEqual(remoto.chiamate, [['imposta', { acceso: true }]], 'accende e basta: il QR lo apre la finestra')
    // già acceso: non riaccende
    const ancora = await ospite('remote_phone_pair', {}, { fase: 'esegui' })
    assert.match(ancora.testo, /^The pairing QR code is now on/u)
    assert.equal(remoto.chiamate.length, 1)
  } finally { await b.via() }
  const rotto = remotoFinto({ acceso: false, impostaFallisce: true })
  const r2 = await registroCon({ remoto: rotto })
  try {
    /* REV4-C1a (24/10/2026): l'anteprima prima dell'esecuzione, come fa sempre il kernel — una carta di cui non si sa che cosa ha
       mostrato, a remoto spento, ora non accende (TEL-REV4-C1a) */
    await r2.finta.giro(0).input.onTelefoniFn('remote_phone_pair', {}, { fase: 'anteprima' })
    const esito = await r2.finta.giro(0).input.onTelefoniFn('remote_phone_pair', {}, { fase: 'esegui' })
    assert.deepEqual([esito.ok, esito.messaggio], [false, 'Remote control could not be turned on (REMOTE_START_FAILED). No QR code was shown.'])
  } finally { await r2.via() }
})

test('TEL-R-06 — R5.14, remote_control: già com\'è chiesto ⇒ niente carta e lo dice; altrimenti la carta, e solo dopo il sì cambia', async () => {
  const remoto = remotoFinto({ acceso: true, relay: { modo: 'n0' } })
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    assert.deepEqual(await ospite('remote_control', { on: true }, { fase: 'anteprima' }), { ok: true, carta: false })
    assert.match((await ospite('remote_control', { on: true }, { fase: 'esegui' })).testo, /^Remote control is already on \(devices reach this computer through the free servers by n0\)\. Nothing changed\.$/u)
    // spegnere: la carta, poi il sì spegne
    const carta = await ospite('remote_control', { on: false }, { fase: 'anteprima' })
    assert.deepEqual(carta, { ok: true, carta: true, azione: { tipo: 'remote_control', acceso: false, ponte: 'n0', telefoni: 2, inLinea: 1 } })
    assert.deepEqual(remoto.chiamate, [], 'l\'anteprima non spegne')
    assert.match((await ospite('remote_control', { on: false }, { fase: 'esegui' })).testo, /^Remote control is off\. Paired devices \(2\) cannot reach this computer until it is on again; they stay paired\.$/u)
    assert.deepEqual(remoto.chiamate, [['imposta', { acceso: false }]])
    // riaccendere proponendo il server proprio: la carta porta la proposta; la finestra scrive il ponte, poi il sì accende
    const accendi = await ospite('remote_control', { on: true, relay: 'own' }, { fase: 'anteprima' })
    assert.deepEqual(accendi.azione, { tipo: 'remote_control', acceso: true, ponte: 'n0', ponteProposto: 'proprio', telefoni: 2, inLinea: 1 })
    remoto.sceglieLaPersona({ modo: 'proprio', url: 'https://mio.example/' })
    const acceso = await ospite('remote_control', { on: true, relay: 'own' }, { fase: 'esegui' })
    assert.match(acceso.testo, /^Remote control is on: paired devices \(2\) can reach this computer through the person's own server\. To connect a new device, use remote_phone_pair\.$/u)
    assert.equal(acceso.testo.includes('mio.example'), false, 'l\'indirizzo non arriva al modello')
    // acceso col ponte proprio, chiedere «free»: c'è da cambiare ⇒ carta
    assert.equal((await ospite('remote_control', { on: true, relay: 'free' }, { fase: 'anteprima' })).carta, true)
    // AL CONTRARIO: argomenti storti, niente carta e niente cambi
    for (const args of [{}, { on: 'si' }, { on: true, relay: 'n0' }]) {
      const r = await ospite('remote_control', args, { fase: 'anteprima' })
      assert.equal(r.ok, false, JSON.stringify(args))
    }
    assert.deepEqual(remoto.chiamate, [['imposta', { acceso: false }], ['imposta', { acceso: true }]], 'spento una volta, riacceso una volta, nient\'altro')
  } finally { await b.via() }
  const nonC = await registroCon({ remoto: remotoFinto({ disponibile: false }) })
  try {
    assert.deepEqual(await nonC.finta.giro(0).input.onTelefoniFn('remote_control', { on: true }, { fase: 'anteprima' }), { ok: false, messaggio: 'Remote control is not available on this computer. Nothing changed.' })
  } finally { await nonC.via() }
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

/* ------------------------------------------------------------------------------------------------------------------------
 * Revisione avversaria a blocco 3 (24/10/2026, `REVISIONE-BLOCCO-3-2026-10-24.md` §3): le sonde del revisore diventano prove.
 * ------------------------------------------------------------------------------------------------------------------------ */
import { configuraRelay } from '../src/remoto/trasporto-iroh.mjs'

test('TEL-REV3-C1 — la carta del QR nata a remoto ACCESO non lo riaccende se la persona l\'ha spento prima del sì; nata SPENTA, sì', async () => {
  const remoto = remotoFinto({ acceso: true, relay: { modo: 'n0' } })
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    const carta = await ospite('remote_phone_pair', {}, { fase: 'anteprima', toolCallId: 'c1' })
    assert.equal(carta.azione.acceso, undefined, 'la carta non prometteva di accendere')
    await remoto.imposta({ acceso: false }) // la persona spegne dalla schermata «Dispositivi collegati»
    remoto.chiamate.length = 0
    const fatto = await ospite('remote_phone_pair', {}, { fase: 'esegui', toolCallId: 'c1' })
    assert.deepEqual(remoto.chiamate, [], '⛔ prima il sì riaccendeva il remoto spento dalla persona')
    assert.equal(fatto.ok, false)
    assert.match(fatto.messaggio, /turned off after the card was shown/u)
    /* AL CONTRARIO: la carta nata a remoto spento promette di accenderlo, e il sì lo accende */
    const spenta = await ospite('remote_phone_pair', {}, { fase: 'anteprima', toolCallId: 'c2' })
    assert.equal(spenta.azione.acceso, false)
    const acceso = await ospite('remote_phone_pair', {}, { fase: 'esegui', toolCallId: 'c2' })
    assert.equal(acceso.ok, true)
    assert.deepEqual(remoto.chiamate, [['imposta', { acceso: true }]])
  } finally { await b.via() }
})

function remotoVeroSuDisco(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-rev3-c3-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const ferroFinto = { presetMinimal: () => {}, presetN0: () => {}, RelayMap: { empty: () => ({ insert: () => {} }) }, RelayMode: { custom: () => 'c', customFromUrls: () => 'u', disabled: () => 'd' } }
  let falliscaAccensione = false
  const r = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => ({}), nomePc: 'PC',
    avviaTrasporto: async ({ relay }) => {
      if (falliscaAccensione) throw Object.assign(new Error('rete'), { code: 'REMOTE_START_FAILED' })
      configuraRelay(ferroFinto, { relayMode: () => {} }, relay)
      return { id: 'pc-id', relayDiCasa: () => 'x', indirizziDiretti: () => [], ferma: async () => {} }
    },
  })
  return { r, falliscaAccensione: (si) => { falliscaAccensione = si }, fileImpostazioni: join(dir, 'remoto', 'impostazioni.json') } // REV4-C3a: il file, per il riavvio
}

test('TEL-REV3-C3 — un indirizzo storto si rifiuta GIÀ alla scelta del ponte (la carta resta aperta); uno buono passa', async (t) => {
  const { r } = remotoVeroSuDisco(t)
  for (const url of ['non è un indirizzo', 'http://relay.example.com/?token=T', 'ftp://relay.example.com/']) {
    await assert.rejects(r.imposta({ relay: { modo: 'proprio', url } }), { code: 'REMOTE_RELAY_INVALID' }, url)
  }
  assert.equal((await r.stato()).sceltaFatta, false, 'niente salvato')
  /* AL CONTRARIO: https (e http verso la propria macchina, per le prove) si salvano */
  await r.imposta({ relay: { modo: 'proprio', url: 'https://relay.example.com/?token=T' } })
  await r.imposta({ relay: { modo: 'proprio', url: 'http://127.0.0.1:3340/' } })
  assert.equal((await r.stato()).sceltaFatta, true)
})

test('TEL-REV3-C3b — un\'accensione che fallisce NON lascia lo stato a «acceso»; quella che riesce sì', async (t) => {
  const { r, falliscaAccensione } = remotoVeroSuDisco(t)
  await r.imposta({ relay: { modo: 'n0' } })
  falliscaAccensione(true)
  await assert.rejects(r.imposta({ acceso: true }), { code: 'REMOTE_START_FAILED' })
  assert.equal((await r.stato()).acceso, false, '⛔ prima restava «acceso» con l\'errore accanto')
  falliscaAccensione(false)
  await r.imposta({ acceso: true })
  assert.equal((await r.stato()).acceso, true)
})

/* ======================================================================================================================
 * Revisione avversaria a blocco 4 (24/10/2026, `REVISIONE-BLOCCO-4-2026-10-24.md` §1, Collega): le sonde del revisore diventano prove.
 * ==================================================================================================================== */

test('TEL-REV4-C1b-KERNEL — un fornitore che non manda l\'id della chiamata: anteprima, carta ed esecuzione arrivano SENZA toolCallId', async (t) => {
  /* la dimostrazione chiesta dal rapporto: il kernel passa `toolCallId: c.id` (talosHarness.mjs, ramo di ATTREZZI_TELEFONI) e una
     chiamata senza `id` resta senza (`apriPosizione` copia `pezzo.id`; la risposta intera passa `tool_calls` com'è) */
  const c = cartella(t)
  const visti = []
  let n = 0
  await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: [...ATTREZZI_TELEFONI],
    fetchDiRete: async () => {
      const message = n++ === 0 ? { role: 'assistant', content: null, tool_calls: [{ type: 'function', function: { name: 'remote_phone_pair', arguments: '{}' } }] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    onTelefoniFn: async (nome, _a, { fase, toolCallId }) => { visti.push([fase, toolCallId ?? null]); return fase === 'anteprima' ? { ok: true, carta: true, azione: { tipo: nome } } : { ok: true, testo: 'ok' } },
    chiediApprovazioneFn: async (azione) => { visti.push(['carta', azione?.toolCallId ?? null]); return true },
  })
  assert.deepEqual(visti, [['anteprima', null], ['carta', null], ['esegui', null]], 'REV4-C1b è raggiungibile: si cura')
})

test('TEL-REV4-C1b — senza toolCallId la carta del QR nata a remoto ACCESO non lo riaccende se la persona l\'ha spento; nata spenta, sì', async () => {
  const remoto = remotoFinto({ acceso: true, relay: { modo: 'n0' } })
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    await ospite('remote_phone_pair', {}, { fase: 'anteprima' })
    await remoto.imposta({ acceso: false })
    remoto.chiamate.length = 0
    const fatto = await ospite('remote_phone_pair', {}, { fase: 'esegui' })
    assert.deepEqual(remoto.chiamate, [], '⛔ prima, senza id, il sì riaccendeva il remoto spento dalla persona')
    assert.equal(fatto.ok, false)
    assert.match(fatto.messaggio, /turned off after the card was shown/u)
    /* AL CONTRARIO: senza id, la carta nata a remoto spento promette di accenderlo, e il sì lo accende */
    const spenta = await ospite('remote_phone_pair', {}, { fase: 'anteprima' })
    assert.equal(spenta.azione.acceso, false)
    const acceso = await ospite('remote_phone_pair', {}, { fase: 'esegui' })
    assert.equal(acceso.ok, true)
    assert.deepEqual(remoto.chiamate, [['imposta', { acceso: true }]])
  } finally { await b.via() }
})

test('TEL-REV4-C1a — 64 carte del QR dopo la nostra la fanno uscire dalla memoria: a remoto spento il sì NON lo riaccende (non si sa che cosa ha mostrato)', async () => {
  const remoto = remotoFinto({ acceso: true, relay: { modo: 'n0' } })
  const b = await registroCon({ remoto })
  try {
    const ospite = b.finta.giro(0).input.onTelefoniFn
    await ospite('remote_phone_pair', {}, { fase: 'anteprima', toolCallId: 'mia' })
    for (let i = 0; i < 64; i++) await ospite('remote_phone_pair', {}, { fase: 'anteprima', toolCallId: `altra-${i}` })
    await remoto.imposta({ acceso: false })
    remoto.chiamate.length = 0
    const fatto = await ospite('remote_phone_pair', {}, { fase: 'esegui', toolCallId: 'mia' })
    assert.deepEqual(remoto.chiamate, [], '⛔ prima, uscita dalla Map, la carta nata «acceso» riaccendeva')
    assert.equal(fatto.ok, false)
    assert.match(fatto.messaggio, /no longer known/u)
    /* AL CONTRARIO: a remoto acceso una carta dimenticata mostra il QR come sempre (niente da accendere) */
    await remoto.imposta({ acceso: true })
    remoto.chiamate.length = 0
    const qr = await ospite('remote_phone_pair', {}, { fase: 'esegui', toolCallId: 'altra-0' })
    assert.equal(qr.ok, true)
    assert.deepEqual(remoto.chiamate, [])
  } finally { await b.via() }
})

test('TEL-REV4-C3a — il QR dalla SCHERMATA (apriAccoppiamento): un\'accensione fallita NON lascia «acceso»; quella che riesce sì', async (t) => {
  const { r, falliscaAccensione, fileImpostazioni } = remotoVeroSuDisco(t)
  await r.imposta({ relay: { modo: 'n0' } })
  falliscaAccensione(true)
  await assert.rejects(r.apriAccoppiamento(), { code: 'REMOTE_START_FAILED' })
  assert.equal((await r.stato()).acceso, false, '⛔ prima salvava «acceso» PRIMA di accendere e lo lasciava lì')
  /* e sul DISCO: al riavvio `riprendi` legge il file e, con «acceso», riproverebbe da solo */
  assert.equal(JSON.parse(readFileSync(fileImpostazioni, 'utf8')).acceso, false, '⛔ il file diceva «acceso» dopo un\'accensione fallita')
  falliscaAccensione(false)
  const offerta = await r.apriAccoppiamento()
  assert.equal(typeof offerta.gettone, 'string')
  assert.equal((await r.stato()).acceso, true)
})

test('TEL-REV4-C3b — «spegni» mentre l\'accensione è in corso: alla fine il trasporto è chiuso e lo stato dice spento', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-rev4-c3b-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  let avviati = 0; let fermati = 0
  const r = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false, elenca: () => [] }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => ({}), nomePc: 'PC',
    avviaTrasporto: async () => { await new Promise((ok) => setTimeout(ok, 150)); avviati += 1; return { id: 'pc-id', relayDiCasa: () => 'x', indirizziDiretti: () => [], ferma: async () => { fermati += 1 } } },
  })
  await r.imposta({ relay: { modo: 'n0' } })
  const accendi = r.imposta({ acceso: true })
  await new Promise((ok) => setTimeout(ok, 20))
  await r.imposta({ acceso: false })
  const rispostaSuperata = await accendi
  assert.equal(rispostaSuperata.acceso, false, 'la richiesta superata risponde con lo stato vero, senza errore')
  const s = await r.stato()
  assert.deepEqual({ acceso: s.acceso, pcId: s.pcId, avviati, fermati }, { acceso: false, pcId: null, avviati: 1, fermati: 1 },
    '⛔ prima: acceso false ma pcId «pc-id», trasporto avviato e mai fermato — il PC restava raggiungibile con la finestra su «spento»')
  /* AL CONTRARIO: riaccendere dopo funziona, e un'accensione non disturbata resta accesa */
  await r.imposta({ acceso: true })
  assert.equal((await r.stato()).pcId, 'pc-id')
  assert.equal((await r.stato()).acceso, true)
  /* spegni e RIACCENDI mentre la prima accensione è ancora in volo: vince l'ultima scelta (acceso), e l'avvio superato non la
     riscrive a «spento» quando finisce */
  await r.imposta({ acceso: false })
  avviati = 0; fermati = 0
  const prima = r.imposta({ acceso: true })
  await new Promise((ok) => setTimeout(ok, 20))
  await r.imposta({ acceso: false })
  const seconda = r.imposta({ acceso: true })
  await prima.catch(() => {})
  await seconda
  const finale = await r.stato()
  assert.deepEqual({ acceso: finale.acceso, pcId: finale.pcId, avviati, fermati }, { acceso: true, pcId: 'pc-id', avviati: 2, fermati: 1 })
  await r.imposta({ acceso: false })
  /* il QR dalla schermata con lo «spegni» a metà accensione: niente QR, il codice che la finestra conosce (REMOTE_OFF), e resta spento */
  const qr = r.apriAccoppiamento()
  await new Promise((ok) => setTimeout(ok, 20))
  await r.imposta({ acceso: false })
  await assert.rejects(qr, { code: 'REMOTE_OFF' })
  assert.equal((await r.stato()).acceso, false)
  assert.equal((await r.stato()).pcId, null)
})
