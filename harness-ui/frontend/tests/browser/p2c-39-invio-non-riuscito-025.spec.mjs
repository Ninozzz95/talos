import { expect, test } from '@playwright/test';

import { avvisi, bancoBlocco, bolle, scrivi } from './aiuto-p2c-025.mjs';

/*
 * P2-C della PC 0.2.5, riga 39 (decisione 411, note 11o e 11p del Tester). Server finto, ogni rotta intercettata.
 *  - 11o: TOLTA dalla 0.2.5 (giudice v2584, difetto D2 del Tester: la cura lasciava un turno «TALOS» vuoto). Resta la prova «al contrario»,
 *    che vale anche sulla base: un messaggio SCRITTO che non parte resta in chat con la sua nota. La 11o rifatta è nella lista 0.2.6.
 *  - 11p: «Failed to fetch» non arriva più in chat (la frase è del dizionario), e lo stesso avviso «Invio non riuscito» non si impila.
 * La nota 11q (il ramo col titolo vecchio) è del server: `harness-ui/tests/ramo-nome-del-padre.test.mjs`.
 */

test.describe('riga 39 · 11o e 11p', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('P2C-11o al contrario: un messaggio SCRITTO che non parte resta in chat con la sua nota (la persona l\'ha scritto davvero)', async ({ page }) => {
    await bancoBlocco(page);
    const primaBolle = await bolle(page).count();
    await scrivi(page, 'Una domanda scritta da me');
    await expect.poll(() => page.messaggi.length).toBe(1);
    await expect(bolle(page)).toHaveCount(primaBolle + 1);
    await expect(page.locator('#conversation')).toContainText('Invio non riuscito');
    expect(page.errori).toEqual([]);
  });

  test('P2C-11p senza rete la chat dice la frase del dizionario, mai «Failed to fetch»; due invii falliti = un avviso solo', async ({ page }) => {
    await bancoBlocco(page);
    await scrivi(page, 'Primo tentativo');
    await expect.poll(() => page.messaggi.length).toBe(1);
    await expect(page.locator('#conversation')).toContainText('Il server non risponde');
    await scrivi(page, 'Secondo tentativo');
    await expect.poll(() => page.messaggi.length).toBe(2);
    await expect(page.locator('#conversation .talos-message--user')).toContainText(['Secondo tentativo']);
    await expect(page.locator('#conversation')).not.toContainText('Failed to fetch');
    await expect(avvisi(page, 'Invio non riuscito'), 'lo stesso avviso non si ripete').toHaveCount(1);
    await expect(avvisi(page, 'Invio non riuscito')).toContainText('Il server non risponde');
    expect(page.errori).toEqual([]);
  });

  test('P2C-11p al contrario: un invio che arriva non lascia note né avvisi d\'errore', async ({ page }) => {
    await bancoBlocco(page, { invio: 'ok' });
    await scrivi(page, 'Questa arriva');
    await expect.poll(() => page.messaggi.length).toBe(1);
    await expect(page.locator('#conversation')).toContainText('Questa arriva');
    await page.waitForTimeout(300);
    await expect(page.locator('#conversation')).not.toContainText('Invio non riuscito');
    await expect(avvisi(page, 'Invio non riuscito')).toHaveCount(0);
    expect(page.errori).toEqual([]);
  });
});

