/*
 * Controllo remoto — dove sta il binding Node di iroh, e il suo controllo prima di caricarlo.
 *
 * Il binding è codice NATIVO che gira dentro il server: si carica solo se la sua impronta SHA-256 è quella fissata nel repo
 * (`native/iroh/iroh.win32-x64-msvc.node.sha256`, scritta dalla nostra CI che lo compila col lock aggiornato, owner 18/10). Un
 * file diverso non si carica e il remoto dice «non disponibile».
 *
 * Due posti, in ordine:
 *   1. `TALOS_IROH_BINDING` — SOLO sviluppo e prove: il percorso di un `.node` o della cartella del pacchetto npm. Nessuna
 *      impronta (è una scelta esplicita di chi avvia il server da sorgente). L'app installata non lo legge: lì vale solo il 2.
 *   2. `native/iroh/iroh.win32-x64-msvc.node` accanto al server, con la sua impronta.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const richiedi = createRequire(import.meta.url);
export const FILE_BINDING = fileURLToPath(new URL('../../native/iroh/iroh.win32-x64-msvc.node', import.meta.url));
export const FILE_IMPRONTA = `${FILE_BINDING}.sha256`;

/** L'impronta attesa dal file `.sha256` (formato di `sha256sum`: «<hex>  <nome>»), o null. */
export function improntaAttesa(testo) {
  const m = /^([0-9a-f]{64})\b/i.exec(String(testo ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Torna il modulo, o null se non c'è o non è quello giusto. `env` e `fs` si iniettano nelle prove.
 * `app`: vero nell'app installata (`TALOS_DESKTOP_DATA_DIR`), dove la strada di sviluppo è chiusa.
 */
export function trovaBindingIroh({ env = process.env, esiste = existsSync, leggi = readFileSync, carica = richiedi, binding = FILE_BINDING, impronta = FILE_IMPRONTA } = {}) {
  const app = Boolean(env.TALOS_DESKTOP_DATA_DIR);
  if (!app && typeof env.TALOS_IROH_BINDING === 'string' && env.TALOS_IROH_BINDING) {
    return { modulo: carica(env.TALOS_IROH_BINDING), da: 'sviluppo' };
  }
  if (!esiste(binding) || !esiste(impronta)) return { modulo: null, motivo: 'assente' };
  const attesa = improntaAttesa(leggi(impronta, 'utf8'));
  const vera = createHash('sha256').update(leggi(binding)).digest('hex');
  if (!attesa || attesa !== vera) return { modulo: null, motivo: 'impronta-diversa' };
  return { modulo: carica(binding), da: 'pacchetto' };
}

let memoria = null;
/** Per il server: una volta sola, e un guasto nel caricamento vale «non disponibile». */
export async function caricaBindingIroh() {
  if (memoria) return memoria.modulo;
  try { memoria = trovaBindingIroh(); } catch (e) { memoria = { modulo: null, motivo: String(e?.message ?? e).slice(0, 200) }; }
  return memoria.modulo;
}
