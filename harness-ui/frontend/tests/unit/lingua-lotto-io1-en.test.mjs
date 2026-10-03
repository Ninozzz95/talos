/*
 * 03/10/2026, seconda ondata della lingua, lotto «io 1» (owner: «ogni parola in inglese e italiano», e dalla sera stessa INGLESE
 *   PRIMA) — il menu «+» degli allegati, la coda dei messaggi, il fumetto della barra di navigazione e l'avviso dei tentativi del
 *   fornitore. Con l'interfaccia in inglese si leggono in inglese; in italiano restano le parole di prima, identiche.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua } from '../../src/components/lingua.js';
import { VIE_ALLEGATO, frasiTetti } from '../../src/components/allegati.js';
import { descriviCoda } from '../../src/components/coda-messaggi.js';
import { capoFumetto } from '../../src/components/cronologia.js';
import { testoRetry } from '../../src/components/provider-retry.js';

const inInglese = (prova) => { impostaLingua('en'); try { prova(); } finally { impostaLingua('it'); } };

test('LINGUA-IO1-EN: il menu «+» e i suoi tetti seguono la lingua', () => {
  const disco = VIE_ALLEGATO.find((v) => v.id === 'disco');
  assert.equal(disco.etichetta, 'File dal disco');
  assert.match(frasiTetti(), /^Fino a 10 allegati per messaggio/u);
  inInglese(() => {
    assert.equal(disco.etichetta, 'File from disk', 'la STESSA voce congelata, letta dopo il cambio di lingua');
    assert.equal(disco.aiuto, 'Any file on the computer');
    assert.match(frasiTetti(), /^Up to 10 attachments per message/u);
  });
  assert.ok(Object.isFrozen(disco), 'la voce resta congelata');
});

test('LINGUA-IO1-EN: coda dei messaggi e fumetto della navigazione', () => {
  const stato = { voci: [{ id: 'a', testo: 'ciao' }, { id: 'b', testo: 'poi' }] };
  assert.equal(descriviCoda(stato).conteggio, '2 in coda');
  assert.equal(capoFumetto({ numero: 3, numeroUltimo: 3, attrezzi: 2 }).startsWith('TALOS · giro 3'), true);
  inInglese(() => {
    assert.equal(descriviCoda(stato).conteggio, '2 queued');
    assert.equal(capoFumetto({ diUtente: true }), 'You');
    assert.equal(capoFumetto({ numero: 3, numeroUltimo: 3 }), 'TALOS · turn 3');
  });
});

test('LINGUA-IO1-EN: l’avviso dei tentativi segue la lingua quando non la riceve da fuori', () => {
  const retry = { fase: 'attesa', tentativo: 1, tentativiMassimi: 3, httpStatus: 429, retryAt: 10_000 };
  const it = testoRetry(retry, 0);
  inInglese(() => {
    const en = testoRetry(retry, 0);
    assert.notEqual(en.titolo, it.titolo, 'in inglese il titolo non è quello italiano');
    assert.deepEqual(testoRetry(retry, 0, false), it, 'AL CONTRARIO: con la lingua passata da fuori vince quella');
  });
});
