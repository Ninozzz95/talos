import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as runtimeVero from '../runtime.mjs';
import { leggiPortachiaviDiProva, leggiScopePortachiavi } from '../../src/adattatore-keyring.mjs';
import { preparaRuntime, root } from './support.mjs';
import { CHIAVI_FINTE, NOME, NOMI_DI_LANCIO, SPEC_FUORI, ambienteDiChiCorre, chiusura, creaRegistratore, eInerte, eseguiNelBanco, fineStringa,
  importazioni, inerte, moduliVeri, opzioniTolleranti, rigaDi, senzaCommenti, soloCodice } from './banco-dei-lanci.mjs';

/*
 * 11/11/2026, rounds 2-3 of the shell keyring cure. Three places stand between the test environment and the owner's real keyring:
 * the launch sites of the shell specs, `main.mjs` (the shell hands its child its own environment) and `server.mjs` (with the test
 * keyring no legacy copy, no renewal lock). Round 2 read them; the controller (11/11, GIALLO) kept eleven mutants alive. Round 3:
 *   - SITES: every call to a launch function (all the functions of the real `node:child_process`, plus `launch`), also as a member
 *     call (`childProcess.spawn(`), in every spec of the folder (K4), is lifted with the declarations it uses and evaluated; the
 *     `process` it sees has no test keyring and carries invented keys (K2, K5). This net catches the sites the bench
 *     (`banco-dei-lanci.test.mjs`) cannot reach (a launch behind a skip or after a window step); the bench catches what happens
 *     AROUND a launch. Unknown names are still red, with the file and line (K6).
 *   - MAIN: the whole `avviaFiglio` body of `main.mjs` runs on the bench (a variable deleted before the launch is seen, C11).
 *   - SERVER: the keyring part of `startServer()` runs on the bench and the legacy copy is counted by EFFECT, calls to a recorder,
 *     whatever name reaches it (K3, C10); a comment that names the function is not a call (C12).
 */
const desktop = root;
const harness = join(root, '..');
const leggi = file => readFileSync(file, 'utf8');
const AsyncFunction = (async () => {}).constructor;

/** Every call to `nome(` (also `x.nome(`), comments ignored, with the callee chain, its line and its text. */
function chiamate(testo, nome) {
  const codice = senzaCommenti(testo);
  const trovate = [];
  for (let i = codice.indexOf(nome + '('); i >= 0; i = codice.indexOf(nome + '(', i + 1)) {
    const prima = codice.slice(Math.max(0, i - 9), i);
    if (/[\w$]$/.test(prima) || /function\s*$/.test(prima)) continue;
    let inizio = i;
    while (inizio > 0 && /[\w$.]/.test(codice[inizio - 1])) inizio--;
    const fine = chiusura(codice, i + nome.length);
    trovate.push({ inizio, riga: rigaDi(codice, inizio), chiamato: codice.slice(inizio, i + nome.length), testo: testo.slice(inizio, fine) });
  }
  return trovate;
}
/** The statement that starts at `indice`, up to its `;` at depth zero. */
function istruzione(testo, indice) {
  for (let i = indice; i < testo.length; i++) {
    const c = testo[i];
    if (c === '\'' || c === '"' || c === '`') { i = fineStringa(testo, i); continue; }
    if (c === '(' || c === '[' || c === '{') { i = chiusura(testo, i) - 1; continue; }
    if (c === ';') return testo.slice(indice, i + 1);
  }
  throw new Error('no end for the statement at line ' + rigaDi(testo, indice));
}
/** The names a piece of code reads: identifiers that are not a property (`x.nome`) nor an object key (`{ nome: …`). */
function nomiLetti(codice) {
  const pulito = soloCodice(codice);
  return [...new Set([...pulito.matchAll(/[A-Za-z_$][\w$]*/g)].filter(m => {
    const prima = pulito.slice(0, m.index).trimEnd();
    const dopo = pulito.slice(m.index + m[0].length).trimStart();
    if (/[\w$]$/.test(pulito.slice(0, m.index))) return false;
    if (prima.endsWith('.') && !prima.endsWith('...')) return false;
    return !(dopo.startsWith(':') && /[{,]$/.test(prima));
  }).map(m => m[0]))];
}
/** The declaration of `nome` nearest above line `riga` (plain or destructuring) and the later lines that change it before the site. */
function dichiarazione(testo, riga, nome) {
  const righe = testo.split('\n');
  // A rest element (`const { A: _a, ...oldEnv } = …`) declares the name after three dots; a member access (`x.oldEnv`) does not.
  const parola = new RegExp('(^|[^\\w$.]|\\.\\.\\.)' + nome.replace(/\$/g, '\\$') + '(?![\\w$])');
  const decl = righe.slice(0, riga - 1).findLastIndex(r => { const m = r.match(/^\s*(?:const|let|var)\s+([^=]+?)\s*=(?!=)/); return m && parola.test(m[1]); });
  if (decl < 0) return null;
  const inizio = righe.slice(0, decl).reduce((n, r) => n + r.length + 1, 0) + righe[decl].search(/\S/);
  const testoDecl = istruzione(testo, inizio);
  const fineDecl = rigaDi(testo, inizio + testoDecl.length);
  const cambia = new RegExp('^\\s*(?:delete\\s+' + nome + '\\b|' + nome + '(?:\\.[\\w$]+|\\[[^\\]]+\\])+\\s*=(?!=)|Object\\.assign\\(\\s*' + nome + '\\b)');
  const cambi = righe.slice(fineDecl, riga - 1).filter(r => cambia.test(r)).map(r => r.trim());
  return { riga: decl + 1, testo: [testoDecl, ...cambi].join('\n') };
}
/** What a site needs from above it: the declarations of the names it reads, theirs in turn, in order (the spec's own win). */
function preambolo(testo, riga, codice, ambito) {
  const viste = new Set();
  const ordine = []; // post-order: a declaration comes after the ones it reads
  const visita = (codiceDi, rigaDi) => {
    for (const nome of nomiLetti(codiceDi)) {
      if (viste.has(nome) || nome in ambito || nome in globalThis) continue;
      viste.add(nome);
      const d = dichiarazione(testo, rigaDi, nome);
      if (!d) continue;
      visita(d.testo, d.riga);
      ordine.push(d.testo);
    }
  };
  visita(codice, riga);
  return [...new Set(ordine)].join('\n');
}
/** Evaluates lifted text: names from `ambito`, real globals, and an inert stand-in for anything else (a launch on it is recorded). */
function valuta(codice, ambito, dove, sconosciuti = new Set()) {
  const proxy = new Proxy(ambito, {
    has: (t, k) => typeof k === 'string' && (k in t || !(k in globalThis)),
    get: (t, k) => {
      if (typeof k === 'symbol') return undefined;
      if (k in t) return t[k];
      sconosciuti.add(k);
      return inerte(k, {}, ambito.__lancio);
    },
  });
  let f;
  try { f = new AsyncFunction('ambito', 'with (ambito) {\n' + codice + '\n}'); } catch (e) { throw new SyntaxError(dove + ': the lifted text does not compile: ' + e.message); }
  return f(proxy);
}
function conAmbiente(valori, fn) {
  const prima = Object.fromEntries(Object.keys(valori).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(valori)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const ripristina = () => { for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  let esito;
  try { esito = fn(); } catch (e) { ripristina(); throw e; }
  return Promise.resolve(esito).finally(ripristina);
}
function senzaPortachiaviNeChiavi(env, dove) {
  assert.ok(env && typeof env === 'object' && !eInerte(env), dove + ': the launch passes no environment of its own (it would inherit the runner\'s)');
  assert.equal(leggiPortachiaviDiProva(env), true, dove + ': this launch must carry TALOS_HARNESS_UI_KEYRING=memoria to the child');
  const valori = new Set(Object.values(CHIAVI_FINTE));
  assert.deepEqual(Object.keys(env).filter(k => k.toUpperCase() in CHIAVI_FINTE || valori.has(String(env[k]))), [], dove + ': provider keys reach the child');
}

// One real test environment, built with the variable ABSENT and invented keys PLANTED in the real ambient (the owner's condition).
const prova = await conAmbiente({ [NOME]: undefined, ...CHIAVI_FINTE }, () => preparaRuntime('lanci-portachiavi'));
const percorsi = { root: prova.runtime, server: join(prova.runtime, 'server.mjs'), bootstrap: join(desktop, 'child-bootstrap.mjs') };
const SPEC = readdirSync(join(desktop, 'tests')).filter(n => n.endsWith('.spec.mjs') && !Object.hasOwn(SPEC_FUORI, n)).sort();
const NOMI = [...NOMI_DI_LANCIO, 'creaAvvioFiglio'];
/** The bench's own names: never replaced by a declaration of the spec (the stand-ins and the real pure helpers). */
const FISSI = new Set(['root', 'join', 'executablePath', 'creaAvvioFiglio', 'process', 'risolviPercorsi', 'scegliMotoreLocale', 'scegliPortaEffimera',
  'randomBytes', 'preparaRuntime', 'require', '_electron', 'launch', '__lancio', ...NOMI_DI_LANCIO]);

function ambitoDelleSpec(file, testo) {
  const env = { ...prova.env };
  const processo = { env: ambienteDiChiCorre(), execPath: process.execPath, platform: process.platform };
  const opzioniDi = (api, a) => (api === 'launch' ? a[0] : api === 'exec' || api === 'execSync' ? a[1]
    : a.slice(1).find(x => x && typeof x === 'object' && !Array.isArray(x)));
  // Stand-in launchers: what the child would get (Node and Playwright both default to the parent's `process.env`).
  const lanciatore = api => (...a) => { const o = opzioniDi(api, a); return { env: o && 'env' in o ? o.env : processo.env }; };
  const lanciatori = Object.fromEntries([...NOMI_DI_LANCIO].map(n => [n, lanciatore(n)]));
  const ambito = {
    root, join: moduliVeri['node:path'].join, executablePath: process.execPath, creaAvvioFiglio: o => runtimeVero.creaAvvioFiglio(opzioniTolleranti(o)), process: processo,
    risolviPercorsi: o => runtimeVero.risolviPercorsi(opzioniTolleranti(o)), scegliMotoreLocale: () => null,
    scegliPortaEffimera: async () => 49152, randomBytes: n => Buffer.alloc(n, 0xab), preparaRuntime: () => ({ ...prova, env: { ...prova.env } }),
    require: m => { if (m === 'electron') return process.execPath; throw new Error(file + ': require(' + m + ') is not a stand-in of this test'); },
    _electron: { launch: lanciatore('launch') },
    ...lanciatori,
    launch: envDato => ({ env: envDato }),             // preferences-restart's own helper, called with the fixture environment
    __lancio: (_chi, api, a) => lanciatore(api)(...a), // a launch on an inert stand-in (`childProcess.spawn(` with no import)
    // Used only when the spec has no declaration of these names above the site (a helper's parameter, e.g. `launch(env)`).
    prova: { ...prova, env }, fixture: { ...prova, env }, env,
    runtime: prova.runtime, dataDir: prova.dataDir, port: 49152, token: 'a'.repeat(64), reportFile: join(prova.dataDir, 'handshake.json'),
    oldRoot: join(prova.dataDir, 'win-unpacked-finto'),
  };
  // A namespace import of the child-process module (`import * as cp from 'node:child_process'`) is a set of stand-in launchers too.
  for (const l of importazioni(testo, file).legami) if (l.modulo === 'node:child_process' && (l.esportato === '*' || l.esportato === 'default')) ambito[l.nome] = lanciatori;
  return ambito;
}
const ambienteDelLancio = esito => esito?.options?.env ?? esito?.env;

test('SHELL-KEYRING-SITES — every launch in the shell specs hands the child the in-memory keyring and no key', async t => {
  assert.ok(SPEC.length >= 6, 'the shell specs were not found');
  const rossi = [];
  for (const nomeFile of SPEC) {
    const testo = leggi(join(desktop, 'tests', nomeFile));
    const visti = new Set();
    const siti = NOMI.flatMap(nome => chiamate(testo, nome)).filter(s => !visti.has(s.inizio) && visti.add(s.inizio)).sort((a, b) => a.riga - b.riga);
    if (!siti.length) { rossi.push('tests/' + nomeFile + ': no launch found — this test must be updated with the spec'); continue; }
    const ambito = ambitoDelleSpec(nomeFile, testo);
    for (const sito of siti) {
      const dove = 'tests/' + nomeFile + ':' + sito.riga;
      const sconosciuti = new Set();
      try {
        // The names the site reads that the spec declares above it (e.g. `oldEnv`, preferences-restart.spec.mjs:128-129, or `avvio`
        // with the lines that change it before the spawn), lifted with what they read in turn; the bench's fixed names stay.
        const davanti = preambolo(testo, sito.riga, sito.testo, Object.fromEntries(Object.entries(ambito).filter(([k]) => FISSI.has(k))));
        const esito = await valuta(davanti + '\nreturn (' + sito.testo + ');', ambito, dove, sconosciuti);
        try { senzaPortachiaviNeChiavi(ambienteDelLancio(esito), dove); } catch (e) {
          throw new Error(e.message.split('\n')[0] + (sconosciuti.size ? ' (names unknown to this test: ' + [...sconosciuti].join(', ') + ')' : ''));
        }
        t.diagnostic(dove + ' ' + sito.testo.slice(0, 40).replace(/\s+/g, ' ') + '… → memoria');
      } catch (e) { rossi.push(e.message.split('\n')[0].startsWith('tests/') ? e.message.split('\n')[0] : dove + ': ' + e.message.split('\n')[0]); }
    }
  }
  assert.deepEqual(rossi, [], rossi.join('\n'));
});

/** The body of the first `<chiave>: async (…) => {` in the text, as a function body. */
function corpoDi(testo, ancora, dove) {
  const volte = testo.split(ancora).length - 1;
  if (volte !== 1) throw new Error(`${dove}: «${ancora}» appears ${volte} times, expected exactly once — this test must be updated with the code`);
  const graffa = testo.indexOf('{', testo.indexOf(ancora) + ancora.length - 1);
  return { corpo: testo.slice(graffa + 1, chiusura(testo, graffa) - 1), riga: rigaDi(testo, graffa) };
}

test('SHELL-KEYRING-MAIN — the whole child launch of main.mjs, run on the bench, hands the child the shell\'s own environment', async () => {
  const file = join(desktop, 'main.mjs');
  const { corpo, riga } = corpoDi(leggi(file), 'avviaFiglio: async () => {', 'main.mjs');
  const lancia = async (envDelGuscio, isPackaged) => {
    const lanci = [];
    const processo = inerte('process', { env: envDelGuscio, execPath: process.execPath, platform: process.platform, resourcesPath: undefined });
    const registra = creaRegistratore({ file, processo, lanci });
    const { esito, ferma } = await eseguiNelBanco(corpo, { file, processo, registra, ambito: {
      // `creaAvvioFiglio` defaults to `process.env`; in the shell that is THIS environment, so the stand-in hands it the same default.
      creaAvvioFiglio: o => runtimeVero.creaAvvioFiglio({ env: processo.env, ...opzioniTolleranti(o) }),
      risolviPercorsi: o => ({ ...runtimeVero.risolviPercorsi(opzioniTolleranti({ ...o, appPath: desktop })), root: prova.runtime, server: percorsi.server }),
      scegliMotoreLocale: () => null, existsSync: () => true, mkdirSync: () => {}, scegliPortaPersistente: async () => 49152,
      consegnaSegreti: runtimeVero.consegnaSegreti, figli: new Set(), staUscendo: false, generazione: 0, token: 'a'.repeat(64),
      dataDir: prova.dataDir, cartellaHandshake: join(prova.dataDir, 'handshake'), motoreLocalePreferito: 'auto',
      profile: { scratchDir: join(prova.dataDir, 'scratch'), keyringScope: 'desktop' },
      app: inerte('app', { isPackaged, getVersion: () => '0.2.1', getAppPath: () => desktop }),
    } });
    ferma();
    assert.equal(esito, 'fine', 'main.mjs:' + riga + ': the child launch did not run to its end on the bench (' + esito + ')');
    assert.equal(lanci.length, 1, 'main.mjs:' + riga + ': one child launch expected, the bench saw ' + lanci.length);
    return lanci[0];
  };
  const { [NOME]: _tolta, ...senza } = prova.env;
  for (const isPackaged of [false, true]) {
    // The shell started by the specs (the variable is in ITS environment): the child must read the test keyring, and get no key.
    const lancio = await lancia({ ...prova.env, ...CHIAVI_FINTE }, isPackaged);
    assert.equal(leggiPortachiaviDiProva(lancio.ambiente), true, 'main.mjs:' + lancio.riga + ': the shell must pass its own environment on');
    // Control (the installed app as the owner starts it): nothing invents the test keyring on the way, the system one stays.
    assert.equal(leggiPortachiaviDiProva((await lancia({ ...senza }, isPackaged)).ambiente), false, 'main.mjs: the shell must not force the test keyring');
  }
});

test('SHELL-KEYRING-SERVER — with the test keyring server.mjs copies no legacy key and arms no lock, counted by effect', async () => {
  const file = join(harness, 'server.mjs');
  const testo = leggi(file);
  const ancora = 'const scopePortachiavi =';
  assert.equal(testo.split(ancora).length - 1, 1, 'server.mjs: «' + ancora + '» must appear once — this test must be updated with the code');
  const inizio = testo.indexOf(ancora);
  const ultima = 'const lucchettoRinnovoChatgpt =';
  assert.equal(testo.split(ultima).length - 1, 1, 'server.mjs: «' + ultima + '» must appear once');
  const fetta = testo.slice(inizio, testo.indexOf(ultima) + istruzione(testo, testo.indexOf(ultima)).length);
  const riga = rigaDi(testo, inizio);
  const decide = async env => {
    const effetti = { copie: 0, lucchetti: 0, portachiavi: [] };
    const processo = inerte('process', { env, platform: process.platform });
    const registra = creaRegistratore({ file, processo, lanci: [] });
    const { esito, ferma } = await eseguiNelBanco(fetta, { file, processo, registra, ambito: {
      leggiScopePortachiavi, leggiPortachiaviDiProva,
      migraChiaviLegacySuDesktop: async () => { effetti.copie++; return { migrati: [], errori: [] }; },
      creaLucchettoRinnovoChatgpt: () => { effetti.lucchetti++; return inerte('lucchetto'); },
      creaAdattatorePortachiavi: async e => { effetti.portachiavi.push(leggiPortachiaviDiProva(e)); return inerte('portachiavi'); },
    } });
    ferma();
    assert.equal(esito, 'fine', 'server.mjs:' + riga + ': the keyring part of startServer did not run to its end on the bench (' + esito + ')');
    return effetti;
  };
  // The child environment the specs really produce: preparaRuntime → creaAvvioFiglio (scope `desktop`, the installed app's).
  const figlio = runtimeVero.creaAvvioFiglio({ execPath: process.execPath, percorsi, port: 49152, token: 'a'.repeat(64), reportFile: join(prova.dataDir, 'handshake.json'), dataDir: prova.dataDir, env: prova.env }).options.env;
  assert.equal(leggiScopePortachiavi(figlio), 'desktop');
  assert.deepEqual(await decide(figlio), { copie: 0, lucchetti: 0, portachiavi: [true] }, 'server.mjs:' + riga + ' — the test keyring must keep the real keyring out');
  // Controls: the installed app (scope desktop, system keyring) copies once and arms the lock; the preview and a source run never copy.
  const { [NOME]: _tolta, ...installata } = figlio;
  assert.deepEqual(await decide(installata), { copie: 1, lucchetti: 1, portachiavi: [false] });
  assert.deepEqual(await decide({ ...installata, TALOS_HARNESS_UI_KEYRING_SCOPE: 'desktop-preview' }), { copie: 0, lucchetti: 1, portachiavi: [false] });
  assert.deepEqual(await decide({}), { copie: 0, lucchetti: 1, portachiavi: [false] });
  // Outside the part run above, the copy function is named only by its import and that one call (an alias elsewhere is red too).
  const riferimenti = [...soloCodice(testo).matchAll(/\bmigraChiaviLegacySuDesktop\b/g)].map(m => 'server.mjs:' + rigaDi(testo, m.index));
  assert.equal(riferimenti.length, 2, 'server.mjs: the legacy copy is referenced at ' + riferimenti.join(', ') + ' — only its import and the guarded call are expected');
  /* 11/11/2026, round 4 (controller X-K3): the same copy moved into a HELPER module and called from the keyring part was alive, the
     count above reads server.mjs only. Counted over the whole product: the function is defined once and named nowhere else, and its
     module is imported by no other product module (server.mjs only). */
  const prodotto = [];
  const visita = d => { for (const v of readdirSync(d, { withFileTypes: true })) { const p = join(d, v.name); if (v.isDirectory()) visita(p); else if (/\.(m|c)?js$/.test(v.name)) prodotto.push(p); } };
  visita(join(harness, 'src'));
  const altrove = []; const importatori = [];
  for (const p of prodotto) {
    // the bench's reader does not parse every product file (a regex it cannot tell from a division): those are read raw, stricter
    let codice; try { codice = soloCodice(leggi(p)); } catch { codice = leggi(p); }
    const nome = relative(harness, p).replaceAll('\\', '/');
    for (const m of codice.matchAll(/\bmigraChiaviLegacySuDesktop\b/g)) altrove.push(nome + ':' + rigaDi(codice, m.index));
    if (/migrazione-chiavi(\.mjs)?['"]/.test(leggi(p))) importatori.push(nome);
  }
  assert.deepEqual(altrove, ['src/migrazione-chiavi.mjs:52'], 'the legacy copy is named outside server.mjs at ' + altrove.join(', ') + ' — only its definition is expected');
  assert.deepEqual(importatori, [], 'src/ modules importing the legacy copy: ' + importatori.join(', ') + ' — only server.mjs may');
});
