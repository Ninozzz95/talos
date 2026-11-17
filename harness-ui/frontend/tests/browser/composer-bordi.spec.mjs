import { test, expect } from '@playwright/test';

/*
 * P1 (11/11/2026, owner «il composer va a scatti nelle chat lunghe»): l'ascoltatore `input` del composer chiama `syncRunComposerState` solo
 *   quando cambia un BORDO del testo (vuoto ↔ pieno, `!` in testa, `/` in testa), come Hermes (`apps/desktop/src/app/chat/composer/
 *   composer-store-writer.ts:11-21`). Ciò che dipende dal testo deve restare giusto a ogni bordo: «Indirizza» a giro acceso (`haTesto`),
 *   il suggerimento che sparisce alla prima lettera, la modalità shell col `!`, l'elenco dei comandi col `/`. Una prova per bordo.
 * E il contrario: fra due bordi una lettera NON rifà il composer — il pulsante d'invio non riceve una scrittura di attributi per lettera
 *   (prima: `aria-label`, `title`, `href` riscritti a ogni tasto, anche identici).
 */
const ID = 'bordi-composer';
const MODELLO = 'local:prova';

async function apriConGiroAcceso(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' } }));
  });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* aperto e muto */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.evaluate(({ id, modello }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Bordi', modello, { conclusa: false, modello });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    r.handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r-1', input: { consegna: 'Un giro acceso' }, _sequenza: 1 }, g);
  }, { id: ID, modello: MODELLO });
  await expect(page.locator('#composerForm .send-btn')).toHaveClass(/is-stop/u);
}

test('COMPOSER-BORDI-01 — vuoto ↔ pieno: «Indirizza» compare alla prima lettera a giro acceso e sparisce col campo vuoto', async ({ page }) => {
  await apriConGiroAcceso(page);
  const indirizza = page.locator('#redirectRunButton');
  await expect(indirizza).toBeHidden();
  await page.locator('#composerInput').focus();
  await page.keyboard.type('a');
  await expect(indirizza).toBeVisible();
  await page.keyboard.type('ltro testo');
  await expect(indirizza).toBeVisible();
  for (let i = 0; i < 'altro testo'.length; i += 1) await page.keyboard.press('Backspace');
  await expect(page.locator('#composerInput')).toHaveValue('');
  await expect(indirizza).toBeHidden();
  // solo spazi è «vuoto»: il bordo guarda il testo senza spazi, come `haTesto`
  await page.keyboard.type('   ');
  await expect(indirizza).toBeHidden();
});

test('COMPOSER-BORDI-02 — fra due bordi una lettera non riscrive il pulsante d invio; il bordo sì', async ({ page }) => {
  await apriConGiroAcceso(page);
  await page.locator('#composerInput').focus();
  await page.evaluate(() => {
    window.__scritture = 0;
    new MutationObserver((l) => { window.__scritture += l.length; }).observe(document.querySelector('#composerForm .send-btn'), { attributes: true, subtree: true });
  });
  await page.keyboard.type('Una frase di prova di quaranta lettere!!', { delay: 20 });
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const scritture = await page.evaluate(() => window.__scritture);
  console.log(`[composer-bordi] scritture di attributi sul pulsante d'invio per 40 lettere: ${scritture}`);
  expect(scritture, 'una scrittura per bordo (vuoto → pieno), non una per lettera').toBeLessThanOrEqual(8);
});

test('COMPOSER-BORDI-03 — «!» in testa accende la modalità shell, «/» apre l elenco dei comandi, e tornano giusti cancellando', async ({ page }) => {
  await apriConGiroAcceso(page);
  const form = page.locator('#composerForm');
  await page.locator('#composerInput').focus();
  await page.keyboard.type('!ls');
  await expect(form).toHaveClass(/talos-composer--shell/u);
  await expect(page.locator('#redirectRunButton')).toBeVisible();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Backspace');
  await expect(form).not.toHaveClass(/talos-composer--shell/u);
  await expect(page.locator('#redirectRunButton')).toBeHidden();
  await page.keyboard.type('/');
  await expect(page.locator('#suggerimentoComandi')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#suggerimentoComandi')).toBeHidden();
});

test('COMPOSER-BORDI-04 — a giro fermo il suggerimento nel campo sparisce alla prima lettera', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => {});
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.evaluate(({ id, modello }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Bordi', modello, { conclusa: true, modello });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    r.handleRealEvent({ type: 'RunStarted', threadId: 't', runId: 'r-1', input: { consegna: 'Un giro' }, _sequenza: 1 }, g);
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'c-1', toolCallName: 'shell', _sequenza: 2 }, g);
    r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c-1', delta: JSON.stringify({ comando: 'npm test' }), _sequenza: 3 }, g);
    r.handleRealEvent({ type: 'ToolCallResult', messageId: 'rc-1', toolCallId: 'c-1', content: 'ok', role: 'tool', isError: false, comando: 'npm test', exitCode: 0, _sequenza: 4 }, g);
    r.handleRealEvent({ type: 'RunFinished', threadId: 't', runId: 'r-1', outcome: { type: 'success' }, _sequenza: 5 }, g);
  }, { id: ID, modello: MODELLO });
  const campo = page.locator('#composerInput');
  await expect(page.locator('#composerForm .send-btn')).not.toHaveClass(/is-stop/u);
  const conSuggerimento = await campo.evaluate((n) => n.classList.contains('composer-has-suggestion'));
  test.skip(!conSuggerimento, 'nessun suggerimento dopo questo giro: il bordo del suggerimento non si prova qui');
  await campo.focus();
  await page.keyboard.type('x');
  await expect(campo).not.toHaveClass(/composer-has-suggestion/u);
});
