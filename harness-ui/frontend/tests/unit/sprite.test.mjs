import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * ⛔ 06/9 — SETTE simboli erano chiamati dal codice e non esistevano nello sprite: `icon(id)`
 * (`legacy/app.js`) costruisce un `<use href="#id">` senza validare niente, quindi ogni chiamata a
 * un id inesistente disegna un BUCO — nessun errore in console, nessun test rosso, solo un vuoto a
 * schermo. Uno di loro (`i-folder-open`) sta nella modale «Nuova sessione», sotto gli occhi a ogni
 * avvio; erano lì da giorni e nessun controllo se n'era accorto.
 * ⇒ Questo è quel controllo. Non guarda l'aspetto: guarda che ogni simbolo NOMINATO esista.
 */
const radice = fileURLToPath(new URL('../../', import.meta.url));
const leggi = (p) => readFileSync(radice + p, 'utf8');
const template = leggi('index.template.html');

function definiti() {
  return new Set([...template.matchAll(/<symbol id="([a-z0-9-]+)"/g)].map((m) => m[1]));
}

function usati() {
  const fonti = ['src/legacy/app.js', ...readdirSync(radice + 'src/components').filter((f) => f.endsWith('.js')).map((f) => `src/components/${f}`)];
  const trovati = new Set();
  for (const f of fonti) {
    const testo = leggi(f);
    /*
     * ⛔ Il primo disegno di questo controllo cercava solo `icon('i-x')` e `href="#i-x"`, e ha PERSO
     *    due simboli rotti che la sonda dal vivo ha poi trovato: `i-edit` (scritto come
     *    `icona: 'i-edit'` in un menu) e `i-chevron-right` (dentro un ternario,
     *    `icon(c ? 'i-chevron' : 'i-chevron-right')`). Un controllo che vede solo una FORMA di
     *    scrittura non protegge dal difetto, protegge da una sua sillaba.
     * ⇒ Si guarda QUALUNQUE literal che si chiami come un simbolo. Un nome `i-…` nel codice che
     *   nello sprite non c'è è un buco a schermo, comunque sia stato scritto.
     */
    for (const m of testo.matchAll(/'(i-[a-z0-9-]+)'/g)) trovati.add(m[1]);
    for (const m of testo.matchAll(/href="#(i-[a-z0-9-]+)"/g)) trovati.add(m[1]);
  }
  for (const m of template.matchAll(/href="#(i-[a-z0-9-]+)"/g)) trovati.add(m[1]);
  return trovati;
}

test('⛔ ogni simbolo nominato dal codice esiste nello sprite — un id sbagliato disegna un buco muto', () => {
  const mancanti = [...usati()].filter((id) => !definiti().has(id)).sort();
  assert.deepEqual(mancanti, [], `simboli chiamati e mai definiti: ${mancanti.join(', ')}`);
});

test('⛔ AL CONTRARIO — il controllo MORDE: un id inventato deve risultare mancante', () => {
  // Se questa passasse a vuoto, la prova sopra non proverebbe niente.
  assert.equal(definiti().has('i-questo-non-esiste-mai'), false);
  assert.ok(definiti().size >= 36, `lo sprite ha ${definiti().size} simboli: se crollasse, la prova sopra passerebbe per il motivo sbagliato`);
});
