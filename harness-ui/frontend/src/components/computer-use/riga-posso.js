/*
 * FE-057: la riga «Posso» (forma A «Una riga con tre voci», consigliata e sostituibile: la scelta fra A e B è dell'owner). Comportamento deciso il 02/11: senza voci capite niente
 * riga; togliere e aggiungere valgono subito; spente tutte la riga resta per riaccenderle. Il tetto sta accanto a «pagare»: abbassarlo o toglierlo vale sempre, alzarlo è un
 * tocco della persona (condizione 2 del Frontend). Il valore che esce è quello che il nucleo rilegge da `richiestaAggiornata()`: il sospetto resta del ciclo, la riga non lo spegne.
 */
import { t } from '../lingua.js';

const VOCI = Object.freeze(['pagare', 'inviare', 'cancellare']);
const VALUTE = Object.freeze(['EUR', 'USD', 'GBP', 'CHF']); // `tettoValido` di `ciclo.mjs`
const SIMBOLI = Object.freeze({ EUR: '€' });

/** Il tetto scritto nel campo, o `null`: vuoto, zero, negativo o illeggibile non sono un tetto. */
export function leggiTetto(testo, valuta) {
  const pulito = String(testo ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/u.test(pulito) || !VALUTE.includes(valuta)) return null;
  const importo = Number(pulito);
  return importo > 0 ? { importo, valuta } : null;
}

const scriviTetto = (tetto) => (tetto ? String(tetto.importo).replace('.', ',') : '');

/**
 * @param {{ document: Document, voci: {pagare?: boolean, inviare?: boolean, cancellare?: boolean}, tetto?: {importo: number, valuta: string}|null, alCambia?: (valore: object) => void }} o
 * @returns {{ nodo: HTMLElement, valore: () => object }|null}
 */
export function creaRigaPosso({ document: doc, voci, tetto = null, alCambia }) {
  if (!VOCI.some((k) => voci?.[k] === true)) return null;
  const stato = { pagare: voci.pagare === true, inviare: voci.inviare === true, cancellare: voci.cancellare === true };
  const valuta = tetto?.valuta ?? 'EUR';
  let scritto = scriviTetto(tetto);
  const valore = () => ({ ...stato, tetto: stato.pagare ? leggiTetto(scritto, valuta) : null });
  const avvisa = () => alCambia?.(valore());

  const nodo = doc.createElement('div');
  nodo.className = 'talos-controllo posso';
  nodo.dataset.posso = '';
  const nome = doc.createElement('span');
  nome.className = 'talos-nome';
  nome.textContent = t('computer.can.title');
  const aiuto = doc.createElement('small');
  aiuto.textContent = t('computer.can.help');
  nome.append(aiuto);
  const fila = doc.createElement('span');
  fila.className = 'talos-codice-r4-stati';
  fila.setAttribute('role', 'group');
  fila.setAttribute('aria-label', t('computer.can.label'));

  const etichettaTetto = doc.createElement('label');
  etichettaTetto.className = 'cu-tetto';
  const campo = doc.createElement('input');
  campo.className = 'cu-tetto__campo';
  campo.dataset.tetto = '';
  campo.setAttribute('inputmode', 'decimal');
  campo.setAttribute('aria-label', t('computer.can.capLabel'));
  campo.value = scritto;
  campo.addEventListener('input', () => { scritto = campo.value; avvisa(); });
  etichettaTetto.append(t('computer.can.upTo'), campo, SIMBOLI[valuta] ?? valuta);
  etichettaTetto.hidden = !stato.pagare;

  for (const k of VOCI) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = t(`computer.can.${k}`);
    b.setAttribute('aria-pressed', String(stato[k]));
    b.addEventListener('click', () => {
      stato[k] = !stato[k];
      b.setAttribute('aria-pressed', String(stato[k]));
      if (k === 'pagare') etichettaTetto.hidden = !stato.pagare;
      avvisa();
    });
    fila.append(b);
    if (k === 'pagare') fila.append(etichettaTetto);
  }
  nodo.append(nome, fila);
  return { nodo, valore };
}
