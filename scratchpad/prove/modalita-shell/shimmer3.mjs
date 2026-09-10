/* Lo shimmer sopravvive alle due condizioni che prima ammazzavano ogni animazione? */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
const b = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const prova = async (nome, { reducedMotion, classeApp }) => {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async (app) => {
    if (app) document.body.classList.add('reduce-motion');
    const riga = document.createElement('div');
    riga.className = 'talos-stack talos-waiting';
    riga.innerHTML = '<div class="talos-waiting__row"><span class="talos-waiting__label">TALOS sta elaborando la risposta…</span></div>';
    document.body.append(riga);
    const l = riga.querySelector('.talos-waiting__label');
    const pos = [];
    for (let i = 0; i < 10; i += 1) { pos.push(getComputedStyle(l).backgroundPosition); await new Promise((x) => setTimeout(x, 110)); }
    return { distinti: new Set(pos).size, colore: getComputedStyle(l).color };
  }, classeApp);
  console.log(`${nome.padEnd(38)} posizioni distinte: ${String(r.distinti).padStart(2)}/10 · colore ${r.colore}`);
  await c.close();
  return r;
};
try {
  await prova('1) browser normale', { reducedMotion: 'no-preference', classeApp: false });
  await prova('2) interruttore «Riduci animazioni»', { reducedMotion: 'no-preference', classeApp: true });
  await prova('3) «riduci animazioni» di Windows', { reducedMotion: 'reduce', classeApp: false });
  await prova('4) tutt\'e due insieme', { reducedMotion: 'reduce', classeApp: true });
} finally { await b.close(); }
