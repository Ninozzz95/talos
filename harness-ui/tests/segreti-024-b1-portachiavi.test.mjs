/*
 * 0.2.4, block 1, item 6 (owner via the judge v1962; known limit of 0.2.2 «The automatic tests in the source code can reach the system
 * keyring used by the installed app»): the namespace of the installed app (`<service>-desktop`, `-desktop-preview`) on the SYSTEM keychain
 * opens only when this server is the one inside the installed package. From source the same scope opens `<service>-desktop-sorgente`.
 * ⛔ NOTHING here opens the real Windows keychain, not even to read: every «system» keychain is a Map marked with `segnaDiSistema`, the
 *   factory gets a fake `Entry` through `importa`, and the service names are fake (`talos-finto-024-b1-…`). Values are `FINTO-…`.
 * Red on bb6d3799a: `segnaDiSistema` and `serverDelPacchetto` do not exist, and the wrapper gave `-desktop` to anyone who asked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvolgiAdattatoreKeyring, creaAdattatorePortachiaviInMemoria, creaAdattatorePortachiaviSistema, eDiSistema, segnaDiSistema,
  serverDelPacchetto, SUFFISSO_SORGENTE } from '../src/adattatore-keyring.mjs';
import { puliziaDatiDesktop } from '../src/pulizia-dati.mjs';

const SERVIZIO = 'talos-finto-024-b1-servizio';
function sistemaFinto() {
  const voci = new Map();
  const a = segnaDiSistema({
    get: (s, u) => voci.get(`${s}|${u}`) ?? null,
    set: (s, u, v) => { voci.set(`${s}|${u}`, String(v)); },
    remove: (s, u) => { voci.delete(`${s}|${u}`); },
  });
  return { a, voci };
}

test('B1-PORTACHIAVI-01: from source (this test is plain Node), the scope «desktop» on a system keychain never reaches `-desktop`', () => {
  assert.equal(serverDelPacchetto(), false, 'a test process is not the installed package');
  const { a, voci } = sistemaFinto();
  const avvolto = avvolgiAdattatoreKeyring(a, 'desktop');
  avvolto.set(SERVIZIO, 'conto', 'FINTO-valore-1');
  assert.deepEqual([...voci.keys()], [`${SERVIZIO}-desktop${SUFFISSO_SORGENTE}|conto`]);
  assert.equal(avvolto.get(SERVIZIO, 'conto'), 'FINTO-valore-1');
  voci.set(`${SERVIZIO}-desktop|conto`, 'FINTO-dell-app-installata');
  assert.equal(avvolto.get(SERVIZIO, 'conto'), 'FINTO-valore-1', 'the entry of the installed app is not read');
  avvolto.remove(SERVIZIO, 'conto');
  assert.equal(voci.get(`${SERVIZIO}-desktop|conto`), 'FINTO-dell-app-installata', 'nor removed');
  const anteprima = sistemaFinto();
  avvolgiAdattatoreKeyring(anteprima.a, 'desktop-preview').set(SERVIZIO, 'c', 'FINTO-2');
  assert.deepEqual([...anteprima.voci.keys()], [`${SERVIZIO}-desktop-preview${SUFFISSO_SORGENTE}|c`]);
});

test('B1-PORTACHIAVI-02: inside the installed package the app keeps its namespace: `-desktop` and `-desktop-preview`, as before', () => {
  for (const [scope, suffisso] of [['desktop', '-desktop'], ['desktop-preview', '-desktop-preview']]) {
    const { a, voci } = sistemaFinto();
    avvolgiAdattatoreKeyring(a, scope, { delPacchetto: () => true }).set(SERVIZIO, 'conto', 'FINTO-3');
    assert.deepEqual([...voci.keys()], [`${SERVIZIO}${suffisso}|conto`]);
  }
});

test('B1-PORTACHIAVI-03: the keychain in memory and a host module are not the system one: the scope works as before for them', () => {
  const memoria = creaAdattatorePortachiaviInMemoria();
  assert.equal(eDiSistema(memoria), false);
  const avvolto = avvolgiAdattatoreKeyring(memoria, 'desktop');
  avvolto.set(SERVIZIO, 'c', 'FINTO-4');
  assert.equal(memoria.get(`${SERVIZIO}-desktop`, 'c'), 'FINTO-4');
  assert.equal(avvolgiAdattatoreKeyring(memoria, null), memoria, 'no scope: the keychain as it is');
});

test('B1-PORTACHIAVI-04: the package is recognised only by Electron AND the server folder beside TALOS.exe: resources/harness-ui', () => {
  /* round 2: real paths go through realpath and the package shape (`segreti-024-b1-portachiavi-giunzione.test.mjs`, on disk in the fake
     profile); here the path logic alone, with a realpath that returns the path and a disk that has the shell and no source tree */
  const disco = (p) => /[\\/]resources[\\/]app[\\/]main\.mjs$/iu.test(p);
  const win = { versions: { electron: '38.0.0' }, execPath: 'C:\\Program Files\\TALOS\\TALOS.exe', piattaforma: 'win32', tipo: undefined, reale: (p) => p, esiste: disco };
  assert.equal(serverDelPacchetto({ ...win, radice: 'C:\\Program Files\\TALOS\\resources\\harness-ui\\' }), true);
  assert.equal(serverDelPacchetto({ ...win, radice: 'c:\\program files\\talos\\RESOURCES\\harness-ui' }), true, 'Windows paths ignore case');
  for (const radice of ['C:\\T\\024-b1\\harness-ui', 'C:\\Program Files\\TALOS\\resources\\harness-ui-copia', 'C:\\Program Files\\TALOS\\harness-ui']) {
    assert.equal(serverDelPacchetto({ ...win, radice }), false, radice);
  }
  assert.equal(serverDelPacchetto({ ...win, versions: {}, radice: 'C:\\Program Files\\TALOS\\resources\\harness-ui' }), false, 'plain Node is never the package');
  assert.equal(serverDelPacchetto({ ...win, execPath: 'TALOS.exe', radice: 'C:\\Program Files\\TALOS\\resources\\harness-ui' }), false, 'a relative program path');
  const linux = { versions: { electron: '38' }, execPath: '/opt/TALOS/talos', piattaforma: 'linux', tipo: undefined, reale: (p) => p, esiste: disco };
  assert.equal(serverDelPacchetto({ ...linux, radice: '/opt/TALOS/resources/harness-ui' }), true);
  assert.equal(serverDelPacchetto({ ...linux, radice: '/OPT/TALOS/resources/harness-ui' }), false, 'POSIX keeps case');
  assert.equal(serverDelPacchetto({ ...win, radice: 'C:\\Program Files\\TALOS\\resources\\harness-ui', esiste: () => true }), false, 'a source tree inside (desktop/main.mjs) is never the package');
});

test('B1-PORTACHIAVI-05: the real factory, with a fake Entry, marks its keychain as the system one; wrapped from source it uses `-desktop-sorgente`', async () => {
  const visti = [];
  class EntryFinta {
    constructor(servizio, conto) { this.servizio = servizio; this.conto = conto; visti.push(servizio); }
    getPassword() { return null; }
    setPassword() {}
    deletePassword() { return false; }
  }
  const sistema = await creaAdattatorePortachiaviSistema({ env: {}, segno: async () => null, importa: async () => ({ Entry: EntryFinta }) });
  assert.equal(eDiSistema(sistema), true);
  const avvolto = avvolgiAdattatoreKeyring(sistema, 'desktop');
  avvolto.set(SERVIZIO, 'c', 'FINTO-5');
  avvolto.get(SERVIZIO, 'c');
  avvolto.remove(SERVIZIO, 'c');
  assert.deepEqual(visti, Array(3).fill(`${SERVIZIO}-desktop-sorgente`));
});

test('B1-PORTACHIAVI-06: the uninstall cleanup run from source never deletes the installed app\'s keys', async () => {
  const { a, voci } = sistemaFinto();
  voci.set('talos-harness-provider-desktop|openrouter', 'FINTO-chiave-dell-app');
  voci.set('talos-harness-search-desktop|brave', 'FINTO-ricerca-dell-app');
  const silenzioso = { log() {}, warn() {}, error() {}, info() {} };
  await puliziaDatiDesktop({ keyring: a, logger: silenzioso });
  assert.equal(voci.get('talos-harness-provider-desktop|openrouter'), 'FINTO-chiave-dell-app');
  assert.equal(voci.get('talos-harness-search-desktop|brave'), 'FINTO-ricerca-dell-app');
  assert.ok([...voci.keys()].every((k) => !/-desktop\|/u.test(k) || k.startsWith('talos-harness-provider-desktop|') || k.startsWith('talos-harness-search-desktop|')),
    'whatever the cleanup wrote went to -desktop-sorgente');
});
