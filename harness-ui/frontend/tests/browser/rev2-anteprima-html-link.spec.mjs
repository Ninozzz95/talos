import { expect, test } from '@playwright/test';
import { htmlDiAnteprima, POLITICA_HTML_ANTEPRIMA, senzaLinkCheNavigano } from '../../src/components/anteprima-domanda.js';

/*
 * Seconda revisione (29/10/2026), proposta NON committata: la cura «<base target=_blank> + via i target=_self». Un clic della persona su
 * ciascun link non deve portare la cornice (né la pagina) su un sito esterno.
 */
const CASI = {
  'entità nel target': '<a id="l" href="https://evil.test/entita" target="&#95;self">clicca</a>',
  'target attaccato alla virgoletta': '<a id="l" href="https://evil.test/attaccato"target="_self">clicca</a>',
  'target con barra': '<a id="l" href="https://evil.test/barra"/target="_self">clicca</a>',
  'svg a senza target': '<svg width="300" height="60"><a id="l" href="https://evil.test/svg"><rect width="300" height="60" fill="red"/></a></svg>',
  'svg a xlink': '<svg width="300" height="60" xmlns:xlink="http://www.w3.org/1999/xlink"><a id="l" xlink:href="https://evil.test/xlink"><rect width="300" height="60" fill="red"/></a></svg>',
  'area': '<img id="l" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" usemap="#m" width="300" height="60"><map name="m"><area shape="rect" coords="0,0,300,60" href="https://evil.test/area"></map>',
  'form con target self': '<form action="https://evil.test/form" target="_self"><button id="l">invia</button></form>',
  'cornice annidata con nome': '<iframe name="dentro" srcdoc="ciao"></iframe><a id="l" href="https://evil.test/annidata" target="dentro">clicca</a>',
  'base self nella pagina': '<base target="_self"><a id="l" href="https://evil.test/base">clicca</a>',
  'target _parent': '<a id="l" href="https://evil.test/parent" target="_parent">clicca</a>',
};

for (const [nome, html] of Object.entries(CASI)) {
  test(`REV2-ANTEPRIMA-LINK — «${nome}»: il clic non esce`, async ({ page }) => {
    const fuori = [];
    await page.route('https://evil.test/**', (route) => { fuori.push(route.request().url()); return route.fulfill({ status: 200, body: 'x' }); });
    await page.goto('/');
    /* la cornice si costruisce DENTRO la pagina, con le funzioni vere e il DOMParser del browser (come nell'app), non in Node */
    await page.evaluate(({ html, politica, pulisci, componi }) => {
      const senzaLinkCheNavigano = new Function(`return (${pulisci})`)();
      const htmlDiAnteprima = new Function('POLITICA_HTML_ANTEPRIMA', 'senzaLinkCheNavigano', `return (${componi})`)(politica, senzaLinkCheNavigano);
      const srcdoc = htmlDiAnteprima(html);
      const cornice = document.createElement('iframe');
      cornice.id = 'rev-cornice';
      cornice.setAttribute('sandbox', '');
      cornice.setAttribute('csp', politica);
      cornice.setAttribute('referrerpolicy', 'no-referrer');
      cornice.style.cssText = 'position:fixed;top:0;left:0;width:500px;height:300px;z-index:2147483647;background:white';
      document.body.append(cornice);
      cornice.srcdoc = srcdoc;
    }, { html, politica: POLITICA_HTML_ANTEPRIMA, pulisci: senzaLinkCheNavigano.toString(), componi: htmlDiAnteprima.toString() });
    const bersaglio = page.frameLocator('#rev-cornice').locator('#l');
    await bersaglio.click({ force: true });
    await page.waitForTimeout(1000);
    expect(fuori, `richieste dopo il clic: ${fuori.join(', ')}`).toEqual([]);
    expect(page.url()).not.toContain('evil.test');
  });
}
