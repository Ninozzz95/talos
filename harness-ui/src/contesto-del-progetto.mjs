/*
 * ⛔⛔⛔ IL PREAMBOLO — quello che il modello legge PRIMA della consegna, e che si paga a ogni invio.
 *
 * ════ COS'ERA, MISURATO L'11/09/2026 ═════════════════════════════════════════════════════════
 *
 * Questo modulo mandava al modello **l'elenco dei file** dello spazio di lavoro. Misurato con lo
 * stimatore del prodotto (`costo-elenco.mjs`, metodo «stimato», 3,5 byte/token — la taratura del
 * 09/09 su `z-ai/glm-5.3-flash`):
 *
 *   spazio di lavoro      elenco file      percorsi        troncato
 *   ─────────────────     ───────────      ──────────      ─────────────────────────────────────
 *   AVM/mobile            17.149 token     1.500           ⚠ SÌ — l'albero ne ha 1.842 (il 30%…)
 *   harness-ui/            7.267 token       693           no
 *   TALOS-PAROLA (piccolo)     85 token        10          no
 *
 * ⇒ Su `AVM/mobile` pagavamo 17.000 token per mostrare **il 30% dei file** e per dire al modello,
 *   nel testo stesso, di non fidarsi dell'elenco. Sulla mediana misurata in BC-07 il primo
 *   messaggio pesa **29.148 token**: l'elenco ne era la parte più grossa.
 *
 * ⛔ E NESSUNO DEI QUATTRO CONCORRENTI FA COSÌ. Letti nel codice l'11/09
 *   (`.claude/RAPPORTO-PREAMBOLO-CONCORRENTI-2026-09-11.md`): Codex manda 35 token di ambiente +
 *   `AGENTS.md` (32 KiB) e cerca con `rg`; Claude Code 2.1.268 manda quattro chiavi di sessione e
 *   `gitStatus` tagliato a 2.000 caratteri; Hermes v0.21 manda 100-130 token di «workspace
 *   snapshot»; DeepSeek `dsh` manda **una frase**. Tutti e quattro mandano le ISTRUZIONI di
 *   progetto. **TALOS era l'unico che mandava l'inventario e non le istruzioni.**
 *
 * ════ COS'È ADESSO — QUATTRO BLOCCHI, IN ORDINE DI STABILITÀ ═════════════════════════════════
 *
 *   1. Istruzioni del kernel .... in `talosHarness.mjs` (`ISTRUZIONI`), 97 token, non si tocca
 *   2. Scheda di lavoro ......... `scheda-di-lavoro.mjs`   — dove sei, permesso, modello, verifica
 *   3. Istruzioni di progetto ... `istruzioni-di-progetto.mjs` — AGENTS.md/CLAUDE.md, tetto in byte
 *   4. Mappa delle CARTELLE ..... `mappa-cartelle.mjs`     — completa, `.gitignore` rispettato
 *
 * I blocchi 2-4 li compone questo file, in quest'ordine, e il kernel li mette **subito dopo il
 * blocco 1 e PRIMA della consegna**. L'ordine non è una preferenza: è il vincolo della cache.
 *
 * ════ PERCHÉ IL PREFISSO NON SI RISCRIVE MAI ════════════════════════════════════════════════
 *
 * RICERCA WEB, letta l'11/09/2026 PRIMA di toccare una riga — Claude Platform Docs, «Prompt
 * caching» <https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching>, verbatim:
 *   · *«Cache hits require 100% identical prompt segments»*;
 *   · *«Prompt caching references the entire prompt — tools, system, and messages (in that order)
 *     up to and including the block designated with cache_control»*: la lookup lavora sul
 *     **prefisso intero**, non sul singolo blocco;
 *   · i minimi per modello sono **512 / 1.024 / 2.048 / 4.096 token** a seconda del modello, e
 *     valgono sul prefisso, non sull'ultimo blocco.
 * E OpenRouter, «Prompt caching» (letto 11/09/2026): i minimi sono 4.096 token per Opus 4.5-4.8 e
 * Haiku 4.5, 1.024 per Sonnet 4.5/4.6 e per OpenAI; Z.AI, DeepSeek, Grok, Moonshot e Groq
 * cacheggiano **in automatico senza marcatori**, Anthropic e Qwen li vogliono espliciti.
 *
 * ⇒ Da qui la regola che i tre harness che gestiscono contesti mutevoli applicano tutti:
 *   **il prefisso si costruisce UNA VOLTA e non si tocca più; ciò che cambia si APPENDE in coda,
 *   dichiarando che sostituisce.** Codex lo fa con `WorldState::render_diff` +
 *   `REPLACEMENT_NOTICE`; Claude Code con *«The session context has changed; these values replace
 *   the earlier ones»*; dsh con *«This complete workspace instruction baseline replaces all earlier
 *   workspace instruction baselines»*.
 *   Qui: `contestoDelProgetto()` costruisce il prefisso, `aggiornamentoInCoda()` costruisce il
 *   messaggio da appendere quando qualcosa è cambiato davvero.
 *
 * ⛔ E VALE ANCHE SE LA CACHE NON PRENDE. L'A/B dell'11/09 su `z-ai/glm-5.3-flash` ha dato **0
 *   token da cache su due invii consecutivi** anche col `cache_control` per blocco. Un prefisso che
 *   non cambia resta comunque **meno byte** e **meno rumore** — e il rumore ha una misura: Chroma,
 *   «Context Rot» (14/07/2025, 18 modelli): *«a single distractor reduces performance relative to
 *   the baseline»*, e l'effetto cresce con l'input.
 *
 * ════ LA CHIAVE DELLA CACHE — TRE COSE, DICHIARATE ══════════════════════════════════════════
 *
 * Il preambolo dipende da **cartella**, **permesso del giro** e **modello**: sono le tre cose che
 * compaiono nel testo e che possono cambiare senza che il disco cambi. La cache è indicizzata su
 * quelle tre, quindi:
 *   · due giri di fila con gli stessi tre valori ⇒ **la STESSA stringa, byte per byte**;
 *   · cambia uno dei tre ⇒ stringa nuova, perché il testo dice davvero una cosa diversa.
 * ⛔ La prova sta in `tests/preambolo-quattro-blocchi.test.mjs`, ed è la prova che conta più di
 *   tutte le altre di questo modulo.
 */

import { costruisciMappaCartelle, mappaEntroIlTetto, TETTO_TOKEN_MAPPA_PREDEFINITO } from './mappa-cartelle.mjs';
import { istruzioniDiProgetto, trovaRadiceProgetto, TETTO_BYTE_PREDEFINITO } from './istruzioni-di-progetto.mjs';
import { schedaDiLavoro } from './scheda-di-lavoro.mjs';
import { costoElenco } from './costo-elenco.mjs';

/**
 * Quanto a lungo un preambolo resta buono senza che nessuno dica che i file sono cambiati.
 * ⛔ Non è pigrizia: è la difesa contro il caso in cui il segnale di cambiamento si perda (un file
 *   creato da un processo esterno, un `git checkout` fuori da TALOS). Cinque minuti è il compromesso
 *   fra «non ricostruire per niente» e «non mentire troppo a lungo» — dichiarato, non misurato.
 */
export const VALIDITA_MS = 5 * 60 * 1000;

/**
 * ⛔⛔⛔ 12/09/2026 — LA CACHE SERVE SUBITO E SI RINNOVA DOPO (stale-while-revalidate).
 * Owner: «i modelli OpenRouter sono estremamente lenti al primo messaggio, quasi un minuto».
 * Misurato: su `Desktop` il preambolo costa 34.356 ms da costruire, e con una validità di cinque
 * minuti OGNI messaggio mandato dopo una pausa lo ripagava per intero (record `tempi-giro` della
 * sessione 78247740: 41,8 s · 34,3 s · 39,9 s al primo token, tre invii di fila). Una persona che
 * legge la risposta, pensa, e riscrive dopo sei minuti non deve aspettare che il disco venga
 * ricamminato: riceve la mappa di prima — che è anche il prefisso IDENTICO su cui prende la cache
 * del fornitore — e la mappa nuova si costruisce in sottofondo per il messaggio dopo.
 * ⛔ Non è «cache per sempre»: `segnalaFileCambiati` continua a buttarla quando la cartella cambia
 *   (WorkspaceChanged), e in quel caso la ricostruzione è sincrona ma ora ha il tetto in tempo
 *   di `mappa-cartelle.mjs`. Ciò che cambia è solo il caso «scaduta per età»: prima faceva
 *   aspettare, ora no. È la forma di HTTP `stale-while-revalidate` (RFC 5861, §3).
 * ⭐ Il rinnovo in sottofondo è UNO per chiave (`rinnovo` sulla voce): dieci messaggi in fila su
 *   una cache scaduta fanno partire una sola camminata, non dieci.
 */
export const RINNOVA_IN_SOTTOFONDO = true;

/** La memoria dei preamboli già costruiti, per `cartella|permesso|modello`. */
const cache = new Map();

const chiaveDi = (cartella, permesso, modello) => `${cartella}|${permesso ?? ''}|${modello ?? ''}`;

/**
 * Le due frasi con cui un preambolo comincia, in testa o in coda. Servono a RITROVARLO dentro una
 * conversazione già iniziata — cioè a rispondere alla domanda «che cosa ha già visto questo
 * modello?» **senza tenere nessuno stato in memoria**.
 *
 * ⛔ Perché senza stato: una mappa `sessione → ultimo preambolo` sopravvive al riavvio del server
 *   come `null`, e la sessione ripresa dopo un riavvio riceverebbe un «aggiornamento» che non
 *   aggiorna niente, oppure niente quando invece qualcosa era cambiato. La conversazione salvata è
 *   l'unica fonte che non mente su cosa il modello ha letto. È la stessa scelta di Claude Code
 *   2.1.268, che confronta il contesto di sessione per uguaglianza secca
 *   (`function N$t(e,n){return soe.every((r)=>e[r]===n[r])}`) invece di ricordarselo.
 * ⛔ E non sono sentinelle invisibili (`<!--TALOS-PREAMBOLO-->`): sono le prime parole che il
 *   modello legge davvero. Una sentinella tecnica costerebbe token per non dire niente a chi legge.
 */
export const INIZIO_SCHEDA = 'Scheda di lavoro — ';
export const INIZIO_AGGIORNAMENTO = 'Aggiornamento del contesto del progetto:';

/**
 * Costruisce (o riusa) il PREAMBOLO di una cartella: blocchi 2, 3 e 4 in un testo solo.
 *
 * @param {object} input
 * @param {string} input.cartella
 * @param {(radice: string) => Promise<Function|null>} [input.creaFiltro] — il filtro `.gitignore`,
 *   iniettato: questo modulo non deve sapere come si leggono quelle regole.
 * @param {string|null} [input.permesso] — l'etichetta del permesso del giro (entra nel blocco 2)
 * @param {string|null} [input.modello] — il modello del giro (entra nel blocco 2)
 * @param {string|null} [input.piattaforma]
 * @param {number} [input.tettoIstruzioni] — il tetto in byte del blocco 3
 * @param {boolean} [input.statoVolatile=true] — se falso, il blocco 2 non porta lo stato di git
 * @param {object} [input.contatore] — il contatore di token, se ce n'è uno vero
 * @param {number} [input.finestra] — la finestra del modello, per dire quanto pesa
 * @param {object} [input.deps] — `{fs, adesso, eseguiGit}` per le prove
 * @returns {Promise<{testo:string, blocchi:object, costo:object, riusato:boolean}|null>}
 */
export async function contestoDelProgetto({
  cartella, creaFiltro, permesso = null, modello = null, piattaforma = null,
  tettoIstruzioni = TETTO_BYTE_PREDEFINITO, tettoTokenMappa = TETTO_TOKEN_MAPPA_PREDEFINITO,
  statoVolatile = true,
  contatore, finestra, deps = {},
} = {}) {
  if (typeof cartella !== 'string' || cartella.trim() === '') return null;
  const adesso = deps.adesso ?? (() => Date.now());
  const ora = adesso();
  const chiave = chiaveDi(cartella, permesso, modello);

  const voce = cache.get(chiave);
  if (voce && ora - voce.quando < VALIDITA_MS) {
    /* ⛔ `riusato` non è un dettaglio da registro: è la prova che il prefisso mandato al fornitore
       è lo STESSO di prima. Se fosse sempre `false`, questo modulo starebbe ricostruendo il
       preambolo a ogni giro e nessuno se ne accorgerebbe. */
    return { ...voce.esito, riusato: true };
  }
  if (voce && RINNOVA_IN_SOTTOFONDO) {
    /* Scaduta per età: si serve quella di prima SUBITO e si rinnova dopo (vedi la nota in testa).
       `stantio` lo dice a chi legge il registro; il testo è byte-identico al precedente. */
    if (!voce.rinnovo) {
      voce.rinnovo = costruisciPreambolo({ cartella, creaFiltro, permesso, modello, piattaforma, tettoIstruzioni, tettoTokenMappa, statoVolatile, contatore, finestra, deps, chiave, rinnovo: true })
        .catch(() => null)
        .finally(() => { const attuale = cache.get(chiave); if (attuale) attuale.rinnovo = null; });
    }
    return { ...voce.esito, riusato: true, stantio: true };
  }

  return costruisciPreambolo({ cartella, creaFiltro, permesso, modello, piattaforma, tettoIstruzioni, tettoTokenMappa, statoVolatile, contatore, finestra, deps, chiave });
}

/** La costruzione vera, separata dalla lettura della cache perché il rinnovo in sottofondo la chiama da solo. */
async function costruisciPreambolo({ cartella, creaFiltro, permesso, modello, piattaforma, tettoIstruzioni, tettoTokenMappa, statoVolatile, contatore, finestra, deps, chiave, rinnovo = false }) {
  const adesso = deps.adesso ?? (() => Date.now());
  const ora = adesso();
  const filtro = await filtroGitignore(creaFiltro, cartella);

  /*
   * I tre blocchi si costruiscono IN PARALLELO: la mappa è la parte lenta (404 ms su `AVM/mobile`,
   * 20 ms su `harness-ui/`) e le altre due sono `stat` e `spawn` di git. In serie il preambolo
   * costerebbe la somma; qui costa il massimo.
   * ⛔ Nessuno dei tre può far cadere l'avvio di una sessione: ognuno degrada al proprio vuoto.
   *   Ma i due modi di degradare NON sono lo stesso, e la differenza è quella che il 10/09 è
   *   costata 25.163 token invece di 6.518 — vedi `filtroGitignore()` qui sotto.
   */
  const [mappa, istruzioni, scheda, nomeProgetto] = await Promise.all([
    costruisciMappaCartelle({ radice: cartella, filtro, fs: deps.fs }).catch(() => null),
    istruzioniDiProgetto({ cartella, tetto: tettoIstruzioni, fs: deps.fs }),
    schedaDiLavoro({ cartella, permesso, modello, piattaforma, statoVolatile, fs: deps.fs, eseguiGit: deps.eseguiGit }).catch(() => null),
    trovaRadiceProgetto(cartella, { fs: deps.fs }).catch(() => null),
  ]);

  /*
   * ⛔ ZERO CARTELLE E ZERO FILE NON È UN CONTESTO, È UNA BUGIA. Il camminatore non lancia quando
   *   una cartella non si legge: la salta con onestà. Ma se l'albero INTERO è vuoto, dire al
   *   modello «in questo progetto non c'è niente» sarebbe peggio che non dirgli niente — gli farebbe
   *   concludere che i file non esistono, che è esattamente la conclusione sbagliata che tutto
   *   questo esiste per impedire ([[un-modello-che-non-vede-non-tace-spiega]]: alla domanda «quanti
   *   file .mjs ci sono in harness-ui/src?» TALOS rispose «0 — la cartella non esiste». Sono 104).
   * ⭐ La scheda di lavoro da sola NON basta a far esistere il preambolo: senza mappa e senza
   *   istruzioni, ciò che resta («sei in una cartella») non vale i suoi token.
   */
  const mappaHaSostanza = Boolean(mappa && (mappa.cartelle.length > 0 || mappa.fileTotali > 0));
  if (!mappaHaSostanza && !istruzioni) return null;

  /*
   * ⛔ LA SCHEDA C'E' SEMPRE, anche se la sua costruzione e' fallita. Non per bellezza: la prima
   *   riga del preambolo e' l'unico modo che ha `preamboloVistoDa()` di RITROVARLO dentro una
   *   conversazione salvata, e senza di lei un aggiornamento in coda non saprebbe se c'e'
   *   qualcosa da sostituire. Il ripiego dice il vero — la cartella e nient'altro — invece di
   *   inventare uno stato di git che non abbiamo potuto leggere.
   */
  const pezzi = [];
  pezzi.push(scheda?.testo ?? `${INIZIO_SCHEDA}non sono riuscito a leggere lo stato di questa cartella; quello che segue e' comunque vero.`);
  if (istruzioni?.testo) pezzi.push(istruzioni.testo);
  /*
   * ⛔ IL TETTO DELLA MAPPA E' IN TOKEN, non in cartelle — misurato l'11/09 e non negoziabile:
   *   col solo tetto sulle cartelle, lo spazio di lavoro «repo intero» produceva una mappa da
   *   17.966 token e il preambolo nuovo costava +8,4% del vecchio. Cioe' la cura peggiorava il
   *   caso peggiore, che e' l'unico che conta. Qui si taglia in PROFONDITA' finche' non entra, e
   *   il testo lo dichiara.
   */
  const resaMappa = mappaHaSostanza ? mappaEntroIlTetto(mappa, { radice: cartella, tettoToken: tettoTokenMappa }) : null;
  if (resaMappa) pezzi.push(resaMappa.testo);
  /* Doppio a-capo fra i blocchi: sono tre cose diverse, e un modello che legge un muro di testo
     senza confini le mescola. Costa 2 byte per blocco. */
  const testo = pezzi.join('\n\n');

  const costo = costoElenco(testo, { finestra, contatore });
  const esito = {
    testo,
    blocchi: {
      scheda: scheda ? { byte: Buffer.byteLength(scheda.testo, 'utf8') } : null,
      istruzioni: istruzioni ? { byte: istruzioni.byte, usati: istruzioni.usati, omessi: istruzioni.omessi, tagliati: istruzioni.tagliati } : null,
      mappa: resaMappa
        ? {
          cartelle: mappa.cartelle.filter((c) => c.livello <= resaMappa.profonditaUsata).length,
          cartelleTotali: mappa.cartelle.length,
          file: mappa.fileTotali,
          /* ⛔ Due modi diversi di essere incompleta, e si dicono per nome: il camminatore si e'
             fermato (`troncata`), oppure e' entrata solo fino a una certa profondita' per stare
             nel tetto di token (`tagliataInProfondita`). Un booleano solo li confonderebbe. */
          troncata: mappa.troncato,
          tagliataInProfondita: resaMappa.tagliataInProfondita,
          /* ⛔ BC-40 (12/09) — TERZO modo, ed è quello NORMALE da oggi: la mappa si ferma alla
             profondità predefinita (2) perché così è stata disegnata, non perché un tetto abbia
             morso. Campo AGGIUNTO, mai sostituito: chi leggeva `troncata`/`tagliataInProfondita`
             continua a leggere esattamente quello che leggeva prima. */
          ridottaPerDisegno: Boolean(mappa.fermatoInProfondita),
          profondita: resaMappa.profonditaUsata,
          profonditaPiena: mappa.profonditaRaggiunta,
          token: resaMappa.token,
        }
        : null,
    },
    nomeProgetto,
    costo,
    riusato: false,
  };
  /* ⛔ Un rinnovo in sottofondo che finisce DOPO un `segnalaFileCambiati` non deve resuscitare
     una voce buttata: si scrive solo se la chiave è ancora quella attesa o se non c'è niente. */
  const precedente = cache.get(chiave);
  if (rinnovo && !precedente) return esito; // buttata da segnalaFileCambiati mentre si ricostruiva: la cartella e' cambiata, questa mappa e' gia' vecchia
  cache.set(chiave, { quando: ora, esito, rinnovo: precedente?.rinnovo ?? null });
  return esito;
}

/**
 * Il filtro `.gitignore`, con i DUE MODI DI DEGRADARE tenuti distinti.
 *
 * ⛔⛔ QUESTO CATCH HA GIÀ NASCOSTO UN BUG, il 10/09: il chiamante passava la stringa nuda a
 *   `creaFiltroGitignore`, che vuole `{radice}`; Node lanciava `ERR_INVALID_ARG_TYPE` e qui veniva
 *   scambiato per un file di regole illeggibile — elenco senza filtro, 1500 percorsi troncati e
 *   **25.163 token al posto di ~6.500**, e nessun errore da nessuna parte.
 * ⇒ Un `.gitignore` illeggibile si degrada in silenzio (giusto: il modello vede qualche cartella in
 *   più, e il contrario — nessun contesto per colpa di un file di regole — sarebbe rifare il difetto
 *   che stiamo curando). Un errore di **CONTRATTO** no: quello è un bug di chi chiama, e deve farsi
 *   sentire. Un catch che degrada dice QUALE guasto copre e rilancia gli altri.
 */
async function filtroGitignore(creaFiltro, cartella) {
  if (typeof creaFiltro !== 'function') return undefined;
  let regole;
  try {
    regole = await creaFiltro(cartella);
  } catch (errore) {
    if (errore?.code === 'ERR_INVALID_ARG_TYPE' || errore instanceof TypeError) throw errore;
    return undefined;
  }
  if (typeof regole !== 'function') return undefined;
  /*
   * L'ADATTATORE FRA I DUE CONTRATTI. Il camminatore chiama `filtro(percorso, { cartella })` — un
   * OGGETTO; il filtro delle regole si aspetta `(percorso, eDirectory)` — un BOOLEANO
   * (`gitignore-elenco.mjs:281`). Un oggetto è sempre vero: senza questa conversione ogni file
   * verrebbe giudicato come se fosse una cartella, e le regole non morderebbero.
   * ⛔ MISURATO il 10/09: la conversione NON cambia il risultato sull'albero vero (1.629 file in
   *   entrambi i casi) — l'avevo scritta credendo fosse la causa di un elenco troncato, e la misura
   *   mi ha smentito. Resta perché rende esplicito un contratto che altrimenti regge per caso.
   */
  return (percorso, forma) => regole(percorso, typeof forma === 'object' && forma !== null ? Boolean(forma.cartella) : Boolean(forma));
}

/**
 * IL CONTESTO CHE SI APPENDE — il messaggio da mettere IN CODA quando il preambolo e' cambiato
 * dopo che il modello l'ha gia' ricevuto.
 *
 * ⛔ Non rigenera il prefisso: lo lascia esattamente dov'e' e dice al modello che cio' che segue
 *   SOSTITUISCE. E' la forma che usano tutti e tre gli harness che gestiscono contesti mutevoli:
 *     · Codex, `world_state/agents_md.rs:9-11` — «These AGENTS.md instructions replace all
 *       previously provided AGENTS.md instructions.»
 *     · Claude Code 2.1.268 — «The session context has changed; these values replace the earlier
 *       ones», con confronto per uguaglianza secca e un elenco chiuso di cause;
 *     · dsh, `src/render.ts:12-19` — «This complete workspace instruction baseline replaces all
 *       earlier workspace instruction baselines.»
 *
 * @param {object} input
 * @param {Array<object>} input.storia — i messaggi che il modello ha gia' davanti (`messaggiIniziali`)
 * @param {string} input.testo — il preambolo corrente
 * @returns {string|null} il messaggio da appendere, oppure `null` se non e' cambiato NIENTE — e
 *   allora non si appende niente: zero token, come Hermes, che della sua sonda d'ambiente scrive
 *   «Emits a single line; emits NOTHING when the environment is clean (no token cost)».
 */
export function aggiornamentoInCoda({ storia, testo } = {}) {
  if (typeof testo !== 'string' || testo === '') return null;
  const visto = preamboloVistoDa(storia);
  /* ⛔ Nessun preambolo nella storia: o e' una sessione fresca (e il preambolo sta gia' in testa,
     ripeterlo in coda sarebbe pagarlo due volte) o e' una conversazione nata prima di questa cura.
     In entrambi i casi non si appende: non c'e' niente da SOSTITUIRE. */
  if (visto === null) return null;
  if (visto === testo) return null;
  return INIZIO_AGGIORNAMENTO + ' quanto segue SOSTITUISCE la scheda di lavoro, le istruzioni di '
    + 'progetto e la mappa delle cartelle che hai ricevuto prima in questa conversazione. Quelle '
    + 'non valgono piu\u0027.\n\n' + testo;
}

/**
 * L'ultimo preambolo che il modello ha davvero letto, ricavato dalla conversazione salvata.
 * Si cammina dalla FINE: l'ultimo che parla e' quello che vale.
 */
export function preamboloVistoDa(storia) {
  if (!Array.isArray(storia)) return null;
  for (let i = storia.length - 1; i >= 0; i -= 1) {
    const m = storia[i];
    if (m?.role !== 'system' || typeof m.content !== 'string') continue;
    if (m.content.startsWith(INIZIO_AGGIORNAMENTO)) {
      const taglio = m.content.indexOf('\n\n');
      return taglio >= 0 ? m.content.slice(taglio + 2) : null;
    }
    if (m.content.startsWith(INIZIO_SCHEDA)) return m.content;
  }
  return null;
}

/**
 * Dice che i file di una cartella sono cambiati: il prossimo giro ricostruira' il preambolo.
 * ⛔ Si chiama da `WorkspaceChanged`, cioe' quando il disco cambia DAVVERO. Chiamarla a ogni evento
 *   annullerebbe la cache e con essa tutto il vantaggio.
 * ⛔ Cancella TUTTE le chiavi di quella cartella, qualunque permesso e qualunque modello: i file
 *   sono cambiati per tutte.
 */
export function segnalaFileCambiati(cartella) {
  if (typeof cartella !== 'string') return false;
  const prefisso = cartella + '|';
  let tolte = 0;
  for (const chiave of [...cache.keys()]) {
    if (chiave.startsWith(prefisso)) { cache.delete(chiave); tolte += 1; }
  }
  return tolte > 0;
}

/** Svuota tutto. Serve alle prove, e a un riavvio pulito. */
export function dimenticaTuttiGliElenchi() {
  const quanti = cache.size;
  cache.clear();
  return quanti;
}
