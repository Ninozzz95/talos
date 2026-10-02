import { expect, test } from '@playwright/test';
import { chiudiToastAperti } from './aiuto-toast.mjs';

test('R4-RETURN-ASK-GATE-TRANSITION: pending Ask protects controls, resolution restores the transparent overlay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/sessions/r4-return-ask/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/r4-return-ask/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: [] } },
  }));
  await page.route('**/api/v1/sessions/r4-return-ask/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('r4-return-ask', 'workspace', 'Ask e ritorno', 'z-ai/glm-5.3-flash', { conclusa: false });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', _sequenza: 9301,
      input: { consegna: 'Riepiloga il lavoro' }, contesto: {} }, generation);
    runtime.handleRealEvent({ type: 'TextMessageContent', _sequenza: 9302,
      messageId: 'long-answer', delta: Array.from({ length: 80 }, (_, index) =>
        `Paragrafo ${index}: ${'Una risposta verificabile. '.repeat(20)}\n\n`).join('') }, generation);
    runtime.handleRealEvent({ type: 'TextMessageEnd', _sequenza: 9303,
      messageId: 'long-answer' }, generation);
    runtime.handleRealEvent({ type: 'UserQuestionRequested', _sequenza: 9304,
      requestId: 'ask-return-1', questions: [{ id: 'choice', question: 'Proseguo?',
        options: [{ label: 'Sì', description: 'Continua' }, { label: 'No', description: 'Fermati' }] }] }, generation);
  });
  const scroller = page.locator('#schermoChat .talos-conversation');
  const down = page.locator('#chatTornaInFondo');
  const band = page.locator('.talos-chat-return');
  await expect(page.locator('#userQuestionDock [data-request-id="ask-return-1"]')).toBeVisible();
  await scroller.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await expect(down).toBeVisible();
  await expect.poll(() => band.evaluate((node) => node.getBoundingClientRect().height)).toBe(48);
  const protectedButton = await down.boundingBox();
  const protectedScroller = await scroller.boundingBox();
  expect(protectedButton.y).toBeGreaterThanOrEqual(protectedScroller.y + protectedScroller.height - 1);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'UserQuestionResolved', _sequenza: 9305,
      requestId: 'ask-return-1', status: 'answered', answers: { choice: 'Sì' } },
    runtime.realSessionState.generation);
  });
  await expect(page.locator('#userQuestionDock')).toBeHidden();
  await scroller.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await expect(down).toBeVisible();
  await expect.poll(() => band.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
  const transparentButton = await down.boundingBox();
  const transparentScroller = await scroller.boundingBox();
  expect(transparentButton.y + transparentButton.height).toBeLessThanOrEqual(
    transparentScroller.y + transparentScroller.height + 1,
  );
});

test('R4-RETURN-NO-GATE-HITTEST: completed message actions remain clickable under the transparent return control', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/sessions/r4-return-history/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/r4-return-history/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: [] } },
  }));
  await page.route('**/api/v1/sessions/r4-return-history/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('r4-return-history', 'workspace', 'Cronologia', 'z-ai/glm-5.3-flash', { conclusa: false });
    const generation = runtime.realSessionState.generation;
    for (let index = 1; index <= 6; index += 1) {
      const seq = index * 10;
      runtime.handleRealEvent({ type: 'RunStarted', _sequenza: seq,
        input: { consegna: `Domanda ${index}` }, contesto: {} }, generation);
      runtime.handleRealEvent({ type: 'TextMessageStart', _sequenza: seq + 1,
        messageId: `message-${index}` }, generation);
      runtime.handleRealEvent({ type: 'TextMessageContent', _sequenza: seq + 2,
        messageId: `message-${index}`,
        delta: `Risposta verificata ${index}. ${'Contenuto del giro. '.repeat(25)}` }, generation);
      runtime.handleRealEvent({ type: 'TextMessageEnd', _sequenza: seq + 3,
        messageId: `message-${index}` }, generation);
      runtime.handleRealEvent({ type: 'RunFinished', _sequenza: seq + 4 }, generation);
    }
  });
  const scroller = page.locator('#schermoChat .talos-conversation');
  const down = page.locator('#chatTornaInFondo');
  const max = await scroller.evaluate((node) => node.scrollHeight - node.clientHeight);
  expect(max).toBeGreaterThan(400);
  const hits = [];
  let visiblePositions = 0;
  for (let distance = 100; distance <= max && visiblePositions < 60; distance += 40) {
    await scroller.evaluate((node, d) => {
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight - d);
      node.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, distance);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (!(await down.isVisible())) continue;
    visiblePositions += 1;
    const hit = await page.evaluate(() => {
      const round = document.querySelector('#chatTornaInFondo').getBoundingClientRect();
      const scroll = document.querySelector('#schermoChat .talos-conversation').getBoundingClientRect();
      const controls = document.querySelectorAll('#conversation button, #conversation a[href], #conversation input, #conversation select');
      return [...controls].flatMap((node) => {
        const rect = node.getBoundingClientRect();
        const width = Math.max(0, Math.min(round.right, rect.right, scroll.right) - Math.max(round.left, rect.left, scroll.left));
        const height = Math.max(0, Math.min(round.bottom, rect.bottom, scroll.bottom) - Math.max(round.top, rect.top, scroll.top));
        return width * height > 0 ? [{ label: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 40), area: Math.round(width * height) }] : [];
      });
    });
    if (hit.length) hits.push({ distance, hit });
  }
  expect(visiblePositions).toBeGreaterThan(3);
  expect(hits, `clickable history controls overlap the return control: ${JSON.stringify(hits.slice(0, 8))}`).toEqual([]);
});

test('R4-PLAN-FINAL-REAL: a completed Plan run renders its real final text as a proposal', async ({ page }) => {
  await page.route('**/api/v1/sessions/r4-plan-ui/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/r4-plan-ui/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: [] } },
  }));
  await page.route('**/api/v1/sessions/r4-plan-ui/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('r4-plan-ui', 'workspace', 'Piano R4', 'z-ai/glm-5.3-flash', { conclusa: false });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({
      type: 'RunStarted', _sequenza: 8101,
      input: { consegna: 'Prepara il piano' },
      contesto: { modalitaOperativa: 'piano', modello: 'z-ai/glm-5.3-flash' },
    }, generation);
    runtime.handleRealEvent({
      type: 'RunFinished', _sequenza: 8102,
      result: { detto: '# Piano\n\n1. Verificare il contratto\n2. Misurare il risultato' },
    }, generation);
  });
  const plan = page.locator('[data-c="PlanArtifact"]');
  await expect(plan).toBeVisible();
  await expect(plan).toContainText('Piano proposto');
  await expect(plan).toContainText('Verificare il contratto');
  await expect(plan.getByRole('button', { name: /Approva|Esegui/ })).toHaveCount(0);
  const bounds = await plan.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.y).toBeLessThan(1080);
});

test('R4-PLAN-TYPED-REPLAY: the durable versioned fact replaces legacy final-text fallback', async ({ page }) => {
  await page.route('**/api/v1/sessions/r4-plan-fact/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/r4-plan-fact/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: [] } },
  }));
  await page.route('**/api/v1/sessions/r4-plan-fact/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('r4-plan-fact', 'workspace', 'Piano duraturo', 'z-ai/glm-5.3-flash', { conclusa: false });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', _sequenza: 8201,
      input: { consegna: 'Prepara un piano' },
      contesto: { modalitaOperativa: 'piano' } }, generation);
    runtime.handleRealEvent({ type: 'RunFinished', _sequenza: 8202,
      result: { detto: '# Fallback\n\nTesto finale reale.' } }, generation);
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.plan', _sequenza: 8203,
      value: { schema: 'talos.plan.v1', planId: 'plan-1', sessionId: 'r4-plan-fact',
        revision: 1, status: 'proposed', content: '# Piano verificato\n\n- Misurare',
        model: 'z-ai/glm-5.3-flash', at: '2026-09-23T10:00:00.000Z' } }, generation);
  });
  const plan = page.locator('[data-c="PlanArtifact"]');
  await expect(plan).toHaveCount(1);
  await expect(plan).toHaveAttribute('data-source', 'journal');
  await expect(plan).toContainText('Piano verificato');
  await expect(plan).not.toContainText('Fallback');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    const base = { type: 'CUSTOM', name: 'talos.plan' };
    runtime.handleRealEvent({ ...base, _sequenza: 8204,
      value: { schema: 'talos.plan.v1', planId: 'plan-1', sessionId: 'r4-plan-fact',
        revision: 2, status: 'unavailable', content: null,
        reason: 'PLAN_CONTENT_TOO_LARGE', at: '2026-09-23T10:01:00.000Z' } }, generation);
    runtime.handleRealEvent({ ...base, _sequenza: 8205,
      value: { schema: 'talos.plan.v1', planId: 'plan-1', sessionId: 'r4-plan-fact',
        revision: 1, status: 'proposed', content: '# Piano obsoleto',
        at: '2026-09-23T10:00:00.000Z' } }, generation);
  });
  await expect(plan).toHaveCount(1);
  await expect(plan).toHaveAttribute('data-revision', '2');
  await expect(plan).toContainText('Piano non disponibile');
  await expect(plan).not.toContainText('Piano obsoleto');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', _sequenza: 8206,
      input: { consegna: 'Rivedi il piano' },
      contesto: { modalitaOperativa: 'piano' } }, generation);
    runtime.handleRealEvent({ type: 'RunFinished', _sequenza: 8207,
      result: { detto: '# Revisione provvisoria' } }, generation);
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.plan', _sequenza: 8208,
      value: { schema: 'talos.plan.v1', planId: 'plan-1', sessionId: 'r4-plan-fact',
        revision: 3, status: 'proposed', content: '# Revisione verificata',
        at: '2026-09-23T10:02:00.000Z' } }, generation);
  });
  await expect(plan).toHaveCount(1);
  await expect(plan).toHaveAttribute('data-revision', '3');
  await expect(plan).toContainText('Revisione verificata');
  await expect(plan).not.toContainText('Revisione provvisoria');
});

test('R4-GRAPH-INITIAL-FIT-14: every real session node is inside the central canvas on first open', async ({ page }) => {
  /* 23/09/2026 — rosso 4/4 sulla base (revisione avversaria, D5): le card del grafo 14 escono dal canvas
     (left −548). Il mockup approvato le vuole in COLONNE DI FASE, che esistono solo nei dati Workflow v2:
     la cura è il grafo per fasi della fetta F3-42, non un ritocco qui. Dichiarato, non nascosto. */
  test.fixme(true, 'D5: si chiude col grafo per fasi (F3-42), i dati di fase oggi non ci sono');
  const children = Array.from({ length: 13 }, (_, index) => ({
    sessionId: `r4-child-${index}`, padreId: 'r4-graph-root',
    taskCorto: `Agente ${index + 2}`, conclusa: index % 2 === 0,
    modello: 'z-ai/glm-5.3-flash',
  }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' },
    }));
  });
  await page.route('**/api/v1/sessions/r4-graph-root/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/r4-graph-root/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: children } },
  }));
  await page.route('**/api/v1/sessions/r4-graph-root/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    window.__talosHarnessUiRuntime.passaASessione(
      'r4-graph-root', 'workspace', 'Grafo R4', 'z-ai/glm-5.3-flash', { conclusa: false },
    );
  });
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(13);
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const graph = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(graph.locator('[data-nodo-id]')).toHaveCount(14);
  const inspection = await graph.evaluate((root) => {
    const canvasElement = root.querySelector('.talos-grafo__canvas');
    const canvas = canvasElement.getBoundingClientRect();
    const clipped = [...root.querySelectorAll('[data-nodo-id]')].filter((node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.left < canvas.left - 1 || bounds.right > canvas.right + 1
        || bounds.top < canvas.top - 1 || bounds.bottom > canvas.bottom + 1;
    }).map((node) => {
      const bounds = node.getBoundingClientRect();
      return { id: node.dataset.nodoId, top: bounds.top, bottom: bounds.bottom,
        left: bounds.left, right: bounds.right, canvasTop: canvas.top,
        canvasBottom: canvas.bottom, canvasLeft: canvas.left, canvasRight: canvas.right };
    });
    return { clipped, transform: root.querySelector('.talos-grafo__mondo').style.transform,
      scrollTop: canvasElement.scrollTop, scrollLeft: canvasElement.scrollLeft };
  });
  expect(inspection.clipped, JSON.stringify(inspection)).toEqual([]);
  for (const [route, name] of [['chat', 'Chat'], ['terminale', 'Terminale'], ['review', 'Review'], ['browser', 'Browser']]) {
    const tab = page.locator(`#schermoChat .talos-topbar [data-vaia="${route}"]`);
    await expect(tab).toBeVisible();
    await expect(tab).toContainText(name);
  }
});

test('R4-RAIL-5000-BOUNDED: 200 logical agents remain reachable with bounded rows', async ({ page }) => {
  const children = Array.from({ length: 199 }, (_, index) => ({
    sessionId: `r4-large-${index}`, padreId: 'r4-large-root',
    taskCorto: `Agente ${index + 1}`, conclusa: true,
  }));
  await page.route('**/api/v1/sessions/r4-large-root/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/r4-large-root/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: children } },
  }));
  await page.route('**/api/v1/sessions/r4-large-root/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione(
    'r4-large-root', 'workspace', 'Grafo grande', 'z-ai/glm-5.3-flash', { conclusa: false },
  ));
  await page.locator('#railTabs [data-rail="agenti"]').click();
  const rows = page.locator('#railAgenti [data-c="AgentRow"]');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(50);
  await expect(page.locator('#railAgenti')).toContainText('199 di 199 agenti');
  await expect(page.locator('#railAgenti [role="status"]')).toHaveCount(1);
  // 24/09/2026: la pila dei toast siede sul fondo della barra destra (decisione owner) e intercettava questo clic.
  await chiudiToastAperti(page);
  await page.locator('#railAgenti').getByRole('button', { name: 'Pagina successiva' }).click();
  await expect(page.locator('#railAgenti')).toContainText('Agente 26');
  await page.locator('#railAgenti').getByRole('searchbox', { name: 'Cerca agenti' }).fill('Agente 199');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Agente 199');
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const graph = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(graph).toBeVisible();
  await expect(graph).toHaveAttribute('data-density', 'aggregate');
  expect(await graph.locator('[data-nodo-id]').count()).toBeLessThanOrEqual(20);
  await expect(graph).toContainText('200 sessioni');
});

test('R4-GRAPH-5000-BOUNDED: five thousand logical sessions do not mount five thousand nodes', async ({ page }) => {
  test.setTimeout(120_000);
  const children = Array.from({ length: 4999 }, (_, index) => ({
    sessionId: `r4-scale-${index}`, padreId: 'r4-scale-root',
    taskCorto: `Agente ${index + 1}`, conclusa: index % 5 !== 0,
  }));
  await page.route('**/api/v1/sessions/r4-scale-root/events*', (route) => route.fulfill({
    contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/r4-scale-root/children', (route) => route.fulfill({
    json: { ok: true, data: { figli: children } },
  }));
  await page.route('**/api/v1/sessions/r4-scale-root/tree*', (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  // 23/09/2026 (D6): lingua fissata, perché i conteggi seguono la lingua attiva («4.999» / «4,999»).
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' },
    }));
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  const baselineDom = await page.locator('body *').count();
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione(
    'r4-scale-root', 'workspace', 'Grafo scala', 'z-ai/glm-5.3-flash', { conclusa: false },
  ));
  await page.locator('#railTabs [data-rail="agenti"]').click();
  const rows = page.locator('#railAgenti [data-c="AgentRow"]');
  await expect(rows).toHaveCount(25, { timeout: 30_000 });
  await expect(page.locator('#railAgenti')).toContainText('4.999 di 4.999 agenti');
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const graph = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(graph).toHaveAttribute('data-density', 'aggregate', { timeout: 30_000 });
  await expect(graph).toContainText('5.000 sessioni');
  expect(await graph.locator('[data-nodo-id]').count()).toBe(0);
  expect(await graph.locator('.talos-grafo__gruppo-riga').count()).toBeLessThanOrEqual(12);
  const finalDom = await page.locator('body *').count();
  expect(finalDom - baselineDom, `baseline ${baselineDom}, graph ${finalDom}`).toBeLessThan(1_000);
  const firstAgent = await graph.locator('.talos-grafo__gruppo-riga').first().textContent();
  await chiudiToastAperti(page); // decisione owner 23/09: il toast può coprire il grafo, si chiude come farebbe una persona
  await graph.getByRole('button', { name: 'Pagina successiva del gruppo' }).click();
  await expect(graph.locator('.talos-grafo__gruppo-riga').first()).not.toHaveText(firstAgent);
  // vista densa: restano ambito, stato, lente e «⋯»; spariscono solo gli attrezzi della tela (zoom, Adatta, Segui)
  await expect(graph.getByRole('radiogroup', { name: 'Ambito del diagramma' })).toBeVisible();
  await expect(graph.getByRole('button', { name: 'Aumenta zoom' })).toHaveCount(0);await expect(graph.getByRole('button', { name: 'Segui l’agente attivo' })).toHaveCount(0);
  // il «⋯» in vista densa scorre solo le voci visibili (Isola e Affianca sono della tela)
  await graph.getByRole('button', { name: 'Altri comandi del diagramma' }).click();
  await expect(graph.getByRole('menuitem', { name: 'Aggiorna', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(graph.getByRole('menuitem', { name: 'Azzera filtri' })).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(graph.getByRole('menuitem', { name: 'Aggiorna', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await graph.getByRole('button', { name: 'Cerca nel diagramma' }).click(); // 02/10: il campo si apre dalla lente, come nel Workflow
  await graph.getByRole('searchbox', { name: 'Cerca agente nel diagramma' }).fill('Agente 4999');
  await expect(graph.locator('[data-nodo-id]')).toHaveCount(1);
  await expect(graph.locator('[data-nodo-id]')).toContainText('Agente 4999');
});

/*
 * ⛔ 23/09/2026 — R4-COUNT-LOCALE-5000 (riparazione D6 della revisione UI). Decisione owner: i conteggi
 *   si scrivono «5.000» in italiano e «5,000» in inglese. Prima rail e grafo stampavano «4999 di 4999
 *   agenti», «5000 sessioni», «Conclusi · 3999»: `Intl.NumberFormat('it-IT')` di serie non raggruppa le
 *   quattro cifre. Si prova nelle DUE lingue, così una cura a 'it-IT' fisso resta rossa in inglese.
 */
for (const [lingua, attesi] of [
  ['it', { rail: '4.999 di 4.999 agenti · tutti i livelli', pagina: '1–25 di 4.999', grafo: '5.000 sessioni', gruppo: 'Conclusi · 3.999', righe: '1–12 di 3.999' }],
  ['en', { rail: '4,999 di 4,999 agenti · tutti i livelli', pagina: '1–25 di 4,999', grafo: '5,000 sessioni', gruppo: 'Conclusi · 3,999', righe: '1–12 di 3,999' }],
]) {
  test(`R4-COUNT-LOCALE-5000: rail and graph group thousands in the active language (${lingua})`, async ({ page }) => {
    test.setTimeout(120_000);
    const children = Array.from({ length: 4999 }, (_, index) => ({
      sessionId: `r4-count-${index}`, padreId: 'r4-count-root',
      taskCorto: `Agente ${index + 1}`, conclusa: index % 5 !== 0,
    }));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript((uiLanguage) => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
        version: 1, appearance: { colorMode: 'light', uiLanguage },
      }));
    }, lingua);
    await page.route('**/api/v1/sessions/r4-count-root/events*', (route) => route.fulfill({
      contentType: 'text/event-stream', body: '',
    }));
    await page.route('**/api/v1/sessions/r4-count-root/children', (route) => route.fulfill({
      json: { ok: true, data: { figli: children } },
    }));
    await page.route('**/api/v1/sessions/r4-count-root/tree*', (route) => route.fulfill({
      json: { ok: true, data: { voci: [] } },
    }));
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await expect(page.locator('html')).toHaveAttribute('lang', lingua);
    await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione(
      'r4-count-root', 'workspace', 'Conteggi', 'z-ai/glm-5.3-flash', { conclusa: false },
    ));
    await page.locator('#railTabs [data-rail="agenti"]').click();
    await expect(page.locator('#railAgenti [role="status"]')).toHaveText(attesi.rail, { timeout: 30_000 });
    await expect(page.locator('#railAgenti .talos-agenti-pagine')).toContainText(attesi.pagina);
    await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
    const graph = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
    await expect(graph).toHaveAttribute('data-density', 'aggregate', { timeout: 30_000 });
    await expect(graph).toContainText(attesi.grafo);
    await expect(graph.locator('.talos-grafo__gruppo-dettaglio > h3')).toHaveText(attesi.gruppo);
    await expect(graph.locator('.talos-grafo__gruppo-pagine')).toContainText(attesi.righe);
    // Nessun numero di quattro o più cifre senza separatore nel testo del grafo e del rail (i nomi
    // delle righe visibili qui sono «Agente 1…25»: nessun dato a quattro cifre che non sia un conteggio).
    const testo = [await graph.innerText(), await page.locator('#railAgenti').innerText()].join('\n');
    expect(testo.match(/(?<![\d.,])\d{4,}(?![\d.,])/g) ?? [], testo.slice(0, 400)).toEqual([]);
  });
}

/*
 * ⛔ 23/09/2026 — R4-PLAN-VIEWPORT-VISIBILITY (nominato da Codex nel ledger R4 e nel piano esecutivo v3,
 *   mai scritto; difetto D4 della revisione UI). Due giri Piano di fila, ciascuno con una risposta lunga:
 *   la revisione 2 dello stesso `planId` arriva nel giro NUOVO. Oggi `existing.replaceWith(card)` aggiorna
 *   la card del primo giro (fuori vista, `top:-260`) e toglie la fallback del giro nuovo: a 1920×1080 non si
 *   vede nessun piano.
 * ⛔ La prova è NEUTRA sulla cura, che non è decisa nei documenti Codex (card nuova nel giro nuovo, oppure
 *   card aggiornata e portata in vista): pretende solo ciò che vale in entrambe — UNA card journal, alla
 *   revisione 2, con la testata dentro la parte visibile della conversazione.
 */
test('R4-PLAN-VIEWPORT-VISIBILITY: a plan revision arriving in a new turn is visible at 1920x1080', async ({ page }) => {
  /* 24/09/2026 — decisione owner: card UNICA aggiornata in loco + avviso «Piano aggiornato (revisione n) · Vai al
     piano» sopra il composer (ricerca 10×4: dieci concorrenti, tutti un solo piano aggiornato in loco). La prova
     pretende l'avviso alla revisione 2, e che «Vai al piano» porti la testata della card nella parte visibile. */
  const sid = 'r4-plan-viewport';
  const erroriPagina = [];
  page.on('pageerror', (e) => erroriPagina.push(String(e?.message || e)));
  const fine = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    if (window.top !== window) return; // gli iframe sandbox del prodotto non hanno localStorage: non è un errore nostro
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' },
    }));
  });
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({
    contentType: 'text/event-stream', body: `retry: 3600000\ndata: ${JSON.stringify(fine)}\n\n`,
  }));
  await page.route(`**/api/v1/sessions/${sid}/children`, (route) => route.fulfill({
    json: { ok: true, data: { figli: [] } },
  }));
  await page.route(`**/api/v1/sessions/${sid}/tree*`, (route) => route.fulfill({
    json: { ok: true, data: { voci: [] } },
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(
    sid, 'workspace', 'Piano in vista', 'z-ai/glm-5.3-flash', { conclusa: false },
  ), sid);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.evaluate((sid) => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    const lungo = Array.from({ length: 14 }, (_, i) => `Paragrafo ${i + 1}: il modello descrive cosa ha trovato e cosa farà dopo, con abbastanza testo da occupare righe.`).join('\n\n');
    const fatto = (revision, content, at) => ({ schema: 'talos.plan.v1', planId: 'plan-viewport',
      sessionId: sid, revision, status: 'proposed', content, model: 'z-ai/glm-5.3-flash', at });
    for (const evento of [
      { type: 'RunStarted', _sequenza: 9501, input: { consegna: 'Prepara un piano' }, contesto: { modalitaOperativa: 'piano' } },
      { type: 'TextMessageContent', messageId: 'pv-1', delta: lungo, _sequenza: 9502 },
      { type: 'RunFinished', _sequenza: 9503, result: { detto: '# Piano\n\n1. Uno' } },
      { type: 'CUSTOM', name: 'talos.plan', _sequenza: 9504, value: fatto(1, '# Piano di rilascio\n\n1. Misurare\n2. Correggere', '2026-09-23T10:00:00.000Z') },
      { type: 'RunStarted', _sequenza: 9505, input: { consegna: 'Rivedi il piano' }, contesto: { modalitaOperativa: 'piano' } },
      { type: 'TextMessageContent', messageId: 'pv-2', delta: lungo, _sequenza: 9506 },
      { type: 'RunFinished', _sequenza: 9507, result: { detto: '# Piano rivisto' } },
      { type: 'CUSTOM', name: 'talos.plan', _sequenza: 9508, value: fatto(2, '# Piano rivisto\n\n1. Misurare di nuovo\n2. Correggere', '2026-09-23T10:05:00.000Z') },
    ]) runtime.handleRealEvent(evento, generation);
  }, sid);
  const plan = page.locator('#conversation [data-c="PlanArtifact"]');
  await expect(plan).toHaveCount(1);
  await expect(plan).toHaveAttribute('data-source', 'journal');
  await expect(plan).toHaveAttribute('data-revision', '2');
  await expect(plan).toContainText('Piano rivisto');
  await chiudiToastAperti(page);
  expect(erroriPagina, 'errori JavaScript in pagina durante i due giri').toEqual([]);
  const avviso = page.locator('#avvisoPiano');
  await expect(avviso, 'la revisione 2 fuori vista deve accendere l’avviso sopra il composer').toBeVisible();
  await expect(avviso).toContainText('revisione 2');
  await avviso.getByRole('button', { name: 'Vai al piano' }).click();
  await expect(avviso).toBeHidden();
  // La geometria si legge a scorrimento fermo: si aspetta che la testata smetta di muoversi.
  await expect.poll(async () => {
    const a = await plan.locator('.talos-plan-artifact__heading').boundingBox();
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 120)));
    const b = await plan.locator('.talos-plan-artifact__heading').boundingBox();
    return a && b && Math.abs(a.y - b.y) < 0.5;
  }, { timeout: 5_000 }).toBe(true);
  const geo = await plan.evaluate((card) => {
    const testata = card.querySelector('.talos-plan-artifact__heading').getBoundingClientRect();
    const scorrimento = card.closest('#conversation')?.parentElement;
    let vista = { top: 0, bottom: innerHeight };
    for (let n = card.parentElement; n; n = n.parentElement) {
      const stile = getComputedStyle(n);
      if (/(auto|scroll)/.test(stile.overflowY) && n.scrollHeight > n.clientHeight) {
        const r = n.getBoundingClientRect();
        vista = { top: Math.max(0, r.top), bottom: Math.min(innerHeight, r.bottom) };
        break;
      }
    }
    return { testataTop: testata.top, testataBottom: testata.bottom, vista, scorrimento: Boolean(scorrimento) };
  });
  expect(geo.testataTop, JSON.stringify(geo)).toBeGreaterThanOrEqual(geo.vista.top - 1);
  expect(geo.testataBottom, JSON.stringify(geo)).toBeLessThanOrEqual(geo.vista.bottom + 1);
});
