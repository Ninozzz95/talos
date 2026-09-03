/**
 * automation-store.mjs — la parte del blocco 7 (Automazioni) lasciata
 * dichiaratamente fuori scope finché l'owner non ha dato il via libera
 * esplicito, 27/8: *"hai il mio via libera"* sulla vera schedulazione.
 *
 * ⛔⛔ Diverso da `session-registry.mjs` apposta: le sessioni vivono SOLO in
 * memoria (dichiarato lì, accettabile per un run-to-completion owner-only).
 * Un'automazione no — deve ricordare "quando ho girato l'ultima volta" e
 * "quante volte oggi" ANCHE dopo un riavvio del server (frequente in
 * sviluppo con `node --watch`), altrimenti un riavvio a metà giornata
 * azzera il contatore e il limite di sicurezza sotto smette di contare.
 * Persistenza su disco, un file JSON per automazione — stesso stile
 * "niente database" già in uso in tutto il progetto (TALOS-BANCO è JSONL).
 *
 * ⛔⛔⛔ LA GUARDIA DI SICUREZZA NON È UN DETTAGLIO: questo store fa partire
 * sessioni reali (credito vero) SENZA che l'owner prema nulla, nel momento
 * in cui accade. Due tetti duri, non solo default consigliati:
 * `INTERVALLO_MINIMO_MINUTI` impedisce un'automazione che gira più spesso
 * di così, `LIMITE_MASSIMO_AL_GIORNO` impedisce un limite-per-automazione
 * assurdo — ENTRAMBI validati alla creazione, non solo suggeriti in UI.
 * E ogni automazione nuova nasce `attiva: false`: il meccanismo è vero,
 * ma non parte mai senza un'azione esplicita successiva di chi la crea.
 *
 * ⭐ 29/8 — copia PORTATA verbatim dal canonico
 * (AVM-harness-desktop/harness-ui/src/automation-store.mjs) nella copia
 * standalone imbarcata nell'APK: LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
 * §14. Zero dipendenze cross-modulo — zero adattamento richiesto.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const INTERVALLO_MINIMO_MINUTI = 5;
export const LIMITE_MASSIMO_AL_GIORNO = 10;

export class AutomationStoreError extends Error {
  constructor(message, code = 'AUTOMATION_INVALID') {
    super(message);
    this.name = 'AutomationStoreError';
    this.code = code;
  }
}

export function createAutomationStore({
  cartella,
  fsAdapter = { mkdir, readFile, readdir, rm, writeFile },
  clock = () => new Date(),
} = {}) {
  if (typeof cartella !== 'string' || cartella.length === 0) {
    throw new AutomationStoreError('cartella obbligatoria', 'AUTOMATION_STORE_MISCONFIGURED');
  }

  const percorsoDi = (id) => join(cartella, `${id}.json`);

  async function scrivi(voce) {
    await fsAdapter.mkdir(cartella, { recursive: true });
    await fsAdapter.writeFile(percorsoDi(voce.id), JSON.stringify(voce, null, 2), 'utf8');
    return voce;
  }

  async function leggi(id) {
    try {
      return JSON.parse(await fsAdapter.readFile(percorsoDi(id), 'utf8'));
    } catch {
      return null; // ⛔ assente o corrotta a metà scrittura: mai un throw, chi chiama vede "non esiste"
    }
  }

  async function elenca() {
    let nomi;
    try {
      nomi = await fsAdapter.readdir(cartella);
    } catch {
      return []; // ⛔ la cartella non esiste ancora: zero automazioni, non un errore
    }
    const voci = [];
    for (const nome of nomi) {
      if (!nome.endsWith('.json')) continue;
      try {
        voci.push(JSON.parse(await fsAdapter.readFile(join(cartella, nome), 'utf8')));
      } catch { /* una voce corrotta non deve nascondere le altre */ }
    }
    return voci.sort((a, b) => a.creataAlle.localeCompare(b.creataAlle));
  }

  /**
   * @returns la voce creata, sempre `attiva: false` — vedi la guardia in
   * testa al file. Lancia `AutomationStoreError` su un parametro fuori dai
   * tetti duri, mai un valore silenziosamente corretto (un limite "aggiustato
   * da solo" nasconderebbe all'owner cosa ha davvero chiesto).
   */
  async function crea({ taskId, nome, intervalloMinuti, limiteAlGiorno = 3 }) {
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new AutomationStoreError('taskId mancante');
    }
    if (!Number.isInteger(intervalloMinuti) || intervalloMinuti < INTERVALLO_MINIMO_MINUTI) {
      throw new AutomationStoreError(`intervalloMinuti deve essere un intero >= ${INTERVALLO_MINIMO_MINUTI}`);
    }
    if (!Number.isInteger(limiteAlGiorno) || limiteAlGiorno < 1 || limiteAlGiorno > LIMITE_MASSIMO_AL_GIORNO) {
      throw new AutomationStoreError(`limiteAlGiorno deve essere un intero fra 1 e ${LIMITE_MASSIMO_AL_GIORNO}`);
    }
    const voce = {
      id: randomUUID(),
      taskId,
      nome: typeof nome === 'string' && nome.length > 0 ? nome : taskId,
      intervalloMinuti,
      limiteAlGiorno,
      attiva: false,
      creataAlle: clock().toISOString(),
      ultimaEsecuzione: null,
      prossimaEsecuzione: null,
      eseguiteOggi: 0,
      giornoContatore: null,
    };
    return scrivi(voce);
  }

  /** Accende/spegne — quando accende, calcola SUBITO la prossima esecuzione da ORA, non da un'esecuzione passata mai avvenuta. */
  async function imposta(id, attivaValore) {
    const voce = await leggi(id);
    if (!voce) return null;
    voce.attiva = Boolean(attivaValore);
    voce.prossimaEsecuzione = voce.attiva
      ? new Date(clock().getTime() + voce.intervalloMinuti * 60_000).toISOString()
      : null;
    return scrivi(voce);
  }

  /** Chiamata dallo scheduler dopo un avvio reale: azzera il contatore al cambio di giorno, sposta la prossima esecuzione in avanti. */
  async function registraEsecuzione(id) {
    const voce = await leggi(id);
    if (!voce) return null;
    const ora = clock();
    const giornoOggi = ora.toISOString().slice(0, 10);
    if (voce.giornoContatore !== giornoOggi) {
      voce.giornoContatore = giornoOggi;
      voce.eseguiteOggi = 0;
    }
    voce.eseguiteOggi += 1;
    voce.ultimaEsecuzione = ora.toISOString();
    voce.prossimaEsecuzione = new Date(ora.getTime() + voce.intervalloMinuti * 60_000).toISOString();
    return scrivi(voce);
  }

  async function elimina(id) {
    await fsAdapter.rm(percorsoDi(id), { force: true });
  }

  return Object.freeze({ elenca, leggi, crea, imposta, registraEsecuzione, elimina });
}
