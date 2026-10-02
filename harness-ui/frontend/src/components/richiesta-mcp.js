/*
 * ⛔ 02/10/2026 — LA SCHEDA DELLE RICHIESTE DEI SERVER MCP (elicitation). Owner: «faccio subito scheda e rotta».
 *
 * Un server MCP, durante la chiamata di un attrezzo, chiede alla persona dei DATI (un modulo, schema piatto di primitivi) o
 * di APRIRE UNA PAGINA (accesso, pagamento: i dati non passano da TALOS). Contratto: `src/mcp-elicitation-contract.mjs`.
 *
 * Stessa famiglia della card del consenso (`creaApprovazione`, conversazione.js): la richiesta arriva DENTRO la chiamata di
 * un attrezzo, come un consenso, e Hermes la manda proprio nel suo sistema dei consensi. Testata con l'etichetta e CHI chiede
 * (il server, in monospazio), la frase del server, il corpo, il piede con una primaria e due testuali, la riga d'esito.
 *
 * Ricerca (codice dei concorrenti, 02/10/2026):
 *  · Hermes `tools/mcp_tool_sampling.py:290-330` — il modulo passa dal consenso e «accetta» con un contenuto VUOTO: il
 *    modulo non si compila davvero; il modo url lo rifiuta sempre; tutto fallisce chiuso.
 *  · Codex `codex-rs/tui/src/bottom_pane/mcp_server_elicitation.rs` — il modulo si compila campo per campo, con «Deny»
 *    (rifiuta e continua) e «Cancel»; `app_link_view.rs:164-322` — per la pagina mostra l'indirizzo, «Open link», poi
 *    «I finished», e non la apre mai da solo.
 *  ⇒ +1 su Hermes: il modulo si compila davvero (il contratto lo valida). Come Codex: la pagina si apre SOLO col clic, e il
 *    dominio sta davanti a tutto, perché è la cosa da controllare prima di aprire.
 * ⛔ Il contenuto del modulo non resta a schermo dopo l'invio: va al server, non nella cronologia (contratto).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
let prossimoId = 0;

function el(documentObj, tag, className, testo) {
  const nodo = documentObj.createElement(tag);
  if (className) nodo.className = className;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

function simbolo(documentObj, classe, nome) {
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  const use = documentObj.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

/* Il tipo dell'`input` per un testo con formato (spec MCP: email, uri, date, date-time). */
const TIPO_PER_FORMATO = Object.freeze({ email: 'email', uri: 'url', date: 'date', 'date-time': 'datetime-local' });

function campoDelModulo(documentObj, nome, schema, obbligatorio) {
  const id = `talosMcpCampo${++prossimoId}`;
  const titolo = typeof schema.title === 'string' && schema.title.trim() ? schema.title.trim() : nome;
  const contenitore = el(documentObj, 'div', 'talos-mcp-campo talos-field--stack');
  contenitore.dataset.campo = nome;
  const aiuto = typeof schema.description === 'string' && schema.description.trim()
    ? el(documentObj, 'small', 'talos-mcp-campo__aiuto', schema.description.trim()) : null;
  if (aiuto) aiuto.id = `${id}-aiuto`;
  const intestazione = (tag = 'label') => {
    const etichetta = el(documentObj, tag, 'talos-mcp-campo__etichetta', titolo);
    if (obbligatorio) etichetta.append(el(documentObj, 'span', 'talos-mcp-campo__obbligatorio', ' · obbligatorio'));
    return etichetta;
  };
  const scelte = schema.type === 'array' ? schema.items?.enum : schema.type === 'string' ? schema.enum : null;
  if (Array.isArray(scelte)) {
    /* scelta singola (enum) o multipla (array di enum): le stesse righe delle domande del modello, `sheet-toggle-row` */
    const gruppo = el(documentObj, 'fieldset', 'talos-mcp-campo__scelte');
    gruppo.append(intestazione('legend'));
    if (aiuto) { gruppo.append(aiuto); gruppo.setAttribute('aria-describedby', aiuto.id); }
    const multi = schema.type === 'array';
    const predefiniti = multi ? (Array.isArray(schema.default) ? schema.default : []) : [schema.default];
    const nomi = Array.isArray(schema.enumNames) ? schema.enumNames : [];
    const caselle = scelte.map((valore, i) => {
      const riga = el(documentObj, 'label', 'sheet-toggle-row');
      const casella = el(documentObj, 'input');
      casella.type = multi ? 'checkbox' : 'radio';
      casella.name = id;
      casella.value = valore;
      casella.checked = predefiniti.includes(valore);
      riga.append(casella, el(documentObj, 'span', 'talos-mcp-campo__scelta', nomi[i] || valore));
      gruppo.append(riga);
      return casella;
    });
    contenitore.append(gruppo);
    const valore = () => (multi ? caselle.filter((c) => c.checked).map((c) => c.value) : caselle.find((c) => c.checked)?.value);
    return { nome, titolo, schema, obbligatorio, contenitore, valore, vuoto: () => (multi ? valore().length === 0 : valore() === undefined), fuoco: () => caselle[0]?.focus() };
  }
  if (schema.type === 'boolean') {
    const riga = el(documentObj, 'label', 'talos-mcp-campo__interruttore');
    const casella = el(documentObj, 'input', 'talos-switch');
    casella.type = 'checkbox';
    casella.setAttribute('role', 'switch');
    casella.id = id;
    casella.checked = schema.default === true;
    if (aiuto) casella.setAttribute('aria-describedby', aiuto.id);
    riga.append(casella, intestazione('span'));
    contenitore.append(riga);
    if (aiuto) contenitore.append(aiuto);
    return { nome, titolo, schema, obbligatorio, contenitore, valore: () => casella.checked, vuoto: () => false, fuoco: () => casella.focus() };
  }
  /* testo e numeri: un campo del sistema di design */
  const etichetta = intestazione('label');
  etichetta.htmlFor = id;
  const input = el(documentObj, 'input', 'talos-field__input');
  input.id = id;
  input.name = nome;
  if (schema.type === 'number' || schema.type === 'integer') {
    input.type = 'number';
    input.step = schema.type === 'integer' ? '1' : 'any';
    if (typeof schema.minimum === 'number') input.min = String(schema.minimum);
    if (typeof schema.maximum === 'number') input.max = String(schema.maximum);
    if (typeof schema.default === 'number') input.value = String(schema.default);
  } else {
    input.type = TIPO_PER_FORMATO[schema.format] || 'text';
    if (Number.isSafeInteger(schema.maxLength)) input.maxLength = schema.maxLength;
    if (typeof schema.default === 'string') input.value = schema.default;
  }
  if (obbligatorio) input.required = true;
  if (aiuto) input.setAttribute('aria-describedby', aiuto.id);
  const campo = el(documentObj, 'div', 'talos-field');
  campo.append(input);
  contenitore.append(etichetta, campo);
  if (aiuto) contenitore.append(aiuto);
  const valore = () => {
    const grezzo = input.value;
    if (schema.type === 'number' || schema.type === 'integer') return grezzo.trim() === '' ? undefined : Number(grezzo);
    return grezzo === '' ? undefined : grezzo;
  };
  return { nome, titolo, schema, obbligatorio, contenitore, valore, vuoto: () => valore() === undefined, fuoco: () => input.focus() };
}

/** Il primo errore del modulo detto con il nome che la persona vede, o null. Il server rivalida comunque (contratto). */
export function erroreDelModulo(campi) {
  for (const c of campi) {
    if (c.vuoto()) { if (c.obbligatorio) return { campo: c, testo: `Compila «${c.titolo}».` }; continue; }
    const v = c.valore();
    const s = c.schema;
    if (s.type === 'number' || s.type === 'integer') {
      if (!Number.isFinite(v)) return { campo: c, testo: `«${c.titolo}» deve essere un numero.` };
      if (s.type === 'integer' && !Number.isInteger(v)) return { campo: c, testo: `«${c.titolo}» deve essere un numero intero.` };
      if (typeof s.minimum === 'number' && v < s.minimum) return { campo: c, testo: `«${c.titolo}» deve essere almeno ${s.minimum}.` };
      if (typeof s.maximum === 'number' && v > s.maximum) return { campo: c, testo: `«${c.titolo}» deve essere al massimo ${s.maximum}.` };
    } else if (s.type === 'string' && !Array.isArray(s.enum)) {
      if (Number.isSafeInteger(s.minLength) && v.length < s.minLength) return { campo: c, testo: `«${c.titolo}» deve avere almeno ${s.minLength} caratteri.` };
    } else if (s.type === 'array') {
      if (Number.isSafeInteger(s.minItems) && v.length < s.minItems) return { campo: c, testo: `Scegli almeno ${s.minItems} voci in «${c.titolo}».` };
      if (Number.isSafeInteger(s.maxItems) && v.length > s.maxItems) return { campo: c, testo: `Scegli al massimo ${s.maxItems} voci in «${c.titolo}».` };
    }
  }
  return null;
}

/**
 * La scheda di una richiesta di un server MCP, dall'evento `McpElicitationRequested`.
 * @param {object} richiesta { server, mode: 'form'|'url', message, requestedSchema? , url?, dominio? }
 * @param {object} azioni { onInvia(content), onRifiuta(), onAnnulla(), onApri(url), onFatto() }
 */
export function creaRichiestaMcp(richiesta = {}, azioni = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const pagina = richiesta.mode === 'url';
  const scheda = el(documentObj, 'div', 'talos-approval talos-mcp-richiesta');
  scheda.setAttribute('data-c', 'McpRequestCard');
  scheda.dataset.modo = pagina ? 'url' : 'form';
  const testa = el(documentObj, 'div', 'talos-approval__head');
  const etichetta = el(documentObj, 'span', 'talos-badge talos-badge--accent');
  etichetta.append(simbolo(documentObj, 'i i--sm', pagina ? 'i-link' : 'i-edit'), documentObj.createTextNode(pagina ? 'Chiede di aprire una pagina' : 'Chiede dei dati'));
  const server = typeof richiesta.server === 'string' && richiesta.server ? richiesta.server : 'mcp';
  const chi = el(documentObj, 'span', 'talos-mono talos-measure talos-grow talos-truncate', `server MCP ${server}`);
  chi.title = `Lo chiede il server MCP «${server}», non TALOS`;
  testa.append(etichetta, chi);
  scheda.append(testa, el(documentObj, 'p', 'talos-approval__why assistant-copy', richiesta.message || ''));

  const corpo = el(documentObj, 'div', pagina ? 'talos-mcp-pagina' : 'talos-mcp-modulo');
  corpo.dataset.corpo = '';
  /* ⛔ 02/10/2026 sera, dalle foto del 4174: l'errore stava fra il modulo e il piede, a 17 px e col colore del testo, e
     restava a schermo anche dopo che la persona aveva compilato il campo. Ora sta in fondo al modulo, col tono d'errore, e
     sparisce appena si tocca un campo: Codex `tui/src/bottom_pane/mcp_server_elicitation.rs:1636-1642` lo azzera quando
     la bozza cambia; Baymard e NN/g (ricerca del 02/10/2026): l'errore va via appena la correzione c'è. */
  const errore = el(documentObj, 'p', 'talos-mcp-richiesta__errore');
  errore.setAttribute('role', 'alert');
  errore.hidden = true;
  /* `input` basta per tutti: testo, numeri, caselle, pallini e interruttori lo emettono (HTML, «input» prima di «change») */
  corpo.addEventListener('input', () => { if (!errore.hidden) mostraErrore(''); });
  const piede = el(documentObj, 'div', 'talos-approval__foot sheet-actions');
  const bottone = (classi, testo) => { const b = el(documentObj, 'button', classi, testo); b.type = 'button'; return b; };
  const rifiuta = bottone('talos-button talos-button--ghost talos-button--danger', 'Rifiuta');
  const annulla = bottone('talos-button talos-button--ghost', 'Annulla');
  const pulsanti = { rifiuta, annulla };
  let campi = [];

  if (pagina) {
    /* il dominio davanti a tutto: è ciò che si controlla prima di aprire */
    corpo.append(el(documentObj, 'p', 'talos-mcp-pagina__dominio', richiesta.dominio || ''));
    const indirizzo = el(documentObj, 'pre', 'talos-approval__codice talos-mcp-pagina__indirizzo', richiesta.url || '');
    indirizzo.tabIndex = 0;
    indirizzo.setAttribute('aria-label', 'L’indirizzo completo della pagina');
    corpo.append(indirizzo, el(documentObj, 'p', 'talos-approval__motivo', 'Si apre nel tuo browser solo se lo chiedi tu. Quando hai finito sulla pagina, torna qui.'));
    const apri = bottone('talos-button talos-button--primary talos-button--md', 'Apri la pagina');
    const fatto = bottone('talos-button talos-button--primary talos-button--md', 'Ho finito');
    fatto.hidden = true;
    apri.addEventListener('click', () => {
      if (typeof azioni.onApri === 'function') azioni.onApri(richiesta.url);
      apri.hidden = true;
      fatto.hidden = false;
      fatto.focus?.();
    });
    fatto.addEventListener('click', () => { if (typeof azioni.onFatto === 'function') azioni.onFatto(); });
    pulsanti.apri = apri;
    pulsanti.fatto = fatto;
    piede.append(apri, fatto, rifiuta, annulla);
  } else {
    const schema = richiesta.requestedSchema || {};
    const richiesti = new Set(Array.isArray(schema.required) ? schema.required : []);
    campi = Object.entries(schema.properties || {}).map(([nome, s]) => campoDelModulo(documentObj, nome, s || {}, richiesti.has(nome)));
    for (const c of campi) corpo.append(c.contenitore);
    if (!campi.length) corpo.append(el(documentObj, 'p', 'talos-approval__motivo', 'Il server non chiede nessun campo: basta confermare.'));
    const invia = bottone('talos-button talos-button--primary talos-button--md', 'Invia');
    invia.addEventListener('click', () => {
      const sbaglio = erroreDelModulo(campi);
      if (sbaglio) { mostraErrore(sbaglio.testo); sbaglio.campo.fuoco(); return; }
      mostraErrore('');
      if (typeof azioni.onInvia === 'function') azioni.onInvia(valoriDelModulo());
    });
    pulsanti.invia = invia;
    piede.append(invia, rifiuta, annulla);
  }
  rifiuta.addEventListener('click', () => { if (typeof azioni.onRifiuta === 'function') azioni.onRifiuta(); });
  annulla.addEventListener('click', () => { if (typeof azioni.onAnnulla === 'function') azioni.onAnnulla(); });
  piede.append(el(documentObj, 'span', 'talos-grow'), el(documentObj, 'span', 'talos-approval__foot-note', 'Rispondi al server, non a TALOS'));
  corpo.append(errore);
  scheda.append(corpo, piede);

  function valoriDelModulo() {
    const contenuto = {};
    for (const c of campi) { if (!c.vuoto()) contenuto[c.nome] = c.valore(); }
    return contenuto;
  }
  function mostraErrore(testo) { errore.textContent = testo || ''; errore.hidden = !testo; }
  function inAttesa(si) { for (const b of [pulsanti.invia, pulsanti.apri, pulsanti.fatto, rifiuta, annulla]) if (b) b.disabled = Boolean(si); }
  return { scheda, pulsanti, campi, valori: valoriDelModulo, mostraErrore, inAttesa };
}

/**
 * L'esito: toglie corpo e piede (il contenuto del modulo non resta a schermo) e mette una riga sua, col tono giusto.
 * @param {{action:'accept'|'decline'|'cancel', modo?:'form'|'url', altrove?:boolean, motivo?:string|null}} esito
 */
export function segnaEsitoRichiestaMcp(scheda, { action, modo = 'form', altrove = false, motivo = null } = {}, opzioni = {}) {
  if (!scheda) return null;
  const documentObj = opzioni.document || scheda.ownerDocument || globalThis.document;
  for (const parte of [...scheda.querySelectorAll('[data-corpo], .talos-approval__foot, .sheet-actions, .talos-mcp-richiesta__errore, .talos-approval__esito')]) parte.remove();
  const testo = action === 'accept' ? (modo === 'url' ? 'Fatto sulla pagina' : 'Inviato al server')
    : action === 'decline' ? 'Rifiutato'
      : motivo === 'fermato' ? 'Annullato: la sessione si è fermata'
        : motivo === 'reindirizzamento' ? 'Annullato: il giro è stato reindirizzato'
          : motivo === 'non-in-attesa' ? 'Il server non aspetta più una risposta'
            : 'Annullato';
  const tono = action === 'accept' ? 'si' : action === 'decline' ? 'no' : 'neutro';
  const riga = el(documentObj, 'p', `talos-approval__esito talos-approval__esito--${tono}`, `${testo}${altrove ? ' da un’altra finestra' : ''}`);
  riga.setAttribute('role', 'status');
  scheda.append(riga);
  scheda.dataset.esito = action;
  return riga;
}
