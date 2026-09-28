/**
 * migrazione-browser.mjs — i dati del Chromium interno da Roaming a %LOCALAPPDATA% (24/09/2026, corsia SCRATCH).
 *
 * ⛔ Decisione dell'owner, 24/09/2026: la cache di Chromium lascia `%APPDATA%\TALOS` (Roaming, `profile.mjs`) e va in
 *   `%LOCALAPPDATA%\TALOS`, con migrazione automatica al primo avvio, «copia o spostamento sicuro, mai perdita». La
 *   cartella dati delle preferenze di TALOS (sessioni, window-state, registro…) resta dov'è.
 *
 * Fonti (lette il 24/09/2026):
 * - Electron `docs/api/app.md` (`app.getPath`/`app.setPath`): `sessionData` «The directory for storing data generated
 *   by Session, such as localStorage, cookies, disk cache, downloaded dictionaries, network state, DevTools files and
 *   compiled GPU shaders. By default this points to userData … it is recommended to set this directory to other
 *   locations to avoid polluting the userData directory»; `userData` «it is not recommended to write large files here
 *   because some environments may backup this directory to cloud storage»; `setPath`: «If the path specifies a
 *   directory that does not exist, an Error is thrown».
 * - MISURATO qui, Electron 44.3.0 con `userData` e `sessionData` separati: dopo una finestra con localStorage e cookie,
 *   `userData` è rimasta VUOTA e in `sessionData` sono finiti Cache, Code Cache, DIPS, DIPS-wal, DawnGraphiteCache,
 *   DawnWebGPUCache, GPUCache, Local State, Local Storage, Network, Preferences, Shared Dictionary, blob_storage,
 *   declarative_performance_observer.db(-journal). ⇒ Tutto ciò che Chromium scrive segue `sessionData`: si sposta
 *   SOLO un elenco chiuso di nomi di Chromium (sotto), mai i file di TALOS che vivono nella stessa cartella.
 * - Node 24 `fs.renameSync` (sposta, atomico sullo stesso volume) e `fs.cpSync` (`errorOnExist`, `force:false`): su
 *   volumi diversi (`EXDEV`, es. Roaming reindirizzato su una condivisione) si COPIA e l'originale resta.
 *
 * Regole di sicurezza (mai perdita):
 * 1. si sposta solo una voce che nella destinazione NON esiste: una destinazione già presente non si sovrascrive mai
 *    (la voce vecchia resta in Roaming e si dichiara nel segno);
 * 2. se una voce non si sposta (EBUSY/EPERM: un altro processo la tiene aperta) si RIMETTE A POSTO ciò che era già
 *    stato spostato in questo giro e si usa la cartella VECCHIA per questo avvio: meglio un avvio ancora in Roaming che
 *    un avvio con metà dei dati. Si ritenta al prossimo avvio;
 * 3. il segno `.talos-migrazione-browser.json` nella destinazione si scrive SOLO a giro riuscito: da lì in poi non si
 *    ritenta più (e una voce copiata, non spostata, resta anche in Roaming: non si cancella niente).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FILE_SEGNO_MIGRAZIONE = '.talos-migrazione-browser.json';

/*
 * I nomi che Chromium/Electron scrivono in `sessionData`: i 17 misurati qui sopra (Electron 44.3.0 e la cartella vera
 * `%APPDATA%\TALOS` del 23/09/2026, che aveva anche `Session Storage`) più quelli che Chromium usa per gli stessi dati
 * di sessione in versioni vicine (IndexedDB, Service Worker, WebStorage, databases, Cookies…). Un nome che NON è qui
 * resta dov'è: il costo di un nome mancante è una cache ricostruita, il costo di un nome di troppo sarebbe un file
 * di TALOS spostato.
 * ⛔ L'ORDINE conta, ed è misurato (Electron 44.3.0, 24/09/2026, rinomina da Node mentre Chromium è VIVO sulla stessa
 *   cartella): `blob_storage`, `Cache` e `Code Cache` si lasciano rinominare anche da sotto un'istanza viva, mentre
 *   `Local Storage`, `Network`, `GPUCache`, `Dawn*`, `Shared Dictionary`, `DIPS*` e `declarative_performance_observer*`
 *   rispondono EPERM/EBUSY. ⇒ Si provano PER PRIME le voci che un'istanza viva tiene chiuse: se qualcuno sta usando la
 *   cartella vecchia, il primo tentativo fallisce e non si è spostato ancora niente.
 */
export const VOCI_CHROMIUM = Object.freeze([
  'Local Storage', 'Network', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Shared Dictionary', 'DIPS', 'DIPS-wal',
  'declarative_performance_observer.db', 'declarative_performance_observer.db-journal',
  'Session Storage', 'IndexedDB', 'Service Worker', 'WebStorage', 'databases', 'File System', 'shared_proto_db',
  'SharedStorage', 'SharedStorage-wal', 'Cookies', 'Cookies-journal', 'TransportSecurity', 'Trust Tokens',
  'Trust Tokens-journal', 'Network Persistent State', 'DIPS-journal', 'Local State', 'Preferences', 'VideoDecodeStats',
  'Dictionaries', 'Partitions', 'DawnCache', 'GrShaderCache', 'ShaderCache', 'Cache', 'Code Cache', 'blob_storage',
]);
const ORDINE_CHROMIUM = new Map(VOCI_CHROMIUM.map((n, i) => [n.toLowerCase(), i]));

/**
 * Sposta i dati del Chromium interno da `da` (Roaming) ad `a` (Local), in modo sicuro. Non lancia mai.
 * @returns {{cartella:string, stato:'nessuna'|'gia-migrata'|'migrata'|'rimandata', spostate:string[], copiate:string[], lasciate:string[], errori:Array<{nome:string,codice:string}>}}
 *   `cartella` è quella da passare ad `app.setPath('sessionData', …)` per QUESTO avvio.
 */
export function migraDatiBrowser({ da, a, adesso = Date.now(), fs = { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } } = {}) {
  const esito = { cartella: a, stato: 'nessuna', spostate: [], copiate: [], lasciate: [], errori: [] };
  if (!da || !a || da === a) return esito;
  if (fs.existsSync(join(a, FILE_SEGNO_MIGRAZIONE))) { esito.stato = 'gia-migrata'; return esito; }
  let presenti;
  try { presenti = fs.readdirSync(da); } catch { presenti = []; } // nessuna cartella vecchia: installazione nuova
  const daSpostare = presenti.filter((nome) => ORDINE_CHROMIUM.has(nome.toLowerCase()))
    .sort((x, y) => ORDINE_CHROMIUM.get(x.toLowerCase()) - ORDINE_CHROMIUM.get(y.toLowerCase()));
  try { fs.mkdirSync(a, { recursive: true }); } catch (errore) {
    esito.errori.push({ nome: '(destinazione)', codice: errore?.code ?? 'errore' });
    esito.cartella = da; esito.stato = 'rimandata';
    return esito;
  }
  for (const nome of daSpostare) {
    const sorgente = join(da, nome);
    const destinazione = join(a, nome);
    if (fs.existsSync(destinazione)) { esito.lasciate.push(nome); continue; } // mai sovrascrivere
    try {
      fs.renameSync(sorgente, destinazione);
      esito.spostate.push(nome);
    } catch (errore) {
      if (errore?.code !== 'EXDEV') { esito.errori.push({ nome, codice: errore?.code ?? 'errore' }); break; }
      try {
        fs.cpSync(sorgente, destinazione, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
        esito.copiate.push(nome);
      } catch (erroreCopia) {
        // una copia a metà è nostra e si toglie; l'originale in Roaming non è mai stato toccato
        try { fs.rmSync(destinazione, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* resta: si dichiara */ }
        esito.errori.push({ nome, codice: erroreCopia?.code ?? 'errore' });
        break;
      }
    }
  }
  if (esito.errori.length) {
    // Regola 2: si rimette a posto ciò che questo giro ha spostato o copiato, e si resta sulla cartella vecchia.
    for (const nome of esito.spostate.slice().reverse()) {
      try { fs.renameSync(join(a, nome), join(da, nome)); } catch (errore) { esito.errori.push({ nome: `${nome} (ritorno)`, codice: errore?.code ?? 'errore' }); }
    }
    for (const nome of esito.copiate) {
      try { fs.rmSync(join(a, nome), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* la copia resta, l'originale è intatto */ }
    }
    esito.cartella = da; esito.stato = 'rimandata';
    return esito;
  }
  try {
    fs.writeFileSync(join(a, FILE_SEGNO_MIGRAZIONE), `${JSON.stringify({ da, quando: new Date(adesso).toISOString(), spostate: esito.spostate, copiate: esito.copiate, lasciate: esito.lasciate }, null, 2)}\n`);
  } catch { /* senza segno si ricontrolla al prossimo avvio: le voci già spostate risultano «presenti» e si lasciano */ }
  esito.stato = 'migrata';
  return esito;
}
