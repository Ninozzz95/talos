import { test, expect } from '@playwright/test';

// Frontend di produzione, trasporto controllato: non è una prova di inferenza.
test.use({ channel: 'chrome' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  await page.route('**/api/v1/sessions/chat-proof-*/events', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
});

async function apri(page, id = 'attiva', chiusa = false) {
  await page.evaluate(({ id, chiusa }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(`chat-proof-${id}`, 'workspace', 'Conversazione di prova', 'local:prova', { conclusa: chiusa, modello: 'local:prova' });
  }, { id, chiusa });
}
async function eventi(page, events) {
  await page.evaluate(events => {
    const r = window.__talosHarnessUiRuntime;
    for (const event of events) r.handleRealEvent(event, r.realSessionState.generation);
  }, events);
}
const avvio = { type: 'RunStarted', input: { consegna: 'Ciao, mi aiuti a controllare questo progetto?' } };

test('CHAT-ATTESA-01 — torno alla sessione prima del primo token e vedo ancora l’attesa', async ({ page }, testInfo) => {
  await apri(page);
  await eventi(page, [avvio, { type: 'ReasoningMessageStart', messageId: 'r1' }]);
  await expect(page.locator('#conversation .talos-waiting')).toBeVisible();
  await apri(page, 'altra', true);
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
  await apri(page);
  await eventi(page, [avvio]);
  await expect(page.locator('#conversation .talos-waiting')).toBeVisible();
  await eventi(page, [{ type: 'ReasoningMessageStart', messageId: 'r1' }]);
  await expect(page.locator('#conversation .talos-waiting')).toHaveAttribute('data-activity', 'reasoning');
  await page.screenshot({ path: testInfo.outputPath('attesa-ritrovata.png') });
  await eventi(page, [{ type: 'RunFinished' }]);
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
});

test('CHAT-ATTESA-02 — il testo precedente non cancella il ragionamento nuovo', async ({ page }) => {
  await apri(page);
  await eventi(page, [avvio,
    { type: 'TextMessageContent', messageId: 'precedente', delta: 'Ho letto il progetto. '.repeat(200) },
    { type: 'TextMessageEnd', messageId: 'precedente' },
    { type: 'ReasoningMessageStart', messageId: 'nuovo' },
  ]);
  await expect(page.locator('#conversation .talos-message__copy .assistant-copy')).not.toBeEmpty();
  // Attendiamo che si esauriscano anche i frame del testo precedente.
  await expect(page.locator('#conversation .is-streaming')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('#conversation .talos-waiting')).toHaveAttribute('data-activity', 'reasoning');
  await eventi(page, [{ type: 'ReasoningMessageEnd', messageId: 'nuovo' },
    { type: 'TextMessageContent', messageId: 'risposta', delta: 'Ora ho finito.' }]);
  await expect(page.locator('#conversation .assistant-copy').last()).toContainText('Ora ho finito.');
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
});

test('CHAT-ATTESA-03 — lo storico interrotto non inventa una run attiva', async ({ page }) => {
  await apri(page, 'chiusa', true);
  await eventi(page, [avvio, { type: 'ReasoningMessageStart', messageId: 'r1' }, { type: 'ReasoningMessageEnd', messageId: 'r1' }]);
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
});

for (const [width, height] of [[1440, 900], [1280, 900], [1024, 900], [1920, 1080], [2560, 1440], [3840, 2160]]) {
  test(`CHAT-FONDO-01 — torno in fondo anche dopo la fine, ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: width === 1440 ? 'no-preference' : 'reduce' });
    await apri(page);
    const button = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
    await expect(button).toBeHidden();
    await eventi(page, [avvio, { type: 'TextMessageContent', messageId: 'lungo', delta: Array.from({ length: 70 }, (_, i) => `Paragrafo ${i + 1}: il progetto conserva la cronologia.\n\n`).join('') }, { type: 'TextMessageEnd', messageId: 'lungo' }, { type: 'RunFinished' }]);
    await expect(page.locator('#conversation .is-streaming')).toHaveCount(0, { timeout: 15000 });
    const scroller = page.locator('#schermoChat .talos-conversation');
    await scroller.hover();
    await page.mouse.wheel(0, -20000);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.width).toBe(box.height);
    expect(await button.evaluate(b => { const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    await test.step('CHAT-FONDO-HOVER-02 — puntatore fermo al bordo, nessun salto o lampeggio', async () => {
      const iniziale = await button.evaluate(b => {
        const s = getComputedStyle(b);
        return { color: s.backgroundColor, bordo: s.borderTopColor, icona: s.color };
      });
      await page.mouse.move(box.x + 3, box.y + box.height / 2);
      const campioni = await button.evaluate(async b => {
        const values = [];
        for (let i = 0; i < 45; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          const r = b.getBoundingClientRect();
          const s = getComputedStyle(b);
          values.push({ x: r.x, y: r.y, hover: b.matches(':hover'), color: s.backgroundColor, bordo: s.borderTopColor, icona: s.color });
        }
        return values;
      });
      await page.screenshot({ path: testInfo.outputPath(`hover-fondo-${width}.png`) });
      expect(campioni.every(c => c.hover)).toBe(true);
      expect(Math.max(...campioni.map(c => Math.abs(c.x - box.x)))).toBeLessThan(0.5);
      expect(Math.max(...campioni.map(c => Math.abs(c.y - box.y)))).toBeLessThan(0.5);
      expect(new Set(campioni.slice(-10).map(c => c.color)).size).toBe(1);
      for (const c of campioni) {
        expect({ color: c.color, bordo: c.bordo, icona: c.icona }).toEqual(iniziale);
      }
      await page.mouse.move(0, 0);
    });
    await page.screenshot({ path: testInfo.outputPath(`torna-in-fondo-${width}.png`) });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toBeHidden();
    expect(await scroller.evaluate(e => e.scrollHeight - e.clientHeight - e.scrollTop)).toBeLessThanOrEqual(4);
    // Stesso controllo durante un nuovo turno: non dipende dalla striscia di stato.
    await eventi(page, [{ ...avvio, input: { consegna: 'Continua, per favore', seguito: true } }]);
    await expect.poll(() => scroller.evaluate(e => e.scrollHeight - e.clientHeight - e.scrollTop)).toBeLessThanOrEqual(4);
    await scroller.hover();
    await page.mouse.wheel(0, -20000);
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toBeHidden();
  });
}
