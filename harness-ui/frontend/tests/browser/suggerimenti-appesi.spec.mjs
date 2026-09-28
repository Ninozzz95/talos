import { test, expect } from '@playwright/test';

/*
 * Difetti (6) e (7) delle foto di Ask e del Piano: dopo lo Stop «Interrompi adesso» restava sul bottone diventato «Invia», e
 * «Context Manager» restava disegnato sopra la finestra appena aperta — finché il puntatore non si spostava. Un meccanismo
 * solo: il clic chiude il suggerimento ma dà il fuoco al bottone, e `focusin` lo riapriva col testo di prima. Cura come
 * Hermes (`components/ui/tooltip.tsx:64-92`): al fuoco si apre solo da tastiera; il fuoco altrove chiude; un testo che
 * cambia chiude. Server di prova (porta 4176): ogni richiesta non-GET si ferma e si conta.
 */
const SESSIONE = 'suggerimenti';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;
const bolla = (page) => page.locator('#talosTip');

async function apri(page) {
  const contatore = { nonGet: 0 };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
  });
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Suggerimenti', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  /* Due bottoni di prova nel piede della chat, trattati dal componente come qualunque altro: A senza suggerimento, B con. */
  await page.evaluate(() => {
    const piede = document.querySelector('#schermoChat .talos-chat-foot') || document.body;
    const a = Object.assign(document.createElement('button'), { id: 'provaA', textContent: 'A' });
    const b = Object.assign(document.createElement('button'), { id: 'provaB', textContent: 'B', title: 'Interrompi adesso' });
    const h = Object.assign(document.createElement('h2'), { id: 'provaTitolo', textContent: 'Titolo', tabIndex: -1 });
    b.addEventListener('click', () => { b.title = 'Invia'; b.textContent = 'Invia'; });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); h.focus(); } });
    piede.prepend(a, b, h);
  });
  return contatore;
}

test('TIP-06 — dopo il clic il suggerimento non si riapre col testo vecchio (Stop → Invia)', async ({ page }) => {
  const c = await apri(page);
  await page.locator('#provaB').hover();
  await expect(bolla(page)).toBeVisible();
  await expect(bolla(page)).toHaveText(/Interrompi adesso/u);
  await page.locator('#provaB').click();
  await page.waitForTimeout(700); // oltre il ritardo di 350 ms: prima della cura si riapriva qui
  await expect(bolla(page), 'il fuoco restituito da un clic non riapre niente').toBeHidden();
  expect(c.nonGet).toBe(0);
});

test('TIP-06b — un testo che CAMBIA chiude il suggerimento; una riscrittura identica no', async ({ page }) => {
  const c = await apri(page);
  await page.locator('#provaB').hover();
  await expect(bolla(page)).toHaveText(/Interrompi adesso/u);
  await page.evaluate(() => { document.querySelector('#provaB').title = 'Interrompi adesso'; }); // il piede che ridisegna
  await page.waitForTimeout(150);
  await expect(bolla(page), 'una riscrittura identica non è una notizia').toBeVisible();
  await page.evaluate(() => { document.querySelector('#provaB').title = 'Invia'; });
  await expect(bolla(page), 'il testo è cambiato: il suggerimento vecchio si chiude').toBeHidden();
  await expect(page.locator('#provaB')).not.toHaveAttribute('title', /.*/u); // e quello nativo non torna
  expect(c.nonGet).toBe(0);
});

test('TIP-07 — da tastiera si apre; quando il fuoco va su un titolo senza suggerimento, si chiude', async ({ page }) => {
  const c = await apri(page);
  await page.locator('#provaA').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#provaB')).toBeFocused();
  await expect(bolla(page), 'AL CONTRARIO: il fuoco da tastiera apre ancora il suggerimento (WCAG 1.4.13)').toBeVisible();
  await page.keyboard.press('Enter'); // il bottone porta il fuoco al titolo, come la finestra del contesto
  await expect(page.locator('#provaTitolo')).toBeFocused();
  await expect(bolla(page)).toBeHidden();
  expect(c.nonGet).toBe(0);
});

/* Il caso che `focusout` NON copre: il suggerimento l'ha aperto il MOUSE (il bersaglio non ha il fuoco, quindi non lo perde), e
   una scorciatoia da tastiera porta il fuoco altrove — una finestra che si apre col titolo a fuoco. Senza la regola (2) il
   suggerimento resta disegnato sopra, finché il puntatore non si sposta: la stessa forma del difetto (7). */
test('TIP-07c — aperto dal mouse, si chiude quando il fuoco va altrove da tastiera', async ({ page }) => {
  const c = await apri(page);
  await page.locator('#provaB').hover();
  await expect(bolla(page)).toHaveText('Interrompi adesso');
  await page.keyboard.press('Shift'); // l'ultima interazione vera è la tastiera
  await page.evaluate(() => document.querySelector('#provaTitolo').focus()); // come una finestra aperta da scorciatoia
  await expect(page.locator('#provaTitolo')).toBeFocused();
  await expect(bolla(page), 'il fuoco è andato su un titolo senza suggerimento: quello aperto dal mouse si chiude').toBeHidden();
  expect(c.nonGet).toBe(0);
});

test('TIP-07b — il caso vero: «Context Manager» non resta sopra la finestra appena aperta', async ({ page }) => {
  const c = await apri(page);
  const bottone = page.locator('#schermoChat [data-azione="comprimi"]:visible').first();
  await bottone.hover();
  await expect(bolla(page)).toHaveText(/Context Manager/u);
  await bottone.click();
  await expect(page.locator('#veloContesto')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(bolla(page)).toBeHidden();
  await page.screenshot({ path: 'artifacts/suggerimento-context-manager-1440-dark.png' });
  expect(c.nonGet).toBe(0);
});
