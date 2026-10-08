/*
 * VELO-PERMESSI-PIEDE (08/10/2026, bugfixer) — nella finestra «Quanto può fare TALOS qui» i pulsanti «Riporta a…» e «Fatto»
 * stavano FUORI dalla finestra, sopra il compositore: un `</div>` in più chiudeva il corpo in anticipo, e il piede diventava
 * figlio del velo. Misurato dal vivo (il piede era figlio di #veloPermessi) e nel sorgente (bilancio dei div del template
 * a -1, l'unico squilibrio del file). Il parser HTML ignora il `</div>` orfano (WHATWG, «in body»: end tag non in scope),
 * quindi niente si rompe in modo visibile altrove: per questo serve una prova che conti.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TEMPLATE = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

test('VELI-01 il template chiude ogni div che apre: il bilancio non scende mai sotto zero e finisce a zero', () => {
  let profondita = 0; let minimo = 0; let dove = -1;
  for (const m of TEMPLATE.matchAll(/<div\b[^>]*>|<\/div>/g)) {
    profondita += m[0].startsWith('</') ? -1 : 1;
    if (profondita < minimo) { minimo = profondita; dove = TEMPLATE.slice(0, m.index).split('\n').length; }
  }
  assert.equal(minimo, 0, `un </div> senza apertura (riga ~${dove} del template senza commenti)`);
  assert.equal(profondita, 0);
});

test('VELI-02 in ogni velo il piede sta DENTRO la sua finestra (dialog o alertdialog)', () => {
  const veli = [...TEMPLATE.matchAll(/<div class="overlay-layer[^"]*"[^>]*id="([^"]+)"/g)];
  // ⛔ review di «talos desktop»: la regex qui sopra vuole `class` prima di `id`; un velo scritto al contrario passerebbe in
  //   silenzio. Si contano i veli anche con una regex senza ordine fra gli attributi, e i due numeri devono coincidere.
  const tutti = [...TEMPLATE.matchAll(/<div\b[^>]*\bclass="[^"]*\boverlay-layer\b[^"]*"[^>]*>/g)].length;
  assert.ok(tutti > 0, 'i veli si trovano');
  assert.equal(veli.length, tutti, `veli presi dalla prova ${veli.length}, overlay-layer nel template ${tutti}`);
  const fuori = [];
  for (const [aperturaVelo, id] of veli) {
    const inizio = TEMPLATE.indexOf(aperturaVelo);
    const piede = TEMPLATE.indexOf('<div class="talos-dialog__footer"', inizio);
    const prossimoVelo = TEMPLATE.indexOf('<div class="overlay-layer', inizio + 1);
    if (piede < 0 || (prossimoVelo > 0 && piede > prossimoVelo)) continue; // velo senza piede
    let profondita = 0;
    for (const m of TEMPLATE.slice(inizio, piede).matchAll(/<div\b|<\/div>/g)) profondita += m[0] === '<div' ? 1 : -1;
    if (profondita !== 2) fuori.push(`${id} (profondità ${profondita}, attesa 2: velo › finestra › piede)`);
  }
  assert.deepEqual(fuori, []);
  assert.ok(TEMPLATE.includes('id="veloPermessi"'), 'il velo dei permessi c è');
});
