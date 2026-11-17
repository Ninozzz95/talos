/*
 * Il cricchetto delle taglie «dalla base» (owner 12/11/2026 13:12, «rifarlo come Hermes»): le prove del cancello in un repo finto.
 *
 * Ogni aggiramento (1-7) e ogni falso rosso (8-10) del revisore del 12/11 (RAPPORTO-REVISORE-RECUPERO-P5-2026-11-12.md) è una prova
 * col suo numero, più le quattro famiglie del brief: (a) il ramo che cambia misuratore, regole o elenchi non cambia il proprio
 * verdetto; (b) le forme di carico verso un file non contato; (c) il tetto segue il codice che si ritocca o si sposta; (d) la riga
 * da migliaia di caratteri e le forme che eseguono testo.
 * Il repo finto vive sotto la TEMP di chi lancia (la coda dà quella finta); ogni commit porta la sua identità (giudice v1490).
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const GIUDICE = join(QUI, 'aiuto', 'taglie-base');
const GIUDICE_REL = 'harness-ui/tests/aiuto/taglie-base';
const TS = join(QUI, '..', 'node_modules', 'typescript');
const { giudica } = await import(new URL('./aiuto/taglie-base/confronta.mjs', import.meta.url).href);
const { REGOLE } = await import(new URL('./aiuto/taglie-base/regole.mjs', import.meta.url).href);

const AMB = (() => {
  const e = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_PREFIX', 'NODE_TEST_CONTEXT']) delete e[k];
  return e;
})();
const sostituisci = (testo, da, a) => { assert.equal(testo.split(da).length, 2, `premessa: «${da}» deve esserci una volta sola`); return testo.replace(da, () => a); };
const FILE_DEL_GIUDICE = readdirSync(GIUDICE).filter((f) => f.endsWith('.mjs')).sort();
const giudiceVero = () => Object.fromEntries(FILE_DEL_GIUDICE.map((f) => [f, readFileSync(join(GIUDICE, f), 'utf8')]));
/** Il giudice vero con l'interruttore su «blocca»: nel repo finto il rosso deve uscire 1. */
const giudiceCheBlocca = () => { const g = giudiceVero(); g['regole.mjs'] = sostituisci(g['regole.mjs'], "export const INTERRUTTORE = 'avvisa';", "export const INTERRUTTORE = 'blocca';"); return g; };

const G = 'harness-ui/src/gigante.mjs';
const F = 'harness-ui/src/funzioni.mjs';
const P = 'harness-ui/src/piccolo.mjs';
const gigante = ['// @ts-check', ...Array.from({ length: 2099 }, (_, i) => `export const v${i} = ${i};`)];
const nuove = (k, n, coda = '') => Array.from({ length: n }, (_, i) => `export const nuovo_${k}_${i} = ${i} * 3;${coda}`);
const cjs = (k, n) => Array.from({ length: n }, (_, i) => `exports.m_${k}_${i} = ${i} * 3;`);
const grossa = (nome = 'grossa', n = 400, k = 'g') => [`export function ${nome}(x) {`, '  let s = 0;', ...Array.from({ length: n }, (_, i) => `  s += x * ${i} + passo_${k}(${i});`), '  return s;', '}'];
const funzioni = ['// @ts-check', 'const passo_g = (i) => i + 1;', ...grossa(), 'export function piccola() { return 1; }'];
const piccolo = ['// @ts-check', "import { tabella } from './kernel/dist/uscita.js';", 'export const p = tabella.a;'];

/** Un repo finto con la base già registrata: gigante da 2.100 righe, una funzione da 403 righe proprie, un arco noto verso un escluso. */
function mondo(giudice = giudiceCheBlocca()) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'taglie-base-')));
  const ganci = `${dir}-ganci`;
  mkdirSync(ganci);
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', `core.hooksPath=${ganci}`, '-c', 'user.name=prova', '-c', 'user.email=prova@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { env: AMB, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const scrivi = (rel, righe) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), Array.isArray(righe) ? `${righe.join('\n')}\n` : righe); };
  const scriviGiudice = (g) => { for (const [f, t] of Object.entries(g)) scrivi(`${GIUDICE_REL}/${f}`, t); };
  git('init', '-q');
  scrivi(G, gigante);
  scrivi(F, funzioni);
  scrivi(P, piccolo);
  scrivi('harness-ui/src/kernel/dist/uscita.js', ['export const tabella = {', "  a: 'testo uno',", "  b: 'testo due',", '};']);
  scrivi('harness-ui/src/carica.cjs', ["module.exports = require('./motore');"]);
  scrivi('harness-ui/src/motore.js', ['module.exports = { vero: 1 };']);
  scrivi('harness-ui/scripts/attrezzo.mjs', ['// @ts-check', 'export const a = 1;']);
  scrivi('harness-ui/benchmarks/banco.mjs', ['export const banco = 1;']);
  scrivi('harness-ui/package.json', [JSON.stringify({ name: 'finto', type: 'module', dependencies: { 'dichiarato': '1.0.0' } })]);
  scriviGiudice(giudice);
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD').trim();
  /** Dalla revisione `da`, il ramo fa `prepara` e si registra: torna lo SHA della testa. */
  const ramo = (prepara, da = base) => {
    git('reset', '-q', '--hard', da);
    git('clean', '-fdq');
    prepara();
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'ramo');
    return git('rev-parse', 'HEAD').trim();
  };
  /** Il giudizio in questo processo, col giudice di questa cartella (lo stesso codice che la base del repo finto porta). */
  const giudizio = (prepara, { da = base, proposte } = {}) => giudica({ repo: dir, base: da, testa: ramo(prepara, da), percorsoTypescript: TS, proposte });
  /** Il comando vero: estrae il giudice dalla BASE e lancia quello. */
  const comando = (da, testa, altri = []) => {
    const p = spawnSync(process.execPath, [join(GIUDICE, 'cancello.mjs'), '--repo', dir, '--base', da, '--testa', testa, '--typescript', TS, '--json', ...altri], { env: AMB, encoding: 'utf8', windowsHide: true });
    let json = null;
    try { json = JSON.parse(p.stdout.trim().split('\n').pop()); } catch { /* resta null: lo dice l'asserzione */ }
    return { uscita: p.status, json, stderr: p.stderr };
  };
  /* BC-09 classe A: git e il comando sono tutti sincroni e finiti prima di qui, nessun server né watcher; la cartella dei ganci è vuota */
  const chiudi = () => { rimuoviCartellaDiProva(dir); rimuoviCartellaDiProva(ganci); };
  return { dir, git, scrivi, scriviGiudice, base, ramo, giudizio, comando, chiudi };
}

const classi = (r) => [...new Set(r.violazioni.map((v) => `${v.regola}:${v.classe}`))].sort();
const trova = (r, regola, classe, dove = null) => r.violazioni.filter((v) => v.regola === regola && v.classe === classe && (!dove || dove.test(`${v.file} ${v.testo}`)));
const deveAvere = (r, regola, classe, dove = null) => { const t = trova(r, regola, classe, dove); assert.ok(t.length > 0, `manca ${regola}:${classe}${dove ? ` ${dove}` : ''}; avute: ${JSON.stringify(r.violazioni)}`); return t; };
const verde = (r) => assert.deepEqual(r.violazioni, [], 'doveva essere verde');

describe('cricchetto delle taglie dalla base: il cancello nel repo finto', () => {
  /** @type {ReturnType<typeof mondo>} */
  let M;
  before(() => { M = mondo(); });
  after(() => M.chiudi());

  test('TAGLIE-BASE-00 controlli: nessun cambio è verde; il gigante che cresce di 50 righe è rosso per 50', () => {
    verde(M.giudizio(() => {}));
    const r = M.giudizio(() => M.scrivi(G, [...gigante, ...nuove('c', 50)]));
    assert.equal(deveAvere(r, 'a', 'file-cresciuto', /gigante\.mjs/u)[0].oltre, 50);
    assert.equal(deveAvere(r, 'a', 'file-caratteri')[0].file, G);
  });

  test('TAGLIE-BASE-01 (revisore 1, G3 e G3b): il gigante esce INTERO con ogni riga ritoccata e resta un rimando', () => {
    for (const [nome, ritocca] of [['un « //» in fondo', (r) => `${r} //`], ['uno spazio doppio', (r) => r.replace(' = ', '  =  ')]]) {
      /* verso un posto che il conto non vede: l'arco nuovo è rosso, senza cercare righe uguali */
      const fuori = M.giudizio(() => { M.scrivi('harness-ui/benchmarks/gigante.mjs', gigante.slice(1).map(ritocca)); M.scrivi(G, ['// @ts-check', "export * from '../benchmarks/gigante.mjs';"]); });
      deveAvere(fuori, '4', 'arco', /benchmarks\/gigante\.mjs/u);
      /* verso `harness-ui/scripts`, che ora è contato: il tetto segue il corpo (2.100 sulla base) e lì non cresce */
      const dentro = M.giudizio(() => { M.scrivi('harness-ui/scripts/gigante.mjs', ['// @ts-check', ...gigante.slice(1).map(ritocca)]); M.scrivi(G, ['// @ts-check', "export * from '../scripts/gigante.mjs';"]); });
      verde(dentro);
      const cresce = M.giudizio(() => { M.scrivi('harness-ui/scripts/gigante.mjs', ['// @ts-check', ...gigante.slice(1).map(ritocca), ...nuove('x', 60)]); M.scrivi(G, ['// @ts-check', "export * from '../scripts/gigante.mjs';"]); });
      const v = deveAvere(cresce, 'a', 'file-cresciuto', /scripts\/gigante\.mjs/u)[0];
      assert.equal(v.oltre, 60, nome);
      assert.match(v.testo, /il corpo viene da harness-ui\/src\/gigante\.mjs/u);
    }
  });

  test('TAGLIE-BASE-02 (revisore 2, N4): il travestito dietro «<!--» in .html .css .md .svg .sql, caricato con createRequire', () => {
    for (const ext of ['html', 'css', 'md', 'svg', 'sql']) {
      const r = M.giudizio(() => {
        M.scrivi(`harness-ui/src/motore.${ext}`, ['<!-- motore travestito', ...cjs(ext, 3000)]);
        M.scrivi('harness-ui/src/usa-motore.mjs', ['// @ts-check', "import { createRequire } from 'node:module';", `export const tutto = createRequire(import.meta.url)('./motore.${ext}');`]);
      });
      deveAvere(r, '4', 'arco', new RegExp(`motore\\.${ext}`, 'u'));
      deveAvere(r, '5', 'carico', /createRequire/u);
    }
  });

  test('TAGLIE-BASE-03 (revisore 3, G1): 3.000 istruzioni nuove su UNA riga del gigante, righe uguali', () => {
    const r = M.giudizio(() => M.scrivi(G, [...gigante.slice(0, 2099), `${gigante[2099]} ${nuove('lunga', 3000).join(' ')}`]));
    assert.equal(trova(r, 'a', 'file-cresciuto').length, 0, 'le righe non cambiano');
    const v = deveAvere(r, 'a', 'file-caratteri', /gigante\.mjs/u)[0];
    assert.ok(v.oltre > 90000, `oltre di ${v.oltre} caratteri`);
  });

  test('TAGLIE-BASE-04 (revisore 4, G2): lo scambio sotto soglia, 790 righe vecchie fuori e 790 nuove dentro', () => {
    const scambia = (dove, testa, entrano = nuove('scambio', 789)) => () => {
      M.scrivi(dove, [...testa, ...gigante.slice(1, 791)]);
      M.scrivi(G, ['// @ts-check', `export * from '${dove.replace('harness-ui/', '../')}';`, ...entrano, ...gigante.slice(791)]);
    };
    /* verso un posto non contato: arco nuovo */
    deveAvere(M.giudizio(scambia('harness-ui/benchmarks/pezzo-vecchio.mjs', [])), '4', 'arco', /pezzo-vecchio/u);
    /* verso un file contato senza tipi: il file nuovo non passa (b) */
    deveAvere(M.giudizio(scambia('harness-ui/scripts/pezzo-vecchio.mjs', [])), 'b', 'file-nuovo-senza-tipi', /pezzo-vecchio/u);
    /* verso un modulo contato e tipato, ma le 790 righe che entrano sono più lunghe di quelle uscite: il gigante ingrassa in caratteri */
    deveAvere(M.giudizio(scambia('harness-ui/scripts/pezzo-vecchio.mjs', ['// @ts-check'])), 'a', 'file-caratteri', /gigante\.mjs/u);
    /* verso un modulo nuovo, contato e tipato sotto il bersaglio, senza ingrassare né in righe né in caratteri: è il conto di discesa
       della proposta (c) e torna pari (tanto esce, tanto entra): questo è lavoro lecito, non un aggiramento */
    verde(M.giudizio(scambia('harness-ui/scripts/pezzo-vecchio.mjs', ['// @ts-check'], Array.from({ length: 787 }, (_, i) => `export const w${i}=${i};`))));
  });

  test('TAGLIE-BASE-05 (revisore 5, N1-N3): 5.000 righe nuove dove il conto non guarda, importate dal gigante con una riga', () => {
    for (const dove of ['harness-ui/benchmarks/motore-nuovo.mjs', 'harness-ui/src/kernel/dist/motore-nuovo.mjs', 'harness-ui/src/motore.test.mjs']) {
      const r = M.giudizio(() => { M.scrivi(dove, nuove('fuori', 5000)); M.scrivi(G, [...gigante.slice(0, 2099), `export * from '${dove.replace('harness-ui/src/', './').replace('harness-ui/', '../')}';`]); });
      deveAvere(r, '4', 'arco', new RegExp(dove.split('/').pop().replace(/\./gu, '\\.'), 'u'));
    }
    /* `harness-ui/scripts` (dove il revisore le aveva messe) ora è contato: è un file nuovo oltre il bersaglio */
    const r = M.giudizio(() => { M.scrivi('harness-ui/scripts/motore-nuovo.mjs', ['// @ts-check', ...nuove('fuori', 5000)]); M.scrivi(G, [...gigante.slice(0, 2099), "export * from '../scripts/motore-nuovo.mjs';"]); });
    assert.equal(deveAvere(r, 'b', 'file-nuovo-lungo', /motore-nuovo/u)[0].oltre, 5001 - 800);
  });

  test('TAGLIE-BASE-06 (revisore 6, K1 e K5; brief a): il ramo cambia il CODICE del misuratore e il gigante passa a 7.100 righe', () => {
    const g = giudiceCheBlocca();
    const cambi = {
      'K5 contaRighe non conta le righe che finiscono con «// g»': () => { g['misura.mjs'] = sostituisci(giudiceVero()['misura.mjs'], '  const n = (testo.match(A_CAPO_G)?.length ?? 0) + 1;', '  const n = (testo.match(A_CAPO_G)?.length ?? 0) + 1 - (testo.match(/\\/\\/ g$/gmu)?.length ?? 0);'); },
      'K1 èContato salta il gigante': () => { g['misura.mjs'] = sostituisci(giudiceVero()['misura.mjs'], '  if (R.ESCLUSE.some((p) => rel.startsWith(p))) return false;', "  if (R.ESCLUSE.some((p) => rel.startsWith(p)) || rel.includes('gigante')) return false;"); },
      'giudica non trova mai niente': () => { g['misura.mjs'] = giudiceVero()['misura.mjs']; g['confronta.mjs'] = sostituisci(giudiceVero()['confronta.mjs'], '  const viola = (regola, classe, file, testo, oltre) => violazioni.push(', '  const viola = (regola, classe, file, testo, oltre) => [].push('); },
    };
    for (const [nome, cambia] of Object.entries(cambi)) {
      cambia();
      const testa = M.ramo(() => { M.scriviGiudice(g); M.scrivi(G, [...gigante, ...nuove('g', 5000, ' // g')]); });
      const c = M.comando(M.base, testa);
      assert.equal(c.uscita, 1, `${nome}: il giudice della base deve dare rosso; ${c.stderr}`);
      assert.equal(c.json.esito, 'rosso');
      assert.equal(c.json.giudice, 'della base');
      assert.equal(deveAvere(c.json, 'a', 'file-cresciuto', /gigante\.mjs/u)[0].oltre, 5000, nome);
      deveAvere(c.json, '1', 'cancello', /taglie-base/u);
    }
  });

  test('TAGLIE-BASE-06b (brief a): il ramo spegne l\'interruttore, allarga i bersagli o esclude il gigante dagli elenchi: stesso verdetto', () => {
    const cambi = {
      'interruttore spento': (t) => sostituisci(t, "export const INTERRUTTORE = 'blocca';", "export const INTERRUTTORE = 'spento';"),
      'interruttore su avvisa': (t) => sostituisci(t, "export const INTERRUTTORE = 'blocca';", "export const INTERRUTTORE = 'avvisa';"),
      'bersagli allargati': (t) => sostituisci(t, 'fileNuovo: 800, fileEsistente: 2000, funzione: 300', 'fileNuovo: 80000, fileEsistente: 200000, funzione: 30000'),
      'gigante fra le escluse': (t) => sostituisci(t, "  'harness-ui/src/kernel/dist/',\n", "  'harness-ui/src/kernel/dist/',\n  'harness-ui/src/gigante.mjs',\n"),
      'src fuori dalle cartelle': (t) => sostituisci(t, "  { dir: 'harness-ui/src', ricorsiva: true },\n", ''),
      'il cancello non è più del cancello': (t) => sostituisci(t, "export const FILE_DEL_CANCELLO = Object.freeze(['harness-ui/tests/aiuto/taglie-base/', 'harness-ui/tests/taglie-base-']);", 'export const FILE_DEL_CANCELLO = Object.freeze([]);'),
    };
    for (const [nome, cambia] of Object.entries(cambi)) {
      const g = giudiceCheBlocca();
      g['regole.mjs'] = cambia(g['regole.mjs']);
      const testa = M.ramo(() => { M.scriviGiudice(g); M.scrivi(G, [...gigante, ...nuove('g', 50)]); });
      const c = M.comando(M.base, testa);
      assert.equal(c.uscita, 1, `${nome}: ${c.stderr}`);
      assert.equal(deveAvere(c.json, 'a', 'file-cresciuto', /gigante\.mjs/u)[0].oltre, 50, nome);
      deveAvere(c.json, '1', 'cancello');
    }
  });

  test('TAGLIE-BASE-07 (revisore 7, R2 e R3): due passi con un elenco; il passo 1 è segnato, il passo 2 è un arco', () => {
    const conGen = giudiceCheBlocca();
    conGen['regole.mjs'] = sostituisci(conGen['regole.mjs'], 'export const NON_PRODOTTO = /\\.test\\.[mc]?[jt]sx?$|\\.d\\.[mc]?ts$/u;', 'export const NON_PRODOTTO = /\\.test\\.[mc]?[jt]sx?$|\\.d\\.[mc]?ts$|\\.gen\\.mjs$/u;');
    const passo1 = M.ramo(() => M.scriviGiudice(conGen));
    const c1 = M.comando(M.base, passo1);
    assert.equal(c1.uscita, 1, 'il passo 1 tocca il cancello: non passa in silenzio');
    assert.deepEqual(classi(c1.json), ['1:cancello']);
    /* anche se il passo 1 entrasse con la sua eccezione, il passo 2 è giudicato dalle regole del passo 1 ed è rosso lo stesso */
    const passo2 = M.ramo(() => { M.scrivi('harness-ui/src/motore.gen.mjs', nuove('gen', 10000)); M.scrivi(G, [...gigante.slice(0, 2099), "export * from './motore.gen.mjs';"]); }, passo1);
    const c2 = M.comando(passo1, passo2);
    assert.equal(c2.uscita, 1);
    deveAvere(c2.json, '4', 'arco', /motore\.gen\.mjs/u);
    /* R3: un file senza estensione, CommonJS, caricato con createRequire */
    const r3 = M.giudizio(() => {
      M.scrivi('harness-ui/src/motore', cjs('se', 10000));
      M.scrivi('harness-ui/src/usa-motore.mjs', ['// @ts-check', "import { createRequire } from 'node:module';", "const r = createRequire(import.meta.url);", "export const tutto = r('./motore');"]);
    });
    deveAvere(r3, '4', 'arco', /harness-ui\/src\/motore$/u);
  });

  test('TAGLIE-BASE-08 (revisore 8): il cancello consegnato AVVISA e non ferma; lo stesso ramo con «blocca» sulla base è rosso', () => {
    assert.equal(REGOLE.INTERRUTTORE, 'avvisa', 'il cancello si consegna in avviso (forma, regola 6)');
    const A = mondo(giudiceVero());
    try {
      const testa = A.ramo(() => A.scrivi(G, [...gigante, ...nuove('g', 50)]));
      const c = A.comando(A.base, testa);
      assert.equal(c.uscita, 0, `in avviso si passa: ${c.stderr}`);
      assert.equal(c.json.esito, 'avviso');
      assert.equal(c.json.interruttore, 'avvisa');
      deveAvere(c.json, 'a', 'file-cresciuto');
      const pulito = A.comando(A.base, A.ramo(() => A.scrivi(P, [...piccolo, 'export const q = 2;'])));
      assert.equal(pulito.json.esito, 'verde');
    } finally { A.chiudi(); }
    const spento = giudiceVero();
    spento['regole.mjs'] = sostituisci(spento['regole.mjs'], "export const INTERRUTTORE = 'avvisa';", "export const INTERRUTTORE = 'spento';");
    const S = mondo(spento);
    try {
      const c = S.comando(S.base, S.ramo(() => S.scrivi(G, [...gigante, ...nuove('g', 50)])));
      assert.equal(c.uscita, 0);
      assert.equal(c.json.esito, 'spento');
    } finally { S.chiudi(); }
    const c = M.comando(M.base, M.ramo(() => M.scrivi(G, [...gigante, ...nuove('g', 50)])));
    assert.equal(c.uscita, 1);
    assert.equal(c.json.esito, 'rosso');
  });

  test('TAGLIE-BASE-09 (revisore 9): nessun file del debito; dopo un\'unione che ha ingrassato il gigante il ramo onesto è verde', () => {
    assert.deepEqual(FILE_DEL_GIUDICE, ['cancello.mjs', 'confronta.mjs', 'misura.mjs', 'regole.mjs', 'rigiocata.mjs'], 'nel cancello solo codice: nessun file di dati col debito');
    for (const f of FILE_DEL_GIUDICE) assert.doesNotMatch(readFileSync(join(GIUDICE, f), 'utf8'), /readFileSync\([^)]*debito|--abbassa/u, f);
    /* un'unione entra col gigante a 2.150 righe (in avviso, o con un'eccezione): la base nuova È il tetto nuovo, senza riscrivere niente */
    const ingrassata = M.ramo(() => M.scrivi(G, [...gigante, ...nuove('g', 50)]));
    verde(M.giudizio(() => M.scrivi(P, [...piccolo, 'export const q = 2;']), { da: ingrassata }));
    verde(M.giudizio(() => {}, { da: ingrassata }));
    assert.equal(deveAvere(M.giudizio(() => M.scrivi(G, [...gigante, ...nuove('g', 51)]), { da: ingrassata }), 'a', 'file-cresciuto')[0].oltre, 1);
    /* e chi scende abbassa il tetto di chi viene dopo: può solo scendere */
    const scesa = M.ramo(() => M.scrivi(G, gigante.slice(0, 2050)));
    assert.equal(deveAvere(M.giudizio(() => M.scrivi(G, gigante.slice(0, 2060)), { da: scesa }), 'a', 'file-cresciuto')[0].oltre, 10);
  });

  test('TAGLIE-BASE-10 (revisore 10): la base si dà sempre per nome; nessun ramo scritto nel codice, nessuna variabile d\'ambiente', () => {
    for (const f of FILE_DEL_GIUDICE.filter((x) => x !== 'rigiocata.mjs')) assert.doesNotMatch(readFileSync(join(GIUDICE, f), 'utf8'), /TAGLIE_BASE|TAGLIE_CANDIDATA|prepara\/candidata|candidata-sera/u, f);
    const p = spawnSync(process.execPath, [join(GIUDICE, 'cancello.mjs'), '--repo', M.dir, '--json'], { env: AMB, encoding: 'utf8', windowsHide: true });
    assert.equal(p.status, 2);
    assert.match(p.stderr, /manca --base/u);
    /* il ramo contro se stesso (zero codice cambiato) è verde anche col comando vero */
    const c = M.comando(M.base, M.base);
    assert.equal(c.uscita, 0, c.stderr);
    assert.equal(c.json.esito, 'verde');
    const mai = spawnSync(process.execPath, [join(GIUDICE, 'cancello.mjs'), '--repo', M.dir, '--base', 'non-esiste', '--json'], { env: AMB, encoding: 'utf8', windowsHide: true });
    assert.equal(mai.status, 2, 'una base che non c\'è è un errore, mai un verde');
  });

  test('TAGLIE-BASE-11 (brief b): ogni forma di carico verso un file non contato è un arco o un percorso nuovo', () => {
    const N = 'harness-ui/benchmarks/nascosto.mjs';
    const forme = {
      'import statico': ["import '../benchmarks/nascosto.mjs';"],
      'export da': ["export * from '../benchmarks/nascosto.mjs';"],
      'import() col percorso scritto': ["export const m = await import('../benchmarks/nascosto.mjs');"],
      'require': ["export const m = require('../benchmarks/nascosto.mjs');"],
      'createRequire chiamato subito': ["import { createRequire } from 'node:module';", "export const m = createRequire(import.meta.url)('../benchmarks/nascosto.mjs');"],
      'createRequire sotto un altro nome': ["import { createRequire as cr } from 'node:module';", 'const chiedi = cr(import.meta.url);', "export const m = chiedi('../benchmarks/nascosto.mjs');"],
      'process.getBuiltinModule': ["const chiedi = process.getBuiltinModule('module').createRequire(import.meta.url);", "export const m = chiedi('../benchmarks/nascosto.mjs');"],
      'module.register': ["import { register } from 'node:module';", "register('../benchmarks/nascosto.mjs', import.meta.url);"],
      'new Worker': ["import { Worker } from 'node:worker_threads';", "export const w = new Worker(new URL('../benchmarks/nascosto.mjs', import.meta.url));"],
      'fork': ["import { fork } from 'node:child_process';", "export const f = fork('../benchmarks/nascosto.mjs');"],
      'spawn(process.execPath, …) dalla radice': ["import { spawn } from 'node:child_process';", "export const f = spawn(process.execPath, ['harness-ui/benchmarks/nascosto.mjs']);"],
      'new URL fuori da ogni forma': ["export const dove = new URL('../benchmarks/nascosto.mjs', import.meta.url);"],
    };
    for (const [nome, righe] of Object.entries(forme)) {
      const r = M.giudizio(() => { M.scrivi(N, nuove('n', 3000)); M.scrivi(P, [...piccolo, ...righe]); });
      const archi = r.violazioni.filter((v) => v.regola === '4' && (v.classe === 'arco' || v.classe === 'percorso') && /benchmarks\/nascosto\.mjs/u.test(v.testo));
      assert.ok(archi.length > 0, `${nome}: nessun arco; avute ${JSON.stringify(r.violazioni)}`);
    }
    /* il percorso NON scritto (calcolato): non c'è un arco da vedere, ma il conto delle forme di carico cresce (regola 5) */
    for (const [nome, righe, tipo] of [
      ['import() calcolato', ["export const m = await import(['..', 'benchmarks', 'nascosto.mjs'].join('/'));"], /import-calcolato/u],
      ['require calcolato', ["export const m = require(process.env.DOVE);"], /require-calcolato/u],
      ['require sotto un altro nome', ['const r = require;', 'export const m = r(process.env.DOVE);'], /require-riferimento/u],
    ]) deveAvere(M.giudizio(() => { M.scrivi(N, nuove('n', 3000)); M.scrivi(P, [...piccolo, ...righe]); }), '5', 'carico', tipo);
    /* l'arco che c'era già sulla base non è nuovo, e nemmeno un file contato importato in più */
    verde(M.giudizio(() => M.scrivi(P, [...piccolo, "import { a } from '../scripts/attrezzo.mjs';", 'export const q = a;'])));
    verde(M.giudizio(() => M.scrivi(P, [...piccolo, "import { banco } from 'dichiarato';", "import fs from 'node:fs';", 'export const q = [banco, fs];'])));
    /* un pacchetto che la base non dichiara, anche se il ramo lo aggiunge al package.json */
    const r = M.giudizio(() => {
      M.scrivi('harness-ui/package.json', [JSON.stringify({ name: 'finto', type: 'module', dependencies: { 'dichiarato': '1.0.0', 'mai-visto': 'file:../benchmarks' } })]);
      M.scrivi(P, [...piccolo, "import x from 'mai-visto';", 'export const q = x;']);
    });
    deveAvere(r, '4', 'pacchetto', /mai-visto/u);
    /* il pacchetto che importa se stesso per nome arriva a un file non contato */
    deveAvere(M.giudizio(() => M.scrivi(P, [...piccolo, "import { banco } from 'finto/benchmarks/banco.mjs';", 'export const q = banco;'])), '4', 'arco', /benchmarks\/banco\.mjs/u);
  });

  test('TAGLIE-BASE-12 (brief b): un file non contato NUOVO che dirotta un `require` di un file non toccato', () => {
    /* `require('./motore')` sulla base arriva a motore.js (contato); con un file `motore` senza estensione Node carica quello */
    const r = M.giudizio(() => M.scrivi('harness-ui/src/motore', cjs('dirottato', 10000)));
    deveAvere(r, '4', 'percorso', /harness-ui\/src\/motore\b.*non ha toccato|carica\.cjs/u);
    /* un file non contato nuovo che nessuno raggiunge (una prova, una fixture) non è niente */
    verde(M.giudizio(() => { M.scrivi('harness-ui/tests/nuova.test.mjs', nuove('t', 3000)); writeFileSync(join(M.dir, 'harness-ui/tests/fixture.bin'), Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256))); }));
  });

  test('TAGLIE-BASE-13 (brief b): il file non contato già raggiunto da un arco non ingrassa di codice; di testo sì', () => {
    const U = 'harness-ui/src/kernel/dist/uscita.js';
    verde(M.giudizio(() => M.scrivi(U, ['export const tabella = {', "  a: 'testo uno',", "  b: 'testo due',", ...Array.from({ length: 500 }, (_, i) => `  c${i}: 'testo nuovo ${i}',`), '};'])));
    const r = M.giudizio(() => M.scrivi(U, ['export const tabella = {', "  a: 'testo uno',", "  b: 'testo due',", '};', ...nuove('codice', 500).map((x) => x.replace('export const', 'tabella.x = () =>'))]));
    deveAvere(r, '4', 'raggiunto', /uscita\.js/u);
  });

  test('TAGLIE-BASE-14 (brief c): ritocco a ogni riga, spazi, commento in coda: il tetto della funzione la segue', () => {
    const ritoccata = (extra = 0) => ['// @ts-check', 'const passo_g = (i) => i + 1;', ...grossa('grossa', 400 + extra).map((r) => `${r.replace(' += ', '  +=  ')} // ritocco`), 'export function piccola() { return 1; }'];
    verde(M.giudizio(() => M.scrivi(F, ritoccata())));
    const r = M.giudizio(() => M.scrivi(F, ritoccata(30)));
    const v = deveAvere(r, 'b', 'funzione-cresciuta', /grossa/u)[0];
    assert.equal(v.oltre, 30);
    assert.match(v.testo, /tetto 404 \(la sua misura sulla base\)/u);
    /* rinominata sul posto con lo stesso corpo: è lei */
    verde(M.giudizio(() => M.scrivi(F, ['// @ts-check', 'const passo_g = (i) => i + 1;', ...grossa('rinominata'), 'export function piccola() { return 1; }'])));
    /* una funzione NUOVA oltre il bersaglio accanto alla vecchia intatta */
    const n = M.giudizio(() => M.scrivi(F, [...funzioni, 'const passo_n = (i) => i + 2;', ...grossa('altra', 350, 'n')]));
    assert.equal(deveAvere(n, 'b', 'funzione-nuova', /altra/u)[0].oltre, 354 - 300);
    assert.equal(trova(n, 'b', 'funzione-cresciuta').length, 0);
  });

  test('TAGLIE-BASE-15 (brief c): la funzione spostata in un altro file tiene il tetto; la copia no', () => {
    const senza = ['// @ts-check', 'export function piccola() { return 1; }'];
    const altrove = (extra = 0, ritocca = (r) => r) => ['// @ts-check', 'const passo_g = (i) => i + 1;', ...grossa('grossa', 400 + extra).map(ritocca), 'export const p = 1;'];
    /* spostata intatta, e spostata con ogni riga ritoccata */
    verde(M.giudizio(() => { M.scrivi(F, senza); M.scrivi('harness-ui/src/altrove.mjs', altrove()); }));
    verde(M.giudizio(() => { M.scrivi(F, senza); M.scrivi('harness-ui/src/altrove.mjs', altrove(0, (r) => `${r} // spostata`)); }));
    /* spostata e cresciuta di 25 righe: il tetto è quello che aveva sulla base nel file di prima */
    const r = M.giudizio(() => { M.scrivi(F, senza); M.scrivi('harness-ui/src/altrove.mjs', altrove(25)); });
    const v = deveAvere(r, 'b', 'funzione-cresciuta', /grossa/u)[0];
    assert.equal(v.oltre, 25);
    assert.match(v.testo, /viene da harness-ui\/src\/funzioni\.mjs/u);
    /* copiata (l'origine resta): la copia è una funzione nuova oltre il bersaglio */
    const c = M.giudizio(() => M.scrivi('harness-ui/src/altrove.mjs', altrove()));
    assert.equal(deveAvere(c, 'b', 'funzione-nuova', /altrove\.mjs.*grossa|grossa/u)[0].file, 'harness-ui/src/altrove.mjs');
  });

  test('TAGLIE-BASE-16 (brief d): la riga da migliaia di caratteri in un file nuovo e in una funzione; eval, new Function, vm in più', () => {
    const lunga = `export const x = [${Array.from({ length: 40000 }, (_, i) => i).join(', ')}];`;
    deveAvere(M.giudizio(() => M.scrivi('harness-ui/src/nuovo-lungo.mjs', ['// @ts-check', lunga])), 'b', 'file-nuovo-caratteri', /nuovo-lungo/u);
    /* dentro la funzione già oltre il bersaglio: le righe sono le stesse, i caratteri no */
    const f = [...funzioni];
    f[4] = `${f[4]} ${Array.from({ length: 3000 }, (_, i) => `s += ${i};`).join(' ')}`;
    const r = M.giudizio(() => M.scrivi(F, f));
    assert.equal(trova(r, 'b', 'funzione-cresciuta').length, 0);
    deveAvere(r, 'b', 'funzione-caratteri', /grossa/u);
    for (const [nome, righe, tipo] of [
      ['eval', ["export const e = eval('1 + 1');"], /\(eval/u],
      ['eval indiretto', ["export const e = (0, eval)('1 + 1');"], /\(eval/u],
      ['new Function', ["export const f = new Function('return 1');"], /\(Function/u],
      ['Function senza new', ["export const f = Function('return 1');"], /\(Function/u],
      ['il costruttore di una funzione', ["export const f = (() => {}).constructor('return 1');"], /constructor\(\)/u],
      ['globalThis["eval"]', ["export const e = globalThis['eval']('1');"], /accesso-per-nome/u],
      ['vm.runInThisContext', ["import vm from 'node:vm';", "export const v = vm.runInThisContext('1');"], /modulo.*vm/u],
      ['vm sotto un altro nome', ["import { runInThisContext as gira } from 'vm';", "export const v = gira('1');"], /modulo.*vm/u],
    ]) deveAvere(M.giudizio(() => M.scrivi(P, [...piccolo, ...righe])), '5', 'carico', tipo);
    /* una forma che c'era già e si sposta da un file all'altro non è «in più» */
    const conEval = M.ramo(() => M.scrivi(P, [...piccolo, "export const e = eval('1 + 1');"]));
    verde(M.giudizio(() => { M.scrivi(P, piccolo); M.scrivi('harness-ui/scripts/attrezzo.mjs', ['// @ts-check', 'export const a = 1;', "export const e = eval('1 + 1');"]); }, { da: conEval }));
    deveAvere(M.giudizio(() => M.scrivi(P, [...piccolo, "export const e = eval('1 + 1');", "export const e2 = eval('2 + 2');"]), { da: conEval }), '5', 'carico', /eval/u);
  });

  test('TAGLIE-BASE-17 lavoro onesto verde: il gigante si divide in moduli nuovi tipati sotto il bersaglio', () => {
    verde(M.giudizio(() => { M.scrivi('harness-ui/src/parte.mjs', ['// @ts-check', ...gigante.slice(1, 701)]); M.scrivi(G, ['// @ts-check', "export * from './parte.mjs';", ...gigante.slice(701)]); }));
    verde(M.giudizio(() => {
      for (let k = 0; k < 3; k += 1) M.scrivi(`harness-ui/src/parte-${k}.mjs`, ['// @ts-check', ...gigante.slice(1 + 700 * k, 701 + 700 * k)]);
      M.scrivi(G, ['// @ts-check', "export * from './parte-0.mjs';", "export * from './parte-1.mjs';", "export * from './parte-2.mjs';"]);
    }));
    /* 800 righe esatte sì, 801 no */
    const r = M.giudizio(() => { M.scrivi('harness-ui/src/ottocento.mjs', ['// @ts-check', ...nuove('a', 799)]); M.scrivi('harness-ui/src/ottocentouno.mjs', ['// @ts-check', ...nuove('b', 800)]); });
    assert.deepEqual(r.violazioni.map((v) => `${v.classe} ${v.file} ${v.oltre}`), ['file-nuovo-lungo harness-ui/src/ottocentouno.mjs 1']);
  });

  test('TAGLIE-BASE-18 le tre proposte: (a) da sola non guarda funzioni e file nuovi; (c) conta ogni riga nuova in un gigante', () => {
    const lavoro = () => { M.scrivi(F, ['// @ts-check', 'const passo_g = (i) => i + 1;', ...grossa('grossa', 410), 'export function piccola() { return 1; }']); M.scrivi('harness-ui/src/senza-tipi.mjs', nuove('s', 900)); };
    assert.deepEqual(classi(M.giudizio(lavoro, { proposte: ['a'] })), []);
    assert.deepEqual(classi(M.giudizio(lavoro, { proposte: ['a', 'b'] })), ['b:file-nuovo-lungo', 'b:file-nuovo-senza-tipi', 'b:funzione-caratteri', 'b:funzione-cresciuta']);
    /* il conto di discesa: un gigante vero (oltre `gigante` righe) cambia 40 righe senza crescere né in righe né in caratteri */
    const enorme = ['// @ts-check', ...Array.from({ length: REGOLE.BERSAGLI.gigante + 50 }, (_, i) => `export const e${i} = ${i};`)];
    const conEnorme = M.ramo(() => M.scrivi('harness-ui/src/enorme.mjs', enorme));
    const altra = (r) => r.replace('export const e', 'export const f');
    const cambia = () => M.scrivi('harness-ui/src/enorme.mjs', enorme.map((r, i) => (i > 0 && i <= 40 ? altra(r) : r)));
    verde(M.giudizio(cambia, { da: conEnorme, proposte: ['a', 'b'] }));
    const c = M.giudizio(cambia, { da: conEnorme, proposte: ['a', 'b', 'c'] });
    assert.equal(deveAvere(c, 'c', 'discesa', /enorme\.mjs/u)[0].oltre, 40);
    assert.deepEqual(c.discesa, [{ file: 'harness-ui/src/enorme.mjs', aggiunte: 40, uscite: 0 }]);
    /* 40 righe nuove (39 cambiate più il rimando), e 40 vecchie portate in un modulo nuovo e tipato: il conto torna */
    const esce = M.giudizio(() => {
      M.scrivi('harness-ui/src/uscite.mjs', ['// @ts-check', ...enorme.slice(41, 81)]);
      M.scrivi('harness-ui/src/enorme.mjs', enorme.filter((_, i) => i < 41 || i > 80).map((r, i) => (i > 0 && i <= 39 ? altra(r) : r)).concat(["export * from './uscite.mjs';"]));
    }, { da: conEnorme, proposte: ['a', 'b', 'c'] });
    verde(esce);
    assert.deepEqual(esce.discesa, [{ file: 'harness-ui/src/enorme.mjs', aggiunte: 40, uscite: 40 }]);
    /* le righe portate in un modulo SENZA tipi non scontano niente */
    const senzaTipi = M.giudizio(() => {
      M.scrivi('harness-ui/src/uscite.mjs', enorme.slice(41, 81));
      M.scrivi('harness-ui/src/enorme.mjs', enorme.filter((_, i) => i < 41 || i > 80).map((r, i) => (i > 0 && i <= 39 ? altra(r) : r)).concat(["export * from './uscite.mjs';"]));
    }, { da: conEnorme, proposte: ['a', 'b', 'c'] });
    assert.equal(deveAvere(senzaTipi, 'c', 'discesa')[0].oltre, 40);
  });

  test('TAGLIE-BASE-19 le tre app: `mobile/src` (anche .vue) e `cli/src` sono contati; alias `@/`', () => {
    const r = M.giudizio(() => {
      M.scrivi('mobile/src/Schermo.vue', ['<template><div>ciao</div></template>', '<script setup lang="ts">', ...grossa('lunga', 320, 'v').map((x) => x.replace('export function', 'function')), 'const passo_v = (i: number) => i;', '</script>', ...Array.from({ length: 600 }, () => '<!-- riga -->')]);
      M.scrivi('cli/src/comando.mjs', nuove('cli', 900));
      M.scrivi('mobile/package.json', ['{"name":"telefono"}']);
      M.scrivi('mobile/src/lib/a.ts', ["import { b } from '@/lib/b';", "import fuori from '@/../scripts/fuori.mjs';", 'export const a = [b, fuori];']);
      M.scrivi('mobile/src/lib/b.ts', ['export const b = 1;']);
      M.scrivi('mobile/scripts/fuori.mjs', ['export default 1;']);
    });
    deveAvere(r, 'b', 'file-nuovo-lungo', /mobile\/src\/Schermo\.vue/u);
    deveAvere(r, 'b', 'funzione-nuova', /Schermo\.vue.*lunga|lunga/u);
    deveAvere(r, 'b', 'file-nuovo-lungo', /cli\/src\/comando\.mjs/u);
    deveAvere(r, 'b', 'file-nuovo-senza-tipi', /cli\/src\/comando\.mjs/u);
    assert.equal(trova(r, 'b', 'file-nuovo-senza-tipi', /Schermo\.vue|mobile\/src\/lib/u).length, 0, 'TypeScript e <script lang="ts"> hanno i tipi');
    deveAvere(r, '4', 'arco', /mobile\/scripts\/fuori\.mjs/u);
    assert.equal(trova(r, '4', 'pacchetto').length, 0, 'un alias non è un pacchetto');
  });

  test('TAGLIE-BASE-20 ciò che il conto non può vedere è segnato: cartella nuova, node_modules tracciato, legame simbolico, file che non si analizza', () => {
    deveAvere(M.giudizio(() => M.scrivi('prodotto-nuovo/src/motore.mjs', nuove('p', 10))), '4', 'fuori-non-dichiarato', /prodotto-nuovo/u);
    deveAvere(M.giudizio(() => M.scrivi('harness-ui/src/node_modules/finto/index.js', cjs('nm', 10))), '4', 'node-modules');
    /* il legame simbolico (modo 120000) si registra dall'indice: su Windows la cartella di lavoro non lo sa fare */
    M.git('reset', '-q', '--hard', M.base);
    const blob = execFileSync('git', ['-C', M.dir, 'hash-object', '-w', '--stdin'], { input: '../scripts/attrezzo.mjs', encoding: 'utf8', env: AMB }).trim();
    M.git('update-index', '--add', '--cacheinfo', `120000,${blob},harness-ui/src/legame.mjs`);
    const conLegame = M.git('commit-tree', M.git('write-tree').trim(), '-p', M.base, '-m', 'legame').trim();
    M.git('reset', '-q', '--hard', M.base);
    deveAvere(giudica({ repo: M.dir, base: M.base, testa: conLegame, percorsoTypescript: TS }), '4', 'legame', /legame\.mjs/u);
    deveAvere(M.giudizio(() => M.scrivi(P, ['// @ts-check', 'export const = ;'])), 'misura', 'non-si-analizza', /piccolo\.mjs/u);
    deveAvere(M.giudizio(() => M.scrivi(P, piccolo.slice(1))), 'b', 'tipi-spenti', /piccolo\.mjs/u);
  });

  test('TAGLIE-BASE-21 lo stesso giudizio due volte dà lo stesso esito, riga per riga', () => {
    const testa = M.ramo(() => {
      M.scrivi(G, [...gigante, ...nuove('g', 50)]);
      M.scrivi('harness-ui/benchmarks/nascosto.mjs', nuove('n', 30));
      M.scrivi(P, [...piccolo, "import '../benchmarks/nascosto.mjs';", "export const e = eval('1');"]);
      M.scrivi('harness-ui/src/senza-tipi.mjs', nuove('s', 900));
    });
    const senzaTempi = (r) => ({ ...r, misure: { ...r.misure, ms: 0, msAnalisi: 0 } });
    const uno = senzaTempi(giudica({ repo: M.dir, base: M.base, testa, percorsoTypescript: TS }));
    const due = senzaTempi(giudica({ repo: M.dir, base: M.base, testa, percorsoTypescript: TS }));
    assert.deepEqual(uno, due);
    assert.ok(uno.violazioni.length >= 6);
  });
  test('TAGLIE-BASE-22 (rigiocata: 3 falsi rossi su 30 unioni): un percorso citato in un COMMENTO di un file non toccato non è un arco', () => {
    const cresce = (conLaProva) => () => {
      if (conLaProva) M.scrivi('harness-ui/tests/cita.test.mjs', ["import test from 'node:test';", ...Array.from({ length: 60 }, (_, i) => `test('cita ${i}', () => {});`)]);
      M.scrivi('harness-ui/benchmarks/banco.mjs', ['export const banco = 1;', ...nuove('banco', 60)]);
      M.scrivi('harness-ui/benchmarks/citato-nuovo.mjs', nuove('citato', 60));
    };
    /* la base: un file contato cita fra accenti gravi, DENTRO un commento, una prova, un banco e un file che ancora non c'è */
    const conIlCommento = M.ramo(() => {
      M.scrivi('harness-ui/src/cita.mjs', ['// @ts-check', '/* la prova è `tests/cita.test.mjs`, il banco `../benchmarks/banco.mjs`, poi verrà `../benchmarks/citato-nuovo.mjs` */', 'export const cita = 1;']);
      M.scrivi('harness-ui/tests/cita.test.mjs', ["import test from 'node:test';", "test('cita', () => {});"]);
    });
    /* la prova cresce, il banco cresce, il file citato nasce: nessuno li carica (sulla candidata vera: `session-registry.mjs:9598`, `app.js:22754`) */
    verde(M.giudizio(cresce(true), { da: conIlCommento }));
    /* controllo: gli stessi percorsi scritti in stringhe VERE di un file non toccato restano segnati */
    const conLeStringhe = M.ramo(() => M.scrivi('harness-ui/src/cita.mjs', ['// @ts-check', "export const dove = [new URL('../benchmarks/banco.mjs', import.meta.url), '../benchmarks/citato-nuovo.mjs'];"]));
    const r = M.giudizio(cresce(false), { da: conLeStringhe });
    deveAvere(r, '4', 'raggiunto', /benchmarks\/banco\.mjs/u);
    deveAvere(r, '4', 'percorso', /citato-nuovo\.mjs/u);
  });

  test('TAGLIE-BASE-23 (mutanti vivi A09, A10, A17, A18): la dipendenza che il ramo si dichiara da sé, la stessa meta in altra forma, il dirottamento da un file toccato, la forma di carico ripetuta', () => {
    /* A09: il ramo aggiunge la dipendenza al package.json E la importa: sulla base non è dichiarata */
    const r1 = M.giudizio(() => {
      M.scrivi('harness-ui/package.json', [JSON.stringify({ name: 'finto', type: 'module', dependencies: { dichiarato: '1.0.0', 'appena-dichiarato': 'file:../fuori' } })]);
      M.scrivi(P, [...piccolo, "import { x } from 'appena-dichiarato';", 'export const q = x;']);
      M.scrivi('harness-ui/src/nuovo-con-dipendenza.mjs', ['// @ts-check', "import { x } from 'appena-dichiarato';", 'export const z = x;']);
    });
    assert.deepEqual(deveAvere(r1, '4', 'pacchetto', /appena-dichiarato/u).map((v) => v.file), ['harness-ui/src/nuovo-con-dipendenza.mjs', P], 'nel file toccato e nel file nuovo');
    /* A17: una meta già nota al file, scritta in un'altra forma, non è un arco nuovo */
    verde(M.giudizio(() => M.scrivi(P, [...piccolo, "export const dove = new URL('./kernel/dist/uscita.js', import.meta.url);"])));
    /* A18: il file che già scriveva `require('./motore')` viene toccato e nasce `src/motore` senza estensione: ora quel require arriva lì */
    const r3 = M.giudizio(() => {
      M.scrivi('harness-ui/src/motore', cjs('dirottato', 50));
      M.scrivi('harness-ui/src/carica.cjs', ["module.exports = require('./motore');", 'module.exports.toccato = true;']);
    });
    deveAvere(r3, '4', 'arco', /file non contato: harness-ui\/src\/motore$/u);
    /* A10: una forma di carico che sulla base c'è UNA volta non dà diritto a ripeterla; spostarla sì */
    const D = 'harness-ui/src/dinamico.mjs';
    const conLaForma = M.ramo(() => M.scrivi(D, ['// @ts-check', 'export const carica = (dove) => import(dove);']));
    verde(M.giudizio(() => M.scrivi(D, ['// @ts-check', '', 'export const altro = 1;', 'export const carica = (dove) => import(dove);']), { da: conLaForma }));
    const r4 = M.giudizio(() => M.scrivi(D, ['// @ts-check', 'export const carica = (dove) => import(dove);', 'export const carica2 = (dove) => import(dove);']), { da: conLaForma });
    assert.equal(deveAvere(r4, '5', 'carico', /import-calcolato/u).length, 1);
  });

  test('TAGLIE-BASE-24 (mutanti vivi V10, V12): la funzione già grossa non cresce nemmeno di una riga; una funzione corta con una riga lunghissima si vede', () => {
    const r = M.giudizio(() => M.scrivi(F, ['// @ts-check', 'const passo_g = (i) => i + 1;', ...grossa('grossa', 401), 'export function piccola() { return 1; }']));
    assert.equal(deveAvere(r, 'b', 'funzione-cresciuta', /grossa/u)[0].oltre, 1);
    const lunga = `  ${Array.from({ length: 6000 }, (_, i) => `passo_g(${i});`).join(' ')}`;
    const r2 = M.giudizio(() => M.scrivi(F, [...funzioni, 'export function corta() {', lunga, '}']));
    assert.ok(deveAvere(r2, 'b', 'funzione-caratteri', /corta/u)[0].oltre > 0);
    assert.equal(trova(r2, 'b', 'funzione-cresciuta').length, 0, 'in righe non è cresciuto niente');
  });

  test('TAGLIE-BASE-25 (mutante vivo K06): --proposte arriva al giudice estratto dalla base', () => {
    const testa = M.ramo(() => M.scrivi('harness-ui/src/solo-b.mjs', ['export const s = 1;']));
    const tutte = M.comando(M.base, testa);
    assert.equal(tutte.uscita, 1, tutte.stderr);
    assert.deepEqual(classi(tutte.json), ['b:file-nuovo-senza-tipi']);
    const solaA = M.comando(M.base, testa, ['--proposte', 'a']);
    assert.equal(solaA.uscita, 0, solaA.stderr);
    assert.deepEqual(solaA.json.violazioni, []);
    assert.deepEqual(solaA.json.proposte, ['a']);
  });
});
