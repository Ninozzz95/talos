import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

/*
 * ⛔⛔⛔ 16/09 — «Invio non riuscito: Failed to fetch» incollando un prompt lungo nella chat (owner, dal vivo).
 *
 * «Failed to fetch» è il browser che dice che NESSUNA risposta HTTP è arrivata. Riprodotto: il server accettava
 * al massimo 4.096 byte di corpo (`MAX_REQUEST_BODY_BYTES`) e, al primo byte in più, `leggiCorpoJson` faceva
 * `req.destroy()` — la connessione moriva prima che partisse una risposta, e il 413 `PAYLOAD_LIMIT`, che ha la sua
 * riga e la sua copia, non era raggiungibile dall'esterno (lo diceva un commento in `http-app.mjs`, e un test lo
 * dichiarava «non provabile» invece di curarlo). Un prompt di 12 KB è un messaggio normale in una chat di lavoro.
 *
 * Due difetti, due famiglie di prove sulla STESSA rotta che l'owner ha colpito (`POST …/resume`, il messaggio incollato
 * in una chat aperta): la FORMA del rifiuto (413 con la copia, drenando il corpo così che il client legga la risposta)
 * e la MISURA del tetto (un messaggio da 12 KB entra col tetto di serie).
 */
async function conServer(t, app) {
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

/** Il registro finto: la rotta del resume chiede solo `resume(sessionId, messaggio, immagini)`. Registra cosa riceve. */
function registroFinto() {
  const ricevuti = [];
  return { ricevuti, resume(sessionId, messaggio, immagini) { ricevuti.push({ sessionId, messaggio, immagini }); return { sessionId }; } };
}

function resume(base, messaggio) {
  return fetch(`${base}/api/v1/sessions/s1/resume`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ messaggio }),
  });
}

const QUATTRO_KB = 4096; // il tetto di PRIMA, iniettato: così la prova racconta esattamente il difetto dell'owner

test('CORPO-413-01 — un corpo oltre il limite riceve una RISPOSTA 413 con la sua copia, non una connessione morta', async (t) => {
  const registro = registroFinto();
  const base = await conServer(t, createHttpApp({ sessionRegistry: registro, limiteCorpoByte: QUATTRO_KB }));
  const risposta = await resume(base, 'y'.repeat(5_000));
  assert.equal(risposta.status, 413);
  const busta = await risposta.json();
  assert.equal(busta.ok, false);
  assert.equal(busta.error.code, 'PAYLOAD_LIMIT');
  assert.match(busta.error.message, /accorcia il messaggio/, 'il messaggio dice a parole cosa fare');
  assert.equal(registro.ricevuti.length, 0, 'un corpo rifiutato non arriva MAI al registro');
});

test('CORPO-413-02 — anche un corpo TRE volte oltre il limite riceve il 413: il server drena, non chiude in faccia', async (t) => {
  const base = await conServer(t, createHttpApp({ sessionRegistry: registroFinto(), limiteCorpoByte: QUATTRO_KB }));
  const risposta = await resume(base, 'y'.repeat(12_000));
  assert.equal(risposta.status, 413);
  assert.equal((await risposta.json()).error.code, 'PAYLOAD_LIMIT');
});

test('CORPO-12KB-01 — il percorso dell\'owner col tetto DI SERIE: un messaggio da 12 KB incollato in una chat aperta ARRIVA al registro', async (t) => {
  const registro = registroFinto();
  const base = await conServer(t, createHttpApp({ sessionRegistry: registro }));
  const messaggio = 'Voglio condurre un audit tecnico approfondito dell’ambiente agentico in cui stai operando.\n'.repeat(140).trim();
  assert.ok(Buffer.byteLength(messaggio) > 12_000, `il messaggio di prova deve essere >12 KB, è ${Buffer.byteLength(messaggio)}`);
  const risposta = await resume(base, messaggio);
  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).data.sessionId, 's1');
  assert.equal(registro.ricevuti.length, 1);
  assert.equal(registro.ricevuti[0].messaggio, messaggio, 'il testo arriva intero (la rotta ripulisce solo gli spazi ai bordi)');
});

test('CORPO-INIETTATO-01 — il tetto è iniettabile: con 1 KB lo stesso percorso riceve il 413 (il verso che prova che il tetto morde)', async (t) => {
  const registro = registroFinto();
  const base = await conServer(t, createHttpApp({ sessionRegistry: registro, limiteCorpoByte: 1024 }));
  const risposta = await resume(base, 'x'.repeat(2_000));
  assert.equal(risposta.status, 413);
  assert.equal((await risposta.json()).error.code, 'PAYLOAD_LIMIT');
  assert.equal(registro.ricevuti.length, 0);
});

test('⛔ AL CONTRARIO — oltre il tetto di DRENAGGIO (4× il limite) il server chiude davvero: un corpo enorme non si legge fino in fondo', async (t) => {
  const base = await conServer(t, createHttpApp({ sessionRegistry: registroFinto(), limiteCorpoByte: QUATTRO_KB }));
  let esito;
  try {
    const risposta = await resume(base, 'y'.repeat(65_536)); // 64 KB: 16× il limite, ben oltre il 4× drenato
    esito = risposta.status === 413 ? 'ha risposto 413 comunque' : `ha risposto ${risposta.status}`;
  } catch (errore) {
    esito = `connessione chiusa (${errore.cause?.code ?? errore.name})`;
  }
  // ⛔ Entrambi gli esiti sono onesti: o il 413 è arrivato prima che il client finisse, o il server ha tagliato un corpo
  //   che nessuno dovrebbe mandare. L'unico esito VIETATO è un 2xx.
  assert.doesNotMatch(esito, /ha risposto 2/);
});
