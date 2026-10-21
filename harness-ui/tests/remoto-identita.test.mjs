import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { SERVIZIO_REMOTO, creaIdentitaRemoto } from '../src/remoto/identita.mjs';
import { MINIMI, almeno, problemiDelLock } from '../native/iroh/controlla-lock.mjs';

/*
 * 18/10/2026 — controllo remoto: l'identità del PC nel portachiavi (chiave dell'endpoint e VAPID), e il controllo del Cargo.lock
 * con cui la nostra CI compila il binding iroh. Ogni prova ha il suo verso contrario.
 */
test('IDE-01 la chiave dell\'endpoint nasce una volta e poi resta la stessa', () => {
  const keyring = creaAdattatorePortachiaviInMemoria();
  const a = creaIdentitaRemoto({ keyring }).chiaveEndpoint();
  const b = creaIdentitaRemoto({ keyring }).chiaveEndpoint();
  assert.equal(a.length, 32);
  assert.deepEqual(b, a, 'riletta dal portachiavi, non rigenerata');
  const altro = creaIdentitaRemoto({ keyring: creaAdattatorePortachiaviInMemoria() }).chiaveEndpoint();
  assert.notDeepEqual(altro, a, 'un altro portachiavi = un\'altra chiave');
});

test('IDE-02 una chiave rovinata NON si rigenera in silenzio (vorrebbe dire perdere i telefoni senza dirlo)', () => {
  const keyring = creaAdattatorePortachiaviInMemoria();
  keyring.set(SERVIZIO_REMOTO, 'endpoint', Buffer.alloc(16).toString('base64url'));
  assert.throws(() => creaIdentitaRemoto({ keyring }).chiaveEndpoint(), { code: 'REMOTE_KEY_INVALID' });
  assert.equal(keyring.get(SERVIZIO_REMOTO, 'endpoint'), Buffer.alloc(16).toString('base64url'), 'la voce resta com\'era');
  keyring.set(SERVIZIO_REMOTO, 'vapid', '{"publicKey":"x"}');
  assert.throws(() => creaIdentitaRemoto({ keyring }).vapid(), { code: 'REMOTE_KEY_INVALID' });
});

test('IDE-03 la VAPID è una coppia P-256 vera (65 + 32 byte) e la pubblica corrisponde alla privata', () => {
  const keyring = creaAdattatorePortachiaviInMemoria();
  const v = creaIdentitaRemoto({ keyring }).vapid();
  assert.equal(Buffer.from(v.publicKey, 'base64url').length, 65);
  assert.equal(Buffer.from(v.privateKey, 'base64url').length, 32);
  const e = createECDH('prime256v1');
  e.setPrivateKey(Buffer.from(v.privateKey, 'base64url'));
  assert.equal(e.getPublicKey().toString('base64url'), v.publicKey);
  assert.deepEqual(creaIdentitaRemoto({ keyring }).vapid(), v, 'stessa coppia alla seconda lettura');
});

/* 20/10/2026: IDX-03 rossa una volta su ~256 — `getPrivateKey()` toglie gli zeri in testa (web-push#295). */
test('IDE-05 una privata che comincia con zero resta di 32 byte, e una già salvata da 31 si rilegge riempita, non «rovinata»', () => {
  for (let i = 0; i < 3000; i += 1) {
    const v = creaIdentitaRemoto({ keyring: creaAdattatorePortachiaviInMemoria() }).vapid();
    assert.equal(Buffer.from(v.privateKey, 'base64url').length, 32, `generazione ${i}`);
  }
  // una chiave VERA che comincia con 0x00, salvata com'era prima della cura (31 byte)
  let e;
  do { e = createECDH('prime256v1'); e.generateKeys(); } while (e.getPrivateKey().length === 32);
  const corta = e.getPrivateKey();
  const keyring = creaAdattatorePortachiaviInMemoria();
  keyring.set(SERVIZIO_REMOTO, 'vapid', JSON.stringify({ publicKey: e.getPublicKey().toString('base64url'), privateKey: corta.toString('base64url') }));
  const letta = creaIdentitaRemoto({ keyring }).vapid();
  const privata = Buffer.from(letta.privateKey, 'base64url');
  assert.equal(privata.length, 32);
  assert.deepEqual(privata.subarray(32 - corta.length), corta, 'stessa chiave, con gli zeri davanti');
  const verifica = createECDH('prime256v1');
  verifica.setPrivateKey(privata);
  assert.equal(verifica.getPublicKey().toString('base64url'), letta.publicKey, 'la coppia regge');
  // al contrario: troppo lunga, tutta zero, o troncata (revisione 20/10, D8: un byte solo, riempito, non è più la coppia) resta rovinata
  for (const privateKey of [Buffer.alloc(33, 1), Buffer.alloc(32), privata.subarray(31)]) {
    keyring.set(SERVIZIO_REMOTO, 'vapid', JSON.stringify({ publicKey: letta.publicKey, privateKey: privateKey.toString('base64url') }));
    assert.throws(() => creaIdentitaRemoto({ keyring }).vapid(), { code: 'REMOTE_KEY_INVALID' });
  }
});

test('IDE-04 senza portachiavi il remoto non parte, e lo dice', () => {
  assert.throws(() => creaIdentitaRemoto({ keyring: null }), { code: 'REMOTE_KEYRING_MISSING' });
});

const lock = (pacchetti) => `version = 4\n${pacchetti.map(([n, v]) => `\n[[package]]\nname = "${n}"\nversion = "${v}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`).join('')}`;

test('LOCK-01 il controllo rifiuta rustls 0.23.42 (il lock del pacchetto npm 1.1.0) e accetta 0.23.46', () => {
  assert.deepEqual(problemiDelLock(lock([['rustls', '0.23.42'], ['iroh', '1.0.2'], ['iroh-relay', '1.0.2']])), ['rustls 0.23.42 < 0.23.45']);
  assert.deepEqual(problemiDelLock(lock([['rustls', '0.23.46'], ['iroh', '1.0.2'], ['iroh-relay', '1.0.2']])), []);
});

test('LOCK-02 due versioni dello stesso pacchetto: basta una vecchia per rifiutare; un pacchetto assente è un problema', () => {
  assert.deepEqual(problemiDelLock(lock([['rustls', '0.23.46'], ['rustls', '0.21.12'], ['iroh', '1.0.2'], ['iroh-relay', '1.0.2']])), ['rustls 0.21.12 < 0.23.45']);
  assert.deepEqual(problemiDelLock(lock([['rustls', '0.23.46'], ['iroh', '1.0.2']])), ['iroh-relay: not in the lock']);
  assert.equal(almeno('0.23.45', MINIMI.rustls), true);
  assert.equal(almeno('0.23.100', '0.23.45'), true, 'confronto per numeri, non per testo');
  assert.equal(almeno('1.0.10', '1.0.2'), true);
  assert.equal(almeno('0.9.99', '1.0.0'), false);
});

test('LOCK-03 il lock nel repo, quello che la CI copia, passa il controllo', () => {
  const file = new URL('../native/iroh/Cargo.lock', import.meta.url);
  assert.ok(existsSync(file), 'harness-ui/native/iroh/Cargo.lock c\'è');
  assert.deepEqual(problemiDelLock(readFileSync(file, 'utf8')), []);
});
