/*
 * ⛔ LINGUA-UGUALI — owner 24/10/2026 notte (punto 4 della revisione a blocco 5, la consigliata): «Follow-up», «Review» e «Board» erano
 *   rimasti in inglese nella sezione italiana, e il cancello della lingua (`lingua-cancello.test.mjs`) non li vedeva: controlla che la
 *   chiave esista in tutte e due le lingue, non che sia TRADOTTA. Ora tradotti («Seguito», «Revisione», «Bacheca»), e questo cancello
 *   segnala ogni testo identico in italiano e in inglese che non sta nell'elenco dichiarato `lingua-uguali-eccezioni.json` (nomi propri,
 *   unità, sigle, termini tecnici che l'italiano usa così). L'elenco si tiene stretto nei due versi: una voce che non è più uguale si
 *   toglie, così un'eccezione non resta a coprire una chiave che un giorno torna inglese.
 * ⛔ Provato anche AL CONTRARIO (LINGUA-UGUALI-2): un testo italiano rimesso in inglese fa diventare rosso il cancello.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AREE } from '../../src/i18n/testi/index.js';

const ECCEZIONI = new Set(JSON.parse(readFileSync(new URL('./lingua-uguali-eccezioni.json', import.meta.url), 'utf8')).chiavi);

/** Le chiavi `<area>.<chiave>` col testo identico nelle due lingue. */
export function chiaviUguali(aree) {
  const uguali = [];
  for (const [area, voci] of Object.entries(aree)) {
    for (const [chiave, it] of Object.entries(voci.it || {})) if (voci.en?.[chiave] === it) uguali.push(`${area}.${chiave}`);
  }
  return uguali.sort();
}

test('LINGUA-UGUALI-1: nessun testo identico in italiano e in inglese fuori dall\'elenco dichiarato; nessuna eccezione inutile', () => {
  const uguali = chiaviUguali(AREE);
  assert.deepEqual(uguali.filter((k) => !ECCEZIONI.has(k)), [], 'testi italiani uguali all\'inglese: tradurli, o dichiararli in lingua-uguali-eccezioni.json');
  const dichiarate = new Set(uguali);
  assert.deepEqual([...ECCEZIONI].filter((k) => !dichiarate.has(k)), [], 'eccezioni che non servono più: toglierle dall\'elenco');
});

test('LINGUA-UGUALI-2 (al contrario): «Follow-up», «Review», «Board» rimessi in inglese fanno diventare rosso il cancello', () => {
  for (const [area, chiave, inglese] of [['chat', 'child.followUp', 'Follow-up'], ['modello', 'chat.review', 'Review'], ['modello', 'sidebar.board', 'Board']]) {
    assert.equal(AREE[area].en[chiave], inglese, `${area}.${chiave}: l'inglese è ancora «${inglese}»`);
    assert.notEqual(AREE[area].it[chiave], inglese, `${area}.${chiave}: tradotto in italiano`);
    const rotte = { ...AREE, [area]: { ...AREE[area], it: { ...AREE[area].it, [chiave]: inglese } } };
    assert.ok(chiaviUguali(rotte).filter((k) => !ECCEZIONI.has(k)).includes(`${area}.${chiave}`), `${area}.${chiave} rimesso in inglese deve far fallire il cancello`);
  }
});
