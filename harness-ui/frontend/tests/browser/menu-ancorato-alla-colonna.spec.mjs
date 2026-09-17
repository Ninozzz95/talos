import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ F1 (17/09/2026) — IL MENU NON ESCE DALLA COLONNA DELLA CONVERSAZIONE.
 *
 * Trovato dal coordinatore GUARDANDO le foto, non rileggendo: in
 * `6-menu-utente-piu-dark-1440x900.png` il menu «Elimina il messaggio» galleggiava da x≈975 a
 * x≈1313, sopra l'Ispettore, coprendo «Worktree» e «Non salvate» — e lontano dal suo «⋯».
 *
 * ⛔ Il giro prima avevo scritto che «si allinea a destra quando il pulsante sta nella metà
 *   destra», e nella foto non succedeva: il confronto era con `innerWidth` (1440), non con la
 *   colonna. Il «⋯» della persona sta a 974 e il menu è largo 340: 974+340 = 1314 < 1432, quindi
 *   la condizione era falsa e il menu cresceva a DESTRA, fuori dalla conversazione. Una regola
 *   scritta nel commento e misurata sul contenitore sbagliato è una regola che non c'è.
 *
 * ⇒ Due proprietà, misurate sui rettangoli veri e non dedotte dalla posizione:
 *    1. il bordo DESTRO del menu non supera il bordo destro della colonna;
 *    2. il menu nasce dal suo pulsante — al più 8 px sotto di esso.
 *   Sui DUE percorsi («⋯» e tasto destro), per la risposta E per il messaggio della persona, a
 *   1024 e a 1440.
 */

const MISURE = `(() => {
  const menu = document.querySelector('#menuRispostaMessaggio').getBoundingClientRect();
  const colonna = document.querySelector('#schermoChat .talos-conversation').getBoundingClientRect();
  const aperto = document.querySelector('[data-message-action="piu"][aria-expanded="true"]').getBoundingClientRect();
  return {
    menu: { left: Math.round(menu.left), right: Math.round(menu.right), top: Math.round(menu.top) },
    colonna: { left: Math.round(colonna.left), right: Math.round(colonna.right) },
    pulsante: { left: Math.round(aperto.left), right: Math.round(aperto.right), bottom: Math.round(aperto.bottom) },
  };
})()`;

async function apriApp(page, { larghezza, altezza }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark' }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  });
  await page.route('**/api/v1/sessions/f1-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('f1-uno', 'workspace', 'F1', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 1, input: { consegna: 'Scrivi le note del progetto' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' } }, g);
    r.handleRealEvent({ type: 'TextMessageStart', messageId: 'm1' }, g);
    r.handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Ho scritto le note.' }, g);
    r.handleRealEvent({ type: 'TextMessageEnd', messageId: 'm1' }, g);
    r.handleRealEvent({ type: 'RunFinished' }, g);
  });
  await expect(page.locator('#conversation .assistant-copy').first()).toContainText('Ho scritto');
}

const BERSAGLI = {
  risposta: '#conversation .talos-message:has(.assistant-copy)',
  persona: '#conversation .talos-message--user',
};

for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
  for (const [chi, selettore] of Object.entries(BERSAGLI)) {
    for (const percorso of ['⋯', 'tasto destro']) {
      test(`F1 (${larghezza}x${altezza}, ${chi}, ${percorso}) — il menu resta nella colonna e nasce dal suo pulsante`, async ({ page }) => {
        await apriApp(page, { larghezza, altezza });
        const messaggio = page.locator(selettore).first();
        if (percorso === '⋯') await messaggio.locator('[data-message-action="piu"]').click();
        else await messaggio.click({ button: 'right', position: { x: 60, y: 12 } });
        await expect(page.locator('#menuRispostaMessaggio')).toBeVisible();
        const m = await page.evaluate(MISURE);
        expect(m.menu.right, `il menu arrivava a ${m.menu.right}, la colonna finisce a ${m.colonna.right}`).toBeLessThanOrEqual(m.colonna.right);
        expect(m.menu.left, 'e non esce nemmeno a sinistra').toBeGreaterThanOrEqual(m.colonna.left);
        expect(m.menu.top - m.pulsante.bottom, 'il menu nasce dal suo pulsante, non altrove').toBeLessThanOrEqual(8);
        expect(m.menu.top - m.pulsante.bottom, 'e sotto, non sopra').toBeGreaterThanOrEqual(0);
        /* ⛔ Il bordo DESTRO del menu si allinea a quello del pulsante: il menu cresce a SINISTRA.
           Quando la colonna non lascia spazio, il taglio della colonna vince — e lo si dice. */
        const allineato = m.menu.right === m.pulsante.right || m.menu.right === m.colonna.right - 8 || m.menu.left === m.colonna.left + 8;
        expect(allineato, `menu.right=${m.menu.right}, pulsante.right=${m.pulsante.right}, colonna=[${m.colonna.left},${m.colonna.right}]`).toBe(true);
      });
    }
  }
}
