/*
 * «Esporta» dal menu del blocco (scena 8, FE-080, ledger UI generativa 05/11/2026, gruppo G-A).
 *
 * Funzioni pure: dal blocco del catalogo a `{ nome, testo, mime }`, che il guscio passa a `scaricaFile`
 * (`../codice-esporta.js`, la stessa strada di salvataggio del blocco di codice).
 *   - tabella → CSV nella lingua dell'interfaccia: in italiano `;` e virgola decimale (Excel con le impostazioni italiane usa il `;`
 *     come separatore di elenco: ablebits «How to change Excel CSV delimiter», letta il 05/11/2026; SO 26801909, letta il
 *     05/11/2026), in inglese `,` e punto. BOM UTF-8, righe chiuse da CRLF, campi col separatore, `"`, CR o LF fra virgolette e
 *     le virgolette raddoppiate (RFC 4180, come `src/document-generator.mjs:103`). Una cella di testo che comincia con `= + - @`,
 *     tab, CR, LF o le loro varianti a tutta larghezza prende un apostrofo davanti: aprendo il file non parte una formula (OWASP
 *     «CSV Injection», letta il 05/11/2026). I numeri restano numeri, anche negativi.
 *   - grafico → immagine SVG che dice quello che dice lo schermo (`grafico.js`): le categorie sono l'UNIONE delle x di tutte le
 *     serie e ogni punto sta sulla sua x; le barre partono dallo zero, anche in giù; la scala comprende i negativi; la legenda (dalla
 *     seconda serie, come a schermo) va a capo dentro i 640 di larghezza; le etichette lunghe si accorciano coi puntini PRIMA di
 *     scapparle per l'XML (un `&amp;` tagliato a metà non è più XML). Tavolozza fissa (un file esportato non ha i gettoni del tema),
 *     nessuno script e nessun attributo di evento.
 *   - confronto → CSV con le stesse difese della tabella (ledger G-C, emendamento a G-A): colonne Nome / A favore / Contro, una
 *     riga per punto, il nome solo sulla prima riga della sua voce.
 *   - diagramma → SVG autonomo dalla stessa disposizione dello schermo (`disposizione.mjs`): rettangoli, frecce con la punta,
 *     ogni testo accorciato a punti di codice e POI scappato; nessuno script, nessun foreignObject, nessun attributo di evento.
 *   - gli altri tipi → il ripiego testuale del nucleo (`ripiegoTestuale`, lo stesso testo di «Copia»).
 */
import { ripiegoTestuale } from '../../../../src/blocchi/catalogo.mjs';
import { disponiDiagramma, NODO } from '../../../../src/blocchi/disposizione.mjs';
import { marcaTemporale, sanificaNomeFile } from '../codice-esporta.js';

const BOM = '﻿';
const FORMULA = /^[=+\-@\t\r\n＝＋－＠]/u;
const italiano = (lingua) => lingua === 'it';

/**
 * Una cella del CSV. `null`/`undefined` → vuota; i numeri come numeri (in italiano con la virgola); il testo neutralizzato e
 * racchiuso se contiene il separatore della lingua, le virgolette o un a capo.
 * @param {unknown} valore
 * @param {'it'|'en'} [lingua]
 */
export function cellaCsv(valore, lingua = 'en') {
  if (valore === null || valore === undefined) return '';
  if (typeof valore === 'number') return italiano(lingua) ? String(valore).replace('.', ',') : String(valore);
  let s = String(valore);
  /* (voce d del ledger) un numero che il modello ha scritto come TESTO («-12.5») resta testo: tiene il suo punto e, se comincia
   * con «-», prende l'apostrofo come ogni altra cella che potrebbe partire come formula. È il comportamento giusto per OWASP: non
   * si indovina che una stringa «sia» un numero. */
  if (typeof valore === 'string' && FORMULA.test(s)) s = `'${s}`;
  const separatore = italiano(lingua) ? ';' : ',';
  return s.includes(separatore) || /["\r\n]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s;
}

function csvDellaTabella(blocco, lingua) {
  const colonne = blocco.colonne || [];
  const righe = [colonne.map((c) => cellaCsv(c.titolo ?? c.id, lingua))];
  for (const riga of blocco.righe || []) righe.push(colonne.map((_, i) => cellaCsv(riga[i], lingua)));
  return `${BOM}${righe.map((r) => r.join(italiano(lingua) ? ';' : ',')).join('\r\n')}`;
}

const INTESTAZIONE_DEL_CONFRONTO = Object.freeze({ it: ['Nome', 'A favore', 'Contro'], en: ['Name', 'For', 'Against'] });
function csvDelConfronto(blocco, lingua) {
  const righe = [INTESTAZIONE_DEL_CONFRONTO[italiano(lingua) ? 'it' : 'en'].map((c) => cellaCsv(c, lingua))];
  for (const c of blocco.colonne || []) {
    const pro = Array.isArray(c?.pro) ? c.pro : [];
    const contro = Array.isArray(c?.contro) ? c.contro : [];
    for (let i = 0; i < Math.max(1, pro.length, contro.length); i += 1) righe.push([i === 0 ? c?.nome : '', pro[i], contro[i]].map((v) => cellaCsv(v, lingua)));
  }
  return `${BOM}${righe.map((r) => r.join(italiano(lingua) ? ';' : ',')).join('\r\n')}`;
}

const xml = (s) => String(s ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
/** Accorcia per caratteri veri (non metà di una coppia surrogata) e mette i puntini. Si scappa DOPO. */
const corto = (s, massimo) => {
  const c = [...String(s ?? '')];
  return c.length > massimo ? `${c.slice(0, Math.max(1, massimo - 1)).join('')}…` : c.join('');
};
/* tavolozza fissa, leggibile su fondo chiaro (il file si apre fuori dall'app, senza tema) */
const TAVOLOZZA = Object.freeze(['#3d6fd9', '#d9822b', '#2a9d68', '#b04fc4', '#c9a215', '#d1495b']);
const colore = (j) => TAVOLOZZA[j % TAVOLOZZA.length];
const L = 640;
const A = 360;
const MARGINE = { su: 48, giu: 56, sx: 48, dx: 24 };
const PX_PER_CARATTERE = 7; // a font-size 12, una lettera media del system-ui
const RIGA_LEGENDA = 18;
const cifra = (n) => Number(n.toFixed(2));
const valore = (p) => Number(p?.y) || 0;

function unioneDelleX(serie) {
  const xs = [];
  for (const s of serie) for (const p of s.punti) if (!xs.includes(p.x)) xs.push(p.x);
  return xs;
}
/* la scala comprende sempre lo zero, sopra e sotto (`grafico.js`: lo = min(0, …), hi = max(0, …)) */
function scala(serie, area) {
  const ys = serie.flatMap((s) => s.punti.map(valore));
  const lo = Math.min(0, ...ys);
  const hi = Math.max(0, ...ys);
  const ampiezza = hi - lo || 1;
  return (y) => area.y + ((hi - y) / ampiezza) * area.a;
}
const asse = (area, y) => `<line x1="${area.x}" y1="${cifra(y)}" x2="${area.x + area.l}" y2="${cifra(y)}" stroke="#999" stroke-width="1"/>`;
const etichettaX = (x, cx, area, larghezza) => `<text x="${cifra(cx)}" y="${area.y + area.a + 18}" text-anchor="middle">${xml(corto(x, Math.max(4, Math.floor(larghezza / PX_PER_CARATTERE))))}</text>`;

function barre(serie, area, { unita, numero }) {
  const categorie = unioneDelleX(serie);
  const py = scala(serie, area);
  const gruppo = area.l / Math.max(1, categorie.length);
  const barra = (gruppo * 0.8) / Math.max(1, serie.length);
  const segni = [asse(area, py(0))];
  categorie.forEach((x, i) => {
    serie.forEach((s, j) => {
      const p = s.punti.find((q) => q.x === x);
      if (!p) return; // un punto che manca non è una barra a zero
      const v = valore(p);
      const y = Math.min(py(v), py(0));
      const bx = area.x + i * gruppo + gruppo * 0.1 + j * barra;
      segni.push(`<rect x="${cifra(bx)}" y="${cifra(y)}" width="${cifra(barra)}" height="${cifra(Math.abs(py(v) - py(0)))}" fill="${colore(j)}"/>`);
      /* R-4e: il valore di OGNI barra, come a schermo; sopra se positiva, sotto se negativa */
      const ty = v < 0 ? py(v) + 12 : py(v) - 4;
      segni.push(`<text class="valore" x="${cifra(bx + barra / 2)}" y="${cifra(ty)}" text-anchor="middle" font-size="10">${xml(corto(conUnita(p.y, unita, numero), 14))}</text>`);
    });
    segni.push(etichettaX(x, area.x + i * gruppo + gruppo / 2, area, gruppo));
  });
  return segni;
}

function linee(serie, area, { unita, numero }) {
  const xs = unioneDelleX(serie);
  const py = scala(serie, area);
  const px = (x) => area.x + (xs.length < 2 ? area.l / 2 : (xs.indexOf(x) / (xs.length - 1)) * area.l);
  const segni = [asse(area, py(0))];
  serie.forEach((s, j) => {
    if (!s.punti.length) return;
    segni.push(`<polyline points="${s.punti.map((p) => `${cifra(px(p.x))},${cifra(py(valore(p)))}`).join(' ')}" fill="none" stroke="${colore(j)}" stroke-width="2"/>`);
    s.punti.forEach((p) => segni.push(`<circle cx="${cifra(px(p.x))}" cy="${cifra(py(valore(p)))}" r="3" fill="${colore(j)}"/>`));
    /* R-4e: il valore dell'ULTIMO punto di ogni serie, come a schermo */
    const ultimo = s.punti[s.punti.length - 1];
    segni.push(`<text class="valore" x="${cifra(Math.min(px(ultimo.x), area.x + area.l - 4))}" y="${cifra(py(valore(ultimo)) - 8)}" text-anchor="end" font-size="10">${xml(corto(conUnita(ultimo.y, unita, numero), 14))}</text>`);
  });
  const passo = xs.length < 2 ? area.l : area.l / (xs.length - 1);
  xs.forEach((x) => segni.push(etichettaX(x, px(x), area, passo)));
  return segni;
}

/* come `conUnita` di `grafico.js`: «12%» per le percentuali, «12 €» per le altre unità */
function conUnita(y, unita, numero) {
  const n = typeof y === 'number' && Number.isFinite(y) ? numero(y) : String(y ?? '');
  if (!unita) return n;
  return unita === '%' ? `${n}%` : `${n} ${unita}`;
}

function torta(serie, area, { unita, numero }) {
  const punti = serie[0]?.punti ?? [];
  const valori = punti.map((p) => Math.max(0, valore(p)));
  const somma = valori.reduce((t, v) => t + v, 0);
  const totale = somma || 1;
  const cx = area.x + area.a / 2;
  const cy = area.y + area.a / 2;
  const r = area.a / 2;
  let angolo = -Math.PI / 2;
  const segni = [];
  const spazio = L - MARGINE.dx - (cx + r + 40);
  punti.forEach((p, i) => {
    const quota = valori[i] / totale;
    if (quota >= 0.9999) segni.push(`<circle cx="${cifra(cx)}" cy="${cifra(cy)}" r="${cifra(r)}" fill="${colore(i)}"/>`);
    else if (quota > 0) { // uno spicchio a zero non si disegna: a schermo non si vede
      const fine = angolo + quota * 2 * Math.PI;
      const [x1, y1, x2, y2] = [cx + r * Math.cos(angolo), cy + r * Math.sin(angolo), cx + r * Math.cos(fine), cy + r * Math.sin(fine)];
      segni.push(`<path d="M${cifra(cx)} ${cifra(cy)} L${cifra(x1)} ${cifra(y1)} A${cifra(r)} ${cifra(r)} 0 ${quota > 0.5 ? 1 : 0} 1 ${cifra(x2)} ${cifra(y2)} Z" fill="${colore(i)}"/>`);
      angolo = fine;
    }
    /* la legenda come a schermo (`grafico.js`): nome · valore con l'unità · quota */
    const parte = somma ? `${numero(Math.round((valori[i] / somma) * 1000) / 10)}%` : '—';
    const testo = corto(`${p.x} · ${conUnita(p.y, unita, numero)} · ${parte}`, Math.floor(spazio / PX_PER_CARATTERE));
    segni.push(`<rect x="${cifra(cx + r + 24)}" y="${area.y + i * 20}" width="10" height="10" rx="2" fill="${colore(i)}"/><text x="${cifra(cx + r + 40)}" y="${area.y + i * 20 + 9}">${xml(testo)}</text>`);
  });
  return segni;
}

/** La legenda delle serie, che va a capo dentro la larghezza: i segni e quante righe occupa. */
function legenda(serie) {
  const segni = [];
  const destra = L - MARGINE.dx;
  let x = MARGINE.sx;
  let riga = 0;
  serie.forEach((s, j) => {
    const nome = corto(s.nome, Math.floor((destra - MARGINE.sx - 30) / PX_PER_CARATTERE));
    const largo = 14 + [...nome].length * PX_PER_CARATTERE + 16;
    if (x > MARGINE.sx && x + largo > destra) { x = MARGINE.sx; riga += 1; }
    const y = A - 18 + riga * RIGA_LEGENDA;
    segni.push(`<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${colore(j)}"/><text x="${x + 14}" y="${y + 9}">${xml(nome)}</text>`);
    x += largo;
  });
  return { segni, righe: segni.length ? riga + 1 : 0 };
}

/**
 * Il grafico come SVG autonomo.
 * @param {object} blocco
 * @param {'it'|'en'} [lingua] la lingua dei numeri della legenda
 */
export function svgDelGrafico(blocco, lingua = 'en') {
  const serie = (blocco.serie || []).filter((s) => Array.isArray(s?.punti));
  const area = { x: MARGINE.sx, y: MARGINE.su, l: L - MARGINE.sx - MARGINE.dx, a: A - MARGINE.su - MARGINE.giu };
  const formato = new Intl.NumberFormat(italiano(lingua) ? 'it-IT' : 'en-US', { maximumFractionDigits: 6 });
  const numero = (n) => formato.format(n);
  const forma = blocco.forma === 'torta' ? torta : (blocco.forma === 'linee' ? linee : barre);
  /* una serie sola senza legenda, dalla seconda in su legenda sempre (le regole di `grafico.js`) */
  const { segni: voci, righe } = blocco.forma === 'torta' || serie.length < 2 ? { segni: [], righe: 0 } : legenda(serie);
  const alto = A + Math.max(0, righe - 1) * RIGA_LEGENDA;
  const unita = blocco.unita ? `<text x="${MARGINE.sx}" y="${MARGINE.su - 8}" fill="#555">${xml(corto(blocco.unita, 40))}</text>` : '';
  const titoloVisibile = corto(blocco.titolo, Math.floor((L - MARGINE.sx - MARGINE.dx) / 9));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${alto}" viewBox="0 0 ${L} ${alto}" role="img" aria-label="${xml(blocco.titolo)}" font-family="system-ui, sans-serif" font-size="12" fill="#222">`,
    `<title>${xml(blocco.titolo)}</title>`,
    blocco.descrizione ? `<desc>${xml(blocco.descrizione)}</desc>` : '',
    `<rect width="${L}" height="${alto}" fill="#ffffff"/>`,
    `<text x="${MARGINE.sx}" y="24" font-size="15" font-weight="600">${xml(titoloVisibile)}</text>`,
    unita,
    ...forma(serie, area, { unita: blocco.unita, numero }),
    ...voci,
    '</svg>',
  ].filter(Boolean).join('\n');
}

/**
 * Il diagramma come SVG autonomo, disposto come a schermo.
 * @param {object} blocco
 */
export function svgDelDiagramma(blocco) {
  const nodi = (blocco.nodi || []).filter((n) => n && typeof n.id === 'string');
  const ids = new Set(nodi.map((n) => n.id));
  const frecce = (blocco.frecce || []).filter((f) => f && ids.has(f.da) && ids.has(f.a));
  const d = disponiDiagramma(nodi, frecce);
  const su = 40;
  const l = Math.max(d.larghezza, 200);
  const alto = d.altezza + su;
  const segni = [];
  d.frecce.forEach((f, i) => {
    const punti = f.punti.map(([x, y]) => `${cifra(x)},${cifra(y + su)}`).join(' ');
    segni.push(`<polyline points="${punti}" fill="none" stroke="#777" stroke-width="1.5"${f.indietro ? ' stroke-dasharray="4 3"' : ''} marker-end="url(#punta)"/>`);
    if (frecce[i]?.testo) {
      const [a, b] = [f.punti[0], f.punti[f.punti.length - 1]];
      segni.push(`<text x="${cifra((a[0] + b[0]) / 2 + 4)}" y="${cifra((a[1] + b[1]) / 2 + su)}" font-size="11" fill="#555">${xml(corto(frecce[i].testo, 20))}</text>`);
    }
  });
  for (const n of nodi) {
    const p = d.posizioni.get(n.id);
    if (!p) continue;
    segni.push(`<g><title>${xml(n.testo)}</title><rect x="${cifra(p.x)}" y="${cifra(p.y + su)}" width="${NODO.larghezza}" height="${NODO.altezza}" rx="8" fill="#ffffff" stroke="#888"/><text x="${cifra(p.x + NODO.larghezza / 2)}" y="${cifra(p.y + su + NODO.altezza / 2 + 4)}" text-anchor="middle">${xml(corto(n.testo, 20))}</text></g>`);
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${alto}" viewBox="0 0 ${l} ${alto}" role="img" aria-label="${xml(blocco.titolo)}" font-family="system-ui, sans-serif" font-size="12" fill="#222">`,
    `<title>${xml(blocco.titolo)}</title>`,
    `<defs><marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#777"/></marker></defs>`,
    `<rect width="${l}" height="${alto}" fill="#ffffff"/>`,
    `<text x="12" y="24" font-size="15" font-weight="600">${xml(corto(blocco.titolo, Math.floor((l - 24) / 9)))}</text>`,
    ...segni,
    '</svg>',
  ].join('\n');
}

const FORMATO = Object.freeze({
  tabella: { estensione: 'csv', mime: 'text/csv;charset=utf-8', testo: csvDellaTabella },
  grafico: { estensione: 'svg', mime: 'image/svg+xml;charset=utf-8', testo: svgDelGrafico },
  confronto: { estensione: 'csv', mime: 'text/csv;charset=utf-8', testo: csvDelConfronto },
  diagramma: { estensione: 'svg', mime: 'image/svg+xml;charset=utf-8', testo: svgDelDiagramma },
});
/* il nome di ripiego nella lingua dell'interfaccia: un file scaricato porta la lingua di chi lo scarica */
const NOME_DEL_TIPO = Object.freeze({
  it: { tabella: 'tabella', grafico: 'grafico', scelte: 'scelte', modulo: 'modulo', 'chiave-valore': 'chiave-valore', passi: 'passi', avviso: 'avviso', cursore: 'cursore', metriche: 'metriche', confronto: 'confronto', diagramma: 'diagramma' },
  en: { tabella: 'table', grafico: 'chart', scelte: 'choices', modulo: 'form', 'chiave-valore': 'key-value', passi: 'steps', avviso: 'notice', cursore: 'slider', metriche: 'metrics', confronto: 'comparison', diagramma: 'diagram' },
});

/** `'csv' | 'svg' | 'txt'`: quale esportazione ha questo tipo (decide la voce del menu). */
export function formatoDiEsportazione(tipo) {
  return FORMATO[tipo]?.estensione ?? 'txt';
}

/**
 * @param {object} blocco un blocco completo del catalogo
 * @param {{ lingua?: 'it'|'en', ora?: Date }} [opzioni]
 * @returns {{ nome: string, testo: string, mime: string }}
 */
export function esportaBlocco(blocco, { lingua = 'en', ora = new Date() } = {}) {
  const f = FORMATO[blocco?.tipo];
  const estensione = f?.estensione ?? 'txt';
  const testo = f ? f.testo(blocco, lingua) : ripiegoTestuale(blocco, { lingua });
  /* una barra nel titolo («ottobre/per voce») separa due parole: diventa « - », non le incolla */
  const base = sanificaNomeFile(String(blocco?.titolo ?? '').replace(/\s*[/\\]\s*/gu, ' - '));
  const daTitolo = base && /[\p{L}\p{N}]/u.test(base) ? base : null;
  const it = italiano(lingua);
  const tipo = NOME_DEL_TIPO[it ? 'it' : 'en'][blocco?.tipo] || (it ? 'blocco' : 'block');
  const nome = `${daTitolo ?? `talos-${tipo}-${marcaTemporale(ora)}`}.${estensione}`;
  return { nome, testo, mime: f?.mime ?? 'text/plain;charset=utf-8' };
}
