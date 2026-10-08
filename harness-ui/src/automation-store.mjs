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
 * ⛔⛔⛔ AUTOMAZIONI A DUE PORTE (owner 08/10/2026 notte, «stato dell'arte come Claude e Codex, non negoziabile») — le voci
 * v2 (`versione: 2`). Quello che sta sopra vale ancora per le voci v1 (un task del corpus), che restano leggibili ed eseguibili
 * com'erano. Per le v2 le decisioni dell'owner cambiano tre cose, e sono scritte qui perché il codice sotto le rispetti:
 * - istruzioni LIBERE, una cartella di lavoro, i permessi (di serie «Workspace write», D2), la pianificazione e il fuso
 *   (`automation-pianificazione.mjs`), «ripeti N volte / per sempre» al posto del tetto al giorno (D1, come Hermes
 *   `repeat.times`, `cron/jobs.py:1915`), il minimo di 5 minuti che resta;
 * - nasce ACCESA (D3): l'ha approvata la persona, dal foglio o dalla carta in chat. Il freno ai costi non è più «nasce
 *   spenta», è la carta, il minimo di 5 minuti, i giri mai sovrapposti e il recupero di un giro solo;
 * - ogni giro si scrive in uno STORICO (`<id>.runs.jsonl`, una riga per evento, fuse per giro): partita, finita, fallita,
 *   saltata col motivo; i giri con qualcosa da dire e non letti sono «Da guardare».
 * ⛔ E due difese che la v1 non aveva: una CODA di scrittura per voce (review del bugfixer sulla C2b: `impostaCoordinazione` e
 *   `registraEsecuzione` leggevano e riscrivevano la voce intera, e una delle due poteva perdersi) e la scrittura su un
 *   temporaneo poi rinominato, perché una scrittura che fallisce a metà non lasci un JSON troncato.
 */
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, win32 } from 'node:path';

import { modelloRichiestaValido, permessiRichiestaValido } from './config.mjs';
import { PianificazioneNonValida, fusoValido, normalizzaPianificazione, prossimoGiro } from './automation-pianificazione.mjs';

export const INTERVALLO_MINIMO_MINUTI = 5;
export const LIMITE_MASSIMO_AL_GIORNO = 10;
export const PERMESSI_DI_SERIE = 'Workspace write'; // owner D2, 08/10/2026
const NOME_MASSIMO = 80;
const ISTRUZIONI_MASSIME = 20_000;
const RIASSUNTO_MASSIMO = 4_000;
const ORIGINI = new Set(['interfaccia', 'chat', 'automazione']);
const CAMPI_CREA_V2 = new Set(['nome', 'istruzioni', 'cartella', 'modello', 'permessi', 'coordinazione', 'pianificazione', 'fusoOrario', 'ripeti', 'origine']);
const CAMPI_MODIFICA_V2 = new Set(['nome', 'istruzioni', 'cartella', 'modello', 'permessi', 'coordinazione', 'pianificazione', 'fusoOrario', 'ripeti']);
const ESITI_DI_FINE = new Set(['finita', 'fallita', 'fermata']);

export class AutomationStoreError extends Error {
  constructor(message, code = 'AUTOMATION_INVALID') {
    super(message);
    this.name = 'AutomationStoreError';
    this.code = code;
  }
}

function fusoDelSistema() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
const assoluto = (percorso) => isAbsolute(percorso) || win32.isAbsolute(percorso);

export function createAutomationStore({
  cartella,
  fsAdapter = { mkdir, readFile, readdir, rm, writeFile, rename, appendFile },
  clock = () => new Date(),
} = {}) {
  if (typeof cartella !== 'string' || cartella.length === 0) {
    throw new AutomationStoreError('folder is required', 'AUTOMATION_STORE_MISCONFIGURED');
  }

  const percorsoDi = (id) => join(cartella, `${id}.json`);
  const storicoDi = (id) => join(cartella, `${id}.runs.jsonl`);

  /* La coda per voce: ogni operazione che legge e riscrive una voce aspetta la precedente sulla STESSA voce. */
  const code = new Map();
  function inCoda(id, lavoro) {
    const prima = code.get(id) ?? Promise.resolve();
    const questa = prima.then(lavoro, lavoro);
    const coda = questa.catch(() => {});
    code.set(id, coda);
    coda.then(() => { if (code.get(id) === coda) code.delete(id); });
    return questa;
  }

  async function scrivi(voce) {
    await fsAdapter.mkdir(cartella, { recursive: true });
    const temporaneo = `${percorsoDi(voce.id)}.${randomUUID()}.tmp`;
    await fsAdapter.writeFile(temporaneo, JSON.stringify(voce, null, 2), 'utf8');
    if (typeof fsAdapter.rename === 'function') {
      try {
        await fsAdapter.rename(temporaneo, percorsoDi(voce.id));
      } catch (errore) {
        await fsAdapter.rm(temporaneo, { force: true }).catch(() => {});
        throw errore;
      }
    } else {
      await fsAdapter.writeFile(percorsoDi(voce.id), JSON.stringify(voce, null, 2), 'utf8');
      await fsAdapter.rm(temporaneo, { force: true }).catch(() => {});
    }
    return voce;
  }

  async function leggi(id) {
    try {
      return JSON.parse(await fsAdapter.readFile(percorsoDi(id), 'utf8'));
    } catch {
      return null; // ⛔ assente o corrotta a meta scrittura: mai un throw, chi chiama vede null
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

  /** v2: il prossimo giro di una voce accesa, dalla sua pianificazione; `null` se spenta o a mano. */
  function prossimaDi(voce, { dopo = clock(), ultimoGiro = null } = {}) {
    if (!voce.attiva) return null;
    const giro = prossimoGiro(voce.pianificazione, { dopo, fusoOrario: voce.fusoOrario, ultimoGiro });
    return giro ? giro.toISOString() : null;
  }

  function pianificazioneValida(entrata) {
    try { return normalizzaPianificazione(entrata); } catch (errore) {
      if (errore instanceof PianificazioneNonValida) throw new AutomationStoreError(errore.message, errore.code);
      throw errore;
    }
  }

  /** I campi v2, uno per uno: un valore fuori posto si rifiuta, mai si aggiusta (vedi la guardia in testa). */
  function validaCampiV2(campi, { parziale }) {
    const fuori = {};
    if (!parziale || 'nome' in campi) {
      const nome = typeof campi.nome === 'string' ? campi.nome.trim() : '';
      if (!nome || nome.length > NOME_MASSIMO) throw new AutomationStoreError(`"nome" must be 1-${NOME_MASSIMO} characters`);
      fuori.nome = nome;
    }
    if (!parziale || 'istruzioni' in campi) {
      if (typeof campi.istruzioni !== 'string' || campi.istruzioni.trim() === '' || campi.istruzioni.length > ISTRUZIONI_MASSIME) {
        throw new AutomationStoreError(`"istruzioni" must be non-empty text, at most ${ISTRUZIONI_MASSIME} characters`);
      }
      fuori.istruzioni = campi.istruzioni;
    }
    if (!parziale || 'cartella' in campi) {
      if (typeof campi.cartella !== 'string' || !assoluto(campi.cartella)) throw new AutomationStoreError('"cartella" must be an absolute folder path');
      fuori.cartella = campi.cartella;
    }
    if ('modello' in campi) {
      if (campi.modello !== null && !modelloRichiestaValido(campi.modello)) throw new AutomationStoreError('invalid model');
      fuori.modello = campi.modello ?? null;
    }
    if ('permessi' in campi) {
      if (typeof campi.permessi !== 'string' || !permessiRichiestaValido(campi.permessi)) {
        throw new AutomationStoreError('"permessi" must be one of: Read only, Workspace write, On request, Full access');
      }
      fuori.permessi = campi.permessi;
    }
    if ('coordinazione' in campi) {
      if (typeof campi.coordinazione !== 'boolean') throw new AutomationStoreError('coordinazione must be true or false');
      fuori.coordinazione = campi.coordinazione;
    }
    if ('fusoOrario' in campi) {
      if (!fusoValido(campi.fusoOrario)) throw new AutomationStoreError(`unknown time zone: ${String(campi.fusoOrario)}`, 'AUTOMATION_TIMEZONE_INVALID');
      fuori.fusoOrario = campi.fusoOrario;
    }
    if (!parziale || 'pianificazione' in campi) fuori.pianificazione = pianificazioneValida(campi.pianificazione);
    if ('ripeti' in campi) {
      if (campi.ripeti !== null && !(Number.isSafeInteger(campi.ripeti) && campi.ripeti >= 1)) {
        throw new AutomationStoreError('"ripeti" must be a whole number of runs (1 or more), or null for forever');
      }
      fuori.ripeti = campi.ripeti;
    }
    return fuori;
  }

  /**
   * @returns la voce creata. ⛔ v1 (con `taskId`): sempre `attiva: false`, vedi la guardia in testa. v2 (con `istruzioni`):
   * nasce accesa (owner D3). Lancia `AutomationStoreError` su un parametro fuori posto, mai un valore silenziosamente
   * corretto (un limite "aggiustato da solo" nasconderebbe all'owner cosa ha davvero chiesto).
   */
  /*
   * ⛔ 24/09/2026, decisione owner («come il mobile, subito»): l'automazione SALVA il modello scelto nella chat al momento
   *   della creazione e gira con quello, invece del predefinito del server che nessuno vedeva. Stessa validazione del
   *   modello di una sessione (`modelloRichiestaValido`). Senza modello (automazioni di prima, o nessun modello scelto)
   *   resta `null` e l'interfaccia lo dice: «predefinito del server». Ricerca della sessione mobile (24/09): Hermes, Claude
   *   Code Routines, Codex, Cursor mostrano il modello del job; Hermes #59031 e #114690 sono guasti di un modello non visto.
   */
  /*
   * ⛔ C2b «Coordinazione» (owner 08/10/2026 notte, «Interruttore nella scheda, ora»): un'automazione non ha nessuno davanti,
   *   quindi la carta d'avvio di un agente non avrebbe risposta e si nega subito. Chi la crea sceglie se può avviare agenti DA
   *   SOLA (entro il tetto di 20 per esecuzione): `coordinazione: true`. Spenta di serie, e spente le automazioni di prima.
   *   Fonte: Hermes dà a ogni lavoro pianificato i suoi attrezzi, scelti alla creazione (`cron/scheduler.py:489-505`,
   *   `enabled_toolsets` per job, clone del 24/09/2026).
   */
  async function crea(entrata = {}) {
    if (entrata && typeof entrata === 'object' && 'istruzioni' in entrata) return creaV2(entrata);
    const { taskId, nome, intervalloMinuti, limiteAlGiorno = 3, modello = null, coordinazione = false } = entrata;
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new AutomationStoreError('taskId mancante');
    }
    if (!Number.isInteger(intervalloMinuti) || intervalloMinuti < INTERVALLO_MINIMO_MINUTI) {
      throw new AutomationStoreError(`intervalloMinuti must be an integer >= ${INTERVALLO_MINIMO_MINUTI}`);
    }
    if (!Number.isInteger(limiteAlGiorno) || limiteAlGiorno < 1 || limiteAlGiorno > LIMITE_MASSIMO_AL_GIORNO) {
      throw new AutomationStoreError(`limiteAlGiorno must be an integer between 1 and ${LIMITE_MASSIMO_AL_GIORNO}`);
    }
    if (modello !== null && modello !== undefined && !modelloRichiestaValido(modello)) {
      throw new AutomationStoreError("invalid model");
    }
    if (typeof coordinazione !== 'boolean') {
      throw new AutomationStoreError('coordinazione must be true or false');
    }
    const voce = {
      id: randomUUID(),
      taskId,
      nome: typeof nome === 'string' && nome.length > 0 ? nome : taskId,
      intervalloMinuti,
      limiteAlGiorno,
      modello: typeof modello === 'string' ? modello : null,
      coordinazione,
      attiva: false,
      creataAlle: clock().toISOString(),
      ultimaEsecuzione: null,
      prossimaEsecuzione: null,
      eseguiteOggi: 0,
      giornoContatore: null,
    };
    return scrivi(voce);
  }

  async function creaV2(entrata) {
    return scrivi(costruisciV2(entrata));
  }

  /** v2: la voce che `crea` scriverebbe, SENZA scriverla — è la bozza che la carta in chat mostra alla persona. */
  function anteprimaCrea(entrata) {
    return costruisciV2(entrata && typeof entrata === 'object' ? entrata : {});
  }

  /** v2: che cosa cambierebbe `modifica`, senza scrivere: `{prima, dopo}` dei soli campi toccati (più il prossimo giro). */
  async function anteprimaModifica(id, campi) {
    const voce = await leggi(id);
    if (!voce) return null;
    if (voce.versione !== 2) throw new AutomationStoreError('this automation uses the old format and cannot be edited', 'AUTOMATION_LEGACY');
    if (!campi || typeof campi !== 'object') throw new AutomationStoreError('nothing to change');
    const estranei = Object.keys(campi).filter((k) => !CAMPI_MODIFICA_V2.has(k));
    if (estranei.length) throw new AutomationStoreError(`these fields cannot be changed here: ${estranei.join(', ')}`);
    const nuovi = validaCampiV2(campi, { parziale: true });
    const dopo = { ...voce, ...nuovi };
    if (nuovi.pianificazione?.tipo === 'una-volta') dopo.ripeti = 1;
    if ('pianificazione' in nuovi || 'fusoOrario' in nuovi) dopo.prossimaEsecuzione = prossimaDi(dopo);
    const toccati = [...new Set([...Object.keys(nuovi), ...(dopo.prossimaEsecuzione !== voce.prossimaEsecuzione ? ['prossimaEsecuzione'] : [])])];
    return { voce, prima: Object.fromEntries(toccati.map((k) => [k, voce[k] ?? null])), dopo: Object.fromEntries(toccati.map((k) => [k, dopo[k] ?? null])) };
  }

  function costruisciV2(entrata) {
    const estranei = Object.keys(entrata).filter((k) => !CAMPI_CREA_V2.has(k));
    if (estranei.length) throw new AutomationStoreError(`unknown field(s): ${estranei.join(', ')}`);
    const campi = validaCampiV2({ fusoOrario: fusoDelSistema(), ...entrata }, { parziale: false });
    let origine = { tipo: 'interfaccia' };
    if (entrata.origine !== undefined) {
      const o = entrata.origine;
      if (!o || typeof o !== 'object' || !ORIGINI.has(o.tipo) || (o.sessionId !== undefined && typeof o.sessionId !== 'string')) {
        throw new AutomationStoreError('"origine" must be {tipo: interfaccia|chat|automazione, sessionId?}');
      }
      origine = { tipo: o.tipo, ...(typeof o.sessionId === 'string' ? { sessionId: o.sessionId } : {}) };
    }
    const ora = clock();
    const voce = {
      versione: 2,
      id: randomUUID(),
      nome: campi.nome,
      istruzioni: campi.istruzioni,
      cartella: campi.cartella,
      modello: campi.modello ?? null,
      permessi: campi.permessi ?? PERMESSI_DI_SERIE,
      coordinazione: campi.coordinazione ?? false,
      pianificazione: campi.pianificazione,
      fusoOrario: campi.fusoOrario,
      ripeti: campi.pianificazione.tipo === 'una-volta' ? 1 : (campi.ripeti ?? null),
      eseguite: 0,
      attiva: true,
      origine,
      creataAlle: ora.toISOString(),
      modificataAlle: ora.toISOString(),
      ultimaEsecuzione: null,
      prossimaEsecuzione: null,
      inAttesaFinoA: null,
      giroInCorso: null,
    };
    voce.prossimaEsecuzione = prossimaDi(voce, { dopo: ora });
    if (voce.pianificazione.tipo === 'una-volta' && !voce.prossimaEsecuzione) {
      throw new AutomationStoreError('"quando" is in the past', 'AUTOMATION_SCHEDULE_PAST');
    }
    return voce;
  }

  /** v2: cambia i campi ammessi; accendere e spegnere passano da `imposta`, i contatori dai giri. */
  function modifica(id, campi) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce) return null;
      if (voce.versione !== 2) throw new AutomationStoreError('this automation uses the old format and cannot be edited', 'AUTOMATION_LEGACY');
      if (!campi || typeof campi !== 'object') throw new AutomationStoreError('nothing to change');
      const estranei = Object.keys(campi).filter((k) => !CAMPI_MODIFICA_V2.has(k));
      if (estranei.length) throw new AutomationStoreError(`these fields cannot be changed here: ${estranei.join(', ')}`);
      const nuovi = validaCampiV2(campi, { parziale: true });
      Object.assign(voce, nuovi);
      if (nuovi.pianificazione?.tipo === 'una-volta') voce.ripeti = 1;
      voce.modificataAlle = clock().toISOString();
      if ('pianificazione' in nuovi || 'fusoOrario' in nuovi) voce.prossimaEsecuzione = prossimaDi(voce);
      return scrivi(voce);
    });
  }

  /** Accende/spegne — quando accende, calcola SUBITO la prossima esecuzione da ORA, non da un'esecuzione passata mai avvenuta. */
  function imposta(id, attivaValore) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce) return null;
      voce.attiva = Boolean(attivaValore);
      if (voce.versione === 2) {
        voce.prossimaEsecuzione = prossimaDi(voce);
        return scrivi(voce);
      }
      voce.prossimaEsecuzione = voce.attiva
        ? new Date(clock().getTime() + voce.intervalloMinuti * 60_000).toISOString()
        : null;
      return scrivi(voce);
    });
  }

  /** C2b: accende o spegne Coordinazione per le PROSSIME esecuzioni (un'esecuzione già partita resta com'è). */
  function impostaCoordinazione(id, accesa) {
    if (typeof accesa !== 'boolean') return Promise.reject(new AutomationStoreError('coordinazione must be true or false'));
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce) return null;
      voce.coordinazione = accesa;
      return scrivi(voce);
    });
  }

  /** v1 — chiamata dallo scheduler dopo un avvio reale: azzera il contatore al cambio di giorno, sposta la prossima esecuzione in avanti. */
  function registraEsecuzione(id) {
    return inCoda(id, async () => {
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
    });
  }

  /* ── lo storico dei giri (v2) ─────────────────────────────────────────────────────────────────────────────────────── */

  async function aggiungiAlloStorico(id, riga) {
    await fsAdapter.mkdir(cartella, { recursive: true });
    await fsAdapter.appendFile(storicoDi(id), `${JSON.stringify(riga)}\n`, 'utf8');
  }

  /** v2: un giro parte. Conta, sposta il prossimo giro, si spegne a `ripeti` raggiunto (e «una volta» dopo il suo giro). */
  function apriGiro(id, { runId, previstaAlle = null, sessionId = null, ritardo = null, manuale = false }) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2) return null;
      const ora = clock();
      voce.eseguite += 1;
      voce.ultimaEsecuzione = ora.toISOString();
      voce.giroInCorso = { runId, sessionId, partitoAlle: ora.toISOString() };
      voce.inAttesaFinoA = null; // Hermes `quota_hold.py`: un giro che raggiunge il modello toglie l'attesa
      if (voce.ripeti !== null && voce.eseguite >= voce.ripeti) voce.attiva = false;
      voce.prossimaEsecuzione = prossimaDi(voce, { dopo: ora, ultimoGiro: ora });
      await aggiungiAlloStorico(id, { runId, evento: 'partita', previstaAlle, partitaAlle: ora.toISOString(), sessionId,
        ...(ritardo ? { ritardo } : {}), ...(manuale ? { manuale: true } : {}) });
      return scrivi(voce);
    });
  }

  /** v2: un giro finisce. `daGuardare` lo decide chi legge la risposta (un silenzio no, un fallimento sì, uno stop tuo no). */
  function chiudiGiro(id, runId, { esito, riassunto = null, daGuardare = false, motivo = null }) {
    if (!ESITI_DI_FINE.has(esito)) return Promise.reject(new AutomationStoreError('esito must be finita, fallita or fermata'));
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2) return null;
      if (voce.giroInCorso?.runId === runId) voce.giroInCorso = null;
      await aggiungiAlloStorico(id, { runId, evento: 'fine', esito, finitaAlle: clock().toISOString(),
        riassunto: typeof riassunto === 'string' ? riassunto.slice(0, RIASSUNTO_MASSIMO) : null, daGuardare: daGuardare === true,
        ...(motivo ? { motivo } : {}) });
      return scrivi(voce);
    });
  }

  /**
   * v2: un giro non parte (precedente ancora in corso, app chiusa troppo a lungo, cartella o modello che mancano…). Non conta;
   * il prossimo si sposta. `daGuardare` per i motivi che chiedono un gesto della persona (la cartella sparita), non per uno
   * scavalcamento ordinario. «Una volta» saltata non ha un dopo: si spegne.
   */
  function saltaGiro(id, { previstaAlle = null, motivo, dettaglio = null, daGuardare = false }) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2) return null;
      const ora = clock();
      if (voce.pianificazione.tipo === 'una-volta') voce.attiva = false;
      voce.prossimaEsecuzione = prossimaDi(voce, { dopo: ora, ultimoGiro: ora });
      await aggiungiAlloStorico(id, { runId: randomUUID(), evento: 'saltata', previstaAlle, alle: ora.toISOString(), motivo,
        ...(typeof dettaglio === 'string' && dettaglio ? { dettaglio: dettaglio.slice(0, RIASSUNTO_MASSIMO) } : {}),
        ...(daGuardare === true ? { daGuardare: true } : {}) });
      return scrivi(voce);
    });
  }

  /**
   * v2: il fornitore ha detto «riprova fra N secondi» (429 con la sua attesa). Hermes `cron/quota_hold.py:1-13`: il lavoro si
   * parcheggia alla riapertura (o alla prima occorrenza dopo) invece di bruciare giri che falliscono tutti uguali.
   */
  function inAttesaFino(id, finoAIso) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2) return null;
      const finoA = new Date(finoAIso);
      if (Number.isNaN(finoA.getTime())) throw new AutomationStoreError('invalid wait time');
      voce.inAttesaFinoA = finoA.toISOString();
      if (voce.attiva) {
        const tipo = voce.pianificazione.tipo;
        voce.prossimaEsecuzione = tipo === 'ogni-n-minuti' || tipo === 'una-volta'
          ? finoA.toISOString()
          : prossimaDi(voce, { dopo: new Date(finoA.getTime() - 1) });
      }
      return scrivi(voce);
    });
  }

  /**
   * v2: il giro in corso ha cambiato SÉ STESSO (owner, decisione 9 dell'08/10/2026: «il cambio resta nello storico e in Da
   * guardare»). Si scrive sul giro in corso quali campi ha toccato; quel giro andrà in «Da guardare» comunque finisca. Senza un
   * giro in corso non c'è niente da segnare (un cambio dalla chat ha la sua carta). `null` se la voce non c'è.
   */
  function segnaCambioDelGiro(id, campi) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2 || !voce.giroInCorso?.runId) return null;
      const toccati = [...new Set((Array.isArray(campi) ? campi : []).filter((c) => c === 'istruzioni' || c === 'prossimaEsecuzione'))];
      if (!toccati.length) return null;
      await aggiungiAlloStorico(id, { runId: voce.giroInCorso.runId, evento: 'cambiata', campi: toccati, alle: clock().toISOString() });
      return { runId: voce.giroInCorso.runId, campi: toccati };
    });
  }

  /**
   * v2: il giro in corso PROPONE nuove istruzioni per sé (owner, decisione 13 dell'08/10/2026: «un cambio delle istruzioni
   * chiesto da un giro NON si applica: resta in sospeso in Da guardare, col prima → dopo, e si applica solo col tuo Approva»).
   * La voce non si tocca: la proposta si scrive sullo storico del giro, con le minacce trovate dalla scansione. Una seconda
   * proposta dello stesso giro sostituisce la prima. `null` senza un giro in corso.
   */
  function proponiCambioDelGiro(id, { istruzioni, minacce = [] } = {}) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2 || !voce.giroInCorso?.runId) return null;
      const { istruzioni: dopo } = validaCampiV2({ istruzioni }, { parziale: true });
      const runId = voce.giroInCorso.runId;
      await aggiungiAlloStorico(id, { runId, evento: 'proposta', prima: voce.istruzioni, dopo,
        minacce: Array.isArray(minacce) ? minacce.filter((m) => typeof m === 'string') : [], alle: clock().toISOString() });
      return { runId, prima: voce.istruzioni, dopo };
    });
  }

  /**
   * v2: la persona decide una proposta («approva» | «scarta»), una volta sola. Approvare applica solo se le istruzioni sono
   * ancora quelle che il giro ha visto: se nel frattempo sono cambiate, approvarla scriverebbe sopra un cambio che la persona
   * non ha confrontato (AUTOMATION_PROPOSAL_STALE). Prima si scrive la voce, poi lo storico: se fra i due il processo muore,
   * la proposta resta in attesa e un secondo «approva» trova le istruzioni già uguali al «dopo» e scrive solo la decisione.
   * Decisa, il giro conta come letto.
   */
  function risolviProposta(id, runId, decisione) {
    if (decisione !== 'approva' && decisione !== 'scarta') {
      return Promise.reject(new AutomationStoreError('decisione must be approva or scarta'));
    }
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2) return null;
      const giro = (await giri(id, { limite: Infinity })).find((g) => g.runId === runId);
      /* le frasi sono quelle del dizionario (`errori.js`), parola per parola: così l'interfaccia le dice nella lingua della
         persona (`api-client.ts`, «il dizionario sostituisce il server solo se la frase inglese coincide») */
      if (!giro?.proposta) throw new AutomationStoreError('This run did not propose new instructions', 'AUTOMATION_PROPOSAL_NOT_FOUND');
      if (giro.proposta.stato !== 'in-attesa') throw new AutomationStoreError('This proposal was already approved or discarded', 'AUTOMATION_PROPOSAL_DECIDED');
      if (decisione === 'approva' && voce.istruzioni !== giro.proposta.dopo) {
        if (voce.istruzioni !== giro.proposta.prima) {
          throw new AutomationStoreError('The instructions changed after this proposal: compare them again before changing them', 'AUTOMATION_PROPOSAL_STALE');
        }
        voce.istruzioni = giro.proposta.dopo;
        voce.modificataAlle = clock().toISOString();
        await scrivi(voce);
      }
      const alle = clock().toISOString();
      await aggiungiAlloStorico(id, { runId, evento: 'proposta-decisa', decisione, alle });
      if (!giro.letta) await aggiungiAlloStorico(id, { runId, evento: 'letta', alle });
      const stato = decisione === 'approva' ? 'approvata' : 'scartata';
      return { voce, giro: { ...giro, letta: true, proposta: { ...giro.proposta, stato } } };
    });
  }

  /**
   * v2: sposta SOLO il prossimo giro (owner D5: un giro può anticipare o rimandare il successivo), senza toccare la
   * pianificazione. Mai prima di 5 minuti da adesso: è lo stesso minimo di ogni altra forma.
   */
  function spostaProssimo(id, quandoIso) {
    return inCoda(id, async () => {
      const voce = await leggi(id);
      if (!voce || voce.versione !== 2) return null;
      const quando = new Date(quandoIso);
      if (Number.isNaN(quando.getTime())) throw new AutomationStoreError('invalid next run time', 'AUTOMATION_SCHEDULE_INVALID');
      if (quando.getTime() < clock().getTime() + INTERVALLO_MINIMO_MINUTI * 60_000) {
        throw new AutomationStoreError(`the next run must be at least ${INTERVALLO_MINIMO_MINUTI} minutes from now`, 'AUTOMATION_SCHEDULE_TOO_FREQUENT');
      }
      if (!voce.attiva) throw new AutomationStoreError('this automation is off: turn it on first', 'AUTOMATION_INVALID');
      voce.prossimaEsecuzione = quando.toISOString();
      voce.modificataAlle = clock().toISOString();
      return scrivi(voce);
    });
  }

  /** Lo storico di una voce, un oggetto per giro (le righe dello stesso giro fuse), il più recente per primo. */
  async function giri(id, { limite = 50 } = {}) {
    let testo;
    try { testo = await fsAdapter.readFile(storicoDi(id), 'utf8'); } catch { return []; }
    const perGiro = new Map();
    for (const riga of testo.split('\n')) {
      if (!riga.trim()) continue;
      let r;
      try { r = JSON.parse(riga); } catch { continue; } // una riga spezzata non nasconde le altre
      if (!r || typeof r.runId !== 'string') continue;
      const giro = perGiro.get(r.runId) ?? { runId: r.runId };
      if (r.evento === 'partita') {
        Object.assign(giro, { previstaAlle: r.previstaAlle ?? null, partitaAlle: r.partitaAlle, sessionId: r.sessionId ?? null,
          ...(r.ritardo ? { ritardo: r.ritardo } : {}), ...(r.manuale ? { manuale: true } : {}), esito: giro.esito ?? 'partita',
          daGuardare: giro.daGuardare ?? false, letta: giro.letta ?? false });
      } else if (r.evento === 'fine') {
        // un giro che ha cambiato sé stesso va in «Da guardare» comunque finisca (decisione 9)
        Object.assign(giro, { esito: r.esito, finitaAlle: r.finitaAlle, riassunto: r.riassunto ?? null,
          daGuardare: r.daGuardare === true || Boolean(giro.cambi?.length) || Boolean(giro.proposta),
          ...(r.motivo ? { motivo: r.motivo } : {}), letta: giro.letta ?? false });
      } else if (r.evento === 'cambiata') {
        giro.cambi = [...new Set([...(giro.cambi ?? []), ...(Array.isArray(r.campi) ? r.campi : [])])];
        if (giro.esito && giro.esito !== 'partita') giro.daGuardare = true;
      } else if (r.evento === 'proposta') {
        // decisione 13: le istruzioni proposte da un giro aspettano la persona
        giro.proposta = { prima: r.prima ?? null, dopo: r.dopo ?? null, minacce: Array.isArray(r.minacce) ? r.minacce : [], stato: 'in-attesa', alle: r.alle ?? null };
        if (giro.esito && giro.esito !== 'partita') giro.daGuardare = true;
      } else if (r.evento === 'proposta-decisa') {
        if (giro.proposta) giro.proposta = { ...giro.proposta, stato: r.decisione === 'approva' ? 'approvata' : 'scartata' };
      } else if (r.evento === 'saltata') {
        Object.assign(giro, { previstaAlle: r.previstaAlle ?? null, saltataAlle: r.alle, esito: 'saltata', motivo: r.motivo,
          ...(r.dettaglio ? { dettaglio: r.dettaglio } : {}), daGuardare: r.daGuardare === true, letta: giro.letta ?? false });
      } else if (r.evento === 'letta') {
        giro.letta = true;
      }
      perGiro.set(r.runId, giro);
    }
    const quando = (g) => g.partitaAlle ?? g.saltataAlle ?? '';
    /* a parità d'ora (due giri nello stesso millisecondo) vince quello scritto dopo: l'ordine del file è l'ordine vero */
    const ordine = new Map([...perGiro.keys()].map((runId, i) => [runId, i]));
    return [...perGiro.values()]
      .sort((a, b) => quando(b).localeCompare(quando(a)) || ordine.get(b.runId) - ordine.get(a.runId))
      .slice(0, limite);
  }

  /** «Letto» per un giro di «Da guardare». `null` se il giro non c'è. */
  function segnaLetto(id, runId) {
    return inCoda(id, async () => {
      const giro = (await giri(id, { limite: Infinity })).find((g) => g.runId === runId);
      if (!giro) return null;
      if (!giro.letta) await aggiungiAlloStorico(id, { runId, evento: 'letta', alle: clock().toISOString() });
      return { ...giro, letta: true };
    });
  }

  /** «Da guardare», su tutte le automazioni v2: i giri con qualcosa da dire e non ancora letti, i più recenti prima. */
  async function daGuardare() {
    const fuori = [];
    for (const voce of await elenca()) {
      if (voce.versione !== 2) continue;
      for (const giro of await giri(voce.id, { limite: Infinity })) {
        // una proposta in attesa resta anche se il giro è stato letto: aspetta un sì o un no (decisione 13)
        if ((giro.daGuardare && !giro.letta) || giro.proposta?.stato === 'in-attesa') fuori.push({ automazioneId: voce.id, nome: voce.nome, ...giro });
      }
    }
    return fuori.sort((a, b) => (b.finitaAlle ?? b.saltataAlle ?? '').localeCompare(a.finitaAlle ?? a.saltataAlle ?? ''));
  }

  function elimina(id) {
    return inCoda(id, async () => {
      await fsAdapter.rm(percorsoDi(id), { force: true });
      await fsAdapter.rm(storicoDi(id), { force: true });
    });
  }

  return Object.freeze({
    elenca, leggi, crea, anteprimaCrea, modifica, anteprimaModifica, imposta, impostaCoordinazione, registraEsecuzione, elimina,
    apriGiro, chiudiGiro, saltaGiro, inAttesaFino, spostaProssimo, segnaCambioDelGiro, proponiCambioDelGiro, risolviProposta,
    giri, segnaLetto, daGuardare,
  });
}
