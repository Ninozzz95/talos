/*
 * Uscita di riparazione, giro 2 (12/11/2026, revisore C «blocca 3»; giudice v1686) — FUORI DA WINDOWS NON CAMBIA NIENTE.
 * La prima cura leggeva `\cartella\file` come un percorso senza disco anche su Linux, Android e macOS, dove la barra rovescia è
 * un carattere qualunque di un nome: 724 chiamate su 73.728 rispondevano diverso dalla 0.2.1 (rifiuti e divieti in più).
 * `path-policy.mjs` legge `process.platform` e `node:path` da sé: qui se ne fa un GEMELLO a parole in una cartella temporanea
 * (`node:path` → `node:path/posix`, `process.platform` → 'linux'), come ha fatto il revisore, e gli si chiedono le risposte che dà
 * la 0.2.1. `cancellazioni-critiche.mjs` prende la piattaforma per argomento: lì si prova il modulo vero.
 * Le attese sono quelle della base 5e9fdc1b9 (misurate col gemello della base il 12/11/2026): la prova è verde sulla base, rossa
 * sulla prima cura 985ff74ba. Il disco non si tocca: i percorsi sono solo parole e le letture sono finte.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BS = String.fromCharCode(92);
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-gemello-')));
mkdirSync(join(radice, 'src', 'kernel'), { recursive: true });
/* 0.2.4: `path-policy.mjs` legge `$'…'` col lettore unico del nucleo (`kernel/apici-ansi-c.mjs`, soli builtin): va nel gemello anche lui */
for (const nome of ['path-policy.mjs', 'forme-di-segreto.mjs', 'kernel/apici-ansi-c.mjs']) {
  const testo = readFileSync(join(SRC, nome), 'utf8');
  writeFileSync(join(radice, 'src', nome), testo.replaceAll("from 'node:path'", () => "from 'node:path/posix'").replaceAll('process.platform', () => "'linux'"));
}
const linux = await import(pathToFileURL(join(radice, 'src', 'path-policy.mjs')).href);
test.after(async () => { await rimuoviCartellaDiProvaAttesa(radice); });

const enoent = () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
const fsFinto = { lstatSync: enoent, readlinkSync: enoent };
const CASA = '/home/u';
const PROGETTO = '/home/u/proj';
const BLOCCATI = ['/home/u/proj/privata', '/blocc', '/mnt/c/Users/u/Documents'];
const tale = (p) => p;
const letta = (tipo, testo, cartella = PROGETTO, casa = CASA) => linux.credenzialeDellaCasaLetta({ tipo, ...(tipo === 'shell' ? { comando: testo } : { percorso: testo }), cartella, home: casa, fsSync: fsFinto, statFn: enoent, elencaFn: () => [] });
const bloccata = (percorso, cartella = PROGETTO) => linux.bloccataDa(percorso, { cartella, bloccati: BLOCCATI, realpathFn: tale });
const nomina = (comando, cartella = PROGETTO) => linux.comandoNominaUnaBloccata(comando, { cartella, bloccati: BLOCCATI, realpathFn: tale });
const scrive = (percorso, cartella = PROGETTO) => linux.scritturaDiUnaCredenziale(percorso, { cartella, home: CASA, realpathFn: tale });

test('FUORI-W1 — su Linux una barra rovescia in testa è un nome qualunque: nessuna cartella bloccata in più, nessuna scrittura vietata in più', () => {
  for (const nome of [`${BS}foo`, `${BS}a${BS}b`, `${BS}.ssh${BS}id_ed25519`, `${BS}blocc${BS}dato.txt`]) {
    assert.equal(bloccata(nome), null, `bloccataDa: ${nome}`);
    for (const comando of [`cat ${nome}`, `head -n 3 ${nome}`, `cp ${nome} /tmp/fuori`, `scp ${nome} host:/tmp/`, `bash -lc "cat ${nome}"`, `less ${nome}`]) {
      assert.equal(nomina(comando), null, `comandoNominaUnaBloccata: ${comando}`);
    }
    assert.equal(scrive(nome), null, `scritturaDiUnaCredenziale: ${nome}`);
    /* (non dalla cartella `/`: su Windows il gemello chiederebbe al disco `/\a\b`, che lì è un indirizzo di rete) */
    for (const cartella of ['/a/proj', '/sdcard/Documents/proj', '/data/data/ai.talos.dev/files/home/proj']) {
      assert.equal(bloccata(nome, cartella), null, `bloccataDa da ${cartella}: ${nome}`);
      assert.equal(scrive(nome, cartella), null, `scritturaDiUnaCredenziale da ${cartella}: ${nome}`);
    }
  }
});

test('FUORI-W2 — su Linux «a:/…» e «/a/…» non sono un disco: nessuna carta di credenziale in più', () => {
  for (const [tipo, testo] of [['leggi', 'a:/../.ssh/id_ed25519'], ['elenca', 'a:/../.ssh/id_ed25519'], ['shell', 'cat a:/../.ssh/id_ed25519'], ['shell', 'cp a:/../.ssh/id_ed25519 /tmp/fuori'],
    ['shell', 'scp a:/../.ssh/id_ed25519 host:/tmp/'], ['shell', 'bash -lc "cat a:/../.ssh/id_ed25519"'], ['shell', 'less a:/../.ssh/id_ed25519'],
    ['leggi', '/a/../.ssh/id_ed25519'], ['shell', 'cat /a/../.ssh/id_ed25519'], ['leggi', '/a/../.npmrc'], ['shell', 'cat /a/../.npmrc']]) {
    assert.equal(letta(tipo, testo, CASA), null, `${tipo} da ${CASA}: ${testo}`);
    assert.equal(letta(tipo, testo), null, `${tipo} da ${PROGETTO}: ${testo}`);
  }
  /* le grafie che su Windows sono la casa o un disco, su Linux sono nomi qualunque: `%HOMEPATH%`, le graffe di PowerShell, le barre doppie dopo «a:» */
  for (const [tipo, testo] of [['shell', 'cat %HOMEPATH%/.ssh/id_ed25519'], ['shell', `cat '\${env:HOMEPATH}/.ssh/id_ed25519'`],
    ['leggi', '%HOMEPATH%/.ssh/id_ed25519'], ['leggi', 'a://../.ssh/id_ed25519'], ['shell', 'cat a://../.ssh/id_ed25519']]) {
    assert.equal(letta(tipo, testo, CASA), null, `${tipo} da ${CASA}: ${testo}`);
  }
  /* col processo NELLA casa: «a://…» resta un indirizzo (le barre doppie non si uniscono), e «x:rel» resta un nome, non un disco */
  const cwdVera = process.cwd;
  process.cwd = () => CASA;
  try {
    assert.equal(letta('leggi', 'a://../.ssh/id_ed25519', CASA), null, 'a://… col processo nella casa');
    assert.equal(letta('shell', 'cat a://../.ssh/id_ed25519', CASA), null, 'cat a://… col processo nella casa');
    assert.equal(scrive('x:../.ssh/authorized_keys', CASA), null, 'x:rel su Linux è un nome: nessuna scrittura vietata in più');
    /* e «/a/…» ha UNA lettura, la cartella `/a`: non anche un disco `a:` risolto sulla cartella del processo */
    assert.equal(letta('leggi', '/a/../.ssh/id_ed25519'), null, '/a/… col processo nella casa');
    assert.equal(letta('shell', 'cat /a/../.ssh/id_ed25519'), null, 'cat /a/… col processo nella casa');
  } finally { process.cwd = cwdVera; }
  /* e un comando con tanti `cd` non diventa «troppo complesso»: fuori da Windows gli spostamenti non si contano */
  const tanti = `${Array.from({ length: 20 }, (_, i) => `cd /srv/dati/c${i}`).join(' && ')} && cat nota.txt`;
  assert.equal(letta('shell', tanti), null, 'venti spostamenti: nessuna carta');
});

test('FUORI-W3 — AL CONTRARIO: il gemello di Linux protegge ancora ciò che proteggeva (credenziale, scrittura, cartella bloccata)', () => {
  for (const [tipo, testo] of [['leggi', '/home/u/.ssh/id_ed25519'], ['shell', 'cat /home/u/.ssh/id_ed25519'], ['shell', 'cat ~/.ssh/id_ed25519'], ['leggi', '../.ssh/id_ed25519'], ['shell', 'cat ../.npmrc']]) {
    assert.equal(letta(tipo, testo)?.credenzialeDellaCasa, true, `${tipo}: ${testo}`);
  }
  assert.deepEqual(scrive('/home/u/.ssh/authorized_keys'), { percorso: '/home/u/.ssh/authorized_keys' });
  assert.deepEqual(scrive('../.ssh/authorized_keys'), { percorso: '/home/u/.ssh/authorized_keys' });
  assert.deepEqual(bloccata('/blocc/dato.txt'), { radice: '/blocc' });
  assert.deepEqual(bloccata('privata/dato.txt'), { radice: '/home/u/proj/privata' });
  assert.deepEqual(nomina('cat /blocc/dato.txt'), { radice: '/blocc' });
  assert.deepEqual(nomina('cat /mnt/c/Users/u/Documents/nota.txt'), { radice: '/mnt/c/Users/u/Documents' });
  assert.equal(nomina('cat src/app.js'), null);
});
