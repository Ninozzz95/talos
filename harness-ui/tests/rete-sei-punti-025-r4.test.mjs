/*
 * Riga 199, giro unico (punto 5, reperto A-R4; vecchio) — la condivisione amministrativa di QUESTA macchina scritta con altri nomi di
 *   loopback (`localhost.`, `127.0.0.1.`, l'indirizzo intero `2130706433`, `[::ffff:127.0.0.1]`) è il disco `C:`: una credenziale della
 *   casa scritta così si riconosce come scritta via `\\localhost\C$`. Spia chiusa: nessun `\\…` arriva al disco vero.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { scritturaDiUnaCredenziale } = await import('../src/path-policy.mjs');
const { B } = S;

const suC = { skip: (process.platform !== 'win32' || !/^C:/iu.test(homedir())) && 'solo Windows, con la casa di prova su C:' };

test('R199-R4: una credenziale della casa scritta via un altro nome di loopback della condivisione C$ si riconosce', suC, () => {
  const resto = `${homedir().slice(2)}${B}.ssh${B}id_rsa`;
  const perse = [];
  for (const nome of ['localhost', 'localhost.', 'LOCALHOST..', '127.0.0.1', '127.0.0.1.', '2130706433', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]']) {
    if (!scritturaDiUnaCredenziale(`${B}${B}${nome}${B}C$${resto}`, { cartella: homedir() })) perse.push(nome);
  }
  assert.deepEqual(perse, []);
  /* controprova: un altro computer non è la casa di questa macchina */
  assert.equal(scritturaDiUnaCredenziale(`${B}${B}2130706432x${B}C$${resto}`, { cartella: homedir() }), null);
});
