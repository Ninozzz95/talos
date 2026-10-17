/*
 * ⭐ 14/10/2026 (owner, alla sessione mobile: «Modulo nostro») — IL PORTACHIAVI DI UN MODULO ESTERNO: `TALOS_HARNESS_UI_KEYRING=
 * modulo:<percorso assoluto di un .mjs>`. Chiuso per difetto: ogni guasto è un errore d'avvio col suo codice, mai un ripiego sulla
 * memoria o sul sistema. Ogni regola nei due versi.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PORTACHIAVI_MEMORIA, SCOPE_DESKTOP, avvolgiAdattatoreKeyring, creaAdattatorePortachiavi, leggiPortachiaviDiProva, leggiSceltaPortachiavi,
} from '../src/adattatore-keyring.mjs';
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-portachiavi-modulo-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const BUONO = `
export function creaPortachiavi({ env }) {
  const voci = new Map();
  globalThis.__portachiaviVisti = { env: env.SEGNO_DI_PROVA ?? null, chiamate: (globalThis.__portachiaviVisti?.chiamate ?? 0) + 1, servizi: [] };
  const k = (s, a) => s + '\\u0000' + a;
  return {
    get: (s, a) => { globalThis.__portachiaviVisti.servizi.push(s); return voci.has(k(s, a)) ? voci.get(k(s, a)) : (a === 'numero' ? 42 : undefined); },
    set: (s, a, v) => { voci.set(k(s, a), v); },
    remove: (s, a) => { voci.delete(k(s, a)); },
    extra: () => 'non esce',
  };
}
`;
const codice = (e) => e?.code;

test('KEYRING-MODULO-01 — la scelta: niente, «memoria», «modulo:<assoluto .mjs esistente>»; tutto il resto è un errore d\'avvio col codice', (t) => {
  const c = cartella(t);
  const file = join(c, 'portachiavi.mjs');
  writeFileSync(file, BUONO);
  assert.equal(leggiSceltaPortachiavi({}), null);
  assert.equal(leggiSceltaPortachiavi({ TALOS_HARNESS_UI_KEYRING: '' }), null);
  assert.equal(leggiSceltaPortachiavi({ TALOS_HARNESS_UI_KEYRING: ' memoria ' }), PORTACHIAVI_MEMORIA);
  assert.deepEqual(leggiSceltaPortachiavi({ TALOS_HARNESS_UI_KEYRING: `modulo:${file}` }), { modulo: file });
  // la custodia di PROVA è solo «memoria»: un modulo non lo è
  assert.equal(leggiPortachiaviDiProva({ TALOS_HARNESS_UI_KEYRING: `modulo:${file}` }), false);
  assert.equal(leggiPortachiaviDiProva({ TALOS_HARNESS_UI_KEYRING: 'memoria' }), true);
  // AL CONTRARIO: percorsi che non vanno
  for (const [valore, atteso] of [
    ['modulo:', 'KEYRING_MODULE_PATH_INVALID'],
    ['modulo:portachiavi.mjs', 'KEYRING_MODULE_PATH_INVALID'],
    ['modulo:./portachiavi.mjs', 'KEYRING_MODULE_PATH_INVALID'],
    [`modulo:${file}\u0000x`, 'KEYRING_MODULE_PATH_INVALID'],
    [`modulo:${join(c, 'portachiavi.js')}`, 'KEYRING_MODULE_PATH_INVALID'],
    [`modulo:${join(c, 'manca.mjs')}`, 'KEYRING_MODULE_MISSING'],
    [`modulo:${c}`, 'KEYRING_MODULE_PATH_INVALID'],
  ]) {
    assert.throws(() => leggiSceltaPortachiavi({ TALOS_HARNESS_UI_KEYRING: valore }), (e) => codice(e) === atteso, valore);
    assert.throws(() => leggiPortachiaviDiProva({ TALOS_HARNESS_UI_KEYRING: valore }), (e) => codice(e) === atteso, `prova: ${valore}`);
  }
  assert.throws(() => leggiSceltaPortachiavi({ TALOS_HARNESS_UI_KEYRING: 'sistema' }), (e) => /accepts "memoria", "modulo:/u.test(e.message));
});

test('KEYRING-MODULO-02 — un modulo buono: chiamato una volta con l\'ambiente, solo i tre metodi escono, `get` senza stringa = null, lo scope si applica sopra', async (t) => {
  const c = cartella(t);
  const file = join(c, 'portachiavi.mjs');
  writeFileSync(file, BUONO);
  delete globalThis.__portachiaviVisti;
  const env = { TALOS_HARNESS_UI_KEYRING: `modulo:${file}`, SEGNO_DI_PROVA: 'visto' };
  const adattatore = await creaAdattatorePortachiavi(env);
  assert.deepEqual(Object.keys(adattatore).sort(), ['get', 'remove', 'set']);
  assert.equal(globalThis.__portachiaviVisti.chiamate, 1);
  assert.equal(globalThis.__portachiaviVisti.env, 'visto', 'creaPortachiavi riceve l\'ambiente');
  assert.equal(adattatore.get('s', 'a'), null);
  adattatore.set('s', 'a', 'segreto');
  assert.equal(adattatore.get('s', 'a'), 'segreto');
  adattatore.remove('s', 'a');
  adattatore.remove('s', 'a'); // idempotente
  assert.equal(adattatore.get('s', 'a'), null);
  assert.equal(adattatore.get('s', 'numero'), null, 'un valore che non è una stringa non è una chiave');
  // lo scope sopra, come negli altri modi
  const conScope = avvolgiAdattatoreKeyring(adattatore, SCOPE_DESKTOP);
  conScope.get('talos-harness-provider', 'zai');
  assert.equal(globalThis.__portachiaviVisti.servizi.at(-1), 'talos-harness-provider-desktop');
});

test('KEYRING-MODULO-03 — AL CONTRARIO: ogni modulo sbagliato ferma l\'avvio col suo codice (mai un ripiego)', async (t) => {
  const c = cartella(t);
  const casi = [
    ['default.mjs', 'export default function creaPortachiavi() { return { get() {}, set() {}, remove() {} }; }', 'KEYRING_MODULE_INVALID'],
    ['niente.mjs', 'export const altro = 1;', 'KEYRING_MODULE_INVALID'],
    ['lancia.mjs', 'export function creaPortachiavi() { throw new Error("no"); }', 'KEYRING_MODULE_FAILED'],
    ['promessa.mjs', 'export async function creaPortachiavi() { return { get() {}, set() {}, remove() {} }; }', 'KEYRING_MODULE_INVALID'],
    // un «thenable» CON i tre metodi: la forma passerebbe, ma chi lo riceve con `await` otterrebbe un'altra cosa
    ['thenable.mjs', 'export function creaPortachiavi() { return { get() {}, set() {}, remove() {}, then(r) { r(null); } }; }', 'KEYRING_MODULE_INVALID'],
    ['forma.mjs', 'export function creaPortachiavi() { return { get() {}, set() {} }; }', 'KEYRING_MODULE_INVALID'],
    ['nulla.mjs', 'export function creaPortachiavi() { return null; }', 'KEYRING_MODULE_INVALID'],
    ['sintassi.mjs', 'export function creaPortachiavi( {', 'KEYRING_MODULE_LOAD_FAILED'],
  ];
  for (const [nome, sorgente, atteso] of casi) {
    const file = join(c, nome);
    writeFileSync(file, sorgente);
    await assert.rejects(creaAdattatorePortachiavi({ TALOS_HARNESS_UI_KEYRING: `modulo:${file}` }), (e) => codice(e) === atteso, nome);
  }
});

const RADICE = fileURLToPath(new URL('..', import.meta.url));
async function portaLibera() {
  const s = createServer();
  await new Promise((fatto) => s.listen(0, '127.0.0.1', fatto));
  const { port } = s.address();
  await new Promise((fatto) => s.close(fatto));
  return port;
}
/** Il server VERO con un portachiavi a modulo: ciò che ha scritto e se è uscito, fino a «disponibile» o all'uscita. */
async function avviaConModulo(t, sorgenteDelModulo) {
  /* ⛔ I `t.after` girano nell'ordine in cui si registrano (misurato, Node v24.18.0, 14/10/2026): `cartella(t)` qui avrebbe
     cancellato la cartella PRIMA di fermare il server, e una prova fallita col server vivo restava appesa per sempre (la corsa
     dei mutanti si è fermata così). Una pulizia sola: prima il server, con una scadenza, poi la cartella. ⛔ E il MODULO sta
     dentro la stessa cartella: in una cartella a parte si cancellava prima che il server che l'aveva caricato fosse morto del
     tutto (EPERM sotto carico, suite intera di r4 del 14/10 notte). */
  const radice = mkdtempSync(join(tmpdir(), 'talos-portachiavi-modulo-'));
  const file = join(radice, 'portachiavi.mjs');
  writeFileSync(file, sorgenteDelModulo);
  const temp = join(radice, 'temp');
  mkdirSync(temp, { recursive: true });
  mkdirSync(join(radice, 'workspace'), { recursive: true });
  const env = {
    ...process.env,
    TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(await portaLibera()), TALOS_HARNESS_UI_TOKEN: '',
    TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'),
    TALOS_DESKTOP_DATA_DIR: join(radice, 'desktop'), TALOS_HARNESS_UI_KEYRING: `modulo:${file}`, TALOS_HARNESS_UI_KEYRING_SCOPE: '',
    TALOS_SCRATCH_DIR: join(radice, 'scratch'), TEMP: temp, TMP: temp, TMPDIR: temp,
  };
  const figlio = spawn(process.execPath, ['server.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  const uscita = new Promise((fatto) => figlio.once('exit', fatto));
  // il server si ferma e si ASPETTA (al più 15 s) prima della pulizia: una cartella con un server vivo dentro non si cancella
  const ferma = async () => {
    if (figlio.exitCode !== null || figlio.signalCode !== null) return;
    figlio.kill();
    await Promise.race([uscita, delay(15_000)]);
  };
  /* ⛔ 16/10/2026, cancelli della 0.1.31 sulla replica: EPERM nella pulizia, 1 corsa su 24 a 8 copie, col server già uscito e nessun
     figlio vivo (sonda). `rmSync` non ritenta MAI su EPERM (misurato, `aiuto-rimozione-ritentativi.test.mjs`); `rm` asincrona sì. ⇒ la
     via asincrona: 40 su 40 a 8 copie, e una volta l'avviso «RimozioneDiProvaRitentata» — il blocco c'è stato ed è stato recuperato. */
  t.after(async () => { await ferma(); await rimuoviCartellaDiProvaAttesa(radice); }, { timeout: 60_000 });
  const scritto = { out: '', err: '' };
  figlio.stdout.on('data', (c) => { scritto.out += c; });
  figlio.stderr.on('data', (c) => { scritto.err += c; });
  for (let i = 0; i < 300 && figlio.exitCode === null; i += 1) {
    if (/Harness UI disponibile/u.test(scritto.out)) break;
    await delay(100);
  }
  return { ...scritto, uscito: figlio.exitCode, ferma };
}

test('KEYRING-MODULO-04 — il SERVER vero: con un modulo che lancia non parte e dice il codice; con un modulo buono parte', async (t) => {
  const no = await avviaConModulo(t, 'export function creaPortachiavi() { throw new Error("archivio chiuso"); }');
  assert.doesNotMatch(no.out, /Harness UI disponibile/u, 'il server NON deve partire senza la sua custodia');
  assert.notEqual(no.uscito, null, 'è uscito');
  assert.notEqual(no.uscito, 0);
  assert.match(no.out + no.err, /KEYRING_MODULE_FAILED|creaPortachiavi threw/u);
  // AL CONTRARIO
  const si = await avviaConModulo(t, BUONO);
  assert.match(si.out, /Harness UI disponibile/u, `il server non è partito: ${(si.out + si.err).slice(-1200)}`);
  await si.ferma();
});
