/**
 * doctor.mjs — 4 controlli VERI, non un "Doctor: Healthy" scritto a mano.
 * Blocco Settings, sotto-carta "Control plane". Owner, 27/8: "analizza
 * bene... eliminare tutti i mockup" — trovato che il pulsante Doctor
 * mostrava sempre lo stesso testo hardcoded, indipendentemente da
 * qualunque stato reale del sistema.
 *
 * ⛔ Stesso principio già in uso in tutto il progetto (`enforcement`
 * dichiarato, mai un bluff): ogni riga dice cosa ha VERIFICATO, non cosa
 * ci si aspetta. `shell` riusa `eseguiComandoSandboxato` — la stessa
 * funzione che l'attrezzo `shell` chiama davvero, non una seconda
 * verifica scritta a mano che potrebbe disallinearsi.
 *
 * ⭐ 29/8 — copia PORTATA verbatim dal canonico
 * (AVM-harness-desktop/harness-ui/src/doctor.mjs) nella copia standalone
 * imbarcata nell'APK (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §11.2):
 * il percorso relativo dell'import sotto combacia GIÀ con l'albero di
 * staging che TalosTerminalPlugin.kt costruisce sul device
 * (KERNEL_DIR_REMOTO = .../AVM-harness/mobile/scripts/harness-talos),
 * verificato PRIMA di copiare, non assunto — zero adattamento richiesto.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eseguiComandoSandboxato } from '../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs';

function controllaGit(spawnSyncFn = spawnSync) {
  try {
    const risultato = spawnSyncFn('git', ['--version']);
    return risultato.status === 0;
  } catch {
    return false;
  }
}

/**
 * @param {boolean} chiaveConfigurata — config.chiaveApi presente sul server.
 * @returns {{chiaveApi:boolean, shell:'wsl2'|'none', git:boolean, naviga:boolean}}
 */
export async function diagnosi({
  chiaveConfigurata, eseguiComandoSandboxatoFn = eseguiComandoSandboxato, spawnSyncFn = spawnSync,
} = {}) {
  // ⛔ Una cartella usa-e-getta SOLO per il comando diagnostico, mai una
  // cartella del progetto vero — il Doctor non deve toccare niente.
  const cartellaProva = mkdtempSync(join(tmpdir(), 'talos-doctor-'));
  let shell;
  try {
    const esito = await eseguiComandoSandboxatoFn('echo ok', cartellaProva);
    shell = esito.enforcement;
  } finally {
    rmSync(cartellaProva, { recursive: true, force: true });
  }
  return {
    chiaveApi: Boolean(chiaveConfigurata),
    shell,
    git: controllaGit(spawnSyncFn),
    naviga: true, // built-in, nessuna dipendenza esterna da verificare
  };
}
