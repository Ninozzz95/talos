/*
 * Seconda passata (bugfixer, 15/10/2026 sera) — le due frasi nuove del rifiuto di un obiettivo arrivano all'interfaccia nelle due lingue,
 * dalla forma che il server manda davvero (`rifiuto('GOAL_NOT_ALLOWED', reason, …)` del registro, codice + motivo + frase inglese).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { testoErroreServer } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

const errore = (reason, message) => Object.assign(new Error(message), { code: 'GOAL_NOT_ALLOWED', reason, problem: { code: 'GOAL_NOT_ALLOWED', reason } });

test('SECONDA-OB-01 [REGGE] — «obiettivi spenti» e «nessuno davanti»: frase italiana in italiano, inglese in inglese, mai la chiave', () => {
  const casi = [
    ['goal-not-in-this-host', 'Goals are off in this app: a goal set here would never move forward', /spenti in quest.app/u, /Goals are off in this app/u],
    ['goal-nobody-in-front', 'Nobody is in front of this conversation: a goal here would never be seen or stopped', /Nessuno sta seguendo/u, /Nobody is in front/u],
  ];
  for (const [reason, message, it, en] of casi) {
    impostaLingua('it');
    const testoIt = JSON.stringify(testoErroreServer(errore(reason, message)));
    assert.match(testoIt, it, `${reason} in italiano: ${testoIt}`);
    assert.doesNotMatch(testoIt, /GOAL_NOT_ALLOWED\.|goal_not_in|goal_nobody/u);
    impostaLingua('en');
    const testoEn = JSON.stringify(testoErroreServer(errore(reason, message)));
    assert.match(testoEn, en, `${reason} in inglese: ${testoEn}`);
  }
  impostaLingua('it');
});
