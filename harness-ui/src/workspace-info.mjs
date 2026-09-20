/*
 * Cosa c'è davvero dentro la cartella che stai per dare a un agente.
 *
 * Decisioni del 04/09 sulla modale «Nuova sessione»:
 *  - F9  avvisa se la cartella scelta è una radice (il disco intero, la scrivania, la home);
 *  - F10 dice QUANTI file ha, prima di partire, non dopo;
 *  - F19 il ramo git corrente · F20 le modifiche non salvate · F21 i repo annidati.
 * Nell'audit del 06/09 erano tutte e cinque ❌: la modale non diceva niente di tutto questo, e
 * l'unico modo di scoprirlo era avviare una sessione e guardarla annaspare.
 *
 * ⛔ Contare i file di una cartella enorme è ESSO STESSO il problema: VS Code, aprendo una cartella
 * con milioni di voci, arriva a piantarsi, e la sua stessa guida dice di avvisare invece di
 * espandere (microsoft/vscode #237394, #75004, letti 06/09/2026). Quindi qui si conta CON UN TETTO:
 * si smette a `TETTO_FILE` e si risponde «più di N», che è esattamente l'informazione che serve —
 * nessuno ha bisogno del numero esatto quando il numero è «troppi».
 * ⛔ E si saltano le cartelle che non sono lavoro (`node_modules`, `.git`, cache): contarle darebbe
 * un numero vero e inutile, e costerebbe la parte più lenta della scansione.
 *
 * ⛔ I repo annidati non si scoprono da soli: VS Code li cerca esplicitamente e con un limite di
 * profondità (microsoft/vscode #87888, #133577). Stessa scelta qui: profondità 3, che copre
 * `mobile/`, `packages/*` e i vendor, senza camminare l'albero intero.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, parse, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { ambienteSenzaVariabiliDelServer } from './ambiente-solo-server.mjs';

export const TETTO_FILE = 20_000;

/*
 * I numeri si scrivono all'italiana con una funzione nostra, non con `toLocaleString`: la
 * formattazione locale dipende dai dati ICU compilati in Node, e su un ambiente senza ICU completo
 * «1234» resta «1234». Un separatore che a volte c'è e a volte no è peggio di nessun separatore.
 */
export function numeroItaliano(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.trunc(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, v < 0 ? '-' : '');
}
export const PROFONDITA_REPO_ANNIDATI = 3;
const SALTA = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next', '.cache', '.venv', 'venv', '__pycache__', '.gradle', 'target', 'vendor', '.turbo', '.parcel-cache']);

/**
 * Una radice è una cartella che non si dà a un agente a cuor leggero: il disco intero, la home,
 * la scrivania, i documenti. Non si vieta — si avvisa (F9).
 */
export function eUnaRadice(percorso) {
  const grezzo = String(percorso || '');
  if (!grezzo) return false;
  const p = grezzo.replace(/[\/]+$/, '');
  /*
   * ⛔ misurato dalla prova: togliendo la barra finale «C:\» diventa «C:» e «/» diventa la stringa
   * vuota, e nessuna delle due somigliava più a una radice. Le due forme si riconoscono PRIMA del resto.
   */
  if (p === '' || /^[a-z]:$/i.test(p)) return true;
  const analisi = parse(p);
  if (analisi.root && (p + sep) === analisi.root) return true;
  if (p === analisi.root) return true;
  const ultimo = p.split(/[\\/]/).pop()?.toLowerCase() || '';
  const nomiRadice = new Set(['desktop', 'scrivania', 'documents', 'documenti', 'downloads', 'download', 'users', 'home', 'utenti']);
  if (nomiRadice.has(ultimo)) return true;
  // la home dell'utente: due segmenti sotto la radice, sotto Users/home
  const pezzi = p.split(/[\\/]/).filter(Boolean);
  if (pezzi.length === 2 && /^(users|home|utenti)$/i.test(pezzi[0])) return true;
  if (pezzi.length === 3 && /^[a-z]:$/i.test(pezzi[0]) && /^(users|utenti)$/i.test(pezzi[1])) return true;
  return false;
}

/** Conta i file veri fino al tetto, saltando ciò che non è lavoro. Torna `{ file, cartelle, oltre }`. */
export async function contaFile(percorso, { tetto = TETTO_FILE, salta = SALTA } = {}) {
  let file = 0; let cartelle = 0; let oltre = false;
  const coda = [percorso];
  while (coda.length > 0) {
    const corrente = coda.shift();
    let voci;
    try { voci = await readdir(corrente, { withFileTypes: true }); } catch { continue; }
    for (const voce of voci) {
      if (voce.isDirectory()) {
        if (salta.has(voce.name)) continue;
        cartelle += 1;
        coda.push(join(corrente, voce.name));
      } else if (voce.isFile()) {
        file += 1;
        if (file >= tetto) { oltre = true; return { file, cartelle, oltre }; }
      }
    }
  }
  return { file, cartelle, oltre };
}

function git(argomenti, cwd) {
  return new Promise((risolvi) => {
    let uscita = '';
    let processo;
    try {
      /* ⛔ 17/09/2026 (A-bis): `env` dichiarato — senza, il figlio eredita l'ambiente INTERO del server (token e chiavi compresi). */
      processo = spawn('git', argomenti, { cwd, windowsHide: true, env: ambienteSenzaVariabiliDelServer() });
    } catch { risolvi(null); return; }
    const timer = setTimeout(() => { try { processo.kill(); } catch { /* già morto */ } risolvi(null); }, 4000);
    processo.stdout?.on('data', (pezzo) => { uscita += String(pezzo); });
    processo.on('error', () => { clearTimeout(timer); risolvi(null); });
    processo.on('close', (codice) => { clearTimeout(timer); risolvi(codice === 0 ? uscita : null); });
  });
}

/** Ramo, modifiche non salvate, repo annidati (F19-F21). Se non è un repo, torna `null` senza rumore. */
export async function statoGit(percorso, { profondita = PROFONDITA_REPO_ANNIDATI, eseguiGit = git } = {}) {
  const dentro = await eseguiGit(['rev-parse', '--is-inside-work-tree'], percorso);
  if (!dentro || dentro.trim() !== 'true') return null;
  const ramo = (await eseguiGit(['rev-parse', '--abbrev-ref', 'HEAD'], percorso) || '').trim() || null;
  const stato = await eseguiGit(['status', '--porcelain'], percorso);
  const nonSalvate = stato === null ? null : stato.split('\n').filter((r) => r.trim()).length;
  const annidati = await repoAnnidati(percorso, profondita);
  return { ramo, nonSalvate, repoAnnidati: annidati };
}

/** Le cartelle che hanno un `.git` proprio, sotto quella scelta, fino alla profondità data. */
export async function repoAnnidati(percorso, profondita = PROFONDITA_REPO_ANNIDATI, livello = 1) {
  if (livello > profondita) return [];
  let voci;
  try { voci = await readdir(percorso, { withFileTypes: true }); } catch { return []; }
  const trovati = [];
  for (const voce of voci) {
    if (!voce.isDirectory() || SALTA.has(voce.name)) continue;
    const figlio = join(percorso, voce.name);
    let suo = false;
    try { await stat(join(figlio, '.git')); suo = true; } catch { /* non è un repo */ }
    if (suo) { trovati.push(figlio); continue; } // dentro un repo annidato non si scende oltre
    trovati.push(...await repoAnnidati(figlio, profondita, livello + 1));
  }
  return trovati;
}

/** Le istruzioni dell'agente già presenti nella cartella: dicono che il progetto è già «abitato». */
export async function istruzioniPresenti(percorso) {
  const nomi = ['CLAUDE.md', 'AGENTS.md', 'TALOS.md', '.talos'];
  const trovate = [];
  for (const nome of nomi) {
    try { await stat(join(percorso, nome)); trovate.push(nome); } catch { /* non c'è */ }
  }
  return trovate;
}

/**
 * Il ritratto completo della cartella, quello che la modale scrive prima di avviare.
 * Non lancia mai: una cartella illeggibile torna `leggibile: false` invece di rompere la modale.
 */
export async function ritrattoCartella(percorso, opzioni = {}) {
  const p = String(percorso || '');
  if (!p) return { percorso: p, leggibile: false };
  let esiste = false;
  try { const s = await stat(p); esiste = s.isDirectory(); } catch { esiste = false; }
  if (!esiste) return { percorso: p, leggibile: false };
  const [conteggio, gitInfo, istruzioni] = await Promise.all([
    contaFile(p, opzioni),
    statoGit(p, opzioni).catch(() => null),
    istruzioniPresenti(p).catch(() => []),
  ]);
  return {
    percorso: p,
    leggibile: true,
    radice: eUnaRadice(p),
    file: conteggio.file,
    cartelle: conteggio.cartelle,
    oltreIlTetto: conteggio.oltre,
    tetto: opzioni.tetto ?? TETTO_FILE,
    git: gitInfo,
    istruzioni,
  };
}

/** La frase che la modale mostra: una riga, in italiano, coi numeri veri. */
export function frasiRitratto(ritratto) {
  if (!ritratto || !ritratto.leggibile) return 'Non riesco a leggere questa cartella.';
  const pezzi = [];
  pezzi.push(ritratto.oltreIlTetto ? `più di ${numeroItaliano(ritratto.tetto)} file` : `${numeroItaliano(ritratto.file)} file`);
  if (ritratto.cartelle > 0) pezzi.push(`${numeroItaliano(ritratto.cartelle)} cartelle`);
  if (ritratto.git?.ramo) pezzi.push(`ramo ${ritratto.git.ramo}`);
  if (Number.isFinite(ritratto.git?.nonSalvate)) pezzi.push(ritratto.git.nonSalvate === 0 ? 'niente da salvare' : `${ritratto.git.nonSalvate} modifiche non salvate`);
  if (ritratto.git?.repoAnnidati?.length) pezzi.push(`${ritratto.git.repoAnnidati.length} repo annidati`);
  if (ritratto.istruzioni?.length) pezzi.push(`istruzioni: ${ritratto.istruzioni.join(', ')}`);
  return pezzi.join(' · ');
}

/** L'avviso, quando serve: una frase che dice cosa succede se parti così. */
export function avvisoRitratto(ritratto) {
  if (!ritratto || !ritratto.leggibile) return '';
  if (ritratto.radice) return 'Questa è una cartella radice: l’agente vedrebbe tutto quello che c’è sotto. Scegli il progetto, non il disco.';
  if (ritratto.oltreIlTetto) return `Qui ci sono più di ${numeroItaliano(ritratto.tetto)} file: l’albero pesa a ogni giro. Se puoi, scegli una sottocartella.`;
  return '';
}
