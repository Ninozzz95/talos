import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, copyFileSync, symlinkSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { creaAvvioFiglio, scegliPortaEffimera, validaHandshake, urlIngresso } from '../runtime.mjs';
import { creaRegistro } from '../log.mjs';
import { preparaRuntime } from './support.mjs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { WebSocket } = require('../../node_modules/ws');
const attendi = ms => new Promise(r => setTimeout(r, ms));

test('R01-BACKEND — Electron Node, redirect, cookie, rifiuto anonimo, PTY reale, IPC e nessun orfano', { timeout: 45000 }, async t => {
  const { dataDir, runtime, env } = preparaRuntime('backend');
  const token = randomBytes(32).toString('hex');
  const port = await scegliPortaEffimera();
  const reportFile = join(dataDir, 'handshake.json');
  const avvio = creaAvvioFiglio({ execPath: require('electron'), percorsi: { root: runtime, server: join(runtime, 'server.mjs'), bootstrap: join(root, 'child-bootstrap.mjs') }, port, token, reportFile, dataDir, env });
  const proc = spawn(avvio.command, avvio.args, avvio.options);
  const registro = creaRegistro(join(dataDir, 'registro.log'), [token]);
  const uscita = registro.canale();
  proc.stdout.on('data', d => uscita.scrivi(d)); proc.stderr.on('data', d => uscita.scrivi(d));
  proc.on('close', () => uscita.fine());
  t.after(async () => {
    if (proc.exitCode === null) {
      if (proc.connected) proc.send({ tipo: 'chiudi' }, () => {});
      const timer = setTimeout(() => proc.kill(), 5500);
      await once(proc, 'exit'); clearTimeout(timer);
    }
  });
  let base;
  for (let i = 0; i < 250; i++) {
    if (proc.exitCode !== null) throw new Error('Il backend è terminato: vedere ' + join(dataDir, 'registro.log'));
    try { base = validaHandshake(JSON.parse(readFileSync(reportFile, 'utf8')), port); break; } catch {}
    await attendi(100);
  }
  assert.ok(base, 'Handshake del backend assente: ' + join(dataDir, 'registro.log'));
  assert.equal((await fetch(base + '/api/v1/health')).status, 401);
  assert.equal((await fetch(base + '/api/v1/health', { headers: { cookie: 'talos_token=errato' } })).status, 401);
  const ingresso = await fetch(urlIngresso(base, token), { redirect: 'manual' });
  assert.equal(ingresso.status, 302);
  assert.equal(ingresso.headers.get('location'), '/');
  const cookie = ingresso.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  assert.equal((await fetch(base + '/api/v1/health', { headers: { cookie } })).status, 200);
  // R-02 (server.mjs, percorsoDatiDesktop): i negozi del backend nascono nella cartella dati del guscio, non accanto a server.mjs (prima della cura .workspace-launch-token finiva dentro harness-ui/).
  assert.ok(existsSync(join(dataDir, '.workspace-launch-token')), 'il token di lancio deve stare nella cartella dati');
  assert.deepEqual(readdirSync(runtime).filter(n => n.startsWith('.')), [], 'nessun negozio accanto a server.mjs');
  const anonimo = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/terminal/ws?id=r01-anonimo', { origin: base });
  const rifiuto = await new Promise(resolve => {
    anonimo.on('unexpected-response', (_, res) => { res.resume(); anonimo.terminate(); resolve(res.statusCode); });
    anonimo.on('error', () => {});
  });
  assert.equal(rifiuto, 401);
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/terminal/ws?id=r01-prova', { origin: base, headers: { cookie } });
  t.after(() => ws.terminate());
  let testo = ''; let uscitaPty;
  const conclusa = new Promise(resolve => {
    ws.on('message', dati => {
      const frame = Buffer.from(dati);
      if (frame[0] === 0) testo += frame.subarray(1).toString();
      else if (frame[0] === 1) {
        const controllo = JSON.parse(frame.subarray(1).toString());
        if (controllo.evento === 'uscita') { uscitaPty = controllo; resolve(); }
      }
    });
  });
  await once(ws, 'open');
  await attendi(1500);
  ws.send(Buffer.concat([Buffer.from([0]), Buffer.from('echo TALOS-R01\rexit\r')]));
  let timeoutPty;
  try {
    await Promise.race([conclusa, new Promise((_, reject) => { timeoutPty = setTimeout(() => reject(new Error('Manca evento uscita PTY.')), 12000); })]);
  } finally { clearTimeout(timeoutPty); }
  assert.ok(testo.includes('TALOS-R01')); assert.equal(uscitaPty.codice, 0);
  ws.close();
  await attendi(3000);
  const misura = new Promise(resolve => proc.once('message', resolve));
  proc.send({ tipo: 'misura' });
  const memoria = await misura;
  assert.equal(memoria.versions.electron, '44.3.0');
  const exit = once(proc, 'exit'); proc.send({ tipo: 'chiudi' }); await exit;
  assert.throws(() => process.kill(proc.pid, 0), { code: 'ESRCH' });
  writeFileSync(join(root, '.prove', 'R01-backend.json'), JSON.stringify({ data: new Date().toISOString(), port, pid: proc.pid, anonimo: 401, cookie: 200, pty: { output: testo, uscita: uscitaPty }, riposoMs: 3000, faseMemoria: 'Solo backend, tre secondi dopo uscita PTY; nessun renderer', memoria, orfano: false }, null, 2));
});
