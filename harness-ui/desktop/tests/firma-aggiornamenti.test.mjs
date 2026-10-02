import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { chiavePubblicaDa, firmaManifesto, leggiManifesto, sha512Base64, verificaFirmaManifesto } from '../firma-aggiornamenti.mjs';

/*
 * 01/10/2026 — la firma Ed25519 del manifesto degli aggiornamenti (owner: «Firma Ed25519 fatta da noi»). La CI firma i byte
 * ESATTI di `latest.yml`; l'app accetta il manifesto solo se la firma torna con la chiave pubblica che porta con sé.
 */
const coppia = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privata: privateKey.export({ type: 'pkcs8', format: 'pem' }), pubblica: publicKey.export({ type: 'spki', format: 'pem' }) };
};
const installer = Buffer.from('installer di prova 0.1.21');
const manifesto = (sha = sha512Base64(installer), nome = 'TALOS-Setup-0.1.21.exe') => `version: 0.1.21
files:
  - url: ${nome}
    sha512: ${sha}
    size: ${installer.length}
path: ${nome}
sha512: ${sha}
releaseDate: '2026-10-01T20:00:00.000Z'
`;

test('AGG-FIRMA-01: una firma fatta con la privata si verifica con la sua pubblica, sui byte esatti', () => {
  const { privata, pubblica } = coppia();
  const testo = manifesto();
  const firma = firmaManifesto(testo, privata);
  assert.equal(verificaFirmaManifesto(testo, firma, pubblica), true);
  assert.equal(chiavePubblicaDa(privata).trim(), pubblica.trim(), 'la CI ricava la pubblica dalla privata per confrontarla con quella dell app');
});

test('AGG-FIRMA-02: AL CONTRARIO — manifesto toccato, firma di un altra chiave, firma vuota o rotta, chiave non Ed25519: sempre no, mai un eccezione', () => {
  const { privata, pubblica } = coppia();
  const altra = coppia();
  const testo = manifesto();
  const firma = firmaManifesto(testo, privata);
  assert.equal(verificaFirmaManifesto(testo.replace('0.1.21', '0.1.22'), firma, pubblica), false, 'un carattere cambiato');
  assert.equal(verificaFirmaManifesto(`${testo} `, firma, pubblica), false, 'uno spazio in più');
  assert.equal(verificaFirmaManifesto(testo, firmaManifesto(testo, altra.privata), pubblica), false, 'firmato da un altra chiave');
  for (const rotta of ['', 'non base64 !', 'QUJD', null, undefined, `${firma.slice(0, -4)}AAA=`]) {
    assert.equal(verificaFirmaManifesto(testo, rotta, pubblica), false, `firma ${JSON.stringify(rotta)}`);
  }
  assert.equal(verificaFirmaManifesto(testo, firma, 'non è una chiave'), false);
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
  assert.equal(verificaFirmaManifesto(testo, firma, rsa), false, 'una chiave di un altro tipo');
  assert.throws(() => firmaManifesto(testo, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })), /Ed25519/);
});

/* La chiave pubblica che l'app porta con sé: quella creata dall'owner il 01/10/2026 (identificativo = primi 16 caratteri dello
   SHA-256 del DER SPKI, come lo stampa crea-chiave-aggiornamenti.mjs). Se cambia, ogni app già installata rifiuterebbe gli
   aggiornamenti firmati con la chiave nuova: un cambio deve essere voluto, e questa prova lo rende visibile. */
test('AGG-CHIAVE-01: l app porta la chiave pubblica dell owner, Ed25519, ed è nel pacchetto', async () => {
  const { readFileSync } = await import('node:fs');
  const { createHash, createPublicKey } = await import('node:crypto');
  const chiave = createPublicKey(readFileSync(new URL('../assets/aggiornamenti-pubblica.pem', import.meta.url), 'utf8'));
  assert.equal(chiave.asymmetricKeyType, 'ed25519');
  assert.equal(createHash('sha256').update(chiave.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16), '8a217e4b23816b16');
  const pacchetto = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const file of ['firma-aggiornamenti.mjs', 'assets/aggiornamenti-pubblica.pem']) assert.ok(pacchetto.build.files.includes(file), file);
});

test('AGG-MANIFESTO-01: legge versione, file, impronta e misura del manifesto di electron-builder', () => {
  assert.deepEqual(leggiManifesto(manifesto()), { version: '0.1.21', path: 'TALOS-Setup-0.1.21.exe', sha512: sha512Base64(installer), size: installer.length });
  assert.deepEqual(leggiManifesto(manifesto().replaceAll('\n', '\r\n')).version, '0.1.21', 'anche con a capo di Windows');
});

/* Il latest.yml VERO di electron-builder 26.16.1 (build locale del 01/10/2026, differentialPackage: false), byte per byte:
   niente `size`. Il primo lettore lo pretendeva e lo avrebbe rifiutato — l'ha detto la build, non la fixture. */
const VERO = `version: 0.1.20
files:
  - url: TALOS-Setup-0.1.20.exe
    sha512: wzPctsB+spxMZ6qe7olouLsGYrpE176ZOa3DVoQ/dXHNNFQJ3WIAy1PFXNOWXLbYC8arWiS1zBCpm19vslysHQ==
path: TALOS-Setup-0.1.20.exe
sha512: wzPctsB+spxMZ6qe7olouLsGYrpE176ZOa3DVoQ/dXHNNFQJ3WIAy1PFXNOWXLbYC8arWiS1zBCpm19vslysHQ==
releaseDate: '2026-10-01T18:27:15.595Z'
`;

test('AGG-MANIFESTO-03: legge il latest.yml vero di electron-builder 26, che non porta size', () => {
  assert.deepEqual(leggiManifesto(VERO), { version: '0.1.20', path: 'TALOS-Setup-0.1.20.exe',
    sha512: 'wzPctsB+spxMZ6qe7olouLsGYrpE176ZOa3DVoQ/dXHNNFQJ3WIAy1PFXNOWXLbYC8arWiS1zBCpm19vslysHQ==', size: null });
  assert.throws(() => leggiManifesto(VERO.replace('    sha512: wzP', '    sha512: AzP')), /primo file/, 'lo sha512 del file deve essere quello di primo livello');
  assert.throws(() => leggiManifesto(VERO.replace('  - url: TALOS-Setup-0.1.20.exe\n', '  - url: TALOS-Setup-0.1.20.exe\n    size: tanti\n')), /size/);
});

test('AGG-MANIFESTO-02: AL CONTRARIO — rifiuta i manifesti che non dicono con certezza di quale file parlano', () => {
  const sano = manifesto();
  const casi = {
    'versione non x.y.z': sano.replace('version: 0.1.21', 'version: 0.1.21-beta'),
    'percorso con cartelle': manifesto(undefined, '../TALOS-Setup-0.1.21.exe'),
    'impronta non sha512': sano.replace(/^sha512: .*$/mu, 'sha512: abc'),
    'campo doppio': `${sano}version: 9.9.9\n`,
    'primo file diverso da path': sano.replace('  - url: TALOS-Setup-0.1.21.exe', '  - url: Altro-0.1.21.exe'),
    'senza files': sano.replace(/files:[\s\S]*?path:/u, 'path:'),
  };
  for (const [nome, testo] of Object.entries(casi)) assert.throws(() => leggiManifesto(testo), /Manifesto non valido/, nome);
});
