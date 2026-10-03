import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua, FORMA_DELLA_CHIAVE } from '../../src/components/lingua.js';
import { testoErroreServer } from '../../src/components/errori.js';
import { TESTI } from '../../src/i18n/testi/index.js';

/*
 * ⛔⛔ K2 (03/10/2026, «L'interfaccia, dal codice») — i MOTIVI dei rifiuti del registro nel risolutore.
 * Un rifiuto porta `code` + `reason` (kebab-case, inglese) + `params`; la voce del dizionario è
 * `errori.<CODICE>.<motivo_con_trattini_bassi>` perché la forma delle chiavi (`FORMA_DELLA_CHIAVE`) non ammette il trattino.
 * Il confronto con la frase inglese del server resta il cancello: nessuna frase ne copre un'altra, e il ripiego sono sempre le
 * parole del server — mai una chiave grezza.
 */
const VOCI_DEI_MOTIVI = Object.keys(TESTI.en).filter((k) => /^errori\.[A-Z][A-Z0-9_]*\.(?!(?:message|title|explanation|action)$)[a-z][a-z0-9_]*$/u.test(k));
const segnaposto = (frase) => [...String(frase).matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((m) => m[1]).sort();

test('ERRORI-MOTIVO-01 — ogni voce di motivo ha la forma di una chiave stabile, le due lingue, e gli STESSI segnaposto', () => {
  assert.ok(VOCI_DEI_MOTIVI.length >= 100, `le voci dei motivi sono tante (${VOCI_DEI_MOTIVI.length})`);
  for (const k of VOCI_DEI_MOTIVI) {
    assert.match(k, FORMA_DELLA_CHIAVE, `${k} è una chiave stabile`);
    assert.equal(typeof TESTI.it[k], 'string', `${k} in italiano`);
    assert.equal(typeof TESTI.en[k], 'string', `${k} in inglese`);
    assert.deepEqual(segnaposto(TESTI.it[k]), segnaposto(TESTI.en[k]), `${k}: stessi segnaposto nelle due lingue`);
  }
});

test('ERRORI-MOTIVO-02 — con il motivo la sua voce è la prima; senza (cliente che non lo copia) il confronto con l’inglese basta', () => {
  const problema = { code: 'SESSION_NOT_READY', message: 'Session not ready for this action', title: 'Session not ready',
    explanation: 'The session is still running: wait for it to finish before resuming it' };
  impostaLingua('it');
  assert.equal(testoErroreServer({ ...problema, reason: 'running-wait-resume' }).explanation, 'La sessione è ancora in corso: aspetta che concluda prima di riprenderla');
  assert.equal(testoErroreServer(problema).explanation, 'La sessione è ancora in corso: aspetta che concluda prima di riprenderla');
  impostaLingua('en');
  assert.equal(testoErroreServer({ ...problema, reason: 'running-wait-resume' }).explanation, problema.explanation);
  impostaLingua('it');
});

test('ERRORI-MOTIVO-03 — AL CONTRARIO: un motivo che il dizionario non ha, o la cui frase non coincide, lascia le parole del server', () => {
  impostaLingua('it');
  const nuovo = testoErroreServer({ code: 'SESSION_NOT_READY', message: 'x', explanation: 'A reason the dictionary has never seen', reason: 'never-seen' });
  assert.equal(nuovo.explanation, 'A reason the dictionary has never seen');
  // il motivo dice una cosa e la frase un'altra: vince la frase del server, mai la voce del motivo
  const incoerente = testoErroreServer({ code: 'SESSION_NOT_READY', message: 'x', explanation: 'Some other sentence of the server', reason: 'running-wait-resume' });
  assert.equal(incoerente.explanation, 'Some other sentence of the server');
  // la voce di un altro codice non copre
  const altroCodice = testoErroreServer({ code: 'SESSION_NOT_READY', message: 'x', explanation: 'Session not found', reason: 'session-not-found' });
  assert.equal(altroCodice.explanation, 'Session not found');
  for (const testo of [nuovo.explanation, incoerente.explanation, altroCodice.explanation]) assert.ok(!/^errori\./u.test(testo), 'mai una chiave grezza');
});

test('ERRORI-MOTIVO-04 — i valori della frase si rimettono nella lingua della persona, e il ripiego di un parte assente non usa la voce di un motivo', () => {
  impostaLingua('it');
  const conValore = testoErroreServer({ code: 'NOT_FOUND', message: 'Resource not found', reason: 'plugin-not-found',
    explanation: 'Plugin "x" not found in .harness-ui-plugins/', params: { pluginId: 'x' } });
  assert.equal(conValore.explanation, 'Plugin "x" non trovato in .harness-ui-plugins/');
  // senza spiegazione del server il ripiego è la voce `explanation` del codice (se c'è), mai la frase di un motivo
  const senza = testoErroreServer({ code: 'NOT_FOUND', reason: 'session-not-found' });
  assert.notEqual(senza.explanation, 'Sessione non trovata');
  assert.equal(senza.explanation, '');
});

test('ERRORI-MOTIVO-05 — la rete di sicurezza della coda legge il CODICE del rifiuto, non le sue parole (che ora sono inglesi o nella lingua della persona)', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const riga = sorgente.split('\n').find((r) => r.includes('const nonInCorso ='));
  assert.ok(riga, 'la riga esiste');
  assert.match(riga, /error\?\.code === 'SESSION_NOT_READY'/u);
  assert.doesNotMatch(riga, /non è in corso|non pronta|interrott|\.test\(/u, 'niente regex sulla frase del server');
});

/* Revisione K2 (03/10/2026): il reindirizzamento fallito. Il server ora scrive `message` in inglese; il toast e la nota di app.js
   lo dicono nella lingua scelta dal `code` + `reason` dell'evento. AL CONTRARIO: un evento VECCHIO, salvato prima di K2 senza
   motivo e con le parole italiane, resta com'era (nessuna chiave grezza, nessuna frase di un altro motivo). */
test('ERRORI-MOTIVO-REDIRECT — il motivo del reindirizzamento fallito nella lingua scelta', async () => {
  const { readFileSync } = await import('node:fs');
  const ev = { code: 'SESSION_STORE_WRITE_FAILED', reason: 'redirect-correction-not-saved', message: 'The correction could not be saved. Try again without closing the session.' };
  assert.equal(testoErroreServer(ev).message, 'Non è stato possibile salvare la correzione. Riprova senza chiudere la sessione.');
  impostaLingua('en');
  try { assert.equal(testoErroreServer(ev).message, ev.message); } finally { impostaLingua('it'); }
  const vecchio = { code: 'SESSION_INTERRUPTED', message: 'Il server è stato riavviato prima che il reindirizzamento potesse concludersi.' };
  assert.equal(testoErroreServer(vecchio).message, vecchio.message);
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const inizio = app.indexOf("case 'RunRedirectFailed': {");
  const ramo = app.slice(inizio, app.indexOf('break;', inizio));
  assert.ok(inizio > 0 && ramo.length > 100, 'il ramo dell evento si trova');
  assert.match(ramo, /testoErroreServer\(\{ code: evento\.code, reason: evento\.reason, params: evento\.params, message: evento\.message \}\)/u);
  assert.doesNotMatch(ramo, /toast\(tr\('app\.redirect\.failed'\), evento\.message\)/u, 'il toast non mostra più le parole del server così come sono');
});
