import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cartellaFoto, cartellaRapporti } from '../aiuto/cartella-foto.mjs';

/*
 * BC-12 — le foto di una prova non si depositano dentro il repository.
 *
 * Quattro prove calcolavano la cartella risalendo UN livello solo da `frontend/`, e finivano in
 * `harness-ui/.claude/` invece che nel `.claude/` della radice: una cartella che git non ignora,
 * quindi quattro PNG comparivano come non tracciate a ogni `git status`, e un `git add -A`
 * distratto se le sarebbe prese (in questo progetto ha gia' fatto danni due volte).
 *
 * ⛔ Questo cancello NON si aggancia a una stringa dentro un commento: risolve i percorsi con le
 * stesse funzioni che il prodotto delle prove usa, e li confronta con la posizione REALE del
 * repository, calcolata per una strada indipendente (si risale finche' non si trova la cartella
 * che contiene sia `harness-ui/` sia `.git`). Se qualcuno sbaglia di nuovo il conto dei livelli,
 * le due strade divergono e la prova diventa rossa.
 */

const QUI = fileURLToPath(new URL('./', import.meta.url));
const FRONTEND = fileURLToPath(new URL('../../', import.meta.url));
const TESTS = fileURLToPath(new URL('../', import.meta.url));

/** La radice del repository trovata risalendo, senza contare i livelli a mano. */
function radiceDelRepository() {
  let cartella = QUI;
  for (let passi = 0; passi < 12; passi++) {
    const su = resolve(cartella, '..');
    if (su === cartella) break;
    cartella = su;
    const dentro = readdirSync(cartella);
    if (dentro.includes('harness-ui') && dentro.includes('.git')) return cartella;
  }
  throw new Error('radice del repository non trovata risalendo da ' + QUI);
}

test('BC12-1 — le foto delle prove automatiche stanno in frontend/artifacts, che git IGNORA', () => {
  const cartella = cartellaFoto('bc12-controllo');
  assert.equal(cartella.startsWith(resolve(FRONTEND, 'artifacts') + sep), true, 'atteso dentro frontend/artifacts, trovato: ' + cartella);
  const ignorati = readFileSync(resolve(FRONTEND, '.gitignore'), 'utf8').split(/\r?\n/).map((r) => r.trim());
  assert.equal(ignorati.includes('artifacts/'), true, '⛔ se `artifacts/` sparisce da .gitignore, questa cartella comincia a sporcare il repository');
});

test('BC12-2 — il .claude dei rapporti e quello della RADICE, non quello di harness-ui', () => {
  const radice = radiceDelRepository();
  assert.equal(cartellaRapporti(), resolve(radice, '.claude'));
  assert.notEqual(cartellaRapporti(), resolve(radice, 'harness-ui', '.claude'));
  assert.equal(cartellaRapporti('foto-bc43-2026-09-12'), resolve(radice, '.claude', 'foto-bc43-2026-09-12'));
});

test('BC12-3, VERSO CHE DEVE FALLIRE — nessuna prova del frontend risale UN livello solo per scrivere', () => {
  // Composto a pezzi: scritto per intero, questo file conterrebbe il modello che accusa, e la
  // guardia misurerebbe il proprio testo. Che qui non succeda lo verifica l'asserzione in fondo.
  const MODELLO = new RegExp('[\'"`]\\.\\.' + '/\\.claude', 'g');
  const colpevoli = [];
  let letti = 0;
  const scendi = (cartella) => {
    for (const nome of readdirSync(cartella)) {
      const pieno = join(cartella, nome);
      if (statSync(pieno).isDirectory()) {
        if (nome === 'node_modules' || nome === 'artifacts') continue;
        scendi(pieno);
      } else if (nome.endsWith('.mjs') || nome.endsWith('.js')) {
        letti++;
        if (MODELLO.test(readFileSync(pieno, 'utf8'))) colpevoli.push(relative(TESTS, pieno).split(sep).join('/'));
        MODELLO.lastIndex = 0;
      }
    }
  };
  scendi(TESTS);
  assert.ok(letti > 40, `la scansione ha visto solo ${letti} file: il giro e rotto, non e un esito`);
  assert.deepEqual(
    colpevoli, [],
    'Un livello solo da frontend/ e `harness-ui/.claude`, che git non ignora. Usa `aiuto/cartella-foto.mjs`: '
    + '`cartellaFoto()` per le prove automatiche, `cartellaRapporti()` per i rapporti lanciati a mano.',
  );
  console.log(`BC12: ${letti} file del frontend letti, ${colpevoli.length} risalite corte`);
});
