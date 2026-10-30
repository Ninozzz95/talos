/*
 * «Segnala un problema», la SECONDA PORTA (owner 29/10/2026; contratto col motore accettato dalla CLI il 29/10): l'attrezzo
 *   `report_problem`. Quattro piani:
 *   · il kernel: senza `onSegnalazioneFn` l'attrezzo NON ESISTE (CLI e telefono non cambiano); con, si offre al root; argomenti
 *     validati; il testo che torna al modello è quello del contratto; nessuna carta di permesso, nemmeno in Accesso pieno;
 *   · il registro: l'ospite ripulisce titolo e descrizione con la stessa pulizia della diagnostica (nota (a) della CLI) e manda a
 *     schermo l'evento durevole della bozza;
 *   · la rotta della diagnostica: solo GET;
 *   · ⛔ lungo TUTTO il filo (lezione del 17/10 e del 21/10: un'opzione nuova si è persa due volte nell'inoltro campo per campo): dalla
 *     rotta vera `POST /api/v1/sessions` al registro, al servizio, al kernel vero con un fornitore finto, fino all'evento.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, NOME_SEGNALAZIONE, TESTO_SEGNALAZIONE_MOSTRATA, validaArgomentiSegnalazione } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry, STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { segnalazioneAccesaDallAmbiente } from '../src/segnalazione-problema.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CHIAVE_FINTA = ['sk-or-v1-', '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f'].join('') // composta: un gettone finto intero lo ferma la protezione dei segreti di GitHub

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-segnala-k-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, argomenti) => ({ id, type: 'function', function: { name: 'report_problem', arguments: JSON.stringify(argomenti) } })
function fornitore(risposte) {
  let n = 0
  const offerti = []
  const testi = []
  return {
    offerti, testi,
    fetchDiRete: async (_url, init) => {
      const corpo = JSON.parse(init?.body ?? '{}')
      offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
      testi.push(JSON.stringify(corpo))
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
  }
}
async function giro(c, risposte, { ospite, extra = {} } = {}) {
  const f = fornitore(risposte)
  const chiamate = []
  const domande = []
  const r = await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: [NOME_SEGNALAZIONE],
    fetchDiRete: f.fetchDiRete,
    chiediApprovazioneFn: async (azione) => { domande.push(azione); return true },
    ...(ospite ? { onSegnalazioneFn: async (argomenti, opzioni) => { chiamate.push([argomenti, opzioni]); return ospite(argomenti, opzioni) } } : {}),
    ...extra,
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti: f.offerti, testi: f.testi, chiamate, domande }
}
const OK = () => ({ ok: true })

test('SEGN-K-01 — senza `onSegnalazioneFn` l\'attrezzo non esiste (nessuna traccia nel testo del modello); con, si offre; a una figlia no', async (t) => {
  const c = cartella(t)
  const senza = await giro(c, [])
  assert.equal(senza.offerti[0].includes('report_problem'), false)
  assert.doesNotMatch(senza.testi[0], /report_problem/u, 'contratto con la CLI: nessuna traccia')
  const con = await giro(c, [], { ospite: OK })
  assert.equal(con.offerti[0].includes('report_problem'), true)
  const figlia = await giro(c, [], { ospite: OK, extra: { agentRole: 'child' } })
  assert.equal(figlia.offerti[0].includes('report_problem'), false)
  // in Piano si offre: non scrive niente (permesso di tipo lettura)
  const piano = await giro(c, [], { ospite: OK, extra: { modalitaOperativa: 'piano' } })
  assert.equal(piano.offerti[0].includes('report_problem'), true)
  // ed è nell'elenco di serie degli attrezzi estesi del desktop
  assert.equal(STRUMENTI_ESTESI_PREDEFINITI.includes('report_problem'), true)
})

test('SEGN-K-02 — la chiamata passa all\'ospite (argomenti puliti, toolCallId) e al modello torna il testo del contratto; nessuna carta di permesso, nemmeno in Accesso pieno', async (t) => {
  const c = cartella(t)
  assert.equal(TESTO_SEGNALAZIONE_MOSTRATA, 'Draft shown to the person: nothing was sent. The person reviews it and opens it on GitHub if they want.')
  for (const livelloAccesso of ['scrittura-progetto', 'accesso-pieno', 'lettura']) {
    const r = await giro(c, [chiama('s1', { kind: 'bug', title: '  Il terminale si blocca  ', description: 'Succede con npm test.' })], { ospite: OK, extra: { livelloAccesso } })
    assert.equal(r.esito('s1'), TESTO_SEGNALAZIONE_MOSTRATA, livelloAccesso)
    assert.deepEqual(r.chiamate, [[{ kind: 'bug', title: 'Il terminale si blocca', description: 'Succede con npm test.' }, { toolCallId: 's1' }]])
    assert.deepEqual(r.domande, [], `nessuna domanda di permesso (${livelloAccesso})`)
  }
})

test('SEGN-K-03 — argomenti storti: REFUSED senza chiamare l\'ospite; un rifiuto dell\'ospite arriva al modello', async (t) => {
  const c = cartella(t)
  for (const [argomenti, attesa] of [
    [{ kind: 'crash', title: 'x' }, /"kind" must be one of bug, wrong_answer, idea/u],
    [{ kind: 'idea' }, /"title" must be/u],
    [{ kind: 'idea', title: '   ' }, /"title" must be/u],
    [{ kind: 'idea', title: 'a'.repeat(121) }, /at most 120/u],
    [{ kind: 'idea', title: 'ok', description: 'd'.repeat(4001) }, /at most 4000/u],
    [{ kind: 'idea', title: 'ok', description: ['no'] }, /"description" must be/u],
  ]) {
    const r = await giro(c, [chiama('x', argomenti)], { ospite: OK })
    assert.match(r.esito('x'), /^REFUSED\. /u, JSON.stringify(argomenti))
    assert.match(r.esito('x'), attesa)
    assert.deepEqual(r.chiamate, [], 'l\'ospite non si chiama')
  }
  assert.deepEqual(validaArgomentiSegnalazione({ kind: 'wrong_answer', title: 't' }), { ok: true, argomenti: { kind: 'wrong_answer', title: 't', description: '' } })
  const rifiutata = await giro(c, [chiama('y', { kind: 'idea', title: 'ok' })], { ospite: () => ({ ok: false, messaggio: 'Nobody can see the draft here.' }) })
  assert.equal(rifiutata.esito('y'), 'REFUSED. Nobody can see the draft here.')
  const rotta = await giro(c, [chiama('z', { kind: 'idea', title: 'ok' })], { ospite: () => { throw new Error('boom') } })
  assert.equal(rotta.esito('z'), 'report_problem failed: boom')
})

/* ——— il registro: l'ospite vero ——— */
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
async function registroCon({ senzaInterfaccia = false, segnalazione = true, senzaOpzione = false } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-segnala-reg-'))
  const progetto = join(radice, 'progetto')
  await mkdir(progetto, { recursive: true })
  const finta = giriFinti()
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, modello: 'm', chiave: 'k', ...(senzaOpzione ? {} : { segnalazione }), guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  })
  const { sessionId } = registro.avvia('task-vero', senzaInterfaccia ? { senzaInterfaccia: true } : {})
  const eventi = []
  const smetti = registro.iscriviti(sessionId, (e) => eventi.push(e))
  return { finta, eventi, sessionId, via: async () => { smetti(); finta.chiudiTutti(); await rimuoviCartellaDiProvaAttesa(radice) } }
}
const bozze = (eventi) => eventi.filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.segnalazione-bozza')

test('SEGN-R-01 — l\'ospite ripulisce titolo e descrizione (chiave, percorso) e manda la bozza a schermo come evento durevole', async () => {
  const b = await registroCon()
  try {
    const ospite = b.finta.giro(0).input.onSegnalazioneFn
    assert.equal(typeof ospite, 'function')
    const esito = await ospite({ kind: 'wrong_answer', title: `Chiave ${CHIAVE_FINTA} nel titolo`, description: 'Il file C:\\Users\\Mario\\progetto\\a.txt e /home/mario/x.py' }, { toolCallId: 'call-9' })
    assert.deepEqual(esito, { ok: true })
    const [bozza] = bozze(b.eventi)
    assert.ok(bozza, JSON.stringify(b.eventi.map((e) => e.name ?? e.type)))
    assert.equal(bozza.value.toolCallId, 'call-9')
    assert.equal(bozza.value.kind, 'wrong_answer')
    assert.match(bozza.value.title, /^Chiave \[redacted\] nel titolo$/u)
    assert.equal(bozza.value.description, 'Il file [path] e [path]')
    assert.ok(!JSON.stringify(bozza).includes('sk-or-v1') && !JSON.stringify(bozza).includes('Mario'))
    assert.equal(typeof bozza.value.at, 'string')
    // AL CONTRARIO: argomenti storti ⇒ niente evento
    const storto = await ospite({ kind: 'nope', title: 'x' }, { toolCallId: 'call-10' })
    assert.equal(storto.ok, false)
    assert.equal(bozze(b.eventi).length, 1)
  } finally { await b.via() }
})

test('SEGN-R-02 — senza nessuno davanti la porta non si lega (nessuno vedrebbe la bozza); senza `segnalazione` (CLI, telefono) nemmeno', async () => {
  const b = await registroCon({ senzaInterfaccia: true })
  try {
    assert.equal(b.finta.giro(0).input.onSegnalazioneFn, undefined)
  } finally { await b.via() }
  const spenta = await registroCon({ segnalazione: false })
  try {
    assert.equal(spenta.finta.giro(0).input.onSegnalazioneFn, undefined, 'spenta: il contratto con la CLI')
  } finally { await spenta.via() }
  // chi crea il registro senza dirlo (la CLI, il telefono): spenta DI SERIE
  const diSerie = await registroCon({ senzaOpzione: true })
  try {
    assert.equal(diSerie.finta.giro(0).input.onSegnalazioneFn, undefined, 'spenta di serie: il contratto con la CLI')
  } finally { await diSerie.via() }
})

/* ——— la rotta della diagnostica ——— */
async function ascolta(t, opzioni) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, ...opzioni }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => server.close(() => ok())))
  return `http://127.0.0.1:${server.address().port}`
}

test('SEGN-H-01 — `GET /api/v1/diagnostica-segnalazione`: la diagnostica ripulita; con `sessionId` la sessione; un POST no', async (t) => {
  const righe = [{ sessionId: 'sess-1', modelId: 'z-ai/glm-5.3-flash', provider: 'openrouter', reasoning: 'medium', permessi: 'Workspace write' }]
  const sessionRegistry = { elenca: () => righe, esiste: (id) => id === 'sess-1', erroriPerSegnalazione: () => [{ codice: 'SHELL_TIMEOUT', alle: '2026-10-29T10:42:00.000Z' }] }
  const base = await ascolta(t, { sessionRegistry, terminalRegistry: { elenca: () => ({ items: [{ attiva: true }] }) },
    versioneDesktopFn: () => ({ versione: '0.1.38', installata: true }) })
  const senza = await (await fetch(`${base}/api/v1/diagnostica-segnalazione`)).json()
  assert.equal(senza.ok, true)
  assert.equal(senza.data.schema, 'talos.segnalazione-diagnostica.v1')
  assert.equal(senza.data.versione, '0.1.38')
  assert.equal(senza.data.sessione, null)
  const con = await (await fetch(`${base}/api/v1/diagnostica-segnalazione?sessionId=sess-1`)).json()
  assert.deepEqual(con.data.sessione, { modello: 'z-ai/glm-5.3-flash', fornitore: 'openrouter', sforzo: 'medium', permesso: 'Workspace write', terminale: true })
  assert.deepEqual(con.data.errori.filter((e) => e.codice === 'SHELL_TIMEOUT'), [{ codice: 'SHELL_TIMEOUT', alle: '2026-10-29T10:42:00.000Z' }])
  assert.ok(con.data.errori.every((e) => Object.keys(e).join() === 'codice,alle'), 'solo codice e ora')
  // una sessione che non c'è: la diagnostica senza sessione, mai un errore
  const ignota = await (await fetch(`${base}/api/v1/diagnostica-segnalazione?sessionId=altra`)).json()
  assert.equal(ignota.data.sessione, null)
  // altri parametri: query non valida
  for (const q of ['?percorso=C:/x', '?sessionId=sess-1&x=1', '?sessionId=', '?sessionId=a&sessionId=b', `?sessionId=${'s'.repeat(201)}`]) {
    assert.equal((await fetch(`${base}/api/v1/diagnostica-segnalazione${q}`)).status, 400, q)
  }
  // solo GET: un POST ha 405 e `Allow` dice che cosa si può
  const post = await fetch(`${base}/api/v1/diagnostica-segnalazione`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
})

/* ——— lungo tutto il filo ——— */
test('SEGN-FILO-01 — dalla rotta vera `POST /api/v1/sessions` al kernel vero: il modello chiama report_problem e a schermo arriva la bozza ripulita', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-segnala-filo-'))
  t.after(() => rimuoviCartellaDiProvaAttesa(radice))
  const progetto = join(radice, 'progetto')
  await mkdir(progetto, { recursive: true })
  /* il servizio chiede il flusso (SSE), come il fornitore vero */
  const enc = new TextEncoder()
  const flusso = (fotogrammi) => new Response(new ReadableStream({ start(ctl) { for (const x of fotogrammi) ctl.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`)); ctl.enqueue(enc.encode('data: [DONE]\n\n')); ctl.close() } }))
  const argomenti = { kind: 'bug', title: 'Il terminale si blocca', description: `Con la chiave ${CHIAVE_FINTA} in D:\\lavoro\\x` }
  const f = { offerti: [], chiamate: 0 }
  f.fetchDiRete = async (_url, init) => {
    f.offerti.push((JSON.parse(init?.body ?? '{}').tools ?? []).map((a) => a.function?.name).filter(Boolean))
    return f.chiamate++ === 0
      ? flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-filo', function: { name: 'report_problem', arguments: JSON.stringify(argomenti) } }] } }] }])
      : flusso([{ choices: [{ delta: { content: 'Ho preparato la bozza.' } }] }])
  }
  const registro = createSessionRegistry({
    modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, segnalazione: true,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'segnala il problema del terminale' } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete: f.fetchDiRete }) }),
  })
  const base = await ascolta(t, { sessionRegistry: registro, listaTaskDisponibili: () => [{ id: 'sconto-a-scaglioni', progetto: 'p', difficolta: 1, consegnaCorta: 'x' }] })
  const risposta = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }) })
  assert.equal(risposta.status, 200)
  const { sessionId } = (await risposta.json()).data
  const eventi = []
  t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)))
  const inizio = Date.now()
  while (!eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError') && Date.now() - inizio < 10_000) await new Promise((r) => setTimeout(r, 20))
  assert.equal(f.offerti[0]?.includes('report_problem'), true, 'il kernel la offre: l\'ospite è arrivato fin lì')
  const [bozza] = bozze(eventi)
  assert.ok(bozza, JSON.stringify(eventi.map((e) => (e.type === 'RunError' ? `${e.code}: ${e.message}` : e.name ?? e.type))))
  assert.equal(bozza.value.toolCallId, 'call-filo')
  assert.equal(bozza.value.description, 'Con la chiave [redacted] in [path]')
  const esito = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call-filo')
  assert.equal(esito?.content, TESTO_SEGNALAZIONE_MOSTRATA)
})

/* Revisione D del 29/10/2026 (F4, trovato dal Mobile): «Codice in casa» (`TalosCodiceInCasa.kt:163`) avvia `server.mjs` SENZA
   `TALOS_LOCALE_OSPITE_DIR`, quindi la sola guardia negativa sull'ambiente non teneva. Ora un interruttore POSITIVO: l'attrezzo c'è solo
   con `TALOS_SEGNALAZIONE_PROBLEMA=on`, messo dal guscio desktop e dallo script del 4174; `TALOS_LOCALE_OSPITE_DIR` resta come secondo
   «spento». */
test('SEGN-R-03 (F4) — l\'interruttore positivo: senza la variabile (il Pad, Codice in casa) niente; «on» sì; «on» con l\'ospite del telefono niente', async () => {
  assert.equal(segnalazioneAccesaDallAmbiente({}), false, 'senza la variabile: il Pad e Codice in casa')
  assert.equal(segnalazioneAccesaDallAmbiente({ TALOS_SEGNALAZIONE_PROBLEMA: 'on' }), true)
  assert.equal(segnalazioneAccesaDallAmbiente({ TALOS_SEGNALAZIONE_PROBLEMA: 'on', TALOS_LOCALE_OSPITE_DIR: 'C:/x' }), false, 'il secondo strato')
  for (const altro of ['1', 'true', 'ON ', 'yes', '']) assert.equal(segnalazioneAccesaDallAmbiente({ TALOS_SEGNALAZIONE_PROBLEMA: altro }), false, JSON.stringify(altro))
  // e server.mjs lo legge dal suo ambiente, non da un valore fisso
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(server, /segnalazione: segnalazioneAccesaDallAmbiente\(process\.env\),/u)
  // dal registro: l'interruttore spento ⇒ nessun attrezzo (il Pad), acceso ⇒ l'attrezzo
  for (const [ambiente, atteso] of [[{}, 'undefined'], [{ TALOS_SEGNALAZIONE_PROBLEMA: 'on' }, 'function']]) {
    const b = await registroCon({ segnalazione: segnalazioneAccesaDallAmbiente(ambiente) })
    try { assert.equal(typeof b.finta.giro(0).input.onSegnalazioneFn, atteso, JSON.stringify(ambiente)) } finally { await b.via() }
  }
})
