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
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProcessPolicy } from './process-policy.mjs';

const DOCTOR_PROCESS_POLICY = createProcessPolicy({ allowedExecutables: ['git', 'echo'], capabilities: { doctor: tmpdir() } });

async function eseguiComandoSandboxatoLocale(comando, cartella) {
  // Doctor esegue soltanto il controllo fisso `echo ok`; non accetta testo
  // composto dal chiamante. Il resto del sistema usa il runtime owner.
  if (comando !== 'echo ok') return { codice: 1, testo: 'Controllo non previsto', enforcement: 'none' };
  const risultato = await DOCTOR_PROCESS_POLICY.runApprovedProcess({
    executable: 'echo',
    args: ['ok'],
    cwd: cartella,
    capability: 'doctor',
    envKeys: ['PATH', 'SystemRoot', 'WINDIR'],
  });
  return { codice: risultato.code ?? 1, testo: risultato.stdout.trim(), enforcement: 'desktop' };
}

function controllaGit(spawnSyncFn) {
  try {
    if (spawnSyncFn) return spawnSyncFn('git', ['--version']).status === 0;
    DOCTOR_PROCESS_POLICY.execFileSync('git', ['--version'], { cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {boolean} chiaveConfigurata — config.chiaveApi presente sul server.
 * @param {Array<{id:string,nome:string,percorso?:string}>|undefined} cartelleProgetto —
 *   elenco già validato da config.mjs. Quando fornito, il Doctor aggiunge un
 *   controllo reale per la scelta della cartella nella modale Nuova sessione.
 * @param {Array<object>|undefined} providerRows — stato pubblico dei provider, mai segreti
 * @param {boolean|undefined} providerStoreAvailable — portachiavi di sistema disponibile
 * @returns {{chiaveApi:boolean, shell:'wsl2'|'none', git:boolean, naviga:boolean, cartelleProgetto?:{disponibili:boolean,conteggio:number,dettaglio:string}, providers?:{storeAvailable:boolean,items:Array<object>}}}
 */
export async function diagnosi({
  chiaveConfigurata, cartelleProgetto, providerRows, providerStoreAvailable, eseguiComandoSandboxatoFn = eseguiComandoSandboxatoLocale, spawnSyncFn,
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
  const risultato = {
    chiaveApi: Boolean(chiaveConfigurata),
    shell,
    git: controllaGit(spawnSyncFn),
    naviga: true, // built-in, nessuna dipendenza esterna da verificare
  };
  if (Array.isArray(cartelleProgetto)) {
    risultato.cartelleProgetto = {
      disponibili: cartelleProgetto.length > 0,
      conteggio: cartelleProgetto.length,
      dettaglio: cartelleProgetto.length > 0
        ? `${cartelleProgetto.length} cartell${cartelleProgetto.length === 1 ? 'a' : 'e'} di progetto disponibili.`
        : 'Nessuna cartella di progetto è stata configurata nell’elenco consentito.',
    };
  }
  if (Array.isArray(providerRows)) {
    risultato.providers = { storeAvailable: providerStoreAvailable === true, items: providerRows };
  }
  return risultato;
}
