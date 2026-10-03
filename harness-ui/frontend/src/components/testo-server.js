/*
 * I testi che il SERVER manda alla persona come dati, detti nella lingua dell'interfaccia (corsia K4a, owner 03/10/2026:
 * «ogni singola parola nella app deve essere sia in inglese che in italiano»).
 *
 * Il contratto, lo stesso del «contenuto sospetto» (8d894b012): accanto al campo di testo (`dettaglio`, `motivo`, `nota`,
 * `etichetta`, `errore`…) il server manda la frase INGLESE (riserva), `<campo>Chiave` (una chiave dell'area `server`) e
 * `<campo>Params` (i valori). Qui si sceglie:
 *   · la chiave c'è nel dizionario → `t(chiave, params)`, nella lingua corrente;
 *   · la chiave manca (un server più nuovo del dizionario) o non c'è → la frase del server, MAI la chiave grezza.
 *
 * ⛔ Due convenzioni, entrambe provate da `tests/k4a-testi-del-server.test.mjs`:
 *   · una chiave senza voce propria ma con `<chiave>One` e `<chiave>Many` è un PLURALE: si sceglie col numero `params.n`;
 *   · un parametro `<nome>Chiave` dice che il valore `<nome>` è a sua volta un testo del dizionario (il nome di una fonte di
 *     ricerca, di un fornitore): si dice nella lingua corrente prima di entrare nella frase.
 * Non si riusa `testoErroreServer` (errori.js): quello sostituisce le parole di un ERRORE del server (codice + motivo), questo
 * dice un campo di una risposta che non è un errore.
 */
import { FORMA_DELLA_CHIAVE, t, tn } from './lingua.js';
import { TESTI } from '../i18n/testi/index.js';

const esiste = (chiave) => typeof chiave === 'string' && FORMA_DELLA_CHIAVE.test(chiave) && TESTI.en[chiave] !== undefined;

/** I valori della frase, con i nomi che hanno la loro chiave già detti nella lingua corrente. */
function valoriDellaFrase(params) {
  if (!params || typeof params !== 'object') return undefined;
  const fuori = {};
  for (const [nome, valore] of Object.entries(params)) {
    if (nome.endsWith('Chiave') && nome.length > 'Chiave'.length) continue;
    const chiaveDelNome = params[`${nome}Chiave`];
    fuori[nome] = esiste(chiaveDelNome) ? t(chiaveDelNome) : valore;
  }
  return fuori;
}

/**
 * Il testo di una chiave del server nella lingua corrente, o la riserva.
 * @param {string|undefined|null} chiave `server.<area>.<nome>`
 * @param {Record<string, string|number>|undefined|null} params i valori della frase
 * @param {string} riserva la frase inglese che il server ha mandato; torna com'è se la chiave non c'è
 */
export function testoDelServer(chiave, params, riserva) {
  if (typeof chiave !== 'string') return riserva;
  const valori = valoriDellaFrase(params);
  if (esiste(chiave)) return t(chiave, valori);
  if (esiste(`${chiave}One`) && esiste(`${chiave}Many`) && Number.isFinite(Number(valori?.n))) return tn(`${chiave}One`, `${chiave}Many`, Number(valori.n), valori);
  return riserva;
}

/**
 * Il campo `campo` di un oggetto del server, nella lingua corrente: `testoDelCampo(riga.ricercaWeb, 'dettaglio')`.
 * Legge `oggetto[campo]` (la riserva inglese), `oggetto[campo + 'Chiave']` e `oggetto[campo + 'Params']`.
 */
export function testoDelCampo(oggetto, campo) {
  if (!oggetto || typeof oggetto !== 'object') return undefined;
  return testoDelServer(oggetto[`${campo}Chiave`], oggetto[`${campo}Params`], oggetto[campo]);
}

/* I fornitori che hanno una parola italiana nel nome: l'id → la chiave del nome. Gli altri si dicono col nome del server. */
const NOMI_DEI_FORNITORI = Object.freeze({
  esterno: 'server.provider.label.externalAgent',
  'zai-anthropic': 'server.provider.label.zaiAnthropic',
  'minimax-anthropic': 'server.provider.label.minimaxAnthropic',
  local: 'server.provider.label.localEngine',
});

/** Il nome di un fornitore nella lingua corrente: `riga.label` del server, tranne per i quattro che hanno una parola italiana. */
export function nomeDelFornitore(riga) {
  const chiave = NOMI_DEI_FORNITORI[riga?.id];
  return chiave && esiste(chiave) ? t(chiave) : (riga?.label || riga?.id || '');
}

/** L'id dei fornitori con un nome nel dizionario (per le prove di parità col registro del server). */
export const ID_FORNITORI_CON_NOME = Object.freeze(Object.keys(NOMI_DEI_FORNITORI));
export const CHIAVE_NOME_FORNITORE = NOMI_DEI_FORNITORI;

/* Lo stato di esecuzione di un fornitore (`riga.execution`): valori del server, mostrati dal Doctor. Il valore sconosciuto si dice com'è. */
const ESECUZIONE_DEI_FORNITORI = Object.freeze({
  collegato: 'server.provider.execution.connected',
  'runtime locale': 'server.provider.execution.localRuntime',
  'motore locale': 'server.provider.execution.localEngine',
  configurato: 'server.provider.execution.configured',
  'da configurare': 'server.provider.execution.toConfigure',
  'da configurare sul computer': 'server.provider.execution.toConfigureOnComputer',
});
export const CHIAVE_ESECUZIONE_FORNITORE = ESECUZIONE_DEI_FORNITORI;

/** Lo stato di esecuzione di un fornitore nella lingua corrente; un valore che il dizionario non conosce torna com'è. */
export function esecuzioneDelFornitore(valore) {
  const chiave = ESECUZIONE_DEI_FORNITORI[valore];
  return chiave && esiste(chiave) ? t(chiave) : valore;
}
