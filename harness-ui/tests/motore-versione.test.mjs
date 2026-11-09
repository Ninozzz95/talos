/*
 * The server says which engine it is using (01/11/2026). The owner's 4174 ran llama.cpp b10517 of August while the package ships b11669,
 * and nobody saw it: `GET /api/v1/runtime` only said «vulkan». Form agreed with Desktop, Mobile, CLI and Performance:
 * `FORMA-VERSIONE-DEL-MOTORE-2026-11-01.md` in the engine handoff folder.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate as prossimoGiro } from 'node:timers/promises';
import { MOTORE_FISSATO } from '../src/motore-fissato.mjs';
import { confrontaConLaFissata, createVersioneDelMotore, leggiRigaVersione, rigaDelRegistro } from '../src/versione-del-motore.mjs';
import { LLAMA_VERSIONE } from '../desktop/scripts/prepara-pacchetto.mjs';

const USCITA_FISSATA = `\nversion: 0.7.0-dev (build ${MOTORE_FISSATO.build}, commit ${MOTORE_FISSATO.commit.slice(0, 9)})\nbuilt with Clang 20.1.8 for Windows x86_64\n`;
const USCITA_VECCHIA = '\nversion: 0.1.2-dev (build 10517, commit dc72703fc)\nbuilt with Clang 20.1.8 for Windows x86_64\n';
const statoDi = (size = 1, mtimeMs = 1) => () => ({ size, mtimeMs });

/** A probe answered by hand: the test decides when, to prove that nobody waits for it. */
function sondaAMano() {
  const chiamate = [];
  const sonda = (percorso, argomenti, tettoMs) => new Promise((risolvi, rifiuta) => chiamate.push({ percorso, argomenti, tettoMs, risolvi, rifiuta }));
  return { sonda, chiamate };
}
const asseconda = async () => { await prossimoGiro(); await prossimoGiro(); await prossimoGiro(); };

test('the version line is read as the engine prints it, on stderr or stdout', () => {
  assert.deepEqual(leggiRigaVersione(USCITA_VECCHIA), { build: 10517, commit: 'dc72703fc' });
  assert.deepEqual(leggiRigaVersione('version: 0.8.0-dev (build 11960, commit 8642541b2)\r\nbuilt with Clang\r\n'), { build: 11960, commit: '8642541b2' });
  for (const illeggibile of [null, undefined, '', 'version: unknown', 'build 11669, commit 620d2225c']) assert.equal(leggiRigaVersione(illeggibile), null);
});

test('different means different: another build, or the same build from another commit', () => {
  const fissata = { build: 11669, commit: '620d2225cc436ab0b001e3200e590e3b286ef9ab' };
  assert.equal(confrontaConLaFissata({ build: 11669, commit: '620d2225c' }, fissata), false);
  assert.equal(confrontaConLaFissata({ build: 10517, commit: '620d2225c' }, fissata), true);
  assert.equal(confrontaConLaFissata({ build: 11669, commit: 'dc72703fc' }, fissata), true);
  assert.equal(confrontaConLaFissata(null, fissata), null);
});

test('reading the version never makes anyone wait: the answer is «unknown» until the probe has answered', async () => {
  const { sonda, chiamate } = sondaAMano();
  const motore = createVersioneDelMotore({ sonda, stat: statoDi() });
  const prima = motore.versione('C:/motore/llama-server.exe');
  assert.deepEqual(prima, { build: null, commit: null, fissata: { build: MOTORE_FISSATO.build, commit: MOTORE_FISSATO.commit }, diverso: null, manuale: false });
  await asseconda();
  assert.equal(chiamate.length, 1);
  assert.deepEqual(chiamate[0].argomenti, ['--version']);
  assert.equal(chiamate[0].tettoMs, 2_000, 'Performance: a 2 s ceiling, an antivirus can hold the first start of an .exe');
  chiamate[0].risolvi(USCITA_VECCHIA);
  await asseconda();
  assert.deepEqual(motore.versione('C:/motore/llama-server.exe'), { build: 10517, commit: 'dc72703fc', fissata: { build: MOTORE_FISSATO.build, commit: MOTORE_FISSATO.commit }, diverso: true, manuale: false });
});

test('the engine the package pins is not different', async () => {
  const { sonda, chiamate } = sondaAMano();
  const motore = createVersioneDelMotore({ sonda, stat: statoDi() });
  motore.versione('a.exe');
  await asseconda();
  chiamate[0].risolvi(USCITA_FISSATA);
  await asseconda();
  assert.equal(motore.versione('a.exe').diverso, false);
});

test('a binary set by hand stays truthful: different AND by hand, never a silent false', async () => {
  const { sonda, chiamate } = sondaAMano();
  const motore = createVersioneDelMotore({ sonda, stat: statoDi(), manuale: true });
  motore.versione('a.exe');
  await asseconda();
  chiamate[0].risolvi(USCITA_VECCHIA);
  await asseconda();
  const letta = motore.versione('a.exe');
  assert.equal(letta.diverso, true);
  assert.equal(letta.manuale, true);
});

test('one read per binary, and a read again when the file changes under a running server', async () => {
  const { sonda, chiamate } = sondaAMano();
  let stato = { size: 1, mtimeMs: 1 };
  const motore = createVersioneDelMotore({ sonda, stat: () => stato });
  motore.versione('a.exe');
  await asseconda();
  chiamate[0].risolvi(USCITA_VECCHIA);
  await asseconda();
  motore.versione('a.exe');
  motore.versione('a.exe');
  await asseconda();
  assert.equal(chiamate.length, 1, 'same path, size and date: no second probe');
  stato = { size: 1, mtimeMs: 2 };
  assert.equal(motore.versione('a.exe').build, null, 'a changed file is unknown again, never the old version');
  await asseconda();
  assert.equal(chiamate.length, 2);
  chiamate[1].risolvi(USCITA_FISSATA);
  await asseconda();
  assert.equal(motore.versione('a.exe').build, MOTORE_FISSATO.build);
  stato = { size: 2, mtimeMs: 2 };
  motore.versione('a.exe');
  await asseconda();
  assert.equal(chiamate.length, 3, 'the size counts as well as the date');
});

test('an answer for the file as it was does not overwrite the file as it is', async () => {
  const { sonda, chiamate } = sondaAMano();
  let stato = { size: 1, mtimeMs: 1 };
  const dette = [];
  const motore = createVersioneDelMotore({ sonda, stat: () => stato, onLetta: (v) => dette.push(v.build) });
  motore.versione('a.exe');
  await asseconda();
  stato = { size: 1, mtimeMs: 2 };
  motore.versione('a.exe');
  await asseconda();
  chiamate[1].risolvi(USCITA_FISSATA);
  await asseconda();
  chiamate[0].risolvi(USCITA_VECCHIA);
  await asseconda();
  assert.equal(motore.versione('a.exe').build, MOTORE_FISSATO.build);
  assert.deepEqual(dette, [MOTORE_FISSATO.build], 'nobody hears about the file as it was');
});

test('where the binary does not exist, as on the phone: unknown, no probe, no error, no wait', async () => {
  const { sonda, chiamate } = sondaAMano();
  const motore = createVersioneDelMotore({ sonda, stat: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } });
  assert.equal(motore.versione('/data/app/llama-server').diverso, null);
  for (const nessuno of [null, undefined, '']) assert.equal(motore.versione(nessuno).build, null);
  await asseconda();
  assert.equal(chiamate.length, 0);
});

test('a probe that fails or times out is unknown, and it is tried again later, not forever unknown', async () => {
  const { sonda, chiamate } = sondaAMano();
  let adesso = 1_000;
  const motore = createVersioneDelMotore({ sonda, stat: statoDi(), now: () => adesso, riprovaDopoMs: 60_000 });
  motore.versione('a.exe');
  await asseconda();
  chiamate[0].risolvi(null);
  await asseconda();
  assert.equal(motore.versione('a.exe').diverso, null);
  await asseconda();
  assert.equal(chiamate.length, 1, 'not again at once');
  adesso += 60_000;
  motore.versione('a.exe');
  await asseconda();
  assert.equal(chiamate.length, 2);
  chiamate[1].rifiuta(new Error('spawn failed'));
  await asseconda();
  assert.equal(motore.versione('a.exe').diverso, null);
});

test('each binary has its own read: the CPU fallback may be another engine', async () => {
  const { sonda, chiamate } = sondaAMano();
  const motore = createVersioneDelMotore({ sonda, stat: statoDi() });
  motore.versione('vulkan.exe');
  motore.versione('cpu.exe');
  await asseconda();
  assert.deepEqual(chiamate.map((c) => c.percorso), ['vulkan.exe', 'cpu.exe']);
  chiamate[0].risolvi(USCITA_FISSATA);
  chiamate[1].risolvi(USCITA_VECCHIA);
  await asseconda();
  assert.equal(motore.versione('vulkan.exe').diverso, false);
  assert.equal(motore.versione('cpu.exe').diverso, true);
});

test('the log line appears only for a different engine, and says when it was set by hand', async () => {
  const righe = [];
  const { sonda, chiamate } = sondaAMano();
  const motore = createVersioneDelMotore({ sonda, stat: statoDi(), onLetta: (v) => { const r = rigaDelRegistro(v); if (r) righe.push(r); } });
  motore.versione('uguale.exe');
  motore.versione('diverso.exe');
  await asseconda();
  chiamate[0].risolvi(USCITA_FISSATA);
  chiamate[1].risolvi(USCITA_VECCHIA);
  await asseconda();
  assert.deepEqual(righe, [`[talos] engine build 10517 (commit dc72703fc), package pins ${MOTORE_FISSATO.build}\n`]);
  assert.equal(rigaDelRegistro({ build: 10517, commit: 'dc72703fc', fissata: MOTORE_FISSATO, diverso: true, manuale: true }),
    `[talos] engine build 10517 (commit dc72703fc), set by hand; package pins ${MOTORE_FISSATO.build}\n`);
  assert.equal(rigaDelRegistro({ build: null, commit: null, fissata: MOTORE_FISSATO, diverso: null, manuale: false }), null);
});

test('the pin lives in one place: the package and the context engine read it from there', () => {
  assert.equal(LLAMA_VERSIONE, `b${MOTORE_FISSATO.build}`);
  assert.match(MOTORE_FISSATO.commit, /^[0-9a-f]{40}$/);
  const contesto = readFileSync(new URL('../src/context-embedding-runtime.mjs', import.meta.url), 'utf8');
  assert.match(contesto, /runtimeCommit: MOTORE_FISSATO\.commit/);
  assert.doesNotMatch(contesto, /runtimeCommit: '/);
});

test('the pin module is data only: it is copied into the phone package (Mobile, `copia-r4.mjs:28`)', () => {
  const sorgente = readFileSync(new URL('../src/motore-fissato.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(sorgente, /\bimport\b|\brequire\(|\bprocess\b|\bawait\b/);
});
