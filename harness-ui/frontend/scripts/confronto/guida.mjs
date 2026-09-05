/*
 * La guida condivisa del confronto: apre TALOS (istanza di prova, MAI il 4174)
 * e si aggancia a Hermes Desktop, e per ogni passo di un gruppo esegue la
 * STESSA azione sulle due app, fotografa, misura, e scrive l'esito.
 *
 * Due canali per ogni passo (regola del 04/09, lavori 2026 sui GUI agent):
 * i pixel (screenshot) e la struttura (elementi premibili, testo). Un canale
 * solo mente.
 *
 * Ricerca 05/09/2026: Playwright `connectOverCDP` per l'app Electron
 * (docs Playwright, BrowserStack «connect to existing browser» 2026);
 * confronto pixel con pixelmatch come nel cancello di parità (`tests/parity/aiuto.mjs`).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { avviaHermes, PORTA_CDP_HERMES } from './avvia-hermes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

export const URL_TALOS = process.env.TALOS_CONFRONTO_URL || 'http://127.0.0.1:4175/';
if (/:4174\b/.test(URL_TALOS)) throw new Error('⛔ il 4174 è il server vivo dell\'owner: il confronto non lo tocca');
export const VIEWPORT = { width: 1440, height: 900 };
export const RADICE_USCITA = join(process.cwd(), 'artifacts/confronto');

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

/** TALOS: Chrome vero (non headless: le misure di fluidità mentono in background). */
export async function apriTalos({ headless = true } = {}) {
  const browser = await chromium.launch({
    channel: 'chrome', headless,
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const contesto = await browser.newContext({ viewport: VIEWPORT, locale: 'it-IT', colorScheme: 'dark' });
  const pagina = await contesto.newPage();
  const errori = [];
  pagina.on('pageerror', (e) => errori.push(String(e.message).slice(0, 200)));
  await pagina.goto(URL_TALOS);
  await pagina.waitForTimeout(2500);
  await pagina.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  return { nome: 'talos', browser, pagina, errori, chiudi: () => browser.close() };
}

/** Hermes Desktop: si aggancia alla finestra dell'app già aperta (o la apre). */
export async function apriHermes() {
  const avvio = await avviaHermes();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTA_CDP_HERMES}`);
  const contesti = browser.contexts();
  const pagine = contesti.flatMap((c) => c.pages()).filter((p) => !p.url().startsWith('devtools'));
  if (!pagine.length) throw new Error('Hermes: nessuna finestra agganciabile');
  const pagina = pagine[0];
  const errori = [];
  pagina.on('pageerror', (e) => errori.push(String(e.message).slice(0, 200)));
  await pagina.waitForTimeout(1000);
  return { nome: 'hermes', browser, pagina, errori, avvio, chiudi: () => browser.close() /* stacca, non chiude l'app */ };
}

/** La struttura: cosa si può premere e cosa c'è scritto — il secondo canale. */
export async function struttura(pagina) {
  return pagina.evaluate(() => {
    const visibile = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const premibili = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="menuitem"], input, textarea, select, [contenteditable="true"]')].filter(visibile);
    const nome = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return {
      titolo: document.title,
      premibili: premibili.length,
      senzaNome: premibili.filter((el) => !nome(el)).length,
      nomi: premibili.map(nome).filter(Boolean).slice(0, 80),
      fuoco: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}${document.activeElement.id ? '#' + document.activeElement.id : ''}` : null,
      testo: document.body.innerText.replace(/\s+/g, ' ').trim().length,
    };
  });
}

/** Quanti tasti Tab servono per arrivare a un elemento che risponde al predicato (tetto 60). */
export async function tabFinoA(pagina, predicato, tetto = 60) {
  for (let i = 1; i <= tetto; i += 1) {
    await pagina.keyboard.press('Tab');
    const ok = await pagina.evaluate(predicato);
    if (ok) return i;
  }
  return null;
}

/** Affianca due PNG (TALOS a sinistra, Hermes a destra) con un bordo. */
export function affianca(pngA, pngB) {
  const a = PNG.sync.read(pngA); const b = PNG.sync.read(pngB);
  const bordo = 8; const h = Math.max(a.height, b.height);
  const out = new PNG({ width: a.width + b.width + bordo, height: h });
  out.data.fill(0x33);
  PNG.bitblt(a, out, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, out, 0, 0, b.width, b.height, a.width + bordo, 0);
  return PNG.sync.write(out);
}

/**
 * Esegue un gruppo di passi. Ogni passo: { nome, blocco, talos: async(pagina)=>misure, hermes: async(pagina)=>misure, giudizio?: (t,h)=>esito }.
 * Scrive artifacts/confronto/<gruppo>/<blocco>/{talos,hermes,affiancato}.png e esiti.json.
 */
export async function eseguiGruppo(gruppo, passi, { headless = true } = {}) {
  const uscita = join(RADICE_USCITA, gruppo);
  mkdirSync(uscita, { recursive: true });
  const talos = await apriTalos({ headless });
  let hermes = null; let erroreHermes = null;
  try { hermes = await apriHermes(); } catch (e) { erroreHermes = String(e.message); }
  const esiti = [];
  let indice = 0;
  for (const passo of passi) {
    indice += 1;
    const riga = { blocco: passo.blocco, nome: passo.nome, talos: null, hermes: null, esito: 'NON MISURATO', nota: '' };
    // una cartella per PASSO (blocco + progressivo): tre passi sullo stesso blocco non si sovrascrivono le foto
    const cartella = join(uscita, `${String(indice).padStart(2, '0')}-${passo.blocco}`); mkdirSync(cartella, { recursive: true });
    riga.cartella = cartella;
    const t0 = performance.now();
    try { riga.talos = { ...(await passo.talos(talos.pagina, talos)), ms: Math.round(performance.now() - t0), struttura: await struttura(talos.pagina) }; }
    catch (e) { riga.talos = { errore: String(e.message).slice(0, 200) }; }
    const fotoT = await talos.pagina.screenshot({ path: join(cartella, 'talos.png') });
    let fotoH = null;
    if (hermes) {
      const t1 = performance.now();
      try { riga.hermes = { ...(await passo.hermes(hermes.pagina, hermes)), ms: Math.round(performance.now() - t1), struttura: await struttura(hermes.pagina) }; }
      catch (e) { riga.hermes = { errore: String(e.message).slice(0, 200) }; }
      fotoH = await hermes.pagina.screenshot({ path: join(cartella, 'hermes.png') });
      writeFileSync(join(cartella, 'affiancato.png'), affianca(fotoT, fotoH));
    } else riga.nota = `Hermes non agganciato: ${erroreHermes}`;
    if (passo.giudizio && riga.talos && riga.hermes && !riga.talos.errore && !riga.hermes.errore) {
      const g = passo.giudizio(riga.talos, riga.hermes); riga.esito = g.esito; riga.nota = g.nota || '';
    }
    esiti.push(riga);
    console.log(`  ${riga.esito.padEnd(12)} ${passo.blocco} · ${passo.nome}${riga.nota ? ' — ' + riga.nota : ''}`);
  }
  const rapporto = { gruppo, quando: new Date().toISOString(), urlTalos: URL_TALOS, hermes: hermes ? { versione: hermes.avvio?.versione, giaAperto: hermes.avvio?.giaAperto } : { errore: erroreHermes }, erroriPagina: { talos: talos.errori, hermes: hermes?.errori || [] }, esiti };
  writeFileSync(join(uscita, 'esiti.json'), JSON.stringify(rapporto, null, 2));
  await talos.chiudi(); if (hermes) await hermes.chiudi();
  return rapporto;
}

export { attesa };
