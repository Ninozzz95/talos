/*
 * ⛔ Decisione 374, giro 6 (giudice v1608, 12/11/2026): A1 ALTO del revisore A sul giro 5 (`revisore-374g5-A.md`, P2 e P3).
 *   Un comando di un'ALTRA conversazione fuori dall'Accesso pieno che resta in sottofondo (lanciato con `background`, passato in
 *   sottofondo dopo 120 s, o dalla scheda Processi) faceva uscire la conversazione dai «comandi in corso» del custode alla fine della
 *   chiamata, mentre il suo processo continuava a scrivere: la fine di un comando in Accesso pieno adottava quel cambio (P2), e dopo
 *   un riavvio uguale (P3). Sul giro 3 (8f517f448) P2 e P3 davano RIMESSO con 1 copia.
 * Qui il «processo» è registrato come lo registra il kernel (`registraComandoFermabile` alla partenza, sganciato alla sua uscita vera:
 *   talosHarness.mjs, `p.uscita.finally(() => fermabile.sgancia())`), e il riavvio passa dall'adozione degli orfani (`processiOspite`
 *   finto): nessun processo vero, nessun file fuori dalle cartelle temporanee.
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
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

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

/**
 * Una conversazione vera del registro. `sfondo` fa ciò che fa il kernel per un comando che resta in sottofondo: `pre`, registra il
 * processo (`registraComandoFermabile`), `post` con l'esito «IN BACKGROUND»; il processo resta vivo finché non si chiama `esce()`.
 */
function sessione(custode, permessiScelto = 'On request') {
  let input = null;
  let risolvi;
  let chiusa = false;
  let n = 0;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: tmpdir(), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }), custodeFileComputerUse: custode, registraRigaFn: async () => true,
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  const s = {
    async pre(azione, argomenti = azione === 'shell' ? { comando: 'git status' } : {}) {
      const prima = ricevuti.length;
      const p = input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 });
      await pausa(5);
      const carta = ricevuti.slice(prima).find((e) => e.type === 'ApprovalRequested');
      if (carta) registro.rispondiApprovazione(sessionId, carta.requestId, true);
      return p;
    },
    post: (azione = 'shell', esito = 'exit 0\n') => input.hookFn({ tipo: 'post_tool_call', azione, esito, giro: 0 }),
    /** Un comando che resta in sottofondo: ritorna `esce()`, l'uscita vera del suo processo (lo sgancio del kernel). */
    async sfondo(azione = 'shell', argomenti = { comando: 'node scrittore.mjs', background: true }) {
      await s.pre(azione, argomenti);
      n += 1;
      const sgancia = input.registraComandoFermabile({ toolCallId: `bg-${n}`, ferma: () => {}, pid: () => null });
      await s.post(azione, SFONDO);
      return async () => { sgancia(); await pausa(30); };
    },
    livello: (permessi) => registro.aggiornaImpostazioni(sessionId, { permessi }),
    carte: () => ricevuti.filter((e) => e.type === 'ApprovalRequested').length,
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO).length,
    chiudi: () => { if (chiusa) return; chiusa = true; input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
  return s;
}

async function incrocio(livelloB, passi) {
  const b = await banco();
  const B = sessione(b.custode, livelloB);
  const A = sessione(b.custode, 'Full access');
  try {
    await muto(() => passi(b, A, B));
    return { A, B, copie: b.copie(), approvato: [b.custode.testo(b.fi), b.custode.testo(b.fl)],
      riavvio: mutoSinc(() => { const r = b.nuovo(); return [r.testo(b.fi), r.testo(b.fl)]; }), disco: [readFileSync(b.fi, 'utf8'), readFileSync(b.fl, 'utf8')] };
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
}

/* ——— A1 (P2): il processo in sottofondo di B scrive durante il comando di A in Accesso pieno ——— */

for (const [nome, azione, argomenti] of [
  ['lanciato con background', 'shell', { comando: 'node scrittore.mjs', background: true }],
  ['passato in sottofondo dopo 120 s o dalla scheda Processi', 'shell', { comando: 'node scrittore.mjs' }],
  ['una prova lasciata in sottofondo', 'prova', {}],
]) {
  test(`374 g6 A1 (P2) B su richiesta, comando ${nome}: il suo processo scrive durante A in Accesso pieno ⇒ RIMESSO, 1 copia, avviso a B`, { timeout: 10_000 }, async () => {
    const r = await incrocio('On request', async (b, A, B) => {
      const esce = await B.sfondo(azione, argomenti);
      await A.pre('shell', { comando: 'npm test' }); writeFileSync(b.fi, ACCESA); await A.post();
      await esce();
    });
    assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'il cambio del processo di B non diventa l approvato');
    assert.deepEqual(r.riavvio, [APPROVATA, LUOGHI], 'nemmeno dopo il riavvio');
    assert.deepEqual(r.disco, [APPROVATA, LUOGHI], 'rimesso sul disco');
    assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi(), r.A.carte() + r.B.carte()], [1, 0, 1, 0], 'una copia, l avviso solo a B, nessuna carta');
  });
}

test('374 g6 A1 (P2) il processo di B esce: da lì A in Accesso pieno adotta di nuovo (decisione 390), 0 avvisi e 0 copie in più', { timeout: 10_000 }, async () => {
  const r = await incrocio('On request', async (b, A, B) => {
    const esce = await B.sfondo();
    await esce();
    await A.pre('shell', { comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post();
  });
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI], 'con B uscito il cambio di A è di A');
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [0, 0, 0]);
});

test('374 g6 A1 (P2) il processo di B scrive ed ESCE durante il comando di A: la sua uscita rimette, l avviso va a B, A non adotta', { timeout: 10_000 }, async () => {
  const r = await incrocio('On request', async (b, A, B) => {
    const esce = await B.sfondo();
    await A.pre('shell', { comando: 'npm test' }); writeFileSync(b.fl, LUOGHI_ESTRANEI); await esce(); await A.post();
  });
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'cmd.exe non entra fra i luoghi approvati');
  assert.deepEqual(r.disco, [APPROVATA, LUOGHI]);
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [1, 0, 1]);
});

test('374 g6 A1 (P2) mentre il processo di B vive, B usa altri attrezzi e un comando breve: B resta «in corso» per il custode', { timeout: 10_000 }, async () => {
  const r = await incrocio('On request', async (b, A, B) => {
    const esce = await B.sfondo();
    await B.pre('leggi', { percorso: 'x.txt' }); await B.post('leggi', 'testo');
    await B.pre('shell', { comando: 'git status' }); await B.post();
    await A.pre('shell', { comando: 'npm test' }); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  });
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI]);
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [1, 0, 1]);
});

test('374 g6 A1 (P2) mentre il processo di B vive, B usa solo un attrezzo che non lancia processi: B resta «in corso»', { timeout: 10_000 }, async () => {
  const r = await incrocio('On request', async (b, A, B) => {
    const esce = await B.sfondo();
    await B.pre('leggi', { percorso: 'x.txt' }); await B.post('leggi', 'testo');
    await A.pre('shell', { comando: 'npm test' }); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  });
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'il passo dopo di B non lo toglie dai comandi in corso');
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [1, 0, 1]);
});

test('374 g6 A1 (P2) il processo di B esce mentre C ha un comando: il cambio rimesso all uscita si dice a B (suo) e a C', { timeout: 10_000 }, async () => {
  const b = await banco();
  const B = sessione(b.custode, 'On request');
  const C = sessione(b.custode, 'On request');
  try {
    await muto(async () => {
      const esce = await B.sfondo();
      await C.pre('shell', { comando: 'node lungo.mjs' });
      writeFileSync(b.fi, ACCESA);
      await esce();
      await C.post();
    });
    assert.deepEqual([b.custode.testo(b.fi), readFileSync(b.fi, 'utf8')], [APPROVATA, APPROVATA]);
    assert.deepEqual([b.copie(), B.avvisi(), C.avvisi()], [1, 1, 1], 'all uscita B è ancora «in corso»: l avviso arriva anche a lei');
  } finally { B.chiudi(); C.chiudi(); b.chiudi(); }
});

test('374 g6 A1 (P2, controprova decisione 390) il comando in sottofondo di B in Accesso pieno non trattiene A: adottato, 0 avvisi', { timeout: 10_000 }, async () => {
  const r = await incrocio('Full access', async (b, A, B) => {
    const esce = await B.sfondo();
    await A.pre('shell', { comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  });
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI]);
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [0, 0, 0]);
});

test('374 g6 A1 (P2) un comando con la carta 373 accettata resta in sottofondo: ciò che c è nel file quando il SUO PROCESSO esce diventa l approvato', { timeout: 10_000 }, async () => {
  const b = await banco();
  const B = sessione(b.custode, 'On request');
  try {
    await muto(async () => {
      const esce = await B.sfondo('shell', { comando: `node imposta.mjs ${IMP}`, background: true });
      writeFileSync(b.fi, ACCESA); // il processo scrive DOPO la fine della chiamata
      await esce();
    });
    assert.equal(B.carte(), 1, 'la carta 373 del comando che nomina il file');
    assert.deepEqual([b.custode.testo(b.fi), b.custode.testo(b.fl)], [ACCESA, LUOGHI], 'il file nominato si adotta alla fine vera del comando');
    assert.deepEqual([b.copie(), B.avvisi()], [0, 0]);
  } finally { B.chiudi(); b.chiudi(); }
});

test('374 g6 A1 (P2) un processo lanciato da B in Accesso pieno resta di un comando in Accesso pieno anche dopo che B scende di livello', { timeout: 10_000 }, async () => {
  const r = await incrocio('Full access', async (b, A, B) => {
    const esce = await B.sfondo();
    await B.livello('On request');
    await B.pre('shell', { comando: 'git status' }); await B.post();
    await A.pre('shell', { comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  });
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI], 'solo i processi registrati DURANTE un comando fuori dall Accesso pieno contano');
  assert.deepEqual([r.copie, r.A.avvisi(), r.B.avvisi()], [0, 0, 0]);
});

/* ——— A1 (P3): dopo un riavvio il processo in sottofondo di B è ancora vivo (adottato), e scrive durante A in Accesso pieno ——— */

const SESSIONE_B = 'b6b6b6b6-2222-4222-8222-b6b6b6b6b6b6';
function giornaleDiB(store, cartella, permessi) {
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId: SESSIONE_B, taskId: 'libero:b', cartella, task: { consegna: 'b', consegnaCorta: 'b' },
      comandoProva: null, forkDa: null, avviataAlle: '2026-11-12T08:00:00.000Z', modello: 'm', modelloPlanner: null, reasoning: 'medium',
      mobile: false, permessi, permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null,
      modelId: 'm', fallbackConsent: false, cartellaGiaScelta: true },
    evento('RunStarted', { threadId: SESSIONE_B, runId: 'r1' }),
    evento('ToolCallStart', { toolCallId: 'bg1', toolCallName: 'shell' }),
    evento('ToolCallArgs', { toolCallId: 'bg1', delta: JSON.stringify({ comando: 'node scrittore.mjs', background: true }) }),
    evento('ToolCallResult', { toolCallId: 'bg1', content: SFONDO, inSfondo: true }),
    evento('CUSTOM', { name: EVENTO_SFONDO_IMPRONTA, value: { toolCallId: 'bg1', pid: 4242, gruppo: 4242, impronta: 'proc:boot:777', ospite: { pid: 111, impronta: 'proc:boot:5' }, delModello: true } }), // giro 8 (D1): l'impronta di un comando del modello, come la scrive il server
    evento('RunFinished', { threadId: SESSIONE_B, runId: 'r1', result: { detto: 'fatto' } }),
  ];
  writeFileSync(join(store, `${SESSIONE_B}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

async function riavvio(permessiDiB, passi, { lento = false } = {}) {
  const b = await banco();
  const store = mkdtempSync(join(tmpdir(), 'talos-374g6-store-'));
  giornaleDiB(store, b.cartella, permessiDiB);
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

test('374 g6 A1 (P3) riavvio: il processo in sottofondo di B (su richiesta) è ancora vivo e scrive durante A in Accesso pieno ⇒ RIMESSO, 1 copia', { timeout: 15_000 }, async () => {
  const r = await riavvio('On request', async ({ b, A, esce }) => {
    await A.pre(); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  });
  assert.equal(r.adottati, 1, 'il processo di prima è ripreso');
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'non adottato dal comando di A');
  assert.deepEqual(r.disco, [APPROVATA, LUOGHI]);
  assert.deepEqual([r.copie, r.avvisiA, r.avvisiB], [1, 0, 1], 'una copia, l avviso a B');
});

test('374 g6 A1 (P3) riavvio: uscito il processo ripreso di B, A in Accesso pieno adotta di nuovo (decisione 390)', { timeout: 15_000 }, async () => {
  const r = await riavvio('On request', async ({ b, A, esce }) => {
    await esce();
    await A.pre({ comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post();
  });
  assert.equal(r.adottati, 1);
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI]);
  assert.deepEqual([r.copie, r.avvisiA], [0, 0]);
});

test('374 g6 A1 (P3, controprova) riavvio: il processo ripreso di B in Accesso pieno non trattiene A: adottato, 0 avvisi', { timeout: 15_000 }, async () => {
  const r = await riavvio('Full access', async ({ b, A, esce }) => {
    await A.pre({ comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  });
  assert.equal(r.adottati, 1);
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI]);
  assert.deepEqual([r.copie, r.avvisiA, r.avvisiB], [0, 0, 0]);
});

test('374 g6 A1 (P3) riavvio: A in Accesso pieno finisce PRIMA che il processo di B sia ripreso (la lettura dei processi è lenta): RIMESSO', { timeout: 15_000 }, async () => {
  const r = await riavvio('On request', async ({ b, A, esce }) => {
    await A.pre(); writeFileSync(b.fi, ACCESA); await A.post();
    await esce();
  }, { lento: true });
  assert.equal(r.adottati, 1);
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'l adozione in Accesso pieno aspetta la ripresa dei processi di prima');
  assert.deepEqual([r.copie, r.avvisiA, r.avvisiB], [1, 0, 1]);
});

/* ——— Il filo col kernel vero: la cura sta in piedi solo se il kernel chiama `post_tool_call` con il processo in sottofondo ancora
   registrato, e lo sgancia solo alla sua uscita vera (talosHarness.mjs, `segnaleDelComando` e `p.uscita.finally(() => fermabile.sgancia())`).
   Un processo breve lanciato dalla prova stessa (ping/sleep di 2 s), fermato o atteso da lei. ——— */
test('374 g6 A1 (filo col kernel) un comando in sottofondo: registrato dopo il pre, ancora registrato al post, sganciato solo alla sua uscita', { skip: !(process.platform === 'win32' || process.platform === 'linux'), timeout: 30_000 }, async () => {
  const { talosLavora } = await import('../src/kernel/talosHarness.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g6-kernel-'));
  const fatti = [];
  const vivi = new Set();
  let n = 0;
  const fetchDiRete = async () => {
    n += 1;
    const message = n === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'bg1', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando: process.platform === 'win32' ? 'ping -n 3 127.0.0.1' : 'sleep 2', background: true }) } }] }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await talosLavora({
      cartella, task: { consegna: 'lancia' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno', fetchDiRete,
      chiediApprovazioneFn: async () => true, ...(process.platform === 'win32' ? { ambienteComandiFn: () => ({ dove: 'windows', revisione: 0 }) } : {}),
      hookFn: async (e) => {
        if (e?.azione !== 'shell') return { consentito: true };
        fatti.push(`${e.tipo} vivi=${vivi.size}`);
        return { consentito: true };
      },
      registraComandoFermabile: (voce) => { vivi.add(voce.toolCallId); fatti.push('registrato'); return () => { vivi.delete(voce.toolCallId); fatti.push('sganciato'); }; },
      segnalaUscitaSfondo: () => {},
    });
    assert.deepEqual(fatti, ['pre_tool_call vivi=0', 'registrato', 'post_tool_call vivi=1'], 'al post il processo in sottofondo è ancora registrato');
    for (let i = 0; i < 200 && !fatti.includes('sganciato'); i += 1) await pausa(50); // il processo vive ~2 s
    assert.ok(fatti.includes('sganciato'), 'lo sgancio arriva alla sua uscita vera');
    assert.equal(fatti.at(-1), 'sganciato');
  } finally { await pausa(200); await rimuoviCartellaDiProvaAttesa(cartella); }
});
