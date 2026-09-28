/*
 * ⭐⭐⭐ F2-bis, corsia B (24/09/2026) — IL JOURNAL A DELTA CON CHECKPOINT, IL REPLAY A STREAM, LA MIGRAZIONE.
 *
 * Decisione 9 dell'owner: «delta per turno + checkpoint ogni N turni, con migrazione automatica dei file vecchi». Il difetto
 * misurato (banco `tests/bench/sessione-lunga-journal.mjs`): ogni giro riscriveva la storia intera DUE volte ⇒ journal
 * quadratico, replay morto a ~218 turni. Qui si prova il REGISTRO (chi scrive e chi rilegge), non il negozio (corsia A).
 *
 * Ermetico: sessione finta (`avviaSessioneFn` iniettata), TEMP privata, nessuna porta, nessun journal dell'owner.
 * Il caso da 1.000 turni gira in un PROCESSO FIGLIO fresco (questo stesso file con `F2BIS_FIGLIO=1`): ms e RSS puliti.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeFileSync } from 'node:fs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import * as registroModulo from '../src/session-registry.mjs';
import { attendiScritture, leggiRegistro, registraRigaSync } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* 26/09: una compattazione manuale riuscita risponde anche con `at` (la chiave della riga, la stessa dell'evento durevole),
   `annullabile:false` e due stime intere; il resto della forma resta quello di prima. */
function senzaStime({ at, tokenPrima, tokenDopo, ...resto }) {
  assert.match(at, /^\d{4}-\d\d-\d\dT/u, `at: ${at}`);
  assert.ok(Number.isSafeInteger(tokenPrima) && tokenPrima > 0 && Number.isSafeInteger(tokenDopo) && tokenDopo > 0, `stime ${tokenPrima} → ${tokenDopo}`);
  return resto;
}


const QUI = fileURLToPath(import.meta.url);
const { SCHEMA_SESSIONE } = registroModulo;

// ───────────────────────────── attrezzi ─────────────────────────────

function createSessionRegistry(opzioni) {
  return registroModulo.createSessionRegistry({ guardaWorkspaceFn: () => () => {}, ...opzioni });
}

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new Error(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

/** Una sessione finta che il test conclude quando vuole; `ultimoInput` è ciò che il registro ha passato al «kernel». */
function sessioneControllabile() {
  let risolvi = null;
  let onEvento = null;
  let input = null;
  let chiamate = 0;
  return {
    avviaSessioneFn: async (i) => {
      chiamate += 1; input = i; onEvento = i.onEvento;
      i.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${chiamate}` });
      return new Promise((r) => { risolvi = r; });
    },
    concludi(evento, risultato = { ok: true }) { onEvento(evento); risolvi(risultato); },
    get ultimoInput() { return input; },
    get chiamate() { return chiamate; },
  };
}

const testo = (byte, seme) => {
  let s = '';
  let i = seme;
  while (s.length < byte) { s += `parola${i} `; i += 3; }
  return s.slice(0, byte);
};

function righeDelJournal(cartellaStore, sessionId) {
  return readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n').filter((r) => r.trim() !== '').map((r) => JSON.parse(r));
}
const sha256 = (percorso) => createHash('sha256').update(readFileSync(percorso)).digest('hex');
const byteDi = (r) => Buffer.byteLength(JSON.stringify(r), 'utf8') + 1;
const eRigaDiStoria = (r) => ['messaggi-finali', 'checkpoint-ripresa', 'messaggi-delta', 'checkpoint'].includes(r.tipo);

/**
 * Fa girare `turni` giri completi (resume + conclusione) su un registro: ogni giro aggiunge un messaggio della persona
 * (~1 KB) e una risposta (~4 KB). Ritorna la storia finale come la conosce il registro (l'ultimo `messaggiFinali`).
 */
/*
 * L'id della sessione lo sceglie il REGISTRO (`avvia` lo restituisce: non esiste un'opzione per fissarlo — la prima stesura
 * passava un `sessionIdRichiesto` che nessuno legge, e ogni giro dopo il primo finiva in «Sessione non trovata»). `giraTurni`
 * lo ricorda qui; le prove lo leggono con `idDi(registro)` (coordinatore, 24/09/2026).
 */
const idDelRegistro = new WeakMap();
const idDi = (registro) => idDelRegistro.get(registro);
async function giraTurni(registro, finta, sessionIdIniziale, { da = 1, turni, byteRisposta = 4096, byteDomanda = 1024 } = {}) {
  let storia = null;
  let sessionId = idDelRegistro.get(registro) ?? sessionIdIniziale;
  for (let turno = da; turno < da + turni; turno += 1) {
    if (turno === 1) {
      const esito = registro.avvia('task-vero');
      assert.ok(!esito.erroreAvvio, esito.erroreAvvio);
      sessionId = esito.sessionId;
      idDelRegistro.set(registro, sessionId);
    } else {
      const esito = registro.resume(sessionId, `Turno ${turno}: ${testo(byteDomanda, turno)}`);
      assert.ok(!esito.erroreAvvio, esito.erroreAvvio);
    }
    const iniziali = finta.ultimoInput.messaggiIniziali ?? [{ role: 'user', content: 'c' }];
    storia = [...iniziali, { role: 'assistant', content: testo(byteRisposta, turno * 7) }];
    finta.concludi({ type: 'RunFinished', threadId: 't', runId: `r${turno}` }, { ok: true, esito: { messaggiFinali: storia, comeFinita: 'concluso' } });
    await new Promise((r) => setImmediate(r));
    await attendiScritture({ cartellaStore: cartellaDelRegistro.get(registro) });
  }
  return storia;
}

/*
 * Un registro con la sessione finta già collegata. La cartella che `giraTurni` aspetta sta in una `WeakMap`: il registro è
 * un oggetto CONGELATO (`Object.freeze`), e appendergli una proprietà lanciava «object is not extensible» (coordinatore, 24/09).
 */
const cartellaDelRegistro = new WeakMap();
function registroDiProva(cartellaStore, opzioni = {}) {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaStore, ...opzioni });
  cartellaDelRegistro.set(registro, cartellaStore);
  return { registro, finta };
}

/** Un journal nel FORMATO VECCHIO (quello di ieri): intestazione, eventi, `messaggi-finali` e `checkpoint-ripresa` interi. */
function seminaJournalVecchio(cartellaStore, sessionId, { turni = 2 } = {}) {
  const record = (r) => registraRigaSync({ cartellaStore, sessionId, record: r });
  record({ tipo: 'intestazione', schema: 1, sessionId, taskId: 'task-vero', cartella: '/tmp/x', task: { consegna: 'c' }, modello: 'm', avviataAlle: '2026-09-24T06:00:00.000Z' });
  let storia = [];
  let sequenza = 1;
  for (let turno = 1; turno <= turni; turno += 1) {
    const iniziali = [...storia, { role: 'user', content: turno === 1 ? 'c' : `Turno ${turno}: ${testo(300, turno)}` }];
    if (turno > 1) record({ tipo: 'checkpoint-ripresa', versioneGiro: turno, messaggi: iniziali });
    record({ type: 'RunStarted', threadId: 't', runId: `r${turno}`, _sequenza: sequenza++ });
    storia = [...iniziali, { role: 'assistant', content: testo(900, turno * 7) }];
    record({ tipo: 'messaggi-finali', versioneGiro: turno, messaggiFinali: storia });
    record({ tipo: 'tempi-giro', versioneGiro: turno, primoTokenMs: 400 });
    record({ type: 'RunFinished', threadId: 't', runId: `r${turno}`, _sequenza: sequenza++ });
  }
  return storia;
}

// ───────────────────────────── il figlio dei 1.000 turni ─────────────────────────────

if (process.env.F2BIS_FIGLIO === '1') {
  /*
   * Genera 1.000 turni col PIANIFICATORE del registro (stesse regole di scrittura del prodotto: N giri + dimensione) e poi
   * misura `ripristina()` su un registro fresco: ms, RSS di picco, messaggi ricostruiti. Stampa una riga JSON.
   */
  const cartellaStore = cartellaDiProva('talos-f2bis-figlio-');
  const sessionId = 'mille';
  const turni = Number(process.env.F2BIS_TURNI ?? 1000);
  const kb = Number(process.env.F2BIS_KB_PER_TURNO ?? 3);
  const checkpointOgniGiri = Number(process.env.F2BIS_CHECKPOINT_OGNI ?? registroModulo.JOURNAL_CHECKPOINT_OGNI_GIRI);
  const esito = { turni, kbPerTurno: kb, checkpointOgniGiri };
  let picco = process.memoryUsage().rss;
  const campione = setInterval(() => { picco = Math.max(picco, process.memoryUsage().rss); }, 20);
  try {
    const stato = registroModulo.statoJournalNuovo();
    const scrivi = (r) => registraRigaSync({ cartellaStore, sessionId, record: r });
    scrivi({ tipo: 'intestazione', schema: SCHEMA_SESSIONE, sessionId, taskId: 'task-vero', cartella: '/tmp/x', task: { consegna: 'c' }, modello: 'm', avviataAlle: '2026-09-24T06:00:00.000Z' });
    let storia = [];
    let sequenza = 1;
    let checkpoint = 0;
    const inizioGen = performance.now();
    for (let turno = 1; turno <= turni; turno += 1) {
      const iniziali = [...storia, { role: 'user', content: `Turno ${turno}: ${testo(Math.round(kb * 1024 * 0.1), turno)}` }];
      const ripresa = registroModulo.pianificaRecordDiStoria(stato, iniziali, { versioneGiro: turno, fase: 'ripresa', checkpointOgniGiri });
      scrivi(ripresa.record); ripresa.applica(); if (ripresa.checkpoint) checkpoint += 1;
      scrivi({ type: 'RunStarted', threadId: 't', runId: `r${turno}`, _sequenza: sequenza++ });
      storia = [...iniziali,
        { role: 'assistant', content: testo(Math.round(kb * 1024 * 0.35), turno * 3), tool_calls: [{ id: `call_${turno}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: `call_${turno}`, content: testo(Math.round(kb * 1024 * 0.5), turno * 5) },
        { role: 'assistant', content: `Fatto al turno ${turno}.` }];
      const finale = registroModulo.pianificaRecordDiStoria(stato, storia, { versioneGiro: turno, fase: 'finale', checkpointOgniGiri });
      scrivi(finale.record); finale.applica(); if (finale.checkpoint) checkpoint += 1;
      scrivi({ type: 'RunFinished', threadId: 't', runId: `r${turno}`, _sequenza: sequenza++ });
    }
    esito.msGenerazione = Math.round(performance.now() - inizioGen);
    esito.byteJournal = statSync(join(cartellaStore, `${sessionId}.jsonl`)).size;
    esito.byteStoria = Buffer.byteLength(JSON.stringify(storia), 'utf8');
    esito.checkpointScritti = checkpoint;
    esito.messaggiAttesi = storia.length;
    esito.rssPiccoGenerazione = Math.max(picco, process.memoryUsage().rss);
    picco = process.memoryUsage().rss;
    const { registro, finta } = registroDiProva(cartellaStore);
    const inizio = performance.now();
    const ripristino = await registro.ripristina();
    esito.msRipristina = Math.round(performance.now() - inizio);
    esito.ripristino = ripristino;
    esito.scartate = registro.statoPersistenza().scartate;
    const ripresa = registro.resume(sessionId, 'ancora uno');
    esito.erroreResume = ripresa.erroreAvvio ?? null;
    esito.messaggiRicostruiti = (finta.ultimoInput?.messaggiIniziali?.length ?? 1) - 1;
    esito.rssPiccoRipristino = Math.max(picco, process.memoryUsage().rss);
    if (finta.chiamate) { finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { messaggiFinali: finta.ultimoInput.messaggiIniziali } }); await new Promise((r) => setImmediate(r)); }
    await attendiScritture({ cartellaStore });
  } catch (errore) {
    esito.errore = `${errore?.code ?? errore?.name}: ${errore?.message}`;
  } finally {
    clearInterval(campione);
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
  process.stdout.write(`${JSON.stringify(esito)}\n`);
  process.exit(esito.errore ? 1 : 0);
}

// ───────────────────────────── le prove ─────────────────────────────

test('JOURNAL-DELTA-WRITES-ONLY-NEW-MESSAGES — 10 giri: ogni riga di storia porta SOLO i messaggi nuovi, e il file cresce linearmente', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-delta-');
  let sessionId = 'sess-delta';
  try {
    const { registro, finta } = registroDiProva(cartellaStore);
    const storia = await giraTurni(registro, finta, sessionId, { turni: 10 });
    sessionId = idDi(registro);
    const righe = righeDelJournal(cartellaStore, sessionId);
    const diStoria = righe.filter(eRigaDiStoria);
    assert.ok(diStoria.length >= 19, `almeno una riga di storia per fase e per giro: ${diStoria.length}`);
    assert.equal(righe.filter((r) => r.tipo === 'messaggi-finali' || r.tipo === 'checkpoint-ripresa').length, 0, 'il formato vecchio non si scrive più');
    for (const d of diStoria.filter((r) => r.tipo === 'messaggi-delta')) {
      assert.ok(Number.isSafeInteger(d.da) && d.da >= 0, 'ogni delta dice da dove parte');
      assert.ok(d.messaggi.length <= 2, `un delta porta i soli messaggi nuovi del giro (${d.fase}), non ${d.messaggi.length}`);
      assert.ok(['finale', 'ripresa'].includes(d.fase));
    }
    // ⛔ La misura: coi record interi 10 giri costano ~2 × Σ(k · 5 KB) ≈ 550 KB; a delta con checkpoint per raddoppio ≤ ~3× la storia.
    const byteStoria = byteDi(storia);
    const byteDiStoria = diStoria.reduce((s, r) => s + byteDi(r), 0);
    assert.ok(byteDiStoria < 4 * byteStoria, `righe di storia ${byteDiStoria} B contro storia ${byteStoria} B: non è lineare`);
    // e il replay ricostruisce esattamente la storia
    assert.deepEqual(registroModulo.ricostruisciStoriaDaRecord(righe).finale.messaggi, storia);
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-CHECKPOINT-EVERY-N — con N=3 e senza regola di dimensione il checkpoint cade ai giri 3 e 6 (fase finale), gli altri sono delta', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-ogni-n-');
  let sessionId = 'sess-ogni-n';
  try {
    const { registro, finta } = registroDiProva(cartellaStore, { journalCheckpointOgniGiri: 3, journalRegolaDimensione: false });
    const storia = await giraTurni(registro, finta, sessionId, { turni: 7, byteRisposta: 200, byteDomanda: 100 });
    sessionId = idDi(registro);
    const righe = righeDelJournal(cartellaStore, sessionId);
    const checkpoint = righe.filter((r) => r.tipo === 'checkpoint');
    assert.deepEqual(checkpoint.map((c) => [c.versioneGiro, c.fase]), [[3, 'finale'], [6, 'finale']]);
    for (const c of checkpoint) assert.ok(Array.isArray(c.storia) && c.storia.length === c.versioneGiro * 2, 'il checkpoint porta la storia intera');
    assert.equal(righe.filter((r) => r.tipo === 'messaggi-delta').length, 7 + 6 - 2, '7 finali + 6 riprese, meno i 2 diventati checkpoint');
    assert.deepEqual(registroModulo.ricostruisciStoriaDaRecord(righe).finale.messaggi, storia);
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-CHECKPOINT-BY-SIZE — con N=0 vale solo il raddoppio (Redis auto-aof-rewrite-percentage): pochi checkpoint, journal ≤ ~3× la storia', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-dimensione-');
  let sessionId = 'sess-dimensione';
  try {
    const { registro, finta } = registroDiProva(cartellaStore, { journalCheckpointOgniGiri: 0 });
    const storia = await giraTurni(registro, finta, sessionId, { turni: 12 });
    sessionId = idDi(registro);
    const righe = righeDelJournal(cartellaStore, sessionId);
    const checkpoint = righe.filter((r) => r.tipo === 'checkpoint');
    assert.ok(checkpoint.length >= 2 && checkpoint.length <= 6, `raddoppio ⇒ O(log n) checkpoint su 12 giri, non ${checkpoint.length}`);
    assert.equal(checkpoint[0].versioneGiro, 1, 'la prima scrittura di una sessione nuova è un checkpoint (base 0 ⇒ qualunque delta la supera)');
    const byteDiStoria = righe.filter(eRigaDiStoria).reduce((s, r) => s + byteDi(r), 0);
    assert.ok(byteDiStoria <= 3.5 * byteDi(storia), `${byteDiStoria} B contro ${byteDi(storia)} B di storia`);
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-REPLAY-EQUALS-OLD-FORMAT — la stessa storia nei due formati dà lo stesso ripristino (messaggi, versione, conclusa)', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-parita-');
  try {
    const storiaVecchia = seminaJournalVecchio(cartellaStore, 'sess-vecchia', { turni: 2 });
    const { registro, finta } = registroDiProva(cartellaStore);
    const storiaNuova = await giraTurni(registro, finta, 'sess-nuova', { turni: 2, byteRisposta: 900, byteDomanda: 300 });
    const idNuova = idDi(registro);
    assert.equal(storiaVecchia.length, storiaNuova.length);
    assert.equal(righeDelJournal(cartellaStore, idNuova).filter((r) => r.tipo === 'messaggi-finali' || r.tipo === 'checkpoint-ripresa').length, 0);

    const { registro: dopo, finta: fintaDopo } = registroDiProva(cartellaStore);
    assert.deepEqual(await dopo.ripristina(), { ripristinate: 2, totali: 2 });
    const attese = {};
    for (const id of ['sess-vecchia', idNuova]) {
      const voce = dopo.elenca().find((s) => s.sessionId === id);
      assert.ok(voce, `${id} ripristinata`);
      assert.equal(voce.conclusa, true, `${id}: conclusa`);
      const esito = dopo.resume(id, 'terzo giro');
      assert.ok(!esito.erroreAvvio, esito.erroreAvvio);
      attese[id] = fintaDopo.ultimoInput.messaggiIniziali;
      fintaDopo.concludi({ type: 'RunFinished' }, { ok: true, esito: { messaggiFinali: fintaDopo.ultimoInput.messaggiIniziali } });
      await new Promise((r) => setImmediate(r));
    }
    // stessa forma, stessi ruoli e stesse lunghezze; i testi differiscono solo per il seme del generatore
    assert.equal(attese['sess-vecchia'].length, attese[idNuova].length);
    assert.deepEqual(attese['sess-vecchia'].map((m) => m.role), attese[idNuova].map((m) => m.role));
    assert.deepEqual(attese['sess-vecchia'].slice(0, -1), storiaVecchia, 'il formato vecchio si legge come ieri');
    assert.deepEqual(attese[idNuova].slice(0, -1), storiaNuova, 'il formato nuovo ricostruisce la stessa storia');
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-MIGRATES-OLD-FILE-ON-FIRST-WRITE — un file vecchio si legge com\'è; la prima scrittura nuova è un checkpoint vero; i byte vecchi restano identici', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-migra-');
  const sessionId = 'sess-migra';
  try {
    const storiaVecchia = seminaJournalVecchio(cartellaStore, sessionId, { turni: 2 });
    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const byteVecchi = readFileSync(percorso);
    const righeVecchie = righeDelJournal(cartellaStore, sessionId).length;

    const { registro, finta } = registroDiProva(cartellaStore);
    assert.deepEqual(await registro.ripristina(), { ripristinate: 1, totali: 1 });
    assert.deepEqual(readFileSync(percorso), byteVecchi, 'leggere non scrive');
    assert.ok(!registro.resume(sessionId, 'primo messaggio nuovo').erroreAvvio);
    await attendiScritture({ cartellaStore });
    const righe = righeDelJournal(cartellaStore, sessionId);
    const nuove = righe.slice(righeVecchie);
    assert.ok(readFileSync(percorso).subarray(0, byteVecchi.length).equals(byteVecchi), 'il file vecchio non si riscrive mai in posto: i byte vecchi sono un prefisso identico');
    const primaDiStoria = nuove.find(eRigaDiStoria);
    assert.equal(primaDiStoria?.tipo, 'checkpoint', `la prima scrittura nuova è un checkpoint, non ${primaDiStoria?.tipo}`);
    assert.equal(primaDiStoria.fase, 'ripresa');
    assert.deepEqual(primaDiStoria.storia, [...storiaVecchia, { role: 'user', content: 'primo messaggio nuovo' }]);
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { messaggiFinali: [...finta.ultimoInput.messaggiIniziali, { role: 'assistant', content: 'ok' }] } });
    await new Promise((r) => setImmediate(r));
    await attendiScritture({ cartellaStore });
    const dopoLaFine = righeDelJournal(cartellaStore, sessionId).slice(righeVecchie).filter(eRigaDiStoria);
    assert.deepEqual(dopoLaFine.map((r) => r.tipo), ['checkpoint', 'messaggi-delta'], 'dal checkpoint in poi si scrive a delta');
    assert.deepEqual(dopoLaFine[1].messaggi, [{ role: 'assistant', content: 'ok' }]);
    assert.equal(dopoLaFine[1].da, storiaVecchia.length + 1);

    // e dopo un altro riavvio la storia è intera: vecchia + nuova
    const { registro: terzo, finta: fintaTerzo } = registroDiProva(cartellaStore);
    await terzo.ripristina();
    assert.ok(!terzo.resume(sessionId, 'ancora').erroreAvvio);
    assert.deepEqual(fintaTerzo.ultimoInput.messaggiIniziali, [...storiaVecchia, { role: 'user', content: 'primo messaggio nuovo' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'ancora' }]);
    fintaTerzo.concludi({ type: 'RunFinished' }, { ok: true, esito: { messaggiFinali: fintaTerzo.ultimoInput.messaggiIniziali } });
    await new Promise((r) => setImmediate(r));
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-OLD-FILE-UNTOUCHED — AL CONTRARIO: un journal vecchio che nessuno scrive resta byte per byte uguale dopo il ripristino', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-intatto-');
  const sessionId = 'sess-intatto';
  try {
    seminaJournalVecchio(cartellaStore, sessionId, { turni: 3 });
    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const prima = sha256(percorso);
    for (let riavvio = 0; riavvio < 2; riavvio += 1) {
      const { registro } = registroDiProva(cartellaStore);
      assert.deepEqual(await registro.ripristina(), { ripristinate: 1, totali: 1 });
      await attendiScritture({ cartellaStore });
    }
    assert.equal(sha256(percorso), prima);
    assert.deepEqual(readdirSync(cartellaStore), [`${sessionId}.jsonl`], 'nessun .bak, nessun temporaneo');
  } finally {
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-TORN-TAIL-AFTER-CHECKPOINT-REPAIRED — un delta spezzato in coda si scarta e si dice; la storia fino all\'ultima riga intera torna; si può continuare', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-coda-');
  let sessionId = 'sess-coda';
  try {
    const { registro, finta } = registroDiProva(cartellaStore);
    const storia = await giraTurni(registro, finta, sessionId, { turni: 3 });
    sessionId = idDi(registro);
    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const byteSani = readFileSync(percorso);
    appendFileSync(percorso, '{"tipo":"messaggi-delta","versioneGiro":4,"fase":"ripresa","da":6,"messaggi":[{"role":"user","content":"spezz');

    const { registro: dopo, finta: fintaDopo } = registroDiProva(cartellaStore);
    const eventi = [];
    assert.deepEqual(await dopo.ripristina(), { ripristinate: 1, totali: 1 });
    dopo.iscriviti(sessionId, (e) => eventi.push(e));
    const riparato = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.journal-riparato');
    assert.ok(riparato, 'la riparazione si dice');
    assert.equal(riparato.value.riparato, true);
    assert.equal(riparato.value.righeScartate, 1);
    assert.ok(readdirSync(cartellaStore).some((f) => f.includes('.bak')), 'la coda spezzata è nel backup');
    const bak = readdirSync(cartellaStore).find((f) => f.includes('.bak'));
    assert.ok(readFileSync(join(cartellaStore, bak)).subarray(0, byteSani.length).equals(byteSani));
    assert.ok(!dopo.resume(sessionId, 'quarto giro').erroreAvvio);
    assert.deepEqual(fintaDopo.ultimoInput.messaggiIniziali, [...storia, { role: 'user', content: 'quarto giro' }]);
    fintaDopo.concludi({ type: 'RunFinished' }, { ok: true, esito: { messaggiFinali: [...fintaDopo.ultimoInput.messaggiIniziali, { role: 'assistant', content: 'fine' }] } });
    await new Promise((r) => setImmediate(r));
    await attendiScritture({ cartellaStore });
    const righe = righeDelJournal(cartellaStore, sessionId);
    assert.deepEqual(registroModulo.ricostruisciStoriaDaRecord(righe).finale.messaggi, [...storia, { role: 'user', content: 'quarto giro' }, { role: 'assistant', content: 'fine' }]);
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-GAP-KEEPS-UP-TO-THE-HOLE — un delta che parte OLTRE la storia ricostruita è un buco: si riprende dall ultimo punto coerente, lo si dice, il file non si tocca (owner 26/09)', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-buco-');
  const sessionId = 'sess-buco';
  try {
    const record = (r) => registraRigaSync({ cartellaStore, sessionId, record: r });
    record({ tipo: 'intestazione', schema: SCHEMA_SESSIONE, sessionId, taskId: 'task-vero', cartella: '/tmp/x', task: { consegna: 'c' }, modello: 'm', avviataAlle: '2026-09-24T06:00:00.000Z' });
    record({ tipo: 'checkpoint', versioneGiro: 1, fase: 'finale', storia: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'a' }], recordCompattazione: null });
    record({ tipo: 'messaggi-delta', versioneGiro: 2, fase: 'finale', da: 5, messaggi: [{ role: 'assistant', content: 'inventata?' }] });
    record({ tipo: 'messaggi-delta', versioneGiro: 3, fase: 'finale', da: 6, messaggi: [{ role: 'assistant', content: 'dopo il buco' }] });
    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const byteVecchi = readFileSync(percorso);
    const { registro, finta } = registroDiProva(cartellaStore);
    assert.deepEqual(await registro.ripristina(), { ripristinate: 1, totali: 1 }, 'la conversazione NON si butta più');
    assert.deepEqual(registro.statoPersistenza().scartate, []);
    /* Il file non si RISCRIVE: in coda si aggiunge solo l'annuncio persistito, come per la coda spezzata. */
    assert.ok(readFileSync(percorso).subarray(0, byteVecchi.length).equals(byteVecchi), 'i byte col buco restano un prefisso intatto');
    const eventi = [];
    registro.iscriviti(sessionId, (e) => eventi.push(e));
    const annuncio = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.journal-riparato');
    assert.ok(annuncio, 'il buco si dice in chat');
    assert.deepEqual(annuncio.value.buco, { recuperataFinoAlGiro: 1, deltaScartati: 2 });
    assert.ok(!registro.resume(sessionId, 'e adesso').erroreAvvio);
    assert.deepEqual(finta.ultimoInput.messaggiIniziali.map((m) => m.content), ['c', 'a', 'e adesso'], 'si riprende dall ultimo punto coerente, niente di inventato');
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { messaggiFinali: [...finta.ultimoInput.messaggiIniziali, { role: 'assistant', content: 'ok' }] } });
    await new Promise((r) => setImmediate(r));
    await attendiScritture({ cartellaStore });
    const righe = righeDelJournal(cartellaStore, sessionId);
    const storiaDopo = righe.filter((r) => r.tipo === 'checkpoint' || r.tipo === 'messaggi-delta');
    assert.equal(storiaDopo.at(-2)?.tipo, 'checkpoint', 'la prima scrittura dopo il buco ri-ancora la storia con un checkpoint');
    assert.deepEqual(registroModulo.ricostruisciStoriaDaRecord(righe).finale.messaggi.map((m) => m.content), ['c', 'a', 'e adesso', 'ok']);
    assert.equal(registroModulo.ricostruisciStoriaDaRecord(righe).incoerenza, null, 'dopo il checkpoint il file è di nuovo coerente');
    // AL CONTRARIO: un `da` SOTTO la lunghezza è un riavvolgimento legittimo (una ripresa abbandonata da un riavvio)
    const ok = registroModulo.ricostruisciStoriaDaRecord([
      { tipo: 'checkpoint', versioneGiro: 1, fase: 'finale', storia: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'a' }] },
      { tipo: 'messaggi-delta', versioneGiro: 2, fase: 'ripresa', da: 2, messaggi: [{ role: 'user', content: 'persa dal riavvio' }] },
      { tipo: 'messaggi-delta', versioneGiro: 2, fase: 'ripresa', da: 2, messaggi: [{ role: 'user', content: 'riprovata' }] },
      { tipo: 'messaggi-delta', versioneGiro: 2, fase: 'finale', da: 3, messaggi: [{ role: 'assistant', content: 'b' }] },
    ]);
    assert.equal(ok.incoerenza, null);
    assert.deepEqual(ok.finale.messaggi.map((m) => m.content), ['c', 'a', 'riprovata', 'b']);
  } finally {
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-NON-PREFIX-HISTORY-IS-A-CHECKPOINT — una storia che non ha la persistita come prefisso (compattazione, lapidi) si scrive intera, mai come delta', () => {
  const stato = registroModulo.statoJournalNuovo();
  const primo = registroModulo.pianificaRecordDiStoria(stato, [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'a' }], { versioneGiro: 1, checkpointOgniGiri: 0 });
  assert.equal(primo.record.tipo, 'checkpoint', 'la prima scrittura: base 0');
  primo.applica();
  const secondo = registroModulo.pianificaRecordDiStoria(stato, [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'x' }], { versioneGiro: 2, fase: 'ripresa', checkpointOgniGiri: 0 });
  assert.equal(secondo.record.tipo, 'messaggi-delta', 'prefisso per uguaglianza profonda (riferimenti diversi, stesso contenuto)');
  assert.equal(secondo.record.da, 2);
  secondo.applica();
  const riscritta = registroModulo.pianificaRecordDiStoria(stato, [{ role: 'system', content: 'riassunto' }, { role: 'user', content: 'x' }], { versioneGiro: 2, checkpointOgniGiri: 0 });
  assert.equal(riscritta.record.tipo, 'checkpoint');
  assert.equal(riscritta.motivo, 'storia-non-prefisso');
  // dopo una scrittura fallita la prossima è un checkpoint, anche se sarebbe un prefisso
  riscritta.fallita();
  const dopoErrore = registroModulo.pianificaRecordDiStoria(stato, [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }], { versioneGiro: 2, checkpointOgniGiri: 0 });
  assert.equal(dopoErrore.motivo, 'dovuto');
});

test('JOURNAL-1000-TURNS-REPLAY-UNDER-2S — in un figlio fresco: 1.000 turni a delta (di serie: solo dimensione, owner 26/09), ripristina() sotto i 2 s, 4.000 messaggi ricostruiti', { timeout: 120_000 }, async () => {
  const esito = await new Promise((resolve, reject) => {
    const figlio = spawn(process.execPath, [QUI], { env: { ...process.env, F2BIS_FIGLIO: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    figlio.stdout.on('data', (d) => { out += d; });
    figlio.stderr.on('data', (d) => { err += d; });
    figlio.on('error', reject);
    figlio.on('close', (codice) => {
      const riga = out.trim().split('\n').at(-1);
      try { resolve({ codice, ...JSON.parse(riga), stderr: err }); } catch { reject(new Error(`figlio senza JSON (exit ${codice}): ${out}\n${err}`)); }
    });
  });
  assert.equal(esito.errore, undefined, esito.errore);
  assert.equal(esito.codice, 0, esito.stderr);
  assert.deepEqual(esito.ripristino, { ripristinate: 1, totali: 1 });
  assert.deepEqual(esito.scartate, []);
  assert.equal(esito.erroreResume, null);
  assert.equal(esito.messaggiRicostruiti, esito.messaggiAttesi);
  assert.equal(esito.messaggiAttesi, 4000);
  assert.ok(esito.msRipristina < 2000, `ripristina() in ${esito.msRipristina} ms`);
  assert.equal(esito.checkpointOgniGiri, 0, 'di serie vale la sola regola di dimensione (owner 26/09)');
  /* Con la sola dimensione il journal resta ≤ ~3× la storia (raddoppio, Redis auto-aof-rewrite-percentage): misurato 9,0 MB
   * per 3,0 MB. Con N=20 era 79,7 MB: questo tetto lo distingue. */
  assert.ok(esito.byteJournal < 4 * esito.byteStoria, `journal ${esito.byteJournal} B per ${esito.byteStoria} B di storia`);
  console.log(`  [1000 turni] journal ${(esito.byteJournal / 1048576).toFixed(1)} MB (storia ${(esito.byteStoria / 1048576).toFixed(1)} MB, ${esito.checkpointScritti} checkpoint) · generazione ${esito.msGenerazione} ms · ripristina ${esito.msRipristina} ms · RSS picco ripristino ${(esito.rssPiccoRipristino / 1048576).toFixed(0)} MB`);
});

test('JOURNAL-COMPACT-WRITES-A-CHECKPOINT — «Compatta ora» sostituisce la storia: sul disco è un checkpoint, e dopo il riavvio la storia è quella compattata', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-compatta-');
  let sessionId = 'sess-compatta';
  const riassunto = [{ role: 'system', content: 'Riassunto.' }, { role: 'user', content: 'Continua' }];
  try {
    // un modello che il registro sa riconoscere: con `m` la compattazione rifiuta onestamente (SESSION_MODEL_UNKNOWN), come CTX-LEGACY-RESTART-PERSISTENCE
    const { registro, finta } = registroDiProva(cartellaStore, { modello: 'z-ai/glm-5.3-flash', compattaSessioneFn: async () => ({ compattato: true, messaggi: riassunto }) });
    await giraTurni(registro, finta, sessionId, { turni: 2, byteRisposta: 300, byteDomanda: 100 });
    sessionId = idDi(registro);
    assert.deepEqual(senzaStime(await registro.compatta(sessionId)), { ok: true, compattato: true, annullabile: false });
    const ultima = righeDelJournal(cartellaStore, sessionId).filter(eRigaDiStoria).at(-1);
    assert.equal(ultima.tipo, 'checkpoint');
    assert.deepEqual(ultima.storia, riassunto);
    const { registro: dopo, finta: fintaDopo } = registroDiProva(cartellaStore);
    await dopo.ripristina();
    assert.ok(!dopo.resume(sessionId, 'ancora').erroreAvvio);
    assert.deepEqual(fintaDopo.ultimoInput.messaggiIniziali, [...riassunto, { role: 'user', content: 'ancora' }]);
    fintaDopo.concludi({ type: 'RunFinished' }, { ok: true, esito: { messaggiFinali: fintaDopo.ultimoInput.messaggiIniziali } });
    await new Promise((r) => setImmediate(r));
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

test('JOURNAL-STORE-STILL-OPAQUE — il negozio rilegge i record nuovi tali e quali (leggiRegistro), come qualunque riga', async () => {
  const cartellaStore = cartellaDiProva('talos-f2bis-opaco-');
  let sessionId = 'sess-opaco';
  try {
    const { registro, finta } = registroDiProva(cartellaStore);
    await giraTurni(registro, finta, sessionId, { turni: 2, byteRisposta: 300, byteDomanda: 100 });
    sessionId = idDi(registro);
    const daNegozio = await leggiRegistro({ cartellaStore, sessionId });
    assert.deepEqual(daNegozio, righeDelJournal(cartellaStore, sessionId));
    assert.ok(existsSync(join(cartellaStore, `${sessionId}.jsonl`)));
  } finally {
    await attendiScritture({ cartellaStore });
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
});

/*
 * ⛔ 24/09/2026 (review avversaria del coordinatore) — IL KERNEL VERO CONSERVA LA STORIA COME PREFISSO. Il delta riconosce la storia
 *   già scritta per identità degli oggetti, poi per contenuto uguale (`prefissoPersistito`). Le prove qui sopra usano una sessione
 *   FINTA che restituisce gli stessi oggetti: se un giorno il kernel clonasse o ritoccasse i messaggi dei giri precedenti, ogni giro
 *   diventerebbe un checkpoint — il journal tornerebbe quadratico, in silenzio. Qui il kernel vero (`talosLavora`, fornitore finto)
 *   gira due volte, con un giro di attrezzo, e la storia del primo deve restare prefisso del secondo. Misurato il 24/09: 6 oggetti
 *   su 6 identici. Al contrario: un primo messaggio ritoccato rompe il prefisso (-1), cioè il controllo sa dire di no.
 */
test('JOURNAL-REAL-KERNEL-KEEPS-PREFIX — il kernel vero restituisce la storia precedente come prefisso: il delta resta un delta', async () => {
  const cartella = cartellaDiProva('talos-f2bis-kernel-');
  try {
    writeFileSync(join(cartella, 'uno.txt'), 'contenuto del file uno');
    let chiamata = 0;
    const fetchDiRete = async (_url, init) => {
      chiamata += 1;
      const corpo = JSON.parse(init.body);
      if (chiamata === 1) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'uno.txt' }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 100, completion_tokens: 5 } });
      return Response.json({ choices: [{ message: { role: 'assistant', content: corpo.messages.at(-1)?.role === 'tool' ? 'Letto.' : 'Seconda risposta.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 6 } });
    };
    const base = { cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete, comandoProva: 'node -e 0' };
    const primo = await talosLavora({ ...base, task: { consegna: 'leggi uno.txt' } });
    assert.equal(primo.comeFinita, 'concluso');
    const iniziali = [...primo.messaggiFinali, { role: 'user', content: 'e adesso rispondi di nuovo' }];
    assert.ok(iniziali.some((m) => m.role === 'tool'), 'il primo giro ha davvero un esito di attrezzo');
    const secondo = await talosLavora({ ...base, task: { consegna: 'e adesso rispondi di nuovo' }, messaggiIniziali: iniziali });
    assert.equal(secondo.comeFinita, 'concluso');
    assert.equal(registroModulo.prefissoPersistito(iniziali, secondo.messaggiFinali), iniziali.length, 'la storia di partenza resta prefisso');
    assert.ok(secondo.messaggiFinali.length > iniziali.length, 'e il giro nuovo si aggiunge in coda');
    // al contrario: un primo messaggio ritoccato rompe il prefisso — il controllo sa dire di no
    const ritoccata = [{ ...secondo.messaggiFinali[0], content: `${secondo.messaggiFinali[0].content} (ritoccato)` }, ...secondo.messaggiFinali.slice(1)];
    assert.equal(registroModulo.prefissoPersistito(iniziali, ritoccata), -1);
  } finally {
    await rimuoviCartellaDiProvaAttesa(cartella);
  }
});

