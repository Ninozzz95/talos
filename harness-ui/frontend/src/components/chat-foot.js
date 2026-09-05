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
export function aggiornaPiedeChat(piede, dati = {}) {
  if (!piede) return;
  const documentObj = piede.ownerDocument;
  // striscia di stato
  const striscia = piede.querySelector('.talos-status-strip');
  if (striscia) {
    striscia.hidden = !dati.attivo;
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
  const permesso = piede.querySelector('[data-open-sheet="permissions"]');
  if (permesso) {
    const label = permesso.querySelector('.talos-chip__label');
    if (label) label.textContent = etichettaPermesso(dati.permesso);
    permesso.classList.remove('talos-badge--warning', 'talos-badge--danger');
    const tono = tonoPermesso(dati.permesso);
    if (tono) permesso.classList.add(`talos-badge--${tono}`);
  }
  // giri e costo
  const u = testiUsage(dati.usage, { tettoGiri: dati.tettoGiri });
  const giriChip = piede.querySelector('[data-runtime-giri]');
  if (giriChip) {
    giriChip.hidden = u.giri === null;
    const n = giriChip.querySelector('.talos-mono');
    if (n && u.giri !== null) n.textContent = String(u.giri);
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
