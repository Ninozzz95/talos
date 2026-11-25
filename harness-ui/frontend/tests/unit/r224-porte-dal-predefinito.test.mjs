/*
 * Righe 223-224, giro unico (revisori A RA-01..03 e B B-04/B-05, 23/11/2026): ogni porta di una chat nuova parte dal predefinito salvato
 *   (`predefinitoChatNuova`), mai da `state.*` (dopo un'apertura è la chat aperta, Accesso pieno compreso). Le porte guidate dal vivo le
 *   prova `tests/browser/r224-porte-della-chat-nuova.spec.mjs`; qui si tengono sul sorgente quelle che la pagina finta non guida
 *   («un solo progetto») e la forma che rende il primo invio vero: `avviaSessionePendente` mette nello stato i permessi con cui nasce.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sorgente = readFileSync(fileURLToPath(new URL('../../src/legacy/app.js', import.meta.url)), 'utf8');
const corpoDi = (nome) => {
  const inizio = sorgente.search(new RegExp(`(?:async )?function ${nome}\\(`, 'u'));
  assert.ok(inizio > 0, `premise: ${nome} exists`);
  return sorgente.slice(inizio, sorgente.indexOf('\n  }\n', inizio));
};

test('R224-PORTE-1: «one project only» and the root, research and sky doors start from the saved default, never from state.*', () => {
  assert.match(corpoDi('avviaSessioneImplicitaSeUnaSolaCartella'), /startCustomSession\(\{[^}]*\.\.\.predefinitoChatNuova\(\)/u);
  for (const nome of ['avviaComeNuovaRadice', 'avviaRicercaDallaSezione', 'avviaSessioneImplicitaSeUnaSolaCartella']) {
    assert.doesNotMatch(corpoDi(nome), /permessi: state\.permissions|modello: state\.model/u, `${nome} sends the open chat's state`);
  }
  assert.match(corpoDi('apriIlCielo'), /iniziale: inizialeDelCielo\(\)/u, 'the sky proposes the default');
});

test('R224-PORTE-2: a pending chat puts ITS permissions, mode and per-tool permissions in the state the first send reads', () => {
  const corpo = corpoDi('avviaSessionePendente');
  /* campo per campo: chi passa solo il modello (le prove della chat in attesa) non se lo vede sostituire dal predefinito */
  assert.match(corpo, /\(\{ modello = predefinito\.modello, effort = predefinito\.effort, permessi = predefinito\.permessi \} = \{ modello, effort, permessi \}\)/u);
  assert.match(corpo, /Object\.assign\(state, \{ permissions: permessi, modalitaOperativa, permessiPerAttrezzo: \{ \.\.\.permessiPerAttrezzo \} \}\)/u);
});

test('R224-B05-SORGENTE: a change by hand saves only its field; only the new chat window and the migration save everything', () => {
  const interi = [...sorgente.matchAll(/salvaPreferenzeChatDesktop\(\)/gu)].length;
  assert.equal(interi, 2, 'full saves: the new chat window and the stored-mode migration');
  assert.match(corpoDi('sincronizzaImpostazioniSessione'), /salvaPreferenzeChatDesktop\(Object\.keys\(patch/u);
});
