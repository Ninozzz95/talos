/*
 * R1 (seconda revisione della CLI 0.6.8, 16/10/2026, S1) — un programma PIANTATO nella cartella partiva all'avvio di un server MCP.
 * `StdioClientTransport` lancia con cross-spawn: per un nome che porta a un `.cmd` lancia `cmd.exe /c "node …"`, e `cmd.exe` cerca il
 * nome con l'ambiente del FIGLIO, dove la difesa non c'era. Due muri, ognuno basta da solo: la difesa nell'ambiente dei server MCP e
 * degli hook, e il nome risolto sul solo PATH (`risolviProgrammaSenzaCartella`) prima del trasporto. R1-05 è rossa solo senza tutti e
 * due (mutante R1b); R1-03 e R1-04 tengono ciascun muro da solo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { risolviProgrammaSenzaCartella, VARIABILE_DIFESA_RICERCA } from '../src/difesa-ricerca-programmi.mjs';
import { connettiServerMcp } from '../src/mcp-client.mjs';
import { eseguiHook } from '../src/hook-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const NOME = WINDOWS ? 'strumento.cmd' : 'strumento';
/* Windows confronta i nomi senza maiuscole: PATHEXT dà `.CMD`, il file è `.cmd`, ed è lo stesso file */
const stesso = (a, b) => (WINDOWS ? String(a).toLowerCase() === String(b).toLowerCase() : a === b);

function scena(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-r1-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const bin = join(radice, 'bin');
  mkdirSync(progetto);
  mkdirSync(bin);
  writeFileSync(join(progetto, NOME), 'piantato', { mode: 0o755 });
  writeFileSync(join(bin, NOME), 'vero', { mode: 0o755 });
  return { progetto, bin };
}

test('R1-01: a bare name resolves on PATH only — never in the current folder, never through a relative PATH entry', (t) => {
  const { progetto, bin } = scena(t);
  const sep = WINDOWS ? ';' : ':';
  const env = { PATH: ['.', '', progetto.replace(/^.*[\\/]/u, ''), bin].join(sep), PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  const corrente = process.cwd();
  process.chdir(progetto);
  try {
    const scelto = risolviProgrammaSenzaCartella('strumento', { env });
    assert.ok(stesso(scelto, join(bin, NOME)), `the PATH copy, not the planted one: ${scelto}`);
    assert.throws(() => risolviProgrammaSenzaCartella('strumento', { env: { PATH: '.', PATHEXT: env.PATHEXT } }), /not found on PATH/u,
      'only the planted copy exists: refused, not run');
  } finally { process.chdir(corrente); }
  assert.equal(risolviProgrammaSenzaCartella('./strumento', { env }), './strumento', 'an explicit path stays as written');
});

test('R1-02: AL CONTRARIO — the defect existed: cross-spawn\'s `which` picks the planted program from the current folder', { skip: !WINDOWS && 'Windows only: which checks the cwd only there' }, (t) => {
  const { progetto, bin } = scena(t);
  const require = createRequire(import.meta.url);
  const which = require('which');
  const corrente = process.cwd();
  process.chdir(progetto);
  try {
    const scelto = which.sync('strumento', { path: bin, nothrow: true });
    assert.ok(stesso(scelto, join(progetto, NOME)), `which looks in the cwd first: ${scelto}`);
  } finally { process.chdir(corrente); }
});

test('R1-03: the MCP transport gets the absolute PATH program and the defence in its environment', async () => {
  let ricevuto = null;
  class TrasportoFinto { constructor(parametri) { ricevuto = parametri; } }
  class ClientFinto { constructor() {} setRequestHandler() {} async connect() {} async close() {} }
  await connettiServerMcp({ comando: 'node', argomenti: ['srv.cjs'] }, { ClientCls: ClientFinto, TransportCls: TrasportoFinto });
  assert.equal(ricevuto.command, risolviProgrammaSenzaCartella('node'));
  assert.match(ricevuto.command, /[\\/]node(\.exe)?$/iu, ricevuto.command);
  assert.equal(ricevuto.env[VARIABILE_DIFESA_RICERCA], '1', 'the server and its children do not search the folder either');
});

test('R1-04: a hook sees the defence in its environment (it was undefined)', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-r1-hook-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'guardia.cjs'), `process.stdout.write(JSON.stringify({ consentito: process.env.${VARIABILE_DIFESA_RICERCA} === '1', motivo: String(process.env.${VARIABILE_DIFESA_RICERCA}) }))`);
  const esito = await eseguiHook({ hook: { comando: 'node guardia.cjs' }, evento: { tipo: 'pre_tool_call' }, cartella });
  assert.equal(esito.consentito, true, esito.motivo);
});

test('R1-05: the real MCP transport, started from a folder with a planted node.cmd, never runs it', { skip: !WINDOWS && 'Windows only' }, async (t) => {
  const progetto = mkdtempSync(join(tmpdir(), 'talos-r1-vero-'));
  t.after(() => rimuoviCartellaDiProva(progetto));
  const segno = join(progetto, 'PIANTATO-ESEGUITO.txt');
  writeFileSync(join(progetto, 'node.cmd'), `@echo eseguito> "${segno}"\r\n`);
  const corrente = process.cwd();
  process.chdir(progetto);
  try {
    /* `node -e` non parla MCP: la connessione fallisce, e va bene — si guarda solo QUALE programma è partito */
    await connettiServerMcp({ comando: 'node', argomenti: ['-e', 'process.exit(0)'] }).then((c) => c.chiudi(), () => null);
  } finally { process.chdir(corrente); }
  await new Promise((r) => setTimeout(r, 300));
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(segno), false, 'the planted node.cmd ran');
});

test('R1-06: a planted node.exe never runs either (cross-spawn starts the bare name and CreateProcess honours this process\'s defence)', { skip: !WINDOWS && 'Windows only' }, async (t) => {
  const progetto = mkdtempSync(join(tmpdir(), 'talos-r1-exe-'));
  t.after(() => rimuoviCartellaDiProva(progetto));
  const { copyFileSync, existsSync } = await import('node:fs');
  copyFileSync(process.execPath, join(progetto, 'node.exe')); // una copia di node: lascia il segno SOLO se gira dalla cartella del progetto
  const segno = join(progetto, 'PIANTATO-ESEGUITO.txt');
  const script = `const p=require('path');if(p.dirname(process.execPath).toLowerCase()===${JSON.stringify(progetto.toLowerCase())})require('fs').writeFileSync(${JSON.stringify(segno)},'x')`;
  const corrente = process.cwd();
  process.chdir(progetto);
  try {
    await connettiServerMcp({ comando: 'node', argomenti: ['-e', script] }).then((c) => c.chiudi(), () => null);
  } finally { process.chdir(corrente); }
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(existsSync(segno), false, 'the planted node.exe ran');
});
