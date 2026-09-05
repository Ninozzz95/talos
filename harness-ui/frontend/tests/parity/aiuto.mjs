import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/*
 * Gli attrezzi condivisi dei cancelli di parità (pagina statica e componenti).
 * Le stesse regole del cancello di Fase 0: stessi font locali da entrambe le
 * parti, mockup servito in standards mode (col doctype davanti), regia nascosta,
 * animazioni spente, e un diff scritto su disco SOLO quando serve a qualcuno.
 */
export const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MOCKUP = pathToFileURL(path.resolve(radice, '../../.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html')).href;
export const ARTEFATTI = path.resolve(radice, 'artifacts/parita');
const FONT_DIR = pathToFileURL(path.resolve(radice, 'dist/fonts')).href;
export const FONT_LOCALI = [
  ['Instrument Sans', 400, 'instrument-sans-latin-400-normal'],
  ['Instrument Sans', 500, 'instrument-sans-latin-500-normal'],
  ['Instrument Sans', 600, 'instrument-sans-latin-600-normal'],
  ['JetBrains Mono', 400, 'jetbrains-mono-latin-400-normal'],
  ['JetBrains Mono', 500, 'jetbrains-mono-latin-500-normal'],
].map(([famiglia, peso, file]) => `@font-face{font-family:'${famiglia}';font-weight:${peso};font-style:normal;font-display:block;src:url('${FONT_DIR}/${file}.woff2') format('woff2')}`).join('');
export const SOGLIA_PIXEL = 0.12;
export const QUOTA_MASSIMA = 0.004;

export async function apri(browser, url, { js = true, viewport }) {
  // locale it-IT: la regia del mockup risolve la lingua da navigator.language (Chrome headless = en-US),
  // e la app è italiana per default — senza questo il confronto delle PAROLE è fra due lingue
  const contesto = await browser.newContext({ viewport, reducedMotion: 'reduce', colorScheme: 'dark', locale: 'it-IT' });
  if (!js) await contesto.route('**/app.js', (rotta) => rotta.abort());
  await contesto.route(/fonts\.(googleapis|gstatic)\.com/, (rotta) => rotta.abort());
  if (url === MOCKUP) {
    const corpo = await readFile(fileURLToPath(MOCKUP));
    await contesto.route(MOCKUP, (rotta) => rotta.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: Buffer.concat([Buffer.from('<!doctype html>\n'), corpo]) }));
  }
  const pagina = await contesto.newPage();
  await pagina.goto(url, { waitUntil: 'load' });
  await pagina.addStyleTag({ content: `${FONT_LOCALI} .talos-regia{display:none!important} *{transition:none!important;animation:none!important;caret-color:transparent!important}` });
  await pagina.evaluate(() => document.fonts.ready);
  return { contesto, pagina };
}

const DI_SESSIONE = new Set(['chat', 'vuota', 'terminale', 'review']);
export const nomeBreve = (id) => id.replace(/^schermo/, '').toLowerCase();

/** Mostra UNA schermata (e i suoi attributi di radice) come fa la regia del mockup. */
export async function mostra(pagina, id, velo = null) {
  const nome = nomeBreve(id);
  await pagina.evaluate(({ mostrata, veloAperto, nome, sessione }) => {
    for (const el of document.querySelectorAll('[id^="schermo"]')) el.hidden = el.id !== mostrata;
    for (const v of document.querySelectorAll('[id^="velo"]')) v.hidden = v.id !== veloAperto;
    document.documentElement.setAttribute('data-vista', sessione ? 'sessione' : 'pagina');
    document.documentElement.setAttribute('data-schermo', nome);
  }, { mostrata: id, veloAperto: velo, nome, sessione: DI_SESSIONE.has(nome) });
}

/** La struttura: sequenza dei data-c e delle classi talos-*, in ordine di documento. */
export async function struttura(pagina, selettore) {
  return pagina.evaluate((sel) => {
    const radice = document.querySelector(sel);
    if (!radice) return null;
    const righe = [];
    for (const el of radice.querySelectorAll('*')) {
      const c = el.getAttribute('data-c');
      const classi = [...el.classList].filter((k) => k.startsWith('talos-')).sort().join(' ');
      if (c || classi) righe.push(`${el.tagName.toLowerCase()}${c ? '[' + c + ']' : ''}${classi ? '.' + classi : ''}`);
    }
    return righe;
  }, selettore);
}

/** I testi visibili, per confrontare le PAROLE oltre alla forma. */
export async function testi(pagina, selettore) {
  return pagina.evaluate((sel) => {
    const radice = document.querySelector(sel);
    return radice ? radice.innerText.replace(/\s+/gu, ' ').trim() : null;
  }, selettore);
}

export async function confrontaPixel(nome, a, b) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  await mkdir(ARTEFATTI, { recursive: true });
  if (pa.width !== pb.width || pa.height !== pb.height) {
    await writeFile(path.join(ARTEFATTI, `${nome}-mockup.png`), a);
    await writeFile(path.join(ARTEFATTI, `${nome}-app.png`), b);
    return { ok: false, motivo: `dimensioni diverse: mockup ${pa.width}×${pa.height}, app ${pb.width}×${pb.height}` };
  }
  const diff = new PNG({ width: pa.width, height: pa.height });
  const diversi = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: SOGLIA_PIXEL });
  const quota = diversi / (pa.width * pa.height);
  const ok = quota <= QUOTA_MASSIMA;
  // Le due immagini si scrivono SEMPRE: un verde sotto soglia non esonera dal guardarle
  // (regola dell'owner, 05/09: senza confronto visivo non è green). Il diff solo se serve.
  await writeFile(path.join(ARTEFATTI, `${nome}-mockup.png`), a);
  await writeFile(path.join(ARTEFATTI, `${nome}-app.png`), b);
  if (!ok) await writeFile(path.join(ARTEFATTI, `${nome}-diff.png`), PNG.sync.write(diff));
  return { ok, motivo: `${diversi} pixel diversi (${(quota * 100).toFixed(3)}%)`, quota };
}
