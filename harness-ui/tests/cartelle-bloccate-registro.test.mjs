/*
 * Owner 27/10/2026 — CARTELLE BLOCCATE, tappa B: il REGISTRO dice al kernel di chi è il giro (contratto
 * CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2, revisione 1). I blocchi valgono nei giri che un DISPOSITIVO ha mandato, letti dal
 * FILE del profilo (la CLI federata continua una conversazione in una finestra senza coordinatore): mai nei giri della persona al PC.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaLettoreBloccate } from '../src/remoto/lettore-bloccate.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function banco(t, { bloccate = { 'pad-1': ['C:\\fuori\\Documenti'] } } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-bloccate-reg-'));
  await mkdir(join(radice, 'p'), { recursive: true });
  const ingressi = [];
  let fine = null;
  const chiesti = [];
  const registro = createSessionRegistry({
    modello: 'm', chiave: 'k',
    bloccateDelDispositivoFn: async (id) => { chiesti.push(id); return bloccate[id] ?? []; },
    avviaSessioneFn: async (i) => {
      ingressi.push(i);
      i.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${ingressi.length}` });
      return new Promise((ok) => { fine = () => { i.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${ingressi.length}` }); ok({ ok: true }); }; });
    },
    preparaEsecuzioneFn: (taskId) => ({ cartella: join(radice, 'p'), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const chiudiGiro = async (sessionId) => { const f = fine; fine = null; f?.(); await registro.attendiAssestamento?.(sessionId); };
  t.after(async () => { const f = fine; fine = null; f?.(); await rimuoviCartellaDiProvaAttesa(radice); });
  return { registro, ingressi, chiesti, chiudiGiro };
}

test('BLOC-R-01 un giro della persona al PC: la funzione c\'è ma non chiede niente al file e non è attiva', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registro.avvia('task-vero');
  const fn = b.ingressi[0].percorsiBloccatiFn;
  assert.equal(typeof fn, 'function');
  assert.equal(fn.attiva(), false, 'le letture in anticipo restano accese per il PC');
  assert.deepEqual(await fn(), []);
  assert.deepEqual(b.chiesti, [], 'nessuna lettura del file per un giro del PC');
  await b.chiudiGiro(sessionId);
});

test('BLOC-R-02 un messaggio dal dispositivo: il giro dopo porta i SUOI blocchi; poi un messaggio dal PC li toglie', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registro.avvia('task-vero');
  await b.chiudiGiro(sessionId);
  const r1 = b.registro.resume(sessionId, 'dal tablet', [], { dispositivoDelGiro: 'pad-1' });
  assert.ok(!r1?.erroreAvvio, JSON.stringify(r1));
  const fn = b.ingressi.at(-1).percorsiBloccatiFn;
  assert.equal(fn.attiva(), true);
  assert.deepEqual(await fn(), ['C:\\fuori\\Documenti']);
  await b.chiudiGiro(sessionId);
  b.registro.resume(sessionId, 'dal PC', [], { dispositivoDelGiro: null });
  assert.equal(b.ingressi.at(-1).percorsiBloccatiFn.attiva(), false, 'la persona al PC non è limitata');
  assert.deepEqual(await b.ingressi.at(-1).percorsiBloccatiFn(), []);
  await b.chiudiGiro(sessionId);
});

test('BLOC-R-03 una ripresa SENZA il campo (un avviso, una notifica) lascia il giro di chi era', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registro.avvia('task-vero');
  await b.chiudiGiro(sessionId);
  b.registro.resume(sessionId, 'dal tablet', [], { dispositivoDelGiro: 'pad-1' });
  await b.chiudiGiro(sessionId);
  b.registro.resume(sessionId, 'una notifica di sistema', []);
  assert.equal(b.ingressi.at(-1).percorsiBloccatiFn.attiva(), true, 'resta del dispositivo');
  await b.chiudiGiro(sessionId);
});

test('BLOC-R-04 un altro dispositivo ha i suoi blocchi, non quelli del primo', async (t) => {
  const b = await banco(t, { bloccate: { 'pad-1': ['C:\\a'], 'tel-2': ['C:\\b'] } });
  const { sessionId } = b.registro.avvia('task-vero');
  await b.chiudiGiro(sessionId);
  b.registro.resume(sessionId, 'dal telefono', [], { dispositivoDelGiro: 'tel-2' });
  assert.deepEqual(await b.ingressi.at(-1).percorsiBloccatiFn(), ['C:\\b']);
  await b.chiudiGiro(sessionId);
});

test('BLOC-R-05 la coda a giro FERMO: «Invia ora» di una voce messa dal dispositivo fa partire un giro del dispositivo', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registro.avvia('task-vero');
  const accodato = b.registro.accodaMessaggio(sessionId, 'dopo, dal tablet', [], { dispositivoDelGiro: 'pad-1' });
  assert.equal(accodato?.erroreAvvio, undefined, JSON.stringify(accodato));
  const voce = b.registro.statoCoda(sessionId).voci[0];
  assert.ok(voce?.id, 'la voce è in coda');
  assert.equal('dispositivo' in voce, false, 'il dispositivo non esce nello stato della coda');
  await b.chiudiGiro(sessionId);
  const giriPrima = b.ingressi.length;
  const esito = await b.registro.inviaDallaCoda(sessionId, voce.id);
  assert.equal(esito?.erroreAvvio, undefined, JSON.stringify(esito));
  assert.equal(b.ingressi.length, giriPrima + 1, 'un giro nuovo');
  assert.equal(b.ingressi.at(-1).percorsiBloccatiFn.attiva(), true);
  await b.chiudiGiro(sessionId);
});

test('BLOC-R-05b la coda a giro VIVO: la voce del dispositivo consegnata dentro il giro lo segna; una del PC non lo toglie', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registro.avvia('task-vero');
  const ingresso = b.ingressi.at(-1);
  assert.equal(ingresso.percorsiBloccatiFn.attiva(), false);
  b.registro.accodaMessaggio(sessionId, 'dal tablet, a giro vivo', [], { dispositivoDelGiro: 'pad-1' });
  ingresso.codaMessaggiFn();
  assert.equal(ingresso.percorsiBloccatiFn.attiva(), true, 'dal prossimo attrezzo il giro ha i blocchi del tablet');
  b.registro.accodaMessaggio(sessionId, 'dal PC, a giro vivo', [], { dispositivoDelGiro: null });
  ingresso.codaMessaggiFn();
  assert.equal(ingresso.percorsiBloccatiFn.attiva(), true, 'un messaggio del PC a giro vivo non scioglie i blocchi');
  await b.chiudiGiro(sessionId);
});

test('BLOC-R-06 senza il lettore (la CLI per sé, il banco): nessuna funzione al kernel, tutto come prima', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-bloccate-reg-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  await mkdir(join(radice, 'p'), { recursive: true });
  let ingresso = null;
  let fine = null;
  const registro = createSessionRegistry({
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (i) => { ingresso = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); return new Promise((ok) => { fine = () => { i.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r1' }); ok({ ok: true }); }; }); },
    preparaEsecuzioneFn: (taskId) => ({ cartella: join(radice, 'p'), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero');
  assert.equal('percorsiBloccatiFn' in ingresso, false);
  fine?.(); await registro.attendiAssestamento?.(sessionId);
});

/* ── il lettore del file ─────────────────────────────────────────────────────────────────────────── */

test('BLOC-R-07 il lettore: file assente ⇒ nessun blocco; file presente ⇒ i percorsi del dispositivo; cambia ⇒ si rilegge', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-bloccate-lettore-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const file = join(radice, 'cartelle-bloccate.json');
  /* l'impronta del file vale solo oltre 2 s dalla modifica: un orologio finto «molto dopo» la rende affidabile */
  const lettore = creaLettoreBloccate({ fileBloccate: file, adessoNs: () => BigInt(Date.now() + 60_000) * 1_000_000n });
  assert.deepEqual(await lettore('pad-1'), []);
  await writeFile(file, JSON.stringify({ v: 1, dispositivi: { 'pad-1': [{ percorso: 'C:\\x', at: 1 }] } }));
  assert.deepEqual(await lettore('pad-1'), ['C:\\x']);
  assert.deepEqual(await lettore('altro'), []);
  await writeFile(file, JSON.stringify({ v: 1, dispositivi: { 'pad-1': [{ percorso: 'C:\\x', at: 1 }, { percorso: 'C:\\y', at: 2 }] } }));
  await utimes(file, new Date(), new Date(Date.now() + 5_000));
  assert.deepEqual(await lettore('pad-1'), ['C:\\x', 'C:\\y'], 'la revoca nuova si vede al giro dopo');
  assert.deepEqual(await lettore(''), []);
  assert.equal(creaLettoreBloccate({ fileBloccate: '' }), null);
});

test('BLOC-R-08 il lettore: un file guasto LANCIA REMOTE_CONSENTS_UNREADABLE (mai «nessun blocco»)', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-bloccate-lettore-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const file = join(radice, 'cartelle-bloccate.json');
  const lettore = creaLettoreBloccate({ fileBloccate: file });
  await writeFile(file, '{ non è json');
  await assert.rejects(lettore('pad-1'), { code: 'REMOTE_CONSENTS_UNREADABLE' });
  await writeFile(file, JSON.stringify({ v: 1, dispositivi: { 'pad-1': [{ at: 1 }] } }));
  await assert.rejects(lettore('pad-1'), { code: 'REMOTE_CONSENTS_UNREADABLE' }, 'una voce senza percorso');
  await writeFile(file, JSON.stringify({ v: 1, dispositivi: [] }));
  await assert.rejects(lettore('pad-1'), { code: 'REMOTE_CONSENTS_UNREADABLE' }, 'un elenco al posto dell\'oggetto');
});
