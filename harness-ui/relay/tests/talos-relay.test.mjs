import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { BINARI, VERSIONE, binarioPer } from '../src/binari.mjs';
import { comandoTar, installa, percorsiDelBinario } from '../src/installa.mjs';
import { gettone, impostazioni, indirizzo, testoConfigurazione } from '../src/configurazione.mjs';

/*
 * 18/10/2026 — R5.9, talos-relay (owner: «gettone nell'indirizzo»). Il binario si accetta solo con peso e impronta fissati; la
 * configurazione ammette solo chi ha il gettone e non apre la porta delle metriche; l'indirizzo stampato porta il gettone.
 */
const esegui = promisify(execFile);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const qui = dirname(fileURLToPath(import.meta.url));

async function archivioFinto(radice, { contenuto = 'binario-finto', nome = 'iroh-relay' } = {}) {
  const sorgente = join(radice, 'sorgente', `iroh-relay-${VERSIONE}-finto`);
  await mkdir(sorgente, { recursive: true });
  await writeFile(join(sorgente, nome), contenuto);
  const archivio = join(radice, 'finto.tar.gz');
  await esegui(comandoTar(), ['-czf', archivio, '-C', join(radice, 'sorgente'), `iroh-relay-${VERSIONE}-finto`]);
  const byte = await readFile(archivio);
  return { byte, binario: { file: 'finto.tar.gz', byte: byte.length, sha256: sha256(byte), url: 'https://esempio.invalid/finto.tar.gz', eseguibile: 'iroh-relay' } };
}

function fetchFinto(byte, { stato = 200 } = {}) {
  const chiamate = [];
  const f = async (url) => { chiamate.push(url); return { ok: stato === 200, status: stato, arrayBuffer: async () => byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.length) }; };
  f.chiamate = chiamate;
  return f;
}

async function cartella(t) {
  const c = await mkdtemp(join(tmpdir(), 'talos-relay-'));
  t.after(() => rm(c, { recursive: true, force: true }));
  return c;
}

test('REL-01 il binario giusto per la macchina, con impronta e peso fissati; una piattaforma senza build ufficiale lo dice', () => {
  assert.equal(binarioPer('win32', 'x64').file, `iroh-relay-${VERSIONE}-x86_64-pc-windows-msvc.zip`);
  assert.equal(binarioPer('win32', 'x64').eseguibile, 'iroh-relay.exe');
  assert.match(binarioPer('linux', 'x64').file, /x86_64-unknown-linux-musl\.tar\.gz$/, 'Linux sempre musl, statico');
  assert.match(binarioPer('linux', 'arm64').file, /aarch64-unknown-linux-musl/);
  assert.equal(binarioPer('darwin', 'arm64').eseguibile, 'iroh-relay');
  assert.equal(binarioPer('linux', 'x64').url, `https://github.com/n0-computer/iroh/releases/download/${VERSIONE}/${BINARI['linux-x64'].file}`);
  for (const v of Object.values(BINARI)) { assert.match(v.sha256, /^[0-9a-f]{64}$/); assert.ok(v.byte > 3_000_000); }
  assert.equal(BINARI['win32-x64'].sha256, '2064308ca7df288d68eef89c80c194afe5038d85888c87079147dca862195a01', 'misurato sul file il 17/10');
  assert.throws(() => binarioPer('freebsd', 'x64'), { code: 'RELAY_PLATFORM' });
  assert.equal(comandoTar('win32', {}), 'C:\\Windows\\System32\\tar.exe', 'su Windows il bsdtar di sistema, mai il GNU tar di Git');
  assert.equal(comandoTar('win32', { SystemRoot: 'D:\\Win' }), 'D:\\Win\\System32\\tar.exe');
  assert.equal(comandoTar('linux', {}), 'tar');
});

test('REL-02 scarica una volta, controlla, estrae col tar del sistema e registra l\'impronta; al secondo avvio non scarica', async (t) => {
  const c = await cartella(t);
  const { byte, binario } = await archivioFinto(c);
  const f = fetchFinto(byte);
  const primo = await installa(join(c, 'dati'), { fetch: f, binario });
  assert.equal(primo.scaricato, true);
  assert.equal(await readFile(primo.eseguibile, 'utf8'), 'binario-finto');
  const dove = percorsiDelBinario(join(c, 'dati'), binario);
  assert.equal((await readFile(dove.impronta, 'utf8')).trim(), sha256('binario-finto'));
  assert.deepEqual((await readdir(dove.cartella)).filter((n) => n.startsWith('.estrai-')), [], 'nessun resto dell\'estrazione');
  const secondo = await installa(join(c, 'dati'), { fetch: f, binario });
  assert.deepEqual([secondo.scaricato, f.chiamate.length], [false, 1]);
});

test('REL-03 al contrario: impronta sbagliata, peso sbagliato o HTTP fallito — rifiutato, e niente arriva sul disco', async (t) => {
  const c = await cartella(t);
  const { byte, binario } = await archivioFinto(c);
  const dati = join(c, 'dati');
  await assert.rejects(installa(dati, { fetch: fetchFinto(byte), binario: { ...binario, sha256: '0'.repeat(64) } }), { code: 'RELAY_DOWNLOAD_HASH' });
  await assert.rejects(installa(dati, { fetch: fetchFinto(byte), binario: { ...binario, byte: binario.byte + 1 } }), { code: 'RELAY_DOWNLOAD_SIZE' });
  await assert.rejects(installa(dati, { fetch: fetchFinto(byte, { stato: 404 }), binario }), { code: 'RELAY_DOWNLOAD' });
  await assert.rejects(readdir(join(dati, 'bin')), { code: 'ENOENT' }, 'nemmeno la cartella del binario');
});

test('REL-04 un binario cambiato sul disco dopo l\'installazione non si esegue: si riscarica, e lo dice', async (t) => {
  const c = await cartella(t);
  const { byte, binario } = await archivioFinto(c);
  const f = fetchFinto(byte);
  const avvisi = [];
  const { eseguibile } = await installa(join(c, 'dati'), { fetch: f, binario });
  await writeFile(eseguibile, 'manomesso');
  const r = await installa(join(c, 'dati'), { fetch: f, binario, avvisa: (m) => avvisi.push(m) });
  assert.deepEqual([r.scaricato, f.chiamate.length, await readFile(eseguibile, 'utf8')], [true, 2, 'binario-finto']);
  assert.match(avvisi[0], /changed on disk/);
});

test('REL-05 un archivio senza l\'eseguibile atteso si rifiuta e non lascia resti', async (t) => {
  const c = await cartella(t);
  const { byte, binario } = await archivioFinto(c, { nome: 'altro' });
  const dati = join(c, 'dati');
  await assert.rejects(installa(dati, { fetch: fetchFinto(byte), binario }), { code: 'RELAY_ARCHIVE' });
  assert.deepEqual(await readdir(join(dati, 'bin')), []);
});

test('REL-06 la configurazione: solo col gettone, metriche spente, Let\'s Encrypt o certificato proprio; in --dev solo 127.0.0.1', () => {
  const g = 'abc"\\def';
  const le = testoConfigurazione({ dominio: 'relay.esempio.it', email: 'me@esempio.it' }, { gettone: g, cartella: '/dati' });
  for (const riga of ['enable_metrics = false', 'enable_quic_addr_discovery = true', 'access.shared_token = ["abc\\"\\\\def"]', '[tls]', 'cert_mode = "LetsEncrypt"', 'hostname = "relay.esempio.it"', 'contact = "me@esempio.it"']) {
    assert.ok(le.split('\n').includes(riga), `manca: ${riga}\n${le}`);
  }
  assert.ok(le.indexOf('access.shared_token') < le.indexOf('[tls]'), 'la chiave puntata sta prima della tabella, o finirebbe dentro [tls]');
  const manuale = testoConfigurazione({ dominio: 'relay.esempio.it', certificato: 'c.pem', chiave: 'k.pem' }, { gettone: 'g', cartella: '/dati' });
  assert.match(manuale, /cert_mode = "Manual"\nmanual_cert_path = ".*c\.pem"\nmanual_key_path = ".*k\.pem"/);
  assert.doesNotMatch(manuale, /LetsEncrypt|contact/);
  const dev = testoConfigurazione({ dev: true, porta: 3391 }, { gettone: 'g', cartella: '/dati' });
  assert.match(dev, /http_bind_addr = "127\.0\.0\.1:3391"/);
  assert.doesNotMatch(dev, /\[tls\]/);
  assert.match(dev, /enable_metrics = false/);
});

test('REL-07 le impostazioni: si ricordano fra un avvio e l\'altro; senza dominio, con un dominio storto o senza contatto non si parte', async (t) => {
  const c = await cartella(t);
  await assert.rejects(impostazioni(c, {}), { code: 'RELAY_ARGS', message: /--domain/ });
  await assert.rejects(impostazioni(c, { dominio: 'non un dominio' }), { code: 'RELAY_ARGS' });
  await assert.rejects(impostazioni(c, { dominio: 'relay.esempio.it' }), { code: 'RELAY_ARGS', message: /--email/ });
  await assert.rejects(impostazioni(c, { dominio: 'relay.esempio.it', certificato: 'c.pem' }), { code: 'RELAY_ARGS', message: /--key/ });
  await assert.rejects(impostazioni(c, { dev: true, porta: '70000' }), { code: 'RELAY_ARGS' });
  await impostazioni(c, { dominio: 'relay.esempio.it', email: 'me@esempio.it' });
  assert.deepEqual(await impostazioni(c, {}), { dominio: 'relay.esempio.it', email: 'me@esempio.it' });
});

test('REL-08 il gettone: lungo, sempre lo stesso finché non si ruota; l\'indirizzo lo porta', async (t) => {
  const c = await cartella(t);
  const g = await gettone(c);
  assert.match(g, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await gettone(c), g);
  const nuovo = await gettone(c, { nuovo: true });
  assert.notEqual(nuovo, g);
  assert.equal(await gettone(c), nuovo);
  assert.equal(indirizzo({ dominio: 'relay.esempio.it' }, 'a+b'), 'https://relay.esempio.it/?token=a%2Bb');
  assert.equal(indirizzo({ dev: true, porta: 3340 }, 'x'), 'http://127.0.0.1:3340/?token=x');
});

test('REL-09 la riga di comando: aiuto, comando sconosciuto, «address» prima del primo avvio', async (t) => {
  const c = await cartella(t);
  const bin = join(qui, '..', 'bin', 'talos-relay.mjs');
  const corri = (args) => esegui(process.execPath, [bin, ...args], { env: { ...process.env, TALOS_RELAY_DIR: c } }).then((r) => ({ codice: 0, ...r }), (e) => ({ codice: e.code, stdout: e.stdout, stderr: e.stderr }));
  const aiuto = await corri(['--help']);
  assert.equal(aiuto.codice, 0);
  assert.match(aiuto.stdout, /--domain relay\.example\.com --email/);
  assert.equal((await corri(['boh'])).codice, 2);
  const indirizzoPrima = await corri(['address']);
  assert.equal(indirizzoPrima.codice, 1);
  assert.match(indirizzoPrima.stderr, /not been started/);
  const senzaDominio = await corri([]);
  assert.equal(senzaDominio.codice, 1);
  assert.match(senzaDominio.stderr, /--domain/);
});
