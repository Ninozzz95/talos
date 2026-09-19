import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * LE IMPOSTAZIONI INTERE, TESTA A TESTA — owner 18/09: «cosa manca affinché le impostazioni
 * siano complete e uguali al mockup?».
 * Metodo (ricerca 18/09/2026 — vmobify «Complete Product Inventory», LobeHub «design-parity-review»,
 * Tessl «audit-workflow»): si inventaria per SUPERFICIE con id stabili, non per cartella di
 * screenshot; la gerarchia è dominio → schermata → scheda → campi; e il rischio vero sono le
 * AREE INTERE che mancano, non la profondità di quelle guardate.
 * Dieci sezioni da entrambi i lati, stessa larghezza, stessa condizione.
 */
const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'impostazioni-parita-2026-09-18');
const SEZIONI = [
  ['Aspetto e movimento', 'appearance'],
  ['Chat e composer', 'chat'],
  ['Strumenti agente e permessi', 'tools'],
  ['Memoria e contesto', 'memoria'],
  ['Sicurezza e privacy', 'privacy'],
  ['Laboratorio modelli', 'models'],
  ['Provider e accessi', 'providers'],
  ['Costi e consumo', 'costi'],
  ['File e workspace', 'workspace'],
  ['Account, Doctor e backup', 'account'],
];

test('IMP-MOCKUP — tre ingressi disponibili nel mockup canonico, sette dichiarati fuori lotto', async ({ page }, info) => {
  const source = new URL('../../../../.claude/ripresa-2026-09-19/references/TALOS-Calm-Lab-04.html', import.meta.url);
  const html = readFileSync(source, 'utf8');
  await page.route('https://talos-mockup.invalid/**', route => route.fulfill({contentType:'text/html',body:html}));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('https://talos-mockup.invalid/');
  await expect(page.locator('#settings-nav button:disabled')).toHaveCount(7);
  for (const [id, selector, heading] of [
    ['appearance','#settings-nav [data-value="appearance"]','Aspetto e movimento'],
    ['models','#settings-nav [data-value="models"]','Laboratorio modelli'],
    ['providers','#settings-nav [data-action="providers-tab"]','Laboratorio modelli'],
  ]) {
    await page.locator(selector).click();
    await expect(page.locator('#page-title')).toHaveText(heading);
    await page.screenshot({path:info.outputPath(`mockup-${id}.png`),fullPage:true,animations:'disabled'});
  }
});

test('IMP-APP — le stesse dieci sezioni nell’app, dal pacchetto costruito', async ({ page }) => {
  mkdirSync(FOTO, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' }, chat: {}, workspaces: {} })); });
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
  });
  await page.waitForTimeout(1200);
  for (const [, id] of SEZIONI) {
    await page.evaluate((sezione) => window.__talosHarnessUiRuntime?.setSettingsSection?.(sezione), id);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(FOTO, `app-${id}.png`), fullPage: false, animations: 'disabled', caret: 'hide' });
  }
  console.log('IMP-APP fatto: ' + SEZIONI.length);
});
