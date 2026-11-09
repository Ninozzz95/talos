/*
 * Decisione dell'owner 164 (04/11/2026, variante B di `variante-14-trasferisci.html`, riga 14 della revisione d'uso della candidata):
 * in Impostazioni → Sicurezza e privacy la banda unica dei pulsanti resta in fondo (regola delle forme), e «Link dalla chat» sale in
 * cima: così la banda sta subito sotto le due carte di cui fa le azioni («Dati locali del browser», «Trasferisci le preferenze»).
 * La prova dell'ordine vero nel browser è `tests/browser/_fase2-forme.spec.mjs` (FORME-01/04/05); qui la regola del posto, in un
 * pannello finto, e il testo fisso che `static-copy.ts` sceglieva PER POSIZIONE («la prima carta»), che con la carta dei link in cima
 * avrebbe scritto la frase dei dati locali dentro la carta sbagliata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* un pannello che sa solo quello che la regola usa: figli in ordine, `firstElementChild`, `insertBefore` */
function pannelloFinto(...nomi) {
  const p = {
    figli: nomi.map((nome) => ({ nome, isConnected: true })),
    get firstElementChild() { return this.figli[0] ?? null; },
    insertBefore(nodo, prima) {
      this.figli = this.figli.filter((f) => f !== nodo);
      const i = prima ? this.figli.indexOf(prima) : -1;
      if (i < 0) this.figli.push(nodo); else this.figli.splice(i, 0, nodo);
      nodo.isConnected = true;
      return nodo;
    },
    nomi() { return this.figli.map((f) => f.nome); },
  };
  return p;
}

test('UXD164-01 — «Link dalla chat» va in cima al pannello, e la banda delle azioni resta l ultima cosa', async () => {
  const { inCimaAlPannello } = await import('../../src/components/siti-fidati.js');
  const pannello = pannelloFinto('dati-locali', 'trasferisci', 'banda');
  const carta = { nome: 'link', isConnected: false };
  inCimaAlPannello(pannello, carta);
  assert.deepEqual(pannello.nomi(), ['link', 'dati-locali', 'trasferisci', 'banda']);
  // la carta era finita in fondo (rimontaggio delle Impostazioni): torna su, una volta, e non si muove se è già al suo posto
  pannello.insertBefore(carta, null);
  assert.deepEqual(pannello.nomi(), ['dati-locali', 'trasferisci', 'banda', 'link'], 'premessa');
  inCimaAlPannello(pannello, carta);
  assert.deepEqual(pannello.nomi(), ['link', 'dati-locali', 'trasferisci', 'banda']);
  let mosse = 0;
  const contato = { ...pannello, figli: pannello.figli, get firstElementChild() { return this.figli[0]; }, insertBefore(...a) { mosse += 1; return pannello.insertBefore.apply(this, a); } };
  inCimaAlPannello(contato, carta);
  assert.equal(mosse, 0, 'già in cima: nessuna mossa, così l osservatore del pannello non gira a vuoto');
});

test('UXD164-02 — AL CONTRARIO: niente più «davanti alla banda» (la carta in fondo, sopra i pulsanti di altre due carte)', () => {
  const sorgente = readFileSync(new URL('../../src/components/siti-fidati.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sorgente, /pannello\.insertBefore\(scheda, pannello\.querySelector\(':scope > \.talos-settings__actions'\)\)/u);
  assert.match(sorgente, /inCimaAlPannello\(pannello, scheda\)/u);
});

test('UXD164-03 — il testo fisso della carta dei dati locali si aggancia alla carta per nome, mai «la prima carta del pannello»', () => {
  const copia = readFileSync(new URL('../../src/features/settings/static-copy.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(copia, /#setting-panel-privacy > \.talos-card:first-child/u);
  assert.match(copia, /\['#setting-panel-privacy > \[data-settings-card="privacy-local"\] > p', 'impostazioni\.copy\.localDataAndProfilePreferences'\]/u);
});
