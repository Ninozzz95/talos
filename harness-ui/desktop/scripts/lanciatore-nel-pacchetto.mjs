/*
 * Il lanciatore dei comandi su Windows nel pacchetto del PC (decisione 374 R1; owner via giudice v1815 e v1816, 13/11/2026: «il
 * lanciatore agli utenti con la 0.2.3»). Prima nessuno lo metteva nel pacchetto: `scripts/scarica-lanciatore.mjs` non lo chiamava
 * nessun flusso, e nessuna app installata portava `talos-lanciatore.exe`.
 *
 * La regola dell'impronta (giudice v1816):
 *   - RILASCIO (`TALOS_PACCHETTO_RILASCIO=1`, o un tag `desktop-v*` in GitHub Actions): l'exe lo costruisce il flusso stesso, dallo
 *     STESSO commit (`scripts/costruisci-lanciatore.mjs`, come Codex `.github/workflows/rust-release-windows.yml:250` «Build
 *     same-commit native runtime and helper»), e ne passa l'impronta in `TALOS_LANCIATORE_IMPRONTA`. Il pacchetto copia l'exe e
 *     verifica la COPIA con quell'impronta. Impronta assente o che non torna ⇒ il pacchetto si FERMA: mai un rilascio senza
 *     lanciatore. Il riferimento scritto a mano (`native/lanciatore-binding.json`) nel rilascio non vale.
 *   - BUILD LOCALE: l'impronta è `TALOS_LANCIATORE_IMPRONTA` o quella del riferimento. Nulla ⇒ il pacchetto si costruisce SENZA
 *     lanciatore e lo dice (riga nel log e `lanciatore.incluso: false` nel manifesto); fissata ⇒ come il rilascio, si ferma se l'exe
 *     manca o l'impronta non torna (come iroh, `prepara-pacchetto.mjs`).
 * Dove va: `harness-ui/native/lanciatore-bin/` dentro le risorse (electron-builder copia `extraResources` in `resources/`, documentazione
 * «Extra Files and Resources», electron.build/docs/contents, letta il 13/11/2026), accanto al riferimento del pacchetto
 * `harness-ui/native/lanciatore-binding.json` con l'impronta: è lì che il nucleo dell'app installata lo cerca e lo confronta a ogni
 * lancio (`src/kernel/lanciatore-windows.mjs`, CANDIDATI e RIFERIMENTI: `<src/kernel>/../../native/...`).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NOME_LANCIATORE = 'talos-lanciatore.exe';
const SHA256 = /^[0-9a-f]{64}$/u;

/** Il rilascio vuole il lanciatore. Il segno esplicito dei flussi, e in più ogni tag del PC in Actions (se il segno sparisse). */
export function rilascioDaAmbiente(ambiente = process.env) {
  return ambiente.TALOS_PACCHETTO_RILASCIO === '1'
    || (ambiente.GITHUB_ACTIONS === 'true' && /^refs\/tags\/desktop-v/u.test(ambiente.GITHUB_REF ?? ''));
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const pezzo of createReadStream(file)) hash.update(pezzo);
  return hash.digest('hex');
}

/**
 * Copia il lanciatore nel pacchetto, o dice perché no. `native` è `harness-ui/native` del sorgente, `destinazione` è
 * `harness-ui/native` dello staging. Torna `{ incluso: true, sha256, byte, origine }` o `{ incluso: false, motivo }`.
 */
export async function copiaLanciatore({ ambiente = process.env, native, destinazione }) {
  const rilascio = rilascioDaAmbiente(ambiente);
  const dalFlusso = String(ambiente.TALOS_LANCIATORE_IMPRONTA ?? '').trim().toLowerCase();
  let impronta = dalFlusso || null;
  if (!impronta && !rilascio) impronta = JSON.parse(await readFile(join(native, 'lanciatore-binding.json'), 'utf8')).sha256 ?? null;
  if (impronta === null) {
    if (rilascio) {
      throw new Error("Lanciatore dei comandi: nel rilascio l'impronta manca (TALOS_LANCIATORE_IMPRONTA, dal passo che lo costruisce dallo "
        + 'stesso commit, harness-ui/scripts/costruisci-lanciatore.mjs). Un pacchetto di rilascio senza lanciatore non si costruisce.');
    }
    return { incluso: false, motivo: 'non-fissato' };
  }
  if (!SHA256.test(impronta)) throw new Error("Lanciatore dei comandi: l'impronta non è uno sha256.");
  const exe = String(ambiente.TALOS_LANCIATORE_SORGENTE ?? '').trim() || join(native, 'lanciatore-bin', NOME_LANCIATORE);
  if (!existsSync(exe)) throw new Error(`Lanciatore dei comandi assente (${exe}) con l'impronta fissata: costruirlo (harness-ui/scripts/costruisci-lanciatore.mjs) o scaricarlo (harness-ui/scripts/scarica-lanciatore.mjs) prima del pacchetto.`);
  const cartella = join(destinazione, 'lanciatore-bin');
  await mkdir(cartella, { recursive: true });
  const copia = join(cartella, NOME_LANCIATORE);
  await copyFile(exe, copia);
  const vera = await sha256(copia);
  if (vera !== impronta) {
    await rm(copia, { force: true });
    throw new Error(`Lanciatore dei comandi: SHA256 della copia nel pacchetto ${vera}, atteso ${impronta}. Il pacchetto non si costruisce.`);
  }
  await writeFile(`${copia}.sha256`, `${impronta}  ${NOME_LANCIATORE}\n`);
  await copyFile(join(native, 'lanciatore-THIRD_PARTY_NOTICES.txt'), join(cartella, 'THIRD_PARTY_NOTICES.txt'));
  const byte = (await stat(copia)).size;
  const origine = dalFlusso ? 'stesso-commit' : 'riferimento';
  await writeFile(join(destinazione, 'lanciatore-binding.json'), `${JSON.stringify({
    nota: "Il riferimento del pacchetto: l'impronta dell'exe in lanciatore-bin/, che il nucleo confronta a ogni lancio (src/kernel/lanciatore-windows.mjs).",
    file: NOME_LANCIATORE, sha256: impronta, byte, origine,
  }, null, 2)}\n`);
  return { incluso: true, sha256: impronta, byte, origine };
}

/** La riga del log del pacchetto (in Actions un avviso visibile quando il lanciatore non c'è). */
export function rigaDelPacchetto(esito, ambiente = process.env) {
  if (esito.incluso) return { livello: 'log', testo: `Lanciatore dei comandi nel pacchetto: sha256 ${esito.sha256}, ${esito.byte} byte (${esito.origine}).` };
  const testo = 'pacchetto SENZA il lanciatore dei comandi (impronta non fissata: build locale). I comandi partono come prima e la diagnostica dice «non seguiti».';
  return { livello: 'warn', testo: ambiente.GITHUB_ACTIONS === 'true' ? `::warning title=Lanciatore::${testo}` : `Attenzione: ${testo}` };
}

/**
 * Il lanciatore nell'app installata o nella cartella `--dir` (`risorse` = `resources`): il manifesto dice se c'è; se c'è, exe, `.sha256`,
 * riferimento del pacchetto e avvisi tornano tutti con la stessa impronta, e il nucleo DELL'APP lo trova in modalità app. In un rilascio
 * un pacchetto che non lo porta è un errore.
 */
export async function controllaLanciatoreInstallato({ risorse, ambiente = process.env }) {
  const manifest = JSON.parse(readFileSync(join(risorse, 'MANIFEST.json'), 'utf8'));
  const voce = manifest.lanciatore;
  assert.equal(typeof voce?.incluso, 'boolean', 'Il manifesto del pacchetto non dice se porta il lanciatore dei comandi.');
  const native = join(risorse, 'harness-ui', 'native');
  const exe = join(native, 'lanciatore-bin', NOME_LANCIATORE);
  if (!voce.incluso) {
    assert.equal(rilascioDaAmbiente(ambiente), false, 'Pacchetto di rilascio senza il lanciatore dei comandi.');
    assert.equal(existsSync(exe), false, 'Il manifesto dice «senza lanciatore» ma l\'exe c\'è.');
    return { incluso: false, motivo: voce.motivo ?? null };
  }
  assert.match(String(voce.sha256), SHA256);
  assert.equal(await sha256(exe), voce.sha256, 'Impronta del lanciatore installato diversa dal manifesto.');
  assert.equal(readFileSync(`${exe}.sha256`, 'utf8').trim().split(/\s+/u)[0], voce.sha256, 'Il .sha256 del lanciatore installato non torna.');
  assert.equal(JSON.parse(readFileSync(join(native, 'lanciatore-binding.json'), 'utf8')).sha256, voce.sha256, 'Il riferimento del pacchetto non porta l\'impronta del lanciatore.');
  assert.ok(existsSync(join(native, 'lanciatore-bin', 'THIRD_PARTY_NOTICES.txt')), 'Avvisi di licenza del lanciatore assenti.');
  const { trovaLanciatore } = await import(pathToFileURL(join(risorse, 'harness-ui', 'src', 'kernel', 'lanciatore-windows.mjs')).href);
  const trovato = trovaLanciatore({ ambiente: { TALOS_DESKTOP_DATA_DIR: 'controllo-lanciatore' } });
  assert.equal(resolve(String(trovato.percorso)).toLowerCase(), resolve(exe).toLowerCase(), `Il nucleo dell'app non trova il lanciatore: ${trovato.motivo}`);
  return { incluso: true, sha256: voce.sha256, origine: voce.origine ?? null, trovato: true };
}
