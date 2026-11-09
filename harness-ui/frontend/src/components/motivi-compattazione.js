/*
 * FE-053 (owner 01/11/2026): le parole dei motivi per cui un modello delle compattazioni non scrive, uguali su carta, riga in chat e telefono (tabella «Parole dei motivi»,
 * `bozzetto-compattazione/TABELLA-PEZZI.md`). `limite` da solo non dice piano o fornitore: lo dice `diAccount`. Modulo piccolo apposta: la riga in chat non deve tirarsi dietro
 * il catalogo dei fornitori.
 */
import { t, linguaCorrenteDiT } from './lingua.js';
import { nomeModelloUmano } from './chat-foot.js';

const PAROLE = Object.freeze({ rete: 'network', rifiuto: 'refused', 'motore-non-pronto': 'engineNotReady', 'posto-occupato': 'slotTaken', 'accesso-negato': 'accessDenied', 'non-trovato': 'notFound', 'senza-chiave': 'noKey', 'non-configurato': 'notSetUp' });

/* La riga «Scegli un altro» in chat chiede alla carta di aprire la scelta giusta */
export const EVENTO_SCEGLI_MODELLO_COMPATTAZIONE = 'talos:scegli-modello-compattazione';
export const EVENTO_MODELLO_INUTILIZZABILE = 'talos.riassunto-modello-inutilizzabile';
export const EVENTO_APRI_SCELTA_DAL_CONTESTO = 'talos:apri-scelta-compattazione';

/* Revisione del Blocco 22, F11: `motivo` arriva anche dal disco, e `constructor` su un oggetto col prototipo dava una chiave grezza a schermo */
export const chiaveDelMotivo = ({ motivo, diAccount } = {}) => (motivo === 'limite' ? (diAccount === true ? 'planLimit' : 'providerLimit') : Object.hasOwn(PAROLE, motivo ?? '') ? PAROLE[motivo] : 'notFound');

/*
 * Revisione del Blocco 22, F5: il punto solo che dice se un `finoAlle` è un'ora vera. Il tetto è quello del calendario di JavaScript: oltre ±8,64e15 ms `new Date` non vale e
 * `Intl.DateTimeFormat.format` lancia RangeError (ECMA-262, TimeClip), e quel numero può arrivare da un disco sporco o da un `retry-after-ms` senza tetto
 * (`provider-retry.mjs:108`). Fuori calendario vale «senza ora», come fa Codex: `DateTime::from_timestamp` torna `None` e la riga resta senza reset
 * (`codex-rs/tui/src/status/rate_limits.rs:87`, clone del 16/10).
 */
const TETTO_DEL_CALENDARIO = 8.64e15;
export const quandoTorna = (finoAlle) => (Number.isFinite(finoAlle) && Math.abs(finoAlle) <= TETTO_DEL_CALENDARIO ? finoAlle : null);

/**
 * La chiave della frase col perché. Revisione del Blocco 22, F3: un limite senza ora è il caso più comune (un 429 senza `Retry-After`, ogni 5xx: `catena-del-riassunto.mjs`,
 * `classificaErroreDelRiassunto`), e ha una frase sua invece di «fino alle .».
 */
export const chiaveDelPerche = (anello = {}) => `varie.compaction.why.${chiaveDelMotivo(anello)}${anello.motivo === 'limite' && quandoTorna(anello.finoAlle) === null ? 'NoTime' : ''}`;

/**
 * Il nome a schermo di un id che non si trova nel catalogo: quello della chat. Revisione del Blocco 22, F10: la parte dopo l'ultimo `/` o `:` faceva di
 * `meta-llama/llama-4:free` un modello chiamato «free», e la scheda lo chiedeva alla lettera; `nomeModelloUmano` sa che quei due punti sono una variante di OpenRouter.
 */
export function nomeCortoDelModello(id) {
  return nomeModelloUmano(id);
}

/**
 * L'ora di ritorno di un limite, nella lingua dell'app; stringa vuota se non è un'ora vera. Revisione del Blocco 22, F12: un limite settimanale diceva «fino alle 16:42» e
 * tornava fra tre giorni. Come Codex (`codex-rs/tui/src/status/helpers.rs:170`, `format_reset_timestamp`: l'ora se è oggi, altrimenti «16:42 on 3 Nov») e Hermes
 * (`apps/desktop/src/lib/provider-limit.ts:126`, `formatReset`). Col giorno della settimana, che non c'è da loro: in italiano «di mar 3 nov» si regge da solo, mentre «del 3 nov»
 * diventerebbe «dell'8 nov» per tre giorni al mese. `adesso` lo legge il disegno: una riga rigiocata il giorno dopo dice il giorno.
 */
export function oraDelLimite(finoAlle, lingua = linguaCorrenteDiT(), adesso = Date.now()) {
  const quando = quandoTorna(finoAlle);
  if (quando === null) return '';
  const locale = lingua === 'en' ? 'en-GB' : 'it-IT';
  const data = new Date(quando);
  const ora = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(data);
  if (data.toDateString() === new Date(adesso).toDateString()) return ora;
  return t('varie.compaction.card.timeOnDay', { ora, giorno: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(data) });
}
