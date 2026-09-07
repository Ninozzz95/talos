import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⛔ 07/09/2026, owner (screenshot): nella vista Review il titolo della sessione usciva SOPRA la
 *   testata, mozzato a metà, e le schede scendevano di otto pixel. Misurato sul 4174 a 1920×1080:
 *   titolo a y = −9 invece che 18, schede a 17 invece che 9 — solo in Review, le altre tre viste
 *   erano a posto.
 *
 * Causa: `.talos-topbar:has([data-vistetab])` è una GRIGLIA a tre colonne e assegna una colonna a
 * testa a titolo, schede e azioni. In Review il percorso era il QUARTO figlio (fratello del titolo,
 * mentre nelle altre tre sta dentro): l'auto-placement della griglia gli apriva una seconda riga, e
 * l'altezza fissa di 60px la spingeva fuori dal bordo di sopra. Nessun errore, nessun avviso: solo
 * un titolo tagliato.
 *
 * ⇒ La guardia è sulla FORMA, non sul pixel: le quattro testate di sessione hanno tre figli, e il
 *   percorso vive dentro il titolo. Con la sua metà al contrario, perché un cancello che non ha mai
 *   respinto niente non è un cancello.
 */
const TEMPLATE = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');

/** I figli diretti di una `.talos-topbar`, per nome di classe — senza costruire un DOM. */
export function figliDellaTestata(html) {
  const figli = [];
  let profondita = 0;
  const tag = /<(\/?)([a-z0-9]+)([^>]*)>/gi;
  let m;
  while ((m = tag.exec(html))) {
    const chiude = m[1] === '/';
    const nome = m[2].toLowerCase();
    const attributi = m[3] || '';
    const vuoto = attributi.trimEnd().endsWith('/') || ['br', 'img', 'input', 'use', 'path'].includes(nome);
    if (!chiude && profondita === 0) {
      const classe = /class="([^"]*)"/.exec(attributi)?.[1] || '';
      figli.push(classe.split(/\s+/)[0] || nome);
    }
    if (!chiude && !vuoto) profondita += 1;
    else if (chiude) { profondita -= 1; if (profondita < 0) break; }
  }
  return figli;
}

/** Le testate di sessione del template: quelle con le schede delle viste. */
function testateDiSessione(html) {
  const trovate = [];
  const re = /<div class="talos-topbar"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const dopo = html.slice(m.index + m[0].length);
    const corpo = dopo.slice(0, 8000); // `figliDellaTestata` si ferma da sola alla chiusura del div
    if (corpo.slice(0, 3000).includes('data-vistetab')) trovate.push(corpo);
  }
  return trovate;
}

test('TESTATA-TRE-COLONNE: ogni testata di sessione ha tre figli, non quattro', () => {
  const testate = testateDiSessione(TEMPLATE);
  assert.ok(testate.length >= 4, `le viste della sessione sono quattro, trovate ${testate.length}`);
  for (const corpo of testate) {
    const figli = figliDellaTestata(corpo).filter((c) => c.startsWith('talos-'));
    // tre celle dichiarate: titolo | schede | azioni. Una testata può non avere azioni; mai un quarto figlio.
    assert.ok(figli.length <= 3, `una testata ha ${figli.length} figli (${figli.join(', ')}): il quarto apre una seconda riga`);
    assert.equal(figli.includes('talos-topbar__path'), false, 'il percorso va DENTRO il titolo, non accanto');
  }
});

test('TESTATA-TRE-COLONNE, al contrario: la guardia MORDE sul markup del 07/9', () => {
  const rotta = '<div class="talos-topbar__title"><h1>x</h1></div><span class="talos-topbar__path">y</span><div class="talos-tabs"><div data-vistetab></div></div><div class="talos-topbar__actions"></div>';
  assert.deepEqual(figliDellaTestata(rotta), ['talos-topbar__title', 'talos-topbar__path', 'talos-tabs', 'talos-topbar__actions']);
  const sana = '<div class="talos-topbar__title"><h1>x</h1><span class="talos-topbar__path">y</span></div><div class="talos-tabs"><div data-vistetab></div></div><div class="talos-topbar__actions"></div>';
  assert.deepEqual(figliDellaTestata(sana), ['talos-topbar__title', 'talos-tabs', 'talos-topbar__actions']);
});

test('TESTATA: il titolo si tronca prima — un tetto dichiarato, non tutta la colonna', () => {
  const css = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
  const regola = /\.talos-topbar:has\(\[data-vistetab\]\) \.talos-topbar__title\{([^}]*)\}/.exec(css)?.[1] || '';
  assert.match(regola, /max-width:min\(\d+px,\s*\d+%\)/, 'senza un tetto il titolo si prende tutta la prima colonna');
  assert.match(regola, /min-width:0/, 'senza min-width:0 l’ellissi non scatta dentro una griglia');
});
