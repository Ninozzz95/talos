/*
 * R5.12 (owner 23/10/2026) — le CARTELLE dei dispositivi dalla chat: la seconda porta di «Consenti a … di lavorare in …» (ogni funzione
 *   dalla sua schermata E dalla chat, dietro la carta). Tre attrezzi del modello, accanto a `remote_phones` / `remote_phone_pair` /
 *   `remote_phone_revoke`:
 *   · `remote_phone_folders` — elenca, sola lettura, nessuna carta;
 *   · `remote_phone_folder_allow` — carta SEMPRE, anche in Accesso pieno (come il QR);
 *   · `remote_phone_folder_revoke` — carta, ma in Accesso pieno niente carta e la nota «Full access: done without asking the person.»
 *     (come `remote_phone_revoke`).
 *   Tre piani: il kernel (offerta, carta, Accesso pieno, rifiuto senza ospite), il registro (l'ospite vero col modulo vero delle
 *   cartelle: che cosa vede il modello, che cosa si scrive) e il remoto vero (`creaRemoto` con i file dei consensi).
 *   ⛔ Al modello mai chiavi, gettoni, il segreto dell'HMAC, endpoint o il codice di 6 cifre.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { talosLavora, ATTREZZI_TELEFONI, SENZA_CARTA_IN_ACCESSO_PIENO } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry, STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs'
import { creaRemoto } from '../src/remoto/index.mjs'
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs'
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const NUOVI = ['remote_phone_folders', 'remote_phone_folder_allow', 'remote_phone_folder_revoke']
const TUTTI = ['remote_phones', 'remote_phone_pair', 'remote_phone_revoke', ...NUOVI]

function cartella(t) {
  // 25/10/2026 (PR #81 della 0.1.37, CI rossa): sul runner la TEMP ha il nome corto di Windows (RUNNER~1); il prodotto mostra il percorso vero (`realpathSync.native`, decisione F-E-001), quindi anche la radice di prova si prende col percorso vero, e l'atteso torna uguale su ogni macchina.
  const c = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-tel-cart-k-')))
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
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: [...TUTTI],
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
/* Un ospite che chiede la carta per allow e revoke e non per l'elenco: il kernel decide il resto (Accesso pieno). */
const OSPITE = (nome, _argomenti, { fase }) => {
  if (nome === 'remote_phones' || nome === 'remote_phone_folders') return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: 'Remote control is on.' }
  if (fase === 'anteprima') return { ok: true, carta: true, azione: { tipo: nome } }
  return { ok: true, testo: `${nome} done.` }
}
const soloNuovi = (elenco) => elenco.filter((n) => NUOVI.includes(n))

test('TCA-K-01 — i tre si offrono SOLO con l\'ospite; senza (la CLI) nessuna traccia; a una figlia no; in Piano solo l\'elenco', async (t) => {
  const c = cartella(t)
  assert.deepEqual(soloNuovi((await giro(c, [], { ospite: OSPITE })).offerti[0]), NUOVI)
  const senza = await giro(c, [])
  assert.deepEqual(soloNuovi(senza.offerti[0]), [])
  assert.doesNotMatch(senza.sistemi[0], /remote_phone_folder/u, 'nessuna traccia nel testo che riceve il modello')
  assert.deepEqual(soloNuovi((await giro(c, [], { ospite: OSPITE, extra: { agentRole: 'child' } })).offerti[0]), [])
  assert.deepEqual(soloNuovi((await giro(c, [], { ospite: OSPITE, extra: { modalitaOperativa: 'piano' } })).offerti[0]), ['remote_phone_folders'])
  for (const nome of NUOVI) {
    assert.ok(ATTREZZI_TELEFONI.has(nome), `${nome} in ATTREZZI_TELEFONI`)
    assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes(nome), `${nome} fra gli estesi predefiniti`)
  }
  assert.equal(SENZA_CARTA_IN_ACCESSO_PIENO.has('remote_phone_folder_allow'), false, 'consentire chiede SEMPRE')
  assert.equal(SENZA_CARTA_IN_ACCESSO_PIENO.has('remote_phone_folder_revoke'), true)
})

test('TCA-K-02 — chiamati senza ospite (o da una figlia senza ospite) si rifiutano al momento dell\'esecuzione, per nome', async (t) => {
  const c = cartella(t)
  for (const extra of [{}, { agentRole: 'child' }]) {
    const r = await giro(c, NUOVI.map((nome, k) => chiama(`n${k}`, nome, { phone: 'abcd1234', path: c, folder: 'x' })), { extra, risposta: true })
    NUOVI.forEach((nome, k) => assert.equal(r.esito(`n${k}`), `${nome} is not available in this session.`, `${nome} ${JSON.stringify(extra)}`))
    assert.deepEqual(r.domande, [], 'nessuna carta')
  }
})

test('TCA-K-03 — l\'elenco non chiede; consentire chiede SEMPRE, anche in Accesso pieno; revocare in Accesso pieno senza carta, con la nota', async (t) => {
  const c = cartella(t)
  const pieno = { livelloAccesso: 'accesso-pieno' }
  const elenco = await giro(c, [chiama('a', 'remote_phone_folders', {})], { ospite: OSPITE, risposta: true, extra: pieno })
  assert.deepEqual(elenco.domande, [])
  assert.doesNotMatch(elenco.esito('a'), /Full access/u)
  for (const extra of [{}, pieno]) {
    const no = await giro(c, [chiama('b', 'remote_phone_folder_allow', { phone: 'abcd1234', path: c })], { ospite: OSPITE, risposta: false, extra })
    assert.equal(no.domande.length, 1, `la carta di «consenti» c'è sempre (${JSON.stringify(extra)})`)
    assert.equal(no.domande[0].tipo, 'remote_phone_folder_allow')
    assert.deepEqual(no.ospite.map(([, , f]) => f), ['anteprima'], 'rifiutata: niente esecuzione')
    assert.match(no.esito('b'), /^REFUSED\./u)
  }
  const si = await giro(c, [chiama('b', 'remote_phone_folder_allow', { phone: 'abcd1234', path: c })], { ospite: OSPITE, risposta: true, extra: pieno })
  assert.deepEqual(si.ospite.map(([, , f]) => f), ['anteprima', 'esegui'])
  assert.doesNotMatch(si.esito('b'), /Full access/u)
  const revocaNormale = await giro(c, [chiama('d', 'remote_phone_folder_revoke', { phone: 'abcd1234', folder: 'x' })], { ospite: OSPITE, risposta: false })
  assert.equal(revocaNormale.domande[0].tipo, 'remote_phone_folder_revoke')
  assert.match(revocaNormale.esito('d'), /^REFUSED\./u)
  const revoca = await giro(c, [chiama('e', 'remote_phone_folder_revoke', { phone: 'abcd1234', folder: 'x' })], { ospite: OSPITE, risposta: false, extra: pieno })
  assert.deepEqual(revoca.domande, [])
  assert.match(revoca.esito('e'), /^remote_phone_folder_revoke done\. Full access: done without asking the person\.$/u)
})

/* ——— il registro: l'ospite vero, col modulo vero delle cartelle e un elenco dei telefoni finto ——— */
const ID_PIXEL = 'abcd1234efgh5678'
function ambiente(t, { acceso = true } = {}) {
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-tel-cart-r-')))
  t.after(() => rimuoviCartellaDiProva(radice))
  const dati = join(radice, 'dati')
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return p }
  const programma = crea('programma')
  const fileConsensi = join(dati, 'remoto', 'consensi.json')
  const fileSegreto = join(dati, 'remoto', 'segreto-cartelle')
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi, fileSegreto, sessionRegistry: { cartellePiuUsate: () => [] }, cartelleEscluse: [dati, programma] })
  const telefoni = [
    { id: ID_PIXEL, endpointId: 'ENDPOINT-SEGRETO', nome: 'Pixel di Nino‮', piattaforma: 'Android', ultimaVoltaAlle: Date.UTC(2026, 9, 23, 14, 20), inLinea: false, revocatoAlle: null },
    { id: 'zzzz9999yyyy8888', endpointId: 'ALTRO', nome: 'iPad', inLinea: true, revocatoAlle: null },
    { id: 'abcdZZZZvecchio0', endpointId: 'VECCHIO', nome: 'Vecchio', revocatoAlle: 1, revocatoDa: 'pc' },
  ]
  const remoto = {
    cartelle,
    stato: async () => ({ disponibile: true, acceso, sceltaFatta: true, relay: { modo: 'proprio', url: 'https://relay.example/?token=GETTONE' }, telefoni, attese: [{ id: 'a', codice: '123456' }] }),
    revoca: async () => { throw new Error('non si revoca il telefono') },
  }
  const consensiSulDisco = () => { try { return readFileSync(fileConsensi, 'utf8') } catch { return null } }
  const segreto = () => readFileSync(fileSegreto, 'utf8').trim()
  return { radice, dati, programma, crea, cartelle, remoto, consensiSulDisco, segreto, fileConsensi }
}
async function registroCon({ remoto, senzaInterfaccia = false } = {}) {
  const radice = realpathSync.native(await mkdtemp(join(tmpdir(), 'talos-tel-cart-reg-')))
  const progetto = join(radice, 'progetto')
  await mkdir(progetto, { recursive: true })
  const giri = []
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => {
      let risolvi
      const fine = new Promise((ok) => { risolvi = ok })
      giri.push({ input, risolvi })
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` })
      return fine
    },
    modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    ...(remoto !== undefined ? { remotoFn: () => remoto } : {}),
  })
  registro.avvia('task-vero', senzaInterfaccia ? { senzaInterfaccia: true } : {})
  return {
    ospite: giri[0].input.onTelefoniFn,
    via: async () => {
      giri.forEach((g, k) => { g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` }); g.risolvi({ ok: true }) })
      await rimuoviCartellaDiProvaAttesa(radice)
    },
  }
}
function senzaSegreti(testo, a) {
  for (const s of ['ENDPOINT-SEGRETO', 'ALTRO', 'relay.example', 'GETTONE', '123456', 'efgh5678', 'yyyy8888', 'Vecchio', a.segreto()]) {
    assert.equal(String(testo).includes(s), false, `segreto nel testo: ${s}`)
  }
}

test('TCA-R-01 — l\'elenco: per dispositivo vivo le sue cartelle con nome, id, percorso, data e provenienza; mancante sul disco; «No folders allowed»', async (t) => {
  const a = ambiente(t, { acceso: false })
  const progetto = a.crea('lavori', 'progetto-A')
  const sparita = a.crea('lavori', 'sparita')
  await a.cartelle.consentiInAnticipo(ID_PIXEL, progetto)
  await a.cartelle.consentiInAnticipo(ID_PIXEL, sparita)
  rimuoviCartellaDiProva(sparita)
  const b = await registroCon({ remoto: a.remoto })
  try {
    assert.deepEqual(await b.ospite('remote_phone_folders', {}, { fase: 'anteprima' }), { ok: true, carta: false })
    const { ok, testo } = await b.ospite('remote_phone_folders', {}, { fase: 'esegui' })
    assert.equal(ok, true)
    const righe = testo.split('\n')
    assert.match(righe[0], /^Remote control is off\./u, 'a remoto spento lo dice, e l\'elenco c\'è lo stesso')
    const consensi = await a.cartelle.consensiDi(ID_PIXEL)
    const [cA, cS] = consensi
    assert.equal(righe[1], `- "Pixel di Nino " · id abcd1234`)
    assert.equal(righe[2], `  - "progetto-A" · folder ${cA.cartellaId} · ${cA.percorso} · allowed ${cA.consentitaAlle} (allowed in advance on this computer)`)
    assert.equal(righe[3], `  - "sparita" · folder ${cS.cartellaId} · ${cS.percorso} · allowed ${cS.consentitaAlle} (allowed in advance on this computer) · missing on disk`)
    assert.equal(righe[4], '- "iPad" · id zzzz9999')
    assert.equal(righe[5], '  No folders allowed.')
    assert.equal(righe.length, 6, testo)
    senzaSegreti(testo, a)
    /* un dispositivo solo */
    const solo = await b.ospite('remote_phone_folders', { phone: 'zzzz9999' }, { fase: 'esegui' })
    assert.deepEqual(solo.testo.split('\n').slice(1), ['- "iPad" · id zzzz9999', '  No folders allowed.'])
    for (const phone of ['abcdZZZZ', 'nessuno1', 'a b', 'ab']) {
      const r = await b.ospite('remote_phone_folders', { phone }, { fase: 'anteprima' })
      assert.equal(r.ok, false, phone)
      assert.match(r.messaggio, /call remote_phones first|short id from remote_phones/u, phone)
    }
  } finally { await b.via() }
})

test('TCA-R-02 — consentire: la carta col dispositivo e la cartella; l\'anteprima non scrive; eseguito si salva «dalla chat»', async (t) => {
  const a = ambiente(t)
  const progetto = a.crea('lavori', 'progetto-B')
  const b = await registroCon({ remoto: a.remoto })
  try {
    const anteprima = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: progetto }, { fase: 'anteprima', toolCallId: 'call-r02' })
    const descritta = await a.cartelle.descrivi(progetto)
    assert.deepEqual(anteprima, {
      ok: true, carta: true,
      azione: {
        tipo: 'remote_phone_folder_allow',
        telefono: { idCorto: 'abcd1234', nome: 'Pixel di Nino‮', piattaforma: 'Android', inLinea: false, ultimaVoltaAlle: Date.UTC(2026, 9, 23, 14, 20) },
        cartella: { cartellaId: descritta.cartellaId, nome: 'progetto-B', percorso: realpathSync.native(progetto) },
      },
    })
    assert.equal(a.consensiSulDisco(), null, 'l\'anteprima non scrive niente')
    const fatto = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: progetto }, { fase: 'esegui', toolCallId: 'call-r02' })
    const [c] = await a.cartelle.consensiDi(ID_PIXEL)
    assert.equal(fatto.testo, `Allowed "Pixel di Nino " (id abcd1234) to work in "progetto-B" (${c.percorso}): from the device it can read, write and run commands there until the person revokes it.`)
    assert.equal(c.da, 'chat')
    assert.equal(JSON.parse(a.consensiSulDisco()).dispositivi[ID_PIXEL][0].da, 'chat')
    /* riletto da un modulo nuovo (un riavvio), «chat» resta «chat» */
    const riletto = creaCartelleDeiDispositivi({ fileConsensi: a.fileConsensi, fileSegreto: join(a.dati, 'remoto', 'segreto-cartelle') })
    assert.equal((await riletto.consensiDi(ID_PIXEL))[0].da, 'chat')
    assert.equal(await a.cartelle.consentita(ID_PIXEL, progetto), true)
    assert.equal(await a.cartelle.consentita('zzzz9999yyyy8888', progetto), false, 'solo a quel dispositivo')
    const elenco = await b.ospite('remote_phone_folders', { phone: 'abcd1234' }, { fase: 'esegui' })
    assert.match(elenco.testo, /\(allowed from the chat\)$/u)
    senzaSegreti(JSON.stringify([anteprima, fatto, elenco]), a)
  } finally { await b.via() }
})

test('TCA-R-03 — consentire: già consentita ⇒ nessuna carta, niente scritto; inesistente, relativa o di TALOS ⇒ rifiuto, niente scritto', async (t) => {
  const a = ambiente(t)
  const progetto = a.crea('lavori', 'progetto-C')
  await a.cartelle.consentiInAnticipo(ID_PIXEL, progetto)
  const prima = a.consensiSulDisco()
  const b = await registroCon({ remoto: a.remoto })
  try {
    assert.deepEqual(await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: progetto }, { fase: 'anteprima' }), { ok: true, carta: false })
    const gia = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: progetto }, { fase: 'esegui' })
    assert.match(gia.testo, /^"Pixel di Nino " \(id abcd1234\) can already work in "progetto-C" \(.+\)\. Nothing was changed\.$/u)
    const casi = [
      [join(a.radice, 'non-esiste'), /^There is no folder at .+non-esiste on this computer\. Nothing was allowed\.$/u],
      [a.programma, /^That folder belongs to TALOS and cannot be given to a device\. Nothing was allowed\.$/u],
      [join(a.dati, 'remoto'), /^That folder belongs to TALOS and cannot be given to a device\. Nothing was allowed\.$/u],
      ['lavori', /^"path" must be a full path, not a relative one\. Nothing was allowed\.$/u],
      ['', /^"path" must be the full path of a folder on this computer\. Nothing was allowed\.$/u],
    ]
    for (const [path, atteso] of casi) {
      for (const fase of ['anteprima', 'esegui']) {
        const r = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path }, { fase })
        assert.equal(r.ok, false, `${path} ${fase}`)
        assert.match(r.messaggio, atteso, `${path} ${fase}`)
      }
    }
    const file = join(a.crea('lavori', 'un-file'), 'f.txt')
    writeFileSync(file, 'x')
    assert.match((await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: file }, { fase: 'esegui' })).messaggio, /^There is no folder at /u, 'un file non è una cartella')
    assert.match((await b.ospite('remote_phone_folder_allow', { phone: 'nessuno1', path: progetto }, { fase: 'anteprima' })).messaggio, /^No paired device has the id "nessuno1": call remote_phones first\. Nothing was allowed\.$/u)
    assert.equal(a.consensiSulDisco(), prima, 'niente scritto, byte per byte')
  } finally { await b.via() }
})

test('TCA-R-04 — revocare per id o per percorso intero: la carta, poi la revoca vera; una cartella non consentita si rifiuta', async (t) => {
  const a = ambiente(t)
  const uno = a.crea('lavori', 'uno')
  const due = a.crea('lavori', 'due')
  await a.cartelle.consentiInAnticipo(ID_PIXEL, uno)
  await a.cartelle.consentiInAnticipo(ID_PIXEL, due)
  const [c1, c2] = await a.cartelle.consensiDi(ID_PIXEL)
  const b = await registroCon({ remoto: a.remoto })
  try {
    const anteprima = await b.ospite('remote_phone_folder_revoke', { phone: 'abcd1234', folder: c1.cartellaId }, { fase: 'anteprima' })
    assert.deepEqual(anteprima.azione, {
      tipo: 'remote_phone_folder_revoke',
      telefono: { idCorto: 'abcd1234', nome: 'Pixel di Nino‮', piattaforma: 'Android', inLinea: false, ultimaVoltaAlle: Date.UTC(2026, 9, 23, 14, 20) },
      cartella: { cartellaId: c1.cartellaId, nome: 'uno', percorso: c1.percorso },
    })
    assert.equal(anteprima.carta, true)
    assert.equal(await a.cartelle.consentita(ID_PIXEL, uno), true, 'l\'anteprima non revoca')
    const fatto = await b.ospite('remote_phone_folder_revoke', { phone: 'abcd1234', folder: c1.cartellaId }, { fase: 'esegui' })
    assert.equal(fatto.testo, `"Pixel di Nino " (id abcd1234) can no longer work in "uno" (${c1.percorso}). Sessions already open in that folder refuse its writes from now on.`)
    assert.equal(await a.cartelle.consentita(ID_PIXEL, uno), false)
    /* per percorso intero (com'è nell'elenco), anche con maiuscole diverse su Windows */
    const perPercorso = process.platform === 'win32' ? c2.percorso.toUpperCase() : c2.percorso
    const p2 = await b.ospite('remote_phone_folder_revoke', { phone: 'abcd1234', folder: perPercorso }, { fase: 'anteprima' })
    assert.equal(p2.azione.cartella.cartellaId, c2.cartellaId)
    await b.ospite('remote_phone_folder_revoke', { phone: 'abcd1234', folder: perPercorso }, { fase: 'esegui' })
    assert.deepEqual(await a.cartelle.consensiDi(ID_PIXEL), [])
    const dopo = a.consensiSulDisco()
    for (const folder of [c1.cartellaId, 'lavori', 'nessuno', '']) {
      const r = await b.ospite('remote_phone_folder_revoke', { phone: 'abcd1234', folder }, { fase: 'anteprima' })
      assert.equal(r.ok, false, folder)
      assert.match(r.messaggio, folder ? /: call remote_phone_folders first\. Nothing was revoked\.$/u : /^"folder" must be /u, folder)
    }
    assert.equal(a.consensiSulDisco(), dopo)
    senzaSegreti(JSON.stringify([anteprima, fatto, p2]), a)
  } finally { await b.via() }
})

test('TCA-R-05 — al contrario: senza cartelle sul server lo dice; senza nessuno davanti la porta non c\'è', async (t) => {
  const a = ambiente(t)
  const b = await registroCon({ remoto: { ...a.remoto, cartelle: null } })
  try {
    for (const nome of NUOVI) {
      const r = await b.ospite(nome, { phone: 'abcd1234', path: a.radice, folder: 'x' }, { fase: 'anteprima' })
      assert.deepEqual([r.ok, r.messaggio], [false, 'Device folders are not available on this computer.'], nome)
    }
  } finally { await b.via() }
  const senza = await registroCon({ remoto: a.remoto, senzaInterfaccia: true })
  try { assert.equal(senza.ospite, undefined) } finally { await senza.via() }
})

test('TCA-I-01 — col remoto VERO (`creaRemoto` coi file dei consensi): consentire dalla chat, elencare, revocare', async (t) => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-tel-cart-idx-')))
  t.after(() => rimuoviCartellaDiProva(dir))
  const progetto = join(dir, 'progetto-D')
  mkdirSync(progetto)
  const fileTelefoni = join(dir, 'remoto', 'telefoni.json')
  mkdirSync(join(dir, 'remoto'))
  writeFileSync(fileTelefoni, JSON.stringify({ v: 1, dispositivi: [{ id: ID_PIXEL, endpointId: 'ENDPOINT-SEGRETO', nome: 'Pixel', piattaforma: 'Android' }] }))
  const remoto = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni,
    fileConsensi: join(dir, 'remoto', 'consensi.json'), fileSegretoCartelle: join(dir, 'remoto', 'segreto-cartelle'), cartelleEscluse: [join(dir, 'remoto')],
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false, cartellePiuUsate: () => [] }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => null, nomePc: 'PC',
  })
  const b = await registroCon({ remoto })
  try {
    const anteprima = await b.ospite('remote_phone_folder_allow', { phone: 'abcd', path: progetto }, { fase: 'anteprima', toolCallId: 'call-i01' })
    assert.equal(anteprima.carta, true)
    assert.match((await b.ospite('remote_phone_folder_allow', { phone: 'abcd', path: progetto }, { fase: 'esegui', toolCallId: 'call-i01' })).testo, /^Allowed "Pixel" \(id abcd1234\) to work in "progetto-D"/u)
    assert.equal(await remoto.cartelle.consentita(ID_PIXEL, progetto), true)
    const elenco = (await b.ospite('remote_phone_folders', {}, { fase: 'esegui' })).testo
    assert.match(elenco, /^Remote control is not available on this computer\./u)
    assert.match(elenco, /\n {2}- "progetto-D" · folder [A-Za-z0-9_-]{32} · .+progetto-D · allowed \d{4}-\d\d-\d\dT[\d:.]+Z \(allowed from the chat\)$/u)
    assert.equal(elenco.includes('ENDPOINT-SEGRETO') || elenco.includes(readFileSync(join(dir, 'remoto', 'segreto-cartelle'), 'utf8').trim()), false)
    const id = /folder ([A-Za-z0-9_-]{32})/u.exec(elenco)[1]
    assert.match((await b.ospite('remote_phone_folder_revoke', { phone: 'abcd', folder: id }, { fase: 'esegui' })).testo, /^"Pixel" \(id abcd1234\) can no longer work in "progetto-D"/u)
    assert.equal(await remoto.cartelle.consentita(ID_PIXEL, progetto), false)
  } finally { await b.via() }
})

test('TCA-K-04 — un gancio pre_tool_call che rifiuta blocca consentire e revocare (azioni mutanti), non l\'elenco', async (t) => {
  const c = cartella(t)
  const hookFn = async (e) => (e?.tipo === 'pre_tool_call' ? { consentito: false, motivo: 'blocked by the test hook.' } : undefined)
  const r = await giro(c, [
    chiama('a', 'remote_phone_folder_allow', { phone: 'abcd1234', path: c }),
    chiama('b', 'remote_phone_folder_revoke', { phone: 'abcd1234', folder: 'x' }),
    chiama('d', 'remote_phone_folders', {}),
  ], { ospite: OSPITE, risposta: true, extra: { hookFn } })
  assert.equal(r.esito('a'), 'REFUSED. blocked by the test hook. Nothing was done.')
  assert.equal(r.esito('b'), 'REFUSED. blocked by the test hook. Nothing was done.')
  assert.equal(r.esito('d'), 'Remote control is on.', 'su una lettura il rifiuto del gancio è ignorato')
  assert.deepEqual(r.ospite.map(([nome]) => nome), ['remote_phone_folders', 'remote_phone_folders'], 'allow e revoke non arrivano all\'ospite')
})

test('TCA-R-06 — senza "phone" consentire e revocare si rifiutano; un nome di cartella coi caratteri di controllo arriva al modello pulito', async (t) => {
  const a = ambiente(t)
  const strana = a.crea('lavori', 'strana‮atad')
  const b = await registroCon({ remoto: a.remoto })
  try {
    for (const nome of ['remote_phone_folder_allow', 'remote_phone_folder_revoke']) {
      const r = await b.ospite(nome, { path: strana, folder: 'x' }, { fase: 'anteprima' })
      assert.equal(r.ok, false, nome)
      assert.match(r.messaggio, /^"phone" must be the short id from remote_phones\. Nothing was (allowed|revoked)\.$/u, nome)
    }
    await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: strana }, { fase: 'anteprima', toolCallId: 'call-r06' })
    const fatto = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: strana }, { fase: 'esegui', toolCallId: 'call-r06' })
    assert.match(fatto.testo, /to work in "strana atad" \(.+strana atad\)/u)
    const elenco = (await b.ospite('remote_phone_folders', {}, { fase: 'esegui' })).testo
    assert.equal(/[‮]/u.test(fatto.testo + elenco), false, 'nessun carattere di controllo bidi al modello')
    assert.match(elenco, / {2}- "strana atad" · folder /u)
  } finally { await b.via() }
})

test('TCA-R-07 — un id corto ambiguo si rifiuta; un percorso RELATIVO non revoca; la cartella sparita o il consenso tolto fra la carta e il clic lo dicono', async (t) => {
  const a = ambiente(t)
  const uno = a.crea('lavori', 'uno')
  await a.cartelle.consentiInAnticipo(ID_PIXEL, uno)
  const [c1] = await a.cartelle.consensiDi(ID_PIXEL)
  const stato = await a.remoto.stato()
  const gemelli = { ...a.remoto, stato: async () => ({ ...stato, telefoni: [...stato.telefoni, { id: 'abcdQQQQrrrr0000', endpointId: 'G', nome: 'Gemello', inLinea: false, revocatoAlle: null }] }) }
  const b = await registroCon({ remoto: gemelli })
  try {
    for (const nome of NUOVI) {
      const r = await b.ospite(nome, { phone: 'abcd', path: uno, folder: c1.cartellaId }, { fase: 'anteprima' })
      assert.equal(r.ok, false, nome)
      assert.match(r.messaggio, /^More than one paired device has the id "abcd": call remote_phones first\./u, nome)
    }
    /* 25/10/2026 (PR #81, CI rossa): sul runner il progetto sta su D: e la TEMP su C:, e fra due dischi `relative` torna un percorso
       ASSOLUTO — la premessa non si costruiva. Dallo stesso disco si usa il relativo che porterebbe davvero alla cartella (la prova più
       forte: se il server lo risolvesse contro la sua cartella, revocherebbe); fra due dischi un relativo semplice, mai assoluto. */
    const dallaCartellaDelServer = relative(process.cwd(), c1.percorso)
    const relativo = isAbsolute(dallaCartellaDelServer) ? join('lavori', 'uno') : dallaCartellaDelServer
    assert.equal(isAbsolute(relativo), false)
    const r = await b.ospite('remote_phone_folder_revoke', { phone: 'abcd1234', folder: relativo }, { fase: 'anteprima' })
    assert.equal(r.ok, false, 'un percorso relativo non si risolve contro la cartella del server')
  } finally { await b.via() }
  /* la gara: la cartella sparisce, o il consenso viene tolto dalla finestra, dopo l'anteprima */
  const gara = { ...a.remoto, cartelle: { ...a.cartelle,
    consentiInAnticipo: async () => { throw Object.assign(new Error('x'), { code: 'FOLDER_INVALID' }) },
    revoca: async () => { throw Object.assign(new Error('x'), { code: 'NOT_FOUND' }) } } }
  const g = await registroCon({ remoto: gara })
  try {
    const altra = a.crea('lavori', 'altra')
    await g.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: altra }, { fase: 'anteprima', toolCallId: 'call-r07' })
    const consenti = await g.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: altra }, { fase: 'esegui', toolCallId: 'call-r07' })
    assert.match(consenti.messaggio, /^There is no folder at .+altra on this computer anymore\. Nothing was allowed\.$/u)
    const revoca = await g.ospite('remote_phone_folder_revoke', { phone: 'abcd1234', folder: c1.cartellaId }, { fase: 'esegui' })
    assert.equal(revoca.messaggio, 'That folder is no longer allowed to "Pixel di Nino " (id abcd1234). Nothing was revoked.')
  } finally { await g.via() }
})

test('TCA-R-08 — revisione del Desktop: se fra la carta e il clic il percorso porta a un\'altra cartella, non si consente niente; AL CONTRARIO stesso percorso, stessa cartella ⇒ consentita', async (t) => {
  const a = ambiente(t)
  const vista = a.crea('lavori', 'vista')
  const altra = a.crea('lavori', 'segreta')
  const passaggio = join(a.radice, 'lavori', 'passaggio')
  /* una giunzione (Windows) o un collegamento (altrove): il nome resta, la destinazione si rifà */
  symlinkSync(vista, passaggio, 'junction')
  t.after(() => { try { unlinkSync(passaggio) } catch { /* già tolto */ } })
  const b = await registroCon({ remoto: a.remoto })
  try {
    const carta = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: passaggio }, { fase: 'anteprima', toolCallId: 'call-1' })
    assert.equal(carta.azione.cartella.percorso, realpathSync.native(vista))
    unlinkSync(passaggio)
    symlinkSync(altra, passaggio, 'junction')
    const fatto = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: passaggio }, { fase: 'esegui', toolCallId: 'call-1' })
    assert.equal(fatto.ok, false)
    assert.match(fatto.messaggio, /no longer leads to the folder shown on the card \(it now leads to .+segreta\)\. Nothing was allowed\.$/u)
    assert.equal(await a.cartelle.consentita(ID_PIXEL, altra), false, 'la cartella mai vista sulla carta non è consentita')
    assert.equal(await a.cartelle.consentita(ID_PIXEL, vista), false)
    assert.equal(a.consensiSulDisco(), null, 'niente scritto')
    /* un'esecuzione con un id di chiamata mai mostrato su una carta non consente niente */
    const senzaCarta = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: altra }, { fase: 'esegui', toolCallId: 'call-mai-vista' })
    assert.equal(senzaCarta.ok, false)
    assert.equal(a.consensiSulDisco(), null)
    /* AL CONTRARIO: la stessa cartella dall'anteprima al clic si consente */
    const seconda = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: passaggio }, { fase: 'anteprima', toolCallId: 'call-2' })
    assert.equal(seconda.azione.cartella.percorso, realpathSync.native(altra))
    const consentita = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: passaggio }, { fase: 'esegui', toolCallId: 'call-2' })
    assert.equal(consentita.ok, true, consentita.messaggio)
    assert.equal(await a.cartelle.consentita(ID_PIXEL, altra), true)
  } finally { await b.via() }
})

test('TCA-R-09 — revisione avversaria 24/10: senza id della chiamata non c\'è carta legata e niente si consente; una carta vale una volta sola e per il suo dispositivo', async (t) => {
  const a = ambiente(t)
  const vista = a.crea('lavori', 'vista')
  const b = await registroCon({ remoto: a.remoto })
  try {
    /* F2-1: una chiamata senza id (il kernel passa `c.id` com'è) non si lega a una carta ⇒ rifiutata, in anteprima come all'esecuzione */
    const anteprima = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'anteprima' })
    assert.equal(anteprima.ok, false)
    assert.match(anteprima.messaggio, /has no id/u)
    const esegui = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'esegui' })
    assert.equal(esegui.ok, false)
    assert.equal(a.consensiSulDisco(), null)
    /* F2-3: un'esecuzione senza carta lo dice, invece di «non porta più alla cartella mostrata» */
    const maiVista = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'esegui', toolCallId: 'call-x' })
    assert.equal(maiVista.ok, false)
    assert.match(maiVista.messaggio, /^No card was shown to the person for this call/u)
    /* M5: la carta di un dispositivo non vale per un altro con lo stesso id di chiamata */
    await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'anteprima', toolCallId: 'call-1' })
    const altroDispositivo = await b.ospite('remote_phone_folder_allow', { phone: 'zzzz9999', path: vista }, { fase: 'esegui', toolCallId: 'call-1' })
    assert.equal(altroDispositivo.ok, false)
    assert.equal(await a.cartelle.consentita('zzzz9999yyyy8888', vista), false)
    /* AL CONTRARIO, poi M4: la stessa carta consente una volta; una seconda esecuzione con lo stesso id non trova più la carta */
    const prima = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'esegui', toolCallId: 'call-1' })
    assert.equal(prima.ok, true, prima.messaggio)
    await a.cartelle.revoca(ID_PIXEL, (await a.cartelle.consensiDi(ID_PIXEL))[0].cartellaId)
    const seconda = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'esegui', toolCallId: 'call-1' })
    assert.equal(seconda.ok, false)
    assert.match(seconda.messaggio, /^No card was shown/u)
    assert.equal(await a.cartelle.consentita(ID_PIXEL, vista), false)
  } finally { await b.via() }
})

test('TCA-R-10 — revisione avversaria 24/10 (F2-2): la cartella mostrata diventa un passaggio verso un\'altra fra il ricontrollo e la scrittura ⇒ niente scritto', async (t) => {
  const a = ambiente(t)
  const vista = a.crea('lavori', 'vista')
  const altra = a.crea('lavori', 'segreta')
  const vistaReale = realpathSync.native(vista)
  const originale = a.cartelle.consentiInAnticipo
  let scambiata = false
  a.cartelle.consentiInAnticipo = (...arg) => {
    /* il momento esatto fra `verifica` e la scrittura: la cartella vera se ne va e al suo posto c'è un passaggio verso «segreta» */
    renameSync(vista, `${vista}-via`)
    symlinkSync(altra, vista, 'junction')
    scambiata = true
    return originale(...arg)
  }
  t.after(() => { try { unlinkSync(vista) } catch { /* già tolto */ } })
  const b = await registroCon({ remoto: a.remoto })
  try {
    const carta = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'anteprima', toolCallId: 'call-1' })
    assert.equal(carta.azione.cartella.percorso, vistaReale)
    const fatto = await b.ospite('remote_phone_folder_allow', { phone: 'abcd1234', path: vista }, { fase: 'esegui', toolCallId: 'call-1' })
    assert.equal(scambiata, true)
    assert.equal(fatto.ok, false)
    assert.match(fatto.messaggio, /changed after the card was shown/u)
    assert.equal(await a.cartelle.consentita(ID_PIXEL, altra), false, 'la cartella mai vista non è consentita')
    assert.equal(a.consensiSulDisco(), null, 'niente scritto')
  } finally { await b.via() }
})
