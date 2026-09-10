/* Lo shimmer: si misura il CSS servito dal 4174 su un elemento con quella classe, montato nella MIA
   pagina (nessuna scrittura sul server). Poi si guarda che il segnavia sia nascosto. */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
const b = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
try {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(3500);
  const r = await p.evaluate(async () => {
    /* ⛔ La condizione dell'owner: l'interruttore «Riduci animazioni» dell'app acceso. */
    document.body.classList.add('reduce-motion');
    const riga = document.createElement('div');
    riga.className = 'talos-stack talos-waiting';
    riga.innerHTML = '<div class="talos-waiting__row"><svg class="talos-line-loader"></svg><span class="talos-waiting__label">TALOS sta elaborando la risposta…</span></div>';
    document.body.append(riga);
    const label = riga.querySelector('.talos-waiting__label');
    const loader = riga.querySelector('.talos-line-loader');
    const posizioni = [];
    for (let i = 0; i < 12; i += 1) { posizioni.push(getComputedStyle(label).backgroundPosition); await new Promise((x) => setTimeout(x, 100)); }
    const s = getComputedStyle(label);
    return {
      segnaviaNascosto: getComputedStyle(loader).display === 'none',
      animazione: s.animationName,
      coloreTesto: s.color,
      distinti: new Set(posizioni).size,
      esempi: posizioni.slice(0, 3),
    };
  });
  console.log(JSON.stringify(r, null, 2));
  console.log(r.segnaviaNascosto && r.distinti > 5 ? '✔ segnavia nascosto e shimmer che scorre' : '⛔ qualcosa non torna');
} finally { await b.close(); }
