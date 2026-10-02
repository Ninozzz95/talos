import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOME_FONTE_DI_PROVA, configurazioneBuildDiProva, leggiFonteDiProva, validaFonteDiProva } from '../fonte-aggiornamenti.mjs';
import { REPO_DI_PROVA, VERSIONE_X1, serverDiProva } from '../scripts/ci-aggiornamento-vero.mjs';

/*
 * 02/10/2026 — passo 4 dell'aggiornamento automatico (owner: «File solo nella build di prova»). La fonte di prova punta SOLO al
 * computer stesso, con una chiave Ed25519; la build vera non la porta mai.
 */
const desktop = dirname(dirname(fileURLToPath(import.meta.url)));
const ed = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
const buona = { api: 'http://127.0.0.1:47311', download: 'http://127.0.0.1:47311', repo: 'prova/talos', chiavePubblica: ed };

test('FONTE-01: la fonte di prova vale solo per http://127.0.0.1:<porta>, con una chiave Ed25519 e nient altro', () => {
  assert.deepEqual({ ...validaFonteDiProva(buona) }, buona);
  for (const [campo, valore] of [
    ['api', 'https://127.0.0.1:47311'], ['api', 'http://localhost:47311'], ['api', 'http://127.0.0.2:47311'], ['api', 'http://127.0.0.1'],
    ['download', 'http://127.0.0.1:47311/altro'], ['download', 'http://utente:pw@127.0.0.1:47311'], ['download', 'http://127.0.0.1:47311/?x=1'],
    ['download', 'https://github.com'], ['repo', 'solo-nome'], ['repo', '../x/y'], ['chiavePubblica', rsa], ['chiavePubblica', 'non una chiave'],
  ]) {
    assert.throws(() => validaFonteDiProva({ ...buona, [campo]: valore }), Error, `${campo}=${valore}`);
  }
  assert.throws(() => validaFonteDiProva({ ...buona, altro: 1 }), /campo sconosciuto/);
  assert.throws(() => validaFonteDiProva(null));
});

test('FONTE-02: senza il file nelle risorse nessuna fonte di prova (la build vera); un file malformato FERMA, non ricade su GitHub', () => {
  assert.equal(leggiFonteDiProva('C:\\app\\resources', { esiste: () => false }), null);
  assert.equal(leggiFonteDiProva(undefined), null);
  const letta = leggiFonteDiProva('C:\\app\\resources', { esiste: (p) => p.endsWith(NOME_FONTE_DI_PROVA), leggi: () => JSON.stringify(buona) });
  assert.equal(letta.api, 'http://127.0.0.1:47311');
  assert.ok(Object.isFrozen(letta));
  assert.throws(() => leggiFonteDiProva('C:\\app\\resources', { esiste: () => true, leggi: () => '{non json' }), /JSON non leggibile/);
  assert.throws(() => leggiFonteDiProva('C:\\app\\resources', { esiste: () => true, leggi: () => JSON.stringify({ ...buona, api: 'https://evil.example' }) }));
});

test('FONTE-03: la configurazione della build di prova aggiunge SOLO la sua risorsa, fissa la versione e scrive in una cartella a parte', () => {
  assert.equal(configurazioneBuildDiProva(undefined, undefined), null, 'senza la variabile: la build vera, senza niente in più');
  assert.equal(configurazioneBuildDiProva('', '0.0.1'), null);
  assert.throws(() => configurazioneBuildDiProva('C:\\f.json', '0.0'), /x\.y\.z/);
  assert.throws(() => configurazioneBuildDiProva('C:\\f.json', '0.0.1', { leggi: () => JSON.stringify({ ...buona, api: 'http://10.0.0.1:1' }) }));
  assert.deepEqual(configurazioneBuildDiProva('C:\\f.json', '0.0.2', { leggi: () => JSON.stringify(buona) }), {
    extraMetadata: { version: '0.0.2' },
    extraResources: [{ from: 'C:\\f.json', to: NOME_FONTE_DI_PROVA }],
    directories: { output: 'dist-prova-aggiornamenti/0.0.2' },
  });
});

test('FONTE-04: la build vera si ferma se porta la fonte di prova; la prova vera sta nel job dell installer, prima del tag', () => {
  const distribuisci = readFileSync(join(desktop, 'scripts', 'distribuisci.mjs'), 'utf8');
  assert.match(distribuisci, /if \(!prova\) \{\s*const risorse = join\(root, preview \? 'dist-preview' : 'dist', 'win-unpacked', 'resources', NOME_FONTE_DI_PROVA\);\s*if \(existsSync\(risorse\)\) throw/);
  const pacchetto = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
  assert.ok(!JSON.stringify(pacchetto.build).includes(NOME_FONTE_DI_PROVA), 'la configurazione vera non nomina mai il file di prova');
  const flusso = readFileSync(join(desktop, '..', '..', '.github', 'workflows', 'desktop-pretag-installer.yml'), 'utf8');
  assert.match(flusso, /node harness-ui\/desktop\/scripts\/ci-aggiornamento-vero\.mjs/);
  const main = readFileSync(join(desktop, 'main.mjs'), 'utf8');
  assert.match(main, /const fonteDiProva = leggiFonteDiProva\(process\.resourcesPath\);/, 'il guscio legge la fonte SOLO dalle risorse del pacchetto');
  assert.match(main, /chiavePubblica: fonteDiProva\?\.chiavePubblica \?\? readFileSync\(/);
});

test('FONTE-05: il server della prova risponde come GitHub — elenco delle release, firma secondo il modo, file della cartella, niente fuori', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const feed = mkdtempSync(join(tmpdir(), 'feed-'));
  t.after(() => rmSync(feed, { recursive: true, force: true }));
  writeFileSync(join(feed, 'latest.yml'), 'version: 0.0.2\n');
  let modo = 'manomessa';
  const s = serverDiProva({ cartellaFeed: feed, firme: { buona: 'FIRMA-BUONA', manomessa: 'FIRMA-SBAGLIATA' }, modo: () => modo, porta: 0 });
  const porta = await s.avvia();
  t.after(() => s.ferma());
  const base = `http://127.0.0.1:${porta}`;
  const elenco = await (await fetch(`${base}/repos/${REPO_DI_PROVA}/releases?per_page=30`)).json();
  assert.deepEqual(elenco.map((r) => [r.tag_name, r.draft, r.prerelease]), [[`desktop-v${VERSIONE_X1}`, false, false]]);
  const cartella = `${base}/${REPO_DI_PROVA}/releases/download/desktop-v${VERSIONE_X1}`;
  assert.equal((await (await fetch(`${cartella}/latest.yml.sig`)).text()).trim(), 'FIRMA-SBAGLIATA');
  modo = 'buona';
  assert.equal((await (await fetch(`${cartella}/latest.yml.sig`)).text()).trim(), 'FIRMA-BUONA');
  assert.equal(await (await fetch(`${cartella}/latest.yml?noCache=1`)).text(), 'version: 0.0.2\n');
  assert.equal((await fetch(`${cartella}/assente.exe`)).status, 404);
  assert.equal((await fetch(`${cartella}/..%5C..%5Csegreto.txt`)).status, 400, 'niente fuori dalla cartella del feed');
  assert.equal((await fetch(`${base}/altro`)).status, 404);
});
