import { createHash } from 'node:crypto';

/*
 * ⛔ 24/09/2026 — contratto unico del PIANO approvabile (fetta F3-30), decisioni owner 36-39.
 *
 * 36: il piano si presenta con un attrezzo («present_plan», come ExitPlanMode di Claude Code, exit_plan_mode di Gemini,
 *     plan_exit di OpenCode); il giro si ferma sulla scheda e dopo la scelta lo stesso giro prosegue.
 * 37: le quattro scelte come Claude Code; il permesso scelto resta alla sessione.
 * 38: il piano approvato resta nella conversazione come esito dell'attrezzo, con la sua revisione e la sua impronta.
 * 39: un piano in attesa sopravvive al riavvio, come le domande.
 * Ricerca: `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md` (Q1, Q2; D1 Claude Code `ExitPlanMode` e
 *   `showClearContextOnPlanAccept`; R2 Codex `plan_implementation.rs:9-12`; R6 Kilo «Start new session / Continue here /
 *   Keep refining»). Kernel, registro e rotta HTTP accettano la STESSA forma: la semantica vive qui una volta sola.
 */
export const LIMITI_PIANO = Object.freeze({ pianoMax: 100_000, feedbackMax: 4_000 });

export const DECISIONI_PIANO = Object.freeze([
  'procedi-con-conferma', 'procedi-accetta-modifiche', 'conversazione-pulita', 'continua-a-pianificare',
]);

/* Il permesso che ciascuna scelta lascia alla sessione (decisione 37): le etichette sono quelle del selettore dei permessi. */
export const PERMESSI_DOPO_IL_PIANO = Object.freeze({
  'procedi-con-conferma': 'On request',
  'procedi-accetta-modifiche': 'Workspace write',
});

export class ContrattoPianoError extends Error {
  constructor(message, code = 'QUERY_INVALID') {
    super(message);
    this.name = 'ContrattoPianoError';
    this.code = code;
  }
}

export function validaPiano(plan) {
  if (typeof plan !== 'string') throw new ContrattoPianoError('plan must be Markdown text');
  const pulito = plan.trim();
  if (!pulito) throw new ContrattoPianoError('plan cannot be empty');
  if (pulito.length > LIMITI_PIANO.pianoMax) throw new ContrattoPianoError(`plan exceeds the limit of ${LIMITI_PIANO.pianoMax} characters`);
  return pulito;
}

/* L'impronta vale per QUESTO testo: l'approvazione lega revisione e impronta, e un'approvazione vecchia non vale per un testo nuovo. */
export function improntaPiano(plan) {
  return 'sha256:' + createHash('sha256').update(validaPiano(plan), 'utf8').digest('hex');
}

/* La decisione della persona, come arriva dalla scheda (rotta HTTP) o dal registro. */
export function validaDecisionePiano(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContrattoPianoError('invalid decision');
  const ammesse = ['requestId', 'decisione', 'hash', 'feedback'];
  if (Object.keys(body).some((k) => !ammesse.includes(k))) throw new ContrattoPianoError('decision contains unrecognized fields');
  if (typeof body.requestId !== 'string' || !body.requestId) throw new ContrattoPianoError('requestId is required');
  if (!DECISIONI_PIANO.includes(body.decisione)) throw new ContrattoPianoError('unknown decision');
  if (typeof body.hash !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(body.hash)) throw new ContrattoPianoError('plan hash is required');
  let feedback;
  if (body.feedback !== undefined) {
    if (typeof body.feedback !== 'string') throw new ContrattoPianoError('feedback must be text');
    feedback = body.feedback.trim();
    if (feedback.length > LIMITI_PIANO.feedbackMax) throw new ContrattoPianoError(`feedback exceeds ${LIMITI_PIANO.feedbackMax} characters`);
    if (body.decisione !== 'continua-a-pianificare' && feedback) throw new ContrattoPianoError('feedback only accompanies "continua-a-pianificare"');
  }
  return { requestId: body.requestId, decisione: body.decisione, hash: body.hash, ...(feedback ? { feedback } : {}) };
}

/*
 * Ciò che il MODELLO riceve come esito di `present_plan`. In inglese come gli altri esiti degli attrezzi; dice che cosa è
 * cambiato (modo e permesso) e che cosa fare adesso. Per «procedi» il piano approvato è già nella conversazione (è l'argomento
 * della chiamata): l'esito non lo ripete, lo nomina con revisione e impronta (decisione 38).
 */
export function esitoPianoPerIlModello(scelta) {
  const rev = Number.isSafeInteger(scelta?.revision) ? ` revision ${scelta.revision}` : '';
  const impronta = typeof scelta?.hash === 'string' ? ` (${scelta.hash.slice(0, 19)}…)` : '';
  switch (scelta?.decisione) {
    case 'procedi-con-conferma':
      return `The user approved plan${rev}${impronta}. You are now in Normal mode: every write will ask the user for confirmation. `
        + 'Implement the approved plan now, step by step, and say which step you are on.';
    case 'procedi-accetta-modifiche':
      return `The user approved plan${rev}${impronta}. You are now in Normal mode and may write in the project without asking. `
        + 'Implement the approved plan now, step by step, and say which step you are on.';
    case 'conversazione-pulita':
      return `The user approved plan${rev}${impronta} and moved its implementation to a new, clean conversation. `
        + 'Do not implement it here: reply with one short sentence and stop.';
    case 'continua-a-pianificare':
      return 'The user wants to keep planning. Feedback: ' + (scelta.feedback ? `"${scelta.feedback}"` : 'none given')
        + '. Stay in Plan mode, revise the plan, then call present_plan again.';
    default:
      return JSON.stringify({ status: 'cancelled', reason: scelta?.reason ?? 'cancelled' });
  }
}
