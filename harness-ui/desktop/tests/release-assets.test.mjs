import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { nomiArtefatti, preparaRelease, sezioneDelChangelog } from '../scripts/release-assets.mjs';
import { sha512Base64, verificaFirmaManifesto } from '../firma-aggiornamenti.mjs';

/*
 * ⛔ 14/09 — il changelog di QUESTA versione entra nelle note, e se manca non si pubblica. Le note
 * erano un testo identico a ogni release: vero, e muto su cosa fosse cambiato.
 */
const CHANGELOG = `# TALOS Desktop changelog

## Unreleased

- roba che non è ancora uscita e NON deve finire nelle note

## desktop-v0.1.0 — 2026-09-14

### Fixed
- La prima riga che deve finire nelle note.
- La seconda riga che deve finire nelle note.

## desktop-v0.0.9 — 2026-09-12

### Fixed
- Roba della versione PRECEDENTE, che non deve finire nelle note.
`;

/* 01/10/2026 — l'aggiornamento automatico: ogni release porta latest.yml firmato con la chiave gemella di quella dell'app. */
const CHIAVI = (() => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { chiavePrivata: privateKey.export({ type: 'pkcs8', format: 'pem' }), chiavePubblicaApp: publicKey.export({ type: 'spki', format: 'pem' }) };
})();
const manifestoDi = (exe, versione = '0.1.0', nome = `TALOS-Setup-${versione}.exe`) => `version: ${versione}
files:
  - url: ${nome}
    sha512: ${sha512Base64(exe)}
    size: ${exe.length}
path: ${nome}
sha512: ${sha512Base64(exe)}
releaseDate: '2026-10-01T20:00:00.000Z'
`;

async function conChangelog(distDir, testo = CHANGELOG) {
  const percorso = join(distDir, 'CHANGELOG.md');
  await writeFile(percorso, testo, 'utf8');
  return percorso;
}

test('R04-VERSIONE — nomi R-02 e rifiuto tag/versione o repository malformati', async () => {
  assert.deepEqual(nomiArtefatti('0.1.0'), { exe: 'TALOS-Setup-0.1.0.exe', zip: 'TALOS-0.1.0-win.zip', sha: 'SHA256SUMS.txt', note: 'NOTE-RELEASE.md',
    manifesto: 'latest.yml', firma: 'latest.yml.sig' });
  assert.throws(() => nomiArtefatti('../x'), /Versione/);
  await assert.rejects(preparaRelease({ versione: '0.1.0', tag: 'desktop-v0.2.0', repository: 'owner/progetto' }), /tag/);
  await assert.rejects(preparaRelease({ versione: '0.1.0', tag: 'desktop-v0.1.0', repository: 'x\ncomando' }), /Repository/);
});

test('R04-CHANGELOG-SEZIONE — pura: prende SOLO la sezione di quel tag, e dice di no se non c\'è', () => {
  const sezione = sezioneDelChangelog(CHANGELOG, 'desktop-v0.1.0');
  assert.match(sezione, /La prima riga che deve finire nelle note/);
  assert.match(sezione, /La seconda riga che deve finire nelle note/);
  assert.doesNotMatch(sezione, /versione PRECEDENTE/, 'una sezione finisce dove comincia la successiva');
  assert.doesNotMatch(sezione, /non è ancora uscita/, 'Unreleased non è una versione');
  assert.equal(sezioneDelChangelog(CHANGELOG, 'desktop-v9.9.9'), '', 'un tag senza sezione torna vuoto, non un pezzo di un altro');
  // ⛔ AL CONTRARIO: un tag che è PREFISSO di un altro non deve pescare la sezione sbagliata.
  assert.equal(sezioneDelChangelog('## desktop-v0.1.00 — x\n- altro\n', 'desktop-v0.1.0'), '');
});

test('R04-SHA — hash reali, note in inglese col changelog dentro, e nessun artefatto decorativo', async t => {
  const distDir = await mkdtemp(join(tmpdir(), 'talos-r04-assets-'));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  const exe = Buffer.from('installer di fixture, non distribuibile');
  const zip = Buffer.from('zip di fixture, non distribuibile');
  const sha = b => createHash('sha256').update(b).digest('hex');
  await writeFile(join(distDir, 'TALOS-Setup-0.1.0.exe'), exe);
  await writeFile(join(distDir, 'latest.yml'), manifestoDi(exe));
  const changelogPath = await conChangelog(distDir);
  const args = { distDir, versione: '0.1.0', tag: 'desktop-v0.1.0', repository: 'owner/progetto', smoke: { completato: true, installerSha256: sha(exe) }, changelogPath, ...CHIAVI };
  await assert.rejects(preparaRelease(args), /ENOENT/); // R04-ASSET-MANCANTE
  await writeFile(join(distDir, 'TALOS-0.1.0-win.zip'), zip);
  await assert.rejects(preparaRelease({ ...args, smoke: { completato: false } }), /Smoke/);
  await assert.rejects(preparaRelease({ ...args, smoke: { completato: true, installerSha256: '0'.repeat(64) } }), /installer/);
  const risultato = await preparaRelease(args);
  assert.equal(risultato.artefatti.length, 4);
  const manifesto = await readFile(join(distDir, 'latest.yml'));
  const firma = await readFile(join(distDir, 'latest.yml.sig'));
  assert.equal(await readFile(join(distDir, 'SHA256SUMS.txt'), 'utf8'), `${sha(exe)}  TALOS-Setup-0.1.0.exe\n${sha(zip)}  TALOS-0.1.0-win.zip\n${sha(manifesto)}  latest.yml\n${sha(firma)}  latest.yml.sig\n`);
  assert.equal(verificaFirmaManifesto(manifesto, firma.toString('utf8'), CHIAVI.chiavePubblicaApp), true, 'la firma pubblicata si verifica con la chiave dell app');
  const note = await readFile(join(distDir, 'NOTE-RELEASE.md'), 'utf8');
  for (const testo of ['Windows 10 1809', 'x64', 'SmartScreen', 'More info', 'Run anyway', 'GGUF', 'telemetry', '## Automatic updates', 'Ed25519', 'latest.yml.sig', 'every 4 hours', sha(exe), sha(zip), 'Get-FileHash', 'gh attestation verify', '--repo owner/progetto']) assert.ok(note.includes(testo), testo);
  assert.ok(!note.includes('no automatic updates'), 'le note non dicono più che gli aggiornamenti automatici non ci sono');
  // Fase B (01/10/2026): il pacchetto porta Node e rg per Linux, e le note lo dicono.
  assert.ok(note.includes('Node.js 24.18.0 and ripgrep 15.0.0 for Linux'), 'i binari per Linux del pacchetto sono dichiarati');
  // ⛔ Le note pubblicate sono in INGLESE: la sorgente italiana è la trappola che il mobile ha già pagato.
  for (const italiano of ['Ulteriori informazioni', 'Esegui comunque', 'Installazione', 'Contenuto']) assert.ok(!note.includes(italiano), `non deve restare italiano: ${italiano}`);
  // ⛔ E dicono COSA È CAMBIATO, non solo come si installa.
  assert.ok(note.includes('## What changed'), 'manca la sezione delle novità');
  assert.ok(note.includes('La prima riga che deve finire nelle note'), 'il changelog di questa versione deve essere nelle note');
  assert.ok(!note.includes('versione PRECEDENTE'), 'le note portano SOLO la sezione di questo tag');
});

test('R04-CHANGELOG-CANCELLO — senza sezione (o senza file) non si pubblica: il no arriva PRIMA della build', async t => {
  const distDir = await mkdtemp(join(tmpdir(), 'talos-r04-changelog-'));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  const exe = Buffer.from('installer di fixture');
  const zip = Buffer.from('zip di fixture');
  const sha = b => createHash('sha256').update(b).digest('hex');
  await writeFile(join(distDir, 'TALOS-Setup-0.1.0.exe'), exe);
  await writeFile(join(distDir, 'TALOS-0.1.0-win.zip'), zip);
  const base = { distDir, versione: '0.1.0', tag: 'desktop-v0.1.0', repository: 'owner/progetto', smoke: { completato: true, installerSha256: sha(exe) } };

  await assert.rejects(preparaRelease(base), /CHANGELOG/, 'senza percorso del changelog non si parte');
  await assert.rejects(
    preparaRelease({ ...base, changelogPath: join(distDir, 'CHANGELOG.md') }),
    /ENOENT/,
    'un changelog che non esiste è un no, non un silenzio',
  );
  const senzaSezione = await conChangelog(distDir, '# TALOS Desktop changelog\n\n## Unreleased\n\n## desktop-v0.0.9 — 2026-09-12\n\n- vecchio\n');
  await assert.rejects(
    preparaRelease({ ...base, changelogPath: senzaSezione }),
    /non ha una sezione "## desktop-v0\.1\.0"/,
    'il tag senza la sua sezione viene rifiutato, e il messaggio dice cosa scrivere',
  );
});

test('R04-NON-CANDIDATA — un tag finale non si presenta come «release candidate» (la 0.1.19 l aveva nelle note)', async t => {
  const distDir = await mkdtemp(join(tmpdir(), 'talos-r04-candidata-'));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  const exe = Buffer.from('installer di fixture');
  await writeFile(join(distDir, 'TALOS-Setup-0.1.0.exe'), exe);
  await writeFile(join(distDir, 'TALOS-0.1.0-win.zip'), Buffer.from('zip di fixture'));
  await writeFile(join(distDir, 'latest.yml'), manifestoDi(exe));
  const base = { distDir, versione: '0.1.0', tag: 'desktop-v0.1.0', repository: 'owner/progetto', smoke: { completato: true, installerSha256: createHash('sha256').update(exe).digest('hex') }, ...CHIAVI };
  for (const frase of ['This release candidate addresses workflow results.', 'A Release-Candidate build.', 'release\ncandidates follow']) {
    const percorso = await conChangelog(distDir, `## desktop-v0.1.0 — 2026-10-01\n\n${frase}\n\n### Fixed\n- una cura\n`);
    await assert.rejects(preparaRelease({ ...base, changelogPath: percorso }), /si presenta come «release candidate»/, frase);
  }
  // Al contrario: la parola «candidate» da sola, o una sezione normale, passano.
  const sana = await conChangelog(distDir, '## desktop-v0.1.0 — 2026-10-01\n\nThe candidate list of models is read from the provider.\n\n### Fixed\n- una cura\n');
  const risultato = await preparaRelease({ ...base, changelogPath: sana });
  assert.equal(risultato.artefatti.length, 4);
});

test('R04-FIRMA — senza la chiave, con una chiave non gemella, o con un latest.yml che non descrive l installer: non si pubblica', async t => {
  const distDir = await mkdtemp(join(tmpdir(), 'talos-r04-firma-'));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  const exe = Buffer.from('installer di fixture per la firma');
  await writeFile(join(distDir, 'TALOS-Setup-0.1.0.exe'), exe);
  await writeFile(join(distDir, 'TALOS-0.1.0-win.zip'), Buffer.from('zip'));
  const changelogPath = await conChangelog(distDir);
  const base = { distDir, versione: '0.1.0', tag: 'desktop-v0.1.0', repository: 'owner/progetto', smoke: { completato: true, installerSha256: createHash('sha256').update(exe).digest('hex') }, changelogPath, ...CHIAVI };
  await writeFile(join(distDir, 'latest.yml'), manifestoDi(exe));
  await assert.rejects(preparaRelease({ ...base, chiavePrivata: '' }), /TALOS_UPDATE_SIGN_KEY/);
  await assert.rejects(preparaRelease({ ...base, chiavePubblicaApp: '' }), /aggiornamenti-pubblica\.pem/);
  const altra = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  await assert.rejects(preparaRelease({ ...base, chiavePrivata: altra }), /gemella/);
  const sbagliati = {
    versione: manifestoDi(exe, '0.1.1', 'TALOS-Setup-0.1.0.exe'),
    nome: manifestoDi(exe, '0.1.0', 'TALOS-Setup-0.1.0-bis.exe'),
    impronta: manifestoDi(Buffer.from('un altro installer')),
    misura: manifestoDi(exe).replace(/size: \d+/u, 'size: 1'),
  };
  for (const [nome, testo] of Object.entries(sbagliati)) {
    await writeFile(join(distDir, 'latest.yml'), testo);
    await assert.rejects(preparaRelease(base), /latest\.yml/, nome);
  }
  await writeFile(join(distDir, 'latest.yml'), manifestoDi(exe));
  await preparaRelease(base);
  // La forma VERA di electron-builder 26 senza pacchetti differenziali: niente `size` (misurato il 01/10/2026). Deve passare.
  await writeFile(join(distDir, 'latest.yml'), manifestoDi(exe).replace(/\n {4}size: \d+/u, ''));
  await preparaRelease(base);
});
