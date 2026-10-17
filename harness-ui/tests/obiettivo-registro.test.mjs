/*
 * ⭐⭐⭐ /goal, fase G1 (owner 14/10/2026: «Sì, parti dal server») — L'OBIETTIVO NEL REGISTRO VERO: giornale su disco, riavvio,
 *   finestre che ascoltano, fork, sotto-agenti, salvataggio che fallisce.
 *
 * La macchina a stati ha le sue prove (`obiettivo-stato.test.mjs`); qui si prova il CABLAGGIO, cioè ciò che una prova della
 * funzione pura non può vedere: che la riga arriva sul giornale PRIMA che cambi la memoria, che un riavvio rimette in pausa
 * senza scrivere niente, che l'annuncio è stato e non storia, che due gesti insieme non si pestano.
 * Come gli altri (ledger `LEDGER-GOAL-LOOP-ENGINEERING-2026-10-12.md`, letti il 12-14/10/2026): Codex tiene l'obiettivo nel DB di
 * stato del thread (`thread.rs:799-830`), Hermes per sessione (`goals.py:635-679`); nessuno dei due lo rimette in pausa al riavvio.
 *
 * ⛔ In G1 nessuna porta dell'obiettivo avvia un giro: ogni prova che imposta un obiettivo conta i giri prima e dopo.
 */
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture, registraRiga } from '../src/session-store.mjs';
import { EVENTO_OBIETTIVO, TESTO_MASSIMO, nuovoObiettivo, rigaObiettivo } from '../src/obiettivo/stato.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SYS = { role: 'system', content: 's' };
const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });
const passo = () => new Promise((r) => setImmediate(r));

/* Il registro vero, con la storia su disco; il kernel è finto e ogni giro si conclude quando la prova lo dice. */
function registroAGiri(cartellaStore, opzioni = {}) {
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    obiettiviNellaChat: true, // OB-REV-01 (15/10): come il server desktop; senza, la porta della persona rifiuta l'obiettivo
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const n = giri.length + 1;
      giri.push({ input, concludi: (messaggiFinali) => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${n}` }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}`, input: input.task });
      return attesa;
    },
    ...opzioni,
  });
  return { registro, giri };
}
async function conStore(t, corpo) {
  const cartellaStore = cartellaDiProva('talos-obiettivo-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  return corpo(cartellaStore);
}
/** Una conversazione col primo giro concluso: ferma, come quando la persona guarda la risposta. */
async function conversazioneFerma({ registro, giri }) {
  const { sessionId } = registro.avvia('task-vero');
  giri.at(-1).concludi([SYS, u('c'), a('r1')]);
  await passo();
  return sessionId;
}
const righeDelGiornale = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
const righeObiettivo = (cartellaStore, sessionId) => righeDelGiornale(cartellaStore, sessionId).filter((r) => r.tipo === 'obiettivo');
function ascolta(registro, sessionId) {
  const annunci = [];
  registro.iscriviti(sessionId, (e) => { if (e.type === 'CUSTOM' && e.name === EVENTO_OBIETTIVO) annunci.push(e.value); });
  return annunci;
}
async function riavvia(cartellaStore, opzioni) {
  await attendiScritture({ cartellaStore });
  const nuovo = registroAGiri(cartellaStore, opzioni);
  await nuovo.registro.ripristina();
  return nuovo;
}

test('GOAL-REG-01 — setting a goal: active, on the journal, announced to who is listening — and no turn starts', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const annunci = ascolta(banco.registro, sessionId);
  assert.deepEqual(banco.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null }, 'premise: a conversation is born without a goal');
  const giriPrima = banco.giri.length;

  const esito = await banco.registro.impostaObiettivo(sessionId, '  all tests in tests/auth pass  ');
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(esito.obiettivo.stato, 'attivo');
  assert.equal(esito.obiettivo.testo, 'all tests in tests/auth pass');
  assert.equal(esito.obiettivo.revisione, 1);
  assert.match(esito.obiettivo.id, /^ob-[0-9a-f-]{36}$/u);
  assert.deepEqual(banco.registro.statoObiettivo(sessionId), { ok: true, obiettivo: esito.obiettivo });
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId), [{ tipo: 'obiettivo', obiettivo: esito.obiettivo }], 'one row, equal to what memory holds');
  assert.deepEqual(annunci, [{ obiettivo: esito.obiettivo }], 'one announcement, with the goal as it is');
  // l'annuncio è STATO, non storia: non entra nel giornale come evento
  assert.equal(righeDelGiornale(cartellaStore, sessionId).some((r) => r.type === 'CUSTOM' && r.name === EVENTO_OBIETTIVO), false);
  await passo();
  assert.equal(banco.giri.length, giriPrima, 'G1: setting a goal starts nothing — no door here spends');
}));

test('GOAL-REG-02 — pause, resume, remove: each one is a row with the next revision, an announcement, and the state the person reads', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const annunci = ascolta(banco.registro, sessionId);
  const giriPrima = banco.giri.length;
  await banco.registro.impostaObiettivo(sessionId, 'make it green');

  const pausa = await banco.registro.pausaObiettivo(sessionId);
  assert.equal(pausa.ok, true, JSON.stringify(pausa));
  assert.equal(pausa.obiettivo.stato, 'in-pausa');
  assert.deepEqual(pausa.obiettivo.motivo, { tipo: 'persona' });
  const ripresa = await banco.registro.riprendiObiettivo(sessionId);
  assert.equal(ripresa.obiettivo.stato, 'attivo');
  assert.equal(ripresa.obiettivo.motivo, null);
  const tolto = await banco.registro.togliObiettivo(sessionId);
  assert.deepEqual(tolto, { ok: true, obiettivo: null });
  assert.deepEqual(banco.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null });

  await attendiScritture({ cartellaStore });
  const righe = righeObiettivo(cartellaStore, sessionId);
  assert.deepEqual(righe.map((r) => r.obiettivo?.stato ?? null), ['attivo', 'in-pausa', 'attivo', null]);
  assert.deepEqual(righe.slice(0, 3).map((r) => r.obiettivo.revisione), [1, 2, 3]);
  assert.equal(new Set(righe.slice(0, 3).map((r) => r.obiettivo.id)).size, 1, 'the same goal through its steps');
  assert.deepEqual(annunci.map((v) => v.obiettivo?.stato ?? null), ['attivo', 'in-pausa', 'attivo', null]);
  await passo();
  assert.equal(banco.giri.length, giriPrima, 'G1: resuming starts nothing either');
}));

test('GOAL-REG-03 — a gesture that changes nothing writes nothing: Pause twice, Resume on an active goal, Remove with no goal', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  assert.deepEqual(await banco.registro.togliObiettivo(sessionId), { ok: true, obiettivo: null, invariato: true });
  const annunci = ascolta(banco.registro, sessionId);
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'make it green');
  assert.deepEqual(await banco.registro.riprendiObiettivo(sessionId), { ok: true, obiettivo, invariato: true });
  const pausa = await banco.registro.pausaObiettivo(sessionId);
  assert.deepEqual(await banco.registro.pausaObiettivo(sessionId), { ok: true, obiettivo: pausa.obiettivo, invariato: true });
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId).map((r) => r.obiettivo.revisione), [1, 2], 'two real changes, two rows');
  assert.equal(annunci.length, 2, 'and two announcements: an unchanged goal announces nothing');
}));

test('GOAL-REG-04 — AL CONTRARIO: every refusal says its code and its reason, and leaves no trace', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const annunci = ascolta(banco.registro, sessionId);
  const forma = (r) => ({ code: r.code, reason: r.reason, ...(r.params ? { params: r.params } : {}) });
  assert.deepEqual(forma(await banco.registro.pausaObiettivo(sessionId)), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-not-set' });
  assert.deepEqual(forma(await banco.registro.riprendiObiettivo(sessionId)), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-not-set' });
  assert.deepEqual(forma(await banco.registro.impostaObiettivo(sessionId, '   ')), { code: 'GOAL_TEXT_INVALID', reason: 'goal-text-empty' });
  assert.deepEqual(forma(await banco.registro.impostaObiettivo(sessionId, 42)), { code: 'GOAL_TEXT_INVALID', reason: 'goal-text-empty' });
  const lungo = await banco.registro.impostaObiettivo(sessionId, 'a'.repeat(TESTO_MASSIMO + 1));
  assert.deepEqual(forma(lungo), { code: 'GOAL_TEXT_INVALID', reason: 'goal-text-too-long', params: { massimo: TESTO_MASSIMO } });
  assert.equal(lungo.erroreAvvio, `The goal is too long: the character limit is ${TESTO_MASSIMO}`, 'the English sentence carries the number');
  for (const gesto of ['statoObiettivo', 'impostaObiettivo', 'pausaObiettivo', 'riprendiObiettivo', 'togliObiettivo']) {
    assert.deepEqual(forma(await banco.registro[gesto]('non-esiste', 'x')), { code: 'NOT_FOUND', reason: 'session-not-found' }, gesto);
  }
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId), [], 'a refusal writes no row');
  assert.deepEqual(annunci, [], 'and announces nothing');
  assert.deepEqual(banco.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null });
}));

test('GOAL-REG-05 — after a RESTART the active goal is paused and says «restart», the journal is not touched, and the person resumes it', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(primo);
  const { obiettivo } = await primo.registro.impostaObiettivo(sessionId, 'make it green');
  await attendiScritture({ cartellaStore });
  const righePrima = righeDelGiornale(cartellaStore, sessionId).length;

  const secondo = await riavvia(cartellaStore);
  const dopo = secondo.registro.statoObiettivo(sessionId).obiettivo;
  assert.equal(dopo.stato, 'in-pausa');
  assert.deepEqual(dopo.motivo, { tipo: 'riavvio' });
  assert.equal(dopo.id, obiettivo.id);
  assert.equal(dopo.testo, 'make it green');
  assert.equal(dopo.revisione, 2);
  await attendiScritture({ cartellaStore });
  assert.equal(righeDelGiornale(cartellaStore, sessionId).length, righePrima, 'the restart reads: it writes nothing on the journal');
  assert.equal(secondo.giri.length, 0, 'and it starts nothing');

  const ripreso = await secondo.registro.riprendiObiettivo(sessionId);
  assert.equal(ripreso.obiettivo.stato, 'attivo');
  assert.equal(ripreso.obiettivo.revisione, 3);
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId).map((r) => [r.obiettivo.stato, r.obiettivo.revisione]), [['attivo', 1], ['attivo', 3]],
    'the pause of the restart lived in memory only; the first gesture of the person is the next row');
  assert.equal(secondo.giri.length, 0);
}));

test('GOAL-REG-06 — AL CONTRARIO: a goal paused by the person, or removed, comes back from a restart exactly as it was', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const inPausa = await conversazioneFerma(primo);
  const tolta = await conversazioneFerma(primo);
  const mai = await conversazioneFerma(primo);
  await primo.registro.impostaObiettivo(inPausa, 'paused by me');
  const pausa = await primo.registro.pausaObiettivo(inPausa);
  await primo.registro.impostaObiettivo(tolta, 'removed by me');
  await primo.registro.togliObiettivo(tolta);

  const secondo = await riavvia(cartellaStore);
  assert.deepEqual(secondo.registro.statoObiettivo(inPausa).obiettivo, pausa.obiettivo, 'same reason («person»), same revision, same time');
  assert.deepEqual(secondo.registro.statoObiettivo(tolta), { ok: true, obiettivo: null });
  assert.deepEqual(secondo.registro.statoObiettivo(mai), { ok: true, obiettivo: null });
}));

test('GOAL-REG-07 — the states the loop will write (blocked, limit reached, done) survive a restart as they are, and each answers Resume its own way', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const casi = [
    ['bloccato', { tipo: 'stesso-blocco', dettaglio: 'the key is missing' }],
    ['tetto', { tipo: 'giri' }],
    ['fatto', null],
  ];
  const sessioni = [];
  for (const [stato, motivo] of casi) {
    const sessionId = await conversazioneFerma(primo);
    const base = nuovoObiettivo({ testo: `goal ${stato}`, id: `ob-0000000${sessioni.length}-2222-4333-8444-555555555555`, adesso: '2026-10-14T10:00:00.000Z' }).obiettivo;
    const scritto = { ...base, stato, motivo, revisione: 5 };
    await registraRiga({ cartellaStore, sessionId, record: rigaObiettivo(scritto), durable: true });
    sessioni.push([sessionId, scritto]);
  }
  const secondo = await riavvia(cartellaStore);
  for (const [sessionId, scritto] of sessioni) assert.deepEqual(secondo.registro.statoObiettivo(sessionId).obiettivo, scritto, scritto.stato);

  const [[bloccata], [aTetto], [fatta]] = sessioni;
  const sbloccato = await secondo.registro.riprendiObiettivo(bloccata);
  assert.equal(sbloccato.obiettivo.stato, 'attivo');
  assert.equal(sbloccato.obiettivo.revisione, 6);
  const tetto = await secondo.registro.riprendiObiettivo(aTetto);
  assert.deepEqual([tetto.code, tetto.reason], ['GOAL_STATE_CONFLICT', 'goal-cap-reached']);
  const fatto = await secondo.registro.riprendiObiettivo(fatta);
  assert.deepEqual([fatto.code, fatto.reason], ['GOAL_STATE_CONFLICT', 'goal-already-done']);
  for (const sessionId of [aTetto, fatta]) {
    const pausa = await secondo.registro.pausaObiettivo(sessionId);
    assert.deepEqual([pausa.code, pausa.reason], ['GOAL_STATE_CONFLICT', 'goal-not-active']);
  }
  // un obiettivo fatto si SOSTITUISCE: impostarne uno nuovo è sempre ammesso
  const nuovo = await secondo.registro.impostaObiettivo(fatta, 'the next one');
  assert.equal(nuovo.obiettivo.stato, 'attivo');
  assert.equal(nuovo.obiettivo.revisione, 1);
  assert.notEqual(nuovo.obiettivo.id, sessioni[2][1].id);
}));

test('GOAL-REG-08 — AL CONTRARIO: when the last goal row cannot be read the conversation comes back WITHOUT a goal (never the older one), says so in the log, and accepts a new one', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(primo);
  await primo.registro.impostaObiettivo(sessionId, 'the old one');
  await attendiScritture({ cartellaStore });
  appendFileSync(join(cartellaStore, `${sessionId}.jsonl`), `${JSON.stringify({ tipo: 'obiettivo', obiettivo: { schema: 'talos.obiettivo.v9', testo: 'from the future' } })}\n`, 'utf8');

  const detti = [];
  const originale = console.error;
  console.error = (...parti) => { detti.push(parti.join(' ')); };
  let secondo;
  try { secondo = await riavvia(cartellaStore); } finally { console.error = originale; }
  assert.deepEqual(secondo.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null });
  assert.equal(detti.filter((riga) => riga.includes(sessionId) && riga.includes('goal row cannot be read')).length, 1, detti.join('\n'));
  const nuovo = await secondo.registro.impostaObiettivo(sessionId, 'a new one');
  assert.equal(nuovo.obiettivo.stato, 'attivo');
}));

test('GOAL-REG-09 — a reload for the lease between processes is NOT a restart: the goal another live process wrote stays active', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(primo);
  const { obiettivo } = await primo.registro.impostaObiettivo(sessionId, 'make it green');
  await attendiScritture({ cartellaStore });
  const altro = registroAGiri(cartellaStore);
  await altro.registro.ripristina({ soloSessioni: [sessionId], perRicarica: true });
  assert.deepEqual(altro.registro.statoObiettivo(sessionId).obiettivo, obiettivo, 'as on the journal: active, revision 1');
  // al contrario, la stessa lettura SENZA il segno della ricarica è un avvio: in pausa
  const avvio = registroAGiri(cartellaStore);
  await avvio.registro.ripristina({ soloSessioni: [sessionId] });
  assert.equal(avvio.registro.statoObiettivo(sessionId).obiettivo.stato, 'in-pausa');
}));

test('GOAL-REG-10 — when the save FAILS nothing changes: the refusal says so, memory keeps the goal of before, nobody is told — and the next gesture works', async (t) => conStore(t, async (cartellaStore) => {
  let rotto = false;
  const scritte = [];
  const banco = registroAGiri(cartellaStore, {
    registraRigaFn: async (argomenti, ...resto) => {
      if (argomenti.record?.tipo === 'obiettivo') {
        scritte.push(argomenti.durable);
        if (rotto) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      }
      return registraRiga(argomenti, ...resto);
    },
  });
  const sessionId = await conversazioneFerma(banco);
  const annunci = ascolta(banco.registro, sessionId);
  const originale = console.error;
  console.error = () => {};
  t.after(() => { console.error = originale; });

  rotto = true;
  const primo = await banco.registro.impostaObiettivo(sessionId, 'never saved');
  assert.deepEqual([primo.code, primo.reason], ['SESSION_STORE_WRITE_FAILED', 'goal-not-saved']);
  assert.deepEqual(banco.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null }, 'not saved ⇒ not set');
  rotto = false;
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'saved');
  rotto = true;
  for (const gesto of ['pausaObiettivo', 'togliObiettivo']) {
    const esito = await banco.registro[gesto](sessionId);
    assert.deepEqual([esito.code, esito.reason], ['SESSION_STORE_WRITE_FAILED', 'goal-not-saved'], gesto);
    assert.deepEqual(banco.registro.statoObiettivo(sessionId).obiettivo, obiettivo, `${gesto}: memory keeps the goal as it was`);
  }
  rotto = false;
  const pausa = await banco.registro.pausaObiettivo(sessionId);
  assert.equal(pausa.obiettivo.revisione, 2, 'the failed attempts consumed no revision');
  assert.deepEqual(annunci.map((v) => v.obiettivo.revisione), [1, 2], 'only what was saved was announced');
  assert.ok(scritte.length >= 5 && scritte.every((durevole) => durevole === true), 'every goal row is asked to be durable');
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId).map((r) => r.obiettivo.revisione), [1, 2]);
}));

test('GOAL-REG-11 — gestures fired together go IN A ROW: each one sees what the one before left, and the revisions are consecutive', async (t) => conStore(t, async (cartellaStore) => {
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  await banco.registro.impostaObiettivo(sessionId, 'make it green');
  const esiti = await Promise.all([
    banco.registro.pausaObiettivo(sessionId),
    banco.registro.riprendiObiettivo(sessionId),
    banco.registro.pausaObiettivo(sessionId),
  ]);
  assert.deepEqual(esiti.map((e) => [e.obiettivo.stato, e.obiettivo.revisione, e.invariato ?? false]),
    [['in-pausa', 2, false], ['attivo', 3, false], ['in-pausa', 4, false]],
    'without the row the Resume would read the goal of before the Pause and answer «unchanged»');
  await attendiScritture({ cartellaStore });
  assert.deepEqual(righeObiettivo(cartellaStore, sessionId).map((r) => r.obiettivo.revisione), [1, 2, 3, 4]);
  assert.equal(banco.registro.statoObiettivo(sessionId).obiettivo.stato, 'in-pausa');
}));

/** Una conversazione già conclusa scritta a mano sul disco, nella forma che `ripristina()` legge (come `bc03-delega-visibile`). */
function scriviSessione(cartellaStore, sessionId, extra = {}) {
  const righe = [
    {
      tipo: 'intestazione', schema: 1, sessionId, taskId: extra.padreId ? `delega:${extra.padreId}` : 'libero:obiettivo', cartella: cartellaStore,
      task: { consegna: 'Compito: prova', consegnaCorta: 'prova' }, comandoProva: null, forkDa: null, avviataAlle: '2026-10-14T09:00:00.000Z',
      modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium', mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
      padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null, modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true,
      ...extra,
    },
    { type: 'RunStarted', _sequenza: 1, threadId: sessionId, runId: 'r1' },
    { type: 'RunFinished', _sequenza: 2, threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } },
  ];
  writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

test('GOAL-REG-12 — a goal belongs to the MAIN conversation: a sub-agent and a Workflow step refuse it, each with its reason; AL CONTRARIO: their mother accepts', async (t) => conStore(t, async (cartellaStore) => {
  const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const FIGLIA = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  const PASSO = 'cccccccc-3333-4333-8333-cccccccccccc';
  scriviSessione(cartellaStore, MADRE);
  scriviSessione(cartellaStore, FIGLIA, { padreId: MADRE, profonditaDelega: 1 });
  scriviSessione(cartellaStore, PASSO, { workflow: {
    runId: '11111111-1111-4111-8111-111111111111', nodeId: 'passo-1', activityExecutionId: '22222222-2222-4222-8222-222222222222',
    attempt: 1, leaseId: '33333333-3333-4333-8333-333333333333', leaseEpoch: 0,
  } });
  const banco = registroAGiri(cartellaStore);
  const { ripristinate } = await banco.registro.ripristina();
  assert.equal(ripristinate, 3, 'premise: mother, sub-agent and step are all restored');

  const figlia = await banco.registro.impostaObiettivo(FIGLIA, 'not here');
  assert.deepEqual([figlia.code, figlia.reason], ['GOAL_NOT_ALLOWED', 'goal-on-sub-agent']);
  const passoWf = await banco.registro.impostaObiettivo(PASSO, 'not here');
  assert.deepEqual([passoWf.code, passoWf.reason], ['GOAL_NOT_ALLOWED', 'goal-on-workflow-step']);
  for (const sessionId of [FIGLIA, PASSO]) {
    assert.deepEqual(banco.registro.statoObiettivo(sessionId), { ok: true, obiettivo: null });
    assert.deepEqual(righeObiettivo(cartellaStore, sessionId), []);
  }
  const madre = await banco.registro.impostaObiettivo(MADRE, 'here yes');
  assert.equal(madre.ok, true, JSON.stringify(madre));
  assert.equal(madre.obiettivo.stato, 'attivo');
}));

test('GOAL-REG-13 — a fork does NOT inherit the goal of its original, in memory or after a restart; the original keeps it', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const origine = await conversazioneFerma(primo);
  const { obiettivo } = await primo.registro.impostaObiettivo(origine, 'the goal of the original');
  const fork = primo.registro.forka(origine);
  assert.equal(fork.code, undefined, fork.erroreAvvio);
  assert.deepEqual(primo.registro.statoObiettivo(fork.sessionId), { ok: true, obiettivo: null }, 'the fork is a new conversation: no goal');
  assert.deepEqual(primo.registro.statoObiettivo(origine).obiettivo, obiettivo);

  const secondo = await riavvia(cartellaStore);
  assert.deepEqual(secondo.registro.statoObiettivo(fork.sessionId), { ok: true, obiettivo: null }, 'and none after a restart');
  assert.equal(secondo.registro.statoObiettivo(origine).obiettivo.id, obiettivo.id, 'AL CONTRARIO: the original still has its goal');
}));
