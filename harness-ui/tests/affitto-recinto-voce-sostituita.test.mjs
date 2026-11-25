import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio, elencaSessioniPersistite, registraRiga } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

/*
 * 14/11/2026 — SESTO GIRO DELL'AFFITTO: i sopravvissuti del revisore del giro 5 (N29, V4, V5, V8, V9), uccisi qui. Sono le strade
 *   della riga TARDIVA di una voce che una ricarica ha già sostituito (la chiusura del giro tiene la voce vecchia), quando la sua
 *   scrittura torna dallo store DOPO la ricarica. La prova tiene in mano la scrittura della riga tardiva (`registraRigaFn` finto) e
 *   chiama lei la risposta del recinto (`dopoIlRecinto`), con i numeri del disco veri:
 *   · senza la coda dell'altro (`adottate: null`, lo store non sa da dove parte): la riga prende il numero subito sopra l'ultimo del
 *     disco, dalla voce di adesso, una volta sola (V5: la voce vecchia non la rinumera prima; V8: il disco conta), e la voce vecchia non
 *     dà la nota «un altro TALOS ha scritto qui» (N29: la chat è già stata riletta, owner 10/10 «ricaricarla da sola», niente avvisi);
 *   · dopo la scrittura (`dopoLaScrittura: true`): la riga è già sul disco col suo numero, e quel numero non cambia (V4);
 *   · la ricarica fallisce mentre la riga tardiva la aspetta: la riga non si perde (V9).
 *   Solo cartelle del TEMP (finto, nella coda); mai tolte da qui.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.delta ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}`;
const giornale = (store, id) => join(store, `${id}.jsonl`);
const righeScritte = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
const massimoScritto = (store, id) => Math.max(0, ...righeScritte(store, id).map((r) => r._sequenza).filter(Number.isSafeInteger));
const scriveAltrove = (store, id, ids) => {
  let n = massimoScritto(store, id);
  appendFileSync(giornale(store, id), ids.map((x) => `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: x }, _sequenza: ++n })}\n`).join(''));
};
const doppiDi = (numeri) => numeri.filter((n, i) => numeri.indexOf(n) !== i);

function registroDi(store, stato) {
  return createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'rv' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    ...(stato?.registraRigaFn ? { registraRigaFn: stato.registraRigaFn } : {}),
    /* ogni ripristino (anche quello di una ricarica) elenca le chat: la prova conta le ricariche da qui */
    ...(stato ? { elencaSessioniPersistiteFn: (...a) => { stato.elenchi = (stato.elenchi ?? 0) + 1; return (stato.elencaSessioniPersistiteFn ?? elencaSessioniPersistite)(...a); } } : {}),
    avviaSessioneFn: async (input) => {
      if (!stato) return { ok: true, esito: { detto: 'x', comeFinita: 'concluso' } };
      while (!stato.sessionId) await pausa(5);
      stato.onEvento = input.onEvento; // la chiusura del giro resta in mano a chi l'ha avuta
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      input.onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
      for (let i = 0; i < 3; i += 1) {
        /* l'altro scrive DENTRO il giro (come RT e VS): la voce adotta la sua coda e la chat si segna «da ricaricare» appena è ferma */
        if (i === 1) scriveAltrove(stato.store, stato.sessionId, ['durante-1', 'durante-2']);
        input.onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: `p${i} ` });
        await attendiScritture({ cartellaStore: stato.store, sessionId: stato.sessionId });
      }
      input.onEvento({ type: 'TextMessageEnd', messageId: 'm1' });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      stato.fineGiro?.();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'scrivi' }, { role: 'assistant', content: 'Fatto.' }] } };
    },
  });
}

async function preparaChat(t, stato) {
  const errori = [];
  const suErrore = (e) => { errori.push(`${e?.code ?? ''} ${e?.message ?? e}`.slice(0, 160)); };
  process.on('unhandledRejection', suErrore);
  t.after(() => process.off('unhandledRejection', suErrore));
  const avvisoOriginale = console.warn;
  const errOriginale = console.error;
  console.warn = () => {};
  console.error = () => {};
  t.after(() => { console.warn = avvisoOriginale; console.error = errOriginale; });
  attivaAffittiArchivio(stato.store, { etichetta: 'rv', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(stato.store));
  let fine;
  const giro = new Promise((ok) => { fine = ok; });
  stato.fineGiro = fine;
  const registro = registroDi(stato.store, stato);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const lavoro = mkdtempSync(join(tmpdir(), 'rvl-'));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const ascolto = { consegne: new Map(), noteAltroveDopo: 0 };
  registro.iscriviti(sessionId, (e) => {
    if (e?.name === 'talos.journal-riparato' && stato.rilasciata) ascolto.noteAltroveDopo += 1;
    if (Number.isSafeInteger(e?._sequenza)) ascolto.consegne.set(chiave(e), (ascolto.consegne.get(chiave(e)) ?? 0) + 1);
  }, 0);
  stato.sessionId = sessionId;
  await giro;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: stato.store, sessionId });
  return { registro, sessionId, errori, ascolto };
}

/* modo: 'senza-coda' (lo store non conosce la coda dell'altro) o 'dopo-la-scrittura' (la coda trovata dopo aver scritto) */
async function rigaTrattenuta(t, { modo, quante }) {
  const store = mkdtempSync(join(tmpdir(), 'rv-'));
  const stato = { store, sessionId: null, trattenute: [], rilasciata: false };
  stato.registraRigaFn = async (argomenti, ...resto) => {
    if (argomenti?.record?.name !== 'talos.tardivo') return registraRiga(argomenti, ...resto);
    const tenuta = { argomenti, numeroMostrato: argomenti.record._sequenza };
    const libera = new Promise((ok) => { tenuta.libera = ok; });
    stato.trattenute.push(tenuta);
    return libera;
  };
  const { registro, sessionId, errori, ascolto } = await preparaChat(t, stato);
  const tardivi = [];
  const promesse = [];
  for (let i = 1; i <= quante; i += 1) {
    const e = { type: 'CUSTOM', name: 'talos.tardivo', value: { id: `tardivo-${i}` } };
    tardivi.push(e);
    promesse.push(Promise.resolve(stato.onEvento(e)));
  }
  for (let i = 0; i < 400 && stato.trattenute.length < quante; i += 1) await pausa(5);
  assert.equal(stato.trattenute.length, quante, 'the late writes reached the store (held by the test)');
  scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
  const allineata = await registro.allineaSessione(sessionId);
  scriveAltrove(store, sessionId, ['dopo-1', 'dopo-2']);
  stato.rilasciata = true;
  const elenchiPrima = stato.elenchi ?? 0;
  const attesi = [];
  const scritti = [];
  for (const tenuta of stato.trattenute) {
    const record = tenuta.argomenti.record;
    const ultima = massimoScritto(store, sessionId);
    if (modo === 'senza-coda') {
      tenuta.argomenti.dopoIlRecinto(ultima, { righe: 2, byte: 120, adottate: null });
      attesi.push(ultima + 1);
      appendFileSync(giornale(store, sessionId), `${JSON.stringify(record)}\n`); // come lo store, col numero che la risposta ha dato
    } else {
      appendFileSync(giornale(store, sessionId), `${JSON.stringify(record)}\n`); // la riga è già scritta col suo numero
      scritti.push(record._sequenza);
      const misto = { type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: `misto-${scritti.length}` }, _sequenza: record._sequenza + 1 };
      appendFileSync(giornale(store, sessionId), `${JSON.stringify(misto)}\n`);
      tenuta.argomenti.dopoIlRecinto(Math.max(ultima, misto._sequenza), { righe: 1, byte: 80, adottate: [misto], dopoLaScrittura: true });
    }
    tenuta.libera(true);
  }
  await Promise.allSettled(promesse);
  await pausa(30); // il `setImmediate` dell'avviso «scritta altrove»
  const ricaricheDopo = (stato.elenchi ?? 0) - elenchiPrima;
  await attendiScritture({ cartellaStore: store, sessionId });
  for (let i = 0; i < 400 && !registro.esiste(sessionId); i += 1) await pausa(5);
  const memoria = (registro.esporta(sessionId)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza));
  const conti = {
    modo, quante, ricaricata: allineata?.ricaricata === true, errori,
    mostrati: stato.trattenute.map((x) => x.numeroMostrato),
    numeriDopo: stato.trattenute.map((x) => x.argomenti.record._sequenza),
    attesi, scritti,
    inMemoria: tardivi.map((e) => memoria.filter((m) => chiave(m) === chiave(e)).length),
    memoriaDoppi: doppiDi(memoria.map((e) => e._sequenza)).length,
    noteAltroveDopo: ascolto.noteAltroveDopo, ricaricheDopo,
  };
  if (modo === 'senza-coda') {
    await registro.chiudi({ attesaMassimaMs: 1000 });
    const nuovo = registroDi(store, null);
    t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
    await nuovo.ripristina();
    const dopo = (nuovo.esporta(sessionId)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza));
    conti.dopoRiavvio = tardivi.map((e) => dopo.find((d) => chiave(d) === chiave(e))?._sequenza ?? null);
    conti.dopoDoppi = doppiDi(dopo.map((e) => e._sequenza)).length;
  }
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

for (const quante of [1, 2]) {
  test(`RV-0${quante} (${quante} late line(s) of a replaced entry, the store does not know where the tail of the other starts): each takes the number right above the last on the disk, once, from the entry of now; the replaced entry gives no note`, async (t) => {
    const c = await rigaTrattenuta(t, { modo: 'senza-coda', quante });
    assert.equal(c.ricaricata, true, 'the reload replaced the entry');
    assert.deepEqual(c.errori, [], 'no unhandled refusal');
    assert.deepEqual(c.numeriDopo, c.attesi, 'each late line takes the number right above the last on the disk (not one more, not one already used)');
    assert.ok(c.numeriDopo.every((n, i) => n > c.mostrati[i]), 'the number changes upwards');
    assert.deepEqual(c.inMemoria, c.inMemoria.map(() => 1), 'each late line is in the memory of the entry of now, once');
    assert.equal(c.memoriaDoppi, 0, 'no number twice in memory');
    assert.deepEqual(c.dopoRiavvio, c.numeriDopo, 'after a restart each late line has the same number');
    assert.equal(c.dopoDoppi, 0, 'no number twice after the restart');
    assert.equal(c.noteAltroveDopo, 0, 'the replaced entry gives no note "another TALOS wrote here": the chat was already read again, silently');
    assert.equal(c.ricaricheDopo, 0, 'the replaced entry does not start another reload of the chat: it is no longer the chat entry');
  });
}

for (const quante of [1, 2]) {
  test(`RV-0${quante + 2} (${quante} late line(s) of a replaced entry, the tail of the other found AFTER the line was written): the line keeps the number it was written with`, async (t) => {
    const c = await rigaTrattenuta(t, { modo: 'dopo-la-scrittura', quante });
    assert.equal(c.ricaricata, true, 'the reload replaced the entry');
    assert.deepEqual(c.errori, [], 'no unhandled refusal');
    assert.deepEqual(c.numeriDopo, c.scritti, 'a line already on the disk is not renumbered in memory: memory and disk keep the same number');
    assert.deepEqual(c.numeriDopo, c.mostrati, 'and it is the number already shown');
    assert.equal(c.ricaricheDopo, 0, 'the replaced entry does not start another reload of the chat: it is no longer the chat entry');
  });
}

async function ricaricaFallita(t, { quante }) {
  const store = mkdtempSync(join(tmpdir(), 'rvf-'));
  const stato = { store, sessionId: null, fallisci: false, inElenco: false };
  let liberaElenco;
  const cancello = new Promise((ok) => { liberaElenco = ok; });
  stato.elencaSessioniPersistiteFn = async (argomenti, ...resto) => {
    if (stato.fallisci) {
      stato.fallisci = false;
      stato.inElenco = true;
      await cancello;
      throw Object.assign(new Error('listing failed (injected by the test)'), { code: 'EIO' });
    }
    return elencaSessioniPersistite(argomenti, ...resto);
  };
  const { registro, sessionId, errori, ascolto } = await preparaChat(t, stato);
  scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
  stato.fallisci = true;
  const inCorso = registro.allineaSessione(sessionId).then((r) => ({ r }), (e) => ({ errore: String(e?.message ?? e) }));
  for (let i = 0; i < 2000 && !(stato.inElenco && !registro.esiste(sessionId)); i += 1) await pausa(1);
  const fuori = stato.inElenco && !registro.esiste(sessionId);
  const tardivi = [];
  const promesse = [];
  for (let i = 1; i <= quante; i += 1) {
    const e = { type: 'CUSTOM', name: 'talos.tardivo', value: { id: `tardivo-${i}` } };
    tardivi.push(e);
    promesse.push(Promise.resolve().then(() => stato.onEvento(e)));
  }
  await pausa(10);
  liberaElenco();
  const ricarica = await inCorso;
  const esiti = await Promise.allSettled(promesse);
  await pausa(30);
  await attendiScritture({ cartellaStore: store, sessionId });
  for (let i = 0; i < 400 && !registro.esiste(sessionId); i += 1) await pausa(5);
  await attendiScritture({ cartellaStore: store, sessionId });
  const scritte = righeScritte(store, sessionId).filter((r) => typeof r.type === 'string');
  const conti = {
    quante, fuori, ricarica, errori,
    rifiutate: esiti.filter((x) => x.status === 'rejected').map((x) => String(x.reason?.message ?? x.reason).slice(0, 120)),
    sulDisco: tardivi.map((e) => scritte.filter((r) => chiave(r) === chiave(e)).length),
    dalVivo: tardivi.map((e) => ascolto.consegne.get(chiave(e)) ?? 0),
  };
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

for (const quante of [1, 2]) {
  test(`RV-0${quante + 4} (${quante} late line(s) arrive while the reload reads the disk, and the reload fails): the line is not lost, it waits for the reload and then goes on with the entry of before`, async (t) => {
    const c = await ricaricaFallita(t, { quante });
    assert.equal(c.fuori, true, 'the late lines arrived while the entry was out for the reload');
    assert.ok(c.ricarica.errore || c.ricarica.r?.ricaricata !== true, 'the reload failed');
    assert.deepEqual(c.rifiutate, [], 'no late line is refused because the reload failed');
    assert.deepEqual(c.sulDisco, c.sulDisco.map(() => 1), 'each late line reaches the disk, once');
    assert.deepEqual(c.dalVivo, c.dalVivo.map(() => 1), 'each late line reaches who listens, once');
    assert.deepEqual(c.errori, [], 'no unhandled refusal');
  });
}
