import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
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

test('IMP-MOCKUP — le dieci sezioni del mockup', async ({ page }) => {
  mkdirSync(FOTO, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4210/TALOS-Calm-Lab.html');
  await page.waitForTimeout(2000);
  for (const [nome, id] of SEZIONI) {
    const fuga = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const voce = page.locator(`button, a, [role="button"]`).filter({ hasText: new RegExp(`^\\s*${fuga}\\s*$`) }).first();
    await voce.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(FOTO, `mockup-${id}.png`), fullPage: false, animations: 'disabled', caret: 'hide' });
  }
  console.log('IMP-MOCKUP fatto: ' + SEZIONI.length);
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
