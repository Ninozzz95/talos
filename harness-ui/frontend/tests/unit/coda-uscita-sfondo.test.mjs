/*
 * C06 (owner 10/10/2026, «come Claude») — un comando in sottofondo finito, nella coda e nella chat. Il registro lo consegna con
 *   `origine: 'sfondo'`, il `toolCallId` e i suoi FATTI (comando, esito, codice, segnale, file). A schermo la frase si compone dai
 *   fatti, nella lingua dell'interfaccia: mai il testo inglese che riceve il modello.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { descriviCoda, descriviUscitaSfondo, normalizzaStatoCoda } from '../../src/components/coda-messaggi.js';

const FATTI = { comando: 'npm run dev', esito: 'fallito', codice: 1, segnale: null, file: '/tmp/x/.talos/sfondo/call_dev.log' };
const TESTO_PER_IL_MODELLO = 'The background command `npm run dev` failed (exit code 1). Its full output is in /tmp/x/.talos/sfondo/call_dev.log.';

test('C06-CODA-01: the queue keeps origin «sfondo», its toolCallId and its facts', () => {
  const { voci } = normalizzaStatoCoda({ voci: [{ id: 'a', testo: TESTO_PER_IL_MODELLO, origine: 'sfondo', toolCallId: 'call_dev', sfondo: FATTI }] });
  assert.equal(voci[0].origine, 'sfondo');
  assert.equal(voci[0].toolCallId, 'call_dev');
  assert.deepEqual(voci[0].sfondo, FATTI);
});

test('C06-CODA-02: the sentence is built from the facts, in the interface language — never the model\'s English text', () => {
  const u = descriviUscitaSfondo(FATTI);
  assert.equal(u.titolo, 'npm run dev');
  assert.equal(u.stato, 'non riuscito (codice 1)');
  assert.equal(u.errore, true);
  assert.match(u.testo, /Uscita completa: \/tmp\/x\/\.talos\/sfondo\/call_dev\.log/u);
  assert.doesNotMatch(u.testo, /background command|exit code/u);
  const riuscito = descriviUscitaSfondo({ comando: 'npm test', esito: 'riuscito', codice: 0 });
  assert.equal(riuscito.stato, 'riuscito (codice 0)');
  assert.equal(riuscito.errore, false);
  assert.equal(riuscito.testo, 'riuscito (codice 0)', 'no file, no «Uscita completa» line');
  assert.equal(descriviUscitaSfondo({ esito: 'terminato', segnale: 'SIGTERM' }).stato, 'terminato (SIGTERM)');
  assert.equal(descriviUscitaSfondo({ esito: 'terminato' }).titolo, 'Un comando in sottofondo', 'no command: a plain name, never empty');
  assert.equal(descriviUscitaSfondo({ esito: 'fallito' }).stato, 'non è partito');
});

test('C06-CODA-03: the queue banner says «Comando in sottofondo finito» with the command and how it ended', () => {
  const banner = descriviCoda({ voci: [{ id: 'a', testo: TESTO_PER_IL_MODELLO, origine: 'sfondo', toolCallId: 'call_dev', sfondo: FATTI }] });
  assert.match(banner.testo, /^Comando in sottofondo finito · «npm run dev: non riuscito \(codice 1\)»$/u);
  assert.doesNotMatch(banner.titoloTesto, /background command/u, 'AL CONTRARIO: the English text for the model never reaches the banner');
});

test('C06-CODA-04 (a): a command stopped by the person reads «fermato da te», is not an error, and says the model reads it with the next message', () => {
  const u = descriviUscitaSfondo({ comando: 'npm run dev', esito: 'terminato', segnale: 'SIGTERM', fermatoDallaPersona: true });
  assert.equal(u.titolo, 'npm run dev');
  assert.equal(u.stato, 'fermato da te');
  assert.equal(u.errore, false);
  assert.equal(u.testo, 'fermato da te\n\nIl modello lo leggerà col tuo prossimo messaggio.');
  // AL CONTRARIO: lo stesso segnale senza la persona resta «terminato», ed è un errore
  const solo = descriviUscitaSfondo({ comando: 'npm run dev', esito: 'terminato', segnale: 'SIGTERM' });
  assert.equal(solo.stato, 'terminato (SIGTERM)');
  assert.equal(solo.errore, true);
});
