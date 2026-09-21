import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * ⭐⭐⭐ BC-68, 17/09/2026 — LA TASTIERA DELLE SCHEDE È UNA SOLA.
 *
 * BC-63 aveva unito Terminale e Revisione in `components/schede.js` e lasciato fuori il Browser,
 * che teneva un suo giro di disegno e una sua tastiera: frecce, Home/End e Canc riscritte a mano.
 * Due implementazioni non sono un dettaglio di stile — DIVERGONO: al Browser mancavano il
 * ripristino del fuoco dopo un ridisegno, la sfumatura sui bordi, il «porta in vista» che aspetta
 * una misura utile e il menu da tastiera. La scheda della coda chiede che `grep` trovi UNA sola
 * tastiera delle schede: questa prova è quel grep, scritto dove non si può dimenticare di farlo.
 *
 * ⛔ Cerca la FORMA, non una riga: «un file di componente che gestisce le frecce su un elemento con
 *   `role=tab`». E ha la sua metà al contrario — su un sorgente che quella tastiera ce l'ha, deve
 *   accusarlo.
 */

const COMPONENTI = fileURLToPath(new URL('../../src/components/', import.meta.url));

/** I tasti che muovono la selezione fra le linguette: se un file li nomina, ha una sua tastiera. */
const TASTI_DELLE_SCHEDE = /'(ArrowRight|ArrowLeft|Home|End)'/g;

export function tastieraDelleSchede(sorgente) {
  const righe = String(sorgente).split('\n');
  const trovate = [];
  righe.forEach((riga, i) => {
    /* Una riga conta solo se parla di TASTI: un `Home` dentro una stringa di interfaccia o un
       `End` in un commento non sono una tastiera. Il confronto è con l'apice, come lo scrive chi
       gestisce un `KeyboardEvent`. */
    const tasti = riga.match(TASTI_DELLE_SCHEDE);
    if (tasti) trovate.push({ riga: i + 1, tasti: [...new Set(tasti)] });
  });
  return trovate;
}

test('BC68 — solo `schede.js` gestisce le frecce delle linguette', () => {
  const soloLui = tastieraDelleSchede(readFileSync(`${COMPONENTI}schede.js`, 'utf8'));
  assert.ok(soloLui.length > 0, 'la premessa non regge: il componente condiviso non gestisce le frecce');
  for (const file of ['browser.js', 'terminale.js', 'review.js']) {
    const trovate = tastieraDelleSchede(readFileSync(`${COMPONENTI}${file}`, 'utf8'));
    assert.deepEqual(trovate, [], `${file} ha una sua tastiera delle schede: ${JSON.stringify(trovate)}`);
  }
});

test('BC68 al contrario — su un sorgente con la sua tastiera il controllo accusa', () => {
  const malato = [
    "el.schede.addEventListener('keydown', (e) => {",
    "  if (e.key === 'ArrowRight') prossima = ids[(i + 1) % ids.length];",
    "  else if (e.key === 'Home') prossima = ids[0];",
    '});',
  ].join('\n');
  const trovate = tastieraDelleSchede(malato);
  assert.equal(trovate.length, 2);
  assert.deepEqual(trovate[0], { riga: 2, tasti: ["'ArrowRight'"] });
  /* E un sorgente sano non si accusa da solo: niente tasti, niente segnalazioni. */
  assert.deepEqual(tastieraDelleSchede("const titolo = 'Home page'; // End of file"), []);
});
