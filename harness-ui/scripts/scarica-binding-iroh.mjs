/*
 * Il binding iroh del controllo remoto, dalla corsa fissata in `native/iroh-binding.json` a `native/iroh/` (owner 22/10/2026:
 * «Nel repo solo l'impronta»). Lo usano la release (prima di `dist`) e chi prepara il pacchetto in locale.
 *
 * Tre controlli, e se uno manca ci si ferma — un pacchetto senza binding direbbe «remoto non disponibile» senza un errore:
 *   1. lo scarica `gh run download` da QUELLA corsa (non «l'ultima»: l'ultima può essere un'altra compilazione);
 *   2. `gh attestation verify` col firmatario `iroh-binding.yml`, il RAMO e il COMMIT sorgente del riferimento, e niente runner
 *      ospitati in proprio — un file caricato a mano su un artefatto non ha la firma, e una corsa partita da un altro ramo (una PR, un
 *      ramo di prova) ha la firma giusta ma non il sorgente giusto (revisione del 22/10: il solo firmatario non lo escludeva);
 *   3. lo SHA-256 del file e quello del suo `.sha256` sono entrambi quello del riferimento.
 * Se il file c'è già ed è quello giusto non si scarica niente (in locale, dopo il primo giro).
 *
 * `gh` legge il gettone da GH_TOKEN (in CI: `github.token` col permesso `actions: read`).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { improntaAttesa } from '../src/remoto/binding.mjs';
import { cartellaScratch } from '../src/scratch.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const FILE_RIFERIMENTO = join(root, 'native', 'iroh-binding.json');
export const CARTELLA_BINDING = join(root, 'native', 'iroh');

/** Il riferimento, controllato campo per campo: un riferimento storto non deve diventare un download «di qualcosa». */
export function leggiRiferimento(testo) {
  const r = JSON.parse(testo);
  const problemi = [];
  if (!/^[\w.-]+\/[\w.-]+$/.test(r.repository ?? '')) problemi.push('repository');
  if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(r.workflow ?? '')) problemi.push('workflow');
  if (!Number.isSafeInteger(r.runId) || r.runId <= 0) problemi.push('runId');
  if (!/^[\w.-]+$/.test(r.artefatto ?? '')) problemi.push('artefatto');
  if (!/^[\w.-]+\.node$/.test(r.file ?? '')) problemi.push('file');
  if (!/^[0-9a-f]{64}$/.test(r.sha256 ?? '')) problemi.push('sha256');
  if (!/^[0-9a-f]{40}$/.test(r.commitSorgente ?? '')) problemi.push('commitSorgente');
  if (!/^refs\/heads\/[\w./-]+$/.test(r.ramoSorgente ?? '')) problemi.push('ramoSorgente');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.scade ?? '') || Number.isNaN(Date.parse(`${r.scade}T00:00:00Z`))) problemi.push('scade');
  if (problemi.length) throw new Error(`Riferimento del binding iroh non valido (${problemi.join(', ')}): ${FILE_RIFERIMENTO}`);
  return r;
}

const sha256 = percorso => createHash('sha256').update(readFileSync(percorso)).digest('hex');

/** null se nella cartella c'è il binding giusto con la sua impronta giusta; altrimenti il motivo. */
export function problemaDelBinding(cartella, rif) {
  const file = join(cartella, rif.file);
  const impronta = `${file}.sha256`;
  if (!existsSync(file) || !existsSync(impronta)) return 'assente';
  if (sha256(file) !== rif.sha256) return 'impronta del file diversa dal riferimento';
  if (improntaAttesa(readFileSync(impronta, 'utf8')) !== rif.sha256) return 'file .sha256 diverso dal riferimento';
  return null;
}

function esegui(comando, argomenti) {
  const r = spawnSync(comando, argomenti, { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) {
    const dettaglio = (r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-3).join(' | ');
    throw new Error(`${comando} ${argomenti.slice(0, 2).join(' ')} non riuscito (${r.error?.code ?? r.status}): ${dettaglio}`);
  }
  return r.stdout;
}

/** Gli argomenti esatti dei due comandi `gh`: esportati per le prove. */
export function comandiGh(rif, destinazione) {
  return {
    scarica: ['run', 'download', String(rif.runId), '-R', rif.repository, '-n', rif.artefatto, '-D', destinazione],
    attestazione: ['attestation', 'verify', join(destinazione, rif.file), '-R', rif.repository,
      '--signer-workflow', `${rif.repository}/${rif.workflow}`,
      '--source-ref', rif.ramoSorgente, '--source-digest', rif.commitSorgente, '--deny-self-hosted-runners'],
  };
}

/** Giorni interi da `oggi` alla scadenza dell'artefatto (negativi se è scaduto). */
export function giorniAllaScadenza(rif, oggi = new Date()) {
  return Math.floor((Date.parse(`${rif.scade}T00:00:00Z`) - Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate())) / 86_400_000);
}
/* GitHub tiene gli artefatti al massimo 90 giorni (`retention-days`): un mese prima della scadenza lo si dice a ogni giro, così la
   corsa nuova di `iroh-binding.yml` e il riferimento aggiornato arrivano PRIMA che una release si fermi qui */
export const GIORNI_DI_PREAVVISO = 30;
export function avvisoDiScadenza(rif, oggi = new Date()) {
  const giorni = giorniAllaScadenza(rif, oggi);
  if (giorni > GIORNI_DI_PREAVVISO) return null;
  const rimedio = `rilancia ${rif.workflow} e aggiorna runId, sha256, commitSorgente e scade in native/iroh-binding.json`;
  return giorni < 0 ? `l'artefatto della corsa ${rif.runId} è SCADUTO il ${rif.scade}: ${rimedio}.`
    : `l'artefatto della corsa ${rif.runId} scade il ${rif.scade} (tra ${giorni} giorni): ${rimedio}.`;
}

export function preparaBindingIroh({ cartella = CARTELLA_BINDING, riferimento = FILE_RIFERIMENTO, gh = (args) => esegui('gh', args) } = {}) {
  const rif = leggiRiferimento(readFileSync(riferimento, 'utf8'));
  if (problemaDelBinding(cartella, rif) === null) return { rif, scaricato: false, avviso: avvisoDiScadenza(rif) };
  /* scaduto e da scaricare: `gh run download` fallirebbe con un «not found» che non dice perché */
  if (giorniAllaScadenza(rif) < 0) throw new Error(avvisoDiScadenza(rif));
  /* la cartella usa-e-getta del prodotto (`src/scratch.mjs`), mai la TEMP di sistema (SCRATCH-CANCELLO-01) */
  const temporanea = cartellaScratch('talos-iroh-');
  try {
    const comandi = comandiGh(rif, temporanea);
    /* revisione del 22/10: `scade` è un giorno, GitHub fa scadere l'artefatto a un'ORA — il giorno stesso il controllo qui sopra non
       scatta, e il download fallisce con un «not found» nudo. Vicino alla scadenza, l'errore porta il rimedio. */
    try { gh(comandi.scarica); }
    catch (errore) {
      if (giorniAllaScadenza(rif) <= 1) throw new Error(`${errore.message} — probabilmente ${avvisoDiScadenza(rif)}`, { cause: errore });
      throw errore;
    }
    gh(comandi.attestazione);
    const problema = problemaDelBinding(temporanea, rif);
    if (problema) throw new Error(`Binding iroh della corsa ${rif.runId}: ${problema}.`);
    for (const nome of [rif.file, `${rif.file}.sha256`]) copyFileSync(join(temporanea, nome), join(cartella, nome));
  } finally {
    rmSync(temporanea, { recursive: true, force: true });
  }
  const dopo = problemaDelBinding(cartella, rif);
  if (dopo) throw new Error(`Binding iroh copiato ma non valido: ${dopo}.`);
  return { rif, scaricato: true, avviso: avvisoDiScadenza(rif) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { rif, scaricato, avviso } = preparaBindingIroh();
    console.log(`Binding iroh ${scaricato ? 'scaricato e verificato' : 'già presente e verificato'}: corsa ${rif.runId}, sha256 ${rif.sha256}.`);
    /* in CI l'annotazione `::warning::` compare nel riepilogo della corsa, non solo nel registro */
    if (avviso) console.warn(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=Binding iroh::${avviso}` : `Attenzione: ${avviso}`);
  } catch (e) {
    console.error(`Binding iroh non pronto: ${e.message}`);
    process.exitCode = 1;
  }
}
