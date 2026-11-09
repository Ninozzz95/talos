/*
 * FE-016, 064: la pillola del computer use. Dice che cosa sta facendo, da quanti secondi, e porta il tasto che ferma. Lo stato nasce dagli eventi del ciclo
 * (`talos.computer-use-passo`, `-pausa`, `-fermato`, `-esito`), in una funzione pura: la frase del gruppo di mosse sta qui, non in una carta (T1, regola 17).
 * Durante la presa della persona dice che TALOS non guarda (condizione 3 del Frontend): `pausa` col motivo 'persona', e alla fine si torna alla frase di prima.
 */
import { t } from '../lingua.js';
import { fraseDelPasso, frasePausa } from './parole.js';

export const STATO_PILLOLA_INIZIALE = Object.freeze({ fase: '', prima: '', lavora: false, fermo: false });

export function statoPillola(stato, evento) {
  const v = evento?.value ?? {};
  switch (evento?.name) {
    case 'talos.computer-use-passo':
      if (v.fase === 'esito' && !stato.fermo) { const f = fraseDelPasso(v); return f ? { ...stato, fase: f } : stato; }
      if (v.fase !== 'annuncio' || stato.fermo) return stato;
      return { ...stato, fase: String(v.bersaglio ?? '') || stato.fase, lavora: true };
    case 'talos.computer-use-pausa':
      if (v.motivo === 'persona' && v.fase === 'fine') return { ...stato, fase: stato.prima, prima: '', fermo: false };
      return { ...stato, prima: stato.fermo ? stato.prima : stato.fase, fase: frasePausa(v), fermo: true, lavora: true };
    case 'talos.computer-use-fermato':
    case 'talos.computer-use-esito':
      return { ...STATO_PILLOLA_INIZIALE };
    default:
      return stato;
  }
}

/** @param {{ document: Document, alFerma?: () => void }} o */
export function creaPillola({ document: doc, alFerma }) {
  const nodo = doc.createElement('div');
  nodo.className = 'cu-pillola';
  nodo.setAttribute('role', 'status');
  nodo.hidden = true;
  const fase = doc.createElement('span');
  fase.className = 'cu-pillola__fase';
  const secondi = doc.createElement('span');
  secondi.className = 'cu-pillola__sec';
  secondi.setAttribute('aria-hidden', 'true');
  const ferma = doc.createElement('button');
  ferma.type = 'button';
  ferma.className = 'cu-pillola__ferma';
  ferma.dataset.ferma = '';
  ferma.setAttribute('aria-label', t('computer.common.stop'));
  ferma.textContent = '■';
  ferma.addEventListener('click', () => alFerma?.());
  nodo.append(fase, secondi, ferma);
  return {
    nodo,
    aggiorna({ fase: testo = '', lavora = false, secondi: s = null } = {}) {
      nodo.hidden = !lavora;
      fase.textContent = testo;
      secondi.textContent = Number.isFinite(s) ? `${s} s` : '';
    },
  };
}
