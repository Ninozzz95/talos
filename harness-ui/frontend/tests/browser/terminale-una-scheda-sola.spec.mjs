import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/*
 * BC-62 (owner, 17/09/2026, dal vivo): «quando apro scheda terminale si apre una nuova tab terminale senza motivo».
 *
 * Riprodotto su questo stesso banco PRIMA della cura: con una sessione aperta, il primo ingresso nella vista
 * Terminale faceva partire due `GET …/terminals` nello stesso millisecondo e due `POST …/terminals`, e a schermo
 * comparivano «tu · Git Bash» e «tu · Git Bash 2». Senza sessione il difetto NON c'è (una scheda sola su nove
 * passaggi): per questo la prova crea due sessioni VERE sul server di prova (mai il 4174) e passa dall'una all'altra.
 *
 * Asserisce ciò che la persona vede (il numero di linguette) e ciò che lo causa (quante POST partono): con la sola
 * prima asserzione un doppione «riassorbito» per caso passerebbe verde.
 */
test.use({ locale: 'it-IT' });

const linguette = (page) => page.evaluate(() => [...document.querySelectorAll('.talos-terminal__tab[role="tab"]')]
  .map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter((t) => !/^(\+\s*)?(Nuovo|New)$/i.test(t)));

test('BC62-01 — entrare nella vista Terminale non crea schede: una per sessione, anche passando da A a B e ritorno, anche dopo una ricarica', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const crea = async (nome) => {
    const cartella = mkdtempSync(join(tmpdir(), `bc62-${nome}-`));
    const r = await request.post(new URL('/api/v1/sessions/custom', baseURL).href, { data: { cartellaLibera: cartella, consegna: `sessione ${nome} della prova BC-62: non fare nulla`, modello: 'z-ai/glm-5.3-flash' } });
    expect(r.ok(), `creazione della sessione ${nome}`).toBe(true);
    return (await r.json()).data.sessionId;
  };
  const A = await crea('A'); const B = await crea('B');
  const post = { [A]: 0, [B]: 0 };
  page.on('request', (rq) => { const m = /\/sessions\/([^/]+)\/terminals$/.exec(new URL(rq.url()).pathname); if (m && rq.method() === 'POST' && m[1] in post) post[m[1]] += 1; });

  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  const passa = async (id, nome) => { await page.evaluate(([i, n]) => window.__talosHarnessUiRuntime.passaASessione(i, 'workspace', n, 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), [id, nome]); };
  const vai = async (modo) => { await page.locator(`[data-mode="${modo}"]:visible`).first().click(); };
  const unaScheda = async (dove) => { await expect.poll(() => linguette(page), { message: dove, timeout: 10_000 }).toHaveLength(1); await page.waitForTimeout(600); expect(await linguette(page), `${dove} (dopo l'assestamento)`).toHaveLength(1); };

  await passa(A, 'A'); await vai('terminal'); await unaScheda('A, primo ingresso');
  await vai('chat'); await vai('terminal'); await unaScheda('A, secondo ingresso');
  await vai('chat'); await passa(B, 'B'); await vai('terminal'); await unaScheda('B, primo ingresso');
  await vai('chat'); await passa(A, 'A'); await vai('terminal'); await unaScheda('A, ritorno dopo B');
  await page.reload(); await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await passa(A, 'A'); await vai('terminal'); await unaScheda('A, dopo una ricarica della pagina');

  /* La causa, non solo il sintomo: la POST «dammi la prima scheda» parte UNA volta per sessione. Una seconda POST, a
     registro non più vuoto, è una scheda vera creata dal niente. */
  expect(post[A], 'POST …/terminals per la sessione A').toBeLessThanOrEqual(1);
  expect(post[B], 'POST …/terminals per la sessione B').toBeLessThanOrEqual(1);
});

test('BC62-02 — al contrario: «Nuovo» crea ESATTAMENTE una scheda in più', async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const cartella = mkdtempSync(join(tmpdir(), 'bc62-nuovo-'));
  const r = await request.post(new URL('/api/v1/sessions/custom', baseURL).href, { data: { cartellaLibera: cartella, consegna: 'prova BC-62 del pulsante Nuovo: non fare nulla', modello: 'z-ai/glm-5.3-flash' } });
  const id = (await r.json()).data.sessionId;
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((i) => window.__talosHarnessUiRuntime.passaASessione(i, 'workspace', 'Nuovo', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), id);
  await page.locator('[data-mode="terminal"]:visible').first().click();
  await expect.poll(() => linguette(page), { timeout: 10_000 }).toHaveLength(1);
  await page.locator('.talos-terminal__tab[role="tab"]', { hasText: /^\s*(Nuovo|New)\s*$/ }).click();
  await expect.poll(() => linguette(page), { timeout: 10_000 }).toHaveLength(2);
});
