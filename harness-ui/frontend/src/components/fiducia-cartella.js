/*
 * Decisioni 173, 189 e 196 (owner 04/11/2026) sul PC — «Ti fidi di questa cartella?», con i pezzi che ESISTONO già (regola «mai
 *   inventare UI»; forma `FORMA-PERMESSI-2-E-173-2026-11-04.md` §6 e §6 bis):
 *   1. la DOMANDA: la carta di permesso della chat (`creaApprovazione`, la stessa delle carte del giro e della carta «accendi» della
 *      persona, `telefoni-chat.js:431`), senza «Per questa sessione», coi due pulsanti «Sì, mi fido di questa cartella» / «No» e, nella
 *      nota del piede, cosa fa il «No». Risponde alla finestra, non al nucleo: il clic della persona scrive la fiducia (`salva`).
 *   2. la RIGA FISSA col «No»: i testi della fascia sotto la conversazione (`talos-fascia-modo`, la stessa del Piano richiesto);
 *   3. la VOCE della pillola dei permessi: una riga di elenco (`talos-list-row`) nel velo dei permessi, solo quando la cartella non è
 *      fidata.
 *   Testi uguali alla CLI (`firstrun.trust.*`, `screen.trust.fixedLine*`), con il gesto del PC al posto di «/trust».
 * Codex fa la stessa domanda prima di lavorare in una cartella mai vista e la ricorda per progetto (`set_project_trust_level`,
 *   `thread_processor.rs:1479-1505`); Claude Code la fa all'avvio («Do you trust the files in this folder?»).
 */
import { t } from './lingua.js';
import { creaApprovazione, segnaEsitoApprovazione } from './conversazione.js';

const SVG = 'http://www.w3.org/2000/svg';

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

/**
 * La carta della domanda. `salva(fidata)` scrive la fiducia (la rotta `/api/v1/folder-trust`) e torna una promessa: se fallisce, l'errore
 * resta nella carta e i pulsanti si riaccendono (la conversazione non parte in Accesso pieno su una risposta non salvata).
 * @returns {{ scheda: HTMLElement, risposta: Promise<boolean> }} `risposta`: true col «Sì», false col «No», dopo il salvataggio.
 */
export function creaCartaFiducia(doc, { cartella = '', accessoPieno = true, salva } = {}) {
  const { scheda, pulsanti } = creaApprovazione({
    badge: t('chat.trust.title'), bersaglio: cartella, perche: t('chat.trust.plain'),
    motivo: accessoPieno ? t('chat.trust.fullAccess') : '', nota: t('chat.trust.noHint'),
  }, { document: doc });
  scheda.dataset.fiduciaCartella = '';
  const { unaVolta: si, sessione, nega: no } = pulsanti;
  sessione.remove();
  si.textContent = t('chat.trust.yes'); si.dataset.fiduciaSi = '';
  no.textContent = t('chat.trust.no'); no.dataset.fiduciaNo = '';
  let errore = null;
  const risposta = new Promise((risolvi) => {
    const rispondi = async (fidata) => {
      si.disabled = true; no.disabled = true;
      errore?.remove(); errore = null;
      try { await salva?.(fidata); } catch (e) {
        errore = nodo(doc, 'p', 'talos-approval__motivo talos-fiducia__errore', t('chat.trust.saveFailed', { errore: e?.messaggio ?? e?.message ?? '' }));
        errore.setAttribute('role', 'alert');
        scheda.append(errore);
        si.disabled = false; no.disabled = false;
        return;
      }
      segnaEsitoApprovazione(scheda, { approvato: fidata }, { document: doc });
      risolvi(fidata);
    };
    si.addEventListener('click', () => { void rispondi(true); });
    no.addEventListener('click', () => { void rispondi(false); });
  });
  return { scheda, risposta };
}

/**
 * I testi della riga fissa, dall'istantanea delle impostazioni o dalla riga dell'elenco (`cartellaNonFidata`, `pienoTrattenuto`):
 * `null` quando la cartella è fidata (la riga non c'è).
 */
export function testiRigaFiducia(impostazioni) {
  if (impostazioni?.cartellaNonFidata !== true) return null;
  return { frase: t(impostazioni.pienoTrattenuto === true ? 'chat.trust.fixedLineFullAccess' : 'chat.trust.fixedLine'), nota: t('chat.trust.fixedLineGesture') };
}

/** La voce «Fidati di questa cartella» del velo dei permessi: una riga d'elenco, `onFidati()` al clic. */
export function creaVoceFiducia(doc, { onFidati } = {}) {
  const scheda = nodo(doc, 'div', 'talos-card talos-list');
  scheda.dataset.c = 'FolderTrustItem';
  scheda.id = 'veloPermessiFiducia';
  const riga = nodo(doc, 'button', 'talos-list-row');
  riga.type = 'button';
  riga.dataset.fiduciaVoce = '';
  const icona = nodo(doc, 'span', 'talos-list-row__icon');
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  const uso = doc.createElementNS(SVG, 'use');
  uso.setAttribute('href', '#i-shield');
  svg.append(uso);
  icona.append(svg);
  const testo = nodo(doc, 'span', 'talos-list-row__text');
  testo.append(nodo(doc, 'span', 'talos-list-row__title', t('chat.trust.menuItem')), nodo(doc, 'span', 'talos-list-row__sub', t('chat.trust.plain')));
  riga.append(icona, testo);
  riga.addEventListener('click', () => { void onFidati?.(riga); });
  scheda.append(riga);
  return scheda;
}
