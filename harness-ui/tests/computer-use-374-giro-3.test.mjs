/*
 * ⛔ Decisione 374, giro 3 (decisione 387 dell'owner, 08/11/2026): le sonde dei revisori del giro 2 diventano prove.
 * B (SB1-SB11), A (S1-S8, N1-N7, N3b, S6b) e il verificatore (B1, B2, A1, A2, A3, A4), più la prova HTTP del 409 (H01).
 * Ogni prova dice il comportamento VOLUTO; sulla testa 237f2b6de le prove dei punti B1, B2, A1, A2, A4, A5, A6, A7, A8 e X5 sono rosse.
 * Banco: i due file approvati da una porta di TALOS (`scrivi`), come fa la persona dalle Impostazioni; un portachiavi in memoria.
 * Giro 4 (decisione 390, 08/11/2026): in Accesso completo la 374 non interviene (compito 19 della tabella 375); B1 (V-B1 L, R1, R2),
 * B2 (V-B2), C1, A2 (XM8) e una prova per ogni mutante vivo del giro 3 (X20-X45, Y01-Y08, S02). Sulla testa 8f517f448 sono rosse.
 * Concorrente: hermes-agent hermes_cli/backup.py:679-681 pota subito dopo OGNI copia nuova e tiene la più recente (`_prune_oldest`, :1143).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { rename as rinominaVera, readFile as leggiVero, unlink as togliVero } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer as serverTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaImpostazioneComputerUse } from '../src/computer-use/impostazione.mjs';
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import * as cm from '../src/computer-use/file-approvati.mjs';
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { creaCustodeFileComputerUse, EVENTO_FILE_COMPUTER_USE_RIPRISTINATI: EVENTO, SERVIZIO_IMPRONTE_COMPUTER_USE: SERVIZIO, accountDelleImpronte } = cm;
const QUI = dirname(fileURLToPath(import.meta.url));
const APPROVATA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ACCESA = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[{"tipo":"dominio","nome":"example.com","quando":"2026-11-07T10:00:00.000Z"}]}\n';
const LUOGHI_ESTRANEI = '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe","quando":"2026-11-08T10:00:00.000Z"}]}\n';
const MIB = 1024 * 1024;
const IMP = '.computer-use-impostazione.json';
const LUO = '.computer-use-luoghi.json';
const occupato = () => Object.assign(new Error('busy'), { code: 'EBUSY' });

const mutoSinc = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const muto = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

/** `approva: true` ⇒ i file nascono dalla porta approvata (`scrivi`); `false` ⇒ sono sul disco e il portachiavi non ha la voce (aggiornamento). */
async function banco({ impostazione = APPROVATA, luoghi = LUOGHI, portachiavi = creaAdattatorePortachiaviInMemoria(), approva = true, deps, adesso } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g3-'));
  const fi = join(cartella, IMP);
  const fl = join(cartella, LUO);
  const nuovo = (altro = {}) => mutoSinc(() => creaCustodeFileComputerUse({ file: [fi, fl], portachiavi, ...(deps ? { deps } : {}), ...(adesso ? { adesso } : {}), ...altro }));
  let custode = null;
  if (approva) {
    custode = nuovo();
    await muto(async () => {
      if (impostazione !== null) await custode.scrivi(fi, impostazione);
      if (luoghi !== null) await custode.scrivi(fl, luoghi);
    });
  } else {
    if (impostazione !== null) writeFileSync(fi, impostazione);
    if (luoghi !== null) writeFileSync(fl, luoghi);
  }
  const copie = (nome = IMP) => readdirSync(cartella).filter((f) => f.startsWith(`${nome}.changed-`)).map((f) => join(cartella, f));
  const byte = (nome = IMP) => copie(nome).reduce((t, p) => t + statSync(p).size, 0);
  const conTesto = (testo, nome = IMP) => copie(nome).some((p) => readFileSync(p, 'utf8') === testo);
  const voce = () => portachiavi?.get(SERVIZIO, accountDelleImpronte([fi, fl])) ?? null;
  const acceso = (c) => creaImpostazioneComputerUse({ file: fi, custode: c, avvisa: () => {} }).acceso();
  const luoghiDi = (c) => creaRegistroLuoghi({ file: fl, custode: c }).perIlCiclo();
  return { cartella, fi, fl, portachiavi, custode, nuovo, copie, byte, conTesto, voce, acceso, luoghiDi, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

/* Una sessione vera del registro; `durevoli` raccoglie le righe che il registro scrive su disco con `durable: true` (B6). */
function sessione(custode, cartella, { permessiScelto = 'Workspace write' } = {}) {
  let input = null;
  let risolvi;
  const fine = new Promise((r) => { risolvi = r; });
  const durevoli = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    /* la cartella del progetto è quella di sistema, come nelle sonde: una cartella di prova che si cancella tiene vivo il processo */
    preparaEsecuzioneFn: (taskId) => ({ cartella: tmpdir(), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }),
    custodeFileComputerUse: custode,
    cartellaStore: join(cartella, 'store'),
    registraRigaFn: async ({ record, durable }) => { if (record?.name === EVENTO) durevoli.push({ durable: durable === true, record }); return true; },
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return {
    async attrezzo(azione, argomenti, { si = true, durante } = {}) {
      const prima = ricevuti.length;
      const p = input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 });
      await new Promise((r) => setTimeout(r, 5));
      const carta = ricevuti.slice(prima).find((e) => e.type === 'ApprovalRequested');
      if (carta) registro.rispondiApprovazione(sessionId, carta.requestId, si);
      const esito = await p;
      if (esito?.consentito !== false) await durante?.();
      await input.hookFn({ tipo: 'post_tool_call', azione, esito: 'ok', giro: 0 });
      return { esito, carta: carta ?? null };
    },
    /* un attrezzo il cui «dopo» non arriva mai (B3, R04) */
    async soloPrima(azione, argomenti) { await input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 }); },
    nuovoGiro: (runId) => input.onEvento({ type: 'RunStarted', threadId: 't1', runId }),
    carte: () => ricevuti.filter((e) => e.type === 'ApprovalRequested').length,
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO),
    durevoli,
    chiudi: () => { input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
}
const impronte = (b) => (b.voce() ?? '').slice(3).split(',');

/* ——— punto 1 (B1 ALTO, A7): il tetto dopo OGNI rinomina; la copia appena fatta non si toglie mai ——— */

test('374 g3 B1 (SB10, V-B1) approvato «assente», lo stesso contenuto torna 15 volte: al massimo 10 copie', async () => {
  const b = await banco({ impostazione: null });
  try {
    for (let i = 0; i < 15; i += 1) { writeFileSync(b.fi, ACCESA); await muto(() => b.custode.controlla()); }
    assert.ok(b.copie().length <= cm.COPIE_PER_FILE, `copie ${b.copie().length} oltre il tetto di ${cm.COPIE_PER_FILE}`);
    assert.equal(b.conTesto(ACCESA), true, 'il contenuto messo da parte resta');
    assert.equal(b.acceso(b.custode), false);
  } finally { b.chiudi(); }
});

test('374 g3 B1 approvato «assente», 1,5 MiB uguali che tornano 5 volte: le copie stanno sotto 4 MiB', async () => {
  const b = await banco({ impostazione: null });
  try {
    const grande = `${'x'.repeat(1.5 * MIB)}\n`;
    for (let i = 0; i < 5; i += 1) { writeFileSync(b.fi, grande); await muto(() => b.custode.controlla()); }
    assert.ok(b.byte() <= cm.BYTE_DELLE_COPIE_PER_FILE, `byte ${b.byte()} oltre 4 MiB`);
    assert.ok(b.copie().length >= 1);
  } finally { b.chiudi(); }
});

test('374 g3 SB8 tetto di byte: si toglie solo quanto basta (3 x 1,5 MiB ⇒ ne restano 2)', async () => {
  const b = await banco();
  try {
    for (let i = 0; i < 3; i += 1) { writeFileSync(b.fi, `${String(i).repeat(1.5 * MIB)}\n`); await muto(() => b.custode.controlla()); }
    assert.equal(b.copie().length, 2);
  } finally { b.chiudi(); }
});

test('374 g3 A7 (N6) copie con una data nel futuro: la copia del cambio appena messo da parte resta, ed è quella detta', async () => {
  const b = await banco();
  try {
    for (let i = 1; i <= 10; i += 1) writeFileSync(`${b.fl}.changed-2099-01-01T00-00-00-000Z-1-${i}`, `vecchia ${i}\n`);
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    const e = await muto(() => b.custode.controlla());
    assert.equal(b.conTesto(LUOGHI_ESTRANEI, LUO), true, 'il cambio appena messo da parte resta');
    const detta = e.ripristinati.find((r) => r.file === b.fl)?.copia;
    assert.equal(typeof detta === 'string' && existsSync(detta), true, 'la copia detta all avviso esiste');
    assert.ok(b.copie(LUO).length <= cm.COPIE_PER_FILE);
  } finally { b.chiudi(); }
});

test('374 g3 SB7 lo stesso millesimo, più di 10 copie: via le più vecchie per progressivo, la più recente resta', async () => {
  const b = await banco({ adesso: () => 1_762_600_000_000 });
  try {
    for (let i = 1; i <= 12; i += 1) { writeFileSync(b.fi, `{"k":${i}}\n`); await muto(() => b.custode.controlla()); }
    const restano = b.copie().map((p) => readFileSync(p, 'utf8'));
    assert.equal(restano.length, cm.COPIE_PER_FILE);
    assert.ok(restano.includes('{"k":12}\n'), 'la più recente resta');
    assert.ok(!restano.includes('{"k":1}\n') && !restano.includes('{"k":2}\n'), 'via le due più vecchie');
  } finally { b.chiudi(); }
});

test('374 g3 SB3 un contenuto la cui copia è stata potata, se ritorna, si mette di nuovo da parte', async () => {
  const b = await banco();
  try {
    const contenuti = Array.from({ length: 12 }, (_, i) => `{"acceso":true,"k":${i}}\n`);
    for (const x of contenuti) { writeFileSync(b.fi, x); await muto(() => b.custode.controlla()); }
    writeFileSync(b.fi, contenuti[0]); await muto(() => b.custode.controlla());
    assert.equal(b.conTesto(contenuti[0]), true);
  } finally { b.chiudi(); }
});

test('374 g3 SB4 la potatura non tocca un file della persona col prefisso e un nome fuori forma', async () => {
  const b = await banco();
  try {
    const mio = join(b.cartella, `${IMP}.changed-backup-della-persona`);
    writeFileSync(mio, 'mio');
    for (let i = 0; i < 12; i += 1) { writeFileSync(b.fi, `{"k":${i}}\n`); await muto(() => b.custode.controlla()); }
    assert.equal(existsSync(mio), true);
    assert.equal(b.copie().filter((p) => p !== mio).length, cm.COPIE_PER_FILE);
  } finally { b.chiudi(); }
});

test('374 g3 B1 scrivi su un file incerto (portachiavi assente): la copia fatta prima di scrivere rispetta il tetto', async () => {
  const b = await banco({ portachiavi: null });
  try {
    for (let i = 1; i <= 12; i += 1) writeFileSync(`${b.fi}.changed-2026-01-01T00-00-00-000Z-1-${i}`, `vecchia ${i}\n`);
    const riavvio = b.nuovo(); // senza portachiavi: incerto
    await muto(() => riavvio.scrivi(b.fi, ACCESA));
    assert.ok(b.copie().length <= cm.COPIE_PER_FILE, `copie ${b.copie().length}`);
    assert.equal(b.conTesto(APPROVATA), true, 'la versione che c era resta da parte');
  } finally { b.chiudi(); }
});

test('374 g3 B1 le copie dell avvio rispettano il tetto al primo controllo, quella nuova resta', async () => {
  const b = await banco();
  try {
    for (let i = 1; i <= 12; i += 1) writeFileSync(`${b.fi}.changed-2026-01-01T00-00-00-000Z-1-${i}`, `vecchia ${i}\n`);
    writeFileSync(b.fi, ACCESA);
    const riavvio = b.nuovo();
    await muto(() => riavvio.controlla());
    assert.ok(b.copie().length <= cm.COPIE_PER_FILE);
    assert.equal(b.conTesto(ACCESA), true);
  } finally { b.chiudi(); }
});

/* ——— punto 2 (B2, A3, X5, A5, A6): il controllo all'avvio ——— */

test('374 g3 B2 (SB1, V-B2) prima installazione senza nessun comando: un file comparso prima del riavvio non è adottato', async () => {
  const b = await banco({ impostazione: null, luoghi: null, approva: false });
  try {
    b.nuovo(); // il server parte, nessun controllo
    writeFileSync(b.fi, ACCESA);
    const dopo = b.nuovo();
    assert.equal(dopo.testo(b.fi), null);
    assert.equal(b.acceso(dopo), false);
  } finally { b.chiudi(); }
});

test('374 g3 B2 aggiornamento (file sul disco, nessuna voce): messi da parte all avvio, spento, un avviso; si riaccende UNA volta', async () => {
  const b = await banco({ impostazione: ACCESA, luoghi: LUOGHI_ESTRANEI, approva: false });
  try {
    const c = b.nuovo();
    assert.equal(c.testo(b.fi), null);
    assert.equal(b.acceso(c), false);
    assert.deepEqual((await b.luoghiDi(c)).app, []);
    const e = await muto(() => c.controlla());
    assert.equal(e.ripristinati.filter((r) => r.allAvvio === true).length, 2, 'un avviso «messi da parte all avvio» per i due file');
    assert.equal(b.conTesto(ACCESA), true);
    assert.equal(b.conTesto(LUOGHI_ESTRANEI, LUO), true);
    assert.equal(b.nuovo().testo(b.fi), null, 'il secondo riavvio senza comandi non adotta niente');
    /* il costo misurato: la persona riaccende una volta dalle Impostazioni, e resta acceso ai riavvii dopo */
    await muto(() => c.scrivi(b.fi, ACCESA));
    assert.equal(b.acceso(c), true);
    assert.equal(b.acceso(b.nuovo()), true);
  } finally { b.chiudi(); }
});

test('374 g3 B2 nessuna voce e nessun file: si salva «assente» subito, nessun avviso', async () => {
  const b = await banco({ impostazione: null, luoghi: null, approva: false });
  try {
    const c = b.nuovo();
    assert.equal(b.voce(), 'v1:assente,assente');
    const e = await muto(() => c.controlla());
    assert.deepEqual([e.ripristinati.length, e.errori.length], [0, 0]);
  } finally { b.chiudi(); }
});

test('374 g3 B2 il controllo all avvio del server (`avvia`) tiene l avviso per il primo controllo di una sessione', async () => {
  const b = await banco({ impostazione: ACCESA, approva: false });
  try {
    const c = b.nuovo();
    await muto(() => c.avvia());
    const e = await muto(() => c.controlla());
    assert.ok(e.ripristinati.some((r) => r.allAvvio === true && r.file === b.fi));
    const sorgente = readFileSync(join(QUI, '..', 'server.mjs'), 'utf8');
    assert.match(sorgente, /^\s*custodeFileComputerUse\.avvia\(\)\.catch\(/mu, 'il server controlla all avvio, senza condizioni');
  } finally { b.chiudi(); }
});

test('374 g3 A3 (V-A3, N3) voce tolta dal portachiavi, file cambiato, riavvio: messo da parte, non adottato', async () => {
  const b = await banco();
  try {
    b.portachiavi.remove(SERVIZIO, accountDelleImpronte([b.fi, b.fl]));
    writeFileSync(b.fi, ACCESA);
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    const c = b.nuovo();
    assert.equal(c.testo(b.fi), null);
    assert.deepEqual((await b.luoghiDi(c)).app, []);
    assert.equal(b.conTesto(ACCESA), true);
  } finally { b.chiudi(); }
});

test('374 g3 X5 senza portachiavi e senza file: nessuna riga «resta spento»', async () => {
  const b = await banco({ impostazione: null, luoghi: null, portachiavi: null, approva: false });
  try {
    const e = await muto(() => b.nuovo().controlla());
    assert.deepEqual(e.errori, []);
  } finally { b.chiudi(); }
});

test('374 g3 X5 senza portachiavi coi file: una riga; acceso dalle Impostazioni vale fino al riavvio, poi di nuovo spento con la riga', async () => {
  const b = await banco({ portachiavi: null, approva: false });
  try {
    const c = b.nuovo();
    const e = await muto(() => c.controlla());
    assert.ok(e.errori.some((x) => x.fase === 'impronta'));
    await muto(() => c.scrivi(b.fi, ACCESA));
    assert.equal(b.acceso(c), true);
    const dopo = b.nuovo();
    assert.equal(b.acceso(dopo), false);
    assert.ok((await muto(() => dopo.controlla())).errori.some((x) => x.fase === 'impronta'));
  } finally { b.chiudi(); }
});

test('374 g3 A5 (N4) un portachiavi che non salva: chiuso dall avvio, e uno scritto estraneo non si adotta al riavvio', async () => {
  const mem = creaAdattatorePortachiaviInMemoria();
  const pk = { get: mem.get, set: () => { throw Object.assign(new Error('denied'), { code: 'GenericFailure' }); }, remove: mem.remove };
  const b = await banco({ impostazione: null, luoghi: null, portachiavi: pk, approva: false });
  try {
    const c = b.nuovo();
    const e = await muto(() => c.controlla());
    assert.ok(e.errori.some((x) => x.fase === 'impronta'), 'il primo salvataggio fallito chiude e lo dice');
    writeFileSync(b.fi, ACCESA);
    assert.equal(b.acceso(b.nuovo()), false);
  } finally { b.chiudi(); }
});

test('374 g3 A6 (N5) un guasto passeggero all avvio, poi le Impostazioni scrivono: l altra impronta non diventa «assente»', async () => {
  const mem = creaAdattatorePortachiaviInMemoria(); let guasto = false;
  const pk = { get: (s, a) => { if (guasto) throw Object.assign(new Error('x'), { code: 'GenericFailure' }); return mem.get(s, a); }, set: mem.set, remove: mem.remove };
  const b = await banco({ portachiavi: pk });
  try {
    guasto = true; const c2 = b.nuovo(); guasto = false;
    await muto(() => c2.scrivi(b.fi, ACCESA));
    assert.notEqual(impronte(b)[1], 'assente', 'l impronta dei luoghi resta');
    const c3 = b.nuovo();
    assert.deepEqual((await b.luoghiDi(c3)).domini, ['example.com']);
    assert.equal(existsSync(b.fl), true);
  } finally { b.chiudi(); }
});

test('374 g3 A6 un guasto passeggero all avvio che passa al primo controllo: nessun avviso falso, la versione approvata torna', async () => {
  const mem = creaAdattatorePortachiaviInMemoria(); let guasto = false;
  const pk = { get: (s, a) => { if (guasto) throw Object.assign(new Error('x'), { code: 'GenericFailure' }); return mem.get(s, a); }, set: mem.set, remove: mem.remove };
  const b = await banco({ portachiavi: pk });
  try {
    guasto = true; const c2 = b.nuovo(); guasto = false;
    const e = await muto(() => c2.controlla());
    assert.deepEqual(e.errori.filter((x) => x.fase === 'impronta'), []);
    assert.equal(c2.testo(b.fl), LUOGHI);
  } finally { b.chiudi(); }
});

test('374 g3 SB5 portachiavi assente e file assenti: accendere da Impostazioni funziona', async () => {
  const b = await banco({ impostazione: null, luoghi: null, portachiavi: null, approva: false });
  try {
    const c = b.nuovo();
    await muto(() => c.scrivi(b.fi, ACCESA));
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA);
    assert.equal(c.testo(b.fi), ACCESA);
  } finally { b.chiudi(); }
});

test('374 g3 SB6 un contenuto messo da parte all avvio che torna uguale al riavvio dopo: non è adottato', async () => {
  const b = await banco();
  try {
    writeFileSync(b.fi, ACCESA);
    await muto(() => b.nuovo().controlla());
    writeFileSync(b.fi, ACCESA);
    assert.equal(b.nuovo().testo(b.fi), null);
  } finally { b.chiudi(); }
});

test('374 g3 SB9 rinomina fallita all avvio: l impronta tenuta resta quando si scrive l altro file', async () => {
  const b = await banco();
  try {
    const prima = impronte(b)[0];
    writeFileSync(b.fi, ACCESA);
    const c = b.nuovo({ deps: { renameSync: () => { throw occupato(); } } });
    await muto(() => c.scrivi(b.fl, '{"versione":1,"voci":[]}\n'));
    assert.equal(impronte(b)[0], prima);
  } finally { b.chiudi(); }
});

test('374 g3 SB11 file sparito all avvio: «assente» si salva, e il vecchio contenuto che ricompare va da parte', async () => {
  const b = await banco();
  try {
    rmSync(b.fi);
    b.nuovo(); // nessun controllo: il salvataggio è all avvio
    writeFileSync(b.fi, APPROVATA);
    assert.equal(b.nuovo().testo(b.fi), null);
  } finally { b.chiudi(); }
});

/* ——— punto 3, giro 4 (decisione 390 dell'owner, «Non toccare nulla»): in Accesso completo la 374 non interviene sul comando ———
   Come la base 253a44dcc: il controllo di PRIMA resta (compito 20, 1 contro 1), e ciò che il comando lascia diventa la versione
   approvata, senza controllo dopo; niente copia, niente spegnimento, niente avviso per ciò che fa il comando. Concorrente: codex
   codex-rs/protocol/src/permissions.rs:2057 (DangerFullAccess ⇒ nessun sottopercorso protetto, `.codex` compreso). */

test('374 g4 (decisione 390, compito 19) Accesso completo, un comando che NON nomina i file e li cambia: 0 avvisi, 0 copie, acceso', { timeout: 10_000 }, async () => {
  const b = await banco();
  const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
  try {
    await muto(() => pieno.attrezzo('shell', { comando: 'npm run build' }, { durante: () => { writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI); } }));
    await muto(() => pieno.attrezzo('shell', { comando: 'npm test' }));
    await muto(() => pieno.attrezzo('shell', { comando: 'git status' }));
    assert.equal(b.acceso(b.custode), true, 'acceso, come prima della 374');
    assert.deepEqual((await b.luoghiDi(b.custode)).app, ['cmd.exe']);
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, 'niente rimesso');
    assert.deepEqual([b.copie().length, b.copie(LUO).length], [0, 0], 'nessuna copia .changed');
    assert.equal(pieno.avvisi().length, 0, 'nessun avviso');
    assert.equal(pieno.carte(), 0);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(pieno.durevoli.length, 0, 'niente scritto nella conversazione');
    assert.equal(b.acceso(b.nuovo()), true, 'e resta acceso al riavvio: la voce del portachiavi è quella nuova');
  } finally { pieno.chiudi(); b.chiudi(); }
});

test('374 g4 (decisione 390) Accesso completo, un comando che nomina un file e cambia anche l altro: tutti e due adottati, niente avviso', { timeout: 10_000 }, async () => {
  const b = await banco();
  const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
  try {
    await muto(() => pieno.attrezzo('shell', { comando: `node -e "fs.writeFileSync('${IMP}', x)"` }, { durante: () => { writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI); } }));
    assert.equal(b.acceso(b.custode), true);
    assert.equal(b.custode.testo(b.fl), LUOGHI_ESTRANEI, 'anche l altro: in Accesso completo la 374 non tocca il comando');
    assert.deepEqual([pieno.carte(), pieno.avvisi().length, b.copie(LUO).length], [0, 0, 0]);
  } finally { pieno.chiudi(); b.chiudi(); }
});

test('374 g4 (decisione 390) Accesso completo, `prova` cambia il file: adottato, niente avviso', { timeout: 10_000 }, async () => {
  const b = await banco();
  const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
  try {
    await muto(() => pieno.attrezzo('prova', {}, { durante: () => writeFileSync(b.fi, ACCESA) }));
    assert.equal(b.acceso(b.custode), true);
    assert.deepEqual([pieno.carte(), pieno.avvisi().length, b.copie().length], [0, 0, 0]);
  } finally { pieno.chiudi(); b.chiudi(); }
});

test('374 g4 (compito 20) Accesso completo, la persona cambia i luoghi a mano FRA due comandi: il controllo di prima resta, 1 avviso e 1 copia come la base', { timeout: 10_000 }, async () => {
  const b = await banco();
  const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
  try {
    await muto(() => pieno.attrezzo('shell', { comando: 'git status' }));
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    await muto(() => pieno.attrezzo('shell', { comando: 'npm test' }));
    assert.deepEqual([pieno.avvisi().length, b.copie(LUO).length, pieno.carte()], [1, 1, 0]);
    const { value } = pieno.avvisi()[0];
    assert.equal(value.testoChiave, 'server.computerUseFiles.putBackKept');
    assert.doesNotMatch(value.testo, /without your approval/u, 'A3: nessuna frase che accusa');
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI, 'rimesso dal controllo di prima');
  } finally { pieno.chiudi(); b.chiudi(); }
});

test('374 g4 (A3) il testo «changed without your approval» non esiste più, né in inglese né in italiano', () => {
  const sr = readFileSync(join(QUI, '..', 'src', 'session-registry.mjs'), 'utf8');
  const i18n = readFileSync(join(QUI, '..', 'frontend', 'src', 'i18n', 'testi', 'server.js'), 'utf8');
  assert.equal(/changed without your approval/u.test(sr), false);
  assert.equal(/after they were changed without your approval|erano state cambiate senza la tua approvazione/u.test(i18n), false);
});

/* ——— punto 4 (A2): un file con un errore al controllo di prima non si adotta dopo ——— */

test('374 g3 A2 (V-A2) rinomina EBUSY al controllo di prima, poi adotta: il file non si adotta e il controllo dopo lo mette da parte', async () => {
  let falli = false;
  const deps = { rename: async (...a) => { if (falli) throw occupato(); return rinominaVera(...a); } };
  const b = await banco({ deps });
  try {
    writeFileSync(b.fi, ACCESA);
    falli = true;
    const pre = await muto(() => b.custode.controlla());
    falli = false;
    assert.ok(pre.errori.some((e) => e.file === b.fi && e.fase === 'da-parte'));
    await muto(() => b.custode.adotta(null));
    assert.equal(b.custode.testo(b.fi), APPROVATA);
    await muto(() => b.custode.controlla());
    assert.equal(b.conTesto(ACCESA), true);
    assert.equal(b.acceso(b.nuovo()), false);
  } finally { b.chiudi(); }
});

test('374 g4 A2 (N2) Accesso completo con un errore al controllo di prima: non adottato; niente controllo dopo (base), lo mette da parte il comando dopo', { timeout: 10_000 }, async () => {
  let falli = false;
  const deps = { rename: async (...a) => { if (falli) throw occupato(); return rinominaVera(...a); } };
  const b = await banco({ deps });
  const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
  try {
    writeFileSync(b.fi, ACCESA);
    falli = true;
    await muto(() => pieno.attrezzo('shell', { comando: `type ${IMP}` }, { durante: () => { falli = false; } }));
    assert.equal(b.acceso(b.custode), false, 'non adottato');
    assert.equal(b.conTesto(ACCESA), false, 'in Accesso completo nessun controllo dopo il comando');
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA);
    await muto(() => pieno.attrezzo('shell', { comando: 'git status' }));
    assert.equal(b.conTesto(ACCESA), true, 'il controllo di prima del comando dopo lo mette da parte');
    assert.equal(b.acceso(b.custode), false);
  } finally { pieno.chiudi(); b.chiudi(); }
});

/* ——— punto 5 (A4): l'avviso nomina solo le copie che esistono, un evento durevole per comando ——— */

test('374 g3 A4 (S6b) cento comandi con uno scrittore: l avviso nomina solo copie vere, un evento per comando, byte contenuti', { timeout: 60_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    let n = 0;
    await muto(async () => {
      for (let i = 0; i < 100; i += 1) await s.attrezzo('shell', { comando: 'git status' }, { durante: () => writeFileSync(b.fl, LUOGHI_ESTRANEI.replace('cmd.exe', `c${n += 1}.exe`)) });
    });
    const ev = s.avvisi();
    const byte = ev.reduce((t, e) => t + JSON.stringify(e).length, 0);
    const ultimo = ev.at(-1).value;
    console.log(`S6b eventi=${ev.length} byte=${byte} copie nell ultimo avviso=${ultimo.copie.length}`);
    assert.ok(ev.length <= 100, 'al più un evento per comando');
    assert.ok(ultimo.copie.length <= cm.COPIE_PER_FILE * 2);
    assert.deepEqual(ultimo.copie.filter((c) => !existsSync(c)), [], 'ogni copia detta esiste');
    /* misurato: prima 3.603.135 byte (l'evento cresce con ogni copia, 100 nell'ultimo), dopo ~740.000 (l'evento resta sotto ~7,5 KB):
       la crescita è lineare nei comandi, mai col quadrato */
    const piuGrande = Math.max(...ev.map((e) => JSON.stringify(e).length));
    assert.ok(piuGrande < 10_000, `evento più grande ${piuGrande} byte`);
    assert.ok(byte < 1_000_000, `byte ${byte}`);
    assert.equal(new Set(ev.map((e) => e.value.idAvviso)).size, 1);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g4 A4 C1 un comando con un cambio prima e uno durante: l avviso del prima esce subito, il dopo lo aggiorna (stesso id), durevoli', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    writeFileSync(b.fi, ACCESA);
    let subito = -1;
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => { subito = s.avvisi().length; writeFileSync(b.fl, LUOGHI_ESTRANEI); } }));
    assert.equal(subito, 1, 'C1: il prima avvisa subito');
    assert.equal(s.avvisi().length, 2);
    assert.equal(new Set(s.avvisi().map((e) => e.value.idAvviso)).size, 1, 'lo stesso avviso, aggiornato');
    assert.deepEqual(s.avvisi().at(-1).value.file.sort(), [IMP, LUO]);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(s.durevoli.map((d) => d.durable), [true, true], 'scritti su disco come eventi durevoli');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g4 C1 un comando il cui «dopo» non arriva: l avviso del controllo di prima esce subito, non al passo dopo', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    writeFileSync(b.fi, ACCESA);
    await muto(() => s.soloPrima('shell', { comando: 'npm test' }));
    assert.equal(s.avvisi().length, 1, 'subito');
    assert.deepEqual(s.avvisi()[0].value.file, [IMP]);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g4 C1 una scrittura approvata di un file custodito: l avviso del controllo di prima esce prima della scrittura', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    writeFileSync(b.fl, LUOGHI_ESTRANEI); // lasciato da un altro processo fra due comandi
    let subito = -1;
    await muto(() => s.attrezzo('scrivi', { percorso: b.fi }, { durante: () => { subito = s.avvisi().length; writeFileSync(b.fi, ACCESA); } }));
    assert.equal(subito, 1, 'l avviso del controllo di prima è già uscito');
    assert.deepEqual(s.avvisi()[0].value.file, [LUO]);
    assert.equal(b.custode.testo(b.fi), ACCESA, 'la scrittura approvata si adotta');
    assert.equal(s.avvisi().length, 1, 'e niente altro');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g4 C1 (Y05) dopo un comando finito il «in corso» si spegne: il prima del comando dopo e una scrittura approvata avvisano subito', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }));
    assert.equal(s.avvisi().length, 0, 'un comando pulito non avvisa');
    writeFileSync(b.fi, ACCESA); // fra due comandi
    let subito = -1;
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => { subito = s.avvisi().length; } }));
    assert.equal(subito, 1, 'il prima del secondo comando avvisa subito');
    writeFileSync(b.fl, LUOGHI_ESTRANEI); // fra il comando e la scrittura
    subito = -1;
    await muto(() => s.attrezzo('scrivi', { percorso: b.fi }, { durante: () => { subito = s.avvisi().length; writeFileSync(b.fi, ACCESA); } }));
    assert.equal(subito, 2, 'la scrittura approvata avvisa subito anche dopo un comando');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g3 A4 «la versione cambiata è accanto» solo con copie vere', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    writeFileSync(b.fi, ACCESA);
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }));
    const v = s.avvisi().at(-1).value;
    assert.equal(v.testoChiave, 'server.computerUseFiles.putBackKept');
    assert.ok(v.copie.length > 0 && v.copie.every((c) => existsSync(c)));
  } finally { s.chiudi(); b.chiudi(); }
});

/* ——— punto 7 (A8): maiuscole e minuscole ——— */

test('374 g3 A8 (N7) scrivi in Accesso completo col percorso in altre maiuscole: lo stesso file, adottato', { timeout: 10_000 }, async () => {
  const b = await banco();
  const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
  try {
    const grande = join(b.cartella, LUO.toUpperCase());
    assert.equal(b.custode.custodisce(grande), true);
    if (process.platform === 'win32') {
      await muto(() => pieno.attrezzo('scrivi', { percorso: grande }, { durante: () => writeFileSync(grande, LUOGHI_ESTRANEI) }));
      await muto(() => pieno.attrezzo('shell', { comando: 'git status' }));
      assert.equal(b.custode.testo(b.fl), LUOGHI_ESTRANEI);
      assert.equal(pieno.avvisi().length, 0);
    }
  } finally { pieno.chiudi(); b.chiudi(); }
});

/* ——— le sonde S1-S8 del revisore A, sulla testa nuova ——— */

test('374 g3 S1 S8 carta 373 per un file: si adotta solo quello; carta negata: niente adottato', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    await muto(() => s.attrezzo('shell', { comando: `type ${IMP}` }, { durante: () => writeFileSync(b.fl, LUOGHI_ESTRANEI) }));
    assert.deepEqual((await b.luoghiDi(b.custode)).app, []);
    await muto(() => s.attrezzo('shell', { comando: `echo x > ${IMP}` }, { si: false, durante: () => writeFileSync(b.fi, ACCESA) }));
    writeFileSync(b.fi, ACCESA);
    await muto(() => s.attrezzo('shell', { comando: 'git status' }));
    assert.equal(b.acceso(b.custode), false);
    assert.equal(s.carte(), 2);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g3 S2 S3 scrittura in sottofondo e `prova`: il riavvio e il controllo non adottano', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    await muto(() => s.attrezzo('prova', {}, { durante: () => writeFileSync(b.fi, ACCESA) }));
    assert.equal(b.acceso(b.custode), false);
    await muto(() => s.attrezzo('shell', { comando: 'start /b node sfondo.mjs' }));
    writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI);
    const c2 = b.nuovo();
    assert.equal(b.acceso(c2), false);
    assert.deepEqual((await b.luoghiDi(c2)).app, []);
    assert.equal(s.carte(), 0);
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g3 S5 S7 file occupato al controllo: resta chiuso al riavvio; un comando parallelo toglie il cambio dell Accesso completo (limite)', { timeout: 10_000 }, async () => {
  const b = await banco();
  try {
    writeFileSync(b.fi, ACCESA);
    const c = b.nuovo({ deps: { renameSync: () => { throw occupato(); } } });
    assert.equal(b.acceso(c), false);
    const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
    const altra = sessione(b.custode, b.cartella);
    try {
      writeFileSync(b.fi, APPROVATA);
      await muto(() => pieno.attrezzo('shell', { comando: `node imposta.mjs ${IMP}` }, { durante: async () => { writeFileSync(b.fi, ACCESA); await altra.attrezzo('shell', { comando: 'git status' }); } }));
      assert.equal(b.acceso(b.custode), false, 'X1, il limite dichiarato: il controllo dell altra sessione toglie il cambio');
      assert.equal(pieno.carte() + altra.carte(), 0);
    } finally { pieno.chiudi(); altra.chiudi(); }
  } finally { b.chiudi(); }
});

test('374 g3 S4 S6 scrivi con un estraneo che non si mette da parte rifiuta; trenta contenuti: 10 copie, la più recente resta', { timeout: 30_000 }, async () => {
  let falli = false;
  const deps = { rename: async (...a) => { if (falli) throw occupato(); return rinominaVera(...a); } };
  const b = await banco({ deps });
  try {
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    falli = true;
    await assert.rejects(muto(() => b.custode.scrivi(b.fl, LUOGHI)), (e) => e.code === 'COMPUTER_USE_FILE_NOT_SET_ASIDE');
    falli = false;
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI_ESTRANEI, 'il file resta');
    for (let i = 0; i < 30; i += 1) { writeFileSync(b.fi, `{"k":${i}}\n`); await muto(() => b.custode.controlla()); }
    assert.equal(b.copie().length, cm.COPIE_PER_FILE);
    assert.equal(b.conTesto('{"k":29}\n'), true);
  } finally { b.chiudi(); }
});

test('374 g3 N3b togli la voce con un comando, uno scrittore in sottofondo dopo, riavvio: niente adottato', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    await muto(() => s.attrezzo('shell', { comando: 'cmdkey /delete:talos-computer-use-files-desktop' }, { durante: () => b.portachiavi.remove(SERVIZIO, accountDelleImpronte([b.fi, b.fl])) }));
    writeFileSync(b.fl, LUOGHI_ESTRANEI); writeFileSync(b.fi, ACCESA);
    const c2 = b.nuovo();
    assert.deepEqual((await b.luoghiDi(c2)).app, []);
    assert.equal(b.acceso(c2), false);
  } finally { s.chiudi(); b.chiudi(); }
});

/* ——— H01 (B5): il 409 vero, dalla rotta delle Impostazioni ——— */

test('374 g3 H01 la rotta delle Impostazioni con un cambio estraneo che non si mette da parte: 409 COMPUTER_USE_FILE_NOT_SET_ASIDE', { timeout: 10_000 }, async (t) => {
  let falli = false;
  const deps = { rename: async (...a) => { if (falli) throw occupato(); return rinominaVera(...a); } };
  const b = await banco({ deps });
  t.after(() => b.chiudi());
  const imp = creaImpostazioneComputerUse({ file: b.fi, custode: b.custode, avvisa: () => {} });
  const s = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, impostazioneComputerUse: imp }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections(); s.close(r); }));
  const indirizzo = `http://127.0.0.1:${s.address().port}`;
  writeFileSync(b.fi, ACCESA);
  falli = true;
  const r = await muto(() => fetch(`${indirizzo}/api/v1/computer-use/settings`, { method: 'POST', headers: { origin: indirizzo, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, body: JSON.stringify({ acceso: false }) }));
  const json = await r.json();
  assert.deepEqual([r.status, json?.error?.code], [409, 'COMPUTER_USE_FILE_NOT_SET_ASIDE']);
  assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, 'niente scritto');
});

/* ——— punto 6 (B4, C5): il filo di app.js col corpo VERO dell evento, senza browser ——— */

test('374 g3 C5 il blocco vero di app.js con gli eventi veri del registro, dal vivo e alla rigiocata: una riga, poi aggiornata', { timeout: 10_000 }, async () => {
  const front = await import('../frontend/src/components/avviso-file-computer-use.js');
  const { impostaLingua } = await import('../frontend/src/components/lingua.js');
  impostaLingua('en');
  const app = readFileSync(join(QUI, '..', 'frontend', 'src', 'legacy', 'app.js'), 'utf8');
  const inizio = app.indexOf('const avvisoFileComputerUse = leggiAvvisoFileComputerUse(evento);');
  const fine = app.indexOf('return;\n    }', inizio);
  assert.ok(inizio > 0 && fine > inizio, 'il blocco c è in app.js');
  const blocco = app.slice(inizio, fine + 'return;\n    }'.length);
  // eslint-disable-next-line no-new-func
  const gestisci = new Function('evento', 'ROOT', 'colonnaConversazione', 'state', 'document', 'inserisciRigaCompattazione', 'leggiAvvisoFileComputerUse', 'aggiornaRigaAvvisoFileComputerUse',
    `${blocco}\n    return 'oltre';`);
  const crea = (tag) => ({
    tagName: tag.toUpperCase(), className: '', dataset: {}, children: [], attributi: {}, hidden: false, id: '', _testo: '',
    get textContent() { return this._testo || this.children.map((c) => c.testo ?? c.textContent ?? '').join(''); },
    set textContent(v) { this._testo = String(v); this.children = []; },
    setAttribute(k, v) { this.attributi[k] = String(v); }, getAttribute(k) { return this.attributi[k] ?? null; },
    addEventListener() {}, append(...f) { this.children.push(...f); }, replaceChildren(...f) { this._testo = ''; this.children = [...f]; },
    tutti() { return this.children.filter((c) => c.tagName).flatMap((c) => [c, ...c.tutti()]); },
    querySelectorAll(sel) { return this.tutti().filter((n) => (sel === 'span' ? n.tagName === 'SPAN' : sel === '[data-avviso-file-computer-use]' ? n.dataset.avvisoFileComputerUse !== undefined : sel.split('.').filter(Boolean).every((c) => n.className.split(' ').includes(c)))); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
  });
  const doc = { createElement: crea, createTextNode: (testo) => ({ testo }) };
  const colonna = crea('div');
  let inseriti = 0;
  const chiama = (evento) => gestisci(evento, () => ({}), () => colonna, { realSession: { id: 'sessione-1' } }, doc,
    (g) => { inseriti += 1; colonna.append(g); }, front.leggiAvvisoFileComputerUse, front.aggiornaRigaAvvisoFileComputerUse);

  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    writeFileSync(b.fi, ACCESA);
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }));
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }));
    const veri = s.avvisi().map((e) => JSON.parse(JSON.stringify(e)));
    assert.equal(veri.length, 2, 'due contenuti nuovi: due eventi, lo stesso avviso');
    for (const e of veri) assert.equal(chiama(e), undefined, 'il blocco si ferma qui, non passa agli altri casi');
    for (const e of veri) chiama(JSON.parse(JSON.stringify(e))); // la rigiocata della storia
    assert.equal(colonna.querySelectorAll('[data-avviso-file-computer-use]').length, 1, 'una riga sola');
    assert.equal(inseriti, 1, 'inserita una volta, poi aggiornata');
    assert.equal(colonna.querySelector('span').textContent, 'Computer use settings changed outside TALOS were set aside');
    assert.equal(colonna.querySelector('[data-avviso-file-computer-use]').dataset.avvisoFileComputerUse, `sessione-1|${veri[0].value.idAvviso}`);
    assert.equal(chiama({ type: 'CUSTOM', name: 'talos.altro', value: {} }), 'oltre', 'un altro evento passa oltre');
  } finally { s.chiudi(); b.chiudi(); }
});

/* ——— B3: i mutanti rimasti vivi al giro 3 (M09, M10, M14, R01, R02, R04, R06, R07, R09, R11), uccisi da prove vere ——— */

test('374 g3 B3 (M09) scrivi su un file incerto sparito nel frattempo: si scrive, nessun rifiuto', async () => {
  const b = await banco({ portachiavi: null, approva: false });
  try {
    const c = b.nuovo();
    rmSync(b.fi);
    await muto(() => c.scrivi(b.fi, ACCESA));
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA);
    assert.deepEqual(b.copie(), [], 'niente da mettere da parte');
  } finally { b.chiudi(); }
});

test('374 g3 B3 (M10) scrivi con un estraneo messo da parte ma non riscritto: la copia c è, quindi si scrive', async () => {
  const b = await banco();
  try {
    let volte = 0;
    const c = b.nuovo({ deps: { scrivi: async (f, t) => { volte += 1; if (volte === 1) throw occupato(); writeFileSync(f, t); } } });
    writeFileSync(b.fi, LUOGHI_ESTRANEI);
    await muto(() => c.scrivi(b.fi, ACCESA));
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA);
    assert.ok(b.conTesto(LUOGHI_ESTRANEI), 'il cambio estraneo è nella copia');
  } finally { b.chiudi(); }
});

test('374 g3 B3 (M14) un contenuto messo da parte all avvio che ritorna mentre TALOS gira: la sua copia basta, nessuna seconda', async () => {
  const b = await banco();
  try {
    writeFileSync(b.fi, ACCESA);
    const c = b.nuovo();
    assert.equal(b.copie().length, 1, 'messo da parte all avvio');
    await muto(() => c.scrivi(b.fi, APPROVATA));
    writeFileSync(b.fi, ACCESA);
    await muto(() => c.controlla());
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'rimesso');
    assert.equal(b.copie().length, 1, 'la copia dell avvio c è già');
    assert.ok(b.conTesto(ACCESA));
  } finally { b.chiudi(); }
});

test('374 g3 B3 (R01 R09) undici comandi che cambiano il file: l avviso dice che le copie vecchie sono state tolte, col massimo', { timeout: 20_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, b.cartella);
  try {
    for (let i = 0; i < 11; i += 1) {
      await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => writeFileSync(b.fi, `{"n":${i}}\n`) }));
    }
    assert.equal(b.copie().length, 10);
    const chiavi = s.avvisi().at(-1).value.altreChiavi;
    assert.deepEqual(chiavi.find((k) => k.chiave === 'server.computerUseFiles.oldCopiesRemoved'), { chiave: 'server.computerUseFiles.oldCopiesRemoved', params: { max: 10 } });
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g3 B3 (R11 R02) avviso dell avvio coi nomi delle copie; portachiavi chiuso col suo codice', { timeout: 10_000 }, async () => {
  const b = await banco({ impostazione: ACCESA, approva: false });
  try {
    const c = b.nuovo();
    const s = sessione(c, b.cartella);
    try {
      await muto(() => s.attrezzo('shell', { comando: 'git status' }));
      const k = s.avvisi()[0].value.altreChiavi.find((x) => x.chiave === 'server.computerUseFiles.setAsideAtStart');
      const copie = [...b.copie(IMP), ...b.copie(LUO)];
      assert.equal(copie.length, 2);
      const nome = (p) => p.split(/[\\/]/).at(-1);
      assert.deepEqual(k.params.copies.split(', ').map(nome).sort(), copie.map(nome).sort());
      assert.deepEqual(k.params.files.split(', ').sort(), [IMP, LUO].sort());
    } finally { s.chiudi(); }
  } finally { b.chiudi(); }
  const z = await banco({ portachiavi: null, approva: false });
  try {
    const s = sessione(z.nuovo(), z.cartella);
    try {
      await muto(() => s.attrezzo('shell', { comando: 'git status' }));
      const { value } = s.avvisi()[0];
      const k = value.altreChiavi.find((x) => x.chiave === 'server.computerUseFiles.fingerprintUnreadable');
      assert.equal(typeof k.params.code, 'string');
      assert.ok(k.params.code.length > 0 && value.testo.includes(`(${k.params.code})`), 'lo stesso codice del testo inglese');
    } finally { s.chiudi(); }
  } finally { z.chiudi(); }
});

test('374 g3 B3 (R06 R07) Accesso completo: il nome senza punto iniziale e il nome in maiuscole sono riconosciuti e adottati', { timeout: 10_000 }, async () => {
  for (const comando of ['node imposta.mjs computer-use-impostazione.json', 'node imposta.mjs .COMPUTER-USE-IMPOSTAZIONE.JSON']) {
    const b = await banco();
    const pieno = sessione(b.custode, b.cartella, { permessiScelto: 'Full access' });
    try {
      await muto(() => pieno.attrezzo('shell', { comando }, { durante: () => writeFileSync(b.fi, ACCESA) }));
      assert.equal(b.acceso(b.custode), true, comando);
      assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, comando);
      assert.equal(pieno.carte(), 0);
    } finally { pieno.chiudi(); b.chiudi(); }
  }
});

test('374 g3 B3 (R04) un comando senza il suo «dopo» si chiude al passo dopo: l avviso di un altra sessione non gli arriva', { timeout: 10_000 }, async () => {
  const b = await banco();
  const a = sessione(b.custode, b.cartella);
  const s = sessione(b.custode, b.cartella);
  try {
    await muto(() => a.soloPrima('shell', { comando: 'npm test' }));
    await muto(() => a.soloPrima('read_file', { percorso: 'README.md' }));
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => writeFileSync(b.fi, ACCESA) }));
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA);
    assert.equal(s.avvisi().length, 1, 'a chi ha il comando');
    assert.equal(a.avvisi().length, 0, 'non a un comando finito');
  } finally { a.chiudi(); s.chiudi(); b.chiudi(); }
});

test('374 g3 B3 (G17) portachiavi che non si legge all avvio né alla seconda volta, poi sì: scrivere un file non fa «assente» l altro', async () => {
  const mem = creaAdattatorePortachiaviInMemoria(); let guasti = 0;
  const pk = { get: (s, a) => { if (guasti > 0) { guasti -= 1; throw Object.assign(new Error('x'), { code: 'GenericFailure' }); } return mem.get(s, a); }, set: mem.set, remove: mem.remove };
  const b = await banco({ portachiavi: pk });
  try {
    guasti = 2; const c2 = b.nuovo();
    await muto(() => c2.scrivi(b.fi, ACCESA));
    assert.equal(guasti, 0, 'la seconda lettura è fallita anche lei');
    assert.notEqual(impronte(b)[1], 'assente', 'l impronta dei luoghi è quella riletta');
    const c3 = b.nuovo();
    assert.deepEqual((await b.luoghiDi(c3)).domini, ['example.com']);
  } finally { b.chiudi(); }
});

test('374 g3 B3 (G27) un avviso tenuto durante un comando non si perde quando parte un giro nuovo', { timeout: 10_000 }, async () => {
  const b = await banco();
  const a = sessione(b.custode, b.cartella);
  const s = sessione(b.custode, b.cartella);
  try {
    await muto(() => a.soloPrima('shell', { comando: 'npm test' }));
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => writeFileSync(b.fi, ACCESA) }));
    assert.equal(a.avvisi().length, 0, 'tenuto finché il comando di a è in corso');
    a.nuovoGiro('r2');
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => writeFileSync(b.fl, LUOGHI_ESTRANEI) }));
    assert.equal(a.avvisi().length, 1, 'g4 (Y01): esce quello del giro prima; il nuovo resta tenuto, il comando di a è ancora in corso');
    await muto(() => a.soloPrima('read_file', { percorso: 'README.md' }));
    assert.equal(a.avvisi().length, 2, 'quello del giro prima e quello del giro nuovo');
  } finally { a.chiudi(); s.chiudi(); b.chiudi(); }
});

/* ——— giro 4, punto 3 (B1 MEDIO, verificatore V-B1): lettura o ripristino che falliscono al controllo di prima ⇒ niente adozione ——— */

test('374 g4 B1 (V-B1 L) la lettura lancia al controllo di prima, poi adotta: NOT_CHECKED, niente adozione, il controllo dopo lo mette da parte', async () => {
  let falli = false;
  const b = await banco({ deps: { readFile: async (...a) => { if (falli) throw occupato(); return leggiVero(...a); } } });
  try {
    writeFileSync(b.fi, ACCESA);
    falli = true;
    const pre = await muto(() => b.custode.controlla());
    falli = false;
    assert.ok(pre.errori.some((e) => e.file === b.fi && e.fase === 'lettura'));
    const ad = await muto(() => b.custode.adotta(null));
    assert.ok(ad.errori.some((e) => e.file === b.fi && e.codice === 'NOT_CHECKED'), 'il controllo resta segnato in errore');
    assert.equal(b.custode.testo(b.fi), APPROVATA, 'il contenuto estraneo NON si adotta');
    await muto(() => b.custode.controlla());
    assert.equal(b.conTesto(ACCESA), true);
    assert.equal(b.acceso(b.custode), false);
  } finally { b.chiudi(); }
});

test('374 g4 B1 (V-B1 R1) la scrittura del ripristino lancia (file messo da parte, ora assente): niente adozione dell assenza', async () => {
  let falli = false;
  const b = await banco({ deps: { scrivi: async (f, t) => { if (falli) throw occupato(); writeFileSync(f, t); } } });
  try {
    writeFileSync(b.fi, ACCESA);
    falli = true;
    const pre = await muto(() => b.custode.controlla());
    falli = false;
    assert.ok(pre.errori.some((e) => e.file === b.fi && e.fase === 'ripristino'));
    const ad = await muto(() => b.custode.adotta(null));
    assert.ok(ad.errori.some((e) => e.file === b.fi && e.codice === 'NOT_CHECKED'));
    assert.equal(b.custode.testo(b.fi), APPROVATA);
  } finally { b.chiudi(); }
});

test('374 g4 B1 (V-B1 R2) il ripristino rilegge il contenuto estraneo (NON_UGUALE): niente adozione, resta spento', async () => {
  let falli = false;
  const b = await banco({ deps: { scrivi: async (f, t) => { writeFileSync(f, falli ? ACCESA : t); } } });
  try {
    writeFileSync(b.fi, ACCESA);
    falli = true;
    const pre = await muto(() => b.custode.controlla());
    falli = false;
    assert.ok(pre.errori.some((e) => e.file === b.fi && e.fase === 'ripristino' && e.codice === 'NON_UGUALE'));
    const ad = await muto(() => b.custode.adotta(null));
    assert.ok(ad.errori.some((e) => e.file === b.fi && e.codice === 'NOT_CHECKED'));
    assert.equal(b.custode.testo(b.fi), APPROVATA);
    assert.equal(b.acceso(b.custode), false);
  } finally { b.chiudi(); }
});

test('374 g4 B1 l errore al controllo si azzera: file tornato uguale (X31), ripristino riuscito (X37), scrittura approvata (X45)', async () => {
  let falli = false;
  const b = await banco({ deps: { readFile: async (...a) => { if (falli) throw occupato(); return leggiVero(...a); } } });
  try {
    /* X31: il file torna uguale all approvato, il controllo dopo lo vede uguale ⇒ il cambio approvato che segue si adotta */
    writeFileSync(b.fi, ACCESA);
    falli = true; await muto(() => b.custode.controlla()); falli = false;
    writeFileSync(b.fi, APPROVATA);
    await muto(() => b.custode.controlla());
    writeFileSync(b.fi, ACCESA);
    assert.deepEqual((await muto(() => b.custode.adotta([b.fi]))).errori, [], 'X31');
    assert.equal(b.custode.testo(b.fi), ACCESA);
    /* X37: il controllo dopo l errore rimette l approvato (copia + scrittura riuscite) ⇒ il cambio approvato che segue si adotta */
    writeFileSync(b.fi, LUOGHI_ESTRANEI);
    falli = true; await muto(() => b.custode.controlla()); falli = false;
    await muto(() => b.custode.controlla());
    assert.equal(readFileSync(b.fi, 'utf8'), ACCESA, 'rimesso');
    writeFileSync(b.fi, APPROVATA);
    assert.deepEqual((await muto(() => b.custode.adotta([b.fi]))).errori, [], 'X37');
    assert.equal(b.custode.testo(b.fi), APPROVATA);
  } finally { b.chiudi(); }
  /* X45: un ripristino fallito con la copia fatta non ferma `scrivi`, che azzera l errore */
  const z = await banco();
  try {
    let volte = 0;
    const c = z.nuovo({ deps: { scrivi: async (f, t) => { volte += 1; if (volte === 1) throw occupato(); writeFileSync(f, t); } } });
    writeFileSync(z.fi, LUOGHI_ESTRANEI);
    await muto(() => c.scrivi(z.fi, ACCESA));
    writeFileSync(z.fi, APPROVATA);
    assert.deepEqual((await muto(() => c.adotta([z.fi]))).errori, [], 'X45');
    assert.equal(c.testo(z.fi), APPROVATA);
  } finally { z.chiudi(); }
});

/* ——— giro 4, punto 4: i mutanti vivi del giro 3 (giudice 14:43), uccisi da prove vere ——— */

test('374 g4 (X20) un portachiavi che non salva: il codice detto è quello del portachiavi, non uno generico', async () => {
  const mem = creaAdattatorePortachiaviInMemoria();
  const pk = { get: mem.get, set: () => { throw Object.assign(new Error('denied'), { code: 'GenericFailure' }); }, remove: mem.remove };
  const b = await banco({ impostazione: null, luoghi: null, portachiavi: pk, approva: false });
  try {
    writeFileSync(b.fi, ACCESA);
    const e = await muto(() => b.nuovo().controlla());
    assert.deepEqual([...new Set(e.errori.filter((x) => x.fase === 'impronta').map((x) => x.codice))], ['GenericFailure']);
  } finally { b.chiudi(); }
});

test('374 g4 (X21 X22) il primo salvataggio fallisce all avvio: l impronta approvata di prima resta, il file non diventa «assente» né vuoto', async () => {
  const mem = creaAdattatorePortachiaviInMemoria(); let rotto = false;
  const pk = { get: mem.get, set: (...a) => { if (rotto) throw Object.assign(new Error('denied'), { code: 'GenericFailure' }); return mem.set(...a); }, remove: mem.remove };
  const b = await banco({ portachiavi: pk });
  try {
    const prima = impronte(b)[0];
    writeFileSync(b.fi, ACCESA);
    rotto = true; const c = b.nuovo(); rotto = false;
    assert.equal(c.testo(b.fi), null);
    await muto(() => c.scrivi(b.fl, LUOGHI_ESTRANEI));
    assert.equal(impronte(b)[0], prima, 'l impronta tenuta dell impostazione');
    assert.equal(b.acceso(b.nuovo()), false);
  } finally { b.chiudi(); }
});

test('374 g4 (X27 X28) una copia vecchia che non si toglie: la potatura si ferma lì e non dice di averne tolte', async () => {
  const vecchia = (k) => `.changed-2026-01-01T00-00-00-000Z-1-${k}`;
  const b = await banco({ deps: { unlink: async (p) => { if (p.endsWith(vecchia(1))) throw occupato(); return togliVero(p); } } });
  try {
    for (let k = 1; k <= 10; k += 1) writeFileSync(`${b.fi}${vecchia(k)}`, `vecchia ${k}\n`);
    writeFileSync(b.fi, ACCESA);
    const e = await muto(() => b.custode.controlla());
    assert.equal(b.copie().length, 11, 'nessuna altra copia tolta al posto di quella occupata (X27)');
    assert.equal(existsSync(`${b.fi}${vecchia(2)}`), true);
    const r = e.ripristinati.find((x) => x.file === b.fi);
    assert.equal(r.tolte, undefined, 'niente detto tolto (X28)');
    assert.equal(b.custode.copiaViva(r.copia), true);
  } finally { b.chiudi(); }
});

test('374 g4 (X32) un contenuto la cui copia è stata cancellata a mano, se ritorna, si mette di nuovo da parte', async () => {
  const b = await banco();
  try {
    writeFileSync(b.fi, ACCESA);
    await muto(() => b.custode.controlla());
    for (const p of b.copie()) rmSync(p);
    writeFileSync(b.fi, ACCESA);
    await muto(() => b.custode.controlla());
    assert.equal(b.conTesto(ACCESA), true);
  } finally { b.chiudi(); }
});

test('374 g4 (X36 Y03) un ripristino che fallisce dopo aver potato: l avviso dice che le copie vecchie sono state tolte', { timeout: 10_000 }, async () => {
  let falli = false;
  const b = await banco({ deps: { scrivi: async (f, t) => { if (falli) throw occupato(); writeFileSync(f, t); } } });
  const s = sessione(b.custode, b.cartella);
  try {
    for (let k = 1; k <= 10; k += 1) writeFileSync(`${b.fi}.changed-2026-01-01T00-00-00-000Z-1-${k}`, `vecchia ${k}\n`);
    await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => { writeFileSync(b.fi, ACCESA); falli = true; } }));
    const { value } = s.avvisi().at(-1);
    assert.deepEqual(value.nonRimessi, [IMP]);
    assert.ok(value.altreChiavi.some((k) => k.chiave === 'server.computerUseFiles.oldCopiesRemoved'));
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g4 (X43 X44) scrivi su un file incerto pota: l avviso nomina la copia viva e dice che le vecchie sono state tolte', { timeout: 10_000 }, async () => {
  const b = await banco({ portachiavi: null, approva: false });
  try {
    for (let k = 1; k <= 12; k += 1) writeFileSync(`${b.fi}.changed-2026-01-01T00-00-00-000Z-1-${k}`, `vecchia ${k}\n`);
    const c = b.nuovo();
    await muto(() => c.scrivi(b.fi, ACCESA));
    const nome = (p) => p.split(/[\\/]/).at(-1);
    const nuova = b.copie().map(nome).filter((n) => !n.includes('2026-01-01T'));
    assert.equal(nuova.length, 1);
    const s = sessione(c, b.cartella);
    try {
      await muto(() => s.attrezzo('shell', { comando: 'git status' }));
      const { value } = s.avvisi().at(-1);
      assert.deepEqual(value.copie.map(nome), nuova, 'X43');
      assert.ok(value.altreChiavi.some((k) => k.chiave === 'server.computerUseFiles.oldCopiesRemoved'), 'X44');
    } finally { s.chiudi(); }
  } finally { b.chiudi(); }
});

test('374 g4 (Y02) la copia dell avvio potata più tardi esce anche dall avviso «messo da parte all avvio»', { timeout: 20_000 }, async () => {
  const b = await banco();
  try {
    writeFileSync(b.fi, ACCESA);
    const c = b.nuovo();
    const dellAvvio = b.copie()[0];
    const s = sessione(c, b.cartella);
    try {
      for (let i = 0; i < 11; i += 1) await muto(() => s.attrezzo('shell', { comando: 'npm test' }, { durante: () => writeFileSync(b.fi, `{"n":${i}}\n`) }));
      assert.equal(existsSync(dellAvvio), false, 'potata');
      const k = s.avvisi().at(-1).value.altreChiavi.find((x) => x.chiave === 'server.computerUseFiles.setAsideAtStart');
      assert.ok(k, 'l avviso dell avvio resta');
      assert.deepEqual(k.params.copies.split(', ').filter(Boolean).filter((p) => !existsSync(p)), [], 'ogni copia detta esiste');
    } finally { s.chiudi(); }
  } finally { b.chiudi(); }
});

/* ——— giro 4, punto 5 ——— */

test('374 g4 B2 (V-B2, X38) avvio con 10 copie datate nel futuro: la copia messa da parte all avvio resta ed è quella detta', async () => {
  const b = await banco();
  try {
    for (let i = 1; i <= 10; i += 1) writeFileSync(`${b.fi}.changed-2099-01-01T00-00-00-000Z-1-${i}`, `vecchia ${i}\n`);
    writeFileSync(b.fi, ACCESA); // cambiato a TALOS spento
    const riavvio = b.nuovo();
    const e = await muto(() => riavvio.controlla());
    const detta = e.ripristinati.find((r) => r.file === b.fi && r.allAvvio === true)?.copia;
    assert.equal(b.conTesto(ACCESA), true, 'la copia appena messa da parte all avvio resta');
    assert.equal(typeof detta === 'string' && existsSync(detta), true, 'la copia detta nell avviso esiste');
    assert.ok(b.copie().length <= cm.COPIE_PER_FILE);
    assert.equal(riavvio.testo(b.fi), null, 'il contenuto estraneo non è adottato');
  } finally { b.chiudi(); }
});

test('374 g4 A2 (XM8) voce del portachiavi storta coi luoghi presenti: riaccendere dalle Impostazioni ripara la voce', async () => {
  const b = await banco();
  try {
    b.portachiavi.set(SERVIZIO, accountDelleImpronte([b.fi, b.fl]), 'v1:rotta');
    const c = b.nuovo();
    assert.equal(b.acceso(c), false);
    await muto(() => c.scrivi(b.fi, ACCESA));
    assert.equal(b.acceso(c), true);
    assert.match(b.voce(), /^v1:[0-9a-f]{64},assente$/u, 'la voce riparata: i luoghi, mai approvati da questa voce, valgono «assente»');
    const dopo = b.nuovo();
    assert.equal(b.acceso(dopo), true, 'resta acceso al riavvio');
    assert.equal(b.copie(LUO).length, 1, 'i luoghi di prima vanno da parte una volta');
    assert.equal(b.conTesto(LUOGHI, LUO), true);
    assert.equal(b.nuovo().testo(b.fl), null);
    assert.equal(b.copie(LUO).length, 1, 'non di nuovo');
  } finally { b.chiudi(); }
});

test('374 g4 (S02) il server vero all avvio pota le copie dell avvio senza aspettare una sessione', { timeout: 60_000 }, async (t) => {
  const radice = mkdtempSync(join(tmpdir(), 'talos-374g4-s02-'));
  let figlio = null;
  let morto = Promise.resolve();
  /* un solo `after`: prima si ferma il server, poi si cancella la cartella (Windows non cancella una cartella aperta) */
  t.after(async () => {
    if (figlio && figlio.exitCode === null) { figlio.kill(); await morto; }
    await rimuoviCartellaDiProvaAttesa(radice); // BC-09: dopo l uscita del server figlio; un ritentativo lascia un avviso, non passa in silenzio
  });
  const dati = join(radice, 'desktop');
  for (const d of [dati, join(radice, 'temp'), join(radice, 'workspace')]) mkdirSync(d, { recursive: true });
  const fi = join(dati, IMP);
  for (let k = 1; k <= 12; k += 1) writeFileSync(`${fi}.changed-2026-01-01T00-00-00-000Z-1-${k}`, `vecchia ${k}\n`);
  writeFileSync(fi, ACCESA); // portachiavi «memoria» vuoto: file sul disco senza voce, come un aggiornamento
  const copie = () => readdirSync(dati).filter((n) => n.startsWith(`${IMP}.changed-`)).length;
  const libera = serverTcp();
  await new Promise((r) => libera.listen(0, '127.0.0.1', r));
  const porta = libera.address().port;
  await new Promise((r) => libera.close(r));
  const temp = join(radice, 'temp');
  figlio = spawn(process.execPath, ['server.mjs', '--senza-gettone=prove'], {
    cwd: join(QUI, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: '',
      TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'), TALOS_HARNESS_UI_WORKFLOW_DIR: join(radice, 'workflow'),
      TALOS_DESKTOP_DATA_DIR: dati, TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_SCRATCH_DIR: join(radice, 'scratch'),
      OPENROUTER_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', TEMP: temp, TMP: temp, TMPDIR: temp },
  });
  morto = new Promise((r) => figlio.on('exit', r));
  let coda = '';
  for (const flusso of [figlio.stdout, figlio.stderr]) flusso.on('data', (c) => { coda = (coda + c).slice(-3000); });
  let pronto = false;
  for (let i = 0; i < 300 && figlio.exitCode === null && !pronto; i += 1) {
    pronto = /Harness UI disponibile su/u.test(coda);
    if (!pronto) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(pronto, `il server non è partito: ${coda}`);
  for (let i = 0; i < 50 && copie() > cm.COPIE_PER_FILE; i += 1) await new Promise((r) => setTimeout(r, 100));
  assert.ok(copie() <= cm.COPIE_PER_FILE, `copie ${copie()}: il controllo all avvio (\`avvia\`) non è partito`);
  assert.equal(readdirSync(dati).some((n) => n.startsWith(`${IMP}.changed-`) && readFileSync(join(dati, n), 'utf8') === ACCESA), true, 'la copia dell avvio resta');
});
