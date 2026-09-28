import { createHash } from 'node:crypto';

/**
 * ⛔ 20/09/2026 — contratto unico di Ask Question.
 *
 * Lo schema del tool, il registro e la risposta HTTP devono accettare la STESSA forma:
 * prima il modello poteva produrre una domanda che la UI mostrava, mentre il server
 * validava soltanto che `answers` fosse un oggetto. Qui la semantica vive una volta sola.
 */

export const LIMITI_DOMANDA_UTENTE = Object.freeze({
  domandeMin: 1,
  // 23/09/2026, decisione owner: 1-4 domande × 2-4 opzioni, come AskUserQuestion di Claude Code
  // (ricerca 10×4 della fase F3, `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md`). Era 1-3 × 2-5 dal 20/09.
  domandeMax: 4,
  idMax: 64,
  domandaMax: 600,
  opzioniMin: 2,
  opzioniMax: 4,
  etichettaMax: 120,
  descrizioneMax: 300,
  // 24/09/2026, decisione owner 32: il «perché conta» della domanda, una frase come la descrizione di un'opzione.
  percheMax: 300,
  rispostaMax: 4_000,
});

export class ContrattoDomandaUtenteError extends Error {
  constructor(message, code = 'QUERY_INVALID') {
    super(message);
    this.name = 'ContrattoDomandaUtenteError';
    this.code = code;
  }
}

const ID_DOMANDA = /^[a-z][a-z0-9_]{0,63}$/u;

function rifiuta(message) {
  throw new ContrattoDomandaUtenteError(message);
}

function oggettoSemplice(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function testo(value, { nome, max }) {
  if (typeof value !== 'string') rifiuta(`${nome} deve essere testo`);
  const pulito = value.trim();
  if (!pulito) rifiuta(`${nome} non può essere vuoto`);
  if (pulito.length > max) rifiuta(`${nome} supera il limite di ${max} caratteri`);
  return pulito;
}

function soleChiavi(value, ammesse, nome, { ignora = false } = {}) {
  const chiavi = Object.keys(value);
  if (!ignora && chiavi.some((chiave) => !ammesse.includes(chiave))) {
    rifiuta(`${nome} contiene campi non riconosciuti`);
  }
}

/*
 * ⛔ 24/09/2026, decisione owner 32 (AskUserQuestion del 24/09 pomeriggio) — «perché conta» OBBLIGATORIO e al più
 *   un'opzione «consigliata», sempre per prima. La ricevuta della domanda (decisione 10) li registra.
 * Fonti (lette il 24/09/2026):
 *  - Spec Kit `/clarify` (dossier `RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md`, scoperta 4): una domanda alla volta
 *    con il suo «why it matters», risposte scritte nella specifica.
 *  - Codex `codex-rs/core/src/tools/handlers/request_user_input_async.rs:42` (clone `fdeaa6c`, 23/09): «Put the
 *    recommended answer first».
 *  - Hermes `tools/clarify_tool.py:15` (clone `65ad529`, 23/09): `RECOMMENDED_LABEL` applicata alla PRIMA scelta.
 * ⇒ `why` è un CAMPO (non testo mescolato alla domanda) perché la ricevuta lo mostri a parte; `recommended` è un
 *   booleano sull'opzione (non «(Consigliata)» nell'etichetta, come fanno Claude Code e Hermes) perché la ricevuta
 *   sappia QUALE era consigliata anche quando la persona ne sceglie un'altra.
 * ⛔ `perche: 'obbligatorio'` lo chiede solo la porta del MODELLO (kernel). Il modo predefinito accetta le domande
 *   salvate prima del 24/09 senza `why`: una sessione vecchia con una domanda aperta deve restare rispondibile.
 *   Se `why` c'è, si valida in entrambi i modi: sul disco non arriva mai una forma diversa.
 * ⛔ La consigliata si porta in testa nella forma CANONICA invece di respingere il modello: l'ordine è una regola di
 *   presentazione, e l'impronta (`fingerprintDomanda`) resta la stessa qualunque posto il modello le abbia dato.
 */
/*
 * ⭐ 27/09/2026, decisione owner 46 (sessione 56066b64: glm-5.3-flash ha mandato un `id` dentro ogni opzione, rifiutato, poi ha
 *   riprovato) — alla porta del MODELLO i campi in più si IGNORANO invece di rifiutare, come Hermes (`tools/clarify_tool.py:20-32,
 *   106-149`, clone `65ad529`: «LLMs sometimes emit dict-shaped choices…», le chiavi sconosciute non si guardano). Non entrano nella
 *   domanda: la forma restituita si costruisce SOLO dai campi noti, e sul disco non arriva mai niente di diverso. Il resto resta
 *   com'è: `why` obbligatorio al modello (decisione 32), limiti, tipi, doppioni. Le altre porte (registro, HTTP) restano rigide.
 */
export function validaDomandeUtente(questions, { perche = 'facoltativo', campiInPiu = 'rifiuta' } = {}) {
  const ignora = campiInPiu === 'ignora';
  if (!Array.isArray(questions) || questions.length < LIMITI_DOMANDA_UTENTE.domandeMin || questions.length > LIMITI_DOMANDA_UTENTE.domandeMax) {
    rifiuta(`questions deve contenere da ${LIMITI_DOMANDA_UTENTE.domandeMin} a ${LIMITI_DOMANDA_UTENTE.domandeMax} domande`);
  }
  const ids = new Set();
  return questions.map((question, indice) => {
    if (!oggettoSemplice(question)) rifiuta(`questions[${indice}] deve essere un oggetto`);
    soleChiavi(question, ['id', 'question', 'why', 'options', 'multiSelect'], `questions[${indice}]`, { ignora });
    const id = testo(question.id, { nome: `questions[${indice}].id`, max: LIMITI_DOMANDA_UTENTE.idMax });
    if (!ID_DOMANDA.test(id)) rifiuta(`questions[${indice}].id deve essere snake_case stabile`);
    if (ids.has(id)) rifiuta(`id domanda duplicato: ${id}`);
    ids.add(id);
    const domanda = testo(question.question, { nome: `questions[${indice}].question`, max: LIMITI_DOMANDA_UTENTE.domandaMax });
    if (perche === 'obbligatorio' && question.why === undefined) {
      rifiuta(`questions[${indice}].why è obbligatorio: una frase che dice perché la risposta conta`);
    }
    const why = question.why === undefined ? undefined
      : testo(question.why, { nome: `questions[${indice}].why`, max: LIMITI_DOMANDA_UTENTE.percheMax });
    if (question.multiSelect !== undefined && typeof question.multiSelect !== 'boolean') {
      rifiuta(`questions[${indice}].multiSelect deve essere booleano`);
    }
    const multiSelect = question.multiSelect === true;
    let options;
    if (question.options !== undefined) {
      if (!Array.isArray(question.options)
        || question.options.length < LIMITI_DOMANDA_UTENTE.opzioniMin
        || question.options.length > LIMITI_DOMANDA_UTENTE.opzioniMax) {
        rifiuta(`questions[${indice}].options deve contenere da ${LIMITI_DOMANDA_UTENTE.opzioniMin} a ${LIMITI_DOMANDA_UTENTE.opzioniMax} opzioni`);
      }
      const viste = new Set();
      options = question.options.map((option, opzioneIndice) => {
        if (!oggettoSemplice(option)) rifiuta(`questions[${indice}].options[${opzioneIndice}] deve essere un oggetto`);
        soleChiavi(option, ['label', 'description', 'recommended'], `questions[${indice}].options[${opzioneIndice}]`, { ignora });
        if (option.recommended !== undefined && typeof option.recommended !== 'boolean') {
          rifiuta(`questions[${indice}].options[${opzioneIndice}].recommended deve essere booleano`);
        }
        const label = testo(option.label, { nome: `questions[${indice}].options[${opzioneIndice}].label`, max: LIMITI_DOMANDA_UTENTE.etichettaMax });
        const chiave = label.toLowerCase();
        if (viste.has(chiave)) rifiuta(`questions[${indice}] contiene opzioni duplicate`);
        viste.add(chiave);
        return {
          label,
          description: testo(option.description, {
            nome: `questions[${indice}].options[${opzioneIndice}].description`,
            max: LIMITI_DOMANDA_UTENTE.descrizioneMax,
          }),
          ...(option.recommended === true ? { recommended: true } : {}),
        };
      });
      const consigliate = options.filter((option) => option.recommended === true);
      if (consigliate.length > 1) rifiuta(`questions[${indice}] ha più di un'opzione consigliata: al più una`);
      if (consigliate.length === 1) options = [consigliate[0], ...options.filter((option) => option.recommended !== true)];
    } else if (multiSelect) {
      rifiuta(`questions[${indice}].multiSelect richiede options`);
    }
    return {
      id,
      question: domanda,
      ...(why !== undefined ? { why } : {}),
      ...(options ? { options } : {}),
      ...(multiSelect ? { multiSelect: true } : {}),
    };
  });
}

/*
 * ⛔ 24/09/2026, decisione owner 30 (D36) — DOVE NESSUNO PUÒ RISPONDERE (banco di misura, automazioni): l'attrezzo risponde
 *   subito e chiede di procedere con l'ipotesi più prudente DICHIARANDOLA (PO-28 punto 3). Qui e non nel kernel perché lo
 *   usano due porte: il kernel senza canale umano e il registro per le sessioni senza interfaccia.
 * Fonti (codice letto il 24/09/2026): Hermes `tools/clarify_tool.py:11-17` (`65ad529`) — errore «not available in this
 *   execution context», e alla scadenza «Use your best judgement to make the choice and proceed»; Codex
 *   `codex-rs/exec/src/lib.rs:2038-2048` (`fdeaa6c`) — rifiuto in `exec`; Claude Code issue #50728 — senza terminale la
 *   domanda si chiude con risposte VUOTE e il modello crede di averle avute. ⇒ Un esito tipizzato (`unanswerable`), mai
 *   una risposta finta, e l'obbligo di DIRE l'ipotesi, che nessuno dei tre chiede.
 */
export const ESITO_DOMANDA_SENZA_INTERFACCIA = Object.freeze({
  status: 'unanswerable',
  reason: 'no-interface',
  instruction: 'Nobody can answer questions in this execution context. For each question, proceed with the most prudent '
    + 'assumption and state that assumption explicitly in your reply, so the user can correct it later.',
});

/*
 * ⛔ 24/09/2026, decisione owner 29 (D35) — dopo un riavvio la domanda resta aperta; se la persona invece di rispondere
 *   scrive un messaggio nuovo, la chiamata della domanda riceve QUESTO esito (non la chiusura generica «processo
 *   interrotto»): il modello deve sapere che la persona ha scelto di non rispondere, e che il suo messaggio segue.
 */
export const ESITO_DOMANDA_SOSTITUITA = Object.freeze({
  status: 'cancelled',
  reason: 'new-message',
  note: 'The user did not answer this question: they wrote a new message instead, which follows.',
});

export function fingerprintDomanda(questions) {
  /*
   * ⛔ 20/09/2026 — il dedupe futuro dei HumanGate deve legarsi alla forma
   * canonica della decisione, non al JSON grezzo prodotto dal modello.
   */
  const canoniche = validaDomandeUtente(questions);
  const digest = createHash('sha256').update(JSON.stringify(canoniche), 'utf8').digest('hex');
  return `sha256:${digest}`;
}

export function validaRispostaDomanda(questions, response) {
  const domande = validaDomandeUtente(questions);
  if (!oggettoSemplice(response)) rifiuta('la risposta alla domanda deve essere un oggetto');
  soleChiavi(response, ['requestId', 'status', 'answers'], 'risposta');
  /* ⛔ 24/09/2026, decisioni owner 9 e 35: `expired` è la scadenza dell'impostazione della persona (Nessuna/1/5/10 min):
     niente risposte, e il registro ferma il giro. */
  if (!['answered', 'skipped', 'cancelled', 'expired'].includes(response.status)) {
    rifiuta('status deve essere answered, skipped, cancelled o expired');
  }
  if (response.status !== 'answered') {
    if (Object.hasOwn(response, 'answers')) rifiuta(`status ${response.status} non deve contenere answers`);
    return { status: response.status };
  }
  if (!oggettoSemplice(response.answers)) rifiuta('answered richiede answers come oggetto');
  const chiavi = Object.keys(response.answers);
  if (chiavi.length !== domande.length || chiavi.some((id) => !domande.some((q) => q.id === id))) {
    rifiuta('answers deve contenere esattamente una risposta per ogni domanda');
  }
  const answers = {};
  for (const q of domande) {
    const value = response.answers[q.id];
    if (!q.options) {
      answers[q.id] = testo(value, { nome: `answers.${q.id}`, max: LIMITI_DOMANDA_UTENTE.rispostaMax });
      continue;
    }
    if (!q.multiSelect) {
      answers[q.id] = testo(value, { nome: `answers.${q.id}`, max: LIMITI_DOMANDA_UTENTE.rispostaMax });
      continue;
    }
    if (!Array.isArray(value) || value.length === 0 || value.length > q.options.length + 1) {
      rifiuta(`answers.${q.id} deve essere un array non vuoto di scelte`);
    }
    const pulite = value.map((voce, i) => testo(voce, { nome: `answers.${q.id}[${i}]`, max: LIMITI_DOMANDA_UTENTE.rispostaMax }));
    if (new Set(pulite).size !== pulite.length) rifiuta(`answers.${q.id} contiene scelte duplicate`);
    const note = new Set(q.options.map((option) => option.label));
    if (pulite.filter((voce) => !note.has(voce)).length > 1) {
      rifiuta(`answers.${q.id} può contenere al massimo una risposta «Altro»`);
    }
    answers[q.id] = pulite;
  }
  return { status: 'answered', answers };
}
