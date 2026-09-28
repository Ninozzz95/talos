/*
 * F7-1 (owner 27/09/2026) — LA BARRA DEL TITOLO PROPRIA della finestra desktop, come Hermes
 * (`apps/desktop/electron/main.ts:13945`: `titleBarStyle:'hidden'` + `titleBarOverlay`, striscia da 34 px,
 * `src/app/shell/titlebar.ts:3`). Decisioni dell'owner, stessa notte:
 *   · nella striscia SOLO il pulsante del menu e spazio da trascinare (marchio e titolo sono già sotto);
 *   · il glifo è «⋯» (`#i-more`, il menu azioni di casa), non «≡»: la barra laterale ha già un «≡» che comprime;
 *   · NESSUN ponte pagina→app (la prova R01 `preload: undefined` resta vera): il menu si chiede aprendo
 *     `talos-desktop://menu?x=&y=`, che il processo principale nega e trasforma nel menu NATIVO di sempre; il colore dei
 *     comandi di Windows segue il `<meta name="theme-color">` di questa pagina (`did-change-theme-color` di Electron).
 *
 * ⛔ La striscia esiste SOLO dove Windows ci lascia lo spazio: `navigator.windowControlsOverlay.visible` (doc Electron,
 *   «custom-title-bar.md»). Nel browser (il 4174, un'installazione vista da Chrome) non nasce niente: stesso DOM di prima.
 * ⛔ Si CREA qui e non nel template: `index.template.html` è generato dal mockup, e il generatore taglia ciò che sta prima
 *   di `.talos-shell` (vedi il commento in testa alla shell nel template).
 */
export const INDIRIZZO_MENU = 'talos-desktop://menu';

/** `rgb()`/`rgba(…, 1)` di getComputedStyle → `#rrggbb`; `null` per un fondo trasparente o velato. */
export function coloreEsadecimale(colore) {
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/u.exec(String(colore ?? '').trim());
  if (!m || (m[4] !== undefined && Number(m[4]) !== 1)) return null;
  const valori = m.slice(1, 4).map(Number);
  return valori.every((v) => v <= 255) ? `#${valori.map((v) => v.toString(16).padStart(2, '0')).join('')}` : null;
}

/*
 * Il colore RISOLTO in `#rrggbb`, qualunque forma abbia: il fondo della striscia è un `color-mix(…)` di token, e Chromium
 * lo calcola come `color(srgb …)`, non `rgb()` (misurato nella finestra vera: `theme-color` restava vuoto). Il browser lo
 * normalizza dipingendolo su un canvas 1×1; un pixel non opaco non è il colore di una barra.
 */
export function coloreRisolto(documento, colore) {
  const semplice = coloreEsadecimale(colore);
  if (semplice) return semplice;
  const tela = documento.createElement('canvas');
  tela.width = 1;
  tela.height = 1;
  const g = tela.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.fillStyle = '#000000';
  g.fillStyle = String(colore ?? '');
  g.clearRect(0, 0, 1, 1);
  g.fillRect(0, 0, 1, 1);
  const [r, v, b, a] = g.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `#${[r, v, b].map((x) => x.toString(16).padStart(2, '0')).join('')}` : null;
}

export function montaBarraFinestra({ documento = globalThis.document, finestra = globalThis.window } = {}) {
  if (!documento || finestra?.navigator?.windowControlsOverlay?.visible !== true) return null;
  const guscio = documento.querySelector('.talos-shell');
  if (!guscio || documento.getElementById('talosBarraFinestra')) return null;

  const barra = documento.createElement('header');
  barra.id = 'talosBarraFinestra';
  barra.className = 'talos-barra-finestra';
  barra.dataset.c = 'BarraFinestra';
  barra.innerHTML = '<button type="button" class="talos-button talos-button--ghost talos-icon-button talos-barra-finestra__menu"'
    + ' data-azione="menu-finestra" aria-label="Menu di TALOS" title="Menu di TALOS" aria-haspopup="menu">'
    + '<svg class="i" aria-hidden="true"><use href="#i-more"/></svg></button>';
  guscio.before(barra);
  documento.documentElement.dataset.talosFinestra = 'app';

  const pulsante = barra.querySelector('button');
  pulsante.addEventListener('click', () => {
    const r = pulsante.getBoundingClientRect();
    finestra.open(`${INDIRIZZO_MENU}?x=${Math.max(0, Math.round(r.left))}&y=${Math.max(0, Math.round(r.bottom))}`, '_blank');
  });

  let meta = documento.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = documento.createElement('meta');
    meta.name = 'theme-color';
    documento.head.append(meta);
  }
  const aggiorna = () => {
    const colore = coloreRisolto(documento, finestra.getComputedStyle(barra).backgroundColor);
    if (colore && meta.content !== colore) meta.content = colore;
  };
  aggiorna();
  /* Il tema cambia sugli attributi della radice e del corpo; «come il sistema» cambia senza toccarli. */
  const osservatore = new finestra.MutationObserver(() => finestra.requestAnimationFrame(aggiorna));
  osservatore.observe(documento.documentElement, { attributes: true });
  osservatore.observe(documento.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  const sistema = finestra.matchMedia?.('(prefers-color-scheme: dark)');
  const suSistema = () => finestra.requestAnimationFrame(aggiorna);
  sistema?.addEventListener?.('change', suSistema);
  return {
    barra,
    aggiorna,
    distruggi() { osservatore.disconnect(); sistema?.removeEventListener?.('change', suSistema); },
  };
}
