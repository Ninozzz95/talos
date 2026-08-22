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
 * ## ⛔ DUE VARIANTI, e perché non una sola
 *
 * Owner 2026-08-16: «la scritta TALOS in Orbitron deve essere BIANCA, non
 * bronzo». Giusto: nell'app è così — chiara sotto un marchio ambra.
 *
 * Ma nell'app il fondo è scuro, sempre. Un README si legge su DUE fondi, e il
 * bianco su bianco sparisce. La prima versione aveva risolto facendo tutto
 * ambra, che è leggibile ovunque ma non è quello che l'app mostra.
 *
 * ⇒ Si generano DUE immagini con i colori veri del tema — `--talos-text` del
 * tema scuro e di quello chiaro — e le sceglie `<picture>` con
 * `prefers-color-scheme`. Il marchio resta ambra in entrambe, perché
 * l'accento non cambia col tema.
 *
 * Nessuno dei due fondi viene sacrificato, e su quello scuro — dove la maggior
 * parte legge — è esattamente la schermata nuova chat.
 *
 *   node scripts/intestazione-readme.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { chromium } from 'playwright'

const RADICE = resolve(import.meta.dirname, '..')
const ACCENTO = '#c98b32'

/*
 * I colori veri del tema `forge`, presi dal file delle identita' cromatiche:
 * e' `--talos-text` sul tema scuro e su quello chiaro. Non scelti a occhio.
 */
const VARIANTI = [
    { nome: 'talos-logo.png', parola: '#edf2f7', per: 'tema scuro' },
    { nome: 'talos-logo-chiaro.png', parola: '#111827', per: 'tema chiaro' },
]

const marchio = readFileSync(resolve(RADICE, 'public/talos/brand/logo-short.svg'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replaceAll('currentColor', ACCENTO)

const font = readFileSync(
    resolve(RADICE, 'dist/assets/orbitron-latin-600-normal-mazHmDYu.woff2'),
).toString('base64')

const pagina = (COLORE_PAROLA) => `<!doctype html>
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
    color: ${COLORE_PAROLA};
  }
</style>
<div class="blocco">
  <div class="marchio">${marchio.replace('<svg', '<svg width="300" height="300"')}</div>
  <div class="parola">TALOS</div>
</div>`

const browser = await chromium.launch()
for (const variante of VARIANTI) {
    const pag = await browser.newPage({ viewport: { width: 1200, height: 620 }, deviceScaleFactor: 2 })
    await pag.setContent(pagina(variante.parola))
    await pag.evaluate(() => document.fonts.ready)
    const fuori = resolve(RADICE, 'docs/immagini', variante.nome)
    mkdirSync(dirname(fuori), { recursive: true })
    await pag.locator('.blocco').screenshot({ path: fuori, omitBackground: true })
    await pag.close()
    console.log(`  ${variante.nome.padEnd(24)} ${(readFileSync(fuori).length / 1024).toFixed(0)} KB   parola ${variante.parola} (${variante.per})`)
}
await browser.close()
