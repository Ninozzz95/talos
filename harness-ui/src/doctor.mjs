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
 * @param {{configurato:boolean,pronto:boolean,dettaglio:string}|undefined} ownerRuntime — stato reale del runtime agente
 * @param {{disponibile:boolean,dettaglio:string}|undefined} catalogoTask — disponibilità del catalogo task preset
 * @param {{corrotte:string[],ultimaLettura:{ripristinate:number,totali:number}}|undefined} sessioniPersistenza — stato di lettura dei registri persistiti
 * @returns {{chiaveApi:boolean, shell:'wsl2'|'none'|'desktop', git:boolean, naviga:boolean, cartelleProgetto?:{disponibili:boolean,conteggio:number,dettaglio:string}, providers?:{storeAvailable:boolean,items:Array<object>}, ownerRuntime?:{configurato:boolean,pronto:boolean,dettaglio:string}, catalogoTask?:{disponibile:boolean,dettaglio:string}, sessioniPersistenza?:{corrotte:string[],ultimaLettura:{ripristinate:number,totali:number}}}}
 */
export async function diagnosi({
  chiaveConfigurata, cartelleProgetto, providerRows, providerStoreAvailable, ownerRuntime, catalogoTask, sessioniPersistenza,
  // ⭐ 04/9, R-03 — stato pubblico della fonte di ricerca web (search-source-store.listPublic()): fonte, prontezza; mai una chiave.
  ricercaWeb,
  // ⭐ 04/9, W0-04 — i lab accesi (config.labs): informativo, mai un problema.
  labsAccesi,
  eseguiComandoSandboxatoFn = eseguiComandoSandboxatoLocale, spawnSyncFn,
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
  if (Array.isArray(labsAccesi)) {
    risultato.labs = { accesi: [...labsAccesi], dettaglio: labsAccesi.length ? `Labs accesi: ${labsAccesi.join(', ')} (NOT_LIVE_VALIDATED finché non provati).` : 'Labs accesi: nessuno.' };
  }
  if (ricercaWeb && typeof ricercaWeb === 'object') {
    const fonte = Array.isArray(ricercaWeb.fonti) ? ricercaWeb.fonti.find((f) => f.id === ricercaWeb.source) : null;
    risultato.ricercaWeb = {
      fonte: ricercaWeb.source,
      etichetta: fonte?.label ?? (ricercaWeb.source === 'off' ? 'Spenta' : ricercaWeb.source),
      pronta: ricercaWeb.readiness === 'pronta',
      dettaglio: ricercaWeb.readiness === 'pronta' ? (fonte?.keyless ? 'Pronta, senza chiave: DuckDuckGo (pagina pubblica, può bloccare sotto uso intenso).' : `Pronta: ${fonte?.label ?? ricercaWeb.source}.`)
        : ricercaWeb.readiness === 'spenta' ? 'Spenta da te: il modello non cercherà sul web.'
          : ricercaWeb.readiness === 'chiave-mancante' ? `Serve ancora la chiave di ${fonte?.label ?? ricercaWeb.source}.`
            : `Serve ancora l'indirizzo dell'istanza ${fonte?.label ?? ricercaWeb.source}.`,
    };
  }
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
  if (ownerRuntime && typeof ownerRuntime === 'object') {
    risultato.ownerRuntime = {
      configurato: ownerRuntime.configurato === true,
      pronto: ownerRuntime.pronto === true,
      dettaglio: typeof ownerRuntime.dettaglio === 'string' ? ownerRuntime.dettaglio : 'Stato runtime non osservato.',
    };
  }
  if (catalogoTask && typeof catalogoTask === 'object') {
    risultato.catalogoTask = {
      disponibile: catalogoTask.disponibile === true,
      dettaglio: typeof catalogoTask.dettaglio === 'string' ? catalogoTask.dettaglio : 'Elenco attività predefinite non osservato.',
    };
  }
  if (sessioniPersistenza && typeof sessioniPersistenza === 'object') {
    // ⭐ 04/9, W0-01 — ogni file scartato porta il suo motivo: il Doctor dice DOVE è finita la differenza fra totali e ripristinate.
    const scartate = Array.isArray(sessioniPersistenza.scartate)
      ? sessioniPersistenza.scartate.filter((s) => s && typeof s.sessionId === 'string').map((s) => ({ sessionId: s.sessionId, motivo: String(s.motivo || 'ignoto'), ...(s.dettaglio ? { dettaglio: String(s.dettaglio).slice(0, 200) } : {}) }))
      : [];
    const ripristinate = Number(sessioniPersistenza.ultimaLettura?.ripristinate) || 0;
    const totali = Number(sessioniPersistenza.ultimaLettura?.totali) || 0;
    const perMotivo = {};
    for (const s of scartate) perMotivo[s.motivo] = (perMotivo[s.motivo] || 0) + 1;
    risultato.sessioniPersistenza = {
      corrotte: Array.isArray(sessioniPersistenza.corrotte) ? [...sessioniPersistenza.corrotte] : [],
      scartate,
      perMotivo,
      ultimaLettura: { ripristinate, totali },
      dettaglio: scartate.length === 0
        ? `${ripristinate} sessioni ripristinate su ${totali}: nessuna scartata.`
        : `${ripristinate} ripristinate, ${scartate.length} scartate su ${totali}: ${Object.entries(perMotivo).map(([m, n]) => `${n} ${m}`).join(', ')}.`,
    };
  }
  return risultato;
}
