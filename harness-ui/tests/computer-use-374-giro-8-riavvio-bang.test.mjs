/*
 * ⛔ Decisione 374, giro 8 (giudice v1618), D1 del revisore B del giro 7 (`RAPPORTO-REVISORE-B-CU-374-GIRO-7`, prova sua ripresa qui):
 *   dopo un riavvio, un «!» della persona rimasto in sottofondo (dopo 120 s o dalla scheda Processi) veniva ripreso dagli orfani e
 *   rimesso «in corso» per il custode come un comando del modello (`adottaSfondiOrfani`): un cambio in Accesso pieno di un'altra
 *   conversazione finiva da parte (RIMESSO, 1 copia, avviso a B), contro la R2 del giro 7 («il «!» non conta mai»).
 * Cura: l'impronta sul giornale dice se il processo era del modello (`delModello`, preso dalla registrazione col custode); dopo il
 *   riavvio torna «in corso» solo chi ha `delModello: true`. Un'impronta senza il segno (giornale di prima, o la 0.2.1, che non aveva
 *   nessun custode) non tiene nessuno. Il giornale qui è scritto come lo scrive il server; il riavvio passa dall'adozione degli orfani
 *   (`processiOspite` finto): nessun processo vero, nessun file fuori dalle cartelle temporanee.
 * Concorrenti: hermes-agent tools/process_registry.py:2434 (`has_active_processes`: un compito è occupato finché un suo processo vive);
 *   codex unified_exec/process_manager.rs:1843 (`list_processes`: solo i processi non usciti).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry, EVENTO_SFONDO_IMPRONTA } from '../src/session-registry.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import * as cm from '../src/computer-use/file-approvati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { creaCustodeFileComputerUse, EVENTO_FILE_COMPUTER_USE_RIPRISTINATI: EVENTO } = cm;
const APPROVATA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ACCESA = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[{"tipo":"dominio","nome":"example.com","quando":"2026-11-07T10:00:00.000Z"}]}\n';
const LUOGHI_ESTRANEI = '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe","quando":"2026-11-08T10:00:00.000Z"}]}\n';
const IMP = '.computer-use-impostazione.json';
const LUO = '.computer-use-luoghi.json';
const SFONDO = 'IN BACKGROUND: started in the background on request.';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const muto = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
const mutoSinc = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
/** Aspetta che la condizione diventi vera; se non succede la prova è ROSSA. */
async function finche(cond, messaggio = 'la condizione attesa non è arrivata') { for (let i = 0; i < 200 && !cond(); i += 1) await pausa(5); assert.ok(cond(), messaggio); }

async function banco() {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g6-'));
  const fi = join(cartella, IMP);
  const fl = join(cartella, LUO);
  const pk = creaAdattatorePortachiaviInMemoria();
  const nuovo = () => mutoSinc(() => creaCustodeFileComputerUse({ file: [fi, fl], portachiavi: pk }));
  const custode = nuovo();
  await muto(async () => { await custode.scrivi(fi, APPROVATA); await custode.scrivi(fl, LUOGHI); });
  const copie = () => readdirSync(cartella).filter((f) => f.includes('.changed-')).length;
  return { cartella, fi, fl, pk, custode, nuovo, copie, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

/* ——— A1 (P3): dopo un riavvio il processo in sottofondo di B è ancora vivo (adottato), e scrive durante A in Accesso pieno ——— */

const SESSIONE_B = 'b6b6b6b6-2222-4222-8222-b6b6b6b6b6b6';
function giornaleDiB(store, cartella, permessi, marca = undefined) {
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId: SESSIONE_B, taskId: 'libero:b', cartella, task: { consegna: 'b', consegnaCorta: 'b' },
      comandoProva: null, forkDa: null, avviataAlle: '2026-11-12T08:00:00.000Z', modello: 'm', modelloPlanner: null, reasoning: 'medium',
      mobile: false, permessi, permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null,
      modelId: 'm', fallbackConsent: false, cartellaGiaScelta: true },
    evento('RunStarted', { threadId: SESSIONE_B, runId: 'r1' }),
    evento('ComandoUtenteIniziato', { comandoId: 'c1', comando: 'node scrittore.mjs' }),
    evento('ToolCallStart', { toolCallId: 'bg1', toolCallName: 'shell' }),
    evento('ToolCallArgs', { toolCallId: 'bg1', delta: JSON.stringify({ comando: 'node scrittore.mjs' }) }),
    evento('ToolCallResult', { toolCallId: 'bg1', content: SFONDO, inSfondo: true }),
    evento('CUSTOM', { name: EVENTO_SFONDO_IMPRONTA, value: { toolCallId: 'bg1', pid: 4242, gruppo: 4242, impronta: 'proc:boot:777', ospite: { pid: 111, impronta: 'proc:boot:5' }, ...(marca === undefined ? {} : { delModello: marca }) } }),
    evento('RunFinished', { threadId: SESSIONE_B, runId: 'r1', result: { detto: 'fatto' } }),
  ];
  writeFileSync(join(store, `${SESSIONE_B}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

async function riavvio(permessiDiB, passi, { lento = false, marca = undefined } = {}) {
  const b = await banco();
  const store = mkdtempSync(join(tmpdir(), 'talos-374g6-store-'));
  giornaleDiB(store, b.cartella, permessiDiB, marca);
  const vivi = new Map([[4242, true]]);
  const impronte = new Map([[4242, { impronta: 'proc:boot:777', gruppo: 4242 }], [900, { impronta: 'proc:boot:9', gruppo: 900 }]]);
  const ospite = {
    piattaforma: 'linux', pidOspite: 900, ogniMs: 10, graziaMs: 50, attendi: (ms) => pausa(Math.min(ms, 5)),
    leggiImpronte: async (pids) => { if (lento) await pausa(150); return new Map(pids.map((p) => [p, impronte.get(p) ?? null])); },
    leggiAlbero: async () => null,
    esiste: (pid) => vivi.get(pid) === true,
    gruppoEsiste: (g) => vivi.get(g) === true,
    segnale: () => true,
    fermaAlbero: async () => true,
  };
  const cu2 = b.nuovo(); // il server riparte: un custode nuovo, che non sa niente dei comandi di prima
  await muto(async () => { await cu2.avvia?.(); });
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    cartellaStore: store, guardaWorkspaceFn: () => () => {}, processiOspite: ospite, custodeFileComputerUse: cu2,
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't2', runId: 'r2' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: b.cartella, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }), cartellaEsisteFn: () => true, registraRigaFn: async () => true,
  });
  await muto(async () => { await registro.ripristina(); });
  const adozione = registro.attendiAdozioneSfondi();
  if (!lento) await adozione;
  const eventiB = [];
  registro.iscriviti(SESSIONE_B, (e) => eventiB.push(e));
  const { sessionId } = registro.avvia('task-a', { permessiScelto: 'Full access' });
  const eventiA = [];
  registro.iscriviti(sessionId, (e) => eventiA.push(e));
  await finche(() => input);
  const A = {
    pre: (argomenti = { comando: 'npm test' }) => input.hookFn({ tipo: 'pre_tool_call', azione: 'shell', argomenti, giro: 0 }),
    post: () => input.hookFn({ tipo: 'post_tool_call', azione: 'shell', esito: 'exit 0\n', giro: 0 }),
  };
  const avvisi = (ev) => ev.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO).length;
  try {
    await muto(() => passi({ b, cu2, A, esce: async () => { vivi.set(4242, false); await finche(() => eventiB.some((e) => e.name === 'talos.processo-sfondo'), 'l uscita del ripreso'); await pausa(30); } }));
    const adottati = (await adozione)?.adottati ?? 0;
    return { adottati, approvato: [cu2.testo(b.fi), cu2.testo(b.fl)], disco: [readFileSync(b.fi, 'utf8'), readFileSync(b.fl, 'utf8')], copie: b.copie(),
      avvisiA: avvisi(eventiA), avvisiB: avvisi(eventiB) };
  } finally {
    input?.onEvento({ type: 'RunFinished', threadId: 't2', runId: 'r2' }); risolvi({ ok: true });
    vivi.set(4242, false); await pausa(30);
    b.chiudi(); rimuoviCartellaDiProva(store);
  }
}


test('374 g8 D1 (revisore B del giro 7): dopo un riavvio, un «!» della persona in sottofondo (B su richiesta, impronta senza segno) non tiene B in corso', { timeout: 15_000 }, async () => {
  const r = await riavvio('On request', async ({ b, A, esce }) => {
    await A.pre(); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  });
  
  assert.equal(r.adottati, 1);
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI], 'se il «!» non conta mai, il cambio di A in Accesso pieno deve passare');
});

test('374 g8 D1 (revisore B del giro 7): uscito il «!» ripreso, A in Accesso pieno adotta di nuovo', { timeout: 15_000 }, async () => {
  const r = await riavvio('On request', async ({ b, A, esce }) => {
    await esce();
    await A.pre(); writeFileSync(b.fi, ACCESA); await A.post();
  });
  
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI]);
});

test('374 g8 D1: il giornale scritto dal server per un «!» (delModello: false): dopo il riavvio il «!» non tiene B, il cambio di A passa', { timeout: 15_000 }, async () => {
  const r = await riavvio('On request', async ({ b, A, esce }) => {
    await A.pre(); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  }, { marca: false });
  assert.equal(r.adottati, 1, 'il «!» si riprende lo stesso (Ferma e scheda Processi)');
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI]);
  assert.deepEqual([r.copie, r.avvisiA, r.avvisiB], [0, 0, 0]);
});

test('374 g8 D1 controprova: un comando del modello in sottofondo (delModello: true) dopo il riavvio tiene ancora B (A1, P3)', { timeout: 15_000 }, async () => {
  const r = await riavvio('On request', async ({ b, A, esce }) => {
    await A.pre(); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  }, { marca: true });
  assert.equal(r.adottati, 1);
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'il cambio durante il processo del modello di B non diventa l approvato');
  assert.deepEqual([r.copie, r.avvisiA, r.avvisiB], [1, 0, 1], 'una copia, l avviso solo a B');
});

test('374 g8 D1: il server scrive sull impronta chi ha lanciato il processo rimasto in sottofondo (modello true, «!» false)', { timeout: 15_000 }, async () => {
  const b = await banco();
  const ospite = {
    piattaforma: 'linux', pidOspite: 900, ogniMs: 60_000, graziaMs: 50, attendi: (ms) => pausa(Math.min(ms, 5)),
    leggiImpronte: async (pids) => new Map(pids.map((p) => [p, { impronta: `proc:boot:${p}`, gruppo: p }])),
    leggiAlbero: async (pid) => ({ membri: [{ pid, impronta: `proc:boot:${pid}` }], gruppo: pid, altri: new Map([[900, { impronta: 'proc:boot:9', gruppo: 900 }]]) }),
    esiste: () => true, gruppoEsiste: () => true, segnale: () => true, fermaAlbero: async () => true,
  };
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const diretti = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, processiOspite: ospite, custodeFileComputerUse: b.custode,
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: b.cartella, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    eseguiComandoDirettoFn: (argomenti) => new Promise((esito) => { diretti.push({ argomenti, esito }); }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }), cartellaEsisteFn: () => true, registraRigaFn: async () => true,
  });
  const { sessionId } = registro.avvia('task-b', { permessiScelto: 'On request' });
  registro.iscriviti(sessionId, () => {});
  const impronte = () => (registro.esporta(sessionId)?.eventi ?? []).filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_SFONDO_IMPRONTA)
    .map((e) => [e.value.toolCallId, e.value.delModello]).sort((x, y) => x[0].localeCompare(y[0]));
  const sganci = [];
  try {
    await finche(() => input);
    await muto(async () => {
      /* il comando del modello che resta in sottofondo: registrato dal kernel al lancio, il suo esito «in sottofondo» */
      await input.hookFn({ tipo: 'pre_tool_call', azione: 'shell', argomenti: { comando: 'node scrittore.mjs', background: true }, giro: 0 });
      sganci.push(input.registraComandoFermabile({ toolCallId: 'bg-m', ferma: () => {}, pid: () => 4242 }));
      input.onEvento({ type: 'ToolCallStart', toolCallId: 'bg-m', toolCallName: 'shell' });
      input.onEvento({ type: 'ToolCallResult', toolCallId: 'bg-m', content: SFONDO, inSfondo: true });
      await input.hookFn({ tipo: 'post_tool_call', azione: 'shell', esito: SFONDO, giro: 0 });
      /* il «!» della persona mandato in sottofondo */
      assert.notEqual(registro.shell(sessionId, 'node osserva.mjs')?.ok, false);
      await finche(() => diretti.length === 1, 'l esecutore del «!»');
      sganci.push(diretti[0].argomenti.registraComandoFermabile({ toolCallId: 'bang-1', ferma: () => {}, pid: () => 4343 }));
      diretti[0].argomenti.onEvento({ type: 'ToolCallResult', toolCallId: 'bang-1', content: 'IN BACKGROUND: moved to the background by the person (Processes tab).', inSfondo: true });
      await finche(() => impronte().length === 2, 'le due impronte sul giornale');
    });
    assert.deepEqual(impronte(), [['bang-1', false], ['bg-m', true]]);
  } finally {
    for (const s of sganci) s();
    diretti[0]?.esito({ ok: true, codice: 0, enforcement: 'nessuno', cartellaFinale: null, comando: 'node osserva.mjs', testo: '' });
    input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true });
    await pausa(30);
    b.chiudi();
  }
});
