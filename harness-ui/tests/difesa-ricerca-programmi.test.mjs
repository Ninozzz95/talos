/*
 * ⛔⛔⛔ 17/09/2026 — un workspace che contiene un `git.exe` NON deve poterlo far eseguire a TALOS.
 *
 * La prova mette in scena il caso vero con un finto INNOCUO (una copia di `whoami.exe`): un
 * processo Node nato SENZA `NoDefaultCurrentDirectoryInExePath` lancia `git` per nome con `cwd` =
 * la cartella che contiene il finto.
 * ⛔ Il genitore della misura si lancia QUI con un ambiente ripulito: la shell da cui girano le
 *   suite può avere già la variabile (quella di Claude Code ce l'ha a 1), e allora la prova
 *   passerebbe per conto suo — è esattamente come la mia prima sonda ha detto «tutto bene».
 * ⛔ Il verso contrario sta NELLA prova: senza la difesa il finto DEVE girare, altrimenti questa
 *   prova non sta misurando niente (una macchina dove il difetto non esiste la renderebbe verde
 *   per sempre, con o senza la cura).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { VARIABILE_DIFESA_RICERCA, attivaDifesaRicercaProgrammi } from '../src/difesa-ricerca-programmi.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WHOAMI = 'C:/Windows/System32/whoami.exe';
const suWindows = process.platform === 'win32' && existsSync(WHOAMI);
const DIFESA = pathToFileURL(join(import.meta.dirname, '../src/difesa-ricerca-programmi.mjs')).href;

function lanciaGitDaUnGenitoreSenzaVariabile(t, { conLaDifesa }) {
  const cartella = mkdtempSync(join(tmpdir(), 'difesa-ricerca-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  copyFileSync(WHOAMI, join(cartella, 'git.exe'));
  const figlio = join(cartella, 'genitore.mjs');
  writeFileSync(figlio, [
    conLaDifesa ? `await import(${JSON.stringify(DIFESA)});` : '// nessuna difesa: è il verso contrario',
    "const { spawnSync } = await import('node:child_process');",
    `const r = spawnSync('git', [], { cwd: ${JSON.stringify(cartella)}, encoding: 'utf8', windowsHide: true });`,
    "console.log(JSON.stringify({ uscita: ((r.stdout || '') + (r.stderr || '')).trim().split('\\n')[0], errore: r.error?.code ?? null }));",
  ].join('\n'));
  const env = { ...process.env };
  delete env[VARIABILE_DIFESA_RICERCA];
  const r = spawnSync(process.execPath, [figlio], { env, encoding: 'utf8', cwd: tmpdir(), windowsHide: true });
  assert.equal(r.status, 0, `il genitore di prova è caduto: ${r.stderr}`);
  return JSON.parse(r.stdout.trim());
}

const eIlGitVero = (uscita) => /^usage: git|^git version/i.test(uscita);

test('DIFESA-RICERCA-01 — con la difesa, `git` per nome dentro un workspace col suo `git.exe` è il git VERO', { skip: !suWindows && 'solo Windows: altrove la cartella di lavoro non entra nella ricerca' }, (t) => {
  const { uscita, errore } = lanciaGitDaUnGenitoreSenzaVariabile(t, { conLaDifesa: true });
  assert.ok(errore === null || errore === 'ENOENT', `errore inatteso: ${errore}`);
  if (errore === 'ENOENT') return; // nessun git installato: niente da dirottare, e il finto NON è stato scelto
  assert.ok(eIlGitVero(uscita), `⛔ ha girato il programma del WORKSPACE: ${JSON.stringify(uscita)}`);
});

test('DIFESA-RICERCA-02 — AL CONTRARIO: senza la difesa il finto gira davvero (la prova sa mordere)', { skip: !suWindows && 'solo Windows' }, (t) => {
  const { uscita } = lanciaGitDaUnGenitoreSenzaVariabile(t, { conLaDifesa: false });
  assert.ok(!eIlGitVero(uscita) && uscita.length > 0,
    `su questa macchina il difetto non si riproduce: la DIFESA-RICERCA-01 non sta misurando niente — ${JSON.stringify(uscita)}`);
});

test('DIFESA-RICERCA-03 — la funzione non calpesta una scelta già fatta, e il server la importa per PRIMO', async () => {
  assert.equal(attivaDifesaRicercaProgrammi({}), '1');
  assert.equal(attivaDifesaRicercaProgrammi({ [VARIABILE_DIFESA_RICERCA]: 'gia-scelta' }), 'gia-scelta');
  const { readFileSync } = await import('node:fs');
  const server = readFileSync(join(import.meta.dirname, '../server.mjs'), 'utf8');
  const primoImport = server.split('\n').find((riga) => /^import\s/.test(riga));
  assert.match(primoImport, /difesa-ricerca-programmi\.mjs/,
    '⛔ la difesa va importata PRIMA di ogni altro modulo: un modulo che lancia qualcosa mentre si carica la troverebbe spenta');
});
