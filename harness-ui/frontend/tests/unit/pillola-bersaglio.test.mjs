/*
 * Reperto 3 della revisione COMPUTER USE (giudice v1470; righe ricontate dal Desktop su 4550cc8bb): il ciclo annuncia il passo col bersaglio ridotto
 * a `{ ruolo, nome }` (`ciclo.mjs:348` `breve`, `:1688` `bersaglio: breve(bersaglio)`), e la pillola lo scriveva con `String(...)`: «[object Object]».
 * Qui l'evento com'è nel ciclo: la pillola dice il nome dell'elemento (come Hermes scrive il ruolo e l'etichetta, `tools/computer_use/tool.py:609`),
 * e senza nome resta la frase di prima, mai il codice di un oggetto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { statoPillola, STATO_PILLOLA_INIZIALE } from '../../src/components/computer-use/pillola.js';

const annuncio = (bersaglio) => ({ name: 'talos.computer-use-passo', value: { n: 1, fase: 'annuncio', tipo: 'clic', bersaglio } });

test('PIL-B1 il bersaglio del ciclo ({ ruolo, nome }) diventa il suo nome, mai «[object Object]»', () => {
  const s = statoPillola(STATO_PILLOLA_INIZIALE, annuncio({ ruolo: 'pulsante', nome: 'Salva' }));
  assert.equal(s.fase, 'Salva');
  assert.equal(s.lavora, true);
});

test('PIL-B2 senza nome (un clic per coordinate, un tasto alla finestra) resta la frase di prima', () => {
  const prima = statoPillola(STATO_PILLOLA_INIZIALE, annuncio({ ruolo: 'campo', nome: 'Cerca' }));
  for (const b of [{ ruolo: 'pulsante', nome: null }, null, {}]) {
    const s = statoPillola(prima, annuncio(b));
    assert.equal(s.fase, 'Cerca', JSON.stringify(b));
    assert.doesNotMatch(s.fase, /object/u);
  }
});

test('PIL-B3 un bersaglio già in parole (forma vecchia) resta com\'è', () => {
  assert.equal(statoPillola(STATO_PILLOLA_INIZIALE, annuncio('Invia')).fase, 'Invia');
});
