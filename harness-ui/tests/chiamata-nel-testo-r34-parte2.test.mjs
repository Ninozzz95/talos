/*
 * R-34 parte 2 (owner 30/10/2026 «Regola per tipo di modello»; forma in in-corso/PROPOSTA-R34-PARTE-2-2026-10-30.md, sì di Desktop,
 * CLI e Mobile). Un modello LOCALE che scrive la chiamata come testo: si PROMUOVE solo con argomenti che reggono lo schema, con la
 * persona davanti adesso e col SUO sì sulla carta (sempre, anche in accesso pieno); un sì solo; altrimenti si riprende come in rete.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as nucleo from '../src/kernel/talosHarness.mjs';
const { talosLavora } = nucleo
import * as filtro from '../src/kernel/chiamata-nel-testo.mjs';
/* letto dal modulo (non per nome) così la prova si carica anche sul nucleo di PRIMA della parte 2 e si vede rossa */
const argomentiDalFrammento = (...a) => filtro.argomentiDalFrammento(...a)
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const LOCALE = 'ollama:llama3'
const enc = new TextEncoder()
const flusso = (testo) => new Response(new ReadableStream({
  start(c) {
    for (let i = 0; i < testo.length; i += 7) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: testo.slice(i, i + 7) } }] })}\n\n`))
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`))
    c.enqueue(enc.encode('data: [DONE]\n\n'))
    c.close()
  },
}))
const CODA_LEGGI = 'Leggo il file:leggi<arg_key>percorso</arg_key><arg_value>a.txt</arg_value></tool_call>'
const CODA_ROTTA = 'Leggo il file:leggi<arg_key>percorso: a.txt</arg_value></tool_call>' // la chiave non si chiude mai
const CODA_SHELL = 'Lancio:shell<arg_key>comando</arg_key><arg_value>echo ciao-dal-testo</arg_value></tool_call>'

/* di serie un ospite CAPACE (passa `personaPresenteFn`: sa decidere presenza e capacità dei client); `senzaPorta` lo toglie */
async function giro({ coda = CODA_LEGGI, modello = LOCALE, ospite, senzaPorta = false, ...altro } = {}) {
  if (!senzaPorta && !Object.hasOwn(altro, 'personaPresenteFn')) altro.personaPresenteFn = () => true
  /* decisione 44: la promozione del testo è spenta di serie; queste prove la provano accesa (P2-44 prova il valore di serie) */
  if (!Object.hasOwn(altro, 'promuoviDalTesto')) altro.promuoviDalTesto = true
  const cartella = cartellaDiProva('talos-r34p2-')
  writeFileSync(join(cartella, 'a.txt'), 'CONTENUTO-SEGRETO-DEL-FILE\n')
  const delta = [], eventi = [], corpi = [], chieste = []
  let i = 0
  await talosLavora({
    cartella, task: { consegna: 'leggi a.txt' }, modello, chiave: 'finta',
    ...(ospite === undefined ? { chiediApprovazioneFn: async (a) => { chieste.push({ ...a, esitiPrima: eventi.filter((e) => e.tipo === 'tool-esito').length }); return true } }
      : ospite === null ? {} : { chiediApprovazioneFn: async (a) => { chieste.push({ ...a, esitiPrima: eventi.filter((e) => e.tipo === 'tool-esito').length }); return ospite(a) } }),
    onDelta: (d) => delta.push(d), onGiro: (e) => eventi.push(e),
    fetchDiRete: async (_u, o) => { corpi.push(JSON.parse(o.body)); return flusso(i++ === 0 ? coda : 'Fatto.') },
    ...altro,
  })
  const testo = delta.filter((d) => d.tipo === 'testo').map((d) => d.delta).join('')
  const nelTesto = eventi.filter((e) => e.tipo === 'chiamata-nel-testo')
  /* l'id che il nucleo ha dato alla chiamata promossa (unico per la conversazione: `daTesto-<casuale>-<n>`) */
  const id = delta.find((d) => d.tipo === 'tool-inizio' && d.daTesto === true)?.toolCallId ?? null
  return { delta, eventi, corpi, chieste, testo, nelTesto, id }
}

test('P2-01 gli argomenti: le coppie GLM chiuse e lo schema; una chiave mai chiusa o un obbligatorio mancante ⇒ null', () => {
  const schema = { type: 'object', properties: { percorso: { type: 'string' }, limit: { type: 'integer' } }, required: ['percorso'] }
  assert.deepEqual(argomentiDalFrammento({ forma: 'glm', frammento: 'leggi<arg_key>percorso</arg_key><arg_value>a.txt</arg_value><arg_key>limit</arg_key><arg_value>5</arg_value></tool_call>' }, schema), { percorso: 'a.txt', limit: 5 })
  assert.equal(argomentiDalFrammento({ forma: 'glm', frammento: 'leggi<arg_key>percorso: a.txt</arg_value></tool_call>' }, schema), null, 'chiave mai chiusa ⇒ manca l\'obbligatorio')
  assert.equal(argomentiDalFrammento({ forma: 'glm', frammento: 'leggi<arg_key>altro</arg_key><arg_value>x</arg_value></tool_call>' }, schema), null, 'chiave sconosciuta e obbligatorio mancante')
  assert.equal(argomentiDalFrammento({ forma: 'glm', frammento: 'leggi<arg_key>percorso</arg_key><arg_value>a.txt</arg_value><arg_key>altro</arg_key><arg_value>x</arg_value></tool_call>' }, schema), null,
    'obbligatorio presente ma una chiave che lo schema non dichiara ⇒ non si promuove')
  assert.deepEqual(argomentiDalFrammento({ forma: 'json', frammento: '<tool_call>{"name":"leggi","arguments":{"percorso":"b.txt"}}</tool_call>' }, schema), { percorso: 'b.txt' })
  assert.deepEqual(argomentiDalFrammento({ forma: 'json', frammento: '<tool_call>{"name":"leggi","arguments":"{\\"percorso\\":\\"c.txt\\"}"}</tool_call>' }, schema), { percorso: 'c.txt' })
})

test('P2-02 locale + sì della persona: UNA carta «chiamata-dal-testo» con semprePersona, l\'attrezzo parte una volta con l\'id del nucleo e daTesto', async () => {
  const { delta, eventi, corpi, chieste, testo, nelTesto, id } = await giro()
  assert.equal(chieste.length, 1)
  assert.equal(chieste[0].tipo, 'chiamata-dal-testo')
  assert.equal(chieste[0].semprePersona, true)
  assert.equal(chieste[0].nome, 'leggi')
  assert.deepEqual(chieste[0].argomenti, { percorso: 'a.txt' })
  assert.equal(chieste[0].fraseChiave, 'server.approval.callFromText')
  assert.equal(chieste[0].esitiPrima, 0, 'niente è partito prima del sì')
  const inizio = delta.find((d) => d.tipo === 'tool-inizio')
  assert.match(String(inizio?.toolCallId), /^daTesto-[0-9a-f]{12}-1$/u)
  assert.equal(inizio?.daTesto, true)
  const esito = eventi.find((e) => e.tipo === 'tool-esito' && e.toolCallId === id)
  assert.ok(esito && !esito.isError, JSON.stringify(esito))
  assert.match(String(esito.content), /CONTENUTO-SEGRETO-DEL-FILE/u)
  assert.doesNotMatch(testo, /<arg_key>|<\/tool_call>/u, 'il markup mai a schermo')
  assert.equal(corpi.length, 2)
  const assistente = corpi[1].messages.filter((m) => m.role === 'assistant').at(-1)
  assert.equal(assistente.tool_calls?.[0]?.id, id, 'il passo dopo ha la chiamata vera')
  assert.ok(corpi[1].messages.some((m) => m.role === 'tool' && m.tool_call_id === id))
  assert.equal(corpi[1].messages.some((m) => typeof m.content === 'string' && m.content.startsWith('[TALOS:')), false, 'nessuna nota di ripresa')
  assert.deepEqual(nelTesto.map((e) => [e.esito, e.approvata]), [['promossa', true]])
})

test('P2-03 la persona dice NO: l\'attrezzo non parte, il modello legge il rifiuto, il giornale dice approvata:false', async () => {
  const { eventi, chieste, nelTesto, id } = await giro({ ospite: () => false })
  assert.equal(chieste.length, 1)
  const esito = eventi.find((e) => e.tipo === 'tool-esito' && e.toolCallId === id)
  assert.equal(esito?.isError, false, `il no della persona non è un guasto (Tester R2): ${JSON.stringify(esito)}`)
  assert.match(String(esito.content), /^DECLINED\. .*Do not ask again/u)
  assert.doesNotMatch(String(esito.content), /CONTENUTO-SEGRETO-DEL-FILE/u, 'il file non è stato letto')
  assert.deepEqual(nelTesto.map((e) => [e.esito, e.approvata]), [['promossa', false]])
})

/* Decisione 44 dell'owner (02/11, riconfermata il 03/11): di serie il testo libero non diventa un'azione. Nessuna carta FE-005, ripresa come in rete,
   motivo «decisione-44»; e il file non si legge. AL CONTRARIO: con l'opzione accesa la carta torna (P2-02). */
test('P2-44 di serie (decisione 44): la chiamata scritta come testo non porta la carta e non parte; ripresa col motivo «decisione-44»', async () => {
  const { chieste, nelTesto, corpi } = await giro({ promuoviDalTesto: undefined }) // l'opzione non c'è: vale il valore di serie del nucleo
  assert.equal(chieste.length, 0, 'nessuna carta del testo')
  assert.equal(nelTesto[0]?.esito, 'ripresa')
  assert.equal(nelTesto[0]?.motivo, 'decisione-44')
  assert.doesNotMatch(JSON.stringify(corpi), /CONTENUTO-SEGRETO-DEL-FILE/u, 'il file non è stato letto')
  assert.match(String(corpi[1].messages.at(-1).content), /^\[TALOS:/u)
  const acceso = await giro({ promuoviDalTesto: true })
  assert.equal(acceso.chieste.length, 1, 'AL CONTRARIO: accesa, la carta c è')
})

test('P2-04 argomenti che non si leggono: nessuna carta, ripresa con motivo «argomenti»', async () => {
  const { chieste, nelTesto, corpi } = await giro({ coda: CODA_ROTTA })
  assert.equal(chieste.length, 0)
  assert.equal(nelTesto[0]?.esito, 'ripresa')
  assert.equal(nelTesto[0]?.motivo, 'argomenti')
  assert.match(String(corpi[1].messages.at(-1).content), /^\[TALOS:/u)
})

for (const [nome, altro] of [['nessuno davanti (-p, automazioni)', { nessunoDavanti: true }], ['senza persona (passo di Workflow)', { senzaPersona: true }],
  ['la persona non è più davanti (personaPresenteFn false)', { personaPresenteFn: () => false }]]) {
  test(`P2-05 ${nome}: nessuna carta, ripresa con motivo «nessuna-persona»`, async () => {
    const { chieste, nelTesto } = await giro(altro)
    assert.equal(chieste.length, 0)
    assert.equal(nelTesto[0]?.esito, 'ripresa')
    assert.equal(nelTesto[0]?.motivo, 'nessuna-persona')
  })
}

test('P2-06 l\'ospite non ha un client capace ({ nessunaPersona }) o non ha nessun canale: ripresa con motivo «nessun-client», mai eseguita', async () => {
  const uno = await giro({ ospite: () => ({ nessunaPersona: true }) })
  assert.equal(uno.chieste.length, 1)
  assert.equal(uno.nelTesto[0]?.esito, 'ripresa')
  assert.equal(uno.nelTesto[0]?.motivo, 'nessun-client')
  assert.equal(uno.eventi.some((e) => e.tipo === 'tool-esito'), false)
  const due = await giro({ ospite: null })
  assert.equal(due.nelTesto[0]?.motivo, 'nessun-client')
  assert.equal(due.eventi.some((e) => e.tipo === 'tool-esito'), false)
  const tre = await giro({ ospite: () => ({ nessunaPersona: true, motivo: 'nessuna-persona' }) })
  assert.equal(tre.nelTesto[0]?.motivo, 'nessuna-persona', 'l\'ospite può dire che la persona non c\'è')
})

test('P2-10 (Mobile, carta cieca) un ospite che NON passa personaPresenteFn (non sa ancora filtrare i client vecchi): nessuna carta, ripresa «nessun-client»', async () => {
  const { chieste, nelTesto, eventi } = await giro({ senzaPorta: true })
  assert.equal(chieste.length, 0, 'il canale c\'è, ma la carta non parte')
  assert.equal(nelTesto[0]?.esito, 'ripresa')
  assert.equal(nelTesto[0]?.motivo, 'nessun-client')
  assert.equal(eventi.some((e) => e.tipo === 'tool-esito'), false)
})

test('P2-07 (CLI) accesso pieno: la carta c\'è lo stesso, e niente parte prima del sì', async () => {
  const { chieste, eventi, id } = await giro({ coda: CODA_SHELL, livelloAccesso: 'accesso-pieno' })
  assert.equal(chieste.length, 1)
  assert.equal(chieste[0].tipo, 'chiamata-dal-testo')
  assert.equal(chieste[0].esitiPrima, 0)
  assert.ok(eventi.some((e) => e.tipo === 'tool-esito' && e.toolCallId === id))
})

test('P2-08 UN sì solo: shell con «chiedi» per attrezzo e il sì sulla carta ⇒ nessuna seconda domanda, il comando gira', async () => {
  const { chieste, eventi, id } = await giro({ coda: CODA_SHELL, livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'chiedi' } })
  assert.deepEqual(chieste.map((c) => c.tipo), ['chiamata-dal-testo'], JSON.stringify(chieste.map((c) => c.tipo)))
  const esito = eventi.find((e) => e.tipo === 'tool-esito' && e.toolCallId === id)
  assert.match(String(esito?.content), /ciao-dal-testo/u)
})

test('P2-11 (Desktop S1) il «sì solo» NON salta mai una carta FORZATA: ogni segno dell\'elenco arriva alla persona; la carta ordinaria no', async () => {
  const { SEGNI_DI_CARTA_FORZATA, chiediConUnSiSolo } = nucleo
  /* REV8-01 (revisione della fase 8, 01/11/2026): la carta SEMPRE, un segno interno (simbolo) — prove in impostazioni-carta-sempre */
  /* decisione 155 (04/11/2026): la cancellazione critica è una carta forzata anche lei */
  assert.deepEqual([...SEGNI_DI_CARTA_FORZATA], ['segreto', 'trifecta', 'fuoriDalProgetto', 'contenutoSospetto', 'wslRoot', 'percorsoDiRete', 'fileDiControllo', 'cancellazioneCritica', nucleo.CARTA_SEMPRE])
  const arrivate = []
  const chiedi = chiediConUnSiSolo(async (a) => { arrivate.push(a); return 'dalla persona' }, new Set(['daTesto-x-1']))
  assert.equal(await chiedi({ tipo: 'shell', toolCallId: 'daTesto-x-1', comando: 'echo' }), true, 'la carta ordinaria della chiamata approvata: sì da sé')
  assert.equal(arrivate.length, 0)
  for (const segno of SEGNI_DI_CARTA_FORZATA) {
    assert.equal(await chiedi({ tipo: 'leggi', toolCallId: 'daTesto-x-1', percorso: '.env', [segno]: segno === 'trifecta' ? true : { qualcosa: 1 } }), 'dalla persona', segno)
  }
  assert.equal(arrivate.length, SEGNI_DI_CARTA_FORZATA.length)
  assert.equal(await chiedi({ tipo: 'shell', toolCallId: 'call_altro', comando: 'echo' }), 'dalla persona', 'un altro id arriva alla persona')
  assert.equal(await chiedi({ tipo: 'chiamata-dal-testo', toolCallId: 'daTesto-x-1' }), 'dalla persona', 'la carta del testo stessa arriva alla persona')
})

test('P2-15 (Desktop S1, il giro intero) una chiamata dal testo APPROVATA che legge .env: la carta del segreto arriva lo stesso alla persona', async () => {
  const cartella = cartellaDiProva('talos-r34p2-segreto-')
  writeFileSync(join(cartella, '.env'), 'API_KEY=sk-finta-0000\n')
  const chieste = []
  let i = 0
  await talosLavora({
    /* «scrittura nel progetto»: la carta del segreto è FORZATA (con l'Accesso pieno l'owner, 12/10, l'ha tolta per legge) */
    cartella, task: { consegna: 'leggi .env' }, modello: LOCALE, chiave: 'finta', personaPresenteFn: () => true, promuoviDalTesto: true, livelloAccesso: 'scrittura-progetto',
    chiediApprovazioneFn: async (a) => { chieste.push(a); return true },
    onDelta: () => {}, onGiro: () => {},
    fetchDiRete: async () => flusso(i++ === 0 ? 'Leggo:leggi<arg_key>percorso</arg_key><arg_value>.env</arg_value></tool_call>' : 'Fatto.'),
  })
  assert.equal(chieste[0]?.tipo, 'chiamata-dal-testo')
  assert.ok(chieste.slice(1).some((a) => a.segreto), `dopo la carta del testo deve arrivare la carta del segreto: ${JSON.stringify(chieste.map((a) => ({ tipo: a.tipo, segreto: Boolean(a.segreto) })))}`)
})

/* P2-16 (Desktop, guardia): legge il NUCLEO e trova ogni chiave di primo livello delle azioni passate a chiediApprovazioneFn — gli
   oggetti scritti nella chiamata e quelli aggiunti con `...(condizione ? { chiave: … } : {})` in `azioneDaChiedere`. Ogni chiave che
   non è ORDINARIA deve stare in SEGNI_DI_CARTA_FORZATA: una carta forzata nuova senza il suo segno sarebbe saltata in silenzio dal
   «sì solo». */
function chiaviDiPrimoLivello(sorgente, inizio) {
  const chiavi = new Set()
  let profondita = 0
  const aperture = [] // per ogni graffa aperta: vale come primo livello?
  for (let i = inizio; i < sorgente.length; i++) {
    const ch = sorgente[i]
    if (ch === '{') {
      const prima = sorgente.slice(Math.max(0, i - 3), i)
      aperture.push(profondita === 0 || (aperture.at(-1) === true && /\?\s*$/u.test(prima)))
      profondita += 1
      continue
    }
    if (ch === '}') { profondita -= 1; aperture.pop(); if (profondita === 0) break; continue }
    /* una chiave comincia dove, saltati gli spazi, prima c'è `{` o `,` (mai dopo `:`, che è un valore; mai uno `...`) */
    if (aperture.at(-1) === true && /[A-Za-z_]/u.test(ch) && !/[\w.]/u.test(sorgente[i - 1])) {
      const primaNonSpazio = /\S(?=\s*$)/u.exec(sorgente.slice(Math.max(0, i - 40), i))?.[0]
      const m = /^([A-Za-z_]\w*)\s*(?::|,|\})/u.exec(sorgente.slice(i, i + 80))
      if (m && (primaNonSpazio === '{' || primaNonSpazio === ',')) chiavi.add(m[1])
    }
  }
  return chiavi
}
test('P2-16 (Desktop, guardia) ogni chiave non ordinaria delle azioni di approvazione del nucleo è un segno di carta forzata', async () => {
  const { readFileSync } = await import('node:fs')
  const sorgente = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8')
  /* E1 (decisione 121): `emulata` è ordinaria — è il segno della carta del TESTO stessa (`tipo: 'chiamata-dal-testo'`), che il «sì
     solo» non copre mai, e offre la terza risposta; non apre né toglie nessun'altra carta. */
  const ORDINARIE = new Set(['tipo', 'toolCallId', 'comando', 'percorso', 'semprePersona', 'nome', 'argomenti', 'azione', 'coordinazione', 'emulata'])
  const trovate = new Set()
  for (const m of sorgente.matchAll(/chiediApprovazioneFn\(\{/gu)) for (const k of chiaviDiPrimoLivello(sorgente, m.index + 'chiediApprovazioneFn('.length)) trovate.add(k)
  /* E1: anche le carte del testo, che arrivano all'ospite attraverso `verificaChiamataDalTesto` (prima la guardia non le leggeva) */
  const carteDelTesto = [...sorgente.matchAll(/verificaChiamataDalTesto\(\{/gu)]
  assert.ok(carteDelTesto.length >= 2, 'premessa: la carta del testo e quella degli emulati ci sono ancora')
  for (const m of carteDelTesto) for (const k of chiaviDiPrimoLivello(sorgente, m.index + 'verificaChiamataDalTesto('.length)) trovate.add(k)
  assert.ok(trovate.has('emulata'), 'premessa: la lettura trova la chiave della carta degli emulati')
  const forzata = sorgente.indexOf('const azioneDaChiedere = (segretoForzaConferma')
  assert.ok(forzata > 0, 'premessa: la costruzione della carta forzata c\'è ancora')
  for (const k of chiaviDiPrimoLivello(sorgente, sorgente.indexOf('?', forzata) + 1)) trovate.add(k)
  assert.ok(trovate.has('segreto') && trovate.has('wslRoot') && trovate.has('percorsoDiRete'), `premessa: la lettura trova le carte note: ${[...trovate].join(' ')}`)
  const scoperte = [...trovate].filter((k) => !ORDINARIE.has(k) && !nucleo.SEGNI_DI_CARTA_FORZATA.includes(k))
  assert.deepEqual(scoperte, [], 'chiavi di una carta che il «sì solo» non conosce: aggiungerle a SEGNI_DI_CARTA_FORZATA o alle ordinarie, dicendo perché')
})

test('P2-12 (Desktop S2) il tipo lo dice lo schema: una proprietà stringa resta testo anche se sembra un numero o un booleano', () => {
  const schema = { type: 'object', properties: { comando: { type: 'string' }, timeout: { type: 'number' }, forza: { type: 'boolean' } }, required: ['comando'] }
  assert.deepEqual(argomentiDalFrammento({ forma: 'glm', frammento: 'shell<arg_key>comando</arg_key><arg_value>123</arg_value><arg_key>timeout</arg_key><arg_value>30</arg_value><arg_key>forza</arg_key><arg_value>true</arg_value></tool_call>' }, schema),
    { comando: '123', timeout: 30, forza: true })
  assert.deepEqual(argomentiDalFrammento({ forma: 'glm', frammento: 'shell<arg_key>comando</arg_key><arg_value>true</arg_value></tool_call>' }, schema), { comando: 'true' })
})

test('P2-13 (CLI, Desktop S3) due chiamate promosse in due giri diversi hanno id diversi, e mai con un prefisso dei fornitori', async () => {
  const uno = await giro()
  const due = await giro()
  assert.ok(uno.id && due.id)
  assert.notEqual(uno.id, due.id)
  for (const id of [uno.id, due.id]) assert.match(id, /^daTesto-[0-9a-f]{12}-\d+$/u)
})

test('P2-14 (Desktop S3) dopo due «no» nello stesso giro niente terza carta: si riprende come in rete, motivo «gia-rifiutata»', async () => {
  const cartella = cartellaDiProva('talos-r34p2-no-')
  writeFileSync(join(cartella, 'a.txt'), 'x\n')
  const chieste = [], eventi = []
  let i = 0
  await talosLavora({
    cartella, task: { consegna: 'leggi a.txt' }, modello: LOCALE, chiave: 'finta', personaPresenteFn: () => true, promuoviDalTesto: true,
    chiediApprovazioneFn: async (a) => { chieste.push(a.tipo); return false },
    onDelta: () => {}, onGiro: (e) => eventi.push(e),
    fetchDiRete: async () => flusso(i++ < 3 ? CODA_LEGGI : 'Fatto.'),
  })
  assert.deepEqual(chieste, ['chiamata-dal-testo', 'chiamata-dal-testo'], 'due carte, non tre')
  const ev = eventi.filter((e) => e.tipo === 'chiamata-nel-testo')
  assert.deepEqual(ev.map((e) => e.esito), ['promossa', 'promossa', 'ripresa'])
  assert.equal(ev[2].motivo, 'gia-rifiutata')
})

test('P2-09 AL CONTRARIO: un modello in RETE resta alla parte 1 — nessuna carta anche con un canale, ripresa e mai eseguita', async () => {
  const { chieste, nelTesto, eventi } = await giro({ modello: 'z-ai/glm-5.3-flash' })
  assert.equal(chieste.length, 0)
  assert.equal(nelTesto[0]?.esito, 'ripresa')
  assert.equal(nelTesto[0]?.motivo, undefined)
  assert.equal(eventi.some((e) => e.tipo === 'tool-esito'), false)
})
