import { createMeasure, createStatusDot } from '../../design-system/index.js';
import { selectStatusBar } from '../../state/selectors.js';

/*
 * La barra di stato: quarta superficie dell'estrazione (fase 4).
 *
 * Porta la decisione G30 del redesign — «la barra resta, ma deve dire il
 * vero» — e con essa un difetto misurato il 04/09 sul prodotto vivo: su una
 * sessione PENDENTE e vuota la barra diceva «100.1k token · 8 giri · cache
 * 50.7k · live», cioè il consumo della sessione aperta PRIMA. Nel monolite
 * `nuovaGenerazioneSessione` azzerava `state.realSession.usage` e nessuno
 * ridisegnava la barra.
 *
 * ⛔ Qui non si cura ridisegnando con più diligenza: il consumo vive dentro
 * `execution`, che il reducer azzera a OGNI cambio di sessione, e la barra è
 * iscritta allo store. Il difetto non può ripresentarsi per COSTRUZIONE.
 *
 * ⛔ E vale la stessa regola della Board: `null` è «non misurato» (trattino
 * più motivo), `0` è «misurato, ed è zero». Aprire una sessione di cui non
 * conosciamo ancora il consumo mostra un trattino, non uno zero: sarebbe
 * inventare una misura per riempire un posto.
 *
 * ⛔⛔ Chi ascolta — il vincolo che avremmo sbagliato. Questa barra NON è una
 * regione live. Ricerca del 05/09/2026: `role="status"` è `aria-atomic="true"`
 * per default, quindi cambiare UN numero farebbe rileggere l'intera barra; e
 * la guida è esplicita sul fatto che ciò che cambia troppo spesso non si
 * annuncia affatto — resta navigabile, e chi vuole ci va. I token durante uno
 * streaming cambiano molte volte al secondo: annunciarli sarebbe inservibile.
 * ⇒ I numeri stanno in markup normale; una regione `role="status"` SEPARATA e
 * piccola annuncia solo il cambio di FASE, a parole, e solo quando cambia
 * davvero. Fonti: developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions ·
 * sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/ ·
 * tpgi.com/screen-reader-support-aria-live-regions/
 */
const SEGNO_NON_MISURATO = '—';

/*
 * Il tono del pallino per la fase. Sconosciuta ⇒ neutro: non si inventa un
 * verde su una fase che non conosciamo.
 */
const TONO_PER_FASE = new Map([
  ['booting', 'warning'],
  ['ready-empty', 'neutral'],
  ['ready-active', 'success'],
  ['error', 'danger'],
]);
const TONO_PER_ESECUZIONE = new Map([
  ['running', 'live'],
  ['awaiting-approval', 'warning'],
  ['error', 'danger'],
]);

export function createStatusBarSurface({ documentObj, store, labels, testId }) {
  if (!documentObj || !store) throw new TypeError('dipendenze barra di stato mancanti');
  if (!labels || !labels.fields || !labels.unmeasured) {
    throw new TypeError('la barra di stato richiede le sue etichette (fields, unmeasured)');
  }

  const barra = documentObj.createElement('div');
  barra.className = 'talos-status-bar';
  // ⛔ Un ruolo di riferimento, non una regione live: si raggiunge, non urla.
  barra.setAttribute('role', 'group');
  barra.setAttribute('aria-label', labels.regionLabel || 'Stato');
  if (testId) barra.dataset.testid = testId;

  const pallino = createStatusDot({ document: documentObj, tone: 'neutral', size: 'sm' });
  const fase = documentObj.createElement('span');
  fase.className = 'talos-status-bar__phase';
  const gruppoFase = documentObj.createElement('span');
  gruppoFase.className = 'talos-status-bar__cell';
  gruppoFase.append(pallino.element, fase);

  /*
   * La regione che parla, separata e minuscola: contiene SOLO la frase, così
   * `aria-atomic` rilegge una frase e non tutta la barra.
   */
  const annuncio = documentObj.createElement('span');
  annuncio.className = 'sr-only';
  annuncio.setAttribute('role', 'status');

  barra.append(gruppoFase);

  const celle = new Map();
  const misure = new Map();
  for (const campo of labels.fields) {
    const cella = documentObj.createElement('span');
    cella.className = 'talos-status-bar__cell';
    const nome = documentObj.createElement('span');
    nome.className = 'talos-status-bar__label';
    nome.textContent = campo.label;
    const valore = documentObj.createElement('span');
    valore.className = 'talos-status-bar__value';
    cella.append(nome, valore);
    celle.set(campo.id, { cella, valore, campo });
    barra.append(cella);
  }
  barra.append(annuncio);

  /** Il trattino, con il MOTIVO per cui non c'è un numero. */
  function scriviNonMisurato(valore, motivo) {
    const span = documentObj.createElement('span');
    span.className = 'talos-status-bar__unmeasured';
    const segno = documentObj.createElement('span');
    segno.setAttribute('aria-hidden', 'true');
    segno.textContent = SEGNO_NON_MISURATO;
    const detto = documentObj.createElement('span');
    detto.className = 'sr-only';
    detto.textContent = labels.unmeasured;
    span.append(segno, detto);
    if (motivo) span.setAttribute('title', String(motivo));
    valore.replaceChildren(span);
  }

  function scriviMisura(id, valore, numero, unita) {
    let misura = misure.get(id);
    const props = { value: String(numero), unit: unita || '', provenance: 'measured' };
    if (misura) {
      misura.update(props);
      // ⛔ Il nodo può essere stato staccato da un giro «non misurato»: si
      // riattacca, altrimenti la misura esiste e non si vede. Si chiede al
      // NODO chi è il suo genitore — non alla lista se lo contiene: nel DOM
      // vero `children` è una HTMLCollection e non ha `includes`, e un metodo
      // che esiste solo nel finto è una prova che passa e un prodotto rotto.
      if (misura.element.parentNode !== valore) valore.replaceChildren(misura.element);
      return;
    }
    misura = createMeasure({ document: documentObj, ...props });
    misure.set(id, misura);
    valore.replaceChildren(misura.element);
  }

  let ultimaFrase = null;

  function disegna({ phase, connection, execution, usage }) {
    /*
     * ⛔ UNA chiave sola, scelta prima di tradurre. La prima versione provava
     * `phases[execution]` e poi ripiegava su `phases[phase]`: uno stato di
     * esecuzione SCONOSCIUTO scivolava sull'etichetta della fase, e «quantum»
     * appariva a schermo come «nessuna sessione». Il ripiego nascondeva
     * esattamente il caso che deve restare visibile. Se qualcosa sta girando,
     * comanda l'esecuzione; se non lo conosciamo, si scrive grezzo.
     */
    const chiave = execution && execution !== 'idle' ? execution : phase;
    const tono = (execution && execution !== 'idle'
      ? TONO_PER_ESECUZIONE.get(execution)
      : TONO_PER_FASE.get(phase)) || 'neutral';
    pallino.update({ tone: tono });
    const nomeFase = labels.phases?.[chiave] || String(chiave || '');
    fase.textContent = nomeFase;

    for (const [id, { valore, campo }] of celle) {
      if (id === 'connection') {
        valore.textContent = labels.connections?.[connection] || String(connection || '');
        continue;
      }
      // ⛔ `usage` assente = non misurato per INTERO: nessun campo inventa uno
      // zero perché il suo vicino ce l'ha.
      const numero = usage ? usage[id] : undefined;
      if (numero === null || numero === undefined) {
        scriviNonMisurato(valore, usage ? labels.missingReasons?.[id] : labels.noUsageReason);
        continue;
      }
      scriviMisura(id, valore, numero, campo.unit);
    }

    /*
     * L'annuncio: solo la fase, solo quando cambia. Un numero che cambia a
     * ogni token non entra mai qui.
     */
    const frase = labels.announceTemplate
      ? labels.announceTemplate.replace('{fase}', nomeFase)
      : nomeFase;
    if (frase !== ultimaFrase) {
      ultimaFrase = frase;
      annuncio.textContent = frase;
    }
  }

  const unsubscribe = store.subscribe(selectStatusBar, disegna, { equal: Object.is, fireImmediately: true });

  let distrutta = false;
  return Object.freeze({
    element: barra,
    update() {},
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      unsubscribe();
      pallino.destroy();
      for (const misura of misure.values()) misura.destroy();
      misure.clear();
      barra.remove();
      return true;
    },
  });
}
