/*
 * 13/10/2026 (bugfixer, lotto 2, C1) — QUALE KERNEL HA CARICATO QUESTO SERVER, detto in una riga all'avvio.
 *
 * `TALOS_OWNER_RUNTIME_MODULE` sceglie il modulo; quando manca vale il kernel di base nel repo (`config.mjs`, `kernelNelRepo`).
 * L'app impacchettata (`desktop/runtime.mjs`) e il lanciatore (`scripts/avvia-talos.mjs`, `scripts/aggiorna-4174.ps1`) impostano
 * l'ADATTATORE desktop; un `node server.mjs` a mano no. Tre volte un server di prova è rimasto per giorni sul kernel di base senza
 * che niente lo dicesse (10/09 e 05/10 sul 4174, 13/10 sul 4177): partiva, rispondeva, i giri funzionavano, e le cure dell'adattatore
 * (compattazione, ganci del contesto, correzione degli esiti) lì non giravano.
 *
 * ⛔ Il fatto si legge dal modulo CARICATO (`DESKTOP_BLACKBOX_HOTFIX_VERSION`, che esporta solo l'adattatore), mai dal nome del
 *   file: un nome si copia, un export no.
 * ⛔ Solo parole: qui non si cambia quale kernel parte. Il valore di serie è una decisione dell'owner.
 *
 * L3-9 (owner 13/10/2026, D7-bis): la decisione è arrivata — senza la variabile il server desktop carica l'ADATTATORE
 * (`kernel-di-serie-desktop.mjs`). `daVariabile` falso vuol dire «nessuno l'ha scelto: è il valore di serie del desktop».
 */

/**
 * @param {{ percorso: string|null|undefined, modulo: object|null|undefined, errore?: unknown, daVariabile: boolean }} dati
 * @returns {{ tipo: 'adattatore-desktop'|'base'|'sconosciuto'|'non-caricato'|'nessuno', avviso: boolean, riga: string }}
 */
export function descriviKernelCaricato({ percorso, modulo, errore = null, daVariabile } = {}) {
  const origine = daVariabile ? 'chosen by TALOS_OWNER_RUNTIME_MODULE' : 'TALOS_OWNER_RUNTIME_MODULE is not set: the desktop default';
  if (!percorso) {
    return { tipo: 'nessuno', avviso: true, riga: '[kernel] WARNING: NO kernel module — TALOS_OWNER_RUNTIME_MODULE is not set and the repository has none. Every real turn will fail.' };
  }
  if (!modulo) {
    const perche = errore instanceof Error ? errore.message : errore ? String(errore) : 'unknown reason';
    return { tipo: 'non-caricato', avviso: true, riga: `[kernel] WARNING: the kernel module could not be loaded (${perche}) — ${percorso} (${origine}).` };
  }
  if (typeof modulo.DESKTOP_BLACKBOX_HOTFIX_VERSION === 'string' && typeof modulo.talosLavora === 'function') {
    return { tipo: 'adattatore-desktop', avviso: false, riga: `[kernel] desktop adapter ${modulo.DESKTOP_BLACKBOX_HOTFIX_VERSION} — ${percorso} (${origine}).` };
  }
  if (typeof modulo.talosLavora === 'function') {
    return { tipo: 'base', avviso: true, riga: `[kernel] WARNING: BASE kernel, NOT the desktop adapter — ${percorso} (${origine}). `
      + 'The app and the owner\'s server run src/kernel/talosHarness.desktop-hotfix.mjs: compaction, context hooks and tool-result corrections are different here. '
      + 'To run what the product runs, set TALOS_OWNER_RUNTIME_MODULE to that file.' };
  }
  return { tipo: 'sconosciuto', avviso: true, riga: `[kernel] WARNING: the module does not export talosLavora — ${percorso} (${origine}). Every real turn will fail.` };
}
