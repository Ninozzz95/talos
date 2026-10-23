import { t, tn, linguaCorrenteDiT } from './lingua.js';
import { creaNotaSistema } from './conversazione.js';

/*
 * ⭐ F5 (onda 2 della fase F2), 24/09/2026 — LA COMPATTAZIONE LEGACY VISTA DALLA CHAT.
 *
 * Sul 4174 il motore acceso è il legacy dell'adapter desktop, e finora la persona non vedeva NIENTE
 * (ricognizione §1.7): l'adapter emetteva `compattazione-inizio`/`-fine` e nessuno li raccoglieva;
 * «Compatta» apriva solo il dialogo del trial, spento per costruzione (`config.mjs:501`). Le decisioni
 * dell'owner del 24/09 (brief comune, 5-6-7) chiedono: avviso PRIMA della soglia, stato DURANTE, riga
 * «X → Y token» con Annulla DOPO, e la coda del journal riparata detta a voce, non in silenzio.
 *
 * Qui stanno le funzioni PURE (soglia, avviso, lettura degli eventi, testo della riga), l'avviso sopra
 * il composer, la nota del journal riparato e le due chiamate HTTP. La barra vive in
 * `context-progress.js` e la riga in `context-separator.js`, estese al legacy: sono le stesse
 * superfici che il trial usa già, non un secondo disegno.
 *
 * Ricerca del passo, letta alla fonte il 24/09/2026:
 *  · Hermes (clone `TALOS-RICERCHE/concorrenti/hermes-agent-2026-09-24`, commit 65ad529 del 23/09):
 *    `agent/conversation_compression.py:66` — `COMPACTION_STATUS = "🗜️ Compacting context — summarizing
 *    earlier conversation so I can continue..."`; `:71` — `COMPACTION_DONE_STATUS = "✓ Context compaction
 *    complete — continuing turn..."`; `:107` — `"🗜️ Compressed ~{before:,} → ~{after:,} tokens, retrying..."`
 *    ⇒ la forma «prima → dopo» coi separatori delle migliaia è la loro, e la si adotta.
 *    `apps/desktop/src/components/assistant-ui/thread/status.tsx:52` — `const COMPACTION_LABEL = 'Summarizing
 *    thread'` («Fixed label while auto-compaction runs — decoupled from backend status text») ⇒ durante il
 *    lavoro un'etichetta FISSA, non il testo grezzo del motore. `gateway/run.py:344` — «default False: chat is
 *    silent by design»: le notizie di avanzamento sono spente di default. Noi le mostriamo perché l'owner lo
 *    ha deciso (decisione 6), ma UNA riga, non un flusso. `locales/it.yaml:110` — «Nessun messaggio è stato
 *    eliminato — la conversazione è invariata» ⇒ quando non riesce, si dice che NIENTE è cambiato.
 *    Hermes non ha un annullo del riassunto (`/undo` toglie turni, `locales/en.yaml:396`): l'Annulla è un +1.
 *  · Claude Code, docs ufficiali `code.claude.com/docs/en/context-window` (lette il 24/09/2026): «/compact:
 *    Replaces the conversation with a structured summary. You see a "Conversation compacted" message. The
 *    summarization happens without appearing in your terminal.» ⇒ una riga sola dopo, e il riassunto non
 *    invade la chat: qui sta dietro «Mostra cosa è stato riassunto». `code.claude.com/docs/en/costs`: «A
 *    context or auto-compact warning: not a usage limit. The conversation has grown close to the session's
 *    auto-compact window» ⇒ l'avviso prima della soglia è una notizia, non un pericolo: niente rosso.
 *  · MDN, role `status` (23/06/2025): `aria-live` implicito `polite`, `aria-atomic` `true`; «Do not give
 *    focus to the status when its content updates» ⇒ le frasi vive stanno in un `role="status"`, e nessun
 *    fuoco si sposta. MDN `<progress>` (28/08/2026): «If there is no value attribute, the progress bar is
 *    indeterminate» e «you should provide an accessible label» ⇒ la barra legacy non ha `value` (non ci sono
 *    segmenti da contare: sarebbe una percentuale inventata) e porta `aria-label`.
 *  · Il clone di Codex in `%LOCALAPPDATA%/Temp/r4-competitor-2026-09-23` NON c'è più (pulizia di TEMP) e la
 *    pagina `developers.openai.com/codex/concepts/compaction` risponde 404 (24/09/2026): Codex non è stato
 *    letto nel codice. Lo dico invece di ricordarlo.
 *
 * ⛔ La soglia qui è la STESSA del kernel (`src/kernel/compattazione-desktop.mjs:46-47`: `TETTO_TOKEN_DEFAULT
 *   = 200_000`, `FRAZIONE_FINESTRA = 0.75`), copiata e non importata: il pacchetto del browser non porta
 *   dentro il kernel. Se il server ha `TALOS_COMPACTION_TOKEN_CAP` diverso, l'avviso lo sa solo quando un
 *   evento `talos.compattazione` porta `soglia`: da lì in poi vince il numero del server.
 */

export const TETTO_TOKEN_DEFAULT = 200_000;
export const FRAZIONE_FINESTRA = 0.75;
/** Decisione 6: l'avviso compare PRIMA della soglia, da 0,8 in su (brief F5 §2). */
export const FRAZIONE_AVVISO = 0.8;
export const EVENTO_COMPATTAZIONE = 'talos.compattazione';
export const EVENTO_ANNULLATA = 'talos.compattazione-annullata';
export const EVENTO_JOURNAL_RIPARATO = 'talos.journal-riparato';
/** B1 (owner 21/10/2026): i passi del riassunto ATTESO, effimeri (solo a chi è connesso). Contratto §2, `CONTRATTO-RIGA-VIVA-…-21.md`. */
export const EVENTO_PROGRESSO = 'talos.compattazione-progresso';
/** Contratto §3: perché un riassunto è stato fatto SENZA il modello (`ripiego:true`). Un valore fuori elenco resta `null`. */
export const RAGIONI_RIPIEGO = Object.freeze(['tempo', 'saltato', 'rifiutato', 'stima', 'esaurito']);

const numero = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const intero = (v) => Number.isSafeInteger(v) && v >= 0;
const inglese = () => linguaCorrenteDiT() === 'en';
/** I numeri di token con i separatori delle migliaia della lingua corrente (Hermes: `~{before:,} → ~{after:,}`). */
export function formattaToken(n) { return new Intl.NumberFormat(inglese() ? 'en-US' : 'it-IT').format(n); }

/** La soglia del legacy: il minore fra il tetto assoluto e 0,75 della finestra; senza finestra vale il tetto. */
export function sogliaLegacy({ finestraToken = null, tettoToken = TETTO_TOKEN_DEFAULT } = {}) {
  const tetto = numero(tettoToken) && tettoToken > 0 ? tettoToken : TETTO_TOKEN_DEFAULT;
  if (!numero(finestraToken) || finestraToken <= 0) return tetto;
  return Math.min(tetto, Math.floor(finestraToken * FRAZIONE_FINESTRA));
}

/** Se avvisare: solo con numeri veri e positivi; mai un avviso costruito su uno zero o su un `undefined`. */
export function valutaSogliaContesto({ tokenMisurati, soglia, warningTokens = null, source = null } = {}) {
  if (!numero(tokenMisurati) || tokenMisurati <= 0 || !numero(soglia) || soglia <= 0) return { mostra: false, rapporto: null, testo: '' };
  const rapporto = tokenMisurati / soglia;
  const numeri = { n: formattaToken(tokenMisurati), m: formattaToken(soglia) };
  // oltre la soglia «quasi pieno» sarebbe falso: si dice che la soglia è superata (visto nella foto 2-durante: 184.000 su 150.000)
  let testo;
  if (source === 'fallback') {
    testo = t('chat.context.notice.windowUnverified', numeri);
  } else if (source === 'route-minimum') {
    testo = rapporto >= 1 ? t('chat.context.notice.routeExceeded', numeri) : t('chat.context.notice.routeApproaching', numeri);
  } else if (source === 'explicit-cap') {
    testo = rapporto >= 1 ? t('chat.context.notice.limitExceeded', numeri) : t('chat.context.notice.limitApproaching', numeri);
  } else {
    testo = rapporto >= 1 ? t('chat.context.notice.overThreshold', numeri) : t('chat.context.notice.almostFull', numeri);
  }
  const warning = numero(warningTokens) && warningTokens > 0 ? warningTokens : Math.floor(soglia * FRAZIONE_AVVISO);
  return { mostra: tokenMisurati >= warning, rapporto, testo };
}

/**
 * Legge gli eventi del contratto F3 **fuso** (`a8cdcc616` sull'integrazione, letto in `session-registry.mjs` il
 * 24/09/2026 alle 12:35 — il brief F5 aveva forme diverse, tenute come alias):
 *  · inizio  `{ fase:'inizio', tokenPrima, soglia, motivo:'background'|'soglia'|'emergenza'|'overflow', coveredThrough, at }`
 *            (`session-registry.mjs:3084`; `agent-service.mjs:1127-1128`) — il brief diceva `tokenMisurati`: accettati entrambi;
 *  · fine ok `{ fase:'fine', compattato:true, tokenPrima, tokenDopo, misura, coveredThrough, at, modello, motivo }` (`:3111`) —
 *            NIENTE `record`: l'`at` (l'identificativo che la rotta di annullo vuole) sta al primo livello. Il riassunto NON viaggia
 *            nell'evento: `record.riassunto` resta `null` e la voce «Mostra cosa è stato riassunto» non compare;
 *  · fine ko `{ fase:'fine', compattato:false, motivo, at }` con `motivo` ∈ `attrezzo|troncato|vuoto|superata|non-salvata|errore: <testo>`
 *            (`:3098`, `:3101`, `:3106`, `:3112`): il prefisso `errore: ` diventa `errore` + `dettaglio`;
 *  · annulla `{ fase:'annullata', at, coveredThrough }` sullo STESSO evento (`:7779`) — `talos.compattazione-annullata` non esiste, alias;
 *  · journal `{ riparato:true|false, completata, righeScartate, byteScartati, backup, errore? }` (`:5210-5214`).
 * Tutto ciò che non è una di queste forme è `null`: non si indovina.
 */
export function interpretaEventoCompattazione(evento) {
  if (!evento || evento.type !== 'CUSTOM' || typeof evento.name !== 'string') return null;
  const v = evento.value;
  const at = (o) => (typeof o?.at === 'string' && o.at ? o.at : null);
  if (evento.name === EVENTO_COMPATTAZIONE) {
    if (!v || typeof v !== 'object') return null;
    if (v.fase === 'inizio') {
      const token = numero(v.tokenPrima) ? v.tokenPrima : numero(v.tokenMisurati) ? v.tokenMisurati : null;
      return { tipo: 'inizio', tokenMisurati: token, soglia: numero(v.soglia) ? v.soglia : null, motivo: typeof v.motivo === 'string' ? v.motivo : null,
        /* 21/10/2026 (revisione del Mobile): il giro a cui appartiene; quella di sfondo del registro non ne ha. Solo se c'è. */
        ...(Number.isSafeInteger(v.giro) ? { giro: v.giro } : {}) };
    }
    if (v.fase === 'fine') {
      const compattato = v.compattato === true;
      const identificativo = at(v) ?? at(v.record);
      const record = compattato && identificativo
        ? { at: identificativo, coveredThrough: Number.isSafeInteger(v.coveredThrough) ? v.coveredThrough : Number.isSafeInteger(v.record?.coveredThrough) ? v.record.coveredThrough : null, riassunto: typeof v.record?.riassunto === 'string' && v.record.riassunto ? v.record.riassunto : null,
          /* 26/09: la via manuale sostituiva la storia senza record (`annullabile:false`); dal 22/10 (S2-A) scrive un record ed è
             annullabile come le altre. Il campo resta letto: le righe già scritte sul disco portano ancora `false`. */
          annullabile: v.annullabile !== false }
        : null;
      let motivo = typeof v.motivo === 'string' ? v.motivo : null, dettaglio = null;
      /* 21/10/2026 (revisione del Mobile): il riassunto di sfondo del registro scrive `error: <testo>` in inglese; lo leggiamo come l'italiano */
      if (motivo && /^(?:errore|error):\s*/i.test(motivo)) { dettaglio = motivo.replace(/^(?:errore|error):\s*/i, '').trim() || null; motivo = 'errore'; }
      return {
        tipo: 'fine', compattato, ...(Number.isSafeInteger(v.giro) ? { giro: v.giro } : {}),
        tokenPrima: compattato && numero(v.tokenPrima) ? v.tokenPrima : null,
        tokenDopo: compattato && numero(v.tokenDopo) ? v.tokenDopo : null,
        record, motivo, dettaglio,
        /* B1, contratto §3 (21/10/2026): un riassunto riuscito ma SENZA il modello dice perché. Solo quando c'è: chi legge la forma
           di sempre (le prove CTX-UI-LEGACY-EVENT-PARSE la confrontano intera) non vede campi in più. */
        ...(compattato && v.ripiego === true ? { ripiego: true, ragione: RAGIONI_RIPIEGO.includes(v.ragione) ? v.ragione : null } : {}),
      };
    }
    if (v.fase === 'annullata') return at(v) ? { tipo: 'annullata', at: v.at } : null;
    return null;
  }
  if (evento.name === EVENTO_PROGRESSO) {
    if (!v || typeof v !== 'object') return null;
    /* B1, contratto §2: tutti i campi sono facoltativi e si tengono SOLO se hanno la forma dichiarata. Un campo assente o storto è
       `null`, mai uno zero: la riga non può dire «0%» o «~0 s» su un numero che il motore non ha dato. `tokenRiassunto` è il nome
       che il contatore del kernel usa oggi (`compattazione-desktop.mjs:533`), `tokenScritti` quello del contratto: vince il secondo. */
    const testo = (x) => (typeof x === 'string' && x ? x : null);
    return {
      tipo: 'progresso',
      fase: testo(v.fase), motivo: testo(v.motivo), origine: testo(v.origine),
      tentativo: intero(v.tentativo) && v.tentativo > 0 ? v.tentativo : null,
      tentativi: intero(v.tentativi) && v.tentativi > 0 ? v.tentativi : null,
      trascorsoMs: intero(v.trascorsoMs) ? v.trascorsoMs : null,
      letti: intero(v.letti) ? v.letti : null,
      inCache: intero(v.inCache) ? v.inCache : null,
      totale: intero(v.totale) ? v.totale : null,
      stimaRestanteSec: intero(v.stimaRestanteSec) ? v.stimaRestanteSec : null,
      tokenScritti: intero(v.tokenScritti) ? v.tokenScritti : intero(v.tokenRiassunto) ? v.tokenRiassunto : null,
    };
  }
  if (evento.name === EVENTO_ANNULLATA) return at(v) ? { tipo: 'annullata', at: v.at } : null;
  if (evento.name === EVENTO_JOURNAL_RIPARATO) {
    if (!v || typeof v !== 'object') return null;
    return {
      tipo: 'riparato',
      riparato: v.riparato !== false, // il brief non aveva il campo: assente = riuscita, `false` = fallita
      completata: v.completata === true,
      righeScartate: Number.isSafeInteger(v.righeScartate) && v.righeScartate >= 0 ? v.righeScartate : null,
      byteScartati: Number.isSafeInteger(v.byteScartati) && v.byteScartati >= 0 ? v.byteScartati : null,
      backup: typeof v.backup === 'string' && v.backup ? v.backup : null,
      errore: typeof v.errore === 'string' && v.errore ? v.errore : null,
      /* Owner 26/09/2026: un buco NEL MEZZO del salvataggio (session-registry, `bucoJournal`): fino a che giro è tornata. */
      ...(v.buco && typeof v.buco === 'object' ? { buco: {
        recuperataFinoAlGiro: Number.isSafeInteger(v.buco.recuperataFinoAlGiro) && v.buco.recuperataFinoAlGiro >= 0 ? v.buco.recuperataFinoAlGiro : null,
        deltaScartati: Number.isSafeInteger(v.buco.deltaScartati) && v.buco.deltaScartati >= 0 ? v.buco.deltaScartati : null,
      } } : {}),
    };
  }
  return null;
}

/*
 * I motivi che il kernel e il registro dichiarano (`compattazione-desktop.mjs:139-143` per l'inizio: `soglia`,
 * `emergenza`, più `overflow` dall'adapter `:566` e `background` dal registro `:3084`; per la fine fallita:
 * `attrezzo`, `troncato`, `vuoto` (`:304-307`), `errore[: <testo>]` (`desktop-hotfix.mjs:446`, `session-registry.mjs:3098`),
 * `superata` (`:3106`: la conversazione è cambiata mentre si riassumeva) e `non-salvata` (`:3112`)). Un motivo che non
 * conosciamo si riporta com'è: nasconderlo dietro una frase generica sarebbe dire meno del vero.
 */
const MOTIVI = Object.freeze({
  attrezzo: 'chat.context.failure.tool',
  troncato: 'chat.context.failure.truncated',
  vuoto: 'chat.context.failure.empty',
  errore: 'chat.context.failure.provider',
  superata: 'chat.context.failure.superseded',
  'non-salvata': 'chat.context.failure.notSaved',
  // 24/09/2026: la chiusura che il registro scrive al ripristino per un riassunto rimasto a metà (session-registry.mjs, ripristina)
  interrotta: 'chat.context.failure.interrupted',
  /* Owner 12/10/2026, «errori di compattazione non devono bloccare il flusso chat»: il motore del contesto è caduto e la richiesta
     è partita dalla compattazione semplice (`talosHarness.desktop-hotfix.mjs`, ripiego). La riga lo dice, e non ferma niente. */
  ripiego: 'chat.context.failure.fellBack',
  /* Revisione 7 della CLI (22/10/2026, F6): la finestra non regge attrezzi e parte tenuta — nessun riassunto pagato; detto una volta per
     finestra (il registro non lo ripete) */
  'non-entra': 'chat.context.failure.doesNotFit',
});
/* Owner 12/10/2026 («Si ripara da solo»): l'archivio del motore non combaciava con la conversazione; i vecchi originali sono stati
   messi da parte e il motore è ripartito. Non è un fallimento: la riga dice che cosa è successo e che niente si è perso. */
const RIALLINEATO = 'archivio-riallineato';
/* 21/10/2026 (6): il riassunto di sfondo messo da parte perché la persona ha scritto (`motivo:'ceduta'`, motore a posto unico). È voluto,
   non è un fallimento: nessuna riga, la barra si chiude e basta. La CLI fa lo stesso (`COMPACTION_QUIET`). */
/* B1 (21/10/2026): `motore` chiude la riga di un riassunto che ha scritto il motore del contesto — il suo separatore lo racconta già. */
/* 22/10/2026 (revisione avversaria, B): `nulla-da-ridurre` chiude la riga che l'attesa d'emergenza aveva aperto, quando poi non c'era niente
   da riassumere né da accorciare — nessun fallimento da raccontare. */
/* 22/10/2026 (CLI, revisione 3, S2-2): `inefficace` — il riassunto di fine giro non riduceva e il record non si è scritto: niente è
   cambiato, niente da raccontare. */
const MOTIVI_MUTI = new Set(['ceduta', 'motore', 'nulla-da-ridurre', 'inefficace']);
/** La frase della nota di un «Compatta» a mano che non ha compattato: «al-minimo» e «inefficace» hanno la loro (revisione 3 della CLI,
    22/10/2026 — con «inefficace» il riassunto si è pagato, e la nota generica non lo diceva); ogni altro motivo, quella generica. */
export function chiaveNotaCompactManuale(motivo) {
  if (motivo === 'al-minimo') return 'app.contextManager.atMinimum';
  if (motivo === 'inefficace') return 'app.contextManager.ineffective';
  return 'app.contextManager.notSummarized';
}
/** Una fine non riuscita che non si racconta. */
export function fineMuta(c) {
  return c?.tipo === 'fine' && c.compattato !== true && MOTIVI_MUTI.has(c.motivo);
}
export function motivoUmano(motivo, dettaglio = null) {
  const frase = motivo in MOTIVI ? t(MOTIVI[motivo]) : String(motivo ?? '');
  return dettaglio ? `${frase} (${dettaglio})` : frase;
}

/*
 * B1 (owner 21/10/2026, mockup approvato alla terza versione) — IL RIPIEGO DETTO IN UNA RIGA. Il riassunto c'è (la conversazione è
 * compattata), ma lo ha fatto TALOS senza il modello: la riga lo dice con la ragione in una parola e i numeri brevi «31.2k → 9.9k»;
 * il perché per esteso sta nel `title` della frase (`percheRipiego`), non in un paragrafo che allunga la chat.
 */
const RAGIONE_BREVE = Object.freeze({
  tempo: 'chat.context.fallback.reasonTime', saltato: 'chat.context.fallback.reasonSkipped', rifiutato: 'chat.context.fallback.reasonRejected',
  stima: 'chat.context.fallback.reasonEstimate', esaurito: 'chat.context.fallback.reasonExhausted',
});
const RAGIONE_PERCHE = Object.freeze({
  tempo: 'chat.context.fallback.whyTime', saltato: 'chat.context.fallback.whySkipped', rifiutato: 'chat.context.fallback.whyRejected',
  stima: 'chat.context.fallback.whyEstimate', esaurito: 'chat.context.fallback.whyExhausted',
});
/** La ragione del ripiego in una parola, o `null` se non è una del contratto (non si riporta un codice grezzo). */
export function ragioneRipiegoBreve(ragione) { return Object.hasOwn(RAGIONE_BREVE, ragione) ? t(RAGIONE_BREVE[ragione]) : null; }
/** Il perché per esteso, per il `title` della riga. */
export function percheRipiego(ragione) { return t(Object.hasOwn(RAGIONE_PERCHE, ragione) ? RAGIONE_PERCHE[ragione] : 'chat.context.fallback.whyUnknown'); }
/** I token in breve, come il mockup: «31.2k» (in italiano «31,2k»); sotto il migliaio il numero intero. */
export function formattaTokenBreve(n) {
  if (!numero(n)) return null;
  if (n < 1000) return formattaToken(Math.round(n));
  const migliaia = new Intl.NumberFormat(inglese() ? 'en-US' : 'it-IT', { maximumFractionDigits: 1 }).format(Math.round(n / 100) / 10);
  return t('chat.context.row.thousands', { n: migliaia });
}

/** Il testo della riga persistente: i numeri quando ci sono, mai inventati quando mancano. */
export function testoRigaCompattazione({ stato, tokenPrima = null, tokenDopo = null, motivo = null, dettaglio = null, ripiego = false, ragione = null } = {}) {
  if (stato === 'annullata') return t('chat.context.row.undone');
  if (stato === 'non-riuscita' && motivo === RIALLINEATO) return t('chat.context.row.realigned');
  if (stato === 'non-riuscita') return `${t('chat.context.row.notSummarized')}${motivo ? ` · ${motivoUmano(motivo, dettaglio)}` : ''}`;
  if (ripiego === true) {
    const breve = ragioneRipiegoBreve(ragione);
    const base = breve ? t('chat.context.row.withoutModelBecause', { ragione: breve }) : t('chat.context.row.withoutModel');
    const prima = formattaTokenBreve(tokenPrima), dopo = formattaTokenBreve(tokenDopo);
    return prima && dopo ? `${base} · ${t('chat.context.row.beforeAfter', { prima, dopo })}` : base;
  }
  /* ⭐ 15/10/2026 (owner, compattazione istantanea, «solo il separatore»): la riga dice che la conversazione è compattata e QUANTO si
     è risparmiato, come Claude Code dopo la sua compattazione precalcolata; i numeri prima → dopo restano nel Context Manager */
  const base = t('chat.context.row.compacted');
  const risparmiati = numero(tokenPrima) && numero(tokenDopo) ? tokenPrima - tokenDopo : null;
  return risparmiati > 0
    ? `${base} · ${tn('chat.context.row.savedOne', 'chat.context.row.savedMany', risparmiati, { n: formattaToken(risparmiati) })}`
    : base;
}

/** La frase della barra mentre il legacy lavora: fissa (Hermes `status.tsx:52`), col motivo solo quando aggiunge qualcosa. */
export function testoBarraLegacy(motivo) {
  if (motivo === 'overflow') return t('chat.context.progress.overflow');
  if (motivo === 'emergenza') return t('chat.context.progress.emergency');
  return t('chat.context.summarizing');
}

/* ------------------------------------------------------------------ l'avviso sopra il composer */

const ICONA = (doc, nome) => {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`); svg.append(use);
  return svg;
};

/**
 * Monta (una volta) l'avviso «contesto quasi pieno» accanto all'avviso del piano: stessa forma
 * (`styles/avviso-piano.css`, D4 del 24/09), un'azione sola più la chiusura. Il markup nasce qui e non nel
 * template: `index.template.html` non è di questa corsia, e un nodo creato dal codice vive nello stesso posto.
 */
export function montaAvvisoContesto({ document: doc = globalThis.document, riferimento = null, onCompatta, onChiudi } = {}) {
  const esistente = doc.getElementById('avvisoContesto');
  if (esistente) return esistente;
  const avviso = doc.createElement('div');
  avviso.className = 'talos-avviso-piano talos-avviso-contesto';
  avviso.id = 'avvisoContesto';
  avviso.dataset.c = 'ContextNearlyFullNotice';
  avviso.setAttribute('role', 'group');
  avviso.setAttribute('aria-label', t('chat.context.notice.ariaLabel'));
  avviso.hidden = true;
  const icona = doc.createElement('span'); icona.className = 'talos-avviso-piano__icona'; icona.setAttribute('aria-hidden', 'true'); icona.append(ICONA(doc, 'i-history'));
  const testo = doc.createElement('p'); testo.className = 'talos-avviso-piano__testo'; testo.setAttribute('role', 'status'); testo.dataset.avvisoContestoTesto = '';
  const azioni = doc.createElement('div'); azioni.className = 'talos-avviso-piano__azioni';
  const compatta = doc.createElement('button'); compatta.type = 'button'; compatta.className = 'talos-button talos-button--secondary talos-button--sm'; compatta.dataset.avvisoContesto = 'compatta'; compatta.textContent = t('chat.context.compactNow');
  const chiudi = doc.createElement('button'); chiudi.type = 'button'; chiudi.className = 'talos-icon-button'; chiudi.dataset.avvisoContesto = 'chiudi'; chiudi.setAttribute('aria-label', t('chat.context.notice.dismiss')); chiudi.append(ICONA(doc, 'i-x'));
  azioni.append(compatta, chiudi);
  avviso.append(icona, testo, azioni);
  avviso.addEventListener('click', (event) => {
    const azione = event.target.closest?.('[data-avviso-contesto]')?.dataset.avvisoContesto;
    if (azione === 'compatta') onCompatta?.();
    else if (azione === 'chiudi') onChiudi?.();
  });
  if (riferimento?.parentNode) riferimento.parentNode.insertBefore(avviso, riferimento);
  else doc.body?.append(avviso);
  return avviso;
}

/** Scrive la frase e mostra, o nasconde (con `null`). Torna se è visibile. */
export function aggiornaAvvisoContesto(avviso, valutazione) {
  if (!avviso) return false;
  const testo = avviso.querySelector('[data-avviso-contesto-testo]');
  if (!valutazione?.mostra) {
    if (!avviso.hidden) { avviso.hidden = true; if (testo) testo.textContent = ''; }
    return false;
  }
  if (testo && testo.textContent !== valutazione.testo) testo.textContent = valutazione.testo;
  avviso.hidden = false;
  return true;
}

/* -------------------------------------------------------------- la nota del journal riparato */

const chiaveRiparazione = (info) => JSON.stringify([info?.riparato !== false, info?.backup ?? null, info?.righeScartate ?? null, info?.byteScartati ?? null, info?.errore ?? null, info?.buco?.recuperataFinoAlGiro ?? null]);

/**
 * Decisione 7: la coda spezzata si ripara al riavvio e SI DICE. Una riga in chat, nella forma della nota
 * di sistema, con il percorso della copia `.bak` leggibile e copiabile: mai un toast, che sparisce.
 */
export function creaNotaJournalRiparato(info, { document: doc = globalThis.document, copia = null } = {}) {
  const fallita = info?.riparato === false;
  const righe = info?.righeScartate;
  /* Owner 26/09/2026, «Tenere fino al buco»: un pezzo mancante NEL MEZZO del salvataggio (session-registry, `bucoJournal`) —
     la conversazione riprende dall'ultimo punto completo, e si dice fino a quale giro. */
  const buco = !fallita && info?.buco && typeof info.buco === 'object' ? info.buco : null;
  const giroBuco = Number.isSafeInteger(buco?.recuperataFinoAlGiro) ? buco.recuperataFinoAlGiro : null;
  // `riparato:false` (session-registry.mjs:5212-5214): la coda resta incerta, e si dice — mai «recuperata» su una riparazione non riuscita
  const frase = fallita
    ? t('chat.context.recovery.repairFailed')
    : buco
      ? (giroBuco !== null
        ? t('chat.context.recovery.upToTurn', { g: giroBuco })
        : t('chat.context.recovery.upToLastPoint'))
      : Number.isSafeInteger(righe)
        ? tn('chat.context.recovery.discardedOne', 'chat.context.recovery.discardedMany', righe)
        : t('chat.context.recovery.afterInterruption');
  const nota = creaNotaSistema({ tipo: fallita ? 'warning' : 'info', badge: t('chat.note.badge'), titolo: fallita ? t('chat.context.recovery.titleNotRecovered') : t('chat.context.recovery.titleRecovered'), testo: frase }, { document: doc });
  nota.dataset.journalRiparato = chiaveRiparazione(info);
  const corpo = nota.lastElementChild;
  const dettaglio = doc.createElement('p'); dettaglio.className = 'talos-system-note__perche';
  dettaglio.textContent = fallita
    ? (info.errore ? t('chat.context.recovery.systemAnswered', { e: info.errore }) : t('chat.context.recovery.noLineDiscarded'))
    : buco
      ? tn('chat.context.recovery.missingPartOne', 'chat.context.recovery.missingPartsMany', Number.isSafeInteger(buco.deltaScartati) ? buco.deltaScartati : 1)
    : Number.isSafeInteger(info?.byteScartati)
      ? t('chat.context.recovery.discardedAtEnd', { b: formattaToken(info.byteScartati) })
      : t('chat.context.recovery.restIntact');
  corpo.append(dettaglio);
  if (info?.backup) {
    const azioni = doc.createElement('div'); azioni.className = 'talos-cluster talos-system-note__azioni';
    const dove = doc.createElement('button'); dove.type = 'button'; dove.className = 'talos-button talos-button--secondary talos-button--sm'; dove.textContent = t('chat.context.recovery.whereIsCopy'); dove.setAttribute('aria-expanded', 'false');
    const percorso = doc.createElement('p'); percorso.className = 'talos-journal-riparato__percorso'; percorso.hidden = true;
    const codice = doc.createElement('code'); codice.textContent = info.backup; percorso.append(codice);
    const copiaBtn = doc.createElement('button'); copiaBtn.type = 'button'; copiaBtn.className = 'talos-button talos-button--ghost talos-button--sm'; copiaBtn.textContent = t('chat.context.recovery.copyPath');
    copiaBtn.addEventListener('click', async () => {
      try { await (copia ? copia(info.backup) : doc.defaultView?.navigator?.clipboard?.writeText(info.backup)); copiaBtn.textContent = t('chat.common.copied'); }
      catch { copiaBtn.textContent = t('chat.context.recovery.copyFailed'); }
    });
    percorso.append(copiaBtn);
    dove.addEventListener('click', () => { const aperto = percorso.hidden; percorso.hidden = !aperto; dove.setAttribute('aria-expanded', String(aperto)); });
    azioni.append(dove);
    corpo.append(azioni, percorso);
  }
  return nota;
}

/**
 * Idempotente per chiave: la stessa riparazione rigiocata due volte resta una riga sola.
 * `inserisci(nota)` decide DOVE va la prima volta (dentro il turno aperto o in coda alla colonna); i doppioni
 * si cercano sulla colonna intera. Visto nella foto 6-riparato della 4176: una nota appesa alla colonna a
 * metà turno faceva nascere un secondo turno TALOS, con un giro in più nell'Indice dei giri.
 */
export function aggiornaNotaJournalRiparato(container, info, { inserisci = null, ...opzioni } = {}) {
  if (!container || !info) return null;
  const chiave = chiaveRiparazione(info);
  for (const nodo of container.querySelectorAll('[data-journal-riparato]')) if (nodo.dataset.journalRiparato === chiave) return nodo;
  const nota = creaNotaJournalRiparato(info, opzioni);
  if (typeof inserisci === 'function') inserisci(nota); else container.append(nota);
  return nota;
}

/* ----------------------------------------------------------------------- le due chiamate HTTP */

function guasto(codice, messaggio, status) { return Object.assign(new Error(messaggio), { code: codice, status }); }
async function chiamaPost(fetchFn, url, signal) {
  let risposta;
  try { risposta = await fetchFn(url, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal }); }
  catch (errore) { if (errore?.name === 'AbortError') throw errore; throw guasto('RETE', t('chat.context.request.connectionLost')); }
  let dati = null;
  try { dati = await risposta.json(); } catch { dati = null; }
  if (!risposta.ok || dati?.error || dati?.ok === false) throw guasto(dati?.error?.code || 'HTTP', dati?.error?.message || t('chat.common.operationFailed'), risposta.status);
  return dati;
}

/** `POST /api/v1/sessions/:id/compact` (legacy, `http-app.mjs:4955`). Torna `{ compattato }`. */
export async function compattaLegacy({ fetchFn = globalThis.fetch, base = '/api/v1', sessionId, signal } = {}) {
  if (typeof sessionId !== 'string' || !sessionId) throw guasto('SESSIONE', t('chat.context.request.openConversationToSummarize'));
  const dati = await chiamaPost(fetchFn, `${base.replace(/\/$/, '')}/sessions/${encodeURIComponent(sessionId)}/compact`, signal);
  const corpo = dati?.data ?? dati ?? {};
  const compattato = corpo.compattato === true;
  /* 26/09: la rotta risponde anche con `at` (la chiave della riga, la stessa dell'evento durevole) e i numeri stimati. */
  const intero = (n) => (Number.isSafeInteger(n) && n > 0 ? n : null);
  const testo = (x) => (typeof x === 'string' && x ? x : null);
  return compattato
    ? { compattato, at: typeof corpo.at === 'string' && corpo.at ? corpo.at : null, annullabile: corpo.annullabile !== false, tokenPrima: intero(corpo.tokenPrima), tokenDopo: intero(corpo.tokenDopo) }
    /* 22/10/2026: il perché di un «non compattato» (`motivo`, `codice`) arriva alla nota e alla finestra del Context Manager */
    : { compattato, motivo: testo(corpo.motivo), codice: testo(corpo.codice) };
}

/**
 * B1, contratto §5 (21/10/2026): «Skip» = `POST /api/v1/sessions/:id/compaction/skip`, stessa origine e stessa chiamata sorvegliata
 * delle altre (chi la usa passa `fetchSorvegliata`). Torna `{ saltato }`: `false` vuol dire che in quel momento nessun riassunto era
 * atteso. Un controllo della PERSONA sul proprio giro: il modello non ha un attrezzo per farlo.
 */
export async function saltaRiassuntoLegacy({ fetchFn = globalThis.fetch, base = '/api/v1', sessionId, signal } = {}) {
  if (typeof sessionId !== 'string' || !sessionId) throw guasto('SESSIONE', t('chat.context.live.nothingToSkip'));
  const dati = await chiamaPost(fetchFn, `${base.replace(/\/$/, '')}/sessions/${encodeURIComponent(sessionId)}/compaction/skip`, signal);
  const corpo = dati?.data ?? dati ?? {};
  return { saltato: corpo.saltato === true };
}

/** `POST /api/v1/sessions/:id/compaction/:at/undo` (rotta di F3, forma del brief). Torna i dati della busta. */
export async function annullaCompattazioneLegacy({ fetchFn = globalThis.fetch, base = '/api/v1', sessionId, at, signal } = {}) {
  if (typeof sessionId !== 'string' || !sessionId || typeof at !== 'string' || !at) throw guasto('SESSIONE', t('chat.context.request.nothingToUndo'));
  const dati = await chiamaPost(fetchFn, `${base.replace(/\/$/, '')}/sessions/${encodeURIComponent(sessionId)}/compaction/${encodeURIComponent(at)}/undo`, signal);
  return dati?.data ?? dati ?? {};
}
