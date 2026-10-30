/*
 * Il LETTORE delle cartelle bloccate per un dispositivo (owner 27/10/2026, contratto CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2,
 * revisione 1).
 *
 * Perché un lettore dal FILE e non il coordinatore (`cartelle-dispositivi.mjs`): la CLI federa (T3b, `cli/src/remote/federation.ts`) —
 * un'operazione su una conversazione che esiste gira nella finestra che la possiede, e lì il coordinatore non c'è (`remotoFn()` è
 * null). Un blocco letto dal coordinatore varrebbe solo nel processo che ospita il remoto. Letto dal file del profilo, vale in ogni
 * processo del profilo.
 *
 * ⛔ Si rilegge solo quando il file CAMBIA (`firmaDelFile`, come Hermes `utils.py:40-60`): un attrezzo dopo l'altro non costa una lettura
 *   ciascuno. Un file troppo recente per fidarsi della sua impronta si rilegge sempre.
 * ⛔ Un file illeggibile LANCIA `REMOTE_CONSENTS_UNREADABLE`, come il coordinatore: un blocco letto come «nessuno» aprirebbe una
 *   cartella che la persona ha chiuso. Il kernel, davanti a un errore, non tocca nessun file in quel giro.
 * ⛔ Un file che non c'è vuol dire «nessun blocco»: è lo stato di chi non ha mai revocato niente.
 */
import { readFile, stat } from 'node:fs/promises';
import { firmaDelFile } from './firma-file.mjs';

const illeggibile = () => Object.assign(new Error('The folders blocked for devices cannot be read.'), { code: 'REMOTE_CONSENTS_UNREADABLE' });

/** `async (dispositivoId) => string[]` — i percorsi delle cartelle bloccate per quel dispositivo; `null` se non c'è un file da leggere. */
export function creaLettoreBloccate({ fileBloccate, fs = { readFile, stat }, adessoNs } = {}) {
  if (typeof fileBloccate !== 'string' || fileBloccate === '') return null;
  let firmaLetta = null;
  let perDispositivo = new Map();
  const carica = async () => {
    const firma = await firmaDelFile(fs, fileBloccate, adessoNs ? { adessoNs } : {});
    if (firma !== null && firma === firmaLetta) return;
    if (firma === 'assente') { perDispositivo = new Map(); firmaLetta = firma; return; }
    let grezzo;
    try { grezzo = await fs.readFile(fileBloccate, 'utf8'); }
    catch (e) {
      if (e?.code === 'ENOENT') { perDispositivo = new Map(); firmaLetta = 'assente'; return; }
      throw illeggibile();
    }
    let dati;
    try { dati = JSON.parse(grezzo); } catch { throw illeggibile(); }
    const voci = dati?.dispositivi;
    if (voci !== undefined && (voci === null || typeof voci !== 'object' || Array.isArray(voci))) throw illeggibile();
    const nuova = new Map();
    for (const [id, elenco] of Object.entries(voci ?? {})) {
      if (!Array.isArray(elenco) || elenco.some((v) => !v || typeof v.percorso !== 'string' || v.percorso === '')) throw illeggibile();
      nuova.set(id, elenco.map((v) => v.percorso));
    }
    perDispositivo = nuova;
    firmaLetta = firma; // `null` (troppo recente) resta `null`: la prossima chiamata rilegge
  };
  return async function bloccateDel(dispositivoId) {
    if (typeof dispositivoId !== 'string' || dispositivoId === '') return [];
    await carica();
    return [...(perDispositivo.get(dispositivoId) ?? [])];
  };
}
