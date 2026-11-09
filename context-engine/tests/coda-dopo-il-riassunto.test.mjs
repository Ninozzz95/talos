/*
 * La coda dopo il riassunto (owner 05/11/2026 12:10, registro 224, «come mai si compatta così spesso?»).
 *
 * Reperto dal pannello del contesto: modello da 266,7k, soglia di compattazione 166k; DOPO ogni riassunto il contesto restava a
 * 144,4k (86,9% della soglia), cinque riassunti, grappolo fitto fra il giro 87 e il 97, 19 richieste in un solo invio. Causa: il
 * taglio cade prima delle ultime 2 domande della persona e la coda resta INTERA, coi risultati degli strumenti di quei giri; nessuno
 * controllava che stesse sotto l'obiettivo (`targetRatio`), quindi dopo il riassunto mancava poco alla soglia e se ne pagava un altro.
 *
 * ⛔ Sessione FINTA, costruita qui: 10 invii da 19 richieste ciascuno, risultati grandi. Mai la conversazione dell'owner.
 * Il modello finto ha le proporzioni del reperto (finestra 266.700, soglia ~166k, obiettivo ~122k). Il riassunto in sottofondo si
 * aspetta subito dopo la richiesta che lo ha fatto partire: il conto dei riassunti è quello del caso migliore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { computeContextBudget } from '../src/compaction-planner.mjs';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings, ContextVersionV1 } from '../src/contracts.mjs';
import { clearTailThrough, tailClearingBoundary, clearedOutputPlaceholder, DEFAULT_CLEARED_POINTER, MIN_CLEARABLE_CHARS } from '../src/tool-output-clearing.mjs';

const PROFILO = { provider: 'cloud', model: 'fixture-266k', windowTokens: 266_700, responseReserve: 32_000 };
const now = '2026-11-05T12:00:00.000Z';
/* il tempo corre: 15 secondi per richiesta (una chiamata e la sua uscita), così la pausa dopo un riassunto rifiutato (1, 5, 15 minuti) scade come dal vivo */
const PASSO_MS = 15_000;
const ATTREZZI = [{ type: 'function', function: { name: 'read_file', description: 'Read a file.', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }];
const pesoToken = valore => Math.ceil(JSON.stringify(valore).length / 3.5);
const PUNTATORE = 'To read it again, call conversation_search with this_conversation=true and words from the call.';

/* Un risultato di strumento grande e diverso dagli altri (~9.600 token): con 19 per invio, un invio solo supera la soglia. */
const RIPETIZIONI = Number(process.env.CODA_RIP ?? 700);
const uscita = (invio, k) => `file ${invio}.${k}: ` + `riga ${invio}-${k} del file letto, con il suo contenuto `.repeat(RIPETIZIONI);

async function sessioneFinta(t, { invii = 10, richieste = 19, uscitaDi = uscita, peso = pesoToken } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-coda-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'finta', settings: parseContextSettings({}) });
  let lettiDaiRiassunti = 0;
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    lettiDaiRiassunti += pesoToken(request.messages);
    const corpo = JSON.parse(request.messages.at(-1).content);
    const testo = corpo.untrustedSource ?? '';
    const ids = corpo.sourceIds ?? [];
    const fonte = ids.find(id => /^u\d/u.test(id) && testo.includes(`${id} (user)\n`)) ?? ids.find(id => /^t\d/u.test(id)) ?? ids[0] ?? 'u2';
    const quote = /^u\d/u.test(fonte) ? 'Richiesta numero' : 'file ';
    const summary = { schema: 'talos.context.summary.v1', text: 'Lavoro sui file: letti e confrontati, decisioni prese. '.repeat(30), goal: 'Leggere e confrontare i file del progetto', decisions: ['Usare SQLite'], constraints: [], completed: ['letti i file'], pending: ['confrontare gli altri'], resources: [], sources: [{ recordId: fonte, quote }] };
    return { text: JSON.stringify(summary), finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 100 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: peso({ messages, tools }), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'provider', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clearedToolPointer: PUNTATORE, clock: () => new Date(Date.parse(now) + misure.richieste * PASSO_MS).toISOString() });
  let n = 0;
  const append = message => engine.appendOriginal({ sessionId: 'finta', record: { id: `${message.role[0]}${++n}`, message, createdAt: now } });
  const budget = computeContextBudget({ ...PROFILO, method: 'provider', inputTokens: 0, settings: {} });

  /* `alPubblicato`: la misura che il motore salva nella versione quando pubblica il riassunto (riassunto + coda); `dopoIlRiassunto`: la
     prima richiesta che lo usa, con quello che è arrivato nel frattempo */
  const misure = { richieste: 0, riassunti: 0, alPubblicato: [], dopoIlRiassunto: [], giriDeiRiassunti: [], nonInCache: 0, rotture: 0, rottureSubitoDopo: 0, picco: 0, primaDopo: null, ultima: null, tornateIntere: 0, segnapostoNellaRichiesta: 0, intereFuoriRichiesta: [], doveSiRompe: [], rottureSottoObiettivo: 0 };
  let invioInCorso = 0;
  /* le uscite che la versione attiva mostra col segnaposto: finché la versione resta, non tornano intere (nemmeno quando scatta il livello 1) */
  let segnapostoDellaVersione = new Set();
  let precedente = null; let versione = null; let appenaPubblicato = false;
  const richiesta = async () => {
    const esito = await engine.prepareForRequest({ sessionId: 'finta', sessionModel: PROFILO, tools: ATTREZZI });
    misure.richieste++;
    misure.picco = Math.max(misure.picco, esito.measurement.inputTokens);
    const nuova = Boolean(esito.versionId && esito.versionId !== versione);
    const segnaposto = m => m.role === 'tool' && typeof m.content === 'string' && m.content.startsWith('[Old tool output cleared to save context:');
    /* ⛔ forma della CLI (05/11): un'uscita della richiesta in corso (questo invio) non è mai un segnaposto */
    misure.segnapostoNellaRichiesta += esito.messages.filter(m => segnaposto(m) && m.tool_call_id.startsWith(`c${invioInCorso}-`)).length;
    if (nuova) segnapostoDellaVersione = new Set(esito.messages.filter(segnaposto).map(m => m.tool_call_id));
    else for (const m of esito.messages) if (m.role === 'tool' && segnapostoDellaVersione.has(m.tool_call_id) && !segnaposto(m)) misure.tornateIntere++;
    if (nuova) {
      const attiva = (await engine.getContextState({ sessionId: 'finta' })).activeVersion;
      versione = esito.versionId; misure.riassunti++; misure.dopoIlRiassunto.push(esito.measurement.inputTokens); misure.giriDeiRiassunti.push(misure.richieste);
      misure.alPubblicato.push(attiva.measurement.inputTokens);
      const ultimaChiamata = esito.messages.findLast(m => m.tool_calls?.length)?.tool_calls[0].id;
      misure.intereFuoriRichiesta.push(esito.messages.filter(m => m.role === 'tool' && !segnaposto(m) && m.tool_call_id !== ultimaChiamata && !m.tool_call_id.startsWith(`c${invioInCorso}-`) && m.content.length >= MIN_CLEARABLE_CHARS).length);
      if (!misure.primaDopo && attiva.tailClearedThrough) misure.primaDopo = { messages: esito.messages, version: attiva };
    }
    /* la cache del fornitore vale per il prefisso esatto: dal primo messaggio diverso in poi si rilegge a prezzo pieno */
    let uguali = 0;
    if (precedente) while (uguali < precedente.length && uguali < esito.messages.length && JSON.stringify(precedente[uguali]) === JSON.stringify(esito.messages[uguali])) uguali++;
    if (precedente && uguali < precedente.length) misure.rotture++;
    /* la richiesta subito dopo quella che ha portato il riassunto nuovo: lo stesso prefisso, niente rottura */
    if (appenaPubblicato && !nuova && uguali < precedente.length) {
      misure.rottureSubitoDopo++;
      /* l'unica rottura ammessa: il riassunto si è pubblicato sopra l'obiettivo perché la richiesta in corso era intera (forma della CLI);
         chiusa quella richiesta, il livello 1 di `prepareForRequest` (invariato) ne accorcia le uscite */
      if (misure.alPubblicato.at(-1) <= budget.targetTokens) misure.rottureSottoObiettivo++;
      const prima = precedente[uguali], dopo = esito.messages[uguali];
      misure.doveSiRompe.push(`richiesta ${misure.richieste}, messaggio ${uguali} di ${precedente.length}: ${prima.role} ${prima.tool_call_id ?? ''} ${String(prima.content).slice(0, 50)} → ${dopo?.role} ${dopo?.tool_call_id ?? ''} ${String(dopo?.content).slice(0, 50)}; token ${esito.measurement.inputTokens}`);
    }
    appenaPubblicato = nuova;
    misure.nonInCache += pesoToken(esito.messages.slice(uguali));
    precedente = esito.messages;
    misure.ultima = esito;
    if (esito.job && !['committed', 'failed', 'cancelled'].includes(esito.job.state)) await engine.waitForCompaction({ sessionId: 'finta', jobId: esito.job.id });
    return esito;
  };
  await append({ role: 'system', content: 'Sei un assistente di programmazione.' });
  for (let invio = 1; invio <= invii; invio++) {
    invioInCorso = invio;
    await append({ role: 'user', content: `Richiesta numero ${invio}: leggi i file del modulo ${invio} e confrontali.` });
    for (let k = 1; k <= richieste; k++) {
      await richiesta();
      await append({ role: 'assistant', content: null, tool_calls: [{ id: `c${invio}-${k}`, type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: `modulo${invio}/file${k}.txt` }) } }] });
      await append({ role: 'tool', tool_call_id: `c${invio}-${k}`, content: uscitaDi(invio, k) });
    }
    await richiesta();
    await append({ role: 'assistant', content: `Fatto il confronto del modulo ${invio}.` });
  }
  const lavori = {};
  for (const job of (await engine.getContextState({ sessionId: 'finta' })).jobs) { const chiave = job.error?.code ? `${job.state}:${job.error.code}` : job.state; lavori[chiave] = (lavori[chiave] ?? 0) + 1; }
  misure.lavori = lavori;
  misure.lettiDaiRiassunti = lettiDaiRiassunti;
  return { misure, budget, engine, store };
}

/* Forma della CLI (05/11, bloccante): le uscite della richiesta in corso restano intere. Nel caso dell'owner (19 chiamate in un invio)
   la richiesta in corso da sola supera l'obiettivo: il riassunto si pubblica sopra l'obiettivo, e ciò che resta sopra è SOLO la richiesta
   in corso (nessuna uscita intera fuori di lei). I riassunti rifiutati che seguono (CTX_NO_REDUCTION) sono il costo che la forma lascia
   a `prepareForRequest`, invariato per scelta della CLI: si misurano e vanno nel rapporto, non si nascondono. */
test('CODA-01 (rosso prima): dopo ogni riassunto il contesto sta sotto l’obiettivo o è tutto richiesta in corso, e i riassunti non vengono a grappolo', async t => {
  const { misure, budget } = await sessioneFinta(t);
  t.diagnostic(`obiettivo ${budget.targetTokens}, soglia ${budget.triggerTokens}, limite ${budget.inputLimit}`);
  t.diagnostic(`richieste ${misure.richieste}, riassunti ${misure.riassunti} (alle richieste ${misure.giriDeiRiassunti.join(', ')})`);
  t.diagnostic(`token al riassunto pubblicato: ${misure.alPubblicato.join(', ')}`);
  t.diagnostic(`token alla prima richiesta dopo: ${misure.dopoIlRiassunto.join(', ')}`);
  t.diagnostic(`token non in cache in tutto: ${misure.nonInCache}, rotture della cache: ${misure.rotture} (subito dopo un riassunto: ${misure.rottureSubitoDopo}), picco ${misure.picco}`);
  t.diagnostic(`lavori di riassunto: ${JSON.stringify(misure.lavori)}, token letti dai riassunti: ${misure.lettiDaiRiassunti}`);
  assert.ok(misure.riassunti >= 2, 'premessa: la sessione finta arriva alla soglia più volte');
  t.diagnostic(`uscite intere fuori dalla richiesta in corso, alla pubblicazione: ${misure.intereFuoriRichiesta.join(', ')}`);
  for (const [i, dopo] of misure.alPubblicato.entries()) assert.ok(dopo <= budget.targetTokens || misure.intereFuoriRichiesta[i] === 0, `il riassunto ${i + 1} si pubblica a ${dopo} token, sopra l’obiettivo ${budget.targetTokens}, con ${misure.intereFuoriRichiesta[i]} uscite intere fuori dalla richiesta in corso`);
  /* fra un riassunto e l'altro la conversazione deve poter crescere da sotto l'obiettivo fino alla soglia: almeno
     (soglia − obiettivo) / peso di una richiesta, mai il grappolo */
  const distanze = misure.giriDeiRiassunti.slice(1).map((g, i) => g - misure.giriDeiRiassunti[i]);
  const minima = Math.floor((budget.triggerTokens - budget.targetTokens) / pesoToken(uscita(10, 10)));
  for (const d of distanze) assert.ok(d >= minima, `due riassunti a ${d} richieste di distanza (minimo atteso ${minima}): grappolo`);
  t.diagnostic(`rotture subito dopo un riassunto: ${misure.doveSiRompe.join(' | ') || 'nessuna'}`);
  assert.equal(misure.rottureSottoObiettivo, 0, 'dopo un riassunto pubblicato sotto l’obiettivo la richiesta dopo ha lo stesso prefisso: il punto della coda è fermo');
  assert.equal(misure.tornateIntere, 0, 'un’uscita col segnaposto della versione non torna intera finché la versione resta');
  assert.equal(misure.segnapostoNellaRichiesta, 0, 'nessuna uscita della richiesta in corso è un segnaposto (forma della CLI)');
  assert.ok((misure.lavori.committed ?? 0) >= misure.riassunti, 'ogni riassunto contato è un lavoro pubblicato');
  assert.ok(misure.picco <= budget.inputLimit, 'la richiesta entra sempre nel limite');
});

/* Una richiesta CHIUSA grande nella coda (l'invio 2, tenuto intero da `retainRecentTurns`) e una in corso piccola: il riassunto copre l'invio
   1, le uscite vecchie dell'invio 2 diventano segnaposto finché si sta sotto l'obiettivo, quelle dell'invio 3 restano intere. */
async function codaConRichiestaChiusa(t, { uscitaChiusa, quante = 4, peso = pesoToken } = {}) {
  const { engine, append, scambio } = await motoreFinto(t, { peso });
  await append({ role: 'system', content: 'Sei un assistente di programmazione.' });
  await append({ role: 'user', content: 'Richiesta numero 1: leggi il file iniziale.' });
  await scambio('p1', uscita(1, 1));
  await append({ role: 'assistant', content: 'Fatto il modulo 1.' });
  await append({ role: 'user', content: 'Richiesta numero 2: leggi i file grandi.' });
  for (let k = 1; k <= quante; k++) await scambio(`g${k}`, uscitaChiusa(k));
  await append({ role: 'assistant', content: 'Fatto il modulo 2.' });
  const u3 = await append({ role: 'user', content: 'Richiesta numero 3: leggi ancora due file.' });
  await scambio('n1', uscita(3, 1));
  await scambio('n2', uscita(3, 2));
  const job = await engine.startCompaction({ sessionId: 'finta', idempotencyKey: 'auto-coda-chiusa', sessionModel: PROFILO, tools: ATTREZZI });
  const fine = await engine.waitForCompaction({ sessionId: 'finta', jobId: job.id });
  const version = (await engine.getContextState({ sessionId: 'finta' })).activeVersion;
  const { messages } = await engine.prepareForRequest({ sessionId: 'finta', sessionModel: PROFILO, tools: ATTREZZI });
  return { fine, version, messages, inizioRichiesta: u3.headSequence };
}
const grandeChiusa = k => `file grande ${k}: ` + `riga ${k} del file grande della richiesta chiusa `.repeat(3_000);

test('CODA-02: la richiesta dopo il riassunto mostra col segnaposto le uscite vecchie della richiesta chiusa, e intera quella in corso', async t => {
  const { fine, version, messages, inizioRichiesta } = await codaConRichiestaChiusa(t, { uscitaChiusa: grandeChiusa });
  const budget = computeContextBudget({ ...PROFILO, method: 'provider', inputTokens: 0, settings: {} });
  assert.equal(fine.state, 'committed');
  assert.ok(version.tailClearedThrough > version.coveredThrough, 'la versione dice fin dove la coda è accorciata');
  assert.ok(version.tailClearedThrough < inizioRichiesta, 'il confine sta prima della richiesta in corso');
  assert.ok(version.measurement.inputTokens <= budget.targetTokens, `pubblicato a ${version.measurement.inputTokens}, sopra l’obiettivo ${budget.targetTokens}`);
  const uscite = messages.filter(m => m.role === 'tool');
  const segnaposto = uscite.filter(m => m.content.startsWith('[Old tool output cleared to save context: read_file('));
  assert.ok(segnaposto.length > 0, 'qualche uscita vecchia è un segnaposto');
  for (const m of segnaposto) assert.match(m.content, /returned \d+ characters, \d+ lines\. To read it again, call conversation_search/u, 'nome, dimensione e rimando');
  assert.ok(segnaposto.every(m => m.tool_call_id.startsWith('g')), 'solo uscite della richiesta chiusa');
  for (const id of ['n1', 'n2']) assert.ok(uscite.find(m => m.tool_call_id === id).content.startsWith('file 3.'), `l’uscita ${id} della richiesta in corso è intera`);
  /* i segnaposto sono i più vecchi: dopo il primo intero non ce n'è più nessuno */
  const primoIntero = uscite.findIndex(m => m.content.startsWith('file '));
  assert.ok(uscite.slice(primoIntero).every(m => m.content.startsWith('file ')), 'dalla più vecchia: nessun segnaposto dopo un’uscita intera');
  /* ogni chiamata ha ancora la sua uscita, e nessun messaggio è sparito */
  const chiamate = messages.flatMap(m => (m.tool_calls ?? []).map(c => c.id));
  assert.deepEqual(uscite.map(m => m.tool_call_id), chiamate);
});

const voce = (sequence, message) => ({ sequence, message });
const chiamata = (id, nome = 'read_file') => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify({ path: `${id}.txt` }) } }] });
const esito = (id, caratteri) => ({ role: 'tool', tool_call_id: id, content: 'x'.repeat(caratteri) });

test('CODA-03: il confine parte dalla più vecchia, si ferma appena tolto abbastanza, e risparmia l’ultimo scambio, le uscite corte e le immagini', () => {
  const coda = [
    voce(10, { role: 'user', content: 'leggi' }),
    voce(11, chiamata('a')), voce(12, esito('a', 5000)),
    voce(13, chiamata('b')), voce(14, esito('b', MIN_CLEARABLE_CHARS)),
    voce(15, chiamata('c')), voce(16, { role: 'tool', tool_call_id: 'c', content: [{ type: 'image_url', image_url: { url: 'data:x' } }, { type: 'text', text: 'y'.repeat(4000) }] }),
    voce(17, chiamata('d')), voce(18, esito('d', 6000)),
    voce(19, chiamata('e')), voce(20, esito('e', 7000)),
    voce(21, { role: 'assistant', content: 'fatto' }),
  ];
  const segnoA = clearedOutputPlaceholder(coda[2].message, coda[1].message.tool_calls[0]);
  const unoSolo = tailClearingBoundary(coda, { removeChars: 1 });
  assert.deepEqual(unoSolo, { through: 12, cleared: 1, removedChars: 5000 - segnoA.length }, 'la più vecchia basta');
  const due = tailClearingBoundary(coda, { removeChars: 5000 - segnoA.length + 1 });
  assert.equal(due.through, 18, 'la corta (14) e quella con l’immagine (16) si saltano');
  assert.equal(due.cleared, 2);
  const tutto = tailClearingBoundary(coda, { removeChars: Infinity });
  assert.equal(tutto.through, 18, 'l’ultimo scambio chiuso (la chiamata e e la sua uscita) non si tocca mai');
  assert.deepEqual(tailClearingBoundary(coda, { removeChars: 0 }), { through: 0, cleared: 0, removedChars: 0 }, 'niente da togliere, niente si tocca');
  assert.deepEqual(tailClearingBoundary([voce(1, chiamata('z')), voce(2, esito('z', 9000))], { removeChars: Infinity }).through, 0, 'un solo scambio: è l’ultimo, resta intero');
  assert.equal(tailClearingBoundary(undefined, { removeChars: Infinity }).through, 0);
});

test('CODA-04: la coda accorciata: segnaposto con nome, dimensione e rimando fino al confine, gli stessi oggetti altrove', () => {
  const coda = [voce(1, chiamata('a', 'grep')), voce(2, { role: 'tool', tool_call_id: 'a', content: 'riga\n'.repeat(200) }), voce(3, chiamata('b')), voce(4, esito('b', 3000)), voce(5, { role: 'user', content: 'u'.repeat(900) })];
  const fuori = clearTailThrough(coda, 2, { pointer: 'RIMANDO' });
  assert.equal(fuori[1].content, `[Old tool output cleared to save context: grep({"path":"a.txt"}) returned 1000 characters, 201 lines. RIMANDO]`);
  assert.equal(fuori[1].tool_call_id, 'a', 'la coppia chiamata/uscita resta');
  for (const i of [0, 2, 3, 4]) assert.equal(fuori[i], coda[i].message, `il messaggio ${i} è lo stesso oggetto`);
  assert.equal(clearTailThrough(coda, 4)[3].content.endsWith(`${DEFAULT_CLEARED_POINTER}]`), true, 'il rimando di serie');
  assert.equal(clearTailThrough(coda, 5)[4], coda[4].message, 'un messaggio della persona non si tocca mai');
  assert.deepEqual(clearTailThrough(null, 9), []);
  assert.equal(clearedOutputPlaceholder({ role: 'user', content: 'x'.repeat(900) }, null), null);
  assert.match(clearedOutputPlaceholder(esito('q', MIN_CLEARABLE_CHARS + 1), undefined), /^\[Old tool output cleared to save context: tool\(\{\}\) returned 501 characters, 1 lines\./u);
});

test('CODA-05: una versione di prima (senza `tailClearedThrough`) si legge ancora; il campo nuovo è un numero di sequenza', () => {
  const vecchia = { schema: 'talos.context.version.v1', id: 'v1', sessionId: 'chat', coveredThrough: 2, sourceIds: ['u0'], sourceHash: 'a'.repeat(64), summary: { schema: 'talos.context.summary.v1', text: 's', goal: 'g', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [] }, activeMessages: [], model: { provider: 'local', model: 'fixture' }, measurement: { schema: 'talos.context.tokens.v1', inputTokens: 1, windowTokens: 10, responseReserve: 1, method: 'heuristic', exact: false, requestHash: 'b'.repeat(64), provider: 'local', model: 'fixture' }, createdAt: now };
  assert.equal(ContextVersionV1.safeParse(vecchia).success, true);
  assert.equal(ContextVersionV1.safeParse({ ...vecchia, tailClearedThrough: 9 }).data.tailClearedThrough, 9);
  assert.equal(ContextVersionV1.safeParse({ ...vecchia, tailClearedThrough: -1 }).success, false);
  assert.equal(ContextVersionV1.safeParse({ ...vecchia, tailClearedThrough: '9' }).success, false);
});

/* Revisione coi mutanti (05/11): il primo taglio si stima coi caratteri per token della misura intera. Se le uscite più vecchie costano
   POCO per carattere (qui le prime 6 uscite di ogni invio hanno un riempitivo che il contatore finto pesa 1 token ogni 40 caratteri), togliere quei caratteri rende meno token
   della stima: serve un secondo giro che aggiunge (non sostituisce) quanto togliere, e il riassunto si pubblica comunque sotto l'obiettivo. */
test('CODA-06: uscite vecchie leggere per carattere: il motore rimisura e aggiunge finché sta sotto l’obiettivo', async t => {
  const pesoMisto = valore => { const s = JSON.stringify(valore); const punti = s.split('·').length - 1; return Math.ceil((s.length - punti) / 3.5 + punti / 40); };
  /* le prime uscite della richiesta chiusa pesano pochi token per carattere: la prima stima toglie troppo poco, il motore rimisura */
  const uscitaChiusa = k => (k <= 2 ? `file leggero ${k}: ` + '·'.repeat(200_000) + 'x'.repeat(14_000) : grandeChiusa(k));
  const { fine, version, messages } = await codaConRichiestaChiusa(t, { uscitaChiusa, quante: 6, peso: pesoMisto });
  const budget = computeContextBudget({ ...PROFILO, method: 'provider', inputTokens: 0, settings: {} });
  t.diagnostic(`pubblicato a ${version.measurement.inputTokens}, obiettivo ${budget.targetTokens}, confine ${version.tailClearedThrough}`);
  assert.equal(fine.state, 'committed');
  assert.ok(version.measurement.inputTokens <= budget.targetTokens, `pubblicato a ${version.measurement.inputTokens}, sopra l’obiettivo ${budget.targetTokens}`);
  assert.ok(messages.filter(m => m.role === 'tool' && m.content.startsWith('[Old tool output cleared')).some(m => m.tool_call_id === 'g3'), 'il confine è andato oltre le uscite leggere');
});

/* Forma della CLI (05/11, bloccante): le uscite della RICHIESTA IN CORSO non diventano mai segnaposto. La protezione del 31/10
   (`proteggiRichiesta`, chiusura della compattazione) vale anche per la coda dopo il riassunto: il confine si ferma prima dell'inizio della
   richiesta. Se la richiesta da sola supera l'obiettivo, il riassunto si pubblica senza toccarla. */
async function motoreFinto(t, { peso = pesoToken } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-coda7-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'finta', settings: parseContextSettings({}) });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    const corpo = JSON.parse(request.messages.at(-1).content);
    const fonte = (corpo.sourceIds ?? []).find(id => /^u\d/u.test(id)) ?? 'u2';
    const summary = { schema: 'talos.context.summary.v1', text: 'Letti i file del primo modulo.', goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti i file'], pending: [], resources: [], sources: [{ recordId: fonte, quote: 'Richiesta numero' }] };
    return { text: JSON.stringify(summary), finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 100 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: peso({ messages, tools }), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'provider', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clearedToolPointer: PUNTATORE, clock: () => now });
  let n = 0;
  const append = message => engine.appendOriginal({ sessionId: 'finta', record: { id: `${message.role[0]}${++n}`, message, createdAt: now } });
  const scambio = async (id, testo) => {
    await append({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: `${id}.txt` }) } }] });
    await append({ role: 'tool', tool_call_id: id, content: testo });
  };
  return { engine, append, scambio };
}

test('CODA-07 (forma della CLI): un riassunto pubblicato a metà richiesta lascia intere le uscite della richiesta in corso', async t => {
  const { engine, append, scambio } = await motoreFinto(t);
  await append({ role: 'system', content: 'Sei un assistente di programmazione.' });
  await append({ role: 'user', content: 'Richiesta numero 1: leggi i file del modulo 1.' });
  for (let k = 1; k <= 6; k++) await scambio(`p${k}`, uscita(1, k));
  await append({ role: 'assistant', content: 'Fatto il modulo 1.' });
  await append({ role: 'user', content: 'Richiesta numero 2: leggi i quattro file grandi.' });
  /* la richiesta in corso: tre uscite grandi (~40 mila token l'una) prima dell'ultima; da sola supera l'obiettivo (~122 mila) */
  const grande = id => `${id}: ` + 'riga del file grande letto adesso '.repeat(4_200);
  for (const id of ['a', 'b', 'c', 'd']) await scambio(id, grande(id));
  const job = await engine.startCompaction({ sessionId: 'finta', idempotencyKey: 'auto-coda-07', sessionModel: PROFILO, tools: ATTREZZI, retainRecentTurns: 1 });
  const fine = await engine.waitForCompaction({ sessionId: 'finta', jobId: job.id });
  assert.equal(fine.state, 'committed', 'il riassunto si pubblica anche se la richiesta da sola supera l’obiettivo');
  const versione = (await engine.getContextState({ sessionId: 'finta' })).activeVersion;
  assert.equal(versione.tailClearedThrough ?? 0, 0, 'nessun confine dentro la richiesta in corso');
  const dopo = await engine.prepareForRequest({ sessionId: 'finta', sessionModel: PROFILO, tools: ATTREZZI });
  const uscite = Object.fromEntries(dopo.messages.filter(m => m.role === 'tool').map(m => [m.tool_call_id, m.content]));
  for (const id of ['a', 'b', 'c', 'd']) assert.equal(uscite[id], grande(id), `l’uscita ${id} della richiesta in corso è intera`);
});

