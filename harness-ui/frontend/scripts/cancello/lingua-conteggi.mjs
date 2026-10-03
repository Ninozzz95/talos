#!/usr/bin/env node
/*
 * Cancello della lingua — i CONTEGGI che il cricchetto confronta con le soglie committate (owner 03/10/2026: «cricchetto da
 * subito, zero a fine fase»). Legge il disco; il giudizio sta nei moduli puri (`testi-a-schermo.mjs`) e nella prova
 * (`tests/unit/lingua-cancello.test.mjs`).
 *
 *   node scripts/cancello/lingua-conteggi.mjs            stampa i conteggi di oggi
 *   node scripts/cancello/lingua-conteggi.mjs --scrivi   riscrive `lingua-soglie.json` coi conteggi di oggi
 *
 * ⛔ `--scrivi` si usa per ABBASSARE le soglie dopo una migrazione, mai per alzarle: la prova fallisce se un conteggio sale,
 *   e alzare la soglia per farla passare è esattamente il difetto che il cancello esiste per impedire.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { eTestoDaTradurre, frasiItalianeNelSorgente, testiFissiNelSorgente, tipoDiScript } from './testi-a-schermo.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
export const RADICE_FRONTEND = join(QUI, '..', '..');
export const FILE_SOGLIE = join(QUI, 'lingua-soglie.json');
const FORMA_DELLA_CHIAVE = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+$/u;
const CHIAMATE_DEL_DIZIONARIO = new Set(['t', 'tn', 'tr']);

/**
 * I file del frontend che disegnano: tutto `src/` tranne i dizionari e le risorse copiate da fuori.
 * 03/10/2026: anche `.ts`/`.tsx` (non le dichiarazioni `.d.ts`). Prima solo `.js`, e 153 frasi italiane in 7 file TypeScript
 *   (Impostazioni, comandi, barra di navigazione, catalogo) restavano fuori dal cancello.
 */
export function fileDelFrontend(radice = RADICE_FRONTEND) {
  const fuori = [];
  const giro = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (!['assets', 'i18n', 'vendor'].includes(n)) giro(p); }
      else if (/\.(?:js|tsx?)$/u.test(n) && !n.endsWith('.d.ts')) fuori.push(p);
    }
  };
  giro(join(radice, 'src'));
  return fuori.sort();
}

/** Le chiamate al dizionario di un sorgente: le chiavi stabili usate e quante frasi italiane vecchie restano. */
export function chiamateDelDizionario(sorgente, file = 'sorgente.js') {
  const sf = ts.createSourceFile(file, sorgente, ts.ScriptTarget.Latest, true, tipoDiScript(file));
  const chiavi = [];
  let vecchie = 0;
  const visita = (nodo) => {
    if (ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression) && CHIAMATE_DEL_DIZIONARIO.has(nodo.expression.text)) {
      const argomenti = nodo.expression.text === 'tn' ? nodo.arguments.slice(0, 2) : nodo.arguments.slice(0, 1);
      for (const a of argomenti) {
        if (!a || !ts.isStringLiteralLike(a)) continue;
        if (FORMA_DELLA_CHIAVE.test(a.text)) chiavi.push(a.text);
        else if (eTestoDaTradurre(a.text)) vecchie += 1;
      }
    }
    ts.forEachChild(nodo, visita);
  };
  visita(sf);
  return { chiavi, vecchie };
}

/**
 * Ogni letterale che HA LA FORMA di una chiave di un'area del dizionario (`home.openAProject`, `comandi.reason.waitForRun`), ovunque
 *   stia: anche quando arriva a `t()` passando da un aiuto (`node('p', '', 'home.x')`) o da una tabella. 03/10/2026: la Home e il
 *   registro dei comandi passano le chiavi così, e `chiamateDelDizionario` vede solo le chiamate dirette — una chiave sbagliata
 *   sarebbe uscita GREZZA a schermo senza un rosso. Misurato alla nascita: 6.250 letterali, 0 mancanti, nessun falso positivo.
 */
export function chiaviLetteraliNelSorgente(sorgente, file, aree) {
  const sf = ts.createSourceFile(file, sorgente, ts.ScriptTarget.Latest, true, tipoDiScript(file));
  const chiavi = [];
  const visita = (nodo) => {
    if (ts.isStringLiteralLike(nodo) && FORMA_DELLA_CHIAVE.test(nodo.text) && aree.has(nodo.text.split('.')[0])) chiavi.push(nodo.text);
    ts.forEachChild(nodo, visita);
  };
  visita(sf);
  return chiavi;
}

const ELEMENTI_VUOTI = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ATTRIBUTI_LETTI = new Set(['aria-label', 'title', 'placeholder', 'alt']);

/*
 * ⛔ Corsia S1 (03/10/2026): il modello HTML si legge con una PILA di elementi, non con una regex sui `>testo<`, perché il
 *   cancello deve sapere A CHI appartiene un testo. Le regole sono quelle di `applicaLingua`:
 *   - un `data-t` con una CHIAVE STABILE copre il PRIMO testo non vuoto del suo elemento, e solo quello (un badge figlio o un
 *     testo dopo un figlio restano scoperti, e si contano);
 *   - `data-t-attr="[title]a.b;[aria-label]c.d"` copre gli attributi nominati, con una chiave stabile;
 *   - un `data-t` con una FRASE italiana (il dizionario vecchio) non copre niente: conta come prima.
 *   Nessuna dipendenza nuova: il modello è nostro e ben formato, e la prova misura che senza chiavi i conteggi sono identici
 *   a quelli della regex di prima (1.496/452 e 314/40 al 03/10).
 */
function leggiModelloHtml(html) {
  /* `<!doctype html>` non è testo: con la regex di prima non lo era per costruzione, qui va tolto come i commenti. */
  const pulito = html.replace(/<script[\s\S]*?<\/script>/giu, '').replace(/<style[\s\S]*?<\/style>/giu, '').replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<![^>]*>/gu, '');
  const pila = [];
  const chiavi = [];
  const coppie = [];
  let testi = 0;
  let attributi = 0;
  for (const m of pulito.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/gu)) {
    if (m[4] !== undefined) {
      /* Il testo si DECODIFICA prima di decidere se c'è: `&nbsp;` da solo non è un testo (per `applicaLingua` il nodo, con `trim()`,
         è vuoto), e uno spazio rigido ai bordi non fa parte della frase. Gli spazi interni si riducono prima, così uno rigido resta. */
      const testo = decodifica(m[4].replace(/\s+/gu, ' ')).trim();
      if (!testo) continue;
      const cima = pila.at(-1);
      if (cima?.chiave && !cima.coperto) { cima.coperto = true; coppie.push({ chiave: cima.chiave, scritto: testo }); continue; }
      if (eTestoDaTradurre(testo)) testi += 1;
      continue;
    }
    const [, chiusura, nome, resto] = m;
    const tag = nome.toLowerCase();
    if (chiusura) {
      const i = pila.map((e) => e.tag).lastIndexOf(tag);
      if (i >= 0) pila.length = i;
      continue;
    }
    const attr = new Map();
    for (const a of resto.matchAll(/([^\s=\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gu)) attr.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? '');
    const dataT = attr.get('data-t');
    const chiave = dataT && FORMA_DELLA_CHIAVE.test(dataT) ? dataT : null;
    if (chiave) chiavi.push(chiave);
    const coperti = new Set();
    for (const pezzo of String(attr.get('data-t-attr') ?? '').split(';')) {
      const p = /^\s*\[([a-zA-Z-]+)\]\s*(\S+)\s*$/u.exec(pezzo);
      if (p && FORMA_DELLA_CHIAVE.test(p[2])) {
        coperti.add(p[1].toLowerCase());
        chiavi.push(p[2]);
        if (attr.has(p[1].toLowerCase())) coppie.push({ chiave: p[2], scritto: decodifica(attr.get(p[1].toLowerCase()).replace(/\s+/gu, ' ').trim()) });
      }
    }
    for (const [n, v] of attr) if (ATTRIBUTI_LETTI.has(n) && !coperti.has(n) && eTestoDaTradurre(v)) attributi += 1;
    if (!ELEMENTI_VUOTI.has(tag) && !/\/\s*$/u.test(resto)) pila.push({ tag, chiave, coperto: false });
  }
  return { testi, attributi, chiavi, coppie };
}

/** Le entità che il modello usa davvero: il browser le decodifica, il dizionario contiene il testo decodificato. */
function decodifica(testo) {
  return testo.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/giu, (_, dec, hex, nome) => (dec ? String.fromCodePoint(Number(dec))
    : hex ? String.fromCodePoint(parseInt(hex, 16)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[nome.toLowerCase()]));
}

/*
 * ⛔ Corsia S1 (03/10/2026): in ITALIANO lo schermo non deve cambiare. Ogni `data-t` (il primo testo del suo elemento) e ogni
 *   attributo di `data-t-attr` deve avere come voce italiana ESATTAMENTE il testo scritto nel modello (spazi ridotti a uno,
 *   entità decodificate). Torna le differenze: `[]` se è tutto identico. `lingua` è `TESTI.it`.
 */
export function differenzeItalianeDelModello(html, lingua) {
  return leggiModelloHtml(html).coppie.filter(({ chiave, scritto }) => lingua[chiave] !== undefined && lingua[chiave] !== scritto)
    .map(({ chiave, scritto }) => `${chiave}: nel modello «${scritto}», nel dizionario «${lingua[chiave]}»`);
}

/** I testi del modello HTML senza chiave stabile: nodi di testo e attributi letti dalla persona. */
export function testiDelModelloHtml(html) {
  const { testi, attributi } = leggiModelloHtml(html);
  return { testi, attributi };
}

/** Le chiavi stabili scritte nel modello HTML (`data-t`, `data-t-attr`): devono esistere nel dizionario (LINGUA-1-USATE). */
export function chiaviDelModelloHtml(html) {
  return leggiModelloHtml(html).chiavi;
}

/** Tutti i conteggi di oggi. */
export function conteggiDiOggi(radice = RADICE_FRONTEND) {
  const testiFissi = {};
  const frasiVecchie = {};
  const frasiItaliane = {};
  const chiaviUsate = [];
  for (const f of fileDelFrontend(radice)) {
    const nome = relative(radice, f).replace(/\\/gu, '/');
    const sorgente = readFileSync(f, 'utf8');
    const fissi = testiFissiNelSorgente(sorgente, nome).length;
    if (fissi) testiFissi[nome] = fissi;
    const italiane = frasiItalianeNelSorgente(sorgente, nome).length;
    if (italiane) frasiItaliane[nome] = italiane;
    const { chiavi, vecchie } = chiamateDelDizionario(sorgente, nome);
    if (vecchie) frasiVecchie[nome] = vecchie;
    for (const chiave of chiavi) chiaviUsate.push({ file: nome, chiave });
  }
  const sorgenteModello = readFileSync(join(radice, 'index.template.html'), 'utf8');
  const sorgenteFrammenti = readFileSync(join(radice, 'src', 'legacy', 'frammenti.html'), 'utf8');
  for (const chiave of chiaviDelModelloHtml(sorgenteModello)) chiaviUsate.push({ file: 'index.template.html', chiave });
  for (const chiave of chiaviDelModelloHtml(sorgenteFrammenti)) chiaviUsate.push({ file: 'src/legacy/frammenti.html', chiave });
  const html = testiDelModelloHtml(sorgenteModello);
  /* 03/10/2026: anche i frammenti del modello (`src/legacy/frammenti.html`, 45 KB: il Laboratorio, «Prova tutti»…) sono testo a
     schermo, e il cancello non li guardava. Un campo loro, con la loro soglia: il cricchetto resta monotono campo per campo. */
  const htmlFrammenti = testiDelModelloHtml(sorgenteFrammenti);
  return { testiFissi, frasiVecchie, frasiItaliane, html, htmlFrammenti, chiaviUsate };
}

const somma = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/**
 * Il cricchetto, PURO: che cosa supera le soglie. Un file che non c'è nelle soglie ha soglia zero — un file nuovo nasce già
 * tradotto. Torna le righe da dire, vuote se tutto è a posto; `migliorati` dice dove si può abbassare la soglia.
 */
export function confrontaConSoglie(conteggi, soglie) {
  const superati = [];
  const migliorati = [];
  for (const campo of ['testiFissi', 'frasiVecchie', 'frasiItaliane']) {
    const oggi = conteggi[campo] || {};
    const limite = soglie[campo] || {};
    for (const [file, n] of Object.entries(oggi)) {
      const max = limite[file] ?? 0;
      if (n > max) superati.push(`${campo}: ${file} ne ha ${n}, la soglia è ${max}`);
      else if (n < max) migliorati.push(`${campo}: ${file} ${max} → ${n}`);
    }
    for (const [file, max] of Object.entries(limite)) if (!(file in oggi) && max > 0) migliorati.push(`${campo}: ${file} ${max} → 0`);
  }
  for (const modello of ['html', 'htmlFrammenti']) {
    for (const campo of ['testi', 'attributi']) {
      const n = conteggi[modello]?.[campo] ?? 0;
      const max = soglie[modello]?.[campo] ?? 0;
      if (n > max) superati.push(`${modello}.${campo}: ${n}, la soglia è ${max}`);
      else if (n < max) migliorati.push(`${modello}.${campo}: ${max} → ${n}`);
    }
  }
  return { superati, migliorati };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const c = conteggiDiOggi();
  console.log(`testi fissi a schermo: ${somma(c.testiFissi)} in ${Object.keys(c.testiFissi).length} file`);
  console.log(`frasi italiane vecchie passate a t(): ${somma(c.frasiVecchie)} in ${Object.keys(c.frasiVecchie).length} file`);
  console.log(`frasi italiane scritte nel codice (strato 2b): ${somma(c.frasiItaliane)} in ${Object.keys(c.frasiItaliane).length} file`);
  console.log(`modello HTML senza chiave: ${c.html.testi} testi, ${c.html.attributi} attributi`);
  console.log(`frammenti HTML senza chiave: ${c.htmlFrammenti.testi} testi, ${c.htmlFrammenti.attributi} attributi`);
  console.log(`chiavi stabili usate: ${c.chiaviUsate.length}`);
  if (process.argv.includes('--scrivi')) {
    const soglie = { nota: 'Le soglie del cricchetto della lingua (owner 03/10/2026). Si abbassano dopo una migrazione, MAI si alzano. Obiettivo: tutto a zero.',
      testiFissi: c.testiFissi, frasiVecchie: c.frasiVecchie, frasiItaliane: c.frasiItaliane, html: c.html, htmlFrammenti: c.htmlFrammenti };
    writeFileSync(FILE_SOGLIE, `${JSON.stringify(soglie, null, 2)}\n`, 'utf8');
    console.log(`scritto ${FILE_SOGLIE}`);
  }
}
