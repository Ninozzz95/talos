/**
 * Prove dell'attrezzo `cerca` del kernel (`src/kernel/talosHarness.mjs`).
 *
 * ⛔ Perche' questo file NASCE oggi, 11/09/2026: `cercaNelProgetto` non aveva **nessuna**
 * prova — ne' qui, ne' in `src/kernel/talosHarness.test.mjs`. Cercato prima di scriverlo
 * (`rg -l cercaNelProgetto tests/ src/`): zero occorrenze fuori dal kernel stesso. Un
 * attrezzo che decide che cosa il modello VEDE del progetto, senza una riga che lo provi.
 *
 * ⛔ Ogni prova che dice «lo trova» ha la sua gemella al VERSO CONTRARIO — «questo non lo
 * trova MAI» — perche' un camminatore inerte supera da solo la prima meta' delle prove:
 * e' la lezione del cancello semantico spento da sempre
 * ([[il-cancello-semantico-era-spento-da-sempre]]), dove ogni test provava che una
 * scrittura LEGITTIMA passasse e nessuno che una illegittima venisse respinta.
 *
 * I `disco` qui sotto sono finti (in memoria): niente disco vero, niente porta 4174.
 * Le prove che hanno bisogno del `.gitignore` VERO scrivono in una cartella temporanea,
 * perche' `creaFiltroGitignore` legge dal filesystem — e provarlo con un doppio non
 * proverebbe niente sul modulo che usiamo davvero.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cercaNelProgetto } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/**
 * Un `disco` finto con la stessa forma di `discoNode`: `elenca(cartella)` torna
 * `{nome, cartella, byte}`, `leggi(percorso)` torna il testo.
 * @param {Record<string,string>} file — percorso relativo ⇒ contenuto
 */
function discoFinto(file, { cartelleIlleggibili = [] } = {}) {
  const percorsi = Object.keys(file);
  return {
    async elenca(dentro = '') {
      if (cartelleIlleggibili.includes(dentro)) throw new Error('EACCES');
      const prefisso = dentro ? `${dentro}/` : '';
      const visti = new Map();
      for (const p of percorsi) {
        if (dentro && !p.startsWith(prefisso)) continue;
        const resto = p.slice(prefisso.length);
        const taglio = resto.indexOf('/');
        if (taglio === -1) visti.set(resto, { nome: resto, cartella: false, byte: file[p].length });
        else {
          const nome = resto.slice(0, taglio);
          if (!visti.has(nome)) visti.set(nome, { nome, cartella: true, byte: 0 });
        }
      }
      return [...visti.values()];
    },
    async leggi(percorso) {
      if (!(percorso in file)) throw new Error('ENOENT');
      return file[percorso];
    },
  };
}

/** Una cartella vera e usa e getta, per le prove che vogliono il `.gitignore` VERO. */
async function cartellaDiProva(albero) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-cerca-'));
  for (const [relativo, contenuto] of Object.entries(albero)) {
    const pieno = join(radice, ...relativo.split('/'));
    await mkdir(join(pieno, '..'), { recursive: true });
    await writeFile(pieno, contenuto, 'utf8');
  }
  // `creaFiltroGitignore` risale cercando `.git`: senza, erediterebbe le regole del repo
  // che contiene la cartella temporanea, e la prova misurerebbe il repo sbagliato.
  await mkdir(join(radice, '.git'), { recursive: true });
  return radice;
}

/** Il `disco` vero del kernel, su una cartella vera. */
function discoVero(radice) {
  return {
    async elenca(dentro = '') {
      const { readdir, stat } = await import('node:fs/promises');
      const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true });
      return Promise.all(voci.map(async (v) => ({
        nome: v.name,
        cartella: v.isDirectory(),
        byte: v.isDirectory() ? 0 : (await stat(join(radice, dentro, v.name)).catch(() => ({ size: 0 }))).size,
      })));
    },
    async leggi(percorso) {
      const { readFile } = await import('node:fs/promises');
      return readFile(join(radice, ...percorso.split('/')), 'utf8');
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. IL BUCO CHE HA FATTO NASCERE LA CURA: 1.003 file `.php` muti
// ─────────────────────────────────────────────────────────────────────────────

test('CERCA-01: un `.php` si trova per CONTENUTO — con la allowlist di prima erano 1.003 file muti', async () => {
  const disco = discoFinto({
    'core/src/Talos/Kernel.php': '<?php\nnamespace Talos\\Kernel;\nclass Kernel {}\n',
    'README.md': 'niente qui',
  });
  const esito = await cercaNelProgetto(disco, { testo: 'namespace Talos' });
  assert.match(esito, /core\/src\/Talos\/Kernel\.php/);
});

test('CERCA-02: e non e\' solo il `.php` — `.kt`, `.py`, `.rs`, `.go`, `.swift` e un file SENZA estensione', async () => {
  const disco = discoFinto({
    'app/Main.kt': 'fun ago() {}',
    'tools/build.py': 'def ago(): pass',
    'src/lib.rs': 'fn ago() {}',
    'cmd/main.go': 'func ago() {}',
    'ios/App.swift': 'func ago() {}',
    'Makefile': 'ago:\n\techo ciao',
    'Dockerfile': 'RUN ago',
  });
  const esito = await cercaNelProgetto(disco, { testo: 'ago' });
  for (const atteso of ['app/Main.kt', 'tools/build.py', 'src/lib.rs', 'cmd/main.go', 'ios/App.swift', 'Makefile', 'Dockerfile']) {
    assert.ok(esito.includes(atteso), `manca ${atteso} in:\n${esito}`);
  }
});

test('CERCA-03: una cartella che inizia per punto e che git NON ignora si guarda — era la regola dei 505 file', async () => {
  const disco = discoFinto({
    '.github/workflows/ci.yml': 'run: npm test # segnale-ci',
    '.githooks/pre-commit': '#!/bin/sh\n# segnale-ci',
  });
  const esito = await cercaNelProgetto(disco, { testo: 'segnale-ci' });
  assert.match(esito, /\.github\/workflows\/ci\.yml/);
  assert.match(esito, /\.githooks\/pre-commit/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AL VERSO CONTRARIO: quello che non si deve trovare MAI
// ─────────────────────────────────────────────────────────────────────────────

test('AL CONTRARIO — CERCA-04: `node_modules` e `.git` non si trovano MAI, ne\' per testo ne\' per nome', async () => {
  const disco = discoFinto({
    'node_modules/left-pad/index.js': 'module.exports = pietramiliare',
    '.git/COMMIT_EDITMSG': 'pietramiliare',
    '.git/objects/ab/cdef': 'pietramiliare',
    'src/vero.js': 'const x = 1',
  });
  const perTesto = await cercaNelProgetto(disco, { testo: 'pietramiliare' });
  assert.ok(!perTesto.includes('node_modules'), perTesto);
  assert.ok(!perTesto.includes('.git/'), perTesto);
  assert.match(perTesto, /no file matches/);

  const perNome = await cercaNelProgetto(disco, { nome: 'index.js' });
  assert.ok(!perNome.includes('node_modules'), perNome);
  const perNomeGit = await cercaNelProgetto(disco, { nome: 'COMMIT_EDITMSG' });
  assert.ok(!perNomeGit.includes('.git'), perNomeGit);
});

test('AL CONTRARIO — CERCA-05: il `.gitignore` VERO decide, e si prova in ENTRAMBI i versi', async () => {
  const albero = {
    'src/vero.mjs': 'const impronta = "riga-cercata"',
    'costruito/bundle.js': 'const impronta = "riga-cercata"',
    '.gitignore': 'costruito/\n',
  };
  const radice = await cartellaDiProva(albero);
  try {
    // Verso 1 — con la regola: il file costruito non esiste per `cerca`.
    const conRegola = await cercaNelProgetto(discoVero(radice), { testo: 'riga-cercata' }, { radice });
    assert.match(conRegola, /src\/vero\.mjs/);
    assert.ok(!conRegola.includes('costruito/bundle.js'), conRegola);

    // Verso 2 — tolta la regola, LO STESSO file torna visibile. Senza questo, un filtro
    // che escludesse tutto passerebbe il verso 1 e nessuno se ne accorgerebbe.
    const radice2 = await cartellaDiProva({ ...albero, '.gitignore': '# nessuna regola\n' });
    try {
      const senzaRegola = await cercaNelProgetto(discoVero(radice2), { testo: 'riga-cercata' }, { radice: radice2 });
      assert.match(senzaRegola, /costruito\/bundle\.js/);
    }
    finally { await rimuoviCartellaDiProvaAttesa(radice2); }
  }
  finally { await rimuoviCartellaDiProvaAttesa(radice); }
});

test('AL CONTRARIO — CERCA-06: senza `radice` il ripiego pota `dist`, ma NON `android`, `ios`, `vendor`', async () => {
  const disco = discoFinto({
    'dist/app.js': 'const q = "quadrifoglio"',
    'android/app/src/main/Cosa.kt': 'val q = "quadrifoglio"',
    'ios/App/Cosa.swift': 'let q = "quadrifoglio"',
    'vendor/libreria/cosa.php': '<?php $q = "quadrifoglio";',
  });
  const esito = await cercaNelProgetto(disco, { testo: 'quadrifoglio' });
  assert.ok(!esito.includes('dist/app.js'), esito);
  assert.match(esito, /android\/app\/src\/main\/Cosa\.kt/);
  assert.match(esito, /ios\/App\/Cosa\.swift/);
  assert.match(esito, /vendor\/libreria\/cosa\.php/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. I BINARI: denylist corta, piu' una rete sulla DENSITA' (non il NUL di ripgrep)
// ─────────────────────────────────────────────────────────────────────────────

test('CERCA-07: un `.png` non si apre mai per contenuto, e il conteggio lo DICE', async () => {
  const disco = discoFinto({
    'docs/schermata.png': 'PNG   parola-chiave',
    'docs/nota.md': 'niente',
  });
  const esito = await cercaNelProgetto(disco, { testo: 'parola-chiave' });
  assert.match(esito, /no file matches/);
  assert.match(esito, /1 skipped as binary/);
});

test('CERCA-08: un binario senza estensione si ferma sulla DENSITA\' di caratteri di controllo', async () => {
  const rumore = Array.from({ length: 800 }, (_, i) => String.fromCharCode(i % 8)).join('');
  const disco = discoFinto({
    'dati/blob': `${rumore}bandierina`,
    'dati/nota.txt': 'qui niente',
  });
  const esito = await cercaNelProgetto(disco, { testo: 'bandierina' });
  assert.match(esito, /no file matches/);
  assert.match(esito, /1 skipped as binary/);
});

test('⛔ CERCA-09: UN SOLO byte NUL non basta a dichiarare binario un file — e' + ' la trappola di ripgrep', async () => {
  /*
   * Misurato l'11/09/2026 con ripgrep 15.2.0 su questo repo:
   *   rg -n "cercaNelProgetto" src/kernel/talosHarness.mjs
   *   → binary file matches (found "\0" byte around offset 22789)
   * Il kernel di TALOS contiene un NUL letterale dentro un template usato come separatore.
   * Con la regola di ripgrep («binary if and only if it contains a NUL byte») il file piu'
   * importante del progetto sarebbe invisibile al suo stesso agente. Questa prova lo fissa.
   */
  const codice = `const firma = \`\${nome} \${argomenti}\`\n// bersaglio-raro\n${'x'.repeat(5000)}`;
  const disco = discoFinto({ 'src/kernel/finto.mjs': codice });
  const esito = await cercaNelProgetto(disco, { testo: 'bersaglio-raro' });
  assert.match(esito, /src\/kernel\/finto\.mjs/);
});

test('CERCA-10: un file troppo grande non si apre, e si dice — la taglia arriva da `elenca`, gratis', async () => {
  const disco = {
    async elenca(dentro = '') {
      if (dentro === '') return [{ nome: 'enorme.json', cartella: false, byte: 9_000_000 }];
      return [];
    },
    async leggi() { throw new Error('non si deve arrivare qui: il file e\' oltre il tetto di taglia'); },
  };
  const esito = await cercaNelProgetto(disco, { testo: 'qualunque' });
  assert.match(esito, /1 skipped as too large/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. I TETTI: mordono, e quando mordono lo DICONO
// ─────────────────────────────────────────────────────────────────────────────

test('CERCA-11: il tetto dei RISULTATI dichiara quanti ne restano fuori', async () => {
  const file = {};
  for (let i = 0; i < 55; i += 1) file[`src/modulo-${String(i).padStart(3, '0')}.mjs`] = 'export const cosa = 1';
  const esito = await cercaNelProgetto(discoFinto(file), { nome: 'modulo-' });
  assert.equal(esito.split('\n').filter((r) => r.startsWith('src/')).length, 40);
  assert.match(esito, /… and 15 more matches not shown — narrow the search\./);
});

test('⛔ CERCA-12: il tetto della CAMMINATA non taglia piu\' in silenzio — prima diceva «Scanned 4000» e basta', async () => {
  /*
   * Il difetto vecchio, misurato sul repo vero: `MAX_FILE = 4000` fermava la camminata e la
   * risposta continuava a dire «Scanned 4000 files», indistinguibile da un albero di 4.000
   * file davvero finito. Qui l'albero e' di 20.050 file finti: il tetto deve MORDERE e DIRLO.
   */
  const file = {};
  for (let i = 0; i < 20_050; i += 1) file[`b/f-${i}.txt`] = 'niente';
  const esito = await cercaNelProgetto(discoFinto(file), { nome: 'introvabile-xyz' });
  assert.match(esito, /incomplete scan: I stopped after collecting 20000 paths/);
});

test('CERCA-13: una cartella illeggibile non e\' un errore e non svuota la risposta', async () => {
  const disco = discoFinto(
    { 'aperta/uno.mjs': 'const cosa = "faro"', 'chiusa/due.mjs': 'const cosa = "faro"' },
    { cartelleIlleggibili: ['chiusa'] },
  );
  const esito = await cercaNelProgetto(disco, { testo: 'faro' });
  assert.match(esito, /aperta\/uno\.mjs/);
  assert.ok(!esito.includes('chiusa/due.mjs'), esito);
});

test('CERCA-14: senza argomenti dice quale campo manca, e non cammina', async () => {
  let chiamate = 0;
  const disco = { async elenca() { chiamate += 1; return []; }, async leggi() { return ''; } };
  assert.equal(await cercaNelProgetto(disco, {}), 'give at least one of "testo" or "nome".');
  assert.equal(chiamate, 0);
});

test('CERCA-15: il conteggio dell\'insuccesso e\' una misura, non una formula', async () => {
  const disco = discoFinto({
    'a.mjs': 'uno', 'b.md': 'due', 'c.png': 'PNG', 'd.txt': 'tre',
  });
  const esito = await cercaNelProgetto(disco, { testo: 'mai-scritto-da-nessuno' });
  assert.match(esito, /Scanned 4 files \(3 read for content, 1 skipped as binary\)/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. IL BUDGET: una cartella enorme non deve affamare le altre
// ─────────────────────────────────────────────────────────────────────────────

test('⛔ CERCA-16: una cartella da 15.000 file non si mangia il budget delle altre', async () => {
  /*
   * ⛔ Che cosa fissa DAVVERO questa prova, dopo l'A/B dell'11/09/2026: la CAMMINATA IN
   * AMPIEZZA. Il file poco profondo si raccoglie — e si legge — prima dei 15.000 che stanno
   * sotto una cartella grossa, e il tetto di 5.000 letture non lo tocca mai.
   * ⛔ NON fissa un «giro fra le cartelle di primo livello»: quella l'avevo scritta e la
   * misura l'ha scartata (ampiezza pura 1.004 `.php` su 1.004, uguale al giro; in lettura
   * 106 contro 107). Sta scritto in `tuttiIPercorsi`, con i numeri.
   */
  const file = {};
  for (let i = 0; i < 15_000; i += 1) file[`scratchpad/prove/f-${i}.txt`] = 'niente qui';
  file['control-plane/app/Kernel.php'] = '<?php namespace Talos\ControlPlane;';
  file['core/src/Motore.php'] = '<?php namespace Talos\Core;';
  const esito = await cercaNelProgetto(discoFinto(file), { testo: 'namespace Talos' });
  assert.match(esito, /control-plane\/app\/Kernel\.php/);
  assert.match(esito, /core\/src\/Motore\.php/);
});

test('⛔ CERCA-17: quando la ricerca si ferma a 120, il conteggio residuo e\' un MINIMO e porta il `+`', async () => {
  const file = {};
  for (let i = 0; i < 300; i += 1) file[`src/m-${String(i).padStart(3, '0')}.mjs`] = 'export const bersaglio = 1';
  const esito = await cercaNelProgetto(discoFinto(file), { testo: 'bersaglio' });
  assert.match(esito, /… and 80\+ more matches not shown/);
  assert.match(esito, /I stopped looking after 120 matches/);
  // AL CONTRARIO: sotto la soglia il `+` NON deve comparire — un «piu' di» sempre acceso
  // non informa piu' di niente.
  const pochi = {};
  for (let i = 0; i < 45; i += 1) pochi[`src/p-${i}.mjs`] = 'export const bersaglio = 1';
  const esitoPochi = await cercaNelProgetto(discoFinto(pochi), { testo: 'bersaglio' });
  assert.match(esitoPochi, /… and 5 more matches not shown/);
  assert.ok(!esitoPochi.includes('+ more'), esitoPochi);
});
