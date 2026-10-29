import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 27/10/2026 — owner: «un messaggio in coda non appare nel mobile collegato ma nel pc sì». Prima di cercare dalla parte del telefono
 * si prova la metà del PC col registro VERO, il gestore HTTP VERO e le operazioni remote VERE: un messaggio accodato dalla finestra del
 * PC (POST /queue, la stessa rotta di app.js) a giro vivo deve arrivare sullo stream del dispositivo, sia a chi si iscrive DOPO (la coda
 * subito dopo la storia, `iscriviConRigiocata`) sia a chi è già iscritto (l'annuncio dal vivo, `annunciaCoda`).
 * Verso contrario: tolto dalla coda sul PC, sul dispositivo la coda torna vuota.
 */

function cartellaDiProva(prefisso) {
  const casa = fileURLToPath(new URL('../.talos/', import.meta.url));
  mkdirSync(casa, { recursive: true });
  return mkdtempSync(join(casa, prefisso));
}

function banco() {
  const cartellaStore = cartellaDiProva('rcoda-store-');
  const cartellaProgetto = cartellaDiProva('rcoda-progetto-');
  const giri = [];
  const registro = createSessionRegistry({
    cartellaStore,
    avviaSessioneFn: (input) => {
      let concludi;
      const fine = new Promise((resolve) => { concludi = resolve; });
      giri.push({ input, concludi });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}`, input: input.task, contesto: {} });
      return fine;
    },
    preparaEsecuzioneLiberaFn: (cartelleProgetto, { cartellaId, consegna }) => {
      const voce = cartelleProgetto.find((c) => c.id === cartellaId);
      return { cartella: voce.percorso, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } };
    },
    cartelleProgetto: [{ id: '0', percorso: cartellaProgetto, nome: 'progetto' }],
    guardaWorkspaceFn: () => () => {},
    modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata });
  const ricevuti = [];
  const iscrizioni = new Map();
  const contesto = { dispositivo: { id: 'd-1', nome: 'Pad' }, iscrizioni,
    iscrivi: (sub, chiudi) => { iscrizioni.set(sub, chiudi); return async (data) => { ricevuti.push({ sub, data }); }; } };
  return {
    registro, giri, operazioni, contesto, ricevuti, chiama,
    code: (sub) => ricevuti.filter((r) => r.sub === sub && r.data?.type === 'CUSTOM' && r.data.name === 'talos.coda').map((r) => r.data.value),
    pulisci() { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartellaProgetto); },
  };
}

const dalPc = (b, sessionId, corpo) => b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/queue`, corpo });
const aspetta = () => new Promise((r) => setImmediate(r));

test('RCODA-01 un messaggio accodato dal PC a giro vivo arriva al dispositivo già iscritto, dal vivo', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = b.registro.avviaLibero({ cartellaId: '0', consegna: 'fai il lavoro' });
  await aspetta();
  await b.operazioni.esegui('session.events', { sessionId, sub: 'codice' }, b.contesto);
  assert.deepEqual(b.code('codice').at(-1)?.voci, [], 'all\'iscrizione la coda c\'è, vuota');
  const esito = await dalPc(b, sessionId, { messaggio: 'poi aggiungi i test' });
  assert.equal(esito.stato, 200);
  await aspetta();
  const ultima = b.code('codice').at(-1);
  assert.equal(ultima?.voci?.length, 1, `il dispositivo vede la coda nuova: ${JSON.stringify(ultima)}`);
  assert.equal(ultima.voci[0].testo, 'poi aggiungi i test');
  /* verso contrario: tolto sul PC, sul dispositivo la coda torna vuota */
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/queue/annulla`, corpo: { id: ultima.voci[0].id } });
  await aspetta();
  assert.deepEqual(b.code('codice').at(-1)?.voci, [], 'tolto sul PC, tolto sul dispositivo');
});

test('RCODA-02 un dispositivo che apre la conversazione DOPO trova il messaggio accodato dal PC subito dopo la storia', async (t) => {
  const b = banco();
  t.after(() => b.pulisci());
  const { sessionId } = b.registro.avviaLibero({ cartellaId: '0', consegna: 'fai il lavoro' });
  await aspetta();
  await dalPc(b, sessionId, { messaggio: 'e poi il README' });
  await aspetta();
  await b.operazioni.esegui('session.events', { sessionId, sub: 'tardi' }, b.contesto);
  const nomi = b.ricevuti.filter((r) => r.sub === 'tardi').map((r) => (r.data.type === 'CUSTOM' ? r.data.name : r.data.type));
  const fine = nomi.indexOf('talos.fine-rigiocata');
  assert.ok(fine >= 0 && nomi.indexOf('talos.coda', fine) > fine, `la coda arriva dopo la fine della storia: ${nomi.join(', ')}`);
  assert.deepEqual(b.code('tardi').at(-1)?.voci?.map((v) => v.testo), ['e poi il README']);
});
