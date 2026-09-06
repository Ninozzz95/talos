/*
 * ChatFooter — il piede della chat, come nel mockup: la striscia di stato del
 * giro in corso, la coda, il composer con i suoi chip, la barra di stato.
 *
 * Sesto componente della Fase 2. Il markup resta quello del template (il
 * monolite lo trova per id e data-*: #composerForm, #composerInput,
 * #composerResizeHandle, #capabilityBtn, #redirectRunButton, [data-open-sheet],
 * [data-runtime-*], .stop-run): questo modulo lo AGGIORNA dai dati.
 *
 * ⛔ Regola dell'owner (05/09): niente sotto l'originale. Il composer originale
 * ha: maniglia di ridimensionamento con misura ricordata
 * (`talos-harness-composer-size-v1`), microfono, «aggiungi contesto», chip del
 * modello, chip del permesso, chip dell'ambiente (qui vive nella colonna dei
 * dettagli), «Reindirizza» mentre un giro corre, invio/stop, barra con token ·
 * giri · cache · velocità. Tutto è nel mockup esteso; qui i testi sono DATI:
 * il giro corrente, l'uso, il permesso con il suo nome umano, il tema.
 *
 * Ricerca 05/09/2026: la maniglia di ridimensionamento con misura ricordata in
 * localStorage e tastiera (frecce) è il pattern del componente «resize handle»
 * fra fratelli flex (glama.ai backlog-mcp viewer/components/resize-handle.ts);
 * il `<textarea>` nativo conserva `resize` (MDN textarea) ma qui la maniglia è
 * unica e a doppio verso, come nell'originale (`setupComposerResize`).
 */

/** Il nome umano dei permessi (H22: mai il nome tecnico a schermo). */
export const NOME_PERMESSO = Object.freeze({
  'Read only': 'Sola lettura',
  'On request': 'Su richiesta',
  'Workspace write': 'Scrittura nel workspace',
  'Full access': 'Accesso completo',
});

export function etichettaPermesso(permesso) {
  return NOME_PERMESSO[permesso] || (typeof permesso === 'string' && permesso.trim() ? permesso : 'Permesso non scelto');
}

/*
 * ⛔ 06/9, misurato dal vivo (prova T04, sessione 84866d85): una sessione creata scegliendo
 * «Accesso completo» è partita con `scrivi:'chiedi'` e `shell:'chiedi'` addosso — due cancelli
 * chiusi in una prova PRECEDENTE, che il server ricorda e riapplica a ogni sessione nuova. La
 * pillola diceva solo «Accesso completo»: chi guardava non aveva nessun modo di saperlo, e ha
 * visto arrivare richieste di approvazione che il permesso scelto non prometteva.
 * Decisione B11 («pillola del permesso col colore del rischio»): la pillola dice lo stato VERO,
 * eccezioni comprese. Funzione pura, così la si prova senza DOM.
 */
export function etichettaPermessoConEccezioni(permesso, permessiPerAttrezzo) {
  const base = etichettaPermesso(permesso);
  const regole = permessiPerAttrezzo && typeof permessiPerAttrezzo === 'object' ? Object.values(permessiPerAttrezzo).filter(Boolean) : [];
  if (regole.length === 0) return base;
  return `${base} · ${regole.length} eccezion${regole.length === 1 ? 'e' : 'i'}`;
}

/*
 * ⛔ 06/9, owner con lo screenshot: a schermo compariva
 * `local:bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf`,
 * su due righe, sia nell'intestazione del messaggio sia nella pillola del composer. La decisione H22
 * vieta gli identificatori grezzi a schermo, ma per i modelli locali non esisteva nessuna traduzione:
 * si stampava la chiave del runtime.
 * Il nome di un GGUF non è un nome: è una targa. La convenzione di llama.cpp (letta 06/09/2026 —
 * blog.starmorph.com «LLM model names decoded», kuware.com «Demystifying GGUF file names») mette in
 * fila autore, famiglia, parametri totali, parametri ATTIVI per i MoE (`A3B` = 3B attivi) e la
 * quantizzazione (`Q4_0`, `Q4_K_M`: 4 bit, K = super-blocchi, M = variante media). Qui se ne ricava
 * una riga leggibile; l'identificatore intero resta nel suggerimento del puntatore, mai perso.
 */
export function nomeModelloUmano(id) {
  if (typeof id !== 'string' || !id.trim()) return '';
  const grezzo = id.trim();
  if (!/^local:/i.test(grezzo)) return grezzo.replace(/^~/u, '').split('/').pop();
  let resto = grezzo.replace(/^local:/i, '').replace(/[-_.]gguf$/i, '');
  const quant = /[-_](IQ\d\w*|Q\d(?:[-_]\d)?(?:[-_][A-Z]+)*)(?=[-_]|$)/i.exec(resto);
  const parametri = /(?:^|[-_])(\d+(?:[.,]\d+)?B)(?:[-_]A(\d+(?:[.,]\d+)?B))?(?=[-_]|$)/i.exec(resto);
  let nome = resto;
  if (parametri) nome = resto.slice(0, parametri.index);
  nome = nome.replace(/[-_](GGUF|MLX|AWQ|GPTQ)$/i, '');
  const pezzi = nome.split(/[-_]/).filter(Boolean);
  if (pezzi.length > 1) pezzi.shift(); // il primo segmento è chi ha pubblicato il file, non il modello
  // un secondo prefisso di fabbrica (nvidia_Nemotron…) sparisce solo se si ripete dentro al nome
  const pulito = pezzi.join(' ').replace(/\s+/g, ' ').trim();
  const parti = [pulito || resto];
  if (parametri) parti.push(parametri[2] ? `${parametri[1]} (${parametri[2].replace(/^A/i, '')} attivi)` : parametri[1]);
  if (quant) parti.push(quant[1].toUpperCase().replace(/-/g, '_'));
  return parti.filter(Boolean).join(' · ');
}

/** Il tono del chip del permesso: attenzione quando scrive o ha tutto. */
export function tonoPermesso(permesso) {
  if (permesso === 'Full access') return 'danger';
  if (permesso === 'Workspace write') return 'warning';
  return null;
}

/** Migliaia con la virgola italiana e una cifra decimale, come nel mockup («41,2k»). */
export function kilo(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(Math.round(v));
  return `${(v / 1000).toFixed(1).replace('.', ',')}k`;
}

/**
 * I testi dell'uso dai campi veri di `usage` (StateDelta /usage):
 * prompt_tokens, completion_tokens, cached_tokens, giri, tokens_per_second.
 * Ciò che manca non si scrive.
 */
export function testiUsage(usage, { tettoGiri = null } = {}) {
  if (!usage || typeof usage !== 'object') return { tokenGiri: '', cache: '', giri: null, velocita: '' };
  const prompt = Number(usage.prompt_tokens ?? 0) || 0;
  const completion = Number(usage.completion_tokens ?? 0) || 0;
  const cache = Number(usage.cached_tokens ?? 0) || 0;
  const giri = Number.isFinite(Number(usage.giri)) ? Number(usage.giri) : null;
  const totale = prompt + completion;
  const parti = [];
  if (totale > 0) parti.push(`${kilo(totale)} token`);
  if (giri !== null) parti.push(`${giri} gir${giri === 1 ? 'o' : 'i'}${Number.isFinite(tettoGiri) && tettoGiri > 0 ? ` su ${tettoGiri}` : ''}`);
  const throughput = Number(usage.tokens_per_second ?? usage.tokensPerSecond);
  return {
    tokenGiri: parti.join(' · '),
    cache: cache > 0 && prompt > 0 ? `cache ${Math.round((cache / prompt) * 100)}%` : '',
    giri,
    velocita: Number.isFinite(throughput) && throughput > 0 ? `${Math.round(throughput)} token/s` : '',
  };
}

/** «1,4 s» o «850 ms» dal tempo al primo token. */
export function testoLatenza(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return ms >= 1000 ? `primo token ${(ms / 1000).toFixed(1).replace('.', ',')} s` : `primo token ${Math.round(ms)} ms`;
}

function scrivi(el, testo) {
  if (!el) return;
  const t = testo || '';
  if (el.textContent !== t) el.textContent = t;
  el.hidden = t === '';
}

/**
 * Aggiorna il piede dai dati.
 * @param {Element} piede il `.talos-chat-foot`
 * @param {object} dati
 * @param {boolean} [dati.attivo] un giro corre
 * @param {string} [dati.cosa] cosa sta facendo TALOS («Comando nel terminale»)
 * @param {string} [dati.dettaglio] il dettaglio mono (il comando, il file)
 * @param {number|null} [dati.giro] il giro corrente
 * @param {number|null} [dati.secondi] secondi dall'inizio del giro
 * @param {object|null} [dati.usage]
 * @param {number|null} [dati.tettoGiri]
 * @param {number|null} [dati.latenzaMs] tempo al primo token
 * @param {string|null} [dati.costo] «$0,08» già formattato, o null (non si stima da soli)
 * @param {string} [dati.modello]
 * @param {string} [dati.permesso] il valore interno (Read only…)
 * @param {string} [dati.tema] «Tema Calm · locale»
 */
/**
 * Quando si mostra la pillola dei giri, e con che tono (decisione B12, 06/09).
 * @returns {'quieto'|'vicino'|null} null = non si mostra
 */
export function statoGiri(giri, tettoGiri) {
  if (!Number.isFinite(Number(giri))) return null;
  const n = Number(giri);
  const tetto = Number(tettoGiri);
  if (!Number.isFinite(tetto) || tetto <= 0) return n > 0 ? 'quieto' : null; // senza tetto dichiarato non c'è una percentuale: si mostra e basta
  const quota = n / tetto;
  if (quota < 0.5) return null;
  return quota >= 0.8 ? 'vicino' : 'quieto';
}

export function aggiornaPiedeChat(piede, dati = {}) {
  if (!piede) return;
  const documentObj = piede.ownerDocument;
  // striscia di stato
  const striscia = piede.querySelector('.talos-status-strip');
  if (striscia) {
    /*
     * ⛔ 06/9, owner: «la barra sopra il composer e' ridondante: deve apparire quando si scrolla in alto e
     * non si vede il fondo, come recap; quando si scrolla in basso non ha motivo di esserci». Giusto: in
     * fondo alla conversazione la stessa cosa e' gia' scritta due volte (la bolla che scrive e la striscia).
     * `inFondo` arriva da chi disegna: quando il fondo e' in vista la striscia tace.
     * Ricerca 06/09/2026: shadcn/ui «Message scroller» e TanStack Virtual «Chat» — un solo indicatore per
     * stato, legato a `isAtEnd()`, invece di un doppione sempre acceso.
     */
    striscia.hidden = !dati.attivo || dati.inFondo === true;
    const cosa = striscia.querySelector('[data-run-what]');
    if (cosa) {
      cosa.replaceChildren();
      cosa.append(documentObj.createTextNode(dati.cosa || 'TALOS sta lavorando'));
      if (dati.dettaglio) {
        cosa.append(documentObj.createTextNode(' · '));
        const mono = documentObj.createElement('span');
        mono.className = 'talos-mono talos-measure';
        mono.textContent = dati.dettaglio;
        cosa.append(mono);
      }
    }
    const meta = striscia.querySelector('[data-run-meta]');
    const pezzi = [];
    if (Number.isFinite(dati.giro)) pezzi.push(`giro ${dati.giro}`);
    if (Number.isFinite(dati.secondi)) pezzi.push(`${Math.max(0, Math.round(dati.secondi))} s`);
    scrivi(meta, pezzi.join(' · '));
  }
  // chip del modello e del permesso
  const modello = piede.querySelector('[data-open-sheet="model"] .talos-chip__label');
  if (modello) modello.textContent = dati.modello || 'Scegli il modello';
  // l'identificatore intero resta raggiungibile: a schermo il nome, nel suggerimento la targa
  const pillolaModello = piede.querySelector('[data-open-sheet="model"]');
  if (pillolaModello) pillolaModello.title = dati.modelloId ? `Cambia modello · ${dati.modelloId}` : 'Cambia modello';
  const permesso = piede.querySelector('[data-open-sheet="permissions"]');
  if (permesso) {
    const label = permesso.querySelector('.talos-chip__label');
    if (label) label.textContent = etichettaPermessoConEccezioni(dati.permesso, dati.permessiPerAttrezzo);
    const regole = dati.permessiPerAttrezzo && typeof dati.permessiPerAttrezzo === 'object' ? Object.entries(dati.permessiPerAttrezzo).filter(([, v]) => v) : [];
    permesso.title = regole.length
      ? `Cambia il permesso · eccezioni per attrezzo: ${regole.map(([k, v]) => `${k} → ${v}`).join(', ')}`
      : 'Cambia il permesso';
    permesso.classList.remove('talos-badge--warning', 'talos-badge--danger');
    const tono = tonoPermesso(dati.permesso);
    if (tono) permesso.classList.add(`talos-badge--${tono}`);
  }
  // giri e costo
  const u = testiUsage(dati.usage, { tettoGiri: dati.tettoGiri });
  const giriChip = piede.querySelector('[data-runtime-giri]');
  if (giriChip) {
    /*
     * ⛔ 06/9 — decisione B12: il contatore dei giri «compare dal 50% del tetto, in grigio, e si
     * accende avvicinandosi». Prima compariva sempre: con 9 giri su 24 (il 37%) diceva un numero
     * che non chiedeva niente a nessuno. Sotto la soglia si tace; da lì in su è quieto fino
     * all'80%, poi diventa un avviso.
     */
    const stato = statoGiri(u.giri, dati.tettoGiri);
    giriChip.hidden = stato === null;
    giriChip.classList.toggle('talos-badge--warning', stato === 'vicino');
    const n = giriChip.querySelector('.talos-mono');
    if (n && u.giri !== null) n.textContent = Number.isFinite(Number(dati.tettoGiri)) && Number(dati.tettoGiri) > 0 ? `${u.giri}/${dati.tettoGiri}` : String(u.giri);
  }
  const costoChip = piede.querySelector('[data-runtime-costo]');
  if (costoChip) {
    costoChip.hidden = !dati.costo;
    const n = costoChip.querySelector('.talos-mono');
    if (n && dati.costo) n.textContent = dati.costo;
  }
  // barra di stato
  scrivi(piede.querySelector('[data-statusbar="tema"]'), dati.tema);
  scrivi(piede.querySelector('[data-runtime-usage]'), u.tokenGiri);
  scrivi(piede.querySelector('[data-runtime-cache]'), u.cache);
  scrivi(piede.querySelector('[data-runtime-latenza]'), testoLatenza(dati.latenzaMs) || u.velocita);
}
