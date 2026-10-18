/*
 * Owner 16/10/2026 notte («Il progetto vince, ma non se È la cartella», dopo CRED-RI-04 del bugfixer): un progetto aperto DENTRO una
 * cartella di credenziali non fa chiedere in Full access le letture dei SUOI file; la cartella di credenziali fuori dal progetto chiede
 * ancora, e un progetto che È la cartella (`~/.docker`, `~/.ssh`) resta una credenziale.
 * In più (CLI, 16/10 notte): `leggi` su un hard link DENTRO il progetto verso `~/.ssh/id_ed25519` chiede in Full access col segno
 * `credenzialeDellaCasa`. La casa è FINTA (USERPROFILE/HOME su una cartella temporanea): nessun file della casa vera viene toccato.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { credenzialeDellaCasaLetta } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const casa = mkdtempSync(join(tmpdir(), 'talos-casa-finta-'));
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = casa;
process.env.HOME = casa;
mkdirSync(join(casa, '.docker', 'mio-progetto', 'src'), { recursive: true });
mkdirSync(join(casa, '.ssh'), { recursive: true });
writeFileSync(join(casa, '.docker', 'config.json'), '{"auths":{"x":{"auth":"finta"}}}');
writeFileSync(join(casa, '.docker', 'mio-progetto', 'src', 'app.js'), 'export {};\n');
writeFileSync(join(casa, '.ssh', 'id_ed25519'), 'CHIAVE FINTA\n');
const progetto = join(casa, '.docker', 'mio-progetto');
const altroProgetto = mkdtempSync(join(tmpdir(), 'talos-progetto-'));
linkSync(join(casa, '.ssh', 'id_ed25519'), join(altroProgetto, 'innocent.txt'));

test.after(async () => {
  process.env.USERPROFILE = prima.USERPROFILE;
  if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  await rimuoviCartellaDiProvaAttesa(casa);
  await rimuoviCartellaDiProvaAttesa(altroProgetto);
});

const pieno = async (azione, cartella) => {
  const chieste = [];
  const esito = await verificaPermessoScrittura(azione, { livelloAccesso: 'accesso-pieno', cartella, chiediApprovazioneFn: async (a) => { chieste.push(a); return true; } });
  return { esito, chieste };
};

test('CRED-PROG-01 — a project under ~/.docker reads its own files and runs npm test with no card in Full access', async () => {
  for (const azione of [{ tipo: 'leggi', percorso: 'src/app.js' }, { tipo: 'shell', comando: 'npm test' }, { tipo: 'shell', comando: 'type src\\app.js' }]) {
    assert.equal(credenzialeDellaCasaLetta({ ...azione, cartella: progetto, home: casa }), null, JSON.stringify(azione));
  }
});

test('CRED-PROG-02 — AL CONTRARIO: from that project, the credential folder OUTSIDE it still asks', async () => {
  for (const azione of [{ tipo: 'leggi', percorso: '../config.json' }, { tipo: 'leggi', percorso: join(casa, '.docker', 'config.json') },
    { tipo: 'shell', comando: 'type ..\\config.json' }, { tipo: 'shell', comando: 'cat ~/.ssh/id_ed25519' }]) {
    const trovata = credenzialeDellaCasaLetta({ ...azione, cartella: progetto, home: casa });
    assert.equal(trovata?.credenzialeDellaCasa, true, JSON.stringify(azione));
  }
});

test('CRED-PROG-03 — AL CONTRARIO: a project that IS the credential folder (~/.docker, ~/.ssh) stays a credential', async () => {
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: 'config.json', cartella: join(casa, '.docker'), home: casa })?.credenzialeDellaCasa, true);
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: 'id_ed25519', cartella: join(casa, '.ssh'), home: casa })?.credenzialeDellaCasa, true);
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: 'npm test', cartella: join(casa, '.ssh'), home: casa })?.credenzialeDellaCasa, true);
});

test('CRED-PROG-04 — through the kernel gate: no card for the project file, a card for ../config.json', async () => {
  const libero = await pieno({ tipo: 'leggi', percorso: 'src/app.js' }, progetto);
  assert.equal(libero.chieste.length, 0);
  assert.equal(libero.esito.consentito, true);
  const fuori = await pieno({ tipo: 'leggi', percorso: '../config.json' }, progetto);
  assert.equal(fuori.chieste.length, 1);
  assert.equal(fuori.chieste[0].segreto?.credenzialeDellaCasa, true);
});

test('CRED-PROG-05 — leggi on a hard link INSIDE the project to ~/.ssh/id_ed25519 asks in Full access with credenzialeDellaCasa', async () => {
  const { esito, chieste } = await pieno({ tipo: 'leggi', percorso: 'innocent.txt' }, altroProgetto);
  assert.equal(chieste.length, 1);
  assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true);
  assert.equal(esito.via, 'segreto-forza-conferma');
  /* nessuno davanti ⇒ rifiuto col motivo */
  const solo = await verificaPermessoScrittura({ tipo: 'leggi', percorso: 'innocent.txt' }, { livelloAccesso: 'accesso-pieno', cartella: altroProgetto });
  assert.equal(solo.consentito, false);
});

/* Riverifica 2 del bugfixer: le grafie dello stesso disco locale. Solo su Windows (le grafie sono di Windows). */
const BS = '\\';
const grafieDi = (coda) => {
  const disco = casa.slice(0, 1);
  const restoWin = casa.slice(2);
  const restoUnix = restoWin.split(BS).join('/');
  const codaWin = coda.split('/').join(BS);
  return [
    `${BS}${BS}?${BS}${casa}${BS}${codaWin}`, `//?/${casa.split(BS).join('/')}/${coda}`, `${BS}${BS}.${BS}${casa}${BS}${codaWin}`,
    `${BS}${BS}localhost${BS}${disco}$${restoWin}${BS}${codaWin}`, `${BS}${BS}127.0.0.1${BS}${disco.toLowerCase()}$${restoUnix}/${coda}`,
    `${BS}${BS}?${BS}UNC${BS}localhost${BS}${disco}$${restoWin}${BS}${codaWin}`,
    `/mnt/${disco.toLowerCase()}${restoUnix}/${coda}`, `/${disco.toLowerCase()}${restoUnix}/${coda}`,
    /* senza lettera: il disco della cartella corrente (qui lo stesso della casa finta), mai scambiato per un disco di Git Bash */
    ...(process.cwd().slice(0, 1).toLowerCase() === disco.toLowerCase() ? [`${restoUnix}/${coda}`] : []),
    /* riverifica 3: il nome di questa macchina, tutto 127.0.0.0/8 e la forma corta, le graffe di PowerShell, il relativo al disco */
    `${BS}${BS}${hostname()}${BS}${disco}$${restoWin}${BS}${codaWin}`, `${BS}${BS}${hostname().toLowerCase()}${BS}${disco}$${restoWin}${BS}${codaWin}`,
    `${BS}${BS}127.0.0.2${BS}${disco}$${restoWin}${BS}${codaWin}`, `${BS}${BS}127.1${BS}${disco}$${restoWin}${BS}${codaWin}`,
    `\${env:USERPROFILE}/${coda}`, `${disco}:${restoWin.slice(1)}${BS}${codaWin}`,
  ];
};

test('CRED-GRAFIE-01 — every spelling of the same local disk reaches the credential and asks', { skip: process.platform !== 'win32' }, () => {
  const grafie = [...grafieDi('.ssh/id_ed25519'),
    `%HOMEDRIVE%%HOMEPATH%${BS}.ssh${BS}id_ed25519`, '$env:HOMEDRIVE$env:HOMEPATH/.ssh/id_ed25519',
    `${casa}${BS}.ssh.${BS}id_ed25519`, `${casa}${BS}.ssh ${BS}id_ed25519`, `${casa}${BS}.npmrc.`];
  for (const percorso of grafie) {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso, cartella: altroProgetto, home: casa })?.credenzialeDellaCasa, true, percorso);
  }
  const wsl = grafieDi('.ssh/id_ed25519')[6];
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `wsl cat ${wsl}`, cartella: altroProgetto, home: casa })?.credenzialeDellaCasa, true);
});

test('CRED-GRAFIE-02 — AL CONTRARIO: the same spellings toward a plain file, or another machine, find no home credential', { skip: process.platform !== 'win32' }, () => {
  const disco = casa.slice(0, 1);
  for (const percorso of [...grafieDi('note.txt'), `${BS}${BS}altrohost${BS}${disco}$${casa.slice(2)}${BS}.ssh${BS}id_ed25519`,
    `${BS}${BS}${hostname()}-altro${BS}${disco}$${casa.slice(2)}${BS}.ssh${BS}id_ed25519`, `${BS}${BS}128.0.0.1${BS}${disco}$${casa.slice(2)}${BS}.ssh${BS}id_ed25519`,
    `${casa}${BS}.sshx${BS}id_ed25519`, '/mnt/data/.ssh/id_ed25519']) {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso, cartella: altroProgetto, home: casa }), null, percorso);
  }
});

/*
 * R7 (riverifica 3 del bugfixer): un collegamento col NOME segreto verso la casa, o una giunzione verso una cartella di credenziali,
 * non chiedeva in Full access. Collegamenti VERI: hard link (NTFS, nessun privilegio) e giunzioni (`junction`, nessun privilegio).
 */
const r7 = mkdtempSync(join(tmpdir(), 'talos-progetto-r7-'));
const normale = mkdtempSync(join(tmpdir(), 'talos-normale-'));
mkdirSync(join(casa, '.config', 'gh'), { recursive: true });
writeFileSync(join(casa, '.npmrc'), '//registry.npmjs.org/:_authToken=FINTO\n');
writeFileSync(join(casa, '.config', 'gh', 'hosts.yml'), 'github.com:\n  oauth_token: FINTO\n');
writeFileSync(join(casa, '.ssh', 'config'), 'Host *\n');
writeFileSync(join(normale, 'x.txt'), 'x');
writeFileSync(join(r7, 'orig.txt'), 'testo');
linkSync(join(r7, 'orig.txt'), join(r7, 'copia.txt'));
linkSync(join(casa, '.ssh', 'id_ed25519'), join(r7, 'id_ed25519'));
linkSync(join(casa, '.npmrc'), join(r7, '.npmrc'));
linkSync(join(casa, '.ssh', 'config'), join(r7, 'ssh-config.txt'));
symlinkSync(join(casa, '.ssh'), join(r7, 'ponte'), 'junction');
symlinkSync(join(casa, '.config', 'gh'), join(r7, 'gh-ponte'), 'junction');
symlinkSync(normale, join(r7, 'lib'), 'junction');
symlinkSync(join(casa, '.ssh'), join(progetto, 'fuori'), 'junction');
test.after(async () => { await rimuoviCartellaDiProvaAttesa(r7); await rimuoviCartellaDiProvaAttesa(normale); });

test('CRED-R7-01 — in Full access a secret-named link or a junction toward the home credentials asks', async () => {
  for (const azione of [{ tipo: 'leggi', percorso: 'id_ed25519' }, { tipo: 'shell', comando: 'type id_ed25519' }, { tipo: 'leggi', percorso: '.npmrc' },
    { tipo: 'leggi', percorso: 'ponte/id_ed25519' }, { tipo: 'leggi', percorso: 'gh-ponte/hosts.yml' }, { tipo: 'shell', comando: 'cat gh-ponte/hosts.yml' }]) {
    const { esito, chieste } = await pieno(azione, r7);
    assert.equal(chieste.length, 1, JSON.stringify(azione));
    assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, JSON.stringify(azione));
    assert.equal(esito.via, 'segreto-forza-conferma', JSON.stringify(azione));
  }
  /* il progetto sotto una cartella di credenziali non esenta un collegamento che porta FUORI di lui */
  const { chieste } = await pieno({ tipo: 'leggi', percorso: 'fuori/id_ed25519' }, progetto);
  assert.equal(chieste[0]?.segreto?.credenzialeDellaCasa, true);
});

test('CRED-R7-02 — AL CONTRARIO: ~/.ssh/config through a junction, a junction to a plain folder, a hard link inside the project ask nothing', async () => {
  for (const azione of [{ tipo: 'leggi', percorso: 'ponte/config' }, { tipo: 'leggi', percorso: 'lib/x.txt' }, { tipo: 'leggi', percorso: 'copia.txt' },
    { tipo: 'shell', comando: 'type copia.txt' }, { tipo: 'leggi', percorso: 'ssh-config.txt' }]) {
    const { esito, chieste } = await pieno(azione, r7);
    assert.equal(chieste.length, 0, JSON.stringify(azione));
    assert.equal(esito.consentito, true, JSON.stringify(azione));
  }
});

