import { expect, test } from '@playwright/test';
import { MOCKUP, apri, mostra } from './aiuto.mjs';

// RIP-V01, 08/09/2026: la parità può essere verde con Browser coperto in entrambe
// le pagine. Misurare anche le superfici cliccabili, la centratura e il focus.
// Ricerca: https://fluent2.microsoft.design/components/web/react/core/toolbar/usage
const LAB = process.env.TALOS_LAB_URL || `http://127.0.0.1:${process.env.TALOS_LAB_PORT || 4176}`;

async function misuraTestata(pagina) {
  return pagina.locator('#schermoReview .talos-topbar').evaluate((h) => {
    const rect = (el) => el.getBoundingClientRect().toJSON();
    const tabs = h.querySelector('.talos-tabs');
    const actions = h.querySelector('.talos-topbar__actions');
    const controlli = [...h.querySelectorAll('button')].filter((b) => b.getClientRects().length);
    return {
      header: rect(h), tabs: rect(tabs), actions: rect(actions),
      controlli: controlli.map((b) => {
        const r = rect(b);
        const bersaglio = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { nome: b.getAttribute('aria-label') || b.textContent.trim(), rect: r, colpibile: b === bersaglio || b.contains(bersaglio) };
      }),
    };
  });
}

function verificaTestata(m) {
  expect(m.actions.left - m.tabs.right, 'RIP-V01: le azioni non coprono Browser').toBeGreaterThanOrEqual(4);
  expect(Math.abs((m.tabs.left + m.tabs.right) / 2 - (m.header.left + m.header.right) / 2), 'schede al centro vero').toBeLessThan(1);
  expect(m.header.height, 'testata su una riga').toBe(60);
  for (const b of m.controlli) {
    expect(b.colpibile, `${b.nome}: centro raggiungibile`).toBe(true);
    expect(b.rect.left, `${b.nome}: dentro a sinistra`).toBeGreaterThanOrEqual(m.header.left);
    expect(b.rect.right, `${b.nome}: dentro a destra`).toBeLessThanOrEqual(m.header.right);
    expect(b.rect.top, `${b.nome}: nessuna seconda riga`).toBeGreaterThanOrEqual(m.header.top);
    expect(b.rect.bottom, `${b.nome}: nessun taglio verticale`).toBeLessThanOrEqual(m.header.bottom);
  }
}

test('RIP-V01: Review mantiene schede e azioni separate', async ({ browser }, info) => {
  for (const url of [MOCKUP, `${LAB}/?componente=Review`]) {
    const { contesto, pagina } = await apri(browser, url, { viewport: info.project.use.viewport });
    try {
      if (url !== MOCKUP) await pagina.waitForSelector('html[data-visual-ready="true"]');
      await mostra(pagina, 'schermoReview');
      // Caratterizzazione del runtime: le azioni prive di rotta non sono offerte.
      await pagina.locator('#schermoReview [data-richiede="fase3"]').evaluateAll((bs) => bs.forEach((b) => { b.hidden = true; }));
      verificaTestata(await misuraTestata(pagina));
      const copia = pagina.locator('#copyAllDiffs');
      await expect(copia).toHaveAccessibleName('Copia i diff');
      await expect(copia).toHaveAttribute('title', 'Copia tutti i diff negli appunti');
      await expect(copia.locator('.talos-review__copy-label')).toBeHidden();
      await copia.click({ trial: true });
      await copia.focus();
      await expect(copia).toBeFocused();
      await expect(copia).not.toHaveCSS('outline-style', 'none');
      // Stato vuoto: il runtime disabilita la copia, senza cambiarne l'ingombro.
      await copia.evaluate((b) => { b.disabled = true; });
      await expect(copia).toBeDisabled();
      verificaTestata(await misuraTestata(pagina));
      await pagina.reload();
      if (url !== MOCKUP) await pagina.waitForSelector('html[data-visual-ready="true"]');
      await mostra(pagina, 'schermoReview');
      verificaTestata(await misuraTestata(pagina));
      // Con spazio sufficiente la scritta ritorna: nessuna perdita permanente.
      await pagina.setViewportSize({ width: 1920, height: 1080 });
      await expect(copia.locator('.talos-review__copy-label')).toBeVisible();
      verificaTestata(await misuraTestata(pagina));
    } finally { await contesto.close(); }
  }
});

test('RIP-V01 al contrario: la vecchia copia estesa deve essere respinta', async ({ browser }) => {
  const { contesto, pagina } = await apri(browser, `${LAB}/?componente=Review`, { viewport: { width: 1280, height: 800 } });
  try {
    await pagina.waitForSelector('html[data-visual-ready="true"]');
    await mostra(pagina, 'schermoReview');
    await pagina.locator('#schermoReview [data-richiede="fase3"]').evaluateAll((bs) => bs.forEach((b) => { b.hidden = true; }));
    await pagina.addStyleTag({ content: '#copyAllDiffs{width:auto!important;min-width:max-content!important;padding:6px 10px!important} #copyAllDiffs .talos-review__copy-label{display:inline!important}' });
    const m = await misuraTestata(pagina);
    expect(m.actions.left, 'la mutazione riproduce il difetto originale').toBeLessThan(m.tabs.right);
    expect(() => verificaTestata(m), 'la stessa guardia deve rifiutare il difetto').toThrow();
  } finally { await contesto.close(); }
});
