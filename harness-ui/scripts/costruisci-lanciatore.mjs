/*
 * Il lanciatore dei comandi su Windows costruito DAL RILASCIO, dallo stesso commit dell'app (owner via giudice v1816, 13/11/2026:
 * «il flusso di rilascio costruisce l'exe dallo stesso commit, ne fissa l'impronta e la usa per verificare la copia nel pacchetto»).
 * Come Codex `.github/workflows/rust-release-windows.yml:250` («Build same-commit native runtime and helper») e Hermes
 * `apps/desktop/scripts/stage-native-deps.mjs:771` (l'aiutante nativo si compila mentre si prepara il pacchetto, dal sorgente dello
 * stesso albero). Niente più corsa separata di `lanciatore.yml` né impronta scritta a mano nel rilascio.
 *
 * Passi, e se uno non riesce il rilascio si ferma (codice 1):
 *   1. la toolchain fissata in `native/lanciatore/rust-toolchain.toml` (la stessa di `lanciatore.yml`);
 *   2. `cargo build --locked --release` (il lock coerente col codice: niente aggiornamenti in silenzio);
 *   3. la prova di fumo della crate sull'exe appena costruito (`native/lanciatore/prova-fumo.mjs`, la stessa di `lanciatore.yml`);
 *   4. lo SHA-256 dell'exe, e in Actions `TALOS_LANCIATORE_SORGENTE` e `TALOS_LANCIATORE_IMPRONTA` in `$GITHUB_ENV`: il pacchetto
 *      (`desktop/scripts/lanciatore-nel-pacchetto.mjs`) copia QUELL'exe e verifica la copia con QUELL'impronta.
 * Uso: `node scripts/costruisci-lanciatore.mjs [--bersaglio <triple>]` (di serie `x86_64-pc-windows-msvc`, quello del rilascio; in
 * locale si costruisce con `x86_64-pc-windows-gnu`).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const CRATE = join(root, 'native', 'lanciatore');
export const BERSAGLIO_DEL_RILASCIO = 'x86_64-pc-windows-msvc';

/** La toolchain fissata della crate (`channel = "1.97.1"`). */
export function toolchainDellaCrate(crate = CRATE) {
  const canale = /^\s*channel\s*=\s*"([^"]+)"/mu.exec(readFileSync(join(crate, 'rust-toolchain.toml'), 'utf8'))?.[1];
  if (!canale || !/^\d+\.\d+\.\d+$/u.test(canale)) throw new Error('native/lanciatore/rust-toolchain.toml senza una toolchain fissata.');
  return canale;
}

/** I comandi, in ordine, esportati per le prove: nessuno legge la rete oltre a rustup e cargo col lock. */
export function comandiDellaCostruzione({ crate = CRATE, bersaglio = BERSAGLIO_DEL_RILASCIO, node = process.execPath, target = process.env.CARGO_TARGET_DIR || join(crate, 'target') } = {}) {
  const exe = join(resolve(crate, target), bersaglio, 'release', 'talos-lanciatore.exe');
  return {
    exe,
    passi: [
      ['rustup', ['toolchain', 'install', toolchainDellaCrate(crate), '--profile', 'minimal', '--target', bersaglio]],
      ['cargo', ['build', '--locked', '--release', '--target', bersaglio]],
      [node, [join(crate, 'prova-fumo.mjs'), exe]],
    ],
  };
}

function eseguiDavvero(comando, argomenti, { cwd }) {
  const r = spawnSync(comando, argomenti, { cwd, stdio: 'inherit', windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`${comando} ${argomenti.slice(0, 2).join(' ')} non riuscito (${r.error?.code ?? r.status}).`);
}

/** Le righe per `$GITHUB_ENV`: i passi dopo (il pacchetto) leggono di qui l'exe costruito e la sua impronta. */
export function righeAmbiente({ exe, impronta }) {
  if (/[\r\n]/u.test(exe)) throw new Error('Percorso con un a capo: non si scrive in GITHUB_ENV.');
  if (!/^[0-9a-f]{64}$/u.test(impronta)) throw new Error('Impronta non valida: non si scrive in GITHUB_ENV.');
  return `TALOS_LANCIATORE_SORGENTE=${exe}\nTALOS_LANCIATORE_IMPRONTA=${impronta}\n`;
}

export function costruisciLanciatore({ crate = CRATE, bersaglio = BERSAGLIO_DEL_RILASCIO, esegui = eseguiDavvero, node = process.execPath, target } = {}) {
  const { exe, passi } = comandiDellaCostruzione({ crate, bersaglio, node, ...(target ? { target } : {}) });
  for (const [comando, argomenti] of passi) esegui(comando, argomenti, { cwd: crate });
  if (!existsSync(exe)) throw new Error(`cargo è uscito senza l'exe atteso: ${exe}.`);
  const impronta = createHash('sha256').update(readFileSync(exe)).digest('hex');
  return { exe, impronta, byte: statSync(exe).size };
}

/** Ciò che fa `node scripts/costruisci-lanciatore.mjs`: torna il codice d'uscita (0 pronto, 1 no). */
export function daRigaDiComando({ argomenti = process.argv.slice(2), costruisci = costruisciLanciatore, ambiente = process.env,
  scriviAmbiente = (file, testo) => appendFileSync(file, testo), scrivi = console.log, errore = console.error } = {}) {
  try {
    const i = argomenti.indexOf('--bersaglio');
    const bersaglio = i >= 0 ? argomenti[i + 1] : BERSAGLIO_DEL_RILASCIO;
    if (!/^[\w-]+$/u.test(bersaglio ?? '')) throw new Error('--bersaglio senza un bersaglio di Rust.');
    const esito = costruisci({ bersaglio });
    const righe = righeAmbiente(esito);
    if (ambiente.GITHUB_ENV) scriviAmbiente(ambiente.GITHUB_ENV, righe);
    else scrivi(`Per il pacchetto:\n${righe}`);
    scrivi(`Lanciatore dei comandi costruito dallo stesso commit: sha256 ${esito.impronta}, ${esito.byte} byte.`);
    return 0;
  } catch (e) {
    errore(`Lanciatore dei comandi non pronto: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = daRigaDiComando();
