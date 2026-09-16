import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { risolviPercorsi, creaAvvioFiglio, scegliPortaEffimera, validaHandshake, urlIngresso } from '../runtime.mjs';
import { scegliMotoreLocale } from '../runtime.mjs';

const percorsiR03 = { root: resolve('r'), server: resolve('r/server.mjs'), bootstrap: resolve('r/child-bootstrap.mjs'), localRuntime: { cpu: resolve('cpu/llama-server.exe'), vulkan: resolve('vulkan/llama-server.exe') } };
test('R03-DISPOSITIVI — Vulkan solo con un dispositivo enumerato, sonda limitata e senza shell', () => {
  const scelta = scegliMotoreLocale({ percorsi: percorsiR03, env: {}, sonda: (p, args, options) => {
    assert.deepEqual(args, ['--list-devices']); assert.equal(options.shell, false); assert.ok(options.timeout > 0 && options.timeout <= 15000);
    return { status: 0, stdout: 'Available devices:\n  Vulkan0: AMD Radeon RX 9070 XT (16304 MiB, 15416 MiB free)\n' };
  } });
  assert.equal(scelta.variante, 'vulkan'); assert.equal(scelta.percorso, percorsiR03.localRuntime.vulkan);
  assert.deepEqual(scelta.dispositivi, ['AMD Radeon RX 9070 XT']);
});
for (const [nome, risultato] of Object.entries({ nessuno: { status: 0, stdout: 'Available devices:\n  (none)' }, vuoto: { status: 0 }, soloLog: { status: 0, stderr: 'ggml_vulkan: Found 1 Vulkan devices:' }, errore: { status: 1, stdout: 'Vulkan0: vecchio' }, timeout: { status: null, error: { code: 'ETIMEDOUT' } } })) {
  test('R03-NESSUNO-SONDA-GUASTA — ' + nome + ' sceglie CPU', () => {
    const scelta = scegliMotoreLocale({ percorsi: percorsiR03, env: {}, sonda: p => p === percorsiR03.localRuntime.cpu ? { status: 0 } : risultato });
    assert.equal(scelta.variante, 'cpu'); assert.equal(scelta.percorso, percorsiR03.localRuntime.cpu); assert.ok(scelta.motivo);
  });
}
test('R03-MANUALE — scelta rispettata anche se senza dispositivi o con sonda fallita', () => {
  for (const preferenza of ['cpu', 'vulkan']) {
    const scelta = scegliMotoreLocale({ percorsi: percorsiR03, env: {}, preferenza, sonda: () => ({ status: 1 }) });
    assert.equal(scelta.variante, preferenza); assert.match(scelta.motivo, /manuale/);
  }
});
test('R03-AMBIENTE — fallback solo per Vulkan, nessuna contaminazione fra riavvii', () => {
  const env = { TALOS_LLAMA_SERVER_FALLBACK_PATH: 'vecchio' };
  for (const variante of ['vulkan', 'cpu']) {
    const avvio = creaAvvioFiglio({ execPath: resolve('Electron.exe'), percorsi: percorsiR03, port: 49152, token: 'a'.repeat(64), dataDir: resolve('profilo'), env,
      motoreLocale: { percorso: percorsiR03.localRuntime[variante], variante, dispositivi: [], motivo: 'prova' } });
    assert.equal(avvio.options.env.TALOS_LLAMA_SERVER_PATH, percorsiR03.localRuntime[variante]);
    assert.equal(avvio.options.env.TALOS_LLAMA_SERVER_FALLBACK_PATH, variante === 'vulkan' ? percorsiR03.localRuntime.cpu : undefined);
  }
  assert.deepEqual(env, { TALOS_LLAMA_SERVER_FALLBACK_PATH: 'vecchio' });
});

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
  // ⛔ (16/09/2026) — il figlio riceve sempre lo scope desktop: namespace `-desktop` nel
  // portachiavi e semi d'ambiente ignorati (`src/adattatore-keyring.mjs`).
  assert.equal(avvio.options.env.TALOS_HARNESS_UI_KEYRING_SCOPE, 'desktop');
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

test('R02-PERCORSI — binari inclusi nelle risorse e scoperta sorgente conservata', () => {
  const appPath = resolve('risorse/app');
  const p = risolviPercorsi({ appPath, isPackaged: true, resourcesPath: resolve('risorse') });
  assert.deepEqual(p.localRuntime, { cpu: resolve('risorse/local-runtime/cpu/llama-server.exe'), vulkan: resolve('risorse/local-runtime/vulkan/llama-server.exe') });
  assert.equal(risolviPercorsi({ appPath }).localRuntime, undefined);
});

test('R02-MOTORE — Vulkan verificato, ripiego CPU e override esplicito', async () => {
  const { scegliMotoreLocale } = await import('../runtime.mjs');
  const percorsi = { localRuntime: { cpu: resolve('cpu/llama-server.exe'), vulkan: resolve('vulkan/llama-server.exe') } };
  // R-03 (13/09): la scelta è un oggetto e Vulkan vale solo se `--list-devices` elenca una scheda;
  // uno «status 0» senza dispositivi NON basta più (la build Vulkan esce 0 anche senza GPU).
  assert.equal(scegliMotoreLocale({ percorsi, env: {}, sonda: p => ({ status: 0, stdout: p === percorsi.localRuntime.vulkan ? 'Available devices:\n  Vulkan0: Scheda di prova (16304 MiB, 15416 MiB free)\n' : '' }) }).percorso, percorsi.localRuntime.vulkan);
  assert.equal(scegliMotoreLocale({ percorsi, env: {}, sonda: () => ({ status: 0, stdout: 'Available devices:\n  (none)\n' }) }).percorso, percorsi.localRuntime.cpu);
  assert.equal(scegliMotoreLocale({ percorsi, env: {}, sonda: p => ({ status: p === percorsi.localRuntime.cpu ? 0 : 1, stdout: '' }) }).variante, 'cpu');
  assert.throws(() => scegliMotoreLocale({ percorsi, env: {}, sonda: () => ({ status: 1 }) }), /motore/i);
  const manuale = scegliMotoreLocale({ percorsi, env: { TALOS_LLAMA_SERVER_PATH: resolve('manuale.exe') }, sonda: () => { throw Error('Non deve sondare override.'); } });
  assert.equal(manuale.percorso, resolve('manuale.exe')); assert.equal(manuale.variante, 'personalizzato');
  assert.equal(scegliMotoreLocale({ percorsi: {}, env: {} }), undefined);
});
