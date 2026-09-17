/*
 * Dialoghi ridimensionabili e RICORDATI — la regia del mockup (`[data-dialog-resize]`)
 * portata nella app. 06/09, B7; owner 05/09: «le modali
 * devono essere ridimensionate e ricordate».
 *
 * Ogni velo del mockup ha tre maniglie (larghezza · altezza · entrambe). Trascinare le
 * muove; con il fuoco sulla maniglia le frecce cambiano di 16 px alla volta; Home o doppio clic
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
  veloAlbero: 'sheet:sessionTree', veloAmbiente: 'sheet:environment', veloRinomina: 'sheet:rename',
  veloRiferimenti: 'sheet:references', veloFile: 'sheet:fileViewer', veloRinominaFile: 'sheet:renameFile', veloEliminaFile: 'sheet:deleteFile',
  veloEliminaSessione: 'sheet:deleteSession', veloCreaFile: 'sheet:createFile', veloEsporta: 'sheet:export', veloFermaGiro: 'dialog:stopRun',
});

/** Il minimo dipende dal velo (la palette è più stretta), il massimo dalla finestra meno il bordo del velo. */
export function limitiDialogo(idVelo, { innerWidth, innerHeight, pad = 24, padX = pad, padY = pad }) {
  const positivo = (v, fallback) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback;
  const bordo = (v) => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 24;
  const w = positivo(innerWidth, 320);
  const h = positivo(innerHeight, 240);
  // Il minimo del controllo non può diventare un massimo più grande del viewport.
  const maxW = Math.max(1, Math.floor(w - bordo(padX) * 2));
  const maxH = Math.max(1, Math.floor(Math.min(h - bordo(padY) * 2, h * 0.9)));
  return { minW: Math.min(idVelo === 'veloComandi' ? 420 : 520, maxW), minH: Math.min(idVelo === 'veloComandi' ? 240 : 340, maxH), maxW, maxH };
}
export function misuraDialogo(width, height, limiti) {
  const w = Math.round(Math.max(limiti.minW, Math.min(limiti.maxW, Number(width) || limiti.minW)));
  const h = Math.round(Math.max(limiti.minH, Math.min(limiti.maxH, Number(height) || limiti.minH)));
  return { width: w, height: h };
}

export function leggiMisure(storage) {
  try { const v = JSON.parse((storage ?? globalThis.localStorage).getItem(CHIAVE_MISURE) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
export function salvaMisura(chiave, misura, storage) {
  try { const s = leggiMisure(storage); s[chiave] = { width: Math.round(misura.width), height: Math.round(misura.height) }; (storage ?? globalThis.localStorage).setItem(CHIAVE_MISURE, JSON.stringify(s)); } catch { /* preferenza visuale: mai bloccante */ }
}
export function dimenticaMisura(chiave, storage) {
  try { const s = leggiMisure(storage); delete s[chiave]; (storage ?? globalThis.localStorage).setItem(CHIAVE_MISURE, JSON.stringify(s)); } catch { /* idem */ }
}

function applica(dialogo, velo, width, height, finestra) {
  const css = finestra.getComputedStyle(velo);
  const bordo = (nome) => { const n = Number.parseFloat(css[nome]); return Number.isFinite(n) ? n : 24; };
  const m = misuraDialogo(width, height, limitiDialogo(velo.id, {
    innerWidth: finestra.innerWidth, innerHeight: finestra.innerHeight,
    padX: (bordo('paddingLeft') + bordo('paddingRight')) / 2,
    padY: (bordo('paddingTop') + bordo('paddingBottom')) / 2,
  }));
  // la misura vive in due custom property: il foglio decide dove vale (nel primo avvio l'altezza solo sul passo Cartella)
  dialogo.style.setProperty('--talos-dialog-w', `${m.width}px`); dialogo.style.setProperty('--talos-dialog-h', `${m.height}px`); dialogo.dataset.userSized = 'true';
  return m;
}

/** All'apertura di un velo: la chiave e, se ricordata, la misura. */
export function preparaMisuraDialogo(velo, { finestra = globalThis.window, storage } = {}) {
  const d = velo?.querySelector('.talos-dialog'); if (!d) return null;
  d.dataset.dialogResizeKey = CHIAVI_MISURA[velo.id] || `sheet:${velo.id}`;
  const s = leggiMisure(storage)[d.dataset.dialogResizeKey];
  if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return applica(d, velo, s.width, s.height, finestra);
  d.style.removeProperty('--talos-dialog-w'); d.style.removeProperty('--talos-dialog-h'); delete d.dataset.userSized;
  return null;
}

/** Collega tutte le maniglie sotto `radice`: trascinamento, frecce, doppio clic. Idempotente. */
export function collegaRidimensionamentoDialoghi(radice = globalThis.document, { finestra = globalThis.window, storage } = {}) {
  let collegate = 0;
  for (const h of radice.querySelectorAll('[data-dialog-resize]')) {
    if (h.dataset.ridimensionaCollegato) continue;
    const d = h.closest('.talos-dialog');
    const velo = h.closest('.overlay-layer');
    if (!d || !velo) continue; // un nodo non ancora montato deve poter essere collegato dopo
    h.dataset.ridimensionaCollegato = 'si';
    const axis = h.dataset.dialogResize;
    const chiave = () => d.dataset.dialogResizeKey || CHIAVI_MISURA[velo.id] || `sheet:${velo.id}`;
    let trascinamento = null;
    if (h.tagName === 'BUTTON') h.type = 'button';
    h.style.touchAction = 'none';
    h.setAttribute('aria-keyshortcuts', `${axis === 'height' ? '' : 'ArrowLeft ArrowRight '}${axis === 'width' ? '' : 'ArrowUp ArrowDown '}Home`);

    const ripristina = () => {
      d.style.removeProperty('--talos-dialog-w');
      d.style.removeProperty('--talos-dialog-h');
      delete d.dataset.userSized;
      dimenticaMisura(chiave(), storage);
    };
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || trascinamento || h.disabled || h.getAttribute('aria-disabled') === 'true') return;
      e.preventDefault(); h.focus({ preventScroll: true });
      const r = d.getBoundingClientRect();
      const x = e.clientX; const y = e.clientY;
      const prima = { w: d.style.getPropertyValue('--talos-dialog-w'), h: d.style.getPropertyValue('--talos-dialog-h'), sized: d.dataset.userSized };
      try { h.setPointerCapture?.(e.pointerId); } catch { return; }
      h.dataset.trascina = 'si';
      const move = (m) => {
        if (m.pointerId !== e.pointerId) return;
        applica(d, velo, axis === 'height' ? r.width : r.width + (m.clientX - x) * 2,
          axis === 'width' ? r.height : r.height + (m.clientY - y) * 2, finestra);
      };
      const termina = (conferma) => {
        if (!trascinamento) return;
        trascinamento = null;
        delete h.dataset.trascina;
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', cancel);
        h.removeEventListener('lostpointercapture', cancel);
        try { if (h.hasPointerCapture?.(e.pointerId)) h.releasePointerCapture(e.pointerId); } catch { /* già rilasciata */ }
        if (conferma) {
          const rr = d.getBoundingClientRect();
          salvaMisura(chiave(), { width: rr.width, height: rr.height }, storage);
        } else {
          // Un gesto interrotto non è una nuova preferenza da ricordare.
          for (const [nome, valore] of [['--talos-dialog-w', prima.w], ['--talos-dialog-h', prima.h]]) {
            if (valore) d.style.setProperty(nome, valore); else d.style.removeProperty(nome);
          }
          if (prima.sized === undefined) delete d.dataset.userSized; else d.dataset.userSized = prima.sized;
        }
      };
      const up = (m) => { if (m.pointerId === e.pointerId) termina(true); };
      const cancel = (m) => { if (m.pointerId === e.pointerId) termina(false); };
      trascinamento = { annulla: () => termina(false) };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', cancel);
      h.addEventListener('lostpointercapture', cancel);
    });
    h.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && trascinamento) {
        e.preventDefault(); e.stopPropagation(); trascinamento.annulla(); return;
      }
      if (trascinamento || h.disabled || h.getAttribute('aria-disabled') === 'true') return;
      if (e.key === 'Home') { e.preventDefault(); ripristina(); return; }
      const hor = ['ArrowLeft', 'ArrowRight'].includes(e.key);
      const ver = ['ArrowUp', 'ArrowDown'].includes(e.key);
      if ((!hor && !ver) || (axis === 'height' && hor) || (axis === 'width' && ver)) return;
      e.preventDefault();
      const r = d.getBoundingClientRect();
      const m = applica(d, velo, r.width + (hor ? (e.key === 'ArrowRight' ? PASSO_TASTIERA : -PASSO_TASTIERA) : 0),
        r.height + (ver ? (e.key === 'ArrowDown' ? PASSO_TASTIERA : -PASSO_TASTIERA) : 0), finestra);
      salvaMisura(chiave(), m, storage);
    });
    h.addEventListener('dblclick', () => { if (!trascinamento && !h.disabled && h.getAttribute('aria-disabled') !== 'true') ripristina(); });
    collegate += 1;
  }
  return collegate;
}
