import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { leggiIntestazioneSessione, leggiRegistroAStream } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * LONG-CHAT «prima la coda», tappa B (owner 07/10/2026 notte: «Sì, dentro la 0.5.0» + «solo opzioni additive nel kernel e patch al
 * desktop»; dossier DOSSIER-CODA-CHAT-LUNGHE-2026-10-07.md). Oggi `ripristina()` legge e ricostruisce TUTTE le sessioni dell'archivio,
 * anche per aprirne una sola o per partire con un compito nuovo: sull'archivio vero dell'owner (43 giornali, 57 MB) sono ~0,3-0,5 s a
 * ogni avvio. Qui `ripristina({ soloSessioni })` (additivo: senza opzioni tutto com'era) ripristina le sole FAMIGLIE delle sessioni
 * chieste — madre, figlie, nipoti: la riconciliazione dei dialoghi e delle collisioni è fra sorelle, quindi la famiglia si carica
 * intera — e legge dagli altri giornali SOLO la prima riga (`leggiIntestazioneSessione`: sola lettura, mai la riparazione della coda).
 * Concorrenti letti nel codice (07/10/2026): Codex `thread-store/src/local/thread_rollout_resolver.rs` (si risolve UN rollout per id),
 * Pi `session-manager.ts:1761` (`open` legge prima la sola intestazione, e se supera il tetto ricade sul caricamento completo: «l'autorità
 * resta il caricamento pieno»), OpenCode `session.ts:540` (`Session.get(id)`: una riga). Lezione Claude Code 2.1.267 (09/09/2026): una ripresa
 * veloce che perde record è peggio di una lenta ⇒ il test portante qui è il CONFRONTO con il ripristino completo, non il tempo.
 */

const SCHEMA = 1;
const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FIGLIA_A = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const FIGLIA_B = 'cccccccc-3333-4333-8333-cccccccccccc';
const NIPOTE = 'dddddddd-4444-4444-8444-dddddddddddd';
const SOLITARIA = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const ALTRA_MADRE = 'ffffffff-6666-4666-8666-ffffffffffff';
const ALTRA_FIGLIA = '99999999-7777-4777-8777-999999999999';
const FAMIGLIA = [MADRE, FIGLIA_A, FIGLIA_B, NIPOTE];

function scriviSessione(cartellaStore, sessionId, { padreId = null, profonditaDelega = 0, consegnaCorta, avviataAlle, scrive = [], conclusa = true, cartella }) {
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const righe = [
    {
      tipo: 'intestazione', schema: SCHEMA, sessionId,
      taskId: padreId ? `delega:${padreId}` : 'libero:coda',
      cartella,
      task: { consegna: `Sei una sessione di lavoro autonoma.\nCompito: ${consegnaCorta}`, consegnaCorta },
      comandoProva: null, forkDa: null, avviataAlle,
      modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
      mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
      padreId, profonditaDelega, provider: 'cloud', runtimeId: null,
      modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true,
    },
    evento('RunStarted', { threadId: sessionId, runId: 'r1' }),
    evento('TextMessageStart', { messageId: `m-${sessionId}`, role: 'assistant' }),
    evento('TextMessageContent', { messageId: `m-${sessionId}`, delta: `ciao da ${consegnaCorta}` }),
    evento('TextMessageEnd', { messageId: `m-${sessionId}` }),
    ...scrive.map((percorso) => evento('StateDelta', { delta: [{ op: 'add', path: `/file/${percorso}`, value: {} }] })),
  ];
  if (conclusa) righe.push(evento('RunFinished', { threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } }));
  writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

/** Due famiglie e una solitaria: madre → (figlia A → nipote, figlia B interrotta); altra madre → altra figlia; una senza deleghe. */
function archivio() {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'coda-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'coda-lavoro-'));
  scriviSessione(cartellaStore, MADRE, { consegnaCorta: 'Paper tecnico', avviataAlle: '2026-09-11T09:00:00.000Z', cartella });
  /* la linea del tempo della madre esiste già sul disco (un record `grafo-agenti`): al ripristino le figlie senza nodo ricevono la loro «recovery-gap» */
  appendFileSync(join(cartellaStore, `${MADRE}.jsonl`), `${JSON.stringify({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: MADRE, seq: 1, at: '2026-09-11T09:00:30.000Z', coverage: 'complete', event: 'started', sourceSeq: null, node: { sessionId: MADRE, conclusa: true } })}\n`, 'utf8');
  scriviSessione(cartellaStore, FIGLIA_A, { padreId: MADRE, profonditaDelega: 1, consegnaCorta: 'Parte 1', avviataAlle: '2026-09-11T09:01:00.000Z', scrive: ['parte-1.md', 'condiviso.md'], cartella });
  scriviSessione(cartellaStore, FIGLIA_B, { padreId: MADRE, profonditaDelega: 1, consegnaCorta: 'Parte 2', avviataAlle: '2026-09-11T09:02:00.000Z', scrive: ['condiviso.md'], conclusa: false, cartella });
  scriviSessione(cartellaStore, NIPOTE, { padreId: FIGLIA_A, profonditaDelega: 2, consegnaCorta: 'Bibliografia', avviataAlle: '2026-09-11T09:03:00.000Z', scrive: ['bibliografia.md'], cartella });
  scriviSessione(cartellaStore, SOLITARIA, { consegnaCorta: 'Senza deleghe', avviataAlle: '2026-09-11T09:04:00.000Z', cartella });
  scriviSessione(cartellaStore, ALTRA_MADRE, { consegnaCorta: 'Altro lavoro', avviataAlle: '2026-09-12T09:00:00.000Z', cartella });
  scriviSessione(cartellaStore, ALTRA_FIGLIA, { padreId: ALTRA_MADRE, profonditaDelega: 1, consegnaCorta: 'Altra parte', avviataAlle: '2026-09-12T09:01:00.000Z', cartella });
  return { cartellaStore, cartella };
}

function registro(cartellaStore, letti = null) {
  return createSessionRegistry({
    cartellaStore,
    avviaSessioneFn: async () => ({ ok: true }),
    guardaWorkspaceFn: () => () => {},
    modello: 'z-ai/glm-5.3-flash',
    chiave: 'chiave-finta',
    clock: () => new Date('2026-10-07T12:00:00.000Z'),
    ...(letti ? { leggiRegistroAStreamFn: (args) => { letti.push(args.sessionId); return leggiRegistroAStream(args); } } : {}),
  });
}

const ids = (reg) => reg.elenca().map((r) => r.sessionId).sort();
function eventiDi(reg, sessionId) {
  const eventi = [];
  const off = reg.iscriviti(sessionId, (e) => eventi.push(e), 0);
  if (typeof off === 'function') off();
  return eventi;
}

test('CODA-B1 una sessione chiesta porta la sua FAMIGLIA intera (madre, figlie, nipoti) e nient\'altro; degli altri giornali non si legge neanche un record', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const letti = [];
  const reg = registro(cartellaStore, letti);
  const esito = await reg.ripristina({ soloSessioni: [NIPOTE] });
  assert.deepEqual(ids(reg), [...FAMIGLIA].sort(), 'chiesta la nipote: arrivano madre, due figlie e nipote');
  assert.equal(esito.ripristinate, 4);
  assert.equal(esito.parziale, true, 'chi chiama sa che è un ripristino parziale');
  assert.deepEqual([...letti].sort(), [...FAMIGLIA].sort(), 'solo i giornali della famiglia sono stati letti per intero');
});

test('CODA-B1 «niente»: soloSessioni vuoto non ripristina nulla e non apre nessun giornale (l\'avvio con un compito nuovo)', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const letti = [];
  const reg = registro(cartellaStore, letti);
  const esito = await reg.ripristina({ soloSessioni: [] });
  assert.deepEqual(ids(reg), []);
  assert.deepEqual(letti, []);
  assert.equal(esito.ripristinate, 0);
  assert.equal(esito.parziale, true);
});

test('CODA-B1 «niente» non apre nemmeno un giornale dalla prima riga illeggibile: l\'avvio con un compito nuovo non paga l\'archivio', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  writeFileSync(join(cartellaStore, '12345678-8888-4888-8888-123456789012.jsonl'), `non json${String.fromCharCode(10)}`, 'utf8');
  const letti = [];
  const reg = registro(cartellaStore, letti);
  await reg.ripristina({ soloSessioni: [] });
  assert.deepEqual(letti, []);
  assert.deepEqual(ids(reg), []);
});

test('CODA-B1 CONFRONTO COL COMPLETO: per ogni sessione chiesta, la famiglia parziale è IDENTICA a quella del ripristino completo (righe, figlie, linea del tempo, eventi riprodotti)', async (t) => {
  /* ⛔ ogni registro ha il SUO archivio fresco: un ripristino scrive sul disco (le «recovery-gap», le annotazioni di dialoghi interrotti), quindi
     due registri sullo stesso archivio non si confrontano — il secondo parte da un disco già cambiato dal primo */
  const fresco = () => { const a = archivio(); t.after(() => { rimuoviCartellaDiProva(a.cartellaStore); rimuoviCartellaDiProva(a.cartella); }); return a.cartellaStore; };
  const completo = registro(fresco());
  await completo.ripristina();
  const righe = (reg, lista) => JSON.stringify(reg.elenca().filter((r) => lista.includes(r.sessionId)).sort((a, b) => a.sessionId.localeCompare(b.sessionId)));
  for (const [chiesta, famiglia] of [[NIPOTE, FAMIGLIA], [FIGLIA_B, FAMIGLIA], [MADRE, FAMIGLIA], [SOLITARIA, [SOLITARIA]], [ALTRA_FIGLIA, [ALTRA_MADRE, ALTRA_FIGLIA]]]) {
    const parziale = registro(fresco());
    await parziale.ripristina({ soloSessioni: [chiesta] });
    assert.deepEqual(ids(parziale), [...famiglia].sort(), `famiglia di ${chiesta}`);
    assert.equal(righe(parziale, famiglia), righe(completo, famiglia), `elenca() di ${chiesta}`);
    for (const sessionId of famiglia) {
      assert.deepEqual(eventiDi(parziale, sessionId), eventiDi(completo, sessionId), `eventi riprodotti di ${sessionId}`);
    }
    const radice = famiglia[0];
    assert.equal(JSON.stringify(parziale.elencaFigli(radice)), JSON.stringify(completo.elencaFigli(radice)), `elencaFigli(${radice})`);
    assert.equal(JSON.stringify(await parziale.timelineAgenti(radice)), JSON.stringify(await completo.timelineAgenti(radice)), `linea del tempo di ${radice}`);
  }
});

test('CODA-B1 ADDITIVO e IDEMPOTENTE: una seconda chiamata porta un\'altra famiglia senza toccare la prima né ripetere le sue riconciliazioni', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const intestazioniLette = [];
  const reg = createSessionRegistry({
    cartellaStore, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
    leggiIntestazioneSessioneFn: (args) => { intestazioniLette.push(args.sessionId); return leggiIntestazioneSessione(args); },
  });
  await reg.ripristina({ soloSessioni: [MADRE] });
  const contaGrafo = () => readFileSync(join(cartellaStore, `${MADRE}.jsonl`), 'utf8').split('\n').filter((riga) => riga.includes('"tipo":"grafo-agenti"')).length;
  const lineaPrima = JSON.stringify(await reg.timelineAgenti(MADRE));
  const grafoPrima = contaGrafo();
  assert.ok(grafoPrima > 0, 'il ripristino della famiglia ha scritto la sua «recovery-gap»: la prova sotto non è vuota');
  const rigaPrima = JSON.stringify(reg.elenca().find((r) => r.sessionId === MADRE));
  intestazioniLette.length = 0;
  const altro = archivio();
  t.after(() => { rimuoviCartellaDiProva(altro.cartellaStore); rimuoviCartellaDiProva(altro.cartella); });
  const letti2 = [];
  const reg2 = registro(altro.cartellaStore, letti2);
  await reg2.ripristina({ soloSessioni: [MADRE] });
  letti2.length = 0;
  await reg2.ripristina({ soloSessioni: [MADRE] });
  assert.deepEqual(letti2, [], 'chiedere di nuovo una famiglia già in memoria non rilegge nulla');
  await reg.ripristina({ soloSessioni: [SOLITARIA] });
  assert.deepEqual(ids(reg), [...FAMIGLIA, SOLITARIA].sort());
  assert.equal(JSON.stringify(reg.elenca().find((r) => r.sessionId === MADRE)), rigaPrima, 'la prima famiglia è com\'era');
  assert.equal(JSON.stringify(await reg.timelineAgenti(MADRE)), lineaPrima, 'e la sua linea del tempo non ha ricevuto una seconda «recovery-gap»');
  assert.equal(contaGrafo(), grafoPrima, 'nemmeno sul disco: nessun nuovo record di linea del tempo per la famiglia già ripristinata');
  assert.equal(intestazioniLette.length, 3, 'delle sette sessioni, le quattro già in memoria non si rileggono: se ne leggono le intestazioni solo delle altre tre');
  const stato = reg.statoPersistenza();
  assert.equal(stato.ultimaLettura.ripristinate, 5, 'il conto della persistenza è cumulativo: 4 + 1');
  assert.equal(stato.ultimaLettura.totali, 7, 'e i totali sono quelli dell\'archivio');
});

test('CODA-B1 un id che non esiste non rompe niente e non ripristina niente', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const reg = registro(cartellaStore);
  const esito = await reg.ripristina({ soloSessioni: ['00000000-0000-4000-8000-000000000000'] });
  assert.deepEqual(ids(reg), []);
  assert.equal(esito.ripristinate, 0);
});

test('CODA-B1 FAIL-SAFE: un giornale la cui prima riga non si legge viene ripristinato comunque (meno non si può provare) e dichiarato; la famiglia chiesta arriva intera', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const GUASTA = '12345678-8888-4888-8888-123456789012';
  writeFileSync(join(cartellaStore, `${GUASTA}.jsonl`), 'questa non e una riga json\n{"tipo":"intestazione"}\n', 'utf8');
  const letti = [];
  const reg = registro(cartellaStore, letti);
  await reg.ripristina({ soloSessioni: [SOLITARIA] });
  assert.ok(ids(reg).includes(SOLITARIA));
  assert.ok(letti.includes(GUASTA), 'il giornale di cui non si prova l\'appartenenza è stato letto per intero');
  assert.ok(!ids(reg).includes(MADRE), 'ma le famiglie PROVATE estranee restano fuori');
  assert.ok(reg.statoPersistenza().scartate.some((s) => s.sessionId === GUASTA), 'e lo scarto ha il suo motivo');
  await reg.ripristina({ soloSessioni: [MADRE] });
  assert.ok(reg.statoPersistenza().scartate.some((s) => s.sessionId === GUASTA), 'una chiamata successiva non cancella ciò che la prima ha dichiarato');
});

test('CODA-B1 uno scarto dichiarato dalla prima chiamata (un giornale della famiglia con una riga rotta nel mezzo) resta dichiarato dopo una seconda chiamata su un\'altra famiglia', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const NL = String.fromCharCode(10);
  const percorso = join(cartellaStore, `${FIGLIA_B}.jsonl`);
  const righe = readFileSync(percorso, 'utf8').split(NL).filter(Boolean);
  writeFileSync(percorso, [righe[0], 'riga rotta nel mezzo', ...righe.slice(1)].join(NL) + NL, 'utf8');
  const reg = registro(cartellaStore);
  await reg.ripristina({ soloSessioni: [MADRE] });
  assert.ok(reg.statoPersistenza().scartate.some((s) => s.sessionId === FIGLIA_B && s.motivo === 'corrotta'), 'la prima chiamata dichiara la figlia danneggiata');
  await reg.ripristina({ soloSessioni: [SOLITARIA] });
  assert.ok(reg.statoPersistenza().scartate.some((s) => s.sessionId === FIGLIA_B && s.motivo === 'corrotta'), 'e la seconda chiamata, che non la riguarda, non lo dimentica');
  assert.deepEqual(reg.statoPersistenza().corrotte, [FIGLIA_B]);
});

test('CODA-B1 un lettore di intestazioni che SBAGLIA non fa fallire il ripristino: nessuna prova di estraneità ⇒ si ripristina tutto', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const reg = createSessionRegistry({
    cartellaStore, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
    leggiIntestazioneSessioneFn: async () => { throw new Error('disco in fiamme'); },
  });
  const esito = await reg.ripristina({ soloSessioni: [SOLITARIA] });
  assert.equal(ids(reg).length, 7);
  assert.equal(esito.ripristinate, 7);
});

test('CODA-B1 una figlia il cui padre non sta nell\'archivio è radice di se stessa: la sorella orfana resta fuori', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const PADRE_PERSO = '77777777-9999-4999-8999-777777777777';
  const ORFANA_1 = '66666666-aaaa-4aaa-8aaa-666666666666';
  const ORFANA_2 = '55555555-bbbb-4bbb-8bbb-555555555555';
  scriviSessione(cartellaStore, ORFANA_1, { padreId: PADRE_PERSO, profonditaDelega: 1, consegnaCorta: 'Orfana uno', avviataAlle: '2026-09-13T09:00:00.000Z', cartella });
  scriviSessione(cartellaStore, ORFANA_2, { padreId: PADRE_PERSO, profonditaDelega: 1, consegnaCorta: 'Orfana due', avviataAlle: '2026-09-13T09:01:00.000Z', cartella });
  const reg = registro(cartellaStore);
  await reg.ripristina({ soloSessioni: [ORFANA_1] });
  assert.deepEqual(ids(reg), [ORFANA_1]);
});

test('CODA-B1 senza opzioni è tutto com\'era: ripristina() porta ogni sessione dell\'archivio, non parziale', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const reg = registro(cartellaStore);
  const esito = await reg.ripristina();
  assert.equal(ids(reg).length, 7);
  assert.equal(esito.ripristinate, 7);
  assert.ok(!esito.parziale);
});

test('CODA-B1 leggiIntestazioneSessione: legge la sola prima riga, SENZA toccare il file (nemmeno una coda spezzata si ripara)', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const ok = await leggiIntestazioneSessione({ cartellaStore, sessionId: NIPOTE });
  assert.equal(ok.stato, 'ok');
  assert.equal(ok.intestazione.padreId, FIGLIA_A);
  assert.equal(ok.intestazione.sessionId, NIPOTE);
  /* una coda spezzata a metà append: il ripristino completo la RIPARA riscrivendo il file, la lettura dell'intestazione no */
  const percorso = join(cartellaStore, `${SOLITARIA}.jsonl`);
  appendFileSync(percorso, '{"type":"TextMessageContent","messageId":"x","del', 'utf8');
  const prima = { size: statSync(percorso).size, mtimeMs: statSync(percorso).mtimeMs };
  const letta = await leggiIntestazioneSessione({ cartellaStore, sessionId: SOLITARIA });
  assert.equal(letta.stato, 'ok');
  const dopo = statSync(percorso);
  assert.equal(dopo.size, prima.size, 'stessa taglia');
  assert.equal(dopo.mtimeMs, prima.mtimeMs, 'stesso istante di modifica: nessuna scrittura');
  assert.equal((await leggiIntestazioneSessione({ cartellaStore, sessionId: 'assente-0000' })).stato, 'assente');
});

test('CODA-B1 leggiIntestazioneSessione: riga d\'apertura troppo grande, illeggibile o che non è un\'intestazione ⇒ lo dice, non indovina', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'coda-int-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const NL = String.fromCharCode(10);
  writeFileSync(join(cartellaStore, 'grande.jsonl'), `${JSON.stringify({ tipo: 'intestazione', sessionId: 'grande', riempimento: 'x'.repeat(5000) })}${NL}`, 'utf8');
  writeFileSync(join(cartellaStore, 'rotta.jsonl'), `non json${NL}`, 'utf8');
  writeFileSync(join(cartellaStore, 'altro.jsonl'), `${JSON.stringify({ type: 'RunStarted' })}${NL}`, 'utf8');
  writeFileSync(join(cartellaStore, 'vuota.jsonl'), '', 'utf8');
  writeFileSync(join(cartellaStore, 'conblank.jsonl'), `${NL}  ${NL}${JSON.stringify({ tipo: 'intestazione', sessionId: 'conblank', padreId: 'p1' })}${NL}${JSON.stringify({ type: 'RunStarted' })}${NL}`, 'utf8');
  writeFileSync(join(cartellaStore, 'senzafine.jsonl'), JSON.stringify({ tipo: 'intestazione', sessionId: 'senzafine', padreId: null }), 'utf8');
  assert.equal((await leggiIntestazioneSessione({ cartellaStore, sessionId: 'grande' }, { tettoByte: 1024 })).stato, 'troppo-grande');
  assert.equal((await leggiIntestazioneSessione({ cartellaStore, sessionId: 'grande' })).stato, 'ok', 'col tetto normale si legge');
  assert.equal((await leggiIntestazioneSessione({ cartellaStore, sessionId: 'rotta' })).stato, 'illeggibile');
  assert.equal((await leggiIntestazioneSessione({ cartellaStore, sessionId: 'altro' })).stato, 'non-intestazione');
  assert.equal((await leggiIntestazioneSessione({ cartellaStore, sessionId: 'vuota' })).stato, 'illeggibile');
  assert.equal((await leggiIntestazioneSessione({ cartellaStore, sessionId: 'senzafine' })).stato, 'ok', 'una prima riga senza fine riga, se è tutto il file, è la riga');
  const conBlank = await leggiIntestazioneSessione({ cartellaStore, sessionId: 'conblank' });
  assert.equal(conBlank.stato, 'ok', 'le righe vuote prima dell\'intestazione si saltano, come nella lettura completa');
  assert.equal(conBlank.intestazione.padreId, 'p1');
});

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError('Task non ammesso');
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'prova' } };
}

test('CODA-B1 una famiglia VIVA con un dialogo padre↔figlia in attesa non viene toccata da un ripristino parziale successivo (la riconciliazione guarda solo le voci ripristinate DA QUELLA chiamata)', async (t) => {
  const { cartellaStore, cartella } = archivio();
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  const run = [];
  const reg = createSessionRegistry({
    cartellaStore,
    avviaSessioneFn: (input) => {
      let risolvi;
      const promessa = new Promise((r) => { risolvi = r; });
      run.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${run.length}`, runId: `r${run.length}` });
      return promessa;
    },
    preparaEsecuzioneFn: preparaEsecuzioneFinta,
    guardaWorkspaceFn: () => () => {},
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
  });
  const { sessionId: padreId } = reg.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  const { childId } = await run[0].input.onDelega('indaga', '/tmp/figlio');
  run[0].input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  run[0].risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'attendo' }] } });
  await new Promise((r) => setImmediate(r));
  const attesa = run[1].input.askParentFn('Quale versione?');
  attesa.catch(() => {});
  await new Promise((r) => setImmediate(r));
  const stati = () => reg.esporta(padreId).eventi.filter((e) => e?.name === 'talos.agent-dialogue').map((e) => e.value.status);
  assert.deepEqual(stati(), ['requested'], 'il dialogo è vivo e in attesa');
  await reg.ripristina({ soloSessioni: [SOLITARIA] });
  assert.ok(ids(reg).includes(SOLITARIA), 'la famiglia chiesta è arrivata');
  assert.deepEqual(stati(), ['requested'], 'e il dialogo vivo NON è stato annullato come «server riavviato»');
  reg.ferma(childId); reg.ferma(padreId);
});

test('CODA-B1 un chiamante che passa null, una stringa o niente non ha opzioni: ripristina tutto come prima', async (t) => {
  for (const argomento of [undefined, null, 'tutto', 7, {}, { soloSessioni: 'non-un-array' }]) {
    const { cartellaStore, cartella } = archivio();
    t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
    const reg = registro(cartellaStore);
    const esito = await reg.ripristina(argomento);
    assert.equal(ids(reg).length, 7, String(argomento));
    assert.ok(!esito.parziale);
  }
});

/* Review del desktop (REV-CLI-01, 08/10/2026): uno scarto dichiarato da un ripristino PARZIALE porta la stessa chiave di traduzione del ripristino completo
   (Doctor e `statoPersistenza` traducono il motivo da `motivoChiave`: senza, «corrotta» resta una parola italiana a schermo). */
test('REV-CLI-01 uno scarto dichiarato da un ripristino PARZIALE porta la stessa chiave di traduzione del ripristino completo', async (t) => {
  const prepara = () => {
    const { cartellaStore, cartella } = archivio();
    t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
    const percorso = join(cartellaStore, `${FIGLIA_B}.jsonl`);
    const righe = readFileSync(percorso, 'utf8').split('\n').filter(Boolean);
    writeFileSync(percorso, [righe[0], 'riga rotta nel mezzo', ...righe.slice(1)].join('\n') + '\n', 'utf8');
    return cartellaStore;
  };
  const completo = registro(prepara());
  await completo.ripristina();
  const parziale = registro(prepara());
  await parziale.ripristina({ soloSessioni: [MADRE] });
  const scartoDi = (reg) => reg.statoPersistenza().scartate.find((s) => s.sessionId === FIGLIA_B);
  assert.equal(scartoDi(completo)?.motivoChiave, 'server.sessionStore.reason.corrotta', 'premessa: il completo porta la chiave');
  assert.deepEqual(scartoDi(parziale), scartoDi(completo), 'il parziale dichiara lo scarto nella stessa forma del completo');
});
