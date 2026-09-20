import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * ⭐⭐ BC-77 (b), 17/09/2026 — NESSUN TAG DI CHIUSURA CON ATTRIBUTI NEL MARKUP SERVITO.
 *
 * Il caso: `index.template.html` portava, in sei punti, `<button …></span aria-label="Vai al
 * giro"></button>` dentro la `talos-turn-spine`. L'intenzione era mettere l'etichetta SUL bottone;
 * quello che è arrivato è un tag di chiusura di un elemento che non era mai stato aperto, con
 * dentro l'attributo che serviva.
 *
 * ⛔ Misurato prima della cura, e va detto con precisione perché la scheda della coda attribuiva a
 *   questo refuso un «trattino fantasma a x≈303»: **a schermo non si vede**. Il parser HTML butta
 *   gli attributi dei tag di chiusura e poi butta il tag stesso (nessuno `span` aperto), quindi il
 *   DOM che ne esce è un bottone vuoto; e i turni dimostrativi del template vengono comunque tolti
 *   all'avvio — sonda del 17/09 sul pacchetto servito: **0** `.talos-turn-spine__tick` senza
 *   sessione, e con una sessione viva **6 su 6** ticks costruiti da `components/conversazione.js`,
 *   tutti con `aria-label`, **0** bottoni muti nella conversazione.
 *   ⇒ Quello che resta è vero lo stesso e vale la cura: sono **6 errori di sintassi** che
 *   viaggiano fino al browser della persona (misurati anche in `dist/index.html`, 6 occorrenze), e
 *   che nel primo disegno — prima che il JavaScript ripulisca i turni finti — danno un bottone
 *   senza nome accessibile.
 *
 * ⛔ Questa prova non cerca la stringa del refuso: cerca la FORMA («un tag di chiusura con dentro
 *   un attributo»), così il prossimo refuso dello stesso genere lo prende senza che nessuno lo
 *   aggiunga a mano. E ha la sua metà AL CONTRARIO: su un pezzo di markup malato deve trovarlo.
 */

const TEMPLATE = fileURLToPath(new URL('../../index.template.html', import.meta.url));

/**
 * Tutti i tag di chiusura che portano qualcosa oltre al nome: `</span aria-label="…">`.
 * Un tag di chiusura sano è `</nome>` ed eventualmente spazi prima di `>`.
 */
export function chiusureConAttributi(html) {
  const trovate = [];
  const regex = /<\/([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let m = regex.exec(html);
  while (m !== null) {
    if (m[2].trim() !== '') {
      const riga = html.slice(0, m.index).split('\n').length;
      trovate.push({ riga, tag: m[0].slice(0, 60) });
    }
    m = regex.exec(html);
  }
  return trovate;
}

test('BC77-B — il template non ha tag di chiusura con attributi', () => {
  const html = readFileSync(TEMPLATE, 'utf8');
  const guai = chiusureConAttributi(html);
  assert.deepEqual(guai, [], `tag di chiusura malformati: ${JSON.stringify(guai)}`);
});

test('BC77-B — ogni tick della spina nel template porta il suo nome accessibile', () => {
  const html = readFileSync(TEMPLATE, 'utf8');
  const tick = html.match(/<button[^>]*talos-turn-spine__tick[^>]*>/g) || [];
  assert.ok(tick.length > 0, 'la premessa non regge: nel template non c\'è nessun tick della spina');
  const muti = tick.filter((t) => !/aria-label=/.test(t));
  assert.deepEqual(muti, [], `tick senza nome accessibile: ${JSON.stringify(muti)}`);
});

test('BC77-B al contrario — su un markup malato il cancello trova il difetto', () => {
  const malato = '<div>\n<button type="button" class="talos-turn-spine__tick"></span aria-label="Vai al giro"></button>\n</div>';
  const guai = chiusureConAttributi(malato);
  assert.equal(guai.length, 1);
  assert.equal(guai[0].riga, 2);
  /* E un markup sano non deve essere accusato: un cancello che accusa tutti non è un cancello. */
  assert.deepEqual(chiusureConAttributi('<div><span>x</span>\n</div  >'), []);
});
