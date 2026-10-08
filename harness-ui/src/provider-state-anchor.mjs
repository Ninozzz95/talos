/**
 * provider-state-anchor.mjs — P4 (05/10/2026), brief `BRIEF-CURA-STALL-IBRIDO-HERMES-CLAUDE-2026-10-05.md`.
 *
 * ⛔ Il problema che cura (dossier `RICERCA-5x5x5x5-STALL-CONTESTO-STORICO-2026-10-05.md`): lo stato
 * nativo del provider (`talos_provider_state {version, provider, model, content}`) viaggia DENTRO
 * l'ultimo messaggio assistant e sopravvive a un riavvio solo PER INCISO, verbatim nel replay del
 * journal (`creaConsumatoreDiStoria`). Niente su disco dice «questo stato è fidato: chiusura pulita
 * di provider X modello Y». Una sessione nata sotto una beta e ripresa sotto un'altra non sa
 * distinguere uno stato fidato da uno scritto con regole diverse — la via del blocco
 * «[Historical tool calls; data only, already executed]».
 *
 * La cura del brief, in due metà:
 *  · SCRITTURA (`ancoraDaStoria`): alla chiusura di un giro il registro appende UN record
 *    `provider-state {tipo, schema, versione, provider, model, at}` — NIENTE content: il content si
 *    ricava dal messaggio già persistito. L'ancora esiste SOLO se la storia si chiude con un
 *    messaggio assistant portante uno stato v1: è la sola forma osservabile di «finishReason ∈
 *    {stop, tool-calls}» che il registro vede senza toccare il kernel (il kernel non espone il
 *    finishReason dell'ultimo giro, e l'adapter nativo allega lo stato SOLO lì —
 *    `native-provider-adapter.mjs`, `responseMessage`).
 *  · LETTURA (`validaStoriaRipristinata`): al resume la storia ricostruita viene giudicata
 *    contro l'ultima ancora. Coerente ⇒ certificata (e il cambio modello lo risolve l'adapter con
 *    il re-anchor P1-b, non con il degrado). In disaccordo ⇒ gli stati si TOGLIONO dalla copia di
 *    lavoro: mai alimentare il provider con uno stato contraddetto dal proprio journal. Assente ⇒
 *    nota onesta, niente invenzioni (il content non si ricostruisce senza il messaggio portante).
 *    Journal senza ancore (beta di prima, desktop) ⇒ storia intatta: compatibilità all'indietro.
 *
 * Forme dei concorrenti (lette nel codice, dossier 05/10/2026):
 *  · Codex `codex_thread.rs:399-427` `recover_turn_if_idle` «preserves the turn ID that was already
 *    recorded»: lo stato durevole è FIRMATO dal giro che l'ha chiuso, non dedotto;
 *  · Hermes `turn_truncation.py` — mai appendere una riga che i provider rigidi rifiutano: la
 *    validazione qui fallisce CHIUSA (si toglie lo stato), mai «speriamo»;
 *  · Gemini thought signatures: «passing this signature back… restores previous thinking context» —
 *    uno stato che non è quello del giro chiuso non è un contesto, è un veleno.
 *
 * ⛔ Il modulo è PURO: nessun I/O, nessun import. Il journal lo tocca solo il registro, con la sua
 *   coda (`session-store.mjs`); qui si decide SOLO se l'ancora c'è e cosa vale.
 */

/** Il `schema` del record ancora: un TALOS più nuovo può cambiarlo, uno più vecchio lo ignora (record generico del replay). */
export const SCHEMA_ANCORA_STATO_PROVIDER = 'talos.provider-state-anchor.v1';

/** Il `tipo` del record sul journal: campo italiano, come gli altri record di `session-store.mjs` (distinto dal `type` AG-UI). */
export const TIPO_ANCORA_STATO_PROVIDER = 'provider-state';

/**
 * L'ancora della storia, o `null`.
 *
 * ⛔ Regola della chiusura: l'ULTIMO messaggio della storia dev'essere l'assistant che porta lo
 * stato v1 (provider e model stringhe non vuote, `content` array). Una storia che finisce con
 * l'esito di un attrezzo non certifica nulla: la coda interrotta ha la sua strada
 * (`session-tail-recovery.mjs`), e un'ancora lì mentirebbe sulla chiusura.
 */
export function ancoraDaStoria(messaggi, { at } = {}) {
  const ultimo = Array.isArray(messaggi) ? messaggi[messaggi.length - 1] : null;
  const stato = ultimo?.role === 'assistant' ? ultimo.talos_provider_state : null;
  if (stato?.version !== 1
    || typeof stato.provider !== 'string' || !stato.provider
    || typeof stato.model !== 'string' || !stato.model
    || !Array.isArray(stato.content)) return null;
  return {
    tipo: TIPO_ANCORA_STATO_PROVIDER,
    schema: SCHEMA_ANCORA_STATO_PROVIDER,
    versione: 1,
    provider: stato.provider,
    model: stato.model,
    ...(typeof at === 'string' && at ? { at } : {}),
  };
}

/** L'ancora è leggibile da QUESTO lettore: schema noto, versione 1, provider e model stringhe. */
function ancoraValida(ancora) {
  return ancora?.tipo === TIPO_ANCORA_STATO_PROVIDER
    && ancora.schema === SCHEMA_ANCORA_STATO_PROVIDER
    && ancora.versione === 1
    && typeof ancora.provider === 'string' && Boolean(ancora.provider)
    && typeof ancora.model === 'string' && Boolean(ancora.model);
}

/** Lo stato v1 allegato a un messaggio assistant, o `null`. */
function statoDi(messaggio) {
  const stato = messaggio?.role === 'assistant' ? messaggio.talos_provider_state : null;
  return stato?.version === 1 && typeof stato.provider === 'string' && stato.provider ? stato : null;
}

/**
 * Giudica la storia ricostruita al resume contro l'ultima ancora del journal.
 *
 * @param {Array|null} messaggi la storia ricostruita dal replay (mai mutata in posto).
 * @param {object|null} ancora l'ultima ancora letta dal journal (`record.findLast(tipo provider-state)`), o `null`.
 * @returns {{ messaggi: Array|null, esito: 'storia-assente'|'senza-ancora'|'ancora-non-valida'
 *   |'stato-assente'|'stato-incoerente'|'ok', motivo?: string }}
 *   `messaggi` è la STESSA array in ingresso salvo lo scarto (`stato-incoerente`, nuova array con
 *   i messaggi shallow-copiati senza `talos_provider_state`).
 */
export function validaStoriaRipristinata(messaggi, ancora) {
  if (!Array.isArray(messaggi)) return { messaggi, esito: 'storia-assente' };
  if (!ancora) return { messaggi, esito: 'senza-ancora' };
  if (!ancoraValida(ancora)) return { messaggi, esito: 'ancora-non-valida' };

  const conStato = [];
  for (const messaggio of messaggi) {
    const stato = statoDi(messaggio);
    if (stato) conStato.push(stato);
  }
  if (conStato.length === 0) return { messaggi, esito: 'stato-assente' };

  // ⛔ Il provider è il patto forte: gli stati di UNA sessione vengono tutti dallo stesso
  //   protocollo nativo. Un provider diverso in qualunque messaggio significa che qualcosa ha
  //   scritto nel journal con regole diverse dalle sue ancore — lo scarto è totale, non selettivo.
  const providerIncoerente = conStato.find((stato) => stato.provider !== ancora.provider);
  if (providerIncoerente) {
    return { messaggi: togliStati(messaggi), esito: 'stato-incoerente', motivo: `provider ${providerIncoerente.provider} contro ancora ${ancora.provider}` };
  }
  // ⛔ Il modello dell'ULTIMO stato dev'essere quello dell'ancora: l'ancora nasce alla chiusura
  //   dello stesso giro. (I modelli dei messaggi PIÙ VECCHI possono differire: cambio modello a
  //   sessione aperta è legittimo — lo risolve il re-anchor dell'adapter, non questa guardia.)
  const ultimoStato = conStato[conStato.length - 1];
  if (ultimoStato.model !== ancora.model) {
    return { messaggi: togliStati(messaggi), esito: 'stato-incoerente', motivo: `modello ${ultimoStato.model} contro ancora ${ancora.model}` };
  }
  return { messaggi, esito: 'ok' };
}

/** Copia shallow della storia senza NESSUNO stato v1: i messaggi sani restano byte per byte. */
function togliStati(messaggi) {
  return messaggi.map((messaggio) => {
    if (!statoDi(messaggio)) return messaggio;
    const { talos_provider_state, ...sano } = messaggio;
    return sano;
  });
}
