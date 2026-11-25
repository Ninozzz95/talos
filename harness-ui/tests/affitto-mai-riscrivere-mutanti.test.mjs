import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { affittiDellArchivio, attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio, leggiRegistroAStream, registraRiga, registraRigaSync } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { numeraLaVista } from '../src/rinumerazione-giornale.mjs';

/*
 * 14/11/2026 — terzo giro dell'affitto, «mai riscrivere»: le prove nate dai mutanti (in copia, `C:/T/cura-aff6-mut`) sulle righe
 *   nuove — la regola V (`numeraLaVista`), la riga «adozione» dello store sulle due strade, il byte d'inizio della lettura, l'adozione
 *   nel registro — e sui sopravvissuti del revisore 2 (N01, N02, N05, N10). Ognuna guarda la regola da DUE porte: il modulo da solo e
 *   il ripristino vero da un file. Solo cartelle del TEMP (finto, nella coda).
 */
const cartellaTemp = () => mkdtempSync(join(tmpdir(), 'mrm-'));
const giornale = (store, id) => join(store, `${id}.jsonl`);
const righe = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
const INTEST = (id, store) => ({ tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:mrm', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' }, avviataAlle: '2026-11-14T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true });
const nota = (n, id, testo = 'x') => ({ type: 'CUSTOM', name: 'talos.nota', value: { id, testo }, _sequenza: n });

/* Un giornale scritto a mano: `voci` sono record, o `{ adozione: [indici delle righe di prima], primo, byte?: [byte grezzi in più] }`
   (i byte d'inizio li calcola qui, come lo store). Ritorna le voci col byte d'inizio, per `numeraLaVista`. */
function giornaleAMano(store, id, voci) {
  let testo = `${JSON.stringify(INTEST(id, store))}\n`;
  const inizi = [];
  const perVista = [];
  for (const v of voci) {
    const inizio = Buffer.byteLength(testo, 'utf8');
    let record = v;
    if (v.adozione) {
      const elenco = [...v.adozione.map((k) => inizi[k]), ...(v.byte ?? []).map((b) => (b === 'se' ? inizio : b))];
      record = { tipo: 'adozione', inizi: elenco, primo: v.primo, righe: elenco.length };
    }
    inizi.push(inizio);
    perVista.push({ inizio, record: structuredClone(record) });
    testo += `${JSON.stringify(record)}\n`;
  }
  writeFileSync(giornale(store, id), testo);
  return perVista;
}
const numeriDellaVista = (perVista) => { const n = numeraLaVista(perVista); return perVista.map((_, i) => n.get(i)).filter((x) => x !== undefined); };
function registroDiProva(store) {
  return createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'mrm' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k', avviaSessioneFn: async () => ({ ok: true, esito: { detto: 'x', comeFinita: 'concluso' } }),
  });
}
async function numeriDalRipristino(t, store, id) {
  attivaAffittiArchivio(store, { etichetta: 'mrm', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const registro = registroDiProva(store);
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  return registro.esporta(id).eventi.filter((e) => e.name === 'talos.nota').map((e) => [e.value.id, e._sequenza]);
}

/* ───────────── la regola V, dalle due porte ───────────── */
const CASI = [
  /* un doppio sale sopra il più alto, e salta un numero già preso da un'adozione (il «while») */
  ['V-01 a duplicate goes above the highest and skips a number an adoption took', [nota(1, 'a'), nota(2, 'b'), nota(2, 'c'), nota(5, 'd'), { adozione: [3], primo: 3 }], [['a', 1], ['b', 2], ['c', 4], ['d', 3]]],
  /* due adozioni sulla stessa riga: vince la prima nell'ordine del disco; la p-esima riga elencata prende primo+p anche se le prime sono già prese */
  ['V-02 two adoptions over the same lines: the first one in disk order wins, the p-th listed line takes primo+p', [nota(1, 'a'), nota(1, 'b'), nota(1, 'c'), { adozione: [1, 2], primo: 10 }, nota(1, 'd'), { adozione: [1, 2, 4], primo: 20 }], [['a', 1], ['b', 10], ['c', 11], ['d', 22]]],
  /* solo le righe elencate: quella fra due elencate (la nostra, in una scrittura mescolata) tiene il suo numero */
  ['V-03 only the listed lines are adopted: the line between two listed ones keeps its number', [nota(1, 'a'), nota(1, 'b'), nota(9, 'c'), nota(1, 'd'), { adozione: [1, 3], primo: 7 }, nota(3, 'e')], [['a', 1], ['b', 7], ['c', 9], ['d', 8], ['e', 3]]],
  /* il più alto cresce anche con le righe che tengono il loro numero */
  ['V-04 the highest grows with lines that keep their number', [nota(1, 'a'), nota(5, 'b'), nota(1, 'c')], [['a', 1], ['b', 5], ['c', 6]]],
  /* un byte che non è l'inizio di una riga numerata di prima (dentro l'intestazione, l'adozione stessa) non prende niente */
  ['V-05 a byte that is not the start of an earlier numbered line takes nothing', [nota(1, 'a'), nota(1, 'b'), { adozione: [], byte: [5, 'se'], primo: 30 }], [['a', 1], ['b', 2]]],
];
for (const [nome, voci, attesi] of CASI) {
  test(`${nome} (the module)`, () => {
    const store = cartellaTemp();
    const perVista = giornaleAMano(store, randomUUID(), voci);
    assert.deepEqual(numeriDellaVista(perVista), attesi.map(([, n]) => n));
  });
  test(`${nome} (a real restore from the file)`, async (t) => {
    const store = cartellaTemp();
    const id = randomUUID();
    giornaleAMano(store, id, voci);
    const prima = readFileSync(giornale(store, id));
    const dalRipristino = await numeriDalRipristino(t, store, id);
    assert.deepEqual(new Map(dalRipristino), new Map(attesi));
    assert.deepEqual(readFileSync(giornale(store, id)), prima, 'never rewritten');
  });
}

/* ───────────── la lettura dà il byte d'inizio vero (accenti, CRLF, righe vuote) ───────────── */
test('LET-01: the stream reading gives each line its real starting byte (accents, CRLF, empty lines)', async () => {
  const store = cartellaTemp();
  const id = randomUUID();
  const testo = `${JSON.stringify(INTEST(id, store))}\n${JSON.stringify(nota(1, 'è perché'))}\r\n\n${JSON.stringify(nota(2, '日本'))}\n${JSON.stringify(nota(3, 'z'))}`;
  writeFileSync(giornale(store, id), testo);
  const buf = Buffer.from(testo, 'utf8');
  const attesi = [0];
  for (let i = 0; i < buf.length; i += 1) if (buf[i] === 10 && i + 1 < buf.length && buf[i + 1] !== 10) attesi.push(i + 1);
  const visti = [];
  await leggiRegistroAStream({ cartellaStore: store, sessionId: id, perRiga: (_r, info) => { visti.push(info.inizio); } });
  assert.deepEqual(visti, attesi);
});
test('LET-02: an adoption after lines with accents and CRLF is applied by the real restore (the bytes are counted as bytes)', async (t) => {
  const store = cartellaTemp();
  const id = randomUUID();
  const l1 = JSON.stringify(nota(1, 'perché è così'));
  const l2 = JSON.stringify(nota(1, '日本語 altro'));
  const l3 = JSON.stringify(nota(2, 'altro 2'));
  const testa = `${JSON.stringify(INTEST(id, store))}\n${l1}\r\n`;
  const da = Buffer.byteLength(testa, 'utf8');
  const inizi = [da, da + Buffer.byteLength(`${l2}\n`, 'utf8')];
  writeFileSync(giornale(store, id), `${testa}${l2}\n${l3}\n${JSON.stringify({ tipo: 'adozione', inizi, primo: 40, righe: 2 })}\n${JSON.stringify(nota(2, 'nostra'))}\n`);
  const dalRipristino = new Map(await numeriDalRipristino(t, store, id));
  assert.deepEqual(dalRipristino, new Map([['perché è così', 1], ['日本語 altro', 40], ['altro 2', 41], ['nostra', 2]]));
});

/* ───────────── la riga «adozione» dello store, sulle due strade ───────────── */
async function preparaConAffitto(t) {
  const store = cartellaTemp();
  const id = randomUUID();
  attivaAffittiArchivio(store, { etichetta: 'mrm', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: id, record: INTEST(id, store) });
  for (let n = 1; n <= 3; n += 1) await registraRiga({ cartellaStore: store, sessionId: id, record: nota(n, `q${n}`), dopoIlRecinto: () => ({ primo: 99 }) });
  return { store, id };
}
function altroScrive(store, id, record) { appendFileSync(giornale(store, id), record.map((r) => `${JSON.stringify(r)}\n`).join('')); }
for (const [strada, scrivi] of [['async', (a) => registraRiga(a)], ['sync', (a) => registraRigaSync(a)]]) {
  test(`ADZ-01 (${strada}): another process wrote two lines (accents, old numbers): the adoption line goes right before ours, ours keeps its number, the other's lines take primo, primo+1`, async (t) => {
    const { store, id } = await preparaConAffitto(t);
    const da = statSync(giornale(store, id)).size;
    altroScrive(store, id, [nota(2, 'altro è 1'), nota(3, 'altro 2')]);
    const inizi = [da, da + Buffer.byteLength(`${JSON.stringify(nota(2, 'altro è 1'))}\n`, 'utf8')];
    let chiamata = null;
    await scrivi({ cartellaStore: store, sessionId: id, record: nota(4, 'nostra'), dopoIlRecinto: (ultima, info) => { chiamata = { ultima, adottate: info.adottate?.map((r) => r.value.id) }; return { primo: 10 }; } });
    assert.deepEqual(chiamata, { ultima: 3, adottate: ['altro è 1', 'altro 2'] });
    const tutte = righe(store, id);
    assert.deepEqual(tutte.at(-2), { tipo: 'adozione', inizi, primo: 10, righe: 2 });
    assert.equal(tutte.at(-1).value.id, 'nostra');
    assert.equal(tutte.at(-1)._sequenza, 4, 'ours keeps the number already shown');
    const dalRipristino = new Map(await numeriDalRipristino(t, store, id));
    assert.deepEqual(dalRipristino, new Map([['q1', 1], ['q2', 2], ['q3', 3], ['altro è 1', 10], ['altro 2', 11], ['nostra', 4]]));
  });
  test(`MIX-01 (${strada}): another process writes in the same instant as ours (a mixed write): its line is adopted at once in a second adoption line, ours is never adopted, and the next plain write is not refused`, async (t) => {
    const { store, id } = await preparaConAffitto(t);
    altroScrive(store, id, [nota(2, 'altro 1')]);
    const chiamate = [];
    await scrivi({ cartellaStore: store, sessionId: id, record: nota(4, 'nostra'), dopoIlRecinto: (ultima, info) => {
      chiamate.push({ adottate: info.adottate?.map((r) => r.value.id), dopo: info.dopoLaScrittura === true });
      if (chiamate.length === 1) altroScrive(store, id, [nota(3, 'altro 2')]); // l'altro scrive fra la nostra misura e il nostro accodamento
      return { primo: chiamate.length === 1 ? 10 : 20 };
    } });
    assert.deepEqual(chiamate, [{ adottate: ['altro 1'], dopo: false }, { adottate: ['altro 2'], dopo: true }]);
    const tutte = righe(store, id);
    assert.deepEqual(tutte.slice(-5).map((r) => r.tipo === 'adozione' ? `adz${r.primo}:${r.inizi.length}` : r.value.id), ['altro 1', 'altro 2', 'adz10:1', 'nostra', 'adz20:1']);
    await registraRiga({ cartellaStore: store, sessionId: id, record: nota(5, 'semplice') });
    assert.equal(righe(store, id).at(-1).value.id, 'semplice', 'in step with the disk after the second adoption');
    const dalRipristino = new Map(await numeriDalRipristino(t, store, id));
    assert.deepEqual(dalRipristino, new Map([['q1', 1], ['q2', 2], ['q3', 3], ['altro 1', 10], ['altro 2', 20], ['nostra', 4], ['semplice', 5]]));
  });
  test(`ADZ-02 (${strada}): N02 — a caller of before (no «primo») still gets the HIGHEST number of the other's tail, not the last`, async (t) => {
    const { store, id } = await preparaConAffitto(t);
    altroScrive(store, id, [nota(7, 'altro 7'), nota(5, 'altro 5')]);
    const record = nota(4, 'nostra');
    let ultima = null;
    await scrivi({ cartellaStore: store, sessionId: id, record, dopoIlRecinto: (u) => { ultima = u; record._sequenza = u + 1; } });
    assert.equal(ultima, 7);
    assert.equal(righe(store, id).at(-1)._sequenza, 8);
    assert.equal(righe(store, id).filter((r) => r.tipo === 'adozione').length, 0, 'no adoption line without «primo»');
  });
  test(`ADZ-03 (${strada}): N01 — the journal got SHORTER behind us (rewritten by a TALOS of before): no adoption, the whole file is read and ours goes above its highest`, async (t) => {
    const { store, id } = await preparaConAffitto(t);
    truncateSync(giornale(store, id), 0);
    writeFileSync(giornale(store, id), `${JSON.stringify(INTEST(id, store))}\n${JSON.stringify(nota(6, 'riscritta'))}\n`);
    const record = nota(4, 'nostra');
    let info = null;
    await scrivi({ cartellaStore: store, sessionId: id, record, dopoIlRecinto: (u, i) => { info = { u, adottate: i.adottate }; record._sequenza = u + 1; return { primo: 50 }; } });
    assert.deepEqual(info, { u: 6, adottate: null });
    assert.equal(righe(store, id).filter((r) => r.tipo === 'adozione').length, 0);
    assert.equal(righe(store, id).at(-1)._sequenza, 7);
  });
}
test('ADZ-04 (N05): a chat marked as changed elsewhere with nothing new on the disk: a write that can adopt clears the mark, so a plain write after it is not refused', async (t) => {
  const { store, id } = await preparaConAffitto(t);
  affittiDellArchivio(store).segnaCambiato(id);
  await registraRiga({ cartellaStore: store, sessionId: id, record: nota(4, 'nostra'), dopoIlRecinto: () => ({ primo: 20 }) });
  await registraRiga({ cartellaStore: store, sessionId: id, record: nota(5, 'semplice') });
  assert.deepEqual(righe(store, id).slice(-2).map((r) => r.value.id), ['nostra', 'semplice']);
});
test('ADZ-05 (N05, sync after async): the same mark cleared by the async write lets the synchronous writer go without a refusal', async (t) => {
  const { store, id } = await preparaConAffitto(t);
  affittiDellArchivio(store).segnaCambiato(id);
  await registraRiga({ cartellaStore: store, sessionId: id, record: nota(4, 'nostra'), dopoIlRecinto: () => ({ primo: 20 }) });
  registraRigaSync({ cartellaStore: store, sessionId: id, record: nota(5, 'sync') });
  assert.equal(affittiDellArchivio(store).scritturaBloccata(id), false);
  assert.equal(righe(store, id).at(-1).value.id, 'sync');
});
for (const [k, verifica] of [['throws', 'refused'], ['disk', 'not on the disk']]) {
  test(`ADZ-06-${k} (N10): a synchronous write that leapfrogs a queued one on a chat changed elsewhere is ${verifica} (never written without its adoption)`, async (t) => {
    const { store, id } = await preparaConAffitto(t);
    altroScrive(store, id, [nota(2, 'altro')]);
    affittiDellArchivio(store).segnaCambiato(id);
    let libera;
    const ferma = new Promise((ok) => { libera = ok; });
    const inCoda = registraRiga({ cartellaStore: store, sessionId: id, record: nota(4, 'in coda'), dopoIlRecinto: () => ({ primo: 30 }) }, { appendFileFn: async (p, d, o) => { await ferma; appendFileSync(p, d, o); } });
    await new Promise((ok) => setImmediate(ok));
    let errore = null;
    try { registraRigaSync({ cartellaStore: store, sessionId: id, record: nota(5, 'scavalca'), dopoIlRecinto: () => ({ primo: 40 }) }); } catch (e) { errore = e; }
    libera();
    await inCoda.catch(() => {});
    await attendiScritture({ cartellaStore: store, sessionId: id });
    if (k === 'throws') assert.equal(errore?.code, 'SESSION_CHANGED_ELSEWHERE');
    else assert.equal(righe(store, id).some((r) => r.value?.id === 'scavalca'), false);
  });
}

/* MR-05 (14/11/2026): la scrittura sincrona che scavalca su un giornale cresciuto per mano di un altro non sposta l'attesa a metà riga */
for (const lunga of [false, true]) {
  test(`SCV-01 (${lunga ? 'long' : 'short'} line): a synchronous write that leapfrogs the queue after another process wrote does not move the expected size into the middle of the other's line; the queued write adopts ALL the other's lines`, async (t) => {
    const { store, id } = await preparaConAffitto(t);
    let libera;
    const ferma = new Promise((ok) => { libera = ok; });
    const inCoda = registraRiga({ cartellaStore: store, sessionId: id, record: nota(4, 'nostra'), dopoIlRecinto: () => ({ primo: 30 }) }, { mkdirFn: async () => { await ferma; } });
    await new Promise((ok) => setImmediate(ok));
    altroScrive(store, id, [nota(2, 'altro 1 con un testo abbastanza lungo da superare la riga corta'), nota(3, 'altro 2')]);
    registraRigaSync({ cartellaStore: store, sessionId: id, record: { tipo: 'tempi-giro', dati: lunga ? 'x'.repeat(200) : 'y' } });
    libera();
    await inCoda;
    const adozioni = righe(store, id).filter((r) => r.tipo === 'adozione');
    assert.equal(adozioni.length, 1);
    assert.equal(adozioni[0].inizi.length, 2, 'both lines of the other are adopted');
    const dalRipristino = new Map(await numeriDalRipristino(t, store, id));
    assert.equal(dalRipristino.get('altro 2'), 31);
    assert.equal(dalRipristino.get('nostra'), 4);
    assert.equal(dalRipristino.get('altro 1 con un testo abbastanza lungo da superare la riga corta'), 30);
  });
}

/* N07 (revisore 2, vivo nel giro 2): la ricarica dopo l'avviso. L'adozione porta in memoria SOLO le righe numerate dell'altro; ciò che
   l'altro ha scritto senza numero (il nome della chat, la stella) arriva solo con la ricarica della chat ferma, subito dopo l'avviso. */
async function giroCheIncontraLAltro(t, righeAltrui) {
  const store = cartellaTemp();
  attivaAffittiArchivio(store, { etichetta: 'mrm', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { id: null };
  let fatto;
  const fine = new Promise((ok) => { fatto = ok; });
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'mrm' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      while (!stato.id) await new Promise((ok) => setTimeout(ok, 5));
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      await attendiScritture({ cartellaStore: store, sessionId: stato.id });
      altroScrive(store, stato.id, [nota(2, 'altro'), ...righeAltrui]);
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r', outcome: { type: 'success' }, result: { detto: 'ok' } });
      fatto();
      return { ok: true, esito: { detto: 'ok', comeFinita: 'concluso' } };
    },
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: cartellaTemp(), consegna: 'scrivi', permessi: 'Full access' });
  stato.id = sessionId;
  await fine;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  for (let i = 0; i < 20 && !righe(store, sessionId).some((r) => r.name === 'talos.journal-riparato'); i += 1) await new Promise((ok) => setTimeout(ok, 10));
  await new Promise((ok) => setTimeout(ok, 100)); // la ricarica della chat ferma, partita dall'avviso, finisce
  return { registro, sessionId, store };
}
test('N07-a: a turn that meets another TALOS which also renamed the chat: right after the turn the chat has the new name (the reload after the notice)', async (t) => {
  const { registro, sessionId } = await giroCheIncontraLAltro(t, [{ tipo: 'nome-sessione', nome: 'Rinominata altrove' }]);
  assert.equal(registro.esporta(sessionId).nome, 'Rinominata altrove');
});
test('N07-b: the same with a star put by the other TALOS: the list says the chat is pinned right after the turn', async (t) => {
  const { registro, sessionId } = await giroCheIncontraLAltro(t, [{ tipo: 'fissata-sessione', fissata: true }]);
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId)?.fissata, true);
});

/* ───────────── l'adozione nel registro: in memoria SUBITO, coi numeri della vista ───────────── */
test('RG-01: inside a live turn, the other\'s adopted lines are already in memory with the numbers the restore will give them, above every number shown', async (t) => {
  const store = cartellaTemp();
  attivaAffittiArchivio(store, { etichetta: 'mrm', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { id: null, inMemoria: null, mostrati: 0 };
  let fatto;
  const fine = new Promise((ok) => { fatto = ok; });
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'mrm' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      while (!stato.id) await new Promise((ok) => setTimeout(ok, 5));
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      await attendiScritture({ cartellaStore: store, sessionId: stato.id });
      altroScrive(store, stato.id, [nota(2, 'altro 1'), nota(3, 'altro 2')]);
      for (let i = 0; i < 3; i += 1) input.onEvento({ type: 'CUSTOM', name: 'talos.nota', value: { id: `nostra ${i}` } });
      await attendiScritture({ cartellaStore: store, sessionId: stato.id });
      stato.inMemoria = registro.esporta(stato.id).eventi.filter((e) => e.name === 'talos.nota').map((e) => [e.value.id, e._sequenza]);
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r', outcome: { type: 'success' }, result: { detto: 'ok' } });
      fatto();
      return { ok: true, esito: { detto: 'ok', comeFinita: 'concluso' } };
    },
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: cartellaTemp(), consegna: 'scrivi', permessi: 'Full access' });
  stato.id = sessionId;
  await fine;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  const mappa = new Map(stato.inMemoria);
  assert.ok(mappa.has('altro 1') && mappa.has('altro 2'), `in memory during the turn: ${JSON.stringify(stato.inMemoria)}`);
  const nostri = ['nostra 0', 'nostra 1', 'nostra 2'].map((k) => mappa.get(k));
  assert.ok(mappa.get('altro 1') > Math.max(...nostri) && mappa.get('altro 2') === mappa.get('altro 1') + 1, 'above every number shown, one after the other');
  const riavviato = registroDiProva(store);
  t.after(() => riavviato.chiudi({ attesaMassimaMs: 500 }));
  await riavviato.ripristina();
  const dopo = new Map(riavviato.esporta(sessionId).eventi.filter((e) => e.name === 'talos.nota').map((e) => [e.value.id, e._sequenza]));
  for (const [k, n] of mappa) assert.equal(dopo.get(k), n, `${k} keeps its number after the restart`);
});
