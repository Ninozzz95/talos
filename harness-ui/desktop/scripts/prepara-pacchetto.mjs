import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync } from 'node:fs';
import { mkdir, readdir, copyFile, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { BINARI_CASA_LINUX, preparaCasaLinux, verificaCasaLinux } from '../../src/casa-linux-binari.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staging = join(root, '.staging');
const cache = join(root, '.cache-r02');
/*
 * L2 del motore locale (owner 20/10/2026: «Stabile v0.7.0»; regola permanente «mantenere aggiornato il motore llama.cpp»). Dal 15/10
 *   llama.cpp pubblica release STABILI `vX.Y.Z` e marca le build `bNNNNN` come pre-release notturne: si fissa la stabile.
 *   v0.7.0 = tag annotato sul commit 620d2225 = build b11669 (i binari stanno sulla release `b11669`; la `v0.7.0` porta solo
 *   `nightly-tag.txt`). Gli sha256 sono quelli che GitHub dichiara per i due file (`assets[].digest`), ricontrollati sui file
 *   scaricati il 20/10/2026: cpu 19.537.886 byte, vulkan 32.182.350 byte. b10517 (20/08) era più vecchia di LFM2.5 (13/10).
 */
export const LLAMA_VERSIONE = 'b11669';
export const LLAMA = Object.freeze([
  { variante: 'cpu', versione: LLAMA_VERSIONE, nome: `llama-${LLAMA_VERSIONE}-bin-win-cpu-x64.zip`, sha256: '37b3efcf962847ca869745fd4ccf7f5e7e8dacfeff9fa3523b4ca8cdc66d632b' },
  { variante: 'vulkan', versione: LLAMA_VERSIONE, nome: `llama-${LLAMA_VERSIONE}-bin-win-vulkan-x64.zip`, sha256: '2c07574e7bde71321cb785282b20cc821e951132149eeceeea32ddebdbf0598e' },
].map(a => Object.freeze({ ...a, url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSIONE}/${a.nome}` })));

/*
 * ⛔ 28/09/2026 — le regole «cartella di lavoro» valgono per le CARTELLE del percorso, non per il nome del file. Prima valevano
 *   per ogni parte, e `scratch.*` prendeva anche `src/scratch.mjs` (il modulo dei temporanei, nato il 24/09 con `8504bc013`):
 *   restava fuori dal pacchetto e il server installato cadeva 5 volte di fila con ERR_MODULE_NOT_FOUND. Nessuna prova lo
 *   vedeva, perché il guscio si prova dal sorgente; l'ha trovato lanciare `dist/win-unpacked/TALOS.exe` prima della release.
 */
export function fileProduzione(file) {
  const parti = file.replaceAll('\\', '/').split('/');
  const nome = parti.at(-1);
  return !parti.slice(0, -1).some(p => p.startsWith('.') || /^(tests?|__tests__|fixtures|labs|frontend|node_modules|scratch.*)$/i.test(p))
    && !nome.startsWith('.')
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

/*
 * ⛔⛔ Owner 11/10/2026 («Pochi file + scarico a blocchi»): l'aggiornamento 0.1.26 → 0.1.27 è durato 5 minuti sul suo PC, con 9.251 file
 *   installati, 7.374 in `resources/harness-ui/node_modules`. Il server sta negli `extraResources`, e lì electron-builder NON applica
 *   le esclusioni che usa per le dipendenze dell'app (app-builder-lib 26.16.1, `out/util/NodeModuleCopyHelper.js:12-40`: CHANGELOG,
 *   README, test, examples, .bin…; `out/fileMatcher.js:16-21`: i nomi di controllo versione e `.d.ts`). Qui si applicano le stesse,
 *   più ciò che a runtime non si carica mai: mappe, sorgenti TypeScript, e i binari nativi di altre piattaforme (il pacchetto è
 *   Windows x64). Misurati nella 0.1.27 installata: 1.746 tipi, 1.933 sorgenti .ts, 486 mappe, 209 documenti, 16 binari (30 MB).
 * ⛔ Licenze e avvisi restano SEMPRE (LICENSE, LICENCE, NOTICE, COPYING, AUTHORS, PATENTS): «licenze originali conservate nei
 *   rispettivi node_modules». E nessun file dentro `package.json`, `.node`, `.wasm` si tocca.
 */
const RESTANO_SEMPRE = /^(licen[cs]e|notice|copying|authors|patents|third[-_]party)/i;
const NOMI_DA_TOGLIERE = new Set(['.git', '.hg', '.svn', '.github', '.circleci', '.husky', '.idea', '.vs', '.nyc_output', '.DS_Store',
  'thumbs.db', '.gitignore', '.gitkeep', '.gitattributes', '.npmignore', '.travis.yml', 'appveyor.yml', 'circle.yml', '.flowconfig',
  '.jshintrc', '.eslintrc', '.editorconfig', '.prettierrc', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'npm-debug.log',
  'karma.conf.js', '.coveralls.yml', 'binding.gyp', 'node_gyp_bins']);
/** Cartelle che si tolgono solo in CIMA a un pacchetto (come electron-builder): più in basso un `test` può essere codice. */
const CARTELLE_DA_TOGLIERE_IN_CIMA = new Set(['test', 'tests', '__tests__', 'powered-test', 'example', 'examples', 'docs', 'doc', 'benchmark', 'benchmarks']);
const SI_TOGLIE_IL_FILE = (nome) => !RESTANO_SEMPRE.test(nome) && (
  /\.d\.[cm]?ts$/i.test(nome) || /\.map$/i.test(nome)
  || /\.[cm]?tsx?$/i.test(nome)
  || /^(readme|changelog|changes|history)(\.(md|markdown|txt))?$/i.test(nome) || /\.(md|markdown)$/i.test(nome));
/** I binari nativi di piattaforme che il pacchetto Windows x64 non usa mai (`prebuilds/<piattaforma>-<arch>`). */
const PREBUILD_DI_ALTRI = /^(darwin|linux|freebsd|openbsd|android|sunos|aix)-|^win32-(arm64|ia32)$/i;

/**
 * La libreria standard di TypeScript nel pacchetto (11/10/2026). Il cancello semantico del kernel legge `lib.*.d.ts` da
 * `node_modules/typescript/lib` (`leggiLibreriaStandardTs`, talosHarness.mjs), ma `typescript` è una dipendenza di sviluppo e
 * `npm ci --omit=dev` non la installa: misurato sull'app 0.1.27 installata e sul pacchetto 0.1.28, `lib.es5.d.ts` tornava
 * `null` e il cancello sui `.ts` lavorava senza i tipi base, in silenzio. Si portano solo i `lib*.d.ts` (3,3 MB, non i 23 del
 * compilatore), con `package.json` (lo cerca il ripiego `require.resolve`) e licenza e note di terzi (Apache-2.0).
 * ⛔ Se la sorgente non c'è la costruzione si FERMA: un pacchetto senza libreria è un cancello spento che nessuno vede.
 */
export async function copiaLibreriaTypescript({ sorgente, destinazione }) {
  const lib = join(sorgente, 'lib');
  if (!existsSync(lib)) throw new Error(`Libreria standard di TypeScript assente: ${lib}`);
  const nomi = (await readdir(lib)).filter((nome) => /^lib(\..+)?\.d\.ts$/.test(nome));
  if (!nomi.includes('lib.es5.d.ts')) throw new Error(`Libreria standard di TypeScript incompleta: manca lib.es5.d.ts in ${lib}`);
  await mkdir(join(destinazione, 'lib'), { recursive: true });
  for (const nome of ['package.json', 'LICENSE.txt', 'ThirdPartyNoticeText.txt']) await copyFile(join(sorgente, nome), join(destinazione, nome));
  for (const nome of nomi) await copyFile(join(lib, nome), join(destinazione, 'lib', nome));
  return nomi.length;
}

export async function sfoltisciDipendenze(nodeModules) {
  const tolti = { file: 0, byte: 0 };
  const misura = async (percorso) => {
    const s = await stat(percorso);
    if (!s.isDirectory()) return { file: 1, byte: s.size };
    let file = 0, byte = 0;
    for (const voce of await readdir(percorso)) { const m = await misura(join(percorso, voce)); file += m.file; byte += m.byte; }
    return { file, byte };
  };
  const togli = async (percorso) => { const m = await misura(percorso); tolti.file += m.file; tolti.byte += m.byte; await rm(percorso, { recursive: true, force: true }); };
  const visita = async (cartella, inCimaAUnPacchetto) => {
    for (const voce of await readdir(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isSymbolicLink()) continue; // un collegamento non si segue e non si tocca
      if (voce.isDirectory()) {
        if (voce.name === 'node_modules') { await visitaPacchetti(percorso); continue; }
        if (NOMI_DA_TOGLIERE.has(voce.name) || (inCimaAUnPacchetto && CARTELLE_DA_TOGLIERE_IN_CIMA.has(voce.name.toLowerCase()))) { await togli(percorso); continue; }
        if (cartella.endsWith(`${sep}prebuilds`) && PREBUILD_DI_ALTRI.test(voce.name)) { await togli(percorso); continue; }
        await visita(percorso, false);
        continue;
      }
      if (NOMI_DA_TOGLIERE.has(voce.name) || SI_TOGLIE_IL_FILE(voce.name)) await togli(percorso);
    }
  };
  const visitaPacchetti = async (cartella) => {
    for (const voce of await readdir(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isSymbolicLink() || !voce.isDirectory()) continue;
      if (voce.name === '.bin') { await togli(percorso); continue; }
      /* ⛔ `typescript` non si sfoltisce MAI: il kernel legge a runtime i suoi `lib/*.d.ts` per il cancello semantico
         (`leggiLibreriaStandardTs`, talosHarness.mjs). Trovato dalla prova del kernel sulle dipendenze sfoltite (11/10/2026). */
      if (voce.name === 'typescript') continue;
      if (voce.name.startsWith('@')) { for (const s of await readdir(percorso, { withFileTypes: true })) if (s.isDirectory() && !s.isSymbolicLink()) await visita(join(percorso, s.name), true); continue; }
      await visita(percorso, true);
    }
  };
  if (existsSync(nodeModules)) await visitaPacchetti(nodeModules);
  return tolti;
}

/*
 * ⛔ F-001 (owner 02/10/2026: «sfoltire a ~5 MB») — `leggi` estrae il testo dei PDF con `pdfjs-dist`, che porta 35 MB (viewer,
 *   build moderna, mappe, sandbox, tipi) e una dipendenza OPZIONALE nativa, `@napi-rs/canvas` (37 MB), che serve a DISEGNARE le
 *   pagine e non a estrarne il testo. Si tiene solo ciò che usa `src/kernel/estrai-documento.mjs`: la build legacy ridotta, il
 *   worker che lei importa (`pdf.worker.mjs`, misurato: `pdf.min.mjs` cerca quello e non il `.min`), `cmaps` (testo CJK) e
 *   `standard_fonts`. Misurato il 02/10: così estrae il testo anche senza il canvas accanto (avvisa solo che non può disegnare).
 *   `@napi-rs/keyring` e gli altri pacchetti `@napi-rs/*` restano: si tolgono solo quelli del canvas.
 */
export const PDFJS_DA_TENERE = Object.freeze(['package.json', 'LICENSE', 'legacy/build/pdf.min.mjs', 'legacy/build/pdf.worker.mjs', 'cmaps', 'standard_fonts']);
export async function sfoltisciPdfjs(nodeModules) {
  const napi = join(nodeModules, '@napi-rs');
  if (existsSync(napi)) {
    for (const voce of await readdir(napi)) if (voce === 'canvas' || voce.startsWith('canvas-')) await rm(join(napi, voce), { recursive: true, force: true });
  }
  const pdfjs = join(nodeModules, 'pdfjs-dist');
  if (!existsSync(pdfjs)) throw new Error('pdfjs-dist assente dalle dipendenze del server: `leggi` non estrarrebbe il testo dei PDF.');
  const tenere = new Set(PDFJS_DA_TENERE);
  const visita = async (relativa) => {
    for (const voce of await readdir(join(pdfjs, relativa), { withFileTypes: true })) {
      const percorso = relativa ? `${relativa}/${voce.name}` : voce.name;
      if (tenere.has(percorso)) continue;
      if (voce.isDirectory() && PDFJS_DA_TENERE.some(t => t.startsWith(`${percorso}/`))) { await visita(percorso); continue; }
      await rm(join(pdfjs, percorso), { recursive: true, force: true });
    }
  };
  await visita('');
  for (const f of PDFJS_DA_TENERE) if (!existsSync(join(pdfjs, f))) throw new Error(`pdfjs-dist sfoltito senza ${f}`);
}

async function copiaAlberoProduzione(sorgente, destinazione) {
  if (lstatSync(sorgente).isSymbolicLink()) throw new Error(`Radice sorgente collegata non ammessa: ${sorgente}`);
  for (const nome of await elenco(sorgente)) {
    if (!fileProduzione(nome)) continue;
    await mkdir(dirname(join(destinazione, nome)), { recursive: true });
    await copyFile(join(sorgente, nome), join(destinazione, nome));
  }
}

export async function copiaAssistenza({ sorgente, destinazione }) {
  if (lstatSync(sorgente).isSymbolicLink()) throw new Error(`Radice assistenza collegata non ammessa: ${sorgente}`);
  for (const nome of await elenco(sorgente)) {
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
  await esegui(process.execPath, [join(root, '../scripts/build-chat-upload-helper.mjs')], root);
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
  await mkdir(join(backend, 'native'));
  await copyFile(join(root, '../native/talos-chat-upload.exe'), join(backend, 'native/talos-chat-upload.exe'));
  await copyFile(join(root, '../native/GO-LICENSE.txt'), join(backend, 'native/GO-LICENSE.txt'));
  await esegui(join(backend, 'native/talos-chat-upload.exe'), ['--version'], root);
  for (const nome of ['package.json', 'package-lock.json', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(root, '../..', 'context-engine', nome), join(contesto, nome));
  await copiaAlberoProduzione(join(root, '../..', 'context-engine/src'), join(contesto, 'src'));
  await copiaAssistenza({ sorgente: join(root, '../..', 'docs/assistenza'), destinazione: join(staging, 'docs/assistenza') });
  await dipendenzeProduzione(backend);
  await sfoltisciPdfjs(join(backend, 'node_modules')); // F-001: ~5 MB invece di ~72 (owner 02/10)
  const sfoltiti = await sfoltisciDipendenze(join(backend, 'node_modules')); // owner 11/10: meno file, aggiornamento più veloce
  // dopo lo sfoltimento: quei `.d.ts` sono dati che il kernel legge, non dichiarazioni da buttare
  const libTs = await copiaLibreriaTypescript({ sorgente: join(root, '..', 'node_modules', 'typescript'), destinazione: join(backend, 'node_modules', 'typescript') });
  console.log(`Libreria standard di TypeScript: ${libTs} file.`);
  await dipendenzeProduzione(contesto);
  const sfoltitiContesto = await sfoltisciDipendenze(join(contesto, 'node_modules'));
  console.log(`Dipendenze sfoltite: ${sfoltiti.file + sfoltitiContesto.file} file, ${Math.round((sfoltiti.byte + sfoltitiContesto.byte) / 1048576)} MB.`);
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
  /*
   * Fase B «casa di esecuzione» (owner 01/10/2026, «dentro l'installatore», impronte fissate): Node e rg per Linux, eseguiti
   * dentro WSL da qui (niente installato nella distro). Stesso schema di llama: cache, impronta dell'archivio prima di estrarre,
   * e qui anche quella dei binari estratti contro il loro manifesto. Eseguirli vorrebbe WSL sul banco della build: lo prova il
   * pacchetto installato (`TALOS_CASA_LINUX`, `GET /api/v1/wsl` → `casaLinux.pronta`).
   */
  const casaLinux = join(staging, 'casa-linux', 'linux-x64');
  await preparaCasaLinux(casaLinux, { cache: join(cache, 'casa-linux') });
  const casaVerificata = await verificaCasaLinux(casaLinux, { controllaImpronte: true });
  if (!casaVerificata.pronta) throw new Error(`Binari della casa Linux non pronti: ${casaVerificata.motivo}`);
  await writeFile(join(staging, 'AVVISI.txt'), [
    'TALOS Desktop — pacchetto di prova non firmato. Versione e commit nel manifesto della build.',
    'Electron 44.3.0 (MIT): LICENSE e LICENSES.chromium.html nella radice installata.',
    `llama.cpp v0.7.0 = ${LLAMA_VERSIONE} (MIT): https://github.com/ggml-org/llama.cpp/tree/${LLAMA_VERSIONE} ; avvisi negli archivi inclusi.`,
    'Go 1.27.1 (BSD-3-Clause): il helper upload include la standard library; licenza in harness-ui/native/GO-LICENSE.txt.',
    'Node.js 24.18.0 per Linux (MIT): eseguito dentro WSL per gli attrezzi dei file; licenza in casa-linux/linux-x64/LICENSE-node.txt.',
    'ripgrep 15.0.0 per Linux (MIT o Unlicense: https://github.com/BurntSushi/ripgrep), dal pacchetto @vscode/ripgrep-linux-x64 1.18.0 (MIT); licenza del pacchetto in casa-linux/linux-x64/LICENSE-rg.txt.',
    'Dipendenze Node: licenze originali conservate nei rispettivi node_modules.',
    'Licenza del repository: vedere LICENZA-REPOSITORY.txt. Le dipendenze mantengono le proprie licenze.',
    'Nessun modello GGUF, aggiornamento automatico o telemetria aggiunto da R-02.',
  ].join('\r\n') + '\r\n');
  await copyFile(join(root, '../..', 'LICENSE'), join(staging, 'LICENZA-REPOSITORY.txt'));
  const files = await inventario(staging);
  if (files.some(f => /\.gguf$/i.test(f.path))) throw new Error('GGUF trovato nel pacchetto.');
  const manifest = { schema: 'talos.desktop.package.v1', data: new Date().toISOString(), piattaforma: 'win32-x64', electron: '44.3.0', electronBuilder: '26.16.1', llama: LLAMA, casaLinux: BINARI_CASA_LINUX, files, totaleByte: files.reduce((n, f) => n + f.bytes, 0) };
  await writeFile(join(staging, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Staging verificato: ${files.length} file, ${manifest.totaleByte} byte (manifest escluso).`);
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  preparaPacchetto().catch(e => { console.error(`Pacchetto non preparato: ${e.message}`); process.exitCode = 1; });
}
