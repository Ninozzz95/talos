import { defineComponent } from '../ui/component.js';

/*
 * Composer — dove si scrive, e le cose che il redesign ci mette accanto:
 * la striscia di stato mentre lavora (B31), la coda a vista (B15), le pillole
 * (B10-B12), gli allegati col loro costo (B9), e i DUE pulsanti (O-08).
 *
 * ⛔ La coda e' VISIBILE per costruzione: un messaggio accodato che non si
 * vede e' un messaggio perso (B15).
 *
 * ⛔ La striscia di stato e' `role="status"`: dice cosa sta facendo senza
 * interrompere. Non e' un `alert` — un giro che lavora non e' un'emergenza, e
 * trattarlo come tale insegna a ignorare gli allarmi veri.
 *
 * ⛔ Il pulsante di invio DIVENTA «ferma» mentre lavora (B17): un solo posto
 * dove guardare, e i due stati cambiano insieme cosi' non possono divergere.
 *
 * ⛔ O-08, decisione dell'owner rivista lo stesso giorno: DUE pulsanti
 * separati — uno con la parola «Capability» che apre l'inventario, e il «+»
 * che serve SOLO ad allegare. Il «+» che apriva un foglio di dodici sezioni
 * prometteva una cosa e ne faceva un'altra.
 *
 * ⛔ O-05, immagini al modello. Ricerca del 04/09/2026, e ha imposto la forma:
 *  - servono TRE vie, non una: gli appunti passano i file solo in alcuni casi
 *    (su Windows con Chrome, in pratica, solo gli screenshot), il trascinamento
 *    passa i file quasi sempre, e il selettore di sistema funziona ovunque;
 *  - il trascinamento DEVE avere un'alternativa da tastiera: chi non usa il
 *    mouse non puo' restare fuori. Il «+» apre un `<input type="file">` vero,
 *    ed e' quella l'alternativa — per questo non e' opzionale.
 *  - un'immagine verso un modello SENZA visione si rifiuta e si DICE (C11):
 *    accettarla in silenzio la farebbe sparire senza spiegazione.
 * Fonti: developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent ·
 * w3.org/TR/clipboard-apis/ · react-aria.adobe.com/useClipboard
 */
const IMMAGINE = /^image\//i;

export const createComposer = defineComponent('Composer', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const piede = documentObj.createElement('div');
  const striscia = documentObj.createElement('div');
  const strisciaPulsazione = documentObj.createElement('span');
  const strisciaTesto = documentObj.createElement('span');
  const coda = documentObj.createElement('div');
  const codaConto = documentObj.createElement('span');
  const codaTesto = documentObj.createElement('span');
  const guscio = documentObj.createElement('div');
  const allegati = documentObj.createElement('ul');
  const campo = documentObj.createElement('textarea');
  const barra = documentObj.createElement('div');
  const piu = documentObj.createElement('button');
  const capability = documentObj.createElement('button');
  const selettoreFile = documentObj.createElement('input');
  const pillole = documentObj.createElement('div');
  const invia = documentObj.createElement('button');

  piede.className = 'talos-chat-foot';
  striscia.className = 'talos-status-strip';
  striscia.setAttribute('role', 'status');
  strisciaPulsazione.className = 'talos-status-strip__pulse';
  strisciaPulsazione.setAttribute('aria-hidden', 'true');
  strisciaTesto.className = 'talos-status-strip__what';
  coda.className = 'talos-queue';
  codaConto.className = 'talos-badge talos-badge--sm';
  codaTesto.className = 'talos-queue__text';
  guscio.className = 'talos-composer';
  allegati.className = 'talos-composer__attachments';
  campo.className = 'talos-composer__input';
  barra.className = 'talos-composer__bar';
  piu.className = 'talos-composer__attach';
  piu.type = 'button';
  // ⛔ Un pulsante senza contenuto e' un pulsante INVISIBILE: il segno «+» e'
  // decorativo (il nome lo porta `aria-label`), ma senza di lui il bottone non
  // ha dimensione e la prova nel browser lo ha trovato non visibile.
  const segnoPiu = documentObj.createElement('span');
  segnoPiu.setAttribute('aria-hidden', 'true');
  segnoPiu.textContent = '+';
  piu.append(segnoPiu);
  capability.className = 'talos-button talos-button--secondary talos-button--sm';
  capability.type = 'button';
  selettoreFile.type = 'file';
  selettoreFile.className = 'sr-only';
  selettoreFile.multiple = true;
  /*
   * ⛔ L'input NON e' un secondo comando: e' il modo in cui il «+» apre la
   * finestra del sistema. Lasciarlo nell'albero accessibile con lo stesso nome
   * del pulsante fa sentire DUE controlli identici a chi naviga per nome — la
   * prova nel browser l'ha rilevato come «strict mode violation: 2 elements».
   * Il pulsante resta l'unico controllo nominato, e resta raggiungibile con Tab:
   * e' quella l'alternativa da tastiera al trascinamento.
   */
  selettoreFile.tabIndex = -1;
  selettoreFile.setAttribute('aria-hidden', 'true');
  pillole.className = 'talos-composer__pills';
  invia.type = 'button';
  striscia.append(strisciaPulsazione, strisciaTesto);
  coda.append(codaConto, codaTesto);
  barra.append(piu, capability, selettoreFile, pillole, invia);
  guscio.append(allegati, campo, barra);
  piede.append(striscia, coda, guscio);

  let props = { busy: false, queue: [], pills: [], attachments: [], visionSupported: true, ...initialProps };
  let pilloleCorrenti = [];
  let allegatiMontati = [];

  function accetta(files, origine) {
    const elenco = Array.from(files || []);
    if (!elenco.length) return false;
    const immagini = elenco.filter((file) => IMMAGINE.test(file.type || ''));
    if (immagini.length && props.visionSupported === false) {
      // ⛔ Si rifiuta e si DICE: accettarla in silenzio la farebbe sparire.
      if (typeof props.onRefused === 'function') {
        props.onRefused({ reason: 'no-vision', files: immagini, source: origine });
      }
      const restanti = elenco.filter((file) => !IMMAGINE.test(file.type || ''));
      if (!restanti.length) return false;
      if (typeof props.onAttach === 'function') props.onAttach(restanti, origine);
      return true;
    }
    if (typeof props.onAttach === 'function') props.onAttach(elenco, origine);
    return true;
  }

  const onInvia = () => {
    if (props.busy) { if (typeof props.onStop === 'function') props.onStop(); return; }
    if (typeof props.onSend === 'function') props.onSend(campo.value);
  };
  const onPiu = () => selettoreFile.click?.();
  const onCapability = () => { if (typeof props.onCapability === 'function') props.onCapability(); };
  const onFileScelti = (event) => { accetta(event?.target?.files, 'picker'); };
  const onIncolla = (event) => {
    const files = event?.clipboardData?.files;
    if (files && files.length && accetta(files, 'paste') && typeof event.preventDefault === 'function') event.preventDefault();
  };
  const onSopra = (event) => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    guscio.dataset.trascinaSopra = 'si';
  };
  const onEsce = () => { delete guscio.dataset.trascinaSopra; };
  const onRilascia = (event) => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    delete guscio.dataset.trascinaSopra;
    accetta(event?.dataTransfer?.files, 'drop');
  };

  invia.addEventListener('click', onInvia);
  piu.addEventListener('click', onPiu);
  capability.addEventListener('click', onCapability);
  selettoreFile.addEventListener('change', onFileScelti);
  campo.addEventListener('paste', onIncolla);
  guscio.addEventListener('dragover', onSopra);
  guscio.addEventListener('dragleave', onEsce);
  guscio.addEventListener('drop', onRilascia);

  function disegnaAllegati() {
    const elenco = Array.isArray(props.attachments) ? props.attachments : [];
    for (const montato of allegatiMontati) montato.remove?.();
    allegatiMontati = elenco.map((allegato) => {
      const li = documentObj.createElement('li');
      li.className = 'talos-attachment';
      const nome = documentObj.createElement('span');
      nome.className = 'talos-attachment__name';
      nome.textContent = String(allegato.name || '');
      li.append(nome);
      if (allegato.tokens !== undefined && allegato.tokens !== null) {
        // B9: un allegato dichiara quanto contesto costa, come stima.
        const costo = documentObj.createElement('span');
        costo.className = 'talos-mono talos-measure talos-measure--estimate talos-attachment__cost';
        const parola = documentObj.createElement('span');
        parola.className = 'sr-only';
        parola.textContent = `${props.estimateWord || 'stima:'} `;
        const valore = documentObj.createElement('span');
        valore.textContent = `${allegato.tokens} ${props.tokensWord || 'token'}`;
        costo.append(parola, valore);
        li.append(costo);
      }
      const togli = documentObj.createElement('button');
      togli.type = 'button';
      togli.className = 'talos-button talos-button--ghost talos-button--sm';
      togli.textContent = props.removeLabel || 'Togli';
      togli.setAttribute('aria-label', `${props.removeLabel || 'Togli'} ${allegato.name || ''}`.trim());
      togli.addEventListener('click', () => {
        if (typeof props.onRemoveAttachment === 'function') props.onRemoveAttachment(allegato);
      });
      li.append(togli);
      allegati.append(li);
      return li;
    });
    allegati.hidden = !elenco.length;
  }

  function render() {
    if (!props.label) throw new TypeError('Composer richiede il nome del campo');
    if (!props.sendLabel || !props.stopLabel) throw new TypeError('Composer richiede i nomi dei due stati del pulsante (invia e ferma)');
    if (!props.attachLabel) throw new TypeError('Composer richiede il nome del pulsante che allega: e\' l\'alternativa da tastiera al trascinamento');
    if (!props.capabilityLabel) throw new TypeError('Composer richiede il nome del pulsante Capability (decisione O-08: due pulsanti separati)');
    campo.setAttribute('aria-label', String(props.label));
    if (props.placeholder) campo.placeholder = String(props.placeholder);
    if (props.value !== undefined && campo.value !== props.value) campo.value = String(props.value);

    piu.setAttribute('aria-label', String(props.attachLabel));
    capability.textContent = String(props.capabilityLabel);
    if (props.accept) selettoreFile.setAttribute('accept', String(props.accept));

    striscia.hidden = !props.busy;
    strisciaTesto.textContent = props.busy && props.statusText ? String(props.statusText) : '';

    const inCoda = Array.isArray(props.queue) ? props.queue : [];
    coda.hidden = !inCoda.length;
    codaConto.textContent = inCoda.length ? `${inCoda.length} ${props.queueWord || 'in coda'}` : '';
    codaTesto.textContent = inCoda.length ? String(inCoda[0]) : '';

    invia.className = `talos-send${props.busy ? ' talos-send--stop' : ''}`;
    invia.textContent = props.busy ? String(props.stopLabel) : String(props.sendLabel);
    invia.setAttribute('aria-label', props.busy ? String(props.stopLabel) : String(props.sendLabel));

    const prossime = Array.isArray(props.pills) ? props.pills : [];
    if (prossime.length !== pilloleCorrenti.length || prossime.some((n, i) => n !== pilloleCorrenti[i])) {
      pillole.replaceChildren(...prossime);
      pilloleCorrenti = prossime;
    }
    disegnaAllegati();
    if (props.testId) piede.dataset.testid = props.testId;
  }

  render();
  return {
    element: piede,
    focus(options) { campo.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() {
      invia.removeEventListener('click', onInvia);
      piu.removeEventListener('click', onPiu);
      capability.removeEventListener('click', onCapability);
      selettoreFile.removeEventListener('change', onFileScelti);
      campo.removeEventListener('paste', onIncolla);
      guscio.removeEventListener('dragover', onSopra);
      guscio.removeEventListener('dragleave', onEsce);
      guscio.removeEventListener('drop', onRilascia);
      piede.remove();
    },
  };
});
