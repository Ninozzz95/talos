import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/caricamenti-vivi/', import.meta.url)));

/*
 * CARICAMENTI-VIVI-01 (owner 29/10/2026, bozzetto «Caricamenti vivi»: «Testo fermo, poi riga viva»). Nel browser vero, su un pannello
 * vero della Bacheca (le Note del foglio «capabilities»), con la lettura dal server tenuta ferma 3,5 s: nei primi 2 s il testo di
 * sempre, fermo; oltre, l'etichetta prende lo shimmer dell'attesa in chat e accanto scorrono i secondi; arrivate le note, la riga
 * se ne va da sola. Le scritture non partono (si fermano e si contano).
 */
for (const modo of ['dark', 'light']) {
  test(`CARICAMENTI-VIVI-01 · ${modo} — la Bacheca che carica: testo fermo, oltre 2 s riga viva coi secondi, poi il contenuto`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: modo });
    await page.addInitScript((m) => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: m, uiLanguage: 'it' } })), modo);
    const scritture = [];
    await page.route('**/api/**', async (r) => {
      const req = r.request();
      if (req.method() !== 'GET') { scritture.push(`${req.method()} ${req.url()}`); return r.abort(); }
      if (/\/notes(?:\?|$)/u.test(new URL(req.url()).pathname + (new URL(req.url()).search ? '?' : ''))) await new Promise((ok) => setTimeout(ok, 3500));
      return r.fallback();
    });
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
    const t0 = Date.now();
    await page.evaluate(() => document.querySelector('[data-open-sheet="capabilities"]').click());
    const mount = page.locator('#notesListMount');
    await expect(mount.locator('[data-caricamento-vivo]')).toBeVisible();
    await page.waitForTimeout(Math.max(0, 1000 - (Date.now() - t0)));
    expect(await mount.locator('.talos-caricamento__secondi').count(), 'nei primi 2 s niente secondi').toBe(0);
    expect(await mount.locator('[data-caricamento-vivo]').evaluate((n) => n.classList.contains('talos-waiting__label')), 'nei primi 2 s niente shimmer').toBe(false);
    await page.waitForTimeout(Math.max(0, 2600 - (Date.now() - t0)));
    await expect(mount.locator('.talos-caricamento__secondi')).toBeVisible();
    await expect(mount.locator('.talos-caricamento__secondi')).toHaveText(/\d/u);
    expect(await mount.locator('[data-caricamento-vivo]').evaluate((n) => n.classList.contains('talos-waiting__label'))).toBe(true);
    // la foto resta su disco anche quando la prova passa (artifacts/, come p0bis-c): la riga si guarda, non solo si misura
    await mount.scrollIntoViewIfNeeded();
    const foto = await mount.locator('xpath=..').screenshot();
    await mkdir(CARTELLA_FOTO, { recursive: true });
    await writeFile(path.join(CARTELLA_FOTO, `caricamento-vivo-${modo}.png`), foto);
    await info.attach(`caricamento-vivo-${modo}.png`, { body: foto, contentType: 'image/png' });
    await expect(mount.locator('[data-caricamento-vivo]')).toHaveCount(0, { timeout: 10_000 });
    expect(await mount.locator('.talos-caricamento__secondi').count(), 'arrivate le note, i secondi se ne vanno').toBe(0);
    expect(scritture).toEqual([]);
  });
}
