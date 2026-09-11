import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';

/*
 * ⛔⛔⛔ BC-03 (segnalato dall'owner l'08/09/2026, chiuso l'11/09) — «la delega in sub agenti fa
 *   partire una nuova sessione e NON SI VEDE NULLA nella barra a destra».
 *
 * Perché questo file esiste, e perché le prove che c'erano non bastavano:
 *  · `delega-parallelo-sequenza-cartella.test.mjs` prova le deleghe su un registro VIVO — due
 *    figlie partono, ereditano cartella, modello e permessi. Nessuna di quelle prove riapre il
 *    registro dal disco.
 *  · `frontend/tests/unit/inspector-agenti.test.mjs` prova il DISEGNO della scheda a partire da un
 *    elenco già in mano. Nessuna di quelle prove va a prendere l'elenco.
 * ⇒ In mezzo c'era il tratto che nessuno guardava: **una sessione RIPRISTINATA dal disco produce
 *   ancora le sue figlie?** È il caso normale, non quello raro — la scheda «Agenti» si guarda
 *   quasi sempre riaprendo una sessione di ieri, cioè dopo un riavvio del server.
 *
 * ⭐ Ricerca 11/09/2026 — che cosa mostra lo stato dell'arte di un sotto-agente, per sapere se la
 *   nostra scheda promette poco o troppo:
 *   · Hermes Agent (hermes-agent.nousresearch.com/docs/user-guide/features/delegation): «live tree
 *     view of running and recently-finished subagents, grouped by parent», con «per-branch cost,
 *     token, and file-touched rollups»; il risultato di ogni figlia porta `status`, `exit_reason`
 *     (completed/max_iterations/interrupted/stalled/timed_out) e `running_seconds`; `/agents` apre
 *     un overlay con i comandi per fermarla e metterla in pausa.
 *   · Claude Code (github.com/anthropics/claude-code, issue #24537 «Agent Hierarchy Dashboard»,
 *     issue #48246): durante un sotto-agente si legge «Running agent <nome> · 2m 34s · ↓ 2.2k
 *     tokens»; l'albero per-agente con le metriche è una richiesta APERTA, non una funzione.
 *   · Codex (github.com/openai/codex, issue #34591): il pannello Subagents elenca le figlie e si
 *     apre sulla loro chat; i metadati di una figlia portano `parent thread id`, `depth`,
 *     `started time` e `duration`.
 *   ⇒ Quello che loro mostrano e noi no è DURATA e COSTO per delega: registrato come proposta nel
 *     rapporto, non aggiunto qui di nascosto. Quello che invece nessuno dei tre fa — dire che due
 *     figlie hanno scritto lo STESSO file — ce l'abbiamo, ed è la parte che questo file difende.
 */

const SCHEMA = 1;

/** Una sessione persistita, nella forma che `ripristina()` legge davvero (session-registry.mjs). */
function scriviSessione(cartellaStore, sessionId, { padreId = null, profonditaDelega = 0, consegnaCorta, avviataAlle, scrive = [], conclusa = true, cartella }) {
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const righe = [
    {
      tipo: 'intestazione', schema: SCHEMA, sessionId,
      taskId: padreId ? `delega:${padreId}` : 'libero:bc03',
      cartella,
      task: { consegna: `Sei una sessione di lavoro autonoma.\nCompito: ${consegnaCorta}`, consegnaCorta },
      comandoProva: null, forkDa: null, avviataAlle,
      modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
      mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
      padreId, profonditaDelega, provider: 'cloud', runtimeId: null,
      modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true,
    },
    evento('RunStarted', { threadId: sessionId, runId: 'r1' }),
    ...scrive.map((percorso) => evento('StateDelta', { delta: [{ op: 'add', path: `/file/${percorso}`, value: {} }] })),
  ];
  if (conclusa) righe.push(evento('RunFinished', { threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } }));
  writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FIGLIA_A = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const FIGLIA_B = 'cccccccc-3333-4333-8333-cccccccccccc';
const NIPOTE = 'dddddddd-4444-4444-8444-dddddddddddd';
const SOLITARIA = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';

/**
 * Una famiglia su disco: madre con due figlie (la seconda mai conclusa), una nipote sotto la prima
 * figlia (profondità 2) e una sessione senza nessuna delega.
 * `fileCondiviso` acceso = le due figlie scrivono LO STESSO file, cioè il caso D3.
 */
function famigliaSuDisco({ fileCondiviso = false } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'bc03-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'bc03-lavoro-'));
  scriviSessione(cartellaStore, MADRE, { consegnaCorta: 'Paper tecnico in due parti', avviataAlle: '2026-09-11T09:00:00.000Z', cartella });
  scriviSessione(cartellaStore, FIGLIA_A, {
    padreId: MADRE, profonditaDelega: 1, consegnaCorta: 'Scrivi la PARTE 1', avviataAlle: '2026-09-11T09:01:00.000Z',
    scrive: fileCondiviso ? ['parte-1.md', 'condiviso.md'] : ['parte-1.md'], cartella,
  });
  scriviSessione(cartellaStore, FIGLIA_B, {
    padreId: MADRE, profonditaDelega: 1, consegnaCorta: 'Scrivi la PARTE 2', avviataAlle: '2026-09-11T09:02:00.000Z',
    scrive: fileCondiviso ? ['condiviso.md'] : ['parte-2.md'], conclusa: false, cartella,
  });
  scriviSessione(cartellaStore, NIPOTE, { padreId: FIGLIA_A, profonditaDelega: 2, consegnaCorta: 'Rileggi la bibliografia', avviataAlle: '2026-09-11T09:03:00.000Z', scrive: ['bibliografia.md'], cartella });
  scriviSessione(cartellaStore, SOLITARIA, { consegnaCorta: 'Sessione senza deleghe', avviataAlle: '2026-09-11T09:04:00.000Z', cartella });
  return { cartellaStore, cartella };
}

function registro(cartellaStore) {
  return createSessionRegistry({
    cartellaStore,
    avviaSessioneFn: async () => ({ ok: true }),
    guardaWorkspaceFn: () => () => {},
    modello: 'z-ai/glm-5.3-flash',
    chiave: 'chiave-finta',
  });
}

test('BC-03 · IL CASO DEL BUG: una madre RIPRISTINATA dal disco porta ancora le sue due figlie', async (t) => {
  const { cartellaStore, cartella } = famigliaSuDisco();
  t.after(() => { rmSync(cartellaStore, { recursive: true, force: true }); rmSync(cartella, { recursive: true, force: true }); });
  const reg = registro(cartellaStore);
  const { ripristinate, totali } = await reg.ripristina();
  assert.equal(totali, 5);
  assert.equal(ripristinate, 5, 'nessuna sessione scartata: se ne manca una, tutto il resto misura il caso sbagliato');

  const esito = reg.elencaFigli(MADRE);
  assert.ok(esito.ok, `la madre non è stata trovata: ${esito.erroreAvvio ?? ''}`);
  assert.deepEqual(esito.figli.map((f) => f.sessionId), [FIGLIA_A, FIGLIA_B], 'le due deleghe, in ordine di avvio');

  const [a, b] = esito.figli;
  assert.equal(a.taskCorto, 'Scrivi la PARTE 1', '⛔ il compito, non il preambolo del kernel: due figlie con lo stesso preambolo sono due righe identiche');
  assert.equal(b.taskCorto, 'Scrivi la PARTE 2');
  assert.equal(a.conclusa, true);
  assert.equal(a.esitoDelega, 'concluso');
  assert.equal(b.interrotta, true, 'una figlia che il riavvio ha spento è INTERROTTA, non «in corso» per sempre');
  assert.equal(a.evidenzaDelega.scritture, 1, 'le scritture si ricontano dagli eventi persistiti');
  assert.equal(a.avviataAlle, '2026-09-11T09:01:00.000Z');
});

test('BC-03, AL CONTRARIO: una sessione SENZA deleghe non ne inventa nemmeno una', async (t) => {
  const { cartellaStore, cartella } = famigliaSuDisco();
  t.after(() => { rmSync(cartellaStore, { recursive: true, force: true }); rmSync(cartella, { recursive: true, force: true }); });
  const reg = registro(cartellaStore);
  await reg.ripristina();
  assert.deepEqual(reg.elencaFigli(SOLITARIA).figli, [], 'lo stato vuoto della scheda è la risposta GIUSTA, qui');
  /* ⛔ E una sessione che non esiste è un 404, non un elenco vuoto: «nessuna figlia» e «nessuna
     sessione» sono due fatti diversi, e una scheda che li confonde mente su uno dei due. */
  const inventata = reg.elencaFigli('00000000-0000-4000-8000-000000000000');
  assert.equal(inventata.code, 'NOT_FOUND');
});

test('BC-03, AL CONTRARIO: la profondità 2 non confonde i piani — la nipote è figlia della FIGLIA, non della madre', async (t) => {
  const { cartellaStore, cartella } = famigliaSuDisco();
  t.after(() => { rmSync(cartellaStore, { recursive: true, force: true }); rmSync(cartella, { recursive: true, force: true }); });
  const reg = registro(cartellaStore);
  await reg.ripristina();
  assert.deepEqual(reg.elencaFigli(MADRE).figli.map((f) => f.sessionId), [FIGLIA_A, FIGLIA_B], 'la nipote NON compare fra le figlie della madre');
  assert.deepEqual(reg.elencaFigli(FIGLIA_A).figli.map((f) => f.sessionId), [NIPOTE], 'e compare, intera, sotto la figlia che l\'ha chiesta');
  assert.deepEqual(reg.elencaFigli(FIGLIA_B).figli, [], 'la sorella senza deleghe resta vuota');
});

test('BC-03 · D3 SOPRAVVIVE AL RIAVVIO: due figlie sullo stesso file, e la scheda lo dice anche il giorno dopo', async (t) => {
  const { cartellaStore, cartella } = famigliaSuDisco({ fileCondiviso: true });
  t.after(() => { rmSync(cartellaStore, { recursive: true, force: true }); rmSync(cartella, { recursive: true, force: true }); });
  const reg = registro(cartellaStore);
  await reg.ripristina();

  const figli = reg.elencaFigli(MADRE).figli;
  const collisioniA = figli[0].collisioni.map((c) => c.percorso);
  const collisioniB = figli[1].collisioni.map((c) => c.percorso);
  assert.deepEqual(collisioniA, ['condiviso.md'], '⛔ prima della cura qui c\'era [] : la collisione viveva solo in memoria, e il riavvio la cancellava in silenzio');
  assert.deepEqual(collisioniB, ['condiviso.md'], 'la collisione riguarda DUE figlie: si vede da entrambe le card');
  /* L'ordine non è un orologio (gli eventi persistiti non portano un istante): è «chi ha
     cominciato prima», e va detto così com'è. */
  const [dallaB] = reg.elencaFigli(MADRE).figli[1].collisioni;
  assert.equal(dallaB.primaDi, FIGLIA_A, 'dalla card di B: l\'altra è la sorella che aveva scritto PRIMA');
  assert.equal(dallaB.dopoDi, null, 'e non si nomina da sola: la card parla di UNA delega alla volta');
  const [dallaA] = reg.elencaFigli(MADRE).figli[0].collisioni;
  assert.equal(dallaA.dopoDi, FIGLIA_B, 'dalla card di A: l\'altra è la sorella che ha scritto DOPO, cioè quella che ha coperto');
});

test('BC-03, AL CONTRARIO: una figlia che riscrive tre volte un file SUO non è una collisione', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'bc03-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'bc03-lavoro-'));
  t.after(() => { rmSync(cartellaStore, { recursive: true, force: true }); rmSync(cartella, { recursive: true, force: true }); });
  scriviSessione(cartellaStore, MADRE, { consegnaCorta: 'Una delega sola', avviataAlle: '2026-09-11T09:00:00.000Z', cartella });
  scriviSessione(cartellaStore, FIGLIA_A, {
    padreId: MADRE, profonditaDelega: 1, consegnaCorta: 'Scrivi e rileggi', avviataAlle: '2026-09-11T09:01:00.000Z',
    scrive: ['bozza.md', 'bozza.md', 'bozza.md'], cartella,
  });
  const reg = registro(cartellaStore);
  await reg.ripristina();
  assert.deepEqual(reg.elencaFigli(MADRE).figli[0].collisioni, [], '⛔ un allarme che scatta quando va tutto bene insegna a ignorarlo');
});

test('BC-03, AL CONTRARIO: due `ripristina()` di fila non raddoppiano la stessa collisione', async (t) => {
  const { cartellaStore, cartella } = famigliaSuDisco({ fileCondiviso: true });
  t.after(() => { rmSync(cartellaStore, { recursive: true, force: true }); rmSync(cartella, { recursive: true, force: true }); });
  const reg = registro(cartellaStore);
  await reg.ripristina();
  await reg.ripristina();
  assert.equal(reg.elencaFigli(MADRE).figli[0].collisioni.length, 1, 'una collisione, non due: la seconda lettura non ne aggiunge');
});
