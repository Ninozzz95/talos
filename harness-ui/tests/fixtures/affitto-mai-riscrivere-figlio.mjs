/*
 * 14/11/2026 — terzo giro dell'affitto, «mai riscrivere» (scelta dell'owner, giudice v1838). Un processo Node VERO per
 * `tests/affitto-mai-riscrivere.test.mjs`, nato dagli attrezzi del revisore affitto 2 di 3 (`zz-rev-aff2-altro.mjs`, `dp-figlio.mjs`).
 * argv: <ruolo> <cartellaStore> [json opzioni]. Risponde `{ pronto: pid }`, poi lavora a ogni messaggio IPC.
 *  · altro: scrive giri suoi SENZA affitto (lo store vero, come un TALOS di prima o senza affitto), coi numeri presi dal disco
 *    all'inizio del giro: `{ giro, sessionId, fermoMs }` ⇒ `{ fatto, primo, ms, runId, fallite }`; `{ fine: true }` ⇒ esce.
 *  · scrittore: `{ via: true, sessionId, ogniMs, perMs, caricoMs, almeno, tettoMs }` ⇒ una nota ogni `ogniMs` SENZA affitto per `perMs`
 *    (e oltre, finché non ne ha scritte `almeno`, mai oltre `tettoMs`), coi numeri dal disco (`caricoMs`: ferma prima di ogni scrittura,
 *    la macchina carica simulata); risponde `{ riuscite: [id…], istanti: [ms…], errori: {codice: n} }`.
 *  · ripristino: `{ via: true }` ⇒ registro con l'affitto fra processi, ripristino vero di tutto l'archivio; risponde coi numeri in
 *    memoria `{ numeri: { <sessionId>: { <chiave>: <numero> } } }` e resta vivo finché non riceve `{ fine: true }`.
 *  · turno: registro con l'affitto, una chat nuova con un giro di `pezzi` pezzi; prima di ogni pezzo chiede al padre `{ pezzo: i }` e
 *    aspetta `{ avanti: true }` (il padre intanto scrive come un altro TALOS). A giro finito e scritto risponde `{ numeri, sessionId }`
 *    e resta vivo: il padre lo uccide (crash vero) prima che faccia altro.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attendiScritture, attivaAffittiArchivio, registraRiga } from '../../src/session-store.mjs';
import { createSessionRegistry } from '../../src/session-registry.mjs';

const [ruolo, cartellaStore, opzioniJson] = process.argv.slice(2);
const opzioni = JSON.parse(opzioniJson || '{}');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.delta ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}`;
const ultimoSulDisco = (sessionId) => {
  let massimo = 0;
  for (const testo of readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n')) {
    if (!testo) continue;
    try { const n = JSON.parse(testo)._sequenza; if (Number.isSafeInteger(n) && n > massimo) massimo = n; } catch { /* riga a metà */ }
  }
  return massimo;
};
const registroVero = (avviaSessioneFn = async () => ({ ok: true, esito: { detto: 'x', comeFinita: 'concluso' } })) => createSessionRegistry({
  cartellaStore, affittoFraProcessi: { etichetta: `mr ${process.pid}` }, guardaWorkspaceFn: () => () => {},
  preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
  modello: 'm', chiave: 'k', avviaSessioneFn,
});
const numeriDi = (voce) => Object.fromEntries((voce?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza)).map((e) => [chiave(e), e._sequenza]));

let fila = Promise.resolve();
const attesePadre = [];
process.on('message', (messaggio) => {
  if (messaggio?.avanti) { attesePadre.shift()?.(); return; }
  if (messaggio?.fine) { fila.then(() => process.exit(0)); return; }
  fila = fila.then(async () => {
    if (ruolo === 'altro') {
      const inizio = Date.now();
      const { sessionId, giro: detto, fermoMs = 0 } = messaggio ?? {};
      let n = ultimoSulDisco(sessionId);
      const primo = n + 1;
      const runId = `altrove-${n}-${Math.random().toString(16).slice(2, 6)}`;
      const messageId = `m-${runId}`;
      const ev = (type, extra) => ({ type, _sequenza: ++n, ...extra });
      const giro = [ev('RunStarted', { threadId: sessionId, runId }), ev('TextMessageStart', { messageId, role: 'assistant' }),
        ev('TextMessageContent', { messageId, delta: detto }), ev('TextMessageEnd', { messageId }),
        ev('RunFinished', { threadId: sessionId, runId, result: { detto } })];
      const fallite = [];
      for (let k = 0; k < giro.length; k += 1) {
        if (k === 2 && fermoMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, fermoMs);
        try { await registraRiga({ cartellaStore, sessionId, record: giro[k] }); } catch (e) { fallite.push(e?.code ?? String(e)); }
      }
      process.send({ fatto: n, primo, ms: Date.now() - inizio, runId, fallite });
    } else if (ruolo === 'scrittore') {
      /* 14/11/2026 (quarto giro): `caricoMs` simula un processo affamato dalla macchina carica (si ferma prima di ogni scrittura);
         `almeno`: si continua oltre `perMs` finché le note scritte davvero non sono `almeno` (mai oltre `tettoMs`: se ogni scrittura
         fallisce, la risposta lo dice e la prova cade). `istanti`: quando è riuscita ogni nota (stesso orologio del padre). */
      const { sessionId, ogniMs = 30, perMs = 1500, caricoMs = 0, almeno = 0, tettoMs = 60000 } = messaggio;
      const t0 = Date.now();
      const riuscite = []; const istanti = []; const errori = {};
      for (let k = 0; (Date.now() - t0 < perMs || riuscite.length < almeno) && Date.now() - t0 < tettoMs; k += 1) {
        if (caricoMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, caricoMs);
        const id = process.pid * 1000 + k;
        let n = 0;
        try { n = ultimoSulDisco(sessionId); } catch (e) { errori[`lettura ${e?.code}`] = (errori[`lettura ${e?.code}`] ?? 0) + 1; }
        try { await registraRiga({ cartellaStore, sessionId, record: { type: 'CUSTOM', name: 'talos.nota-altrove', value: { id }, _sequenza: n + 1 } }); riuscite.push(id); istanti.push(Date.now()); }
        catch (e) { errori[e?.code ?? 'altro'] = (errori[e?.code ?? 'altro'] ?? 0) + 1; }
        await pausa(ogniMs);
      }
      process.send({ riuscite, istanti, errori });
    } else if (ruolo === 'ripristino') {
      attivaAffittiArchivio(cartellaStore, { etichetta: `mr ${process.pid}`, battitoMs: 0 });
      const registro = registroVero();
      const t0 = Date.now();
      await registro.ripristina();
      const ms = Date.now() - t0;
      const numeri = {};
      for (const id of opzioni.sessioni ?? []) numeri[id] = numeriDi(registro.esporta(id));
      process.send({ numeri, ms });
    } else if (ruolo === 'turno') {
      attivaAffittiArchivio(cartellaStore, { etichetta: `mr ${process.pid}`, battitoMs: 0, rilascioDopoMs: 0 });
      const stato = { sessionId: null };
      let fineGiro;
      const finito = new Promise((ok) => { fineGiro = ok; });
      const registro = registroVero(async (input) => {
        while (!stato.sessionId) await pausa(5);
        input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
        input.onEvento({ type: 'TextMessageStart', messageId: 'mio', role: 'assistant' });
        await attendiScritture({ cartellaStore, sessionId: stato.sessionId });
        for (let i = 0; i < (opzioni.pezzi ?? 12); i += 1) {
          await new Promise((ok) => { attesePadre.push(ok); process.send({ pezzo: i, sessionId: stato.sessionId }); });
          input.onEvento({ type: 'TextMessageContent', messageId: 'mio', delta: `p${String(i).padStart(2, '0')} ` });
        }
        input.onEvento({ type: 'TextMessageEnd', messageId: 'mio' });
        input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
        fineGiro();
        return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso' } };
      });
      const { sessionId } = registro.avviaLibero({ cartellaLibera: opzioni.lavoro, consegna: 'scrivi', permessi: 'Full access' });
      const visti = {}; // ciò che ha visto chi ascoltava: il PRIMO numero di ogni riga
      registro.iscriviti(sessionId, (e) => { if (Number.isSafeInteger(e._sequenza)) visti[chiave(e)] ??= e._sequenza; }, 0);
      stato.sessionId = sessionId;
      await finito;
      await registro.attendiAssestamento(sessionId);
      await attendiScritture({ cartellaStore, sessionId });
      process.send({ numeri: numeriDi(registro.esporta(sessionId)), visti, sessionId });
    }
  });
});
process.send({ pronto: process.pid });
