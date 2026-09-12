import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync } from 'node:fs';
import { mkdir, readdir, copyFile, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staging = join(root, '.staging');
const cache = join(root, '.cache-r02');
export const LLAMA = Object.freeze([
  { variante: 'cpu', versione: 'b10517', nome: 'llama-b10517-bin-win-cpu-x64.zip', sha256: 'f3fed0673c934ade45663a8e29220a0903b58ad7eff91eeeef606a37061cd031' },
  { variante: 'vulkan', versione: 'b10517', nome: 'llama-b10517-bin-win-vulkan-x64.zip', sha256: 'afa3b2d38b2b461e45a3df7783009b22b2b7e4bb92b40bcb910d0c8924925c88' },
].map(a => Object.freeze({ ...a, url: `https://github.com/ggml-org/llama.cpp/releases/download/b10517/${a.nome}` })));

export function fileProduzione(file) {
  const parti = file.replaceAll('\\', '/').split('/');
  return !parti.some(p => p.startsWith('.') || /^(tests?|__tests__|fixtures|labs|frontend|node_modules|scratch.*)$/i.test(p))
    && !/\.(test|spec)\.[^.]+$|\.(map|gguf|ggml|log)$/i.test(file);
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const buffer of createReadStream(file)) hash.update(buffer);
  return hash.digest('hex');
}

export async function verificaImpronta(file, prevista) {
  const attuale = await sha256(file);
  if (attuale !== prevista) throw new Error(`SHA256 non corrispondente: ${file}. Eliminare la copia corrotta e riscaricare dalla release ufficiale.`);
  return attuale;
}

async function elenco(dir, prefisso = '') {
  const files = [];
  for (const voce of (await readdir(join(dir, prefisso), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const nome = join(prefisso, voce.name);
    if (voce.isSymbolicLink()) throw new Error(`Collegamento non ammesso nel pacchetto: ${nome}`);
    if (voce.isDirectory()) files.push(...await elenco(dir, nome));
    else if (voce.isFile()) files.push(nome);
    else throw new Error(`Tipo di file non ammesso: ${nome}`);
  }
  return files;
}

export async function inventario(dir) {
  const files = [];
  for (const nome of (await elenco(dir)).sort()) {
    const file = join(dir, nome);
    files.push({ path: nome.split(sep).join('/'), bytes: (await stat(file)).size, sha256: await sha256(file) });
  }
  return files;
}

async function copiaAlberoProduzione(sorgente, destinazione) {
  if (lstatSync(sorgente).isSymbolicLink()) throw new Error(`Radice sorgente collegata non ammessa: ${sorgente}`);
  for (const nome of await elenco(sorgente)) {
    if (!fileProduzione(nome)) continue;
    await mkdir(dirname(join(destinazione, nome)), { recursive: true });
    await copyFile(join(sorgente, nome), join(destinazione, nome));
  }
}

async function esegui(comando, args, cwd, env = process.env) {
  await new Promise((ok, no) => {
    const figlio = spawn(comando, args, { cwd, env, shell: false, windowsHide: true, stdio: 'inherit' });
    figlio.once('error', e => no(new Error(`Avvio fallito: ${comando}: ${e.message}`)));
    figlio.once('exit', code => code === 0 ? ok() : no(new Error(`Comando fallito (${code}): ${comando}. Consultare l'output precedente.`)));
  });
}

async function dipendenzeProduzione(dir) {
  const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!existsSync(npmCli)) throw new Error('CLI npm assente. Eseguire con npm run prepara.');
  await esegui(process.execPath, [npmCli, 'ci', '--omit=dev', '--no-audit', '--no-fund', '--prefer-offline'], dir, {
    ...process.env, npm_config_cache: join(cache, 'npm'), npm_config_update_notifier: 'false',
  });
}

async function archivioRuntime(asset) {
  const file = join(cache, asset.nome);
  if (!existsSync(file) && process.env.TALOS_R02_LLAMA_CACHE) {
    const locale = join(resolve(process.env.TALOS_R02_LLAMA_CACHE), asset.nome);
    if (existsSync(locale)) { await verificaImpronta(locale, asset.sha256); await copyFile(locale, file); }
  }
  if (!existsSync(file)) {
    console.log(`Download ufficiale ${asset.nome}`);
    const parziale = file + '.partial';
    try {
      const risposta = await fetch(asset.url, { signal: AbortSignal.timeout(180000) });
      if (!risposta.ok || !risposta.body) throw new Error(`HTTP ${risposta.status}`);
      await pipeline(risposta.body, createWriteStream(parziale, { flags: 'w' }));
      await verificaImpronta(parziale, asset.sha256);
      await copyFile(parziale, file);
    } catch (e) { throw new Error(`Download ${asset.nome} fallito: ${e.message}`); }
    finally { await rm(parziale, { force: true }); }
  }
  await verificaImpronta(file, asset.sha256);
  return file;
}

async function estraiRuntime(file, destinazione) {
  // JSZip 3.10.1 è già una dipendenza di produzione del backend, fissata dal suo lock.
  const require = createRequire(join(staging, 'harness-ui', 'package.json'));
  const zip = await require('jszip').loadAsync(await readFile(file), { checkCRC32: true });
  const server = Object.values(zip.files).filter(f => !f.dir && /(^|\/)llama-server\.exe$/.test(f.name));
  if (server.length !== 1) throw new Error('Archivio runtime privo di un unico llama-server.exe.');
  const prefisso = server[0].name.slice(0, -'llama-server.exe'.length);
  let totale = 0;
  for (const voce of Object.values(zip.files)) {
    if (voce.dir) continue;
    const originale = voce.unsafeOriginalName || voce.name;
    if (originale !== voce.name || isAbsolute(originale) || originale.includes('\\') || originale.includes(':') || originale.split('/').includes('..')) throw new Error('Percorso ZIP non sicuro.');
    if (voce.unixPermissions && (voce.unixPermissions & 0o170000) === 0o120000) throw new Error('Link ZIP non ammesso.');
    const nome = prefisso && voce.name.startsWith(prefisso) ? voce.name.slice(prefisso.length) : voce.name;
    const target = resolve(destinazione, nome);
    if (!target.startsWith(resolve(destinazione) + sep) || /\.(gguf|ggml)$/i.test(nome)) throw new Error('Contenuto ZIP non ammesso.');
    const dati = await voce.async('nodebuffer'); totale += dati.length;
    if (totale > 512 * 1024 * 1024) throw new Error('Archivio runtime oltre il limite di 512 MiB.');
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, dati);
  }
}

export async function preparaPacchetto() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Il pacchetto R-02 richiede Windows x64.');
  await mkdir(cache, { recursive: true });
  // Prima di cancellare ricorsivamente, verifica destinazione assoluta e assenza junction.
  if (resolve(staging) !== join(root, '.staging') || !staging.startsWith(root + sep) || (existsSync(staging) && lstatSync(staging).isSymbolicLink())) throw new Error('Staging non sicuro.');
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const backend = join(staging, 'harness-ui');
  const contesto = join(staging, 'context-engine');
  await mkdir(backend); await mkdir(contesto);
  // Lista delle radici di produzione: nessuna copia indiscriminata del repository.
  for (const nome of ['server.mjs', 'package.json', 'package-lock.json']) await copyFile(join(root, '..', nome), join(backend, nome));
  for (const nome of ['src', 'public']) await copiaAlberoProduzione(join(root, '..', nome), join(backend, nome));
  for (const nome of ['package.json', 'package-lock.json', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(root, '../..', 'context-engine', nome), join(contesto, nome));
  await copiaAlberoProduzione(join(root, '../..', 'context-engine/src'), join(contesto, 'src'));
  await dipendenzeProduzione(backend);
  await dipendenzeProduzione(contesto);
  // Segnaposto VCS ignorato anche da electron-builder: non è un file di runtime.
  await rm(join(backend, 'node_modules/undici/lib/llhttp/.gitkeep'), { force: true });
  // npm crea .bin per i comandi delle dipendenze: i .cmd/.ps1 sono file normali Windows.
  const require = createRequire(import.meta.url);
  const electron = require('electron');
  await esegui(electron, [join(root, 'scripts/verifica-nativi.mjs'), backend, contesto], root, { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  for (const asset of LLAMA) {
    const file = await archivioRuntime(asset);
    await estraiRuntime(file, join(staging, 'local-runtime', asset.variante));
    await copyFile(join(root, 'assets/llama-LICENSE.txt'), join(staging, 'local-runtime', asset.variante, 'LICENSE.txt'));
    // CPU obbligatorio anche sul banco privo di driver Vulkan; versione Vulkan controllata nel test installato.
    if (asset.variante === 'cpu') await esegui(join(staging, 'local-runtime/cpu/llama-server.exe'), ['--version'], root);
  }
  await writeFile(join(staging, 'AVVISI.txt'), [
    'TALOS 0.1.0 — pacchetto di prova R-02, non firmato.',
    'Electron 44.3.0 (MIT): LICENSE e LICENSES.chromium.html nella radice installata.',
    'llama.cpp b10517 (MIT): https://github.com/ggml-org/llama.cpp/tree/b10517 ; avvisi negli archivi inclusi.',
    'Dipendenze Node: licenze originali conservate nei rispettivi node_modules.',
    'Il package desktop dichiara AGPL-3.0-only; il repository di base contiene LICENSE Apache-2.0. Riallineamento del rilascio a cura owner (R-05).',
    'Nessun modello GGUF, aggiornamento automatico o telemetria aggiunto da R-02.',
  ].join('\r\n') + '\r\n');
  await copyFile(join(root, '../..', 'LICENSE'), join(staging, 'LICENZA-REPOSITORY.txt'));
  const files = await inventario(staging);
  if (files.some(f => /\.gguf$/i.test(f.path))) throw new Error('GGUF trovato nel pacchetto.');
  const manifest = { schema: 'talos.desktop.package.v1', data: new Date().toISOString(), piattaforma: 'win32-x64', electron: '44.3.0', electronBuilder: '26.16.1', llama: LLAMA, files, totaleByte: files.reduce((n, f) => n + f.bytes, 0) };
  await writeFile(join(staging, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Staging verificato: ${files.length} file, ${manifest.totaleByte} byte (manifest escluso).`);
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  preparaPacchetto().catch(e => { console.error(`Pacchetto non preparato: ${e.message}`); process.exitCode = 1; });
}
