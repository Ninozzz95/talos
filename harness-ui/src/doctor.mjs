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
import { rm } from 'node:fs/promises';

import { createProcessPolicy } from './process-policy.mjs';
import { cartellaScratchAttesa, radiceScratch, ripulisciScratch } from './scratch.mjs';

/*
 * ⛔⛔ K4a (03/10/2026, owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — i testi che il
 *   Doctor manda alla persona non sono più prosa italiana: il campo (`dettaglio`, `etichetta`) porta la frase INGLESE, la
 *   riserva per la CLI e per chi non ha il dizionario; accanto, `<campo>Chiave` (`server.doctor.…`, area `server` del
 *   dizionario dell'interfaccia) e `<campo>Params` (i valori che la frase usa). L'interfaccia dice `t(chiave, params)`; senza
 *   la chiave nel dizionario mostra la frase inglese, mai la chiave. Stesso schema del «contenuto sospetto» (8d894b012).
 *   Un parametro `<nome>Chiave` (es. `labelChiave`) dice che il valore `<nome>` è a sua volta un testo del dizionario.
 *   Ricerca 03/10/2026: codice stabile + parametri + riserva inglese, tradotto dal cliente (Google AIP-193; thread api-craft
 *   «Shall REST API error messages be internationalized?»; Hermes `agent/i18n.py:1`, catalogo a chiavi puntate con riserva `en`).
 */
const frase = (campo, testo, chiave, params) => ({ [campo]: testo, ...(chiave ? { [`${campo}Chiave`]: chiave } : {}), ...(chiave && params ? { [`${campo}Params`]: params } : {}) });
/** Il campo che chi chiama ha già scritto (`dettaglio`), con la sua chiave e i suoi valori se li porta: mai una chiave senza frase. */
const passaFrase = (campo, origine) => frase(campo, origine[campo],
  typeof origine[`${campo}Chiave`] === 'string' ? origine[`${campo}Chiave`] : null,
  origine[`${campo}Params`] && typeof origine[`${campo}Params`] === 'object' ? origine[`${campo}Params`] : null);

/*
 * ⛔ Corsia SCRATCH, 24/09/2026 — la capability `doctor` è la radice dei temporanei di TALOS
 *   (`src/scratch.mjs`), non più la TEMP di sistema. Si calcola a ogni uso, non al caricamento del
 *   modulo: `TALOS_SCRATCH_DIR` può arrivare dopo l'import (test, figlio del guscio desktop), e una
 *   capability congelata sulla radice vecchia rifiuterebbe la cartella di prova nuova.
 */
function politicaDoctor() {
  return createProcessPolicy({ allowedExecutables: ['git', 'echo'], capabilities: { doctor: radiceScratch() } });
}
/* Stesso nome e stessi metodi di prima: i lanci restano riconoscibili come «passano dalla politica»
   (tests/spawn-senza-ambiente-del-server.test.mjs), ma la politica si costruisce al momento della chiamata. */
const DOCTOR_PROCESS_POLICY = Object.freeze({
  runApprovedProcess(richiesta) { const processPolicy = politicaDoctor(); return processPolicy.runApprovedProcess(richiesta); },
  execFileSync(...argomenti) { const processPolicy = politicaDoctor(); return processPolicy.execFileSync(...argomenti); },
});

/*
 * ⛔⛔ DESK-TEMP-1, 23/09/2026 — la cartella di prova del Doctor restava in TEMP.
 *   Misurato: `tests/server-workflow-wiring.test.mjs` lasciava 2 cartelle `talos-doctor-*` in alcuni
 *   giri e non in altri. Il Doctor gira all'avvio del server; se il server viene fermato mentre il
 *   comando di prova è ancora aperto, il `finally` non arriva mai (processo ucciso) oppure `rmSync`
 *   trova la cartella ancora occupata (EBUSY/EPERM su Windows) e, senza `maxRetries`, rinuncia.
 * ⇒ Due cure, tutte e due necessarie: (1) la rimozione ritenta sui codici della corsa (Node 24
 *   `fs.rmSync`: `maxRetries` vale 0 di default e ritenta solo su EBUSY, EMFILE, ENFILE, ENOTEMPTY,
 *   EPERM, con attesa lineare `retryDelay`); (2) a ogni diagnosi si tolgono le cartelle
 *   `talos-doctor-*` VECCHIE lasciate da un processo ucciso. Solo il nostro prefisso, solo cartelle
 *   vere (niente collegamenti), solo più vecchie di dieci minuti: un altro Doctor che gira adesso
 *   non viene mai toccato.
 */
const PREFISSO_DOCTOR = 'talos-doctor-';
const RIMOZIONE_CON_RITENTATIVI = Object.freeze({ recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
export const ETA_MINIMA_RESIDUO_DOCTOR_MS = 10 * 60 * 1000;

/*
 * ⛔ Corsia SCRATCH, 24/09/2026 — la pulizia del 23/09 è diventata un CASO di `ripulisciScratch`
 *   (`src/scratch.mjs`): stessa regola di prima (solo il prefisso del Doctor, solo cartelle vere, più
 *   vecchie di dieci minuti, rimozione coi ritentativi, una voce che resta si dichiara), ma nella radice
 *   dei temporanei e con l'età del SOTTOALBERO invece della data della sola cartella (Hermes
 *   `hermes_constants.py:1044-1049`: la data della cartella sbaglia nei due versi). Senza timbro: gira a
 *   ogni diagnosi, come prima.
 */
export async function ripulisciResiduiDoctor({ cartella, adesso = Date.now(), etaMinimaMs = ETA_MINIMA_RESIDUO_DOCTOR_MS, rimuovi } = {}) {
  const esito = await ripulisciScratch({
    radice: cartella, adesso, etaMinimaMs, prefissi: [PREFISSO_DOCTOR], soloCartelle: true, timbro: false, ...(rimuovi ? { rimuovi } : {}),
  });
  return esito.tolte;
}

async function eseguiComandoSandboxatoLocale(comando, cartella) {
  // Doctor esegue soltanto il controllo fisso `echo ok`; non accetta testo
  // composto dal chiamante. Il resto del sistema usa il runtime owner.
  if (comando !== 'echo ok') return { codice: 1, testo: 'Check not supported', enforcement: 'none' };
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
  // ⭐ 24/09/2026, corsia SCRATCH — lo stato della radice dei temporanei (`statoScratch()` di src/scratch.mjs).
  scratch,
  // ⭐ 24/09/2026 — come il negozio delle sessioni pubblica l'intestazione: `modalitaPubblicazioneIntestazione(cartellaStore)`
  //   di src/session-store.mjs ('link' | 'senza-link' | null). Debito della corsia exFAT del 23/09 («il Doctor non lo mostra»).
  negozioSessioni,
  eseguiComandoSandboxatoFn = eseguiComandoSandboxatoLocale, spawnSyncFn,
} = {}) {
  // ⛔ Una cartella usa-e-getta SOLO per il comando diagnostico, mai una
  // cartella del progetto vero — il Doctor non deve toccare niente.
  await ripulisciResiduiDoctor();
  const cartellaProva = await cartellaScratchAttesa(PREFISSO_DOCTOR);
  let shell;
  try {
    const esito = await eseguiComandoSandboxatoFn('echo ok', cartellaProva);
    shell = esito.enforcement;
  } finally {
    await rm(cartellaProva, RIMOZIONE_CON_RITENTATIVI);
  }
  const risultato = {
    chiaveApi: Boolean(chiaveConfigurata),
    shell,
    git: controllaGit(spawnSyncFn),
    naviga: true, // built-in, nessuna dipendenza esterna da verificare
  };
  if (Array.isArray(labsAccesi)) {
    risultato.labs = {
      accesi: [...labsAccesi],
      ...(labsAccesi.length
        ? frase('dettaglio', `Labs on: ${labsAccesi.join(', ')} (NOT_LIVE_VALIDATED until tested).`, 'server.doctor.labs.on', { list: labsAccesi.join(', ') })
        : frase('dettaglio', 'Labs on: none.', 'server.doctor.labs.none')),
    };
  }
  if (scratch && typeof scratch === 'object') {
    /*
     * ⭐ Corsia SCRATCH, 24/09/2026 — il Doctor MOSTRA la radice dei temporanei, non solo la pulisce
     *   (Hermes `hermes_cli/doctor_state.py:193-198`: percorso e dimensione). Solo il dato nel JSON:
     *   la scheda Doctor della UI non è toccata da questa corsia.
     */
    const byte = Number.isFinite(scratch.byte) && scratch.byte >= 0 ? scratch.byte : 0;
    const voci = Number.isInteger(scratch.voci) && scratch.voci >= 0 ? scratch.voci : 0;
    const percorso = typeof scratch.percorso === 'string' ? scratch.percorso : null;
    risultato.scratch = {
      percorso,
      esiste: scratch.esiste === true,
      byte,
      voci,
      ...(Number.isInteger(scratch.illeggibili) && scratch.illeggibili > 0 ? { illeggibili: scratch.illeggibili } : {}),
      /* La chiave `…scratch.summary` ha due voci, `One` e `Many`: l'interfaccia sceglie con `n` (il numero di voci). */
      ...(!percorso
        ? frase('dettaglio', 'Temporary files root cannot be determined.', 'server.doctor.scratch.undetermined')
        : scratch.esiste === true
          ? frase('dettaglio', `${voci} ${voci === 1 ? 'entry' : 'entries'}, ${byte} bytes in ${percorso}. Anything left idle for 24 hours is removed at startup.`,
            'server.doctor.scratch.summary', { n: voci, bytes: byte, path: percorso })
          : frase('dettaglio', `Temporary files root not created yet: ${percorso}.`, 'server.doctor.scratch.missing', { path: percorso })),
    };
  }
  if (ricercaWeb && typeof ricercaWeb === 'object') {
    const fonte = Array.isArray(ricercaWeb.fonti) ? ricercaWeb.fonti.find((f) => f.id === ricercaWeb.source) : null;
    const nome = fonte?.label ?? ricercaWeb.source;
    /* il nome della fonte può essere a sua volta un testo del dizionario (`labelChiave`): «Custom endpoint», «SearXNG (your instance)» */
    const parametriNome = { label: nome, ...(fonte?.labelChiave ? { labelChiave: fonte.labelChiave } : {}) };
    risultato.ricercaWeb = {
      fonte: ricercaWeb.source,
      ...(fonte?.label !== undefined
        ? frase('etichetta', fonte.label, fonte.labelChiave ?? null)
        : ricercaWeb.source === 'off' ? frase('etichetta', 'Off', 'server.doctor.search.offLabel') : { etichetta: ricercaWeb.source }),
      pronta: ricercaWeb.readiness === 'pronta',
      ...(ricercaWeb.readiness === 'pronta'
        ? (fonte?.keyless
          ? frase('dettaglio', 'Ready, no key needed: DuckDuckGo (public page, may block under heavy use).', 'server.doctor.search.readyKeyless')
          : frase('dettaglio', `Ready: ${nome}.`, 'server.doctor.search.ready', parametriNome))
        : ricercaWeb.readiness === 'spenta' ? frase('dettaglio', 'Turned off by you: the model will not search the web.', 'server.doctor.search.off')
          : ricercaWeb.readiness === 'chiave-mancante' ? frase('dettaglio', `The ${nome} key is still needed.`, 'server.doctor.search.keyMissing', parametriNome)
            : frase('dettaglio', `The address of the ${nome} instance is still needed.`, 'server.doctor.search.endpointMissing', parametriNome)),
    };
  }
  if (negozioSessioni && typeof negozioSessioni === 'object') {
    /*
     * ⭐ 24/09/2026 — IL DOCTOR DICE COME VIENE PUBBLICATA L'INTESTAZIONE DI UNA SESSIONE. Il 23/09 il negozio ha
     *   imparato il ripiego per exFAT (creazione esclusiva + byte riletti, mai `rename`) e lo ricorda per processo
     *   (`modalitaPerCartella`): finché nessuno lo mostrava, «sto scrivendo sul disco giusto?» restava una domanda senza
     *   risposta a schermo. Tre stati, detti con le parole della persona; solo il dato nel JSON, la scheda UI non cambia.
     */
    const modalita = ['link', 'senza-link'].includes(negozioSessioni.modalitaIntestazione) ? negozioSessioni.modalitaIntestazione : null;
    const cartella = typeof negozioSessioni.cartella === 'string' ? negozioSessioni.cartella : null;
    risultato.negozioSessioni = {
      modalitaIntestazione: modalita,
      ...(cartella ? { cartella } : {}),
      ...(modalita === 'link'
        ? frase('dettaglio', 'Sessions are saved with atomic publishing (hard link): the disk supports it.', 'server.doctor.sessionStore.link')
        : modalita === 'senza-link'
          ? frase('dettaglio', 'Sessions are saved with the safe fallback (exclusive creation and verified bytes): the disk does not support links, for example exFAT. A crash mid-write can leave a broken line, which is repaired when the session is reopened.', 'server.doctor.sessionStore.noLink')
          : frase('dettaglio', 'No session has been saved since this start: the mode is known at the first write.', 'server.doctor.sessionStore.unknown')),
    };
  }
  if (Array.isArray(cartelleProgetto)) {
    risultato.cartelleProgetto = {
      disponibili: cartelleProgetto.length > 0,
      conteggio: cartelleProgetto.length,
      ...(cartelleProgetto.length > 0
        ? frase('dettaglio', `${cartelleProgetto.length} project ${cartelleProgetto.length === 1 ? 'folder' : 'folders'} available.`, 'server.doctor.folders.available', { n: cartelleProgetto.length })
        : frase('dettaglio', 'No project folder has been set up in the allowed list.', 'server.doctor.folders.none')),
    };
  }
  if (Array.isArray(providerRows)) {
    risultato.providers = { storeAvailable: providerStoreAvailable === true, items: providerRows };
  }
  if (ownerRuntime && typeof ownerRuntime === 'object') {
    risultato.ownerRuntime = {
      configurato: ownerRuntime.configurato === true,
      pronto: ownerRuntime.pronto === true,
      ...(typeof ownerRuntime.dettaglio === 'string' ? passaFrase('dettaglio', ownerRuntime) : frase('dettaglio', 'Runtime state not observed.', 'server.doctor.runtime.notObserved')),
    };
  }
  if (catalogoTask && typeof catalogoTask === 'object') {
    risultato.catalogoTask = {
      disponibile: catalogoTask.disponibile === true,
      ...(typeof catalogoTask.dettaglio === 'string' ? passaFrase('dettaglio', catalogoTask) : frase('dettaglio', 'Preset tasks list not observed.', 'server.doctor.catalog.notObserved')),
    };
  }
  if (sessioniPersistenza && typeof sessioniPersistenza === 'object') {
    // ⭐ 04/9, W0-01 — ogni file scartato porta il suo motivo: il Doctor dice DOVE è finita la differenza fra totali e ripristinate.
    const scartate = Array.isArray(sessioniPersistenza.scartate)
      ? sessioniPersistenza.scartate.filter((s) => s && typeof s.sessionId === 'string').map((s) => ({ sessionId: s.sessionId, ...passaFrase('motivo', { ...s, motivo: String(s.motivo || 'ignoto') }), ...(s.dettaglio ? passaFrase('dettaglio', { ...s, dettaglio: String(s.dettaglio).slice(0, 200) }) : {}) }))
      : [];
    const ripristinate = Number(sessioniPersistenza.ultimaLettura?.ripristinate) || 0;
    const totali = Number(sessioniPersistenza.ultimaLettura?.totali) || 0;
    const perMotivo = {};
    for (const s of scartate) perMotivo[s.motivo] = (perMotivo[s.motivo] || 0) + 1;
    /* i motivi sono identificatori dello stato (`corrotta`, `vuota`…), non frasi: si riportano come sono */
    const motivi = Object.entries(perMotivo).map(([m, n]) => `${n} ${m}`).join(', ');
    risultato.sessioniPersistenza = {
      corrotte: Array.isArray(sessioniPersistenza.corrotte) ? [...sessioniPersistenza.corrotte] : [],
      scartate,
      perMotivo,
      ultimaLettura: { ripristinate, totali },
      ...(scartate.length === 0
        ? frase('dettaglio', `${ripristinate} of ${totali} sessions restored: none discarded.`, 'server.doctor.sessions.restoredAll', { restored: ripristinate, total: totali })
        : frase('dettaglio', `${ripristinate} restored, ${scartate.length} discarded out of ${totali}: ${motivi}.`, 'server.doctor.sessions.restoredSome',
          { restored: ripristinate, discarded: scartate.length, total: totali, reasons: motivi })),
    };
  }
  return risultato;
}
