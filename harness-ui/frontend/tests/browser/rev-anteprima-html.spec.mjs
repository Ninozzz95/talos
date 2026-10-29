import { expect, test } from '@playwright/test';
import { htmlDiAnteprima, POLITICA_HTML_ANTEPRIMA } from '../../src/components/anteprima-domanda.js';

/*
 * Revisione avversaria (29/10/2026), proposta NON committata. La cornice dell'anteprima HTML costruita ESATTAMENTE come in `app.js`
 * (`rendiAnteprima`: sandbox vuoto, attributo csp, referrerpolicy, srcdoc = htmlDiAnteprima(file)). Promessa del commit: «senza script,
 * file né rete». Si conta ogni richiesta che la cornice fa verso fuori.
 */
const ATTACCHI = {
  'meta refresh': '<meta http-equiv="refresh" content="0;url=https://evil.test/refresh">',
  'img esterna': '<img src="https://evil.test/img.png">',
  'css url()': '<div style="background:url(https://evil.test/css.png);width:10px;height:10px"></div>',
  '@import': '<style>@import url("https://evil.test/import.css");</style>',
  'script': '<script>fetch("https://evil.test/script")</script>',
  'form auto': '<form action="https://evil.test/form" method="get"><input name="a" value="b"></form><script>document.forms[0].submit()</script>',
  'link prefetch': '<link rel="prefetch" href="https://evil.test/prefetch"><link rel="dns-prefetch" href="https://evil.test">',
  'iframe annidata': '<iframe src="https://evil.test/iframe"></iframe>',
  'object': '<object data="https://evil.test/object"></object>',
  'svg image': '<svg><image href="https://evil.test/svgimg.png" width="10" height="10"/></svg>',
  'font esterno': '<style>@font-face{font-family:x;src:url(https://evil.test/font.woff)} body{font-family:x}</style>x',
};

for (const [nome, attacco] of Object.entries(ATTACCHI)) {
  test(`REV-ANTEPRIMA-HTML — «${nome}» non esce dalla cornice`, async ({ page }) => {
    const fuori = [];
    await page.route('https://evil.test/**', (route) => { fuori.push(route.request().url()); return route.fulfill({ status: 200, body: 'x' }); });
    await page.goto('/');
    await page.evaluate(({ srcdoc, politica }) => {
      const cornice = document.createElement('iframe');
      cornice.setAttribute('sandbox', '');
      cornice.setAttribute('csp', politica);
      cornice.setAttribute('referrerpolicy', 'no-referrer');
      document.body.append(cornice);
      cornice.srcdoc = srcdoc;
    }, { srcdoc: htmlDiAnteprima(attacco), politica: POLITICA_HTML_ANTEPRIMA });
    await page.waitForTimeout(1500);
    expect(fuori, `richieste verso fuori: ${fuori.join(', ')}`).toEqual([]);
  });
}

test('REV-ANTEPRIMA-HTML — un link cliccato dalla persona dentro la cornice', async ({ page }) => {
  const fuori = [];
  await page.route('https://evil.test/**', (route) => { fuori.push(route.request().url()); return route.fulfill({ status: 200, body: 'x' }); });
  await page.goto('/');
  await page.evaluate(({ srcdoc, politica }) => {
    const cornice = document.createElement('iframe');
    cornice.id = 'rev-cornice';
    cornice.setAttribute('sandbox', '');
    cornice.setAttribute('csp', politica);
    cornice.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:200px;z-index:2147483647;background:white';
    document.body.append(cornice);
    cornice.srcdoc = srcdoc;
  }, { srcdoc: htmlDiAnteprima('<a id="l" href="https://evil.test/click" style="display:block;font-size:40px">clicca</a>'), politica: POLITICA_HTML_ANTEPRIMA });
  await page.frameLocator('#rev-cornice').locator('#l').click();
  await page.waitForTimeout(1000);
  // revisione del blocco 19: un clic della persona non porta la cornice su un sito esterno (cura: <base target=_blank> + niente allow-popups)
  expect(fuori, `richieste dopo il clic: ${fuori.join(', ')}`).toEqual([]);
  expect(page.url()).not.toContain('evil.test'); // la pagina principale non deve mai andarsene
});
