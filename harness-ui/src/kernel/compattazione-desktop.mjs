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
import { createHash } from 'node:crypto';
import { stimaToken, stimaTokenConversazione } from './talosHarness.mjs';
// ⭐ 06/10/2026 — la ricarica della memoria post-compact (opzione A + C-b, ricerca 5×5×5×5 §6.4): il
// recinto della sintesi entra nella proiezione accanto all'indice meccanico, NELLO STESSO messaggio.
import { PREFISSO_SINTESI_RECINTATA } from './ricarica-post-compact.mjs';
import { MARCATORE_RICHIESTA_ACCORCIATA } from './richieste-vecchie.mjs';
import { chiamataPerChiGuarda } from './ponte-attrezzi.mjs';
import { oscuraFormeDiSegreto } from '../forme-di-segreto.mjs';

export const SCHEMA_RECORD_COMPATTAZIONE = 'talos.compattazione.v1';

/* 21/10/2026, dal vivo sul Pad (sessione lunga del Mobile, LFM2.5 sul motore dell'app): un motore a POSTO UNICO serve una richiesta alla
   volta. Il riassunto preparato in sottofondo è partito mentre il giro aveva una richiesta in volo, e la richiesta successiva del giro
   ha preso 409 LOCAL_ENGINE_BUSY: il giro è finito in errore per un lavoro di TALOS stesso. Su questi motori si compatta FRA due
   passi, aspettando, mai in parallelo al giro: il motore dell'app (`locale-ospite`) e il motore del PC (`local`, che parte con `-np 1`,
   L1 `3d30fc3f5`). Vive qui e non nell'adapter perché la usa anche il registro (il riassunto di fine giro, che cede il posto). */
export function motoreAPostoUnico(modello) {
  return typeof modello === 'string' && /^(?:locale-ospite|local):/u.test(modello);
}

/** Il motore di un modello a posto unico (`local`, `locale-ospite`), o `null`: il posto unico è del MOTORE, non della sessione. */
export function motoreDelPostoUnico(modello) {
  return motoreAPostoUnico(modello) ? modello.slice(0, modello.indexOf(':')) : null;
}
export const VARIABILE_TETTO_TOKEN = 'TALOS_COMPACTION_TOKEN_CAP';
export const TETTO_TOKEN_DEFAULT = 200_000;
export const FRAZIONE_FINESTRA = 0.75;
export const FRAZIONE_EMERGENZA = 0.90;
export const MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA = 1.2;
export const RICHIESTE_UTENTE_LETTERALI = 3;
/* Owner 22/10/2026 («prima + ultime tre»): la PRIMA richiesta della persona resta sempre alla lettera, come Hermes protegge la
   testa (`protect_first_n`, agent_init.py:1549). Il compito iniziale non finisce più nel riassunto dopo tre richieste nuove.
   Con un tetto: oltre questi caratteri se ne tengono inizio e fine, e il taglio è detto nel testo (`accorciaTesto`). */
export const PRIMA_RICHIESTA_CARATTERI_MASSIMI = 8_000;
export const PRIMA_RICHIESTA_INIZIO = 6_000;
export const PRIMA_RICHIESTA_FINE = 2_000;
/* Il riassunto (dell'adapter e del registro) non ritenta come un giro: due tentativi, attesa al più 10 s (CLI 22/10, revisione 1 della
   0.6.13: col trasporto di serie un fornitore che risponde 503 prendeva 15 richieste in 5,5 minuti per UN riassunto di fine giro). */
export const TENTATIVI_RIASSUNTO = 2;
export const ATTESA_RITENTA_RIASSUNTO_MS = 10_000;
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
/**
 * 22/10/2026 (revisione avversaria di 068b2c172, F1) — LA STIMA È CIECA SUI PEZZI. `stimaTokenConversazione` conta solo il testo in
 * stringa: un messaggio a parti (testo e immagini, come li costruisce `chat-image-attachments.mjs`) vale 0. Fra due stime così, un
 * riassunto che toglie davvero dodici immagini «cresce» (116 token stimati prima, poche centinaia dopo), e la guardia «non riduce»
 * lo buttava: la richiesta ripartiva con tutte le immagini, e sul contesto pieno il giro moriva. ⇒ Dove la stima non vede tutto ciò
 * che c'è, «non riduce» e «al minimo» non si giudicano: si fa come prima.
 */
export function stimaCiecaSuiPezzi(messaggi) {
  return Array.isArray(messaggi) && messaggi.some((m) => m?.content != null && typeof m.content !== 'string');
}

/**
 * 22/10/2026 (settima revisione avversaria del registro, poi revisione 4 della CLI sulla 0.6.13, S2-1) — IL RIASSUNTO CHE NON PUÒ
 * RIDURRE NON SI PAGA. Ciò che un riassunto può togliere è ciò che sta sopra il pavimento (sistema, richieste tenute, coda già
 * accorciata); se è meno di un riassunto minimo, il riassunto non può ridurre. Stava solo nel registro (fine giro e /compact): nel
 * giro un messaggio grande negli ultimi scambi con poca storia vecchia pagava un riassunto a OGNI giro e lo buttava come «inefficace»
 * (misurato dalla CLI: tre giri di fila, fino a due riassunti per giro). Una regola sola per le tre strade.
 * `token` e `pavimento` sono due STIME dello stesso tipo (`stimaTokenConversazione`), mai il numero del fornitore contro una stima.
 * Con immagini o pezzi nel tratto da riassumere la stima non li vede: lì è proprio il riassunto a toglierli, e si fa come prima.
 * Stato dell'arte: Hermes `_FEASIBILITY_SKIP_MIDDLE_FRACTION` (`agent/context_compressor.py:1163-1166`) salta la chiamata quando il
 * tratto comprimibile è sotto il 10% della soglia e c'è già stato un colpo a vuoto; qui la soglia è assoluta e vale dal primo colpo.
 */
export function riassuntoNonPuoRidurre(token, pavimento, mezzo, { finestraToken = null, soglia = null, mediana = null } = {}) {
  return guadagnoAtteso({ prima: token, pavimentoConCornice: pavimento, mezzo, finestraToken, soglia, mediana }) <= 0;
}

/**
 * 22/10/2026 notte (revisione 5 della CLI sulla 0.6.13, S2-1 di nuovo) — UN RIASSUNTO SI PAGA SOLO SE SERVE. Due buchi della regola
 * qui sopra, misurati dalla CLI: (1) il pavimento NUDO non vede la cornice fissa della proiezione riassunta (marcatore, indice, blocco
 * dei fatti, riga di recupero: 391 token stimati fuori da git, 555 dentro), e fra 257 e la cornice si pagava un riassunto che non
 * poteva ridurre; (2) un riassunto che riduce DI POCO si pagava a ogni giro (log incollato con risposte da 1.300 caratteri: 16.163 →
 * 15.971, poi 16.302 → 15.816, e la richiesta restava sopra l'emergenza comunque).
 * ⇒ `pavimentoConCornice` è la proiezione col riassunto VUOTO (testa, richieste tenute, cornice, coda accorciata) e il meglio che un
 *   riassunto può fare è scendere a lei più un riassunto minimo. Si paga se quel meglio (a) riporta sotto la `linea` che ha fatto
 *   scattare la compattazione, oppure (b) è un passo vero: almeno il 10% della soglia.
 * Stato dell'arte: Hermes salta la chiamata quando il tratto comprimibile è sotto il 10% della soglia
 * (`_FEASIBILITY_SKIP_MIDDLE_FRACTION = 0.10`, `agent/context_compressor.py:1163-1166`), ma solo dopo un primo colpo a vuoto; qui la
 * cornice vera di quel progetto e la linea della richiesta, dal primo colpo. Con immagini o pezzi la stima è cieca: si paga come prima.
 */
/*
 * 22/10/2026 notte (verdetto della CLI sulla regola, ricerca su 12 concorrenti, `research-overflow-0613/REPORT.md` §0: C1, C2, C4) —
 * DUE CORREZIONI ALLA REGOLA QUI SOPRA.
 * C1. Il pavimento contava la cornice ma non il RIASSUNTO che il modello scriverà: chiediamo almeno `MIN_TOKEN_RIASSUNTO` d'uscita, e
 *   con un tratto vecchio da 3.000 token il «meglio» diceva «toglie 3.000» quando toglieva al più 1.000 — la forma 15.636 → 16.045. Il
 *   guadagno atteso è `prima − (pavimento con la cornice + S)`, con S il budget d'uscita di quel riassunto (`budgetRiassunto`), mai più
 *   del tratto che riassume. Hermes dimensiona il budget così (`_MIN_SUMMARY_TOKENS = 2000`, `agent/context_compressor.py:820`) ma
 *   non lo sottrae prima di pagare.
 * C2. Via il ramo «il meglio riporta sotto la linea»: un guadagno piccolo atterra appena sotto la linea e il giro dopo si ricompatta.
 *   Claude Code ha dovuto aggiungere un interruttore apposta («Autocompact is thrashing», tre ricariche entro tre giri, 2.1.308) e Hermes
 *   descrive lo stesso guasto (`agent/context_compressor.py:1150-1153`). Una regola sola: si paga se e solo se il guadagno atteso è
 *   almeno il 10% della soglia, la stessa per il giro, il riassunto preparato in anticipo e la fine del giro.
 * C4. Il /compact a mano usa la stessa aritmetica con «guadagno > 0» (`riassuntoNonPuoRidurre`), e dopo la chiamata rifiuta comunque un
 *   riassunto che allunga (c'era già: `motivo: 'inefficace'`).
 *
 * Revisione 6 della CLI (22/10/2026 notte, DO-NOT-PUBLISH su 109b7d9b0) — TRE CORREZIONI:
 * S2-1. Niente più esenzione della «stima cieca»: un'immagine nella PRIMA richiesta (che resta alla lettera per sempre) rendeva cieco
 *   ogni tratto vecchio e spegneva la regola per tutta la sessione (la scena gap1300 con un'immagine: 4 riassunti invece di 1). Ora
 *   prima, pavimento e riassunto atteso si pesano COI PEZZI (`stimaConPezzi`, 1.500 token per immagine come Hermes): un'immagine tenuta
 *   sta in prima e nel pavimento e si annulla, una nel tratto riassunto conta come guadagno. Nessun caso speciale.
 * S3-1. Il riassunto atteso non è il budget anti-troncamento (mai sotto 2.000 token: con una finestra da 12k un tratto vecchio sotto
 *   2.000 non poteva MAI rendere, e il /compact diceva «niente di vecchio», falso): è la dimensione ATTESA, il rapporto di Hermes
 *   (`_SUMMARY_RATIO = 0.20`, `agent/context_compressor.py:843-846`) col tetto della finestra (5%, al più 10.000) e un pavimento piccolo
 *   (`RIASSUNTO_ATTESO_MINIMO_TOKEN`), mai più del tratto che riassume. Il budget d'uscita chiesto al modello non cambia. Dopo la
 *   chiamata si rifiuta solo un riassunto che NON accorcia la richiesta (revisione 7 della CLI, S4: qui c'era scritto «più lungo del
 *   previsto», che il codice non controlla): uno più lungo del previsto ma che accorcia si usa.
 * ⛔ N7 (revisione 9 della CLI, 23/10/2026): il 10% vale OVUNQUE, anche all'emergenza. L'esenzione «all'emergenza basta un guadagno
 *   positivo» (`74f9caf27`, mia, mai chiesta all'owner) contraddiceva il testo che l'owner ha approvato il 22/10 per la soluzione
 *   dell'overflow (`research-overflow-0613/REPORT.md` §4, punto 1 di `PIANO-SEZIONE-4-COMPATTAZIONE-2026-10-22.md`): «un riassunto si
 *   paga solo se toglie davvero almeno il 10%». Misurata dalla CLI a 10.240 con ~7.300 token di schemi: 11 riassunti da ~6% ciascuno,
 *   su richieste che entravano (9.559 su 10.240). Sotto il 10% all'emergenza la richiesta parte; se il fornitore la rifiuta, decide la
 *   strada dell'overflow (dove la stima dice se un passo accorcia, punto 5).
 */
export const FRAZIONE_DELLA_SOGLIA_UTILE = 0.10;
export const RIASSUNTO_ATTESO_MINIMO_TOKEN = 400;

/*
 * ⭐ §4 della CLI, pezzo E (owner 22/10, «tutto dentro la 0.6.13»; rapporto `research-overflow-0613/REPORT.md` §4.1): le due misure della
 *   regola del 10% al posto delle costanti.
 *   - k, il fattore di SOTTOSTIMA: i `prompt_tokens` veri dell'ultima richiesta sulla stima di quella richiesta (messaggi più schemi degli
 *     attrezzi), fra 1 e 4. Come cline (`sdk/packages/core/src/extensions/context/compaction.ts:328-355`, clone 21/10 c31347a0: «scale the
 *     whole budget down by that ratio … never loosens the budget … capped so a tiny estimate cannot collapse the budget»;
 *     `MAX_INPUT_UNDERESTIMATE_FACTOR` in `compaction-shared.ts:27`). Il guadagno G è in unità di STIMA e la soglia in token veri: un
 *     riassunto si paga se G ≥ 0,10 × soglia / k. Mai sotto 1: una stima che conta di più non allarga niente.
 *   - S, il riassunto atteso: la MEDIANA dei riassunti veri della sessione (le ultime nove), pesati col testo arrivato — nelle stesse
 *     unità di G (i `completion_tokens` del fornitore contano anche il ragionamento, e sono token veri) — con lo stesso tetto della
 *     finestra e mai più del tratto che riassume. Senza riassunti veri, la stima di prima (un quinto del tratto). Hermes dimensiona il
 *     budget col minimo fisso (`_MIN_SUMMARY_TOKENS = 2000`, `agent/context_compressor.py:820`) e non lo impara.
 */
export const FATTORE_K_MASSIMO = 4;
export const RIASSUNTI_VERI_TENUTI = 9;
/** k dalla misura: `prompt_tokens` veri sulla stima della stessa richiesta, fra 1 e 4; `null` se non c'è una misura. */
export function fattoreK(promptTokens, stimaRichiesta) {
  if (!(Number.isFinite(promptTokens) && promptTokens > 0 && Number.isFinite(stimaRichiesta) && stimaRichiesta > 0)) return null;
  return Math.min(FATTORE_K_MASSIMO, Math.max(1, promptTokens / stimaRichiesta));
}
const kValido = (k) => (Number.isFinite(k) ? Math.min(FATTORE_K_MASSIMO, Math.max(1, k)) : 1);
const riassuntiValidi = (lista) => (Array.isArray(lista) ? lista.filter((n) => Number.isFinite(n) && n > 0) : []).slice(-RIASSUNTI_VERI_TENUTI);
/** I riassunti veri della sessione con uno nuovo in fondo (le ultime nove). */
export function conRiassuntoVero(lista, token) {
  return riassuntiValidi([...riassuntiValidi(lista), token]);
}
/** La mediana dei riassunti veri (le ultime nove, solo numeri positivi); `null` se non ce n'è nessuno. */
export function medianaRiassunti(lista) {
  const ordinati = riassuntiValidi(lista).sort((a, b) => a - b);
  if (ordinati.length === 0) return null;
  const mezzo = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 === 1 ? ordinati[mezzo] : Math.round((ordinati[mezzo - 1] + ordinati[mezzo]) / 2);
}

/** Quanto ci si aspetta che pesi il riassunto: la mediana dei riassunti veri della sessione se c'è (pezzo E), altrimenti un quinto del
    tratto (col pavimento piccolo); col tetto della finestra, mai più del tratto. */
export function riassuntoAtteso(mezzo, { finestraToken = null, soglia = null, mediana = null } = {}) {
  const token = stimaConPezzi(Array.isArray(mezzo) ? mezzo : []);
  if (!(token > 0)) return 0;
  const positivo = (n) => Number.isFinite(n) && n > 0;
  const finestra = positivo(finestraToken) ? finestraToken : (positivo(soglia) ? soglia : TETTO_TOKEN_DEFAULT) / FRAZIONE_FINESTRA;
  const tetto = Math.min(Math.floor(finestra * FRAZIONE_RIASSUNTO_SULLA_FINESTRA), TETTO_TOKEN_RIASSUNTO);
  if (positivo(mediana)) return Math.min(token, Math.min(Math.round(mediana), tetto));
  return Math.min(token, Math.max(RIASSUNTO_ATTESO_MINIMO_TOKEN, Math.min(Math.floor(token * FRAZIONE_RIASSUNTO_SUL_MEZZO), tetto)));
}
/** Ciò che il riassunto toglie, al meglio: la richiesta di adesso contro la proiezione riassunta (cornice più riassunto atteso). */
export function guadagnoAtteso({ prima, pavimentoConCornice, mezzo, finestraToken = null, soglia = null, mediana = null }) {
  return prima - (pavimentoConCornice + riassuntoAtteso(mezzo, { finestraToken, soglia, mediana }));
}
/*
 * ⛔ Revisione 7 della CLI (22/10/2026, F6): con una finestra più piccola di attrezzi + sistema (8k contro ~7.300 token di 24 schemi) OGNI
 *   giro che falliva pagava un riassunto — sul rifiuto del fornitore e all'emergenza — che non poteva far entrare niente: 18 riassunti e
 *   19 giri falliti su 20, contro 0 riassunti della 0.6.12 con gli stessi fallimenti. Se nemmeno il pavimento con la cornice, più il
 *   riassunto atteso, più lo scarto (attrezzi, sistema, errore della stima) entra nella finestra, nessun riassunto la farà entrare.
 *   Vale anche sul rifiuto del fornitore: la stima decide se un passo può accorciare abbastanza, non se la conversazione entra (§4.1 del
 *   rapporto della CLI, approvato dall'owner il 22/10). Ritorna il pavimento che non entra, o `null` (finestra ignota, o entra).
 */
export function pavimentoOltreLaFinestra({ pavimentoConCornice, mezzo, finestraToken = null, soglia = null, scarto = 0, mediana = null }) {
  if (!(Number.isFinite(finestraToken) && finestraToken > 0)) return null;
  const pavimento = pavimentoConCornice + riassuntoAtteso(mezzo, { finestraToken, soglia, mediana }) + (Number.isFinite(scarto) && scarto > 0 ? Math.round(scarto) : 0);
  return pavimento >= finestraToken ? pavimento : null;
}
export function riassuntoUtile({ prima, pavimentoConCornice, mezzo, soglia = null, finestraToken = null, motivo = null, scarto = 0, mediana = null, k = 1 }) {
  if (pavimentoOltreLaFinestra({ pavimentoConCornice, mezzo, finestraToken, soglia, scarto, mediana }) !== null) return false; // F6
  const guadagno = guadagnoAtteso({ prima, pavimentoConCornice, mezzo, finestraToken, soglia, mediana });
  /* `motivo` non cambia più la regola (N7): resta nella firma perché i chiamanti lo passano e il fine giro lo porta (F5).
     Il 10% vale «non sull'overflow». Una richiesta che con lo scarto intero supera già la FINESTRA dichiarata è un overflow certo: il
     fornitore la rifiuterebbe e la strada dell'overflow pagherebbe un passo che accorcia (punto 5). Lo stesso passo si paga PRIMA,
     senza il 400 (N1: a 10.240 con ~7.300 token di schemi, 7 richieste rifiutate su 17 col solo 10%, 0 così). */
  const oltreLaFinestra = Number.isFinite(finestraToken) && finestraToken > 0 && prima + (Number.isFinite(scarto) && scarto > 0 ? scarto : 0) >= finestraToken;
  if (oltreLaFinestra) return guadagno > 0;
  /* pezzo E: il 10% della soglia (token veri) portato in unità di stima con k */
  return Number.isFinite(soglia) && soglia > 0 && guadagno >= (FRAZIONE_DELLA_SOGLIA_UTILE * soglia) / kValido(k);
}

/**
 * 22/10/2026 (seconda passata avversaria, N1): l'esenzione qui sopra era tutto-o-niente — UNA immagine da 4 byte in una sessione di
 * solo testo spegneva la guardia «non riduce» per sempre (misurato: un riassunto che portava la richiesta da 6.288 a 23.223 token
 * passava). Le guardie «non riduce» pesano invece i pezzi, come Hermes `estimate_messages_tokens_rough`
 * (`agent/model_metadata.py:2403-2415`, `:2493-2540`): il testo, anche dentro i pezzi, più un costo fisso per immagine
 * (`DEFAULT_IMAGE_TOKEN_COST = 1500`, `agent/image_token_cost.py:23`, il valore di Hermes prima della taratura sull'uso del fornitore).
 * Prima e dopo si misurano con la stessa stima: il riassunto toglie le immagini e le sostituisce col segnaposto di testo.
 */
export const COSTO_IMMAGINE_TOKEN = 1_500;
export function stimaConPezzi(messaggi) {
  let somma = stimaTokenConversazione(Array.isArray(messaggi) ? messaggi : []);
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    if (!Array.isArray(m?.content)) continue;
    for (const parte of m.content) {
      if (TIPI_IMMAGINE.has(parte?.type)) somma += COSTO_IMMAGINE_TOKEN;
      else if (typeof parte?.text === 'string') somma += stimaToken(parte.text);
    }
  }
  return somma;
}

/*
 * Revisione 6 della CLI (22/10/2026 notte, S2-2): la PRIMA richiesta di ogni giro si misurava senza gli schemi degli attrezzi (l'ancora
 *   riparte vuota a ogni giro) — con 23-24 attrezzi (~7.000 token) la soglia vera diventava 0,75·finestra + 7k e l'emergenza superava la
 *   finestra sotto i ~73k: proprio le finestre piccole e i modelli locali. `scarto`: ciò che il fornitore ha contato in più della stima
 *   sull'ultima richiesta misurata (attrezzi, sistema, errore della stima), portato dal registro al giro dopo; senza misura, la stima
 *   degli schemi degli attrezzi. Mai negativo: una stima che sovrastima resta com'è (il verso sicuro).
 */
export function misuraOccupazione({ ancora = null, messaggi = [], finestraToken = null, scarto = 0 } = {}) {
  const promptTokens = Number(ancora?.promptTokens);
  const lunghezza = Number(ancora?.lunghezza);
  const stimaAllora = Number(ancora?.stima);
  /*
   * ⛔ Un numero del fornitore IMPOSSIBILE non si crede: la sonda della ricognizione rispondeva `prompt_tokens: 1` a
   *   richieste da migliaia di token e l'ancora spegneva la compattazione per sempre; anomalyco/opencode#50474
   *   (22/09/2026) ha visto il contrario, 24-32× la finestra, e un ciclo infinito. Sotto un quarto della stima
   *   (nessun tokenizzatore reale sta sotto ~1 token per 16 caratteri) o sopra la finestra dichiarata ⇒ si stima.
   */
  const plausibile = promptTokensPlausibili(promptTokens, stimaAllora, finestraToken);
  if (plausibile && Number.isInteger(lunghezza) && lunghezza >= 0 && messaggi.length >= lunghezza) {
    return { token: promptTokens + stimaTokenConversazione(messaggi.slice(lunghezza)), misura: 'fornitore' };
  }
  return { token: stimaTokenConversazione(messaggi) + (Number.isFinite(scarto) && scarto > 0 ? Math.round(scarto) : 0), misura: 'stimato' };
}

/** Il controllo di plausibilità del numero del fornitore, UNO per l'ancora e per lo scarto (revisione 7 della CLI, F1): sotto un quarto
 *  della stima della stessa richiesta, o sopra la finestra dichiarata, non si crede. */
export function promptTokensPlausibili(promptTokens, stima, finestraToken = null) {
  return Number.isFinite(promptTokens) && promptTokens > 0
    && (!Number.isFinite(stima) || stima <= 0 || promptTokens >= stima / 4)
    && (!Number.isFinite(finestraToken) || finestraToken <= 0 || promptTokens <= finestraToken);
}

/*
 * ⛔ Revisione 7 della CLI (22/10/2026, F1, S2): lo scarto misurato saltava il controllo che l'ancora ha già. Con `prompt_tokens` ×30 su
 *   una finestra da 32k arrivavano 3 riassunti d'emergenza su una conversazione da ~9k («277.008 → 1.506»); con `prompt_tokens: 1` lo
 *   scarto 0 prendeva il posto della stima degli attrezzi e tornava il buco S2-2 (12.208 token su 12k, poi il 400 del fornitore).
 *   ⇒ Lo scarto nasce solo da un numero PLAUSIBILE (lo stesso controllo dell'ancora); altrimenti non c'è (`null`) e vale la stima degli
 *   attrezzi. E ha un tetto: la metà della finestra (senza finestra dichiarata, quella implicita nella soglia, soglia / 0,75) — attrezzi e
 *   sistema che pesano più della metà della finestra sono un caso che il fornitore stesso rifiuta, non una misura da portare avanti.
 */
export const FRAZIONE_SCARTO_MASSIMA_SULLA_FINESTRA = 0.5;
/*
 * ⛔ Revisione 7 della CLI, seconda passata (F6 ancora aperta su 08aafe959): il tetto a metà finestra cancellava proprio il caso di F6 — su
 *   una finestra da 8k con ~7.300 token di attrezzi lo scarto VERO diventava 4.096, il pavimento «entrava», e il riassunto si pagava a ogni
 *   giro. ⇒ Due numeri: lo scarto PLAUSIBILE intero (`scartoPlausibile`) per la domanda «può entrare?» (F6), e quello col tetto
 *   (`scartoDaMisura`) per la misura della soglia e dell'emergenza, dove il tetto difende da un fornitore che gonfia i numeri senza uscire
 *   dalla plausibilità.
 */
export function scartoPlausibile(promptTokens, stima, { finestraToken = null, soglia = null } = {}) {
  const finestra = Number.isFinite(finestraToken) && finestraToken > 0 ? finestraToken
    : Number.isFinite(soglia) && soglia > 0 ? soglia / FRAZIONE_FINESTRA : null;
  return promptTokensPlausibili(promptTokens, stima, finestra) ? Math.max(0, promptTokens - stima) : null;
}
/* ⛔ Revisione 8 della CLI (N1, S2): il tetto non scende MAI sotto la stima degli schemi degli attrezzi del giro (`attrezzi`). Su finestre
   da 9-11k che reggono la conversazione compattata, il tetto (5.120 a 10k) contava meno attrezzi del vero (7.338): ogni giro mandava
   prima una richiesta oltre la finestra, prendeva il 400, pagava il riassunto e riprovava — un fornitore onesto andava peggio di uno che
   mente. Lo scarto onesto di attrezzi e sistema si porta intero. */
export function scartoDaMisura(promptTokens, stima, { finestraToken = null, soglia = null, attrezzi = 0 } = {}) {
  /* senza una finestra dichiarata vale quella implicita nella soglia, ANCHE per la plausibilità: con il tetto dell'ospite (la CLI,
     `compactAtTokens`) su un modello senza finestra in catalogo, un ×30 restava «plausibile» e diventava lo scarto. Il verso sicuro: un
     numero vero oltre la finestra implicita si scarta, e vale la stima degli attrezzi. */
  const finestra = Number.isFinite(finestraToken) && finestraToken > 0 ? finestraToken
    : Number.isFinite(soglia) && soglia > 0 ? soglia / FRAZIONE_FINESTRA : null;
  if (!promptTokensPlausibili(promptTokens, stima, finestra)) return null;
  const scarto = Math.max(0, promptTokens - stima);
  const minimo = Number.isFinite(attrezzi) && attrezzi > 0 ? attrezzi : 0;
  return finestra === null ? scarto : Math.min(scarto, Math.max(Math.floor(finestra * FRAZIONE_SCARTO_MASSIMA_SULLA_FINESTRA), minimo));
}

/** La stima degli schemi degli attrezzi di una richiesta: ciò che il fornitore conta e la stima dei messaggi non vede. */
export function stimaDegliAttrezzi(attrezzi) {
  return Array.isArray(attrezzi) && attrezzi.length > 0 ? stimaToken(JSON.stringify(attrezzi)) : 0;
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

/**
 * Il testo di un contenuto: la stringa, o le parti `text` di un contenuto a parti (testo e immagini). `null` se non è né l'una né
 * l'altro. Un contenuto di sole immagini ha testo vuoto ma resta un contenuto della persona.
 */
export function testoDelContenuto(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || content.length === 0) return null;
  return content.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
}

/**
 * Una richiesta della persona: `user` che non è un nostro riassunto. 22/10/2026 (CLI, S3-C): anche col contenuto a parti — una
 * richiesta con un'immagine allegata era trattata come «non una richiesta» e finiva nel riassunto invece di restare alla lettera.
 */
export function eRichiestaDellaPersona(m) {
  if (m?.role !== 'user') return false;
  const testo = testoDelContenuto(m.content);
  return testo !== null && !iniziaConMarcatoreRiassunto(testo);
}

/**
 * 13/10/2026 (bugfixer, review di 28c973bdc) — una NOTA che il kernel scrive nella storia come `user` (copie identiche
 * scartate, risposta tagliata dal tetto, silenzio del fornitore: cominciano tutte con `[TALOS]` o `[TALOS:`) non è una
 * richiesta della persona. Per il confine degli scambi resta un `user` (`eRichiestaDellaPersona` non cambia); qui si decide
 * solo che cosa merita di restare ALLA LETTERA come «richiesta della persona»: con tre note in un giro le richieste vere
 * uscivano dalle tre tenute, e al loro posto restava tre volte la stessa riga (`tests/nota-di-talos-non-e-richiesta.test.mjs`).
 * Solo all'INIZIO esatto del testo: una persona che cita `[TALOS]` in mezzo a una frase resta una persona.
 */
/** Una richiesta VERA della persona: non una nota del kernel. È la stessa che `dividiPerCompattazione` tiene alla lettera. */
export function eRichiestaVera(m) {
  return eRichiestaDellaPersona(m) && !eNotaDiTalos(m);
}

export function eNotaDiTalos(m) {
  if (m?.role !== 'user') return false;
  const testo = testoDelContenuto(m.content);
  return typeof testo === 'string' && (testo.startsWith('[TALOS]') || testo.startsWith('[TALOS:'));
}

/** Una prima richiesta che `accorciaTesto` ha già tagliato: il marcatore sta subito dopo l'inizio tenuto, e la lunghezza è quella di un taglio. */
function giaAccorciata(testo) {
  if (testo.length > PRIMA_RICHIESTA_INIZIO + PRIMA_RICHIESTA_FINE + 1_000) return false;
  const dopo = testo.slice(PRIMA_RICHIESTA_INIZIO, PRIMA_RICHIESTA_INIZIO + 200);
  return dopo.startsWith('\n[… ') && dopo.includes(MARCATORE_ACCORCIATO);
}

/** La prima richiesta com'entra nella proiezione: intera, o inizio e fine col taglio detto se supera il tetto (solo le parti di testo). */
export function primaRichiestaPerLaProiezione(m) {
  /* 22/10/2026 (revisione avversaria): una copia GIÀ accorciata non si riaccorcia alla compattazione dopo — il marcatore stesso la portava
     oltre il tetto, e il secondo taglio dichiarava «324 characters omitted» al posto dei 42.012 veri. ⛔ Seconda revisione: la copia si
     riconosce dal marcatore AL SUO POSTO (subito dopo l'inizio tenuto, `giaAccorciata`), non dalla frase in un punto qualsiasi — chi
     incolla un log di TALOS nella prima richiesta la contiene, e il tetto saltava (130.073 caratteri tenuti interi in ogni proiezione). */
  /* §4.2, regola K (22/10/2026 notte): una richiesta già accorciata dalla regola K (il testo intero sta nel suo file) non si riaccorcia
     qui — il secondo taglio perderebbe l'avviso in testa e il percorso del file */
  const accorcia = (testo) => (typeof testo === 'string' && testo.length > PRIMA_RICHIESTA_CARATTERI_MASSIMI && !giaAccorciata(testo)
    && !testo.startsWith(MARCATORE_RICHIESTA_ACCORCIATA)
    ? accorciaTesto(testo, { inizio: PRIMA_RICHIESTA_INIZIO, fine: PRIMA_RICHIESTA_FINE }) : testo);
  if (typeof m?.content === 'string') return m.content.length > PRIMA_RICHIESTA_CARATTERI_MASSIMI ? { ...m, content: accorcia(m.content) } : m;
  if (Array.isArray(m?.content) && m.content.some((p) => p?.type === 'text' && typeof p.text === 'string' && p.text.length > PRIMA_RICHIESTA_CARATTERI_MASSIMI)) {
    return { ...m, content: m.content.map((p) => (p?.type === 'text' ? { ...p, text: accorcia(p.text) } : p)) };
  }
  return m;
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
 * 22/10/2026 (owner, «prima + ultime tre»): la PRIMA richiesta vera, se sta nel mezzo, va in testa a `richiesteLetterali`
 * (`primaRichiestaPerLaProiezione`: col tetto). `primaRichiesta:false` torna alla forma di prima.
 */
export function dividiPerCompattazione(messaggi, { richiesteUtente = RICHIESTE_UTENTE_LETTERALI, scambiChiusi = SCAMBI_CHIUSI_LETTERALI, primaRichiesta = true } = {}) {
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

  /* 13/10/2026: le note del kernel non contano fra le richieste della persona, né in coda né nel mezzo (`eNotaDiTalos`). */
  const richiestaVera = (m) => eRichiestaDellaPersona(m) && !eNotaDiTalos(m);
  const utentiInCoda = coda.filter(richiestaVera).length;
  const daTenere = Math.max(0, richiesteUtente - utentiInCoda);
  const ultime = daTenere === 0 ? [] : mezzo.filter(richiestaVera).slice(-daTenere);
  const prima = primaRichiesta ? mezzo.find(richiestaVera) : undefined;
  const richiesteLetterali = prima && !ultime.includes(prima) ? [primaRichiestaPerLaProiezione(prima), ...ultime] : ultime;
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
    for (const grezza of m?.tool_calls ?? []) {
      /* C5, revisione H: una chiamata dal ponte conta col suo attrezzo VERO e coi suoi argomenti (file letti e scritti). */
      const vista = chiamataPerChiGuarda(grezza?.function?.name, grezza?.function?.arguments);
      const c = vista.nome === grezza?.function?.name ? grezza : { ...grezza, function: { ...grezza.function, name: vista.nome, arguments: vista.argomenti } };
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
    // ⭐ 06/10/2026 — C-a della cura post-compact (ricerca 5×5×5×5 §6.4, zero-cost): le richieste pendenti e
    // le azioni irreversibili NON si affidano al caso del riassunto. Modello: opencode `summary.txt:10-11`
    // («preserve that exact question» / «always include that exact request») e il prompt di codex.
    'Preserve VERBATIM any question to the person left unanswered, and every irreversible action taken',
    '(commit, push, publish, delete) with its identifier — the full commit hash, never a shorthand.',
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

/*
 * 22/10/2026 (CLI, revisione 3 della 0.6.13, domanda a): un'immagine nel tratto da riassumere partiva INTERA (`image_url`) verso il
 *   riassuntore — un modello leggero solo testo la rifiuta, e ogni riassunto falliva. Hermes la sostituisce con un segnaposto di testo
 *   (`agent/context_compressor.py:1425` `_replace_image_parts`, «[Attached image — stripped after compression]»). Qui lo stesso, solo
 *   nella richiesta di riassunto: la storia e le richieste tenute alla lettera non cambiano.
 */
const TIPI_IMMAGINE = new Set(['image_url', 'input_image', 'image']);
export const SEGNAPOSTO_IMMAGINE = '[Attached image — not shown to the summarizer]';
/* il segnaposto è un argomento di `immaginiCon`, non di `senzaImmagini`: quella si passa a `.map`, che le darebbe l'indice */
function immaginiCon(m, segnaposto) {
  if (!Array.isArray(m?.content) || !m.content.some((p) => TIPI_IMMAGINE.has(p?.type))) return m;
  return { ...m, content: m.content.map((p) => (TIPI_IMMAGINE.has(p?.type) ? { type: 'text', text: segnaposto } : p)) };
}
function senzaImmagini(m) { return immaginiCon(m, SEGNAPOSTO_IMMAGINE); }

/*
 * §4.1, il terzo passo gratuito sul rifiuto del fornitore (rapporto della CLI): le immagini VECCHIE diventano un segnaposto di testo,
 *   come Hermes dopo una compressione (`agent/context_compressor.py:1425`, `_replace_image_parts`). Restano intere quelle dell'ultima
 *   richiesta della persona: sono quelle su cui il modello sta lavorando. Solo nella proiezione: la storia non cambia. Funzione PURA;
 *   `{ messaggi, sostituite }`.
 */
export const SEGNAPOSTO_IMMAGINE_VECCHIA = '[Earlier image — removed to fit the context window]';
export function immaginiVecchieInSegnaposto(messaggi) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  let ultimaRichiesta = -1;
  for (let i = lista.length - 1; i >= 0; i -= 1) if (eRichiestaVera(lista[i])) { ultimaRichiesta = i; break; }
  let sostituite = 0;
  const nuovi = lista.map((m, i) => {
    if (i === ultimaRichiesta || !Array.isArray(m?.content)) return m;
    const quante = m.content.filter((p) => TIPI_IMMAGINE.has(p?.type)).length;
    if (quante === 0) return m;
    sostituite += quante;
    return immaginiCon(m, SEGNAPOSTO_IMMAGINE_VECCHIA);
  });
  return { messaggi: sostituite > 0 ? nuovi : lista, sostituite };
}

export function costruisciRichiestaDiRiassunto({ testa = [], mezzo = [], paroleMassime = PAROLE_MASSIME_RIASSUNTO } = {}) {
  const haRiassuntoPrecedente = mezzo.some((m) => m?.role === 'user' && typeof m.content === 'string' && iniziaConMarcatoreRiassunto(m.content));
  return [...testa.map(senzaImmagini), ...mezzo.map(senzaIndice).map(senzaImmagini), { role: 'user', content: testoRichiestaDiRiassunto({ paroleMassime, haRiassuntoPrecedente }) }];
}

/** Una risposta del riassuntore vale solo se è testo, finito, senza chiamate di attrezzo. */
/*
 * ⛔ 21/10/2026 (banco di stress della compattazione, caso «rifiuto»): un fornitore può rispondere con un RIFIUTO in prosa e
 *   `finish_reason: "stop"` («I'm sorry, but I can't help with summarizing…»): non è vuoto, quindi diventava la storia della
 *   conversazione al posto del lavoro fatto. Hermes lo scarta (`agent/context_compressor.py:171-200`, `_is_summary_refusal`, `865ba906`):
 *   la regola è STRETTA — il rifiuto apre la risposta, nelle prime 400 lettere parla del riassunto, e la risposta non ha i titoli «## »
 *   di un riassunto vero (che può citare un rifiuto avvenuto nella storia). Portata così com'è.
 */
const RIFIUTO_IN_TESTA = /^\s*(?:(?:sorry|i(?:['’]m| am)\s+sorry|i\s+apologi[sz]e|as\s+an\s+ai)\s*[,;:]?\s*(?:but\s+)?)?(?:i|we)\s+(?:can(?:\s*not|['’]t)|could\s*not|couldn['’]t|won['’]t|will\s+not|must\s+decline|refuse\s+to|am\s+unable\s+to|am\s+not\s+able\s+to)\b|^\s*(?:i['’]?m|i\s+am)\s+(?:unable|not\s+able)\b/iu;
export function eRifiutoDiRiassunto(contenuto) {
  const testo = String(contenuto ?? '');
  const normale = testo.split(/\s+/u).filter(Boolean).join(' ');
  if (!RIFIUTO_IN_TESTA.test(normale)) return false;
  if (/^##\s/mu.test(testo)) return false;
  const apertura = normale.slice(0, 400).toLowerCase();
  return apertura.includes('summar') || apertura.includes('checkpoint');
}
export function valutaRispostaDiRiassunto({ scelta, finishReason } = {}) {
  if (Array.isArray(scelta?.tool_calls) && scelta.tool_calls.length > 0) return { ok: false, riassunto: '', motivo: 'attrezzo' };
  if (finishReason !== null && finishReason !== undefined && finishReason !== 'stop') return { ok: false, riassunto: '', motivo: 'troncato' };
  const riassunto = String(scelta?.content ?? '').trim();
  if (!riassunto) return { ok: false, riassunto: '', motivo: 'vuoto' };
  if (eRifiutoDiRiassunto(riassunto)) return { ok: false, riassunto: '', motivo: 'rifiuto' };
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
 *
 * ⭐ 06/10/2026 — RICARICA POST-COMPACT (opzione A + C-b, ricerca 5×5×5×5 §6.4): due parametri NUOVI, entrambi
 * opzionali. `bloccoFatti` è il blocco di fatti freschi costruito DAL CODICE al momento del compact
 * (`costruisciBloccoFatti`, `ricarica-post-compact.mjs`): fuso NELLO STESSO messaggio `user`, dopo l'indice
 * meccanico — un solo cache-break, mai un giro/messaggio separato (vincolo 3 del capitolato). `recintaSintesi`
 * mette il prefisso hermes «REFERENCE ONLY» fra il marcatore e il riassunto: la sintesi resta riferimento, il
 * blocco contiene SOLO fatti e puntatori. Senza i due parametri la proiezione resta CARATTERE PER CARATTERE
 * quella di prima (i test CTX-PURE la fissano).
 */
/*
 * ⭐ C1 (owner 09/10/2026 sera, il metodo approvato) — IL PUNTATORE DI RECUPERO in fondo al riassunto, come il «recovery footer» di
 *   Hermes lean (`evals/compaction/README.md`: «the summary *plus* the session_search pointer it carries»; senza, «scores 30+ pts
 *   lower on needle questions»). La parte riassunta resta intera nel giornale: `conversation_search` con `this_conversation` la
 *   cerca e la rilegge, uscite degli attrezzi comprese (`conversazioni-per-il-modello.mjs`).
 */
export const RIGA_RECUPERO = 'Earlier parts of this conversation are summarized above and kept whole on disk. To recover an exact path, value, '
  + 'error or tool output the summary does not carry, call conversation_search with this_conversation=true and the words to find, '
  + 'then read around the hit with around_message.';

/*
 * L1 motore locale (owner 20/10/2026, «riassunto a pezzi senza ragionamento con ripiego senza modello») — IL RIPIEGO.
 *   Hermes, quando il riassuntore non risponde, inserisce un riassunto fatto dal codice invece di lasciare la conversazione senza
 *   compattazione (`agent/context_compressor.py:5472-5497` `_fallback_summary_for_window`, `:3680-3740`
 *   `_build_static_fallback_summary`: richieste, azioni fatte, file, errori, ultimi turni; «Secrets and credentials were
 *   redacted»; tetto `_FALLBACK_SUMMARY_MAX_CHARS = 8_000`). Qui le richieste letterali, l'indice meccanico (file, impronte,
 *   errori) e la coda la proiezione li porta GIÀ: il ripiego scrive solo il posto del riassunto, cioè che cosa è stato fatto nella
 *   parte compattata, e lo dichiara. Nessun testo degli esiti entra qui: solo nomi d'attrezzo e il loro argomento principale
 *   (`provenienzaDellaChiamata`), così niente di un file o di un comando passa nel ripiego.
 */
export const RIPIEGO_AZIONI_MASSIME = 20;
export const RIPIEGO_CARATTERI_MASSIMI = 8_000;
/* Revisione del 20/10 (D1): il riassunto PRECEDENTE resta, come Hermes «## Previous Summary Snapshot» (`context_compressor.py:3690-3698`,
   `_FALLBACK_PREVIOUS_SUMMARY_MAX_CHARS = 3_000`): obiettivo, decisioni e vincoli scritti dal modello non si perdono perché questa
   volta il riassuntore non ha risposto. Senza il suo indice meccanico: quello si fonde per codice (`indiceMeccanico`, `precedente`). */
export const RIPIEGO_RIASSUNTO_PRECEDENTE_MASSIMO = 3_000;
const MARCATORI_DEL_RIASSUNTO = () => [MARCATORE_RIASSUNTO, MARCATORE_RIASSUNTO_IT];
const APERTURA_DEL_RIPIEGO = 'This summary was written by TALOS without a model:';
const TITOLO_PRECEDENTE = 'Previous summary (kept as it was, because this time the summarizer did not answer):\n';
const TITOLO_AZIONI = /\n\nActions in the compacted part \([^)\n]*\):\n/u;
/*
 * Il riassunto precedente e, se quello era già un ripiego, le sue azioni. Revisione del 20/10 (R1): un ripiego dopo un ripiego non
 *   annida le intestazioni (ognuna mangiava ~400 dei 3.000 caratteri, e dal nono il riassunto del modello spariva): si prende il
 *   SUO «Previous summary» interno e le sue azioni si uniscono a quelle nuove. Il recinto della sintesi resta fuori.
 */
function riassuntoPrecedenteNel(messaggi) {
  for (let i = messaggi.length - 1; i >= 0; i -= 1) {
    const testo = typeof messaggi[i]?.content === 'string' ? messaggi[i].content : '';
    const marcatore = MARCATORI_DEL_RIASSUNTO().find((m) => testo.startsWith(m));
    if (!marcatore) continue;
    const indice = posizioneIndiceMeccanico(testo);
    const corpo = (indice === -1 ? testo : testo.slice(0, indice)).slice(marcatore.length)
      .replace(RIGA_RECUPERO, '').replace(PREFISSO_SINTESI_RECINTATA, '').trim();
    if (!corpo.startsWith(APERTURA_DEL_RIPIEGO)) return { riassunto: corpo, azioni: [] };
    const azioniTrovate = TITOLO_AZIONI.exec(corpo);
    const azioni = azioniTrovate
      ? corpo.slice(azioniTrovate.index + azioniTrovate[0].length).split('\n').filter((r) => r.startsWith('- ')).map((r) => r.slice(2))
      : [];
    const inizio = corpo.indexOf(TITOLO_PRECEDENTE);
    const riassunto = inizio === -1 ? '' : corpo.slice(inizio + TITOLO_PRECEDENTE.length, azioniTrovate ? azioniTrovate.index : undefined).trim();
    return { riassunto, azioni };
  }
  return { riassunto: '', azioni: [] };
}
export function riassuntoDiRipiego(mezzo, { classe = null } = {}) {
  const messaggi = Array.isArray(mezzo) ? mezzo : [];
  const { riassunto: precedente, azioni: azioniPrecedenti } = riassuntoPrecedenteNel(messaggi);
  const azioni = [...azioniPrecedenti];
  for (const m of messaggi) {
    for (const grezza of m?.tool_calls ?? []) {
      const vista = chiamataPerChiGuarda(grezza?.function?.name, grezza?.function?.arguments);
      azioni.push(provenienzaDellaChiamata({ ...grezza, function: { ...grezza?.function, name: vista.nome, arguments: vista.argomenti } }));
    }
  }
  const ultime = azioni.slice(-RIPIEGO_AZIONI_MASSIME);
  const motivo = typeof classe === 'string' && /^[a-z_-]{1,40}$/u.test(classe) ? ` (${classe})` : '';
  const precedenteCorto = precedente.length <= RIPIEGO_RIASSUNTO_PRECEDENTE_MASSIMO ? precedente : `${precedente.slice(0, RIPIEGO_RIASSUNTO_PRECEDENTE_MASSIMO - 1)}…`;
  const righe = [
    `This summary was written by TALOS without a model: the summarizer was unavailable${motivo}. It replaces ${messaggi.length} earlier messages.`,
    'The person\'s requests are kept word for word before this message; the files and the errors are listed below. For exact details re-read the files or check the current state instead of assuming.',
    ...(precedenteCorto ? [`${TITOLO_PRECEDENTE}${precedenteCorto}`] : []),
    azioni.length
      ? `Actions in the compacted part (${ultime.length < azioni.length ? `last ${ultime.length} of ${azioni.length}` : azioni.length}, oldest first):\n${ultime.map((a) => `- ${a}`).join('\n')}`
      : 'No tool actions in the compacted part.',
  ];
  const testo = oscuraFormeDiSegreto(righe.join('\n\n')); // D2: un comando con una chiave dentro non arriva al record né al modello
  return testo.length <= RIPIEGO_CARATTERI_MASSIMI ? testo : `${testo.slice(0, RIPIEGO_CARATTERI_MASSIMI - 1)}…`;
}

export function costruisciProiezione({ testa = [], richiesteLetterali = [], riassunto = '', indice = '', coda = [], bloccoFatti = '', recintaSintesi = false } = {}) {
  const contenuto = [
    MARCATORE_RIASSUNTO,
    recintaSintesi ? PREFISSO_SINTESI_RECINTATA : '',
    String(riassunto ?? '').trim(),
    String(indice ?? '').trim(),
    String(bloccoFatti ?? '').trim(),
    RIGA_RECUPERO,
  ].filter(Boolean).join('\n\n');
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
/*
 * 22/10/2026 (CLI, S2-A, bloccante) — L'IMPRONTA DEL TRATTO COPERTO. Un record diceva solo «copro i primi N messaggi», e
 * `applicaRecord` controllava solo che la storia ne avesse almeno N. Quando la storia sotto il record cambiava (il /compact a mano la
 * sostituiva con tre messaggi e lasciava vivo il record), appena tornava a N messaggi il modello rivedeva il riassunto VECCHIO al posto
 * di quelli nuovi, senza un avviso. Ora il record porta l'impronta del primo e dell'ultimo messaggio coperti: se non tornano, non si
 * applica. Due messaggi e non tutto il tratto perché `applicaRecord` gira a ogni richiesta (l'adapter, :593): l'impronta intera di
 * una storia lunga costerebbe a ogni passo, e basta a riconoscere una storia diversa.
 */
const improntaDiUno = (m) => createHash('sha256').update(JSON.stringify(m ?? null) ?? 'null').digest('hex').slice(0, 16);
/* 22/10/2026 (CLI, S3-B): l'impronta INTERA del prefisso e la chiave della base di un riassunto pronto, prima interne all'adapter
   (15/10, compattazione istantanea): ora le usa anche il registro, che passa al giro il riassunto di fine giro ancora in volo. */
export function improntaDelPrefisso(messaggi, fino) {
  const h = createHash('sha256');
  for (let i = 0; i < fino; i += 1) h.update(JSON.stringify(messaggi[i] ?? null)).update('\u0000');
  return h.digest('hex');
}
export function chiaveBaseDelRecord(record) {
  return record ? `${record.at ?? ''}|${record.coveredThrough ?? ''}` : 'nessuna';
}

export function improntaDelTrattoCoperto(storia, coveredThrough) {
  if (!Array.isArray(storia) || !Number.isInteger(coveredThrough) || coveredThrough < 1 || coveredThrough > storia.length) return null;
  return { primo: improntaDiUno(storia[0]), ultimo: improntaDiUno(storia[coveredThrough - 1]) };
}

export function creaRecord({ coveredThrough, riassunto, tokenPrima, tokenDopo, misura, at, modello, indice = null, coperti = null, freno = null } = {}) {
  if (!Number.isInteger(coveredThrough) || coveredThrough < 0) throw new TypeError('coveredThrough must be an integer ≥ 0');
  if (!Array.isArray(riassunto)) throw new TypeError('riassunto must be a list of messages');
  const impronta = improntaDelTrattoCoperto(coperti, coveredThrough);
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
    ...(impronta ? { impronta } : {}),
    /* Pezzo D (contratto (d) con la CLI, facoltativo): lo stato del freno quando il record è nato. La fonte viva è la sessione (riga
       `freno` del giornale); questa è la copia che chi legge il record trova accanto al riassunto. */
    ...(frenoValido(freno) ? { freno: frenoValido(freno) } : {}),
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
 * 22/10/2026: un record con l'impronta si applica solo se il tratto coperto è ancora quello (`improntaDelTrattoCoperto`); i record di
 * prima non la portano e si applicano come prima.
 */
export function recordValePerLaStoria(storiaGrezza, record) {
  const storia = Array.isArray(storiaGrezza) ? storiaGrezza : [];
  if (!eRecordValido(record) || record.coveredThrough > storia.length) return false;
  if (!record.impronta) return true;
  const vera = improntaDelTrattoCoperto(storia, record.coveredThrough);
  return !!vera && vera.primo === record.impronta.primo && vera.ultimo === record.impronta.ultimo;
}

export function applicaRecord(storiaGrezza, record) {
  const storia = Array.isArray(storiaGrezza) ? storiaGrezza : [];
  if (!recordValePerLaStoria(storia, record)) return storia;
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
  /* Riverifica del bugfixer (16/10/2026, CP-REV-01): un 429 è un LIMITE di traffico, anche quando dice «Too many tokens, please wait»
     (i token al minuto di AWS Bedrock): leggerlo come contesto pieno faceva pagare un riassunto e accorciare la conversazione invece di
     aspettare. Vale per chiunque riprovi (K8, guscio, servizio, l'adattatore dei fornitori), che usano tutti questo classificatore. */
  if (stato === 429) return null;
  if (stato === 413) return 'contesto-pieno';
  if (PATTERN_CONTESTO_PIENO.some((p) => p.test(testo))) return 'contesto-pieno';
  return null;
}

/*
 * ⭐ §4.1 del rapporto della CLI (owner 22/10/2026, «Tutto nella 0.6.13», punto 5: «sul rifiuto del fornitore, la stima decide se un
 *   passo accorcia, non se la conversazione entra») — QUANTO non entra lo dice il fornitore, quando lo scrive. Le forme sono quelle che
 *   pi riconosce (`packages/ai/src/utils/overflow.ts:9-36`, pi-mono 5ab7fe74 del 15/10, che però non ne legge i numeri) e quelle che
 *   Hermes legge (`agent/model_metadata.py:1248-1272`, hermes-agent del 22/10: il massimo da «maximum context length is N», e il
 *   prompt misurato dalla parentesi di OpenAI «(A in the messages, B in the completion)»); Claude Code legge «prompt is too long:
 *   N tokens > M» (parser `l8e` del binario 2.1.308, rapporto della CLI §2.3). Il motore locale porta i due numeri nel suo errore
 *   (`ContestoLocalePienoError`: `promptToken`, `finestraToken`).
 * `{ richiesti, massimo, uscita }`: `richiesti` = il prompt che il fornitore ha contato, `massimo` = la sua finestra (o il suo limite
 *   d'ingresso), `uscita` = i token d'uscita che ha messo nel conto quando lo dice. `null` se il testo non porta numeri plausibili.
 *   Come Hermes, un massimo fuori da [1.024, 10.000.000] non è una finestra. Funzione PURA.
 */
const intero = (s) => Number(String(s).replace(/[,_\s]/g, ''));
const FORME_NUMERI_CONTESTO_PIENO = [
  /* R10-2 (revisione 10 della CLI, 23/10/2026): la frase NOSTRA dell'adattatore dei fornitori (`runtime-owner-adapter.mjs`,
     `frasePienoConNumeri`), che non lascia passare il corpo del fornitore ma ne porta i tre numeri: «(context_length_exceeded): 9433
     input tokens requested, 8192 maximum, 1000 output tokens». Prima: senza questa forma i numeri non arrivavano mai qui. */
  { re: /\(context_length_exceeded\):\s*([\d,]+) input tokens requested,\s*([\d,]+) maximum(?:,\s*([\d,]+) output tokens)?/i, n: 1, m: 2, u: 3 },
  // Anthropic, Claude Code: «prompt is too long: 213462 tokens > 200000 maximum»
  { re: /prompt is too long:\s*([\d,]+)\s*tokens?\s*>\s*([\d,]+)/i, n: 1, m: 2 },
  // OpenRouter con le parti (Hermes `parse_available_output_tokens_from_error`, `model_metadata.py:1304-1310`): «maximum context length is
  // 131072 tokens. However, you requested about 135349 tokens (60662 of text input, 10687 of tool input, 64000 in the output)» — il prompt
  // è testo + attrezzi, l'uscita si toglie dalla finestra (contarla nel prompt accorcerebbe di un terzo una richiesta che entra)
  { re: /maximum context length is ([\d,]+)[\s\S]*?\(([\d,]+) of text input,\s*([\d,]+) of tool input,\s*([\d,]+) in the output\)/i, m: 1, n: [2, 3], u: 4 },
  // OpenAI con la parentesi (Hermes `_COMPLETION_SPLIT_RE`): «maximum context length is 8192 tokens… (9000 in the messages, 1000 in the completion)»
  { re: /maximum context length is ([\d,]+)[\s\S]*?\(([\d,]+)\s+(?:tokens\s+)?in (?:the messages|your prompt|the prompt)\s*[;,]\s*([\d,]+)\s+(?:tokens\s+)?(?:in|for) the completion\)/i, m: 1, n: 2, u: 3 },
  // OpenAI, OpenRouter: «maximum context length is 131072 tokens. However, you requested about 140000 tokens» / «resulted in 9000 tokens»
  { re: /maximum context length is ([\d,]+)[\s\S]*?(?:you requested(?: about)?|resulted in|requested)\s+([\d,]+)\s*tokens?/i, m: 1, n: 2 },
  // compatibili OpenAI (LiteLLM, vLLM): «Input length (265330) exceeds model's maximum context length (262144)»
  { re: /input length \(?([\d,]+)\)? exceeds (?:the )?model'?s maximum context length \(?([\d,]+)\)?/i, n: 1, m: 2 },
  // OpenRouter/Poolside: «Input length X exceeds the maximum allowed input length of Y tokens»
  { re: /input length \(?([\d,]+)\)? exceeds (?:the )?maximum allowed input length of ([\d,]+)/i, n: 1, m: 2 },
  // Google: «The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)»
  { re: /input token count \(?([\d,]+)\)? exceeds the maximum number of tokens allowed \(?([\d,]+)\)?/i, n: 1, m: 2 },
  // xAI: «maximum prompt length is 131072 but the request contains 537812 tokens»
  { re: /maximum prompt length is ([\d,]+) but (?:the )?request contains ([\d,]+)/i, m: 1, n: 2 },
  // Together: «The input (X tokens) is longer than the model's context length (Y tokens)»
  { re: /input \(([\d,]+) tokens\) is longer than the model'?s context length \(([\d,]+) tokens\)/i, n: 1, m: 2 },
  // GitHub Copilot: «prompt token count of X exceeds the limit of Y»
  { re: /prompt token count of ([\d,]+) exceeds the limit of ([\d,]+)/i, n: 1, m: 2 },
  // Kimi: «exceeded model token limit: X (requested: Y)»
  { re: /exceeded model token limit:\s*([\d,]+)\s*\(requested:\s*([\d,]+)\)/i, m: 1, n: 2 },
  // DS4: «Prompt has X tokens, but the configured context size is Y tokens»
  { re: /prompt has ([\d,]+) tokens?, but the configured context size is ([\d,]+)/i, n: 1, m: 2 },
  // Mistral: «Prompt contains X tokens … too large for model with Y maximum context length»
  { re: /prompt contains ([\d,]+) tokens[\s\S]*?too large for model with ([\d,]+) maximum context length/i, n: 1, m: 2 },
  // llama-server (`tools/server/server-task.cpp:1539-1540`, llama.cpp del 21/10): il corpo dell'errore porta `n_prompt_tokens` e `n_ctx`
  { re: /"n_prompt_tokens"\s*:\s*(\d+)[\s\S]*?"n_ctx"\s*:\s*(\d+)/, n: 1, m: 2 },
  { re: /"n_ctx"\s*:\s*(\d+)[\s\S]*?"n_prompt_tokens"\s*:\s*(\d+)/, m: 1, n: 2 },
];
const finestraPlausibile = (m) => Number.isSafeInteger(m) && m >= 1_024 && m <= 10_000_000;
export function numeriDelContestoPieno(errore) {
  if (!errore || typeof errore !== 'object') return null;
  if (Number.isSafeInteger(errore.promptToken) && errore.promptToken > 0 && finestraPlausibile(errore.finestraToken)) {
    return { richiesti: errore.promptToken, massimo: errore.finestraToken, uscita: null };
  }
  const testo = String(errore.message ?? '');
  for (const forma of FORME_NUMERI_CONTESTO_PIENO) {
    const trovato = forma.re.exec(testo);
    if (!trovato) continue;
    const richiesti = Array.isArray(forma.n) ? forma.n.reduce((somma, i) => somma + intero(trovato[i]), 0) : intero(trovato[forma.n]);
    const massimo = intero(trovato[forma.m]);
    const uscita = forma.u ? intero(trovato[forma.u]) : null;
    if (!(Number.isSafeInteger(richiesti) && richiesti > 0) || !finestraPlausibile(massimo)) continue;
    return { richiesti, massimo, uscita: Number.isSafeInteger(uscita) && uscita >= 0 ? uscita : null };
  }
  return null;
}

/*
 * ⭐ §4.1, il BERSAGLIO sul rifiuto del fornitore (rapporto della CLI, approvato dall'owner il 22/10): la stima della richiesta da
 *   mandare, nella scala della stima della richiesta rifiutata.
 *   - Coi numeri del fornitore: `stimaInviata × (massimo − riserva) / richiesti` — il rapporto fra stima e conto vero si porta dietro,
 *     così una stima sbagliata del 30% resta giusta come PROPORZIONE (stima contro stima). La riserva è l'uscita che il fornitore dice
 *     di aver messo nel conto, altrimenti la stessa quota della nostra linea d'emergenza (il 10% della finestra).
 *   - Senza numeri: il 70% della richiesta rifiutata (opencode `SHRINK_STEPS[0]`, `compaction.ts:95`, rapporto §2.4).
 *   - Ai rifiuti dopo (`livello` 1 e 2): il 50% e il 35% della PRIMA richiesta rifiutata del giro (opencode), o meno se il nuovo
 *     rifiuto porta numeri che chiedono di più.
 *   Mai sopra il 95% della richiesta rifiutata: un rifiuto vuol dire che qualcosa va tolto. Funzione PURA.
 */
export const SCALINI_CONTESTO_PIENO = Object.freeze([0.70, 0.50, 0.35]);
export const RISERVA_USCITA_SENZA_NUMERI = 0.10;
export const QUOTA_MASSIMA_DEL_RIFIUTO = 0.95;
/**
 * ⛔ R12-1 (revisione 12 della CLI, 23/10/2026, S2) — la parte dello SCARTO che si può dire FISSA con certezza, per le affermazioni
 *   certe: «non entra» (la linea certa di Z-K3, F6 all'emergenza) e «troppo grande» (la regola N).
 *   Lo scarto è la differenza fra il conto del fornitore e la nostra stima, misurata su una richiesta intera. Dentro ci sono due cose
 *   che la misura non separa: la cornice (schemi degli attrezzi, modello di chat, sistema contato più della stima), che resta finché
 *   resta il giro, e la STORIA contata più della stima (base64, codice, JSON negli esiti: il fornitore della CLI conta il base64 a 1,6
 *   caratteri per token, la nostra stima a 4), che i passi gratuiti e il riassunto tolgono insieme alla storia.
 *   Contare tutto lo scarto come cornice faceva fallire giri che, accorciati, entravano (il caso della CLI: 21.623 di scarto di cui
 *   ~14.800 dal base64 letto al giro prima, «non entra» a 46.738 contro una finestra di 40.000; il giro entrava a ~33.000). Contarne
 *   solo la quota degli attrezzi (la regola N di R11-1) riapriva il caso di Z-K3 (ZK3-06): 6.000 token di cornice costante su una storia
 *   di poche centinaia, dove il riassunto senza modello partiva e il fornitore lo rifiutava di nuovo.
 *   ⇒ Quanto la storia può spiegare (`scartoSpiegabileDallaStoria`) dipende da COME è scritta. La stima conta l'ASCII a 4 caratteri
 *   per token e il CJK a uno (`stimaToken`, talosHarness.mjs:248):
 *   - il testo con gli spazi (prosa, codice, JSON indentato: almeno uno spazio ogni 12 caratteri) un tokenizzatore lo conta al più il
 *     doppio della stima — l'italiano sta a ~1,15, il codice a ~1,3, il JSON a ~1,6 — quindi spiega al più 1 token per token stimato;
 *   - il testo DENSO (base64, esadecimale, minificato: quasi senza spazi) arriva al quadruplo (il base64 della CLI a 2,5) — 3 per token.
 *   Il resto dello scarto è cornice di certo; e mai meno della quota che gli attrezzi stimati spiegano. Un errore qui costa al più un
 *   rifiuto in più, mai un giro che si poteva fare. PURE tutte e due.
 */
export const SCARTO_PER_TOKEN_DI_TESTO_SPAZIATO = 1;
export const SCARTO_PER_TOKEN_DI_TESTO_DENSO = 3;
export const QUOTA_DI_SPAZI_DEL_TESTO_SPAZIATO = 1 / 12;
const SPAZIO = /\s/gu;
export function scartoSpiegabileDallaStoria(messaggi) {
  let somma = 0;
  const conta = (testo) => {
    if (typeof testo !== 'string' || testo === '') return;
    const spazi = testo.match(SPAZIO)?.length ?? 0;
    const k = spazi / testo.length >= QUOTA_DI_SPAZI_DEL_TESTO_SPAZIATO ? SCARTO_PER_TOKEN_DI_TESTO_SPAZIATO : SCARTO_PER_TOKEN_DI_TESTO_DENSO;
    somma += k * stimaToken(testo);
  };
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    if (!m || m.role === 'system') continue;
    if (typeof m.content === 'string') conta(m.content);
    else if (Array.isArray(m.content)) for (const parte of m.content) if (!TIPI_IMMAGINE.has(parte?.type)) conta(parte?.text);
    for (const c of Array.isArray(m.tool_calls) ? m.tool_calls : []) conta(c?.function?.arguments);
  }
  return somma;
}
/**
 * ⛔ R13-1 (revisione 13 della CLI, 23/10/2026, S2) — LA STORIA CHE PUÒ SPIEGARE LO SCARTO NON CONTIENE LA RICHIESTA NUOVA.
 *   Lo scarto è misurato su una richiesta riuscita PRIMA che la persona scrivesse il messaggio nuovo: quel messaggio non c'era, e non
 *   può spiegarne nemmeno un token. Contato nella storia (era `r.grezzi`), un incollato da 44.000 caratteri «spiegava» 11.005 token di
 *   scarto: la cornice che il fornitore conta in più della stima (6.000, ZK3-06) restava sempre spiegabile, la regola N non scattava e
 *   il giro finiva con «non entra» invece di «troppo grande» con «Invia come allegato» (`pdrv13 p2.json`). La richiesta nuova la regola
 *   N la pesa già da sé, per quello che è: contarla due volte la faceva piccola due volte.
 *   Si toglie la SOLA ultima richiesta vera della persona (`eRichiestaVera`): dopo di lei, nello stesso giro, possono venire esiti
 *   d'attrezzo che c'erano nella richiesta misurata (la richiesta prima, nello stesso giro) e che lo scarto lo spiegano davvero.
 */
export function senzaLaRichiestaNuova(messaggi) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  const indice = lista.findLastIndex((m) => eRichiestaVera(m));
  return indice < 0 ? lista : lista.filter((_, i) => i !== indice);
}
export function scartoFissoCerto({ scarto = 0, attrezzi = 0, spiegabileDallaStoria = 0 } = {}) {
  const s = Number.isFinite(scarto) && scarto > 0 ? scarto : 0;
  const a = Number.isFinite(attrezzi) && attrezzi > 0 ? attrezzi : 0;
  const h = Number.isFinite(spiegabileDallaStoria) && spiegabileDallaStoria > 0 ? spiegabileDallaStoria : 0;
  return Math.max(Math.min(s, a), s - h, 0);
}
/** La riserva d'uscita del rifiuto: quella che il fornitore ha detto, o il 10% della sua finestra; 0 senza numeri. */
export function riservaDelContestoPieno(numeri) {
  if (!numeri) return 0;
  return Number.isFinite(numeri.uscita) && numeri.uscita > 0 ? numeri.uscita : Math.ceil(numeri.massimo * RISERVA_USCITA_SENZA_NUMERI);
}

export function bersaglioDelContestoPieno({ livello = 0, stimaInviata, stimaPrimoRifiuto = null, numeri = null } = {}) {
  if (!(Number.isFinite(stimaInviata) && stimaInviata > 0)) return null;
  const primo = Number.isFinite(stimaPrimoRifiuto) && stimaPrimoRifiuto > 0 ? stimaPrimoRifiuto : stimaInviata;
  const scalino = SCALINI_CONTESTO_PIENO[Math.min(Math.max(0, livello), SCALINI_CONTESTO_PIENO.length - 1)];
  const riserva = riservaDelContestoPieno(numeri);
  const daiNumeri = numeri && numeri.richiesti > 0 && numeri.massimo > 0
    ? Math.floor((stimaInviata * (numeri.massimo - riserva)) / numeri.richiesti) : null;
  const tetto = Math.floor(stimaInviata * QUOTA_MASSIMA_DEL_RIFIUTO);
  const bersaglio = livello <= 0
    ? (daiNumeri !== null ? daiNumeri : Math.floor(primo * scalino))
    : Math.min(Math.floor(primo * scalino), daiNumeri ?? Number.POSITIVE_INFINITY);
  return Math.max(0, Math.min(bersaglio, tetto));
}

/*
 * ⭐ §4.3 del rapporto della CLI, pezzo D (owner 22/10, punto 4 del testo approvato: «un freno contro la ripetizione»; 23/10 «Tutto nella
 *   0.6.13»). Il FRENO dei riassunti automatici pagati, condiviso dal giro, dal fine giro e dal /compact, e salvato (riga `freno` del
 *   giornale del registro e copia nel record).
 *   - Un COLPO: il primo `prompt_tokens` vero dopo una compattazione applicata è ancora oltre la soglia (il verdetto di Hermes,
 *     `_apply_real_prompt_verdict`, `agent/context_compressor.py:2749-2782`), o un riassunto rifiutato perché ALLUNGAVA (Hermes
 *     `record_rejected_compaction`, `:2516-2523`). Una lettura vera sotto la soglia azzera i colpi.
 *   - TIRA a `FRENO_COLPI` colpi, o con tre riassunti pagati dentro tre giri (Claude Code, «Autocompact is thrashing», tre ricariche
 *     entro tre giri: rapporto della CLI §2.3). Tirato: niente riassunti automatici pagati; i passi gratuiti restano.
 *   - Si RIARMA quando il tratto da riassumere cresce del 10% della soglia dal verdetto (Codex `BodyAfterPrefix`: si riprova solo se
 *     c'è davvero di più da togliere), al cambio di modello o di finestra, e col /compact della persona.
 *   - `at`: il momento in cui il freno ha TIRATO — l'identità dell'armamento, la stessa nell'evento e nello stato, nuova a ogni tirata
 *     (richiesta della CLI del 23/10: dice l'avviso una volta per `at`). Prima di tirare è null.
 *   Forma (contratto (d) con la CLI, più quattro campi additivi concordati il 23/10): `{ colpi, mezzoAlVerdetto, at, modello, finestra,
 *   ricariche, detto }`. Funzioni PURE.
 */
export const FRENO_COLPI = 2;
export const FRENO_RIARMO_FRAZIONE = 0.10;
export const FRENO_RICARICHE = 3;
export const FRENO_RICARICHE_GIRI = 3;

/** Un freno letto da fuori (giornale, ingresso del giro, record): solo i campi noti, coi tipi giusti; altrimenti `null`. */
export function frenoValido(freno) {
  if (!freno || typeof freno !== 'object' || Array.isArray(freno)) return null;
  const intero = (n) => Number.isSafeInteger(n);
  return {
    colpi: intero(freno.colpi) && freno.colpi >= 0 ? freno.colpi : 0,
    mezzoAlVerdetto: Number.isFinite(freno.mezzoAlVerdetto) && freno.mezzoAlVerdetto >= 0 ? freno.mezzoAlVerdetto : null,
    at: typeof freno.at === 'string' && freno.at ? freno.at : null,
    modello: typeof freno.modello === 'string' && freno.modello ? freno.modello : null,
    finestra: intero(freno.finestra) && freno.finestra > 0 ? freno.finestra : null,
    ricariche: Array.isArray(freno.ricariche) ? freno.ricariche.filter((g) => intero(g) && g >= 0).slice(-FRENO_RICARICHE) : [],
    detto: freno.detto === true,
  };
}

/** Le ricariche sono rapide quando le ultime tre stanno dentro tre giri (fra la prima e la terza meno di tre giri). */
export function ricaricheRapide(ricariche) {
  const r = Array.isArray(ricariche) ? ricariche.filter((g) => Number.isSafeInteger(g)).slice(-FRENO_RICARICHE) : [];
  return r.length >= FRENO_RICARICHE && r[r.length - 1] - r[0] < FRENO_RICARICHE_GIRI;
}

/** Tirato: `FRENO_COLPI` colpi, o le ricariche rapide. */
export function frenoTirato(freno) {
  const f = frenoValido(freno);
  return !!f && (f.colpi >= FRENO_COLPI || ricaricheRapide(f.ricariche));
}

/**
 * Il freno che vale adesso. `null` se si è riarmato del tutto: modello o finestra cambiati (un altro tokenizzatore, un'altra misura).
 * Il riarmo per CRESCITA (il tratto da riassumere, `mezzo`, cresciuto del 10% della soglia dal verdetto: Codex `BodyAfterPrefix`) vale
 * solo per un freno TIRATO per i colpi, e azzera i colpi, `at` e `detto` ma TIENE le ricariche.
 * ⛔ Z-K2 della revisione della CLI su Z (23/10/2026), misurato sulla CLI costruita e con la traccia delle funzioni: in una ripetizione
 *   il mezzo cresce di circa uno scambio a giro, cioè proprio del 10% della soglia che giustifica un riassunto. Il riarmo per crescita
 *   azzerava OGNI giro anche un freno non tirato, e coi colpi le ricariche: 17 riassunti pagati in 17 giri, nessuna tirata. Quindi:
 *   (a) un freno non tirato non si riarma: i suoi conti sono la memoria della ripetizione;
 *   (b) un freno tirato per le RICARICHE (tre riassunti pagati in tre giri: la ripetizione stessa) non si riarma per crescita — come
 *       l'interruttore di Claude Code («Autocompact is thrashing», 2.1.308), che non riparte da solo; solo modello, finestra o /compact;
 *   (c) il riarmo per crescita di un freno tirato per i colpi tiene le ricariche: se la ripetizione continua, la terza tira.
 */
export function frenoDiAdesso(freno, { mezzo = null, soglia = null, modello = null, finestra = null } = {}) {
  const f = frenoValido(freno);
  if (!f) return null;
  if (f.modello && typeof modello === 'string' && modello && f.modello !== modello) return null;
  if (f.finestra && Number.isSafeInteger(finestra) && finestra > 0 && f.finestra !== finestra) return null;
  if (!frenoTirato(f) || ricaricheRapide(f.ricariche)) return f;
  if (Number.isFinite(mezzo) && f.mezzoAlVerdetto !== null && Number.isFinite(soglia) && soglia > 0
    && mezzo - f.mezzoAlVerdetto >= FRENO_RIARMO_FRAZIONE * soglia) return { ...f, colpi: 0, at: null, detto: false };
  return f;
}

const conIdentita = (f, { mezzo, modello, finestra }) => ({
  ...f,
  mezzoAlVerdetto: Number.isFinite(mezzo) && mezzo >= 0 ? mezzo : f.mezzoAlVerdetto,
  modello: typeof modello === 'string' && modello ? modello : f.modello,
  finestra: Number.isSafeInteger(finestra) && finestra > 0 ? finestra : f.finestra,
});

/** Un colpo. `at` resta quello di prima: lo scrive `frenoCheTira` quando il freno tira. */
export function colpoAlFreno(freno, { mezzo = null, modello = null, finestra = null } = {}) {
  const f = frenoValido(freno) ?? frenoValido({});
  return conIdentita({ ...f, colpi: f.colpi + 1 }, { mezzo, modello, finestra });
}

/** Un riassunto pagato: il giro della sessione in cui è stato pagato (`versioneGiro` del registro). Senza giro noto, niente. */
export function ricaricaAlFreno(freno, { giro, mezzo = null, modello = null, finestra = null } = {}) {
  const f = frenoValido(freno) ?? frenoValido({});
  if (!Number.isSafeInteger(giro) || giro < 0) return f;
  return conIdentita({ ...f, ricariche: [...f.ricariche, giro].slice(-FRENO_RICARICHE) }, { mezzo, modello, finestra });
}

/** Una lettura vera sotto la soglia: i colpi tornano a zero. Le ricariche restano: misurano il ritmo dei riassunti, non la loro efficacia.
    ⛔ R10-4 (revisione 10 della CLI, 23/10/2026): se così il freno non è più tirato, l'armamento finisce — `at` e `detto` si azzerano.
    Prima restavano, e una seconda tirata (nuovi colpi) non si diceva mai: `frenoCheTira` con `detto` vero non dà l'evento. */
export function letturaSottoLaSoglia(freno) {
  const f = frenoValido(freno);
  if (!f) return f;
  const libero = f.colpi === 0 ? f : { ...f, colpi: 0 };
  return frenoTirato(libero) || (libero.at === null && !libero.detto) ? libero : { ...libero, at: null, detto: false };
}

/**
 * ⛔ R10-3 (revisione 10 della CLI, 23/10/2026): DUE copie dello stesso freno — quella del giro e quella del registro, che il riassunto di
 *   fine giro del giro prima, arrivato mentre questo lavora, ha cambiato — si UNISCONO invece di sovrascriversi. Misurato dalla CLI: la
 *   copia del giro (`colpi:1, ricariche:[13]`) cancellava quella tirata del registro (`colpi:2, ricariche:[13,14]`, detta) e si tornava a
 *   pagare; e un turno diceva due volte «in pausa», con due `at`. ⇒ Le ricariche di tutte e due (per giro), i colpi più alti, e una tirata
 *   già DETTA resta detta col suo `at` (un avviso per armamento). Identità diverse (modello o finestra): vale la prima, e il riarmo per
 *   identità lo fa `frenoDiAdesso`. Funzione PURA.
 */
/*
 * ⛔ R11-4 e R11-11 (revisione 11 della CLI, 23/10/2026): l'unione ha bisogno della copia da cui TUTTE E DUE sono partite (`base`: per il
 *   registro il freno all'inizio del giro, per il giro l'ultima copia del registro che ha visto).
 *   - Le ricariche si contano, non si deduplicano: il riassunto di fine giro del giro N-1, pagato mentre il giro N lavorava, e quello
 *     dentro il giro N portano lo stesso numero di giro, e sono DUE riassunti pagati. Col `Set` di prima `[2,3,3]` diventava `[2,3]`: la
 *     tirata per ricariche spariva e il giro dopo si riarmava e pagava (misurato: SUMMARY#4 dopo due «in pausa»). Ora: la base, più ciò
 *     che ciascuna copia ha aggiunto alla base.
 *   - I colpi: vince la copia che li ha CAMBIATI rispetto alla base. Prima vincevano i più alti, e una lettura sotto la soglia del giro
 *     (colpi a zero) veniva annullata dai colpi vecchi del registro: freno tirato in silenzio col vecchio `at`. Se li hanno cambiati
 *     tutte e due, i più alti.
 *   - Il riferimento del riarmo per crescita (`mezzoAlVerdetto`): il più grande, cioè il più recente — il riarmo si misura dall'ultimo
 *     verdetto, mai da uno più vecchio.
 *   Senza base (`undefined`), le ricariche comuni non si possono distinguere: si uniscono come prima (per giro), e i colpi più alti. Una
 *   base `null` è un freno che non c'era: vuoto.
 */
const aggiunteAllaBase = (lista, base) => {
  const restanti = [...base];
  const fuori = [];
  for (const g of lista) {
    const i = restanti.indexOf(g);
    if (i === -1) fuori.push(g);
    else restanti.splice(i, 1);
  }
  return fuori;
};
export function unisciFreni(proprio, altro, base = undefined) {
  const a = frenoValido(proprio);
  const b = frenoValido(altro);
  if (!a || !b) return a ?? b;
  if ((a.modello && b.modello && a.modello !== b.modello) || (a.finestra && b.finestra && a.finestra !== b.finestra)) return a;
  const z = base === undefined ? null : frenoValido(base) ?? frenoValido({}); // `null`: si è partiti senza freno (base vuota)
  const ricariche = z
    ? [...z.ricariche, ...aggiunteAllaBase(a.ricariche, z.ricariche), ...aggiunteAllaBase(b.ricariche, z.ricariche)]
    : [...new Set([...a.ricariche, ...b.ricariche])];
  const aCambiati = !z || a.colpi !== z.colpi;
  const bCambiati = !z || b.colpi !== z.colpi;
  const colpi = aCambiati && !bCambiati ? a.colpi : bCambiati && !aCambiati ? b.colpi : Math.max(a.colpi, b.colpi);
  const mezzi = [a.mezzoAlVerdetto, b.mezzoAlVerdetto].filter((m) => m !== null);
  const unito = {
    ...a, colpi, mezzoAlVerdetto: mezzi.length > 0 ? Math.max(...mezzi) : null,
    modello: a.modello ?? b.modello, finestra: a.finestra ?? b.finestra,
    ricariche: ricariche.sort((x, y) => x - y).slice(-FRENO_RICARICHE), at: null, detto: false,
  };
  if (!frenoTirato(unito)) return unito;
  const detta = [a, b].find((f) => f.detto && f.at && frenoTirato(f));
  return detta ? { ...unito, at: detta.at, detto: true } : unito;
}

/**
 * Se il freno è tirato e non l'ha ancora detto: lo stato con `at` (l'identità dell'armamento) e `detto`, e l'evento da dare una volta
 * (`talos.compattazione` di fine, `motivo:'freno'`, contratto (c) con la CLI). Altrimenti `{ freno, evento: null }`.
 */
export function frenoCheTira(freno, { at } = {}) {
  const f = frenoValido(freno);
  if (!f || !frenoTirato(f) || f.detto) return { freno: f, evento: null };
  const quando = typeof at === 'string' && at ? at : new Date().toISOString();
  return {
    freno: { ...f, at: quando, detto: true },
    evento: { compattato: false, motivo: 'freno', perche: f.colpi >= FRENO_COLPI ? 'colpi' : 'ricariche',
      freno: { colpi: f.colpi, mezzoAlVerdetto: f.mezzoAlVerdetto, at: quando } },
  };
}

/** Il tratto da riassumere di una proiezione, stimato coi pezzi: la misura del riarmo e del verdetto. */
export function mezzoDellaProiezione(proiezione) {
  return stimaConPezzi(dividiPerCompattazione(Array.isArray(proiezione) ? proiezione : []).mezzo);
}

/**
 * Il ragionamento per il riassunto: si ABBASSA, mai si alza, e non si inventa dove la sessione non lo ha.
 * L1 del motore locale (20/10/2026): sul nostro motore locale (`modello` con la fonte `local:`) si chiede SPENTO, sempre.
 *   «low» non abbassa niente su un template che ragiona per forza (LFM2.5, `supports_reasoning_effort:false`), e il pensiero si
 *   mangiava tutto `max_tokens` del riassunto (sessione e00ae242, `completion_tokens: 2000`, «troncato»). Lo spegnimento vero lo
 *   fa l'adattatore (`runtime-owner-adapter.mjs`, `thinking_budget_tokens: 0`). La fonte dal PREFISSO, mai dal nome del modello.
 */
export function reasoningPerRiassunto(reasoning, { modello } = {}) {
  if (typeof modello === 'string' && modello.startsWith('local:')) return { effort: 'none' };
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return undefined;
  if (typeof reasoning.effort !== 'string') return { ...reasoning };
  if (['none', 'minimal', 'low'].includes(reasoning.effort)) return { ...reasoning };
  return { ...reasoning, effort: 'low' };
}

/*
 * ⛔⛔ BUG-5 (05/10/2026, owner) — L'INGRESSO DEL RIASSUNTO NON È INFINITO. Misurato sulla sessione vera
 *   b1e7382a dell'app installata: tre compattazioni su tre «troncato» — 213.785 token inviati AL RIASSUNTORE,
 *   oltre la finestra dei modelli comuni. La richiesta di riassunto da sola rientra nell'overflow (o il
 *   fornitore la taglia): la compattazione non arriva MAI a sostituire la storia e la conversazione cresce
 *   senza freno. Hermes limita e protegge il suo ingresso (`agent/context_compressor.py:2645-2651`,
 *   `protect_first_n: 3, protect_last_n: 20`); qui il limite manca del tutto.
 * ⇒ La richiesta di riassunto (testa di `system` + mezzo + istruzione finale) si LIMITA a caratteri, per
 *   MESSAGGI interi: dalla testa restano i `system` iniziali (sempre: sono l'identità della sessione) e poi
 *   i messaggi finché metà del budget lo consente; dalla coda gli ultimi messaggi (l'ULTIMO è l'istruzione
 *   `testoRichiestaDiRiassunto` e resta SEMPRE, anche se da sola superasse la sua metà); il mezzo omesso
 *   diventa UN messaggio con il marcatore. La storia grezza resta intera (decisione 3 del 24/09): il
 *   marcatore lo dice al riassuntore. Funzione PURA: nessuno stato, nessun I/O.
 */
export const CARATTERI_INGRESSO_RIASSUNTO = 160_000;
export const MARCATORE_INGRESSO_TAGLIATO = '[… middle of the compaction input omitted: everything here is covered by the summary instruction at the end; the original messages remain in the session history …]';

/*
 * L1 del motore locale (owner 20/10/2026, «riassunto a pezzi»): l'ingresso del riassuntore si misura sulla FINESTRA del modello,
 *   non solo in caratteri. Prova dal vivo del 20/10 (sessione 7432bdf4, LFM2.5 a 65.536): il riassunto di sfondo del registro
 *   non aveva NESSUN limite d'ingresso (lo aveva solo la strada «overflow») e il motore ha risposto «The conversation (79599
 *   tokens) does not fit in the local model's window (65536 tokens)». Sul codice letto dagli attrezzi un token vale ~2 caratteri,
 *   non i 4 della stima: 160.000 caratteri sono ~80.000 token.
 * ⇒ Due cose, come Hermes (`agent/context_compressor.py:3433-3440`, «Summarizer-input limits: the budget is the summary model's
 *   window, not the main model's»; `_CONTENT_MAX = 6000`, `_CONTENT_HEAD = 4000`, `_CONTENT_TAIL = 1500`):
 *   1. ogni messaggio del mezzo oltre 6.000 caratteri si accorcia a inizio + fine (i messaggi di sistema e l'istruzione finale no);
 *   2. il totale si limita a quanto entra nella finestra tolto il budget d'uscita e un margine, a 2 caratteri per token.
 *   Finestra ignota ⇒ resta il tetto di sempre (160.000).
 */
export const CARATTERI_PER_TOKEN_PRUDENTI = 2;
export const CARATTERI_MESSAGGIO_RIASSUNTO = 6_000;
const MARGINE_TOKEN_RIASSUNTO = 1_024;
/** L'ingresso più piccolo che il riassuntore riceve (`caratteriIngressoPerFinestra` non scende sotto): la richiesta minima. */
export const INGRESSO_MINIMO_TOKEN_RIASSUNTO = 1_024;

/*
 * 21/10/2026, richiesta della CLI (owner 14/10: il lavoro di contorno va sul modello «più economico dello stesso fornitore», il
 * `modelloAusiliario` del registro fornitori, `cli/src/runtime/auxiliary-model.ts`) — QUALE modello scrive il riassunto, e su quale
 * finestra si misura. Hermes fa lo stesso con `auxiliary.compression` (`agent/context_compressor.py`, il modello del riassunto è
 * un'opzione separata da quello della conversazione).
 * - Nessun modello del riassunto, o lo stesso della conversazione: tutto com'era (modello e finestra della conversazione).
 * - Un altro modello: la finestra è la più piccola delle due (l'ausiliario può averla minore: Haiku accanto a un modello da 1M); se
 *   la sua non è nota, vale quella della conversazione. Budget, ingresso e tetto si misurano su QUELLA finestra.
 * - Se in quella finestra non entra nemmeno la richiesta minima (budget d'uscita + margine + `INGRESSO_MINIMO_TOKEN_RIASSUNTO`), il
 *   riassunto va sul modello della conversazione: meglio pagare di più che mandare un ingresso tagliato male. `ripiego: 'finestra'`.
 */
export function sceltaDelRiassunto({ modelloConversazione, finestraConversazione = null, modelloRiassunto = null, finestraRiassunto = null, tokenDaRiassumere, soglia = null } = {}) {
  const positivo = (n) => Number.isFinite(n) && n > 0;
  const fc = positivo(finestraConversazione) ? Math.floor(finestraConversazione) : null;
  const diConversazione = (extra = {}) => ({
    modello: modelloConversazione, finestraToken: fc, ausiliario: false,
    budget: budgetRiassunto({ tokenDaRiassumere, finestraToken: fc, soglia }), ...extra,
  });
  if (typeof modelloRiassunto !== 'string' || !modelloRiassunto || modelloRiassunto === modelloConversazione) return diConversazione();
  const fa = positivo(finestraRiassunto) ? Math.floor(finestraRiassunto) : null;
  const finestra = fa !== null && fc !== null ? Math.min(fa, fc) : (fa ?? fc);
  const budget = budgetRiassunto({ tokenDaRiassumere, finestraToken: finestra, soglia });
  if (finestra !== null && finestra - budget.maxOutputTokens - MARGINE_TOKEN_RIASSUNTO < INGRESSO_MINIMO_TOKEN_RIASSUNTO) {
    return diConversazione({ ripiego: 'finestra' });
  }
  return { modello: modelloRiassunto, finestraToken: finestra, ausiliario: true, budget };
}

/*
 * ⛔ Owner 21/10/2026 («fai in modo che sta maledetta compattazione non dia più problemi sia con modelli locali che api key»): il TETTO
 *   D'USCITA del riassunto NON è più il budget (2.000-10.000), che un modello prolisso o che ragiona toccava ⇒ «troncato» ⇒ scartato.
 *   È quello di opencode, alla lettera (`packages/core/src/session/model-request.ts:88-98` `outputLimit` e `compaction.ts:931-947`
 *   `fitOutput`, `78359c6` del 15/10): il MINIMO fra il limite d'uscita del modello (se noto), 32.000, e lo spazio che la richiesta
 *   lascia nella finestra (se nota).
 * ⛔⛔ Revisione avversaria del 21/10 (ROSSO S2 sulla prima forma, `349a3f9a4`): «lo spazio nella finestra» DA SOLO mandava `max_tokens`
 *   fino a 116.651 e i fornitori col limite d'uscita proprio (gpt-4o: 16.384) rispondevano 400 ⇒ nessuna compattazione con le chiavi
 *   API, proprio il caso dell'owner. Avevo letto `fitOutput` al contrario: abbassa il tetto (`Math.min`), non lo alza.
 * ⇒ Il budget resta nel prompt (le parole). Limite ignoto ⇒ 32.000; e se un fornitore rifiuta comunque il tetto (400 sul `max_tokens`),
 *   chi chiama ritenta una volta col budget (`eRifiutoDelTettoUscita`).
 */
export const TETTO_USCITA_RIASSUNTO = 32_000;
export function tettoUscitaRiassunto(richiesta, { finestraToken = null, limiteUscita = null } = {}) {
  const tetti = [TETTO_USCITA_RIASSUNTO];
  if (Number.isFinite(limiteUscita) && limiteUscita > 0) tetti.push(Math.floor(limiteUscita));
  if (Number.isFinite(finestraToken) && finestraToken > 0) {
    const ingresso = (Array.isArray(richiesta) ? richiesta : []).reduce((somma, m) => somma + misuraPerRiassunto(m), 0);
    tetti.push(Math.max(1_024, Math.floor(finestraToken - Math.ceil(ingresso / CARATTERI_PER_TOKEN_PRUDENTI) - MARGINE_TOKEN_RIASSUNTO)));
  }
  return Math.min(...tetti);
}
/** Il fornitore ha rifiutato il TETTO d'uscita (400 che parla di `max_tokens` / token d'uscita): si ritenta col budget. */
export function eRifiutoDelTettoUscita(errore) {
  const stato = errore?.stato ?? errore?.status ?? errore?.statusCode;
  const testo = String(errore?.message ?? errore ?? '');
  if (stato !== 400 && !/\b400\b/u.test(testo)) return false;
  return /max[_ ]?(completion[_ ]?|output[_ ]?)?tokens|maximum (number of )?(output|completion) tokens|output tokens? (limit|exceed)|too many (output|completion) tokens/iu.test(testo);
}

export function caratteriIngressoPerFinestra({ finestraToken = null, maxOutputTokens = 0 } = {}) {
  if (!Number.isFinite(finestraToken) || finestraToken <= 0) return CARATTERI_INGRESSO_RIASSUNTO;
  const uscita = Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : MAX_TOKEN_RIASSUNTO;
  const tokenIngresso = Math.max(INGRESSO_MINIMO_TOKEN_RIASSUNTO, finestraToken - uscita - MARGINE_TOKEN_RIASSUNTO);
  return Math.min(CARATTERI_INGRESSO_RIASSUNTO, Math.floor(tokenIngresso * CARATTERI_PER_TOKEN_PRUDENTI));
}

/*
 * Quinta revisione del 20/10 (V1, V2): il peso VERO di un messaggio nell'ingresso del riassuntore. Prima si contava solo un
 * `content` stringa: gli argomenti delle chiamate (una scrittura di file da 300.000 caratteri) e i `content` ad array (un allegato
 * di testo, un'immagine in base64) non pesavano niente e passavano interi — nelle sessioni di codice, il prossimo «non entra».
 */
const IMMAGINE_OMESSA = '[image omitted from the summary input]';
function misuraPerRiassunto(m) {
  let n = 0;
  if (typeof m?.content === 'string') n += m.content.length;
  else if (Array.isArray(m?.content)) {
    for (const parte of m.content) {
      if (typeof parte?.text === 'string') n += parte.text.length;
      else if (typeof parte?.image_url?.url === 'string') n += parte.image_url.url.length;
      else if (typeof parte?.image_url === 'string') n += parte.image_url.length;
      else n += JSON.stringify(parte ?? '').length;
    }
  }
  if (Array.isArray(m?.tool_calls)) n += JSON.stringify(m.tool_calls).length;
  return n;
}

/** Il messaggio lungo del mezzo, a inizio + fine (Hermes 4.000 + 1.500). Il sistema e l'ultimo messaggio (l'istruzione) restano. */
function accorciaPerRiassunto(m, indice, ultimo) {
  if (indice === ultimo || m?.role === 'system' || !m || typeof m !== 'object') return m;
  let fuori = m;
  if (typeof m.content === 'string' && m.content.length > CARATTERI_MESSAGGIO_RIASSUNTO) {
    fuori = { ...fuori, content: accorciaTesto(m.content, { inizio: 4_000, fine: 1_500 }) };
  } else if (Array.isArray(m.content)) {
    // V2: le immagini diventano un segnaposto, i pezzi di testo lunghi si accorciano come il testo
    let cambiato = false;
    const parti = m.content.map((parte) => {
      if (parte?.type === 'image_url' || parte?.image_url !== undefined) { cambiato = true; return { type: 'text', text: IMMAGINE_OMESSA }; }
      if (typeof parte?.text === 'string' && parte.text.length > CARATTERI_MESSAGGIO_RIASSUNTO) {
        cambiato = true;
        return { ...parte, text: accorciaTesto(parte.text, { inizio: 4_000, fine: 1_500 }) };
      }
      return parte;
    });
    if (cambiato) fuori = { ...fuori, content: parti };
  }
  if (Array.isArray(m.tool_calls)) {
    // V1: gli argomenti lunghi si accorciano DENTRO il JSON (`accorciaArgomenti`, come la proiezione), una stringa rotta farebbe 400
    let cambiato = false;
    const chiamate = m.tool_calls.map((c) => {
      const argomenti = c?.function?.arguments;
      if (typeof argomenti !== 'string' || argomenti.length <= CARATTERI_MESSAGGIO_RIASSUNTO) return c;
      const corti = accorciaArgomenti(argomenti);
      if (corti === argomenti) return c;
      cambiato = true;
      return { ...c, function: { ...c.function, arguments: corti } };
    });
    if (cambiato) fuori = { ...fuori, tool_calls: chiamate };
  }
  return fuori;
}

/**
 * La richiesta di riassunto che ENTRA nella finestra: messaggi lunghi accorciati, poi il totale limitato (`limitaIngressoRiassunto`).
 * `frazione` < 1 restringe ancora (il secondo tentativo dopo un «non entra» usa la metà).
 */
export function ingressoRiassuntoPerFinestra(richiesta, { finestraToken = null, maxOutputTokens = 0, frazione = 1 } = {}) {
  const lista = Array.isArray(richiesta) ? richiesta : [];
  const quota = frazione > 0 && frazione <= 1 ? frazione : 1;
  const caratteri = Math.max(4_000, Math.floor(caratteriIngressoPerFinestra({ finestraToken, maxOutputTokens }) * quota));
  /* Condizione della CLI (20/10, Voce 208), più prudente di Hermes che accorcia sempre: il taglio per messaggio scatta SOLO con la
     finestra NOTA e un ingresso che NON ci sta. Finestra ignota ⇒ il solo tetto sul totale, come prima, con i confini che non
     spezzano le coppie (Voce 210); un ingresso che ci sta ⇒ la richiesta com'è, oggetto per oggetto. Un risultato d'attrezzo lungo
     e importante non si taglia senza motivo. */
  const finestraNota = Number.isFinite(finestraToken) && finestraToken > 0;
  /* CLI, Voce 210: anche qui il taglio (che avviene SOLO sopra il tetto, come prima) non spezza le coppie chiamata/esito.
     Sotto il tetto la richiesta resta identica byte per byte: `coppieIntere` sposta solo DOVE cade un taglio che c'è comunque. */
  if (!finestraNota) return limitaIngressoRiassunto(lista, { caratteriMassimi: Math.floor(CARATTERI_INGRESSO_RIASSUNTO * quota), coppieIntere: true });
  const totale = lista.reduce((somma, m) => somma + misuraPerRiassunto(m), 0);
  if (totale <= caratteri) return lista;
  const accorciata = lista.map((m, i) => accorciaPerRiassunto(m, i, lista.length - 1));
  return limitaIngressoRiassunto(accorciata, { caratteriMassimi: caratteri, lunghezza: misuraPerRiassunto, coppieIntere: true });
}

/* `lunghezza`: come si pesa un messaggio. Di serie il solo `content` stringa, come sempre (finestra ignota, chiamanti di prima).
   `coppieIntere`: i confini non spezzano una coppia chiamata/esito (sesta revisione, W2); di serie spento, come sempre. */
export function limitaIngressoRiassunto(messaggi, { caratteriMassimi = CARATTERI_INGRESSO_RIASSUNTO, lunghezza = null, coppieIntere = false } = {}) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  const lunghezzaDi = typeof lunghezza === 'function' ? lunghezza : (m) => String(m?.content ?? '').length;
  const totale = lista.reduce((somma, m) => somma + lunghezzaDi(m), 0);
  if (!(caratteriMassimi > 0) || totale <= caratteriMassimi) return lista;
  const budgetTesta = Math.floor(caratteriMassimi / 2);
  const budgetCoda = caratteriMassimi - budgetTesta - MARCATORE_INGRESSO_TAGLIATO.length;
  if (budgetCoda <= 0) return lista;
  /* Testa: i `system` iniziali si tengono SEMPRE (anche uno solo più grande della sua metà), poi il resto
   * del fronte finché il budget lo consente. */
  let fineTesta = 0;
  let usatiTesta = 0;
  while (fineTesta < lista.length && lista[fineTesta]?.role === 'system') {
    usatiTesta += lunghezzaDi(lista[fineTesta]);
    fineTesta += 1;
  }
  while (fineTesta < lista.length && usatiTesta + lunghezzaDi(lista[fineTesta]) <= budgetTesta) {
    usatiTesta += lunghezzaDi(lista[fineTesta]);
    fineTesta += 1;
  }
  /* Coda: si cammina all'indietro; l'ultimo messaggio (l'istruzione) si tiene comunque, il resto finché c'è
   * budget. Il confine con la testa non si scavalca mai. */
  let inizioCoda = lista.length;
  let usatiCoda = 0;
  while (inizioCoda > fineTesta) {
    const lunghezza = lunghezzaDi(lista[inizioCoda - 1]);
    if (inizioCoda < lista.length && usatiCoda + lunghezza > budgetCoda) break;
    usatiCoda += lunghezza;
    inizioCoda -= 1;
  }
  if (coppieIntere) {
    /* Sesta revisione del 20/10 (W2): il taglio a messaggi interi spezzava le coppie chiamata/esito ai due confini — una
       chiamata in testa coi suoi esiti nel mezzo omesso, o esiti in coda la cui chiamata è sparita — e un fornitore severo
       risponde 400 sul riassunto. Testa: torna a prima dell'ultima chiamata che non ha TUTTI i suoi esiti in testa. Coda: salta
       gli esiti iniziali (l'ultimo messaggio, l'istruzione, resta sempre). */
    const idChiamate = (m) => (m?.role === 'assistant' && Array.isArray(m.tool_calls) ? m.tool_calls.map((c) => c?.id).filter(Boolean) : []);
    for (;;) {
      let k = fineTesta - 1;
      while (k >= 0 && lista[k]?.role === 'tool') k -= 1;
      if (k < 0 || idChiamate(lista[k]).length === 0) break;
      const esiti = new Set(lista.slice(k + 1, fineTesta).map((m) => m?.tool_call_id));
      if (idChiamate(lista[k]).every((id) => esiti.has(id))) break;
      fineTesta = k;
    }
    while (inizioCoda < lista.length - 1 && lista[inizioCoda]?.role === 'tool') inizioCoda += 1;
  }
  if (inizioCoda <= fineTesta) return lista; /* testa+coda coprono tutto: nulla da omettere, si resta com'era */
  return [
    ...lista.slice(0, fineTesta),
    { role: 'user', content: MARCATORE_INGRESSO_TAGLIATO },
    ...lista.slice(inizioCoda),
  ];
}

/*
 * ⛔ BUG-5 (05/10/2026) — LE CLASSI DI FALLIMENTO DEL RIASSUNTORE. Oggi `compattaOra` conta «fallito» e
 *   basta: un 402 di credito esaurito e un riassunto vuoto pesano uguale, l'evento `compattazione-fine` non
 *   dice PERCHÉ e chi guarda il registro non può decidere se riprovare, aspettare o smettere. Sette classi,
 *   pure, nello spirito di Hermes `agent/error_classifier.py` (i pattern si leggono nel messaggio, non nello
 *   stato): 'vuoto', 'troncato', 'attrezzo' (le tre di `valutaRispostaDiRiassunto`), 'contesto-pieno'
 *   (via `classificaErroreFornitore`), 'limite-tariffa' (429/402/quota/credit — NON è overflow: il contesto
 *   c'entra, il portafoglio no), 'errore-rete' (fetch/timeout/connessione/abort), 'errore-ignoto'.
 */
export const CLASSI_FALLIMENTO_RIASSUNTO = Object.freeze(['vuoto', 'troncato', 'attrezzo', 'rifiuto', 'contesto-pieno', 'limite-tariffa', 'errore-rete', 'errore-ignoto']);
const PATTERN_LIMITE_TARIFFA = /\b(?:402|429)\b|quota|credit|insufficient|rate[ _-]?limit|too many requests/i;
const PATTERN_ERRORE_RETE = /fetch failed|network error|timeout|timed?[ _-]?out|ECONN|ENOTFOUND|EAI_AGAIN|socket hang up|aborted|operation was aborted/i;

export function classificaFallimentoRiassunto({ esito = null, errore = null } = {}) {
  if (esito && esito.ok === false) {
    if (esito.motivo === 'vuoto' || esito.motivo === 'troncato' || esito.motivo === 'attrezzo' || esito.motivo === 'rifiuto') return esito.motivo;
    return classificaFallimentoRiassunto({ errore: errore ?? esito.errore ?? null });
  }
  if (!errore) return 'errore-ignoto';
  if (classificaErroreFornitore(errore) === 'contesto-pieno') return 'contesto-pieno';
  /* ⛔ Lo STATO parla prima del testo: un 402/429 con un messaggio generico («payment required», «error»)
   *   resta un limite di tariffa, non un ignoto. */
  const stato = Number(errore?.stato ?? errore?.status ?? NaN);
  const testo = `${errore?.message ?? ''} ${errore?.code ?? ''} ${errore?.name ?? ''}`;
  if (stato === 402 || stato === 429 || PATTERN_LIMITE_TARIFFA.test(testo)) return 'limite-tariffa';
  if (errore?.name === 'AbortError' || PATTERN_ERRORE_RETE.test(testo)) return 'errore-rete';
  return 'errore-ignoto';
}

/*
 * ⛔ BUG-5 (05/10/2026) — IL GIRO DI FALLIMENTI. Con l'ingresso limitato un riassunto può ancora fallire per
 *   cause che UN secondo tentativo identico non guarisce (credito, chiave, fornitore giù). Oggi ogni
 *   compattazione paga fino a 2 tentativi, per TUTTO il turno: sotto il pavimento incomprimibile la prova del
 *   26/09 pagava «un riassunto a ogni richiesta». La stessa malattia, lato riassuntore: al massimo
 *   `FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI` tentativi falliti CONSECUTIVI si pagano nel turno (il contatore
 *   corre a TENTATIVO, dentro il ciclo di `compattaOra`) — il quarto identico non si chiede. Un riassunto
 *   riuscito azzera il contatore.
 */
export const FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI = 3;
