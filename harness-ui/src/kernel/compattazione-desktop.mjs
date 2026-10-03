/**
 * Compattazione dell'adapter desktop — le funzioni PURE (24/09/2026, corsia F1 della fase F2).
 *
 * Nessun I/O, nessuna closure, nessuna rete: ogni funzione prende dati e ritorna dati. Chi le chiama
 * oggi è `talosHarness.desktop-hotfix.mjs` (dentro `prepare`, bloccante — il PONTE dell'onda 1); domani
 * l'onda 2 le chiamerà dal registro, in background a fine giro, e lo spostamento deve restare **solo un
 * cambio di chiamante**: per questo qui non c'è né `process.env` (a parte `leggiTettoToken`, che riceve
 * l'ambiente come argomento) né uno stato fra una chiamata e l'altra.
 *
 * Decisioni dell'owner del 24/09/2026 che questo file incarna (brief comune F2, §«decisioni»):
 *  2. soglia = il MINORE fra un tetto assoluto in token (`TALOS_COMPACTION_TOKEN_CAP`, default 200K) e 0,75
 *     della finestra del modello; emergenza a 0,90 della finestra (o tetto × 1,2 senza finestra);
 *  3. la storia grezza si conserva; si scrive un record `talos.compattazione.v1` con `coveredThrough`;
 *  4. dopo il riassunto restano alla lettera: tutti i `system` iniziali, le ultime 3 richieste della persona,
 *     gli ultimi 2 scambi chiusi, e un indice MECCANICO (percorsi, impronte, errori, ≤5 file da rileggere)
 *     che non passa dal riassuntore.
 *
 * Fonti lette il 24/09/2026 (ricerca del passo, oltre alla 10×4 di `RICERCA-10x4-CONTEXT-ENGINE-2026-09-24.md`):
 *  - Hermes `agent/context_compressor.py:2645-2651` (clone `65ad5296`): `threshold_percent: float = 0.50,
 *    protect_first_n: int = 3, protect_last_n: int = 20`, `min_tail_user_messages: int = 1`; `:789`
 *    `_SUMMARY_TOKENS_CEILING = 10_000` e `:2145` `min(int(self.context_length * 0.05), _SUMMARY_TOKENS_CEILING)`:
 *    il budget di uscita del riassunto è una FRAZIONE della finestra con un tetto — qui 2.048, dichiarato.
 *  - Hermes `agent/error_classifier.py:254-255` — i pattern dell'overflow letti nel messaggio, non nello stato:
 *    `"context length", "context size", "maximum context", "token limit", "too many tokens", "reduce the length",
 *    "exceeds the limit", "context window", "prompt is too long"`; `:635` `"context_length_exceeded"` →
 *    `_V_CONTEXT_OVERFLOW`.
 *  - OpenRouter, «Errors and debugging» (openrouter.ai/docs/api_reference/errors-and-debugging): forma
 *    `{ error: { code, message, metadata? } }`; `context_length_exceeded` → **400** «The combined input and output
 *    tokens exceed the model's context window»; nessun 413 per i prompt lunghi.
 *  - Testo reale di OpenRouter (QwenLM/qwen-code#5950, 28/06/2026): «400 This endpoint's maximum context length
 *    is 131072 tokens. However, you requested about 135349 tokens (…). Please reduce the length of either one, or
 *    use the context-compression …».
 *  - OpenRouter, «Reasoning tokens» (openrouter.ai/docs/use-cases/reasoning-tokens): `effort:'low'` ≈ 20% di
 *    `max_tokens`; i modelli senza ragionamento omettono il campo.
 *  - Claude Code, «Explore the context window» (code.claude.com/docs/en/context-window): dopo `/compact` «re-reads
 *    up to five of the files modified most recently» — da qui il tetto di 5 file «da rileggere».
 *  - Codex `codex-rs/core/src/compact.rs:60` `COMPACT_USER_MESSAGE_MAX_TOKENS: usize = 20_000`: le richieste della
 *    persona restano letterali, dalla più recente.
 *  - OpenCode `packages/core/src/session/compaction.ts:12-45`: riassunto a sezioni fisse («Keep every section, even
 *    when empty», «Preserve exact file paths… error strings»), incrementale con `<prior-summary>`.
 */
import { stimaTokenConversazione } from './talosHarness.mjs';

export const SCHEMA_RECORD_COMPATTAZIONE = 'talos.compattazione.v1';
export const VARIABILE_TETTO_TOKEN = 'TALOS_COMPACTION_TOKEN_CAP';
export const TETTO_TOKEN_DEFAULT = 200_000;
export const FRAZIONE_FINESTRA = 0.75;
export const FRAZIONE_EMERGENZA = 0.90;
export const MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA = 1.2;
export const RICHIESTE_UTENTE_LETTERALI = 3;
export const SCAMBI_CHIUSI_LETTERALI = 2;
export const FILE_RILETTI_MASSIMI = 5;
/*
 * ⛔ 2.048 token di uscita erano il tetto FISSO del riassunto fino al 02/10/2026 («da tarare sul banco GLM, non una
 *   legge»). Restano esportati come valori storici: il rapporto parole/token (1.200 / 2.048) dà ancora le parole del
 *   prompt. Il budget vero è `budgetRiassunto` qui sotto.
 */
export const MAX_TOKEN_RIASSUNTO = 2_048;
export const PAROLE_MASSIME_RIASSUNTO = 1_200;
/*
 * ⛔ 02/10/2026, owner («Come Hermes, adesso») — il budget del riassunto SCALA con ciò che riassume. Misurato sulla
 *   sessione vera b1e7382a dell'app installata: tre compattazioni su tre «troncato», ognuna `completion_tokens: 2048`
 *   e `reasoning_tokens: 0` — il tetto fisso riempito di testo VISIBILE (213.785 token da riassumere), non il
 *   ragionamento; l'unica riuscita ne aveva usati 1.570. Un riassunto troncato si scarta (giusto: `valutaRispostaDi
 *   Riassunto`), quindi la conversazione non si compattava MAI.
 * Hermes `agent/context_compressor.py:3427-3431` `_compute_summary_budget`:
 *   `max(_MIN_SUMMARY_TOKENS, min(int(content_tokens * _SUMMARY_RATIO), self.max_summary_tokens))`;
 *   `:843-846` `_MIN_SUMMARY_TOKENS = 2000`, `_SUMMARY_RATIO = 0.20`, `_SUMMARY_TOKENS_CEILING = 10_000` («Summaries above
 *   ~10K tokens are themselves a context-pressure source»); `:2222` `min(int(self.context_length * 0.05), ceiling)`.
 *   E come noi scarta il riassunto fermato dal tetto (`:160-166`, `_TRUNCATED_SUMMARY_MARKER`, da Pi #7048).
 * Senza finestra dichiarata (oggi il caso comune: `calcolaSoglie` → `finestraToken: null`) vale la finestra implicita
 *   nella soglia, soglia / `FRAZIONE_FINESTRA`: col tetto predefinito di 200.000 sono 266.666 token ⇒ il tetto 10.000.
 */
export const MIN_TOKEN_RIASSUNTO = 2_000;
export const FRAZIONE_RIASSUNTO_SUL_MEZZO = 0.20;
export const FRAZIONE_RIASSUNTO_SULLA_FINESTRA = 0.05;
export const TETTO_TOKEN_RIASSUNTO = 10_000;

/** Il budget d'uscita del riassunto e le parole da dichiarare nel prompt (stesso rapporto di 1.200 / 2.048). */
export function budgetRiassunto({ tokenDaRiassumere, finestraToken = null, soglia = null } = {}) {
  const positivo = (n) => Number.isFinite(n) && n > 0;
  const finestra = positivo(finestraToken)
    ? finestraToken
    : (positivo(soglia) ? soglia : TETTO_TOKEN_DEFAULT) / FRAZIONE_FINESTRA;
  const tetto = Math.min(Math.floor(finestra * FRAZIONE_RIASSUNTO_SULLA_FINESTRA), TETTO_TOKEN_RIASSUNTO);
  const daMezzo = positivo(tokenDaRiassumere) ? Math.floor(tokenDaRiassumere * FRAZIONE_RIASSUNTO_SUL_MEZZO) : 0;
  const maxOutputTokens = Math.max(MIN_TOKEN_RIASSUNTO, Math.min(daMezzo, tetto));
  return { maxOutputTokens, paroleMassime: Math.floor((maxOutputTokens * PAROLE_MASSIME_RIASSUNTO) / MAX_TOKEN_RIASSUNTO) };
}
/** La frase concordata con la CLI (`KERNEL_COMPACTED_MARKER_STARTS`): si scrive esattamente così. */
export const MARCATORE_RIASSUNTO = '[conversation compacted: what follows is a summary, not the original history]';
/** La forma italiana di prima. Le storie salvate sono italiane e restano tali: chi legge la riconosce per sempre. */
export const MARCATORE_RIASSUNTO_IT = '[conversazione compattata: quanto segue è un riassunto, non la cronologia originale]';
/** Il lettore a due forme: un contenuto inizia con il segno del riassunto, scritto in inglese o in italiano. */
export function iniziaConMarcatoreRiassunto(contenuto) {
  return typeof contenuto === 'string' && (contenuto.startsWith(MARCATORE_RIASSUNTO) || contenuto.startsWith(MARCATORE_RIASSUNTO_IT));
}
export const MARCATORE_INDICE = 'Mechanical index (built by the code, not by the model):';
/** La forma italiana di prima dell'indice meccanico: le storie salvate la contengono ancora. */
export const MARCATORE_INDICE_IT = 'Indice meccanico (costruito dal codice, non dal modello):';
/** Dove comincia l'indice meccanico dentro un riassunto, in una qualunque delle due forme; -1 se non c'è. */
export function posizioneIndiceMeccanico(contenuto) {
  const testo = String(contenuto ?? '');
  const posizioni = [testo.indexOf(MARCATORE_INDICE), testo.indexOf(MARCATORE_INDICE_IT)].filter((p) => p !== -1);
  return posizioni.length ? Math.min(...posizioni) : -1;
}
/** Nomi degli attrezzi che leggono o scrivono un file: i loro percorsi sono i «file da rileggere». */
export const ATTREZZI_SUI_FILE = new Set(['leggi', 'scrivi', 'file_edit']);
const CHIAVI_PERCORSO = ['percorso', 'path', 'file_path', 'filePath', 'file', 'filename', 'cartella'];
/** Le chiavi che portano un COMANDO: sono la provenienza più leggibile di un'impronta (`seq 1 20000 | md5sum`). */
const CHIAVI_COMANDO = ['comando', 'command', 'cmd', 'script'];
/*
 * ⛔ 27/09/2026, banco GLM (trascritto 4c3e1649): l'md5 di `seq 1 20000 | md5sum` stava nell'indice, NUDO, e la
 *   proiezione ha risposto «NON LO SO» alla domanda su quel comando — meccaniche 7/8 contro la soglia 0,95. Il prompt
 *   dice al riassuntore di non ripetere le impronte (le tiene il codice) e l'indice non diceva da dove venivano: il
 *   legame non lo teneva nessuno. Cura (owner, 27/09, «cura nostra»): ogni impronta porta l'attrezzo e l'argomento
 *   che l'ha prodotta. Hermes tiene le impronte nude nell'«Anchor Index» (`agent/context_compressor.py:1016-1025`,
 *   budget 7.000 caratteri) e affida il legame al riassunto («PRESERVE EXACTLY: … commands, … SHAs», `:1008`): qui il
 *   legame lo fa il codice, senza token d'uscita in più. Tetto: 240 caratteri per provenienza, 20 impronte ⇒ ≤ ~6 KB.
 */
const CARATTERI_PROVENIENZA = 240;
/*
 * ⛔ 27/09/2026, banco dei mille giri: con «oltre 20 si scarta» le 20 impronte del record erano le PRIME della sessione per
 *   sempre — dopo 111 compattazioni l'indice parlava ancora dei giri 1-20 e di nessuno recente. Owner: le 20 più RECENTI
 *   (Hermes ordina per frequenza e poi per recenza, `_build_anchor_index`, `agent/context_compressor.py:1033-1049`).
 *   L'insieme è in ordine d'inserimento = cronologico (prima il precedente, poi il mezzo): al tetto esce la più vecchia.
 */
const IMPRONTE_MASSIME = 20;
const ERRORI_MASSIMI = 20;

const PATTERN_CONTESTO_PIENO = [
  /context[_ ]length[_ ]exceeded/i,
  /maximum context length/i,
  /context (?:length|size|window)/i,
  /too many tokens/i,
  /token limit/i,
  /prompt is too long/i,
  /input is too long/i,
  /exceeds? the (?:maximum|max)(?: number of)?(?: input)? tokens/i,
  /max_model_len/i,
  /reduce the length/i,
  // 25/09/2026 sera: il motore locale pieno sale col SUO codice (`runtime-owner-adapter.mjs`, ContestoLocalePienoError)
  /\bLOCAL_CONTEXT_EXCEEDED\b/,
];

function eSistema(m) { return m?.role === 'system'; }

/** Il tetto assoluto in token: `TALOS_COMPACTION_TOKEN_CAP`, intero positivo; tutto il resto → default. */
export function leggiTettoToken(env = {}) {
  const grezzo = env?.[VARIABILE_TETTO_TOKEN];
  if (grezzo === undefined || grezzo === null || String(grezzo).trim() === '') return TETTO_TOKEN_DEFAULT;
  const testo = String(grezzo).trim();
  /* Solo cifre: `1e3` o `1.5` non sono un tetto scritto apposta, e un valore letto male non deve diventare uno strano. */
  if (!/^\d+$/.test(testo)) return TETTO_TOKEN_DEFAULT;
  const valore = Number(testo);
  if (!Number.isSafeInteger(valore) || valore <= 0) return TETTO_TOKEN_DEFAULT;
  return valore;
}

/** Solo un tetto impostato deliberatamente; l'assenza non limita una finestra verificata. */
export function leggiTettoEsplicito(env = {}) {
  const grezzo = env?.[VARIABILE_TETTO_TOKEN];
  if (grezzo === undefined || grezzo === null || String(grezzo).trim() === '') return null;
  const testo = String(grezzo).trim();
  if (!/^\d+$/.test(testo)) return null;
  const valore = Number(testo);
  return Number.isSafeInteger(valore) && valore > 0 ? valore : null;
}

/**
 * Le due soglie. `finestraToken` è la finestra del modello dal catalogo (`model-catalog.mjs`, `contextLength`):
 * oggi l'adapter riceve `null` (la cabla l'onda 2), e con `null` vale il solo tetto.
 */
export function calcolaSoglie({ tettoToken = null, finestraToken = null } = {}) {
  const tettoEsplicito = Number.isSafeInteger(tettoToken) && tettoToken > 0 ? tettoToken : null;
  const finestra = Number.isFinite(finestraToken) && finestraToken > 0 ? finestraToken : null;
  if (finestra === null) {
    const soglia = tettoEsplicito ?? TETTO_TOKEN_DEFAULT;
    return { soglia, warningTokens: Math.floor(soglia * 0.8), emergenza: Math.ceil(soglia * MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA), fonte: tettoEsplicito === null ? 'fallback' : 'tetto', tettoToken: soglia, finestraToken: null };
  }
  const daFinestra = Math.floor(finestra * FRAZIONE_FINESTRA);
  const soglia = tettoEsplicito === null ? daFinestra : Math.min(tettoEsplicito, daFinestra);
  return { soglia, warningTokens: Math.floor(soglia * 0.8), emergenza: Math.floor(finestra * FRAZIONE_EMERGENZA), fonte: tettoEsplicito !== null && soglia === tettoEsplicito ? 'tetto' : 'finestra', tettoToken: tettoEsplicito, finestraToken: finestra };
}

/**
 * Quanto occupa la richiesta che sta per partire. `ancora` è il numero VERO del fornitore
 * (`usage.prompt_tokens` dell'ultima risposta) con la lunghezza della lista che l'aveva prodotto; i messaggi
 * aggiunti dopo si stimano (caratteri/4). Senza ancora — prima risposta del turno, fornitore che non lo dà,
 * lista più corta dell'ancora (è appena stata compattata) — si stima tutto e lo si dichiara.
 * Forma presa da Hermes (`website/docs/developer-guide/context-compression-and-caching.md:107-116`, «usage anchor»).
 */
export function misuraOccupazione({ ancora = null, messaggi = [], finestraToken = null } = {}) {
  const promptTokens = Number(ancora?.promptTokens);
  const lunghezza = Number(ancora?.lunghezza);
  const stimaAllora = Number(ancora?.stima);
  /*
   * ⛔ Un numero del fornitore IMPOSSIBILE non si crede: la sonda della ricognizione rispondeva `prompt_tokens: 1` a
   *   richieste da migliaia di token e l'ancora spegneva la compattazione per sempre; anomalyco/opencode#50474
   *   (22/09/2026) ha visto il contrario, 24-32× la finestra, e un ciclo infinito. Sotto un quarto della stima
   *   (nessun tokenizzatore reale sta sotto ~1 token per 16 caratteri) o sopra la finestra dichiarata ⇒ si stima.
   */
  const plausibile = Number.isFinite(promptTokens) && promptTokens > 0
    && (!Number.isFinite(stimaAllora) || stimaAllora <= 0 || promptTokens >= stimaAllora / 4)
    && (!Number.isFinite(finestraToken) || finestraToken <= 0 || promptTokens <= finestraToken);
  if (plausibile && Number.isInteger(lunghezza) && lunghezza >= 0 && messaggi.length >= lunghezza) {
    return { token: promptTokens + stimaTokenConversazione(messaggi.slice(lunghezza)), misura: 'fornitore' };
  }
  return { token: stimaTokenConversazione(messaggi), misura: 'stimato' };
}

/**
 * Scatta o no. `tentativiEsauriti` = in questo turno la via normale ha già fallito (o si è rivelata
 * inefficace due volte): allora resta solo l'emergenza. Fuori da qui non esiste nessun «ogni N richieste».
 */
export function decidiCompattazione({ token, soglia, emergenza, tentativiEsauriti = false, emergenzaEsaurita = false } = {}) {
  if (!Number.isFinite(token)) return { scatta: false, motivo: null };
  if (token >= emergenza && !emergenzaEsaurita) return { scatta: true, motivo: 'emergenza' };
  if (token >= soglia && !tentativiEsauriti) return { scatta: true, motivo: 'soglia' };
  return { scatta: false, motivo: null };
}

/**
 * Gli effimeri sono i `system` accodati DOPO l'ultimo messaggio non di sistema (il «Modalità Piano attiva…» di
 * `talosHarness.mjs:8216-8220`): non entrano nel prefisso compattato né nell'archivio. Si staccano prima e si
 * riattaccano dopo, nello stesso ordine.
 */
export function staccaEffimeri(messaggi) {
  if (!Array.isArray(messaggi)) return { messaggi: [], effimeri: [] };
  let ultimoNonSistema = -1;
  for (let i = messaggi.length - 1; i >= 0; i -= 1) {
    if (!eSistema(messaggi[i])) { ultimoNonSistema = i; break; }
  }
  if (ultimoNonSistema === -1 || ultimoNonSistema === messaggi.length - 1) return { messaggi, effimeri: [] };
  return { messaggi: messaggi.slice(0, ultimoNonSistema + 1), effimeri: messaggi.slice(ultimoNonSistema + 1) };
}

export function riattaccaEffimeri(messaggi, effimeri) {
  if (!Array.isArray(effimeri) || effimeri.length === 0) return messaggi;
  return [...messaggi, ...effimeri];
}

/** Una richiesta della persona: `user` che non è un nostro riassunto. */
export function eRichiestaDellaPersona(m) {
  return m?.role === 'user' && typeof m.content === 'string' && !iniziaConMarcatoreRiassunto(m.content);
}

/**
 * Divide la lista in testa (tutti i `system` iniziali), mezzo (ciò che si riassume) e coda (gli ultimi
 * `scambiChiusi` scambi, alla lettera). Uno scambio comincia a un messaggio `assistant`; il taglio non cade mai
 * su un `tool`, così nessun risultato resta orfano dal suo `tool_calls` (K5 della ricognizione).
 *
 * Le ultime `richiesteUtente` richieste della persona restano alla lettera OVUNQUE stiano: quelle nella coda ci
 * sono già; quelle nel mezzo vengono estratte in `richiesteLetterali` (nel loro ordine) e la proiezione le mette
 * PRIMA del riassunto — così la consegna di un turno lungo (K3: era l'unica richiesta e veniva buttata) resta
 * parola per parola anche quando tutto il resto del mezzo è riassunto. Forma presa da Codex
 * (`compact.rs:60`, richieste della persona letterali dalla più recente).
 * `tagliabile:false` quando il mezzo non ha niente da riassumere.
 */
export function dividiPerCompattazione(messaggi, { richiesteUtente = RICHIESTE_UTENTE_LETTERALI, scambiChiusi = SCAMBI_CHIUSI_LETTERALI } = {}) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  let fineTesta = 0;
  while (fineTesta < lista.length && eSistema(lista[fineTesta])) fineTesta += 1;
  const testa = lista.slice(0, fineTesta);
  const corpo = lista.slice(fineTesta);

  /*
   * 24/09/2026, review del coordinatore — UNO SCAMBIO COMINCIA DOVE QUALCUNO CHIEDE QUALCOSA: una richiesta della
   * persona, o una chiamata di attrezzo dell'assistente (`tool_calls`). La prima forma contava OGNI `assistant`, anche
   * il testo finale: con «richiesta → chiamata → esito → testo» la coda teneva metà di quanto la decisione dell'owner
   * (24/09: «ultimi 2 scambi chiusi») intende. Contare solo gli inizi tiene interi due scambi veri sia in una sessione
   * di turni corti (la penultima richiesta e tutto ciò che segue) sia in un turno lungo di sole chiamate (le ultime
   * due chiamate coi loro esiti). Un taglio su un inizio non spezza mai una chiamata: i `tool` seguono il loro `assistant`.
   */
  const inizioScambio = (m) => eRichiestaDellaPersona(m) || (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
  let taglio = 0;
  let vistiScambi = 0;
  for (let i = corpo.length - 1; i >= 0; i -= 1) {
    if (inizioScambio(corpo[i])) {
      vistiScambi += 1;
      if (vistiScambi === scambiChiusi) { taglio = i; break; }
    }
  }
  const mezzo = corpo.slice(0, taglio);
  const coda = corpo.slice(taglio);

  const utentiInCoda = coda.filter(eRichiestaDellaPersona).length;
  const daTenere = Math.max(0, richiesteUtente - utentiInCoda);
  const richiesteLetterali = daTenere === 0 ? [] : mezzo.filter(eRichiestaDellaPersona).slice(-daTenere);
  const tagliabile = mezzo.length >= 2 && mezzo.some((m) => m?.role !== 'user');
  return { testa, mezzo, coda, richiesteLetterali, tagliabile };
}

function percorsiDaArgomenti(argomenti) {
  let args = argomenti;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return []; } }
  if (!args || typeof args !== 'object') return [];
  const trovati = [];
  for (const chiave of CHIAVI_PERCORSO) {
    if (typeof args[chiave] === 'string' && args[chiave].trim()) trovati.push(args[chiave].trim());
  }
  return trovati;
}

/**
 * Da dove viene un risultato: il nome dell'attrezzo e l'argomento che lo dice meglio — il comando, se c'è, poi il
 * percorso, poi l'intero argomento compattato — su una riga sola e al più `CARATTERI_PROVENIENZA` caratteri.
 */
function provenienzaDellaChiamata(chiamata) {
  const nome = typeof chiamata?.function?.name === 'string' && chiamata.function.name ? chiamata.function.name : 'attrezzo';
  let args = chiamata?.function?.arguments;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { /* resta la stringa grezza */ } }
  let estratto = '';
  if (args && typeof args === 'object') {
    const chiave = [...CHIAVI_COMANDO, ...CHIAVI_PERCORSO].find((k) => typeof args[k] === 'string' && args[k].trim());
    estratto = chiave ? args[chiave] : (Object.keys(args).length ? JSON.stringify(args) : '');
  } else if (typeof args === 'string') {
    estratto = args;
  }
  estratto = String(estratto ?? '').replace(/\s+/g, ' ').trim();
  if (estratto.length > CARATTERI_PROVENIENZA) estratto = `${estratto.slice(0, CARATTERI_PROVENIENZA - 1)}…`;
  return estratto ? `${nome} «${estratto}»` : nome;
}

/**
 * L'indice meccanico: percorsi dagli argomenti degli attrezzi, impronte (hex 7-64 con almeno una cifra e una
 * lettera: SHA git/sha256, non gli id `call_…` né i numeri) CON LA LORO PROVENIENZA, righe di errore
 * (`Error`/`ERR_`/`✗`), e i percorsi degli ultimi ≤5 file letti/scritti (solo i percorsi: rileggere il contenuto è
 * dell'onda 2, che ha il disco). Costruito dal CODICE: non passa dal riassuntore (Factory, «Artifact tracking
 * remains an unsolved problem»).
 */
export function indiceMeccanico(messaggi, { fileRilettiMassimi = FILE_RILETTI_MASSIMI, precedente = null } = {}) {
  /* L'indice della compattazione PRECEDENTE (dal record) si fonde: il mezzo di oggi è già una proiezione e non
   * contiene più le chiamate di allora. Fusione meccanica, mai per mano del modello. */
  const percorsi = new Set(Array.isArray(precedente?.percorsi) ? precedente.percorsi : []);
  const impronte = new Set(Array.isArray(precedente?.impronte) ? precedente.impronte : []);
  /* impronta → provenienza. Un record scritto prima del 27/09 non ha `origini`: le sue impronte restano senza. */
  const origini = new Map();
  if (precedente?.origini && typeof precedente.origini === 'object') {
    for (const [impronta, da] of Object.entries(precedente.origini)) {
      if (impronte.has(impronta) && typeof da === 'string' && da) origini.set(impronta, da);
    }
  }
  const errori = new Set(Array.isArray(precedente?.errori) ? precedente.errori : []);
  const suiFile = Array.isArray(precedente?.fileRiletti) ? [...precedente.fileRiletti].reverse() : [];
  const IMPRONTA = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}\b/g;
  /*
   * ⛔ 27/09/2026, banco GLM (trascritto 4c3e1649): «Errori visti: (nessuno)» su una storia con 12 risposte d'attrezzo fallite —
   *   il pattern conosceva `Error`/`ERR_`/`✗` e i NOSTRI attrezzi scrivono `error: ENOENT: no such file or directory, open '…'`
   *   (minuscolo, `leggi`/`scrivi`) e `exit 1 [sandbox: wsl2]` (la shell, uscita diversa da zero). Ora li riconosce, e — come per
   *   le impronte — accanto all'errore sta l'attrezzo e l'argomento che l'ha prodotto (senza, «exit 1 [sandbox: wsl2]» non dice
   *   niente). Al tetto esce il più vecchio, come per le impronte.
   */
  const ERRORE = /^\s*(?:\w*error\b|ERR_[A-Z_]+|✗|exit [1-9]\d* \[sandbox\b)/i; // `\w*error`: anche AssertionError/TypeError… (Hermes `[A-Z][a-zA-Z]*Error`)
  const chiamatePerId = new Map();
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    for (const c of m?.tool_calls ?? []) {
      if (typeof c?.id === 'string') chiamatePerId.set(c.id, c);
      const trovati = percorsiDaArgomenti(c?.function?.arguments);
      for (const p of trovati) percorsi.add(p);
      if (ATTREZZI_SUI_FILE.has(c?.function?.name) && trovati[0]) suiFile.push(trovati[0]);
    }
    if (typeof m?.content !== 'string' || !m.content) continue;
    if (m.role === 'tool' || m.role === 'assistant') {
      const da = m.role === 'assistant'
        ? 'assistant text'
        : (chiamatePerId.has(m.tool_call_id) ? provenienzaDellaChiamata(chiamatePerId.get(m.tool_call_id)) : 'tool result');
      for (const hit of m.content.match(IMPRONTA) ?? []) {
        if (impronte.has(hit)) continue;
        if (impronte.size >= IMPRONTE_MASSIME) {
          const piuVecchia = impronte.values().next().value;
          impronte.delete(piuVecchia);
          origini.delete(piuVecchia);
        }
        impronte.add(hit);
        origini.set(hit, da);
      }
      for (const riga of m.content.split(/\r?\n/)) {
        if (!ERRORE.test(riga)) continue;
        const voce = m.role === 'tool' ? `${riga.trim().slice(0, 200)} ← ${da}` : riga.trim().slice(0, 200);
        if (errori.has(voce)) continue;
        if (errori.size >= ERRORI_MASSIMI) errori.delete(errori.values().next().value);
        errori.add(voce);
      }
    }
  }
  const fileRiletti = [];
  for (let i = suiFile.length - 1; i >= 0 && fileRiletti.length < fileRilettiMassimi; i -= 1) {
    if (!fileRiletti.includes(suiFile[i])) fileRiletti.push(suiFile[i]);
  }
  const riga = (titolo, valori) => `- ${titolo}: ${valori.length ? valori.join(' · ') : '(none)'}`;
  /* Le impronte si raggruppano per provenienza: un comando lungo che ne produce tre si scrive una volta sola. */
  const perProvenienza = new Map();
  for (const impronta of impronte) {
    const da = origini.get(impronta) ?? 'origin not recorded (earlier compaction)';
    if (!perProvenienza.has(da)) perProvenienza.set(da, []);
    perProvenienza.get(da).push(impronta);
  }
  const righeImpronte = impronte.size
    ? ['- Fingerprints found in the results, with what produced them:', ...[...perProvenienza].map(([da, lista]) => `  · ${da}: ${lista.join(' · ')}`)]
    : [riga('Fingerprints found in the results', [])];
  const testo = [
    MARCATORE_INDICE,
    riga('Paths touched', [...percorsi].slice(0, 60)),
    riga('Files to re-read before writing to them (last read/written)', fileRiletti),
    ...righeImpronte,
    riga('Errors seen', [...errori]),
  ].join('\n');
  return { testo, percorsi: [...percorsi], impronte: [...impronte], origini: Object.fromEntries(origini), errori: [...errori], fileRiletti };
}

/**
 * Il prompt di riassunto: strutturato a sezioni fisse, incrementale se nel mezzo c'è già un riassunto precedente,
 * col budget di uscita dichiarato. In inglese come il resto dei prompt del kernel (il modello lavora in inglese).
 */
export function testoRichiestaDiRiassunto({ paroleMassime = PAROLE_MASSIME_RIASSUNTO, haRiassuntoPrecedente = false } = {}) {
  return [
    'CONTEXT COMPACTION. The conversation above is about to be replaced by your summary: everything you do not',
    'mention is lost. The system messages, the last user requests, the last two exchanges and a mechanical index',
    'of file paths/hashes/errors are kept verbatim by the code — do NOT repeat them, spend your budget on the rest.',
    haRiassuntoPrecedente
      ? 'A previous summary is already in the conversation: MERGE it with what happened after it into one summary.'
      : '',
    '',
    'Write exactly these five sections, keep every heading even when empty:',
    '## Objective — what the person asked for, in their words when possible',
    '## Decisions — choices made and why (including what was tried and rejected)',
    '## Constraints — rules, limits and preferences stated by the person or found in the project',
    '## Done — what is verifiably done, with the real state of the files as you last saw it',
    '## Open — what is still to do, the next single step, and anything unverified',
    '',
    `Budget: at most ${paroleMassime} words in total. Preserve exact file paths, identifiers, error strings and`,
    'numbers. Reply with ONLY the summary. Do not call any tool in this turn.',
  ].filter((r) => r !== '').join('\n');
}

/** Il riassunto precedente entra nel riassuntore SENZA il suo indice meccanico: l'indice si fonde per codice. */
function senzaIndice(m) {
  if (m?.role !== 'user' || typeof m.content !== 'string' || !iniziaConMarcatoreRiassunto(m.content)) return m;
  const posizione = posizioneIndiceMeccanico(m.content);
  return posizione === -1 ? m : { ...m, content: m.content.slice(0, posizione).trimEnd() };
}

export function costruisciRichiestaDiRiassunto({ testa = [], mezzo = [], paroleMassime = PAROLE_MASSIME_RIASSUNTO } = {}) {
  const haRiassuntoPrecedente = mezzo.some((m) => m?.role === 'user' && typeof m.content === 'string' && iniziaConMarcatoreRiassunto(m.content));
  return [...testa, ...mezzo.map(senzaIndice), { role: 'user', content: testoRichiestaDiRiassunto({ paroleMassime, haRiassuntoPrecedente }) }];
}

/** Una risposta del riassuntore vale solo se è testo, finito, senza chiamate di attrezzo. */
export function valutaRispostaDiRiassunto({ scelta, finishReason } = {}) {
  if (Array.isArray(scelta?.tool_calls) && scelta.tool_calls.length > 0) return { ok: false, riassunto: '', motivo: 'attrezzo' };
  if (finishReason !== null && finishReason !== undefined && finishReason !== 'stop') return { ok: false, riassunto: '', motivo: 'troncato' };
  const riassunto = String(scelta?.content ?? '').trim();
  if (!riassunto) return { ok: false, riassunto: '', motivo: 'vuoto' };
  return { ok: true, riassunto, motivo: null };
}

/*
 * IL RIASSUNTO SI CONTA MENTRE SI SCRIVE — lane CLI, 03/10/2026 (decisione dell'owner «foglio subito + patch per il
 *   conteggio»): il mockup del `/compact` mostra «Writing the summary ↓ 3.2k tokens» che sale dal vivo, come lo spinner di
 *   Claude Code 2.1.283 («counts the summary's tokens as they stream», changelog, letto il 03/10/2026). Hermes dice solo
 *   lo stato e un battito «still summarizing» (`agent/conversation_compression.py:65-71`, clone `65ad529`), senza numero.
 * ⇒ Il riassunto viaggia in streaming e i pezzi si contano: ~4 caratteri per token (la stessa stima di `stimaToken` del
 *   kernel), dichiarata `stimato: true`. Alla fine vale il numero del fornitore (`usage.completion_tokens`, l'ultimo pezzo
 *   del flusso con `stream_options.include_usage`: OpenRouter, «API reference — streaming», letto il 03/10/2026), con
 *   `stimato: false`. Contano anche i pezzi di ragionamento: sono token in uscita come il testo, e il numero finale li
 *   comprende.
 * ⛔ Al massimo un avviso ogni `intervalloMs` (250 ms: quattro al secondo, la richiesta della CLI), più quello finale.
 *   Niente timer: un pezzo che arriva troppo presto si conta e basta, e lo dirà il prossimo avviso.
 * ⛔ Un osservatore che lancia non decide l'esito del riassunto.
 */
export const INTERVALLO_PROGRESSO_RIASSUNTO_MS = 250;
/** L'evento AG-UI `CUSTOM` dei passi di una compattazione: effimero, mai su disco (`session-registry.mjs`, `consegnaEvento`). */
export const NOME_EVENTO_PROGRESSO_COMPATTAZIONE = 'talos.compattazione-progresso';

export function creaContatoreRiassunto({ emetti, tentativo = 1, intervalloMs = INTERVALLO_PROGRESSO_RIASSUNTO_MS, ora = () => Date.now() } = {}) {
  let caratteri = 0;
  let ultimoAvviso = null;
  const avvisa = (valore) => {
    try { emetti?.({ fase: 'riassunto', tentativo, ...valore }); } catch { /* osservatore isolato */ }
  };
  return {
    onDelta(evento) {
      if (evento?.tipo !== 'testo' && evento?.tipo !== 'ragionamento') return;
      caratteri += String(evento.delta ?? '').length;
      const adesso = ora();
      if (ultimoAvviso !== null && adesso - ultimoAvviso < intervalloMs) return;
      ultimoAvviso = adesso;
      avvisa({ tokenRiassunto: Math.ceil(caratteri / 4), stimato: true });
    },
    /** La risposta è arrivata (riuscita o no): il numero del fornitore se c'è, altrimenti l'ultima stima. */
    chiudi(usage) {
      const veri = Number(usage?.completion_tokens);
      if (Number.isSafeInteger(veri) && veri >= 0) avvisa({ tokenRiassunto: veri, stimato: false });
      else avvisa({ tokenRiassunto: Math.ceil(caratteri / 4), stimato: true });
    },
  };
}

/**
 * La proiezione: testa alla lettera, le richieste della persona estratte dal mezzo alla lettera, UN messaggio
 * `user` con riassunto + indice, coda alla lettera. Un messaggio solo per riassunto e indice: due `user` di fila
 * in più non aggiungono niente e qualche fornitore li accetta male.
 */
export function costruisciProiezione({ testa = [], richiesteLetterali = [], riassunto = '', indice = '', coda = [] } = {}) {
  const contenuto = [MARCATORE_RIASSUNTO, String(riassunto ?? '').trim(), String(indice ?? '').trim()].filter(Boolean).join('\n\n');
  return [...testa, ...richiesteLetterali, { role: 'user', content: contenuto }, ...coda];
}

/*
 * ⛔⛔ LA CODA LETTERALE NON È UN PAVIMENTO — owner 26/09/2026 («Come Hermes»), cura del difetto misurato sul 4174 il
 *   24/09 (ledger F2 onda 2 §8): gli ultimi 2 scambi tenuti alla lettera COI LORO ESITI INTERI superavano da soli il tetto
 *   (due letture da ~15K token contro 20K), la proiezione restava a 30.142, due verdetti «inefficace» spegnevano la
 *   compattazione e il giro saliva fino a 581.089 token (riproduzione `.claude/RIPRODUZIONE-CRESCITA-SENZA-
 *   COMPATTAZIONE-2026-09-24.mjs 20000 60000 40`). Sul 4174: 1,16 milioni, l'89% della finestra.
 *
 * Forma presa da Hermes (clone `65ad529`, `agent/context_compressor.py`):
 *  - `:2132` il budget della coda è una FRAZIONE della soglia (`summary_target_ratio` 0,20), `:3055-3063` con un tetto
 *    morbido di 1,5× («so whole rows are kept»);
 *  - `:3065-3113` pass 4 (#61932): quando la sola coda protetta supera il tetto morbido, si riducono gli esiti degli
 *    attrezzi DENTRO la coda, tenendo intatti gli ultimi `_PRESSURE_KEEP_RECENT_MESSAGES = 3`; se non basta, tutti
 *    tranne il più recente; come ultima risorsa anche il più recente;
 *  - `:2991-3006` pass 1: di due esiti IDENTICI resta il più recente, il vecchio diventa un rimando;
 *  - `:3009-3022` gli argomenti enormi delle chiamate (il contenuto di una scrittura) si accorciano DENTRO il JSON, così
 *    resta valido («otherwise providers 400 on every turn»).
 * ⇒ Adattato, non copiato: Hermes rimpiazza l'esito con UNA riga di riassunto; qui l'owner ha scelto **inizio e fine più
 *   un rimando** (26/09), perché l'inizio di un file e la coda di un comando sono quasi sempre le parti che servono.
 *   La storia grezza resta intera (decisione 3): il rimando lo dice al modello.
 */
export const FRAZIONE_CODA = 0.20;
export const MOLTIPLICATORE_CODA_MORBIDA = 1.5;
export const MESSAGGI_RECENTI_INTATTI = 3;
export const CARATTERI_INIZIO_ESITO = 1_200;
export const CARATTERI_FINE_ESITO = 400;
/** Sotto questa lunghezza un esito non si tocca: accorciarlo risparmierebbe meno del rimando che lo sostituisce. */
export const CARATTERI_MINIMI_RIDUCIBILI = 2_000;
export const MARCATORE_ACCORCIATO = 'characters omitted to fit the context window';
export const ESITO_DOPPIONE = '[Duplicate tool output: identical to a more recent result below, removed to fit the context window]';

/** Il budget in token della coda letterale: la frazione di Hermes della soglia, mai meno di 1. */
export function budgetCoda(soglia) {
  const s = Number(soglia);
  return Number.isFinite(s) && s > 0 ? Math.max(1, Math.floor(s * FRAZIONE_CODA)) : 1;
}

/**
 * Inizio e fine di un testo lungo, col rimando in mezzo. Idempotente: un testo già accorciato è sotto la soglia
 * dei riducibili e torna com'è (misurato nella prova, non presunto).
 */
export function accorciaTesto(testo, { inizio = CARATTERI_INIZIO_ESITO, fine = CARATTERI_FINE_ESITO } = {}) {
  if (typeof testo !== 'string' || testo.length < CARATTERI_MINIMI_RIDUCIBILI || testo.length <= inizio + fine) return testo;
  const tolti = testo.length - inizio - fine;
  return `${testo.slice(0, inizio)}\n[… ${tolti.toLocaleString('en-US')} ${MARCATORE_ACCORCIATO} (TALOS context projection, not a byte range). Original message kept in session history. Use leggi (offset/limit are lines; byteOffset continues inside an over-long line), or process_output when outputId is available. Do not re-run a command to recover omitted bytes.]\n${testo.slice(-fine)}`;
}

/** Gli argomenti di una chiamata si accorciano DENTRO il JSON (Hermes `:3009-3022`): una stringa JSON rotta farebbe 400. */
function accorciaArgomenti(argomenti) {
  if (typeof argomenti !== 'string' || argomenti.length < CARATTERI_MINIMI_RIDUCIBILI) return argomenti;
  let oggetto;
  try { oggetto = JSON.parse(argomenti); } catch { return argomenti; }
  if (!oggetto || typeof oggetto !== 'object' || Array.isArray(oggetto)) return argomenti;
  let cambiato = false;
  const nuovo = {};
  for (const [chiave, valore] of Object.entries(oggetto)) {
    const corto = typeof valore === 'string' ? accorciaTesto(valore) : valore;
    if (corto !== valore) cambiato = true;
    nuovo[chiave] = corto;
  }
  return cambiato ? JSON.stringify(nuovo) : argomenti;
}

/** Riduce il messaggio `i` (esito o chiamata) in una copia della lista; true se è cambiato qualcosa. */
function riduciAl(lista, i) {
  const m = lista[i];
  if (m?.role === 'tool' && typeof m.content === 'string') {
    const corto = accorciaTesto(m.content);
    if (corto === m.content) return false;
    lista[i] = { ...m, content: corto };
    return true;
  }
  if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
    let cambiato = false;
    const chiamate = m.tool_calls.map((c) => {
      const args = c?.function?.arguments;
      const corti = accorciaArgomenti(args);
      if (corti === args) return c;
      cambiato = true;
      return { ...c, function: { ...c.function, arguments: corti } };
    });
    if (!cambiato) return false;
    lista[i] = { ...m, tool_calls: chiamate };
    return true;
  }
  return false;
}

/**
 * La coda letterale sotto pressione (owner 26/09, «Come Hermes»). Se la coda sta sotto il tetto morbido
 * (`budgetToken × 1,5`) torna IDENTICA (stesso oggetto: nessuna rottura della cache del prompt per niente). Altrimenti,
 * in quest'ordine e fermandosi appena rientra: doppioni → esiti e argomenti fuori dagli ultimi 3 messaggi → tutti
 * tranne l'esito più recente → anche il più recente. `alMinimo` = anche così non rientra: davanti c'è solo ciò che non
 * si comprime più, ed è l'UNICO caso in cui chi chiama può smettere di compattare.
 * ⛔ Cambia solo i `content` e gli `arguments`: nessun messaggio sparisce, nessuna coppia chiamata/esito si spezza.
 */
export function riduciCodaSottoPressione(coda, { budgetToken, stima = stimaTokenConversazione } = {}) {
  const lista = Array.isArray(coda) ? coda : [];
  const tetto = Math.floor(Math.max(1, Number(budgetToken) || 1) * MOLTIPLICATORE_CODA_MORBIDA);
  if (stima(lista) <= tetto) return { coda: lista, ridotti: 0, alMinimo: false, tetto };
  const copia = [...lista];
  let ridotti = 0;
  const rientra = () => stima(copia) <= tetto;

  /* Doppioni: di due esiti identici resta il più recente (Hermes pass 1). */
  const visti = new Set();
  for (let i = copia.length - 1; i >= 0; i -= 1) {
    const m = copia[i];
    if (m?.role !== 'tool' || typeof m.content !== 'string' || m.content.length < CARATTERI_MINIMI_RIDUCIBILI) continue;
    if (visti.has(m.content)) { copia[i] = { ...m, content: ESITO_DOPPIONE }; ridotti += 1; } else visti.add(m.content);
  }
  if (rientra()) return { coda: copia, ridotti, alMinimo: false, tetto };

  const fineVecchi = Math.max(0, copia.length - MESSAGGI_RECENTI_INTATTI);
  for (let i = 0; i < fineVecchi && !rientra(); i += 1) if (riduciAl(copia, i)) ridotti += 1;
  if (rientra()) return { coda: copia, ridotti, alMinimo: false, tetto };

  let ultimoEsito = -1;
  for (let i = copia.length - 1; i >= 0; i -= 1) if (copia[i]?.role === 'tool') { ultimoEsito = i; break; }
  for (let i = 0; i < copia.length && !rientra(); i += 1) if (i !== ultimoEsito && riduciAl(copia, i)) ridotti += 1;
  if (!rientra() && ultimoEsito >= 0 && riduciAl(copia, ultimoEsito)) ridotti += 1;
  return { coda: copia, ridotti, alMinimo: !rientra(), tetto };
}

/**
 * Il record di compattazione (decisione 3): la storia grezza resta com'è, questo dice come proiettarla.
 * `coveredThrough` = quanti messaggi GREZZI (senza effimeri) la proiezione copre; `riassunto` = i messaggi che li
 * sostituiscono. `tokenDopo` è sempre una stima (caratteri/4): il numero vero arriva con la risposta successiva.
 */
export function creaRecord({ coveredThrough, riassunto, tokenPrima, tokenDopo, misura, at, modello, indice = null } = {}) {
  if (!Number.isInteger(coveredThrough) || coveredThrough < 0) throw new TypeError('coveredThrough must be an integer ≥ 0');
  if (!Array.isArray(riassunto)) throw new TypeError('riassunto must be a list of messages');
  return {
    schema: SCHEMA_RECORD_COMPATTAZIONE,
    coveredThrough,
    riassunto: riassunto.map((m) => ({ ...m })),
    tokenPrima: Number.isFinite(tokenPrima) ? tokenPrima : null,
    tokenDopo: Number.isFinite(tokenDopo) ? tokenDopo : null,
    misura: misura === 'fornitore' ? 'fornitore' : 'stimato',
    at: typeof at === 'string' && at ? at : new Date().toISOString(),
    modello: typeof modello === 'string' ? modello : null,
    /* Campo in più rispetto al brief (additivo): l'indice strutturato, per fonderlo alla compattazione dopo. */
    indice: indice && typeof indice === 'object'
      ? {
        percorsi: [...(indice.percorsi ?? [])],
        impronte: [...(indice.impronte ?? [])],
        /* 27/09: la provenienza delle impronte, perché la fusione alla compattazione dopo non la perda. */
        origini: indice.origini && typeof indice.origini === 'object' ? { ...indice.origini } : {},
        errori: [...(indice.errori ?? [])],
        fileRiletti: [...(indice.fileRiletti ?? [])],
      }
      : null,
  };
}

export function eRecordValido(record) {
  return !!record && record.schema === SCHEMA_RECORD_COMPATTAZIONE
    && Number.isInteger(record.coveredThrough) && record.coveredThrough >= 0 && Array.isArray(record.riassunto);
}

/**
 * Rifà la proiezione dalla storia grezza: ciò che il record copre viene sostituito dal suo `riassunto`, il resto
 * segue alla lettera. Un record che copre più di quanto la storia contenga non si applica (storia troncata o
 * record di un'altra storia): si torna la storia grezza, e chi chiama lo vede dalla lunghezza.
 * Basta l'ULTIMO record: il suo `riassunto` è già la proiezione intera al momento in cui è nato.
 */
export function applicaRecord(storiaGrezza, record) {
  const storia = Array.isArray(storiaGrezza) ? storiaGrezza : [];
  if (!eRecordValido(record) || record.coveredThrough > storia.length) return storia;
  return [...record.riassunto, ...storia.slice(record.coveredThrough)];
}

/**
 * Classifica un errore del fornitore: `'contesto-pieno'` quando il messaggio porta una delle forme reali
 * dell'overflow (OpenRouter/OpenAI `context_length_exceeded`, «maximum context length is N tokens», ecc.) o lo
 * stato è 413. Un 400 senza quelle parole NON è overflow (può essere un argomento malformato).
 */
export function classificaErroreFornitore(errore) {
  const stato = Number(errore?.stato ?? errore?.status ?? NaN);
  const testo = `${errore?.message ?? ''} ${errore?.code ?? ''}`;
  if (stato === 413) return 'contesto-pieno';
  if (PATTERN_CONTESTO_PIENO.some((p) => p.test(testo))) return 'contesto-pieno';
  return null;
}

/** Il ragionamento per il riassunto: si ABBASSA, mai si alza, e non si inventa dove la sessione non lo ha. */
export function reasoningPerRiassunto(reasoning) {
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return undefined;
  if (typeof reasoning.effort !== 'string') return { ...reasoning };
  if (['none', 'minimal', 'low'].includes(reasoning.effort)) return { ...reasoning };
  return { ...reasoning, effort: 'low' };
}
