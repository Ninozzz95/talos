import { defineComponent } from '../ui/component.js';

/*
 * Turn e TurnSpine — il giro e la sua spina.
 *
 * La spina e' la firma visiva del redesign: una tacca per giro, lunga quanto
 * il giro e' costato, colorata dall'esito. ⛔ Ma e' una MISURA disegnata, non
 * un testo: per chi ascolta la stessa informazione arriva dal contenuto del
 * giro e dall'indice dei giri nella colonna, quindi la spina si nasconde
 * (`aria-hidden`) invece di ripetere «giro 2, giro 3» in mezzo alle frasi.
 *
 * ⛔ Il costo non e' un numero libero: entra come `cost` (0-10) e diventa la
 * variabile `--tick` che il CSS traduce in lunghezza. Un componente che
 * accettasse pixel lascerebbe decidere la scala a chi lo chiama, e la scala
 * e' una decisione del design.
 */
const ESITI = new Set(['ok', 'info', 'warning', 'danger', 'current']);

export const createTurnSpine = defineComponent('TurnSpine', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const spina = documentObj.createElement('div');
  spina.className = 'talos-turn-spine';
  spina.setAttribute('aria-hidden', 'true');

  let props = { turns: [], ...initialProps };

  function render() {
    if (!Array.isArray(props.turns)) throw new TypeError('TurnSpine richiede un elenco di giri');
    const nodi = [];
    for (const giro of props.turns) {
      if (giro.outcome && !ESITI.has(giro.outcome)) throw new TypeError(`esito del giro non valido: ${giro.outcome}`);
      const costo = Number(giro.cost ?? 1);
      if (!Number.isFinite(costo) || costo < 0 || costo > 10) {
        throw new TypeError(`costo del giro fuori scala (0-10): ${giro.cost}`);
      }
      const numero = documentObj.createElement('span');
      numero.className = 'talos-turn-spine__n';
      numero.textContent = String(giro.n);
      const tacca = documentObj.createElement('span');
      const esito = giro.outcome || 'ok';
      tacca.className = `talos-turn-spine__tick${esito === 'ok' ? '' : ` talos-turn-spine__tick--${esito}`}`;
      tacca.style = tacca.style || {};
      if (typeof tacca.style.setProperty === 'function') tacca.style.setProperty('--tick', String(costo));
      else tacca.dataset.tick = String(costo);
      nodi.push(numero, tacca);
    }
    spina.replaceChildren(...nodi);
    if (props.testId) spina.dataset.testid = props.testId;
  }

  render();
  return {
    element: spina,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { spina.remove(); },
  };
});

/** Un giro: la spina a sinistra, il contenuto al centro. */
export const createTurn = defineComponent('Turn', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const turno = documentObj.createElement('div');
  turno.className = 'talos-turn';
  let props = { ...initialProps };
  let contenutoCorrente = [];

  function render() {
    const pezzi = [];
    if (props.spine) pezzi.push(props.spine);
    const contenuto = Array.isArray(props.content) ? props.content : [props.content].filter(Boolean);
    if (!contenuto.length) throw new TypeError('Turn richiede un contenuto');
    pezzi.push(...contenuto);
    if (pezzi.length !== contenutoCorrente.length || pezzi.some((n, i) => n !== contenutoCorrente[i])) {
      turno.replaceChildren(...pezzi);
      contenutoCorrente = pezzi;
    }
    if (props.testId) turno.dataset.testid = props.testId;
  }

  render();
  return {
    element: turno,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { turno.remove(); },
  };
});
