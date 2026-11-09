import { expect, test } from '@playwright/test';

const root = 'C:\\';
const project = 'C:\\Users\\esempio\\Desktop\\projects\\AVM-harness-desktop';
const desktop = 'C:\\Users\\esempio\\Desktop';

function envelope(data) {
  return { ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } };
}

async function mockWorkspaceBrowser(page) {
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') || root;
    const items = path === root
      ? [{ name: 'Users', path: 'C:\\Users', projectId: null }, { name: 'Windows', path: 'C:\\Windows', projectId: null }]
      : path === desktop
        ? [{ name: 'projects', path: `${desktop}\\projects`, projectId: null }]
        : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        root,
        path,
        parent: path === root ? null : root,
        items,
        recommended: [
          { label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' },
          { label: 'Desktop', path: desktop, kind: 'known', projectId: null },
        ],
      })),
    });
  });
}

/*
 * ⛔ 18/09/2026 — misurato (sonda-chips2.mjs, porta 4197): le pastiglie del piede della chat
 * `[data-open-sheet="model"]` (una, «Scegli il modello Ctrl ⇧ M») e
 * `[data-open-sheet="permissions"]` (la prima in ordine di documento, «Scrive nel progetto»)
 * esistono SEMPRE nel DOM ma stanno dentro `#schermoChat`, e sulla Home `#schermoChat` è
 * nascosto: `visibile: false`, `w: 0`, `nascostoDa: "schermoChat"`. Dopo un clic su Chat la
 * stessa pastiglia è `visibile: true`, `w: 112` / `w: 125`, `nascostoDa: null`.
 * ⇒ «LA v2 ATTERRA SULLA HOME»: una prova che usa una pastiglia della chat deve PRIMA aprire la
 * chat con un gesto. È lo stesso helper di `baseline-shell.spec.mjs` (riga 24), non una
 * scorciatoia nuova.
 */
async function apriChat(page) {
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
}

/* 31/10/2026: la finestra si apre sul progetto scelto. Queste prove guardano l'albero dalla radice del disco: ci salgono col pulsante, come farebbe la persona */
const DALLA_RADICE = /DIALOG-09 — apre|INVERSE-19|KEYBOARD-08|TREE-23|TOOLBAR-09|SEARCH-0[123569]|SEARCH-08/u;

test.beforeEach(async ({ page }, info) => {
  await mockWorkspaceBrowser(page);
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  if (DALLA_RADICE.test(info.title)) {
    await page.locator('.workspace-chooser-up').click();
    await expect(page.getByRole('treeitem', { name: 'Users' })).toBeVisible();
  }
});

test('WORKSPACE-CHOOSER-DIALOG-09 — apre una workbench ampia, semantica e senza picker legacy visibile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = page.locator('#sheetDialog');
  await expect(dialog).toHaveClass(/sheet-dialog--new-session/);
  await expect(page.locator('#workspaceChooser')).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Cartelle del computer' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Desktop/ })).toBeVisible();
  await expect(page.locator('#customTaskCartella:visible, #customTaskCartellaLibera:visible')).toHaveCount(0);
  const box = await dialog.boundingBox();
  expect(box.width).toBeGreaterThan(1050);
  expect(box.height).toBeGreaterThan(650);
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(1428);
});

test('WORKSPACE-CHOOSER-PROJECT-11 — il progetto corrente resta pronto senza configurazione manuale', async ({ page }) => {
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('#workspaceChooserSubmit')).toContainText('AVM-harness-desktop');
});

test('WORKSPACE-CHOOSER-RECOMMENDED-06 — una scorciatoia aggiorna lo stesso albero e la selezione in tempo reale', async ({ page }) => {
  await page.getByRole('button', { name: /Desktop/ }).click();
  await expect(page.locator('#workspaceChooserPath')).toHaveValue(desktop);
  await expect(page.getByRole('treeitem', { name: 'projects' })).toBeVisible();
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(desktop);
});

test('WORKSPACE-CHOOSER-INVERSE-19 — cartella arbitraria non eleva da sola i permessi', async ({ page }) => {
  await page.getByRole('treeitem', { name: 'Users' }).click();
  /*
   * ⛔ La riga qui era `await expect(...Submit).toBeDisabled()` e non vale più: BC-14 (owner 11/09,
   * seconda tornata 12/09) ha tolto il cancello che spegneva il pulsante su una cartella fuori
   * allowlist — resta acceso e DICE cosa farà. Fonti: `src/components/avvio-sessione.js:1-40`
   * (il commento dell'owner e la decisione pura `statoAvvioSessione`, dove `disabilitato` è vero
   * solo per `occupato`) e `src/legacy/app.js` («`disabilitato` NON è più `!puoAvviare`»).
   * ⇒ L'invariante di QUESTA prova è un'altra, e si misura sui permessi: la cartella scelta NON
   * eleva da sola. Misurato il 18/09/2026 (sonda-inverse.mjs, porta 4197): con Users scelto,
   * `Workspace write=true`, `Full access=false`, pulsante acceso «Continua su Users» (FE-040, 31/10/2026),
   * nota/cancello «Non è fra i progetti già autorizzati: viene verificata all'avvio.».
   */
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('#workspaceChooserSubmit')).toContainText('Continua su Users');
  await expect(page.locator('[data-workspace-permission="Workspace write"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-workspace-permission="Full access"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-workspace-policy-gate]')).toContainText('Non è fra i progetti già autorizzati');
  /* 11/10/2026 (owner, dalla foto): una frase, un posto. Quando si può partire la spiegazione del permesso sta SOLO sotto le carte
     dei permessi, e il pulsante è descritto dalla nota che c'è.
     FE-040 (owner 31/10/2026, bozzetto 4): il piede dice invece il riepilogo, cartella e accesso (qui nessun modello scelto, quindi
     non si nomina): un'altra frase, mai quella del permesso. */
  await expect(page.locator('#workspaceChooserSubmitNote')).toHaveText('Users, scrive nel progetto');
  expect(await page.locator('[data-workspace-policy-gate]').innerText()).not.toContain('Users, scrive nel progetto');
  await expect(page.locator('#workspaceChooserSubmit')).toHaveAttribute('aria-describedby', 'workspaceChooserPolicyGate');
  /* L'elevazione la fa solo la persona, con un gesto — e il cancello cambia testo con lei. */
  await page.locator('[data-workspace-permission="Full access"]').click();
  await expect(page.locator('[data-workspace-permission="Full access"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-workspace-permission="Workspace write"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-workspace-policy-gate]')).toContainText('Accesso pieno');
});

test('WORKSPACE-CHOOSER-KEYBOARD-08 — focus e selezione restano distinti e la tastiera governa il tree', async ({ page }) => {
  const users = page.getByRole('treeitem', { name: 'Users' });
  await users.focus();
  await expect(users).toBeFocused();
  await expect(users).toHaveAttribute('aria-selected', 'false');
  await users.press('Enter');
  await expect(users).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText('C:\\Users');
  await users.press('ArrowDown');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeFocused();
});

test('WORKSPACE-CHOOSER-NO-MUTATION-17 — il chooser non espone azioni distruttive', async ({ page }) => {
  const chooser = page.locator('#workspaceChooser');
  await expect(chooser.getByText(/Elimina|Rinomina|Allega|Sposta/i)).toHaveCount(0);
  await expect(chooser.locator('[draggable="true"], [data-file-action], [data-context-menu]')).toHaveCount(0);
});

test('WORKSPACE-CHOOSER-SUBMIT-10 — una cartella allowlisted conserva cartellaId e non invia il percorso libero', async ({ page }) => {
  let body = null;
  /* 30/10/2026: dal 29/10 (6365ef55c, regola dell'owner «nessun modello predefinito») il primo messaggio senza modello si ferma e apre la
     scelta del modello: la prova sceglie un modello prima, come farebbe una persona */
  await page.evaluate(() => localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, chat: { model: 'z-ai/glm-5.3-flash' } })));
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await page.route('**/api/v1/sessions/custom', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ sessionId: 'session-workspace-chooser' })) });
  });
  await page.route('**/api/v1/sessions/session-workspace-chooser/events*', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.locator('#workspaceChooserSubmit').click();
  /*
   * ⛔ 18/09/2026 — il rosso era la FRETTA della prova, non il prodotto: subito dopo il clic il
   * foglio è ancora davanti, il campo esiste ma non prende il fuoco (`activeElement` resta
   * `workspaceChooserSubmit`, poi `newSessionBtn`), e `fill` NON scrive niente **senza protestare**
   * — misurato (sonda-composer.mjs / sonda-nodo2.mjs, porta 4197): `fill: OK`, `inputValue()` `""`,
   * nessuna mutazione del nodo, nessuna richiesta al server.
   * Si aspetta che il foglio sia chiuso e poi si PRETENDE che il testo sia dentro: `toHaveValue` è
   * l'asserzione che morde se la scrittura è andata a vuoto. Ricerca 18/09/2026 — playwright.dev,
   * «Auto-retrying assertions» (`/docs/test-assertions`): asserzioni web-first che riprovano fino
   * al timeout, al posto di un'attesa fissa.
   */
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await page.locator('#composerInput').fill('Controlla la cartella scelta');
  await expect(page.locator('#composerInput')).toHaveValue('Controlla la cartella scelta');
  await page.locator('#composerForm').evaluate((form) => form.requestSubmit());
  await expect.poll(() => body).not.toBeNull();
  expect(body.cartellaId).toBe('default');
  expect(body).not.toHaveProperty('cartellaLibera');
  expect(body.permessi).toBe('Workspace write');
});

test('WORKSPACE-CHOOSER-CANCEL-12 — annullare non persiste una policy incompleta', async ({ page }) => {
  await page.locator('[data-workspace-permission="Full access"]').click();
  await page.getByRole('button', { name: 'Annulla' }).click();
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('[data-workspace-permission="Workspace write"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-workspace-permission="Full access"]')).toHaveAttribute('aria-pressed', 'false');
});

test('WORKSPACE-CHOOSER-RACE-14 — una risposta lenta non sovrascrive la scelta più recente', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') || root;
    if (path === desktop) await new Promise((resolve) => setTimeout(resolve, 180));
    const items = path === root ? [{ name: 'Users', path: 'C:\\Users', projectId: null }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({
      root, path, parent: path === root ? null : root, items,
      recommended: [
        { label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' },
        { label: 'Desktop', path: desktop, kind: 'known', projectId: null },
      ],
    })) });
  });
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await page.getByRole('button', { name: /Desktop/ }).click();
  await page.locator('.workspace-chooser-shortcut').filter({ hasText: 'AVM-harness-desktop' }).click();
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
  await expect(page.locator('#workspaceChooserPath')).toHaveValue(project);
  await page.waitForTimeout(220);
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
});

test('WORKSPACE-CHOOSER-PENDING-22 — una navigazione in corso non può inviare la selezione precedente', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  let desktopRequestedResolve;
  const desktopRequested = new Promise((resolve) => { desktopRequestedResolve = resolve; });
  let releaseDesktopResolve;
  const releaseDesktop = new Promise((resolve) => { releaseDesktopResolve = resolve; });
  await page.route('**/api/v1/workspace-browser**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') || root;
    if (path === desktop) {
      desktopRequestedResolve();
      await releaseDesktop;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({
      root, path, parent: path === root ? null : root, items: [],
      recommended: [
        { label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' },
        { label: 'Desktop', path: desktop, kind: 'known', projectId: null },
      ],
    })) });
  });
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await page.getByRole('button', { name: /Desktop/ }).click();
  await desktopRequested;

  const submitDisabled = await page.locator('#workspaceChooserSubmit').isDisabled();
  const selectedDuringBrowse = await page.locator('[data-workspace-selected-path]').textContent();
  await page.locator('#workspaceChooser').evaluate((form) => form.requestSubmit());
  const dialogStillOpen = await page.locator('#sheetDialog').evaluate((dialog) => dialog.open);
  releaseDesktopResolve();
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(desktop);

  expect(submitDisabled).toBe(true);
  expect(selectedDuringBrowse).not.toBe(project);
  expect(dialogStillOpen).toBe(true);
});

test('WORKSPACE-CHOOSER-TREE-23 — ArrowRight, ArrowLeft e chevron rispettano la gerarchia del tree', async ({ page }) => {
  const current = page.getByRole('treeitem', { name: 'C:' });
  const users = page.getByRole('treeitem', { name: 'Users' });
  await current.focus();
  await current.press('ArrowRight');
  await expect(users).toBeFocused();
  await users.press('ArrowLeft');
  await expect(current).toBeFocused();
  await users.locator('.workspace-chooser-tree-toggle').click();
  await expect(page.locator('#workspaceChooserPath')).toHaveValue('C:\\Users');
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText('C:\\Users');
});

test('WORKSPACE-CHOOSER-MODAL-24 — Tab e Shift+Tab restano nel foglio Nuova sessione', async ({ page }) => {
  const close = page.locator('#closeSheet');
  const submit = page.locator('#workspaceChooserSubmit');
  await expect(submit).toBeEnabled();
  await close.focus();
  await close.press('Shift+Tab');
  await expect(submit).toBeFocused();
  await submit.press('Tab');
  await expect(close).toBeFocused();
});

test('WORKSPACE-CHOOSER-ESCAPE-25 — Escape chiude prima il picker annidato e poi il foglio', async ({ page }) => {
  const triggers = page.locator('#workspaceChooser .model-picker-trigger');
  const panels = page.locator('#workspaceChooser .model-picker-panel');
  const searches = page.locator('#workspaceChooser .model-picker-search input');
  await expect(triggers).toHaveCount(2);

  for (const index of [0, 1]) {
    await triggers.nth(index).click();
    await expect(panels.nth(index)).toBeVisible();
    await searches.nth(index).press('Escape');
    await expect(panels.nth(index)).toBeHidden();
    await expect(triggers.nth(index)).toBeFocused();
    await expect(page.locator('#sheetDialog')).toBeVisible();
  }

  await page.locator('#workspaceChooser').press('Escape');
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
});

test('WORKSPACE-CHOOSER-ERROR-15 — un errore resta naturale e offre ripresa e Doctor', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  await page.route('**/api/v1/workspace-browser**', async (route) => route.fulfill({
    status: 422,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'WORKSPACE_NOT_AVAILABLE', message: 'Cartella non disponibile' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('.workspace-chooser-tree-state')).toContainText(/cartella|Doctor/i);
  await expect(page.getByRole('button', { name: 'Riprova' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apri Doctor' })).toBeVisible();
  /*
   * ⛔ Anche qui la riga era `toBeDisabled()`: è lo stesso BC-14 di INVERSE-19. Senza una cartella
   * scelta il pulsante è ACCESO ma chiede la cartella — misurato il 18/09/2026 (sonda-stato.mjs
   * `ERRORE=1`, porta 4197): testo «Scegli una cartella», `disabled: false`, e la nota agganciata
   * da `aria-describedby="workspaceChooserSubmitNote"` dice «Scegli la cartella su cui vuoi
   * lavorare.». Ciò che l'errore NON deve fare è lasciare un pulsante che promette di partire.
   */
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('#workspaceChooserSubmit')).toHaveText('Scegli una cartella');
  await expect(page.locator('#workspaceChooserSubmitNote')).toHaveText('Scegli la cartella su cui vuoi lavorare.');
  // AL CONTRARIO (11/10/2026): quando NON si può partire la frase sta solo accanto al pulsante, e sotto i permessi non c'è niente
  await expect(page.locator('[data-workspace-policy-gate]')).toBeHidden();
  await expect(page.locator('#workspaceChooserSubmit')).toHaveAttribute('aria-describedby', 'workspaceChooserSubmitNote');
});

test('WORKSPACE-CHOOSER-DIALOG-09 — 1280 e 1024 restano contenuti nel viewport senza overflow pagina', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 800 }]) {
    await page.setViewportSize(viewport);
    const dialog = page.locator('#sheetDialog');
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(10);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 10);
    expect(box.y).toBeGreaterThanOrEqual(10);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('WORKSPACE-CHOOSER-REDUCED-MOTION-16 — il chooser rispetta reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.workspace-chooser-shortcut.active')).toBeVisible(); // la finestra si apre sul progetto: le schede si ridisegnano alla seconda lettura
  /* 04/11/2026, settima suite della candidata: rosso 1 volta su 3 anche da solo. Misurato con una sonda (40 corse): 10 volte la scheda letta
     era GIÀ staccata dal secondo disegno (`isConnected` falso), e una scheda staccata non ha stile calcolato: `transitionDuration` è «»,
     `parseFloat` dà NaN e il confronto fallisce senza che nessuna transizione esista. Si legge la scheda accesa di ADESSO, e si rilegge
     finché non è quella attaccata alla pagina; una transizione vera resta rossa allo scadere del tempo di `expect`. */
  await expect.poll(async () => {
    const durata = await page.locator('.workspace-chooser-shortcut.active').first()
      .evaluate((element) => (element.isConnected ? getComputedStyle(element).transitionDuration : null));
    return durata === null ? 'scheda staccata dal secondo disegno' : durata.split(',').every((value) => Number.parseFloat(value) <= 0.001);
  }, { message: 'reduced motion: the active shortcut of the page has no transition' }).toBe(true);
});

test('MODAL-RESIZE-PERSIST-01 — la diagonale salva entrambe le dimensioni per Nuova sessione', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = page.locator('#sheetDialog');
  const handle = dialog.locator('[data-dialog-resize="both"]');
  await expect(handle).toBeVisible();
  // 31/10: sotto carico l'entrata della finestra anima ancora qui, e la presa misurata durante il movimento non è dove arriva il mouse
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const before = await dialog.boundingBox();
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 90, grip.y + grip.height / 2 - 70, { steps: 6 });
  await page.mouse.up();
  const resized = await dialog.boundingBox();
  expect(resized.width).toBeLessThan(before.width - 50);
  expect(resized.height).toBeLessThan(before.height - 40);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('talos-harness-modal-sizes-v1') || '{}'));
  expect(saved['sheet:new-session'].width).toBeCloseTo(resized.width, 0);
  expect(saved['sheet:new-session'].height).toBeCloseTo(resized.height, 0);

  await page.locator('#closeSheet').click();
  await page.reload();
  await page.locator('#newSessionBtn').click();
  await page.locator('#sheetDialog').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const restored = await page.locator('#sheetDialog').boundingBox();
  expect(restored.width).toBeCloseTo(resized.width, 0);
  expect(restored.height).toBeCloseTo(resized.height, 0);
});

test('MODAL-RESIZE-ISOLATION-02 — Modello e Permessi non condividono la stessa misura', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('talos-harness-modal-sizes-v1', JSON.stringify({
    'sheet:model': { width: 640, height: 480 },
    'sheet:permissions': { width: 780, height: 620 },
  })));
  await page.locator('#closeSheet').click();
  await apriChat(page);
  /*
   * ⛔ 18/09/2026 — il BERSAGLIO è cambiato, il soggetto no. Dal 07/09 questi due fogli non sono più
   * `#sheetDialog`: `VELO_PER_FOGLIO` (`src/legacy/app.js:7050-7062`) manda `model → veloModello` e
   * `permissions → veloPermessi`, e `openSheet` (`src/legacy/app.js:7705-7712`) apre il VELO e
   * ritorna PRIMA di toccare il foglio vecchio — per questo `#sheetDialog` restava `open: false`
   * (`boundingBox()` nullo). La misura ricordata è rimasta la stessa di proposito
   * (`src/components/dialoghi.js:8-11`: «stessa chiave del monolite … con le chiavi logiche del
   * mockup (`sheet:model`, `sheet:permissions`), così una misura ricordata prima del ridisegno vale
   * ancora»), e vive su `.talos-dialog` dentro il velo (`src/components/dialoghi.js:69` +
   * `src/styles/index.css:2501`).
   * Misurato il 18/09/2026 (sonda-veli.mjs, porta 4197): `#veloModello .talos-dialog` 640×480,
   * `#veloPermessi .talos-dialog` 780×620 — due misure diverse, che è tutto ciò che questa prova
   * deve dire.
   */
  await page.locator('[data-open-sheet="model"]').first().click();
  const modello = page.locator('#veloModello .talos-dialog');
  await expect(modello).toBeVisible();
  await modello.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  let box = await modello.boundingBox();
  expect(box.width).toBeCloseTo(640, 0);
  expect(box.height).toBeCloseTo(480, 0);
  await page.locator('[data-chiudi="veloModello"]').first().click();
  await expect(modello).not.toBeVisible();
  await page.locator('[data-open-sheet="permissions"]').first().click();
  const permessi = page.locator('#veloPermessi .talos-dialog');
  await expect(permessi).toBeVisible();
  await permessi.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  box = await permessi.boundingBox();
  expect(box.width).toBeCloseTo(780, 0);
  expect(box.height).toBeCloseTo(620, 0);
});

test('MODAL-RESIZE-AXES-03 — destra cambia solo larghezza e sotto cambia solo altezza', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = page.locator('#sheetDialog');
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const start = await dialog.boundingBox();
  const widthHandle = dialog.locator('[data-dialog-resize="width"]');
  let grip = await widthHandle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 80, grip.y + grip.height / 2, { steps: 5 });
  await page.mouse.up();
  const widthOnly = await dialog.boundingBox();
  expect(widthOnly.width).toBeLessThan(start.width - 50);
  expect(widthOnly.height).toBeCloseTo(start.height, 0);

  const heightHandle = dialog.locator('[data-dialog-resize="height"]');
  grip = await heightHandle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 60, { steps: 5 });
  await page.mouse.up();
  const heightOnly = await dialog.boundingBox();
  expect(heightOnly.width).toBeCloseTo(widthOnly.width, 0);
  expect(heightOnly.height).toBeLessThan(widthOnly.height - 35);
});

test('MODAL-RESIZE-VIEWPORT-04 — misure enormi vengono limitate alla finestra, e sotto 781px il foglio resta un bottom sheet senza prese', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('talos-harness-modal-sizes-v1', JSON.stringify({
    'sheet:model': { width: 9000, height: 9000 },
  })));
  await page.locator('#closeSheet').click();
  await apriChat(page);
  await page.setViewportSize({ width: 900, height: 600 });
  /*
   * ⛔ 18/09/2026 — PRIMA METÀ, il bersaglio si sposta di quanto la 07/09 ha spostato il prodotto.
   * La misura `sheet:model` enorme non arriva più a `#sheetDialog`: `VELO_PER_FOGLIO`
   * (`src/legacy/app.js:7050-7062`) manda `model → veloModello` e `openSheet`
   * (`src/legacy/app.js:7705-7712`) apre il VELO e ritorna; il limite alla finestra lo applica
   * `limitsDialogo` (`src/components/dialoghi.js`), che è anche chi la ricorda.
   * Misurato il 18/09/2026 (sonda-veli.mjs, porta 4197): con `sheet:model` 9000×9000 a 900×600 il
   * dialogo del velo esce **852×540 a (24,30)** — dentro la finestra, cioè ciò che questa prova
   * deve dire. Il resto (le tre prese a certe larghezze) non è una proprietà del velo: `sonda-veli2.mjs`
   * lo mostra — a 780×700 il velo tiene 852 di larghezza, **96 px oltre la finestra**, con tutte e
   * tre le prese visibili, e nessun re-clamp alla riduzione della finestra (`src/styles/index.css:2501`
   * è una larghezza secca, senza tetto: riportato nel referto, non asserito qui).
   */
  await page.locator('[data-open-sheet="model"]').first().click();
  const velo = page.locator('#veloModello .talos-dialog');
  await expect(velo).toBeVisible();
  await velo.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  let box = await velo.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(10);
  expect(box.x + box.width).toBeLessThanOrEqual(890);
  expect(box.y).toBeGreaterThanOrEqual(10);
  expect(box.y + box.height).toBeLessThanOrEqual(590);

  /*
   * SECONDA METÀ, invariata nella sostanza e sul soggetto che la possiede ancora: il bottom sheet
   * responsive è `dialog.sheet-dialog` (`src/styles/foglio-monolite.css:287`, `@media (max-width: 780px)`:
   * `width: 100vw`, `margin: auto 0 0`, `border-radius: 18px 18px 0 0`, `.dialog-resize-handle{display:none}`),
   * cioè il foglio della scelta cartella — non i veli. Misurato il 18/09/2026 (sonda-veli2.mjs,
   * porta 4197): a 780×700 il foglio è 756×668 a x=0, raggio 18px, tutte e tre le prese `display:none`;
   * a 790×700 (sopra la soglia) è 766×668 a x=12 e le tre prese sono `display:block`.
   */
  await page.locator('[data-chiudi="veloModello"]').first().click();
  await expect(velo).not.toBeVisible();
  /*
   * ⛔ Il foglio si apre PRIMA di stringere la finestra: a 780×700 `#newSessionBtn` non è più
   * cliccabile perché il suo antenato `#sessionsPanel` è collassato — misurato il 18/09/2026
   * (sonda-veli3.mjs, porta 4197): `visibile: true` a 1280×720 e a 900×600, `visibile: false`,
   * `nascostoDa: "sessionsPanel"` a 780×700. La media query è viva, quindi il foglio aperto largo
   * diventa bottom sheet appena la finestra si stringe (è lo stesso giro della sonda).
   */
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  await page.setViewportSize({ width: 780, height: 700 });
  await expect(page.locator('#sheetDialog .dialog-resize-handle')).toHaveCount(3);
  await expect(page.locator('#sheetDialog [data-dialog-resize="both"]')).toBeHidden();
  box = await page.locator('#sheetDialog').boundingBox();
  expect(box.width).toBeLessThanOrEqual(780);
});

test('WORKSPACE-TOOLBAR-09 — Nuova cartella, Aggiorna, Comprimi e Copia percorso sono azioni reali', async ({ page }) => {
  const calls = [];
  await page.route('**/api/v1/workspace-browser/folders', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ name: 'Nuovo progetto', path: 'C:\\Nuovo progetto' })) });
  });
  await expect(page.getByRole('button', { name: 'Nuova cartella' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aggiorna cartelle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprimi cartelle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copia percorso cartella' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuova cartella' }).click();
  await page.getByLabel('Nome nuova cartella').fill('Nuovo progetto');
  await page.getByRole('button', { name: 'Crea cartella' }).click();
  await expect.poll(() => calls).toEqual([{ parentPath: 'C:\\', name: 'Nuovo progetto' }]);
});

/* FE-040 «Cerca o incolla un percorso» (tabella approvata 31/10/2026, forma della Frontend): un campo solo che cerca per nome fra ciò
   che la finestra ha già (tessere e albero) e apre un percorso come prima. */
test('WORKSPACE-CHOOSER-SEARCH-01 — a name filters tiles and tree rows, highlights the match, and Enter opens the first one', async ({ page }) => {
  const campo = page.locator('#workspaceChooserPath');
  await expect(campo).toHaveAttribute('placeholder', /Cerca o incolla un percorso|Search or paste a path/u);
  await campo.fill('win');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Users' })).toBeHidden();
  await expect(page.getByRole('treeitem', { name: 'Windows' }).locator('mark')).toHaveText('Win');
  await expect(page.locator('.workspace-chooser-shortcut:not([hidden])')).toHaveCount(0);
  // 31/10 (Frontend): nessuna tessera trovata ⇒ niente fascia vuota; l'albero resta sotto la barra del percorso, il piede in fondo
  await expect(page.locator('.workspace-chooser-shortcuts')).toBeHidden();
  const righe = await page.locator('#workspaceChooser').evaluate((f) => ({ colonne: getComputedStyle(f.querySelector('.workspace-chooser-columns')).gridRowStart, piede: getComputedStyle(f.querySelector('.workspace-chooser-footer')).gridRowStart }));
  expect(righe).toEqual({ colonne: '2', piede: '3' });
  await campo.press('Enter');
  await expect(campo).toHaveValue(`${root}Windows`);
  await expect(page.getByRole('treeitem', { name: 'Users' })).toHaveCount(0);
});

test('WORKSPACE-CHOOSER-SEARCH-02 — nothing found says so; the first Esc puts everything back, the second does what it always did', async ({ page }) => {
  const campo = page.locator('#workspaceChooserPath');
  await campo.fill('zzz');
  await expect(page.locator('.workspace-chooser-search-empty')).toBeVisible();
  await expect(page.locator('.workspace-chooser-search-empty')).toContainText('zzz');
  await campo.press('Escape');
  // 31/10: «visibile» da solo passava anche con la finestra già in chiusura (l'uscita anima per qualche decimo di secondo)
  await expect(page.locator('#sheetDialog'), 'il primo Esc non avvia la chiusura della finestra').not.toHaveClass(/motion-exit/u);
  expect(await page.locator('#sheetDialog').evaluate((d) => d.open && d.getAnimations().length === 0), 'la finestra resta aperta, nessuna uscita in corso').toBe(true);
  await expect(campo).toBeVisible();
  await expect(campo).toHaveValue(root);
  await expect(page.locator('.workspace-chooser-search-empty')).toBeHidden();
  await expect(page.getByRole('treeitem', { name: 'Users' })).toBeVisible();
  await expect(page.locator('.workspace-chooser-shortcut', { hasText: 'AVM-harness-desktop' })).toBeVisible();
  await expect(page.locator('.workspace-chooser-shortcuts'), 'svuotata la ricerca la fascia torna').toBeVisible();
  await campo.press('Escape');
  await expect(campo).toBeHidden();
});

test('WORKSPACE-CHOOSER-TESTI-01 — i testi piccoli della colonna di destra non scendono sotto le misure del bozzetto (Frontend 31/10: nome della carta 13, riga sotto 11,5, note 12)', async ({ page }) => {
  const misure = await page.locator('#workspaceChooser').evaluate((f) => {
    const px = (sel) => [...f.querySelectorAll(sel)].map((n) => parseFloat(getComputedStyle(n).fontSize));
    return {
      nomeCarta: px('.workspace-chooser-permission strong'), rigaCarta: px('.workspace-chooser-permission small'),
      interruttore: px('.workspace-chooser-inline-toggle strong'), sottotitolo: px('.workspace-chooser-inline-toggle small'),
      nomeTessera: px('.workspace-chooser-shortcut strong'), rigaTessera: px('.workspace-chooser-shortcut small'),
      note: [...px('.workspace-chooser-help'), ...px('.workspace-chooser-policy-gate'), ...px('.workspace-chooser-section-head p')],
    };
  });
  for (const [chi, minimo] of [['nomeCarta', 13], ['rigaCarta', 11.5], ['interruttore', 13], ['sottotitolo', 11.5], ['nomeTessera', 13], ['rigaTessera', 11.5], ['note', 12]]) {
    expect(misure[chi].length, `${chi}: ci sono`).toBeGreaterThan(0);
    expect(Math.min(...misure[chi]), `${chi}: ${JSON.stringify(misure[chi])}`).toBeGreaterThanOrEqual(minimo);
  }
});

test('WORKSPACE-CHOOSER-SEARCH-03 — AL CONTRARIO: a path of any drive is not a search, nothing is filtered', async ({ page }) => {
  const campo = page.locator('#workspaceChooserPath');
  const barra = String.fromCharCode(92);
  for (const percorso of [`D:${barra}lavoro`, 'E:', `${barra}${barra}server${barra}condivisa`, '~/progetti']) {
    await campo.fill(percorso);
    await expect(page.getByRole('treeitem', { name: 'Users' }), percorso).toBeVisible();
    await expect(page.locator('.workspace-chooser-search-empty'), percorso).toBeHidden();
  }
});

/* Revisione dei blocchi 10-12, difetti minori della ricerca */
test('WORKSPACE-CHOOSER-SEARCH-05 — D-10: with a search active the arrows reach the row found', async ({ page }) => {
  await page.locator('#workspaceChooserPath').fill('win');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeVisible();
  await page.locator('.workspace-chooser-tree-row[aria-level="1"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeFocused();
});

/* D-21 (revisione del blocco 13): la prova di prima pretendeva la riga «Windows» dopo l'errore e un secondo Invio che richiedesse la cartella,
   cioè il mondo prima del `catch` che svuota l'albero: passava solo se arrivava prima di lui (5 rosse su 8). Dopo un errore le righe sono 0: resta
   la ricerca nel campo, si ritenta con «Riprova», e il secondo Invio non legge «win» come un percorso. «Riprova» fa anche da controllo: se Invio
   avesse chiesto qualcosa, la lista lo direbbe. */
test('WORKSPACE-CHOOSER-SEARCH-06 — D-11: a folder that does not open leaves the search as it was; a second Enter does not read the name as a path, and «Try again» asks for the folder', async ({ page }) => {
  const chieste = [];
  await page.route('**/api/v1/workspace-browser**', (route) => {
    chieste.push(new URL(route.request().url()).searchParams.get('path'));
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ title: 'no', status: 403 }) });
  });
  const campo = page.locator('#workspaceChooserPath');
  await campo.fill('win');
  await campo.press('Enter');
  const riprova = page.locator('.workspace-chooser-error-actions .secondary-btn');
  await expect(riprova).toBeVisible();
  await expect(campo).toHaveValue('win');
  await expect(page.locator('.workspace-chooser-tree-row')).toHaveCount(0);
  await campo.press('Enter');
  await expect(campo).toHaveValue('win');
  await riprova.click();
  await expect.poll(() => chieste.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.workspace-chooser-error-actions .secondary-btn')).toBeVisible();
  expect(chieste).toEqual([`${root}Windows`, `${root}Windows`]);
});

test('WORKSPACE-CHOOSER-SEARCH-08 — D-20: the right arrow from the open folder reaches the first row found, not a hidden one', async ({ page }) => {
  await page.locator('#workspaceChooserPath').fill('win');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeVisible();
  await page.locator('.workspace-chooser-tree-row[aria-level="1"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeFocused();
});

test('WORKSPACE-CHOOSER-SEARCH-09 — D-20: on a folder closed by hand the right arrow opens it and still lands on a row found', async ({ page }) => {
  await page.locator('#workspaceChooserPath').fill('win');
  const radice = page.locator('.workspace-chooser-tree-row[aria-level="1"]');
  await radice.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toHaveCount(0);
  await expect(radice, 'il fuoco torna sulla cartella dopo il ridisegno').toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('treeitem', { name: 'Windows' })).toBeFocused();
});

/* la cartella che si apre lentamente, coi nomi che la prova sceglie */
async function cartellaLenta(page, nomi) {
  let libera; const aperto = new Promise((r) => { libera = r; });
  const cartella = `${root}Windows`;
  await page.route((url) => url.pathname === '/api/v1/workspace-browser' && url.searchParams.get('path') === cartella, async (route) => {
    await aperto;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ root, path: cartella, parent: root,
      items: nomi.map((name) => ({ name, path: `${cartella}\\${name}`, projectId: null })), recommended: [] })) });
  });
  return { cartella, libera };
}

test('WORKSPACE-CHOOSER-SEARCH-10 — D-23: what you type while a folder loads stays there, keeps the focus and filters the folder that arrives', async ({ page }) => {
  const { cartella, libera } = await cartellaLenta(page, ['System32', 'Temp']);
  const campo = page.locator('#workspaceChooserPath');
  await campo.fill(cartella);
  await campo.press('Enter');
  await expect(page.locator('#workspaceChooser [aria-busy="true"], #workspaceChooser[aria-busy="true"]').first()).toBeAttached();
  await campo.fill('sys');
  libera();
  await expect(page.getByRole('treeitem', { name: 'System32' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Temp' })).toBeHidden();
  await expect(campo).toHaveValue('sys');
  await page.evaluate(() => new Promise((r) => { setTimeout(r, 50); }));
  await expect(campo).toBeFocused();
  await campo.press('Escape');
  await expect(campo, 'Esc dice di nuovo dove si è').toHaveValue(cartella);
});

test('WORKSPACE-CHOOSER-SEARCH-11 — D-23 AL CONTRARIO: typed and taken back with Esc, the field says where you are', async ({ page }) => {
  const { cartella, libera } = await cartellaLenta(page, ['System32']);
  const campo = page.locator('#workspaceChooserPath');
  await campo.fill(cartella);
  await campo.press('Enter');
  await expect(page.locator('#workspaceChooser [aria-busy="true"], #workspaceChooser[aria-busy="true"]').first()).toBeAttached();
  await campo.fill('sys');
  await campo.press('Escape');
  libera();
  await expect(page.getByRole('treeitem', { name: 'System32' })).toBeVisible();
  await expect(campo).toHaveValue(cartella);
});

test('WORKSPACE-CHOOSER-SEARCH-07 — D-12: the highlight holds when a letter changes length in lower case', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  await page.route('**/api/v1/workspace-browser**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({
    root, path: root, parent: null, items: [{ name: 'İstanbul', path: `${root}istanbul`, projectId: null }], recommended: [],
  })) }));
  const campo = page.locator('#workspaceChooserPath');
  await campo.fill(root);
  await campo.press('Enter');
  await expect(page.locator('.workspace-chooser-tree-row', { hasText: 'stanbul' })).toHaveCount(1);
  await campo.fill('stan');
  await expect(page.locator('.workspace-chooser-tree-row mark')).toHaveText('stan');
});

test('WORKSPACE-CHOOSER-SEARCH-04 — AL CONTRARIO: a folder name with HTML in it stays text, in the tree and in a tile', async ({ page }) => {
  await page.unroute('**/api/v1/workspace-browser**');
  const strano = '<img src=x onerror="window.__iniettato=1">tag';
  await page.route('**/api/v1/workspace-browser**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({
    root, path: root, parent: null,
    items: [{ name: strano, path: `${root}strana`, projectId: null }],
    recommended: [{ label: strano, path: `${root}strana`, kind: 'known', projectId: null }],
  })) }));
  await page.locator('#workspaceChooserPath').fill(root);
  await page.locator('#workspaceChooserPath').press('Enter');
  await expect(page.locator('.workspace-chooser-tree-row', { hasText: 'tag' })).toHaveCount(1);
  await expect(page.locator('.workspace-chooser-tree-row img, .workspace-chooser-shortcut img')).toHaveCount(0);
  await expect(page.locator('.workspace-chooser-tree-row', { hasText: 'tag' }).locator('[data-workspace-nome]')).toHaveText(strano);
  expect(await page.evaluate(() => window.__iniettato ?? null)).toBeNull();
});
