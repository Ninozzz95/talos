import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

/*
 * 14/11/2026 — le prove del revisore affitto 3 di 3 (`zz-rev-aff3.test.mjs` nella sua copia), portate nel ramo dal quarto giro
 *   («note e prove», owner 12:20, giudice v1862-v1864). Lente «telefono, CLI, pagina e versioni vecchie». Chi ascolta ha DUE scarti:
 *   la pagina e il telefono un Set dei numeri visti (`mobile/public/harness-ui/app.js:5909-5910`, PC `frontend/src/legacy/app.js`),
 *   la CLI un cursore (`cli/src/runtime/supervisor.ts:159` `if(sequence<=cursor)return;`). Si misurano tutti e due, dal vivo, dopo la
 *   ricarica e dopo il riavvio; più un TALOS di prima che accoda col numero grezzo dopo le adozioni; più diari fatti a mano.
 *   Oracolo scritto a parte (regola V della forma), non quello dell'autore del giro 3. Solo cartelle del TEMP (finto, nella coda);
 *   mai tolte da qui.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.delta ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}`;
const giornale = (store, id) => join(store, `${id}.jsonl`);
const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-mai-riscrivere-figlio.mjs', import.meta.url));

/* oracolo mio: byte d inizio di ogni riga intera; adozioni solo su righe numerate PRIMA della riga d adozione, la prima vince */
function oracolo(percorso) {
  const buf = readFileSync(percorso);
  const righe = [];
  let da = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] !== 10) continue;
    const testo = buf.subarray(da, i).toString('utf8').replace(/\r$/, '');
    if (testo.trim()) { try { righe.push({ inizio: da, r: JSON.parse(testo) }); } catch { /* */ } }
    da = i + 1;
  }
  const preso = new Map(); const usati = new Set();
  righe.forEach((ad, k) => {
    if (ad.r?.tipo !== 'adozione' || !Array.isArray(ad.r.inizi) || !Number.isSafeInteger(ad.r.primo) || ad.r.primo <= 0) return;
    ad.r.inizi.forEach((b, p) => {
      const j = righe.findIndex((x, jj) => jj < k && x.inizio === b && Number.isSafeInteger(x.r?._sequenza));
      if (j < 0 || preso.has(j)) return;
      preso.set(j, ad.r.primo + p); usati.add(ad.r.primo + p);
    });
  });
  let alto = 0; const out = [];
  righe.forEach((x, j) => {
    if (!Number.isSafeInteger(x.r?._sequenza)) return;
    let n = preso.get(j);
    if (n === undefined) { n = x.r._sequenza; if (usati.has(n)) { n = alto + 1; while (usati.has(n)) n += 1; } usati.add(n); }
    alto = Math.max(alto, n);
    out.push({ ...x.r, _sequenza: n });
  });
  return out;
}

const registroDi = (store, avviaSessioneFn) => createSessionRegistry({
  cartellaStore: store, affittoFraProcessi: { etichetta: 'ra3' }, guardaWorkspaceFn: () => () => {},
  preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
  modello: 'm', chiave: 'k', avviaSessioneFn: avviaSessioneFn ?? (async () => ({ ok: true, esito: { detto: 'x', comeFinita: 'concluso' } })),
});

/* un ascoltatore come la pagina (Set) e come la CLI (cursore) */
function ascoltatori() {
  const pagina = { visti: new Set(), nascoste: [], mostrate: new Map() };
  const cli = { cursore: 0, nascoste: [], mostrate: new Map() };
  const su = (e) => {
    if (!Number.isSafeInteger(e._sequenza)) return;
    const c = chiave(e);
    if (pagina.visti.has(e._sequenza)) pagina.nascoste.push(c); else { pagina.visti.add(e._sequenza); if (!pagina.mostrate.has(c)) pagina.mostrate.set(c, e._sequenza); else pagina.nascoste.push(`DUE VOLTE ${c}`); }
    if (e._sequenza <= cli.cursore) cli.nascoste.push(c); else { cli.cursore = e._sequenza; if (!cli.mostrate.has(c)) cli.mostrate.set(c, e._sequenza); else cli.nascoste.push(`DUE VOLTE ${c}`); }
  };
  return { pagina, cli, su };
}

function figlio(t, ruolo, store) {
  const f = fork(FIGLIO, [ruolo, store, '{}'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  f.stdout.on('data', () => {}); f.stderr.on('data', () => {});
  const attese = []; const arrivati = [];
  f.on('message', (m) => { const a = attese.shift(); if (a) a(m); else arrivati.push(m); });
  const finito = new Promise((ok) => f.once('exit', ok));
  t.after(async () => { if (f.exitCode === null && f.signalCode === null) { f.kill('SIGKILL'); await finito; } });
  return { prossimo: () => (arrivati.length ? Promise.resolve(arrivati.shift()) : new Promise((ok) => attese.push(ok))), invia: (m) => f.send(m), fine: async () => { f.send({ fine: true }); await finito; } };
}

/* un giro di 30 pezzi; l altro (stesso processo, o un processo vero che scrive ogni 4 ms mescolato) scrive dentro */
async function giro(t, { modo = 'stesso', pezzi = 30 } = {}) {
  const store = mkdtempSync(join(tmpdir(), 'ra3-t-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'ra3-tl-'));
  attivaAffittiArchivio(store, { etichetta: 'ra3', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const scrittore = modo === 'scrive' ? figlio(t, 'scrittore', store) : null;
  if (scrittore) await scrittore.prossimo();
  const stato = { sessionId: null }; let finito; const fine = new Promise((ok) => { finito = ok; });
  const registro = registroDi(store, async (input) => {
    while (!stato.sessionId) await pausa(5);
    input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
    input.onEvento({ type: 'TextMessageStart', messageId: 'mio', role: 'assistant' });
    await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId });
    let fatto = null;
    if (scrittore) { scrittore.invia({ via: true, sessionId: stato.sessionId, ogniMs: 4, perMs: 250 }); fatto = scrittore.prossimo(); }
    for (let i = 0; i < pezzi; i += 1) {
      if (modo === 'stesso' && i % 3 === 1) {
        let n = 0;
        for (const r of readFileSync(giornale(store, stato.sessionId), 'utf8').split('\n')) { try { n = Math.max(n, JSON.parse(r)._sequenza ?? 0); } catch { /* */ } }
        const runId = `altrove-${i}`; const ev = (type, extra) => ({ type, _sequenza: ++n, ...extra });
        appendFileSync(giornale(store, stato.sessionId), [ev('RunStarted', { runId }), ev('TextMessageStart', { messageId: `m-${runId}` }), ev('TextMessageContent', { messageId: `m-${runId}`, delta: `altrove ${i}` }), ev('TextMessageEnd', { messageId: `m-${runId}` }), ev('RunFinished', { runId })].map((r) => `${JSON.stringify(r)}\n`).join(''));
      }
      input.onEvento({ type: 'TextMessageContent', messageId: 'mio', delta: `p${String(i).padStart(2, '0')} ` });
      await pausa(modo === 'scrive' ? 9 : 1);
    }
    if (fatto) await fatto;
    input.onEvento({ type: 'TextMessageEnd', messageId: 'mio' });
    input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
    finito();
    return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso' } };
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const a = ascoltatori();
  registro.iscriviti(sessionId, a.su, 0);
  stato.sessionId = sessionId;
  await fine;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  if (scrittore) await scrittore.fine();
  await registro.allineaSessione(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  return { store, sessionId, registro, a, adozioni: readFileSync(giornale(store, sessionId), 'utf8').split('\n').filter((r) => r.includes('"tipo":"adozione"')).length };
}

const riavvia = async (t, e) => { await e.registro.chiudi({ attesaMassimaMs: 1000 }); const r = registroDi(e.store); t.after(() => r.chiudi({ attesaMassimaMs: 1000 })); await r.ripristina(); return r; };

for (const modo of ['stesso', 'scrive']) {
  test(`RA3-01 (${modo}): live, the page (Set) and the command line (cursor) hide nothing and show nothing twice; every number shown is the oracle's number of that line`, async (t) => {
    const e = await giro(t, { modo });
    assert.ok(e.adozioni > 0, `adoptions written (${e.adozioni})`);
    assert.deepEqual(e.a.pagina.nascoste, [], 'page');
    assert.deepEqual(e.a.cli.nascoste, [], 'command line');
    const o = new Map(oracolo(giornale(e.store, e.sessionId)).map((r) => [chiave(r), r._sequenza]));
    const diversi = [...e.a.pagina.mostrate].filter(([c, n]) => o.has(c) && o.get(c) !== n);
    assert.deepEqual(diversi, [], 'live numbers = oracle');
    const nums = [...o.values()];
    assert.equal(nums.filter((n, i) => nums.indexOf(n) !== i).length, 0, 'oracle: no number twice');
  });

  test(`RA3-02 (${modo}): after a restart, the page replaying from 0 with its Set and the command line reconnecting from its cursor: 0 hidden, 0 shown again, 0 numbers moved`, async (t) => {
    const e = await giro(t, { modo });
    const r = await riavvia(t, e);
    const eventi = r.esporta(e.sessionId).eventi.filter((x) => Number.isSafeInteger(x._sequenza));
    const mossi = eventi.filter((x) => e.a.pagina.mostrate.has(chiave(x)) && e.a.pagina.mostrate.get(chiave(x)) !== x._sequenza).length;
    assert.equal(mossi, 0, 'no number moved to another line');
    const nascostePagina = eventi.filter((x) => !e.a.pagina.mostrate.has(chiave(x)) && e.a.pagina.visti.has(x._sequenza)).map(chiave);
    assert.deepEqual(nascostePagina, [], 'page replay hides nothing new');
    const dopo = []; r.iscriviti(e.sessionId, (x) => { if (Number.isSafeInteger(x._sequenza)) dopo.push(x); }, e.a.cli.cursore)();
    const riviste = dopo.filter((x) => e.a.cli.mostrate.has(chiave(x))).map(chiave);
    assert.deepEqual(riviste, [], 'command line sees nothing again');
    const mancanti = eventi.filter((x) => x._sequenza <= e.a.cli.cursore && !e.a.cli.mostrate.has(chiave(x))).map(chiave);
    assert.deepEqual(mancanti, [], 'command line misses nothing');
  });
}

test('RA3-03: a TALOS of before (0.2.1 or the CLI) appends with the raw highest + 1 after the adoptions; this version re-reads: every number shown keeps its line, the new line has its own number, nothing twice', async (t) => {
  const e = await giro(t, { modo: 'stesso' });
  let alto = 0;
  for (const r of readFileSync(giornale(e.store, e.sessionId), 'utf8').split('\n')) { try { alto = Math.max(alto, JSON.parse(r)._sequenza ?? 0); } catch { /* */ } }
  await e.registro.chiudi({ attesaMassimaMs: 1000 });
  appendFileSync(giornale(e.store, e.sessionId), `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-vecchia', value: { id: 'v1' }, _sequenza: alto + 1 })}\n`);
  const r = registroDi(e.store); t.after(() => r.chiudi({ attesaMassimaMs: 1000 })); await r.ripristina();
  const eventi = r.esporta(e.sessionId).eventi.filter((x) => Number.isSafeInteger(x._sequenza));
  const mossi = eventi.filter((x) => e.a.pagina.mostrate.has(chiave(x)) && e.a.pagina.mostrate.get(chiave(x)) !== x._sequenza).length;
  assert.equal(mossi, 0);
  const nuova = eventi.find((x) => x.name === 'talos.nota-vecchia');
  assert.ok(nuova, 'the line of the old TALOS is there');
  assert.ok(!e.a.pagina.visti.has(nuova._sequenza), `its number (${nuova._sequenza}) was never shown for another line: the page shows it`);
  assert.ok(nuova._sequenza > e.a.cli.cursore, 'above the command line cursor: the command line shows it');
  const nums = eventi.map((x) => x._sequenza);
  assert.equal(nums.filter((n, i) => nums.indexOf(n) !== i).length, 0);
  const o = new Map(oracolo(giornale(e.store, e.sessionId)).map((x) => [chiave(x), x._sequenza]));
  assert.deepEqual(eventi.filter((x) => o.get(chiave(x)) !== x._sequenza).map(chiave), [], 'same numbers as the oracle, line by line');
});

test('RA3-05 the reading module: an adoption line with primo 0 (or below) is not an adoption, and the lines it names keep the reading rule', async () => {
  const { eRigaDiAdozione, numeraLaVista } = await import('../src/rinumerazione-giornale.mjs');
  assert.equal(eRigaDiAdozione({ tipo: 'adozione', inizi: [10], primo: 0, righe: 1 }), false);
  assert.equal(eRigaDiAdozione({ tipo: 'adozione', inizi: [10], primo: -3, righe: 1 }), false);
  assert.equal(eRigaDiAdozione({ tipo: 'adozione', inizi: [10], primo: 1, righe: 1 }), true);
  const n = numeraLaVista([{ inizio: 0, record: { _sequenza: 1 } }, { inizio: 10, record: { _sequenza: 1 } }, { inizio: 20, record: { tipo: 'adozione', inizi: [10], primo: 0, righe: 1 } }]);
  assert.deepEqual([n.get(0), n.get(1)], [1, 2]);
});

/* diari fatti a mano: la lettura della testa contro l oracolo */
function diarioAMano(store, righe) {
  const id = randomUUID();
  const intest = { tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:ra3', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' }, avviataAlle: '2026-11-14T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
  let testo = `${JSON.stringify(intest)}\n`;
  const inizi = [];
  for (const r of righe) {
    if (typeof r === 'function') { const x = r(inizi, Buffer.byteLength(testo)); testo += `${JSON.stringify(x)}\n`; inizi.push(null); continue; }
    inizi.push(Buffer.byteLength(testo)); testo += `${JSON.stringify(r)}\n`;
  }
  writeFileSync(giornale(store, id), testo);
  return id;
}
const nota = (id, n) => ({ type: 'CUSTOM', name: 'talos.nota', value: { id }, _sequenza: n });
for (const [nome, righe, attesi] of [
  ['an adoption that names the line right AFTER itself takes nothing', [nota('a', 1), nota('b', 2), (inizi, qui) => {
    let v = qui; for (let k = 0; k < 5; k += 1) v = qui + Buffer.byteLength(JSON.stringify({ tipo: 'adozione', inizi: [v], primo: 9, righe: 1 })) + 1;
    return { tipo: 'adozione', inizi: [v], primo: 9, righe: 1 };
  }, nota('c', 2)], [1, 2, 3]],
  ['two adoptions of the same line: the first wins, the second number stays free and is skipped', [nota('a', 1), nota('b', 1), (i) => ({ tipo: 'adozione', inizi: [i[1]], primo: 5, righe: 1 }), (i) => ({ tipo: 'adozione', inizi: [i[1]], primo: 7, righe: 1 }), nota('c', 2)], [1, 5, 2]],
  ['an adopted number is reserved: a later raw line with that number moves above the highest', [nota('a', 1), nota('b', 1), (i) => ({ tipo: 'adozione', inizi: [i[1]], primo: 3, righe: 1 }), nota('c', 2), nota('d', 3)], [1, 3, 2, 4]],
  ['an adoption with primo 0 or a non-integer start is ignored (a line written badly)', [nota('a', 1), nota('b', 1), (i) => ({ tipo: 'adozione', inizi: [i[1]], primo: 0, righe: 1 }), (i) => ({ tipo: 'adozione', inizi: [String(i[1])], primo: 4, righe: 1 })], [1, 2]],
  ['a duplicate goes to the first free number above the highest SEEN SO FAR, not above itself', [nota('a', 5), nota('b', 7), nota('c', 5), nota('d', 9)], [5, 7, 8, 9]],
]) {
  test(`RA3-04 hand-made journal: ${nome}`, async (t) => {
    const store = mkdtempSync(join(tmpdir(), 'ra3-m-'));
    attivaAffittiArchivio(store, { etichetta: 'ra3', battitoMs: 0 });
    t.after(() => disattivaAffittiArchivio(store));
    const id = diarioAMano(store, righe);
    const r = registroDi(store); t.after(() => r.chiudi({ attesaMassimaMs: 500 })); await r.ripristina();
    /* il registro tiene gli eventi in ordine di numero; il confronto e per riga (value.id), nell ordine del disco */
    const perId = new Map(r.esporta(id).eventi.filter((e) => e.name === 'talos.nota').map((e) => [e.value.id, e._sequenza]));
    const ordine = oracolo(giornale(store, id)).map((x) => x.value.id);
    assert.deepEqual(oracolo(giornale(store, id)).map((x) => x._sequenza), attesi, 'the oracle');
    assert.deepEqual(ordine.map((k) => perId.get(k)), attesi, 'the restore');
  });
}
