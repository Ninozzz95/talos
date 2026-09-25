/**
 * RAG-COD (24/09/2026, owner «nel server del Codice») — per ogni modello OpenRouter, se il ragionamento si può
 * spegnere e quali livelli accetta: l'oggetto `reasoning` del catalogo pubblico `GET /api/v1/models`.
 *
 * ## Perché
 * GLM 5.3 ragiona per forza. Una richiesta senza `reasoning` ha fatto scrivere a un fornitore OpenRouter il
 * ragionamento dentro la risposta (chat mobile, 45.580 caratteri). Il catalogo lo dichiara — misurato il 24/09/2026:
 * `z-ai/glm-5.3-flash` → `{"mandatory":true,"supported_efforts":["max","high","low"],"default_effort":"max"}`, 111
 * modelli obbligatori su 458. La regola che usa questi dati è nel kernel (`regolaReasoningPerModello`), per ogni
 * chiamata e col modello di QUEL giro (l'esecutore può essere un altro modello).
 *
 * ## Come
 * - Solo OpenRouter: un id senza prefisso o con `openrouter:` (la convenzione di `model-destination.mjs`); gli altri
 *   fornitori tornano `null` senza toccare la rete.
 * - Il catalogo è pubblico: nessuna chiave nella richiesta.
 * - Letto una volta e tenuto per `validitaMs`; una lettura fallita non ferma nessuna sessione (`null` = «il catalogo
 *   tace», il kernel lascia il `reasoning` del chiamante) e si riprova solo dopo `attesaDopoErroreMs`; se c'era un
 *   catalogo vecchio, si tiene quello.
 * - Desktop, stessa lettura: `AVM-harness-desktop/harness-ui/src/model-catalog.mjs:47-54` (sola lettura, 24/09).
 */
import { separaFonteModello } from './model-destination.mjs';

const URL_CATALOGO = 'https://openrouter.ai/api/v1/models';

function politicaDa(reasoning) {
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return null;
  if (typeof reasoning.mandatory !== 'boolean') return null;
  const livelli = Array.isArray(reasoning.supported_efforts)
    ? reasoning.supported_efforts.filter((livello) => typeof livello === 'string')
    : [];
  return {
    mandatory: reasoning.mandatory,
    supportedEfforts: livelli,
    defaultEffort: typeof reasoning.default_effort === 'string' ? reasoning.default_effort : null,
  };
}

export function creaLettorePoliticaRagionamento({
  fetchDiRete = fetch,
  ora = () => Date.now(),
  validitaMs = 6 * 60 * 60 * 1000,
  attesaDopoErroreMs = 5 * 60 * 1000,
  timeoutMs = 10_000,
} = {}) {
  let mappa = null;
  let lettoAlle = 0;
  let erroreAlle = null;
  let inCorso = null;

  async function carica() {
    try {
      const risposta = await fetchDiRete(URL_CATALOGO, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
      if (!risposta.ok) throw new Error(`catalogo OpenRouter: HTTP ${risposta.status}`);
      const corpo = await risposta.json();
      const nuova = new Map();
      for (const modello of Array.isArray(corpo?.data) ? corpo.data : []) {
        if (typeof modello?.id !== 'string') continue;
        const politica = politicaDa(modello.reasoning);
        if (politica) nuova.set(modello.id, politica);
      }
      mappa = nuova;
      lettoAlle = ora();
      erroreAlle = null;
    } catch {
      erroreAlle = ora();
    }
  }

  return async function politicaRagionamento(modello) {
    let fonte;
    let modelloRemoto;
    try {
      ({ fonte, modelloRemoto } = separaFonteModello(modello));
    } catch {
      return null;
    }
    if (fonte !== 'openrouter') return null;
    const scaduto = !mappa || ora() - lettoAlle >= validitaMs;
    const inPausa = erroreAlle !== null && ora() - erroreAlle < attesaDopoErroreMs;
    if (scaduto && !inPausa) {
      inCorso ??= carica().finally(() => { inCorso = null; });
      await inCorso;
    }
    return mappa?.get(modelloRemoto) ?? null;
  };
}

/** Il lettore del server: uno per processo, condiviso da sessioni e automazioni. */
export const politicaRagionamentoReale = creaLettorePoliticaRagionamento();
