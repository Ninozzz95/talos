import { expect, test } from '@playwright/test';

/*
 * ⭐⭐ 18/09/2026 — IL VELO «FORNITORI E ACCESSI» AVEVA I PULSANTI MUTI.
 *
 * Il dialogo arriva dal mockup del Model Lab (`c66e2109`, 05/09) con una card
 * d'esempio scritta a mano — OpenRouter, tre badge inventati — e cinque pulsanti
 * coi nomi d'azione DEL MOCKUP (`salva`, `rimuovi`, `tutti`) invece di quelli che
 * il gestore riconosce (`save-key`, `remove-key`). E l'ascolto era delegato solo
 * su `#providerList`, che è un ALTRO nodo: il clic partiva, non arrivava a
 * nessuno, e non lasciava traccia — nessun errore, nessun messaggio.
 *
 * Queste prove mordono su quello che PRIMA non succedeva:
 *   A. la card dentro il velo è quella VERA (stessa firma del renderer condiviso,
 *      nome preso dal server) e la tendina la cambia — prima restava la card
 *      d'esempio con «OpenRouter» scritto a mano;
 *   B. «Salva chiave» e «Rimuovi chiave» mandano DAVVERO la richiesta — prima
 *      zero richieste, in silenzio;
 *   C. «Prova tutti» prova ogni fornitore dichiarato dal server.
 *
 * Ermetica: `/api/v1/providers` è intercettata col `page.route`, quindi non si
 * tocca né la rete né il 4174, e le richieste si CONTANO invece di sperarle.
 */

const FORNITORI = [
  { id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, supportsEndpoint: true, endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: false, timeoutSeconds: 60, execution: 'cloud' },
  { id: 'ollama', label: 'Ollama', requiresKey: false, keyConfigured: false, supportsEndpoint: true, endpoint: 'http://127.0.0.1:11434', endpointConfigured: true, timeoutSeconds: 60, execution: 'local' },
  { id: 'anthropic', label: 'Anthropic', requiresKey: true, keyConfigured: false, supportsEndpoint: true, endpoint: '', endpointConfigured: false, timeoutSeconds: 60, execution: 'cloud' },
];

/** Apre l'app col catalogo dei fornitori finto e il velo aperto dalla sua porta vera. */
async function apriVelo(page, chiamate) {
  await page.route('**/api/v1/providers', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: FORNITORI }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/providers/**', (route) => {
    const richiesta = route.request();
    chiamate.push({ metodo: richiesta.method(), percorso: new URL(richiesta.url()).pathname, corpo: richiesta.postData() });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
  });
  await page.addInitScript(() => { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} })); });
  await page.goto('/');
  /* La porta VISIBILE del velo sta nella schermata Model Lab, oggi ritirata: si apre
     per la stessa funzione che quella porta chiama, esposta alla runtime per i test. */
  await page.evaluate(() => window.__talosHarnessUiRuntime.apriVeloMockup('veloFornitori'));
  await expect(page.locator('#veloFornitori')).toBeVisible();
  await expect(page.locator('#veloFornitori article[data-provider-id]')).toHaveCount(1);
}

test('VELO-FORNITORI-A — la card dentro il velo è quella vera del fornitore scelto, e la tendina la cambia', async ({ page }) => {
  const chiamate = [];
  await apriVelo(page, chiamate);

  const card = page.locator('#veloFornitori article[data-provider-id]');
  /* ⛔ La firma è del renderer CONDIVISO (`aggiornaProviderList`): il markup d'esempio
     del mockup non ce l'ha. È la prova che la card è generata, non copiata. */
  await expect(card).toHaveAttribute('data-provider-signature', /.+/);
  await expect(card).toHaveAttribute('data-provider-id', 'openrouter');

  /* La tendina sceglie il fornitore: la card che si vede è QUELLA, col nome del server. */
  await page.selectOption('#veloFornitori #providerLab', 'ollama');
  await expect(card).toHaveAttribute('data-provider-id', 'ollama');
  await expect(card).toContainText('Ollama');
  /* ⛔ Sulla CARD, non su tutto il velo: la tendina ha un'opzione per ogni fornitore,
     e cercare lì «OpenRouter» direbbe sempre di sì. */
  await expect(card).not.toContainText('OpenRouter');

  /* Il corpo è APERTO come nel mockup: i campi del fornitore si vedono senza un clic. */
  await expect(page.locator('#veloFornitori [data-provider-key]')).toBeVisible();
});

test('VELO-FORNITORI-B — «Salva chiave» e «Rimuovi chiave» mandano la richiesta, invece di sparire in silenzio', async ({ page }) => {
  const chiamate = [];
  await apriVelo(page, chiamate);
  await page.selectOption('#veloFornitori #providerLab', 'openrouter');

  /* ⛔ I nomi d'azione sono quelli CANONICI (`save-key`), non quelli del mockup
     (`salva`): la card che si vede è quella generata dal renderer, non quella
     d'esempio. Un test scritto sui nomi del mockup cercherebbe un pulsante che nel
     velo aperto non esiste. */
  await page.fill('#veloFornitori [data-provider-key]', 'sk-prova-velo');
  await page.click('#veloFornitori [data-provider-action="save-key"]');
  await expect.poll(() => chiamate.filter((c) => c.percorso.endsWith('/providers/openrouter/key')).length).toBe(1);
  const salva = chiamate.find((c) => c.percorso.endsWith('/providers/openrouter/key'));
  expect(salva.metodo).toBe('POST');
  expect(salva.corpo).toContain('sk-prova-velo');

  /* «Rimuovi chiave» non sta in riga: vive nel menu «⋯», `hidden` finché il menu non si
     apre. Si apre come lo aprirebbe una persona — e senza `onMenu` quel menu non
     esisteva affatto, quindi il comando era irraggiungibile. */
  await page.click('#veloFornitori [aria-haspopup="menu"]');
  await page.click('.ft-actions-menu [data-azione="remove-key"]');
  await expect.poll(() => chiamate.filter((c) => c.percorso.endsWith('/providers/openrouter/key/remove')).length).toBe(1);
  expect(chiamate.find((c) => c.percorso.endsWith('/providers/openrouter/key/remove')).metodo).toBe('POST');
});

test('VELO-FORNITORI-C — «Prova tutti» prova ogni fornitore che il server dichiara', async ({ page }) => {
  const chiamate = [];
  await apriVelo(page, chiamate);

  await page.click('#veloFornitori [data-provider-action="tutti"]');
  await expect.poll(() => chiamate.filter((c) => c.percorso.endsWith('/test')).length).toBe(FORNITORI.length);
  const provati = chiamate.filter((c) => c.percorso.endsWith('/test')).map((c) => c.percorso.split('/')[4]).sort();
  expect(provati).toEqual(['anthropic', 'ollama', 'openrouter']);
});
