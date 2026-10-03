/*
 * ⛔⛔ K2 (03/10/2026, «L'interfaccia, dal codice») — LA RISPOSTA D'ERRORE PORTA IL MOTIVO E I VALORI, accanto al codice.
 * Un rifiuto del registro è `{ erroreAvvio, code, reason, params? }` (vedi `rifiuto()` in `session-registry.mjs`). Le rotte lo
 * trasformano in una busta d'errore: `code` come sempre, più `reason` (identificatore stabile) e `params` (i valori della frase),
 * perché l'interfaccia scelga la sua voce del dizionario. Google AIP-193 «Errors» (google.aip.dev/193, letta il 03/10/2026): la
 * coppia (dominio, reason) è l'identità dell'errore, i valori dinamici viaggiano a parte.
 *
 * ⛔ Nei due versi: un motivo della forma ammessa arriva; un motivo che non lo è (testo libero, percorso, maiuscole) NON esce;
 * e senza motivo la busta resta quella di prima, senza una chiave `reason` vuota.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';

async function ascolta(t, registro) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const registroSpia = (risposta) => ({ cercaFile: async () => risposta });
async function errore(t, risposta) {
  const base = await ascolta(t, registroSpia(risposta));
  const r = await fetch(`${base}/api/v1/sessions/s/tree/search?q=a`);
  return { stato: r.status, error: (await r.json()).error };
}

test('RIFIUTI-HTTP-01 — il motivo e i valori del rifiuto arrivano nella busta, e il codice è quello di sempre', async (t) => {
  const { stato, error } = await errore(t, { erroreAvvio: 'Session not found', code: 'NOT_FOUND', reason: 'session-not-found' });
  assert.equal(stato, 404);
  assert.equal(error.code, 'NOT_FOUND');
  assert.equal(error.reason, 'session-not-found');
  const conValori = await errore(t, { erroreAvvio: 'Hook "pre" not found in .harness-ui-hooks.json', code: 'NOT_FOUND', reason: 'hook-not-found', params: { hookId: 'pre' } });
  assert.deepEqual(conValori.error.params, { hookId: 'pre' });
  assert.equal(conValori.error.reason, 'hook-not-found');
});

test('RIFIUTI-HTTP-02 — SESSION_NOT_READY: la frase inglese del registro arriva come spiegazione, e l’interfaccia la dice in italiano', async (t) => {
  const frase = 'A compaction is already in progress for this session. Wait for the result before trying again.';
  const { stato, error } = await errore(t, { erroreAvvio: frase, code: 'SESSION_NOT_READY', reason: 'compaction-in-progress' });
  assert.equal(stato, 409);
  assert.equal(error.reason, 'compaction-in-progress');
  assert.equal(error.explanation, frase, 'la frase del registro è la spiegazione');
  impostaLingua('it');
  assert.equal(testoErroreServer(error).explanation, 'Una compattazione è già in corso per questa sessione. Attendi il risultato prima di riprovare.');
  impostaLingua('en');
  assert.equal(testoErroreServer(error).explanation, frase);
  impostaLingua('it');
});

test('RIFIUTI-HTTP-03 — AL CONTRARIO: un motivo che non è un identificatore (testo libero, percorso, maiuscole) NON esce, e senza motivo non c’è la chiave', async (t) => {
  for (const reason of ['Sessione non trovata', 'C:\\Users\\x\\file.txt', 'SESSION_NOT_FOUND', '-a', 'a--b', 'x'.repeat(81), 42]) {
    const { error } = await errore(t, { erroreAvvio: 'Session not found', code: 'NOT_FOUND', reason });
    assert.ok(!('reason' in error), `il motivo «${String(reason).slice(0, 20)}» non deve uscire`);
  }
  const senza = await errore(t, { erroreAvvio: 'Session not found', code: 'NOT_FOUND' });
  assert.ok(!('reason' in senza.error));
  assert.equal(senza.error.code, 'NOT_FOUND');
});

test('RIFIUTI-HTTP-04 — il motivo di un codice diverso da quello della risposta non viaggia (la busta dice un codice solo)', async (t) => {
  // un rifiuto con codice ignoto al server cade su INTERNAL_ERROR: il suo motivo non descrive più ciò che la persona vede
  const { error } = await errore(t, { erroreAvvio: 'x', code: 'CODICE_CHE_NON_ESISTE', reason: 'some-reason' });
  assert.equal(error.code, 'INTERNAL_ERROR');
  assert.ok(!('reason' in error), 'il motivo di un altro codice non si attacca a INTERNAL_ERROR');
});

/* Revisione K2 (03/10/2026): un PERCORSO ASSOLUTO del disco (la copia di sicurezza della coda incerta) non esce nei `params`
   della busta — prima di K2 stava solo nella frase del registro, che per SESSION_STORE_AMBIGUOUS non si pubblica. AL CONTRARIO:
   gli altri valori della stessa frase escono, e senza valori pubblici la chiave `params` non c'è. */
test('RIFIUTI-HTTP-05 — un percorso assoluto del disco non esce nei valori della busta', async (t) => {
  const windows = await errore(t, { erroreAvvio: 'x', code: 'SESSION_STORE_AMBIGUOUS', reason: 'queue-uncertain-with-backup', params: { backup: 'C:\\Users\\persona\\dati\\coda.bak', n: 2 } });
  assert.deepEqual(windows.error.params, { n: 2 });
  const posix = await errore(t, { erroreAvvio: 'x', code: 'SESSION_STORE_AMBIGUOUS', reason: 'queue-uncertain-with-backup', params: { backup: '/home/persona/coda.bak' } });
  assert.equal('params' in posix.error, false);
  assert.equal(JSON.stringify(posix.error).includes('persona'), false, 'il percorso non compare da nessuna parte nella busta');
  const rete = await errore(t, { erroreAvvio: 'x', code: 'SESSION_STORE_AMBIGUOUS', reason: 'queue-uncertain-with-backup', params: { backup: '\\\\server\\condivisa\\coda.bak' } });
  assert.equal('params' in rete.error, false);
});
