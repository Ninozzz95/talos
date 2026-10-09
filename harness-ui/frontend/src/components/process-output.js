import { linguaCorrenteDiT, t as tr } from './lingua.js';

const PAGE_BYTES = 4096;
const states = new Set(['recording', 'complete', 'limited', 'failed', 'interrupted']);
const id = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
/* Un errore nostro, col testo nella lingua corrente: `mostra` dice se la persona lo legge così com'è (un'altra eccezione si dice col testo generico). */
const errore = (chiave, mostra) => Object.assign(new Error(tr(chiave)), {mostraAllaPersona: mostra});
const invalid = () => {throw errore('processi.output.invalidResponse', true);};
const localeNumeri = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');

/** Only a typed backend receipt can offer access; never parse references from model text. */
export function normalizzaRicevutaOutput(value, expected = {}) {
  if (!value || value.schema !== 'talos.process-output.v1' || !states.has(value.state)
      || !['sessionId', 'runId', 'toolCallId'].every(k => id(value[k]))
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value.outputId)
      || ['sessionId', 'runId', 'toolCallId', 'outputId'].some(k => expected[k] !== undefined && value[k] !== expected[k])) return null;
  /* 08/10/2026: la terminazione 'background' (comando passato in sottofondo, ancora vivo) cambia la frase dello stato. */
  return Object.freeze({...Object.fromEntries(['schema', 'sessionId', 'runId', 'toolCallId', 'outputId', 'state'].map(k => [k, value[k]])), ...(value.termination === 'background' ? {termination: 'background'} : {})});
}

export function creaClientOutput({receipt, fetchFn = globalThis.fetch, API = p => p} = {}) {
  const identity = normalizzaRicevutaOutput(receipt);
  if (!identity) invalid();
  function url({stream = 'stdout', offset = 0, limit = PAGE_BYTES} = {}, format = 'text') {
    if (!['stdout', 'stderr'].includes(stream) || !integer(offset) || !integer(limit) || limit < 1 || limit > PAGE_BYTES) invalid();
    return API(`/api/v1/sessions/${encodeURIComponent(identity.sessionId)}/process-outputs/${identity.outputId}?stream=${stream}&offset=${offset}&limit=${limit}&format=${format}`);
  }
  return {
    rawUrl: args => url(args, 'raw'),
    downloadUrl({stream='stdout'}={}) {
      if(!['stdout','stderr'].includes(stream)) invalid();
      return API(`/api/v1/sessions/${encodeURIComponent(identity.sessionId)}/process-outputs/${identity.outputId}?stream=${stream}&format=download`);
    },
    async leggi({stream = 'stdout', offset = 0, signal} = {}) {
      const response = await fetchFn(url({stream, offset}), {signal, cache: 'no-store'});
      if (!response.ok) throw response.status === 404 ? errore('processi.output.noLongerAvailable', true) : errore('processi.output.readFailedCanRetry', false);
      let envelope;
      try {envelope = await response.json();} catch (error) {if (signal?.aborted) throw error; invalid();}
      const p = envelope?.data;
      if (envelope?.ok !== true || !p || p.schema !== 'talos.process-output-page.v1'
          || ['outputId', 'runId', 'toolCallId'].some(k => p[k] !== identity[k])
          || p.stream !== stream || p.offset !== offset || !states.has(p.state)
          || !['bytes', 'availableBytes', 'storedBytes', 'observedBytes'].every(k => integer(p[k]))
          || p.bytes > PAGE_BYTES || !integer(offset + p.bytes) || offset + p.bytes > p.availableBytes
          || p.availableBytes > p.storedBytes || p.storedBytes > p.observedBytes
          || (p.nextOffset !== null && (!integer(p.nextOffset) || p.nextOffset !== offset + p.bytes || p.nextOffset <= offset || p.nextOffset >= p.availableBytes))
          || (p.nextOffset === null && offset + p.bytes !== p.availableBytes)
          || (p.encoding === 'utf-8' ? typeof p.text !== 'string' || new TextEncoder().encode(p.text).length !== p.bytes
            : p.encoding !== 'binary-or-invalid-utf8' || p.text !== null)) invalid();
      return p;
    },
  };
}

/* Le CHIAVI dei testi di stato: il testo si risolve quando si disegna, nella lingua di quel momento. */
const CHIAVI_STATO = {
  recording: 'processi.output.stateRecording',
  complete: 'processi.output.stateComplete',
  limited: 'processi.output.stateLimited',
  failed: 'processi.output.stateFailed',
  interrupted: 'processi.output.stateInterrupted',
};
/* 08/10/2026 (review del collega): la ricevuta in sottofondo è una FOTOGRAFIA del passaggio di mano, quindi non dice «ancora in
   corso» (diventa falso quando il comando finisce o lo fermi dai Processi: lo stato vivo sta nella scheda Processi); e se il
   limite di conservazione era già stato raggiunto, lo dice, come fa la nota per il modello. */
const CHIAVI_SFONDO = {complete: 'processi.output.stateBackground', limited: 'processi.output.stateBackgroundLimited'};
const stateLabel = (stato, terminazione) => tr(terminazione === 'background' && CHIAVI_SFONDO[stato] ? CHIAVI_SFONDO[stato] : CHIAVI_STATO[stato]);

/** One retained page per reader. Session disposal and disclosure closure invalidate late responses. */
export function creaLettoreOutput({receipt, API, fetchFn, signal, document: doc = globalThis.document} = {}) {
  let current = normalizzaRicevutaOutput(receipt);
  if (!current) invalid();
  const client = creaClientOutput({receipt: current, API, fetchFn});
  const el = (tag, text, className) => {const n = doc.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n;};
  const root = el('details', null, 'talos-process-output');
  const summary = el('summary', tr('processi.output.summary'));
  const controls = el('div', null, 'talos-process-output__controls');
  const label = el('label', `${tr('processi.output.stream')} `), select = el('select');
  select.setAttribute('aria-label', tr('processi.output.streamLabel'));
  for (const [value, text] of [['stdout', tr('processi.output.streamStdout')], ['stderr', tr('processi.output.streamStderr')]]) {const option = el('option', text); option.value = value; select.append(option);}
  label.append(select);
  const button = text => {const n = el('button', text, 'talos-button talos-button--secondary'); n.type = 'button'; return n;};
  const refresh = button(tr('processi.output.refresh')), first = button(tr('processi.output.firstPage')), next = button(tr('processi.output.nextPage'));
  const status = el('p', stateLabel(current.state, current.termination), 'talos-process-output__status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const range = el('p', '', 'talos-process-output__range');
  const pre = el('pre'), code = el('code'); pre.append(code); pre.tabIndex = 0; pre.setAttribute('aria-label', tr('processi.output.pageContentLabel'));
  const download = el('a', tr('processi.output.downloadPage'), 'talos-button talos-button--secondary');
  download.setAttribute('download', ''); download.hidden = true;
  const completeDownload = el('a', tr('processi.output.downloadStored'), 'talos-button talos-button--secondary');
  completeDownload.setAttribute('download',''); completeDownload.hidden=true;
  completeDownload.title=tr('processi.output.downloadStoredHint');
  const nav = el('div', null, 'talos-process-output__controls'); nav.append(first, next, download, completeDownload);
  controls.append(label, refresh); root.append(summary, controls, status, range, pre, nav);
  let epoch = 0, pending = null, page = null, offset = 0, closed = false;
  const cancel = () => {epoch++; pending?.abort(); pending = null; root.removeAttribute('aria-busy');};
  function resetPage() {page = null; code.textContent = ''; range.textContent = ''; download.hidden = true; download.removeAttribute('href'); completeDownload.hidden=true;completeDownload.removeAttribute('href');first.disabled = next.disabled = true;}
  async function load(at = 0) {
    cancel(); resetPage(); if (closed || signal?.aborted || !root.open) return;
    offset = at;
    const version = epoch, controller = new AbortController(); pending = controller;
    root.setAttribute('aria-busy', 'true'); status.textContent = tr('processi.output.reading');
    try {
      const p = await client.leggi({stream: select.value, offset: at, signal: controller.signal});
      if (closed || version !== epoch || signal?.aborted) return;
      page = p;
      status.textContent = stateLabel(p.state, current.termination);
      /* ⛔ 02/10/2026, owner («parole comprensibili al posto della frase tecnica»): diceva «La separazione dei dati di controllo
         non è confermata». Vuol dire che il segno con cui TALOS riconosce la fine del comando (`controlFooter`,
         `process-output-access.mjs` `visibleEnd`) non è stato trovato e tolto: potrebbe stare in fondo all'output. Su un
         flusso vuoto non c'è niente da avvisare. */
      if (p.availableBytes > 0 && !['excluded', 'absent', 'not-applicable'].includes(p.footerStatus)) status.textContent += ` ${tr('processi.output.footerMarker')}`;
      const cifreDellaPagina = {disponibili: p.availableBytes.toLocaleString(localeNumeri()), conservati: p.storedBytes.toLocaleString(localeNumeri()), osservati: p.observedBytes.toLocaleString(localeNumeri())};
      range.textContent = p.bytes ? tr('processi.output.rangeWithBytes', {da: p.offset + 1, a: p.offset + p.bytes, ...cifreDellaPagina}) : tr('processi.output.rangeNoBytes', cifreDellaPagina);
      code.textContent = p.text === null ? tr('processi.output.pageBinary') : p.text || tr('processi.output.streamEmpty');
      first.disabled = p.offset === 0; next.disabled = p.nextOffset === null;
      if (p.bytes) download.href = client.rawUrl({stream: select.value, offset: p.offset, limit: p.bytes});
      download.hidden = p.bytes === 0;
      completeDownload.href=client.downloadUrl({stream:select.value});completeDownload.hidden=false;
    } catch (error) {
      if (closed || version !== epoch || signal?.aborted) return;
      status.textContent = error?.mostraAllaPersona === true ? error.message : tr('processi.output.readFailedPressRefresh');
    } finally {if (version === epoch) {pending = null; root.removeAttribute('aria-busy');}}
  }
  root.addEventListener('toggle', () => {if (root.open) void load(offset); else {cancel(); resetPage();}});
  select.addEventListener('change', () => {void load(0);});
  refresh.addEventListener('click', () => {void load(offset);});
  first.addEventListener('click', () => {void load(0);});
  next.addEventListener('click', () => {if (page?.nextOffset !== null && page?.nextOffset !== undefined) void load(page.nextOffset);});
  function dispose() {closed = true; cancel(); resetPage(); root.remove(); signal?.removeEventListener('abort', dispose);}
  signal?.addEventListener('abort', dispose, {once: true});
  if (signal?.aborted) dispose();
  resetPage();
  return {
    element: root,
    monta(detail) {if (!closed && detail?.parentNode && detail.nextSibling !== root) detail.after(root);},
    aggiorna(value) {const nextReceipt = normalizzaRicevutaOutput(value, current); if (!nextReceipt) return false; current = nextReceipt; if (!pending) status.textContent = stateLabel(current.state, current.termination); return true;},
    dispose,
  };
}
