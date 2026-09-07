import { createHash } from 'node:crypto';

const diagnostics = new Map();
const MESSAGES = Object.freeze({
  CONFIG_INVALID: { title: 'Configurazione non pronta', explanation: 'Manca una parte della configurazione necessaria per completare questa operazione.', action: 'Apri Doctor e segui i controlli indicati, poi riprova.' },
  TASK_CATALOG_UNAVAILABLE: { title: 'Elenco attività non disponibile', explanation: 'Il servizio che fornisce le attività non è ancora collegato.', action: 'Controlla Doctor o configura il servizio delle attività, poi riprova.' },
  RUNTIME_NOT_AVAILABLE: { title: 'Servizio locale non disponibile', explanation: 'Non è stato possibile trovare un servizio locale pronto.', action: 'Apri Doctor per vedere cosa manca oppure scegli un servizio online.' },
  RUNTIME_UNREACHABLE: { title: 'Servizio locale non raggiungibile', explanation: 'Il servizio locale non ha risposto.', action: 'Controlla che sia avviato in Doctor e riprova.' },
  PATH_NOT_ALLOWED: { title: 'Percorso non consentito', explanation: 'Il percorso scelto è fuori dall’area autorizzata.', action: 'Scegli una cartella dentro il progetto aperto.' },
  PROCESS_POLICY_REJECTED: { title: 'Operazione bloccata per sicurezza', explanation: 'Il comando richiesto non rientra nelle autorizzazioni correnti.', action: 'Controlla il permesso della sessione e riprova solo se riconosci il comando.' },
  /*
   * ⛔ 07/9, O-49 — senza una voce qui la busta portava la copia di INTERNAL_ERROR:
   * «Si è verificato un problema imprevisto» e «Apri Doctor». Falso due volte: non è
   * imprevisto, ed è l’unica cosa che Doctor non può spiegare. La scheda del permesso
   * è semplicemente vecchia — si ricarica la sessione e si guarda cosa chiede adesso.
   */
  APPROVAL_NOT_PENDING: { title: 'Richiesta di permesso scaduta', explanation: 'La sessione è andata avanti: quella domanda non aspetta più una risposta.', action: 'Ricarica la sessione e rispondi alla richiesta che vedi adesso, se ce n’è una.' },
  INTERNAL_ERROR: { title: 'Operazione non riuscita', explanation: 'Si è verificato un problema imprevisto durante l’operazione.', action: 'Apri Doctor, copia il riferimento e riprova.' },
});

function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]+$/u.test(error.code) ? error.code : 'INTERNAL_ERROR';
}

function referenceFor(code, requestId, operation) {
  return `doctor-${createHash('sha256').update(`${code}|${requestId || ''}|${operation || ''}`).digest('hex').slice(0, 12)}`;
}

function safeDiagnosticDetail(error) {
  if (typeof error?.message !== 'string') return '';
  return error.message
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]+\b/giu, '[redacted]')
    .replace(/\bsecret\b/giu, '[redacted]')
    .replace(/\bTALOS_[A-Z0-9_]+\b/gu, '[setting]')
    .replace(/\b[A-Za-z]:\\[^\r\n;]+/gu, '[path]')
    .replace(/\/(?:Users|home|tmp|var|data)\/[^\r\n; ]+/giu, '[path]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240);
}

export function toPublicProblem(error, { requestId = '', operation = '' } = {}) {
  const code = safeCode(error);
  const copy = MESSAGES[code] ?? MESSAGES.INTERNAL_ERROR;
  const doctorReference = referenceFor(code, requestId, operation);
  diagnostics.set(doctorReference, Object.freeze({ code, operation: String(operation || 'operation'), requestId: String(requestId || ''), detail: safeDiagnosticDetail(error) }));
  return { title: copy.title, explanation: copy.explanation, action: copy.action, doctorReference };
}

export function logDiagnosticProblem(error, { requestId = '', operation = '', logger = console } = {}) {
  const publicProblem = toPublicProblem(error, { requestId, operation });
  const code = safeCode(error);
  try { logger?.warn?.(`[${publicProblem.doctorReference}] ${operation || 'operation'} (${code})`); } catch { /* un logger guasto non cambia l’esito dell’operazione */ }
  return publicProblem.doctorReference;
}

export function getDiagnosticProblem(reference) {
  const detail = diagnostics.get(reference);
  return detail ? { ...detail } : null;
}
