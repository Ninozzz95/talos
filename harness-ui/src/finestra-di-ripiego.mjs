/*
 * 11/11/2026 — LA FINESTRA DEL MODELLO QUANDO NON SI LEGGE (owner 13:50, v1465, punto 5: «Sì, come Hermes»; brief
 * `BRIEF-AGENTE-SOGLIA-200K-E-SCRITTA-245-2026-11-11.md`).
 *
 * Misura (MISURE-RESA-DEL-MODELLO-2026-11-10.md §4, reperto 2): la finestra di un modello OpenRouter veniva SOLO da `/endpoints`
 * (`compaction-window-source.mjs`). Alla prima chiamata di ogni modello, e per 60 s dopo una lettura fallita, era `null`, e la soglia
 * valeva 200.000 (`compattazione-desktop.mjs`, `TETTO_TOKEN_DEFAULT`) anche su DeepSeek V3.2 da 163.840: nessuna pulizia e nessun
 * riassunto fino al 96% della finestra, e TALOS compattava solo DOPO il 400 del fornitore. Il server aveva già 163.840 nel catalogo.
 *
 * L'ordine, dal più vero al più prudente:
 *  1. la memoria che la PERSONA ha scritto per quel modello (Impostazioni → Memoria e contesto, o `app_settings`): vince su tutto,
 *     come `model.context_length` di Hermes e `model_context_window` di Codex;
 *  2. la rotta letta (`/endpoints`, il minimo vero degli endpoint): com'era;
 *  3. il catalogo del modello (OpenRouter, piano ChatGPT, fornitori diretti da models.dev): `contextLength`;
 *  4. la finestra PRUDENTE, 128.000: quella di pi (`provider-composer.ts:242`), di Koda e di NeuroLink per un modello ignoto. Hermes
 *     parte da 256.000 e scende sui rifiuti; Codex usa 272.000; Claude Code 200.000 e lo dice (CHANGELOG.md:30). Si sceglie la più
 *     bassa fra le comuni perché un ripiego troppo largo fa compattare DOPO il rifiuto del fornitore (il guasto misurato), uno troppo
 *     stretto compatta prima del necessario e basta: la persona lo vede (la riga «memoria non nota») e scrive quella giusta.
 *
 * ⛔ I motori locali (`local:`, `locale-ospite:`) hanno la loro finestra VERA e restano fuori: li sceglie `server.mjs` prima di qui.
 * ⛔ Nessuna lettura blocca il giro: i cataloghi si leggono in sottofondo (come `/endpoints`), la prima chiamata prende ciò che c'è.
 * Fonti: Hermes `agent/model_metadata.py:255-271`; Codex `models-manager/src/model_info.rs:18-26`, `:97-129`; pi
 *   `packages/coding-agent/src/core/provider-composer.ts:242`; Claude Code CHANGELOG.md:30, :1709; DeepSeek
 *   `packages/client/ui-settings-models/src/client/locales.ts:56-57`.
 */

/** La finestra di ripiego quando nessuno la sa: 128.000 token (vedi sopra il perché). */
export const FINESTRA_PRUDENTE = 128_000;
/** I limiti di ciò che la persona può scrivere: sotto 4.096 non lavora nessun modello d'agente, sopra 10 milioni non ne esiste uno. */
export const FINESTRA_SCRITTA_MINIMA = 4_096;
export const FINESTRA_SCRITTA_MASSIMA = 10_000_000;
/** Da dove viene la finestra: la riga «memoria non nota» si mostra solo per 'prudente'. */
export const FONTI_DELLA_FINESTRA = Object.freeze(['persona', 'rotta', 'catalogo', 'prudente']);

const MOTIVO_FINESTRA_SCRITTA = `The memory of a model is a whole number of tokens between ${FINESTRA_SCRITTA_MINIMA.toLocaleString('en-US')} and ${FINESTRA_SCRITTA_MASSIMA.toLocaleString('en-US')}, or null for automatic.`;
/* Giro dopo i revisori (punto 5, BASSO 4 di A): rotta e catalogo hanno lo stesso tetto della persona; 1e12 da una rotta storta non è una finestra */
const finestraValida = (n) => Number.isSafeInteger(n) && n > 0 && n <= FINESTRA_SCRITTA_MASSIMA;
const scrittaValida = (n) => Number.isSafeInteger(n) && n >= FINESTRA_SCRITTA_MINIMA && n <= FINESTRA_SCRITTA_MASSIMA;
/** I motori locali: la loro finestra la dice il motore, non un catalogo del cloud. */
const FONTI_LOCALI = new Set(['local', 'locale-ospite', 'lmstudio', 'ollama', 'llama.cpp', 'esterno']);

/**
 * Un valore scritto dalla persona (dalle Impostazioni o da `app_settings`): `{ ok:true, valore }` (`null` = torna automatica) o
 * `{ ok:false, motivo }` con la frase per il modello e per la rotta. Una cifra scritta come testo vale (l'attrezzo può mandarla così).
 */
export function controllaFinestraScritta(valore) {
  if (valore === null) return { ok: true, valore: null };
  const numero = typeof valore === 'string' && /^\d{1,9}$/u.test(valore.trim()) ? Number(valore.trim()) : valore;
  return scrittaValida(numero) ? { ok: true, valore: numero } : { ok: false, motivo: MOTIVO_FINESTRA_SCRITTA };
}

/** L'id come lo cercano rotta e catalogo di OpenRouter: senza il prefisso `openrouter:` del selettore. */
export const idSenzaOpenRouter = (id) => (typeof id === 'string' && id.startsWith('openrouter:') ? id.slice('openrouter:'.length) : id);

/*
 * Giro dopo i revisori (punti 10 e 14, MEDIO 2 di C): OpenAI diretto coi modelli da 400.000 accetta al massimo 272.000 token d'INGRESSO
 *   (models.dev `limit.input`, letto in `model-catalog-models-dev.mjs` come `maxInputTokens`; forum di OpenAI, «Input tokens exceed the
 *   configured limit of 272,000 tokens»). Con la finestra intera la soglia del compattatore di prima era 300.000: si compattava solo dopo
 *   il rifiuto. Come Hermes, che toglie l'uscita dalla finestra (`agent/context_compressor.py:2771-2775`): l'ingresso, quando il catalogo
 *   lo dice ed è più stretto della finestra.
 */
const finestraDellaVoce = (voce) => {
  const intera = finestraValida(voce?.contextLength) ? voce.contextLength : null;
  const ingresso = finestraValida(voce?.maxInputTokens) ? voce.maxInputTokens : null;
  if (intera === null) return null;
  return ingresso !== null && ingresso < intera ? ingresso : intera;
};

/**
 * La finestra dai cataloghi dei modelli, in modo SINCRONO per il registro: `get(id)` dà ciò che è già stato letto (o `null`) e, se
 * manca, avvia la lettura in sottofondo; un catalogo che non risponde non inventa niente e si riprova dopo `retryMs`.
 * @param {{ openrouter?: () => Promise<{modelli?: Array}>, chatgpt?: () => Promise<Array|null>, diretto?: (fornitore: string) => Promise<{modelli?: Array}>,
 *   now?: () => number, ttlMs?: number, retryMs?: number }} [porte]
 */
export function creaFinestraDaiCataloghi({ openrouter = null, chatgpt = null, diretto = null, now = Date.now, ttlMs = 10 * 60 * 1_000, retryMs = 60_000 } = {}) {
  const lette = new Map();
  const inVolo = new Set();
  const riprovaDopo = new Map();

  async function elencoPer(id) {
    if (id.startsWith('chatgpt:')) return typeof chatgpt === 'function' ? await chatgpt() : null;
    const prefisso = /^([a-z0-9][a-z0-9.-]*):/u.exec(id)?.[1] ?? null;
    if (prefisso === null || prefisso === 'openrouter') return typeof openrouter === 'function' ? (await openrouter())?.modelli : null;
    return typeof diretto === 'function' ? (await diretto(prefisso))?.modelli : null;
  }

  async function rinfresca(id) {
    inVolo.add(id);
    let finestra = null;
    try {
      const elenco = await elencoPer(id);
      const cercato = idSenzaOpenRouter(id);
      const voce = Array.isArray(elenco) ? elenco.find((m) => m?.id === cercato) : null;
      finestra = finestraDellaVoce(voce);
    } catch { finestra = null; } finally { inVolo.delete(id); }
    if (finestra === null) riprovaDopo.set(id, now() + retryMs);
    else { lette.set(id, { finestra, scade: now() + ttlMs }); riprovaDopo.delete(id); }
    return finestra;
  }

  function get(modello) {
    if (typeof modello !== 'string' || !modello || FONTI_LOCALI.has(/^([a-z0-9][a-z0-9.-]*):/u.exec(modello)?.[1] ?? '')) return null;
    const id = idSenzaOpenRouter(modello); // `openrouter:x/y` e `x/y` sono lo stesso modello: una lettura sola
    const voce = lette.get(id);
    if (voce && voce.scade > now()) return voce.finestra;
    if (!inVolo.has(id) && (riprovaDopo.get(id) ?? 0) <= now()) void rinfresca(id);
    return voce ? voce.finestra : null; // una lettura scaduta vale finché la nuova non arriva: il catalogo non cambia ogni dieci minuti
  }

  return Object.freeze({ get, rinfresca });
}

/** La finestra con la sua fonte, dall'ordine scritto in testa al file. Ogni argomento fuori forma conta come assente. */
export function scegliFinestra({ scritta = null, dallaRotta = null, dalCatalogo = null } = {}) {
  const letta = finestraValida(dallaRotta) ? { finestra: dallaRotta, fonte: 'rotta' }
    : finestraValida(dalCatalogo) ? { finestra: dalCatalogo, fonte: 'catalogo' } : { finestra: FINESTRA_PRUDENTE, fonte: 'prudente' };
  if (!scrittaValida(scritta)) return letta;
  /* Owner 17:27 (Q1, `DECISIONE-OWNER-2026-11-11-1727-FINESTRA-DEL-MODELLO-VINCE-LA-PERSONA-CON-AVVISO.md`): vince la persona, ma se è
     più grande di quella letta lo si dice col numero letto (come Hermes `agent/model_metadata.py:2219-2221` vince, e Codex la limiterebbe,
     `models-manager/src/model_info.rs:20-26`). Nessuna carta in più: la riga nella scheda Contesto e nella carta delle Impostazioni. */
  return { finestra: scritta, fonte: 'persona', ...(letta.fonte !== 'prudente' && scritta > letta.finestra ? { sopraIlCatalogo: letta.finestra } : {}) };
}

/**
 * La scelta per un modello del cloud, sincrona: `(modello) => { finestra, fonte }`. `rotta` è `createCompactionWindowSource()`,
 * `cataloghi` è `creaFinestraDaiCataloghi(...)`, `scrittaFn(modello)` la memoria scritta dalla persona (`null` = nessuna).
 */
export function creaSceltaDellaFinestra({ rotta = null, cataloghi = null, scrittaFn = null } = {}) {
  const lette = (modello) => {
    let dallaRotta = null;
    try { dallaRotta = rotta?.get?.(idSenzaOpenRouter(modello)) ?? null; } catch { dallaRotta = null; }
    let dalCatalogo = null;
    try { dalCatalogo = cataloghi?.get?.(modello) ?? null; } catch { dalCatalogo = null; }
    return { dallaRotta, dalCatalogo };
  };
  const scelta = (modello) => {
    let scritta = null;
    try { scritta = typeof scrittaFn === 'function' ? scrittaFn(modello) : null; } catch { scritta = null; }
    return scegliFinestra({ scritta, ...lette(modello) });
  };
  /** Quella che TALOS userebbe senza la persona (la carta «Memoria del modello» la mostra accanto alla scritta). */
  scelta.senzaLaPersona = (modello) => scegliFinestra(lette(modello));
  return scelta;
}

/**
 * Il cablaggio dell'ospite (`server.mjs`), qui perché si provi: `finestraLocale(modello)` dà la finestra VERA di un motore locale
 * (`local:`, `locale-ospite:`) o `undefined` per un modello del cloud, che passa dalla scelta qui sopra.
 *  · `finestra(modello)` va al registro come `finestraTokenFn`;
 *  · `fonte(modello)` va al registro come `fonteFinestraFn`: `null` per un motore locale (mai la riga «memoria non nota»), altrimenti
 *    la scelta intera (`fonte` e, se c'è, `sopraIlCatalogo`);
 *  · `perLaCarta(modello)` è la risposta di `GET /api/v1/context-settings/model-window`.
 */
export function creaFinestraDellOspite({ scelta, finestraLocale = () => undefined }) {
  const locale = (modello) => { try { return finestraLocale(modello); } catch { return undefined; } };
  return Object.freeze({
    finestra: (modello) => { const l = locale(modello); return l !== undefined ? l : scelta(modello).finestra; },
    fonte: (modello) => (locale(modello) !== undefined ? null : scelta(modello)),
    perLaCarta: (modello) => {
      const l = locale(modello);
      if (l !== undefined) return { modello, finestra: l ?? null, fonte: 'motore-locale', letta: null };
      const { finestra, fonte } = scelta(modello);
      return { modello, finestra, fonte, letta: typeof scelta.senzaLaPersona === 'function' ? scelta.senzaLaPersona(modello) : null };
    },
  });
}
