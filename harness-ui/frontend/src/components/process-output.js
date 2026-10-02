const PAGE_BYTES = 4096;
const states = new Set(['recording', 'complete', 'limited', 'failed', 'interrupted']);
const id = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const invalid = () => {throw new Error('La risposta dell’output non è valida. Riprova la lettura.');};

/** Only a typed backend receipt can offer access; never parse references from model text. */
export function normalizzaRicevutaOutput(value, expected = {}) {
  if (!value || value.schema !== 'talos.process-output.v1' || !states.has(value.state)
      || !['sessionId', 'runId', 'toolCallId'].every(k => id(value[k]))
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value.outputId)
      || ['sessionId', 'runId', 'toolCallId', 'outputId'].some(k => expected[k] !== undefined && value[k] !== expected[k])) return null;
  return Object.freeze(Object.fromEntries(['schema', 'sessionId', 'runId', 'toolCallId', 'outputId', 'state'].map(k => [k, value[k]])));
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
      if (!response.ok) throw new Error(response.status === 404 ? 'Questo output non è più disponibile.' : 'Lettura non riuscita. Puoi riprovare senza eseguire di nuovo il comando.');
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

const stateLabel = {
  recording: 'Registrazione non ancora conclusa. Aggiorna per verificare i dati disponibili.',
  complete: 'Registrazione conclusa.',
  limited: 'Limite di conservazione raggiunto: una parte dell’output non è stata conservata.',
  failed: 'Registrazione incompleta: i dati disponibili potrebbero non contenere tutto l’output.',
  interrupted: 'Registrazione interrotta: i dati disponibili potrebbero non contenere tutto l’output.',
};

/** One retained page per reader. Session disposal and disclosure closure invalidate late responses. */
export function creaLettoreOutput({receipt, API, fetchFn, signal, document: doc = globalThis.document} = {}) {
  let current = normalizzaRicevutaOutput(receipt);
  if (!current) invalid();
  const client = creaClientOutput({receipt: current, API, fetchFn});
  const el = (tag, text, className) => {const n = doc.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n;};
  const root = el('details', null, 'talos-process-output');
  const summary = el('summary', 'Consulta output conservato');
  const controls = el('div', null, 'talos-process-output__controls');
  const label = el('label', 'Flusso '), select = el('select');
  select.setAttribute('aria-label', 'Flusso dell’output');
  for (const [value, text] of [['stdout', 'Uscita'], ['stderr', 'Diagnostica']]) {const option = el('option', text); option.value = value; select.append(option);}
  label.append(select);
  const button = text => {const n = el('button', text, 'talos-button talos-button--secondary'); n.type = 'button'; return n;};
  const refresh = button('Aggiorna'), first = button('Prima pagina'), next = button('Pagina successiva');
  const status = el('p', stateLabel[current.state], 'talos-process-output__status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const range = el('p', '', 'talos-process-output__range');
  const pre = el('pre'), code = el('code'); pre.append(code); pre.tabIndex = 0; pre.setAttribute('aria-label', 'Contenuto della pagina di output');
  const download = el('a', 'Scarica questa pagina', 'talos-button talos-button--secondary');
  download.setAttribute('download', ''); download.hidden = true;
  const completeDownload = el('a', 'Scarica output conservato', 'talos-button talos-button--secondary');
  completeDownload.setAttribute('download',''); completeDownload.hidden=true;
  completeDownload.title='Salva i byte conservati di questo flusso al momento dello scaricamento.';
  const nav = el('div', null, 'talos-process-output__controls'); nav.append(first, next, download, completeDownload);
  controls.append(label, refresh); root.append(summary, controls, status, range, pre, nav);
  let epoch = 0, pending = null, page = null, offset = 0, closed = false;
  const cancel = () => {epoch++; pending?.abort(); pending = null; root.removeAttribute('aria-busy');};
  function resetPage() {page = null; code.textContent = ''; range.textContent = ''; download.hidden = true; download.removeAttribute('href'); completeDownload.hidden=true;completeDownload.removeAttribute('href');first.disabled = next.disabled = true;}
  async function load(at = 0) {
    cancel(); resetPage(); if (closed || signal?.aborted || !root.open) return;
    offset = at;
    const version = epoch, controller = new AbortController(); pending = controller;
    root.setAttribute('aria-busy', 'true'); status.textContent = 'Lettura in corso…';
    try {
      const p = await client.leggi({stream: select.value, offset: at, signal: controller.signal});
      if (closed || version !== epoch || signal?.aborted) return;
      page = p;
      status.textContent = stateLabel[p.state];
      /* ⛔ 02/10/2026, owner («parole comprensibili al posto della frase tecnica»): diceva «La separazione dei dati di controllo
         non è confermata». Vuol dire che il segno con cui TALOS riconosce la fine del comando (`controlFooter`,
         `process-output-access.mjs` `visibleEnd`) non è stato trovato e tolto: potrebbe stare in fondo all'output. Su un
         flusso vuoto non c'è niente da avvisare. */
      if (p.availableBytes > 0 && !['excluded', 'absent', 'not-applicable'].includes(p.footerStatus)) status.textContent += ' In fondo potrebbe esserci un segno interno di TALOS, che non fa parte dell’output del comando.';
      range.textContent = `${p.bytes ? `Byte ${p.offset + 1}–${p.offset + p.bytes}` : 'Nessun byte in questa pagina'} su ${p.availableBytes.toLocaleString('it-IT')} disponibili. Conservati ${p.storedBytes.toLocaleString('it-IT')} di ${p.observedBytes.toLocaleString('it-IT')} byte ricevuti nel flusso.`;
      code.textContent = p.text === null ? 'Questa pagina contiene dati binari o testo non UTF-8. Scarica i byte originali per conservarli senza conversioni.' : p.text || 'Il flusso non contiene testo.';
      first.disabled = p.offset === 0; next.disabled = p.nextOffset === null;
      if (p.bytes) download.href = client.rawUrl({stream: select.value, offset: p.offset, limit: p.bytes});
      download.hidden = p.bytes === 0;
      completeDownload.href=client.downloadUrl({stream:select.value});completeDownload.hidden=false;
    } catch (error) {
      if (closed || version !== epoch || signal?.aborted) return;
      status.textContent = error?.message?.startsWith('La risposta dell’output') || error?.message?.startsWith('Questo output non') ? error.message : 'Lettura non riuscita. Premi Aggiorna per riprovare senza eseguire di nuovo il comando.';
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
    aggiorna(value) {const nextReceipt = normalizzaRicevutaOutput(value, current); if (!nextReceipt) return false; current = nextReceipt; if (!pending) status.textContent = stateLabel[current.state]; return true;},
    dispose,
  };
}
