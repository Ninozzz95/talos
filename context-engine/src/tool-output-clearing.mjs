/*
 * C1, livello 1 del metodo approvato dall'owner il 09/10/2026 sera — la compattazione SENZA modello, prima del riassunto.
 *
 * Fonti (lette il 09/10/2026, `Downloads/handoff-talos-2026-09-27/RICERCA-C1-CONTEXT-ENGINEERING-2026-10-09.md` §3):
 *  - CliffCompaction (arXiv 2609.26779, settembre 2026): a regole, nessun modello; alla lettera sistema, compito e ultimi
 *    turni; chiamate ridotte a firme da 150 caratteri, uscite oltre 500 caratteri scartate, pensieri tagliati a 300.
 *    GLM 5.1 su SWE-bench Verified 69,33% contro 71,40% con la storia intera, costo -36/-65%.
 *  - Anthropic `clear_tool_uses_20250919`: toglie le uscite vecchie, lascia la traccia della chiamata, tiene le ultime N
 *    (`keep`) e cancella a blocchi (`clear_at_least`) perché ogni riscrittura rompe la cache del prefisso.
 *  - Hermes (clone `65ad529`, `agent/context_compressor.py`): `:855` «[Old tool output cleared to save context space]»,
 *    `:1653-1667` la firma di una riga (`[terminal] ran `cmd` -> exit N, L lines output`), `:3391-3399` l'isteresi: si
 *    riscrive solo quando il guadagno è vero, poi si aspetta una ricrescita intera.
 *
 * ⇒ Adattato al motore, che è senza stato fra una richiesta e l'altra: l'isteresi di Hermes diventa un TAGLIO A GRADINI.
 *   Le uscite si tolgono a blocchi di `step`, contate dalla più vecchia: aggiungere un'uscita non sposta il taglio finché
 *   non si completa il blocco successivo, quindi il prefisso (e la sua cache) resta identico per `step` chiamate.
 * ⛔ Non tocca MAI i messaggi della persona né quelli di sistema (Lost in Compaction, arXiv 2608.11242: i vincoli laterali si
 *   perdono quando si riscrivono), non toglie messaggi e non spezza una coppia chiamata/esito: cambia solo `content` degli
 *   esiti, gli argomenti delle chiamate (dentro il JSON, che resta valido) e il ragionamento in chiaro.
 */
export const KEEP_RECENT_TOOL_OUTPUTS = 6;
export const CLEARING_STEP = 16;
export const MIN_CLEARABLE_CHARS = 500;
export const SIGNATURE_CHARS = 150;
export const REASONING_KEEP_CHARS = 300;
export const DEFAULT_CLEARED_POINTER = 'The full output is kept in the conversation archive.';

const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(part => typeof part?.text === 'string' ? part.text : '').join('') : '';
const cut = (value, max) => value.length <= max ? value : `${value.slice(0, max - 1)}…`;

function shortenArguments(raw) {
  if (typeof raw !== 'string' || raw.length <= MIN_CLEARABLE_CHARS) return raw;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return raw; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return raw;
  let changed = false;
  const next = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string' && value.length > MIN_CLEARABLE_CHARS) { next[key] = `${value.slice(0, SIGNATURE_CHARS)}… [${value.length - SIGNATURE_CHARS} characters cleared to save context]`; changed = true; }
    else next[key] = value;
  }
  return changed ? JSON.stringify(next) : raw;
}

/** The one-line signature of a call: its name and its arguments, at most 150 characters (CliffCompaction). */
export function toolCallSignature(call) {
  const name = call?.function?.name ?? 'tool';
  const args = typeof call?.function?.arguments === 'string' ? call.function.arguments : JSON.stringify(call?.function?.arguments ?? {});
  return cut(`${name}(${args})`, SIGNATURE_CHARS);
}

/*
 * C1 (owner 09/10/2026 sera, «Tutti e due»): SOTTO PRESSIONE le uscite grandi della parte recente si accorciano come nel legacy
 * (decisione owner 26/09, `compattazione-desktop.mjs::accorciaTesto`, forma di Hermes `context_compressor.py:3065-3113` pass 4):
 * inizio e fine più un rimando, l'ULTIMA uscita resta intera. Trovato dal vivo: poche uscite enormi (30.000 caratteri ciascuna)
 * restavano intere perché le regole sopra le toccano solo oltre le ultime 6 e a blocchi di 16, e il contesto sforava.
 */
export const PRESSURE_MIN_CHARS = 2000;
export const PRESSURE_HEAD_CHARS = 1200;
export const PRESSURE_TAIL_CHARS = 400;

/*
 * ⛔ Review Y2 del bugfixer (10/10/2026): la prima forma teneva intera solo l'ULTIMA uscita e accorciava tutte le altre insieme.
 *   In un giro di letture in parallelo le uscite appena arrivate, che il modello ha chiesto e NON ha ancora letto, si tagliavano
 *   (sonda: 3 letture da 6.300 caratteri → due a 1.664) — e ogni giro spostava il punto di taglio, cioè la cache.
 * ⇒ Come Hermes (`agent/context_compressor.py`, clone 865ba906 del 07/10):
 *   · il GIRO IN SOSPESO (le uscite con cui finisce la conversazione) si risparmia, salvo che da solo superi la quota dura
 *     (`_spared_pending_tool_round`, 3364-3375; `TAIL_MAX_CONTEXT_FRACTION = 0.20`, 949): «a stub makes it re-run the call…
 *     or answer blind» (3381-3386);
 *   · si accorcia dalle uscite PIÙ VECCHIE, tenendo intere le ultime 3 righe (`_PRESSURE_KEEP_RECENT_MESSAGES`, 1166), e ci si
 *     FERMA appena tolto abbastanza (pass 4, 3318-3340); «tutte tranne la più nuova» è l'ultima risorsa (3341-3345), e la più
 *     nuova solo se non è del giro risparmiato (3346-3352).
 *   `removeChars` = quanto togliere per stare sotto la soglia (lo calcola il motore dalla misura); senza, si toglie tutto il
 *   possibile come prima. `spareLimitChars` = la quota dura in caratteri; senza, il giro si risparmia sempre.
 */
export const PRESSURE_KEEP_RECENT_MESSAGES = 3;
export function shortenRecentLargeOutputs(messages, { pointer = DEFAULT_CLEARED_POINTER, removeChars = Infinity, spareLimitChars = Infinity } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  /* Review Y2-bis (bugfixer, 10/10): K5 consegna un messaggio messo in coda DOPO le uscite del giro (`talosHarness.mjs:15447-15470`):
     quelle righe utente non rispondono al giro. Come Hermes `_pending_tool_round` (1365-1376, che salta le righe «steer» in
     coda) si saltano le righe utente che seguono DIRETTAMENTE le uscite, e si risparmiano solo le uscite. */
  let pendingEnd = list.length; // se prima delle righe utente non c'è un'uscita, il giro sotto risulta vuoto: niente si risparmia
  while (pendingEnd > 0 && list[pendingEnd - 1]?.role === 'user') pendingEnd--;
  let pendingStart = pendingEnd;
  while (pendingStart > 0 && list[pendingStart - 1]?.role === 'tool') pendingStart--;
  const pendingChars = list.slice(pendingStart, pendingEnd).reduce((n, m) => n + (typeof m?.content === 'string' ? m.content.length : 0), 0);
  const spared = pendingChars <= spareLimitChars ? pendingStart : pendingEnd;
  let last = -1;
  for (let index = list.length - 1; index >= 0; index--) if (list[index]?.role === 'tool') { last = index; break; }
  const shortenable = index => {
    const message = list[index];
    if (message?.role !== 'tool' || typeof message.content !== 'string' || (index >= spared && index < pendingEnd)) return false;
    return message.content.length >= PRESSURE_MIN_CHARS && message.content.length > PRESSURE_HEAD_CHARS + PRESSURE_TAIL_CHARS;
  };
  const next = list.slice();
  let shortened = 0; let removed = 0;
  const shrink = index => {
    if (next[index] !== list[index] || !shortenable(index)) return;
    const content = list[index].content;
    const omitted = content.length - PRESSURE_HEAD_CHARS - PRESSURE_TAIL_CHARS;
    const replacement = `${content.slice(0, PRESSURE_HEAD_CHARS)}\n[… ${omitted} characters omitted to fit the context window. ${pointer}]\n${content.slice(-PRESSURE_TAIL_CHARS)}`;
    next[index] = { ...list[index], content: replacement };
    shortened++; removed += content.length - replacement.length;
  };
  const enough = () => removed >= removeChars;
  const floor = list.length - Math.min(PRESSURE_KEEP_RECENT_MESSAGES, list.length);
  for (let index = 0; index < floor && !enough(); index++) shrink(index);
  for (let index = 0; index < list.length && !enough(); index++) if (index !== last) shrink(index);
  // l'ultima risorsa (Hermes 3346-3352) solo con un obiettivo dichiarato: senza `removeChars` la più nuova resta intera, come prima
  if (Number.isFinite(removeChars) && !enough() && last >= 0) shrink(last);
  return shortened ? { messages: next, shortened } : { messages: list, shortened: 0 };
}

/**
 * Old tool outputs become signature + pointer, old call arguments and old plain-text reasoning are shortened; the last
 * `keepRecent` outputs, every person and system message, and every short output stay verbatim. Returns the SAME array
 * when nothing changes (no cache break for nothing).
 */
export function clearOldToolOutputs(messages, { keepRecent = KEEP_RECENT_TOOL_OUTPUTS, step = CLEARING_STEP, minChars = MIN_CLEARABLE_CHARS, pointer = DEFAULT_CLEARED_POINTER } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const outputs = list.flatMap((message, index) => message?.role === 'tool' ? [index] : []);
  const blocks = Math.floor(Math.max(0, outputs.length - keepRecent) / Math.max(1, step));
  if (!blocks) return { messages: list, cleared: 0 };
  const boundary = outputs[blocks * step - 1]; // the last output of the last complete block: everything up to it is old
  const calls = new Map();
  for (const message of list) for (const call of message?.tool_calls ?? []) calls.set(call.id, call);
  let cleared = 0;
  const next = list.map((message, index) => {
    if (index > boundary) return message;
    if (message?.role === 'tool') {
      // Y2 (review del bugfixer, 09/10): un'uscita con parti non testuali (un'immagine) resta intera, testo compreso
      if (Array.isArray(message.content) && message.content.some(part => typeof part?.text !== 'string')) return message;
      const content = text(message.content);
      if (content.length <= minChars) return message;
      cleared++;
      const lines = content.split('\n').length;
      return { ...message, content: `[Old tool output cleared to save context: ${toolCallSignature(calls.get(message.tool_call_id))} returned ${content.length} characters, ${lines} lines. ${pointer}]` };
    }
    if (message?.role !== 'assistant') return message;
    let changed = false;
    const patch = {};
    if (Array.isArray(message.tool_calls)) {
      const shortened = message.tool_calls.map(call => {
        const args = shortenArguments(call?.function?.arguments);
        if (args === call?.function?.arguments) return call;
        changed = true;
        return { ...call, function: { ...call.function, arguments: args } };
      });
      if (changed) patch.tool_calls = shortened;
    }
    for (const field of ['reasoning_content', 'reasoning']) {
      if (typeof message[field] === 'string' && message[field].length > REASONING_KEEP_CHARS) { patch[field] = `${message[field].slice(0, REASONING_KEEP_CHARS)}…`; changed = true; }
    }
    return changed ? { ...message, ...patch } : message;
  });
  return cleared || next.some((message, index) => message !== list[index]) ? { messages: next, cleared } : { messages: list, cleared: 0 };
}
