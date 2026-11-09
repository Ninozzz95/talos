/*
 * Gli scrittori delle notifiche (contratto «notifiche», 31/10/2026): dagli eventi della sessione alle voci del registro. Due livelli:
 * - col registro delle sessioni VERO (`createSessionRegistry({ osservatoreNotifiche })`): permesso con un client collegato, risposta,
 *   fine del giro, un avviso su una chat ferma che non è una fine, eliminazione;
 * - il modulo da solo, per le regole che la finestra applicava (figlia, automazione, fermato, errore).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { creaScrittoriNotifiche } from '../src/notifiche-scrittori.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { aspettaCheAProgresso } from './aiuto/attesa-a-progresso.mjs';

const T0 = Date.parse('2026-10-31T10:00:00.000Z');

function nuovoRegistroNotifiche(t) {
  const dir = mkdtempSync(join(tmpdir(), 'notifiche-scrittori-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  return creaRegistroNotifiche({ file: join(dir, 'n.jsonl'), adesso: () => T0 });
}

async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-notifiche-'));
  const notifiche = nuovoRegistroNotifiche(t);
  const runs = [];
  const registry = createSessionRegistry({ cartellaStore,
    avviaSessioneFn(input) {
      const promise = new Promise((r) => { runs.push({ input, resolve: r }); });
      input.onEvento({ type: 'RunStarted', threadId: 't0', runId: 'r0' });
      return promise;
    },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'Rifattorizza il parser' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    osservatoreNotifiche: creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0 }) });
  t.after(async () => {
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  return { registry, notifiche, sessionId, input: runs[0].input };
}

test('NOTIF-SCR-01 from the real session register: a permission becomes a waiting entry, the answer resolves it, the end of the turn is a «fine»', { timeout: 10_000 }, async (t) => {
  const { registry, notifiche, sessionId, input } = await scena(t);
  const via = registry.iscriviti(sessionId, () => {}); // un client collegato: senza, la carta non nasce
  t.after(() => via());
  const risposta = input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' });
  /* 03/11, regola 6 della velocità: con 10 ms fissi la prova è caduta una volta sotto carico (0 !== 1). La carta diventa voce in un
     setImmediate dopo che il registro ha emesso l'evento, e sotto carico ci arriva oltre i 10 ms. Si aspetta la voce, non un tempo
     (come `_wait_until` di Hermes, tests/agent/test_periodic_scheduler.py:10); la prova sotto conta che sia UNA sola. */
  assert.ok(await aspettaCheAProgresso(async () => { await notifiche.attendi(); return (await notifiche.elenco()).voci.length > 0; }, 5_000),
    'the permission never became an entry');
  let elenco = await notifiche.elenco();
  assert.equal(elenco.voci.length, 1);
  const [permesso] = elenco.voci;
  assert.equal(permesso.fatto, 'approvazione');
  assert.equal(permesso.azione, 'shell', 'the kernel code, on which the phrases already exist');
  assert.deepEqual(permesso.dato, { genere: 'comando', valore: 'npm install' });
  assert.deepEqual(permesso.cosa, { tipo: 'sessione', id: sessionId, nome: 'Rifattorizza il parser' });
  assert.equal(permesso.id, `approvazione:${sessionId}:${registry.domandaInAttesa(sessionId).requestId}`);
  assert.equal(elenco.totaleDaFare, 1);

  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true);
  assert.equal(await risposta, true);
  await notifiche.attendi();
  elenco = await notifiche.elenco();
  assert.equal(elenco.voci.find((v) => v.id === permesso.id).stato.risolto, true);
  assert.equal(elenco.totaleDaFare, 0);

  input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  await notifiche.attendi();
  const fine = (await notifiche.elenco()).voci.find((v) => v.fatto === 'fine');
  assert.ok(fine, 'the end of the turn is an entry');
  assert.equal(fine.porta.id, sessionId);
  assert.ok(Number.isSafeInteger(fine.porta.giro));
});

test('NOTIF-SCR-02 AL CONTRARIO: a warning on a chat that is not running is not an end; deleting the session resolves its entries', { timeout: 10_000 }, async (t) => {
  const { registry, notifiche, sessionId, input } = await scena(t);
  input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  await notifiche.attendi();
  const prima = (await notifiche.elenco()).voci.length;
  input.onEvento({ type: 'RunError', code: 'SESSION_LEASED', message: 'leased' }); // nessun giro aperto
  input.onEvento({ type: 'ToolCallOutput', toolCallId: 'c', delta: 'x' }); // effimero
  await notifiche.attendi();
  assert.equal((await notifiche.elenco()).voci.length, prima, 'no new entry');
  await notifiche.scrivi({ id: `domanda:${sessionId}:q1`, fatto: 'domanda', cosa: { tipo: 'sessione', id: sessionId, nome: 'x' }, porta: { tipo: 'sessione', id: sessionId } });
  const esito = await registry.elimina(sessionId);
  assert.equal(esito.ok, true);
  await notifiche.attendi();
  const dopo = await notifiche.elenco();
  assert.equal(dopo.totaleDaFare, 0);
  assert.ok(dopo.voci.every((v) => v.stato.risolto), 'every entry of the deleted session is resolved');
});

test('NOTIF-SCR-03 the rules of the window: a child and an automation turn never end in the list, a stop is «interrotta», an error carries its code', async (t) => {
  const notifiche = nuovoRegistroNotifiche(t);
  const s = creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0 });
  const base = { sessionId: 's1', radiceId: 's1', nome: 'Una chat', chiudeUnGiro: true, giro: 4 };
  s.evento({ ...base, sessionId: 'f1', padreId: 's1' }, { type: 'RunFinished' });
  s.evento({ ...base, sessionId: 'a1', radiceId: 'a1', taskId: 'automazione:ogni-mattina' }, { type: 'RunFinished' });
  s.evento({ ...base, sessionId: 'f1', padreId: 's1' }, { type: 'ApprovalRequested', requestId: 'p1', azione: { tipo: 'scrivi', percorso: 'src/a.js' } });
  s.evento({ ...base, giro: 5 }, { type: 'RunError', code: 'fermato', message: 'Stopped' });
  s.evento({ ...base, giro: 6 }, { type: 'RunError', code: 'PROVIDER_RATE_LIMITED', message: 'x' });
  s.evento({ ...base, giro: 7 }, { type: 'ApprovalRequested', requestId: 'p2', rigiocoAttesa: true, azione: { tipo: 'shell' } });
  await new Promise((r) => setImmediate(r)); await notifiche.attendi(); // una carta si scrive un giro dopo (R1)
  const voci = (await notifiche.elenco()).voci.sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(voci.map((v) => [v.id, v.fatto]), [
    ['approvazione:f1:p1', 'approvazione'],
    ['errore:s1:giro-6', 'errore'],
    ['interrotta:s1:giro-5', 'interrotta'],
  ]);
  assert.equal(voci[0].porta.id, 's1', 'a child permission opens the root conversation, where the card is drawn');
  assert.deepEqual(voci[0].dato, { genere: 'file', valore: 'src/a.js' });
  assert.deepEqual(voci[1].dato, { genere: 'codice-errore', valore: 'PROVIDER_RATE_LIMITED' });
  assert.equal(voci[2].porta.giro, 5);
});

test('NOTIF-SCR-04 reconciliation at start: a card still waiting stays, a stale card or a gone session is resolved, other entries untouched', async (t) => {
  const notifiche = nuovoRegistroNotifiche(t);
  const s = creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0 });
  const cosa = { tipo: 'sessione', id: 's1', nome: 'Una chat' };
  for (const id of ['approvazione:s1:p1', 'approvazione:s1:p0', 'domanda:s2:q1', 'domanda:a:b:q7', 'approvazione:a:b:q7']) {
    await notifiche.scrivi({ id, fatto: id.split(':')[0], cosa });
  }
  await notifiche.scrivi({ id: 'fine:s1:giro-3', fatto: 'fine', cosa });
  await notifiche.scrivi({ id: 'download:modello-x', fatto: 'approvazione', cosa }); // scritta da altri: forma diversa, non si tocca
  const attese = { s1: { tipo: 'approvazione', requestId: 'p1' }, 'a:b': { tipo: 'domanda', requestId: 'q7' } };
  const chiesti = [];
  const cambiate = await s.riconcilia({ attesaDi: (id) => { chiesti.push(id); return attese[id] ?? { erroreAvvio: 'Session not found', code: 'NOT_FOUND' }; } });
  assert.deepEqual(cambiate.map((v) => v.id).sort(), ['approvazione:a:b:q7', 'approvazione:s1:p0', 'domanda:s2:q1']);
  const risolte = Object.fromEntries((await notifiche.elenco()).voci.map((v) => [v.id, v.stato.risolto]));
  assert.equal(risolte['approvazione:s1:p1'], false, 'the card the session still waits for stays to do');
  assert.equal(risolte['domanda:a:b:q7'], false, 'a session id with «:» is read whole');
  assert.equal(risolte['download:modello-x'], false, 'an entry written by another writer is not touched');
  assert.equal(risolte['fine:s1:giro-3'], false);
  assert.ok(chiesti.includes('a:b'));
  assert.deepEqual(await s.riconcilia({ attesaDi: () => { throw new Error('rotto'); } }).then((c) => c.map((v) => v.id).sort()), ['approvazione:s1:p1', 'domanda:a:b:q7'],
    'if the session register cannot answer, the card is gone with it');
});

test('NOTIF-SCR-05 the notice on the conversation stream: whoever is subscribed gets talos.notifica, never replayed nor kept in history', { timeout: 10_000 }, async (t) => {
  const { registry, notifiche, sessionId } = await scena(t);
  notifiche.ascolta((avviso) => { if (avviso.voce?.porta?.tipo === 'sessione') registry.avvisaNotifica(avviso.voce.porta.id, avviso); });
  const dalVivo = [];
  const via = registry.iscriviti(sessionId, (e) => dalVivo.push(e));
  t.after(() => via());
  await notifiche.scrivi({ id: `domanda:${sessionId}:q1`, fatto: 'domanda', cosa: { tipo: 'sessione', id: sessionId, nome: 'x' }, porta: { tipo: 'sessione', id: sessionId } });
  const avvisi = dalVivo.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.notifica');
  assert.equal(avvisi.length, 1);
  assert.equal(avvisi[0].value.voce.id, `domanda:${sessionId}:q1`);
  assert.equal(avvisi[0].value.totaleDaFare, 1);
  const tardivo = [];
  const via2 = registry.iscriviti(sessionId, (e) => tardivo.push(e));
  t.after(() => via2());
  assert.equal(tardivo.some((e) => e.name === 'talos.notifica'), false, 'not replayed to whoever subscribes later');
  assert.equal(registry.avvisaNotifica('nessuna', avvisi[0].value), false);
});

test('NOTIF-SCR-06 automation turns: only those to look at become entries; a stop of yours or an ordinary skip does not', async (t) => {
  const { createAutomationStore } = await import('../src/automation-store.mjs');
  const notifiche = nuovoRegistroNotifiche(t);
  const s = creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0 });
  const dir = mkdtempSync(join(tmpdir(), 'notifiche-automazioni-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const visti = [];
  const store = createAutomationStore({ cartella: dir, clock: () => new Date(T0), osservaGiro: (g) => { visti.push(g); s.giro(g); } });
  const auto = await store.crea({ nome: 'Rassegna del mattino', istruzioni: 'Leggi le notizie', cartella: dir, fusoOrario: 'Europe/Rome',
    pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 } });
  await store.chiudiGiro(auto.id, 'r1', { esito: 'finita', riassunto: 'Tre notizie nuove', daGuardare: true });
  await store.chiudiGiro(auto.id, 'r2', { esito: 'fermata', riassunto: null, daGuardare: false, motivo: 'fermata' });
  await store.chiudiGiro(auto.id, 'r3', { esito: 'fallita', riassunto: null, daGuardare: true, motivo: 'traffico' });
  await store.saltaGiro(auto.id, { motivo: 'app-chiusa' });
  await store.saltaGiro(auto.id, { motivo: 'cartella-sparita', daGuardare: true });
  await notifiche.attendi();
  assert.equal(visti.length, 5, 'every closed or skipped turn reaches the writers');
  const voci = (await notifiche.elenco()).voci;
  assert.deepEqual(voci.map((v) => [v.fatto, v.azione, v.dato]), [
    ['giro-finito', null, { genere: 'testo', valore: 'Tre notizie nuove' }],
    ['giro-fallito', null, { genere: 'codice-errore', valore: 'traffico' }],
    ['giro-saltato', null, { genere: 'codice-errore', valore: 'cartella-sparita' }],
  ]);
  assert.deepEqual(voci[0].cosa, { tipo: 'automazione', id: auto.id, nome: 'Rassegna del mattino' });
  assert.equal(voci[0].id, `giro:${auto.id}:r1`);
  assert.equal((await notifiche.elenco()).totaleDaFare, 0, 'an automation turn is to read, not to do');
});

test('NOTIF-SCR-07 a card asked and answered in the same instant (goal refuter, no one in front) leaves no entry and no notice', async (t) => {
  const notifiche = nuovoRegistroNotifiche(t);
  const avvisi = [];
  notifiche.ascolta((a) => avvisi.push(a));
  const s = creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0 });
  const info = { sessionId: 's1', radiceId: 's1', nome: 'Una chat' };
  s.evento(info, { type: 'ApprovalRequested', requestId: 'p1', azione: { tipo: 'shell', comando: 'npm test' } });
  s.evento(info, { type: 'ApprovalResolved', requestId: 'p1', approvato: true, motivo: 'contratto-obiettivo' });
  s.evento(info, { type: 'UserQuestionRequested', requestId: 'q1', questions: [{ question: 'Quale?' }] });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q1', status: 'answered' });
  await new Promise((r) => setImmediate(r)); await notifiche.attendi();
  assert.deepEqual((await notifiche.elenco()).voci, []);
  assert.equal(avvisi.length, 0);
  /* AL CONTRARIO: una carta che resta in attesa oltre l'istante diventa voce, e la risposta dopo la risolve */
  s.evento(info, { type: 'ApprovalRequested', requestId: 'p2', azione: { tipo: 'shell', comando: 'npm install' } });
  await new Promise((r) => setImmediate(r)); await notifiche.attendi();
  assert.equal((await notifiche.elenco()).totaleDaFare, 1);
  s.evento(info, { type: 'ApprovalResolved', requestId: 'p2', approvato: false });
  await notifiche.attendi();
  assert.equal((await notifiche.elenco()).totaleDaFare, 0);
});

test('NOTIF-SCR-08 the observer is called only for the types it declares, never for every streamed piece of text', { timeout: 10_000 }, async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-notifiche-tipi-'));
  const chiamate = [];
  let input = null;
  const registry = createSessionRegistry({ cartellaStore,
    avviaSessioneFn(i) { input = i; i.onEvento({ type: 'RunStarted', threadId: 't0', runId: 'r0' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    osservatoreNotifiche: { tipi: new Set(['RunFinished']), evento: (info, e) => chiamate.push(e.type) } });
  t.after(async () => {
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  input.onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  for (let i = 0; i < 200; i += 1) input.onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: `pezzo ${i} ` });
  input.onEvento({ type: 'TextMessageEnd', messageId: 'm1' });
  input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  assert.deepEqual(chiamate, ['RunFinished']);
  assert.ok(creaScrittoriNotifiche({ registro: nuovoRegistroNotifiche(t) }).tipi instanceof Set, 'the writers declare their types');
});
