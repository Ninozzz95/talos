import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * ============================================================================
 * L'HTML DEL README — reso a nodi, mai come stringa — 18/09/2026
 * ============================================================================
 * Owner: «la scheda del modello di Hugging Face deve essere formattata in HTML».
 * Misurato in foto (`pagina-modello-card_1080p_real.png`): il README di
 * `unsloth/GLM-4.7-Flash-GGUF` usciva col SORGENTE a schermo — `<div>`, `<p style=…>`,
 * `<em><a href=…>` — e i link restavano `[testo](https://…)`, cioè sintassi.
 *
 * ⛔ PERCHÉ QUESTA PROVA STA NEL BROWSER E NON FRA I TEST UNIT: la parte che conta —
 *   `DOMParser`, la costruzione dei nodi, il fatto che uno `<script>` non diventi un nodo —
 *   esiste solo dove c'è un DOM. I test unit coprono i due filtri puri (`urlAmmesso`,
 *   `stileAmmesso`); qui si prova la resa.
 *
 * ⛔ COME ARRIVANO I MODULI NELLA PAGINA: dalla loro SORGENTE su disco, con `page.route`
 *   (la stessa tecnica di `lab-guscio.spec.mjs`). Il percorso è same-origin, quindi la CSP
 *   `script-src 'self'` lo ammette e nessun `<script>` inline viene scartato in silenzio.
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA, riga per riga:
 *   · si toglie l'allowlist e si lascia passare tutto → HTML-01 e HTML-02 rossi (lo `<script>`
 *     diventa un nodo e l'attributo `onerror` resta);
 *   · si toglie il filtro degli schemi → HTML-03 rosso (l'`href` `javascript:` resta);
 *   · si toglie `htmlFidato` dalla chiamata → HTML-04 rosso (torna il sorgente a schermo);
 *   · si spegne `linkMarkdown` → HTML-05 rosso (i link tornano sintassi).
 */

const COMPONENTI = resolve(process.cwd(), 'src', 'components');

async function serviIModuli(page) {
  await page.route('**/__htmlfidato/*.js', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const sorgente = await readFile(resolve(COMPONENTI, nome), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: sorgente });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: `manca ${nome}` });
    }
  });
}

async function apri(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' }, chat: {}, workspaces: {} }));
  });
  await serviIModuli(page);
  await page.goto('/');
  await page.waitForTimeout(1500);
}

/** Rende un pezzo di HTML con la lista di ammessi e restituisce il DOM prodotto. */
function rendi(page, html) {
  return page.evaluate(async (pezzo) => {
    const { nodiDaHtml } = await import('/__htmlfidato/html-fidato.js');
    const contenitore = document.createElement('div');
    contenitore.append(nodiDaHtml(document, pezzo));
    return { html: contenitore.innerHTML, testo: contenitore.textContent };
  }, html);
}

test('HTML-01 · un tag pericoloso non diventa un nodo, e il suo contenuto NON resta a schermo', async ({ page }) => {
  await apri(page);
  const esito = await rendi(page, '<p>prima</p><script>window.__iniettato = 1<\/script><p>dopo</p>');
  expect(esito.html, 'lo script non deve esistere nel DOM').not.toContain('script');
  expect(esito.testo, 'il codice dello script non deve restare come testo').not.toContain('__iniettato');
  // E il resto si disegna: il filtro non è un «no» a tutto.
  expect(esito.testo).toContain('prima');
  expect(esito.testo).toContain('dopo');
  expect(await page.evaluate(() => window.__iniettato === undefined), 'lo script non deve essere eseguito').toBe(true);
});

test('HTML-02 · gli attributi che eseguono non passano, quelli che servono sì', async ({ page }) => {
  await apri(page);
  const esito = await rendi(page, '<img src="https://x/y.png" alt="un modello" onerror="window.__boom=1" width="40"><p onclick="window.__boom=1" style="margin-top:0">testo</p>');
  expect(esito.html).not.toContain('onerror');
  expect(esito.html).not.toContain('onclick');
  expect(esito.html, 'lo stile lecito resta').toContain('margin-top:0');
  expect(esito.html, 'src e alt restano').toContain('https://x/y.png');
  expect(await page.evaluate(() => window.__boom === undefined)).toBe(true);
});

test('HTML-03 · un link che esegue codice non diventa un link', async ({ page }) => {
  await apri(page);
  const esito = await rendi(page, '<a href="javascript:window.__clic=1">clicca</a>');
  // ⛔ Il testo resta (l'utente vede la parola), ma NON è un link: senza `href` non c'è niente da toccare.
  expect(esito.testo).toContain('clicca');
  expect(esito.html).not.toContain('javascript:');
});

test('HTML-04 · il README vero: l’HTML si disegna e il Markdown intorno tiene', async ({ page }) => {
  await apri(page);
  // La forma reale del README di unsloth, presa dalla foto del 18/09: HTML di blocco con dentro
  // righe che NON cominciano per `<` — il caso che un criterio ingenuo sbaglierebbe.
  const readme = [
    '# Titolo markdown',
    '',
    '<div>',
    '<p style="margin-top:0;margin-bottom: 0;">',
    '<em><a href="https://docs.unsloth.ai/basics/unsloth-dynamic-v2.0-gguf">Unsloth Dynamic 2.0</a>',
    'achieves superior accuracy & outperforms other leading quants.</em>',
    '</p>',
    '</div>',
    '',
    'Paragrafo dopo il blocco.',
  ].join('\n');
  const esito = await page.evaluate(async (testo) => {
    const { renderizzaMarkdown } = await import('/__htmlfidato/markdown.js');
    const conHtml = document.createElement('div');
    conHtml.append(renderizzaMarkdown(testo, { htmlFidato: true }));
    const senzaHtml = document.createElement('div');
    senzaHtml.append(renderizzaMarkdown(testo, {}));
    return { conHtml: conHtml.innerHTML, testoConHtml: conHtml.textContent, senzaHtml: senzaHtml.innerHTML };
  }, readme);

  // Con l'opzione accesa: nessun tag nel TESTO, un link vero, e il titolo Markdown reso.
  expect(esito.testoConHtml, 'il sorgente HTML non deve più leggersi a schermo').not.toContain('<div>');
  expect(esito.testoConHtml, 'il sorgente HTML non deve più leggersi a schermo').not.toContain('<p style');
  expect(esito.testoConHtml).toContain('achieves superior accuracy');
  expect(esito.conHtml).toContain('href="https://docs.unsloth.ai');
  expect(esito.conHtml, 'il titolo Markdown intorno si rende ancora').toContain('<h1');
  // ⛔ E spenta, la pagina torna com’era: la chat non cambia.
  expect(esito.senzaHtml, 'senza l’opzione l’HTML resta testo, come in chat').toContain('&lt;div&gt;');
});

test('HTML-05 · i link Markdown si risolvono solo dove l’opzione è accesa', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate(async () => {
    const { renderizzaMarkdown } = await import('/__htmlfidato/markdown.js');
    const acceso = document.createElement('div'); acceso.append(renderizzaMarkdown('Vedi [la guida](https://unsloth.ai/docs).', { linkMarkdown: true }));
    const spento = document.createElement('div'); spento.append(renderizzaMarkdown('Vedi [la guida](https://unsloth.ai/docs).', {}));
    return { acceso: acceso.innerHTML, spento: spento.textContent };
  });
  expect(esito.acceso).toContain('<a ');
  expect(esito.acceso).toContain('href="https://unsloth.ai/docs"');
  expect(esito.acceso).toContain('rel="noopener noreferrer"');
  // Spento: resta la sintassi, esattamente come si vedeva in chat prima di questa cura.
  expect(esito.spento).toContain('[la guida](https://unsloth.ai/docs)');
});
