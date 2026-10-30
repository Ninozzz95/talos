/*
 * ⭐ L1 1.3 del motore locale — LA FINESTRA CHE CRESCE (owner 26/10/2026: «voglio una soluzione più user friendly e che non blocca il
 *   flusso», poi «Sì: allarga, poi riassume», bozzetto approvato «Sì, così» — handoff `mockup-finestra-che-cresce-2026-10-26/`).
 *
 * Quando la conversazione non entra più nella finestra di un modello LOCALE di questo PC (llama-server del supervisore), prima di
 * riassumere si prova ad ALLARGARE la finestra: se il modello è stato addestrato per una finestra più grande e la memoria lo regge,
 * il motore si riapre più grande e la stessa richiesta riparte. A schermo resta una riga sola («Window enlarged to N tokens…»),
 * nessuna carta, nessun clic. Se non si può (modello già al massimo, memoria, motore occupato da un'altra richiesta, scelta della
 * persona), si torna esattamente a oggi: il riassunto automatico (`compattazione-desktop.mjs`).
 *
 * Lo stato dell'arte letto prima di scrivere (26/10/2026):
 *   - Jan aveva l'aumento automatico e l'ha TOLTO per un pulsante a gradini 8K → 32K → ×1,5 (`useModelProvider.ts:715`,
 *     `routes/threads/$threadId.tsx:1982-2087`): un clic, e la memoria non la guarda nessuno;
 *   - Ollama tiene la finestra fissa e taglia in silenzio le prime righe; LM Studio ha le politiche «finestra che scorre / taglio
 *     a metà / ferma» e la finestra si sceglie a mano al caricamento (`lms load --context-length`);
 *   - Hermes comprime e riparte, e chiude solo se non basta (`agent/turn_overflow.py`).
 *   ⇒ Il passo in più: l'aumento automatico, ma MISURATO (massimo addestrato dall'intestazione GGUF, memoria libera, motore libero)
 *     e DETTO, con la vecchia finestra rimessa da sola se quella nuova non entra.
 *
 * ⛔ Cosa NON fa: non tocca il motore dell'app (dispositivo ospite: la finestra la decide l'app), né Ollama/LM Studio (non sono il
 *   nostro supervisore); non ferma una richiesta in corso (il motore ha UN posto, `-np 1`: si guarda `/slots` e, se lavora, si
 *   riassume); non riprova all'infinito (una richiesta, un allargamento).
 */
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { FRAZIONE_FINESTRA } from './kernel/compattazione-desktop.mjs';

/** Le tre scelte della persona (Impostazioni → Modelli locali). Di serie si allarga. */
export const SCELTE_FINESTRA_PIENA = Object.freeze(['allarga', 'riassumi', 'chiedi']);
export const SCELTA_DI_SERIE = 'allarga';
/** Il passo dei token: llama.cpp alloca la cache a blocchi, e un numero tondo si legge meglio a schermo. */
const PASSO = 4_096;
/**
 * Margine sopra ciò che l'errore dice servire: la risposta stessa e i giri dopo devono entrarci, o si riapre a ogni messaggio.
 * ⛔ Revisione blocco 4 (trovato dal mutante M6, 26/10/2026): era 1,25, cioè la conversazione all'80% della finestra nuova — SOPRA la
 *   soglia del riassunto (75%, `compattazione-desktop.mjs` FRAZIONE_FINESTRA): il passo dopo dello stesso giro era già alla soglia e
 *   faceva un secondo ricaricamento del motore. Con 1,5 la conversazione sta al 67%, sotto la soglia con lo spazio di una risposta.
 */
const MARGINE = 1.5;
/** La stessa quota della memoria libera che `load()` concede alla cache (server.mjs, «la cache del contesto, e basta contare quella»). */
const QUOTA_DELLA_MEMORIA = 0.6;

const arrotonda = (n) => Math.ceil(n / PASSO) * PASSO;

/**
 * Quanto aprire. `servono` = token del prompt detti dal motore (`n_prompt_tokens`), `prima` = la finestra di adesso, `massimo` = il
 * contesto addestrato (0 se ignoto). Ritorna la finestra nuova, o null se non c'è niente di più grande da aprire.
 */
export function finestraDaAprire({ servono, prima, massimo }) {
  if (!Number.isSafeInteger(servono) || servono <= 0 || !Number.isSafeInteger(prima) || prima <= 0) return null;
  let dopo = Math.max(arrotonda(servono * MARGINE), prima + PASSO);
  if (Number.isSafeInteger(massimo) && massimo > 0) dopo = Math.min(dopo, massimo);
  return dopo > prima && dopo >= servono ? dopo : null;
}

/*
 * ⭐ A1-1 (owner 26/10/2026 notte, «Tutte e due, visibili») — la crescita PRIMA di traboccare, alla soglia del riassunto, come Hermes
 *   (`hermes_cli/local_runtime/context_policy.py:40-48` la scala 64K → ×1,5 → … → nativa; `:219-257` la decisione; il giro la chiama
 *   alla soglia della compressione, `agent/turn_preflight.py:104-112` e `agent/turn_context_compaction.py:314-324`).
 *   Sotto i 64K (un modello che a 64K non entrava) si sale a ×1,5 dalla finestra di adesso invece di saltare a 64K: un salto di 4× che
 *   quasi sempre non entra costerebbe due ricaricamenti per niente.
 */
export const GRADINO_DI_PARTENZA = 65_536;
const CRESCITA_DELLA_SCALA = 1.5;
/** Sotto questa velocità di generazione allargare costa più di quanto rende: si riassume (Hermes `context_policy.py:19`, 6,0 token/s). */
export const VELOCITA_MINIMA_TOKEN_S = 6;

/** Il gradino dopo `prima`, entro `massimo` (il contesto addestrato); null se non c'è niente di più grande. */
export function prossimoGradino({ prima, massimo }) {
  if (!Number.isSafeInteger(prima) || prima <= 0 || !Number.isSafeInteger(massimo) || massimo <= prima) return null;
  let gradino = prima < GRADINO_DI_PARTENZA ? Math.min(arrotonda(prima * CRESCITA_DELLA_SCALA), GRADINO_DI_PARTENZA) : GRADINO_DI_PARTENZA;
  while (gradino <= prima) gradino = Math.floor(gradino * CRESCITA_DELLA_SCALA);
  return Math.min(gradino, massimo);
}

/** La frase completa della riga «finestra allargata», per chi non conosce l'evento `talos.finestra-locale` (registro, esportazioni). */
export function testoFinestraAllargata(dopo) {
  return `Window enlarged to ${Number(dopo).toLocaleString('en-US')} tokens to fit the conversation.`;
}

/**
 * La velocità di generazione media del motore, dai CONTATORI di `/metrics`: token generati / secondi spesi a generarli, da quando il
 * processo è partito (llama.cpp `server-task.cpp`, `tokens_predicted_total` e `tokens_predicted_seconds_total`).
 * ⛔ Revisione blocco 5 (A-8): non dalla misura `predicted_tokens_seconds`, che è la media fra DUE letture di `/metrics` e si azzera a ogni
 *   lettura («averaged over the window between two scrapes», `server-context.cpp:5600-5626`): con un'altra lettura appena prima valeva 0,
 *   cioè «ignota», e si cresceva anche su un motore lento.
 */
export function velocitaDalleMetriche(testo) {
  const t = typeof testo === 'string' ? testo : '';
  const contatore = (nome) => {
    const trovato = new RegExp(`^llamacpp:${nome}\\s+([0-9.eE+-]+)\\s*$`, 'mu').exec(t);
    return trovato ? Number(trovato[1]) : Number.NaN;
  };
  const token = contatore('tokens_predicted_total');
  const secondi = contatore('tokens_predicted_seconds_total');
  if (!Number.isFinite(token) || !Number.isFinite(secondi) || token <= 0 || secondi <= 0) return null;
  return token / secondi;
}

async function leggiJson(percorso) {
  try { return JSON.parse(await readFile(percorso, 'utf8')); } catch { return null; }
}

async function scriviJsonAtomico(percorso, valore) {
  await mkdir(dirname(percorso), { recursive: true });
  const temporaneo = `${percorso}.${process.pid}.tmp`;
  await writeFile(temporaneo, `${JSON.stringify(valore, null, 2)}\n`, 'utf8');
  await rename(temporaneo, percorso);
}

/**
 * @param {object} opzioni
 * @param {{ status: () => any, request: (p: string, o?: object) => Promise<Response> }} opzioni.supervisor
 * @param {{ load: (o: object) => Promise<any>, unload: () => Promise<any>, riapri?: (modelId: string) => Promise<any> }} opzioni.motore
 *   il runtime llama.cpp (start/stop); `riapri` = l'avvio di sempre del server (finestra ricordata, poi quella di serie col fitter), per
 *   rimettere il motore com'era quando la finestra nuova non entra
 * @param {(modelId: string) => Promise<{ modelPath: string, nome?: string } | null>} opzioni.modello
 * @param {(percorso: string) => Promise<{ trainedContext?: number, kvCacheBytesPerToken?: number }>} opzioni.leggiIntestazione
 * @param {() => Promise<{ memory?: { freeBytes?: number } }>} opzioni.misuraMacchina
 * @param {number} [opzioni.gpuLayers] con la scheda la cache sta in VRAM: la RAM libera non dice niente, decide il caricamento
 * @param {string} opzioni.cartella dove stanno `finestra-piena.json` (la scelta) e `finestre-preferite.json` (le finestre allargate)
 */
/**
 * 27/10/2026 (suite del browser sul candidato del blocco 9): la SCELTA è una preferenza in un file, e vive anche senza motore locale (un
 * server di prova, un PC senza il binario). Prima stava solo dentro `creaFinestraCheCresce`, che nasce col supervisore: senza motore la
 * rotta non aveva niente da leggere e rispondeva 500 a ogni apertura delle Impostazioni.
 * @param {{ cartella: string }} opzioni dove sta `finestra-piena.json`
 */
export function creaSceltaFinestraPiena({ cartella }) {
  const fileScelta = join(cartella, 'finestra-piena.json');
  async function scelta() {
    const letta = (await leggiJson(fileScelta))?.quandoLaFinestraSiRiempie;
    return SCELTE_FINESTRA_PIENA.includes(letta) ? letta : SCELTA_DI_SERIE;
  }
  async function salvaScelta(valore) {
    if (!SCELTE_FINESTRA_PIENA.includes(valore)) throw Object.assign(new Error(`"${valore}" is not a choice: use ${SCELTE_FINESTRA_PIENA.join(', ')}.`), { code: 'INVALID_REQUEST' });
    await scriviJsonAtomico(fileScelta, { quandoLaFinestraSiRiempie: valore });
    return valore;
  }
  return { scelta, salvaScelta };
}

export function creaFinestraCheCresce({ supervisor, motore, modello, leggiIntestazione, misuraMacchina, gpuLayers = 0, cartella }) {
  const filePreferite = join(cartella, 'finestre-preferite.json');
  let inCorso = null; // un allargamento alla volta: chi arriva dopo aspetta questo
  const { scelta, salvaScelta } = creaSceltaFinestraPiena({ cartella });

  async function preferite() {
    const lette = await leggiJson(filePreferite);
    return lette && typeof lette === 'object' && !Array.isArray(lette) ? lette : {};
  }

  /** La finestra allargata ricordata per questo modello, o null: `load()` la usa al prossimo avvio. */
  async function finestraPreferita(modelId) {
    const n = (await preferite())[modelId];
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }

  async function ricorda(modelId, finestra) {
    const tutte = await preferite();
    if (finestra === null) delete tutte[modelId]; else tutte[modelId] = finestra;
    await scriviJsonAtomico(filePreferite, tutte);
  }

  /** Il motore sta lavorando su un'altra richiesta? (`/slots` di llama-server; se non risponde, si dà per occupato). */
  async function occupato() {
    try {
      const risposta = await supervisor.request('/slots', { method: 'GET', signal: AbortSignal.timeout(3_000) });
      if (!risposta.ok) return risposta.status !== 501 && risposta.status !== 404; // rotta spenta (`--no-slots`): non si sa, ma non si inventa
      const posti = await risposta.json();
      return Array.isArray(posti) && posti.some((p) => p?.is_processing === true);
    } catch { return true; }
  }

  /**
   * `forza`: l'ha chiesto la persona (la carta di «Chiedimi», il pulsante) o il modello dietro la sua carta ⇒ la scelta di serie non
   * conta. Senza `forza`: «riassumi» non apre mai; «chiedi» fa i conti e, se allargare si PUÒ, torna `motivo: 'chiedi'` coi numeri
   * (la carta li dice prima del clic); se non si può, non c'è niente da chiedere e si riassume come sempre.
   */
  /* Il contesto addestrato per file: l'intestazione non cambia, e `puoCrescere` si chiede a ogni soglia. */
  const intestazioni = new Map();
  async function intestazioneDi(modelPath) {
    if (!intestazioni.has(modelPath)) {
      let letta = null;
      try { letta = await leggiIntestazione(modelPath) ?? null; } catch { /* resta ignota */ }
      if (letta) intestazioni.set(modelPath, letta);
      return letta ?? {};
    }
    return intestazioni.get(modelPath);
  }

  /*
   * Revisione blocco 4 (26/10/2026): una finestra che NON è entrata non si riprova a ogni soglia — ogni tentativo sono due ricaricamenti
   * del motore (quella nuova che fallisce, e il ritorno). Per modello, finché il server vive: un gradino da qui in su non si tenta più.
   */
  const tettiProvati = new Map();
  const oltreIlProvato = (modelId, finestra) => tettiProvati.has(modelId) && finestra >= tettiProvati.get(modelId);

  /** La velocità di generazione misurata dal motore, o null se non la dice (`--metrics` spento, motore vecchio). */
  async function velocita() {
    try {
      const risposta = await supervisor.request('/metrics', { method: 'GET', signal: AbortSignal.timeout(3_000) });
      return risposta.ok ? velocitaDalleMetriche(await risposta.text()) : null;
    } catch { return null; }
  }

  /**
   * `proattiva` (A1-1): la chiama la soglia del riassunto, PRIMA che la conversazione trabocchi ⇒ si sale di un gradino della scala,
   * e solo se il motore genera almeno a `VELOCITA_MINIMA_TOKEN_S`. Senza: è il soccorso di una richiesta che il motore ha già
   * rifiutato (400 «exceeds the available context size») ⇒ si apre quanto basta a farla entrare, col margine.
   */
  /*
   * `senzaPersona` (revisione blocco 5, A-4; owner 26/10 notte, consigliata): automazioni, passi dei Workflow e sotto-agenti — nessuno può
   *   rispondere a una carta, quindi «Chiedimi» vale «Riassumi» (com'era prima della finestra che cresce). Che possano riaprire il motore
   *   con «Allarga» lo decide chi li chiama (il registro: solo se nessun'altra conversazione lo sta usando).
   */
  async function allargaOra({ modelId, servono, forza = false, proattiva = false, senzaPersona = false }) {
    const scelta_ = forza ? 'allarga' : await scelta();
    const voluta = senzaPersona && scelta_ === 'chiedi' ? 'riassumi' : scelta_;
    if (voluta === 'riassumi') return { ok: false, motivo: 'scelta' };
    const stato = supervisor.status?.();
    if (stato?.state !== 'ready' || stato.modelId !== modelId) return { ok: false, motivo: 'motore-non-pronto' };
    const prima = Number(stato.windowTokens);
    const voce = await modello(modelId);
    if (!voce?.modelPath || !Number.isSafeInteger(prima) || prima <= 0) return { ok: false, motivo: 'finestra-ignota' };
    /* Un'altra richiesta l'ha già allargata mentre questa aspettava: basta rimandarla, senza riaprire (e senza una seconda riga). */
    if (!proattiva && servono * MARGINE <= prima) return { ok: true, giaAllargata: true, prima, dopo: prima, nome: voce.nome ?? modelId };
    /* ⛔ Revisione blocco 5 (A-1): anche alla soglia si rifanno i conti DOPO l'attesa — due crescite insieme (due conversazioni sullo stesso
       modello, o il fine giro mentre il giro dopo è già partito) ricaricavano il motore due volte, la seconda con la conversazione già
       al 51% della finestra nuova. Sotto la soglia di adesso non serve niente: si torna come «già allargata», senza riaprire. */
    if (proattiva && servono < prima * FRAZIONE_FINESTRA) return { ok: true, giaAllargata: true, prima, dopo: prima, nome: voce.nome ?? modelId };
    const intestazione = await intestazioneDi(voce.modelPath);
    const massimo = Number(intestazione.trainedContext) || 0;
    /* Revisione blocco 4: senza il massimo addestrato non si sa fin dove si può salire — si riassume come prima, invece di tentare a caso */
    if (!(massimo > 0)) return { ok: false, motivo: 'massimo-ignoto' };
    if (servono > massimo) return { ok: false, motivo: 'oltre-il-massimo', massimo };
    const perIlMessaggio = finestraDaAprire({ servono, prima, massimo });
    const gradino = proattiva ? prossimoGradino({ prima, massimo }) : null;
    const dopo = proattiva ? (gradino === null ? null : Math.max(gradino, perIlMessaggio ?? 0)) : perIlMessaggio;
    if (dopo === null) return { ok: false, motivo: 'gia-al-massimo', massimo };
    if (oltreIlProvato(modelId, dopo)) return { ok: false, motivo: 'memoria', giaProvata: tettiProvati.get(modelId) };
    const perToken = Number(intestazione.kvCacheBytesPerToken);
    const memoriaInPiu = Number.isFinite(perToken) && perToken > 0 ? Math.round(perToken * (dopo - prima)) : null;
    if (!(gpuLayers > 0) && memoriaInPiu !== null) {
      const liberi = Number((await misuraMacchina().catch(() => null))?.memory?.freeBytes);
      if (Number.isFinite(liberi) && memoriaInPiu > liberi * QUOTA_DELLA_MEMORIA) return { ok: false, motivo: 'memoria' };
    }
    if (voluta === 'chiedi') return { ok: false, motivo: 'chiedi', prima, dopo, massimo, memoriaInPiu, nome: voce.nome ?? modelId };
    if (proattiva) {
      const tokenAlSecondo = await velocita();
      if (tokenAlSecondo !== null && tokenAlSecondo < VELOCITA_MINIMA_TOKEN_S) return { ok: false, motivo: 'lento', velocita: tokenAlSecondo };
    }
    if (await occupato()) return { ok: false, motivo: 'motore-occupato' };
    await motore.unload();
    try {
      await motore.load({ modelId, modelPath: voce.modelPath, contextLength: dopo });
    }
    catch (errore) {
      /* La finestra nuova non entra (di solito RUNTIME_OUT_OF_MEMORY sulla scheda): si rimette il motore COME ERA, e si torna al
         riassunto. ⛔ Revisione blocco 4 (A-2): «com'era» è la strada dell'avvio di prima (`motore.riapri`: finestra ricordata, poi
         quella di serie col fitter), non `contextLength: prima` — su un MoE la finestra detta prendeva `-ngl 99` e non entrava più
         nemmeno lei. E un ritorno che fallisce non lancia: il motore resta spento, e la prossima richiesta lo riaccende da sé. */
      tettiProvati.set(modelId, Math.min(dopo, tettiProvati.get(modelId) ?? Number.POSITIVE_INFINITY));
      const motivo = errore?.code === 'RUNTIME_OUT_OF_MEMORY' ? 'memoria' : 'riapertura-fallita';
      try { await motore.unload(); } catch { /* già spento */ }
      try {
        if (typeof motore.riapri === 'function') await motore.riapri(modelId);
        else await motore.load({ modelId, modelPath: voce.modelPath, contextLength: prima });
      } catch { return { ok: false, motivo, spento: true }; }
      return { ok: false, motivo };
    }
    const vera = Number(supervisor.status?.()?.windowTokens) || dopo;
    await ricorda(modelId, vera).catch(() => { /* la riga resta vera anche se il ricordo non si scrive: al riavvio si riparte dal solito */ });
    return { ok: true, prima, dopo: vera, massimo, memoriaInPiu, nome: voce.nome ?? modelId, ...(proattiva ? { proattiva: true } : {}) };
  }

  /**
   * A1-1: c'è un gradino da salire adesso? Senza ricaricare niente — la chiedono il kernel (per non preparare un riassunto in sottofondo
   * che la crescita renderebbe inutile) e il registro a fine giro. Vale anche con «Chiedimi»: lì la crescita si chiede alla persona,
   * quindi un riassunto fatto senza di lei sarebbe proprio ciò che non vuole.
   */
  async function puoCrescere(modelId, { senzaPersona = false } = {}) {
    const voluta = await scelta();
    if (voluta === 'riassumi' || (senzaPersona && voluta === 'chiedi')) return false; // A-4: senza persona «Chiedimi» vale «Riassumi»
    const stato = supervisor.status?.();
    if (stato?.state !== 'ready' || stato.modelId !== modelId) return false;
    const prima = Number(stato.windowTokens);
    const voce = await modello(modelId).catch(() => null);
    if (!voce?.modelPath || !Number.isSafeInteger(prima) || prima <= 0) return false;
    const massimo = Number((await intestazioneDi(voce.modelPath)).trainedContext) || 0;
    const gradino = prossimoGradino({ prima, massimo });
    return gradino !== null && !oltreIlProvato(modelId, gradino);
  }

  /** Per l'attrezzo del modello («status»): il modello locale acceso, la sua finestra, il massimo addestrato, la scelta. null se spento. */
  async function statoAttuale() {
    const stato = supervisor.status?.();
    if (stato?.state !== 'ready' || !stato.modelId) return null;
    const voce = await modello(stato.modelId).catch(() => null);
    let massimo = null;
    if (voce?.modelPath) { try { massimo = Number((await leggiIntestazione(voce.modelPath))?.trainedContext) || null; } catch { /* resta ignoto */ } }
    return { modelId: stato.modelId, nome: voce?.nome ?? stato.modelId, finestra: Number(stato.windowTokens) || null, massimo, scelta: await scelta() };
  }

  return {
    scelta,
    salvaScelta,
    statoAttuale,
    puoCrescere,
    finestraPreferita,
    dimenticaPreferita: (modelId) => ricorda(modelId, null),
    /**
     * L'avvio con la finestra allargata l'ultima volta (`carica(finestra)`). ⛔ Revisione blocco 4 (A-5): se oggi non parte, si dimentica
     * per QUALUNQUE guasto — sul processore una cache che non sta più nella RAM fa morire llama-server con «failed to allocate buffer»,
     * che il supervisore chiama RUNTIME_PROCESS_FAILED (la memoria la riconosce solo su Vulkan), e la finestra restava ricordata: il
     * modello non ripartiva più, a nessun avvio. Dimenticarla costa al più una finestra più piccola; tenerla, un modello che non parte.
     * Solo l'annullamento risale com'è. → `{ avviato: true, esito }` | `{ avviato: false, dimenticata?, errore? }`.
     */
    async conLaPreferita(modelId, carica) {
      const preferita = await finestraPreferita(modelId).catch(() => null);
      if (!preferita) return { avviato: false };
      try { return { avviato: true, esito: await carica(preferita) }; }
      catch (errore) {
        if (errore?.code === 'RUNTIME_START_CANCELLED' || errore?.name === 'AbortError') throw errore;
        await ricorda(modelId, null).catch(() => { /* resta: il prossimo guasto riprova a dimenticarla */ });
        return { avviato: false, dimenticata: preferita, errore };
      }
    },
    /** Un allargamento alla volta; chi arriva mentre uno è in corso ne aspetta l'esito e poi rifà i conti sullo stato nuovo. */
    async allarga(richiesta) {
      while (inCorso) { try { await inCorso; } catch { /* l'esito di un altro non è il nostro */ } }
      inCorso = allargaOra(richiesta);
      try { return await inCorso; } finally { inCorso = null; }
    },
    /** Per chi deve aspettare che il motore torni pronto (`avviaLocale`). */
    attendi: async () => { if (inCorso) { try { await inCorso; } catch { /* idem */ } } },
  };
}
