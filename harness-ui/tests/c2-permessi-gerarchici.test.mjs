/*
 * ⛔⛔⛔ C2 — PERMESSI GERARCHICI (contratto `C2-CONTRATTO-PERMESSI-GERARCHICI-2026-10-07.md`, decisioni dell'owner del 07/10/2026).
 *   Prove scritte PRIMA del codice, sulla base dell'integrazione `bd9805ab1`: le RED devono fallire oggi per il motivo giusto.
 *   R1 mai oltre il padre, dal vivo · R2 i sì di sessione del padre scendono · R4 la domanda della figlia si legge dal padre ·
 *   R6 traccia · controllo della catena su chi risponde.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function runtimeControllabile() {
  const runs = []
  return {
    runs,
    avviaSessioneFn(input) {
      let resolve
      const promise = new Promise((r) => { resolve = r })
      const index = runs.length
      runs.push({ input, resolve })
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` })
      return promise
    },
    fine(index) {
      const run = runs[index]
      run.input.onEvento({ type: 'RunFinished', threadId: `t${index}`, runId: `r${index}` })
      run.resolve({ ok: true, esito: { detto: `risposta ${index}`, comeFinita: 'concluso',
        messaggiFinali: [{ role: 'user', content: 'lavora' }, { role: 'assistant', content: `risposta ${index}` }] } })
    },
  }
}

async function scena(t, { permessi = 'Workspace write', opzioniRegistro = {} } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c2-'))
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega un lavoro' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, ...opzioniRegistro })
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: permessi, modalitaOperativaScelta: 'normale' })
  const delega = await runtime.runs[0].input.onDelega('figlia: scrivi un file', '/tmp/x')
  const figliaId = delega?.childId ?? registry.elenca().find((s) => s.padreId === sessionId)?.sessionId
  assert.ok(figliaId, 'premessa: la figlia esiste')
  assert.equal(runtime.runs.length, 2, 'premessa: la figlia gira')
  return { registry, runtime, sessionId, figliaId, inputFiglia: runtime.runs[1].input }
}
/** Il valore che il kernel della figlia vede ADESSO: una funzione (contratto C2) si legge, un valore resta quello. */
const vivo = (valore) => (typeof valore === 'function' ? valore() : valore)
/**
 * Il livello che il kernel della figlia usa ADESSO. Da C2-a (bugfixer, 72749ede2) il valore vivo è `permessiCorrentiFn()`,
 * riletto a ogni chiamata di attrezzo; `livelloAccesso` resta il livello d'AVVIO del giro. Una radice non ha la funzione.
 */
const livelloVivo = (input) => (typeof input.permessiCorrentiFn === 'function' ? input.permessiCorrentiFn().livelloAccesso : input.livelloAccesso)

// ── R1 — mai oltre il padre, dal vivo ───────────────────────────────────────────────────────────────────

test('C2-01 SCENDE COL PADRE: il padre passa a «Sola lettura» dopo aver delegato ⇒ la figlia viva scende con lui', async (t) => {
  const { registry, runtime, sessionId, inputFiglia } = await scena(t)
  assert.equal(typeof inputFiglia.permessiCorrentiFn, 'function', 'premessa: la figlia rilegge i permessi a ogni chiamata (C2-a)')
  assert.equal(livelloVivo(inputFiglia), 'scrittura-progetto', 'premessa: la figlia nasce col livello del padre')
  runtime.fine(0) // il padre finisce il suo giro: i permessi si cambiano fra un giro e l'altro
  await registry.attendiAssestamento?.(sessionId)
  const esito = await registry.aggiornaImpostazioni(sessionId, { permessi: 'Read only' })
  assert.notEqual(esito?.ok, false, `premessa: il cambio è accettato (${JSON.stringify(esito)})`)
  assert.equal(livelloVivo(inputFiglia), 'lettura', 'la figlia non può restare SOPRA il padre (R1)')
})

test('C2-01b AL CONTRARIO: il padre SALE dopo aver delegato ⇒ la figlia NON sale (mai oltre ciò che le è stato dato)', async (t) => {
  const { registry, runtime, sessionId, inputFiglia } = await scena(t, { permessi: 'Read only' })
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  await registry.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  assert.equal(livelloVivo(inputFiglia), 'lettura', 'il minimo lungo la catena: la figlia resta al suo livello')
})

// ── R2 — i sì di sessione del padre scendono, R1 prima di R2 ───────────────────────────────────────────

test('C2-02 SÌ DEL PADRE: «consenti questa cartella per la sessione» dato al padre vale anche per la figlia', async (t) => {
  const { registry, runtime, sessionId, inputFiglia } = await scena(t)
  const visti = []
  const disiscrivi = registry.iscriviti(sessionId, (e) => visti.push(e))
  t.after(() => disiscrivi?.())
  const domanda = runtime.runs[0].input.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'C:/fuori/a.txt',
    fuoriDalProgetto: { chiave: 'C:/fuori' } })
  await new Promise((r) => setTimeout(r, 10))
  const requestId = visti.find((e) => e.type === 'ApprovalRequested')?.requestId
  assert.ok(requestId, 'premessa: il padre ha una domanda aperta')
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'cartella' }), { ok: true })
  await domanda
  const consensiFiglia = vivo(inputFiglia.consensiSessione)
  assert.ok(consensiFiglia?.cartelleFuori?.includes?.('C:/fuori'), 'la figlia vede il sì di cartella del padre (R2)')
})

test('C2-03 MAI OLTRE (protezione, kernel): un sì di cartella non apre la scrittura a chi è in sola lettura', async () => {
  const esito = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: 'C:/fuori/a.txt' }, {
    livelloAccesso: 'lettura', cartella: 'C:/progetto', consensiSessione: { cartelleFuori: ['C:/fuori'] },
    chiediApprovazioneFn: async () => true,
  })
  /* `verificaPermessoScrittura` restituisce `{ consentito, via, motivo }` (`talosHarness.mjs:9333-9336`). */
  assert.equal(esito?.consentito, false, 'R1 prima di R2: la sola lettura vince sul sì di sessione')
  assert.equal(esito?.via, 'livello-lettura')
})

/** Un sì «cartella per la sessione» dato dalla persona alla sessione `id`, sulla domanda che il suo giro fa adesso. */
async function siDiCartella(registry, id, input, chiave) {
  const domanda = input.chiediApprovazioneFn({ tipo: 'scrivi', percorso: `${chiave}/a.txt`, fuoriDalProgetto: { chiave } })
  await new Promise((r) => setTimeout(r, 10))
  const requestId = registry.domandaInAttesa(id)?.requestId
  assert.ok(requestId, `premessa: ${id} ha una domanda aperta`)
  assert.deepEqual(registry.rispondiApprovazione(id, requestId, true, { ambito: 'cartella' }), { ok: true })
  await domanda
}

test('C2-02b MAI IN SU: il sì di cartella dato alla FIGLIA vale per lei, non per il padre (owner 07/10)', async (t) => {
  const { registry, runtime, figliaId, inputFiglia } = await scena(t)
  await siDiCartella(registry, figliaId, inputFiglia, 'locale|C:/solo-figlia')
  assert.ok(inputFiglia.consensiSessione.cartelleFuori?.includes('locale|C:/solo-figlia'), 'premessa: la figlia lo vede')
  assert.ok(!(runtime.runs[0].input.consensiSessione.cartelleFuori ?? []).includes('locale|C:/solo-figlia'), 'i sì scendono, non salgono')
})

test('C2-02c MAI DI LATO: il sì dato a una figlia non vale per la sorella', async (t) => {
  const { registry, runtime, figliaId, inputFiglia } = await scena(t)
  await runtime.runs[0].input.onDelega('sorella: un altro lavoro', '/tmp/x')
  assert.equal(runtime.runs.length, 3, 'premessa: la sorella gira')
  const inputSorella = runtime.runs[2].input
  await siDiCartella(registry, figliaId, inputFiglia, 'locale|C:/solo-figlia')
  assert.ok(!(inputSorella.consensiSessione.cartelleFuori ?? []).includes('locale|C:/solo-figlia'), 'i sì non vanno di lato')
})

test('C2-02d LE SCRITTURE RESTANO DI CHI HA RICEVUTO IL SÌ: il kernel della figlia scrive sulla figlia, mai sul padre', async (t) => {
  const { runtime, inputFiglia } = await scena(t)
  const vista = inputFiglia.consensiSessione
  vista.rootWsl = true // come il kernel dopo la conferma di root in WSL (talosHarness.mjs, `confermaRootWsl`)
  vista.reteCartella = true // e dopo il sì «cartella di rete per la sessione»
  assert.equal(vista.rootWsl, true, 'la figlia lo vede')
  assert.notEqual(runtime.runs[0].input.consensiSessione.rootWsl, true, 'il padre non riceve il sì della figlia')
  assert.notEqual(runtime.runs[0].input.consensiSessione.reteCartella, true)
})

test('C2-02e TUTTI E QUATTRO SCENDONO, dal vivo: cartelle, segreti, rete e root di WSL del padre, anche dati DOPO la delega', async (t) => {
  const { runtime, inputFiglia } = await scena(t)
  const delPadre = runtime.runs[0].input.consensiSessione // lo stesso oggetto di `voce.consensiSessione` del padre
  Object.assign(delPadre, { cartelleFuori: ['locale|C:/p'], segretiConsentiti: ['.env'], reteCartella: true, rootWsl: true })
  const vista = inputFiglia.consensiSessione
  assert.deepEqual([...vista.cartelleFuori], ['locale|C:/p'])
  assert.deepEqual([...vista.segretiConsentiti], ['.env'])
  assert.equal(vista.reteCartella, true)
  assert.equal(vista.rootWsl, true)
})

test('C2-02g LA NIPOTE: il sì dato alla radice scende fino alla figlia della figlia', async (t) => {
  const { registry, runtime, sessionId, inputFiglia } = await scena(t)
  await inputFiglia.onDelega('nipote: un lavoro più piccolo', '/tmp/x')
  assert.equal(runtime.runs.length, 3, 'premessa: la nipote gira')
  await siDiCartella(registry, sessionId, runtime.runs[0].input, 'locale|C:/della-radice')
  assert.ok(runtime.runs[2].input.consensiSessione.cartelleFuori?.includes('locale|C:/della-radice'), 'tutta la catena, non solo il padre diretto')
})

test('C2-02i I SÌ PIÙ FORTI (root in WSL, cartella di rete) NON VANNO DI LATO NÉ IN SU: sorella, nipote, un\'altra radice', async (t) => {
  /* review del bugfixer (08/10/2026, mutante R2M1): «mai in su, mai di lato» era provato solo sugli ELENCHI. I due sì booleani
     sono i più forti. ⛔ Il loro cancello vero (`confermaRootWsl`, il percorso di rete) vive nella chiusura di `talosLavora` e
     non si chiama da solo: qui si prova il valore ESATTO che quel cancello legge, `consensiSessione.rootWsl === true`
     (talosHarness.mjs, `confermaRootWsl`) e `consensiSessione?.reteCartella === true` (il percorso di rete). */
  const { registry, runtime, inputFiglia } = await scena(t)
  await runtime.runs[0].input.onDelega('sorella: un altro lavoro', '/tmp/x')
  await inputFiglia.onDelega('nipote: un lavoro più piccolo', '/tmp/x')
  registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' })
  await runtime.runs[4].input.onDelega('figlia di un\'altra radice', '/tmp/x')
  assert.equal(runtime.runs.length, 6, 'premessa: sorella, nipote, altra radice e sua figlia girano')
  for (const altro of runtime.runs.slice(2)) Object.assign(altro.input.consensiSessione, { rootWsl: true, reteCartella: true })
  const vista = inputFiglia.consensiSessione
  assert.notEqual(vista.rootWsl, true, 'il sì di root in WSL di altri non vale per la figlia')
  assert.notEqual(vista.reteCartella, true, 'il sì di rete di altri non vale per la figlia')
  assert.notEqual(runtime.runs[0].input.consensiSessione.rootWsl, true, 'e nemmeno per la radice: i sì delle discendenti non salgono')
})

test('C2-02h UN ELENCO DELLA VISTA NON SI SCRIVE: un push esplode invece di perdersi in una copia', async (t) => {
  const { inputFiglia } = await scena(t)
  assert.throws(() => inputFiglia.consensiSessione.cartelleFuori.push('locale|C:/perso'), TypeError)
})

test('C2-02f CAPO A CAPO (cancello vero): col sì di cartella del padre la figlia scrive lì senza chiedere; senza, chiede', async (t) => {
  const progetto = mkdtempSync(join(tmpdir(), 'talos-c2-progetto-'))
  const fuori = mkdtempSync(join(tmpdir(), 'talos-c2-fuori-'))
  t.after(() => { rimuoviCartellaDiProva(progetto); rimuoviCartellaDiProva(fuori) })
  const { registry, runtime, sessionId, inputFiglia } = await scena(t)
  const percorso = join(fuori, 'a.txt')
  const scrive = async () => {
    let chiesto = 0
    const esito = await verificaPermessoScrittura({ tipo: 'scrivi', percorso }, {
      livelloAccesso: 'scrittura-progetto', cartella: progetto, consensiSessione: inputFiglia.consensiSessione,
      posizioneFn: async () => ({ verificato: true, dentro: false, vero: percorso, cartella: fuori, spazio: 'locale' }),
      chiediApprovazioneFn: async () => { chiesto += 1; return false },
    })
    return { esito, chiesto }
  }
  assert.equal((await scrive()).chiesto, 1, 'premessa: senza sì, la scrittura fuori dal progetto chiede')
  await siDiCartella(registry, sessionId, runtime.runs[0].input, `locale|${fuori}`)
  const dopo = await scrive()
  assert.equal(dopo.chiesto, 0, 'col sì del padre la figlia non chiede (R2: decidono le regole)')
  assert.equal(dopo.esito?.consentito, true)
})

// ── R4 — la domanda della figlia si legge dal padre; chi risponde deve essere della catena ──────────────

test('C2-04 CARTA NEL PADRE: la domanda in attesa della figlia si legge per id (rotta /pending) e si risolve dal padre', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(typeof registry.domandaInAttesa, 'function', 'il registro espone la domanda in attesa di una sessione (contratto C2 §2)')
  const pendente = registry.domandaInAttesa(figliaId)
  assert.equal(pendente?.azione?.comando, 'npm install')
  assert.deepEqual(registry.rispondiApprovazione(figliaId, pendente.requestId, true), { ok: true })
  assert.equal(await domanda, true, 'la figlia riparte')
  assert.equal(registry.domandaInAttesa(figliaId), null, 'chiusa: nessuna carta orfana')
})

test('C2-06 ESTRANEO: chi risponde da una sessione che non è un antenato viene rifiutato', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  const visti = []
  const disiscrivi = registry.iscriviti(figliaId, (e) => visti.push(e))
  t.after(() => disiscrivi?.())
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 10))
  const requestId = visti.find((e) => e.type === 'ApprovalRequested')?.requestId
  assert.ok(requestId, 'premessa: la figlia ha una domanda aperta')
  const esito = registry.rispondiApprovazione(figliaId, requestId, true, { rispostoDa: 'sessione-estranea' })
  assert.notEqual(esito?.ok, true, 'una risposta da fuori catena non vale')
  assert.equal(esito?.code, 'APPROVAL_ANSWER_FORBIDDEN')
  assert.equal(registry.domandaInAttesa(figliaId)?.requestId, requestId, 'il rifiuto non tocca la domanda: resta in attesa')
  registry.rispondiApprovazione(figliaId, requestId, false)
  await domanda
})

/*
 * C2 R4/R6, dal lato HTTP (07/10/2026): la carta della figlia disegnata nel PADRE. Il padre legge la domanda con
 * `GET /sessions/<figlia>/pending` e risponde con `POST /sessions/<figlia>/approve` dichiarando `rispostoDa: <padre>`;
 * `ApprovalResolved` della figlia lo porta. Registro vero, server su una porta effimera di 127.0.0.1 chiusa a fine prova.
 */
test('C2-04-HTTP CARTA NEL PADRE: pending si legge per id, il padre risponde con rispostoDa, un estraneo prende 403', async (t) => {
  const { createServer } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const { registry, sessionId: padreId, figliaId, inputFiglia } = await scena(t)
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => server.close(() => ok())))
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`
  const visti = []
  const disiscrivi = registry.iscriviti(figliaId, (e) => visti.push(e))
  t.after(() => disiscrivi?.())

  const vuota = await (await fetch(`${base}/${encodeURIComponent(figliaId)}/pending`)).json()
  assert.equal(vuota.data.pending, null, 'senza domanda: null, non un errore')
  assert.equal((await fetch(`${base}/mai-esistita/pending`)).status, 404)

  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 10))
  const letta = await (await fetch(`${base}/${encodeURIComponent(figliaId)}/pending`)).json()
  assert.equal(letta.data.pending?.tipo, 'approvazione')
  assert.equal(letta.data.pending?.azione?.comando, 'npm install')
  const { requestId } = letta.data.pending

  const rispondi = (corpo) => fetch(`${base}/${encodeURIComponent(figliaId)}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  // AL CONTRARIO: chi non è nella catena prende 403, e la domanda resta aperta
  const estraneo = await rispondi({ requestId, approvato: true, rispostoDa: 'sessione-estranea' })
  assert.equal(estraneo.status, 403)
  assert.equal((await estraneo.json()).error.code, 'APPROVAL_ANSWER_FORBIDDEN')
  assert.equal(registry.domandaInAttesa(figliaId)?.requestId, requestId)

  const dalPadre = await rispondi({ requestId, approvato: true, rispostoDa: padreId })
  assert.equal(dalPadre.status, 200)
  assert.equal(await domanda, true, 'la figlia riparte')
  const risolta = visti.find((e) => e.type === 'ApprovalResolved' && e.requestId === requestId)
  assert.equal(risolta?.rispostoDa, padreId, 'la traccia dice da dove si è risposto (R6)')
  assert.equal((await (await fetch(`${base}/${encodeURIComponent(figliaId)}/pending`)).json()).data.pending, null, 'nessuna carta orfana')
})

/* C2-05 e R5 (07/10/2026): il padre non abbona il flusso della figlia, quindi tutto ciò che deve sapere gli arriva dallo
   snapshot `talos.agenti`. Lo stop chiude la domanda (niente carta orfana) e il silenzio la ripresenta anche alla radice. */
const agentiPer = (visti, figliaId) => visti.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.agenti' && e.value?.childId === figliaId)

test('C2-05 STOP: la domanda della figlia chiusa da uno stop ⇒ pending torna null e la radice riceve «resolved»', async (t) => {
  const { registry, sessionId: padreId, figliaId, inputFiglia } = await scena(t)
  const dalPadre = []
  const disiscrivi = registry.iscriviti(padreId, (e) => dalPadre.push(e))
  t.after(() => disiscrivi?.())
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 10))
  const attesa = agentiPer(dalPadre, figliaId).find((e) => e.value.operation?.kind === 'approval' && e.value.operation?.status === 'waiting')
  assert.ok(attesa, 'premessa: la radice sa che la figlia aspetta')
  const requestId = registry.domandaInAttesa(figliaId)?.requestId
  assert.equal(attesa.value.operation.requestId, requestId, 'lo snapshot dice QUALE domanda: la carta del padre non rilegge a ogni rigioco')
  registry.ferma(figliaId)
  assert.equal(await domanda, false, 'lo stop chiude la domanda con un no')
  assert.equal(registry.domandaInAttesa(figliaId), null, 'nessuna carta orfana')
  const ultimo = agentiPer(dalPadre, figliaId).filter((e) => e.value.operation?.kind === 'approval').at(-1)
  assert.equal(ultimo?.value.operation?.status, 'resolved', 'l\'ultima notizia alla radice è «risolta», non «in attesa»')
  assert.equal(ultimo?.value.operation?.requestId, requestId)
  assert.equal(ultimo?.value.operation?.approvato, false, 'con l\'esito: la carta del padre si chiude dicendo il vero')
})

test('C2-05b R5 SILENZIO: la domanda che resta senza risposta si ripresenta ANCHE alla radice', async (t) => {
  const { registry, sessionId: padreId, figliaId, inputFiglia } = await scena(t, { opzioniRegistro: { attesaSilenzioPrimaMs: 20, attesaSilenzioRipetiMs: 1_000 } })
  const dalPadre = []
  const disiscrivi = registry.iscriviti(padreId, (e) => dalPadre.push(e))
  t.after(() => disiscrivi?.())
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 80))
  const attese = agentiPer(dalPadre, figliaId).filter((e) => e.value.operation?.kind === 'approval' && e.value.operation?.status === 'waiting')
  assert.ok(attese.length >= 2, `la radice riceve la domanda e il suo rigioco di silenzio (${attese.length} notizie)`)
  registry.rispondiApprovazione(figliaId, registry.domandaInAttesa(figliaId).requestId, false)
  await domanda
})

test('C2-06b SENZA rispostoDa, o con la figlia stessa: il comportamento di prima, e la traccia non inventa niente', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  const visti = []
  const disiscrivi = registry.iscriviti(figliaId, (e) => visti.push(e))
  t.after(() => disiscrivi?.())
  const prima = inputFiglia.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 10))
  const id1 = registry.domandaInAttesa(figliaId).requestId
  assert.deepEqual(registry.rispondiApprovazione(figliaId, id1, false, { rispostoDa: figliaId }), { ok: true })
  assert.equal(await prima, false)
  assert.equal(visti.find((e) => e.type === 'ApprovalResolved' && e.requestId === id1)?.rispostoDa, undefined, 'la figlia stessa non è «un\'altra sessione»')
})

test('C2-06c LA DIREZIONE SBAGLIATA: una figlia, o una nipote, che risponde alla domanda del PADRE prende 403, e la domanda resta', async (t) => {
  /* review del bugfixer (08/10/2026, mutante C2M2): la catena si RISALE dalla sessione che chiede. Una discendente non è
     «da dove la persona ha risposto» per una domanda del padre: la carta del padre non si disegna nelle figlie. */
  const { registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t)
  await inputFiglia.onDelega('nipote: un lavoro più piccolo', '/tmp/x')
  const nipoteId = registry.elenca().find((s) => s.padreId === figliaId)?.sessionId
  assert.ok(nipoteId, 'premessa: la nipote esiste')
  const domanda = runtime.runs[0].input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 10))
  const requestId = registry.domandaInAttesa(sessionId)?.requestId
  assert.ok(requestId, 'premessa: il padre ha una domanda aperta')
  for (const discendente of [figliaId, nipoteId]) {
    const esito = registry.rispondiApprovazione(sessionId, requestId, true, { rispostoDa: discendente })
    assert.equal(esito?.code, 'APPROVAL_ANSWER_FORBIDDEN', `${discendente === figliaId ? 'la figlia' : 'la nipote'} non risponde per il padre`)
    assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId, 'la domanda resta aperta')
  }
  registry.rispondiApprovazione(sessionId, requestId, false)
  await domanda
})

// ── C2-R4-bis — il PERCHÉ della carta dice la politica che ha deciso ──────────────────────────────────────
/*
 * Da C2-a la figlia agisce con l'INCONTRO dei suoi permessi e di quelli degli antenati. La carta nel padre spiegava il perché
 * coi permessi PROPRI della figlia: padre su «Chiede prima», figlia nata su «Scrive nel progetto» ⇒ la figlia chiede per colpa
 * del padre e la carta diceva «…con la sessione su “Scrive nel progetto”» — un motivo falso. La politica si fotografa alla
 * richiesta (`politica`, solo per il perché); `perAttrezzo` resta quello PROPRIO, perché «Per questa sessione» scrive la figlia.
 */
test('C2-07 PERCHÉ VERO: la domanda della figlia porta la politica della CATENA; «Per questa sessione» resta sulle sue scelte', async (t) => {
  const { registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t)
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  const esito = await registry.aggiornaImpostazioni(sessionId, { permessi: 'On request', permessiPerAttrezzo: { shell: 'chiedi' } })
  assert.notEqual(esito?.ok, false, `premessa: il padre scende (${JSON.stringify(esito)})`)
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'a.txt' })
  await new Promise((r) => setTimeout(r, 10))
  const pendente = registry.domandaInAttesa(figliaId)
  assert.deepEqual(pendente?.politica, { permessi: 'On request', perAttrezzo: { shell: 'chiedi' } }, 'il perché dice la politica che ha deciso')
  assert.equal(pendente.perAttrezzo?.shell, undefined, '«Per questa sessione» parte dalle scelte PROPRIE della figlia, non da quelle del padre')
  registry.rispondiApprovazione(figliaId, pendente.requestId, false)
  await domanda
})

test('C2-07c IL TETTO DEL GIRO: la figlia sale a metà giro, ma il cancello resta al livello d\'avvio — e il perché anche', async (t) => {
  const { registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t)
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  await registry.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  const salita = await registry.aggiornaImpostazioni(figliaId, { permessi: 'Full access' })
  assert.notEqual(salita?.ok, false, `premessa: la figlia può cambiare i suoi permessi (${JSON.stringify(salita)})`)
  assert.equal(livelloVivo(inputFiglia), 'scrittura-progetto', 'premessa (C2-a): il cancello resta al livello con cui il giro è partito')
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'C:/fuori/a.txt', fuoriDalProgetto: { chiave: 'C:/fuori' } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(registry.domandaInAttesa(figliaId)?.politica?.permessi, 'Workspace write', 'il perché dice il livello che il cancello usa davvero')
  registry.rispondiApprovazione(figliaId, registry.domandaInAttesa(figliaId).requestId, false)
  await domanda
})

test('C2-07d FOTOGRAFIA: il padre cambia DOPO la domanda — la domanda non si rivaluta, quindi il perché resta quello che ha deciso', async (t) => {
  const { registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t)
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  await registry.aggiornaImpostazioni(sessionId, { permessi: 'On request' })
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'a.txt' })
  await new Promise((r) => setTimeout(r, 10))
  await registry.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  assert.equal(registry.domandaInAttesa(figliaId)?.politica?.permessi, 'On request', 'la politica di quando la figlia ha chiesto, non quella di adesso')
  registry.rispondiApprovazione(figliaId, registry.domandaInAttesa(figliaId).requestId, false)
  await domanda
})

test('C2-07e PERMESSI ILLEGGIBILI: una parola inventata non avvia una sessione, quindi nessuna carta la nomina', async (t) => {
  /* review del bugfixer (08/10/2026): un `permessi` che non è una delle cinque parole l'incontro lo legge «Sola lettura», ma
     il kernel di una radice lo tratta diversamente — un perché che può essere falso non si mostra. */
  /* owner 10/10 «Porta + kernel chiuso»: una parola inventata non avvia più una sessione, quindi nessuna carta può nominarla; una
     già salvata si legge «Sola lettura» (PORTA-03 in permessi-porta-chiusa). */
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c2-'))
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega un lavoro' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
  t.after(async () => { await registry.chiudi?.(); rimuoviCartellaDiProva(cartellaStore) })
  assert.equal(registry.avvia('task', { permessiScelto: 'Permesso inventato', modalitaOperativaScelta: 'normale' }).code, 'PERMISSIONS_INVALID')
  assert.equal(runtime.runs.length, 0)
})

test('C2-07b AL CONTRARIO: col padre non toccato la politica della catena è quella di sempre; una radice non ne ha bisogno', async (t) => {
  const { registry, sessionId, figliaId, inputFiglia, runtime } = await scena(t)
  const domanda = inputFiglia.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(registry.domandaInAttesa(figliaId)?.politica, { permessi: 'Workspace write', perAttrezzo: {} })
  registry.rispondiApprovazione(figliaId, registry.domandaInAttesa(figliaId).requestId, false)
  await domanda
  const radice = runtime.runs[0].input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm test' })
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(registry.domandaInAttesa(sessionId)?.politica, { permessi: 'Workspace write', perAttrezzo: {} }, 'la radice: i suoi permessi, che sono già la catena')
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, false)
  await radice
})
