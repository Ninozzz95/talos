/*
 * FE-016: dal codice alla frase, in un posto solo (`computer-use/in-corso/FRASI-COMPUTER-USE-PC-2026-11-01.md`, revisione del Frontend §5 e tabella del bozzetto
 * `bozzetto-computer-use-posso`). Il nucleo manda solo codici (`ciclo.mjs`, EVENTI): qui diventano parole, mai il contrario, e `fine.nota` del modello non si legge.
 * ⛔ Un codice che non si conosce non arriva a schermo: esce la frase generica. Gli stop sono al passato; «mi fermo» solo dove dice cosa sta per succedere.
 */
import { t, tn } from '../lingua.js';

const FINE = Object.freeze({
  completato: 'computer.end.done', 'pulsante-ferma': 'computer.end.stoppedByYou', scorciatoia: 'computer.end.shortcut', 'errori-di-fila': 'computer.end.errors',
  'modello-non-vede': 'computer.end.modelBlind', occupato: 'computer.end.busy', sospetto: 'computer.end.suspicious', 'schermo-protetto': 'computer.end.protectedScreen',
  'finestra-protetta': 'computer.end.protectedWindow', 'pagamento-non-completato': 'computer.end.paymentNotDone', 'codice-sicurezza': 'computer.end.securityCode',
  impossibile: 'computer.end.impossible', 'senza-esito': 'computer.end.noOutcome', 'errore-interno': 'computer.end.internal', 'freno-perso': 'computer.end.brakeLost',
  // revisione O, nota 7 (04/11/2026): i due motivi nuovi del passo 5 hanno la loro frase, non quella generica
  'permesso-ridotto': 'computer.end.permissionLowered', 'domanda-non-mostrata': 'computer.end.questionNotShown',
});
const AIUTANTE = Object.freeze({ binario: 'computer.end.helperMissing', 'non-windows': 'computer.end.helperNotWindows', 'senza-schermo': 'computer.end.helperNoScreen', spento: 'computer.end.helperOff' });
const VOCE_DELLA_PROTEZIONE = Object.freeze({ pagamento: 'pay', invio: 'send', cancellazione: 'delete' });
const CAUSE = Object.freeze({ 'non-chiesto': 'notAsked', sospetto: 'suspicious', politica: 'policy' });
const NOMI_PROTEZIONE = Object.freeze({ pagamento: 'payment', invio: 'send', cancellazione: 'delete', credenziale: 'password', consenso: 'consent', termini: 'terms', cookie: 'cookies' });

/* `attesaMs` è quanto si è aspettato davvero: `msAttesa` dell'esito è la somma di tutte le attese del compito, e qui direbbe il falso */
function testoDurata(ms) {
  const secondi = Math.round(ms / 1000);
  if (secondi < 60) return tn('computer.time.secondsOne', 'computer.time.secondsMany', secondi);
  const minuti = Math.round(secondi / 60);
  return tn('computer.time.minuteOne', 'computer.time.minutesMany', minuti);
}
const durataVera = (ms) => Number.isFinite(ms) && ms >= 0;

function fraseDellaProtezione(motivo, causa) {
  const voce = VOCE_DELLA_PROTEZIONE[motivo.slice('protezione:'.length)];
  return voce && CAUSE[causa] ? t(`computer.guard.${voce}.${CAUSE[causa]}`) : null;
}

/**
 * La frase di chiusura di un compito.
 * @param {{ motivo?: string, causa?: string, assenza?: string|null, n?: number, millisecondi?: number, attesaMs?: number|null, allaCassa?: boolean, dispositivo?: 'mouse'|'tastiera'|null, via?: 'chrome' }} d
 *   `causa` è solo per pagare, inviare e cancellare; `assenza` dice perché manca il pezzo che usa il computer: i due non si confondono.
 */
export function fraseDiFine({ motivo, causa = null, assenza = null, n, millisecondi, attesaMs = null, allaCassa = false, dispositivo, via } = {}) {
  const generica = () => t('computer.end.generic');
  if (typeof motivo !== 'string' || motivo === '') return generica();
  if (motivo.startsWith('protezione:')) return fraseDellaProtezione(motivo, causa) ?? generica();
  if (motivo === 'mano-della-persona') return t(dispositivo === 'tastiera' ? 'computer.end.handKeyboard' : dispositivo === 'mouse' ? 'computer.end.handMouse' : 'computer.end.hand');
  if (motivo === 'pulsante-ferma' && via === 'chrome') return t('computer.end.stoppedInChrome');
  if (motivo === 'tetto-passi') return Number.isFinite(n) ? tn('computer.end.stepsLimitOne', 'computer.end.stepsLimitMany', n) : generica();
  if (motivo === 'tetto-tempo') return durataVera(millisecondi) ? t('computer.end.timeLimit', { min: Math.round(millisecondi / 60000) }) : t('computer.end.timeLimitPlain');
  if (motivo === 'attesa-scaduta') {
    if (!durataVera(attesaMs)) return t(allaCassa ? 'computer.end.waitedAtCheckoutPlain' : 'computer.end.waitedPlain');
    return t(allaCassa ? 'computer.end.waitedAtCheckout' : 'computer.end.waited', { durata: testoDurata(attesaMs) });
  }
  if (motivo === 'aiutante-assente') return t(AIUTANTE[assenza] ?? 'computer.end.helperUnknown'); // senza il dato nessun rimedio: «reinstalla» sarebbe un consiglio inventato
  return Object.hasOwn(FINE, motivo) ? t(FINE[motivo]) : generica();
}

/** La frase di una pausa, per la pillola. `persona`, a inizio presa, è la promessa di non guardare lo schermo (FORMA-T1-T6, condizione 3 del Frontend). */
export function frasePausa({ motivo, fase } = {}) {
  const m = String(motivo ?? '');
  if (m === 'persona') return fase === 'inizio' ? t('computer.pause.notLooking') : '';
  if (m === 'bloccato') return t('computer.pause.locked');
  if (m === 'uac') return t('computer.pause.uac');
  if (m.startsWith('chiedi_persona') || m.startsWith('permesso:') || m === 'anti-robot') return t('computer.pause.askedYou');
  return t('computer.pause.generic');
}

/** Chi ha deciso (`esito.decisioni[].fonte`). Una fonte che non si conosce resta muta: una parola inventata qui sarebbe una bugia su chi ha scelto. */
export function paroleDellaFonte({ fonte, citazione } = {}, { nomePermesso = '' } = {}) {
  if (fonte === 'frase') return citazione ? t('computer.source.sentence', { citazione }) : '';
  if (fonte === 'tocco-posso') return t('computer.source.touch');
  if (fonte === 'si-carta') return t('computer.source.card');
  if (fonte === 'serie') return t('computer.source.default');
  if (fonte === 'ricordato') return t('computer.source.remembered');
  if (fonte === 'sempre') return t('computer.source.always');
  if (fonte === 'permesso') return nomePermesso ? t('computer.source.permission', { nome: nomePermesso }) : '';
  return '';
}

export function nomeProtezione(protezione) {
  return t(`computer.protection.${NOMI_PROTEZIONE[protezione] ?? 'other'}`);
}

/** La frase di un passo che non è andato per una ragione da dire (`talos.computer-use-passo`, fase 'esito'). Il resto degli esiti resta della pillola com'è. */
export function fraseDelPasso({ esito, motivo } = {}) {
  return esito === 'non-eseguita' && motivo === 'coperto-da-talos' ? t('computer.step.coveredByTalos') : '';
}
