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
  /*
   * ⛔⛔ 07/9, owner bloccato: «la sessione e ancora bloccata, non riesco a inviare messaggi e
   * spunta errore toast». `SESSION_NOT_READY` NON era in questa mappa, quindi cadeva su
   * INTERNAL_ERROR e a schermo arrivava «Si e verificato un problema imprevisto» — mentre il
   * registro aveva gia scritto la frase giusta e AZIONABILE: «Questa sessione e stata interrotta
   * da un riavvio del server e non puo essere ripresa: avvia una sessione nuova».
   * ⇒ Il codice piu utile della mappa e quello che dice COSA FARE. Qui la spiegazione generica
   *   resta come rete, ma il motivo VERO del registro passa in `explanation` (vedi `problemFor`):
   *   una porta chiusa senza indicazione di dove sia quella aperta e il modo migliore per bloccare
   *   una persona su una schermata.
   */
  SESSION_NOT_READY: { title: 'Sessione non pronta', explanation: 'Questa sessione non puo accettare l’azione richiesta nello stato in cui si trova.', action: 'Se e stata interrotta da un riavvio, avvia una sessione nuova: la conversazione resta leggibile qui.' },
  /*
   * ⛔⛔ 12/09, L5 — LA STESSA VORAGINE DI O-49, e per questo sono qui il giorno stesso in cui
   * nascono i codici. Senza una voce in questa mappa una risposta cade sulla copia di
   * INTERNAL_ERROR, e a schermo una ricerca cancellata dieci secondi fa diventa «Si è verificato
   * un problema imprevisto · Apri Doctor, copia il riferimento»: falso due volte — non è
   * imprevisto, ed è l'unica cosa che Doctor non può spiegare. Misurato interrogando la rotta
   * vera prima di scrivere queste righe, non dedotto.
   * ⛔ Nessuna di queste è un guasto: sono tre no diversi, e ognuna dice COSA FARE.
   */
  RESEARCH_NOT_FOUND: { title: 'Ricerca non trovata', explanation: 'Questa ricerca approfondita non è più nel progetto: può essere stata eliminata.', action: 'Torna all’elenco delle ricerche: mostra quelle che ci sono adesso.' },
  RESEARCH_CONFLICT: { title: 'Azione non possibile adesso', explanation: 'Questa ricerca non è nello stato che l’azione richiede — per esempio è già ferma, o è già finita.', action: 'Riapri la scheda della ricerca: dice come sta in questo momento.' },
  RESEARCH_RECHECK_UNAVAILABLE: { title: 'Controllo delle fonti non possibile', explanation: 'Per ricontrollare le fonti serve un rapporto con i passaggi citati, e questa ricerca non ne ha.', action: 'Le ricerche nuove lo portano: questa si può rifare, oppure lasciarla com’è.' },
  RESEARCH_INVALID: { title: 'Richiesta non valida', explanation: 'L’identificativo della ricerca non ha una forma ammessa.', action: 'Apri la ricerca dall’elenco invece di comporre l’indirizzo a mano.' },
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

/*
 * ⛔⛔ 07/9 — I codici il cui `message` e GIA scritto per una persona, e non per un log.
 * Il registro, per una sessione che non puo ripartire, dice: «Questa sessione e stata interrotta da
 * un riavvio del server e non puo essere ripresa: avvia una sessione nuova» — una frase che dice
 * cosa e successo E cosa fare. Quella frase veniva BUTTATA e sostituita con «Si e verificato un
 * problema imprevisto», e l'owner e rimasto bloccato su una schermata senza sapere dove fosse
 * l'uscita.
 * ⛔ La sostituzione generica esiste per una ragione buona — un messaggio d'errore grezzo puo
 *   portare percorsi, id, dettagli interni — e resta il comportamento predefinito. Qui si dichiara
 *   la sola eccezione: i codici dove chi ha scritto il messaggio lo ha scritto PER lo schermo.
 *   Aggiungerne uno vuol dire prendersi la responsabilita che quel testo sia leggibile e privo di
 *   dettagli interni: si guarda ogni `erroreAvvio` di quel codice prima di metterlo qui.
 */
const MESSAGGIO_GIA_PER_LA_PERSONA = new Set(['SESSION_NOT_READY']);

/** Un testo del registro e pubblicabile solo se e corto e non porta percorsi o identificatori. */
function messaggioPubblicabile(testo) {
  const t = String(testo || '').trim();
  if (t.length < 12 || t.length > 240) return '';
  if (/[\/]{1}[\w.-]+[\/]|[0-9a-f]{8}-[0-9a-f]{4}/i.test(t)) return ''; // percorsi o id: restano nel log
  return t;
}

export function toPublicProblem(error, { requestId = '', operation = '' } = {}) {
  const code = safeCode(error);
  const copy = MESSAGES[code] ?? MESSAGES.INTERNAL_ERROR;
  const doctorReference = referenceFor(code, requestId, operation);
  diagnostics.set(doctorReference, Object.freeze({ code, operation: String(operation || 'operation'), requestId: String(requestId || ''), detail: safeDiagnosticDetail(error) }));
  const vero = MESSAGGIO_GIA_PER_LA_PERSONA.has(code) ? messaggioPubblicabile(error?.message) : '';
  return { title: copy.title, explanation: vero || copy.explanation, action: copy.action, doctorReference };
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
