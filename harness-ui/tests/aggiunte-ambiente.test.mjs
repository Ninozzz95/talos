/*
 * Blocco 20 (01/11/2026, forma della CLI, FORMA-AGGIUNTE-AMBIENTE): un `git status` chiesto dal modello e approvato da solo partiva senza Git sicuro: il comando è del modello e riscriverlo
 * con `-c` aprirebbe a un'iniezione. La cura passa dall'ambiente, con lo stesso filtro delle credenziali.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { eseguiComandoSandboxato, ambienteSenzaCredenziali } from '../src/kernel/talosHarness.mjs';
import { ambienteGitSicuro } from '../src/kernel/git-sicuro.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const stampaVariabile = (nome) => (process.platform === 'win32' ? `echo [%${nome}%]` : `echo "[$${nome}]"`);

test('AGGIUNTE-01: una variabile qualunque arriva al comando; una credenziale no, anche passata apposta', async (t) => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-aggiunte-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const ok = await eseguiComandoSandboxato(stampaVariabile('TALOS_PROVA_AGGIUNTA'), cartella, { dove: 'windows', aggiunteAmbiente: { TALOS_PROVA_AGGIUNTA: 'arrivata' } });
  assert.match(ok.testo, /\[arrivata\]/u);
  const no = await eseguiComandoSandboxato(stampaVariabile('MIO_TOKEN'), cartella, { dove: 'windows', aggiunteAmbiente: { MIO_TOKEN: 'segreto' } });
  assert.doesNotMatch(no.testo, /segreto/u);
});

test('AGGIUNTE-02 — AL CONTRARIO: senza aggiunte l ambiente è quello di sempre; un valore che non è testo non entra', () => {
  assert.deepEqual(ambienteSenzaCredenziali(null), ambienteSenzaCredenziali());
  assert.equal('TALOS_X' in ambienteSenzaCredenziali({ TALOS_X: 1 }), false);
});

test('AGGIUNTE-04 (revisione del blocco, R10): su Windows un nome con altre maiuscole sostituisce quello che c è, non fa un doppione', { skip: process.platform !== 'win32' }, () => {
  const nome = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH');
  const altro = nome === 'PATH' ? 'path' : 'PATH';
  const ambiente = ambienteSenzaCredenziali({ [altro]: 'C:/una/cartella' });
  assert.deepEqual(Object.keys(ambiente).filter((k) => k.toUpperCase() === 'PATH'), [altro]);
  assert.equal(ambiente[altro], 'C:/una/cartella');
});

test('AGGIUNTE-03: Git vero in una cartella con core.fsmonitor ostile: con la cura il gancio non parte, senza sì', async (t) => {
  const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-aggiunte-git-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const cartella = path.join(radice, 'progetto');
  fs.mkdirSync(cartella);
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: cartella, stdio: ['ignore', 'pipe', 'pipe'] });
  const spia = path.join(radice, 'SPIA.txt');
  const aggancio = path.join(radice, 'aggancio.cjs');
  fs.writeFileSync(aggancio, `require('fs').writeFileSync(${JSON.stringify(spia)}, 'x');\n`);
  git('init', '-q');
  fs.writeFileSync(path.join(cartella, 'a.txt'), 'uno\n');
  git('add', 'a.txt');
  git('commit', '-qm', 'x');
  git('config', 'core.fsmonitor', `node "${aggancio.split(path.sep).join('/')}"`);
  fs.writeFileSync(path.join(cartella, 'a.txt'), 'due\n');
  const aggiunte = await ambienteGitSicuro(cartella, process.env);
  assert.ok(aggiunte, 'Git ha saputo dire le chiavi');
  const conCura = await eseguiComandoSandboxato('git status --porcelain', cartella, { dove: 'windows', aggiunteAmbiente: aggiunte });
  assert.match(conCura.testo, /a\.txt/u);
  assert.equal(fs.existsSync(spia), false, 'con la cura il gancio del repo non parte');
  await eseguiComandoSandboxato('git status --porcelain', cartella, { dove: 'windows' });
  assert.equal(fs.existsSync(spia), true, 'premessa: senza la cura lo stesso comando lo fa partire');
});
