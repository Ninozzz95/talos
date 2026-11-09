/*
 * P4 (owner 28/10/2026, «Rapido subito, il modello dopo»; contratto con la CLI `CONTRATTO-POSTO-UNICO-RAPIDO-POI-MODELLO-2026-10-28.md`).
 * La stessa promessa del rapido del posto unico quando la conversazione va col MOTORE DEL CONTESTO: nel giro il motore non avvia nessun
 * lavoro (`CTX_SUMMARY_NOT_READY` con `aFineGiro`) e il guscio scrive il rapido; a fine giro, col motore libero, il riassunto del modello
 * lo scrive il motore (`contextCompactFn`), e la riga del rapido si lega al SUO lavoro con un evento durevole PRIMA di aspettarlo
 * (`fase:'lavoro-del-motore'`, `perIlRapido:{at}`, `jobId`). Le regole del guscio valgono uguali: cede a un giro sullo stesso motore,
 * un tentativo in più, poi «fermata»; fallito ⇒ «fallita»; niente da riassumere ⇒ «non-serve»; la chiusura lo dice una volta.
 * Registro VERO, giri e motore finti, TEMP privata, nessuna porta.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { MARCATORE_RIASSUNTO, VARIABILE_TETTO_TOKEN, creaRecord } from '../src/kernel/compattazione-desktop.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const LOCALE = 'local:qwen3-8b.gguf';
const OSPITE = 'locale-ospite:lfm2.5-2.6b-q4_0.gguf';
const AT_RAPIDO = '2026-10-28T12:00:00.000Z';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function giri() {
  const tutti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    tutti.push({ input, concludi(storia, esito = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], ...esito } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${tutti.length}` });
    return attesa;
  };
  return { tutti, avviaSessioneFn };
}
/* `service.compact` finto: ogni chiamata resta appesa finché la prova non decide; onora `segnale` come il servizio vero (annullato) */
function motoreFinto() {
  const chiamate = [];
  const stato = { annulloLento: false };
  const fn = (input) => new Promise((risolvi, rifiuta) => {
    const voce = { input, risolvi, rifiuta, annullata: false };
    chiamate.push(voce);
    input.segnale?.addEventListener?.('abort', () => {
      voce.annullata = true;
      const fatto = () => risolvi({ ok: true, compattato: false, jobId: voce.jobId ?? null, annullato: true });
      /* un annullo che DURA (l'esecutore vero deve accorgersene): finisce quando la prova lo scioglie */
      if (stato.annulloLento) voce.sciogli = fatto; else fatto();
    }, { once: true });
  });
  return { fn, chiamate, stato };
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
function rapidoSu(storia, { aFineGiro = true } = {}) {
  const riassunto = [...storia.slice(0, 2), { role: 'user', content: `${MARCATORE_RIASSUNTO}\nRiassunto rapido senza il modello.` }, storia.at(-1)];
  const record = creaRecord({ coveredThrough: storia.length, riassunto, tokenPrima: 5_000, tokenDopo: 300, misura: 'stima', at: AT_RAPIDO, modello: LOCALE, coperti: storia });
  return aFineGiro ? { ...record, aFineGiro: true } : record;
}
const righe = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
const preparate = (cartellaStore, sessionId) => righe(cartellaStore, sessionId).filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione-preparata').map((e) => e.value);
const nonArriva = (c, s) => preparate(c, s).filter((v) => v.fase === 'non-arriva');
const legami = (c, s) => preparate(c, s).filter((v) => v.fase === 'lavoro-del-motore');
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error(messaggio);
}
function ambiente(t) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaDiProva('talos-pu-motore-');
  const motore = motoreFinto();
  const g = giri();
  const legacy = { chiamate: 0 };
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: g.avviaSessioneFn,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
    contextHooksFn: async () => ({ archivedMessages: () => null }), contextCompactFn: motore.fn,
    riassumiPerCompattazioneFn: async () => { legacy.chiamate += 1; throw new Error('the shell summary must not run on the engine path'); } });
  t.after(async () => {
    for (const c of motore.chiamate) c.risolvi({ ok: true, compattato: false });
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const avvia = (modelloScelto) => {
    const { sessionId, erroreAvvio } = registro.avvia('task-vero', { modelloScelto });
    assert.ok(sessionId, JSON.stringify(erroreAvvio));
    return sessionId;
  };
  return { registro, motore, g, avvia, cartellaStore, legacy };
}
const chiudiGiro = (giro) => giro.concludi([...giro.input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);

for (const modello of [LOCALE, OSPITE]) {
  test(`PU-MOTORE-01 ${modello.split(':')[0]}: a fine giro il motore scrive il riassunto del rapido; la riga si lega al suo lavoro PRIMA di aspettarlo`, async (t) => {
    const { registro, motore, g, avvia, cartellaStore, legacy } = ambiente(t);
    const sessionId = avvia(modello);
    await attendi(() => g.tutti.length === 1, 'il giro non è partito');
    const storia = storiaGrande();
    g.tutti[0].concludi(storia, { recordDiCompattazione: [rapidoSu(storia)] });
    await attendi(() => motore.chiamate.length === 1, 'il riassunto del motore non è partito a fine giro');
    const chiamata = motore.chiamate[0];
    assert.equal(chiamata.input.sessionId, sessionId);
    assert.deepEqual(chiamata.input.messages, storia, 'la storia del giro, intera');
    assert.ok(chiamata.input.segnale instanceof AbortSignal, 'si può cedere e fermare');
    chiamata.input.onLavoro('job-7');
    await attendiScritture({ cartellaStore, sessionId });
    assert.deepEqual(legami(cartellaStore, sessionId), [{ fase: 'lavoro-del-motore', perIlRapido: { at: AT_RAPIDO }, jobId: 'job-7' }], 'il legame è nel giornale mentre il lavoro è ancora in volo');
    chiamata.risolvi({ ok: true, compattato: true, jobId: 'job-7' });
    await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il lavoro non si è chiuso');
    await attendiScritture({ cartellaStore, sessionId });
    assert.equal(nonArriva(cartellaStore, sessionId).length, 0, 'arrivato: la versione del lavoro legato migliora la riga');
    assert.equal(legacy.chiamate, 0, 'il riassunto del guscio non si paga');
    // al contrario: arrivato, il rapido non aspetta più — il fine giro dopo non ripaga un riassunto
    registro.resume(sessionId, 'e adesso?');
    await attendi(() => g.tutti.length === 2, 'giro 2');
    chiudiGiro(g.tutti[1]);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(motore.chiamate.length, 1, 'un riassunto arrivato non si ripaga');
  });
}

test('PU-MOTORE-06 un riassunto ceduto che sta ancora finendo blocca un secondo lavoro: il rapido aspetta il fine giro dopo, nessun «fallita»', async (t) => {
  const { registro, motore, g, avvia, cartellaStore } = ambiente(t);
  const sessionId = avvia(LOCALE);
  await attendi(() => g.tutti.length === 1, 'giro 1');
  const storia = storiaGrande();
  g.tutti[0].concludi(storia, { recordDiCompattazione: [rapidoSu(storia)] });
  await attendi(() => motore.chiamate.length === 1, 'primo tentativo');
  motore.stato.annulloLento = true;
  registro.resume(sessionId, 'scrivo subito');
  assert.equal(motore.chiamate[0].annullata, true);
  await attendi(() => g.tutti.length === 2, 'giro 2');
  chiudiGiro(g.tutti[1]); // il giro finisce prima che l'annullo del primo lavoro sia concluso
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(motore.chiamate.length, 1, 'nessun secondo lavoro mentre il primo sta ancora finendo');
  motore.chiamate[0].sciogli();
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il primo lavoro non si è chiuso');
  await attendiScritture({ cartellaStore, sessionId });
  assert.equal(nonArriva(cartellaStore, sessionId).length, 0, 'il rapido aspetta ancora: un tentativo resta');
});

test('PU-MOTORE-02b niente da riassumere, con la risposta vera del servizio, resta «non-serve» (D-42)', async (t) => {
  const { motore, g, avvia, cartellaStore } = ambiente(t);
  const a = avvia(LOCALE);
  await attendi(() => g.tutti.length === 1, 'giro a');
  const storia = storiaGrande();
  g.tutti[0].concludi(storia, { recordDiCompattazione: [rapidoSu(storia)] });
  await attendi(() => motore.chiamate.length === 1, 'riassunto a');
  motore.chiamate[0].risolvi({ ok: true, compattato: false, motivo: 'niente-da-compattare' });
  await attendi(() => nonArriva(cartellaStore, a).length === 1, 'la riga di a non ha smesso di promettere');
  assert.deepEqual(nonArriva(cartellaStore, a), [{ fase: 'non-arriva', perIlRapido: { at: AT_RAPIDO }, motivo: 'non-serve' }]);
});

test('PU-MOTORE-02 un riassunto del motore fallito ⇒ «fallita»; niente da riassumere ⇒ «non-serve»; un id di lavoro storto non lega niente', async (t) => {
  const { motore, g, avvia, cartellaStore } = ambiente(t);
  const a = avvia(LOCALE);
  await attendi(() => g.tutti.length === 1, 'giro a');
  const storia = storiaGrande();
  g.tutti[0].concludi(storia, { recordDiCompattazione: [rapidoSu(storia)] });
  await attendi(() => motore.chiamate.length === 1, 'riassunto a');
  motore.chiamate[0].input.onLavoro('x'.repeat(257));
  motore.chiamate[0].risolvi({ ok: true, compattato: false, jobId: 'job-a', error: { code: 'CTX_INVALID_SOURCE', message: 'x' } });
  await attendi(() => nonArriva(cartellaStore, a).length === 1, 'la riga di a non ha smesso di promettere');
  assert.deepEqual(nonArriva(cartellaStore, a), [{ fase: 'non-arriva', perIlRapido: { at: AT_RAPIDO }, motivo: 'fallita' }]);
  assert.equal(legami(cartellaStore, a).length, 0);

  const b = avvia(LOCALE);
  await attendi(() => g.tutti.length === 2, 'giro b');
  g.tutti[1].concludi(storia, { recordDiCompattazione: [rapidoSu(storia)] });
  await attendi(() => motore.chiamate.length === 2, 'riassunto b');
  motore.chiamate[1].rifiuta(Object.assign(new Error('nothing'), { code: 'CTX_NOTHING_TO_COMPACT' }));
  await attendi(() => nonArriva(cartellaStore, b).length === 1, 'la riga di b non ha smesso di promettere');
  assert.equal(nonArriva(cartellaStore, b)[0].motivo, 'non-serve');
});

test('PU-MOTORE-03 al contrario: un giro col motore SENZA rapido che aspetta non paga nessun riassunto di fine giro', async (t) => {
  const { motore, g, avvia, legacy } = ambiente(t);
  avvia(LOCALE);
  await attendi(() => g.tutti.length === 1, 'giro');
  const storia = storiaGrande();
  g.tutti[0].concludi(storia, { recordDiCompattazione: [rapidoSu(storia, { aFineGiro: false })] });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(motore.chiamate.length, 0);
  assert.equal(legacy.chiamate, 0);
});

test('PU-MOTORE-04 cede a un giro nuovo e riprova UNA volta al fine giro dopo; ceduto di nuovo, «fermata»', async (t) => {
  const { registro, motore, g, avvia, cartellaStore } = ambiente(t);
  const sessionId = avvia(LOCALE);
  await attendi(() => g.tutti.length === 1, 'giro 1');
  const storia = storiaGrande();
  g.tutti[0].concludi(storia, { recordDiCompattazione: [rapidoSu(storia)] });
  await attendi(() => motore.chiamate.length === 1, 'primo tentativo');
  registro.resume(sessionId, 'scrivo subito');
  assert.equal(motore.chiamate[0].annullata, true, 'il giro nuovo l\'ha ceduto');
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il primo tentativo non si è chiuso');
  await attendiScritture({ cartellaStore, sessionId });
  assert.equal(nonArriva(cartellaStore, sessionId).length, 0, 'c\'è ancora un tentativo');
  await attendi(() => g.tutti.length === 2, 'giro 2');
  chiudiGiro(g.tutti[1]);
  await attendi(() => motore.chiamate.length === 2, 'il secondo tentativo al fine giro dopo');
  registro.resume(sessionId, 'scrivo di nuovo');
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il secondo tentativo non si è chiuso');
  await attendiScritture({ cartellaStore, sessionId });
  assert.deepEqual(nonArriva(cartellaStore, sessionId), [{ fase: 'non-arriva', perIlRapido: { at: AT_RAPIDO }, motivo: 'fermata' }]);
  await attendi(() => g.tutti.length === 3, 'giro 3');
  chiudiGiro(g.tutti[2]);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(motore.chiamate.length, 2, 'la riga ha smesso di promettere: nessun terzo tentativo');
});

test('PU-MOTORE-05 alla chiusura il lavoro si ferma, la riga dice «fermata» una volta sola, e nessun «fallita» dopo', async (t) => {
  const { registro, motore, g, avvia, cartellaStore } = ambiente(t);
  const sessionId = avvia(LOCALE);
  await attendi(() => g.tutti.length === 1, 'giro');
  const storia = storiaGrande();
  g.tutti[0].concludi(storia, { recordDiCompattazione: [rapidoSu(storia)] });
  await attendi(() => motore.chiamate.length === 1, 'il riassunto non è partito');
  await registro.chiudi();
  assert.equal(motore.chiamate[0].annullata, true);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(nonArriva(cartellaStore, sessionId), [{ fase: 'non-arriva', perIlRapido: { at: AT_RAPIDO }, motivo: 'fermata' }]);
});
