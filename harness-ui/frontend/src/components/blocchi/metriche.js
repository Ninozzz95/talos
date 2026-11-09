/*
 * Il disegnatore di `metriche` (interfaccia generativa, catalogo v2, scena 9, ledger G-C UIG-9): da due a sei riquadri con nome, valore
 * grande e, se c'è, il verso (su/giù) con la sua nota. Disegno del bozzetto approvato (`.gu-metriche`, `.gu-metrica__k/__v/__d`).
 * ⛔ Il verso si dice col segno E con la parola nascosta per i lettori di schermo (mai solo col colore), e il testo usa i token di
 *   testo del tema, mai il colore della serie.
 */
import { t } from '../lingua.js';
import { el, lista, testoDelValore } from './comune.js';

const SEGNO = { su: '▲', giu: '▼' };

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'metriche'`), anche parziale
 * @param {{ document: Document }} opzioni
 */
export function disegnaMetriche(blocco, { document: doc } = {}) {
  const radice = el(doc, 'div', 'gu-metriche');
  for (const m of lista(blocco.voci)) {
    const riquadro = el(doc, 'div', 'gu-metrica');
    riquadro.append(el(doc, 'div', 'gu-metrica__k', m.nome ?? ''));
    riquadro.append(el(doc, 'div', 'gu-metrica__v', testoDelValore(m.valore, m.formato === 'soldi' ? 'soldi' : 'numero')));
    if (m.verso || m.nota) {
      const d = el(doc, 'div', 'gu-metrica__d');
      if (m.verso && SEGNO[m.verso]) {
        d.dataset.verso = m.verso;
        const segno = el(doc, 'span', 'gu-metrica__segno', SEGNO[m.verso]);
        segno.setAttribute('aria-hidden', 'true');
        d.append(segno, el(doc, 'span', 'sr-only', `${t(m.verso === 'su' ? 'blocchi.metrics.up' : 'blocchi.metrics.down')} `));
      }
      if (m.nota) d.append(el(doc, 'span', '', m.nota));
      riquadro.append(d);
    }
    radice.append(riquadro);
  }
  return radice;
}
