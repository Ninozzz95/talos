import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ 02/09 — review complessiva, ordine owner: "non togliere il mockup ma
 * agganciarlo e renderlo veramente funzionale". Review center, Browser e
 * campanella erano tre superfici con dati scritti a mano (3 file finti,
 * telefono finto, badge "2"). Ora: stato vuoto onesto all'avvio, dati reali
 * dalla sessione, azioni che fanno qualcosa. Ogni test prova anche il verso
 * contrario (vuoto → pieno → azione).
 */
test('REVIEW-REAL-41 — la Review parte vuota e onesta, si riempie dallo StateDelta reale e Commenta scrive nel composer', async ({ page }) => {
  await page.route('**/api/v1/sessions/review-real/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  const vuoto = await page.evaluate(() => {
    window.__talosHarnessUiRuntime.executeCommand('review');
    const pane = document.querySelector('[data-view="diff"]');
    return {
      testo: pane.textContent,
      copiaDisabilitato: document.querySelector('#copyAllDiffs').disabled,
      commentaDisabilitato: document.querySelector('[data-review-action="comment"]').disabled,
      fileFinti: pane.querySelectorAll('.file-review').length,
    };
  });
  expect(vuoto.testo).toContain('Nessuna modifica in questa sessione');
  expect(vuoto.testo).not.toContain('TalosComposer');
  expect(vuoto.fileFinti).toBe(0);
  expect(vuoto.copiaDisabilitato).toBe(true);
  expect(vuoto.commentaDisabilitato).toBe(true);

  const pieno = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('review-real', 'workspace', 'Review reale', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/conto.js', value: 'const a = 2;\nconst b = 3;\n', prima: 'const a = 1;\nconst b = 3;\n' }], _sequenza: 41001 }, generation);
    runtime.executeCommand('review');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const pane = document.querySelector('[data-view="diff"]');
    document.querySelector('[data-review-action="comment"]').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      titolo: pane.querySelector('h2').textContent,
      file: [...pane.querySelectorAll('.file-review strong')].map((e) => e.textContent),
      del: pane.querySelectorAll('#diffCode .del').length,
      add: pane.querySelectorAll('#diffCode .add').length,
      path: document.querySelector('#diffPath').textContent,
      copiaDisabilitato: document.querySelector('#copyAllDiffs').disabled,
      composer: document.querySelector('#composerInput').value,
      vistaDopoCommenta: document.querySelector('.view-pane.active')?.dataset.view,
    };
  });
  expect(pieno.titolo).toBe('1 file modificato');
  expect(pieno.file).toEqual(['conto.js']);
  expect(pieno.del).toBe(1);
  expect(pieno.add).toBe(1);
  expect(pieno.path).toBe('src/conto.js');
  expect(pieno.copiaDisabilitato).toBe(false);
  expect(pieno.composer).toContain('src/conto.js');
  expect(pieno.vistaDopoCommenta).toBe('chat');
});

test('BROWSER-REAL-42 — il Browser parte senza telefono finto, mostra le pagine lette da naviga e scorre la cronologia', async ({ page }) => {
  await page.route('**/api/v1/sessions/browser-real/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  const vuoto = await page.evaluate(() => {
    window.__talosHarnessUiRuntime.executeCommand('browser');
    const pane = document.querySelector('[data-view="browser"]');
    return { phone: pane.querySelectorAll('.phone-frame').length, url: pane.querySelector('.browser-url').textContent.trim(), backDisabilitato: pane.querySelector('[data-browser-action="back"]').disabled, testo: pane.textContent };
  });
  expect(vuoto.phone).toBe(0);
  expect(vuoto.url).toBe('—');
  expect(vuoto.backDisabilitato).toBe(true);
  expect(vuoto.testo).not.toContain('gpt-5.6-sol');

  const letto = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('browser-real', 'workspace', 'Browser reale', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    let seq = 42000;
    const leggi = (id, url, testo) => {
      runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'naviga', _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ url }), _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: testo, _sequenza: seq += 1 }, generation);
    };
    leggi('n1', 'https://esempio.test/uno', 'Testo della prima pagina');
    leggi('n2', 'https://esempio.test/due', 'Testo della seconda pagina');
    runtime.executeCommand('browser');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const pane = document.querySelector('[data-view="browser"]');
    const dopoDue = { url: pane.querySelector('.browser-url').textContent.trim(), testo: pane.querySelector('.browser-real-output').textContent, back: pane.querySelector('[data-browser-action="back"]').disabled, forward: pane.querySelector('[data-browser-action="forward"]').disabled, apri: pane.querySelector('[data-browser-action="open"]').disabled };
    pane.querySelector('[data-browser-action="back"]').click();
    const dopoIndietro = { url: pane.querySelector('.browser-url').textContent.trim(), testo: pane.querySelector('.browser-real-output').textContent, back: pane.querySelector('[data-browser-action="back"]').disabled, forward: pane.querySelector('[data-browser-action="forward"]').disabled };
    pane.querySelector('[data-browser-action="annotate"]').click();
    return { dopoDue, dopoIndietro, composer: document.querySelector('#composerInput').value };
  });
  expect(letto.dopoDue.url).toBe('https://esempio.test/due');
  expect(letto.dopoDue.testo).toBe('Testo della seconda pagina');
  expect(letto.dopoDue.back).toBe(false);
  expect(letto.dopoDue.forward).toBe(true);
  expect(letto.dopoDue.apri).toBe(false);
  expect(letto.dopoIndietro.url).toBe('https://esempio.test/uno');
  expect(letto.dopoIndietro.testo).toBe('Testo della prima pagina');
  expect(letto.dopoIndietro.back).toBe(true);
  expect(letto.dopoIndietro.forward).toBe(false);
  expect(letto.composer).toContain('https://esempio.test/uno');
});

test('NOTIFICHE-REALI-43 — la campanella conta solo le sessioni che chiedono attenzione e il popover porta alla sessione', async ({ page }) => {
  const base = { taskId: 'workspace', modello: 'qwen/qwen3.8-flash', avviataAlle: '2026-09-02T08:00:00.000Z', interrotta: false, usage: null };
  const elenco = [
    { ...base, sessionId: 'n-approvazione', nome: 'Aspetta te', conclusa: false, inAttesaApprovazione: true },
    { ...base, sessionId: 'n-conclusa', nome: 'Gia vista', conclusa: true, inAttesaApprovazione: false },
    { ...base, sessionId: 'n-incorso', nome: 'In corso', conclusa: false, inAttesaApprovazione: false },
  ];
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: elenco }, meta: { schema: 'talos.harness-ui.api.v1' } }) }));
  await page.route('**/api/v1/sessions/n-approvazione/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('#notificationsBadge')?.hidden === false, null, { timeout: 5000 });
  const primo = await page.evaluate(() => ({ badge: document.querySelector('#notificationsBadge').textContent, hidden: document.querySelector('#notificationsBadge').hidden }));
  // prima esecuzione: le sessioni concluse esistenti sono gia viste; un approvazione in attesa notifica sempre
  expect(primo.hidden).toBe(false);
  expect(primo.badge).toBe('1');

  // la sessione in corso finisce: alla prossima lettura dell elenco diventa una notifica
  elenco[2].conclusa = true;
  const secondo = await page.evaluate(async () => {
    await window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali();
    return document.querySelector('#notificationsBadge').textContent;
  });
  expect(secondo).toBe('2');

  await page.locator('#notificationsBtn').click();
  const voci = await page.locator('.notifications-menu .notifications-item strong').allTextContents();
  expect(voci).toEqual(['Aspetta te', 'In corso']);
  await page.locator('.notifications-menu .notifications-item').first().click();
  const dopo = await page.evaluate(() => ({ vista: document.querySelector('.view-pane.active')?.dataset.view, sessione: window.__talosHarnessUiRuntime.realSessionState.id, menu: document.querySelectorAll('.notifications-menu').length }));
  expect(dopo.vista).toBe('chat');
  expect(dopo.sessione).toBe('n-approvazione');
  expect(dopo.menu).toBe(0);
});
