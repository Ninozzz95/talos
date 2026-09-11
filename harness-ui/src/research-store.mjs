/**
 * research-store.mjs — FASE N, ottavo sistema, "Fetta onesta" di Deep
 * Research (owner, AskUserQuestion 30/8: "Fetta onesta (consigliato)").
 * Letto alla fonte PRIMA di disegnare questa fetta: `mobile/src/lib/
 * research/*` (21 file, macchina a stati event-sourced — `researchRun.ts`
 * — con verifica/indipendenza/citazioni/approvazione piano) e il
 * CONTRATTO vero del tool, `mobile/src/lib/tools/researchTools.ts` (8
 * tool, letti verbatim, non presunti). L'owner ha scelto esplicitamente
 * la fetta scoperta: stesso CONTRATTO (nomi/schema/semantica dei tool),
 * esecuzione riusando la macchina GIÀ COSTRUITA di Harness Desktop
 * (talosLavora via avviaESegui, l'abort già usato da ferma() per la
 * pausa, resume() per la ripresa, library-store.mjs per il rapporto
 * finale) invece del motore event-sourced mobile (pianificazione a più
 * linee di indagine, verifica/indipendenza/citazioni/approvazione piano)
 * — dichiarato debito, non perso in silenzio.
 *
 * ⭐⭐⭐ Deep Research è PER-PROGETTO, non GLOBALE come Notes/Tasks/Memory
 * — decisione DIVERSA dagli ultimi tre sistemi, verificata non presunta:
 * il tool mobile stesso dice "i rapporti di ricerca SONO file di
 * Libreria" (`library_list` li trova, li elenca come documenti — vedi
 * il commento di testa di researchTools.ts) — e la Libreria desktop è
 * PER-PROGETTO (FASE N, prima fetta: `.harness-ui-library/` dentro il
 * workspace, mai cross-chat come sul mobile). Una ricerca avviata
 * mentre si lavora sul progetto C deve finire nella Libreria di QUEL
 * progetto, raggiungibile dalle sessioni future sullo STESSO progetto —
 * non in un limbo globale che nessun `library_list` di progetto
 * vedrebbe mai. Storage quindi accanto a `.harness-ui-library/`, dentro
 * il workspace: `.harness-ui-research/<id>.json`, un file per ricerca
 * (mai un array riscritto — la classe di bug già evitata altrove).
 *
 * ⛔⛔⛔ Deliberatamente SENZA lo stato "sta girando ORA" come campo:
 * mobile stesso separa "il giornale" (`sources.list()`) da "sta girando
 * adesso" (`sources.isRunning(id)`, calcolato al volo — vedi
 * `TalosResearchToolSources.isRunning` in researchTools.ts) — questo
 * store tiene SOLO `terminata` (null finché non è definitivamente
 * conclusa: 'done'|'failed'|'cancelled'). "In corso" vs "in pausa" si
 * derivano DAL VIVO in research-orchestrator.mjs confrontando
 * `terminata` con lo stato reale della sessione in session-registry —
 * per costruzione non può disallinearsi, mai duplicato qui.
 *
 * Stile DI: stesso pattern di library-store.mjs/notes-store.mjs —
 * funzioni async con `deps` opzionali per i test, mai un vero
 * filesystem mockato altrove.
 */
import { promises as fsp } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export class ResearchStoreError extends Error {
  constructor(message, code = 'RESEARCH_INVALID') {
    super(message);
    this.name = 'ResearchStoreError';
    this.code = code;
  }
}

export const CARTELLA_RICERCA = '.harness-ui-research';

/*
 * ⭐⭐⭐ L2 (11/09/2026) — GLI STATI TERMINALI DI UNA RICERCA, e il perché ce ne vogliono sei.
 *
 * Prima di oggi erano tre (`done`/`failed`/`cancelled`) e `done` si calcolava da `comeFinita`
 * del kernel: cioè dal PROCESSO («la corsa è finita da sola»), mai dal PRODOTTO («c'è un
 * rapporto»). Sulla sessione `d2a453a8` del 11/09 le due cose divergevano — corsa riuscita,
 * rapporto inesistente — e la sezione mostrava un timbro verde su una scusa di 290 byte.
 *
 * ⛔ `failed` da solo non bastava per la ragione opposta: metteva sotto una parola sola tre
 *   guasti che si curano in modo DIVERSO. «Bloccata dal permesso» si cura cambiando il
 *   permesso (ed è il guasto di stasera), «giri esauriti» si cura alzando i giri o
 *   snellendo il contesto (è un guasto già noto e misurato sul banco), «senza rapporto» si
 *   cura ri-chiedendo il deposito. Un nome solo per tre cure diverse non è azionabile.
 *
 * ⛔ E i valori vivono QUI, non in una stringa sparsa per il codice: il frontend li legge
 *   come contratto (`stato` di ogni voce), e una lista scritta due volte è una lista che
 *   diverge.
 */
export const STATI_TERMINATI = Object.freeze([
  'done',
  'failed',
  'cancelled',
  'senza-rapporto',
  'bloccata-dal-permesso',
  'giri-esauriti',
]);

function percorsoVoce(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, `${id}.json`);
}

/**
 * @returns {Promise<Array<object>>} — [] se la cartella non esiste ancora
 * (mai un errore: nessuna ricerca avviata su questo progetto è uno
 * stato onesto, non un guasto). Più recenti prime, come `research_list`
 * mobile ("«che ricerche ho fatto» quasi sempre vuol dire «le ultime»").
 */
export async function elencaRicerche({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaRicerca = join(cartella, CARTELLA_RICERCA);
  let file;
  try {
    file = await readdirFn(cartellaRicerca);
  } catch {
    return [];
  }
  const ricerche = [];
  for (const nomeFile of file) {
    if (!nomeFile.endsWith('.json')) continue;
    try {
      const grezzo = await readFileFn(join(cartellaRicerca, nomeFile), 'utf8');
      ricerche.push(JSON.parse(grezzo));
    } catch {
      // ⛔ una voce corrotta non impedisce di vedere le altre — stesso principio di leggiRegistro (session-store.mjs) su un'ultima riga tollerata.
    }
  }
  ricerche.sort((a, b) => String(b.avviataAlle || '').localeCompare(String(a.avviataAlle || '')));
  return ricerche;
}

/** @returns {Promise<object|null>} — null se l'id non esiste. */
export async function leggiRicerca({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let grezzo;
  try {
    grezzo = await readFileFn(percorsoVoce(cartella, id), 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ResearchStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'RESEARCH_READ_FAILED');
  }
  return JSON.parse(grezzo);
}

/**
 * Crea la voce di metadata — chiamata da research-orchestrator.mjs SUBITO
 * dopo che avviaESegui ha già assegnato un sessionId: l'id di una
 * ricerca È il sessionId della sessione che la esegue (nessuna doppia
 * mappatura ricerca→sessione, un solo spazio di identità, mai
 * disallineabile).
 */
export async function creaRicerca({ cartella, id, domanda, profondita, padreId = null, nome = null }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  if (typeof id !== 'string' || id.length === 0) {
    throw new ResearchStoreError('Una ricerca vuole un id', 'RESEARCH_INVALID');
  }
  if (typeof domanda !== 'string' || domanda.trim().length === 0) {
    throw new ResearchStoreError('Una ricerca vuole una domanda', 'RESEARCH_INVALID');
  }
  const cartellaRicerca = join(cartella, CARTELLA_RICERCA);
  await mkdirFn(cartellaRicerca, { recursive: true });
  const adesso = new Date().toISOString();
  const voce = {
    id, domanda: domanda.trim(), profondita: profondita || 'deep',
    titolo: null, avviataAlle: adesso, aggiornataAlle: adesso,
    terminata: null, reportLibraryId: null,
    /*
     * ⭐ L1/§6.6 (11/09) — DUE campi nuovi, entrambi `null` per ogni voce nata prima di oggi
     * (il lettore li normalizza, vedi `research-orchestrator.elenca`): non serve nessuna
     * migrazione, e nessuna riga già pagata viene riscritta.
     *
     * `padreId`: la sessione che ha chiamato `research_start`. Il 11/09 la ricerca
     * `d2a453a8` risultava `padreId:null` e all'owner è sembrata «una sessione nuova»: lo
     * era davvero, anche nel registro. Qui il legame è persistito ANCHE sulla metadata della
     * ricerca, non solo sulla voce di sessione, perché la sezione «Ricerca approfondita» la
     * legge dal disco anche dopo un riavvio, quando la voce di sessione non c'è più.
     *
     * `nome`: la domanda troncata — l'etichetta umana della riga in elenco. Stessa ragione:
     * il nome della SESSIONE vive in memoria (`voce.nome`), questo sopravvive al riavvio.
     */
    padreId: typeof padreId === 'string' && padreId.length > 0 ? padreId : null,
    nome: typeof nome === 'string' && nome.trim().length > 0 ? nome.trim() : null,
  };
  await writeFileFn(percorsoVoce(cartella, id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/**
 * Aggiorna campi (titolo/terminata/reportLibraryId) — `null` se l'id non
 * esiste. `undefined` per un campo significa "non toccarlo" (mai
 * confuso con `null`, un valore esplicito — stesso principio già
 * imparato sul clamping di `limit` in Notes: non trattare "assente"
 * come "falso"). Mai il campo "in corso": si deriva dal vivo (vedi la
 * doc di testa), questa funzione non può farlo disallineare.
 *
 * ⭐⭐⭐ L2 (11/09) — `terminata` non è più solo `'done'|'failed'|'cancelled'`: vedi
 * `STATI_TERMINATI` qui sotto. Questa funzione NON valida il valore, di proposito — è lo
 * stesso principio già in uso per `titolo`: lo store scrive ciò che il chiamante decide, e
 * la macchina degli stati vive tutta in `research-orchestrator.mjs`, in un posto solo.
 */
export async function aggiornaRicerca({ cartella, id, titolo, terminata, reportLibraryId, conclusaAlle, ultimoMessaggio, motivoDettaglio }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  let voce;
  try {
    voce = JSON.parse(await readFileFn(percorsoVoce(cartella, id), 'utf8'));
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ResearchStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'RESEARCH_READ_FAILED');
  }
  const aggiornata = {
    ...voce,
    titolo: titolo !== undefined ? titolo : voce.titolo,
    terminata: terminata !== undefined ? terminata : voce.terminata,
    reportLibraryId: reportLibraryId !== undefined ? reportLibraryId : voce.reportLibraryId,
    /*
     * ⭐ L2 (11/09) — TRE campi nuovi, stessa disciplina «undefined = non toccarlo» degli altri.
     * `conclusaAlle`: l'istante in cui la ricerca è finita DAVVERO. Prima si leggeva
     *   `aggiornataAlle`, che però si muove a ogni rinomina: una ricerca rinominata sembrava
     *   essersi conclusa il giorno della rinomina.
     * `ultimoMessaggio`: ciò che il modello ha detto alla fine — un ALLEGATO, mai il rapporto.
     * `motivoDettaglio`: il pezzo variabile della frase umana (es. «il rapporto non elenca
     *   nessuna fonte»), perché la frase la compone il lettore e il dettaglio lo sa solo chi ha
     *   riletto il file in quel momento.
     */
    conclusaAlle: conclusaAlle !== undefined ? conclusaAlle : (voce.conclusaAlle ?? null),
    ultimoMessaggio: ultimoMessaggio !== undefined ? ultimoMessaggio : (voce.ultimoMessaggio ?? null),
    motivoDettaglio: motivoDettaglio !== undefined ? motivoDettaglio : (voce.motivoDettaglio ?? null),
    aggiornataAlle: new Date().toISOString(),
  };
  await writeFileFn(percorsoVoce(cartella, id), JSON.stringify(aggiornata, null, 2), 'utf8');
  return aggiornata;
}

/**
 * Elimina SOLO la metadata — il rapporto in Libreria (se esiste) è
 * responsabilità del CHIAMANTE (research-orchestrator.mjs, che conosce
 * `reportLibraryId` PRIMA di chiamare questa funzione e compone le due
 * cancellazioni, stesso principio "questo file non sa COME" già in uso
 * altrove). `null` se l'id non esiste già (idempotente, mai
 * un'eccezione — stesso principio di `eliminaVoce` in library-store.mjs,
 * "It may already be gone").
 */
export async function eliminaRicerca({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const rmFn = deps.rmFn ?? fsp.rm;
  try {
    await readFileFn(percorsoVoce(cartella, id), 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ResearchStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'RESEARCH_READ_FAILED');
  }
  await rmFn(percorsoVoce(cartella, id), { force: true });
  return { id };
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * L1+L2 (11/09/2026) — LA CARTELLA DELLA RICERCA, IL RAPPORTO E LA SUA FORMA
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⛔ Perché esiste, riprodotto sui dati veri (sessione `d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35`
 *   del 4174, 11/09, ore 18:56-19:00): la ricerca partiva `permessi:'Read only'`
 *   (`research-orchestrator.mjs:170`, scritto a mano), `document_create` le veniva offerto lo
 *   stesso e negato a runtime (`REFUSED. la sessione è in sola lettura…`, due volte), e «il
 *   rapporto» era l'ULTIMO MESSAGGIO con del testo — cioè 290 byte di scusa, salvati in
 *   Libreria come `Research - ….md` e timbrati `terminata:'done'`. 9 `web_search`, 14 `naviga`,
 *   484.171 token di ingresso pagati, e il documento permanente era la frase con cui il modello
 *   si giustificava per non averlo scritto. Nessun errore da nessuna parte.
 *
 * ⇒ Il rapporto smette di essere «l'ultima frase» e diventa un ARTEFATTO su disco, depositato
 *   da un attrezzo dedicato (`research_deposit`) dentro la cartella della ricerca. Questo file
 *   sa DOVE vive e CHE FORMA MINIMA deve avere; non sa chi lo scrive.
 *
 * ⭐ Ricerca web PRIMA di scrivere (obbligo owner), fonte + data:
 *   - «Agent Safety Is Action Alignment», Li & Zhao — arXiv:2606.28739, 27/06/2026: il minimo
 *     privilegio va imposto «outside the model at the action boundary», non con l'allineamento
 *     del modello. ⇒ il confine è il cancello del kernel; la forma del rapporto qui sotto è un
 *     controllo di PRODOTTO, mai il confine di sicurezza.
 *   - «When Lower Privileges Suffice: Investigating Over-Privileged Tool Selection in LLM
 *     Agents», Yang, Bu, Yi et al. — arXiv:2606.20023, 18/06/2026 (v2 07/07): la scelta di un
 *     attrezzo a privilegio più alto quando ne basterebbe uno più basso è comune «and is further
 *     amplified by transient failures». ⇒ è ESATTAMENTE la corsa di stasera: dopo il primo
 *     REFUSED il modello ha insistito con `document_create` invece di cercare una via più
 *     stretta. La cura non è un prompt migliore («prompt-level controls provide only limited
 *     mitigation»): è togliere dalla lista l'attrezzo più largo e offrirne uno più stretto.
 */

/** La cartella di UNA ricerca: `<progetto>/.harness-ui-research/<id>/`. Mai l'id nudo dal modello — vedi `idRicercaValido`. */
export function cartellaDellaRicerca(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id);
}

/** Il rapporto di UNA ricerca. Un nome solo, deciso qui: chi scrive e chi rilegge non possono divergere. */
export const NOME_RAPPORTO = 'rapporto.md';

export function percorsoRapporto(cartella, id) {
  return join(cartellaDellaRicerca(cartella, id), NOME_RAPPORTO);
}

/**
 * ⛔ Un id di ricerca è UN SOLO segmento di percorso, e solo caratteri che non possono
 * attraversare una cartella: niente `/`, niente backslash, niente `:`, niente `.`/`..`. È la
 * stessa disciplina di `resolve`+`startsWith` che il kernel applica al percorso finale, ma
 * spostata a monte, sul DATO — due controlli indipendenti sullo stesso confine, non uno
 * ripetuto. (Gli UUID di `randomUUID()` passano; qualunque tentativo di uscire no.)
 */
export function idRicercaValido(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/**
 * `resolve` + `startsWith(radice + sep)` — la STESSA forma del controllo di
 * `livello-scrittura-area` nel kernel (`talosHarness.mjs`), scritta una volta sola qui perché
 * la usano sia il deposito sia i test. ⛔ `radice` assente non è un «vince tutto»: senza una
 * radice da controllare un percorso non è verificabile, quindi è FUORI.
 */
export function dentroLaRadice(radice, percorso) {
  if (typeof radice !== 'string' || radice.length === 0) return false;
  if (typeof percorso !== 'string' || percorso.length === 0) return false;
  const r = resolve(radice);
  const p = resolve(percorso);
  return p === r || p.startsWith(r + sep);
}

/**
 * Salva il rapporto di una ricerca — usato dall'attrezzo `research_deposit`.
 * ⛔ Il percorso NON viene mai dal modello: si ricostruisce qui da `cartella` (del progetto) e
 * `id` (della ricerca, che il server conosce). Il controllo `dentroLaRadice` resta comunque,
 * in seconda battuta: un cancello si prova anche quando la prima difesa dovrebbe bastare.
 * @returns {Promise<{percorso:string, byte:number}>}
 */
export async function scriviRapporto({ cartella, id, testo }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  if (!idRicercaValido(id)) throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  if (typeof testo !== 'string' || testo.trim().length === 0) {
    throw new ResearchStoreError('Un rapporto vuole del testo', 'RESEARCH_INVALID');
  }
  const radice = cartellaDellaRicerca(cartella, id);
  const percorso = percorsoRapporto(cartella, id);
  if (!dentroLaRadice(radice, percorso)) {
    throw new ResearchStoreError(`${percorso} non risolve dentro ${radice}`, 'RESEARCH_INVALID');
  }
  await mkdirFn(radice, { recursive: true });
  await writeFileFn(percorso, testo, 'utf8');
  return { percorso, byte: Buffer.byteLength(testo, 'utf8') };
}

/** @returns {Promise<string|null>} — il testo del rapporto, `null` se non esiste (mai un'eccezione per un'assenza). */
export async function leggiRapporto({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  if (!idRicercaValido(id)) return null;
  try {
    return await readFileFn(percorsoRapporto(cartella, id), 'utf8');
  } catch {
    return null;
  }
}

/**
 * ⭐⭐⭐ LA FORMA MINIMA DI UN RAPPORTO — il cancello di consegna del disegno §6.5.
 *
 * ⛔ È DICHIARATAMENTE MINIMA, e il perché sta scritto qui invece che in una nota: il record
 *   recintato vero (piano, linee, affermazioni con verdetto, fonti con citazione) arriva da
 *   `src/research/report.mjs`, che un altro agente sta portando dal mobile in parallelo. Fino
 *   ad allora questa funzione controlla TRE cose sole, e `research-orchestrator.mjs` accetta un
 *   `rileggiRapportoFn` iniettabile perché il giorno in cui quel record esiste si cambia il
 *   PUNTO DI INNESTO, non la macchina degli stati.
 *
 * Le tre cose, e perché proprio queste:
 *   1. un'INTESTAZIONE (una riga che comincia con `#`) — un rapporto ha un titolo; una scusa no;
 *   2. almeno un'AFFERMAZIONE — una riga di prosa fuori dalla sezione fonti;
 *   3. almeno una FONTE — un URL http(s) dentro una sezione fonti/sources/riferimenti.
 *
 * ⛔ Il punto 3 è quello che la scusa di stasera non poteva superare in nessun modo, ed è anche
 *   quello che la ricerca accademica indica come la misura da mostrare: «Sci-MMR»
 *   (arXiv:2609.11243, 10/09/2026) misura che l'accuratezza della risposta supera di oltre 20
 *   punti il recupero completo delle PROVE — cioè si risponde bene senza avere le prove. Un
 *   rapporto senza una fonte non è un rapporto corto: è un rapporto senza il pezzo che conta.
 *
 * ⛔ NON controlla la lunghezza minima e NON giudica la qualità: un rapporto breve ma
 *   documentato passa, ed è giusto così. Il cancello dice «c'è un artefatto rileggibile», non
 *   «è un buon artefatto» — confonderli produrrebbe la bugia opposta.
 *
 * @returns {{ok:boolean, intestazione:string|null, affermazioni:number, fonti:string[], motivo:string|null}}
 */
export function rileggiRapportoMinimo(testo) {
  if (typeof testo !== 'string' || testo.trim().length === 0) {
    return { ok: false, intestazione: null, affermazioni: 0, fonti: [], motivo: 'il rapporto è vuoto' };
  }
  const righe = testo.split(/\r?\n/);
  const rigaTitolo = righe.find((r) => /^#{1,6}\s+\S/.test(r.trim()));
  const intestazione = rigaTitolo ? rigaTitolo.trim().replace(/^#{1,6}\s+/, '') : null;
  /*
   * ⛔ «Dentro la sezione fonti» si decide riga per riga, non cercando gli URL ovunque: un URL
   * citato in mezzo alla prosa è una citazione, non la bibliografia — e un rapporto che elenca
   * le sue fonti è esattamente ciò che «Cited but Not Verified» (arXiv:2605.06635, 07/05/2026)
   * misura come il pezzo che gli agenti di ricerca profonda sbagliano di più: la fonte sostiene
   * davvero l'affermazione solo il 39-77% delle volte. Verificarle richiede prima di AVERLE.
   */
  const INTESTAZIONE_FONTI = /^#{1,6}\s*(fonti|sources|riferimenti|references|bibliografia)\b/i;
  let inFonti = false;
  const fonti = [];
  let affermazioni = 0;
  for (const grezza of righe) {
    const riga = grezza.trim();
    if (/^#{1,6}\s+\S/.test(riga)) {
      inFonti = INTESTAZIONE_FONTI.test(riga);
      continue;
    }
    if (riga.length === 0) continue;
    if (inFonti) {
      const url = riga.match(/https?:\/\/[^\s)<>\]"']+/g);
      if (url) fonti.push(...url);
      continue;
    }
    // una riga di prosa: non un separatore orizzontale, non una riga vuota.
    if (/^[-*_=\s|]+$/.test(riga)) continue;
    affermazioni += 1;
  }
  if (!intestazione) return { ok: false, intestazione: null, affermazioni, fonti, motivo: 'il rapporto non ha un\'intestazione' };
  if (affermazioni === 0) return { ok: false, intestazione, affermazioni, fonti, motivo: 'il rapporto non contiene nessuna affermazione' };
  if (fonti.length === 0) return { ok: false, intestazione, affermazioni, fonti, motivo: 'il rapporto non elenca nessuna fonte' };
  return { ok: true, intestazione, affermazioni, fonti, motivo: null };
}
