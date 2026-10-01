import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { risolviPercorsi, creaAvvioFiglio, scegliPortaEffimera, scegliPortaPersistente, validaHandshake, urlIngresso } from '../runtime.mjs';
import { scegliMotoreLocale } from '../runtime.mjs';

const percorsiR03 = { root: resolve('r'), server: resolve('r/server.mjs'), bootstrap: resolve('r/child-bootstrap.mjs'), localRuntime: { cpu: resolve('cpu/llama-server.exe'), vulkan: resolve('vulkan/llama-server.exe') } };
test('PREFS-PORT-FILE — one OS-assigned port is retained per isolated desktop profile', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-pref-origin-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'desktop-origin.json');
  const first = await scegliPortaPersistente(file);
  assert.ok(first > 1023 && first !== 4174);
  assert.equal(await scegliPortaPersistente(file), first);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 1, port: first });
  writeFileSync(file, '{invalid', 'utf8');
  await assert.rejects(scegliPortaPersistente(file), /origine|porta|file/u);
});
test('PREFS-LEGACY-LOG: the latest valid own startup record pins the former origin without merging profiles', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-pref-legacy-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'desktop-origin.json');
  const log = join(dir, 'registro.log');
  const row = (time, port) => `${time} Servizio locale avviato: pid 123, porta ${port}, generazione 1.\n`;
  writeFileSync(log + '.precedente', row('2026-09-27T10:00:00.000Z', 49501));
  writeFileSync(log, row('2026-09-28T10:00:00.000Z', 49502) +
    '2026-09-29T10:00:00.000Z Servizio locale avviato: pid 123, porta 4174, generazione 1.\n' +
    '2026-09-29T11:00:00.000Z user text Servizio locale avviato: pid 123, porta 49503, generazione 1.\n');
  assert.equal(await scegliPortaPersistente(file), 49502);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 1, port: 49502 });
  writeFileSync(file, '{invalid');
  await assert.rejects(scegliPortaPersistente(file), /origine|porta|file/u);
});
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
  assert.equal(p.casaLinux, resolve('risorse/casa-linux/linux-x64'), 'fase B: i binari per Linux stanno nelle risorse, come llama');
  assert.equal(risolviPercorsi({ appPath }).casaLinux, undefined);
  assert.equal(risolviPercorsi({ appPath, isPackaged: true, resourcesPath: resolve('risorse'), harnessDir: resolve('dichiarato') }).casaLinux, undefined);
});

test('CASA-LINUX-AMBIENTE — installato: il server riceve TALOS_CASA_LINUX; dal sorgente resta quello dell ambiente (o nessuno)', () => {
  const base = { execPath: resolve('Electron.exe'), port: 49152, token: 'a'.repeat(64), dataDir: resolve('profilo') };
  const installato = creaAvvioFiglio({ ...base, percorsi: { ...percorsiR03, casaLinux: resolve('risorse/casa-linux/linux-x64') }, env: { TALOS_CASA_LINUX: 'vecchio' } });
  assert.equal(installato.options.env.TALOS_CASA_LINUX, resolve('risorse/casa-linux/linux-x64'), 'il pacchetto vince su un valore ereditato');
  assert.equal(creaAvvioFiglio({ ...base, percorsi: percorsiR03, env: {} }).options.env.TALOS_CASA_LINUX, undefined);
  assert.equal(creaAvvioFiglio({ ...base, percorsi: percorsiR03, env: { TALOS_CASA_LINUX: 'dichiarato' } }).options.env.TALOS_CASA_LINUX, 'dichiarato');
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

test('F63-APRI-FUORI: solo https://github.com/… va nel browser del sistema; al contrario ogni altra cosa resta chiusa', async () => {
  const { apribileNelBrowserDelSistema } = await import('../runtime.mjs');
  for (const si of ['https://github.com/talos-private/agent-virtual-machine/pull/13', 'https://github.com/x/y/actions/runs/1/job/2', 'https://github.com/login/device']) {
    assert.equal(apribileNelBrowserDelSistema(si), true, si);
  }
  for (const no of [
    'http://github.com/x/y/pull/1', 'https://github.com.evil.example/x', 'https://evil.example/github.com/x', 'https://gist.github.com/x',
    'https://user:pass@github.com/x', 'https://github.com:8443/x', 'file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)',
    'ms-settings:privacy', 'C:\\Windows\\System32\\calc.exe', '', null, 'non un indirizzo',
  ]) {
    assert.equal(apribileNelBrowserDelSistema(no), false, String(no));
  }
});

/*
 * ⛔ 01/10/2026, owner: «la app desktop non apre il browser per accedere a openrouter». Il guscio mandava fuori solo github.com,
 *   e `https://openrouter.ai/auth?…` (PO-01, `openrouter-oauth.mjs`) moriva nel `deny`. Passa SOLO la pagina d'accesso, esatta:
 *   il resto di openrouter.ai, e ogni sosia, resta chiuso come prima.
 * ⛔ E il RITORNO dev'essere il nostro: quella pagina CONCEDE una chiave. Un link nella chat (un modello manipolato lo può
 *   scrivere) verso `openrouter.ai/auth` con un `callback_url` altrui farebbe arrivare il codice a un estraneo, che lo
 *   scambierebbe per una chiave a spese della persona. ⇒ Fuori solo senza ritorno (codice a schermo: lo vede solo la persona)
 *   o col ritorno sul server locale di QUESTA app (`base`), sulla rotta `/api/v1/auth/openrouter/ritorno`.
 */
test('OPENROUTER-ACCESSO: la pagina d accesso di OpenRouter va nel browser del sistema; nient altro di openrouter.ai', async () => {
  const { apribileNelBrowserDelSistema } = await import('../runtime.mjs');
  const base = 'http://127.0.0.1:61234';
  const ritorno = (r) => `https://openrouter.ai/auth?callback_url=${encodeURIComponent(r)}&code_challenge=SFIDA&code_challenge_method=S256`;
  for (const si of [
    ritorno(`${base}/api/v1/auth/openrouter/ritorno/ABC`),
    ritorno(`${base}/api/v1/auth/openrouter/ritorno`),
    'https://openrouter.ai/auth?code_challenge=SFIDA&code_challenge_method=S256&key_label=TALOS',
  ]) {
    assert.equal(apribileNelBrowserDelSistema(si, { base }), true, si);
  }
  for (const no of [
    'https://openrouter.ai/', 'https://openrouter.ai/settings/keys', 'https://openrouter.ai/auth/altro', 'https://openrouter.ai/authx',
    'http://openrouter.ai/auth', 'https://openrouter.ai:8443/auth', 'https://u:p@openrouter.ai/auth', 'https://www.openrouter.ai/auth',
    'https://openrouter.ai.evil.example/auth', 'https://evil.example/openrouter.ai/auth', 'https://evil.example/auth?openrouter.ai',
    // il ritorno non è il nostro
    ritorno('https://evil.example/api/v1/auth/openrouter/ritorno/ABC'),
    ritorno('http://127.0.0.1:61235/api/v1/auth/openrouter/ritorno/ABC'),
    ritorno(`${base}@evil.example/api/v1/auth/openrouter/ritorno/ABC`), // comincia con `base`, ma l'host è evil.example
    ritorno(`${base}/api/v1/sessions`),
    ritorno(`${base}/api/v1/auth/openrouter/ritorno/ABC/altro`),
    ritorno('non un indirizzo'),
    `${ritorno(`${base}/api/v1/auth/openrouter/ritorno/ABC`)}&callback_url=${encodeURIComponent('https://evil.example/x')}`,
  ]) {
    assert.equal(apribileNelBrowserDelSistema(no, { base }), false, no);
  }
  // senza `base` (guscio non ancora pronto) un ritorno non si può verificare: resta chiuso; il codice a schermo no
  assert.equal(apribileNelBrowserDelSistema(ritorno(`${base}/api/v1/auth/openrouter/ritorno/ABC`)), false);
  assert.equal(apribileNelBrowserDelSistema('https://openrouter.ai/auth?code_challenge=S&code_challenge_method=S256&key_label=TALOS'), true);
});

test('F5-NAV-CORNICE: una cornice di pagina resa naviga solo dentro il suo lasciapassare; le altre cornici non si toccano', async () => {
  const { navigazioneCorniceConsentita } = await import('../runtime.mjs');
  const base = 'http://127.0.0.1:41234';
  const g = 'A'.repeat(43);
  const pagina = `${base}/api/v1/pagine/${g}/index.html`;
  assert.equal(navigazioneCorniceConsentita(base, pagina, `${base}/api/v1/pagine/${g}/guida/index.html`), true, 'un link interno');
  assert.equal(navigazioneCorniceConsentita(base, pagina, 'https://esterno.example/?dati=segreti'), false, 'verso internet');
  assert.equal(navigazioneCorniceConsentita(base, pagina, `${base}/api/v1/pagine/${'B'.repeat(43)}/x.html`), false, 'verso un altro lasciapassare');
  assert.equal(navigazioneCorniceConsentita(base, pagina, `${base}/api/v1/sessions`), false, 'verso il resto dell\'API');
  assert.equal(navigazioneCorniceConsentita(base, pagina, 'javascript:alert(1)'), false);
  assert.equal(navigazioneCorniceConsentita(base, pagina, 'non un indirizzo'), false);
  assert.equal(navigazioneCorniceConsentita(base, `${base}/api/v1/pagine//index.html`, `${base}/api/v1/pagine//x`), false, 'senza lasciapassare');
  // cornici che NON sono pagine rese: il Browser di TALOS, una cornice appena creata
  assert.equal(navigazioneCorniceConsentita(base, 'https://sito.example/', 'https://altro.example/'), true);
  assert.equal(navigazioneCorniceConsentita(base, 'about:blank', pagina), true, 'la prima navigazione della cornice verso la pagina');
  assert.equal(navigazioneCorniceConsentita(base, '', 'https://x.example/'), true);
});
