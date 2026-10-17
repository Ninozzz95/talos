/*
 * Le prove di `http-rifiuti-con-motivo.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
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



/* Revisione K2 (03/10/2026): un PERCORSO ASSOLUTO del disco (la copia di sicurezza della coda incerta) non esce nei `params`
   della busta — prima di K2 stava solo nella frase del registro, che per SESSION_STORE_AMBIGUOUS non si pubblica. AL CONTRARIO:
   gli altri valori della stessa frase escono, e senza valori pubblici la chiave `params` non c'è. */
