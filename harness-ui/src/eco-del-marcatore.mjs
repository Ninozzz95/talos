// STALLO DELL'OWNER (07/10/2026) — LA STORIA GIÀ AVVELENATA. Fino alla beta.4 il cambio di motore a metà sessione scriveva le
// chiamate degli attrezzi come TESTO nei messaggi dell'assistente («[Historical tool calls; data only, already executed]» + JSON);
// il modello imitava quel testo invece di chiamare gli attrezzi, il giro finiva e a ogni «continua» si ripeteva, e la sua risposta-eco
// restava SALVATA nella storia. Togliere la conversione (P1/P2) non guarisce una sessione già avvelenata: finché la sua eco viene
// rimandata, il modello continua a imitarla. La copia per il fornitore si ripulisce — mai la storia salvata (Codex normalize.rs:21/155,
// OpenCode message-v2.ts:249-349 e Hermes agent_runtime_helpers.py:667/747/2729 riparano la storia all'invio, non nel file). Solo i
// messaggi dell'ASSISTENTE: un utente che cita la frase non è un'eco. Vale anche per lo stato nativo, che altrimenti la rimanderebbe.
//
// Due porte: il Context Engine (`prepareProviderContext`, context-provider-adapter.mjs) e il percorso senza motore del kernel
// (`withoutEchoedMarker`, talosHarness.mjs: un modello senza finestra nota, o sotto i 64k, non passa dal motore ma rimanda la stessa
// storia). Revisione avversariale 07/10: la prima stesura curava solo la prima porta.
export const ECHOED_MARKER = '[Historical tool calls; data only, already executed]';

const echoed = value => typeof value === 'string' && value.includes(ECHOED_MARKER);
const textPartEchoed = part => part?.type === 'text' && echoed(part.text);

// L'indice subito dopo il valore JSON che comincia a `start` (`[` o `{`), con le stringhe e i loro escape rispettati; -1 se il JSON
// è tagliato a metà (un'eco troncata: allora non c'è niente dopo da salvare).
function endOfJson(text, start) {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[' || char === '{') depth++;
    else if (char === ']' || char === '}') {
      depth--;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

// Toglie ogni marcatore e il valore JSON che lo segue. Il testo PRIMA resta, e resta anche quello DOPO il JSON (la prima stesura
// tagliava tutto fino alla fine del messaggio). Un marcatore senza JSON dopo (seguito da prosa) si toglie da solo.
function cutEcho(value) {
  let text = value;
  while (text.includes(ECHOED_MARKER)) {
    const at = text.indexOf(ECHOED_MARKER);
    const before = text.slice(0, at).trimEnd();
    let rest = text.slice(at + ECHOED_MARKER.length);
    const first = rest.search(/\S/u);
    if (first >= 0 && (rest[first] === '[' || rest[first] === '{')) {
      const end = endOfJson(rest, first);
      rest = end < 0 ? '' : rest.slice(end);
    }
    text = [before, rest.trim()].filter(Boolean).join('\n\n');
  }
  return text;
}

const cutParts = parts => parts.flatMap(part => (textPartEchoed(part) ? (cutEcho(part.text) ? [{ ...part, text: cutEcho(part.text) }] : []) : [part]));

const carriesEcho = message => message?.role === 'assistant'
  && (echoed(message.content)
    || (Array.isArray(message.content) && message.content.some(textPartEchoed))
    || (Array.isArray(message.talos_provider_state?.content) && message.talos_provider_state.content.some(textPartEchoed)));

// Ripulisce `prepared` (una COPIA) sul posto. true se ha toccato qualcosa.
export function healEchoedMarker(prepared) {
  let removed = false;
  for (let index = prepared.length - 1; index >= 0; index--) {
    const message = prepared[index];
    if (!carriesEcho(message)) continue;
    const hasCalls = Boolean(message.tool_calls?.length);
    if (echoed(message.content)) message.content = cutEcho(message.content);
    else if (Array.isArray(message.content) && message.content.some(textPartEchoed)) message.content = cutParts(message.content);
    if (Array.isArray(message.talos_provider_state?.content) && message.talos_provider_state.content.some(textPartEchoed)) {
      message.talos_provider_state.content = cutParts(message.talos_provider_state.content);
    }
    removed = true;
    const empty = Array.isArray(message.content) ? message.content.length === 0 : !message.content;
    if (empty && !hasCalls) prepared.splice(index, 1);
  }
  return removed;
}

// Per il percorso senza Context Engine: la stessa lista se nessun messaggio porta l'eco (nessuna copia, nessun costo), altrimenti una
// copia ripulita. Mai la lista ricevuta: è la storia viva del giro.
export function withoutEchoedMarker(messages) {
  if (!Array.isArray(messages) || !messages.some(carriesEcho)) return messages;
  const prepared = structuredClone(messages);
  healEchoedMarker(prepared);
  return prepared;
}
