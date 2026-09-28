import { test, expect } from '@playwright/test';

/*
 * Difetto (8) delle foto di Ask e del Piano: riaperta da tastiera, la finestra del contesto mostrava l'anello del fuoco sul
 * titolo. Il fuoco iniziale resta sul titolo (APG, contenuto lungo: `context-compactor.js:331-332`); l'anello no, perché il
 * titolo non è un comando. Al contrario: un pulsante della finestra raggiunto col Tab tiene il suo anello.
 * Sessione finta sul server di prova (porta 4176): ogni richiesta non-GET si ferma e si conta.
 */
const SESSIONE = 'contesto-fuoco';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;

for (const tema of ['dark', 'light']) {
  test(`CTX-DIALOG-TITLE-FOCUS-08 — aperta da tastiera: fuoco sul titolo, senza anello; un pulsante col Tab lo tiene (${tema})`, async ({ page }) => {
    const contatore = { nonGet: 0 };
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.addInitScript((colorMode) => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
    }, tema);
    await page.route('**/api/v1/**', (route) => {
      const req = route.request();
      if (new URL(req.url()).pathname.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
      if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
      return route.continue();
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
    await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Fuoco', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
    await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
    const bottone = page.locator('#schermoChat [data-azione="comprimi"]:visible').first();
    await bottone.focus();
    await page.keyboard.press('Enter');
    const titolo = page.locator('#titoloContesto');
    await expect(titolo).toBeFocused();
    const anello = await titolo.evaluate((n) => ({ visibile: n.matches(':focus-visible'), stile: getComputedStyle(n).outlineStyle }));
    expect(anello.visibile, 'la prova vale solo se il fuoco è arrivato «da tastiera»').toBe(true);
    expect(anello.stile, 'il titolo non è un comando: niente anello').toBe('none');
    await page.screenshot({ path: `artifacts/contesto-fuoco-titolo-1440-${tema}.png` });
    // al contrario: il primo comando raggiunto col Tab tiene il SUO indicatore. Le maniglie non hanno `outline`: il loro
    // anello è la barra `::after` col colore dell'anello (`index.css` `.talos-resizer:focus-visible::after`).
    await page.keyboard.press('Tab');
    const comando = await page.evaluate(async () => {
      const a = document.activeElement;
      // la barra della maniglia entra con una transizione di colore: si legge a transizione finita
      await Promise.all(a.getAnimations({ subtree: true }).map((x) => x.finished.catch(() => {})));
      const s = getComputedStyle(a);
      const sonda = document.createElement('span');
      sonda.style.backgroundColor = 'var(--talos-ring)';
      document.body.append(sonda);
      const anello = getComputedStyle(sonda).backgroundColor;
      sonda.remove();
      return { tag: a?.tagName, visibile: a.matches(':focus-visible'), outline: s.outlineStyle, ombra: s.boxShadow, barra: getComputedStyle(a, '::after').backgroundColor, anello };
    });
    expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'A']).toContain(comando.tag);
    expect(comando.visibile, 'il fuoco del Tab è «da tastiera»').toBe(true);
    const indicatore = comando.outline !== 'none' || comando.ombra !== 'none' || comando.barra === comando.anello;
    expect(indicatore, `il comando (${comando.tag}) raggiunto col Tab mostra un indicatore: ${JSON.stringify(comando)}`).toBe(true);
    expect(contatore.nonGet).toBe(0);
  });
}
