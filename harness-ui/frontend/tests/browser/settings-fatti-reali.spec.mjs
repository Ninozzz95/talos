import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ 02/09 — review complessiva, V14: cinque sezioni Settings erano un
 * paragrafo e un bottone. Ora mostrano valori letti adesso (Aspetto, provider
 * dal server, policy, dati locali, workspace). Il test prova che i riepiloghi
 * vengono dai dati e non da testo fisso: cambia la risposta del server e
 * cambia la lista; cambia una preferenza e cambia il riepilogo.
 */
test('SETTINGS-FATTI-44 — le sezioni Settings mostrano provider dal server, preferenze attive e dati locali reali', async ({ page }) => {
  await page.route('**/api/v1/providers', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [
      { id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, supportsEndpoint: true, endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: false, timeoutSeconds: 60, execution: 'cloud' },
      { id: 'ollama', label: 'Ollama', requiresKey: false, keyConfigured: false, supportsEndpoint: true, endpoint: 'http://127.0.0.1:11434', endpointConfigured: true, timeoutSeconds: 60, execution: 'local' },
      { id: 'anthropic', label: 'Anthropic', requiresKey: true, keyConfigured: false, supportsEndpoint: true, endpoint: '', endpointConfigured: false, timeoutSeconds: 60, execution: 'cloud' },
    ] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  // una preferenza salvata PRIMA del caricamento: il riepilogo deve leggerla, e la lista dei dati locali deve mostrarne la chiave
  /* ⛔ 18/09/2026 — LA LINGUA VA DICHIARATA: questo profilo non la dichiarava, e senza `uiLanguage`
     l'app parte in **inglese** (è il predefinito: verificato da una sonda — barra laterale in
     italiano e contenuto in inglese, cioè metà traduzione). La prova si aspetta l'italiano, quindi
     lo dice. ⛔ Il predefinito inglese su un prodotto italiano è una domanda a sé, non una cosa da
     nascondere dentro una prova: sta nel piano come decisione per l'owner. */
  await page.addInitScript(() => { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { chatFullWidth: true, uiLanguage: 'it' }, chat: {}, workspaces: {} })); });
  await page.goto('/');
  const esito = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    /*
     * ⛔⛔ 18/09/2026 — QUESTA RIGA ERA `document.querySelector('[data-open-view="settings"]').click()`.
     * Quell'attributo **non esiste più nel DOM** (era del mockup: 0 occorrenze nel template), quindi
     * la prova era rossa da giorni con «Cannot read properties of null» e contava fra le 53 note.
     * Si naviga come si naviga davvero: la voce «Impostazioni» della barra laterale — e se il gruppo
     * STRUMENTI è chiuso (è il default) prima lo si apre, come fa una persona.
     */
    const voceImpostazioni = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    if (voceImpostazioni && !voceImpostazioni.offsetParent) {
      const gruppo = voceImpostazioni.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    }
    voceImpostazioni.click();
    runtime.setSettingsSection('providers');
    await runtime.renderSettingsRiepiloghi();
    const provider = [...document.querySelectorAll('#settingsProvidersList li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    runtime.setSettingsSection('chat');
    await runtime.renderSettingsRiepiloghi();
    const chat = [...document.querySelectorAll('#settingsChatFacts div')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]);
    runtime.setSettingsSection('privacy');
    await runtime.renderSettingsRiepiloghi();
    const privacy = [...document.querySelectorAll('#settingsPrivacyList li')].map((li) => li.textContent);
    runtime.setSettingsSection('tools');
    await runtime.renderSettingsRiepiloghi();
    const tools = [...document.querySelectorAll('#settingsToolsFacts div')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]);
    /* ⛔ 18/09/2026 — l'indirizzo del servizio vive DOVE SI MODIFICA: il campo «Indirizzo del
       servizio» della scheda del fornitore (`[data-provider-endpoint]`), che è pure il posto in cui
       i concorrenti lo mettono (Open WebUI: Base URL come campo; Hermes: base URL + prova di
       collegamento). La RIGA dell'elenco porta invece i badge di stato — il disegno di bolt.diy
       (Configured/Not configured) — e quello stato È dato del server (`requiresKey`, `keyConfigured`
       arrivano da `/api/v1/providers`), quindi la prova che «i dati vengono dal server» regge anche
       così. Vedi la ricerca del 18/09/2026 citata nel messaggio di commit. */
    const endpointAperto = document.querySelector('[data-provider-endpoint]')?.value ?? null;
    return { provider, chat, privacy, tools, endpointAperto, svuota: Boolean(document.querySelector('#settingsSvuotaLocali')) };
  });
  expect(esito.provider).toHaveLength(3);
  expect(esito.provider[0]).toContain('OpenRouter');
  expect(esito.provider[0]).toContain('chiave configurata');
  expect(esito.provider[1]).toContain('Ollama');
  expect(esito.provider[1]).toContain('accesso pubblico, chiave non richiesta'); // ← stato: deriva da `requiresKey:false` del server
  expect(esito.endpointAperto).toBe('https://openrouter.ai/api/v1');            // ← indirizzo: il suo posto è il campo della scheda
  expect(esito.provider[2]).toContain('nessuna chiave');
  expect(Object.fromEntries(esito.chat)['Testo chat']).toBe('Extra piccolo');
  expect(Object.fromEntries(esito.chat)['Chat a tutta larghezza']).toBe('Sì');
  expect(esito.privacy.some((v) => v.includes('talos.harness.desktop.settings.v1'))).toBe(true);
  /* ⛔ 18/09/2026 — qui si pretendeva «Workspace write», il nome INTERNO della politica. Il prodotto
     non lo dice più: la stessa politica aveva tre nomi («Workspace write» a schermo, «Scrive nel
     progetto» sul chip, «Accesso pieno» nella testata) e sono stati unificati sul nome umano
     (`app.js:18690`, regola dell'owner «NIENTE NOMI TECNICI NELLA UI», 04/09). La prova segue il
     prodotto, non lo tiene indietro. */
  expect(Object.fromEntries(esito.tools)['Policy attiva']).toBe('Scrive nel progetto');
  expect(esito.svuota).toBe(true);

  // AL CONTRARIO: il server non risponde → messaggio onesto, mai una lista vecchia spacciata per attuale
  await page.route('**/api/v1/providers', async (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR' } }) }));
  const offline = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.setSettingsSection('providers');
    await runtime.renderSettingsRiepiloghi();
    return document.querySelector('#settingsProvidersList').textContent;
  });
  expect(offline).toContain('non leggibile adesso');
});
