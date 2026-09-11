/*
 * Sonda BC-04 — «regressione di stile nel selettore dei modelli locali».
 *
 * Non tocca il 4174: apre il dist costruito in questo worktree, servito da
 * `banco/serve.mjs` su una porta mia, e stoppa le API con fixture.
 * Misura i PIXEL (scrollWidth/clientWidth e i rettangoli veri), non il DOM.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
/* playwright-core sta nel node_modules del frontend copiato qui: lo importo per percorso. */
const { chromium } = await import(pathToFileURL(path.resolve(QUI, '..', 'harness-ui', 'frontend', 'node_modules', 'playwright-core', 'index.mjs')).href);
const FOTO = path.resolve(QUI, 'foto');
const BASE = process.env.BASE || 'http://127.0.0.1:4193/';
const ETICHETTA = process.env.ETICHETTA || 'dopo';

/* Il modello della segnalazione: la chiave del runtime, 102 caratteri. */
const ID_LUNGO = 'bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf';

const LOCALI = {
  items: [
    { id: ID_LUNGO, name: '', bytes: 18_500_000_000, state: 'ready' },
    { id: 'unsloth-gemma-3-4b-it-GGUF-gemma-3-4b-it-Q4_K_M-gguf', name: '', bytes: 2_490_000_000, state: 'ready' },
    { id: 'LiquidAI-LFM2-1.2B-GGUF-LFM2-1.2B-Q8_0-gguf', name: '', bytes: 1_250_000_000, state: 'scaricato' },
    /*
     * ⛔ Il VERSO CONTRARIO: un id che nemmeno `nomeModelloUmano` riesce ad accorciare
     * (nessun segmento di parametri, nessuna quantizzazione da tagliare). Se l'ellissi
     * esiste davvero, questa riga deve TRONCARE e non sfondare; se la lista tornasse a
     * scorrere in orizzontale, è qui che si vedrebbe per prima.
     */
    { id: 'unaCasaEditriceMoltoLunga-un-modello-dal-nome-interminabile-che-nessuna-regola-puo-accorciare-perche-non-dichiara-ne-parametri-ne-quantizzazione', name: '', bytes: 900_000_000, state: 'ready' },
  ],
};

const MODELLI = {
  modelli: [
    { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', context_length: 200000, pricing: { prompt: '0.0000002', completion: '0.0000008' } },
    { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash', context_length: 1000000, pricing: { prompt: '0.0000003', completion: '0.0000012' } },
  ],
  daCache: true,
};

const mancanti = new Set();

function busta(data) { return { ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } }; }

function rispostaPer(pathname) {
  if (pathname.endsWith('/api/v1/local-models')) return LOCALI;
  if (pathname.endsWith('/api/v1/models')) return MODELLI;
  if (pathname.includes('/api/v1/workspace-browser')) {
    return {
      root: 'C:\\',
      path: 'C:\\',
      parent: null,
      items: [{ name: 'Users', path: 'C:\\Users', projectId: null }],
      recommended: [{ label: 'AVM-harness-desktop', path: 'C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop', kind: 'project', projectId: 'default' }],
    };
  }
  if (pathname.includes('/sessions')) return { sessions: [], items: [] };
  mancanti.add(pathname);
  return { items: [], modelli: [], sessions: [], events: [] };
}

async function misura(page) {
  return page.evaluate(() => {
    const lista = document.querySelector('.model-picker-panel:not([hidden]) .model-picker-list')
      || document.querySelector('.model-picker-list');
    if (!lista) return { errore: 'nessuna .model-picker-list' };
    const righe = [...lista.querySelectorAll('.model-picker-option')];
    const r = lista.getBoundingClientRect();
    return {
      lista: { clientWidth: lista.clientWidth, scrollWidth: lista.scrollWidth, overflowX: getComputedStyle(lista).overflowX, left: r.left, right: r.right },
      barraOrizzontale: lista.scrollWidth > lista.clientWidth,
      righe: righe.map((o) => {
        const rr = o.getBoundingClientRect();
        const testo = o.children[1];
        const strong = testo ? testo.querySelector('strong') : null;
        const small = testo ? testo.querySelector('small') : null;
        const st = strong ? getComputedStyle(strong) : null;
        return {
          nomeAschermo: strong ? strong.textContent : null,
          titleCompleto: o.getAttribute('title'),
          rigaLarghezza: rr.width,
          rigaDestra: rr.right,
          fuoriDallaLista: Math.max(0, Math.round(rr.right - r.right)),
          testoScrollWidth: testo ? testo.scrollWidth : null,
          testoClientWidth: testo ? testo.clientWidth : null,
          strongScroll: strong ? strong.scrollWidth : null,
          strongClient: strong ? strong.clientWidth : null,
          strongTroncato: strong ? strong.scrollWidth > strong.clientWidth : null,
          smallScroll: small ? small.scrollWidth : null,
          smallClient: small ? small.clientWidth : null,
          whiteSpace: st ? st.whiteSpace : null,
          textOverflow: st ? st.textOverflow : null,
          textAlign: testo ? getComputedStyle(testo).textAlign : null,
          flex: testo ? getComputedStyle(testo).flex : null,
        };
      }),
    };
  });
}

async function giro(browser, { tema, larghezza, altezza }) {
  const context = await browser.newContext({ viewport: { width: larghezza, height: altezza }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(String(e)));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(busta(rispostaPer(url.pathname))) });
  });
  await page.addInitScript((modo) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: modo } }));
    /* l'intro del primo avvio copre tutto: qui la si dichiara già fatta, come per un utente di ritorno */
    localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'completata', quando: new Date().toISOString() }));
  }, tema);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const nome = `${ETICHETTA}-${tema}-${larghezza}x${altezza}`;
  await mkdir(FOTO, { recursive: true });

  await page.locator('#newSessionBtn').click();
  await page.waitForTimeout(600);
  await page.locator('.model-picker-trigger').first().click();
  await page.waitForTimeout(500);
  await page.locator('.model-picker-source[data-picker-source="locali"]').first().click();
  await page.waitForTimeout(700);

  const dati = await misura(page);
  await page.screenshot({ path: path.join(FOTO, `${nome}-intero.png`) });
  const pannello = page.locator('.model-picker-panel').first();
  if (await pannello.count()) await pannello.screenshot({ path: path.join(FOTO, `${nome}-pannello.png`) }).catch(() => {});
  /* la riga-trappola (nome interminabile) sta in fondo: si porta in vista e si fotografa */
  await page.evaluate(() => { const l = document.querySelector('.model-picker-list'); if (l) l.scrollTop = l.scrollHeight; });
  await page.waitForTimeout(300);
  if (await pannello.count()) await pannello.screenshot({ path: path.join(FOTO, `${nome}-pannello-fondo.png`) }).catch(() => {});

  await context.close();
  return { nome, tema, larghezza, altezza, errori, ...dati };
}

const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--force-device-scale-factor=1'] });
const esiti = [];
for (const tema of ['light', 'dark']) {
  for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
    esiti.push(await giro(browser, { tema, larghezza, altezza }));
  }
}
await browser.close();
await writeFile(path.join(FOTO, `misure-${ETICHETTA}.json`), `${JSON.stringify({ esiti, endpointMancanti: [...mancanti] }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ esiti, endpointMancanti: [...mancanti] }, null, 2));
