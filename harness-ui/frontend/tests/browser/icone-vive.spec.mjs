import { expect, test } from '@playwright/test';

/*
 * FE-015, revisione del 31/10/2026: due icone erano sparite con tutte le prove verdi, perché guardavano i nomi scritti e non la pagina.
 * Qui si guarda ciò che il browser disegna: ogni `use` deve trovare il suo simbolo, e «In corso» deve girare anche col movimento ridotto.
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET si FERMA e si conta.
 */
async function apri(page) {
  await page.route('**/api/v1/**', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
}
const senzaSimbolo = (page) => page.evaluate(() => [...document.querySelectorAll('use')]
  .map((u) => u.getAttribute('href') || '')
  .filter((h) => h.startsWith('#') && !document.getElementById(h.slice(1))));

test('ICONE-VIVE-01 — nessuna icona senza simbolo, nelle schermate di serie', async ({ page }) => {
  await apri(page);
  expect(await senzaSimbolo(page)).toEqual([]);
  /* il clic sul nodo: le voci stanno in gruppi chiusi, e una voce che manca è un rosso, non un salto */
  for (const vaia of ['impostazioni', 'libreria', 'memoria', 'note', 'attivita', 'ricerca', 'automazioni', 'modelli']) {
    expect(await page.evaluate((v) => { const voce = document.querySelector(`[data-vaia="${v}"]`); voce?.click(); return Boolean(voce); }, vaia), vaia).toBe(true);
    await page.waitForTimeout(300);
    expect(await senzaSimbolo(page), vaia).toEqual([]);
  }
});

for (const ridotto of [false, true]) {
  test(`ICONE-VIVE-02 — «In corso» gira nel bundle vero${ridotto ? ', e col movimento ridotto si calma senza fermarsi' : ''}`, async ({ page }) => {
    if (ridotto) await page.emulateMedia({ reducedMotion: 'reduce' });
    await apri(page);
    const durata = await page.evaluate(() => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-loader');
      svg.append(use);
      document.body.append(svg);
      const stile = getComputedStyle(svg);
      const esito = { nome: stile.animationName, durata: stile.animationDuration, stato: svg.getAnimations().map((a) => a.playState) };
      svg.remove();
      return esito;
    });
    expect(durata.nome).toBe('talos-orb-spin');
    expect(durata.durata).toBe(ridotto ? '3s' : '1.5s');
    expect(durata.stato).toEqual(['running']);
  });
}
