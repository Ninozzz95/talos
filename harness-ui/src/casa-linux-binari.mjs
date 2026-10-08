/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026) — i binari per Linux che TALOS porta con sé: Node e ripgrep, eseguiti da C:
 *   dentro WSL, SENZA installare niente nella distro. Decisione owner, sera: «dentro l'installatore», versione e impronta fissate.
 *
 * Le stesse versioni del lato Windows, perché il motore dei file è lo stesso codice nelle due case:
 *   · Node 24.18.0 (quello del desktop), `node-v24.18.0-linux-x64.tar.gz`, SHA256 da nodejs.org/dist/v24.18.0/SHASUMS256.txt
 *     (letto il 01/10/2026);
 *   · ripgrep 15.0.0 da `@vscode/ripgrep-linux-x64@1.18.0` (MIT), il gemello del `@vscode/ripgrep` 1.18.0 che il desktop usa;
 *     integrità sha512 dal registro npm (letta il 01/10/2026).
 * Il modello è quello dei runtime di llama nel pacchetto (`desktop/scripts/prepara-pacchetto.mjs`): download ufficiale, cache,
 * impronta verificata prima di estrarre, mai una copia non verificata.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PIATTAFORMA_CASA_LINUX = 'linux-x64';

export const BINARI_CASA_LINUX = Object.freeze([
  Object.freeze({
    nome: 'node', versione: '24.18.0',
    archivio: 'node-v24.18.0-linux-x64.tar.gz',
    url: 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-linux-x64.tar.gz',
    sha256: '783130984963db7ba9cbd01089eaf2c2efb055c7c1693c943174b967b3050cb8',
    voce: 'node-v24.18.0-linux-x64/bin/node',
    licenza: 'node-v24.18.0-linux-x64/LICENSE',
  }),
  Object.freeze({
    nome: 'rg', versione: 'ripgrep 15.0.0 (@vscode/ripgrep-linux-x64 1.18.0)',
    archivio: 'ripgrep-linux-x64-1.18.0.tgz',
    url: 'https://registry.npmjs.org/@vscode/ripgrep-linux-x64/-/ripgrep-linux-x64-1.18.0.tgz',
    sha512: 'mQ3bVrUpnD2vs7QT0vX90Lt0cnUq467uFtEktIdsJJmW296RoSULRGqWgzG1AKxyBpNDD6l4ZO4qKf6SgyC23Q==',
    voce: 'package/bin/rg',
    /* La licenza MIT del pacchetto (Microsoft, vscode-ripgrep): la stessa che il lato Windows porta in node_modules. ripgrep
       (MIT o Unlicense) non mette la sua nell'archivio npm: AVVISI.txt dà l'indirizzo. */
    licenza: 'package/LICENSE',
  }),
]);

async function impronta(file, algoritmo, codifica) {
  const hash = createHash(algoritmo);
  for await (const pezzo of createReadStream(file)) hash.update(pezzo);
  return hash.digest(codifica);
}

/** L'archivio è quello pubblicato? SHA256 (hex) o integrità npm (sha512, base64). Lancia se no. */
export async function verificaArchivio(file, binario) {
  const attesa = binario.sha256 ?? binario.sha512;
  const vera = binario.sha256 ? await impronta(file, 'sha256', 'hex') : await impronta(file, 'sha512', 'base64');
  if (vera !== attesa) throw new Error(`Digest mismatch for ${binario.archivio}: the copy is corrupt or is not the published one.`);
}

async function scaricaVerificato(binario, cache) {
  const file = join(cache, binario.archivio);
  if (existsSync(file)) { await verificaArchivio(file, binario); return file; }
  const parziale = `${file}.partial`;
  try {
    const risposta = await fetch(binario.url, { signal: AbortSignal.timeout(300_000) });
    if (!risposta.ok || !risposta.body) throw new Error(`HTTP ${risposta.status}`);
    await pipeline(risposta.body, createWriteStream(parziale, { flags: 'w' }));
    await verificaArchivio(parziale, binario);
    await rename(parziale, file);
  } catch (errore) { throw new Error(`Download of ${binario.archivio} failed: ${errore.message}`); }
  finally { await rm(parziale, { force: true }); }
  return file;
}

/* Il tar di Windows (bsdtar, in System32 da Windows 10 1803): MAI quello di Git, che legge `C:` come un host remoto. */
function estraiVoce(archivio, voce, destinazione) {
  const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return new Promise((ok, no) => {
    /* SPAWN-AMBIENTE-01: tar non ha bisogno di niente del server, solo della cartella di sistema. */
    const figlio = spawn(tar, ['-xzf', archivio, '-C', destinazione, voce], { env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' }, windowsHide: true, shell: false });
    let errori = '';
    figlio.stderr.on('data', (d) => { errori += String(d); });
    figlio.once('error', (e) => no(new Error(`tar did not start: ${e.message}`)));
    figlio.once('exit', (codice) => (codice === 0 ? ok() : no(new Error(`tar exited with ${codice}: ${errori.trim()}`))));
  });
}

/**
 * Prepara `destinazione` (es. `<harness-ui>/.casa-linux/linux-x64`): scarica nella `cache`, verifica, estrae `node`, `rg` e la
 * licenza di Node, e scrive `manifesto.json` con versione e impronta di ogni binario estratto.
 */
export async function preparaCasaLinux(destinazione, { cache }) {
  if (process.platform !== 'win32') throw new Error('The Linux home binaries are prepared from Windows.');
  await mkdir(cache, { recursive: true });
  await mkdir(destinazione, { recursive: true });
  const lavoro = join(cache, 'estratti');
  await rm(lavoro, { recursive: true, force: true });
  await mkdir(lavoro, { recursive: true });
  const manifesto = { schema: 'talos.casa-linux.v1', piattaforma: PIATTAFORMA_CASA_LINUX, binari: {} };
  for (const binario of BINARI_CASA_LINUX) {
    const archivio = await scaricaVerificato(binario, cache);
    await estraiVoce(archivio, binario.voce, lavoro);
    await copyFile(join(lavoro, ...binario.voce.split('/')), join(destinazione, binario.nome));
    await chmod(join(destinazione, binario.nome), 0o755);
    if (binario.licenza) {
      await estraiVoce(archivio, binario.licenza, lavoro);
      await copyFile(join(lavoro, ...binario.licenza.split('/')), join(destinazione, `LICENSE-${binario.nome}.txt`));
    }
    manifesto.binari[binario.nome] = { versione: binario.versione, archivio: binario.archivio, sha256: await impronta(join(destinazione, binario.nome), 'sha256', 'hex') };
  }
  await rm(lavoro, { recursive: true, force: true });
  await writeFile(join(destinazione, 'manifesto.json'), `${JSON.stringify(manifesto, null, 2)}\n`);
  return manifesto;
}

const RADICE_HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Dove stanno i binari: `TALOS_CASA_LINUX` (il guscio installato la passa), altrimenti la cartella preparata in sviluppo. */
export function cartellaCasaLinux(env = process.env) {
  const dichiarata = env.TALOS_CASA_LINUX?.trim();
  return dichiarata ? resolve(dichiarata) : join(RADICE_HARNESS, '.casa-linux', PIATTAFORMA_CASA_LINUX);
}

/**
 * I binari ci sono e sono quelli del manifesto? `{ pronta: true, node, rg }` oppure `{ pronta: false, motivo }` — una mancanza
 * si DICE, mai un ripiego muto (owner: il pacchetto li porta; se mancano è un guasto da nominare).
 */
export async function verificaCasaLinux(cartella = cartellaCasaLinux(), { controllaImpronte = false } = {}) {
  let manifesto;
  try { manifesto = JSON.parse(await readFile(join(cartella, 'manifesto.json'), 'utf8')); }
  catch { return { pronta: false, motivo: `the Linux home binaries are not there (${cartella}): manifesto.json is missing` }; }
  for (const nome of ['node', 'rg']) {
    const file = join(cartella, nome);
    if (!existsSync(file)) return { pronta: false, motivo: `the binary "${nome}" of the Linux home is missing (${cartella})` };
    if (controllaImpronte && manifesto.binari?.[nome]?.sha256 !== await impronta(file, 'sha256', 'hex')) {
      return { pronta: false, motivo: `the binary "${nome}" of the Linux home does not match the manifest` };
    }
  }
  return { pronta: true, node: join(cartella, 'node'), rg: join(cartella, 'rg'), manifesto };
}
