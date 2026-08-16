/**
 * ⭐ L'INTESTAZIONE DEL README, GENERATA DALL'APP — non ridisegnata a mano.
 *
 * Owner 2026-08-16: «in testata al readme dobbiamo mettere il logo, quello che
 * compare **lo stesso identico** nella schermata nuova chat, e poi sotto la
 * scritta TALOS in Orbitron».
 *
 * ⛔ «Lo stesso identico» è un vincolo, non un aggettivo. Perciò qui dentro non
 * c'è nessun disegno nuovo: si prende `public/talos/brand/logo-short.svg` — il
 * file che l'app usa come maschera — e il woff2 di Orbitron che l'app
 * impacchetta davvero. Se il marchio cambia, questa intestazione cambia con lui;
 * un SVG ricopiato a mano no, e nessuno se ne accorgerebbe per mesi.
 *
 * ## Perché una PNG e non un SVG
 *
 * GitHub serve le immagini del README attraverso un proxy e le mostra come
 * IMMAGINI: niente CSS della pagina, niente `currentColor`, e i font esterni non
 * si caricano. Un SVG col testo resterebbe senza Orbitron, cioè senza la cosa
 * che l'owner ha chiesto. ⇒ Si rasterizza, con il font incorporato al momento
 * dello scatto.
 *
 * ## Perché un colore solo
 *
 * Nell'app «TALOS» è chiaro sotto un marchio ambra, perché il fondo è scuro. Un
 * README si legge su DUE fondi: bianco e nero. Il bianco sparirebbe sul chiaro.
 * ⇒ Il blocco è tutto nell'ambra del tema — leggibile su entrambi, e fedele
 * all'accento del marchio.
 *
 *   node scripts/intestazione-readme.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { chromium } from 'playwright'

const RADICE = resolve(import.meta.dirname, '..')
const ACCENTO = '#c98b32'
const FUORI = resolve(RADICE, 'docs/immagini/talos-logo.png')

const marchio = readFileSync(resolve(RADICE, 'public/talos/brand/logo-short.svg'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replaceAll('currentColor', ACCENTO)

const font = readFileSync(
    resolve(RADICE, 'dist/assets/orbitron-latin-600-normal-mazHmDYu.woff2'),
).toString('base64')

const pagina = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Orbitron';
    font-weight: 600;
    font-style: normal;
    src: url(data:font/woff2;base64,${font}) format('woff2');
  }
  html, body { margin: 0; padding: 0; background: transparent; }
  /*
     Nessuno spazio fra marchio e parola: l'SVG ha gia' il suo respiro dentro
     il viewBox — l'arte vive fra y=105 e y=419 su 500. Aggiungerne altro
     spezzava il blocco in due cose separate invece di un marchio solo.
  */
  .blocco {
    width: 1200px;
    padding: 8px 0 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .marchio { width: 300px; height: 300px; display: block; }
  .parola {
    font-family: 'Orbitron';
    font-weight: 600;
    font-size: 132px;
    line-height: 1;
    letter-spacing: 0;
    color: ${ACCENTO};
  }
</style>
<div class="blocco">
  <div class="marchio">${marchio.replace('<svg', '<svg width="300" height="300"')}</div>
  <div class="parola">TALOS</div>
</div>`

const browser = await chromium.launch()
const pag = await browser.newPage({ viewport: { width: 1200, height: 620 }, deviceScaleFactor: 2 })
await pag.setContent(pagina)
await pag.evaluate(() => document.fonts.ready)
const blocco = await pag.locator('.blocco')
mkdirSync(dirname(FUORI), { recursive: true })
await blocco.screenshot({ path: FUORI, omitBackground: true })
await browser.close()

const peso = readFileSync(FUORI).length
console.log(`  scritta ${FUORI}`)
console.log(`  ${(peso / 1024).toFixed(0)} KB, fondo trasparente, ${ACCENTO}`)
