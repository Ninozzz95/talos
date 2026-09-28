/*
 * R4 — ATTIVITÀ COMPATTA · IL CONFRONTO AFFIANCATO («testa a testa col mockup, sempre», regola dell'11/09).
 *
 * Prende le foto a pagina intera già scattate (`attuale-*` dal prodotto, `proposta-*` dal laboratorio),
 * ritaglia la colonna della chat alla STESSA x in tutte e due, e le mette una accanto all'altra con la
 * misura sotto: altezza del segmento e clic che servono per arrivarci. Nessun server: Chrome disegna una
 * pagina locale fatta di due immagini. Uso: `node lab/attivita-compatta/confronto.mjs` da `frontend/`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const QUI = fileURLToPath(new URL('.', import.meta.url));
const FOTO = resolve(QUI, '..', '..', '..', 'docs', 'foto-attivita');
const SCENE = ['breve', 'lungo', 'vivo', 'errore', 'narrata'];
const STATI = { S0: 'come arriva', S1: 'un clic sulla riga', S2: 'tutte le voci e i ragionamenti leggibili' };
/* La colonna della chat nelle tre larghezze (misurata sulle foto: 498–1266 a 1920, 320–1010 a 1440, 276–1024 a 1024 senza pannello destro). */
const RITAGLIO = { '1920x1080': { x: 470, w: 824, h: 1080 }, '1440x900': { x: 292, w: 746, h: 900 }, '1024x800': { x: 276, w: 748, h: 800 } };
/*
 * Fase 2 (24/09/2026): `node lab/attivita-compatta/confronto.mjs prodotto` mette a confronto TRE colonne — il prodotto
 * di prima (`attuale-*`, se la foto esiste), il prodotto DOPO la cura (`prodotto-*`) e il prototipo (`proposta-*`) —
 * in `confronto-prodotto-<scena>-<stato>-<larghezza>-<tema>.png`. Senza argomento resta il confronto di fase 1.
 */
const SERIE = process.argv[2] === 'prodotto' ? 'prodotto' : 'fase1';

const dati = (f) => `data:image/png;base64,${readFileSync(join(FOTO, f)).toString('base64')}`;
const misure = (tipo, vp, tema) => {
  const f = join(FOTO, `misure-${tipo}-${vp}-${tema}.json`);
  if (!existsSync(f)) return [];
  const letto = JSON.parse(readFileSync(f, 'utf8'));
  return Array.isArray(letto) ? letto : (letto.foto || []); // le misure del prodotto (fase 2) portano anche errori e non-GET accanto alle foto
};
function riga(m) {
  if (!m) return 'non misurato';
  const seg = m.segmenti.map((s) => `${Math.round(s.altezza)} px`).join(' + ') || 'nessun segmento';
  return `segmento ${seg} · turno ${Math.round(m.turnoTalos)} px · ${m.clic} clic${m.apertoDaSolo ? ' (aperto da solo per l’errore)' : ''}${m.clicViaMenu ? ` (o ${m.clicViaMenu} dal menu «⋯»)` : ''}`;
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
let fatte = 0;
for (const vp of Object.keys(RITAGLIO)) {
  for (const tema of ['dark', 'light']) {
    const mA = misure('attuale', vp, tema);
    const mP = misure('proposta', vp, tema);
    const mD = misure('prodotto', vp, tema);
    for (const scena of SCENE) {
      for (const stato of Object.keys(STATI)) {
        const a = `attuale-${scena}-${stato}-${vp}-${tema}.png`;
        const p = `proposta-${scena}-${stato}-${vp}-${tema}.png`;
        const d = `prodotto-${scena}-${stato}-${vp}-${tema}.png`;
        const colonne = SERIE === 'prodotto'
          ? [
            existsSync(join(FOTO, a)) ? [a, 'Prima: il prodotto del 23/09', mA] : null,
            [d, 'Dopo: il prodotto con la cura (24/09)', mD],
            [p, 'Il prototipo di laboratorio (stessi eventi)', mP],
          ].filter(Boolean)
          : [[a, 'Oggi, il prodotto (build di questo worktree)', mA], [p, 'Proposta, il prototipo di laboratorio (stessi eventi)', mP]];
        if (colonne.some(([f]) => !existsSync(join(FOTO, f)))) continue;
        const { x, w, h } = RITAGLIO[vp];
        const scuro = tema === 'dark';
        const colonna = (src, titolo, misura) => `
          <figure><figcaption><b>${titolo}</b><span>${misura}</span></figcaption>
          <div class="r" style="width:${w}px;height:${h}px"><img src="${src}" style="left:${-x}px"></div></figure>`;
        await page.setViewportSize({ width: w * colonne.length + 24 * (colonne.length + 1), height: h + 110 });
        await page.setContent(`<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
          body{margin:0;padding:16px 24px;background:${scuro ? '#111214' : '#dcd8cf'};color:${scuro ? '#e6e3dc' : '#232427'};
            font:13px/1.4 "Instrument Sans",system-ui,sans-serif}
          h1{font-size:15px;font-weight:600;margin:0 0 10px}
          main{display:flex;gap:24px} figure{margin:0}
          figcaption{display:flex;flex-direction:column;gap:2px;margin:0 0 8px} figcaption span{opacity:.75;font-variant-numeric:tabular-nums}
          .r{position:relative;overflow:hidden;border-radius:10px;outline:1px solid ${scuro ? '#2c2e33' : '#b9b4aa'}}
          .r img{position:absolute;top:0}
        </style></head><body>
          <h1>Scena «${scena}» · ${stato}, ${STATI[stato]} · ${vp} · tema ${scuro ? 'scuro' : 'chiaro'}</h1>
          <main>${colonne.map(([f, titolo, m]) => colonna(dati(f), titolo, riga(m.find((x) => x.foto === f)))).join('')}</main>
        </body></html>`);
        await page.waitForFunction(() => [...document.images].every((i) => i.complete));
        await page.screenshot({ path: join(FOTO, `confronto-${SERIE === 'prodotto' ? 'prodotto-' : ''}${scena}-${stato}-${vp}-${tema}.png`), fullPage: true });
        fatte += 1;
      }
    }
  }
}
await browser.close();
console.log(`Confronti affiancati: ${fatte}`);
