import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { risolviPercorsi, creaAvvioFiglio, scegliPortaEffimera, validaHandshake, urlIngresso } from '../runtime.mjs';

test('R01-PERCORSI — sorgente, risorse confezionate e percorso dichiarato indipendenti dal cwd', () => {
  const appPath = resolve('prodotto/desktop');
  assert.equal(risolviPercorsi({ appPath }).server, resolve('prodotto/server.mjs'));
  assert.equal(risolviPercorsi({ appPath, isPackaged: true, resourcesPath: resolve('risorse') }).server, resolve('risorse/harness-ui/server.mjs'));
  assert.equal(risolviPercorsi({ appPath, harnessDir: resolve('dichiarato') }).server, resolve('dichiarato/server.mjs'));
  assert.throws(() => risolviPercorsi({ appPath, harnessDir: 'relativo' }), /assoluto/);
  assert.throws(() => risolviPercorsi({ appPath, isPackaged: true }), /risorse/);
});

test('R01-AMBIENTE — eseguibile Electron, segreto solo in ambiente e porta esplicita sicura', () => {
  const token = 'a'.repeat(64);
  const percorsi = risolviPercorsi({ appPath: resolve('desktop') });
  const avvio = creaAvvioFiglio({ execPath: resolve('Electron.exe'), percorsi, port: 49152, token, reportFile: resolve('report.json'), dataDir: resolve('profilo'), env: { PATH: 'sistema', NODE_OPTIONS: '--inspect=4174', TALOS_PACKAGED_NODE: 'node', TALOS_HARNESS_UI_PORT: '4174', ELECTRON_RUN_AS_NODE: '0' } });
  assert.equal(avvio.command, resolve('Electron.exe'));
  assert.equal(avvio.options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(avvio.options.env.TALOS_HARNESS_UI_PORT, '49152');
  assert.equal(avvio.options.env.TALOS_HARNESS_UI_HOST, '127.0.0.1');
  assert.equal(avvio.options.env.TALOS_HARNESS_UI_SESSIONS_DIR, join(resolve('profilo'), 'sessions'));
  assert.equal(avvio.options.env.NODE_OPTIONS, undefined);
  assert.equal(avvio.options.env.TALOS_PACKAGED_NODE, undefined);
  assert.equal(avvio.options.env.TALOS_HARNESS_UI_TOKEN, token);
  assert.ok(!JSON.stringify(avvio.args).includes(token));
  assert.equal(avvio.options.shell, false);
  assert.equal(avvio.options.windowsHide, true);
  assert.throws(() => creaAvvioFiglio({ execPath: 'node', percorsi, port: 4174, token }), /porta|eseguibile/);
});

test('R01-HANDSHAKE — ammette soltanto la porta richiesta sul loopback canonico', async () => {
  const port = await scegliPortaEffimera();
  assert.ok(port > 1023 && port !== 4174);
  assert.equal(validaHandshake({ host: '127.0.0.1', port }, port), `http://127.0.0.1:${port}`);
  for (const dati of [null, {}, { host: 'example.com', port }, { host: '127.0.0.1', port: 4174 }, { host: '127.0.0.1', port: port + 1 }]) assert.throws(() => validaHandshake(dati, port));
  assert.equal(new URL(urlIngresso(`http://127.0.0.1:${port}`, 'b'.repeat(64))).pathname, '/');
  assert.throws(() => urlIngresso('https://example.com', 'b'.repeat(64)));
});
