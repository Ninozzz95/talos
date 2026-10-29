/*
 * 27/10/2026 — revisione del blocco 10, A-R1 = D-R1, curata per CLASSE. La busta d'errore prende titolo, spiegazione e azione da
 * `public-problem.mjs` `MESSAGES`; un codice che lì non c'era ricadeva sulla copia di INTERNAL_ERROR («An unexpected problem occurred»,
 * «Open Doctor, copy the reference»). Misurato: 282 codici dichiarati su 330. La prova guarda TUTTI i codici dichiarati, non un elenco
 * scelto a mano: un codice aggiunto domani senza voce propria prende la copia neutra con la sua frase, mai quella del guasto.
 * RFC 9457 (letta il 27/10/2026): per un tipo generico il titolo è la frase di stato HTTP (§4.2.1), la spiegazione aiuta a correggere (§3.1.4).
 */
import assert from 'node:assert/strict';
import http, { STATUS_CODES } from 'node:http';
import test from 'node:test';
import { createHttpApp, MESSAGE_BY_CODE, CODICI_DI_ERRORE_DICHIARATI } from '../src/http-app.mjs';
import { MESSAGES, toPublicProblem } from '../src/public-problem.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const INTERNO = MESSAGES.INTERNAL_ERROR;

test('BUSTA-00 ogni codice dichiarato ha una frase pubblica (16 non l\'avevano: la busta diceva «Operation failed»)', () => {
  assert.ok(CODICI_DI_ERRORE_DICHIARATI.length > 300, `premessa: ${CODICI_DI_ERRORE_DICHIARATI.length} codici`);
  assert.deepEqual(CODICI_DI_ERRORE_DICHIARATI.filter((c) => !Object.hasOwn(MESSAGE_BY_CODE, c) && !Object.hasOwn(MESSAGES, c)), []);
});

test('BUSTA-01 nessun codice dichiarato (tranne INTERNAL_ERROR) porta la spiegazione o l\'azione dell\'errore interno', () => {
  const codici = CODICI_DI_ERRORE_DICHIARATI.filter((c) => c !== 'INTERNAL_ERROR');
  assert.ok(codici.length > 300, `premessa: i codici dichiarati sono ${codici.length}`);
  const sbagliati = codici.filter((code) => {
    const p = toPublicProblem({ code }, { messaggioDelCodice: MESSAGE_BY_CODE[code], statoDelCodice: 409 });
    return p.explanation === INTERNO.explanation || p.action === INTERNO.action;
  });
  assert.deepEqual(sbagliati, []);
});

test('BUSTA-02 la copia neutra: il titolo è la frase di stato HTTP, la spiegazione la frase VERA del codice; una voce propria vince sempre', () => {
  const p = toPublicProblem({ code: 'PROVIDER_KEY_MISSING' }, { messaggioDelCodice: MESSAGE_BY_CODE.PROVIDER_KEY_MISSING, statoDelCodice: 422 });
  assert.equal(p.title, STATUS_CODES[422]);
  assert.equal(p.explanation, MESSAGE_BY_CODE.PROVIDER_KEY_MISSING);
  const conVoce = toPublicProblem({ code: 'CONFIG_INVALID' }, { messaggioDelCodice: 'altro', statoDelCodice: 500 });
  assert.equal(conVoce.title, MESSAGES.CONFIG_INVALID.title, 'la voce propria resta');
  /* al contrario: un errore interno vero, o un codice senza frase, manda ancora a Doctor */
  assert.equal(toPublicProblem({ code: 'INTERNAL_ERROR' }, { messaggioDelCodice: 'x' }).action, INTERNO.action);
  assert.equal(toPublicProblem({ code: 'CODICE_SCONOSCIUTO' }).action, INTERNO.action);
});

test('BUSTA-03 dalla rotta vera (la prova D1 del revisore): PROVIDER_KEY_MISSING porta la sua frase anche in title/explanation/action', async (t) => {
  const cartella = cartellaDiProva('talos-busta-neutra-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const sessionRegistry = { elenca: () => [], avviaLibero: () => ({ erroreAvvio: 'No API key for OpenAI.', code: 'PROVIDER_KEY_MISSING' }) };
  const server = http.createServer(createHttpApp({ sessionRegistry }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartellaLibera: cartella, consegna: 'ciao' }),
  });
  const { error } = await r.json();
  assert.equal(error.code, 'PROVIDER_KEY_MISSING');
  assert.equal(error.title, STATUS_CODES[422]);
  assert.equal(error.explanation, MESSAGE_BY_CODE.PROVIDER_KEY_MISSING);
  assert.notEqual(error.action, INTERNO.action);
});
