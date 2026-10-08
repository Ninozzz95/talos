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
  // 02/10/2026, decisione owner «Estendo il contratto» (tappa 3 CLI, mockup approvato): titolo breve della scheda, come
  // `header` ≤ 12 di AskUserQuestion di Claude Code; anteprima per opzione (Claude Code `preview`); nota per risposta
  // (Claude Code `annotations.notes`, Codex `user_note:`). Proposta in `lavoro/PROPOSTA-PATCH-KERNEL-DOMANDE-2026-10-02.md`.
  titoloMax: 12,
  anteprimaMax: 2_000,
  anteprimaRigheMax: 20,
  notaMax: 1_000,
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
  if (typeof value !== 'string') rifiuta(`${nome} must be text`);
  const pulito = value.trim();
  if (!pulito) rifiuta(`${nome} cannot be empty`);
  if (pulito.length > max) rifiuta(`${nome} exceeds the limit of ${max} characters`);
  return pulito;
}

/* L'anteprima è codice o un diff: gli spazi in testa contano, quindi non si accorcia; si toglie solo l'a-capo finale. */
function anteprima(value, nome) {
  if (typeof value !== 'string') rifiuta(`${nome} must be text`);
  const pulita = value.replace(/\r\n/gu, '\n').replace(/\n+$/u, '');
  if (!pulita.trim()) rifiuta(`${nome} cannot be empty`);
  if (pulita.length > LIMITI_DOMANDA_UTENTE.anteprimaMax) rifiuta(`${nome} exceeds the limit of ${LIMITI_DOMANDA_UTENTE.anteprimaMax} characters`);
  if (pulita.split('\n').length > LIMITI_DOMANDA_UTENTE.anteprimaRigheMax) rifiuta(`${nome} exceeds the limit of ${LIMITI_DOMANDA_UTENTE.anteprimaRigheMax} lines`);
  return pulita;
}

function soleChiavi(value, ammesse, nome, { ignora = false } = {}) {
  const chiavi = Object.keys(value);
  if (!ignora && chiavi.some((chiave) => !ammesse.includes(chiave))) {
    rifiuta(`${nome} contains unrecognized fields`);
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
    rifiuta(`questions must contain from ${LIMITI_DOMANDA_UTENTE.domandeMin} to ${LIMITI_DOMANDA_UTENTE.domandeMax} questions`);
  }
  const ids = new Set();
  return questions.map((question, indice) => {
    if (!oggettoSemplice(question)) rifiuta(`questions[${indice}] must be an object`);
    soleChiavi(question, ['id', 'header', 'question', 'why', 'options', 'multiSelect'], `questions[${indice}]`, { ignora });
    const id = testo(question.id, { nome: `questions[${indice}].id`, max: LIMITI_DOMANDA_UTENTE.idMax });
    if (!ID_DOMANDA.test(id)) rifiuta(`questions[${indice}].id must be a stable snake_case`);
    if (ids.has(id)) rifiuta(`duplicate question id: ${id}`);
    ids.add(id);
    const header = question.header === undefined ? undefined
      : testo(question.header, { nome: `questions[${indice}].header`, max: LIMITI_DOMANDA_UTENTE.titoloMax });
    const domanda = testo(question.question, { nome: `questions[${indice}].question`, max: LIMITI_DOMANDA_UTENTE.domandaMax });
    if (perche === 'obbligatorio' && question.why === undefined) {
      rifiuta(`questions[${indice}].why is required: a sentence saying why the answer matters`);
    }
    const why = question.why === undefined ? undefined
      : testo(question.why, { nome: `questions[${indice}].why`, max: LIMITI_DOMANDA_UTENTE.percheMax });
    if (question.multiSelect !== undefined && typeof question.multiSelect !== 'boolean') {
      rifiuta(`questions[${indice}].multiSelect must be a boolean`);
    }
    const multiSelect = question.multiSelect === true;
    let options;
    if (question.options !== undefined) {
      if (!Array.isArray(question.options)
        || question.options.length < LIMITI_DOMANDA_UTENTE.opzioniMin
        || question.options.length > LIMITI_DOMANDA_UTENTE.opzioniMax) {
        rifiuta(`questions[${indice}].options must contain from ${LIMITI_DOMANDA_UTENTE.opzioniMin} to ${LIMITI_DOMANDA_UTENTE.opzioniMax} options`);
      }
      const viste = new Set();
      options = question.options.map((option, opzioneIndice) => {
        if (!oggettoSemplice(option)) rifiuta(`questions[${indice}].options[${opzioneIndice}] must be an object`);
        soleChiavi(option, ['label', 'description', 'recommended', 'preview'], `questions[${indice}].options[${opzioneIndice}]`, { ignora });
        if (option.recommended !== undefined && typeof option.recommended !== 'boolean') {
          rifiuta(`questions[${indice}].options[${opzioneIndice}].recommended must be a boolean`);
        }
        const label = testo(option.label, { nome: `questions[${indice}].options[${opzioneIndice}].label`, max: LIMITI_DOMANDA_UTENTE.etichettaMax });
        const chiave = label.toLowerCase();
        if (viste.has(chiave)) rifiuta(`questions[${indice}] contains duplicate options`);
        viste.add(chiave);
        return {
          label,
          description: testo(option.description, {
            nome: `questions[${indice}].options[${opzioneIndice}].description`,
            max: LIMITI_DOMANDA_UTENTE.descrizioneMax,
          }),
          ...(option.recommended === true ? { recommended: true } : {}),
          ...(option.preview === undefined ? {} : { preview: anteprima(option.preview, `questions[${indice}].options[${opzioneIndice}].preview`) }),
        };
      });
      const consigliate = options.filter((option) => option.recommended === true);
      if (consigliate.length > 1) rifiuta(`questions[${indice}] has more than one recommended option: at most one`);
      if (consigliate.length === 1) options = [consigliate[0], ...options.filter((option) => option.recommended !== true)];
    } else if (multiSelect) {
      rifiuta(`questions[${indice}].multiSelect requires options`);
    }
    return {
      id,
      ...(header !== undefined ? { header } : {}),
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
  if (!oggettoSemplice(response)) rifiuta('the answer to the question must be an object');
  soleChiavi(response, ['requestId', 'status', 'answers', 'skipped', 'notes'], 'risposta');
  /* ⛔ 24/09/2026, decisioni owner 9 e 35: `expired` è la scadenza dell'impostazione della persona (Nessuna/1/5/10 min):
     niente risposte, e il registro ferma il giro. */
  if (!['answered', 'skipped', 'cancelled', 'expired'].includes(response.status)) {
    rifiuta('status must be answered, skipped, cancelled or expired');
  }
  if (response.status !== 'answered') {
    for (const campo of ['answers', 'skipped', 'notes']) {
      if (Object.hasOwn(response, campo)) rifiuta(`status ${response.status} must not contain ${campo}`);
    }
    return { status: response.status };
  }
  if (!oggettoSemplice(response.answers)) rifiuta('answered requires answers as an object');
  /*
   * 02/10/2026, decisione owner «Estendo il contratto»: una domanda si può saltare da sola (Codex manda una lista vuota,
   *   OpenCode «Unanswered»). Ogni domanda sta in `answers` OPPURE in `skipped`, mai in entrambi né in nessuno; almeno una
   *   ha risposta (tutte saltate è `status: 'skipped'`, come prima). Senza `skipped` vale la regola di prima: tutte.
   */
  const conosciute = new Set(domande.map((q) => q.id));
  let saltate = [];
  if (response.skipped !== undefined) {
    if (!Array.isArray(response.skipped)) rifiuta('skipped must be an array of question ids');
    saltate = response.skipped.map((id, i) => testo(id, { nome: `skipped[${i}]`, max: LIMITI_DOMANDA_UTENTE.idMax }));
    if (new Set(saltate).size !== saltate.length) rifiuta('skipped contains duplicate ids');
    if (saltate.some((id) => !conosciute.has(id))) rifiuta('skipped contains ids of unknown questions');
  }
  const chiavi = Object.keys(response.answers);
  if (chiavi.some((id) => !conosciute.has(id))) rifiuta('answers must contain exactly the questions asked: it contains unknown ids');
  if (chiavi.some((id) => saltate.includes(id))) rifiuta('a question cannot be both answered and skipped');
  if (chiavi.length + saltate.length !== domande.length) {
    rifiuta('answers must contain exactly one answer for each question that is not skipped');
  }
  if (chiavi.length === 0) rifiuta('answered requires at least one answer: if you skip them all, status is skipped');
  /* La nota della persona resta un campo a parte, mai mescolata alla risposta (la ricevuta sa cosa è nota e cosa è scelta). */
  let note;
  if (response.notes !== undefined) {
    if (!oggettoSemplice(response.notes)) rifiuta('notes must be an object { id: text }');
    note = {};
    for (const [id, valore] of Object.entries(response.notes)) {
      if (!conosciute.has(id)) rifiuta('notes contains ids of unknown questions');
      note[id] = testo(valore, { nome: `notes.${id}`, max: LIMITI_DOMANDA_UTENTE.notaMax });
    }
  }
  const answers = {};
  for (const q of domande) {
    if (saltate.includes(q.id)) continue;
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
      rifiuta(`answers.${q.id} must be a non-empty array of choices`);
    }
    const pulite = value.map((voce, i) => testo(voce, { nome: `answers.${q.id}[${i}]`, max: LIMITI_DOMANDA_UTENTE.rispostaMax }));
    if (new Set(pulite).size !== pulite.length) rifiuta(`answers.${q.id} contains duplicate choices`);
    const note = new Set(q.options.map((option) => option.label));
    if (pulite.filter((voce) => !note.has(voce)).length > 1) {
      rifiuta(`answers.${q.id} can contain at most one "Other" answer`);
    }
    answers[q.id] = pulite;
  }
  return {
    status: 'answered',
    answers,
    ...(saltate.length ? { skipped: saltate } : {}),
    ...(note && Object.keys(note).length ? { notes: note } : {}),
  };
}
