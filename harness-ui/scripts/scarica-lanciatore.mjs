/*
 * Il lanciatore dei comandi su Windows (decisione 374 R1, owner 1037; forma del giudice v1629 §10.3), dalla corsa fissata in
 * `native/lanciatore-binding.json` a `native/lanciatore-bin/`. Lo stesso disegno di `scarica-binding-iroh.mjs` (owner 22/10/2026: «Nel
 * repo solo l'impronta»), con una differenza voluta: finché il riferimento NON è fissato (`runId` e `sha256` null, prima della prima
 * corsa di `lanciatore.yml` sul pubblico) lo script lo dice ed esce verde, perché il nucleo ripiega dicendolo (§4, §10.4: «nipoti
 * seguiti: no», motivo «non-fissato»). Fissato il riferimento, ogni controllo che manca ferma la release, come per iroh:
 *   1. `gh run download` da QUELLA corsa (mai «l'ultima»);
 *   2. `gh attestation verify` col firmatario `lanciatore.yml`, il RAMO e il COMMIT sorgente del riferimento, niente runner in proprio;
 *   3. lo SHA-256 del file e quello del suo `.sha256` sono entrambi quello del riferimento.
 * Se il file c'è già ed è quello giusto non si scarica niente.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { improntaAttesa } from '../src/remoto/binding.mjs';
import { cartellaScratch } from '../src/scratch.mjs';
import { GIORNI_DI_PREAVVISO, giorniAllaScadenza } from './scarica-binding-iroh.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const FILE_RIFERIMENTO = join(root, 'native', 'lanciatore-binding.json');
/** Dove lo cerca il nucleo (`src/kernel/lanciatore-windows.mjs`, CANDIDATI). */
export const CARTELLA_LANCIATORE = join(root, 'native', 'lanciatore-bin');

/** I cinque campi che la prima corsa riempie: «non fissato» vuol dire TUTTI null, mai una parte. */
const CAMPI_DELLA_CORSA = ['runId', 'sha256', 'byte', 'commitSorgente', 'scade'];

/**
 * Il riferimento, campo per campo. `fissato: false` solo se i cinque campi della corsa sono TUTTI null (prima della prima corsa).
 * Revisore B (12/11): con «runId e sha256 null» soltanto, un riferimento già fissato e svuotato a metà restava verde. La via stretta
 * dopo la prima fissazione è `--fissato` sulla riga di comando (`daRigaDiComando`): lì nemmeno il tutto-null passa.
 */
export function leggiRiferimento(testo) {
  const r = JSON.parse(testo);
  const problemi = [];
  if (!/^[\w.-]+\/[\w.-]+$/.test(r.repository ?? '')) problemi.push('repository');
  if (r.workflow !== '.github/workflows/lanciatore.yml') problemi.push('workflow');
  if (!/^[\w.-]+$/.test(r.artefatto ?? '')) problemi.push('artefatto');
  if (r.file !== 'talos-lanciatore.exe') problemi.push('file');
  if (!/^refs\/heads\/[\w./-]+$/.test(r.ramoSorgente ?? '')) problemi.push('ramoSorgente');
  const fissato = !CAMPI_DELLA_CORSA.every((campo) => r[campo] === null);
  if (fissato) {
    if (!Number.isSafeInteger(r.runId) || r.runId <= 0) problemi.push('runId');
    if (!/^[0-9a-f]{64}$/.test(r.sha256 ?? '')) problemi.push('sha256');
    if (!Number.isSafeInteger(r.byte) || r.byte <= 0) problemi.push('byte');
    if (!/^[0-9a-f]{40}$/.test(r.commitSorgente ?? '')) problemi.push('commitSorgente');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.scade ?? '') || Number.isNaN(Date.parse(`${r.scade}T00:00:00Z`))) problemi.push('scade');
  }
  if (problemi.length) throw new Error(`Riferimento del lanciatore non valido (${problemi.join(', ')}): ${FILE_RIFERIMENTO}`);
  return { ...r, fissato };
}

/** Come per iroh (GitHub tiene gli artefatti al massimo 90 giorni): un mese prima lo si dice a ogni giro, col rimedio di QUESTO file. */
export function avvisoDiScadenza(rif, oggi = new Date()) {
  const giorni = giorniAllaScadenza(rif, oggi);
  if (giorni > GIORNI_DI_PREAVVISO) return null;
  const rimedio = `rilancia ${rif.workflow} e aggiorna runId, sha256, byte, commitSorgente e scade in native/lanciatore-binding.json`;
  return giorni < 0 ? `l'artefatto della corsa ${rif.runId} è SCADUTO il ${rif.scade}: ${rimedio}.`
    : `l'artefatto della corsa ${rif.runId} scade il ${rif.scade} (tra ${giorni} giorni): ${rimedio}.`;
}

const sha256 = percorso => createHash('sha256').update(readFileSync(percorso)).digest('hex');

/** null se nella cartella c'è l'exe giusto con la sua impronta giusta; altrimenti il motivo. */
export function problemaDelLanciatore(cartella, rif) {
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

/**
 * I due file nella cartella, tutti o nessuno (revisore B, 12/11): prima si copiano accanto con un nome temporaneo, poi si rinominano
 * sopra quelli di prima. Se la copia si rompe a metà i file di prima restano com'erano e i temporanei se ne vanno; `rename` nella
 * stessa cartella sostituisce il file in un colpo (un exe scritto a metà non esiste mai col suo nome vero).
 */
function posaTuttoONiente(da, cartella, nomi, { copia = copyFileSync, rinomina = renameSync } = {}) {
  const coppie = nomi.map((nome) => ({ sorgente: join(da, nome), temporaneo: join(cartella, `${nome}.nuovo-${process.pid}`), finale: join(cartella, nome) }));
  try {
    for (const c of coppie) copia(c.sorgente, c.temporaneo);
    for (const c of coppie) rinomina(c.temporaneo, c.finale);
  } finally {
    for (const c of coppie) rmSync(c.temporaneo, { force: true });
  }
}

export function preparaLanciatore({ cartella = CARTELLA_LANCIATORE, riferimento = FILE_RIFERIMENTO, gh = (args) => esegui('gh', args), copia = copyFileSync, rinomina = renameSync } = {}) {
  const rif = leggiRiferimento(readFileSync(riferimento, 'utf8'));
  if (!rif.fissato) {
    return { rif, scaricato: false, avviso: `il riferimento non è ancora fissato (nessuna corsa di ${rif.workflow}): i comandi partono come prima e la diagnostica dice «non seguiti».` };
  }
  if (problemaDelLanciatore(cartella, rif) === null) return { rif, scaricato: false, avviso: avvisoDiScadenza(rif) };
  if (giorniAllaScadenza(rif) < 0) throw new Error(avvisoDiScadenza(rif));
  const temporanea = cartellaScratch('talos-lanciatore-');
  try {
    const comandi = comandiGh(rif, temporanea);
    try { gh(comandi.scarica); }
    catch (errore) {
      if (giorniAllaScadenza(rif) <= 1) throw new Error(`${errore.message} — probabilmente ${avvisoDiScadenza(rif)}`, { cause: errore });
      throw errore;
    }
    gh(comandi.attestazione);
    const problema = problemaDelLanciatore(temporanea, rif);
    if (problema) throw new Error(`Lanciatore della corsa ${rif.runId}: ${problema}.`);
    mkdirSync(cartella, { recursive: true });
    posaTuttoONiente(temporanea, cartella, [rif.file, `${rif.file}.sha256`], { copia, rinomina });
  } finally {
    rmSync(temporanea, { recursive: true, force: true });
  }
  const dopo = problemaDelLanciatore(cartella, rif);
  if (dopo) throw new Error(`Lanciatore copiato ma non valido: ${dopo}.`);
  return { rif, scaricato: true, avviso: avvisoDiScadenza(rif) };
}

/**
 * Ciò che fa `node scripts/scarica-lanciatore.mjs [--fissato]`: torna il codice d'uscita (0 pronto o non ancora fissato, 1 non pronto).
 * `--fissato` è per la release DOPO la prima fissazione: un riferimento tornato a null non resta verde (revisore B, 12/11).
 */
export function daRigaDiComando({ argomenti = process.argv.slice(2), prepara = preparaLanciatore, ambiente = process.env,
  scrivi = console.log, avvisa = console.warn, errore = console.error } = {}) {
  try {
    const { rif, scaricato, avviso } = prepara();
    if (!rif.fissato && argomenti.includes('--fissato')) {
      throw new Error(`il riferimento non è fissato (native/lanciatore-binding.json): rilancia ${rif.workflow} e riempi runId, sha256, byte, commitSorgente e scade.`);
    }
    if (rif.fissato) scrivi(`Lanciatore ${scaricato ? 'scaricato e verificato' : 'già presente e verificato'}: corsa ${rif.runId}, sha256 ${rif.sha256}.`);
    if (avviso) avvisa(ambiente.GITHUB_ACTIONS === 'true' ? `::warning title=Lanciatore::${avviso}` : `Attenzione: ${avviso}`);
    return 0;
  } catch (e) {
    errore(`Lanciatore non pronto: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = daRigaDiComando();
