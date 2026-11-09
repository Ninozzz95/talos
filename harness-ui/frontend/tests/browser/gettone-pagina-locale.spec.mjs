/*
 * Revisione del gettone, R1 e R2 (03/11/2026): l'ultimo passo che le prove di server non vedono, il browser vero. La pagina di un server locale aperta dalla rotta del proxy
 * sta sull'altro nome di loopback: lo script non ha il cookie né verso quel nome né verso la finestra, e il dev server non lo riceve.
 */
import { createServer } from 'node:http';

import { expect, test } from '@playwright/test';

test('GS-19 la pagina di un dev server non ha autorità: niente API, e il cookie non arriva al dev server', async ({ page, baseURL, context }) => {
  test.skip(!process.env.TALOS_PW_GETTONE, 'serve il server della corsa');
  const cookieVisti = [];
  const dev = createServer((q, s) => {
    cookieVisti.push(q.headers.cookie ?? '');
    if (q.url.endsWith('.js')) { s.writeHead(200, { 'Content-Type': 'text/javascript' }); s.end('window.caricato = true'); return; }
    s.writeHead(200, { 'Content-Type': 'text/html' });
    s.end('<!doctype html><html><head><title>dev</title><script src="/app.js"></script></head><body>dev server</body></html>');
  });
  await new Promise((ok) => { dev.listen(0, '127.0.0.1', ok); });
  try {
    const indirizzo = `http://127.0.0.1:${dev.address().port}/`;
    const finestra = new URL(baseURL).origin;
    /* il comando del modello che apre la rotta nel browser della persona */
    await page.goto(`${finestra}/api/v1/browser/proxy?url=${encodeURIComponent(indirizzo)}`);
    expect(new URL(page.url()).hostname).toBe('localhost');
    await expect(page.locator('body')).toContainText('dev server');
    expect(await page.evaluate(() => window.caricato)).toBe(true);
    expect(await page.evaluate(async () => (await fetch(`${location.origin}/api/v1/sessions`)).status)).toBe(401);
    /* verso la finestra: un altro sito, il cookie Strict non parte, e la risposta non si legge */
    const verso = await page.evaluate(async (o) => { try { await fetch(`${o}/api/v1/app-settings/apply`, { method: 'POST', credentials: 'include', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); return 'partita'; } catch { return 'bloccata'; } }, finestra);
    expect(['partita', 'bloccata']).toContain(verso);
    expect(await page.evaluate(() => document.cookie)).toBe('');
    expect(cookieVisti.length).toBeGreaterThan(1);
    expect(cookieVisti.filter((c) => c.includes('talos_token'))).toEqual([]);
    expect((await context.cookies()).filter((c) => c.name === 'talos_token' && c.domain === 'localhost')).toEqual([]);
    /* S1 della CLI: la pagina si riporta da sola sul nome della finestra col suo `pass`. Navigazione partita dalla pagina, da un altro sito: il cookie Strict non parte. */
    const sulNomeDellaFinestra = new URL(page.url());
    sulNomeDellaFinestra.host = new URL(finestra).host;
    const risposta = page.waitForResponse((r) => r.url() === sulNomeDellaFinestra.href);
    await page.evaluate((u) => { location.href = u; }, sulNomeDellaFinestra.href);
    expect((await risposta).status()).toBe(401);
    await expect(page.locator('body')).not.toContainText('dev server');
    expect(await page.evaluate(() => window.caricato)).toBeUndefined();
  } finally {
    dev.closeAllConnections?.();
    await new Promise((ok) => { dev.close(ok); });
  }
});

/*
 * N1 della seconda revisione (S1, 03/11/2026): una cornice DIRETTA della finestra su un altro server di loopback è lo stesso sito, e il cookie Strict partiva. Le
 * due strade della revisione: la lettura di `naviga` (cornice su `127.0.0.1:<dev>`) e un rimando da un'altra porta. In tutti e due i casi il server del comando non
 * deve vedere `talos_token`: la CSP del documento rifiuta la cornice, e il pannello passa dal proxy.
 */
test('GS-20 nessuna cornice diretta sul loopback: né una lettura né un rimando portano il cookie al server di un comando', async ({ page, baseURL }) => {
  test.skip(!process.env.TALOS_PW_GETTONE, 'serve il server della corsa');
  const cookieVisti = [];
  const dev = createServer((q, s) => { cookieVisti.push(q.headers.cookie ?? ''); s.writeHead(200, { 'Content-Type': 'text/html' }); s.end('<!doctype html><title>dev</title>dev'); });
  await new Promise((ok) => { dev.listen(0, '127.0.0.1', ok); });
  const rimanda = createServer((q, s) => { cookieVisti.push(q.headers.cookie ?? ''); s.writeHead(302, { Location: `http://127.0.0.1:${dev.address().port}/` }); s.end(); });
  await new Promise((ok) => { rimanda.listen(0, '127.0.0.1', ok); });
  try {
    await page.goto(new URL('/', baseURL).href);
    const negate = [];
    page.on('console', (m) => { if (/Content Security Policy|frame-src/iu.test(m.text())) negate.push(m.text()); });
    for (const indirizzo of [`http://127.0.0.1:${dev.address().port}/`, `http://localhost:${dev.address().port}/`, `http://127.0.0.1:${rimanda.address().port}/`]) {
      await page.evaluate((u) => { const f = document.createElement('iframe'); f.src = u; document.body.append(f); }, indirizzo);
    }
    await page.waitForTimeout(1500);
    expect(cookieVisti.filter((c) => c.includes('talos_token'))).toEqual([]);
    expect(negate.length).toBeGreaterThan(0);
  } finally {
    for (const s of [dev, rimanda]) { s.closeAllConnections?.(); await new Promise((ok) => { s.close(ok); }); }
  }
});
