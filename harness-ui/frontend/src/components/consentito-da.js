/*
 * ⛔⛔ C2 R6 (08/10/2026, contratto C2 §R6) — UN PERMESSO DATO PIÙ IN ALTO HA COPERTO QUESTA CHIAMATA.
 *   Quando una regola di un antenato (un sì «per la sessione» su una cartella, un segreto o una cartella di rete, oppure un
 *   «sempre» per attrezzo decisivo) lascia passare la chiamata di una figlia, non c'è nessuna domanda e quindi nessuna carta: la
 *   ricevuta dell'operazione porta `consentitoDa: { sessionId, tipo }` (kernel, `creaRicevutaOperazione`) e la riga lo dice.
 * - Stessa forma del segno del contenuto sospetto (`contenuto-sospetto.js`): un badge piccolo sulla riga, prima della colonna
 *   dell'esito, con la frase intera al passaggio e per chi legge con lo screen reader; dove la riga ha un corpo, una nota in testa.
 *   Badge NEUTRO: non è un avviso, è una provenienza.
 * - Il nome è il TITOLO vivo della sessione (`nomeSessione`, la stessa precedenza della barra), mai l'id. Se non si conosce, la
 *   frase lo dice senza inventarlo.
 */
import { t } from './lingua.js';

/** La frase per la persona, nella lingua dell'interfaccia. */
export function fraseConsentitoDa(consentitoDa, nomeSessione = null) {
  const grezzo = typeof nomeSessione === 'function' ? nomeSessione(consentitoDa?.sessionId) : null;
  /* La frase ha il suo punto: quello finale del titolo (una consegna scritta come frase) si toglie, o la frase chiude con «.».
     (review del bugfixer, 08/10, vista dal vivo). Solo in coda: la punteggiatura dentro il nome resta. */
  const nome = typeof grezzo === 'string' ? grezzo.trim().replace(/[.!?…]+$/u, '').trim() : '';
  return nome ? t('chat.approval.inherited.named', { name: nome }) : t('chat.approval.inherited.unnamed');
}

/**
 * Segna una riga dell'attrezzo (e, se c'è, il suo corpo). Una volta sola: una riconnessione che rimanda l'evento non raddoppia.
 * @param {{ riga: Element, corpo?: Element|null, consentitoDa: {sessionId:string, tipo?:string}, nomeSessione?: (id:string)=>string|null }} parti
 */
export function segnaConsentitoDa({ riga, corpo = null, consentitoDa, nomeSessione = null }, opzioni = {}) {
  if (!riga || typeof consentitoDa?.sessionId !== 'string' || !consentitoDa.sessionId || riga.dataset.consentitoDa) return;
  const documentObj = opzioni.document || riga.ownerDocument || globalThis.document;
  const frase = fraseConsentitoDa(consentitoDa, nomeSessione);
  riga.dataset.consentitoDa = consentitoDa.sessionId;
  const segno = documentObj.createElement('span');
  segno.className = 'talos-badge talos-badge--sm talos-tool-row__consentito-da';
  segno.textContent = t('chat.approval.inherited.badge');
  segno.title = frase;
  segno.setAttribute('aria-label', frase);
  const prima = riga.querySelector(':scope > .talos-voce__meta') || riga.querySelector(':scope > .talos-dot');
  if (prima) prima.before(segno); else riga.append(segno);
  if (!corpo) return;
  const nota = documentObj.createElement('p');
  nota.className = 'talos-tool-row__nota-consentito-da talos-muted';
  nota.textContent = frase;
  corpo.prepend(nota);
}
