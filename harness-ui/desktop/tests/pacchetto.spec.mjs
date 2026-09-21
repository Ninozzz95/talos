import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { root, attendi } from './support.mjs';
import { risolviPercorsi, scegliMotoreLocale, creaAvvioFiglio, scegliPortaEffimera, validaHandshake, urlIngresso } from '../runtime.mjs';
import { inventario, verificaImpronta } from '../scripts/prepara-pacchetto.mjs';
import { creaRegistro } from '../log.mjs';

test('R02-BACKEND-PACCHETTO — Electron distribuito, produzione, cookie, PTY e supervisore reali', { skip: process.env.TALOS_R02_PACCHETTO !== '1', timeout: 60000 }, async t => {
  const dist = join(root, 'dist/win-unpacked');
  const resourcesPath = join(dist, 'resources');
  const manifest = JSON.parse(readFileSync(join(resourcesPath, 'MANIFEST.json'), 'utf8'));
  for (const f of manifest.files) await verificaImpronta(join(resourcesPath, f.path), f.sha256);
  const iniziale = await inventario(dist);
  assert.equal(iniziale.some(f => /^resources\/harness-ui\/\./.test(f.path)), false, 'R02-DATI: ricostruire il pacchetto pulito prima della prova; contiene già dati persistenti.');
  const percorsi = risolviPercorsi({ appPath: join(resourcesPath, 'app'), isPackaged: true, resourcesPath });
  const require = createRequire(join(percorsi.root, 'package.json'));
  const { WebSocket } = require('ws');
  mkdirSync(join(root, '.prove'), { recursive: true });
  const dataDir = mkdtempSync(join(root, '.prove', 'pacchetto-'));
  const token = randomBytes(32).toString('hex');
  const port = await scegliPortaEffimera();
  const reportFile = join(dataDir, 'handshake.json');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/i.test(k)));
  env.TALOS_LLAMA_SERVER_PATH = scegliMotoreLocale({ percorsi, env });
  const avvio = creaAvvioFiglio({ execPath: join(dist, 'TALOS.exe'), percorsi, port, token, reportFile, dataDir, env });
  const p = spawn(avvio.command, avvio.args, avvio.options);
  const log = creaRegistro(join(dataDir, 'registro.log'), [token]).canale();
  p.stdout.on('data', d => log.scrivi(d)); p.stderr.on('data', d => log.scrivi(d)); p.on('close', () => log.fine());
  async function chiudi() {
    if (p.exitCode !== null) return;
    const exit = once(p, 'exit');
    if (p.connected) p.send({ tipo: 'chiudi' }, () => {});
    const timer = setTimeout(() => p.kill(), 6000);
    await exit; clearTimeout(timer);
  }
  t.after(chiudi);
  let base;
  for (let i = 0; i < 300; i++) {
    assert.equal(p.exitCode, null, `Backend fermo: ${dataDir}/registro.log`);
    try { base = validaHandshake(JSON.parse(readFileSync(reportFile, 'utf8')), port); break; } catch {}
    await attendi(100);
  }
  assert.ok(base, 'Handshake assente.');
  assert.equal((await fetch(base + '/api/v1/health')).status, 401);
  const ingresso = await fetch(urlIngresso(base, token), { redirect: 'manual' });
  assert.equal(ingresso.status, 302);
  const cookie = ingresso.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/);
  assert.equal((await fetch(base + '/api/v1/health', { headers: { cookie } })).status, 200);
  const r = await (await fetch(base + '/api/v1/runtime', { headers: { cookie } })).json();
  const runtime = (r.data?.items ?? r.items).find(r => r.runtimeId === 'llama.cpp');
  assert.equal(runtime?.state, 'observed'); assert.deepEqual(runtime.models, []);
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/terminal/ws?id=r02-pacchetto', { origin: base, headers: { cookie } });
  t.after(() => ws.terminate());
  let output = ''; let codice;
  const finePty = new Promise(ok => ws.on('message', b => {
    const frame = Buffer.from(b);
    if (frame[0] === 0) output += frame.subarray(1).toString();
    if (frame[0] === 1) { const c = JSON.parse(frame.subarray(1).toString()); if (c.evento === 'uscita') { codice = c.codice; ok(); } }
  }));
  await once(ws, 'open'); await attendi(1000);
  ws.send(Buffer.concat([Buffer.from([0]), Buffer.from('echo TALOS-R02-PACCHETTO\rexit\r')]));
  let timer;
  try { await Promise.race([finePty, new Promise((_, no) => { timer = setTimeout(() => no(Error('PTY senza uscita.')), 15000); })]); }
  finally { clearTimeout(timer); }
  assert.ok(output.includes('TALOS-R02-PACCHETTO')); assert.equal(codice, 0);
  ws.close(); await chiudi();
  assert.throws(() => process.kill(p.pid, 0), { code: 'ESRCH' });
  const prima = new Map(iniziale.map(f => [f.path, f.sha256]));
  const scritture = (await inventario(dist)).filter(f => prima.get(f.path) !== f.sha256).map(f => f.path);
  const misure = { data: new Date().toISOString(), port, backend: true, cookie: 200, anonimo: 401, pty: { marker: 'TALOS-R02-PACCHETTO', codice }, runtime, motore: env.TALOS_LLAMA_SERVER_PATH, orfano: false, scrittureFuoriUserData: scritture, manifestFile: manifest.files.length };
  writeFileSync(join(root, '.prove/R02-pacchetto.json'), JSON.stringify(misure, null, 2));
  await t.test('R02-DATI — nessuna scrittura persistente fuori da userData', () => assert.deepEqual(scritture, [], 'Servono i percorsi dati nel backend; diff non applicato nel rapporto.'));
});
