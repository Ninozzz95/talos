/*
 * ⛔⛔ 17/09/2026 (Fase A-bis, riga 3) — CANCELLO SUL SORGENTE: nessun processo del prodotto nasce con
 * l'ambiente INTERO del server.
 *
 * Senza l'opzione `env`, `node:child_process` passa al figlio `process.env` tutto intero
 * (nodejs.org/api/child_process.html), cioè anche il token della API locale, le chiavi delle ricevute
 * e la chiave della ricerca. Il censimento è lo stesso di `.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md`
 * e parte dalle CHIAMATE, non dagli import (un import dinamico era sfuggito al primo giro).
 *
 * ⛔ È un cancello sul TESTO, e lo dice: prova che ogni chiamata dichiara un `env`, non che quell'`env`
 *   sia giusto. Il contenuto del filtro lo provano `ambiente-solo-server.test.mjs` e le prove del
 *   terminale. Chi aggiunge un lancio nuovo senza `env` lo vede rosso qui, col file e la riga.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const RADICE = join(import.meta.dirname, '..');
const CHIAMATA = /\b(spawn|spawnSync|execFile|execFileSync|execSync|fork)\(/;

/* Chi NON passa di qui, e perché (ogni voce è una decisione, non una svista):
 *  - `process-policy.mjs` È la politica: costruisce lei l'ambiente da un'allowlist.
 *  - `hf-model-transfer.mjs` ha una `spawn` locale che passa dalla politica.
 *  - `kernel/talosHarness.mjs` è del proprietario del kernel: i suoi lanci usano `ambienteSenzaCredenziali()`;
 *    resta aperto `wsl.exe -l -v` (sola lettura, argomenti fissi) — dichiarato nell'inventario.
 *  - `difesa-ricerca-programmi.mjs` nomina `spawnSync` solo in un commento. */
const ESENTI = new Set(['src/process-policy.mjs', 'src/hf-model-transfer.mjs', 'src/kernel/talosHarness.mjs', 'src/difesa-ricerca-programmi.mjs']);
const PASSA_DALLA_POLITICA = /policy\.(spawn|execFile)|processPolicy\.|_PROCESS_POLICY\./;

function fileSorgente(cartella, fuori = []) {
  for (const nome of readdirSync(cartella)) {
    const p = join(cartella, nome);
    if (statSync(p).isDirectory()) fileSorgente(p, fuori);
    else if (nome.endsWith('.mjs') && !nome.endsWith('.test.mjs')) fuori.push(p);
  }
  return fuori;
}

/** L'oggetto opzioni sta quasi sempre sulla riga della chiamata o nelle tre dopo. */
function finestra(righe, i) { return righe.slice(i, i + 4).join('\n'); }

test('SPAWN-AMBIENTE-01 — ogni lancio di processo in `src/` dichiara il suo `env`, o passa dalla politica', () => {
  const nudi = [];
  let visti = 0;
  for (const file of fileSorgente(join(RADICE, 'src'))) {
    const rel = relative(RADICE, file).split('\\').join('/');
    if (ESENTI.has(rel)) continue;
    const righe = readFileSync(file, 'utf8').split('\n');
    righe.forEach((riga, i) => {
      if (!CHIAMATA.test(riga) || /^\s*(\*|\/\/|\/\*)/.test(riga) || PASSA_DALLA_POLITICA.test(riga)) return;
      if (/return spawn\(percorso, argomenti, opzioni\)/.test(riga)) { visti += 1; return; } // browser-vivo: `opzioni` viene da `opzioniAvvioBrowser()`, provato a parte
      visti += 1;
      if (!/\benv\s*:/.test(finestra(righe, i))) nudi.push(`${rel}:${i + 1}  ${riga.trim().slice(0, 110)}`);
    });
  }
  assert.ok(visti >= 3, `premessa: il censimento deve VEDERE dei lanci (visti ${visti}) — se è zero il filtro è rotto, non il codice pulito`);
  assert.deepEqual(nudi, [], `⛔ lanci che ereditano l'ambiente intero del server:\n${nudi.join('\n')}`);
});
