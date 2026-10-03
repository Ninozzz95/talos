/*
 * 03/10/2026, seconda ondata della lingua (owner: «ogni parola in inglese e italiano», e dalla sera stessa INGLESE PRIMA) — le
 *   parole che compaiono sotto ogni comando (verdetto e «dove» di `esito-comando.js`), il motivo di una domanda respinta, gli
 *   stati dei passi e del run (`grafo/comuni.js`) e l'avviso della connessione (`connessione.js`, che non aveva MAI avuto
 *   l'inglese). Con l'interfaccia in inglese si leggono in inglese; in italiano restano le parole di prima, identiche.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { leggiEsitoComando, motivoDomandaDaCorreggere, rigaDiStatoComando } from '../../src/components/esito-comando.js';
import { STATI_PASSO, STATI_RUN, statoPasso } from '../../src/components/grafo/comuni.js';
import { TESTI as CONNESSIONE } from '../../src/components/connessione.js';

const inInglese = (prova) => { impostaLingua('en'); try { prova(); } finally { impostaLingua('it'); } };

test('LINGUA-ESITI-EN: verdetto e «dove» di un comando seguono la lingua', () => {
  inInglese(() => {
    assert.equal(rigaDiStatoComando(leggiEsitoComando('exit 1 [sandbox: none (cmd.exe nativo: …)]\nERR\n')), 'Failed · code 1 · on Windows, without isolation');
    assert.equal(rigaDiStatoComando(leggiEsitoComando('exit 130 [sandbox: wsl2 (Linux in WSL come root; nessun isolamento)]\n')), 'Cancelled · code 130 · in Linux (WSL) as root, not on Windows');
    assert.equal(leggiEsitoComando('exit 137 [sandbox: wsl2]\n').verdetto, 'Force-stopped · code 137');
    assert.equal(leggiEsitoComando('exit null [sandbox: wsl2]\n').verdetto, 'Stopped: the command did not return an exit code');
    assert.equal(leggiEsitoComando('exit 0 [sandbox: wsl2]\nok\n').verdetto, 'Succeeded');
  });
  // AL CONTRARIO: in italiano sono le parole di prima, identiche
  assert.equal(rigaDiStatoComando(leggiEsitoComando('exit 1 [sandbox: none (cmd.exe nativo: …)]\nERR\n')), 'Non riuscito · codice 1 · su Windows, senza isolamento');
  assert.equal(leggiEsitoComando('exit 137 [sandbox: wsl2]\n').verdetto, 'Terminato a forza · codice 137');
});

test('LINGUA-ESITI-EN: il motivo della domanda respinta è una chiave con le due lingue', () => {
  const m = motivoDomandaDaCorreggere('ask_user_question', 'ask_user_question failed [QUERY_INVALID]: questions[1].options deve contenere da 2 a 4 opzioni');
  assert.equal(t(m.frase, m.parametri), 'servono da 2 a 4 opzioni');
  inInglese(() => assert.equal(t(m.frase, m.parametri), 'it needs 2 to 4 options'));
});

test('LINGUA-ESITI-EN: stati dei passi e del run, e l’avviso della connessione', () => {
  inInglese(() => {
    assert.equal(STATI_PASSO.waiting_human.parola, 'Waiting for you');
    assert.equal(statoPasso('inventato').parola, 'Unknown status');
    assert.equal(STATI_RUN.cancelling, 'Cancelling');
    assert.equal(CONNESSIONE.riconnessione(1), 'Connection lost · retrying…');
    assert.equal(CONNESSIONE.riconnessione(3), 'Connection lost · retrying (3)');
    assert.equal(CONNESSIONE.caduto, 'The server is not responding');
  });
  assert.equal(STATI_PASSO.waiting_human.parola, 'Aspetta te');
  assert.equal(STATI_PASSO.waiting_human.tono, 'avviso', 'il tono resta quello di prima');
  assert.equal(CONNESSIONE.riconnessione(3), 'Connessione persa · riprovo (3)');
});
