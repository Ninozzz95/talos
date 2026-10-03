/**
 * F5 File reader (26/09/2026) — POWERPOINT (.pptx/.pptm) in sola lettura: il modello lo legge pptx-viewer-core 4.6.0
 * (Apache-2.0), la RESA è nostra (decisione owner del 26/09, dopo aver scartato pptx-preview — sorgente chiuso — e il
 * visore «vanilla» — un editor con jspdf, html2canvas e un pacchetto MCP). Gira nella pagina ospite, che la carica (`/lettore-ospite-presentazione.js`).
 *
 * Misurato su una presentazione vera (pptxgenjs 4.0.1, `scratchpad/modello-pptx.mjs`): la slide è in px (960×540 per il
 * 16:9, cioè EMU/9525), posizioni e misure in px, il corpo del carattere GIÀ in px (36 pt → 48), il ritorno a capo è un
 * segmento `"\n"`, l'allineamento verticale sta in `textStyle.vAlign`, le colonne di una tabella sono frazioni della sua
 * larghezza, e le immagini non sono nel modello: i loro BYTE si chiedono al gestore (`getMediaArrayBuffer(imagePath)`).
 * ⛔ Non `getImageData`: torna un indirizzo `blob:` (misurato il 26/09 sulla presentazione di prova, slide 3), che la
 *   ripulitura scarta e che la pagina ospite (origine nulla, `img-src data:`) non caricherebbe comunque. Si usa solo per
 *   EMF/WMF, che lui converte in `data:` (e se non ci riesce resta il riquadro che lo dice).
 *
 * La resa scala con la cornice senza una riga di script: ogni slide è un contenitore (`container-type: inline-size`)
 * con le proporzioni della presentazione, gli elementi stanno in percentuale e i caratteri in `cqw` (1% della larghezza).
 * ⛔ Niente HTML dal file: i testi entrano con `textContent`, gli stili via CSSOM coi soli valori controllati (colori
 *   esadecimali, nomi di carattere semplici, immagini `data:image`). Poi l'HTML passa dalla stessa ripulitura e dalla
 *   stessa cornice ospite di Word (`ospite.js`).
 * ⛔ Ciò che non disegniamo (grafici, SmartArt, oggetti incorporati, media, inchiostro, 3D) diventa un riquadro che lo DICE.
 */
import { t as traduci } from '../../lingua.js';
import { PptxHandler } from 'pptx-viewer-core';
import { URI_AMMESSE, pulisciHtml } from './ospite.js';

const COLORE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
export const coloreValido = (c) => (typeof c === 'string' && COLORE.test(c.trim()) ? c.trim() : null);
export const carattereValido = (f) => (typeof f === 'string' && /^[\p{L}\p{N} _-]{1,64}$/u.test(f.trim()) ? f.trim() : null);
/** Un px della slide in `cqw` del suo contenitore. */
export const inCqw = (px, larghezza) => `${Math.round((Number(px) / larghezza) * 100 * 1000) / 1000}cqw`;
const percento = (v, tot) => `${Math.round((Number(v) / tot) * 100 * 1000) / 1000}%`;
const GIUSTIFICA = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
const ALLINEA = { left: 'left', center: 'center', right: 'right', justify: 'justify', dist: 'justify', justLow: 'justify', thaiDist: 'justify' };
const MIME_IMMAGINE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
// i nomi si risolvono all'uso (funzioni), così seguono il cambio di lingua
const SEGNAPOSTO = {
  chart: () => traduci('varie.reader.slide.placeholder.chart'),
  smartArt: () => traduci('varie.reader.slide.placeholder.smartArt'),
  ole: () => traduci('varie.reader.slide.placeholder.embeddedObject'),
  media: () => traduci('varie.reader.slide.placeholder.media'),
  ink: () => traduci('varie.reader.slide.placeholder.ink'),
  model3d: () => traduci('varie.reader.slide.placeholder.model3d'),
  zoom: () => traduci('varie.reader.slide.placeholder.slideLink'),
  contentPart: () => traduci('varie.reader.slide.placeholder.content'),
};

/** Un colore con la sua opacità (0-1) in esadecimale a 8 cifre; `null` se il colore non è valido. */
export function conOpacita(colore, opacita) {
  const c = coloreValido(colore);
  if (!c) return null;
  if (!(Number.isFinite(opacita) && opacita >= 0 && opacita < 1)) return c;
  const esteso = c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : c.slice(0, 7);
  return `${esteso}${Math.round(opacita * 255).toString(16).padStart(2, '0')}`;
}

/** L'indirizzo `data:` di un'immagine della presentazione, dai suoi byte; `null` se non si legge. */
export async function immagineDati(gestore, percorso) {
  const estensione = String(percorso ?? '').split('.').pop().toLowerCase();
  const mime = MIME_IMMAGINE[estensione];
  if (!mime) {
    const convertita = await gestore.getImageData?.(percorso)?.catch?.(() => null);
    return typeof convertita === 'string' && URI_AMMESSE.test(convertita) ? convertita : null;
  }
  const buffer = await gestore.getMediaArrayBuffer?.(percorso)?.catch?.(() => null);
  if (!buffer) return null;
  const byte = new Uint8Array(buffer);
  let binario = '';
  for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binario)}`;
}

/** I paragrafi di un elemento di testo: i segmenti spezzati al `"\n"` (o a `isParagraphBreak`). */
export function paragrafi(elemento) {
  const segmenti = Array.isArray(elemento?.textSegments) && elemento.textSegments.length
    ? elemento.textSegments
    : (typeof elemento?.text === 'string' && elemento.text ? [{ text: elemento.text, style: elemento.textStyle ?? {} }] : []);
  const esito = [[]];
  for (const segmento of segmenti) {
    if (segmento?.isParagraphBreak) { esito.push([]); continue; }
    const pezzi = String(segmento?.text ?? '').split('\n');
    pezzi.forEach((pezzo, i) => {
      if (i > 0) esito.push([]);
      if (pezzo) esito[esito.length - 1].push({ text: pezzo, style: segmento.style ?? {} });
    });
  }
  return esito.filter((p, i) => p.length || i < esito.length - 1);
}

function crea(doc, tag, classe, testo) {
  const nodo = doc.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

function stileTesto(nodo, stile, larghezza) {
  if (Number.isFinite(stile.fontSize) && stile.fontSize > 0) nodo.style.fontSize = inCqw(stile.fontSize, larghezza);
  const famiglia = carattereValido(stile.fontFamily);
  if (famiglia) nodo.style.fontFamily = `"${famiglia}", system-ui, sans-serif`;
  if (stile.bold) nodo.style.fontWeight = '700';
  if (stile.italic) nodo.style.fontStyle = 'italic';
  const linee = [stile.underline ? 'underline' : '', stile.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ');
  if (linee) nodo.style.textDecoration = linee;
  const colore = coloreValido(stile.color);
  if (colore) nodo.style.color = colore;
  const evidenza = coloreValido(stile.highlightColor);
  if (evidenza) nodo.style.backgroundColor = evidenza;
}

function testo(doc, elemento, larghezza) {
  const scatola = crea(doc, 'div', 'talos-testo');
  const base = elemento.textStyle ?? {};
  scatola.style.justifyContent = GIUSTIFICA[base.vAlign] ?? 'flex-start';
  for (const paragrafo of paragrafi(elemento)) {
    const p = crea(doc, 'p');
    const primo = paragrafo[0]?.style ?? base;
    p.style.textAlign = ALLINEA[primo.align ?? base.align] ?? 'left';
    stileTesto(p, { ...base, ...primo }, larghezza);
    if (!paragrafo.length) p.append(doc.createElement('br'));
    for (const segmento of paragrafo) {
      const span = crea(doc, 'span', '', segmento.text);
      stileTesto(span, segmento.style, larghezza);
      p.append(span);
    }
    scatola.append(p);
  }
  return scatola;
}

function tabella(doc, elemento, larghezza) {
  const t = crea(doc, 'table');
  const colonne = crea(doc, 'colgroup');
  for (const frazione of elemento.tableData?.columnWidths ?? []) {
    const col = crea(doc, 'col');
    col.style.width = `${Math.round(Number(frazione) * 100000) / 1000}%`;
    colonne.append(col);
  }
  t.append(colonne);
  const corpo = crea(doc, 'tbody');
  for (const riga of elemento.tableData?.rows ?? []) {
    const tr = crea(doc, 'tr');
    for (const cella of riga.cells ?? []) {
      if (cella.hMerge || cella.vMerge) continue;
      const td = crea(doc, 'td');
      if (cella.gridSpan > 1) td.colSpan = cella.gridSpan;
      if (cella.rowSpan > 1) td.rowSpan = cella.rowSpan;
      const s = cella.style ?? {};
      for (const lato of ['Top', 'Right', 'Bottom', 'Left']) {
        const colore = coloreValido(s[`border${lato}Color`]);
        const spessore = Number(s[`border${lato}Width`]);
        if (colore && spessore > 0) td.style[`border${lato}`] = `${inCqw(spessore, larghezza)} solid ${colore}`;
      }
      const sfondo = coloreValido(s.fillColor ?? s.backgroundColor);
      if (sfondo) td.style.backgroundColor = sfondo;
      const corse = Array.isArray(cella.textRuns) && cella.textRuns.length ? cella.textRuns : [{ text: cella.text }];
      for (const corsa of corse) {
        const pezzi = String(corsa.text ?? '').split('\n');
        pezzi.forEach((pezzo, i) => {
          if (i > 0) td.append(doc.createElement('br'));
          const span = crea(doc, 'span', '', pezzo);
          stileTesto(span, corsa, larghezza);
          td.append(span);
        });
      }
      tr.append(td);
    }
    corpo.append(tr);
  }
  t.append(corpo);
  return t;
}

async function elementoNodo(doc, gestore, elemento, dim) {
  const { larghezza, altezza } = dim;
  const nodo = crea(doc, 'div', 'talos-el');
  nodo.dataset.tipo = String(elemento.type ?? 'sconosciuto');
  nodo.style.left = percento(elemento.x, larghezza);
  nodo.style.top = percento(elemento.y, altezza);
  nodo.style.width = percento(elemento.width, larghezza);
  nodo.style.height = percento(elemento.height, altezza);
  const trasforma = [];
  if (Number.isFinite(elemento.rotation) && elemento.rotation) trasforma.push(`rotate(${elemento.rotation}deg)`);
  if (elemento.flipHorizontal) trasforma.push('scaleX(-1)');
  if (elemento.flipVertical) trasforma.push('scaleY(-1)');
  if (trasforma.length) nodo.style.transform = trasforma.join(' ');

  const forma = elemento.shapeStyle ?? {};
  if (['shape', 'text', 'connector'].includes(elemento.type)) {
    const riempi = forma.fillMode !== 'none' ? conOpacita(forma.fillColor, forma.fillOpacity) : null;
    if (riempi) nodo.style.backgroundColor = riempi;
    const traccia = coloreValido(forma.strokeColor);
    const spessore = Number(forma.strokeWidth);
    if (traccia && spessore > 0) {
      const bordo = `${inCqw(spessore, larghezza)} solid ${traccia}`;
      if (elemento.type === 'connector') nodo.style[elemento.width >= elemento.height ? 'borderTop' : 'borderLeft'] = bordo;
      else nodo.style.border = bordo;
    }
    if (elemento.shapeType === 'ellipse') nodo.style.borderRadius = '50%';
    if (elemento.shapeType === 'roundRect') nodo.style.borderRadius = '12%';
  }
  if (elemento.type === 'group') {
    // i figli hanno coordinate della SLIDE: il gruppo non li sposta, li raccoglie
    nodo.style.overflow = 'visible';
    nodo.style.left = '0'; nodo.style.top = '0'; nodo.style.width = '100%'; nodo.style.height = '100%';
    for (const figlio of elemento.children ?? []) nodo.append(await elementoNodo(doc, gestore, figlio, dim));
    return nodo;
  }
  if (elemento.type === 'image' || elemento.type === 'picture') {
    let dati = typeof elemento.imageData === 'string' ? elemento.imageData : null;
    if (!(dati && URI_AMMESSE.test(dati)) && elemento.imagePath) dati = await immagineDati(gestore, elemento.imagePath);
    if (typeof dati === 'string' && URI_AMMESSE.test(dati)) {
      const img = crea(doc, 'img');
      img.alt = String(elemento.altText ?? '');
      img.src = dati;
      nodo.append(img);
    } else {
      nodo.classList.add('talos-segnaposto');
      nodo.textContent = traduci("varie.reader.slide.imageUnreadable");
    }
    return nodo;
  }
  if (elemento.type === 'table') { nodo.append(tabella(doc, elemento, larghezza)); return nodo; }
  if (SEGNAPOSTO[elemento.type] || elemento.type === 'unknown') {
    nodo.classList.add('talos-segnaposto');
    nodo.textContent = traduci("varie.reader.slide.elementNotShown", { name: (SEGNAPOSTO[elemento.type] ?? (() => traduci('varie.reader.slide.placeholder.element')))() });
    return nodo;
  }
  if (paragrafi(elemento).some((p) => p.length)) nodo.append(testo(doc, elemento, larghezza));
  return nodo;
}

/** Il foglio di stile della pagina ospite: la «carta» della presentazione, non il tema di TALOS. */
export const STILE_PRESENTAZIONE = [
  'html{color-scheme:light}',
  'body{margin:0;padding:16px;background:#e5e7eb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
  '.talos-diapositive{display:flex;flex-direction:column;align-items:center;gap:20px}',
  '.talos-slide-riga{width:min(100%,1280px)}',
  '.talos-slide-n{margin:0 0 6px;font:600 12px/1.4 system-ui,sans-serif;color:#4b5563}',
  '.talos-slide{position:relative;width:100%;aspect-ratio:var(--r);container-type:inline-size;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.06)}',
  '.talos-slide--nascosta{opacity:.55}',
  '.talos-el{position:absolute;box-sizing:border-box;overflow:hidden}',
  '.talos-testo{display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;padding:.75cqw 1cqw;line-height:1.2;overflow-wrap:anywhere}',
  '.talos-testo p{margin:0;white-space:pre-wrap}',
  '.talos-el img{display:block;width:100%;height:100%;object-fit:fill}',
  '.talos-el table{width:100%;border-collapse:collapse;table-layout:fixed}',
  '.talos-el td{vertical-align:top;padding:.4cqw .6cqw;overflow-wrap:anywhere}',
  '.talos-segnaposto{display:grid;place-items:center;border:1px dashed #9ca3af;background:#f9fafb;color:#6b7280;font:12px/1.3 system-ui,sans-serif;text-align:center}',
].join('\n');

/** L'HTML (non ancora ripulito) di tutte le slide. */
export async function htmlPresentazione({ doc, byte, gestore = new PptxHandler() }) {
  const dati = await gestore.load(byte);
  const larghezza = Number(dati.width) || 960;
  const altezza = Number(dati.height) || 540;
  const radice = crea(doc, 'div', 'talos-diapositive');
  for (const [i, slide] of dati.slides.entries()) {
    const riga = crea(doc, 'section', 'talos-slide-riga');
    riga.setAttribute('aria-label', traduci("varie.reader.slide.label", { n: i + 1 }));
    riga.append(crea(doc, 'p', 'talos-slide-n', slide.hidden ? traduci('varie.reader.slide.hidden', { n: i + 1 }) : String(i + 1)));
    const foglio = crea(doc, 'div', slide.hidden ? 'talos-slide talos-slide--nascosta' : 'talos-slide');
    foglio.style.setProperty('--r', `${larghezza} / ${altezza}`);
    const sfondo = coloreValido(slide.backgroundColor);
    if (sfondo) foglio.style.backgroundColor = sfondo;
    if (typeof slide.backgroundImage === 'string' && URI_AMMESSE.test(slide.backgroundImage)) {
      foglio.style.backgroundImage = `url("${slide.backgroundImage}")`;
      foglio.style.backgroundSize = 'cover';
    }
    for (const elemento of slide.elements ?? []) foglio.append(await elementoNodo(doc, gestore, elemento, { larghezza, altezza }));
    riga.append(foglio);
    radice.append(riga);
  }
  return { html: `<style>${STILE_PRESENTAZIONE}</style>${radice.outerHTML}`, slide: dati.slides.length, larghezza, altezza };
}

/** Dentro la pagina ospite (bundle `lettore-ospite-presentazione.js`): l'HTML di tutte le slide, già ripulito. */
export async function resaPresentazione({ doc = globalThis.document, finestra = globalThis, byte }) {
  const { html } = await htmlPresentazione({ doc, byte });
  return pulisciHtml(html, finestra);
}
