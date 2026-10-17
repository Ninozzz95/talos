/*
 * L3-9 (owner 13/10/2026, D7-bis: «di serie l'adattatore desktop») — QUALE KERNEL carica un server desktop quando nessuno lo dice.
 *
 * Prima: senza `TALOS_OWNER_RUNTIME_MODULE` un `node server.mjs` a mano caricava il kernel di BASE (`src/kernel/talosHarness.mjs`),
 *   mentre l'app (`desktop/runtime.mjs`) e i lanciatori (`scripts/avvia-talos.mjs`, `scripts/aggiorna-4174.ps1`) impostano
 *   l'ADATTATORE desktop. Tre volte un server di prova è rimasto per giorni sul kernel di base (`kernel-caricato.mjs`).
 *
 * ⇒ Stesso meccanismo dei lanciatori, un posto in più: se la variabile manca la si IMPOSTA nell'ambiente del processo, prima
 *   che qualunque altro modulo la legga. ⛔ Perché l'ambiente e non un valore di serie dentro `config.mjs` o dentro
 *   `createOwnerRuntimeAdapter`: nel processo del server la variabile la leggono in DUE — `config.mjs` (il kernel dei giri) e
 *   l'adattatore che `agent-service.mjs` crea senza argomenti a livello di modulo (compattazione, comandi, ritenti). Cambiarne uno
 *   solo avrebbe dato un server con due kernel; cambiare il valore di serie dell'adattatore avrebbe cambiato il kernel anche
 *   alla CLI, che importa `agent-service.mjs`. Così chi non passa da `server.mjs` (CLI, mobile, banco, prove) non vede niente.
 *
 * ⛔ Chi imposta la variabile vince, byte per byte: il kernel di base resta chiedibile mettendoci il suo percorso assoluto.
 * ⛔ Se l'adattatore non c'è (pacchetto tagliato) non si inventa niente: resta la regola di prima (`config.mjs`, `kernelNelRepo`).
 *
 * Questo file NON ha effetti all'importazione (le prove lo importano): l'effetto sta in `kernel-di-serie-desktop.avvio.mjs`,
 * che importa solo `server.mjs`.
 */
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VARIABILE_KERNEL = 'TALOS_OWNER_RUNTIME_MODULE';

/** @returns {{ applicato: boolean, percorso: string|null }} */
export function applicaKernelDiSerieDesktop(env = process.env, { adattatore = fileURLToPath(new URL('./kernel/talosHarness.desktop-hotfix.mjs', import.meta.url)) } = {}) {
  if (typeof env[VARIABILE_KERNEL] === 'string' && env[VARIABILE_KERNEL].trim() !== '') return { applicato: false, percorso: null };
  try { if (!statSync(adattatore).isFile()) return { applicato: false, percorso: null }; }
  catch { return { applicato: false, percorso: null }; }
  env[VARIABILE_KERNEL] = adattatore;
  return { applicato: true, percorso: adattatore };
}
