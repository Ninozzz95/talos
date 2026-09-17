import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { desktopProfile, previewBuildConfiguration } from '../profile.mjs';
import { creaAvvioFiglio, risolviPercorsi } from '../runtime.mjs';
import { avvolgiAdattatoreKeyring, leggiScopePortachiavi } from '../../src/adattatore-keyring.mjs';
import { createProviderCredentialStore } from '../../src/provider-credential-store.mjs';

const options = { appData: 'C:\\Users\\Person\\AppData\\Roaming', platform: 'win32' };
test('ISOL: production identity, storage and keyring remain compatible', () => {
  const p = desktopProfile(options);
  assert.equal(p.name, 'TALOS'); assert.equal(p.appId, 'it.talos.desktop');
  assert.equal(p.keyringScope, 'desktop'); assert.equal(p.dataDir, options.appData + '\\TALOS');
  assert.equal(p.sessionData, p.dataDir); assert.equal(p.preview, false);
});
test('ISOL: package metadata isolates direct preview EXE launch without launcher variables', () => {
  const p = desktopProfile({ ...options, metadata: { talosProfile: 'preview' } });
  assert.equal(p.name, 'TALOS Preview'); assert.equal(p.appId, 'it.talos.desktop.preview');
  assert.equal(p.keyringScope, 'desktop-preview'); assert.equal(p.dataDir, options.appData + '\\TALOS Preview');
  assert.equal(p.sessionData, p.dataDir + '\\browser');
});
test('ISOL: a packaged preview cannot be downgraded through environment', () => {
  assert.throws(() => desktopProfile({ ...options, metadata: { talosProfile: 'preview' }, env: { TALOS_DESKTOP_PROFILE: 'production' } }));
});
for (const value of ['prod', 'PREVIEW', 'preview-other', ' ']) test(`ISOL: invalid profile rejects, never silently chooses production: ${JSON.stringify(value)}`, () => {
  assert.throws(() => desktopProfile({ ...options, env: { TALOS_DESKTOP_PROFILE: value } }));
  assert.throws(() => desktopProfile({ ...options, metadata: { talosProfile: value } }));
});
for (const dir of [options.appData + '\\TALOS', options.appData + '\\talos\\preview', options.appData, 'C:\\']) test(`ISOL: preview refuses overlapping stable data ${dir}`, () => {
  assert.throws(() => desktopProfile({ ...options, metadata: { talosProfile: 'preview' }, env: { TALOS_DESKTOP_DATA_DIR: dir } }), /sovrapporsi/);
});
test('ISOL: a separate absolute test profile is allowed, relative paths are refused', () => {
  const p = desktopProfile({ ...options, metadata: { talosProfile: 'preview' }, env: { TALOS_DESKTOP_DATA_DIR: 'D:\\Tests\\Isolated' } });
  assert.equal(p.dataDir, 'D:\\Tests\\Isolated');
  assert.throws(() => desktopProfile({ ...options, env: { TALOS_DESKTOP_DATA_DIR: './shared' } }), /assoluta/);
});
test('ISOL: child process receives explicit scope rather than an inherited attacker/default value', () => {
  const p = risolviPercorsi({ appPath: resolve('app') });
  const options = { execPath: resolve('Electron.exe'), percorsi: p, port: 49152, token: 'a'.repeat(64), dataDir: resolve('preview'), keyringScope: 'desktop-preview', env: { TALOS_HARNESS_UI_KEYRING_SCOPE: 'desktop' } };
  assert.equal(creaAvvioFiglio(options).options.env.TALOS_HARNESS_UI_KEYRING_SCOPE, 'desktop-preview');
  assert.throws(() => creaAvvioFiglio({ ...options, keyringScope: 'typo' }), /Scope/);
});
test('ISOL: preview build bakes identity and source while production config remains unchanged', () => {
  assert.equal(previewBuildConfiguration(undefined), null);
  const c = previewBuildConfiguration('preview', 'a'.repeat(40));
  assert.equal(c.extraMetadata.talosProfile, 'preview'); assert.equal(c.extraMetadata.talosSourceCommit, 'a'.repeat(40));
  assert.equal(c.appId, 'it.talos.desktop.preview'); assert.equal(c.directories.output, 'dist-preview');
  assert.match(c.win.artifactName, /aaaaaaa/);
  assert.throws(() => previewBuildConfiguration('preview', 'main'));
  assert.throws(() => previewBuildConfiguration('typo', 'a'.repeat(40)));
});
test('ISOL: keyring get/set/remove touch preview namespace only', () => {
  const data = new Map([['service-desktop:user', 'production'], ['service:user', 'development']]);
  const adapter = { get: (service, account) => data.get(`${service}:${account}`) ?? null,
    set: (service, account, value) => data.set(`${service}:${account}`, value), remove: (service, account) => data.delete(`${service}:${account}`) };
  const k = avvolgiAdattatoreKeyring(adapter, leggiScopePortachiavi({ TALOS_HARNESS_UI_KEYRING_SCOPE: 'desktop-preview' }));
  assert.equal(k.get('service', 'user'), null); k.set('service', 'user', 'preview');
  assert.equal(k.get('service', 'user'), 'preview'); k.remove('service', 'user');
  assert.equal(data.get('service-desktop:user'), 'production'); assert.equal(data.get('service:user'), 'development');
  assert.throws(() => avvolgiAdattatoreKeyring(adapter, 'typo'));
});
test('ISOL: provider preview store does not expose production or environment credentials', () => {
  const services = []; const data = new Map();
  const adapter = { get: (s,a) => { services.push(s); return data.get(`${s}:${a}`) ?? null; }, set: (s,a,v) => data.set(`${s}:${a}`,v), remove: (s,a) => data.delete(`${s}:${a}`) };
  const scope = leggiScopePortachiavi({ TALOS_HARNESS_UI_KEYRING_SCOPE: 'desktop-preview' });
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'private-environment-value' }, keyring: avvolgiAdattatoreKeyring(adapter, scope), ignoraSemiAmbiente: scope !== null });
  store.loadFromKeyring();
  assert.ok(services.length > 0); assert.ok(services.every(s => s.endsWith('-desktop-preview')));
  assert.ok(!JSON.stringify(store.listPublic()).includes('private-environment-value'));
});
test('ISOL: runtime bootstrap composes preview no-migration policy and guards destructive cleanup', () => {
  const server = readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(server, /if \(scopePortachiavi === 'desktop'\)\s*\{\s*try\s*\{\s*const migrazione/);
  assert.match(main, /if \(profile.preview && process.argv.includes\('--talos-pulizia-dati'\)\)/);
  assert.ok(main.indexOf("app.setPath('sessionData'") < main.indexOf('app.requestSingleInstanceLock('));
});
