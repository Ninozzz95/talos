/*
 * 27/10/2026 — revisione del blocco 10, B-R2: FOLDER_BLOCKED (409) e REMOTE_STORE_BUSY (503) arrivavano alla finestra del PC come
 * INTERNAL_ERROR «Internal error» (la finestra mostrava «Errore interno», senza dire quale blocco togliere). Le rotte del remoto mandavano lo
 * status giusto, ma la busta mette il codice solo se è dichiarato in http-app. Ora: il codice, lo status, e la frase VERA del modulo
 * delle cartelle (quale cartella, quale elenco).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';

async function banco(t, cartelle) {
  const server = http.createServer(createHttpApp({ staticHandler: async () => null, remotoFn: () => ({ cartelle }) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (percorso, corpo) => fetch(base + percorso, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(corpo) })
    .then(async (r) => ({ stato: r.status, corpo: await r.json() }));
}
const errore = (code, message) => Object.assign(new Error(message), { code });

test('REM-COD-01 «Aggiungi cartella» dentro una bloccata: 409 FOLDER_BLOCKED con la frase che nomina la bloccata, mai «Internal error»', async (t) => {
  const chiama = await banco(t, { consentiInAnticipo: async () => { throw errore('FOLDER_BLOCKED', 'This folder is inside "Documenti", which is blocked for this device: unblock it first.'); } });
  const r = await chiama('/api/v1/remote/phones/abcd1234efgh5678/folders', { percorso: 'C:\\Utenti\\Documenti\\Progetto' });
  assert.equal(r.corpo.error?.code, 'FOLDER_BLOCKED', JSON.stringify(r.corpo));
  assert.equal(r.stato, 409);
  assert.match(r.corpo.error.explanation, /inside "Documenti", which is blocked/u);
});

test('REM-COD-02 il lucchetto occupato: 503 REMOTE_STORE_BUSY con la sua frase, mai «Internal error»', async (t) => {
  const chiama = await banco(t, { consentiInAnticipo: async () => { throw errore('REMOTE_STORE_BUSY', 'Another TALOS window is changing the device folders: try again in a moment.'); } });
  const r = await chiama('/api/v1/remote/phones/abcd1234efgh5678/folders', { percorso: 'C:\\Utenti' });
  assert.equal(r.corpo.error?.code, 'REMOTE_STORE_BUSY', JSON.stringify(r.corpo));
  assert.equal(r.stato, 503);
  assert.match(r.corpo.error.explanation, /changing the device folders/u);
});
