import { expect, test } from '@playwright/test';
import { htmlDiAnteprima, POLITICA_HTML_ANTEPRIMA, senzaLinkCheNavigano } from '../../src/components/anteprima-domanda.js';

/* Terza verifica (29/10/2026), proposta NON committata: la pulizia sul documento analizzato, costruita DENTRO la pagina come rev2. */
const R = (x) => `https://evil.test/${x}`;
const CASI = {
  'shadow root dichiarativo': `<div><template shadowrootmode="open"><a id="l" href="${R('shadow')}" style="display:block;font-size:40px">clicca</a></template></div>`,
  'svg animate href': `<svg width="300" height="80"><a id="l"><animate attributeName="href" values="${R('animate')}" dur="1s" fill="freeze"/><rect width="300" height="80" fill="red"/></a></svg>`,
  'svg set xlink:href': `<svg width="300" height="80" xmlns:xlink="http://www.w3.org/1999/xlink"><a id="l"><set attributeName="xlink:href" to="${R('set')}"/><rect width="300" height="80" fill="red"/></a></svg>`,
  'template classico': `<template><a href="${R('template')}">x</a></template><a id="l" style="display:block">clicca</a>`,
  'math href': `<math><mtext id="l" href="${R('math')}" style="font-size:40px">clicca</mtext></math>`,
  'base href + a senza href': `<base href="${R('base/')}"><a id="l" href="">clicca</a>`,
  'svg use': `<svg width="300" height="80"><use href="${R('use.svg#x')}"/><rect id="l" width="300" height="80" fill="red"/></svg>`,
  'object': `<object data="${R('object')}"></object><p id="l">clicca</p>`,
  'formaction': `<form><button id="l" formaction="${R('formaction')}">invia</button></form>`,
  'button form esterno': `<form id="f" action="${R('form')}"></form><button id="l" form="f">invia</button>`,
  'a ping': `<a id="l" href="#x" ping="${R('ping')}">clicca</a>`,
  'noscript': `<noscript><a id="l" href="${R('noscript')}">clicca</a></noscript>`,
  'mxss mglyph': `<math><mtext><table><mglyph><style><!--</style><a id="l" href="${R('mxss1')}">clicca</a>--></style></mglyph></table></mtext></math>`,
  'mxss form annidato': `<form><math><mtext></form><form><mglyph><style></math><a id="l" href="${R('mxss2')}">clicca</a>`,
  'shadow root con target self': `<div><template shadowrootmode="open"><a id="l" href="${R('shadow-self')}" target="_self" style="display:block;font-size:40px">clicca</a></template></div>`,
  'mxss form annidato con target self': `<form><math><mtext></form><form><mglyph><style></math><a id="l" href="${R('mxss-self')}" target="_self" style="display:block;font-size:40px">clicca</a>`,
  'plaintext': `<plaintext><a id="l" href="${R('plaintext')}">clicca</a>`,
};

for (const [nome, html] of Object.entries(CASI)) {
  test(`REV3-ANTEPRIMA-LINK — «${nome}»: niente esce, nemmeno col clic`, async ({ page }) => {
    const fuori = [];
    await page.route('https://evil.test/**', (route) => { fuori.push(route.request().url()); return route.fulfill({ status: 200, body: 'x' }); });
    await page.goto('/');
    const pulito = await page.evaluate(({ html, politica, pulisci, componi }) => {
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
      return srcdoc;
    }, { html, politica: POLITICA_HTML_ANTEPRIMA, pulisci: senzaLinkCheNavigano.toString(), componi: htmlDiAnteprima.toString() });
    console.log(`PULITO «${nome}»:`, pulito.slice(pulito.indexOf('_blank">') + 8, pulito.indexOf('_blank">') + 300));
    await page.waitForTimeout(1500);
    const bersaglio = page.frameLocator('#rev-cornice').locator('#l');
    if (await bersaglio.count()) await bersaglio.first().click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);
    expect(fuori, `richieste: ${fuori.join(', ')}`).toEqual([]);
    expect(page.url()).not.toContain('evil.test');
  });
}
