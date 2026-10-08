/*
 * ASSERT-ERRORE (08/10/2026, bugfixer; osservazione della CLI) — le `assert.throws(fn)` e `assert.rejects(p)` SENZA il secondo
 * argomento passano con QUALUNQUE errore, anche un `ReferenceError`: una funzione non importata, o rinominata, fa passare la
 * prova per la ragione sbagliata. Nella copia della CLI CTX-HEADER-QUARANTINE-DIAGNOSTIC passava così.
 * Node lo dice: senza `error`, `assert.throws` verifica solo che qualcosa sia lanciato (nodejs.org/api/assert.html,
 * `assert.throws(fn[, error][, message])`).
 *
 * Il censimento conta, per file, le chiamate con UN solo argomento. Prima si maschera il contenuto di stringhe, template, commenti
 * e regex letterali (stesse posizioni, a-capo conservati); poi, dalla parentesi aperta, si contano le virgole di primo livello fino
 * a quella che chiude. I file `zz-*` sono sonde di passaggio e non entrano.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function* fileDiProva(cartella) {
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const p = join(cartella, voce.name);
    if (voce.isDirectory()) { if (!/^(node_modules|dist|artifacts|test-results)$/.test(voce.name)) yield* fileDiProva(p); }
    else if (/\.(test|spec)\.m?js$/.test(voce.name) && !voce.name.startsWith('zz-')) yield p;
  }
}

/* Una `/` apre una regex letterale se ciò che la precede (saltando gli spazi) non può chiudere un'espressione: un operatore, una
   parentesi aperta, l'inizio del file, o una parola come `return`. Dopo un nome, un numero o una `)` è una divisione. */
const PRIMA_DI_UNA_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
function apreUnaRegex(fuori, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(fuori[j])) j -= 1;
  if (j < 0) return true;
  if (PRIMA_DI_UNA_REGEX.has(fuori[j])) return true;
  const parola = fuori.slice(Math.max(0, j - 9), j + 1).join('').match(/[A-Za-z_$]+$/)?.[0];
  return ['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'await', 'yield'].includes(parola);
}

/** Lo stesso testo con il CONTENUTO di stringhe, template, commenti e regex letterali sostituito da spazi (posizioni e a-capo invariati). */
export function mascheraStringheECommenti(sorgente) {
  const fuori = sorgente.split('');
  const vuota = (da, a) => { for (let j = da; j <= a && j < fuori.length; j += 1) if (sorgente[j] !== '\n') fuori[j] = ' '; };
  for (let i = 0; i < fuori.length; i += 1) {
    const c = sorgente[i];
    const dopo = sorgente[i + 1];
    if (c === '/' && dopo === '/') { const fine = sorgente.indexOf('\n', i); vuota(i, fine < 0 ? fuori.length - 1 : fine - 1); i = fine < 0 ? fuori.length : fine; continue; }
    if (c === '/' && dopo === '*') { const fine = sorgente.indexOf('*/', i + 2); const ultimo = fine < 0 ? fuori.length - 1 : fine + 1; vuota(i, ultimo); i = ultimo; continue; }
    if (c === '/' && apreUnaRegex(fuori, i)) {
      let j = i + 1;
      let classe = false;
      for (; j < sorgente.length && sorgente[j] !== '\n'; j += 1) {
        if (sorgente[j] === '\\') { j += 1; continue; }
        if (sorgente[j] === '[') classe = true;
        else if (sorgente[j] === ']') classe = false;
        else if (sorgente[j] === '/' && !classe) break;
      }
      if (j < sorgente.length && sorgente[j] === '/') { vuota(i + 1, j - 1); i = j; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      for (; j < sorgente.length && sorgente[j] !== c; j += 1) if (sorgente[j] === '\\') j += 1;
      vuota(i + 1, j - 1);
      i = j;
    }
  }
  return fuori.join('');
}

/** Quante virgole di primo livello ha la chiamata che si apre a `inizio` (subito dopo la parentesi); `null` se non chiude. Su testo MASCHERATO. */
export function virgoleDiPrimoLivello(mascherato, inizio) {
  let profondita = 0;
  let virgole = 0;
  for (let i = inizio; i < mascherato.length; i += 1) {
    const c = mascherato[i];
    if (c === '(' || c === '[' || c === '{') profondita += 1;
    else if (c === ')' || c === ']' || c === '}') { if (profondita === 0) return virgole; profondita -= 1; }
    else if (c === ',' && profondita === 0) virgole += 1;
  }
  return null;
}

/** `{ '<percorso relativo con />': quante }` per le chiamate senza il secondo argomento, sotto `radice` nelle cartelle date. */
export function assertSenzaErrorePerFile(radice, cartelle) {
  const conti = {};
  for (const cartella of cartelle) {
    for (const file of fileDiProva(join(radice, cartella))) {
      const mascherato = mascheraStringheECommenti(readFileSync(file, 'utf8'));
      const chiamate = /\bassert\.(throws|rejects)\s*\(/g;
      let m;
      let quante = 0;
      while ((m = chiamate.exec(mascherato))) if (virgoleDiPrimoLivello(mascherato, m.index + m[0].length) === 0) quante += 1;
      if (quante > 0) conti[relative(radice, file).split(sep).join('/')] = quante;
    }
  }
  return conti;
}
