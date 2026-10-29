/*
 * 0.6.15 (owner 27/10/2026, «Ammetterla con avviso» e «Quella da amministratore»): QUESTO processo gira come amministratore?
 * Proposta della CLI per `harness-ui/src/remoto/elevazione.mjs` in r4, così la finestra del desktop e la CLI leggono la stessa cosa
 * (la barra in basso con l'avviso fisso, il ponte che passa alla finestra da amministratore).
 *
 * Su Windows conta il TOKEN, non il gruppo: un account amministratore in una finestra normale ha l'etichetta obbligatoria Medium.
 * Si legge l'etichetta da `whoami /groups /fo csv /nh` per SID (S-1-16-12288 High, S-1-16-16384 System), mai per nome: i nomi sono
 * tradotti nella lingua del sistema. `whoami.exe` col percorso intero: quello di Git for Windows, prima nel PATH, risponde errore.
 * Misurato il 27/10/2026 su questo PC: 27–33 ms, chiesto una volta per processo. Fuori da Windows: root.
 * Fonti: Codex `windows_peer.rs` (nessuno dei due processi elevato), .NET `PipeOptions.CurrentUserOnly` («verifies both the user
 * account and elevation level»), `@neotales/is-elevated` (TokenElevation invece dell'appartenenza al gruppo), Microsoft Learn
 * «Well-known SIDs» (etichette obbligatorie S-1-16-*), `CreateNamedPipe` (descrittore di serie: Everyone solo lettura).
 */
import { execFile } from 'node:child_process';
import { win32 } from 'node:path';

const ALTE = new Set(['S-1-16-12288', 'S-1-16-16384']);
const SYSTEM_ROOT_DI_SERIE = 'C:\\Windows';

/** Una riga CSV di `whoami /fo csv`: campi fra virgolette, virgolette raddoppiate dentro i campi. */
function campiCsv(riga) {
  const campi = [];
  const re = /"((?:[^"]|"")*)"(?:,|$)/gu;
  let m;
  while ((m = re.exec(riga)) !== null) campi.push(m[1].replace(/""/gu, '"'));
  return campi;
}

/**
 * L'etichetta obbligatoria nel CSV di `whoami /groups`, o null.
 * ⛔ C-R3 (revisione blocco 8): si legge la TERZA colonna (la SID) di ogni riga, mai il primo `"S-1-16-…"` del testo: il nome di un
 *   gruppo che contiene `"S-1-16-12288"` (il CSV raddoppia le virgolette) faceva dire «High» a un token Medium.
 */
export function etichettaObbligatoria(csv) {
  for (const riga of String(csv ?? '').replace(/^﻿/u, '').split(/\r?\n/u)) {
    const sid = campiCsv(riga.trim())[2];
    if (typeof sid === 'string' && /^S-1-16-\d+$/u.test(sid)) return sid;
  }
  return null;
}

/* ⛔ 27/10/2026: `whoami` riceve solo SystemRoot, mai l'ambiente intero del server (token, chiavi: cancello SPAWN-AMBIENTE-01).
   Misurato su questo PC: con `{ SystemRoot }` e anche con `{}` risponde uguale, ~30 ms. */
const esegui = (file, argomenti, ambiente) => new Promise((risolvi, rifiuta) => {
  execFile(file, argomenti, { windowsHide: true, timeout: 10_000, env: { ...ambiente } }, (errore, uscita) => (errore ? rifiuta(errore) : risolvi(String(uscita))));
});

/** true se gira come amministratore (Windows: High o System) o come root; false se no o se non si sa. */
export async function rilevaElevazione({ piattaforma = process.platform, systemRoot = process.env.SystemRoot, run = esegui, getuid = process.getuid?.bind(process) } = {}) {
  try {
    if (piattaforma !== 'win32') return getuid?.() === 0;
    /* ⛔ 27/10/2026 (revisione del desktop all'arrivo in r4): un SystemRoot vuoto o relativo darebbe `System32\whoami.exe` RELATIVO,
       cercato nella cartella corrente, dove un file messo lì potrebbe dire «High». Si usa solo un percorso assoluto, o quello di serie. */
    /* ⛔ C-R2 (revisione blocco 8): `win32.isAbsolute` dice sì anche a `\Windows` (sul disco della cartella corrente) e a una radice di
       rete `\\server\share`: si accetta solo un disco con la lettera. */
    const radice = typeof systemRoot === 'string' && /^[A-Za-z]:\\/u.test(systemRoot) ? systemRoot : SYSTEM_ROOT_DI_SERIE;
    return ALTE.has(etichettaObbligatoria(await run(win32.join(radice, 'System32', 'whoami.exe'), ['/groups', '/fo', 'csv', '/nh'], { SystemRoot: radice })));
  } catch {
    return false;
  }
}

let memoria = null;
/** La risposta di questo processo, chiesta una volta. */
export function processoElevato() { return (memoria ??= rilevaElevazione()); }
