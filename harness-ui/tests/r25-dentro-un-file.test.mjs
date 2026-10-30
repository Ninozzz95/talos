/*
 * R-25 (Performance 29/10/2026, G-confine r1: due rifiuti «is not a folder» per un file nominato; owner 29/10 sera, OK della CLI coi
 *   casi di Windows) — `dentro` accetta un file o una cartella. Prima di cercare: percorso vero dentro il progetto (giunzioni,
 *   collegamenti, `\\?\`, maiuscole), `.git` e cartelle bloccate mai (rg cerca un file nominato anche se un glob lo esclude), un
 *   binario si dice binario; un file del `.gitignore` nominato si cerca; i segreti escono con la nota F-S-001; un percorso che non
 *   c'è riceve i nomi vicini, come Hermes. Ogni prova sulle due strade quando conta: ripgrep e camminata JS.
 * Ricerca: `RICERCA-R23-R25-ONE-UP-2026-10-29.md` §R-25 (Claude Code, opencode `grep.ts:23-25`, Hermes `file_tools.py:1298`,
 *   gemini-cli `ripGrep.ts:693-714`, kilocode, crush).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cercaNelProgetto } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function discoVero(radice) {
  return {
    async elenca(dentro = '') {
      const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true });
      return Promise.all(voci.map(async (v) => ({
        nome: v.name,
        cartella: v.isDirectory() || (v.isSymbolicLink() && (await stat(join(radice, dentro, v.name)).then((s) => s.isDirectory(), () => false))),
        byte: v.isDirectory() ? 0 : (await stat(join(radice, dentro, v.name)).catch(() => ({ size: 0 }))).size,
      })));
    },
    async leggi(percorso) { return readFile(join(radice, ...percorso.split('/')), 'utf8'); },
  };
}
function progetto(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-r25-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const radice = join(base, 'progetto');
  mkdirSync(join(radice, 'src', 'kernel'), { recursive: true });
  mkdirSync(join(radice, 'privata'), { recursive: true });
  mkdirSync(join(radice, 'build'), { recursive: true });
  mkdirSync(join(radice, '.git'), { recursive: true });
  mkdirSync(join(base, 'fuori'), { recursive: true });
  writeFileSync(join(radice, 'src', 'a.mjs'), 'export const AGO_R25 = 1;\n');
  writeFileSync(join(radice, 'src', 'b.mjs'), 'export const AGO_R25 = 2;\n');
  writeFileSync(join(radice, 'src', 'kernel', 'c.mjs'), 'AGO_R25 nel kernel\n');
  writeFileSync(join(radice, 'privata', 'diario.txt'), 'AGO_R25 segreto della persona\n');
  writeFileSync(join(radice, 'build', 'uscita.txt'), 'AGO_R25 nel file ignorato\n');
  writeFileSync(join(radice, '.gitignore'), 'build/\n');
  writeFileSync(join(radice, '.git', 'config'), '[core] AGO_R25\n');
  writeFileSync(join(radice, '.env'), 'API_KEY=AGO_R25\n');
  writeFileSync(join(radice, 'dati.bin'), Buffer.from([0x41, 0x47, 0x4f, 0x00, 0x5f, 0x52, 0x32, 0x35]));
  writeFileSync(join(radice, 'immagine.txt'), Buffer.concat([Buffer.from('AGO_R25'), Buffer.alloc(16, 0)]));
  writeFileSync(join(base, 'fuori', 'x.txt'), 'AGO_R25 fuori dal progetto\n');
  return { base, radice, disco: discoVero(radice) };
}
function senzaRipgrep(t, radice) {
  const prima = process.env.TALOS_RG_PATH;
  process.env.TALOS_RG_PATH = join(radice, 'rg-che-non-esiste.exe');
  t.after(() => { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima; });
}

test('R25-01 FILE (ripgrep): dentro un file cerca solo lì, coi percorsi relativi alla radice', async (t) => {
  const { radice, disco } = progetto(t);
  const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'src/a.mjs' }, { radice });
  assert.match(esito, /^src\/a\.mjs:1:export const AGO_R25 = 1;$/mu);
  assert.doesNotMatch(esito, /b\.mjs|kernel|is not a folder/u);
  const conNome = await cercaNelProgetto(disco, { testo: 'AGO_R25', nome: 'b.mjs', dentro: 'src/a.mjs' }, { radice });
  assert.doesNotMatch(conNome, /src\/a\.mjs:1/u, 'nome e dentro restano in AND anche su un file');
  const soloNome = await cercaNelProgetto(disco, { nome: 'a.mjs', dentro: 'src/a.mjs' }, { radice });
  assert.match(soloNome, /^src\/a\.mjs$/mu);
});

test('R25-02 FILE SENZA RG: la camminata JS legge solo quel file', async (t) => {
  const { radice, disco } = progetto(t);
  senzaRipgrep(t, radice);
  const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'src/a.mjs' }, { radice });
  assert.match(esito, /^src\/a\.mjs$/mu);
  assert.doesNotMatch(esito, /b\.mjs|kernel|is not a folder/u);
  // anche il ponte del telefono (niente radice): parla solo il disco
  const ponte = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'src/a.mjs' }, {});
  assert.match(ponte, /^src\/a\.mjs$/mu);
});

test('R25-03 BLOCCATA: un file in una cartella bloccata si rifiuta prima di rg (che lo cercherebbe nonostante il glob)', async (t) => {
  const { radice, disco } = progetto(t);
  const salta = (p) => p === 'privata' || p.startsWith('privata/');
  for (const dentro of ['privata/diario.txt', 'privata']) {
    const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro }, { radice, salta, escludi: ['privata'] });
    assert.match(esito, new RegExp(`^REFUSED\\. "${dentro.replace('.', '\\.')}" is inside a folder the person blocked for the device that sent this turn\\.`, 'u'));
    assert.doesNotMatch(esito, /segreto della persona/u);
  }
  senzaRipgrep(t, radice);
  const js = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'privata/diario.txt' }, { radice, salta, escludi: ['privata'] });
  assert.match(js, /^REFUSED\./u);
});

test('R25-04 GIUNZIONE (CLI, Windows): un dentro che porta fuori dal progetto si rifiuta, cartella o file', async (t) => {
  const { base, radice, disco } = progetto(t);
  try { symlinkSync(join(base, 'fuori'), join(radice, 'giunz'), 'junction'); } catch (e) { t.skip(`collegamento non creabile: ${e.code}`); return; }
  for (const dentro of ['giunz', 'giunz/x.txt']) {
    const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro }, { radice });
    assert.match(esito, new RegExp(`^INVALID\\. "${dentro.replace('.', '\\.')}" is not a subfolder of this workspace: it leads outside the workspace \\(through a link or a junction\\)`, 'u'));
    assert.doesNotMatch(esito, /fuori dal progetto/u);
  }
  // e una giunzione che resta DENTRO funziona, col percorso vero
  symlinkSync(join(radice, 'src', 'kernel'), join(radice, 'scorciatoia'), 'junction');
  const dentroOk = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'scorciatoia' }, { radice });
  assert.match(dentroOk, /^src\/kernel\/c\.mjs:1:AGO_R25 nel kernel$/mu);
});

test('R25-05 BINARIO: un file con un NUL si dice binario, con la via per guardarlo, e nessuna riga «binary file matches»', async (t) => {
  const { radice, disco } = progetto(t);
  for (const dentro of ['dati.bin', 'immagine.txt']) {
    const esito = await cercaNelProgetto(disco, { testo: 'AGO', dentro }, { radice });
    assert.equal(esito, `INVALID. "${dentro}" is a binary file: cerca looks for text inside text files. Inspect it with leggi format:"hex". Nothing was searched.`);
  }
  // per nome si può: un binario ha un nome come gli altri
  assert.match(await cercaNelProgetto(disco, { nome: 'dati', dentro: 'dati.bin' }, { radice }), /^dati\.bin$/mu);
});

test('R25-06 SEGRETO: dentro ".env" non mostra nessuna riga, e la nota F-S-001 lo dice', async (t) => {
  const { radice, disco } = progetto(t);
  const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: '.env' }, { radice });
  assert.doesNotMatch(esito, /API_KEY/u);
  assert.match(esito, /1 file\(s\) omitted because they hold secrets/u);
  senzaRipgrep(t, radice);
  const js = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: '.env' }, { radice });
  assert.doesNotMatch(js, /API_KEY|^\.env$/mu);
  assert.match(js, /omitted because they hold secrets/u);
});

test('R25-07 SIMILI: un percorso che non c\'è riceve i nomi vicini, mai un segreto né .git', async (t) => {
  const { radice, disco } = progetto(t);
  const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'src/a.mj' }, { radice });
  assert.match(esito, /^NOT FOUND\. "src\/a\.mj" is not a file or folder of this workspace\. Similar paths: src\/a\.mjs[,.]/u);
  const piu = await cercaNelProgetto(disco, { testo: 'x', dentro: 'srx/kernel' }, { radice });
  assert.match(piu, /Similar paths: src\/\./u, 'dall\'antenato più vicino che esiste');
  const segreti = await cercaNelProgetto(disco, { testo: 'x', dentro: '.envx' }, { radice });
  assert.doesNotMatch(segreti, /Similar paths:.*\.env\b/u, 'il nome di un file segreto non si suggerisce');
  const git = await cercaNelProgetto(disco, { testo: 'x', dentro: '.gi' }, { radice });
  assert.doesNotMatch(git, /\.git\//u);
  assert.match(git, /\.gitignore/u);
});

test('R25-08 GITIGNORE: un file del .gitignore nominato apposta si cerca, con rg e senza', async (t) => {
  const { radice, disco } = progetto(t);
  const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'build/uscita.txt' }, { radice });
  assert.match(esito, /^build\/uscita\.txt:1:AGO_R25 nel file ignorato$/mu);
  senzaRipgrep(t, radice);
  assert.match(await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'build/uscita.txt' }, { radice }), /^build\/uscita\.txt$/mu);
});

test('R25-09 .GIT: dentro .git non si cerca mai, file o cartella', async (t) => {
  const { radice, disco } = progetto(t);
  for (const dentro of ['.git', '.git/config', '.GIT/config']) {
    const esito = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro }, { radice });
    assert.match(esito, /is inside \.git, which cerca never searches\./u, dentro);
    assert.doesNotMatch(esito, /\[core\]/u);
  }
});

test('R25-10 MAIUSCOLE E \\\\?\\ (CLI, Windows): il percorso vero decide, e il confronto col progetto regge', { skip: process.platform !== 'win32' }, async (t) => {
  const { radice, disco } = progetto(t);
  const maiuscole = await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro: 'SRC/A.MJS' }, { radice });
  assert.match(maiuscole, /^src\/a\.mjs:1:export const AGO_R25 = 1;$/mu, 'il percorso in uscita è quello registrato sul disco');
  senzaRipgrep(t, radice);
  const prefisso = `\\\\?\\${radice}`;
  const conPrefisso = await cercaNelProgetto(discoVero(radice), { testo: 'AGO_R25', dentro: 'src/a.mjs' }, { radice: prefisso });
  assert.match(conPrefisso, /^src\/a\.mjs$/mu, 'una radice in forma \\\\?\\ non fa sembrare «fuori» un file che sta dentro');
});

test('R25-11 T-13 resta: «..» e gli assoluti si rifiutano come prima', async (t) => {
  const { radice, disco } = progetto(t);
  for (const dentro of ['../fuori', 'src/../../fuori/x.txt', radice]) {
    assert.match(await cercaNelProgetto(disco, { testo: 'AGO_R25', dentro }, { radice }), /^INVALID\. ".*" is not a subfolder of this workspace: `dentro` takes a folder or file INSIDE the workspace/u);
  }
});
