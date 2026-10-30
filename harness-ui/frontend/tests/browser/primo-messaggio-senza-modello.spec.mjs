import { expect, test } from '@playwright/test';

/*
 * 29/10/2026 (dal coordinatore, misurato sul 4174): in una chat NUOVA senza modello, Invio svuotava il compositore e non mandava niente
 *   — nessuna richiesta, nessun avviso: il messaggio spariva. La regola dell'owner (11/09, «nessun modello predefinito») vuole che il
 *   modello lo scelga la persona; quindi il primo messaggio NON parte, ma il testo RESTA e TALOS dice che cosa fare, aprendo la scelta
 *   del modello — come Hermes, che su «modello non disponibile» offre «Choose a model» e apre il selettore
 *   (`apps/desktop/src/components/assistant-ui/thread/assistant-message.tsx:936-953`, `lib/error-surface.ts:283`).
 *   Parole che l'app ha già: «Nessun modello selezionato» · «Scegli un modello» (`home.noModelSelected`, `home.chooseAModel`).
 * Sul server di prova della suite (mai il 4174): le rotte che scrivono sono intercettate.
 */
const project = 'C:\\Users\\esempio\\Desktop\\projects\\AVM-harness-desktop';
const envelope = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });

async function chatNuova(page, { modello }) {
  const avvii = [];
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((m) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ chat: { model: m } })); } catch { /* sandbox */ }
  }, modello);
  await page.route('**/api/v1/workspace-browser**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({
    root: 'C:\\', path: 'C:\\', parent: null, items: [],
    recommended: [{ label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' }],
  })) }));
  await page.route('**/api/v1/sessions/custom', async (route) => {
    avvii.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ sessionId: 'primo-messaggio-1' })) });
  });
  await page.route('**/api/v1/sessions/primo-messaggio-1/**', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('#newSessionBtn').click();
  await page.locator('#workspaceChooserSubmit').click();
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await page.locator('#composerInput').fill('Elenca i file del progetto');
  await expect(page.locator('#composerInput')).toHaveValue('Elenca i file del progetto');
  return avvii;
}

test('PRIMO-MESSAGGIO-01 — senza modello il primo messaggio non parte, ma il testo RESTA, TALOS lo dice e apre la scelta del modello', async ({ page }) => {
  const avvii = await chatNuova(page, { modello: '' });
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label')).toHaveText('Scegli il modello');
  await page.locator('#composerInput').press('Enter');
  await expect(page.locator('.talos-toast').filter({ hasText: 'Nessun modello selezionato' })).toBeVisible();
  await expect(page.locator('#veloModello')).toBeVisible();
  await expect(page.locator('#composerInput')).toHaveValue('Elenca i file del progetto');
  expect(avvii).toEqual([]);
  // la chat in attesa NON si è persa: la testata dice ancora la cartella scelta, e un secondo Invio fa la stessa cosa (non «nessuna sessione»)
  await page.keyboard.press('Escape');
  await expect(page.locator('#veloModello')).toBeHidden();
  await page.locator('#composerInput').press('Enter');
  await expect(page.locator('#composerInput')).toHaveValue('Elenca i file del progetto');
  await expect(page.locator('#veloModello')).toBeVisible();
  expect(avvii).toEqual([]);
});

test('PRIMO-MESSAGGIO-02 (al contrario) — col modello scelto il primo messaggio parte col suo modello e il compositore si svuota', async ({ page }) => {
  const avvii = await chatNuova(page, { modello: 'z-ai/glm-5.3-flash' });
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => avvii.length).toBe(1);
  expect(avvii[0].modello).toBe('z-ai/glm-5.3-flash');
  expect(avvii[0].consegna).toBe('Elenca i file del progetto');
  await expect(page.locator('#composerInput')).toHaveValue('');
  await expect(page.locator('.talos-toast').filter({ hasText: 'Nessun modello selezionato' })).toHaveCount(0);
});

/*
 * 29/10/2026 (coordinatore) — la STRADA IMPLICITA: nessuna chat aperta e nessuna chat in attesa, la persona scrive e preme Invio; con
 *   una cartella di progetto sola la chat nasce lì (`avviaSessioneImplicitaSeUnaSolaCartella`). Prima il compositore si svuotava
 *   subito e niente rimetteva il testo: senza modello, con più cartelle o con l'avvio rifiutato, ciò che la persona aveva scritto
 *   spariva. Le rotte che scrivono sono intercettate: nessuna POST arriva al server di prova.
 */
async function chatSenzaSessione(page, { modello, progetti = [{ id: 'default', nome: 'AVM-harness-desktop' }], avvio = 'riesce' }) {
  const avvii = [];
  let rilascia = () => {};
  const cancello = new Promise((ok) => { rilascia = ok; });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((m) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ chat: { model: m } })); } catch { /* sandbox */ }
  }, modello);
  await page.route('**/api/v1/projects', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ items: progetti })) })
    : route.fallback()));
  await page.route('**/api/v1/sessions/custom', async (route) => {
    avvii.push(route.request().postDataJSON());
    if (avvio === 'riesce') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ sessionId: 'implicita-1' })) });
    if (avvio === 'trattenuto') await cancello;
    return route.abort();
  });
  await page.route('**/api/v1/sessions/implicita-1/**', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#composerInput')).toBeVisible();
  await page.locator('#composerInput').fill('Elenca i file del progetto');
  return { avvii, rilascia };
}
const avviso = (page, testo) => page.locator('.talos-toast').filter({ hasText: testo });

test('IMPLICITA-01 — senza modello, con una cartella sola: il testo RESTA, TALOS lo dice e apre la scelta del modello', async ({ page }) => {
  const { avvii } = await chatSenzaSessione(page, { modello: '' });
  await page.locator('#composerInput').press('Enter');
  await expect(avviso(page, 'Nessun modello selezionato')).toBeVisible();
  await expect(page.locator('#veloModello')).toBeVisible();
  await expect(page.locator('#composerInput')).toHaveValue('Elenca i file del progetto');
  expect(avvii).toEqual([]);
});

test('IMPLICITA-02 (al contrario) — col modello e una cartella sola la chat nasce col suo modello e il compositore si svuota', async ({ page }) => {
  const { avvii } = await chatSenzaSessione(page, { modello: 'z-ai/glm-5.3-flash' });
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => avvii.length).toBe(1);
  expect(avvii[0]).toMatchObject({ cartellaId: 'default', modello: 'z-ai/glm-5.3-flash', consegna: 'Elenca i file del progetto' });
  await expect(page.locator('#composerInput')).toHaveValue('');
  await expect(avviso(page, 'Nessun modello selezionato')).toHaveCount(0);
  await expect(page.locator('#veloModello')).toBeHidden();
});

test('IMPLICITA-03 — l\'avvio rifiutato rimette il testo nel compositore', async ({ page }) => {
  const { avvii } = await chatSenzaSessione(page, { modello: 'z-ai/glm-5.3-flash', avvio: 'rifiutato' });
  await page.locator('#composerInput').press('Enter');
  await expect(avviso(page, 'Avvio non riuscito')).toBeVisible();
  await expect(page.locator('#composerInput')).toHaveValue('Elenca i file del progetto');
  expect(avvii).toHaveLength(1);
});

test('IMPLICITA-04 — se intanto la persona ha scritto altro, l\'avvio rifiutato NON lo sovrascrive', async ({ page }) => {
  const { avvii, rilascia } = await chatSenzaSessione(page, { modello: 'z-ai/glm-5.3-flash', avvio: 'trattenuto' });
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => avvii.length).toBe(1);
  await expect(page.locator('#composerInput')).toHaveValue('');
  await page.locator('#composerInput').fill('Un altro pensiero');
  rilascia();
  await expect(avviso(page, 'Avvio non riuscito')).toBeVisible();
  await expect(page.locator('#composerInput')).toHaveValue('Un altro pensiero');
});

test('IMPLICITA-05 — con più cartelle la chat non nasce: TALOS dice che manca la sessione e il testo torna nel compositore', async ({ page }) => {
  const { avvii } = await chatSenzaSessione(page, {
    modello: 'z-ai/glm-5.3-flash',
    progetti: [{ id: 'default', nome: 'AVM-harness-desktop' }, { id: 'altro', nome: 'Altro progetto' }],
  });
  await page.locator('#composerInput').press('Enter');
  await expect(avviso(page, 'Nessuna sessione attiva')).toBeVisible();
  await expect(page.locator('#composerInput')).toHaveValue('Elenca i file del progetto');
  expect(avvii).toEqual([]);
});
