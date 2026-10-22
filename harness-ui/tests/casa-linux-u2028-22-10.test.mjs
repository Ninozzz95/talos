/*
 * 22/10/2026 — U+2028 e U+2029 sul canale della casa Linux (stesso difetto del giornale delle sessioni, `kernel/riga-json.mjs`). Il
 * cliente e il servente leggono le righe con `readline`, che li prende per fine riga: un file con U+2028 spezzava la risposta del
 * servente, e la richiesta di scriverlo spezzava la richiesta — nei due casi le metà non si leggono e la chiamata resta appesa.
 * Il cliente si prova con un processo finto che legge come il servente (`readline`); il servente si prova VERO, col Node di Windows.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { creaCasaLinux } from '../src/kernel/casa-linux.mjs';
import { rigaJson } from '../src/kernel/riga-json.mjs';

const SEPARATORI = 'riga\u2028paragrafo\u2029fine';
const SERVENTE = fileURLToPath(new URL('../src/kernel/casa-linux-servente.mjs', import.meta.url));

/* Un processo finto che legge stdin come il servente VERO (`readline`) e risponde con `rigaJson`. */
function processoComeIlServente(ricevuti) {
  const spawnFn = () => {
    const p = new EventEmitter();
    p.stdin = new PassThrough();
    p.stdout = new PassThrough();
    p.stderr = new PassThrough();
    p.kill = () => { p.emit('exit', null); p.stdout.end(); setImmediate(() => p.emit('close', null)); };
    createInterface({ input: p.stdin }).on('line', (riga) => {
      let m;
      try { m = JSON.parse(riga); } catch { ricevuti.push({ illeggibile: riga }); return; }
      ricevuti.push(m);
      if (m.id !== undefined) p.stdout.write(rigaJson({ id: m.id, ok: true, valore: m.args?.testo ?? null }));
    });
    setImmediate(() => p.stdout.write(rigaJson({ pronto: true, node: 'v24' })));
    return p;
  };
  return spawnFn;
}

test('CASA-U2028-01 — il cliente manda un testo con U+2028/U+2029 in UNA riga: il servente la legge intera e la risposta torna', async () => {
  const ricevuti = [];
  const casa = creaCasaLinux({ distro: 'Ubuntu', node: 'C:\\n', rg: 'C:\\rg', env: {}, spawnFn: processoComeIlServente(ricevuti) });
  try {
    const valore = await Promise.race([casa.chiama('discoScrivi', { radice: '/tmp', percorso: 'f.txt', testo: SEPARATORI }),
      new Promise((_ok, no) => { setTimeout(() => no(new Error('APPESA: la richiesta spezzata non si legge')), 3_000).unref(); })]);
    assert.equal(valore, SEPARATORI);
    assert.equal(ricevuti.filter((m) => m.illeggibile !== undefined).length, 0, `righe illeggibili: ${JSON.stringify(ricevuti)}`);
    assert.equal(ricevuti.find((m) => m.op === 'discoScrivi')?.args?.testo, SEPARATORI);
  } finally {
    casa.chiudi?.();
  }
});

test('CASA-U2028-02 — il servente VERO risponde in UNA riga anche per un file con U+2028/U+2029 (letto come lo legge il cliente)', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-casa-u2028-'));
  writeFileSync(join(cartella, 'f.txt'), SEPARATORI, 'utf8');
  const figlio = spawn(process.execPath, [SERVENTE], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  /* prima si ferma il servente (un processo figlio che legge nella cartella), POI la cartella: rimozione nuda, classe B di BC-09 */
  t.after(async () => {
    figlio.stdin.end();
    if (figlio.exitCode === null) await new Promise((ok) => { figlio.once('close', ok); figlio.kill(); });
    rmSync(cartella, { recursive: true, force: true });
  });
  const righe = [];
  const illeggibili = [];
  const risposta = new Promise((ok) => {
    createInterface({ input: figlio.stdout }).on('line', (riga) => {
      let m;
      try { m = JSON.parse(riga); } catch { illeggibili.push(riga); return; }
      righe.push(m);
      if (m.pronto) figlio.stdin.write(rigaJson({ id: 1, op: 'discoLeggi', args: { radice: cartella, percorso: 'f.txt' } }));
      if (m.id === 1) ok(m);
    });
  });
  const esito = await Promise.race([risposta, new Promise((_ok, no) => { setTimeout(() => no(new Error(`APPESA: nessuna risposta leggibile; illeggibili ${JSON.stringify(illeggibili)}`)), 20_000).unref(); })]);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.ok(JSON.stringify(esito.valore).includes('\\u2028') || String(esito.valore?.testo ?? esito.valore).includes('\u2028'), `il testo del file torna: ${JSON.stringify(esito.valore).slice(0, 200)}`);
  assert.deepEqual(illeggibili, []);
});
