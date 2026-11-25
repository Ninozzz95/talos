import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { CARTELLA_AFFITTI } from '../src/session-lease.mjs';

/* Prima del sesto giro il file di attesa non esiste: le prove si caricano lo stesso e ciascuna è rossa per il suo motivo. */
const { affittiDellArchivio, attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio, eliminaSessionePersistita, registraRiga } = store;
let attesa = null;
try { attesa = await import('../src/session-attesa.mjs'); } catch { attesa = null; }
const manca = (nome) => { throw new Error(`${nome} is missing (before the sixth lease round)`); };
const adottaRigheInAttesaSync = (...a) => (store.adottaRigheInAttesaSync ? store.adottaRigheInAttesaSync(...a) : manca('adottaRigheInAttesaSync'));
const aggiungiAllAttesaSync = (...a) => (attesa ? attesa.aggiungiAllAttesaSync(...a) : manca('aggiungiAllAttesaSync'));
const leggiAttesa = (...a) => (attesa ? attesa.leggiAttesa(...a) : manca('leggiAttesa'));
const percorsoAttesa = (cartella, id) => join(cartella, `${id}.attesa`);

/*
 * 14/11/2026 — SESTO GIRO DELL'AFFITTO, «la riga rifiutata aspetta su disco» (owner 16:26, giudice v1882 e v1888-v1889).
 *   Un'altra finestra di TALOS (un altro processo vivo) tiene la chat quando qui arriva una riga (tardiva o no): lo store la rifiuterebbe
 *   (`SESSION_LEASED`). Prima: la riga si perdeva, anche quando la chat si liberava (revisore 1 del giro 5: Q1 0 sul disco anche dopo il
 *   riavvio; a2s dal vivo 30 perse su 30, SENZA nota), e quella mostrata aveva un numero che il disco non aveva mai: l'altro lo prendeva e
 *   la pagina e la CLI nascondevano le sue righe (Q2; dal vivo 60 righe dell'altro nascoste in 30 corse). Ora la riga va in un file di
 *   attesa accanto al diario (solo in aggiunta, con `fsync`, mai sovrascritto né svuotato), non mostra un numero finché il disco non
 *   gliene dà uno (nota «in attesa» visibile, una per riga, EN poi IT), e si adotta in coda quando la chat si libera, anche dopo un
 *   arresto brusco; una riga «adottata» nel file di attesa e il confronto col diario impediscono che si scriva due volte.
 *   Q1, Q2, Q3 e G518-A/B sono le prove del revisore 1 del giro 5 (`C:/T/rev-aff5-1-copia/testa/harness-ui/tests/zz-rev-aff5-1-*.test.mjs`),
 *   portate qui con la nota nuova. Solo cartelle del TEMP (finto, nella coda); mai tolte da qui.
 */
const QUI = dirname(fileURLToPath(import.meta.url));
const FIGLIO = join(QUI, 'fixtures', 'affitto-attesa-figlio.mjs');
/* le righe in attesa che il registro dice (-1 se il registro non lo sa dire: prima del sesto giro) */
const inAttesa = (registro, id) => (typeof registro.righeInAttesa === 'function' ? registro.righeInAttesa(id).length : -1);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}|${e.delta ?? ''}`;
const giornale = (store, id) => join(store, `${id}.jsonl`);
const righe = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
const massimo = (store, id) => Math.max(0, ...righe(store, id).map((r) => r._sequenza).filter(Number.isSafeInteger));
const scriveAltrove = (store, id, ids) => {
  let n = massimo(store, id);
  appendFileSync(giornale(store, id), ids.map((x) => `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: x }, _sequenza: ++n })}\n`).join(''));
};
const fileAffitto = (store, id) => join(store, CARTELLA_AFFITTI, `${id}.json`);
const affittoDellAltro = (store, id, pid) => {
  mkdirSync(join(store, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(fileAffitto(store, id), JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid, host: hostname(), avviatoIl: '2026-11-14T08:00:00.000Z', presoIl: '2026-11-14T08:01:00.000Z', etichetta: 'the other TALOS' }));
};
/* un pid morto sullo stesso host: un figlio già uscito (l'affitto lo giudica scaduto: `session-lease.mjs:164`) */
const pidMorto = () => {
  const r = spawnSync(process.execPath, ['--version']);
  try { process.kill(r.pid, 0); return null; } catch (e) { return e.code === 'ESRCH' ? r.pid : null; }
};
const righeAttesa = (store, id) => (existsSync(percorsoAttesa(store, id)) ? readFileSync(percorsoAttesa(store, id), 'utf8') : '');
const contaTipo = (testo, tipo) => testo.split('\n').filter(Boolean).filter((t) => { try { return JSON.parse(t).tipo === tipo; } catch { return false; } }).length;
const NOTA_ATTESA = 'server.sessionPersistence.lateLineWaiting';
const NOTA_ADOTTATA = 'server.sessionPersistence.lateLineAdded';
/* 15/11/2026 (settimo giro): le note sono informative, `CUSTOM` `talos.riga-in-attesa` (prima `RunError`, carta d'errore e giro chiuso) */
const chiaveNota = (e) => (e?.type === 'CUSTOM' && e.name === 'talos.riga-in-attesa' ? e.value?.messageChiave ?? null : null);

/* un disco con la cache: ciò che non passa da `fsync` non arriva al file e si perde alla chiusura (l'arresto simulato) */
function discoConCache() {
  const aperti = new Map();
  const stato = { sincronizzati: 0 };
  return {
    stato,
    /* un descrittore vero (per `fstat`), ma i byte restano nella cache finché non arriva `fsync` */
    openSync: (p, flag) => { const fd = openSync(p, flag); aperti.set(fd, { p, flag, buf: [] }); return fd; },
    writeSync: (fd, testo) => { aperti.get(fd).buf.push(String(testo)); return Buffer.byteLength(String(testo)); },
    fsyncSync: (fd) => {
      const a = aperti.get(fd);
      if (a.buf.length) { appendFileSync(a.p, a.buf.join('')); a.buf = []; stato.sincronizzati += 1; }
    },
    closeSync: (fd) => { aperti.delete(fd); closeSync(fd); }, // ciò che non è sincronizzato si perde
  };
}

function registroDi(store, stato, extra = {}) {
  return createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'at' }, guardaWorkspaceFn: () => () => {}, ritentaCodaAffittataMs: 50,
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      if (!stato) return { ok: true, esito: { detto: 'x', comeFinita: 'concluso' } };
      while (!stato.sessionId) await pausa(5);
      stato.giri += 1;
      const g = stato.giri;
      if (g === 1) stato.onEvento = input.onEvento; // la chiusura del giro 1 resta in mano a chi l'ha avuta
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${g}` });
      input.onEvento({ type: 'TextMessageStart', messageId: `m${g}`, role: 'assistant' });
      for (let i = 0; i < 3; i += 1) { input.onEvento({ type: 'TextMessageContent', messageId: `m${g}`, delta: `g${g}p${i} ` }); await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId }); }
      input.onEvento({ type: 'TextMessageEnd', messageId: `m${g}` });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${g}`, outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      stato.fine[g]?.();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Fatto.' }] } };
    },
    ...extra,
  });
}

/*
 * Il caso del revisore 1 del giro 5 (Q1-Q3), con più righe e più forme:
 *   giro 1; questo TALOS lascia la chat; l'altro la prende, scrive e la TIENE; (apre) la persona apre la chat qui e la chat si ricarica;
 *   arrivano `quante` righe tardive dalla chiusura del giro 1; (altroScriveDopo) l'altro scrive ancora; (riavvioPrima) questo processo si
 *   chiude e riparte mentre l'altro tiene la chat; la chat si libera (pid morto); questo TALOS la riprende e scrive un giro intero; riavvio.
 */
async function caso(t, { altroScriveDopo = false, apre = true, quante = 1, riavvioPrima = false, extra = {}, extraDopo = {}, extraFinale = {} } = {}) {
  const avvisi = [];
  const avvisoOriginale = console.warn;
  console.warn = (...a) => { avvisi.push(a.map(String).join(' ').slice(0, 240)); };
  t.after(() => { console.warn = avvisoOriginale; });
  const erroriLog = [];
  const erroreOriginale = console.error;
  console.error = (...a) => { erroriLog.push(a.map(String).join(' ').slice(0, 240)); };
  t.after(() => { console.error = erroreOriginale; });
  const errori = [];
  const suErrore = (e) => { errori.push(`${e?.code ?? ''} ${e?.message ?? e}`.slice(0, 160)); };
  process.on('unhandledRejection', suErrore);
  t.after(() => process.off('unhandledRejection', suErrore));
  const store = mkdtempSync(join(tmpdir(), 'at-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'atl-'));
  attivaAffittiArchivio(store, { etichetta: 'at', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [] };
  let registro = registroDi(store, stato, extra);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
  const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const pagina = { visti: new Set(), nascoste: [] };
  const cli = { cursore: 0, nascoste: [] };
  const vistoCol = new Map();
  const consegne = new Map();
  const note = { attesa: 0, adottata: 0, senzaNumero: 0 };
  const ascolta = (e) => {
    if (chiaveNota(e) === NOTA_ATTESA) { note.attesa += 1; if (!Number.isSafeInteger(e._sequenza)) note.senzaNumero += 1; }
    if (chiaveNota(e) === NOTA_ADOTTATA) note.adottata += 1;
    if (!Number.isSafeInteger(e?._sequenza)) return;
    const c = chiave(e);
    consegne.set(c, (consegne.get(c) ?? 0) + 1);
    if (!vistoCol.has(c)) vistoCol.set(c, e._sequenza);
    if (pagina.visti.has(e._sequenza)) pagina.nascoste.push(`${e._sequenza} ${c}`); else pagina.visti.add(e._sequenza);
    if (e._sequenza <= cli.cursore) cli.nascoste.push(`${e._sequenza} ${c}`); else cli.cursore = e._sequenza;
  };
  registro.iscriviti(id, ascolta, 0);
  stato.sessionId = id;
  await giro1;
  await registro.attendiAssestamento(id);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  affittiDellArchivio(store).rilascia(id);
  scriveAltrove(store, id, ['prima-1', 'prima-2']);
  affittoDellAltro(store, id, process.pid); // l'altro TALOS (vivo) tiene la chat
  const ricarica = apre ? await registro.allineaSessione(id, { scrivere: false }) : null;
  const tardivi = [];
  for (let i = 1; i <= quante; i += 1) {
    const e = { type: 'CUSTOM', name: 'talos.tardivo', value: { id: `tardivo-${i}` } };
    tardivi.push(e);
    await stato.onEvento(e);
  }
  await pausa(20);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  const numeroMostratoAlRifiuto = tardivi.map((e) => vistoCol.get(chiave(e)) ?? null);
  const sulDiscoAlRifiuto = righe(store, id).filter((r) => r.name === 'talos.tardivo').length;
  const fileAlRifiuto = righeAttesa(store, id);
  const inAttesaAlRifiuto = inAttesa(registro, id);
  if (altroScriveDopo) scriveAltrove(store, id, ['dopo-1', 'dopo-2', 'dopo-3']);
  if (riavvioPrima) {
    await registro.chiudi({ attesaMassimaMs: 1000 });
    registro = registroDi(store, null, extraDopo);
    await registro.ripristina();
    registro.iscriviti(id, ascolta, cli.cursore);
  }
  /* LA CHAT SI LIBERA: l'altro TALOS esce (pid morto sullo stesso host) */
  const morto = pidMorto();
  assert.ok(Number.isSafeInteger(morto), 'a dead pid was found');
  affittoDellAltro(store, id, morto);
  const presa = await registro.allineaSessione(id, { scrivere: true });
  for (let i = 0; i < 100 && inAttesa(registro, id) > 0; i += 1) await pausa(20);
  await pausa(100);
  for (let i = 0; i < 200 && !registro.esiste(id); i += 1) await pausa(5);
  if (!riavvioPrima) {
    const giro2 = new Promise((ok) => { stato.fine[2] = ok; });
    assert.equal(registro.resume(id, 'ancora').erroreAvvio, undefined, 'turn 2 starts: the chat is free and held here');
    await giro2;
    await registro.attendiAssestamento(id);
  }
  await attendiScritture({ cartellaStore: store, sessionId: id });
  await pausa(50);
  const scritte = righe(store, id);
  const numerate = scritte.filter((r) => typeof r.type === 'string' && Number.isSafeInteger(r._sequenza));
  const memoria = (registro.esporta(id)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza)).map((e) => e._sequenza);
  const fileDopo = righeAttesa(store, id);
  const inAttesaDopo = inAttesa(registro, id);
  await registro.chiudi({ attesaMassimaMs: 1000 });
  const nuovo = registroDi(store, null, extraFinale);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  const inAttesaSubitoDopoIlRiavvio = inAttesa(nuovo, id); // prima di ogni ritento: una riga già nel diario non torna in attesa
  await pausa(150); // tre ritenti: una riga già adottata non deve riscriversi
  await attendiScritture({ cartellaStore: store, sessionId: id });
  const dopo = (nuovo.esporta(id)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza));
  const numeriDopo = dopo.map((e) => e._sequenza);
  const scritteDopoIlRiavvio = righe(store, id);
  const conti = {
    altroScriveDopo, apre, riavvioPrima, ricaricata: ricarica?.ricaricata === true, presa: presa?.stato,
    numeroMostratoAlRifiuto, sulDiscoAlRifiuto, inAttesaAlRifiuto, note,
    logInAttesa: avvisi.filter((a) => /late line waiting/u.test(a)).length,
    logAdottate: avvisi.filter((a) => /waiting line\(s\) of .* added at the end/u.test(a)).length,
    tardiviSulDisco: tardivi.map((e) => scritte.filter((r) => r.name === 'talos.tardivo' && r.value?.id === e.value.id).length),
    tardiviNumeri: tardivi.map((e) => scritte.find((r) => r.name === 'talos.tardivo' && r.value?.id === e.value.id)?._sequenza ?? null),
    tardiviDalVivo: tardivi.map((e) => consegne.get(chiave(e)) ?? 0),
    tardiviVistoUguale: tardivi.map((e) => vistoCol.get(chiave(e)) ?? null).every((v, i) => v === (scritte.find((r) => r.value?.id === tardivi[i].value.id)?._sequenza ?? null)),
    tardiviDopoRiavvio: tardivi.map((e) => dopo.filter((x) => x.value?.id === e.value.id).length),
    tardiviSulDiscoDopoRiavvio: tardivi.map((e) => scritteDopoIlRiavvio.filter((r) => r.name === 'talos.tardivo' && r.value?.id === e.value.id).length),
    giro2SulDisco: scritte.filter((r) => r.runId === 'r2' || r.messageId === 'm2').length,
    numeriDoppiSulDisco: numerate.map((r) => r._sequenza).filter((n, i, a) => a.indexOf(n) !== i).length,
    numeriDoppiInMemoria: memoria.filter((n, i, a) => a.indexOf(n) !== i).length,
    numeriDoppiDopo: numeriDopo.filter((n, i, a) => a.indexOf(n) !== i).length,
    altroPerso: ['prima-1', 'prima-2', 'dopo-1', 'dopo-2', 'dopo-3'].filter((x) => scritte.some((r) => r.value?.id === x) && !dopo.some((e) => e.value?.id === x)),
    attesaAlRifiuto: contaTipo(fileAlRifiuto, 'attesa'), attesaDopo: contaTipo(fileDopo, 'attesa'), adottateDopo: contaTipo(fileDopo, 'adottata'),
    fileCrescePerPrefisso: fileDopo.startsWith(fileAlRifiuto), inAttesaDopo, inAttesaDopoIlRiavvio: inAttesa(nuovo, id), inAttesaSubitoDopoIlRiavvio,
    paginaNascoste: pagina.nascoste, cliNascoste: cli.nascoste, errori,
    senzaAffittoDopo: dopo.filter((e) => e.value?.id === 'senza-affitto-1').length,
  };
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

test('AT-Q1 [rev-aff5-1 Q1] (RED before) the line refused while the other TALOS holds the chat reaches the disk once the chat is free, once, also after a restart', async (t) => {
  const c = await caso(t);
  assert.equal(c.sulDiscoAlRifiuto, 0, 'refused while the other holds the chat');
  assert.equal(c.note.attesa, 1, 'one visible note says the line is waiting');
  assert.equal(c.logInAttesa, 1, 'one log line');
  assert.ok(c.giro2SulDisco >= 5, 'after the release this TALOS writes a whole turn: the chat really is free');
  assert.deepEqual(c.tardiviSulDisco, [1], 'the late line is written at the end once the chat is free');
  assert.deepEqual(c.tardiviDopoRiavvio, [1], 'and it is there after a restart, once');
  assert.deepEqual(c.tardiviSulDiscoDopoRiavvio, [1], 'the restart does not write it again');
});

test('AT-Q2 [rev-aff5-1 Q2] (RED before) the other TALOS writes after the refusal: no line of the other is hidden from the page or the CLI, no number shown before the disk', async (t) => {
  const c = await caso(t, { altroScriveDopo: true });
  assert.equal(c.sulDiscoAlRifiuto, 0, 'refused while the other holds the chat');
  assert.deepEqual(c.numeroMostratoAlRifiuto, [null], 'the waiting line shows no number before the disk gives it one');
  assert.deepEqual(c.paginaNascoste, [], 'the page hides no line');
  assert.deepEqual(c.cliNascoste, [], 'the CLI hides no line');
  assert.deepEqual(c.altroPerso, [], 'no line of the other TALOS lost');
  assert.deepEqual(c.tardiviSulDisco, [1], 'the late line is adopted at the end, once');
  assert.equal(c.tardiviVistoUguale, true, 'the number it is seen with is the number on the disk');
});

test('AT-Q3 [rev-aff5-1 Q3] (RED before) no reload in between (the chat was not opened here): never silent, and the line waits and is adopted', async (t) => {
  const c = await caso(t, { apre: false });
  assert.equal(c.sulDiscoAlRifiuto, 0, 'refused while the other holds the chat');
  assert.ok(c.logInAttesa >= 1, 'the server log says the line is waiting');
  assert.equal(c.note.attesa, 1, 'one visible note says the line is waiting');
  assert.deepEqual(c.tardiviSulDisco, [1], 'adopted at the end once the chat is free');
});

test('AT-04 three waiting lines, the other writes after: adopted in the order they arrived, once each, with numbers from the disk above every number given; the waiting file only grows', async (t) => {
  const c = await caso(t, { altroScriveDopo: true, quante: 3 });
  assert.deepEqual(c.errori, [], 'no unhandled refusal');
  assert.deepEqual(c.numeroMostratoAlRifiuto, [null, null, null], 'no number shown while waiting');
  assert.equal(c.note.attesa, 3, 'one waiting note for each waiting line');
  assert.equal(c.note.senzaNumero, 3, 'the notes carry no number');
  assert.equal(c.inAttesaAlRifiuto, 3, 'three lines waiting');
  assert.equal(c.attesaAlRifiuto, 3, 'three rows in the waiting file at the refusal');
  assert.deepEqual(c.tardiviSulDisco, [1, 1, 1], 'each written once');
  assert.ok(c.tardiviNumeri.every((n, i) => i === 0 || n > c.tardiviNumeri[i - 1]), `in the order they arrived (${c.tardiviNumeri})`);
  assert.deepEqual(c.tardiviDalVivo, [1, 1, 1], 'each reaches who listens once, after the disk');
  assert.equal(c.tardiviVistoUguale, true, 'with the number on the disk');
  assert.equal(c.note.adottata, 3, 'one note says each one is saved');
  assert.equal(c.logAdottate, 1, 'one log line for the adoption');
  assert.equal(c.adottateDopo, 3, 'one "adopted" row for each line in the waiting file');
  assert.equal(c.attesaDopo, 3, 'the waiting rows are still there: the file is never emptied');
  assert.equal(c.fileCrescePerPrefisso, true, 'the file only grows (never overwritten)');
  assert.equal(c.inAttesaDopo, 0, 'nothing left waiting in memory');
  assert.equal(c.numeriDoppiSulDisco + c.numeriDoppiInMemoria + c.numeriDoppiDopo, 0, 'no number twice');
  assert.deepEqual(c.paginaNascoste, [], 'the page hides no line');
  assert.deepEqual(c.cliNascoste, [], 'the CLI hides no line');
  assert.deepEqual(c.tardiviSulDiscoDopoRiavvio, [1, 1, 1], 'a restart writes nothing again');
});

/* [rev-aff5-1 G518] una riga rifiutata in un giro dopo vuole la sua nota (prima la nota era una per giro: G5-18 la taceva) */
async function dueGiri(t, { scrive }) {
  const avvisi = [];
  const avvisoOriginale = console.warn;
  console.warn = (...a) => { avvisi.push(a.map(String).join(' ').slice(0, 200)); };
  t.after(() => { console.warn = avvisoOriginale; });
  const erroreOriginale = console.error; console.error = () => {}; t.after(() => { console.error = erroreOriginale; });
  const store = mkdtempSync(join(tmpdir(), 'g518-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'g518l-'));
  attivaAffittiArchivio(store, { etichetta: 'g', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [] };
  const registro = registroDi(store, stato);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
  const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  let note = 0;
  registro.iscriviti(id, (e) => { if (chiaveNota(e) === NOTA_ATTESA) note += 1; }, 0);
  stato.sessionId = id;
  await giro1;
  await registro.attendiAssestamento(id);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  affittiDellArchivio(store).rilascia(id);
  scriveAltrove(store, id, ['prima-1', 'prima-2']);
  affittoDellAltro(store, id, process.pid);
  const ricarica = await registro.allineaSessione(id, { scrivere: false });
  await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: 'L1' } });
  await pausa(20);
  const noteDopoL1 = note;
  affittoDellAltro(store, id, pidMorto());
  await registro.allineaSessione(id, { scrivere: true });
  for (let i = 0; i < 100 && inAttesa(registro, id) > 0; i += 1) await pausa(20);
  const giro2 = new Promise((ok) => { stato.fine[2] = ok; });
  assert.equal(registro.resume(id, 'ancora').erroreAvvio, undefined, 'turn 2 starts');
  await giro2;
  await registro.attendiAssestamento(id);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  affittiDellArchivio(store).rilascia(id);
  if (scrive) scriveAltrove(store, id, ['dopo-1']);
  affittoDellAltro(store, id, process.pid);
  await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: 'L2' } });
  await pausa(20);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  const conti = { scrive, ricaricata: ricarica?.ricaricata === true, noteDopoL1, note, log: avvisi.filter((a) => /late line waiting/u.test(a)).length,
    l1SulDisco: righe(store, id).filter((r) => r.value?.id === 'L1').length, inAttesa: inAttesa(registro, id) };
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

test('AT-G518-A [rev-aff5-1 G518-A] a line refused in a later turn gives its own waiting note', async (t) => {
  const c = await dueGiri(t, { scrive: false });
  assert.equal(c.ricaricata, true, 'the reload replaced the entry');
  assert.equal(c.noteDopoL1, 1, 'one note for the first refused line');
  assert.equal(c.note, 2, 'a second note for the second refused line');
  assert.equal(c.log, 2, 'one log line each');
  assert.equal(c.l1SulDisco, 1, 'the first line was adopted when the chat was free');
  assert.equal(c.inAttesa, 1, 'the second line waits');
});

test('AT-G518-B [rev-aff5-1 G518-B] as G518-A, and the other TALOS writes before it holds the chat again: the second refusal still gives its note', async (t) => {
  const c = await dueGiri(t, { scrive: true });
  assert.equal(c.noteDopoL1, 1, 'one note for the first refused line');
  assert.equal(c.note, 2, 'a second note for the second refused line');
  assert.equal(c.log, 2, 'one log line each');
  assert.equal(c.l1SulDisco, 1, 'the first line was adopted when the chat was free');
});

test('AT-05 this process restarts while the other still holds the chat: the waiting lines come back from the file and are adopted when the chat is free, once', async (t) => {
  const c = await caso(t, { quante: 2, riavvioPrima: true });
  assert.deepEqual(c.tardiviSulDisco, [1, 1], 'adopted after the restart, once each');
  assert.equal(c.adottateDopo, 2, 'two "adopted" rows');
  assert.equal(c.inAttesaDopoIlRiavvio, 0, 'nothing waiting after a second restart');
  assert.deepEqual(c.tardiviSulDiscoDopoRiavvio, [1, 1], 'the second restart writes nothing again');
  assert.equal(c.note.attesa, 4, 'one waiting note per line at the refusal, and again for who opens the chat after the restart (2 + 2)');
  assert.equal(c.note.adottata, 2, 'one note per line when it is saved');
});

/* il disco con la cache: ciò che non passa da `fsync` si perde (l'arresto simulato è il riavvio di `riavvioPrima`) */
test('AT-06 simulated power cut: the waiting row survives only because it is synced (fsync) before the line is declared waiting', async (t) => {
  const disco = discoConCache();
  const c = await caso(t, { quante: 2, riavvioPrima: true, extra: { aggiungiAllAttesaFn: (s, id, r) => aggiungiAllAttesaSync(s, id, r, disco) } });
  assert.ok(disco.stato.sincronizzati >= 2, 'the waiting rows went through fsync');
  assert.equal(c.attesaAlRifiuto, 2, 'two waiting rows on the disk at the refusal');
  assert.deepEqual(c.tardiviSulDisco, [1, 1], 'both adopted after the restart');
  assert.equal(c.note.attesa, 4, 'who opens the chat after the restart sees the waiting notes again (2 + 2)');
  assert.equal(c.note.adottata, 2, 'one note per line when it is saved');
});

test('AT-07 the adoption syncs the journal BEFORE the "adopted" row, and syncs the "adopted" row (simulated power cut drops what was not synced)', () => {
  const store = mkdtempSync(join(tmpdir(), 'at7-'));
  const id = 'a7a7a7a7-0000-4000-8000-000000000007';
  writeFileSync(giornale(store, id), `${JSON.stringify({ type: 'RunStarted', runId: 'r1', _sequenza: 1 })}\n`);
  aggiungiAllAttesaSync(store, id, [{ tipo: 'attesa', id: 'w1', alle: 'x', record: { type: 'CUSTOM', name: 'talos.tardivo', value: { id: 'w1' } } }]);
  const disco = discoConCache();
  const ordine = [];
  const esito = adottaRigheInAttesaSync({ cartellaStore: store, sessionId: id, ids: ['w1'], prepara: (ids) => ids.map((x, i) => ({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: x }, _sequenza: 2 + i, _attesa: x })) },
    { ...disco, fsyncSync: (fd) => { ordine.push(fd); disco.fsyncSync(fd); } });
  assert.deepEqual(esito.scritte, ['w1']);
  assert.equal(righe(store, id).filter((r) => r._attesa === 'w1').length, 1, 'the journal has the line after the power cut');
  assert.equal(contaTipo(righeAttesa(store, id), 'adottata'), 1, 'the "adopted" row is on the disk');
  assert.equal(ordine.length, 2, 'two syncs: the journal, then the waiting file');
});

test('AT-08 the waiting file is written by appending with fsync, never overwritten: a second row keeps the first (unit)', () => {
  const store = mkdtempSync(join(tmpdir(), 'at8-'));
  const disco = discoConCache();
  aggiungiAllAttesaSync(store, 's8', [{ tipo: 'attesa', id: 'a', record: { type: 'CUSTOM' } }], disco);
  aggiungiAllAttesaSync(store, 's8', [{ tipo: 'attesa', id: 'b', record: { type: 'CUSTOM' } }], disco);
  aggiungiAllAttesaSync(store, 's8', [{ tipo: 'adottata', id: 'a' }], disco);
  const stato = leggiAttesa(store, 's8');
  assert.deepEqual(stato.attese.map((a) => a.id), ['a', 'b'], 'both waiting rows, in order');
  assert.deepEqual([...stato.adottate], ['a']);
  assert.equal(disco.stato.sincronizzati, 3, 'every append is synced');
});

/* un arresto fra la riga nel diario e la riga «adottata»: la lettura confronta col diario */
test('AT-09 the "adopted" row cannot be written after the journal got the line: the line is not written twice, now or after a restart, and the restart adds the missing row', async (t) => {
  const guasto = { openSync: (p, f) => { if (String(p).endsWith('.attesa')) throw Object.assign(new Error('disk full (injected by the test)'), { code: 'ENOSPC' }); return openSync(p, f); } };
  const c = await caso(t, { quante: 2, riavvioPrima: true, extraDopo: { adottaRigheInAttesaFn: (a) => adottaRigheInAttesaSync(a, guasto) } });
  assert.deepEqual(c.tardiviSulDisco, [1, 1], 'written once each');
  assert.equal(c.adottateDopo, 0, 'the "adopted" rows could not be written');
  assert.equal(c.inAttesaDopo, 0, 'the lines are in the journal: nothing waits in memory');
  assert.deepEqual(c.tardiviSulDiscoDopoRiavvio, [1, 1], 'the restart finds them in the journal and does not write them again');
  assert.equal(c.inAttesaDopoIlRiavvio, 0, 'nothing waiting after the restart');
  assert.equal(c.inAttesaSubitoDopoIlRiavvio, 0, 'right after the restart, before any retry, the lines in the journal are not waiting again');
});

/* come AT-09, e la riga «adottata» non si scrive nemmeno al riavvio (disco pieno anche lì): il diario è l'unica prova, e basta */
test('AT-09b the "adopted" row can never be written, not even at the restart: the line found in the journal is never written again', async (t) => {
  const guasto = { openSync: (p, f) => { if (String(p).endsWith('.attesa')) throw Object.assign(new Error('disk full (injected by the test)'), { code: 'ENOSPC' }); return openSync(p, f); } };
  const pieno = () => { throw Object.assign(new Error('disk full (injected by the test)'), { code: 'ENOSPC' }); };
  const c = await caso(t, { quante: 2, riavvioPrima: true, extraDopo: { adottaRigheInAttesaFn: (a) => adottaRigheInAttesaSync(a, guasto) },
    extraFinale: { aggiungiAllAttesaFn: pieno, adottaRigheInAttesaFn: (a) => adottaRigheInAttesaSync(a, guasto) } });
  assert.deepEqual(c.tardiviSulDisco, [1, 1], 'written once each');
  assert.equal(c.adottateDopo, 0, 'the "adopted" rows could not be written');
  assert.deepEqual(c.tardiviSulDiscoDopoRiavvio, [1, 1], 'after the restart, with no "adopted" row at all, each line is still once in the journal');
  assert.equal(c.inAttesaSubitoDopoIlRiavvio, 0, 'and it is not waiting again');
  assert.equal(c.numeriDoppiDopo, 0, 'no number twice after the restart');
});

/* un TALOS di prima (senza affitto) scrive proprio fra il riallineamento e l'adozione: il recinto rifiuta, la chat si rilegge e
   l'adozione riprova sopra la sua riga; senza il recinto la riga in attesa prenderebbe un numero che il disco ha già */
const scriveSenzaAffittoPrimaDellAdozione = () => {
  let fatto = false;
  return (argomenti, deps) => {
    if (!fatto) { fatto = true; scriveAltrove(argomenti.cartellaStore, argomenti.sessionId, ['senza-affitto-1']); }
    return adottaRigheInAttesaSync(argomenti, deps);
  };
};
for (const [nome, opzioni] of [['AT-18', { quante: 1, extra: { adottaRigheInAttesaFn: scriveSenzaAffittoPrimaDellAdozione() } }], ['AT-18b', { quante: 2, riavvioPrima: true, extraDopo: { adottaRigheInAttesaFn: scriveSenzaAffittoPrimaDellAdozione() } }]]) {
  test(`${nome} an older TALOS (no lease) writes right before the adoption${opzioni.riavvioPrima ? ', after a restart' : ''}: the fence refuses, the chat is read again and the waiting lines go above its line, once, no number twice`, async (t) => {
    const c = await caso(t, opzioni);
    assert.deepEqual(c.tardiviSulDisco, c.tardiviSulDisco.map(() => 1), 'each waiting line is adopted once');
    assert.equal(c.numeriDoppiSulDisco, 0, 'no number twice on the disk');
    assert.equal(c.numeriDoppiDopo, 0, 'no number twice after the restart');
    assert.equal(c.senzaAffittoDopo, 1, 'the line of the older TALOS is there after the restart');
    assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
    assert.deepEqual(c.cliNascoste, [], 'the CLI hides nothing');
  });
}

/* il disco con la cache anche per l'adozione vera del registro: un «adottata» sul disco senza la riga nel diario la perderebbe per sempre */
test('AT-07b (registry, simulated power cut at the adoption) the adopted lines are in the journal before their "adopted" rows: never "adopted" and missing', async (t) => {
  const disco = discoConCache();
  const c = await caso(t, { quante: 2, riavvioPrima: true, extraDopo: { adottaRigheInAttesaFn: (a) => adottaRigheInAttesaSync(a, disco) } });
  assert.deepEqual(c.tardiviSulDisco, [1, 1], 'the journal has both lines after the power cut');
  assert.equal(c.adottateDopo, 2, 'two "adopted" rows');
  assert.deepEqual(c.tardiviSulDiscoDopoRiavvio, [1, 1], 'after a restart both lines are there, once each');
});

test('AT-10 adopting the same waiting lines twice writes them once (the waiting file says "adopted") (unit)', () => {
  const store = mkdtempSync(join(tmpdir(), 'at10-'));
  const id = 'a10a10a1-0000-4000-8000-000000000010';
  writeFileSync(giornale(store, id), `${JSON.stringify({ type: 'RunStarted', runId: 'r1', _sequenza: 1 })}\n`);
  aggiungiAllAttesaSync(store, id, [{ tipo: 'attesa', id: 'x1', record: { type: 'CUSTOM', name: 'talos.tardivo', value: { id: 'x1' } } }]);
  let n = 1;
  const prepara = (ids) => ids.map((x) => ({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: x }, _sequenza: (n += 1), _attesa: x }));
  const primo = adottaRigheInAttesaSync({ cartellaStore: store, sessionId: id, ids: ['x1'], prepara });
  const secondo = adottaRigheInAttesaSync({ cartellaStore: store, sessionId: id, ids: ['x1'], prepara });
  assert.deepEqual(primo.scritte, ['x1']);
  assert.deepEqual(secondo.scritte, [], 'the second adoption writes nothing');
  assert.deepEqual(secondo.gia, ['x1']);
  assert.equal(righe(store, id).filter((r) => r._attesa === 'x1').length, 1, 'once in the journal');
});

test('AT-11 a line another process already adopted (its "adopted" row is in the file) is not written again here (unit)', () => {
  const store = mkdtempSync(join(tmpdir(), 'at11-'));
  const id = 'a11a11a1-0000-4000-8000-000000000011';
  writeFileSync(giornale(store, id), `${JSON.stringify({ type: 'RunStarted', runId: 'r1', _sequenza: 1 })}\n${JSON.stringify({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: 'y1' }, _sequenza: 2, _attesa: 'y1' })}\n`);
  aggiungiAllAttesaSync(store, id, [{ tipo: 'attesa', id: 'y1', record: { type: 'CUSTOM' } }, { tipo: 'adottata', id: 'y1' }, { tipo: 'attesa', id: 'y2', record: { type: 'CUSTOM' } }]);
  const esito = adottaRigheInAttesaSync({ cartellaStore: store, sessionId: id, ids: ['y1', 'y2'], prepara: (ids) => ids.map((x, i) => ({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: x }, _sequenza: 3 + i, _attesa: x })) });
  assert.deepEqual(esito.gia, ['y1']);
  assert.deepEqual(esito.scritte, ['y2']);
  assert.equal(righe(store, id).filter((r) => r._attesa === 'y1').length, 1, 'y1 once');
  assert.equal(righe(store, id).filter((r) => r._attesa === 'y2').length, 1, 'y2 once');
});

/* la strada di prima: la scrittura rifiutata per l'affitto DOPO il numero (l'affitto perso mentre la riga era in coda) */
function rifiutoDopoIlNumero(nome, quante = 1) {
  const stato = { rifiuti: 0 };
  const fn = async (argomenti, ...resto) => {
    if (argomenti?.record?.name === nome && stato.rifiuti < quante) { stato.rifiuti += 1; throw Object.assign(new Error('leased (injected by the test)'), { code: 'SESSION_LEASED' }); }
    return registraRiga(argomenti, ...resto);
  };
  return { stato, fn };
}

async function rifiutataDopo(t, { durevole, quante = 1, altroScriveDopo = false }) {
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const erroreOriginale = console.error; console.error = () => {}; t.after(() => { console.error = erroreOriginale; });
  const store = mkdtempSync(join(tmpdir(), 'at12-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'at12l-'));
  attivaAffittiArchivio(store, { etichetta: 'at', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const nome = durevole ? 'talos.journal-riparato' : 'talos.tardivo';
  const rifiuto = rifiutoDopoIlNumero(nome, quante);
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [] };
  const registro = registroDi(store, stato, { registraRigaFn: rifiuto.fn });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
  const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const consegne = new Map();
  registro.iscriviti(id, (e) => { if (Number.isSafeInteger(e?._sequenza)) consegne.set(chiave(e), (consegne.get(chiave(e)) ?? 0) + 1); }, 0);
  stato.sessionId = id;
  await giro1;
  await registro.attendiAssestamento(id);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  const consegnate = () => [...consegne].filter(([c]) => c.includes(`|${nome}|`)).reduce((n, [, k]) => n + k, 0);
  if (durevole) {
    /* l'altro scrive; la riga dopo lo trova e lo adotta: l'avviso «un altro TALOS ha scritto qui» è una scrittura DUREVOLE */
    affittiDellArchivio(store).rilascia(id);
    scriveAltrove(store, id, ['altro-1']);
    await stato.onEvento({ type: 'CUSTOM', name: 'talos.dopo', value: { id: 'dopo' } });
  } else {
    for (let k = 1; k <= quante; k += 1) await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: `tardivo-${k}` } });
  }
  /* (altroScriveDopo) l'altro scrive ancora dopo il rifiuto, prima dell'adozione: la riga si adotta sopra le sue righe */
  if (altroScriveDopo) scriveAltrove(store, id, ['altro-2', 'altro-3']);
  for (let i = 0; i < 100 && (rifiuto.stato.rifiuti < quante || inAttesa(registro, id) > 0); i += 1) await pausa(20);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  await pausa(100);
  const scritte = righe(store, id).filter((r) => r.name === nome);
  const memoria = (registro.esporta(id)?.eventi ?? []).filter((e) => e.name === nome);
  await registro.chiudi({ attesaMassimaMs: 1000 });
  const nuovo = registroDi(store, null);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  /* SUBITO dopo il ripristino, prima di ogni ritento: una riga già adottata non torna in attesa, e chi apre la chat non vede note */
  const inAttesaDopoRiavvio = inAttesa(nuovo, id);
  let noteDopoRiavvio = 0;
  const via = nuovo.iscriviti(id, (e) => { if (chiaveNota(e) === NOTA_ATTESA) noteDopoRiavvio += 1; }, 0);
  if (typeof via === 'function') via();
  await pausa(150);
  const numeriDopo = (nuovo.esporta(id)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza)).map((e) => e._sequenza);
  const conti = { durevole, quante, altroScriveDopo, rifiuti: rifiuto.stato.rifiuti, sulDisco: scritte.length, conAttesa: scritte.filter((r) => typeof r._attesa === 'string').length, inMemoria: memoria.length,
    inAttesaDopoRiavvio, noteDopoRiavvio, doppiDopoRiavvio: numeriDopo.length - new Set(numeriDopo).size, dalVivo: consegnate(),
    dopoRiavvio: (nuovo.esporta(id)?.eventi ?? []).filter((e) => e.name === nome).length, sulDiscoDopo: righe(store, id).filter((r) => r.name === nome).length, adottate: contaTipo(righeAttesa(store, id), 'adottata') };
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

test('AT-12 a line refused for the lease AFTER it got its number (plain write) waits on the disk and is adopted, never lost, never twice', async (t) => {
  const c = await rifiutataDopo(t, { durevole: false });
  assert.equal(c.rifiuti, 1, 'the write was refused once');
  assert.equal(c.sulDisco, 1, 'adopted at the end, once');
  assert.equal(c.conAttesa, 1, 'from the waiting file');
  assert.equal(c.inMemoria, 1, 'once in memory');
  assert.equal(c.adottate, 1, 'one "adopted" row');
  assert.equal(c.sulDiscoDopo, 1, 'a restart writes nothing again');
  assert.equal(c.dalVivo, 1, 'who listens saw it once, with its old number: the adoption does not send it again');
  assert.equal(c.inAttesaDopoRiavvio, 0, 'right after a restart the line already adopted is not waiting again');
  assert.equal(c.noteDopoRiavvio, 0, 'and who opens the chat sees no waiting note for it');
});

test('AT-12b two plain lines refused for the lease AFTER their numbers, and the other writes again before the adoption: both wait and are adopted above its lines, once each', async (t) => {
  const c = await rifiutataDopo(t, { durevole: false, quante: 2, altroScriveDopo: true });
  assert.equal(c.rifiuti, 2, 'both writes were refused');
  assert.equal(c.sulDisco, 2, 'both adopted at the end, once each');
  assert.equal(c.conAttesa, 2, 'from the waiting file');
  assert.equal(c.inMemoria, 2, 'once each in memory');
  assert.equal(c.adottate, 2, 'two "adopted" rows');
  assert.equal(c.sulDiscoDopo, 2, 'a restart writes nothing again');
  assert.equal(c.dalVivo, 2, 'who listens saw each once, with its old number: the adoption does not send them again');
  assert.equal(c.doppiDopoRiavvio, 0, 'no number twice after the restart');
  assert.equal(c.inAttesaDopoRiavvio, 0, 'right after a restart the lines already adopted are not waiting again');
  assert.equal(c.noteDopoRiavvio, 0, 'and who opens the chat sees no waiting note for them');
});

test('AT-13 a durable line refused for the lease AFTER it got its number waits on the disk and is adopted, never lost, never twice', async (t) => {
  const c = await rifiutataDopo(t, { durevole: true });
  assert.equal(c.rifiuti, 1, 'the durable write was refused once');
  assert.equal(c.sulDisco, 1, 'adopted at the end, once');
  assert.equal(c.conAttesa, 1, 'from the waiting file');
  assert.equal(c.inMemoria, 1, 'once in memory');
  assert.equal(c.sulDiscoDopo, 1, 'a restart writes nothing again');
  assert.equal(c.dalVivo, 1, 'who listens saw it once, with its old number: the adoption does not send it again');
  assert.equal(c.inAttesaDopoRiavvio, 0, 'right after a restart the line already adopted is not waiting again');
  assert.equal(c.noteDopoRiavvio, 0, 'and who opens the chat sees no waiting note for it');
});

test('AT-13b as AT-13, and the other writes again before the adoption: the durable line is adopted above its lines, once', async (t) => {
  const c = await rifiutataDopo(t, { durevole: true, altroScriveDopo: true });
  assert.equal(c.rifiuti, 1, 'the durable write was refused once');
  assert.equal(c.sulDisco, 1, 'adopted at the end, once');
  assert.equal(c.conAttesa, 1, 'from the waiting file');
  assert.equal(c.inMemoria, 1, 'once in memory');
  assert.equal(c.adottate, 1, 'one "adopted" row');
  assert.equal(c.sulDiscoDopo, 1, 'a restart writes nothing again');
  assert.equal(c.dalVivo, 1, 'who listens saw it once, with its old number: the adoption does not send it again');
  assert.equal(c.doppiDopoRiavvio, 0, 'no number twice after the restart');
  assert.equal(c.inAttesaDopoRiavvio, 0, 'right after a restart the line already adopted is not waiting again');
});

test('AT-14 who opens the chat while a line is waiting sees its note; after the adoption no waiting note', async (t) => {
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const store = mkdtempSync(join(tmpdir(), 'at14-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'at14l-'));
  attivaAffittiArchivio(store, { etichetta: 'at', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [] };
  const registro = registroDi(store, stato);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
  const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  stato.sessionId = id;
  await giro1;
  await registro.attendiAssestamento(id);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  affittiDellArchivio(store).rilascia(id);
  affittoDellAltro(store, id, process.pid);
  await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: 't1' } });
  await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: 't2' } });
  const conta = () => { let n = 0; const via = registro.iscriviti(id, (e) => { if (chiaveNota(e) === NOTA_ATTESA) n += 1; }, 0); via(); return n; };
  const primaDellAdozione = conta();
  affittoDellAltro(store, id, pidMorto());
  for (let i = 0; i < 100 && inAttesa(registro, id) > 0; i += 1) await pausa(20);
  const dopoLAdozione = conta();
  assert.equal(primaDellAdozione, 2, 'a new listener gets one waiting note per waiting line');
  assert.equal(dopoLAdozione, 0, 'no waiting note once adopted');
});

test('AT-15 deleting the chat removes its waiting file with it (and only then)', async () => {
  const store = mkdtempSync(join(tmpdir(), 'at15-'));
  const id = 'a15a15a1-0000-4000-8000-000000000015';
  writeFileSync(giornale(store, id), `${JSON.stringify({ type: 'RunStarted', runId: 'r1', _sequenza: 1 })}\n`);
  aggiungiAllAttesaSync(store, id, [{ tipo: 'attesa', id: 'z', record: { type: 'CUSTOM' } }]);
  assert.equal(existsSync(percorsoAttesa(store, id)), true);
  await eliminaSessionePersistita({ cartellaStore: store, sessionId: id });
  assert.equal(existsSync(percorsoAttesa(store, id)), false, 'the waiting file goes with the chat');
  assert.equal(existsSync(giornale(store, id)), false);
});

/* un avviso di fine (RunFinished, RunError) su una chat senza giro aperto, mentre l'altro la tiene: si mostra senza numero e non si scrive
   (nessuna riga in attesa per lui: non è storia della chat, è lo stato di un giro già chiuso) */
for (const [nome, evento] of [['AT-19', { type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } }], ['AT-19b', { type: 'RunError', runId: 'r1', code: 'X', message: 'late end (test)' }]]) {
  test(`${nome} a late ${evento.type} on a chat with no open turn, while the other TALOS holds it: shown once without a number, not written, nothing waits for it`, async (t) => {
    const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
    const store = mkdtempSync(join(tmpdir(), 'at19-'));
    const lavoro = mkdtempSync(join(tmpdir(), 'at19l-'));
    attivaAffittiArchivio(store, { etichetta: 'at', battitoMs: 0, rilascioDopoMs: 0 });
    t.after(() => disattivaAffittiArchivio(store));
    const stato = { sessionId: null, onEvento: null, giri: 0, fine: [] };
    const registro = registroDi(store, stato);
    t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
    const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
    const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
    const visti = [];
    registro.iscriviti(id, (e) => { if (e?.type === evento.type && (e.message === evento.message || e.result?.detto === 'Fatto.')) visti.push(e._sequenza ?? null); if (chiaveNota(e) === NOTA_ATTESA) visti.push('nota'); }, 0);
    stato.sessionId = id;
    await giro1;
    await registro.attendiAssestamento(id);
    await attendiScritture({ cartellaStore: store, sessionId: id });
    const primaDelTardivo = visti.length;
    const sulDiscoPrima = righe(store, id).filter((r) => r.type === evento.type).length;
    affittiDellArchivio(store).rilascia(id);
    affittoDellAltro(store, id, process.pid);
    await stato.onEvento({ ...evento });
    await pausa(50);
    affittoDellAltro(store, id, pidMorto());
    await pausa(250); // qualche ritento: niente da adottare
    await attendiScritture({ cartellaStore: store, sessionId: id });
    const dopo = visti.slice(primaDelTardivo);
    t.diagnostic(`CONTI ${JSON.stringify({ dopo, sulDiscoPrima, sulDisco: righe(store, id).filter((r) => r.type === evento.type).length, file: existsSync(percorsoAttesa(store, id)), inAttesa: inAttesa(registro, id) })}`);
    assert.deepEqual(dopo, [null], 'shown once, without a number, and no waiting note');
    assert.equal(righe(store, id).filter((r) => r.type === evento.type).length, sulDiscoPrima, 'not written to the journal, not now and not later');
    assert.equal(existsSync(percorsoAttesa(store, id)), false, 'no waiting file for it');
    assert.equal(inAttesa(registro, id), 0, 'nothing waits');
  });
}

test('AT-15b deleting a chat with a line waiting (from the registry, as the window does): the waiting file goes with it, and after a restart nothing comes back', async (t) => {
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const store = mkdtempSync(join(tmpdir(), 'at15b-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'at15bl-'));
  attivaAffittiArchivio(store, { etichetta: 'at', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [] };
  const registro = registroDi(store, stato);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
  const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  stato.sessionId = id;
  await giro1;
  await registro.attendiAssestamento(id);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  affittiDellArchivio(store).rilascia(id);
  affittoDellAltro(store, id, process.pid);
  await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: 't1' } });
  const primaFile = existsSync(percorsoAttesa(store, id));
  affittoDellAltro(store, id, pidMorto()); // la chat si libera: la cancellazione la può prendere
  const esito = await registro.elimina(id);
  await pausa(150);
  const dopoFile = existsSync(percorsoAttesa(store, id));
  const nuovo = registroDi(store, null);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  t.diagnostic(`CONTI ${JSON.stringify({ primaFile, esito: esito?.ok ?? esito?.errore ?? null, dopoFile, giornale: existsSync(giornale(store, id)), inAttesa: inAttesa(nuovo, id) })}`);
  assert.equal(primaFile, true, 'the line was waiting in its file');
  assert.equal(dopoFile, false, 'the waiting file goes with the chat');
  assert.equal(existsSync(giornale(store, id)), false, 'the chat is gone');
  assert.equal(inAttesa(nuovo, id), 0, 'after a restart nothing of the deleted chat waits');
});

/* PROCESSI VERI: un arresto brusco (SIGKILL) con righe in attesa, poi due processi che si liberano insieme */
function figlio(args, ms = 30_000) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [FIGLIO, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const tetto = setTimeout(() => p.kill(), ms);
    p.on('exit', (codice, segnale) => { clearTimeout(tetto); ok({ codice, segnale, out, err: err.slice(-400) }); });
  });
}

async function arrestoBrusco(t, quante) {
  const store = mkdtempSync(join(tmpdir(), 'atk-'));
  const r = await figlio(['rifiuta', store, String(quante), String(process.pid)]);
  const riga = r.out.split('\n').find((l) => l.startsWith('PRONTO '));
  assert.ok(riga, `the child reached the refusal (${r.err})`);
  const { sessionId, inAttesa } = JSON.parse(riga.slice(7));
  assert.equal(inAttesa, quante, 'the child had the lines waiting');
  assert.notEqual(r.codice, 0, 'the child was killed, not closed');
  return { store, sessionId };
}

test('AT-16 (real process) a process is killed with lines waiting; at the restart, with the chat free, they are adopted in order, once', async (t) => {
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const { store, sessionId: id } = await arrestoBrusco(t, 3);
  assert.equal(contaTipo(righeAttesa(store, id), 'attesa'), 3, 'three waiting rows survived the kill');
  assert.equal(righe(store, id).filter((r) => r.name === 'talos.tardivo').length, 0, 'not in the journal yet');
  affittoDellAltro(store, id, pidMorto());
  attivaAffittiArchivio(store, { etichetta: 'at', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const registro = registroDi(store, null);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  await registro.ripristina();
  for (let i = 0; i < 150 && inAttesa(registro, id) > 0; i += 1) await pausa(20);
  await attendiScritture({ cartellaStore: store, sessionId: id });
  const tardivi = righe(store, id).filter((r) => r.name === 'talos.tardivo');
  assert.deepEqual(tardivi.map((r) => r.value.id), ['tardivo-1', 'tardivo-2', 'tardivo-3'], 'in order, once each');
  assert.ok(tardivi.every((r, i) => i === 0 || r._sequenza > tardivi[i - 1]._sequenza), 'increasing numbers');
  assert.equal(contaTipo(righeAttesa(store, id), 'adottata'), 3, 'three "adopted" rows');
  assert.equal(contaTipo(righeAttesa(store, id), 'attesa'), 3, 'the waiting rows are still there');
  await registro.chiudi({ attesaMassimaMs: 1000 });
  const nuovo = registroDi(store, null);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  await pausa(150);
  assert.equal(righe(store, id).filter((r) => r.name === 'talos.tardivo').length, 3, 'a second restart writes nothing again');
});

test('AT-17 (real processes) two processes find the same waiting lines and the chat free at the same moment: each line is written once', async (t) => {
  const { store, sessionId: id } = await arrestoBrusco(t, 2);
  affittoDellAltro(store, id, pidMorto());
  const [a, b] = await Promise.all([figlio(['adotta', store, id, '6000']), figlio(['adotta', store, id, '6000'])]);
  const esiti = [a, b].map((r) => { const riga = r.out.split('\n').find((l) => l.startsWith('ESITO ')); return riga ? JSON.parse(riga.slice(6)) : { errore: r.err }; });
  t.diagnostic(`ESITI ${JSON.stringify(esiti)}`);
  const tardivi = righe(store, id).filter((r) => r.name === 'talos.tardivo');
  assert.deepEqual(tardivi.map((r) => r.value.id).sort(), ['tardivo-1', 'tardivo-2'], 'each line once in the journal');
  const numeri = righe(store, id).map((r) => r._sequenza).filter(Number.isSafeInteger);
  assert.equal(numeri.filter((n, i) => numeri.indexOf(n) !== i).length, 0, 'no number twice');
  assert.deepEqual(esiti.map((e) => e.restano), [0, 0], 'neither process keeps them waiting');
  for (const e of esiti) {
    const ids = (e.consegnate ?? []).map((x) => x.split(':')[0]);
    assert.equal(ids.filter((x, i) => ids.indexOf(x) !== i).length, 0, `who listens in each process sees each line at most once (${e.consegnate})`);
  }
});
