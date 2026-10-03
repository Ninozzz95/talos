import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, publicProblem } from '../../src/services/api-client.ts';
import { impostaLingua } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';

/*
 * Owner 03/10/2026, «L'interfaccia, dal codice»: il server manda `code` + un messaggio INGLESE (corsia K1); `ApiError.message` è
 *   la frase del dizionario nella lingua corrente, letta quando la si legge. Circa cento punti del frontend mostrano
 *   `error.message`: l'aggancio è uno solo, qui.
 */
const inglese = TESTI.en['errori.RESEARCH_NOT_FOUND.message'];
const italiano = TESTI.it['errori.RESEARCH_NOT_FOUND.message'];

test('API-ERROR-LINGUA: il messaggio di un codice noto è nella lingua corrente, anche dopo un cambio di lingua', () => {
  assert.ok(inglese && italiano && inglese !== italiano, 'la voce esiste nelle due lingue');
  const errore = new ApiError(publicProblem({ code: 'RESEARCH_NOT_FOUND', message: inglese }), 404);
  impostaLingua('it');
  assert.equal(errore.message, italiano);
  impostaLingua('en');
  assert.equal(errore.message, inglese);
  impostaLingua('it');
  assert.equal(errore.message, italiano, 'un errore già nato segue la lingua');
  assert.equal(errore.problem.message, inglese, 'il problema del server resta com\'è arrivato');
});

test('API-ERROR-LINGUA AL CONTRARIO: un motivo specifico e un codice ignoto restano le parole del server', () => {
  impostaLingua('it');
  const specifico = new ApiError(publicProblem({ code: 'RESEARCH_NOT_FOUND', message: 'The research «x» was moved to another project' }), 404);
  assert.equal(specifico.message, 'The research «x» was moved to another project', 'la frase generica del codice non copre il motivo vero');
  const ignoto = new ApiError(publicProblem({ code: 'CODICE_CHE_NON_ESISTE', message: 'Something new happened' }), 500);
  assert.equal(ignoto.message, 'Something new happened');
  assert.ok(!/^errori\./u.test(ignoto.message), 'mai una chiave grezza');
  assert.ok(ignoto instanceof Error && ignoto.name === 'ApiError');
});

/* Revisione K2 (03/10/2026): il `reason` della busta arriva fino al problema, e un ApiError con un motivo del registro si legge
   nella lingua corrente dalla SUA voce. AL CONTRARIO: un `reason` che non è un testo non passa. */
test('API-ERROR-LINGUA-MOTIVO: il motivo del rifiuto passa da publicProblem e sceglie la voce', () => {
  assert.equal(publicProblem({ code: 'SESSION_NOT_READY', message: 'm', reason: 'closing-turn-retry' }).reason, 'closing-turn-retry');
  assert.equal('reason' in publicProblem({ code: 'SESSION_NOT_READY', message: 'm', reason: 7 }), false);
  const problema = publicProblem({ code: 'SESSION_NOT_READY', message: 'The session is closing its turn: try again as soon as the turn is over.', reason: 'closing-turn-retry' });
  assert.equal(new ApiError(problema, 409).message, 'La sessione sta chiudendo il giro: riprova appena il giro è concluso.');
  impostaLingua('en');
  try { assert.equal(new ApiError(problema, 409).message, 'The session is closing its turn: try again as soon as the turn is over.'); } finally { impostaLingua('it'); }
});
