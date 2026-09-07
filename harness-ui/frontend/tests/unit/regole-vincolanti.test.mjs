import test from 'node:test';
import assert from 'node:assert/strict';
import { giudica, tocca, citaUnaFonte, haCoAuthoring, SUPERFICI_VISIBILI } from '../../../scripts/cancello/regole-vincolanti.mjs';

/*
 * ⛔⛔⛔ 07/09/2026, owner: «fai in modo di escogitare qualcosa per non farti violare mai regole
 *   vincolanti principali… qui aggiungere una riga nella memoria non basta».
 *
 * Questo cancello esiste perché la ricerca dice che una regola scritta nel prompt NON basta: esiste
 * una dimostrazione che per qualunque insieme finito di regole c'è un prompt che le fa ignorare
 * (Help Net Security, 10/06/2026). L'unica cosa che tiene è un controllo fuori dal modello.
 *
 * ⇒ E un cancello si prova come si prova un cancello: deve dire NO a chi ha sbagliato e SÌ a chi ha
 *   fatto le cose per bene. Se dicesse sempre sì sarebbe una decorazione — è già successo in questo
 *   progetto, col cancello semantico spento per mesi senza che nessuno se ne accorgesse.
 */

const ORA = 1_700_000_000_000;
/* ⛔ l'occhio si inietta: una prova che guardasse le foto VERE del disco direbbe cose diverse su
   macchine diverse. Qui si dichiara «tutte guardate», e c'è una prova apposta per il caso contrario. */
const OCCHIO_A_POSTO = { ok: true, mancanti: [], guardate: 2, totali: 2 };
const BASE = { radice: '/progetto', messaggio: 'fix(x): una cosa — misurato dal vivo il 07/09/2026', fileToccati: [], occhio: OCCHIO_A_POSTO };

test('UI toccata SENZA foto: il cancello dice NO', () => {
  const esito = giudica({ ...BASE, fileToccati: ['harness-ui/frontend/src/components/x.js'], quandoFoto: 0, quandoCodice: ORA });
  assert.equal(esito.ok, false);
  assert.match(esito.motivi.join(' '), /NESSUNA foto/);
});

test('UI toccata con una foto VECCHIA: il cancello dice NO, e dice di quanto', () => {
  const esito = giudica({ ...BASE, fileToccati: ['harness-ui/public/app.js'], quandoFoto: ORA - 45 * 60_000, quandoCodice: ORA });
  assert.equal(esito.ok, false);
  assert.match(esito.motivi.join(' '), /45 minuti PRIMA/);
});

test('AL CONTRARIO — UI toccata con una foto SCATTATA DOPO: passa', () => {
  const esito = giudica({ ...BASE, fileToccati: ['harness-ui/frontend/src/legacy/app.js'], quandoFoto: ORA + 60_000, quandoCodice: ORA });
  assert.equal(esito.ok, true, `non doveva bloccare: ${esito.motivi.join(' · ')}`);
});

test('AL CONTRARIO — un commit che NON tocca la UI non ha bisogno di foto', () => {
  const esito = giudica({ ...BASE, fileToccati: ['README.md'], quandoFoto: 0, quandoCodice: 0 });
  assert.equal(esito.ok, true, `non doveva bloccare: ${esito.motivi.join(' · ')}`);
});

test('CO-AUTHORING: bloccato anche se tutto il resto è a posto', () => {
  const esito = giudica({
    ...BASE, fileToccati: ['README.md'], quandoFoto: ORA, quandoCodice: 0,
    messaggio: 'fix: cosa\n\nCo-Authored-By: Qualcuno <x@y>',
  });
  assert.equal(esito.ok, false);
  assert.match(esito.motivi.join(' '), /co-authoring/i);
  assert.equal(haCoAuthoring('Claude-Session: https://…'), true);
  assert.equal(haCoAuthoring('un messaggio normale'), false);
});

test('RICERCA: un commit di codice senza fonte né misura è bloccato', () => {
  const esito = giudica({
    ...BASE, fileToccati: ['harness-ui/src/qualcosa.mjs'], quandoFoto: ORA, quandoCodice: 0,
    messaggio: 'fix: ho sistemato una cosa',
  });
  assert.equal(esito.ok, false);
  assert.match(esito.motivi.join(' '), /fonte/);
});

test('RICERCA: il cancello NON accusa chi ha obbedito — le forme che una persona scrive davvero', () => {
  /* ⛔ 07/9: al primo giro questo cancello ha bloccato il SUO STESSO commit, che citava «la ricerca
     del 07/09/2026»: il modello pretendeva la data attaccata alla parola. Un cancello che nega a chi
     ha fatto la cosa giusta viene disattivato, e allora non protegge più niente. */
  assert.equal(citaUnaFonte('Ha ragione, e la ricerca del 07/09/2026 dice perché'), true);
  assert.equal(citaUnaFonte('ricerche 07/09/2026: MDN, Brave'), true);
  assert.equal(citaUnaFonte('provato dal vivo sul 4174'), true);
  assert.equal(citaUnaFonte('misurata la latenza'), true);
});

test('RICERCA, al contrario: le forme che valgono davvero', () => {
  assert.equal(citaUnaFonte('Fonti: https://example.org letto il 07/09/2026'), true);
  assert.equal(citaUnaFonte('ricerca 07/09/2026: MDN'), true);
  assert.equal(citaUnaFonte('misurato dal vivo: 4 ms'), true);
  assert.equal(citaUnaFonte('ho migliorato il codice'), false);
});

test('LE SUPERFICI: si riconosce ciò che si vede, e non si blocca ciò che non si vede', () => {
  assert.equal(tocca('harness-ui/frontend/mockup/talos-mockup.html'), true);
  assert.equal(tocca('harness-ui/public/styles.css'), true);
  assert.equal(tocca('harness-ui/src/http-app.mjs'), false, 'il server non si guarda con gli occhi: si prova con i test');
  assert.ok(SUPERFICI_VISIBILI.length >= 3);
});

test('L’OCCHIO: foto scattate e non guardate bloccano il commit, e il cancello dice quali', () => {
  const esito = giudica({
    ...BASE, fileToccati: ['harness-ui/frontend/src/x.js'], quandoFoto: ORA + 1000, quandoCodice: ORA,
    occhio: { ok: false, mancanti: ['03-clic.png', '05-cornice.png'], guardate: 6, totali: 8 },
  });
  assert.equal(esito.ok, false);
  assert.match(esito.motivi.join(' '), /8 foto e ne hai guardate 6/);
  assert.match(esito.motivi.join(' '), /03-clic\.png/);
});
