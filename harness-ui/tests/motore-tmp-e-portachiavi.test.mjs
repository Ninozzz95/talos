/*
 * ⛔ Due cure del motore segnalate da Nino2 (CLI, 14/10/2026 notte) e confermate sul desktop:
 *   · `writeRuntimePreferences` scriveva sempre `<file>.tmp`: due processi (il 4174 e l'app sulla stessa cartella dati) si
 *     pestavano il temporaneo. Ora un nome per scrittura.
 *   · l'adattatore del portachiavi di SISTEMA leggeva ogni guasto come «nessuna voce» e ogni `remove` fallito come riuscito.
 *     Misurato: voce assente ⇒ `getPassword()` null e `deletePassword()` false, senza lanciare; quindi un'eccezione è un guasto
 *     vero, e ora arriva ai chiamanti (che hanno già il loro `try/catch`).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaAdattatorePortachiaviSistema } from '../src/adattatore-keyring.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('MOTORE-TMP-01 — il temporaneo delle preferenze ha un nome PER SCRITTURA: un `<file>.tmp` lasciato (o tenuto) da un altro processo non blocca la scrittura', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-motore-tmp-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const runtimeFile = join(dir, 'providers.json');
  // un altro processo «tiene» il nome fisso di prima: qui una CARTELLA con quel nome, che nessun `writeFileSync` può aprire
  mkdirSync(`${runtimeFile}.tmp`);
  const store = createProviderCredentialStore({ env: {}, runtimeFile });
  store.impostaDiSerie('openrouter', 'z-ai/glm-5.3-flash', 'open-inference', false);
  assert.deepEqual(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.openrouter.esclusiDiSerieTolti, ['z-ai/glm-5.3-flash#open-inference']);
  // AL CONTRARIO: nessun temporaneo SUO resta indietro, e quello dell'altro non è stato toccato
  assert.deepEqual(readdirSync(dir).sort(), ['providers.json', 'providers.json.tmp']);
});

test('MOTORE-PORTACHIAVI-01 — il portachiavi di sistema: una voce ASSENTE è null e la sua rimozione riesce; un GUASTO vero arriva al chiamante', { skip: process.platform !== 'win32' && 'misurato sul portachiavi di Windows' }, async () => {
  const portachiavi = await creaAdattatorePortachiaviSistema();
  const servizio = `talos-prova-voce-assente-${process.pid}-${Date.now()}`;
  assert.equal(portachiavi.get(servizio, 'nessuno'), null, 'assente: null, senza lanciare');
  assert.doesNotThrow(() => portachiavi.remove(servizio, 'nessuno'), 'rimuovere un\'assenza non è un errore');
  // AL CONTRARIO: un guasto vero (un nome oltre il limite della piattaforma, misurato `GenericFailure`) non diventa «nessuna voce»
  const troppoLungo = 'x'.repeat(40_000);
  assert.throws(() => portachiavi.get(troppoLungo, 'y'), (e) => e?.code === 'GenericFailure');
  assert.throws(() => portachiavi.remove(troppoLungo, 'y'), (e) => e?.code === 'GenericFailure');
});

test('MOTORE-PORTACHIAVI-02 — un guasto in lettura arriva al negozio delle chiavi, che lo dice («not readable») invece di tacere', () => {
  const righe = [];
  const guasto = Object.assign(new Error('the keychain is locked'), { code: 'GenericFailure' });
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => { throw guasto; }, set() {}, remove() {} }, logger: (r) => righe.push(r) });
  const esito = store.loadFromKeyring();
  assert.equal(esito.loaded, 0);
  assert.ok(righe.some((r) => /not readable from the keychain/u.test(r)), JSON.stringify(righe.slice(0, 3)));
});
