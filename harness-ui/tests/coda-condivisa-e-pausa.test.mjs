import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⭐⭐ 14/09/2026 — LA CODA È DELLA SESSIONE, NON DELLA FINESTRA. Owner: «i competitor lo fanno, lo facciamo anche noi».
 *
 * Trovato col giro vero del 13/09: un messaggio accodato non si vedeva in un'altra finestra né dopo una ricarica, e dopo uno
 * stop il banner prometteva «parte alla fine di questo giro» su un giro già fermo — mentre la coda, viva sul server,
 * sarebbe scivolata in silenzio alla fine della risposta successiva.
 * Letto nei cloni il 14/09/2026: Codex tiene la coda nel `ThreadStore` e la espone a ogni client (`thread/queue/*`);
 * Hermes la mette IN PAUSA allo Stop («an explicit halt must not roll straight into the next queued prompt»).
 *
 * ⛔ Ogni regola ha il suo verso contrario: senza stop la coda SCORRE; togliere per id non toglie l'ultimo; l'annuncio arriva a
 *   chi ascolta ma NON entra negli eventi; «Invia ora» che viene rifiutato rimette il messaggio al suo posto.
 */

const CONSEGNA_INTERROTTA = '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.';

function banco({ cartellaStore = mkdtempSync(join(tmpdir(), 'talos-coda-')) } = {}) {
  const giri = [];
  const registro = createSessionRegistry({
    cartellaStore,
    avviaSessioneFn: (input) => {
      let concludi;
      const fine = new Promise((resolve) => { concludi = resolve; });
      const giro = { input, concludi, onEvento: input.onEvento };
      giri.push(giro);
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}`, input: input.task, contesto: {} });
      return fine;
    },
    preparaEsecuzioneLiberaFn: (cartelleProgetto, { cartellaId, consegna }) => {
      const voce = cartelleProgetto.find((c) => c.id === cartellaId);
      return { cartella: voce.percorso, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } };
    },
    cartelleProgetto: [{ id: '0', percorso: tmpdir(), nome: 'progetto' }],
    modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
  return {
    cartellaStore, registro, giri,
    get ultimo() { return giri.at(-1); },
    /** Lo stop come succede davvero: il registro abortisce, il kernel chiude il giro con `fermato`. */
    async ferma(sessionId) {
      registro.ferma(sessionId);
      const giro = giri.at(-1);
      giro.onEvento({ type: 'RunError', code: 'fermato', message: CONSEGNA_INTERROTTA });
      giro.concludi({ ok: false, esito: { comeFinita: 'fermato', detto: CONSEGNA_INTERROTTA, messaggiFinali: [...giro.input.messaggiIniziali ?? [{ role: 'user', content: 'ciao' }]] } });
      await new Promise((r) => setImmediate(r));
    },
    righe(sessionId) {
      return readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
    },
    /* Classe A di BC-09: il registro scrive e chiude il registro dentro la chiamata, nessun server o watcher resta vivo. */
    pulisci() { rimuoviCartellaDiProva(cartellaStore); },
  };
}

async function avvia(b, consegna = 'fai il lavoro') {
  const { sessionId } = b.registro.avviaLibero({ cartellaId: '0', consegna });
  await new Promise((r) => setImmediate(r));
  const annunci = [];
  b.registro.iscriviti(sessionId, (e) => { if (e.type === 'CUSTOM' && e.name === 'talos.coda') annunci.push(e.value); });
  return { sessionId, annunci };
}

async function aspettaSulDisco(b, sessionId, condizione) {
  for (let i = 0; i < 200; i += 1) {
    try { if (condizione(b.righe(sessionId))) return; } catch { /* il file può non esistere ancora */ }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('la condizione non è mai arrivata sul disco');
}

test('⭐⭐ uno STOP mette la coda in pausa: resta a vista, e il kernel non la consegna nel giro dopo', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId, annunci } = await avvia(b);
  b.registro.accodaMessaggio(sessionId, 'quando hai finito, aggiorna il README');
  const codaDelKernel = b.ultimo.input.codaMessaggiFn;

  await b.ferma(sessionId);
  const stato = b.registro.statoCoda(sessionId);
  assert.deepEqual(stato.voci.map((v) => v.testo), ['quando hai finito, aggiorna il README'], 'il messaggio non sparisce');
  assert.equal(stato.inPausa, true, 'uno stop esplicito non deve scivolare nel prossimo messaggio in coda');
  assert.equal(codaDelKernel(), null, '⛔ in pausa il kernel non consegna');
  assert.equal(annunci.at(-1).inPausa, true, 'chi guarda da un’altra finestra lo sa subito');
});

test('⛔⛔ AL CONTRARIO — senza stop la coda SCORRE: il kernel la consegna, e l’annuncio dice che si è svuotata', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId, annunci } = await avvia(b);
  b.registro.accodaMessaggio(sessionId, 'e poi i test');
  assert.equal(b.ultimo.input.codaMessaggiFn(), 'e poi i test');
  assert.deepEqual(annunci.at(-1), { voci: [], inPausa: false });
  assert.deepEqual(b.registro.statoCoda(sessionId), { ok: true, voci: [], inPausa: false });
});

test('⭐⭐ l’annuncio della coda è di SOLO TRASPORTO: arriva a chi ascolta, non entra negli eventi né sul disco come evento', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId, annunci } = await avvia(b);
  const esito = b.registro.accodaMessaggio(sessionId, 'un messaggio da vedere ovunque');
  assert.equal(annunci.length, 1, 'premessa: l’annuncio c’è');
  assert.equal(typeof esito.coda.voci[0].id, 'string', 'ogni voce ha il suo id');

  const storia = [];
  b.registro.iscriviti(sessionId, (e) => storia.push(e))();
  assert.equal(storia.some((e) => e.type === 'CUSTOM' && e.name === 'talos.coda'), false, '⛔ BC-07: lo stato della coda non è storia');
  await aspettaSulDisco(b, sessionId, (righe) => righe.some((r) => r.tipo === 'coda'));
  const righe = b.righe(sessionId);
  assert.equal(righe.some((r) => r.type === 'CUSTOM' && r.name === 'talos.coda'), false, 'nessuna riga-evento della coda sul disco');
  assert.deepEqual(righe.filter((r) => r.tipo === 'coda').at(-1).voci.map((v) => v.testo), ['un messaggio da vedere ovunque'], 'ma il RECORD della coda sì');
});

test('⭐⭐ «Togli» con l’id toglie QUEL messaggio — al contrario di prima, non l’ultimo', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = await avvia(b);
  const primo = b.registro.accodaMessaggio(sessionId, 'primo').coda.voci[0];
  b.registro.accodaMessaggio(sessionId, 'secondo');
  const tolto = b.registro.svuotaCoda(sessionId, { id: primo.id });
  assert.equal(tolto.rimosso, true);
  assert.deepEqual(tolto.coda.voci.map((v) => v.testo), ['secondo']);
  assert.equal(b.registro.svuotaCoda(sessionId, { id: 'non-esiste' }).rimosso, false, 'un id che non c’è non toglie niente');
  assert.deepEqual(b.registro.statoCoda(sessionId).voci.map((v) => v.testo), ['secondo']);
});

test('⭐⭐ «Invia ora» a giro VIVO è una correzione: il messaggio lascia la coda ed entra come reindirizzamento', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = await avvia(b);
  const voce = b.registro.accodaMessaggio(sessionId, 'cambia strada: guarda il README').coda.voci[0];
  const richieste = [];
  b.registro.iscriviti(sessionId, (e) => { if (e.type === 'RunRedirectRequested') richieste.push(e); });
  const esito = await b.registro.inviaDallaCoda(sessionId, voce.id);
  assert.equal(esito.modo, 'reindirizzato');
  assert.deepEqual(esito.coda.voci, []);
  assert.equal(richieste.at(-1).testo, 'cambia strada: guarda il README');
});

test('⛔⛔ AL CONTRARIO — se la porta rifiuta, il messaggio torna AL SUO POSTO (una parola della persona non si perde)', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = await avvia(b);
  b.registro.accodaMessaggio(sessionId, 'primo');
  const secondo = b.registro.accodaMessaggio(sessionId, 'secondo').coda.voci[1];
  b.registro.accodaMessaggio(sessionId, 'terzo');
  assert.equal(b.registro.reindirizza(sessionId, 'una correzione già in viaggio').ok, true, 'premessa: un reindirizzamento è già in attesa');
  const esito = await b.registro.inviaDallaCoda(sessionId, secondo.id);
  assert.equal(esito.code, 'SESSION_NOT_READY');
  assert.deepEqual(b.registro.statoCoda(sessionId).voci.map((v) => v.testo), ['primo', 'secondo', 'terzo'], 'stesso ordine di prima');
  assert.equal((await b.registro.inviaDallaCoda(sessionId, 'non-esiste')).code, 'NOT_FOUND');
});

test('⭐⭐ «Invia ora» a giro FERMO riprende la sessione con quel messaggio; il resto resta in pausa finché non si accoda altro', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = await avvia(b);
  const a = b.registro.accodaMessaggio(sessionId, 'messaggio A').coda.voci[0];
  b.registro.accodaMessaggio(sessionId, 'messaggio B');
  await b.ferma(sessionId);

  const esito = await b.registro.inviaDallaCoda(sessionId, a.id);
  assert.equal(esito.modo, 'ripreso');
  assert.equal(b.giri.length, 2, 'un giro nuovo è partito');
  const ultimoMessaggio = b.ultimo.input.messaggiIniziali.at(-1);
  assert.equal(ultimoMessaggio.content, 'messaggio A', 'il giro nuovo parte DAL messaggio inviato');
  assert.deepEqual(esito.coda, { voci: [{ id: esito.coda.voci[0].id, testo: 'messaggio B', immagini: 0 }], inPausa: true });
  assert.equal(b.ultimo.input.codaMessaggiFn(), null, '⛔ B era fermo prima: resta fermo, non scivola in questo giro');

  b.registro.accodaMessaggio(sessionId, 'messaggio C');
  assert.equal(b.registro.statoCoda(sessionId).inPausa, false, 'accodare di nuovo scioglie la pausa');
  assert.equal(b.ultimo.input.codaMessaggiFn(), 'messaggio B');
  assert.equal(b.ultimo.input.codaMessaggiFn(), 'messaggio C');
});

test('⭐⭐ la coda sopravvive a un RIAVVIO del server, e torna in pausa: il processo che l’avrebbe consegnata non c’è più', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = await avvia(b);
  b.registro.accodaMessaggio(sessionId, 'dopo il riavvio');
  await aspettaSulDisco(b, sessionId, (righe) => righe.some((r) => r.type === 'RunStarted'));

  const riaperto = banco({ cartellaStore: b.cartellaStore }).registro;
  const { ripristinate } = await riaperto.ripristina();
  assert.equal(ripristinate, 1, 'premessa: la sessione si riapre');
  const stato = riaperto.statoCoda(sessionId);
  assert.deepEqual(stato.voci.map((v) => v.testo), ['dopo il riavvio']);
  assert.equal(stato.inPausa, true);
});

test('⛔⛔ AL CONTRARIO — una coda svuotata prima del riavvio non torna', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = await avvia(b);
  b.registro.accodaMessaggio(sessionId, 'lo tolgo subito');
  b.registro.svuotaCoda(sessionId);
  await aspettaSulDisco(b, sessionId, (righe) => righe.filter((r) => r.tipo === 'coda').length >= 2);

  const riaperto = banco({ cartellaStore: b.cartellaStore }).registro;
  await riaperto.ripristina();
  assert.deepEqual(riaperto.statoCoda(sessionId), { ok: true, voci: [], inPausa: false });
});
