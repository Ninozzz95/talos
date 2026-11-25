import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARTELLA_AFFITTI, creaAffittiArchivio } from '../src/session-lease.mjs';
import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio, registraRiga, registraRigaConfermata, registraRigaSync } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { createSseSession } from '../src/http-lifecycle.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { servizioDaEventi } from '../src/servizio-della-sessione.mjs';
import { NOME_CONSUMO_DI_SERVIZIO } from '../src/kernel/consumo-di-servizio.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { righeDellaVista } from './aiuto/vista-del-disco.mjs';

/*
 * ⭐ 13/11/2026 — L'AFFITTO COMPROMESSO (giudice v1649/v1656; forma `in-corso/FORMA-AFFITTO-COMPROMESSO-GIORNALE-NUMERI-DOPPI-BOZZA-2026-11-12.md`).
 *   Un processo fermo oltre la scadenza (PC sospeso, programma bloccato) non sa di esserlo: l'altro prende l'affitto, scrive, rilascia, e
 *   il primo al risveglio mostrava la chat tagliata e ci scriveva sopra coi numeri d'ordine già usati.
 *   · REV-A14: la prova del revisore di P4 (`C:/T/rev-recupero-p4/harness-ui/tests/zz-rev-attacchi3.test.mjs:130`), COPIATA con le sue
 *     funzioni d'aiuto (\`affittoAltrui\` \`:34\`, \`giroAltrove\` \`:42\`, \`modelloFinto\`, \`banco\`, \`telefono\`); in più le asserzioni;
 *   · COMP-1-*: l'affitto sa di essere compromesso (battito, rilascio, presa; orologio iniettato oltre la scadenza);
 *   · COMP-2-*: il recinto alla scrittura (dimensione e numero d'ordine), 1.000 scritture senza un falso rifiuto, la scrittura rifatta
 *     da sola che NON ripete il comando (giudice v1656: un contatore nel profilo finto);
 *   · COMP-3-*: chi legge non si fida dopo il risveglio;
 *   · COMP-4-*: i lettori non nascondono un evento perché il numero è già visto (il giornale sporco `[1..7,3,4]`);
 *   · COMP-DUE-PROCESSI: due processi Node VERI sullo stesso archivio, uno si ferma oltre la scadenza.
 * Registro vero, affitto vero, modello finto. Nessun server su dati veri: tutto in cartelle temporanee del profilo finto.
 */

/* ───────────── copiate da `zz-rev-attacchi3.test.mjs` del revisore (righe 28-106), invariate ───────────── */
const ALTRA = '99999999-9999-4999-8999-999999999999';
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-s3-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (store, id) => join(store, `${id}.jsonl`);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/* il file d'affitto come lo scrive un ALTRO processo vivo (questo pid, ma un'altra istanza): la stessa forma di `affitto-archivio.test.mjs` */
function affittoAltrui(store, id, etichetta = 'the TALOS CLI') {
  mkdirSync(join(store, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(store, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: ALTRA, pid: process.pid, host: hostname(),
    avviatoIl: '2026-11-08T00:00:00.000Z', presoIl: '2026-11-08T00:01:00.000Z', etichetta }));
}
/* 14/11/2026 (mai riscrivere): i numeri della VISTA (regola V, `aiuto/vista-del-disco.mjs`), quelli che ogni lettore di questa versione
   vede; i numeri SCRITTI (che possono ripetersi: il diario non si riscrive) solo per l'altro processo finto e le premesse */
const righe = (store, id) => righeDellaVista(giornale(store, id));
const sequenzeSulDisco = (store, id) => righe(store, id).map((r) => r._sequenza).filter((n) => typeof n === 'number');
const righeScritte = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
/* un giro scritto da un ALTRO processo in coda al giornale, con la numerazione che continua (come lo scrive la CLI) */
function giroAltrove(store, id, detto) {
  let n = Math.max(0, ...righeScritte(store, id).map((r) => r._sequenza).filter((x) => typeof x === 'number'));
  const runId = `altrove-${n}`;
  const messageId = `m-altrove-${n}`;
  const ev = (type, extra) => ({ type, _sequenza: ++n, ...extra });
  const giro = [ev('RunStarted', { threadId: id, runId }), ev('TextMessageStart', { messageId, role: 'assistant' }),
    ev('TextMessageContent', { messageId, delta: detto }), ev('TextMessageEnd', { messageId }),
    ev('RunFinished', { threadId: id, runId, result: { detto } })];
  appendFileSync(giornale(store, id), giro.map((r) => `${JSON.stringify(r)}\n`).join(''));
  return n;
}

/* il modello finto di `affitto-archivio.test.mjs`: un giro resta vivo finché il test non lo conclude */
function modelloFinto() {
  const avvii = [];
  /* 13/11/2026 sera (giudice v1804 punto 7): chi aspetta il primo avvio aspetta l'evento, mai una pausa */
  let primoAvviato;
  const primoAvvio = new Promise((ok) => { primoAvviato = ok; });
  return {
    avvii,
    primoAvvio,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1;
      let chiudi;
      const attesa = new Promise((risolvi) => { chiudi = risolvi; });
      const avvio = { input };
      avvio.concludi = (detto = 'Fatto.') => {
        input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' }, result: { detto } });
        chiudi({ ok: true, esito: { detto, comeFinita: 'concluso' } });
      };
      avvii.push(avvio);
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` });
      primoAvviato();
      return attesa;
    },
  };
}

/* il PC vero dietro il telefono: registro con l'affitto, il cancello HTTP, le operazioni remote come le monta `creaRemoto` */
async function banco(t, { conclusa = true, avviaSessioneFn = null, soloEventi = false } = {}) {
  const store = cartellaTemp(t);
  const lavoro = cartellaTemp(t);
  const affitti = attivaAffittiArchivio(store, { etichetta: 'this test', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const finto = modelloFinto();
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' }, avviaSessioneFn: avviaSessioneFn ?? finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'lavora', permessi: 'Full access' });
  /* 13/11/2026 sera (punto 7): eventi, non pause — il primo giro partito, concluso, assestato e sul disco */
  if (!avviaSessioneFn) await finto.primoAvvio;
  else if (!soloEventi) await pausa(50); // le prove col loro modello che contano su questo attimo restano com'erano
  if (conclusa && !avviaSessioneFn) {
    finto.avvii[0].concludi('Primo giro qui.');
    await registro.attendiAssestamento(sessionId);
    await attendiScritture({ cartellaStore: store, sessionId });
  }
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
  return { store, lavoro, affitti, finto, registro, sessionId, chiama, operazioni };
}
function telefono() {
  const ricevuti = [];
  const contesto = {
    dispositivo: { id: 'pad-s3', nome: 'Pad' }, iscrizioni: new Map(),
    iscrivi(sub, chiudi) { contesto.iscrizioni.set(sub, chiudi); return (data) => { ricevuti.push(data); return Promise.resolve(); }; },
  };
  return { contesto, ricevuti };
}
const apri = (b, tel, after = 0, sub = 's') => b.operazioni.esegui('session.events', { sessionId: b.sessionId, sub, after }, tel.contesto);
const testi = (eventi) => eventi.filter((e) => e?.type === 'TextMessageContent').map((e) => e.delta);
const ultimaSequenza = (eventi) => Math.max(0, ...eventi.map((e) => e?._sequenza).filter((n) => typeof n === 'number'));
/* ───────────── fine delle funzioni copiate ───────────── */

const doppieDi = (sequenze) => sequenze.filter((n, i) => sequenze.indexOf(n) !== i);

test('REV-A14 after a lease takeover on a chat CREATED here, the taker writes and releases: a phone write from here', async (t) => {
  const b = await banco(t);
  assert.equal(b.affitti.tiene(b.sessionId), true);
  affittoAltrui(b.store, b.sessionId);
  const ultima = giroAltrove(b.store, b.sessionId, 'Scritto da chi ha preso l affitto');
  b.affitti.battito(); // il nostro battito scopre che l'affitto non è più nostro
  unlinkSync(join(b.store, CARTELLA_AFFITTI, `${b.sessionId}.json`)); // chi l'aveva preso ha finito e rilascia
  const tel = telefono();
  await apri(b, tel);
  const vistaLaCoda = testi(tel.ricevuti).includes('Scritto da chi ha preso l affitto');
  let scrittura = 'ok';
  try { await b.operazioni.esegui('session.send', { sessionId: b.sessionId, corpo: { messaggio: 'dal telefono' } }, tel.contesto); } catch (e) { scrittura = `rifiutata ${e?.code}`; }
  await pausa(80);
  b.finto.avvii[1]?.concludi('Risposta.');
  await pausa(200);
  const sequenze = sequenzeSulDisco(b.store, b.sessionId);
  const doppie = sequenze.filter((n, i) => sequenze.indexOf(n) !== i);
  t.diagnostic(`A14: apertura dopo il rilascio vede la coda dell altro: ${vistaLaCoda} (ultima ${ultimaSequenza(tel.ricevuti)} su ${ultima}); scrittura dal telefono ${scrittura}; giri partiti qui ${b.finto.avvii.length}; sequenze sul disco ${JSON.stringify(sequenze)}; DOPPIE ${JSON.stringify(doppie)}; dimensione nota ${b.affitti.dimensioneNota(b.sessionId)}`);
  // le asserzioni della cura (il revisore aveva solo la diagnostica)
  /* L'apertura dal TELEFONO passa dalla porta dell'allineamento solo con la cura S3 (`allineaSessioneDaFuori`, ramo
     `cura/s3-remoto-riallinea-2026-11-08`, nell'unione P4 sulla candidata, non ancora in questa base): con S3 la coda si vede già
     all'apertura; senza, la stessa cosa la prova REV-A14-bis dalla porta HTTP. */
  const conS3 = readFileSync(new URL('../src/remoto/operazioni.mjs', import.meta.url), 'utf8').includes('allineaSessioneDaFuori');
  if (conS3) assert.equal(vistaLaCoda, true, 'the phone opening after the release sees what the taker wrote');
  else t.diagnostic('without S3 in this base the phone subscription does not align: REV-A14-bis proves the same through the HTTP door');
  assert.equal(scrittura, 'ok', 'the phone write is accepted (the chat reloads by itself, no card)');
  assert.deepEqual(doppie, [], 'no order number is used twice on the disk');
  assert.equal(b.finto.avvii.length, 2, 'exactly one new turn started here');
});

test('REV-A14-bis the same takeover, opened through the HTTP door (the gate that aligns): the chat shows the taker turn, then a write from here has no number twice', async (t) => {
  const b = await banco(t);
  affittoAltrui(b.store, b.sessionId);
  giroAltrove(b.store, b.sessionId, 'Scritto da chi ha preso l affitto');
  b.affitti.battito();
  unlinkSync(join(b.store, CARTELLA_AFFITTI, `${b.sessionId}.json`));
  // il cancello di http-app allinea PRIMA della rotta (anche se la rotta GET della sola sessione risponde 404 qui)
  await b.chiama({ metodo: 'GET', percorso: `/api/v1/sessions/${b.sessionId}` }).catch(() => null);
  assert.ok(testi(b.registro.esporta(b.sessionId).eventi).includes('Scritto da chi ha preso l affitto'), 'opening reloads the chat');
  await b.operazioni.esegui('session.send', { sessionId: b.sessionId, corpo: { messaggio: 'dal telefono' } }, telefono().contesto);
  await pausa(80);
  b.finto.avvii[1]?.concludi('Risposta.');
  await pausa(200);
  assert.deepEqual(doppieDi(sequenzeSulDisco(b.store, b.sessionId)), []);
});

// ─────────────────────────────── pezzo 1: l'affitto sa di essere compromesso ───────────────────────────────

function affittiConOrologio(store, extra = {}) {
  let ora = 1_000_000;
  const a = creaAffittiArchivio({
    cartellaStore: store, percorsoGiornale: (id) => giornale(store, id), etichetta: 'test', adesso: () => ora,
    impostaIntervallo: () => ({ unref() {} }), cancellaIntervallo: () => {}, ...extra,
  });
  return { a, avanza: (ms) => { ora += ms; } };
}
const fileAffitto = (store, id) => join(store, CARTELLA_AFFITTI, `${id}.json`);

test('COMP-1-01: after a suspension the idle heartbeat finds the lease taken and the journal written: compromised, the known size is NOT updated, the chat must reload', (t) => {
  const store = cartellaTemp(t);
  const { a, avanza } = affittiConOrologio(store);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  assert.deepEqual(a.prendi('s1'), { preso: true, nuovo: true });
  avanza(31_000); // sospeso oltre la scadenza
  affittoAltrui(store, 's1'); // l'altro ha preso l'affitto
  appendFileSync(giornale(store, 's1'), '{"b":2}\n'); // e ha scritto
  a.battito();
  assert.equal(a.tiene('s1'), false);
  assert.equal(a.dimensioneNota('s1'), 8, 'the size with the other process writes inside is never "known"');
  assert.equal(a.daRicaricare('s1'), true);
  assert.equal(a.cambiatoAltrove('s1'), true);
  assert.equal(JSON.parse(readFileSync(fileAffitto(store, 's1'), 'utf8')).istanza, ALTRA, 'the other process lease is untouched');
});

test('COMP-1-02: release after a takeover looks at the owner FIRST: the known size stays, the chat must reload, the other lease stays', (t) => {
  const store = cartellaTemp(t);
  const { a } = affittiConOrologio(store);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  a.prendi('s1');
  affittoAltrui(store, 's1');
  appendFileSync(giornale(store, 's1'), '{"b":2}\n');
  assert.equal(a.rilascia('s1'), true);
  assert.equal(a.dimensioneNota('s1'), 8);
  assert.equal(a.daRicaricare('s1'), true);
  assert.equal(existsSync(fileAffitto(store, 's1')), true, 'not ours: never removed');
});

test('COMP-1-03: in use, the heartbeat after a suspension finds the lease gone (taken, written, released): compromised and to reload', (t) => {
  const store = cartellaTemp(t);
  const { a, avanza } = affittiConOrologio(store);
  a.aggiungiInUso(() => true);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  a.prendi('s1');
  avanza(31_000);
  appendFileSync(giornale(store, 's1'), '{"b":2}\n'); // l'altro ha scritto e rilasciato
  unlinkSync(fileAffitto(store, 's1'));
  a.battito();
  assert.equal(a.tiene('s1'), false);
  assert.equal(a.daRicaricare('s1'), true, 'a lost lease is a chat to reload, not just a lease to take again');
});

test('COMP-1-04: a 31 s stall with NOBODY else (no suspension of the others): no reload, no refusal, the next write goes through', async (t) => {
  const store = cartellaTemp(t);
  let ora = Date.now();
  const affitti = attivaAffittiArchivio(store, { etichetta: 'test', adesso: () => ora, battitoMs: 0, rilascioDopoMs: 30_000 });
  t.after(() => disattivaAffittiArchivio(store));
  affitti.aggiungiInUso(() => true);
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 1 } });
  ora += 31_000;
  affitti.battito();
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 2 } });
  assert.equal(affitti.daRicaricare('s1'), false);
  assert.deepEqual(sequenzeSulDisco(store, 's1'), [1, 2]);
});

test('COMP-1-05: a lease deleted by hand while only WE wrote: no false «changed elsewhere»; if someone writes after the deletion, refused', async (t) => {
  const store = cartellaTemp(t);
  const affitti = attivaAffittiArchivio(store, { etichetta: 'test', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  writeFileSync(giornale(store, 's1'), '{"tipo":"intestazione"}\n');
  affitti.ricordaDimensione('s1', statSync(giornale(store, 's1')).size); // come dopo il ripristino
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 1 } }); // una nostra scrittura
  unlinkSync(fileAffitto(store, 's1')); // cancellato a mano
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 2 } });
  assert.deepEqual(sequenzeSulDisco(store, 's1'), [1, 2], 'our own writes are not «elsewhere»');
  unlinkSync(fileAffitto(store, 's1'));
  appendFileSync(giornale(store, 's1'), '{"type":"Y","_sequenza":3}\n'); // ora sì: un altro
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 3 } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  assert.deepEqual(sequenzeSulDisco(store, 's1'), [1, 2, 3]);
});

/* 13/11/2026, dai mutanti sopravvissuti del primo giro (P1-a, P1-e, P1-g, P1-h): ogni ramo del pezzo 1 col suo caso, senza che un
   altro ramo lo copra (il rilascio per inattività copriva il battito, il rinfresco del battito copriva la presa). */
test('COMP-1-06: in use and NOT stale, the heartbeat finds the lease taken: compromised at once, and the other lease is never refreshed by us', (t) => {
  const store = cartellaTemp(t);
  const { a } = affittiConOrologio(store);
  a.aggiungiInUso(() => true);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  a.prendi('s1');
  affittoAltrui(store, 's1');
  appendFileSync(giornale(store, 's1'), '{"b":2}\n');
  const quando = new Date(5_000_000_000);
  utimesSync(fileAffitto(store, 's1'), quando, quando);
  a.battito();
  assert.equal(a.tiene('s1'), false, 'not ours: no longer held');
  assert.equal(a.daRicaricare('s1'), true);
  assert.equal(statSync(fileAffitto(store, 's1')).mtimeMs, 5_000_000_000, 'the other process lease is not touched');
});

test('COMP-1-07: a take with the lease still in our map but the file taken by another: refused AND the chat is marked to reload at once (before any heartbeat)', (t) => {
  const store = cartellaTemp(t);
  const { a } = affittiConOrologio(store);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  a.prendi('s1');
  affittoAltrui(store, 's1');
  appendFileSync(giornale(store, 's1'), '{"b":2}\n');
  assert.equal(a.prendi('s1').preso, false);
  assert.equal(a.daRicaricare('s1'), true);
});

test('COMP-1-08: a release after a stall longer than the expiry, the file still ours, never takes the journal as it is now for known (bytes nobody saw us write)', (t) => {
  const store = cartellaTemp(t);
  const { a, avanza } = affittiConOrologio(store);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  a.prendi('s1');
  avanza(31_000);
  appendFileSync(giornale(store, 's1'), '{"b":2}\n'); // scritto mentre eravamo fermi (chi non ha guardato l'affitto)
  a.rilascia('s1');
  assert.equal(a.dimensioneNota('s1'), 8, 'the known size stays the one of our writes');
  assert.equal(a.cambiatoAltrove('s1'), true);
});

test('COMP-1-09: a take right after a wake (the file still ours, older than the expiry) refreshes the lease file at once, so no other process can take it as expired', (t) => {
  const store = cartellaTemp(t);
  const { a, avanza } = affittiConOrologio(store);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.prendi('s1');
  const vecchio = new Date(1_000_000);
  utimesSync(fileAffitto(store, 's1'), vecchio, vecchio);
  avanza(60_000);
  assert.deepEqual(a.prendi('s1'), { preso: true, nuovo: false });
  assert.ok(Math.abs(statSync(fileAffitto(store, 's1')).mtimeMs - 1_060_000) < 2_000, `refreshed to the wake time (${statSync(fileAffitto(store, 's1')).mtimeMs})`);
});

// ─────────────────────────────── pezzo 2: il recinto alla scrittura ───────────────────────────────

test('COMP-2-01: the fence looks at the FILE, not the lease: a journal grown by someone else while our lease still looks fine refuses the write, nothing written', async (t) => {
  const store = cartellaTemp(t);
  const affitti = attivaAffittiArchivio(store, { etichetta: 'test', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 1 } });
  assert.equal(affitti.tiene('s1'), true);
  appendFileSync(giornale(store, 's1'), '{"type":"Y","_sequenza":2,"da":"altrove"}\n'); // un processo fermo che riprende e scrive
  const prima = readFileSync(giornale(store, 's1'), 'utf8');
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 2 } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  assert.throws(() => registraRigaSync({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 2 } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  assert.equal(readFileSync(giornale(store, 's1'), 'utf8'), prima, 'nothing written');
});

test('COMP-2-02: the fence on the order number: a row whose number is not above the last one known on the disk is refused (a stale counter), the next one passes', async (t) => {
  const store = cartellaTemp(t);
  const affitti = attivaAffittiArchivio(store, { etichetta: 'test', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  writeFileSync(giornale(store, 's1'), '{"type":"X","_sequenza":5}\n');
  affitti.ricordaDimensione('s1', statSync(giornale(store, 's1')).size, 5); // una lettura intera: ultimo numero 5
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 5 } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 3 } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 7 } }); // un buco è ammesso
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { tipo: 'senza-numero' } });
  assert.deepEqual(sequenzeSulDisco(store, 's1'), [5, 7]);
});

test('COMP-2-03: 1,000 normal writes (async, sync, rows without a number) never meet a false «changed elsewhere»; the cost is printed', async (t) => {
  const store = cartellaTemp(t);
  attivaAffittiArchivio(store, { etichetta: 'test', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const testo = 'x'.repeat(1_500);
  let rifiuti = 0;
  const inizio = process.hrtime.bigint();
  for (let i = 1; i <= 1_000; i += 1) {
    const record = i % 10 === 0 ? { tipo: 'messaggiFinali', i, testo } : { type: 'TextMessageContent', _sequenza: i, delta: testo };
    try {
      if (i % 3 === 0) registraRigaSync({ cartellaStore: store, sessionId: 's1', record });
      else await registraRiga({ cartellaStore: store, sessionId: 's1', record });
    } catch (errore) { if (errore?.code === 'SESSION_CHANGED_ELSEWHERE') rifiuti += 1; else throw errore; }
  }
  const ms = Number(process.hrtime.bigint() - inizio) / 1e6;
  t.diagnostic(`1000 writes in ${ms.toFixed(1)} ms (${(ms / 1000).toFixed(3)} ms per write); false refusals ${rifiuti}`);
  assert.equal(rifiuti, 0);
  assert.equal(righe(store, 's1').length, 1_000);
});

test('COMP-2-04 (giudice v1656): a command result refused by the fence is re-appended BY ITSELF — the command ran ONCE, the model turn ran once, no number twice', async (t) => {
  const stato = { sessionId: null, store: null, contatore: null, vistiDalVivo: [] };
  const avvii = [];
  const b = await banco(t, {
    avviaSessioneFn: async (input) => {
      avvii.push(input);
      while (!stato.sessionId) await pausa(5);
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      input.onEvento({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' });
      input.onEvento({ type: 'ToolCallEnd', toolCallId: 'c1' });
      // il comando: un effetto contato nel profilo finto
      const n = Number(existsSync(stato.contatore) ? readFileSync(stato.contatore, 'utf8') : '0') + 1;
      writeFileSync(stato.contatore, String(n));
      await pausa(60); // le scritture del giro arrivano sul disco
      giroAltrove(stato.store, stato.sessionId, 'Scritto altrove mentre il comando girava'); // un altro processo, coi numeri che continuano dal disco
      input.onEvento({ type: 'ToolCallResult', toolCallId: 'c1', content: 'uscita del comando' });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso' } };
    },
  });
  stato.store = b.store;
  stato.contatore = join(b.lavoro, 'contatore-comando.txt');
  b.registro.iscriviti(b.sessionId, (evento) => { stato.vistiDalVivo.push({ type: evento.type, n: evento._sequenza }); });
  stato.sessionId = b.sessionId;
  await pausa(600);
  const disco = righe(b.store, b.sessionId);
  const sequenze = disco.map((r) => r._sequenza).filter((n) => typeof n === 'number');
  const risultati = disco.filter((r) => r.type === 'ToolCallResult');
  const altrove = disco.filter((r) => typeof r.runId === 'string' && r.runId.startsWith('altrove-'));
  t.diagnostic(`sul disco ${JSON.stringify(disco.map((r) => `${r.type ?? r.tipo}:${r._sequenza ?? '-'}`))}`);
  assert.equal(readFileSync(stato.contatore, 'utf8'), '1', 'the command ran exactly once');
  assert.equal(avvii.length, 1, 'the model turn ran exactly once');
  assert.equal(risultati.length, 1, 'the command result is on the disk exactly once');
  assert.deepEqual(doppieDi(sequenze), [], 'no order number twice');
  /* 14/11/2026 (mai riscrivere): il risultato tiene il numero già mostrato; sono le righe dell'altro a prendere numeri sopra */
  assert.equal(risultati[0]._sequenza, stato.vistiDalVivo.find((e) => e.type === 'ToolCallResult')?.n, 'the result keeps the number shown live');
  assert.ok(Math.min(...altrove.map((r) => r._sequenza)) > risultati[0]._sequenza, 'the other process lines take numbers above the result already shown');
  assert.equal(disco.filter((r) => r.type === 'RunFinished' && r.runId === 'r1').length, 1, 'the end of the turn is on the disk too');
  // chi si ricollega col numero VECCHIO del risultato, dopo che la chat si è riletta: la coda dell'altro arriva, il risultato non due volte
  const vecchio = stato.vistiDalVivo.find((e) => e.type === 'ToolCallResult')?.n;
  assert.ok(Number.isSafeInteger(vecchio));
  await b.registro.allineaSessione(b.sessionId, { scrivere: false });
  const ricollegato = [];
  const smetti = b.registro.iscriviti(b.sessionId, (evento) => { ricollegato.push(evento); }, vecchio);
  smetti();
  assert.ok(testi(ricollegato).includes('Scritto altrove mentre il comando girava'), 'the other process tail arrives to a client with the old cursor');
  assert.equal(ricollegato.filter((e) => e.type === 'ToolCallResult').length, 0, 'the result the client already had does not arrive twice');
});

test('COMP-2-05: 10 typical tasks (text only, 1-4 commands, notes, several messages) never meet the fence: 0 refusals, 0 redone writes, 0 reloads', async (t) => {
  const stato = { pronto: false, giri: 0 };
  const b = await banco(t, {
    avviaSessioneFn: async (input) => {
      while (!stato.pronto) await pausa(5);
      stato.giri += 1;
      const k = stato.giri;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${k}` });
      for (let c = 0; c < k % 5; c += 1) { // 0..4 comandi
        const id = `c${k}-${c}`;
        input.onEvento({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell' });
        input.onEvento({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando: `npm test -- ${c}` }) });
        input.onEvento({ type: 'ToolCallEnd', toolCallId: id });
        await pausa(2);
        input.onEvento({ type: 'ToolCallResult', toolCallId: id, content: `uscita ${c}` });
      }
      if (k % 3 === 0) input.onEvento({ type: 'CUSTOM', name: 'talos.nota', value: { n: k } });
      for (let m = 0; m < 1 + (k % 2); m += 1) {
        const id = `m${k}-${m}`;
        input.onEvento({ type: 'TextMessageStart', messageId: id, role: 'assistant' });
        for (let p = 0; p < 3; p += 1) input.onEvento({ type: 'TextMessageContent', messageId: id, delta: `parte ${p} del giro ${k} ` });
        input.onEvento({ type: 'TextMessageEnd', messageId: id });
      }
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k}`, outcome: { type: 'success' }, result: { detto: `Fatto ${k}.` } });
      return { ok: true, esito: { detto: `Fatto ${k}.`, comeFinita: 'concluso' } };
    },
  });
  const conti = { adozioni: 0, cambiate: 0 };
  if (typeof b.affitti.adotta === 'function') { // la base non ha il recinto: lì la prova è solo di non regressione
    const adotta = b.affitti.adotta; b.affitti.adotta = (...a) => { conti.adozioni += 1; return adotta(...a); };
    const segna = b.affitti.segnaCambiato; b.affitti.segnaCambiato = (...a) => { conti.cambiate += 1; return segna(...a); };
  }
  stato.pronto = true;
  await pausa(150);
  const tel = telefono();
  for (let giro = 2; giro <= 10; giro += 1) {
    /* 14/11/2026: con la macchina carica il giro di prima può non essere ancora chiuso (3 corse dei mutanti su 30, con mutanti che
       non toccano questa strada: «still running», mai il recinto): si riprova finché si chiude, mai più di 5 s */
    for (let tentativo = 0; ; tentativo += 1) {
      try {
        await b.operazioni.esegui('session.send', { sessionId: b.sessionId, corpo: { messaggio: `compito ${giro}` } }, tel.contesto);
        break;
      } catch (errore) {
        if (errore?.reason !== 'running-wait-resume' || tentativo >= 250) throw errore;
        await pausa(20);
      }
    }
    for (let attesa = 0; attesa < 100 && stato.giri < giro; attesa += 1) await pausa(10);
    await pausa(120);
  }
  /* 14/11/2026: l'ultimo giro si aspetta dal suo assestamento e dalla coda dello store, non dalla pausa (8-9 su 10 sul disco con la
     macchina carica, sulla base come sulla testa) */
  await b.registro.attendiAssestamento(b.sessionId);
  await attendiScritture({ cartellaStore: b.store, sessionId: b.sessionId });
  const sequenze = sequenzeSulDisco(b.store, b.sessionId);
  const disco = righe(b.store, b.sessionId);
  t.diagnostic(`10 compiti: giri ${stato.giri}, eventi numerati ${sequenze.length}, adozioni ${conti.adozioni}, recinto per dimensione ${conti.cambiate}, da ricaricare ${b.affitti.daRicaricare?.(b.sessionId) ?? '-'}`);
  assert.equal(stato.giri, 10, 'the ten tasks ran');
  assert.equal(disco.filter((r) => r.type === 'RunFinished').length, 10, 'the ten tasks are on the disk');
  assert.deepEqual(doppieDi(sequenze), [], 'no order number twice');
  assert.equal(conti.adozioni, 0, 'no write redone after the fence');
  assert.equal(conti.cambiate, 0, 'the fence never saw the journal changed');
  assert.notEqual(b.affitti.daRicaricare?.(b.sessionId), true, 'no reload');
});

test('COMP-2-06: the confirmed write (the one with a precondition) is fenced too: a journal grown elsewhere refuses it, nothing written, the journal not poisoned', async (t) => {
  const store = cartellaTemp(t);
  attivaAffittiArchivio(store, { etichetta: 'test', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 1 } });
  appendFileSync(giornale(store, 's1'), '{"type":"Y","_sequenza":2,"da":"altrove"}\n');
  let confermata = false;
  await assert.rejects(registraRigaConfermata({ cartellaStore: store, sessionId: 's1', record: { type: 'X', _sequenza: 2 }, confermaFn: () => { confermata = true; } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  assert.equal(confermata, false);
  assert.deepEqual(righe(store, 's1').map((r) => `${r.type}:${r._sequenza}`), ['X:1', 'Y:2'], 'nothing of ours written');
});

test('COMP-2-07: after a restore the fence already knows the last number ON THE DISK: a line with a number already used is refused even when the size matches', async (t) => {
  const store = cartellaTemp(t);
  const id = '33333333-3333-4333-8333-333333333333';
  attivaAffittiArchivio(store, { etichetta: 'test', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const intestazione = { tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:comp', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    avviataAlle: '2026-11-13T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
  const eventi = [1, 2, 3, 4, 5].map((n) => ({ type: 'CUSTOM', name: 'talos.nota', value: { n }, _sequenza: n }));
  writeFileSync(giornale(store, id), [intestazione, ...eventi].map((r) => `${JSON.stringify(r)}\n`).join(''));
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'test' }, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { n: 'doppio' }, _sequenza: 3 } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  assert.deepEqual(sequenzeSulDisco(store, id), [1, 2, 3, 4, 5]);
});

test('COMP-2-08: a synchronous durable event (the plan proposal) refused by the fence is re-appended by itself after the other process lines, once, no number twice', async (t) => {
  const stato = { pronto: false, sessionId: null };
  const store = cartellaTemp(t);
  const lavoro = cartellaTemp(t);
  attivaAffittiArchivio(store, { etichetta: 'this test', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  let attesaPiano = null;
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      while (!stato.pronto) await pausa(5);
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      await pausa(60);
      giroAltrove(store, stato.sessionId, 'Scritto altrove prima del piano');
      attesaPiano = input.presentaPianoFn?.({ plan: '## Piano\n1. Leggo `a.txt`.', toolCallId: 'call_piano', messaggi: [{ role: 'user', content: 'pianifica' }] }) ?? null;
      attesaPiano?.catch?.(() => {});
      return new Promise(() => {}); // il giro aspetta la scelta: il test guarda solo il disco
    },
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'pianifica', permessi: 'Full access', modalitaOperativa: 'piano' });
  stato.sessionId = sessionId;
  stato.pronto = true;
  await pausa(500);
  assert.ok(attesaPiano, 'the turn had the plan channel');
  const disco = righe(store, sessionId);
  const piani = disco.filter((r) => r.name === 'talos.plan');
  const altrove = disco.filter((r) => typeof r.runId === 'string' && r.runId.startsWith('altrove-'));
  t.diagnostic(`sul disco ${JSON.stringify(disco.map((r) => `${r.type ?? r.tipo}${r.name ? `/${r.name}` : ''}:${r._sequenza ?? '-'}`))}`);
  assert.equal(piani.length, 1, 'the plan proposal is on the disk once');
  /* 14/11/2026 (mai riscrivere): la proposta tiene il suo numero; le righe dell'altro, adottate nella stessa scrittura, stanno sopra */
  assert.ok(Math.min(...altrove.map((r) => r._sequenza)) > piani[0]._sequenza, 'the other process lines take numbers above the plan proposal');
  assert.deepEqual(doppieDi(sequenzeSulDisco(store, sessionId)), []);
});

// ─────────────────────────────── pezzo 3: chi legge non si fida dopo il risveglio ───────────────────────────────

test('COMP-3-01: with the lease still in hand but not refreshed for longer than the expiry (woken, first heartbeat not yet run), a reader measures the journal', (t) => {
  const store = cartellaTemp(t);
  const { a, avanza } = affittiConOrologio(store);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  a.prendi('s1');
  assert.equal(a.cambiatoAltrove('s1'), false, 'a fresh lease in hand: our own writes only');
  avanza(31_000);
  appendFileSync(giornale(store, 's1'), '{"b":2}\n'); // l'altro: preso, scritto, rilasciato
  unlinkSync(fileAffitto(store, 's1'));
  assert.equal(a.cambiatoAltrove('s1'), true, 'after the expiry the reader does not trust the lease blindly');
});

// ─────────────────────────────── pezzo 4: i lettori (senza la riparazione) ───────────────────────────────

function giornaleSporco(store, id) {
  const intestazione = { tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:comp', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    avviataAlle: '2026-11-12T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
  const giro = (run, msg, da, detto) => [
    { type: 'RunStarted', threadId: id, runId: run, _sequenza: da },
    { type: 'TextMessageStart', messageId: msg, role: 'assistant', _sequenza: da + 1 },
    { type: 'TextMessageContent', messageId: msg, delta: detto, _sequenza: da + 2 },
    { type: 'TextMessageEnd', messageId: msg, _sequenza: da + 3 },
    { type: 'RunFinished', threadId: id, runId: run, result: { detto }, _sequenza: da + 4 },
  ];
  // [1..5 giro A][6..7 altro][3..7 giro B coi numeri doppi]: il giornale `[1..7, 3, 4]` della forma, allargato a un giro intero
  const righeGiornale = [intestazione, ...giro('rA', 'mA', 1, 'giro vecchio'),
    { type: 'CUSTOM', name: 'talos.nota', value: { n: 6 }, _sequenza: 6 }, { type: 'CUSTOM', name: 'talos.nota', value: { n: 7 }, _sequenza: 7 },
    ...giro('rB', 'mB', 3, 'giro nuovo coi numeri vecchi')];
  writeFileSync(giornale(store, id), righeGiornale.map((r) => `${JSON.stringify(r)}\n`).join(''));
}

test('COMP-4-01: the dirty journal [1..7,3..7] is read WHOLE and the duplicates keep the disk order (the new turn after the old one, never in the middle)', async (t) => {
  const store = cartellaTemp(t);
  const id = '11111111-1111-4111-8111-111111111111';
  giornaleSporco(store, id);
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  const eventi = registro.esporta(id).eventi.filter((e) => typeof e._sequenza === 'number');
  const ordine = eventi.map((e) => `${e.runId ?? e.messageId ?? e.value?.n}:${e._sequenza}`);
  t.diagnostic(`ordine dopo il ripristino: ${JSON.stringify(ordine)}`);
  assert.equal(testi(eventi).length, 2, 'both turns are there');
  const indice = (pred) => eventi.findIndex(pred);
  assert.ok(indice((e) => e.type === 'RunStarted' && e.runId === 'rB') > indice((e) => e.type === 'RunFinished' && e.runId === 'rA'), 'the new turn starts after the old one ends');
  assert.ok(indice((e) => e.type === 'RunStarted' && e.runId === 'rB') > indice((e) => e.value?.n === 7), 'and after everything the disk has before it');
});

test('COMP-4-02: the spend of the service rows counts two DIFFERENT rows with the same number (a journal written by two processes), a replayed row once', () => {
  const riga = (n, prompt) => ({ type: 'CUSTOM', name: NOME_CONSUMO_DI_SERVIZIO, _sequenza: n, value: { scopo: 'riassunto', at: `a${prompt}`, usage: { prompt_tokens: prompt, completion_tokens: 1 } } });
  const conto = servizioDaEventi([riga(3, 10), riga(3, 20), riga(3, 20)]);
  assert.equal(conto.prompt_tokens, 30);
  assert.equal(conto.misurate, 2);
});

test('COMP-4-03: the SSE stream sends an event under the cursor when the sender already applied the cursor (the tail of another process with old numbers)', () => {
  const scritto = [];
  const response = { write: (s) => { scritto.push(s); return true; }, writeHead() {}, on() {}, once() {}, removeListener() {}, flushHeaders() {} };
  const sse = createSseSession({ response, lastEventId: 10, filtraPerCursore: false, heartbeatMs: 0 });
  assert.equal(sse.send({ type: 'RunStarted', _sequenza: 4 }), true);
  const filtrata = createSseSession({ response, lastEventId: 10, heartbeatMs: 0 });
  assert.equal(filtrata.send({ type: 'RunStarted', _sequenza: 4 }), false, 'by default the cursor still filters (the other callers)');
});

test('COMP-4-05: the real HTTP stream, a window reconnecting with the OLD number of a renumbered event (Last-Event-ID): the other process tail arrives, the event it had does not arrive twice', async (t) => {
  const stato = { sessionId: null, store: null, vistiDalVivo: [] };
  /* 13/11/2026 sera (giudice v1804 punto 7): solo eventi — l'avvio aspetta la sessione, le scritture del giro e la fine del giro si
     aspettano dalla coda dello store e dall'assestamento, mai con una pausa */
  let pronta;
  const sessionePronta = new Promise((ok) => { pronta = ok; });
  let giroFinito;
  const fineGiro = new Promise((ok) => { giroFinito = ok; });
  const b = await banco(t, {
    soloEventi: true,
    avviaSessioneFn: async (input) => {
      await sessionePronta;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      input.onEvento({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' });
      input.onEvento({ type: 'ToolCallEnd', toolCallId: 'c1' });
      await attendiScritture({ cartellaStore: stato.store, sessionId: stato.sessionId }); // le scritture del giro sono sul disco
      giroAltrove(stato.store, stato.sessionId, 'Scritto altrove, visto dal flusso');
      input.onEvento({ type: 'ToolCallResult', toolCallId: 'c1', content: 'uscita del comando' });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      giroFinito();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso' } };
    },
  });
  stato.store = b.store;
  b.registro.iscriviti(b.sessionId, (evento) => { stato.vistiDalVivo.push({ type: evento.type, n: evento._sequenza }); });
  stato.sessionId = b.sessionId;
  pronta();
  await fineGiro;
  await b.registro.attendiAssestamento(b.sessionId);
  await attendiScritture({ cartellaStore: b.store, sessionId: b.sessionId });
  const vecchio = stato.vistiDalVivo.find((e) => e.type === 'ToolCallResult')?.n;
  assert.ok(Number.isSafeInteger(vecchio));
  await b.registro.allineaSessione(b.sessionId, { scrivere: false });
  const { createServer } = await import('node:http');
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: b.registro }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }));
  const controller = new AbortController();
  const risposta = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions/${b.sessionId}/events`, { headers: { 'Last-Event-ID': String(vecchio) }, signal: controller.signal });
  assert.equal(risposta.status, 200);
  const lettore = risposta.body.getReader();
  const decoder = new TextDecoder();
  const arrivati = [];
  let testo = '';
  try {
    for (let fine = false; !fine;) {
      const { value, done } = await lettore.read();
      if (done) break;
      testo += decoder.decode(value, { stream: true });
      let i;
      while ((i = testo.indexOf('\n\n')) >= 0) {
        const frame = testo.slice(0, i); testo = testo.slice(i + 2);
        const dati = frame.split('\n').filter((r) => r.startsWith('data: ')).map((r) => r.slice(6)).join('\n');
        if (!dati) continue;
        const evento = JSON.parse(dati);
        if (evento.type === 'CUSTOM' && evento.name === 'talos.fine-rigiocata') { fine = true; break; }
        arrivati.push(evento);
      }
    }
  } finally { controller.abort(); }
  assert.ok(testi(arrivati).includes('Scritto altrove, visto dal flusso'), `the other process tail arrives on the HTTP stream (${JSON.stringify(arrivati.map((e) => `${e.type}:${e._sequenza}`))})`);
  const altrove = righe(b.store, b.sessionId).filter((r) => typeof r.runId === 'string' && r.runId.startsWith('altrove-')).map((r) => r._sequenza);
  const altroveScritti = righeScritte(b.store, b.sessionId).filter((r) => typeof r.runId === 'string' && r.runId.startsWith('altrove-')).map((r) => r._sequenza);
  assert.ok(altroveScritti.some((n) => n <= vecchio), `premise: the other process WROTE the number the window holds (${altroveScritti} vs ${vecchio})`);
  const arrivatiAltrove = arrivati.filter((e) => typeof e.runId === 'string' && e.runId.startsWith('altrove-')).map((e) => e._sequenza);
  assert.deepEqual(arrivatiAltrove, altrove, 'ALL of it, also the line under the window cursor (one filter by cursor, not two)');
  assert.equal(arrivati.filter((e) => e.type === 'ToolCallResult').length, 0, 'the result the window already had does not arrive twice');
});

test('COMP-4-04: a reload delivers to an open listener the events of another process written under numbers already used here', async (t) => {
  const b = await banco(t);
  const ricevuti = [];
  const smetti = b.registro.iscriviti(b.sessionId, (evento) => { ricevuti.push(evento); });
  t.after(smetti);
  b.affitti.rilascia(b.sessionId);
  // l'altro processo aveva una copia vecchia: scrive coi numeri dall'1 (tutti già usati qui: il primo giro di qui ha 1 e 2)
  await attendiScritture({ cartellaStore: b.store, sessionId: b.sessionId }); // il primo giro sul disco (13/11 sera: l'evento, non una pausa)
  const ultimaQui = Math.max(...sequenzeSulDisco(b.store, b.sessionId));
  assert.ok(ultimaQui >= 2);
  const ev = (type, n, extra) => ({ type, _sequenza: n, ...extra });
  appendFileSync(giornale(b.store, b.sessionId), [ev('RunStarted', 1, { threadId: b.sessionId, runId: 'vecchi' }),
    ev('TextMessageContent', 2, { messageId: 'm-vecchi', delta: 'scritto coi numeri vecchi' })]
    .map((r) => `${JSON.stringify(r)}\n`).join(''));
  const allineamento = await b.registro.allineaSessione(b.sessionId, { scrivere: false });
  assert.equal(allineamento.ricaricata, true);
  assert.ok(testi(ricevuti).includes('scritto coi numeri vecchi'), 'the open listener receives them');
});

// ─────────────────────────────── due processi veri ───────────────────────────────

const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-compromesso-figlio.mjs', import.meta.url));

test('COMP-DUE-PROCESSI: a REAL process stalls past the expiry holding the lease; this one takes it, writes, releases; the woken one is refused and never writes a number twice', async (t) => {
  const store = cartellaTemp(t);
  const id = 's1';
  const figlio = spawn(process.execPath, [FIGLIO, store, id], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { figlio.kill(); } catch { /* già uscito */ } });
  let uscita = '';
  figlio.stdout.on('data', (d) => { uscita += d; });
  figlio.stderr.on('data', (d) => { uscita += d; });
  const aspetta = (re, ms = 15_000) => new Promise((ok, ko) => {
    const scade = setTimeout(() => ko(new Error(`child did not print ${re}: ${uscita}`)), ms);
    const guarda = () => { const m = re.exec(uscita); if (m) { clearTimeout(scade); ok(m); } else setTimeout(guarda, 10); };
    guarda();
  });
  const fine = new Promise((ok) => figlio.on('exit', (code) => ok(code)));
  await aspetta(/FERMO/u);
  await pausa(900); // oltre la scadenza del figlio (600 ms), che non rinfresca mentre è fermo
  attivaAffittiArchivio(store, { etichetta: 'the parent', battitoMs: 0, scadenzaMs: 600 });
  const sulDisco = Math.max(...sequenzeSulDisco(store, id));
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'X', da: 'padre', _sequenza: sulDisco + 1 } });
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'X', da: 'padre', _sequenza: sulDisco + 2 } });
  disattivaAffittiArchivio(store); // rilascia
  const [, esito] = await aspetta(/ESITO (\S+)/u, 20_000);
  await fine;
  const sequenze = sequenzeSulDisco(store, id);
  t.diagnostic(`figlio: ${esito}; sequenze sul disco ${JSON.stringify(sequenze)}`);
  assert.equal(esito, 'SESSION_CHANGED_ELSEWHERE', 'the woken child is refused');
  assert.deepEqual(doppieDi(sequenze), []);
});
