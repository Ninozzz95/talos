/*
 * Il disegnatore di `cursore` (interfaccia generativa, catalogo v2, scena 7, ledger G-C UIG-7). Un cursore nativo con la sua etichetta
 * visibile, la tabella dei dati e una colonna in più calcolata dalla formula del modello; sotto, il totale.
 * ⛔ La formula NON si esegue: la legge `src/blocchi/formula.mjs` (numeri, colonne dichiarate, + - * / e parentesi), e il conto è
 *   `contoDelCursore` del catalogo, lo stesso del ripiego testuale. Muovere il cursore non manda niente: zero richieste (UIG-7.R1).
 * Accessibilità (APG «Slider», https://www.w3.org/WAI/ARIA/apg/patterns/slider/, letta il 05/11/2026): `input type=range` nativo,
 *   quindi frecce, Pagina su/giù, Inizio e Fine vengono dal browser; il valore corrente in `<output for>`, il totale in
 *   `aria-live="polite"` perché chi usa un lettore di schermo senta il risultato senza perdere il fuoco.
 * Il disegno segue il bozzetto approvato (`.gu-cursore`, `.gu-qui`, `.gu-totale`).
 */
import { t } from '../lingua.js';
import { contoDelCursore } from '../../../../src/blocchi/catalogo.mjs';
import { el, lista, numero, testoDelValore } from './comune.js';

let progressivo = 0;

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'cursore'`), anche parziale
 * @param {{ document: Document, interattivo?: boolean }} opzioni `interattivo`: vero solo a blocco completo
 */
export function disegnaCursore(blocco, { document: doc, interattivo = false } = {}) {
  const radice = el(doc, 'div', 'gu-cursore');
  const c = blocco.cursore || {};
  const colonne = lista(blocco.colonne);
  const formato = blocco.formato === 'soldi' ? 'soldi' : 'numero';
  const id = `gu-cursore-${(progressivo += 1)}`;
  const testa = el(doc, 'div', 'gu-cursore__testa');
  const etichetta = el(doc, 'label', 'gu-cursore__etichetta', c.etichetta ?? '');
  etichetta.setAttribute('for', id);
  const qui = el(doc, 'output', 'gu-qui');
  qui.setAttribute('for', id);
  testa.append(etichetta, qui);
  const input = doc.createElement('input');
  input.setAttribute('type', 'range');
  input.setAttribute('id', id);
  input.className = 'gu-cursore__input';
  if (typeof c.min === 'number') input.setAttribute('min', String(c.min));
  if (typeof c.max === 'number') input.setAttribute('max', String(c.max));
  if (typeof c.passo === 'number') input.setAttribute('step', String(c.passo));
  if (typeof c.min === 'number') {
    input.setAttribute('value', String(c.valore ?? c.min));
    input.value = String(c.valore ?? c.min);
  }
  const pronto = interattivo && typeof blocco.formula === 'string' && typeof c.min === 'number';
  input.disabled = !pronto;

  const avvolgi = el(doc, 'div', 'md-table-wrap gu-cursore__dati');
  const tabella = el(doc, 'table', 'md-table');
  const riga0 = el(doc, 'tr');
  for (const col of colonne) riga0.append(el(doc, 'th', '', col.titolo ?? col.id ?? ''));
  riga0.append(el(doc, 'th', 'num gu-num', t('blocchi.slider.result')));
  const thead = el(doc, 'thead');
  thead.append(riga0);
  const tbody = el(doc, 'tbody');
  const celleRisultato = lista(blocco.righe).map((celle) => {
    const tr = el(doc, 'tr');
    for (const v of lista(celle)) {
      const cifra = typeof v === 'number';
      tr.append(el(doc, 'td', cifra ? 'num gu-num' : '', testoDelValore(v, cifra ? 'numero' : undefined)));
    }
    const r = el(doc, 'td', 'num gu-num gu-cursore__risultato', '—');
    tr.append(r);
    tbody.append(tr);
    return r;
  });
  tabella.append(thead, tbody);
  avvolgi.append(tabella);
  const totale = el(doc, 'p', 'gu-totale');
  totale.setAttribute('aria-live', 'polite');

  const aggiorna = () => {
    if (!pronto) return;
    const conto = contoDelCursore(blocco, Number(input.value));
    qui.textContent = numero(conto.valore);
    conto.righe.forEach((r, i) => { if (celleRisultato[i]) celleRisultato[i].textContent = testoDelValore(r.risultato, formato); });
    totale.textContent = `${t('blocchi.slider.total')}: ${testoDelValore(conto.totale, formato)}`;
  };
  input.addEventListener('input', aggiorna);
  aggiorna();
  radice.append(testa, input, avvolgi, totale);
  return radice;
}
