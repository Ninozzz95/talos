/*
 * 21/10/2026 (6) — il riassunto di fine giro CEDE il posto unico. Su un motore a posto unico (`local:`, `locale-ospite:`) il riassunto in
 * sottofondo occupava l'unico posto, e il giro che la persona faceva partire subito dopo aspettava dietro tutto il riassunto. Ora un giro
 * che parte su quel motore lo ferma (la richiesta si chiude, `segnaleStop`), e la fine è `motivo:'ceduta'`; non parte nemmeno se su quel
 * motore un giro è già in corso. Su un fornitore a chiave niente cambia: il riassunto va in parallelo, come prima.
 * Registro VERO, sessioni e riassuntore finti, TEMP privata, nessuna porta.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { MARCATORE_RIASSUNTO, VARIABILE_TETTO_TOKEN, creaRecord, motoreAPostoUnico, motoreDelPostoUnico } from '../src/kernel/compattazione-desktop.mjs';
import { motoreAPostoUnico as dallAdapter } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const LOCALE = 'local:qwen3-8b.gguf';
const OSPITE = 'locale-ospite:lfm2.5-2.6b-q4_0.gguf';
const CLOUD = 'z-ai/glm-5.3-flash';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
/* Ogni chiamata ad avviaSessioneFn è un giro che si conclude a comando. */
function giri() {
  const tutti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    const giro = {
      input,
      concludi(storia, esito = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], ...esito } }); },
    };
    tutti.push(giro);
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${tutti.length}` });
    return attesa;
  };
  return { tutti, avviaSessioneFn };
}
/* Un riassuntore che resta appeso finché non lo si rilascia, e che onora `segnaleStop` come la richiesta vera (il fetch si chiude). */
function riassuntoreAppeso() {
  const chiamate = [];
  const rilasci = [];
  const fn = (input) => {
    chiamate.push(input);
    return new Promise((risolvi, rifiuta) => {
      rilasci.push(() => risolvi({ scelta: { role: 'assistant', content: 'RIASSUNTO' }, finishReason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 10 } }));
      const s = input.segnaleStop;
      if (s) {
        if (s.aborted) rifiuta(new Error('aborted'));
        s.addEventListener('abort', () => rifiuta(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })), { once: true });
      }
    });
  };
  return { fn, chiamate, rilasciaTutti: () => { for (const r of rilasci) r(); } };
}
const storiaGrande = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
  }
  s.push({ role: 'assistant', content: 'Fatto.' });
  return s;
};
const righeDelJournal = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error(messaggio);
}
function ambiente(t, opzioni = {}) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaDiProva('talos-cede-posto-');
  const riassuntore = riassuntoreAppeso();
  const g = giri();
  const registro = createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: g.avviaSessioneFn,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: CLOUD, chiave: 'k', riassumiPerCompattazioneFn: riassuntore.fn, ...opzioni });
  t.after(async () => {
    riassuntore.rilasciaTutti();
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const avvia = (modelloScelto) => {
    const { sessionId, erroreAvvio } = registro.avvia('task-vero', { modelloScelto });
    assert.ok(sessionId, JSON.stringify(erroreAvvio));
    return sessionId;
  };
  return { registro, riassuntore, g, avvia, cartellaStore };
}

test('CEDE-00 la funzione sta nel modulo della compattazione, l\'adapter la riesporta uguale; il motore è la fonte prima dei due punti', () => {
  assert.equal(dallAdapter, motoreAPostoUnico);
  assert.equal(motoreDelPostoUnico(LOCALE), 'local');
  assert.equal(motoreDelPostoUnico(OSPITE), 'locale-ospite');
  for (const m of [CLOUD, 'ollama:qwen3', 'openrouter:x/y', null, undefined, 42]) assert.equal(motoreDelPostoUnico(m), null, String(m));
});

for (const modello of [LOCALE, OSPITE]) {
  test(`CEDE-01 ${modello.split(':')[0]}: il giro che parte FERMA il riassunto di sfondo, una chiamata sola, fine «ceduta», nessun record`, async (t) => {
    const { registro, riassuntore, g, avvia, cartellaStore } = ambiente(t);
    const sessionId = avvia(modello);
    g.tutti[0].concludi(storiaGrande());
    await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === true, 'il riassunto di sfondo non è partito');
    assert.equal(riassuntore.chiamate.length, 1);
    assert.ok(riassuntore.chiamate[0].segnaleStop instanceof AbortSignal, 'sul posto unico il riassunto si può fermare');
    assert.equal(riassuntore.chiamate[0].segnaleStop.aborted, false);
    assert.equal(registro.resume(sessionId, 'messaggio nuovo').sessionId, sessionId);
    assert.equal(riassuntore.chiamate[0].segnaleStop.aborted, true, 'il giro nuovo l\'ha fermato');
    await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il riassunto fermato non si è chiuso');
    assert.equal(riassuntore.chiamate.length, 1, 'fermato non si ritenta');
    assert.equal(registro.statoCompattazione(sessionId).record, null);
    await attendiScritture({ cartellaStore, sessionId });
    const fine = righeDelJournal(cartellaStore, sessionId).filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.fase === 'fine').map((e) => e.value);
    assert.equal(fine.length, 1, JSON.stringify(fine));
    assert.equal(fine[0].motivo, 'ceduta');
    assert.equal(fine[0].compattato, false);
    g.tutti[1].concludi([...g.tutti[1].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
  });
}

test('CEDE-02 verso contrario: su un fornitore a chiave il riassunto non si può fermare e un giro nuovo non lo tocca', async (t) => {
  const { registro, riassuntore, g, avvia } = ambiente(t);
  const sessionId = avvia(CLOUD);
  g.tutti[0].concludi(storiaGrande());
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === true, 'il riassunto di sfondo non è partito');
  /* 22/10/2026 (CLI): ogni riassunto di sfondo ha un segnale, perché la chiusura del registro lo ferma (CHIUSURA-01); un giro no */
  assert.ok(riassuntore.chiamate[0].segnaleStop instanceof AbortSignal);
  registro.resume(sessionId, 'messaggio nuovo');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(riassuntore.chiamate[0].segnaleStop.aborted, false, 'un giro nuovo non lo ferma');
  assert.equal(registro.statoCompattazione(sessionId).inCorso, true, 'continua in parallelo, come prima');
  riassuntore.rilasciaTutti();
  g.tutti[1].concludi([...g.tutti[1].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
});

test('CEDE-03 il posto è del MOTORE: un giro di un\'altra sessione sullo stesso motore ferma il riassunto; uno su un altro motore no', async (t) => {
  const { registro, riassuntore, g, avvia } = ambiente(t);
  const a = avvia(LOCALE);
  g.tutti[0].concludi(storiaGrande());
  await attendi(() => registro.statoCompattazione(a)?.inCorso === true, 'il riassunto di A non è partito');
  avvia(OSPITE); // un altro motore a posto unico: nessuna contesa
  avvia(CLOUD);
  assert.equal(riassuntore.chiamate[0].segnaleStop.aborted, false, 'un altro motore non lo tocca');
  avvia(LOCALE); // lo stesso motore del PC, un'altra sessione
  assert.equal(riassuntore.chiamate[0].segnaleStop.aborted, true);
  for (const giro of g.tutti.slice(1)) giro.concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'ok' }]);
});

test('CEDE-04 non parte se sullo stesso motore un giro è in corso; verso contrario: un giro in corso su un altro motore non lo ferma', async (t) => {
  const { registro, riassuntore, g, avvia, cartellaStore } = ambiente(t);
  const a = avvia(LOCALE);
  avvia(LOCALE); // B: in corso sul motore del PC
  g.tutti[0].concludi(storiaGrande());
  await attendiScritture({ cartellaStore, sessionId: a });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(riassuntore.chiamate.length, 0, 'il posto è preso da B: niente riassunto in coda dietro di lui');
  assert.equal(registro.statoCompattazione(a).inCorso, false);
  const c = avvia(OSPITE);
  avvia(CLOUD); // D: in corso, ma su un fornitore a chiave
  g.tutti[2].concludi(storiaGrande());
  await attendi(() => registro.statoCompattazione(c)?.inCorso === true, 'C sul motore dell\'app doveva riassumere');
  assert.equal(riassuntore.chiamate.length, 1);
  riassuntore.rilasciaTutti();
  g.tutti[1].concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'ok' }]);
  g.tutti[3].concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'ok' }]);
});

/* Col riassuntore VERO del kernel: il flusso del motore ha già mandato mezzo riassunto quando il giro nuovo parte. Il testo a metà non
   deve diventare un riassunto (`consumaFlussoSSE` rilancia sullo stop, `talosHarness.mjs:1199`; `chiamaConRitenta` non ritenta, `:2031`). */
test('CEDE-06 col riassuntore vero: il mezzo riassunto già arrivato non diventa un record, la richiesta si chiude, fine «ceduta»', async (t) => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaDiProva('talos-cede-posto-vero-');
  const g = giri();
  const richieste = [];
  const enc = new TextEncoder();
  const fetchFinto = async (url, init) => {
    richieste.push({ url: String(url), segnale: init?.signal ?? null });
    const segnale = init?.signal;
    const corpo = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: '## Riassunto\nLa persona ha chiesto di ' } }] })}\n\n`));
        segnale?.addEventListener('abort', () => c.error(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })), { once: true });
      },
    });
    return new Response(corpo, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const registro = createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: g.avviaSessioneFn,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: CLOUD, chiave: 'k', fetchModelloFn: () => fetchFinto });
  t.after(async () => {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: LOCALE });
  g.tutti[0].concludi(storiaGrande());
  await attendi(() => richieste.length === 1, 'la richiesta del riassunto non è partita');
  assert.ok(richieste[0].segnale instanceof AbortSignal);
  await new Promise((r) => setTimeout(r, 20)); // il primo pezzo è arrivato
  registro.resume(sessionId, 'messaggio nuovo');
  assert.equal(richieste[0].segnale.aborted, true, 'la richiesta al motore si è chiusa');
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il riassunto non si è chiuso');
  assert.equal(richieste.length, 1, 'nessun secondo tentativo');
  assert.equal(registro.statoCompattazione(sessionId).record, null, 'il mezzo riassunto non è un record');
  await attendiScritture({ cartellaStore, sessionId });
  const fine = righeDelJournal(cartellaStore, sessionId).filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.fase === 'fine').map((e) => e.value);
  assert.deepEqual(fine.map((f) => [f.compattato, f.motivo]), [[false, 'ceduta']]);
  g.tutti[1].concludi([...g.tutti[1].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
});

/* La finestra che la guardia della versione chiude: il giro ha scritto un record di compattazione, e il registro lo salva (un `await`)
   PRIMA di avviare il riassunto di fine giro. Intanto il giro è assestato e la persona può già riscrivere: il giro nuovo parte prima del
   riassunto, e allora nessuno lo cederebbe. */
test('CEDE-05 la persona riscrive mentre si salva il record del giro: il riassunto di quel giro non parte dietro al giro nuovo', async (t) => {
  const { registro, riassuntore, g, avvia, cartellaStore } = ambiente(t);
  const sessionId = avvia(LOCALE);
  const storia = storiaGrande();
  const record = creaRecord({ coveredThrough: 2, riassunto: [storia[0], { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nPRIMA PARTE` }],
    tokenPrima: 500, tokenDopo: 50, misura: 'stimato', at: '2026-10-21T10:00:00.000Z', modello: LOCALE });
  g.tutti[0].concludi(storia, { recordDiCompattazione: [record] });
  let ripresa = null;
  for (let i = 0; i < 2_000 && !ripresa?.sessionId; i += 1) {
    await Promise.resolve();
    if (i % 50 === 49) await new Promise((r) => setImmediate(r));
    const r = registro.resume(sessionId, 'messaggio nuovo');
    if (r?.sessionId) ripresa = r;
  }
  assert.equal(ripresa?.sessionId, sessionId, 'il giro nuovo non è partito');
  t.diagnostic(`riassunti partiti prima del giro nuovo: ${riassuntore.chiamate.length}`);
  await attendiScritture({ cartellaStore, sessionId });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(riassuntore.chiamate.every((c) => c.segnaleStop?.aborted === true),
    `un riassunto è partito dietro al giro nuovo e nessuno lo fermerà: ${riassuntore.chiamate.map((c) => c.segnaleStop?.aborted)}`);
  g.tutti[1].concludi([...g.tutti[1].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
});

/* Fusione col modello dei riassunti della CLI (06b9ed101): il posto che conta è quello del motore che SCRIVE il riassunto. */
test('CEDE-07 conversazione locale, riassunto su un fornitore a chiave: nessuna contesa; al contrario, riassunto locale di una conversazione a chiave: cede', async (t) => {
  const aChiave = ambiente(t, { modelloRiassuntoFn: (m) => (m === LOCALE ? CLOUD : null) });
  const a = aChiave.avvia(LOCALE);
  aChiave.g.tutti[0].concludi(storiaGrande());
  await attendi(() => aChiave.registro.statoCompattazione(a)?.inCorso === true, 'il riassunto non è partito');
  assert.equal(aChiave.riassuntore.chiamate[0].modello, CLOUD);
  aChiave.registro.resume(a, 'messaggio nuovo');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(aChiave.riassuntore.chiamate[0].segnaleStop.aborted, false, 'un fornitore a chiave non ha un posto da cedere');
  assert.equal(aChiave.registro.statoCompattazione(a).inCorso, true, 'continua in parallelo al giro locale');
  aChiave.riassuntore.rilasciaTutti();
  aChiave.g.tutti[1].concludi([...aChiave.g.tutti[1].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);

  const locale = ambiente(t, { modelloRiassuntoFn: (m) => (m === CLOUD ? LOCALE : null) });
  const b = locale.avvia(CLOUD);
  locale.g.tutti[0].concludi(storiaGrande());
  await attendi(() => locale.registro.statoCompattazione(b)?.inCorso === true, 'il riassunto locale non è partito');
  assert.equal(locale.riassuntore.chiamate[0].modello, LOCALE);
  assert.ok(locale.riassuntore.chiamate[0].segnaleStop instanceof AbortSignal);
  locale.avvia(LOCALE); // un giro sul motore del PC: il riassunto che lo occupa cede
  assert.equal(locale.riassuntore.chiamate[0].segnaleStop.aborted, true);
  for (const giro of locale.g.tutti.slice(1)) giro.concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'ok' }]);
});
