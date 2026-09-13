#!/usr/bin/env node
/**
 * ⭐⭐⭐ 03/9 — R-01 (Fascia R, owner: «prima bisogna fare in modo che la
 * versione desktop parta correttamente»). Lanciatore per il doppio clic da
 * Explorer, invocato da `avvia-talos.cmd`. Avvia `server.mjs` come figlio,
 * aspetta che risponda davvero (mai un timer a occhio), poi apre il
 * browser di sistema — sulla schermata Doctor se manca la chiave, sulla
 * chat altrimenti. Zero variabili d'ambiente richieste: `server.mjs`
 * sceglie da solo una porta libera (vedi `trovaPortaLibera` in
 * `src/config.mjs`) quando `TALOS_HARNESS_UI_PORT` non è impostata.
 *
 * ⛔ La porta reale può differire da quella di default (4174): questo
 * script non la indovina, la LEGGE dal file di handshake che il server
 * scrive appena legato (`TALOS_HARNESS_UI_REPORT_FILE`, vedi server.mjs) —
 * più robusto di leggere lo stdout del figlio con una regex.
 *
 * `TALOS_PROVA_A_SECCO=1`: stampa il comando che aprirebbe il browser
 * invece di eseguirlo (convenzione del mobile per le prove automatiche;
 * qui definita da zero perché nel repo non esiste ancora un file che la
 * porti — vedi GUIDA-QUICK-WIN-MONOLITE-2026-09-03.md, nota sulla prova a
 * secco). I comandi che LEGGONO (attesa del figlio, lettura del file di
 * handshake) girano sempre davvero; solo l'apertura del browser è finta.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE_HARNESS_UI = join(QUI, '..');
const PROVA_A_SECCO = process.env.TALOS_PROVA_A_SECCO === '1';
const ATTESA_MASSIMA_MS = 20_000;
const INTERVALLO_POLL_MS = 150;

function attendi(ms) {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

/** Legge il file di handshake finché non esiste o non scade il tempo massimo. Mai un timer fisso: si ferma appena il server è pronto. */
async function attendiHandshake(percorsoFile, scadenzaMs) {
  const inizio = Date.now();
  for (;;) {
    try {
      const testo = readFileSync(percorsoFile, 'utf8');
      const dati = JSON.parse(testo);
      if (typeof dati.host === 'string' && Number.isInteger(dati.port)) return dati;
    } catch {
      // file non ancora scritto, o scritto a metà: si riprova.
    }
    if (Date.now() - inizio > scadenzaMs) {
      throw new Error(`Il server locale non ha risposto entro ${scadenzaMs} ms (nessun handshake in ${percorsoFile}).`);
    }
    await attendi(INTERVALLO_POLL_MS);
  }
}

/** Un GET reale su /api/v1/health: l'handshake dice che il socket è legato, questo conferma che il server risponde alle richieste. */
async function attendiSalute(base, scadenzaMs) {
  const inizio = Date.now();
  for (;;) {
    try {
      const risposta = await fetch(`${base}/api/v1/health`);
      if (risposta.ok) return;
    } catch {
      // non ancora pronto
    }
    if (Date.now() - inizio > scadenzaMs) throw new Error(`${base}/api/v1/health non ha mai risposto 200 entro ${scadenzaMs} ms.`);
    await attendi(INTERVALLO_POLL_MS);
  }
}

function chiaveApiMancante() {
  const valore = process.env.OPENROUTER_API_KEY;
  return typeof valore !== 'string' || valore.trim() === '';
}

/**
 * `cmd /c start "" <url>` — mai una shell con l'URL interpolato in una
 * stringa di comando: `start` riceve l'URL come argomento separato, così
 * niente nell'URL (che qui è sempre costruito da noi, mai da input esterno)
 * può uscire dal proprio argomento.
 */
function apriBrowser(url) {
  if (PROVA_A_SECCO) {
    console.log(`[prova a secco] apertura browser: cmd /c start "" ${url}`);
    return;
  }
  spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

async function main() {
  const cartellaHandshake = mkdtempSync(join(tmpdir(), 'talos-avvio-'));
  const fileHandshake = join(cartellaHandshake, 'report.json');
  const figlio = spawn(process.execPath, ['server.mjs'], {
    cwd: RADICE_HARNESS_UI,
    env: { ...process.env, TALOS_HARNESS_UI_REPORT_FILE: fileHandshake },
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });

  figlio.once('error', (errore) => {
    console.error('Impossibile avviare server.mjs:', errore.message);
    process.exitCode = 1;
  });
  figlio.once('exit', (codice) => {
    if (codice !== null && codice !== 0) process.exitCode = codice;
  });

  try {
    const { host, port } = await attendiHandshake(fileHandshake, ATTESA_MASSIMA_MS);
    const base = `http://${host}:${port}`;
    await attendiSalute(base, ATTESA_MASSIMA_MS);
    /*
     * ⭐ 04/9, R-02 — la decisione «Doctor o no» si chiede al server, non
     * alla variabile d'ambiente: una chiave può stare nel portachiavi senza
     * essere in OPENROUTER_API_KEY, e con l'intro attiva è la pagina stessa
     * a chiedere la chiave (nessun hash). Il Doctor come prima schermata
     * resta per chi ha spento l'intro (TALOS_INTRO=0) e non ha accessi. Se
     * lo stato non è leggibile (server vecchio) si torna al controllo di R-01.
     */
    let stato = null;
    try { stato = (await (await fetch(`${base}/api/v1/setup/stato`)).json())?.data ?? null; } catch { stato = null; }
    const apriDoctor = stato ? (stato.introDisattivato === true && stato.provider?.pronto !== true) : chiaveApiMancante();
    const url = apriDoctor ? `${base}/#avvia-doctor=1` : `${base}/`;
    console.log(`Harness UI pronto su ${base} — apro il browser${apriDoctor ? ' sulla schermata Doctor (nessun accesso a un modello configurato)' : ''}.`);
    apriBrowser(url);
  } catch (errore) {
    console.error(errore.message);
    figlio.kill();
    process.exitCode = 1;
  } finally {
    try { rmSync(cartellaHandshake, { recursive: true, force: true }); } catch { /* pulizia migliore possibile */ }
  }
}

main();
