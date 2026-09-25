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
/** ⭐ AUT-2: la richiesta scritta di un'automazione, stesso ordine di grandezza di un messaggio della chat. */
export const CONSEGNA_MASSIMA = 4000;

export class AutomationStoreError extends Error {
  constructor(message, code = 'AUTOMATION_INVALID') {
    super(message);
    this.name = 'AutomationStoreError';
    this.code = code;
  }
}

/**
 * GIORNO-LOCALE-01 (owner 25/09/2026, «giorno locale»): il giorno delle automazioni è quello del TELEFONO. Node sul Pad vede il fuso di Android
 * (misurato il 25/09/2026: `Europe/Rome`, scarto -120 col server del Codice vivo), quindi i metodi locali di `Date` bastano.
 * Esportate per il pianificatore: una sola definizione di «oggi».
 */
export function giornoLocale(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}
export function mezzanotteDopo(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1);
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
  /*
   * ⭐⭐⭐ 24/09/2026 (AUT-2, owner «Richiesta scritta», dossier `.claude/ricerche/2026-09-24-automazioni-codice-10x4.md`)
   * — oltre a `{taskId}` (un'attività del banco di prova, la forma del desktop, invariata) un'automazione può essere
   * una RICHIESTA SCRITTA: `{consegna, cartellaId, modello?}`, come in tutti i concorrenti misurati (Hermes, ChatGPT,
   * Claude Code, Gemini, Copilot, Manus, OpenClaw). Sul telefono il banco è vuoto: senza questa forma non si poteva
   * creare niente. Mai le due forme insieme: un'automazione deve dire UNA cosa sola da fare.
   */
  async function crea({ taskId, consegna, cartellaId, modello, reasoning, nome, intervalloMinuti, limiteAlGiorno = 3 }) {
    const perConsegna = consegna !== undefined;
    if (perConsegna && taskId !== undefined) {
      throw new AutomationStoreError('taskId e consegna insieme: un\'automazione fa una cosa sola');
    }
    if (perConsegna) {
      if (typeof consegna !== 'string' || consegna.trim().length === 0 || consegna.length > CONSEGNA_MASSIMA) {
        throw new AutomationStoreError(`consegna deve essere un testo fra 1 e ${CONSEGNA_MASSIMA} caratteri`);
      }
      if (typeof cartellaId !== 'string' || cartellaId.length === 0) {
        throw new AutomationStoreError('cartellaId mancante');
      }
      if (modello !== undefined && modello !== null && typeof modello !== 'string') {
        throw new AutomationStoreError('modello deve essere un testo');
      }
      // AUTO-LIVELLO (25/09/2026, owner «Salvato alla creazione»): la forma fine la controlla http-app (`reasoningRichiestaValido`).
      if (reasoning !== undefined && reasoning !== null && (typeof reasoning !== 'object' || Array.isArray(reasoning))) {
        throw new AutomationStoreError('reasoning deve essere un oggetto {effort?, summary?}');
      }
    } else if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new AutomationStoreError('taskId mancante');
    }
    if (!Number.isInteger(intervalloMinuti) || intervalloMinuti < INTERVALLO_MINIMO_MINUTI) {
      throw new AutomationStoreError(`intervalloMinuti deve essere un intero >= ${INTERVALLO_MINIMO_MINUTI}`);
    }
    if (!Number.isInteger(limiteAlGiorno) || limiteAlGiorno < 1 || limiteAlGiorno > LIMITE_MASSIMO_AL_GIORNO) {
      throw new AutomationStoreError(`limiteAlGiorno deve essere un intero fra 1 e ${LIMITE_MASSIMO_AL_GIORNO}`);
    }
    const nomePredefinito = perConsegna ? consegna.trim().split('\n')[0].trim().slice(0, 60) : taskId;
    const voce = {
      id: randomUUID(),
      ...(perConsegna ? { consegna, cartellaId, modello: modello ?? null, reasoning: reasoning ?? null } : { taskId }),
      nome: typeof nome === 'string' && nome.length > 0 ? nome : nomePredefinito,
      intervalloMinuti,
      limiteAlGiorno,
      attiva: false,
      creataAlle: clock().toISOString(),
      ultimaEsecuzione: null,
      prossimaEsecuzione: null,
      eseguiteOggi: 0,
      giornoContatore: null,
      // ⭐ AUT-2: la sessione dell'ultimo giro (una sessione del pianificatore non ha una riga nell'app: senza questo id
      // il risultato non si potrebbe aprire) e il motivo dell'ultima pausa forzata.
      ultimaSessioneId: null,
      ultimoErrore: null,
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
    // ⭐ AUT-2: riaccesa a mano, la pausa per errore è superata — il motivo vecchio non resta a schermo.
    if (voce.attiva) voce.ultimoErrore = null;
    return scrivi(voce);
  }

  /** Chiamata dallo scheduler dopo un avvio reale: azzera il contatore al cambio di giorno, sposta la prossima esecuzione in avanti. */
  async function registraEsecuzione(id, { sessionId } = {}) {
    const voce = await leggi(id);
    if (!voce) return null;
    const ora = clock();
    // GIORNO-LOCALE-01 (owner 25/09/2026, «giorno locale»): il giorno del telefono, non quello UTC (che in Italia d'estate cambia alle 02:00).
    const giornoOggi = giornoLocale(ora);
    if (voce.giornoContatore !== giornoOggi) {
      voce.giornoContatore = giornoOggi;
      voce.eseguiteOggi = 0;
    }
    voce.eseguiteOggi += 1;
    voce.ultimaEsecuzione = ora.toISOString();
    // ⭐ 24/09/2026 (AUT-2c, trovato sul Pad): raggiunto il limite, `unTick` aspetta il cambio di giorno (UTC) — la
    // prossima esecuzione detta è quella vera, non «fra un intervallo» (la riga e la scheda annunciavano le 16:33).
    let prossima = ora.getTime() + voce.intervalloMinuti * 60_000;
    if (voce.eseguiteOggi >= voce.limiteAlGiorno) {
      prossima = Math.max(prossima, mezzanotteDopo(ora).getTime());
    }
    voce.prossimaEsecuzione = new Date(prossima).toISOString();
    if (typeof sessionId === 'string' && sessionId.length > 0) voce.ultimaSessioneId = sessionId;
    voce.ultimoErrore = null;
    return scrivi(voce);
  }

  /**
   * ⭐ AUT-2 — pausa dopo un errore (Temporal, «pause on failure»): un'automazione che non riesce a partire, o il cui
   * giro finisce in errore, si ferma invece di ripetere il fallimento — e spendere — a ogni turno. Il motivo resta
   * finché qualcuno non la riaccende (`imposta`).
   */
  async function sospendiPerErrore(id, motivo) {
    const voce = await leggi(id);
    if (!voce) return null;
    voce.attiva = false;
    voce.prossimaEsecuzione = null;
    voce.ultimoErrore = String(motivo || 'errore sconosciuto').slice(0, 300);
    return scrivi(voce);
  }

  async function elimina(id) {
    await fsAdapter.rm(percorsoDi(id), { force: true });
  }

  return Object.freeze({ elenca, leggi, crea, imposta, registraEsecuzione, sospendiPerErrore, elimina });
}
