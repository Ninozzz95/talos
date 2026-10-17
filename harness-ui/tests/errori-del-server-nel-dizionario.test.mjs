/*
 * ⛔⛔ GLI ERRORI DEL SERVER SONO IN INGLESE, E L'INTERFACCIA LI DICE NELLA SUA LINGUA DAL CODICE (owner 03/10/2026:
 *   «ogni singola parola nella app deve essere sia in inglese che in italiano, non negoziabile»; decisione «L'interfaccia,
 *   dal codice»). Google AIP-193 «Errors» (letta il 03/10/2026): il `message` è per lo sviluppatore e in inglese, il testo per
 *   la persona sta in una voce localizzata, i valori dentro le frasi viaggiano a parte (`metadata`; qui `params`).
 *
 * Questa prova tiene INSIEME le due metà del contratto:
 *   · il server: `MESSAGE_BY_CODE` (http-app.mjs), `MESSAGES` (public-problem.mjs), `COPIA_CONTESTO` (http-app.mjs) sono inglesi;
 *   · il dizionario (`frontend/src/i18n/testi/errori.js`): per ogni codice ha l'italiano e lo STESSO inglese del server.
 * ⛔ Se l'inglese cambiasse da una parte sola, `testoErroreServer` non riconoscerebbe più la frase standard e lascerebbe la
 *   persona con l'inglese del server dentro un'interfaccia italiana: nessun errore, nessun rosso. Per questo qui si confronta
 *   parola per parola, e ogni controllo si prova anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COPIA_CONTESTO, COPIA_CONTESTO_PREDEFINITA, GUASTI_RITORNO_OPENROUTER_IT, MESSAGE_BY_CODE, linguaDellaPagina,
} from '../src/http-app.mjs';
import { MESSAGES, paramsPubblici, toPublicProblem } from '../src/public-problem.mjs';

const PARTI = ['title', 'explanation', 'action'];
const voce = (chiave, lingua) => AREE.errori[lingua][chiave];
const condivisi = Object.keys(COPIA_CONTESTO).filter((codice) => codice in MESSAGE_BY_CODE || codice in MESSAGES);

function tuttiIGiriDelServer() {
  const voci = [];
  for (const [codice, frase] of Object.entries(MESSAGE_BY_CODE)) voci.push([`${codice}.message`, frase]);
  for (const [codice, copia] of Object.entries(MESSAGES)) for (const parte of PARTI) voci.push([`${codice}.${parte}`, copia[parte]]);
  for (const [codice, copia] of Object.entries(COPIA_CONTESTO)) {
    for (const parte of PARTI) voci.push([`${condivisi.includes(codice) ? 'contesto.' : ''}${codice}.${parte}`, copia[parte]]);
  }
  for (const parte of PARTI) voci.push([`contestoPredefinita.${parte}`, COPIA_CONTESTO_PREDEFINITA[parte]]);
  return voci;
}








test('ERRORI-DIZ-08 — i valori dentro le frasi viaggiano in `params`: solo testi e numeri, piatti; e il dizionario li mette nella sua frase', () => {
  assert.deepEqual(paramsPubblici({ params: { nome: 'a.md', n: 3, annidato: { x: 1 }, lista: [1], no: null, 'nome non valido': 'x' } }), { nome: 'a.md', n: 3 });
  assert.equal(paramsPubblici({ params: {} }), null);
  assert.equal(paramsPubblici({ params: [1, 2] }), null);
  assert.equal(paramsPubblici({}), null);
  assert.equal(paramsPubblici(null), null);
  assert.equal(paramsPubblici({ params: { n: Number.NaN } }), null, 'un numero che non è un numero non passa');
  const busta = toPublicProblem({ code: 'INTERNAL_ERROR', params: { nome: 'x', segreto: { a: 1 } } });
  assert.deepEqual(busta.params, { nome: 'x' });
  assert.equal('params' in toPublicProblem({ code: 'INTERNAL_ERROR' }), false, 'senza valori, nessun campo');
});


