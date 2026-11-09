/*
 * L'aiutante del PC per il computer use (`cua-driver.exe`), precostruito, dalla release interna dello stesso repo pubblico
 * (decisione dell'owner, strada A, 09/11/2026): la CI non ha la catena Rust né l'albero di cua, quindi il binario potato si
 * costruisce una volta sola sulla macchina dell'owner (`native/aiutante-nativo/costruisci.mjs potato`) e si pubblica come asset.
 *
 * Il riferimento `native/aiutante-pc.json` dice DOVE sta (repo, tag, nomi degli asset, dimensione). COSA deve essere lo dicono
 * due fonti che stanno già nel repo, e nessuna impronta si copia nel json:
 *   - l'exe: `IMPRONTA_AIUTANTE_PC` di `src/computer-use/aiutante-mcp.mjs`, la stessa che il server controlla prima di avviarlo;
 *     anche il tag ne deriva (`aiutante-pc-<prime 16 cifre>`), così un'impronta nuova senza release nuova si ferma qui;
 *   - gli avvisi delle crate Rust (`THIRD_PARTY_NOTICES.md`): la riga `rust/THIRD_PARTY_NOTICES.md` di
 *     `native/aiutante-nativo/IMPRONTE.sha256`, il file con cui `prepara-sorgente.mjs` verifica l'albero di cua al commit fissato.
 *
 * Ordine, e se un passo manca ci si ferma (un pacchetto senza aiutante direbbe «computer use non disponibile» senza un errore):
 *   1. `gh release download` in una cartella usa-e-getta del prodotto (`src/scratch.mjs`), mai nella cartella finale;
 *   2. dimensione e sha256 di ENTRAMBI i file controllati lì, PRIMA di qualunque copia (Hermes `pm/downloader.py:674-683`:
 *      «sha256 mismatch» ⇒ il parziale si toglie e niente arriva a destinazione);
 *   3. copia in `native/aiutante-pc/` passando da un `.parziale` e da un rename, poi di nuovo l'impronta sul file copiato;
 *   4. in CI le due righe `TALOS_AIUTANTE_PC_SORGENTE` e `TALOS_AIUTANTE_PC_AVVISI` in `$GITHUB_ENV`, che
 *      `desktop/scripts/prepara-pacchetto.mjs` legge (Codex `.github/workflows/rust-release-windows.yml:222-239`: pin di tag,
 *      byte e sha256 nello stesso repo, `gh release download --pattern`, poi il percorso in `$GITHUB_ENV`).
 * Se i file ci sono già e sono quelli giusti non si scarica niente (in locale, dopo il primo giro).
 *
 * `gh` legge il gettone da GH_TOKEN (in CI: `github.token`, cioè GITHUB_TOKEN; nessun altro segreto). Al processo `gh` non
 * arriva nessun'altra variabile che sembri una chiave (`ambienteDiGh`).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IMPRONTA_AIUTANTE_PC } from '../src/computer-use/aiutante-mcp.mjs';
import { cartellaScratch } from '../src/scratch.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const FILE_RIFERIMENTO = join(root, 'native', 'aiutante-pc.json');
export const CARTELLA_AIUTANTE = join(root, 'native', 'aiutante-pc');
export const FILE_IMPRONTE_SORGENTE = join(root, '..', 'native', 'aiutante-nativo', 'IMPRONTE.sha256');
export const PERCORSO_AVVISI_NEL_SORGENTE = 'rust/THIRD_PARTY_NOTICES.md';

const SHA256 = /^[0-9a-f]{64}$/u;

/** Il tag della release interna, ricavato dall'impronta: una sola fonte, e il riferimento non può puntare a un'altra build. */
export const tagAtteso = (impronta) => `aiutante-pc-${impronta.slice(0, 16)}`;

/** Il riferimento, controllato campo per campo: un riferimento storto non deve diventare un download «di qualcosa». */
export function leggiRiferimento(testo, impronta = IMPRONTA_AIUTANTE_PC) {
  const r = JSON.parse(testo);
  const problemi = [];
  if (!/^[\w.-]+\/[\w.-]+$/u.test(r.repository ?? '')) problemi.push('repository');
  if (r.tag !== tagAtteso(impronta)) problemi.push(`tag (atteso ${tagAtteso(impronta)}, da IMPRONTA_AIUTANTE_PC)`);
  if (!/^[\w.-]+\.exe$/u.test(r.asset ?? '')) problemi.push('asset');
  if (!/^[\w.-]+\.md$/u.test(r.avvisi ?? '') || r.avvisi === r.asset) problemi.push('avvisi');
  if (!Number.isSafeInteger(r.byte) || r.byte <= 0) problemi.push('byte');
  /* l'impronta ha UNA fonte (il codice): una copia qui potrebbe restare indietro e far passare un exe che il server poi rifiuta */
  if (/[0-9a-f]{64}/iu.test(testo)) problemi.push('nessuna impronta nel riferimento: sta in IMPRONTA_AIUTANTE_PC');
  if (problemi.length) throw new Error(`Riferimento dell'aiutante del PC non valido (${problemi.join(', ')}).`);
  return r;
}

/** L'impronta degli avvisi delle crate dalla riga `rust/THIRD_PARTY_NOTICES.md` di IMPRONTE.sha256 («sha256  blob  percorso»). */
export function improntaDegliAvvisi(testoImpronte) {
  for (const riga of testoImpronte.split('\n')) {
    const campi = riga.trim().split(/\s+/u);
    if (campi.length === 3 && campi[2] === PERCORSO_AVVISI_NEL_SORGENTE && SHA256.test(campi[0])) return campi[0];
  }
  throw new Error(`IMPRONTE.sha256 non ha la riga di ${PERCORSO_AVVISI_NEL_SORGENTE}.`);
}

const sha256 = (percorso) => createHash('sha256').update(readFileSync(percorso)).digest('hex');

/** null se il file c'è, ha la dimensione attesa (se data) e l'impronta attesa; altrimenti il motivo. */
export function problemaDelFile(file, impronta, byte = null) {
  if (!existsSync(file)) return 'assente';
  const dimensione = statSync(file).size;
  if (byte !== null && dimensione !== byte) return `dimensione ${dimensione} byte invece di ${byte}`;
  const letta = sha256(file);
  if (letta !== impronta) return `impronta ${letta} invece di ${impronta}`;
  return null;
}

/** Gli argomenti esatti di `gh`: esportati per le prove. */
export function comandoGh(rif, destinazione) {
  return ['release', 'download', rif.tag, '-R', rif.repository, '-p', rif.asset, '-p', rif.avvisi, '-D', destinazione];
}

/* GH_TOKEN e GITHUB_TOKEN sono il gettone del job; ogni altra variabile che ha l'aria di un segreto non arriva a `gh` */
const GETTONI_AMMESSI = new Set(['GH_TOKEN', 'GITHUB_TOKEN']);
const SEGRETO = /(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_?KEY|PRIVATE_?KEY|_KEY$|^KEY$)/iu;
export function ambienteDiGh(ambiente = process.env) {
  const fuori = {};
  for (const [k, v] of Object.entries(ambiente ?? {})) if (typeof v === 'string' && (GETTONI_AMMESSI.has(k.toUpperCase()) || !SEGRETO.test(k))) fuori[k] = v;
  return fuori;
}

function esegui(comando, argomenti) {
  const r = spawnSync(comando, argomenti, { encoding: 'utf8', windowsHide: true, env: ambienteDiGh() });
  if (r.error || r.status !== 0) {
    const dettaglio = (r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-3).join(' | ');
    throw new Error(`${comando} ${argomenti.slice(0, 2).join(' ')} non riuscito (${r.error?.code ?? r.status}): ${dettaglio}`);
  }
  return r.stdout;
}

/** Copia che non lascia mai a metà il file finale: prima `<file>.parziale`, poi il rename. */
function posa(origine, destinazione) {
  const parziale = `${destinazione}.parziale`;
  rmSync(parziale, { force: true });
  copyFileSync(origine, parziale);
  renameSync(parziale, destinazione);
}

export function preparaAiutantePc({ cartella = CARTELLA_AIUTANTE, riferimento = FILE_RIFERIMENTO, impronte = FILE_IMPRONTE_SORGENTE,
  impronta = IMPRONTA_AIUTANTE_PC, gh = (args) => esegui('gh', args), temporanea = () => cartellaScratch('talos-aiutante-pc-') } = {}) {
  if (typeof impronta !== 'string' || !SHA256.test(impronta)) throw new Error("Aiutante del PC: l'impronta fissata nel codice manca o non è uno sha256.");
  const rif = leggiRiferimento(readFileSync(riferimento, 'utf8'), impronta);
  const improntaAvvisi = improntaDegliAvvisi(readFileSync(impronte, 'utf8'));
  const attesi = [
    { nome: rif.asset, impronta, byte: rif.byte },
    { nome: rif.avvisi, impronta: improntaAvvisi, byte: null },
  ];
  const finali = { exe: join(cartella, rif.asset), avvisi: join(cartella, rif.avvisi) };
  if (attesi.every((a) => problemaDelFile(join(cartella, a.nome), a.impronta, a.byte) === null)) return { rif, ...finali, scaricato: false };

  const tmp = temporanea();
  try {
    try { gh(comandoGh(rif, tmp)); } catch (errore) {
      throw new Error(`gli asset ${rif.asset} e ${rif.avvisi} della release ${rif.tag} di ${rif.repository} non si scaricano (${errore.message}). `
        + `La release va pubblicata una volta con i due file: gh release create ${rif.tag} --prerelease, poi gh release upload.`, { cause: errore });
    }
    /* il controllo sta QUI, sulla copia usa-e-getta: un file sbagliato non arriva mai nella cartella finale */
    for (const a of attesi) {
      const problema = problemaDelFile(join(tmp, a.nome), a.impronta, a.byte);
      if (problema === 'assente') throw new Error(`la release ${rif.tag} di ${rif.repository} non ha l'asset ${a.nome}.`);
      if (problema) throw new Error(`${a.nome} della release ${rif.tag}: ${problema}. Nessun file copiato.`);
    }
    mkdirSync(cartella, { recursive: true });
    for (const a of attesi) posa(join(tmp, a.nome), join(cartella, a.nome));
  } catch (errore) {
    /* un file vecchio e sbagliato nella cartella finale non deve sembrare pronto a chi viene dopo */
    for (const a of attesi) if (problemaDelFile(join(cartella, a.nome), a.impronta, a.byte) !== null) rmSync(join(cartella, a.nome), { force: true });
    throw errore;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  for (const a of attesi) {
    const dopo = problemaDelFile(join(cartella, a.nome), a.impronta, a.byte);
    if (dopo) { rmSync(join(cartella, a.nome), { force: true }); throw new Error(`${a.nome} copiato ma non valido: ${dopo}.`); }
  }
  return { rif, ...finali, scaricato: true };
}

/** Le righe per `$GITHUB_ENV`: i passi dopo (il pacchetto) leggono di qui l'exe e gli avvisi verificati. */
export function righeAmbiente({ exe, avvisi }) {
  for (const p of [exe, avvisi]) if (/[\r\n]/u.test(p)) throw new Error('Percorso con un a capo: non si scrive in GITHUB_ENV.');
  return `TALOS_AIUTANTE_PC_SORGENTE=${exe}\nTALOS_AIUTANTE_PC_AVVISI=${avvisi}\n`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const esito = preparaAiutantePc();
    console.log(`Aiutante del PC ${esito.scaricato ? 'scaricato e verificato' : 'già presente e verificato'}: release ${esito.rif.tag}, sha256 ${IMPRONTA_AIUTANTE_PC}.`);
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, righeAmbiente(esito));
    else console.log(`Per il pacchetto in locale:\n${righeAmbiente(esito)}`);
  } catch (e) {
    console.error(`Aiutante del PC non pronto: ${e.message}`);
    process.exitCode = 1;
  }
}
