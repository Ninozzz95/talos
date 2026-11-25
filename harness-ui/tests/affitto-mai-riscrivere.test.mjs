import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

/*
 * ⭐⭐⭐ 14/11/2026 — TERZO GIRO DELL'AFFITTO, «MAI RISCRIVERE» (scelta dell'owner letta alle 07:54, giudice v1838; forma
 *   `in-corso/FORMA-AFFITTO-MAI-RISCRIVERE-2026-11-14.md`). Le forme sono quelle del ROSSO del revisore affitto 2 di 3 (tre processi
 *   Node veri, nessuna iniezione): «scrive30» e «tutti» (righe perse mentre l'altro rinumera), il riaggancio dopo una ricarica e dopo un
 *   riavvio (253/290 e 650/1100), i numeri già mostrati che passano a un'altra riga (~23 per corsa).
 *   Il numero «giusto» di una riga lo dice l'ORACOLO qui sotto (`vistaDelDisco`), scritto a parte dal codice: la regola V della forma.
 *   Solo cartelle del TEMP (finto, nella coda); mai tolte da qui.
 */
const CORSE = Number(process.env.MR_CORSE || 3);
const cartellaTemp = () => mkdtempSync(join(tmpdir(), 'mr-'));
const giornale = (store, id) => join(store, `${id}.jsonl`);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.delta ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}`;
const impronta = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const identita = (p) => statSync(p, { bigint: true }).ino;
const accanto = (store, id) => readdirSync(store).filter((n) => n.startsWith(`${id}.jsonl.`));
const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-mai-riscrivere-figlio.mjs', import.meta.url));

/*
 * L'ORACOLO (regola V, scritta a parte dal codice). Righe nell'ordine del disco con il byte d'inizio. 1) Le righe «adozione»
 * (`{tipo:'adozione', inizi, primo}`) danno alla riga numerata prima di loro che comincia al byte `inizi[p]` il numero primo+p; la
 * prima adozione nell'ordine del disco vince. 2) Le altre: il loro numero se nessuno l'ha preso, se no il primo libero sopra il più alto
 * visto fin lì. ⇒ `[{ ...record, _sequenza: numero della vista }]` delle sole righe numerate, nell'ordine del disco.
 */
function vistaDelDisco(percorso) {
  const righe = [];
  let pos = 0;
  for (const testo of readFileSync(percorso).toString('utf8').split('\n')) {
    const inizio = pos;
    pos += Buffer.byteLength(testo, 'utf8') + 1;
    if (!testo.trim()) continue;
    try { righe.push({ inizio, r: JSON.parse(testo) }); } catch { /* una mezza riga in coda */ }
  }
  const numero = new Map();
  const usati = new Set();
  for (const ad of righe.filter((x) => x.r?.tipo === 'adozione' && Array.isArray(x.r.inizi) && Number.isSafeInteger(x.r.primo))) {
    ad.r.inizi.forEach((inizio, p) => {
      const x = righe.find((y) => y.inizio === inizio && y.inizio < ad.inizio && Number.isSafeInteger(y.r?._sequenza));
      if (!x || numero.has(x)) return;
      numero.set(x, ad.r.primo + p); usati.add(ad.r.primo + p);
    });
  }
  let massimo = 0;
  for (const x of righe) {
    if (!Number.isSafeInteger(x.r?._sequenza)) continue;
    if (!numero.has(x)) {
      let n = x.r._sequenza;
      if (usati.has(n)) { n = massimo + 1; while (usati.has(n)) n += 1; }
      usati.add(n); numero.set(x, n);
    }
    massimo = Math.max(massimo, numero.get(x));
  }
  return righe.filter((x) => numero.has(x)).map((x) => ({ ...x.r, _sequenza: numero.get(x) }));
}
const doppiDi = (numeri) => numeri.filter((n, i) => numeri.indexOf(n) !== i);

function figlio(t, ruolo, store, opzioni = {}) {
  const f = fork(FIGLIO, [ruolo, store, JSON.stringify(opzioni)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let uscita = '';
  f.stdout.on('data', (d) => { uscita += d; });
  f.stderr.on('data', (d) => { uscita += d; });
  const attese = [];
  const arrivati = [];
  f.on('message', (m) => { const a = attese.shift(); if (a) a.ok(m); else arrivati.push(m); });
  const finito = new Promise((ok) => f.once('exit', (code, segnale) => { for (const a of attese.splice(0)) a.ko(new Error(`exited ${code}/${segnale}: ${uscita.slice(-600)}`)); ok({ code, segnale }); }));
  t.after(async () => { if (f.exitCode === null && f.signalCode === null) { f.kill('SIGKILL'); await finito; } });
  return {
    f, finito,
    prossimo: () => (arrivati.length ? Promise.resolve(arrivati.shift()) : new Promise((ok, ko) => { attese.push({ ok, ko }); })),
    invia: (m) => f.send(m),
    uccidi: async () => { f.kill('SIGKILL'); return finito; },
    fine: async () => { f.send({ fine: true }); return finito; },
  };
}

function giornaleSporco(store, { righe = 300, doppie = 100, riempi = 40 } = {}) {
  const id = randomUUID();
  const numeri = [...Array.from({ length: righe - doppie }, (_, i) => i + 1), ...Array.from({ length: doppie }, (_, i) => i + Math.max(1, righe - 2 * doppie) + 1)];
  const intest = { tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:mr', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    avviataAlle: '2026-11-14T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
  const corpo = numeri.map((n, i) => ({ type: 'CUSTOM', name: 'talos.nota', value: { id: `n${i}`, testo: 'x'.repeat(riempi) }, _sequenza: n }));
  writeFileSync(giornale(store, id), [intest, ...corpo].map((r) => `${JSON.stringify(r)}\n`).join(''));
  return id;
}

function registroDiProva(store, avviaSessioneFn = async () => ({ ok: true, esito: { detto: 'x', comeFinita: 'concluso' } })) {
  return createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'mr' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k', avviaSessioneFn,
  });
}

/* ───────────── il diario non si riscrive mai ───────────── */
test('MR-01: a journal with numbers used twice is restored without touching the file: same bytes, nothing beside it, numbers 1..9 in memory', async (t) => {
  const store = cartellaTemp();
  attivaAffittiArchivio(store, { etichetta: 'mr', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const id = randomUUID();
  const intest = { tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:mr', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' }, avviataAlle: '2026-11-14T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
  const numeri = [1, 2, 3, 4, 5, 6, 7, 3, 4];
  writeFileSync(giornale(store, id), [intest, ...numeri.map((n, i) => ({ type: 'CUSTOM', name: 'talos.nota', value: { id: `n${i}` }, _sequenza: n }))].map((r) => `${JSON.stringify(r)}\n`).join(''));
  const prima = impronta(giornale(store, id));
  const registro = registroDiProva(store);
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  await attendiScritture({ cartellaStore: store, sessionId: id });
  assert.equal(impronta(giornale(store, id)), prima, 'the journal keeps its bytes');
  assert.deepEqual(accanto(store, id), [], 'no copy and no temporary beside the journal');
  const note = registro.esporta(id).eventi.filter((e) => e.name === 'talos.nota');
  assert.deepEqual(note.map((e) => e.value.id), numeri.map((_, i) => `n${i}`), 'disk order');
  assert.deepEqual(note.map((e) => e._sequenza), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(vistaDelDisco(giornale(store, id)).map((r) => r._sequenza), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'the oracle agrees');
});

async function scriveMentreRipristina(t, { ripristinatoriFigli = 0, caricoMs = 0 } = {}) {
  const store = cartellaTemp();
  const id = giornaleSporco(store, { riempi: 3000 });
  const ino = identita(giornale(store, id));
  const scrittore = figlio(t, 'scrittore', store);
  await scrittore.prossimo();
  const altri = [];
  for (let k = 0; k < ripristinatoriFigli; k += 1) { const r = figlio(t, 'ripristino', store, { sessioni: [id] }); await r.prossimo(); altri.push(r); }
  /* 14/11/2026 (quarto giro): lo scrittore scrive per 1,5 s E almeno `ALMENO_SCRITTE` note vere (sotto carico continua di più) */
  scrittore.invia({ via: true, sessionId: id, ogniMs: 30, perMs: 1500, caricoMs, almeno: ALMENO_SCRITTE });
  await pausa(150);
  let numeriQui = null;
  const ripristino = { inizio: Date.now(), fine: null };
  if (ripristinatoriFigli === 0) {
    attivaAffittiArchivio(store, { etichetta: 'mr', battitoMs: 0 });
    t.after(() => disattivaAffittiArchivio(store));
    const registro = registroDiProva(store);
    t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
    await registro.ripristina();
    await attendiScritture({ cartellaStore: store, sessionId: id });
    numeriQui = registro.esporta(id)?.eventi?.filter((e) => Number.isSafeInteger(e._sequenza)).map((e) => [chiave(e), e._sequenza]);
  }
  const esitiAltri = [];
  for (const r of altri) r.invia({ via: true });
  for (const r of altri) esitiAltri.push(await r.prossimo());
  ripristino.fine = Date.now();
  const scritto = await scrittore.prossimo();
  scritto.durante = (scritto.istanti ?? []).filter((x) => x >= ripristino.inizio && x <= ripristino.fine).length;
  await scrittore.fine();
  for (const r of altri) await r.fine();
  const vista = vistaDelDisco(giornale(store, id));
  const sulDisco = new Set(vista.filter((r) => r.name === 'talos.nota-altrove').map((r) => r.value.id));
  const perse = scritto.riuscite.filter((x) => !sulDisco.has(x));
  return { store, id, ino, scritto, perse, vista, numeriQui, esitiAltri };
}

/* 14/11/2026 (quarto giro): «tutti» cadeva sotto carico (CPU 75%, revisore affitto 3 di 3) sulla soglia fissa «the writer really wrote»
   (più di 20 note per corsa in una finestra fissa di 1,5 s: un processo affamato ne scrive meno). La terza forma lo rifà con la macchina
   carica simulata dentro la prova (lo scrittore si ferma 70 ms prima di ogni scrittura): rossa con la soglia fissa (43 contro 60). Ora la
   soglia è legata a ciò che lo scrittore ha scritto DAVVERO: resta in scrittura finché le note riuscite non sono `ALMENO_SCRITTE` (tetto
   60 s), e la prova chiede che ogni corsa le abbia (se ogni scrittura fallisce, la corsa resta corta e la prova cade). Quante note sono
   cadute DENTRO la finestra del ripristino (`durante`) lo dice la riga CONTI. */
const ALMENO_SCRITTE = 21;
for (const [nome, opzioni] of [['scrive30: we restore while a TALOS without lease writes every 30 ms', {}], ['tutti: two TALOS restore together while a third without lease writes every 30 ms', { ripristinatoriFigli: 2 }],
  ['tutti under simulated load: the same, the writer stalls 70 ms before every write', { ripristinatoriFigli: 2, caricoMs: 70 }]]) {
  test(`MR-02 ${nome}: ${CORSE} runs, 0 lines lost, the journal is the same file, nothing beside it, 0 numbers twice, every process gives the same numbers`, async (t) => {
    const conti = { perse: 0, riuscite: 0, corseCorte: 0, durante: [], fileCambiato: 0, accanto: 0, doppi: 0, numeriDiversi: 0, errori: {} };
    for (let k = 0; k < CORSE; k += 1) {
      await t.test(`run ${k + 1}`, async (tt) => {
        const e = await scriveMentreRipristina(tt, opzioni);
        conti.perse += e.perse.length; conti.riuscite += e.scritto.riuscite.length;
        if (e.scritto.riuscite.length < ALMENO_SCRITTE) conti.corseCorte += 1;
        conti.durante.push(e.scritto.durante);
        if (identita(giornale(e.store, e.id)) !== e.ino) conti.fileCambiato += 1;
        conti.accanto += accanto(e.store, e.id).length;
        conti.doppi += doppiDi(e.vista.map((r) => r._sequenza)).length;
        for (const [c, n] of Object.entries(e.scritto.errori)) conti.errori[c] = (conti.errori[c] ?? 0) + n;
        const perChiave = new Map(e.vista.map((r) => [chiave(r), r._sequenza]));
        const insiemi = [...(e.numeriQui ? [Object.fromEntries(e.numeriQui)] : []), ...e.esitiAltri.map((x) => x.numeri[e.id] ?? {})];
        for (const numeri of insiemi) for (const [c, n] of Object.entries(numeri)) if (perChiave.has(c) && perChiave.get(c) !== n) conti.numeriDiversi += 1;
      });
    }
    t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
    assert.equal(conti.perse, 0, 'no line of the writer without lease is lost');
    assert.equal(conti.fileCambiato, 0, 'the journal is never replaced');
    assert.equal(conti.accanto, 0, 'no copy, no temporary');
    assert.equal(conti.doppi, 0, 'no number used twice in what the server shows');
    assert.equal(conti.numeriDiversi, 0, 'every process and the oracle give each line the same number');
    assert.equal(conti.corseCorte, 0, `the writer really wrote at least ${ALMENO_SCRITTE} lines in every run (${conti.riuscite} in ${CORSE} runs)`);
  });
}

/* ───────────── chi ascoltava: un numero mostrato non passa mai a un'altra riga; il riaggancio ───────────── */
async function corsa(t, { quando, pezzi = 40, dueProcessi = false, riavvia = false }) {
  const store = cartellaTemp();
  const lavoro = cartellaTemp();
  attivaAffittiArchivio(store, { etichetta: 'mr', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  let altro = null;
  if (dueProcessi) { altro = figlio(t, 'altro', store); await altro.prossimo(); }
  const stato = { sessionId: null, inVolo: [] };
  const visti = [];
  let giroFinito;
  const fineGiro = new Promise((ok) => { giroFinito = ok; });
  const registro = registroDiProva(store, async (input) => {
    while (!stato.sessionId) await pausa(5);
    input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
    input.onEvento({ type: 'TextMessageStart', messageId: 'mio', role: 'assistant' });
    await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId });
    for (let i = 0; i < pezzi; i += 1) {
      if (quando(i)) {
        if (altro) { const p = altro.prossimo(); altro.invia({ sessionId: stato.sessionId, giro: `altrove ${i}` }); stato.inVolo.push(p); }
        else {
          let n = 0;
          for (const r of readFileSync(giornale(store, stato.sessionId), 'utf8').split('\n')) { try { n = Math.max(n, JSON.parse(r)._sequenza ?? 0); } catch { /* */ } }
          const runId = `altrove-${i}`;
          const ev = (type, extra) => ({ type, _sequenza: ++n, ...extra });
          appendFileSync(giornale(store, stato.sessionId), [ev('RunStarted', { runId }), ev('TextMessageStart', { messageId: `m-${runId}` }), ev('TextMessageContent', { messageId: `m-${runId}`, delta: `altrove ${i}` }), ev('TextMessageEnd', { messageId: `m-${runId}` }), ev('RunFinished', { runId })].map((r) => `${JSON.stringify(r)}\n`).join(''));
        }
      }
      input.onEvento({ type: 'TextMessageContent', messageId: 'mio', delta: `p${String(i).padStart(2, '0')} ` });
      await pausa(1);
    }
    input.onEvento({ type: 'TextMessageEnd', messageId: 'mio' });
    input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
    giroFinito();
    return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso' } };
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  registro.iscriviti(sessionId, (e) => { visti.push({ seq: e._sequenza, k: chiave(e) }); }, 0);
  stato.sessionId = sessionId;
  await fineGiro;
  await Promise.all(stato.inVolo);
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  if (altro) await altro.fine();
  const vistiPrima = visti.length;
  await registro.allineaSessione(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  const esito = { store, sessionId, registro, visti, vistiPrima };
  if (riavvia) {
    await registro.chiudi({ attesaMassimaMs: 1000 });
    const nuovo = registroDiProva(store);
    t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
    await nuovo.ripristina();
    esito.registroRiavviato = nuovo;
  }
  return esito;
}

function misuraAscolto(e, registroDelRiaggancio) {
  const vista = vistaDelDisco(giornale(e.store, e.sessionId));
  const sulDisco = vista.map(chiave);
  const numeroDelDisco = new Map(vista.map((r) => [r._sequenza, chiave(r)]));
  const prima = e.visti.slice(0, e.vistiPrima);
  const conteggio = new Map();
  for (const v of e.visti) conteggio.set(v.k, (conteggio.get(v.k) ?? 0) + 1);
  const ultimo = Math.max(...prima.map((v) => v.seq).filter(Number.isFinite));
  const secondo = [];
  registroDelRiaggancio.iscriviti(e.sessionId, (ev) => { secondo.push(chiave(ev)); }, ultimo)();
  const giaViste = new Set(prima.map((v) => v.k));
  return {
    mancantiDalVivo: sulDisco.filter((c) => !e.visti.some((v) => v.k === c)).length,
    rivisteDalVivo: [...conteggio.values()].filter((n) => n > 1).length,
    numeroPoiAltrui: prima.filter((v) => numeroDelDisco.get(v.seq) !== v.k).length,
    mancantiAlRiaggancio: sulDisco.filter((c) => !giaViste.has(c) && !secondo.includes(c)).length,
    rivisteAlRiaggancio: secondo.filter((c) => giaViste.has(c)).length,
    doppi: doppiDi(vista.map((r) => r._sequenza)).length,
  };
}

for (const [modo, opz] of [['same process', {}], ['two processes', { dueProcessi: true }]]) {
  test(`MR-03 (${modo}): a live listener while another TALOS writes inside our turn: nothing missed, nothing twice, every number shown keeps its line; reconnecting after the reload with its last number: 0 missing, 0 seen again`, async (t) => {
    const conti = { mancantiDalVivo: 0, rivisteDalVivo: 0, numeroPoiAltrui: 0, mancantiAlRiaggancio: 0, rivisteAlRiaggancio: 0, doppi: 0 };
    for (let k = 0; k < CORSE; k += 1) {
      await t.test(`run ${k + 1}`, async (tt) => {
        const e = await corsa(tt, { quando: (i) => i % 3 === 1, ...opz });
        const m = misuraAscolto(e, e.registro);
        for (const c of Object.keys(conti)) conti[c] += m[c];
      });
    }
    t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
    assert.deepEqual(conti, { mancantiDalVivo: 0, rivisteDalVivo: 0, numeroPoiAltrui: 0, mancantiAlRiaggancio: 0, rivisteAlRiaggancio: 0, doppi: 0 });
  });
  test(`MR-04 (${modo}): the same, then the server restarts and the page reconnects with its last number: 0 missing, 0 seen again, every number shown keeps its line`, async (t) => {
    const conti = { numeroPoiAltrui: 0, mancantiAlRiaggancio: 0, rivisteAlRiaggancio: 0, numeroDopoIlRiavvioDiverso: 0 };
    for (let k = 0; k < CORSE; k += 1) {
      await t.test(`run ${k + 1}`, async (tt) => {
        const e = await corsa(tt, { quando: (i) => i % 3 === 1, riavvia: true, ...opz });
        const m = misuraAscolto(e, e.registroRiavviato);
        conti.numeroPoiAltrui += m.numeroPoiAltrui; conti.mancantiAlRiaggancio += m.mancantiAlRiaggancio; conti.rivisteAlRiaggancio += m.rivisteAlRiaggancio;
        const dopo = new Map(e.registroRiavviato.esporta(e.sessionId).eventi.filter((ev) => Number.isSafeInteger(ev._sequenza)).map((ev) => [chiave(ev), ev._sequenza]));
        for (const v of e.visti.slice(0, e.vistiPrima)) if (dopo.has(v.k) && dopo.get(v.k) !== v.seq) conti.numeroDopoIlRiavvioDiverso += 1;
      });
    }
    t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
    assert.deepEqual(conti, { numeroPoiAltrui: 0, mancantiAlRiaggancio: 0, rivisteAlRiaggancio: 0, numeroDopoIlRiavvioDiverso: 0 });
  });
}

/* ───────────── crash veri ───────────── */
test('MR-05 crash (a): a TALOS adopts lines written by another one inside its turn, then is killed; after the restart every number it had shown keeps its line', async (t) => {
  const conti = { numeriDiversi: 0, visti: 0, accanto: 0 };
  for (let k = 0; k < CORSE; k += 1) {
    await t.test(`run ${k + 1}`, async (tt) => {
      const store = cartellaTemp();
      const turno = figlio(tt, 'turno', store, { pezzi: 12, lavoro: cartellaTemp() });
      await turno.prossimo();
      turno.invia({ via: true });
      let esito;
      for (;;) {
        const m = await turno.prossimo();
        if (m?.numeri) { esito = m; break; }
        if (Number.isSafeInteger(m?.pezzo) && m.pezzo % 3 === 1) {
          let n = 0;
          for (const r of readFileSync(giornale(store, m.sessionId), 'utf8').split('\n')) { try { n = Math.max(n, JSON.parse(r)._sequenza ?? 0); } catch { /* */ } }
          appendFileSync(giornale(store, m.sessionId), [1, 2, 3].map((j) => `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: `a${m.pezzo}.${j}` }, _sequenza: n + j })}\n`).join(''));
        }
        turno.invia({ avanti: true });
      }
      const { segnale } = await turno.uccidi();
      assert.ok(segnale === 'SIGKILL' || segnale === null, 'killed');
      attivaAffittiArchivio(store, { etichetta: 'mr', battitoMs: 0 });
      tt.after(() => disattivaAffittiArchivio(store));
      const registro = registroDiProva(store);
      tt.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
      await registro.ripristina();
      const dopo = new Map(registro.esporta(esito.sessionId).eventi.filter((e) => Number.isSafeInteger(e._sequenza)).map((e) => [chiave(e), e._sequenza]));
      for (const [c, n] of Object.entries(esito.visti)) {
        conti.visti += 1;
        if (dopo.get(c) === n) continue;
        conti.numeriDiversi += 1;
        if (conti.numeriDiversi <= 6) tt.diagnostic(`DIVERSO ${c}: visto ${n}, dopo il riavvio ${dopo.get(c)}`);
        if (conti.numeriDiversi === 1 && process.env.MR_COPIA_DIARIO) writeFileSync(process.env.MR_COPIA_DIARIO, readFileSync(giornale(store, esito.sessionId)));
      }
      conti.accanto += accanto(store, esito.sessionId).length;
    });
  }
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  assert.equal(conti.numeriDiversi, 0);
  assert.ok(conti.visti > CORSE * 20);
  assert.equal(conti.accanto, 0);
});

test('MR-06 crash (b): a TALOS killed at a random moment while it restores a 3 MB journal with numbers used twice leaves the journal byte for byte and nothing beside it', async (t) => {
  const conti = { cambiati: 0, accanto: 0 };
  for (let k = 0; k < Math.max(CORSE, 3) + 2; k += 1) {
    await t.test(`run ${k + 1}`, async (tt) => {
      const store = cartellaTemp();
      const id = giornaleSporco(store, { riempi: 10000 });
      const prima = impronta(giornale(store, id));
      const r = figlio(tt, 'ripristino', store, { sessioni: [id] });
      await r.prossimo();
      r.invia({ via: true });
      await pausa(20 + Math.floor(Math.random() * 120));
      await r.uccidi();
      if (impronta(giornale(store, id)) !== prima) conti.cambiati += 1;
      conti.accanto += accanto(store, id).length;
    });
  }
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  assert.deepEqual(conti, { cambiati: 0, accanto: 0 });
});
