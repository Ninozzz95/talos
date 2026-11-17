/*
 * LE DUE SCELTE DELL'INSTALLAZIONE (0.2.2, brief dell'agente «rete spegnibile»; regole del giudice v1313). I termini di SignPath vogliono,
 * per ogni invio che parte senza una richiesta della persona, un'informativa ALL'INSTALLAZIONE e un'opzione per spegnerlo. La pagina
 * dell'installatore (fatta dal bozzetto, lavoro a parte) chiede due cose: gli aggiornamenti automatici e il catalogo pubblico dei modelli.
 * L'installatore le scrive in un file; l'app lo legge qui, al primo avvio che lo trova, prima che partano il server e l'aggiornatore
 * (su un profilo già usato da una versione precedente è il primo file che compare: prova PI-09, giallo del revisore unico 11/11).
 * La forma del file: `harness-ui/desktop/PREFERENZE-INIZIALI.md`.
 *
 * Le regole del giudice (v1313), ognuna con la sua prova e il suo mutante (`tests/preferenze-iniziali.test.mjs`):
 *   1. si legge UNA sola volta, al primo avvio che lo trova, e SOLO dalla cartella dell'utente (la cartella dati di TALOS, mai quella del programma né
 *      la cartella di lavoro); dopo la lettura il file viene segnato come letto (rinominato in `preferenze-iniziali.letto.json`), e da
 *      allora un file nuovo con lo stesso nome non si applica più (si rinomina in `.ignorato.json`);
 *   2. non può accendere niente che la persona abbia già spento: `true` vale solo dove non c'è ancora una scelta salvata;
 *   3. non tocca altre impostazioni oltre alle due: ogni altro campo si ignora, e dei due file si scrivono solo i loro campi.
 * Come `initial_preferences` di Chrome, applicato una volta al primo avvio con un file sentinella, e sotto la policy
 * (support.google.com/chrome/a/answer/187948 e chromium.org/developers/design-documents/first-run-customizations, letti il 09/11/2026).
 * ⛔ Il guscio non importa i moduli del server (nel pacchetto stanno altrove): la forma del file del catalogo è copiata qui, e la prova
 *   PI-08 la confronta con `src/catalogo-pubblico.mjs`.
 */
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const FILE_PREFERENZE_INIZIALI = 'preferenze-iniziali.json';
export const FILE_PREFERENZE_LETTE = 'preferenze-iniziali.letto.json';
export const FILE_PREFERENZE_IGNORATE = 'preferenze-iniziali.ignorato.json';
export const SCHEMA_PREFERENZE_INIZIALI = 'talos.initial-preferences.v1';
/* copie della forma del server (`src/catalogo-pubblico.mjs`) e del guscio (`main.mjs`, `aggiornamenti.json`) */
export const FILE_CATALOGO_PUBBLICO = '.catalogo-pubblico.json';
export const SCHEMA_CATALOGO_PUBBLICO = 'talos.public-model-catalog-settings.v1';
export const FILE_AGGIORNAMENTI = 'aggiornamenti.json';
const DIMENSIONE_MASSIMA = 4096;

function leggiJson(percorso) {
  try { const v = JSON.parse(readFileSync(percorso, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
function scriviJson(percorso, valore) {
  const temporaneo = percorso + '.tmp';
  writeFileSync(temporaneo, JSON.stringify(valore, null, 2) + '\n');
  renameSync(temporaneo, percorso);
}

/**
 * Le due scelte lette dal file, o un errore. Solo `automaticUpdates` e `publicModelCatalog`, booleani; il resto finisce in `ignorati`.
 * @returns {{ scelte: { automaticUpdates?: boolean, publicModelCatalog?: boolean }, ignorati: string[] }}
 */
export function leggiScelte(testo) {
  const dati = JSON.parse(testo);
  if (!dati || typeof dati !== 'object' || Array.isArray(dati)) throw Error('il file non è un oggetto');
  if (Object.hasOwn(dati, 'schema') && dati.schema !== SCHEMA_PREFERENZE_INIZIALI) throw Error('schema sconosciuto');
  const scelte = {}; const ignorati = [];
  for (const [chiave, valore] of Object.entries(dati)) {
    if (chiave === 'schema') continue;
    if ((chiave === 'automaticUpdates' || chiave === 'publicModelCatalog') && typeof valore === 'boolean') scelte[chiave] = valore;
    else ignorati.push(chiave);
  }
  return { scelte, ignorati };
}

/**
 * Legge e applica il file dell'installatore, una volta sola. Sincrono: il guscio lo chiama prima di avviare server e aggiornatore.
 * @param {{ cartellaUtente: string }} o la cartella dati dell'utente (`app.getPath('userData')`), assoluta
 * @returns {{ esito: 'nessuno'|'gia-letto'|'applicato'|'illeggibile'|'errore', applicate?: object, ignorati?: string[], motivo?: string }}
 */
export function applicaPreferenzeIniziali({ cartellaUtente } = {}) {
  if (typeof cartellaUtente !== 'string' || !isAbsolute(cartellaUtente)) return { esito: 'errore', motivo: 'cartella dell’utente non assoluta' };
  const file = join(cartellaUtente, FILE_PREFERENZE_INIZIALI);
  if (!existsSync(file)) return { esito: 'nessuno' };
  const letto = join(cartellaUtente, FILE_PREFERENZE_LETTE);
  /* regola 1: già letto una volta ⇒ un file nuovo non si applica; lo si mette da parte, così non resta lì ad aspettare */
  if (existsSync(letto)) {
    try { renameSync(file, join(cartellaUtente, FILE_PREFERENZE_IGNORATE)); } catch { /* resta: comunque non si applica */ }
    return { esito: 'gia-letto' };
  }
  let scelte; let ignorati;
  try {
    if (statSync(file).size > DIMENSIONE_MASSIMA) throw Error('file troppo grande');
    ({ scelte, ignorati } = leggiScelte(readFileSync(file, 'utf8')));
  } catch (e) {
    /* un file rotto non decide niente; si segna letto lo stesso, così non si riprova a ogni avvio */
    try { renameSync(file, letto); } catch { /* niente */ }
    return { esito: 'illeggibile', motivo: String(e?.message ?? e) };
  }
  const applicate = {};
  try {
    if (typeof scelte.automaticUpdates === 'boolean') {
      const percorso = join(cartellaUtente, FILE_AGGIORNAMENTI);
      const attuale = leggiJson(percorso);
      const giaScelto = typeof attuale?.automatici === 'boolean';
      /* regola 2: `true` solo dove la persona non ha ancora scelto; regola 3: solo i due campi che il guscio scrive già */
      if (scelte.automaticUpdates === false || !giaScelto) {
        const automatici = scelte.automaticUpdates === false ? false : true;
        if (!giaScelto || attuale.automatici !== automatici) {
          scriviJson(percorso, { automatici, ultimoControllo: attuale?.ultimoControllo ?? null });
        }
        applicate.automaticUpdates = automatici;
      }
    }
    if (typeof scelte.publicModelCatalog === 'boolean') {
      const percorso = join(cartellaUtente, FILE_CATALOGO_PUBBLICO);
      const esiste = existsSync(percorso);
      const attuale = leggiJson(percorso);
      if (scelte.publicModelCatalog === false) {
        scriviJson(percorso, { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: false });
        applicate.publicModelCatalog = false;
      } else if (!esiste || (attuale && typeof attuale.acceso !== 'boolean' && attuale.schema === SCHEMA_CATALOGO_PUBBLICO)) {
        /* regola 2: si accende solo dove non c'è una scelta salvata (né un file che non si sa leggere) */
        scriviJson(percorso, { schema: SCHEMA_CATALOGO_PUBBLICO, ...(attuale?.openrouterScelto === true ? { openrouterScelto: true } : {}), acceso: true });
        applicate.publicModelCatalog = true;
      }
    }
  } catch (e) {
    /* una scrittura fallita: il file resta, al prossimo avvio si riprova (un'applicazione ripetuta dà lo stesso risultato) */
    return { esito: 'errore', applicate, motivo: String(e?.code ?? e?.message ?? e) };
  }
  renameSync(file, letto);
  return { esito: 'applicato', applicate, ignorati };
}
