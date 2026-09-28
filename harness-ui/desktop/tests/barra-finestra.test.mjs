import assert from 'node:assert/strict';
import test from 'node:test';

import { ALTEZZA_BARRA, coloriDellaBarra, puntoDelMenu } from '../barra-finestra.mjs';

/*
 * F7-1 (owner 27/09/2026): la barra del titolo propria, come Hermes (`apps/desktop/electron/main.ts:13945`,
 * `titleBarStyle:'hidden'` + `titleBarOverlay`), SENZA ponte pagina→app (la prova R01 `preload: undefined` resta vera):
 * il colore arriva dal `<meta name="theme-color">` della pagina, il menu da un indirizzo `talos-desktop://menu` che il
 * processo principale nega e trasforma in `Menu.popup`. Qui le due traduzioni, pure.
 */

test('F7-BARRA-01 — il colore della pagina diventa i colori dei comandi di Windows, coi simboli leggibili sul fondo', () => {
  assert.equal(ALTEZZA_BARRA, 33, 'i comandi: 33 px, più 1 px di bordo della striscia = i 34 di Hermes (`src/app/shell/titlebar.ts:3`)');
  const scuro = coloriDellaBarra('#1e1f22');
  assert.deepEqual(scuro, { color: '#1e1f22', symbolColor: '#e8e8ea', height: 33 });
  const chiaro = coloriDellaBarra('#f7f6f3');
  assert.deepEqual(chiaro, { color: '#f7f6f3', symbolColor: '#1f1f22', height: 33 });
  assert.equal(coloriDellaBarra('#FFF').color, '#ffffff', 'la forma corta si allarga');
  assert.equal(coloriDellaBarra('rgb(30, 31, 34)').color, '#1e1f22', 'la forma di getComputedStyle');
  assert.equal(coloriDellaBarra('rgba(30, 31, 34, 1)').color, '#1e1f22');
});

test('F7-BARRA-02 AL CONTRARIO — un colore che non si capisce non cambia niente (null), mai un comando illeggibile', () => {
  for (const cattivo of [null, undefined, '', 'red', 'rgba(0, 0, 0, 0)', '#12', 'rgb(300, 0, 0)', 'javascript:alert(1)', 42]) {
    assert.equal(coloriDellaBarra(cattivo), null, String(cattivo));
  }
});

test('F7-BARRA-03 — l’indirizzo del menu dà il punto dove aprirlo; ogni altro indirizzo non è il menu', () => {
  assert.deepEqual(puntoDelMenu('talos-desktop://menu?x=12&y=34'), { x: 12, y: 34 });
  assert.deepEqual(puntoDelMenu('talos-desktop://menu'), {}, 'senza punto: dove sta il puntatore');
  assert.deepEqual(puntoDelMenu('talos-desktop://menu?x=-5&y=abc'), {}, 'un punto che non vale si ignora, il menu si apre lo stesso');
  for (const altro of ['https://github.com/', 'talos-desktop://altro', 'talos-desktop:menu', 'http://127.0.0.1/menu', '', null, 'talos-desktop://menu.evil.com']) {
    assert.equal(puntoDelMenu(altro), null, String(altro));
  }
});
