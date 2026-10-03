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
import { AREE, TESTI } from '../frontend/src/i18n/testi/index.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { eFraseItaliana } from '../frontend/scripts/cancello/testi-a-schermo.mjs';

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

test('ERRORI-DIZ-01 — ogni frase del server ha la sua voce nel dizionario, con LO STESSO inglese e un italiano non vuoto', () => {
  const voci = tuttiIGiriDelServer();
  assert.ok(voci.length > 350, `le frasi del server sono tante (${voci.length}): una tabella svuotata non deve passare per verde`);
  const senzaVoce = voci.filter(([chiave]) => voce(chiave, 'en') === undefined).map(([chiave]) => chiave);
  assert.deepEqual(senzaVoce, [], 'frasi del server senza voce nel dizionario');
  const inglesiDiversi = voci.filter(([chiave, frase]) => voce(chiave, 'en') !== frase).map(([chiave, frase]) => `${chiave}: server «${frase}» ≠ dizionario «${voce(chiave, 'en')}»`);
  assert.deepEqual(inglesiDiversi, [], 'l’inglese del server e quello del dizionario devono essere identici');
  const senzaItaliano = voci.filter(([chiave]) => typeof voce(chiave, 'it') !== 'string' || voce(chiave, 'it').trim() === '').map(([chiave]) => chiave);
  assert.deepEqual(senzaItaliano, []);
});

test('ERRORI-DIZ-02 — AL CONTRARIO: una voce del dizionario senza la sua frase nel server è un residuo (provata togliendo una frase dal server: DIZ-01 diventa rossa)', () => {
  const attese = new Set(tuttiIGiriDelServer().map(([chiave]) => chiave));
  const residui = Object.keys(AREE.errori.en)
    .filter((chiave) => /^(?:contesto\.)?[A-Z][A-Z0-9_]*\.(?:message|title|explanation|action)$|^contestoPredefinita\./u.test(chiave))
    .filter((chiave) => !attese.has(chiave) && !['BROWSER_VIVO_ERRORE.message', 'LOCAL_REQUEST_FAILED.message', 'LOCAL_RESPONSE_INVALID.message'].includes(chiave));
  assert.deepEqual(residui, [], 'voci del dizionario di codici che il server non conosce più');
});

test('ERRORI-DIZ-03 — il server non dice più una parola italiana nelle sue tabelle (le frasi per la persona stanno nel dizionario)', () => {
  const italiane = tuttiIGiriDelServer().filter(([, frase]) => eFraseItaliana(frase) || /[àèìòù]/u.test(frase)).map(([chiave, frase]) => `${chiave}: ${frase}`);
  assert.deepEqual(italiane, []);
  // AL CONTRARIO: il rilevatore vede davvero l'italiano
  assert.equal(eFraseItaliana('Questa cartella non è un repository git'), true);
});

test('ERRORI-DIZ-04 — l’italiano del dizionario è quello che il server mandava prima: frasi campione, comprese le due con gli accenti mancanti', () => {
  const campione = {
    'QUERY_INVALID.message': 'Query non valida',
    'GIT_NOT_A_REPOSITORY.message': 'Questa cartella non è un repository git',
    'FILE_TOO_LARGE.message': 'File troppo grande per l\'anteprima',
    'CATALOG_CONFIGURATION_REQUIRED.message': 'Configura i modelli o l\'agente esterno in Fornitori e accessi',
    'OAUTH_ATTESA_IGNOTA.message': 'Questa richiesta di collegamento non vale più: ricomincia da «Accedi con OpenRouter»',
    'SESSION_NOT_READY.explanation': 'Questa sessione non puo accettare l’azione richiesta nello stato in cui si trova.',
    'SESSION_NOT_READY.action': 'Se e stata interrotta da un riavvio, avvia una sessione nuova: la conversazione resta leggibile qui.',
    'INTERNAL_ERROR.title': 'Operazione non riuscita',
    'contesto.INTERNAL_ERROR.title': 'Contesto non riuscito',
    'CTX_NOT_ENABLED.title': 'Contesto non attivo qui',
    'contestoPredefinita.title': 'Contesto non disponibile',
  };
  for (const [chiave, italiano] of Object.entries(campione)) assert.equal(voce(chiave, 'it'), italiano, chiave);
});

test('ERRORI-DIZ-05 — dal server alla persona: ogni codice, nelle due lingue, passa per la busta vera e arriva nella lingua scelta', () => {
  try {
    for (const [codice, frase] of Object.entries(MESSAGE_BY_CODE)) {
      const problema = toPublicProblem({ code: codice }, { operation: 'prova' });
      const errore = { code: codice, message: frase, ...problema };
      impostaLingua('it');
      assert.equal(testoErroreServer(errore).message, voce(`${codice}.message`, 'it'), `${codice} (it)`);
      impostaLingua('en');
      assert.equal(testoErroreServer(errore).message, frase, `${codice} (en)`);
    }
    // titolo, spiegazione e azione: anche quelli dei codici che NON hanno una copia sua (ricevono quella di INTERNAL_ERROR)
    const generico = toPublicProblem({ code: 'QUERY_INVALID' });
    impostaLingua('it');
    assert.equal(testoErroreServer({ code: 'QUERY_INVALID', message: MESSAGE_BY_CODE.QUERY_INVALID, ...generico }).title, 'Operazione non riuscita');
    assert.equal(testoErroreServer({ code: 'PATH_NOT_ALLOWED', message: 'x', ...toPublicProblem({ code: 'PATH_NOT_ALLOWED' }) }).action, 'Scegli una cartella dentro il progetto aperto.');
    impostaLingua('en');
    assert.equal(testoErroreServer({ code: 'PATH_NOT_ALLOWED', message: 'x', ...toPublicProblem({ code: 'PATH_NOT_ALLOWED' }) }).action, 'Choose a folder inside the open project.');
  } finally { impostaLingua('it'); }
});

test('ERRORI-DIZ-06 — le copie del contesto: lo stesso codice con due copie diverse trova la SUA, in tutte e due le lingue', () => {
  try {
    assert.deepEqual(condivisi.sort(), ['INTERNAL_ERROR', 'METHOD_NOT_ALLOWED', 'PAYLOAD_LIMIT', 'QUERY_INVALID']);
    for (const codice of Object.keys(COPIA_CONTESTO)) {
      const copia = COPIA_CONTESTO[codice];
      const errore = { code: codice, message: 'x', title: copia.title, explanation: copia.explanation, action: copia.action };
      const chiave = condivisi.includes(codice) ? `contesto.${codice}` : codice;
      impostaLingua('it');
      assert.deepEqual([testoErroreServer(errore).title, testoErroreServer(errore).explanation, testoErroreServer(errore).action],
        PARTI.map((parte) => voce(`${chiave}.${parte}`, 'it')), `${codice} (it)`);
      impostaLingua('en');
      assert.equal(testoErroreServer(errore).title, copia.title, `${codice} (en)`);
    }
    // la copia generale dello stesso codice NON è quella del contesto
    impostaLingua('it');
    const generale = toPublicProblem({ code: 'INTERNAL_ERROR' });
    assert.equal(testoErroreServer({ code: 'INTERNAL_ERROR', message: 'Internal error', ...generale }).title, 'Operazione non riuscita');
    assert.equal(testoErroreServer({ code: 'INTERNAL_ERROR', message: 'x', ...COPIA_CONTESTO.INTERNAL_ERROR }).title, 'Contesto non riuscito');
    // un codice del contesto senza copia sua riceve la predefinita
    assert.equal(testoErroreServer({ code: 'CTX_QUALUNQUE', message: 'x', ...COPIA_CONTESTO_PREDEFINITA }).title, 'Contesto non disponibile');
  } finally { impostaLingua('it'); }
});

test('ERRORI-DIZ-07 — AL CONTRARIO: il motivo VERO scritto dal server per il caso non viene coperto dalla frase generica, e una frase ignota resta quella del server', () => {
  try {
    impostaLingua('it');
    // SESSION_NOT_READY: la spiegazione del registro (il motivo vero del riavvio) passa al posto di quella generica
    const motivo = 'This session was interrupted by a server restart and cannot be resumed: start a new session';
    const problema = toPublicProblem({ code: 'SESSION_NOT_READY', message: motivo });
    assert.equal(problema.explanation, motivo, 'il server la manda');
    const detto = testoErroreServer({ code: 'SESSION_NOT_READY', message: MESSAGE_BY_CODE.SESSION_NOT_READY, ...problema });
    assert.equal(detto.explanation, motivo, 'il dizionario non la copre');
    assert.equal(detto.title, 'Sessione non pronta', 'le altre parti, invece, sono quelle del dizionario');
    // un codice che il dizionario non conosce, e un'altra frase per un codice noto: le parole del server
    assert.equal(testoErroreServer({ code: 'CODICE_DEL_FUTURO', message: 'Something new happened' }).message, 'Something new happened');
    assert.equal(testoErroreServer({ code: 'QUERY_INVALID', message: 'Invalid JSON body' }).message, 'Invalid JSON body');
    // niente: né una chiave grezza né «undefined»
    assert.deepEqual(testoErroreServer(null), { message: '', title: '', explanation: '', action: '' });
    assert.deepEqual(testoErroreServer({ code: 'CODICE_DEL_FUTURO' }), { message: '', title: '', explanation: '', action: '' });
  } finally { impostaLingua('it'); }
});

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

test('ERRORI-DIZ-09 — la pagina del ritorno da OpenRouter: la lingua dal browser, l’inglese di riserva, e le sette frasi italiane sono quelle del dizionario', () => {
  assert.equal(linguaDellaPagina('it-IT,it;q=0.9,en;q=0.8'), 'it');
  assert.equal(linguaDellaPagina('en-US,en;q=0.9,it;q=0.8'), 'en');
  assert.equal(linguaDellaPagina('fr-FR,fr;q=0.9,it;q=0.5'), 'it', 'la prima fra quelle che conosciamo, per peso');
  assert.equal(linguaDellaPagina('de-DE'), 'en', 'nessuna che conosciamo: inglese');
  assert.equal(linguaDellaPagina(undefined), 'en');
  assert.equal(linguaDellaPagina('it;q=0, en'), 'en', 'q=0 vuol dire «no»');
  assert.equal(linguaDellaPagina('*'), 'en');
  const codici = Object.keys(GUASTI_RITORNO_OPENROUTER_IT);
  assert.equal(codici.length, 7);
  for (const codice of codici) {
    assert.equal(GUASTI_RITORNO_OPENROUTER_IT[codice], voce(`${codice}.message`, 'it'), codice);
    assert.ok(codice in MESSAGE_BY_CODE, `${codice} è un codice del server`);
  }
  // AL CONTRARIO: un guasto che la pagina potrebbe mostrare ha la sua frase italiana (altrimenti l'italiano vedrebbe l'inglese)
  const oauth = Object.keys(MESSAGE_BY_CODE).filter((codice) => codice.startsWith('OAUTH_'));
  assert.deepEqual(oauth.sort(), codici.sort());
});

test('ERRORI-DIZ-10 — il dizionario delle due lingue è completo: stesse chiavi, nessuna vuota (le aree si registrano da `index.js`)', () => {
  assert.ok('errori' in AREE, 'l’area `errori` è registrata');
  assert.deepEqual(Object.keys(AREE.errori.it).sort(), Object.keys(AREE.errori.en).sort());
  assert.ok(Object.keys(TESTI.en).filter((k) => k.startsWith('errori.')).length > 500);
});
