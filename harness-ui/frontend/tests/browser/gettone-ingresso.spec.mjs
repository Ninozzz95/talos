/*
 * GS-16 «gettone sempre» (decisione dell'owner, 02/11/2026; forma §4): la finestra entra col biglietto, ricarica, apre una seconda scheda; un browser senza
 * cookie resta fuori; un biglietto già usato dice cosa fare. Il cookie non è leggibile dagli script.
 */
import { expect, test } from '@playwright/test';

import { chiaveDeiBiglietti, creaBiglietto } from '../../../src/gettone.mjs';

test.use({ storageState: { cookies: [], origins: [] }, locale: 'it-IT' });

const salute = (page) => page.evaluate(async () => (await fetch('/api/v1/health')).status);

test('GS-16 entra col biglietto, ricarica e seconda scheda funzionano; senza cookie fuori; il biglietto usato dice cosa fare', async ({ page, context, browser, baseURL }) => {
  const gettone = process.env.TALOS_PW_GETTONE;
  test.skip(!gettone, 'serve il server della corsa');
  const link = `${new URL(baseURL).origin}/?ingresso=${creaBiglietto(chiaveDeiBiglietti(gettone))}`;

  await page.goto(link);
  await expect(page).toHaveURL(`${new URL(baseURL).origin}/`);
  expect(await salute(page)).toBe(200);
  const cookie = (await context.cookies()).find((c) => c.name === 'talos_token');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 24 * 3600); // resta a browser chiuso, finché il server vive
  expect(await page.evaluate(() => document.cookie)).not.toContain('talos_token');
  expect(await page.content()).not.toContain(gettone);

  await page.reload();
  expect(await salute(page)).toBe(200);
  const seconda = await context.newPage();
  await seconda.goto('/');
  expect(await salute(seconda)).toBe(200);

  const fuori = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'it-IT' });
  const estranea = await fuori.newPage();
  /* senza cookie la pagina dice cosa fare (revisione R8) */
  const senza = await estranea.goto('/');
  expect(senza.status()).toBe(401);
  await expect(estranea.locator('body')).toContainText('nuovo link');
  expect((await fuori.request.get(`${new URL(baseURL).origin}/api/v1/health`)).status()).toBe(401);
  const usato = await estranea.goto(link);
  expect(usato.status()).toBe(401);
  await expect(estranea.locator('body')).toContainText('nuovo link');
  await fuori.close();
});
