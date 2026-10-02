import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/*
 * ⛔⛔ Corsia SCRATCH, 24/09/2026 — il cancello contro il ritorno dei temporanei sciolti in `%TEMP%`.
 *
 * Ricetta di Hermes (`scripts/check_no_tmp_literals.py` + `.github/workflows/lint.yml:194`): il codice di
 * prodotto non nomina la TEMP di sistema; l'unico posto che può farlo è l'aiuto della radice
 * (`src/scratch.mjs`). Qui si leggono `src/**`, `scripts/**`, `desktop/**` e `server.mjs` e si pretende
 * che nessun file (fuori dai test e dall'aiuto) contenga `tmpdir(` — che copre anche
 * `mkdtemp(join(tmpdir(), …))` e `os.tmpdir()`.
 *
 * ⛔ I test NON si leggono (`*.test.mjs`, `*.spec.mjs`, `tests/`): usano una TEMP privata per corsa di
 *   proposito (`tests/aiuto/cartelle-di-prova.mjs`).
 * ⛔ I commenti non contano: `src/workspace-watcher.mjs` spiega a parole cosa fa `mkdtemp(join(tmpdir(), …))`.
 *
 * ⭐ Il REGISTRO DEL DEBITO, come la baseline «da bruciare» di Hermes: file che usano ancora la TEMP di
 *   sistema e che questa corsia NON ha migrato perché non erano nel suo mandato o perché la scelta è
 *   dell'owner. Ognuno porta il suo perché. Il registro può solo SCENDERE: una voce che non usa più
 *   `tmpdir(` fa diventare rossa la prova, così il debito pagato non resta scritto come debito.
 */
const DEBITO_DICHIARATO = new Map([
  /* 24/09/2026 — PAGATO: `src/browser-sessione-viva.mjs` (profilo del Chromium pilotato) è sotto la radice per
     decisione dell'owner, soggetto alla pulizia delle 24 ore; il profilo si ricrea alla navigazione dopo. */
  ['scripts/qa-visual-pipeline.mjs', 'strumento di sviluppo (profilo Chrome della pipeline QA visiva), non spedito col prodotto'],
  ['scripts/bench-local-resume.mjs', 'banco di misura di sviluppo, non spedito col prodotto'],
  ['scripts/bench-llama-preflight.mjs', 'banco di misura di sviluppo: percorsi finti di fixture, nessuna cartella creata'],
  ['desktop/scripts/ledger-preview-smoke.mjs', 'prova di CI: usa `RUNNER_TEMP` e ricade su TEMP solo fuori dalla CI'],
]);

const RADICE = fileURLToPath(new URL('..', import.meta.url));
const AIUTO = 'src/scratch.mjs';
const CARTELLE = ['src', 'scripts', 'desktop'];
const SALTA = new Set(['node_modules', 'tests', 'dist', 'dist-preview', 'dist-prova-aggiornamenti', '.staging', '.prove']); // dist-prova-aggiornamenti: la build di prova degli aggiornamenti (distribuisci.mjs), ignorata da git

function elenca(cartella, fuori = []) {
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    if (voce.isSymbolicLink()) continue;
    const pieno = join(cartella, voce.name);
    if (voce.isDirectory()) { if (!SALTA.has(voce.name)) elenca(pieno, fuori); continue; }
    if (!/\.(mjs|cjs|js)$/.test(voce.name) || /\.(test|spec)\.(mjs|cjs|js)$/.test(voce.name)) continue;
    fuori.push(pieno);
  }
  return fuori;
}

/** Toglie i commenti a blocco e le righe di solo commento, lasciando le righe al loro posto. */
function senzaCommenti(testo) {
  return testo
    .replace(/\/\*[\s\S]*?\*\//g, (blocco) => blocco.replace(/[^\n]/g, ' '))
    .split('\n').map((riga) => (/^\s*\/\//.test(riga) ? '' : riga)).join('\n');
}

export function trovaTmpdir(radice = RADICE) {
  const file = [...CARTELLE.flatMap((c) => elenca(join(radice, c))), join(radice, 'server.mjs')];
  const colpe = new Map();
  for (const pieno of file) {
    const nome = relative(radice, pieno).split(sep).join('/');
    if (nome === AIUTO) continue;
    const righe = senzaCommenti(readFileSync(pieno, 'utf8')).split('\n');
    const trovate = righe.flatMap((riga, i) => (/\btmpdir\s*\(/.test(riga) ? [`${nome}:${i + 1}`] : []));
    if (trovate.length) colpe.set(nome, trovate);
  }
  return colpe;
}

test('SCRATCH-CANCELLO-01 — nessun tmpdir() nel codice di prodotto fuori da src/scratch.mjs (salvo il debito dichiarato)', () => {
  const colpe = trovaTmpdir();
  const nonDichiarate = [...colpe.entries()].filter(([nome]) => !DEBITO_DICHIARATO.has(nome)).flatMap(([, righe]) => righe);
  assert.deepEqual(nonDichiarate, [], `temporanei nella TEMP di sistema: passa da src/scratch.mjs (cartellaScratch/cartellaScratchAttesa):\n${nonDichiarate.join('\n')}`);
});

test('SCRATCH-CANCELLO-02 — il registro del debito può solo scendere: una voce pagata si toglie dal registro', () => {
  const colpe = trovaTmpdir();
  const pagate = [...DEBITO_DICHIARATO.keys()].filter((nome) => !colpe.has(nome));
  assert.deepEqual(pagate, [], `queste voci del debito non usano più tmpdir(): toglile da DEBITO_DICHIARATO: ${pagate.join(', ')}`);
});

test('SCRATCH-CANCELLO-03 — il cancello morde: vede un tmpdir() vero e ignora quello nei commenti', () => {
  assert.equal(/\btmpdir\s*\(/.test(senzaCommenti('const x = mkdtempSync(join(tmpdir(), "talos-"));')), true);
  assert.equal(/\btmpdir\s*\(/.test(senzaCommenti('const y = os.tmpdir();')), true);
  assert.equal(/\btmpdir\s*\(/.test(senzaCommenti('/* mkdtemp(join(tmpdir(), …)) */\n// os.tmpdir()\n * tmpdir() in un blocco')), true,
    'una riga « * » fuori da un blocco chiuso non è un commento riconosciuto: deve contare');
  assert.equal(/\btmpdir\s*\(/.test(senzaCommenti('/*\n * mkdtemp(join(tmpdir(), …))\n */\n// os.tmpdir()')), false);
  // e sul prodotto vero: l'aiuto è l'unica eccezione, e lì tmpdir( c'è davvero (i residui storici in TEMP).
  assert.match(readFileSync(join(RADICE, AIUTO), 'utf8'), /\btmpdir\s*\(/);
});
