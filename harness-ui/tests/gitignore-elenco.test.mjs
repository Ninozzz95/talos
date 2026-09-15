/**
 * Prove del filtro `.gitignore` per l'elenco profondo.
 *
 * ⛔ Ogni attesa qui dentro e' stata fissata interrogando `git check-ignore` VERO su un
 * repo di prova il 10/09/2026, PRIMA di scrivere il modulo: non e' il modulo che detta
 * cosa e' giusto, e' git. Fonte della specifica: https://git-scm.com/docs/gitignore
 * (sezione PATTERN FORMAT), letta il 10/09/2026.
 *
 * ⛔ La prova numero uno e' il caso del 27/08/2026, quello che ci e' costato giorni di
 * screenshot ignorati in silenzio.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compilaRegole,
  componiRegole,
  creaFiltroGitignore,
  NOME_FILE_REGOLE,
} from '../src/gitignore-elenco.mjs';

/** Scorciatoia: compila un testo di regole e torna il predicato `tieni`. */
function filtro(testo, opzioni) {
  return compilaRegole(testo.split('\n'), opzioni).tieni;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 1. Il pattern semplice, e la negazione che ripesca
// ─────────────────────────────────────────────────────────────────────────────────────

test('⭐⭐⭐ un pattern semplice ESCLUDE, e la sua negazione RIPESCA (git: `*.ts` + `!vero.ts`)', () => {
  const tieni = filtro('*.ts\n!vero.ts\n');
  assert.equal(tieni('src/gen/x.ts'), false, 'x.ts deve restare escluso');
  assert.equal(tieni('src/vero.ts'), true, 'vero.ts deve essere ripescato dalla negazione');
});

test('⛔ AL CONTRARIO — se la negazione viene PRIMA dell esclusione non ripesca niente: decide l ULTIMA regola', () => {
  const tieni = filtro('!vero.ts\n*.ts\n');
  assert.equal(tieni('src/vero.ts'), false);
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 2. ⛔ IL CASO DEL 27/08/2026 — la negazione inerte sotto una cartella esclusa
// ─────────────────────────────────────────────────────────────────────────────────────

test('⛔⛔⛔⭐⭐⭐ 27/08 — `docs/` esclude la CARTELLA e rende INERTE `!docs/immagini/*.png`', () => {
  // [G] «It is not possible to re-include a file if a parent directory of that file is
  // excluded. Git doesn't list excluded directories for performance reasons, so any
  // patterns on contained files have no effect, no matter where they are defined.»
  // Oracolo `git check-ignore` 10/09/2026: docs/immagini/foto.png => IGNORATO.
  const tieni = filtro('docs/\n!docs/immagini/*.png\n');
  assert.equal(tieni('docs', true), false, 'la cartella docs e esclusa');
  assert.equal(
    tieni('docs/immagini/foto.png'),
    false,
    'la negazione NON deve ripescare: il genitore e escluso — e questo e il difetto che ci e costato giorni',
  );
});

test('⛔⛔⛔⭐⭐⭐ 27/08 — LA CURA: `docs/*` + `!docs/immagini/` ripesca DAVVERO lo screenshot', () => {
  // Oracolo `git check-ignore` 10/09/2026:
  //   docs/immagini/foto.png => tenuto ; docs/testo.md => IGNORATO
  const tieni = filtro('docs/*\n!docs/immagini/\n');
  assert.equal(tieni('docs', true), true, 'docs stessa non e esclusa: e il GLOB che esclude i figli');
  assert.equal(tieni('docs/immagini', true), true, 'la cartella immagini e ripescata');
  assert.equal(tieni('docs/immagini/foto.png'), true, 'e cosi lo screenshot dentro');
  assert.equal(tieni('docs/testo.md'), false, 'ma il resto di docs resta escluso');
});

test('⛔⛔ 27/08 nella forma ESATTA del difetto (`mobile/docs/`) — la negazione resta inerte', () => {
  const inerte = filtro('mobile/docs/\n!docs/immagini/*.png\n');
  assert.equal(inerte('mobile/docs/immagini/nuovo.png'), false);
  const curata = filtro('mobile/docs/*\n!mobile/docs/immagini/\n');
  assert.equal(curata('mobile/docs/immagini/nuovo.png'), true);
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 3. Ancoraggio: `/build` contro `build`
// ─────────────────────────────────────────────────────────────────────────────────────

test('⭐⭐⭐ `/build` esclude SOLO la radice, `build` esclude OVUNQUE', () => {
  // Oracolo 10/09/2026: /build => build/out IGNORATO, sub/build/out tenuto.
  const ancorato = filtro('/build\n');
  assert.equal(ancorato('build/out'), false);
  assert.equal(ancorato('sub/build/out'), true, 'un `build` annidato NON e toccato da `/build`');

  const fluttuante = filtro('build\n');
  assert.equal(fluttuante('build/out'), false);
  assert.equal(fluttuante('sub/build/out'), false, 'senza slash il pattern matcha a ogni livello');
});

test('⛔ AL CONTRARIO — uno slash IN MEZZO ancora quanto uno slash in TESTA', () => {
  // [G] «If there is a separator at the beginning or middle (or both) […] the pattern is
  // relative to the directory level of the particular .gitignore file itself.»
  const tieni = filtro('sub/build\n');
  assert.equal(tieni('sub/build/out'), false);
  assert.equal(tieni('altro/sub/build/out'), true, '`sub/build` e ancorato: non fluttua');
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 4. `*` non attraversa `/`, e i tre casi di `**`
// ─────────────────────────────────────────────────────────────────────────────────────

test('⛔⛔⭐⭐⭐ `*.log` FLUTTUA a ogni livello — `*` non attraversa `/`, ma il PATTERN senza slash si', () => {
  // ⛔ Attenzione, e il punto che si sbaglia piu' spesso: `*.log` e `**/*.log` sono
  // EQUIVALENTI. Oracolo `git check-ignore` 10/09/2026 con `*.log`:
  //   radice.log IGNORATO · a/b/c.log IGNORATO · logs/nested/deep.log IGNORATO
  // [G] «Otherwise the pattern may also match at any level below the .gitignore level.»
  const semplice = filtro('*.log\n');
  const doppio = filtro('**/*.log\n');
  for (const percorso of ['radice.log', 'a/b/c.log', 'logs/nested/deep.log']) {
    assert.equal(semplice(percorso), false, `*.log deve escludere ${percorso}`);
    assert.equal(doppio(percorso), false, `**/*.log deve escludere ${percorso}`);
  }
});

test('⛔⛔⭐⭐⭐ La forma che DAVVERO non attraversa le sottocartelle e quella ANCORATA: `/*.log` e `logs/*.log`', () => {
  // Oracolo 10/09/2026 con `/*.log`: radice.log IGNORATO · a/b/c.log tenuto.
  const radice = filtro('/*.log\n');
  assert.equal(radice('radice.log'), false);
  assert.equal(radice('a/b/c.log'), true, 'qui `*` non attraversa lo slash: e la prova vera');

  const dentroLogs = filtro('logs/*.log\n');
  assert.equal(dentroLogs('logs/uno.log'), false);
  assert.equal(dentroLogs('logs/nested/deep.log'), true, '`*` si ferma al primo slash');

  const conDoppio = filtro('logs/**/*.log\n');
  assert.equal(conDoppio('logs/nested/deep.log'), false, '`**` invece attraversa');
});

test('⭐⭐ i TRE casi di `**`: iniziale, finale, in mezzo', () => {
  // [G] «A leading "**" followed by a slash means match in all directories.»
  const iniziale = filtro('**/foo\n');
  assert.equal(iniziale('foo', true), false);
  assert.equal(iniziale('a/b/foo', true), false);

  // [G] «A trailing "/**" matches everything inside.»
  const finale = filtro('abc/**\n');
  assert.equal(finale('abc', true), true, 'abc stessa NON e dentro se stessa');
  assert.equal(finale('abc/uno.txt'), false);
  assert.equal(finale('abc/x/y/profondo.txt'), false, 'profondita infinita');

  // [G] «A slash followed by two consecutive asterisks then a slash matches zero or more directories.»
  const mezzo = filtro('a/**/b\n');
  assert.equal(mezzo('a/b', true), false, 'zero directory in mezzo');
  assert.equal(mezzo('a/x/b', true), false);
  assert.equal(mezzo('a/x/y/b', true), false);
  assert.equal(mezzo('a/x/y/c', true), true, 'e nient altro');
});

test('⭐⭐ `?` prende un carattere solo e non lo slash, e le classi `[a-z]` / `[!x]` funzionano', () => {
  const punto = filtro('radice.lo?\n');
  assert.equal(punto('radice.log'), false);
  assert.equal(punto('radice.loXY'), true, '`?` e UNO solo');

  const gamma = filtro('radice.lo[a-z]\n');
  assert.equal(gamma('radice.log'), false);
  assert.equal(gamma('radice.lo1'), true);

  const negata = filtro('radice.lo[!x]\n');
  assert.equal(negata('radice.log'), false);
  assert.equal(negata('radice.lox'), true, 'la classe negata esclude proprio la x');
});

test('⛔ AL CONTRARIO — `?` e le classi NON attraversano lo slash (FNM_PATHNAME)', () => {
  // [P] fnmatch(3p): «a slash character in the string shall be explicitly matched by a
  // slash in the pattern; it shall not be matched by […] a bracket expression.»
  assert.equal(filtro('a?c\n')('a/c'), true, '`?` non puo diventare lo slash');
  assert.equal(filtro('a[!x]c\n')('a/c'), true, 'nemmeno la classe negata prende lo slash');
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 5. Pattern che finiscono con `/` = solo directory
// ─────────────────────────────────────────────────────────────────────────────────────

test('⭐⭐ uno slash finale rende il pattern valido SOLO per le directory', () => {
  // Oracolo 10/09/2026: con `radice.log/`, il FILE radice.log risulta `tenuto`.
  const tieni = filtro('roba/\n');
  assert.equal(tieni('roba', true), false, 'la cartella roba e esclusa');
  assert.equal(tieni('roba', false), true, 'un FILE di nome roba non lo e');
  assert.equal(tieni('a/roba', true), false, 'e fluttua: `frotz/` matcha anche `a/frotz`');
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 6. Spazi finali, commenti, escape
// ─────────────────────────────────────────────────────────────────────────────────────

test('⭐⭐ gli spazi finali si ignorano, se NON sono protetti da `\\`', () => {
  // [G] «Trailing spaces are ignored unless they are quoted with backslash ("\").»
  // Oracolo 10/09/2026: `radice.log   ` => radice.log IGNORATO.
  assert.equal(filtro('radice.log   \n')('radice.log'), false, 'gli spazi non contano');

  const protetto = compilaRegole(['nome\\ ']);
  assert.equal(protetto.quante, 1);
  assert.equal(protetto.tieni('nome '), false, 'lo spazio protetto FA parte del nome');
  assert.equal(protetto.tieni('nome'), true, 'e quindi `nome` senza spazio resta');
});

test('⛔ un TAB non e uno spazio: git taglia solo `" "`, e una riga di solo tab resta un PATTERN', () => {
  // Oracolo `git check-ignore -v` 10/09/2026:
  //   `.gitignore` con una riga di solo tab  => il percorso "\t" risulta IGNORATO
  //   `nome\t` NON matcha `nome`             => i tab finali NON sono tagliati
  //   `nome   ` matcha invece `nome`         => gli spazi finali si'
  const soloTab = compilaRegole(['\t']);
  assert.equal(soloTab.quante, 1, 'e una regola vera, non una riga vuota');
  assert.equal(soloTab.tieni('\t'), false);

  const conTab = compilaRegole(['nome\t']);
  assert.equal(conTab.tieni('nome\t'), false);
  assert.equal(conTab.tieni('nome'), true, 'il tab fa parte del nome, a differenza dello spazio');
});

test('⭐ righe vuote e commenti non producono regole; `\\#` e `\\!` sono nomi letterali', () => {
  const vuote = compilaRegole(['', '   ', '# un commento']);
  assert.equal(vuote.quante, 0);
  assert.equal(vuote.tieni('qualunque/cosa.txt'), true);

  assert.equal(compilaRegole(['\\#speciale']).tieni('#speciale'), false);
  assert.equal(compilaRegole(['\\!importante.txt']).tieni('!importante.txt'), false);
  assert.equal(compilaRegole(['\\!importante.txt']).tieni('importante.txt'), true);
});

test('⛔ un backslash a FINE pattern e invalido e non matcha mai (e non fa saltare la compilazione)', () => {
  // [G] «a backslash at the end of a pattern is an invalid pattern that never matches.»
  const compilate = compilaRegole(['rotto\\', 'buono.txt']);
  assert.equal(compilate.quante, 1, 'la riga rotta e scartata, non fa esplodere il resto');
  assert.equal(compilate.tieni('buono.txt'), false);
  assert.equal(compilate.tieni('rotto'), true);
});

test('⭐ `\\*` e un asterisco LETTERALE, non un jolly', () => {
  const tieni = filtro('nome\\*.txt\n');
  assert.equal(tieni('nome*.txt'), false);
  assert.equal(tieni('nomeALTRO.txt'), true, 'l asterisco scappato non fa da jolly');
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 7. I `.gitignore` annidati
// ─────────────────────────────────────────────────────────────────────────────────────

test('⛔⭐⭐⭐ un `.gitignore` ANNIDATO vale solo da quella cartella IN GIU`', () => {
  // Oracolo 10/09/2026: radice vuota + docs/.gitignore con `*.png`
  //   => docs/immagini/foto.png IGNORATO, a/b/c.log tenuto.
  const { tieni } = componiRegole([
    { righe: [''], base: '' },
    { righe: ['*.png'], base: 'docs' },
  ]);
  assert.equal(tieni('docs/immagini/foto.png'), false, 'dentro docs la regola morde');
  assert.equal(tieni('altrove/foto.png'), true, '⛔ FUORI da docs la stessa regola non esiste');
});

test('⛔⛔⭐⭐⭐ AL CONTRARIO — un annidato PIU PROFONDO batte la radice: `!*.png` in docs ripesca', () => {
  // [G] «patterns in the higher level files being overridden by those in lower level files»
  // Oracolo 10/09/2026: radice `*.png` + docs/.gitignore `!*.png` => foto.png tenuto.
  const { tieni } = componiRegole([
    { righe: ['*.png'], base: '' },
    { righe: ['!*.png'], base: 'docs' },
  ]);
  assert.equal(tieni('docs/immagini/foto.png'), true, 'il file piu profondo vince');
  assert.equal(tieni('altrove/foto.png'), false, 'ma solo dentro docs');
});

test('⛔ e nemmeno un annidato puo ripescare sotto una cartella ESCLUSA dalla radice', () => {
  const { tieni } = componiRegole([
    { righe: ['docs/'], base: '' },
    { righe: ['!immagini/foto.png'], base: 'docs' },
  ]);
  assert.equal(tieni('docs/immagini/foto.png'), false, 'la regola del genitore escluso vale sempre');
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 8. ⛔ Dal disco: quando NON c'e' niente da leggere, non deve sparire niente
// ─────────────────────────────────────────────────────────────────────────────────────

/** Un fs finto in memoria. Le chiavi sono percorsi con `/`; i valori, il testo dei file. */
function fsFinto(albero, { readdirEsplode = null, readFileEsplode = null } = {}) {
  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const cartelle = new Set(['']);
  for (const percorso of Object.keys(albero)) {
    const parti = norm(percorso).split('/');
    for (let i = 1; i < parti.length; i += 1) cartelle.add(parti.slice(0, i).join('/'));
  }
  const chiamate = { readFile: [], readdir: [], stat: [] };
  return {
    chiamate,
    promises: null,
    async stat(percorso) {
      const chiave = norm(percorso);
      chiamate.stat.push(chiave);
      if (cartelle.has(chiave)) return { isDirectory: () => true };
      if (chiave in albero) return { isDirectory: () => false };
      const e = new Error('ENOENT finto'); e.code = 'ENOENT'; throw e;
    },
    async readFile(percorso, _codifica) {
      const chiave = norm(percorso);
      chiamate.readFile.push(chiave);
      if (readFileEsplode && chiave.endsWith(readFileEsplode)) throw new Error('EACCES finto');
      if (!(chiave in albero)) { const e = new Error('ENOENT finto'); e.code = 'ENOENT'; throw e; }
      return albero[chiave];
    },
    async readdir(percorso, _opzioni) {
      const chiave = norm(percorso);
      chiamate.readdir.push(chiave);
      if (readdirEsplode && chiave.endsWith(readdirEsplode)) throw new Error('EPERM finto');
      if (!cartelle.has(chiave)) { const e = new Error('ENOENT finto'); e.code = 'ENOENT'; throw e; }
      const prefisso = chiave === '' ? '' : `${chiave}/`;
      const nomi = new Map();
      for (const c of cartelle) {
        if (c !== '' && c.startsWith(prefisso) && !c.slice(prefisso.length).includes('/')) {
          nomi.set(c.slice(prefisso.length), true);
        }
      }
      for (const f of Object.keys(albero)) {
        const n = norm(f);
        if (n.startsWith(prefisso) && !n.slice(prefisso.length).includes('/')) {
          nomi.set(n.slice(prefisso.length), false);
        }
      }
      return [...nomi].map(([name, dir]) => ({ name, isDirectory: () => dir }));
    },
  };
}

test('⛔⛔⛔⭐⭐⭐ NESSUN file di regole sul disco => il filtro TIENE TUTTO, non nasconde niente', () => {
  const fs = fsFinto({ 'radice/src/uno.mjs': 'x', 'radice/docs/foto.png': 'x' });
  return creaFiltroGitignore({ radice: 'radice', fs }).then((tieni) => {
    assert.equal(tieni('src/uno.mjs'), true);
    assert.equal(tieni('docs/foto.png'), true);
    assert.equal(tieni('qualunque/cosa/mai/vista.txt'), true);
    assert.equal(tieni('.git', true), false, 'l unica esclusione implicita e `.git/`, ed e voluta');
  });
});

test('⛔⛔⛔⭐⭐⭐ un ERRORE DI LETTURA non fa sparire file in silenzio: si tiene tutto', async () => {
  const fs = fsFinto(
    { 'radice/.gitignore': '*.mjs\n', 'radice/src/uno.mjs': 'x' },
    { readFileEsplode: '.gitignore' },
  );
  const tieni = await creaFiltroGitignore({ radice: 'radice', fs });
  assert.equal(tieni('src/uno.mjs'), true, 'la lettura e fallita: la direzione dell errore e TENERE');
  assert.equal(tieni.quante, 1, 'resta solo la regola implicita `.git/`');
});

test('⛔⛔ una CARTELLA illeggibile non nasconde niente: si salta la scoperta, non i file', async () => {
  const fs = fsFinto(
    { 'radice/.gitignore': 'niente-di-vero\n', 'radice/chiusa/dentro.txt': 'x' },
    { readdirEsplode: 'chiusa' },
  );
  const tieni = await creaFiltroGitignore({ radice: 'radice', fs });
  assert.equal(tieni('chiusa/dentro.txt'), true);
});

test('⭐⭐⭐ dal disco: la radice esclude, e un `.gitignore` annidato aggiunge le SUE regole', async () => {
  const fs = fsFinto({
    'radice/.gitignore': 'node_modules/\n*.log\n',
    'radice/src/.gitignore': 'generato/\n',
    'radice/src/vero.mjs': 'x',
    'radice/src/generato/finto.mjs': 'x',
    'radice/src/traccia.log': 'x',
    'radice/node_modules/pacco/index.js': 'x',
    'radice/altro/generato/serve.mjs': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'radice', fs });
  assert.equal(tieni('src/vero.mjs'), true);
  assert.equal(tieni('src/traccia.log'), false);
  assert.equal(tieni('node_modules', true), false);
  assert.equal(tieni('node_modules/pacco/index.js'), false);
  assert.equal(tieni('src/generato/finto.mjs'), false, 'la regola annidata morde dentro src');
  assert.equal(tieni('altro/generato/serve.mjs'), true, '⛔ ma NON fuori da src');
  assert.ok(tieni.fonti.includes(`src/${NOME_FILE_REGOLE}`), 'la fonte annidata e dichiarata');
});

test('⛔⛔⭐⭐ la scoperta POTA: non legge dentro una cartella gia esclusa (e `node_modules` non si apre)', async () => {
  const fs = fsFinto({
    'radice/.gitignore': 'node_modules/\n',
    'radice/node_modules/pacco/.gitignore': '*.mjs\n',
    'radice/src/uno.mjs': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'radice', fs });
  assert.equal(
    fs.chiamate.readdir.some((p) => p.includes('node_modules')),
    false,
    'nessuna readdir dentro node_modules: il costo resta quello dell albero VISIBILE',
  );
  assert.equal(tieni('src/uno.mjs'), true, 'e il `*.mjs` sepolto la dentro non tocca src');
});

test('⭐ `.git/info/exclude` viene letto, e le regole del `.gitignore` lo SOVRASCRIVONO', async () => {
  const fs = fsFinto({
    'radice/.git/info/exclude': 'privato.txt\n',
    'radice/.gitignore': '!privato.txt\n',
    'radice/privato.txt': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'radice', fs });
  assert.equal(tieni('privato.txt'), true, 'il .gitignore ha precedenza piu ALTA di info/exclude');
});

test('⭐ il filtro dichiara quante regole ha e da dove vengono', async () => {
  const fs = fsFinto({ 'radice/.gitignore': '# solo un commento\nuno\ndue\n' });
  const tieni = await creaFiltroGitignore({ radice: 'radice', fs });
  assert.equal(tieni.quante, 3, '`.git/` implicita + due righe vere, il commento non conta');
  assert.deepEqual(tieni.fonti, ['(implicita) .git/', NOME_FILE_REGOLE]);
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 9. ⛔ La RISALITA: partire da una SOTTOCARTELLA del repo
// ─────────────────────────────────────────────────────────────────────────────────────

test('⛔⛔⛔⭐⭐⭐ da una SOTTOCARTELLA si applicano anche i `.gitignore` dei GENITORI', async () => {
  // ⛔ Il difetto misurato il 10/09/2026: creando il filtro da `harness-ui/` si trovavano
  // 7 regole da 2 fonti invece di 132 da 4, e 4.177 file di `.qa-runs` — che git considera
  // ignorati per una regola scritta nel `.gitignore` di RADICE — finivano nell'elenco.
  // [G] «Patterns read from a .gitignore file in the same directory as the path, or in any
  // PARENT DIRECTORY (up to the top-level of the working tree)».
  const fs = fsFinto({
    'repo/.git/HEAD': 'ref: x',
    'repo/.gitignore': 'lavoro/.qa-runs/\n',
    'repo/lavoro/src/vero.mjs': 'x',
    'repo/lavoro/.qa-runs/foto.png': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'repo/lavoro', fs });
  assert.equal(tieni.prefissoLavoro, 'lavoro', 'sa dove si trova rispetto al repo');
  assert.equal(tieni('.qa-runs', true), false, 'la regola del genitore morde anche da qui');
  assert.equal(tieni('.qa-runs/foto.png'), false, '⛔ questo e il file che finiva nell elenco');
  assert.equal(tieni('src/vero.mjs'), true, 'e il resto non si tocca');
});

test('⛔⭐⭐⭐ una regola del genitore vale con la SUA base, non con quella della cartella di lavoro', async () => {
  // `/build` nel `.gitignore` di radice e ancorato ALLA RADICE DEL REPO: da `lavoro/` non
  // deve toccare `lavoro/build`. Se la base fosse riscritta male, lo escluderebbe.
  const fs = fsFinto({
    'repo/.git/HEAD': 'ref: x',
    'repo/.gitignore': '/build\n/lavoro/scarto\n',
    'repo/build/roba.js': 'x',
    'repo/lavoro/build/serve.js': 'x',
    'repo/lavoro/scarto/x.js': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'repo/lavoro', fs });
  assert.equal(tieni.radiceRepo, 'repo', 'la risalita e avvenuta davvero');
  assert.equal(tieni('scarto/x.js'), false, '`/lavoro/scarto` del genitore morde: le regole ci sono');
  assert.equal(tieni('build/serve.js'), true, '⛔ ma `/build` e ancorato alla RADICE, non a lavoro/');
});

test('⭐⭐⭐ precedenza: il `.gitignore` PIU VICINO batte quello del genitore', async () => {
  const fs = fsFinto({
    'repo/.git/HEAD': 'ref: x',
    'repo/.gitignore': '*.png\n*.jpg\n',
    'repo/lavoro/.gitignore': '!*.png\n',
    'repo/lavoro/foto.png': 'x',
    'repo/lavoro/altra.jpg': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'repo/lavoro', fs });
  assert.equal(tieni('altra.jpg'), false, 'il genitore morde: le sue regole sono arrivate qui');
  assert.equal(tieni('foto.png'), true, 'e la negazione LOCALE vince su di lui');
});

test('⛔ un `.git` FILE (worktree) vale quanto una directory, e `info/exclude` si trova via `commondir`', async () => {
  // ⛔ Questa sessione gira in un worktree: `.git` e un FILE con dentro `gitdir: <percorso>`.
  // Trattarne solo la forma-directory avrebbe fatto fallire la risalita IN SILENZIO.
  const fs = fsFinto({
    'repo/.git': 'gitdir: altrove/.git/worktrees/uno\n',
    'altrove/.git/worktrees/uno/commondir': '../..\n',
    'altrove/.git/info/exclude': 'segreto.txt\n',
    'repo/.gitignore': 'niente\n',
    'repo/lavoro/segreto.txt': 'x',
    'repo/lavoro/normale.txt': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'repo/lavoro', fs });
  assert.equal(tieni.radiceRepo, 'repo', 'la risalita ha funzionato col `.git` FILE');
  assert.equal(tieni('segreto.txt'), false, 'e info/exclude del COMMON DIR e stato letto');
  assert.equal(tieni('normale.txt'), true);
});

test('⛔⛔ AL CONTRARIO — nessun `.git` risalendo: ci si FERMA alla radice data, non si sale verso `C:\\`', async () => {
  const fs = fsFinto({
    'fuori/.gitignore': '*.txt\n', // un genitore che NON e un repo: non deve contare
    'fuori/lavoro/uno.txt': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'fuori/lavoro', fs });
  assert.equal(tieni.radiceRepo, null, 'nessun repo trovato');
  assert.equal(tieni.prefissoLavoro, '', 'e quindi nessun prefisso');
  assert.equal(tieni('uno.txt'), true, '⛔ le regole di una cartella qualunque sopra NON si ereditano');
});

test('⛔ il tetto di risalita e DICHIARATO: con `risalitaMassima: 0` non si sale di un livello', async () => {
  const fs = fsFinto({
    'repo/.git/HEAD': 'ref: x',
    'repo/.gitignore': 'lavoro/*.txt\n',
    'repo/lavoro/uno.txt': 'x',
  });
  const conTetto = await creaFiltroGitignore({ radice: 'repo/lavoro', fs, risalitaMassima: 0 });
  assert.equal(conTetto.radiceRepo, null, 'col tetto a zero non si e salito');
  assert.equal(conTetto('uno.txt'), true);

  const senzaTetto = await creaFiltroGitignore({ radice: 'repo/lavoro', fs });
  assert.equal(senzaTetto('uno.txt'), false, 'col tetto normale la regola del genitore morde');
});

test('⛔⛔⭐⭐⭐ L7 — se la CARTELLA DI LAVORO stessa e ignorata, l elenco NON si svuota', async () => {
  // Come ripgrep: `skip_entry` non filtra le voci a depth 0, cioe' i percorsi dati
  // esplicitamente. Il verso opposto e' il difetto aperto di Hermes Agent #45286, dove in
  // un monorepo le cartelle top-level possedute da repo figli spariscono dalla vista.
  const fs = fsFinto({
    'repo/.git/HEAD': 'ref: x',
    'repo/.gitignore': 'vendor/\n*.tmp\n',
    'repo/vendor/pacco/index.js': 'x',
    'repo/vendor/pacco/scarto.tmp': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'repo/vendor', fs });
  assert.equal(tieni('pacco/index.js'), true, '⛔ aprire una cartella ignorata non da un elenco VUOTO');
  assert.equal(tieni('pacco/scarto.tmp'), false, 'ma le altre regole del repo valgono lo stesso');
});

test('⭐ le fonti dichiarate dicono da DOVE arrivano le regole, genitori compresi', async () => {
  const fs = fsFinto({
    'repo/.git/HEAD': 'ref: x',
    'repo/.gitignore': 'uno\n',
    'repo/lavoro/.gitignore': 'due\n',
    'repo/lavoro/dentro/.gitignore': 'tre\n',
    'repo/lavoro/dentro/x.txt': 'x',
  });
  const tieni = await creaFiltroGitignore({ radice: 'repo/lavoro', fs });
  assert.deepEqual(tieni.fonti, [
    '(implicita) .git/',
    '.gitignore',
    'lavoro/.gitignore',
    'lavoro/dentro/.gitignore',
  ], 'in ordine di precedenza crescente, con le basi relative al REPO');
});

// ─────────────────────────────────────────────────────────────────────────────────────
// 10. Robustezza dell'ingresso
// ─────────────────────────────────────────────────────────────────────────────────────

test('⭐ percorsi con backslash Windows, `./` iniziale e slash di troppo sono normalizzati', () => {
  const tieni = filtro('build/\n');
  assert.equal(tieni('build\\out\\x.txt'), false);
  assert.equal(tieni('./build', true), false);
  assert.equal(tieni('/build/', true), false);
  assert.equal(tieni('', true), true, 'la radice non si nasconde mai');
});

test('⭐ le righe CRLF non portano un `\\r` dentro il pattern', () => {
  const { tieni } = compilaRegole('build/\r\n*.log\r\n'.split('\n'));
  assert.equal(tieni('build', true), false);
  assert.equal(tieni('a/b.log'), false);
});
