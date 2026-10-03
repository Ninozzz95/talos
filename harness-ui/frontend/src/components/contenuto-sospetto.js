/*
 * ⛔ F-027 (owner 02/10/2026, «+1 con conferma») — IL SEGNO DEL CONTENUTO SOSPETTO NELLA SCHEDA DI UN ATTREZZO.
 *
 * Il kernel guarda il contenuto che arriva da fuori (file, comandi, web, strumenti esterni) e, quando ci trova testo che sembra
 * un'istruzione per un'IA, lo dice al modello e accende la conferma per il passo successivo. La persona lo deve vedere anche lei,
 * nel posto dove guarda: la riga dell'attrezzo porta un segno piccolo, e il dettaglio una nota che dice che cosa c'era, dove, e che
 * cosa succede adesso.
 * ⛔ 03/10/2026 (owner: «ogni singola parola nella app deve essere sia in inglese che in italiano»): il kernel non manda più una
 *   frase italiana. Manda DATI — `suspicious: {source, patterns, place: {tipo, nome}}` nell'evento, `contenutoSospetto: {fonte,
 *   motivi, luogo}` nella domanda d'approvazione — e le parole le mette questo file, con le chiavi `kernel.*` nelle due lingue.
 * ⛔ Riusa il sistema di casa: `talos-badge--warning` per il segno, la nota di sistema col tono d'attenzione per il dettaglio.
 */
import { creaNotaSistema } from './conversazione.js';
import { elenco, t } from './lingua.js';
import { TESTI } from '../i18n/testi/index.js';

const esiste = (chiave) => TESTI.en[chiave] !== undefined;

/** Il posto, detto come lo direbbe una persona: «il file «a.md»», «a web page»… */
export function luogoInParole(luogo) {
  const tipo = typeof luogo?.tipo === 'string' ? luogo.tipo : 'altro';
  const nome = typeof luogo?.nome === 'string' && luogo.nome.trim() ? luogo.nome.trim() : null;
  if (tipo === 'file') return nome ? t('kernel.luogo.file', { nome }) : t('kernel.luogo.unFile');
  if (tipo === 'strumento') return nome ? t('kernel.luogo.strumento', { nome }) : t('kernel.luogo.unoStrumento');
  return esiste(`kernel.luogo.${tipo}`) ? t(`kernel.luogo.${tipo}`) : t('kernel.luogo.altro');
}

/** I motivi in parole, uniti come si fa nella lingua corrente: «a, b e c» / «a, b, and c». */
export function motiviInParole(motivi) {
  const parole = [...new Set((Array.isArray(motivi) ? motivi : [])
    .map((m) => (esiste(`kernel.motivo.${m}`) ? t(`kernel.motivo.${m}`) : t('kernel.motivo.sconosciuto'))))];
  return elenco(parole);
}

/** La nota della scheda, dal segno dell'evento (`suspicious`). Senza i dati (un evento vecchio) resta la frase senza dettagli. */
export function fraseSospetto(sospetto) {
  const motivi = Array.isArray(sospetto?.patterns) ? sospetto.patterns : [];
  if (!sospetto?.place || motivi.length === 0) return t('kernel.contenutoSospetto.notaSenzaDettagli');
  return t('kernel.contenutoSospetto.nota', { luogo: luogoInParole(sospetto.place), motivi: motiviInParole(motivi) });
}

/** La domanda della carta d'approvazione, dal `contenutoSospetto` che il kernel mette nell'azione. */
export function domandaContenutoSospetto(contenutoSospetto) {
  if (!contenutoSospetto) return '';
  return t('kernel.contenutoSospetto.domanda', { luogo: luogoInParole(contenutoSospetto.luogo), motivi: motiviInParole(contenutoSospetto.motivi) });
}

/**
 * Mette il segno sulla riga e la nota in testa al dettaglio. Una volta sola per riga: una riconnessione che rimanda gli eventi
 * non raddoppia niente.
 * @param {{riga: HTMLElement, corpo?: HTMLElement|null, sospetto: object}} parti
 */
export function segnaContenutoSospetto({ riga, corpo = null, sospetto }, opzioni = {}) {
  if (!riga || !sospetto || riga.dataset.contenutoSospetto === 'si') return;
  const documentObj = opzioni.document || riga.ownerDocument || globalThis.document;
  const frase = fraseSospetto(sospetto);
  riga.dataset.contenutoSospetto = 'si';
  const segno = documentObj.createElement('span');
  segno.className = 'talos-badge talos-badge--warning talos-badge--sm talos-tool-row__sospetto';
  segno.textContent = t('kernel.contenutoSospetto.segno');
  segno.title = frase;
  const prima = riga.querySelector(':scope > .talos-voce__meta') || riga.querySelector(':scope > .talos-dot');
  if (prima) prima.before(segno); else riga.append(segno);
  if (!corpo) return;
  const nota = creaNotaSistema({ tipo: 'warning', badge: t('kernel.contenutoSospetto.badge'), titolo: t('kernel.contenutoSospetto.titolo'), testo: frase }, { document: documentObj });
  nota.setAttribute('data-tone', 'warning');
  nota.classList.add('talos-tool-row__nota-sospetto');
  corpo.prepend(nota);
}
