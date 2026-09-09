/*
 * Dialoghi ridimensionabili e RICORDATI — la regia del mockup (`[data-dialog-resize]`)
 * portata nella app. 06/09, B7; owner 05/09: «le modali
 * devono essere ridimensionate e ricordate».
 *
 * Ogni velo del mockup ha tre maniglie (larghezza · altezza · entrambe). Trascinare le
 * muove; con il fuoco sulla maniglia le frecce cambiano di 16 px alla volta; doppio clic
 * torna alla misura normale. La misura si salva per dialogo nella stessa chiave del
 * monolite (`talos-harness-modal-sizes-v1`, contratto congelato fino al cutover) con le
 * chiavi logiche del mockup (`sheet:model`, `dialog:introDialog`, …), così una misura
 * ricordata prima del ridisegno vale ancora.
 *
 * Ricerca 06/09/2026: le maniglie di ridimensionamento non hanno un ruolo ARIA dedicato
 * (w3c/aria#1443); la forma praticabile è un controllo focalizzabile guidato dalle frecce,
 * come un cursore (UXPin «Keyboard navigation patterns for complex widgets» 2026, Salesforce
 * «4 patterns for accessible drag and drop»). Qui: `<button>` con `aria-label`, frecce, e
 * il doppio clic come azzeramento.
 */

export const CHIAVE_MISURE = 'talos-harness-modal-sizes-v1';
export const PASSO_TASTIERA = 16;
export const CHIAVI_MISURA = Object.freeze({
  veloContesto: 'sheet:context',
  veloScorciatoie: 'sheet:shortcuts', veloNuova: 'sheet:new-session', veloComandi: 'command:palette', veloModello: 'sheet:model', veloPermessi: 'sheet:permissions',
  veloAlbero: 'sheet:sessionTree', veloIntro: 'dialog:introDialog', veloAmbiente: 'sheet:environment', veloRinomina: 'sheet:rename',
  veloRiferimenti: 'sheet:references', veloFile: 'sheet:fileViewer', veloRinominaFile: 'sheet:renameFile', veloEliminaFile: 'sheet:deleteFile',
  veloEliminaSessione: 'sheet:deleteSession', veloCreaFile: 'sheet:createFile', veloEsporta: 'sheet:export', veloFermaGiro: 'dialog:stopRun',
});

/** Il minimo dipende dal velo (la palette è più stretta), il massimo dalla finestra meno il bordo del velo. */
export function limitiDialogo(idVelo, { innerWidth, innerHeight, pad = 24 }) {
  const maxW = Math.max(280, innerWidth - pad * 2);
  const maxH = Math.max(240, Math.min(innerHeight - pad * 2, innerHeight * 0.9));
  return { minW: Math.min(idVelo === 'veloComandi' ? 420 : 520, maxW), minH: Math.min(idVelo === 'veloComandi' ? 240 : 340, maxH), maxW, maxH };
}
export function misuraDialogo(width, height, limiti) {
  const w = Math.round(Math.max(limiti.minW, Math.min(limiti.maxW, Number(width) || limiti.minW)));
  const h = Math.round(Math.max(limiti.minH, Math.min(limiti.maxH, Number(height) || limiti.minH)));
  return { width: w, height: h };
}

export function leggiMisure(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage.getItem(CHIAVE_MISURE) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
export function salvaMisura(chiave, misura, storage = globalThis.localStorage) {
  try { const s = leggiMisure(storage); s[chiave] = { width: Math.round(misura.width), height: Math.round(misura.height) }; storage.setItem(CHIAVE_MISURE, JSON.stringify(s)); } catch { /* preferenza visuale: mai bloccante */ }
}
export function dimenticaMisura(chiave, storage = globalThis.localStorage) {
  try { const s = leggiMisure(storage); delete s[chiave]; storage.setItem(CHIAVE_MISURE, JSON.stringify(s)); } catch { /* idem */ }
}

function applica(dialogo, velo, width, height, finestra) {
  const pad = parseFloat(finestra.getComputedStyle(velo).paddingLeft) || 24;
  const m = misuraDialogo(width, height, limitiDialogo(velo.id, { innerWidth: finestra.innerWidth, innerHeight: finestra.innerHeight, pad }));
  // la misura vive in due custom property: il foglio decide dove vale (nel primo avvio l'altezza solo sul passo Cartella)
  dialogo.style.setProperty('--talos-dialog-w', `${m.width}px`); dialogo.style.setProperty('--talos-dialog-h', `${m.height}px`); dialogo.dataset.userSized = 'true';
  return m;
}

/** All'apertura di un velo: la chiave e, se ricordata, la misura. */
export function preparaMisuraDialogo(velo, { finestra = globalThis.window, storage = globalThis.localStorage } = {}) {
  const d = velo?.querySelector('.talos-dialog'); if (!d) return null;
  d.dataset.dialogResizeKey = CHIAVI_MISURA[velo.id] || `sheet:${velo.id}`;
  const s = leggiMisure(storage)[d.dataset.dialogResizeKey];
  if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return applica(d, velo, s.width, s.height, finestra);
  d.style.removeProperty('--talos-dialog-w'); d.style.removeProperty('--talos-dialog-h'); delete d.dataset.userSized;
  return null;
}

/** Collega tutte le maniglie sotto `radice`: trascinamento, frecce, doppio clic. Idempotente. */
export function collegaRidimensionamentoDialoghi(radice = globalThis.document, { finestra = globalThis.window, storage = globalThis.localStorage } = {}) {
  let collegate = 0;
  for (const h of radice.querySelectorAll('[data-dialog-resize]')) {
    if (h.dataset.ridimensionaCollegato) continue;
    h.dataset.ridimensionaCollegato = 'si';
    const d = h.closest('.talos-dialog'); const velo = h.closest('.overlay-layer'); if (!d || !velo) continue;
    const axis = h.dataset.dialogResize;
    const chiave = () => d.dataset.dialogResizeKey || CHIAVI_MISURA[velo.id] || `sheet:${velo.id}`;
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); h.focus();
      const r = d.getBoundingClientRect(); const x = e.clientX; const y = e.clientY;
      h.setPointerCapture?.(e.pointerId); h.dataset.trascina = 'si';
      const move = (m) => applica(d, velo, axis === 'height' ? r.width : r.width + (m.clientX - x) * 2, axis === 'width' ? r.height : r.height + (m.clientY - y) * 2, finestra);
      const end = () => { delete h.dataset.trascina; if (h.hasPointerCapture?.(e.pointerId)) h.releasePointerCapture(e.pointerId); const rr = d.getBoundingClientRect(); salvaMisura(chiave(), { width: rr.width, height: rr.height }, storage); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', end); h.removeEventListener('pointercancel', end); };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    });
    h.addEventListener('keydown', (e) => {
      const hor = ['ArrowLeft', 'ArrowRight'].includes(e.key); const ver = ['ArrowUp', 'ArrowDown'].includes(e.key);
      if ((!hor && !ver) || (axis === 'height' && hor) || (axis === 'width' && ver)) return;
      e.preventDefault();
      const r = d.getBoundingClientRect();
      const m = applica(d, velo, r.width + (hor ? (e.key === 'ArrowRight' ? PASSO_TASTIERA : -PASSO_TASTIERA) : 0), r.height + (ver ? (e.key === 'ArrowDown' ? PASSO_TASTIERA : -PASSO_TASTIERA) : 0), finestra);
      salvaMisura(chiave(), m, storage);
    });
    h.addEventListener('dblclick', () => { d.style.removeProperty('--talos-dialog-w'); d.style.removeProperty('--talos-dialog-h'); delete d.dataset.userSized; dimenticaMisura(chiave(), storage); });
    collegate += 1;
  }
  return collegate;
}
