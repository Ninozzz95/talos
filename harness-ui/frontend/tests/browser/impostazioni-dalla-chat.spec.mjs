import { test, expect } from '@playwright/test';

/*
 * Fase 8 «Impostazioni dalla chat» sul PC (02/11/2026, bozzetto chiuso FE-055, otto consigliate dell'owner del 01/11 sera), sul pacchetto
 * SERVITO, nei due temi, a 1920×1080. Le rotte `/api/v1/app-settings/*` sono INTERCETTATE con la forma VERA del server
 * (`rotte-impostazioni.mjs`, `catalogoPubblico`, `nuovaRicevuta`): qui si prova che cosa la finestra chiede e disegna. Il server ha le sue
 * prove (`tests/impostazioni-*.test.mjs`).
 * ⛔ SCRITTA E NON LANCIATA dall'agente (banco del Motore acceso il 02/11): la lancia il Desktop, con le foto.
 */
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
/* 02/11/2026 (prove dei giri 2 e 3): la busta del rifiuto VERA. Il server risponde `{ ok:false, error:{ code, message, …problem, reason? },
   meta }` (`errorEnvelope`, http-app.mjs:1344-1353) e il cliente della finestra legge SOLO `envelope.error` (`services/api-client.ts:92-93`,
   `publicProblem`: code, message, reason, params). Prima qui c'era un problema piatto senza `error`: il cliente lo leggeva come
   `INTERNAL_ERROR · Local request failed`, e IMPC-UI-04 e IMPC-UI-10 non potevano passare. `extra` porta `reason` e `params`. */
const PROBLEMA = (status, code, message, extra = {}) => JSON.stringify({ ok: false, error: { code, message, title: message, status, ...extra }, meta: { schema: 'talos.harness-ui.api.v1' } });

const CATALOGO = { schema: 'talos.app-settings.catalog.v1', voci: [
  { key: 'appearance.colorMode', section: 'appearance', scope: 'app', where: 'window', type: 'scelta', values: ['system', 'dark', 'light'], group: null, text: { en: 'Color mode', it: 'Modalità colore' }, textKey: 'impostazioni.field.colorModeSelect.title', textKeys: ['impostazioni.field.colorModeSelect.title'] },
  { key: 'conversation.model', section: 'conversation', scope: 'conversation', where: 'server', type: 'modello', group: 'costo', text: { en: 'Model', it: 'Modello' }, textKey: 'app.sheets.model.title', textKeys: ['app.sheets.model.title'] },
  { key: 'conversation.reasoningEffort', section: 'conversation', scope: 'conversation', where: 'server', type: 'scelta', values: ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], group: 'costo', text: { en: 'Reasoning level', it: 'Livello di ragionamento' }, textKey: 'app.modelPicker.reasoningLevel', textKeys: ['app.modelPicker.reasoningLevel'] },
  { key: 'conversation.coordination', section: 'conversation', scope: 'conversation', where: 'server', type: 'sino', group: 'sicurezza', text: { en: 'Coordination', it: 'Coordinazione' }, textKey: 'app.sheets.permissions.coordination', textKeys: ['app.sheets.permissions.coordination'] },
  { key: 'tools.defaultCommandShell', section: 'tools', scope: 'app', where: 'server', type: 'scelta', values: ['auto', 'windows', 'wsl2'], group: null, text: { en: 'Where commands run · new conversations', it: 'Dove girano i comandi · conversazioni nuove' }, textKey: 'varie.commandsDefault.title', textKeys: ['varie.commandsDefault.title'] },
  { key: 'tools.webSearchSource', section: 'tools', scope: 'app', where: 'server', type: 'scelta', values: ['duckduckgo', 'tavily', 'brave', 'searxng', 'custom', 'off'], group: null, text: { en: 'Web search source', it: 'Origine della ricerca web' }, textKey: 'modello.frammenti.impostazioni.webSearchSource', textKeys: ['modello.frammenti.impostazioni.webSearchSource'] },
] };
const voceDi = (k) => CATALOGO.voci.find((v) => v.key === k);
const CAMBIO = (chiave, prima, dopo, extra = {}) => ({ chiave, nome: { ...voceDi(chiave).text, chiave: voceDi(chiave).textKey }, ambito: voceDi(chiave).scope,
  dove: 'server', gruppo: voceDi(chiave).group, prima, dopo, ...extra });
const CAMBI_COSTO = [
  CAMBIO('conversation.model', 'z-ai/glm-5.3-flash', 'openai/gpt-6-luna', { prezzo: { prima: { in: 0.35, out: 1.4 }, dopo: { in: 1.25, out: 10 } } }),
  CAMBIO('conversation.reasoningEffort', 'medium', 'high'),
  CAMBIO('tools.defaultCommandShell', 'windows', 'wsl2'),
  CAMBIO('tools.webSearchSource', 'tavily', 'duckduckgo'),
];
const RICEVUTA = (id, cambi, extra = {}) => ({ id, sessionId: 'impc-proof', quando: new Date(Date.now() - 60_000).toISOString(),
  origine: { tipo: 'modello', sessionId: 'impc-proof', dispositivoId: null }, confermatoDa: { tipo: 'finestra-pc' },
  cambi: cambi.map(({ chiave, ambito, prima, dopo }) => ({ chiave, ambito, prima, dopo })), annullata: null, ...extra });
const ESITO_SET = 'conversation.model: "z-ai/glm-5.3-flash" → "openai/gpt-6-luna" (this conversation; $0.35 → $1.40 per million).\ntools.webSearchSource: "tavily" → "duckduckgo" (this app). Receipt set-0a1b2c3d4e5f (undo with receipt_id). Revision 10013.';

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page, { ricevute = [], annulla = null, applica = null } = {}) {
      const chiamate = [];
      await page.addInitScript((colorMode) => {
        try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* sandbox */ }
      }, modo);
      await page.route('**/api/v1/sessions/impc-proof*/events*', () => { /* aperto e muto */ });
      await page.route(/\/api\/v1\/app-settings\/.*/u, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (req.method() !== 'GET') chiamate.push(`${req.method()} ${url.pathname} ${req.postData() ?? ''}`.trim());
        if (url.pathname === '/api/v1/app-settings/catalog') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO(CATALOGO) });
        if (url.pathname === '/api/v1/app-settings/changes') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ricevute }) });
        if (url.pathname === '/api/v1/app-settings/undo') {
          const r = annulla ? annulla(JSON.parse(req.postData() ?? '{}')) : { stato: 200, dati: { annullata: 'set-0a1b2c3d4e5f', ricevuta: 'set-ffffffffffff', cambi: [] } };
          return r.stato === 200 ? route.fulfill({ contentType: 'application/json', body: INVOLUCRO(r.dati) })
            : route.fulfill({ status: r.stato, contentType: 'application/json', body: PROBLEMA(r.stato, r.code, r.message, r.extra) });
        }
        /* 02/11/2026: `/settings` della persona — la risposta della rotta vera (`applicaDallaPersona`: `{ ricevuta, cambi, gia, revisione }`) */
        if (url.pathname === '/api/v1/app-settings/apply') {
          const r = applica ? applica(JSON.parse(req.postData() ?? '{}')) : { stato: 200, dati: { ricevuta: 'set-aaaaaaaaaaaa', cambi: [{ chiave: 'tools.defaultCommandShell', ambito: 'app', prima: 'windows', dopo: 'wsl2' }], gia: [], revisione: 10014 } };
          return r.stato === 200 ? route.fulfill({ contentType: 'application/json', body: INVOLUCRO(r.dati) })
            : route.fulfill({ status: r.stato, contentType: 'application/json', body: PROBLEMA(r.stato, r.code, r.message, r.extra) });
        }
        return route.fallback();
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate((id) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Refactoring del carrello', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
        r.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Passa a GPT-6 Luna con sforzo alto qui, e usa DuckDuckGo per la ricerca.' }, _sequenza: 1 }, r.realSessionState.generation);
      }, `impc-proof-${modo}`);
      await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
      return { chiamate };
    }
    /* `prepara` lascia il giro ACCESO (il `RunStarted` senza fine): è il caso difficile, quello del bivio «indirizza / accoda». */
    const inviaComando = async (page, testo) => {
      await page.locator('#composerInput').fill(testo);
      await expect(page.locator('#suggerimentoImpostazioni')).toBeVisible();
      await page.locator('#composerInput').press('Enter');
      await expect(page.locator('[data-bivio="accoda"]')).toBeHidden(); // un comando non chiede «indirizzo o accodo?»
    };
    const eventi = (page, lista) => page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent(e, r.realSessionState.generation); }, lista);
    const foto = async (page, testInfo, nome) => { await page.mouse.move(1900, 1070); await page.screenshot({ path: testInfo.outputPath(`${nome}-${modo}.png`) }); };
    /* la riga dell'attrezzo sta nel gruppo «N attrezzi usati», chiuso di serie (incongruenza 3 della tabella): si apre come farebbe la persona */
    const apriGruppo = async (page) => { const testa = page.locator('.talos-activity__head[aria-expanded="false"]').last(); if (await testa.count()) await testa.click(); };

    test(`IMPC-UI-01 — la carta: righe prima → dopo, prezzo su riga sua, sforzo senza numeri; Applica · Non ora, niente «Per questa sessione» (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const risposte = [];
      await page.route('**/api/v1/sessions/impc-proof-*/approve', async (route) => { risposte.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'impc-req-1', _sequenza: 2, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012, cambi: CAMBI_COSTO, toolCallId: 'call-s1' } }]);
      const carta = page.locator('[data-request-id="impc-req-1"]');
      await expect(carta).toHaveAttribute('data-carta-impostazioni', 'app_settings');
      await expect(carta.locator('.talos-badge').first()).toHaveText('Cambia le impostazioni');
      await expect(carta.locator('[data-cambio]')).toHaveCount(4);
      await expect(carta.locator('[data-cambio="conversation.model"] .talos-kv__v')).toHaveText('GLM 5.3 Flash → GPT-6 Luna'); // 68ebab480 (revisione d'uso 04/11, reperto 11)
      await expect(carta.locator('[data-prezzo="conversation.model"] .talos-kv__v')).toHaveText('da $0.35 → $1.40 a $1.25 → $10.00');
      await expect(carta.locator('[data-sforzo]')).toHaveText('Risposte più ragionate, consumo più alto');
      await expect(carta.locator('[data-cambio="tools.defaultCommandShell"] .talos-kv__v')).toHaveText('Windows → Linux (WSL2)');
      await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Applica');
      await expect(carta.locator('[data-nega]')).toHaveText('Non ora');
      await expect(carta.locator('[data-modifica-automazione]')).toHaveCount(0);
      await expect(carta.locator('.talos-approval__foot-note')).toHaveCount(0);
      await expect(carta.locator('[data-apri-impostazioni]')).toHaveText('Apri nelle Impostazioni');
      await expect(carta.locator('.talos-approval__why')).toBeHidden();
      /* decisione 5: «Non ora» col colore del testo, non rosso */
      const coloreNonOra = await carta.locator('[data-nega]').evaluate((b) => getComputedStyle(b).color);
      const coloreTesto = await page.evaluate(() => getComputedStyle(document.body).color);
      expect(coloreNonOra).toBe(coloreTesto);
      await expect(carta).not.toContainText('tools.');
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '1-carta');
      await carta.locator('[data-approva-una-volta]').click();
      await expect.poll(() => risposte).toEqual([{ requestId: 'impc-req-1', approvato: true }]);
    });

    test(`IMPC-UI-02 — sicurezza: il riquadro «Tocca la sicurezza» e «Questa carta esce anche con l’Accesso pieno» (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'impc-req-2', _sequenza: 2, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012,
        cambi: [CAMBIO('conversation.coordination', false, true)], toolCallId: 'call-s2' } }]);
      const carta = page.locator('[data-request-id="impc-req-2"]');
      await expect(carta.locator('[data-avvisi-impostazioni="sicurezza"] b')).toHaveText('Tocca la sicurezza');
      await expect(carta.locator('[data-avvisi-impostazioni="sicurezza"] li')).toHaveText(['Con la Coordinazione TALOS fa partire altri agenti da solo, e ognuno consuma.']);
      await expect(carta.locator('.talos-approval__foot-note')).toHaveText('Questa carta esce anche con l’Accesso pieno.');
      await expect(carta.locator('[data-apri-impostazioni]')).toHaveCount(0, { timeout: 1000 }); // una voce della conversazione: niente nella pagina
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '2-carta-sicurezza');
    });

    test(`IMPC-UI-03 — la riga dopo il sì: «Ha cambiato 4 impostazioni», «Annulla» a vista, e l’Annulla vero (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO)] });
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-s3', toolCallName: 'app_settings', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-s3', content: ESITO_SET, _sequenza: 3 },
      ]);
      await apriGruppo(page);
      const riga = page.locator('.talos-tool-row[data-impostazioni-ricevuta="set-0a1b2c3d4e5f"]');
      await expect(riga.locator('.talos-tool-row__name')).toHaveText('Ha cambiato 4 impostazioni');
      const annulla = riga.locator('[data-annulla-impostazioni="riga"]');
      await expect(annulla).toBeVisible();
      await expect(page.locator('.talos-tool-row__body').filter({ hasText: 'Receipt' })).toHaveCount(0); // il testo per il modello non va a schermo
      await riga.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '3-riga');
      await annulla.click();
      await expect(riga.locator('.talos-tool-row__name')).toHaveText('Annullato: le 4 impostazioni sono tornate com’erano');
      await expect(riga.locator('[data-annulla-impostazioni]')).toHaveCount(0);
      expect(chiamate).toEqual(['POST /api/v1/app-settings/undo {"receiptId":"set-0a1b2c3d4e5f"}']);
      await foto(page, testInfo, '3-riga-annullata');
    });

    test(`IMPC-UI-04 — «Annulla» rifiutato: la riga resta, l’Annulla si spegne, sotto «Non annullato: … è stata cambiata dopo.» (${modo})`, async ({ page }, testInfo) => {
      await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO)],
        annulla: () => ({ stato: 409, code: 'SETTINGS_UNDO_REFUSED', message: 'tools.webSearchSource changed again since (now "brave"): undo would overwrite a newer choice. Nothing was changed.' }) });
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-s4', toolCallName: 'app_settings', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-s4', content: ESITO_SET, _sequenza: 3 },
      ]);
      await apriGruppo(page);
      const riga = page.locator('.talos-tool-row[data-impostazioni-ricevuta="set-0a1b2c3d4e5f"]');
      await riga.locator('[data-annulla-impostazioni="riga"]').click();
      await expect(page.locator('[data-non-annullato]')).toHaveText('Non annullato: Origine della ricerca web è stata cambiata dopo.');
      await expect(riga.locator('[data-annulla-impostazioni="riga"]')).toBeDisabled();
      await expect(riga.locator('.talos-tool-row__name')).toHaveText('Ha cambiato 4 impostazioni');
      await riga.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '4-non-annullato');
    });

    test(`IMPC-UI-05 — Accesso pieno senza carta: «Senza conferma» e il blocco coi cambi e «Annulla» (${modo})`, async ({ page }, testInfo) => {
      await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO.slice(2), { confermatoDa: { tipo: 'nessuno', motivo: 'accesso-pieno' } })] });
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-s5', toolCallName: 'app_settings', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-s5', content: `${ESITO_SET} Full access: done without asking the person.`, _sequenza: 3 },
      ]);
      await apriGruppo(page);
      const riga = page.locator('.talos-tool-row[data-impostazioni-ricevuta="set-0a1b2c3d4e5f"]');
      await expect(riga.locator('.talos-tool-row__senza-carta')).toHaveText('Senza conferma');
      await riga.click(); // apre il corpo
      const blocco = page.locator('[data-impostazioni-senza-carta]');
      await expect(blocco.locator('b')).toHaveText('Fatto senza chiedere: è attivo l’Accesso pieno');
      await expect(blocco.locator('[data-cambio]')).toHaveCount(2);
      await expect(blocco.locator('[data-annulla-impostazioni="blocco"]')).toBeVisible();
      await blocco.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '5-senza-carta');
    });

    test(`D24 — il segno del modo colore sta nella banda «Il tuo tema» e sparisce con lei (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e6f', [CAMBIO('appearance.colorMode', 'dark', 'light')])] });
      await page.locator('[data-vaia="impostazioni"]').first().click();
      await page.locator('#setting-tab-appearance').click();
      const segno = page.locator('[data-segno-impostazione="appearance.colorMode"]');
      await expect(segno).toBeVisible();
      await expect(segno).toContainText(/^Cambiata da TALOS alle \d{2}:\d{2} · Annulla$/u);
      await foto(page, testInfo, 'd24-segno');
      await page.locator('#setting-tab-tools').click();
      await expect(segno).toBeHidden(); // in un'altra sezione la banda non c'è, e il segno con lei
      await page.locator('#setting-tab-appearance').click();
      await segno.locator('[data-annulla-impostazioni="segno"]').click();
      await expect.poll(() => chiamate).toEqual(['POST /api/v1/app-settings/undo {"receiptId":"set-0a1b2c3d4e6f"}']);
    });

    test(`IMPC-UI-06 — il segno nelle Impostazioni, sotto le scelte, con l’Annulla vero (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO)] });
      await page.locator('[data-vaia="impostazioni"]').first().click();
      await page.locator('#setting-tab-tools').click(); // l'id: `[data-settings-tab]` prende anche la vecchia scheda di `frammenti.html`
      const segno = page.locator('[data-segno-impostazione="tools.webSearchSource"]');
      await expect(segno).toContainText(/^Cambiata da TALOS alle \d{2}:\d{2} · Annulla$/u);
      /* anche l'altra voce dell'app, nella carta che si disegna dopo una lettura dal server */
      await expect(page.locator('[data-segno-impostazione="tools.defaultCommandShell"]')).toContainText(/^Cambiata da TALOS alle \d{2}:\d{2} · Annulla$/u);
      await expect(page.locator('[data-segno-impostazione="conversation.model"]')).toHaveCount(0); // le voci della conversazione no
      await segno.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '6-segno');
      await segno.locator('[data-annulla-impostazioni="segno"]').click();
      await expect.poll(() => chiamate).toEqual(['POST /api/v1/app-settings/undo {"receiptId":"set-0a1b2c3d4e5f"}']);
    });

    test(`IMPC-UI-07 — /settings: l’elenco delle voci e dei valori; un valore sbagliato si dice nell’elenco e non parte (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const inviati = [];
      await page.route('**/api/v1/sessions/impc-proof-*/messages', (route) => { inviati.push(route.request().postData()); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      const campo = page.locator('#composerInput');
      await campo.fill('/');
      await expect(page.locator('#suggerimentoComandiSettings')).toBeVisible();
      await expect(page.locator('#suggerimentoComandiSettings')).toContainText('Cambia un’impostazione: /settings voce=valore');
      await foto(page, testInfo, '7-elenco');
      await campo.fill('/settings tools.');
      const elenco = page.locator('#suggerimentoImpostazioni');
      await expect(elenco.locator('.talos-suggerimento-comandi__nome')).toHaveText(['tools.defaultCommandShell', 'tools.webSearchSource']);
      await campo.press('Tab');
      await expect(campo).toHaveValue('/settings tools.defaultCommandShell=');
      await expect(elenco.locator('.talos-suggerimento-comandi__aiuto')).toHaveText(['Automatico', 'Windows', 'Linux (WSL2)']);
      await foto(page, testInfo, '7-valori');
      await campo.fill('/settings tools.defaultCommandShell=linux');
      await expect(elenco.locator('[data-errore]')).toHaveText('«linux» non va bene per Dove girano i comandi · conversazioni nuove. Valori ammessi: auto, windows, wsl2.');
      await expect(elenco.locator('[data-errore]')).toHaveAttribute('aria-disabled', 'true');
      await campo.press('Enter');
      await expect(campo).toHaveValue('/settings tools.defaultCommandShell=linux');
      expect(inviati).toEqual([]);
      await foto(page, testInfo, '7-valore-sbagliato');
      /* a giro acceso, con l'elenco chiuso da Esc: niente bivio, l'elenco torna col perché e il testo resta */
      await campo.press('Escape');
      await expect(elenco).toBeHidden();
      await campo.press('Enter');
      await expect(elenco.locator('[data-errore]')).toBeVisible();
      await expect(page.locator('[data-bivio="accoda"]')).toBeHidden();
      await expect(campo).toHaveValue('/settings tools.defaultCommandShell=linux');
      expect(inviati).toEqual([]);
    });

    test(`IMPC-UI-09b — a giro acceso anche Ctrl+Invio applica: niente coda, niente al modello (${modo})`, async ({ page }) => {
      const { chiamate } = await prepara(page);
      const alModello = await versoIlModello(page);
      const campo = page.locator('#composerInput');
      await campo.fill('/settings tools.defaultCommandShell=wsl2');
      await expect(page.locator('#suggerimentoImpostazioni')).toBeVisible();
      await campo.press('Control+Enter');
      await expect(page.locator('[data-impostazioni-della-persona]')).toBeVisible();
      expect(chiamate).toHaveLength(1);
      expect(chiamate[0]).toContain('POST /api/v1/app-settings/apply');
      expect(alModello).toEqual([]);
    });

    /* 02/11/2026 — decisione 8 dell'owner: `/settings` scritto dalla persona APPLICA (`POST /api/v1/app-settings/apply`) e lascia la nota
       «Hai cambiato 1 impostazione · Annulla» (bozzetto, variante A); niente al modello. ⛔ SCRITTA E NON LANCIATA (banco del Motore acceso). */
    test(`IMPC-UI-09 — /settings valido applica: la rotta della persona, la nota con «Annulla», niente al modello; l’Annulla vero (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page);
      const alModello = [];
      await page.route(/\/api\/v1\/sessions\/impc-proof-[^/]+\/(messages|resume|queue)/u, (route) => { alModello.push(route.request().url()); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      const campo = page.locator('#composerInput');
      await inviaComando(page, '/settings tools.defaultCommandShell=wsl2');
      const nota = page.locator('[data-impostazioni-della-persona]');
      await expect(nota).toBeVisible();
      await expect(nota.locator('.talos-badge')).toHaveText('Nota');
      await expect(nota.locator('.talos-system-note__title')).toHaveText('Hai cambiato 1 impostazione');
      await expect(nota.locator('.assistant-copy')).toHaveText('Dove girano i comandi · conversazioni nuove: Windows → Linux (WSL2) · quest’app');
      await expect(nota).not.toContainText('tools.');
      await expect(campo).toHaveValue('');
      expect(chiamate).toEqual([`POST /api/v1/app-settings/apply ${JSON.stringify({ sessionId: `impc-proof-${modo}`, changes: [{ key: 'tools.defaultCommandShell', value: 'wsl2' }] })}`]);
      expect(alModello).toEqual([]);
      await nota.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '9-nota-della-persona');
      await nota.locator('[data-annulla-impostazioni="nota"]').click();
      await expect(nota.locator('.talos-system-note__title')).toHaveText('Annullato: l’impostazione è tornata com’era');
      await expect(nota.locator('[data-annulla-impostazioni]')).toHaveCount(0);
      expect(chiamate.at(-1)).toBe('POST /api/v1/app-settings/undo {"receiptId":"set-aaaaaaaaaaaa"}');
      await foto(page, testInfo, '9-nota-annullata');
    });

    test(`IMPC-UI-10 — /settings rifiutato dal server: il testo resta, il perché nell’elenco nella lingua dell’app, nessuna nota (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page, { applica: () => ({ stato: 409, code: 'SETTINGS_APPLY_REFUSED', message: 'The settings change was not applied' }) });
      const campo = page.locator('#composerInput');
      await inviaComando(page, '/settings tools.webSearchSource=brave');
      await expect.poll(() => chiamate.length).toBe(1);
      await expect(campo).toHaveValue('/settings tools.webSearchSource=brave');
      await expect(page.locator('#suggerimentoImpostazioni [data-errore]')).toHaveText('Il cambio delle impostazioni non è stato applicato');
      await expect(page.locator('[data-impostazioni-della-persona]')).toHaveCount(0);
      await foto(page, testInfo, '10-rifiutato');
      /* AL CONTRARIO: cambiando il testo il rifiuto vecchio non resta */
      await campo.fill('/settings tools.webSearchSource=duckduckgo');
      await expect(page.locator('#suggerimentoImpostazioni [data-errore]')).toHaveCount(0);
    });

    /* ═══════════ Giri 2 e 3 delle cure (02/11/2026): ciò che è cambiato a schermo. ⛔ SCRITTE E NON LANCIATE (banco di misura acceso). ═══════════ */

    /* Le richieste che porterebbero un testo AL MODELLO: un messaggio nuovo, la ripresa di una conversazione conclusa, la coda di un giro vivo
       (`submitPrompt` ⇒ `resumeSession` `/resume` o `accodaMessaggioReale` `/queue`, app.js:31271-31277; entrambe col campo `messaggio`). */
    const versoIlModello = async (page) => {
      const lista = [];
      await page.route(/\/api\/v1\/sessions\/impc-proof-[^/]+\/(?:messages|resume|queue)(?:\?|$)/u, (route) => {
        const corpo = JSON.parse(route.request().postData() ?? '{}');
        lista.push({ percorso: new URL(route.request().url()).pathname, messaggio: corpo.messaggio ?? null });
        return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) });
      });
      return lista;
    };
    /* `dati` della rotta vera quando il valore è già quello: `applicaDallaPersona` ⇒ `{ ricevuta: null, cambi: [], gia, revisione }`
       (servizio-impostazioni.mjs:755) */
    const GIA_COSI = () => ({ stato: 200, dati: { ricevuta: null, cambi: [], gia: ['tools.webSearchSource'], revisione: 10013 } });

    test(`IMPC-UI-11 — /settings col valore già uguale: la nota «Già così» con «Origine della ricerca web: DuckDuckGo», senza Annulla, niente al modello (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page, { applica: GIA_COSI });
      const alModello = await versoIlModello(page);
      const campo = page.locator('#composerInput');
      await inviaComando(page, '/settings tools.webSearchSource=duckduckgo');
      /* `creaNotaImpostazioniGiaCosi` (impostazioni-dalla-chat.js:559-568), messa nella chat da app.js:4414-4418 */
      const nota = page.locator('[data-impostazioni-gia-cosi]');
      await expect(nota).toBeVisible();
      await expect(nota.locator('.talos-badge')).toHaveText('Nota');
      await expect(nota.locator('.talos-system-note__title')).toHaveText('Già così');
      await expect(nota.locator('.assistant-copy')).toHaveText('Origine della ricerca web: DuckDuckGo');
      await expect(nota.locator('[data-annulla-impostazioni]')).toHaveCount(0); // niente da annullare
      await expect(nota).not.toContainText('tools.');
      await expect(page.locator('[data-impostazioni-della-persona]')).toHaveCount(0); // non «Hai cambiato…»
      await expect(campo).toHaveValue('');
      expect(chiamate).toEqual([`POST /api/v1/app-settings/apply ${JSON.stringify({ sessionId: `impc-proof-${modo}`, changes: [{ key: 'tools.webSearchSource', value: 'duckduckgo' }] })}`]);
      expect(alModello).toEqual([]);
      await nota.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '11-gia-cosi');
    });

    test.describe('in inglese', () => {
      test.use({ locale: 'en-US' });
      test(`IMPC-UI-11 — /settings with the value already set: the «Already set» note, «Web search source: DuckDuckGo», no Undo (${modo})`, async ({ page }, testInfo) => {
        await prepara(page, { applica: GIA_COSI });
        const alModello = await versoIlModello(page);
        const campo = page.locator('#composerInput');
        await inviaComando(page, '/settings tools.webSearchSource=duckduckgo');
        const nota = page.locator('[data-impostazioni-gia-cosi]');
        await expect(nota.locator('.talos-badge')).toHaveText('Note');
        await expect(nota.locator('.talos-system-note__title')).toHaveText('Already set');
        await expect(nota.locator('.assistant-copy')).toHaveText('Web search source: DuckDuckGo');
        await expect(nota.locator('[data-annulla-impostazioni]')).toHaveCount(0);
        expect(alModello).toEqual([]);
        await nota.scrollIntoViewIfNeeded();
        await foto(page, testInfo, '11-already-set');
      });

      test(`IMPC-UI-12 — the device notifications in English: «Changed from your device (2 settings):», «Changed from your device:», «Changed 1 setting from a device:» (${modo})`, async ({ page }, testInfo) => {
        const pannello = await apriNotifiche(page, VOCI_DAL_DISPOSITIVO());
        await expect(pannello.locator('[data-notifica-id="impostazioni:app:set-d1d1d1d1d1d1"] .talos-notifica__frase')).toHaveText('Changed from your device (2 settings):');
        await expect(pannello.locator('[data-notifica-id="impostazioni:app:set-d1d1d1d1d1d1"] .talos-notifica__dato')).toHaveText('Web search source, Where commands run · new conversations');
        await expect(pannello.locator('[data-notifica-id="impostazioni:n-altra:set-d2d2d2d2d2d2"] .talos-notifica__frase')).toHaveText('Changed from your device:');
        await expect(pannello.locator('[data-notifica-id="impostazioni:n-altra:set-m3m3m3m3m3m3"] .talos-notifica__frase')).toHaveText('Changed 1 setting from a device:');
        /* giro 4: la riga dell'app senza conversazione ha il titolo «Settings», non «Session» */
        await expect(pannello.locator('[data-notifica-id="impostazioni:app:set-d1d1d1d1d1d1"] .talos-list-row__title')).toHaveText('Settings');
        await expect(pannello.locator('[data-notifica-id="impostazioni:n-altra:set-d2d2d2d2d2d2"] .talos-list-row__title')).not.toHaveText('Settings');
        await foto(page, testInfo, '12-notifiche-dispositivo-en');
      });
    });

    /*
     * Le voci del registro come le scrive il server del giro 2 (`notifiche-scrittori.mjs` `impostazioni`, filtrate da `notifiche-registro.mjs`
     * `impostazioniDi`): la PERSONA dal dispositivo porta `impostazioni.origine {tipo:'dispositivo'}`; una voce dell'app non ha conversazione
     * (id `impostazioni:app:<ricevuta>`, `cosa.tipo 'impostazioni'`, `porta: null`). La terza è un cambio del MODELLO confermato dal
     * dispositivo (senza `origine`): quella dice «Ha cambiato N impostazioni da un dispositivo» — le due frasi non si devono confondere.
     */
    const VOCI_DAL_DISPOSITIVO = () => {
      const istante = new Date(Date.now() - 60_000).toISOString();
      const dispositivo = { tipo: 'dispositivo', dispositivoId: 'dev-pad' };
      return [
        { id: 'impostazioni:app:set-d1d1d1d1d1d1', seq: 1, fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'impostazioni', id: '', nome: '' }, porta: null,
          dato: { genere: 'testo', valore: 'tools.webSearchSource: "tavily" → "duckduckgo"; tools.defaultCommandShell: "windows" → "wsl2"' },
          impostazioni: { ricevuta: 'set-d1d1d1d1d1d1', cambi: [{ chiave: 'tools.webSearchSource', prima: 'tavily', dopo: 'duckduckgo' }, { chiave: 'tools.defaultCommandShell', prima: 'windows', dopo: 'wsl2' }],
            confermatoDa: dispositivo, origine: dispositivo }, istante, stato: { visto: false, risolto: true } },
        { id: 'impostazioni:n-altra:set-d2d2d2d2d2d2', seq: 2, fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'sessione', id: 'n-altra', nome: 'Refactoring del carrello' },
          porta: { tipo: 'sessione', id: 'n-altra' }, dato: { genere: 'testo', valore: 'conversation.reasoningEffort: "medium" → "high"' },
          impostazioni: { ricevuta: 'set-d2d2d2d2d2d2', cambi: [{ chiave: 'conversation.reasoningEffort', prima: 'medium', dopo: 'high' }], confermatoDa: dispositivo, origine: dispositivo },
          istante, stato: { visto: false, risolto: true } },
        { id: 'impostazioni:n-altra:set-m3m3m3m3m3m3', seq: 3, fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'sessione', id: 'n-altra', nome: 'Refactoring del carrello' },
          porta: { tipo: 'sessione', id: 'n-altra' }, dato: { genere: 'testo', valore: 'tools.webSearchSource: "duckduckgo" → "brave"' },
          impostazioni: { ricevuta: 'set-m3m3m3m3m3m3', cambi: [{ chiave: 'tools.webSearchSource', prima: 'duckduckgo', dopo: 'brave' }], confermatoDa: dispositivo },
          istante, stato: { visto: false, risolto: true } },
      ];
    };
    /* L'impalcatura di IMPC-UI-08 (registro e flusso intercettati), coi colori del tema; apre il campanello su «Tutto». */
    async function apriNotifiche(page, voci) {
      await page.addInitScript((colorMode) => {
        try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* sandbox */ }
      }, modo);
      await page.route(/\/api\/v1\/app-settings\/catalog$/u, (route) => route.fulfill({ contentType: 'application/json', body: INVOLUCRO(CATALOGO) }));
      await page.route((url) => url.pathname === '/api/v1/notifications', (route) => route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ voci, altre: false, ultimoSeq: voci.length, totaleDaFare: 0 }) }));
      await page.route((url) => url.pathname === '/api/v1/remote/events', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `retry: 600000\ndata: ${JSON.stringify({ type: 'talos.notifica', voce: null, ultimoSeq: voci.length, totaleDaFare: 0 })}\n\n` }));
      await page.goto('/');
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.locator('#notificationsBtn').click();
      const pannello = page.locator('#pannelloNotifiche');
      await pannello.locator('[data-notifica-scheda="tutto"]').click();
      return pannello;
    }

    test(`IMPC-UI-12 — cambi della persona dal dispositivo: «Cambiate dal tuo dispositivo (2 impostazioni):» coi nomi; quello del modello resta «Ha cambiato 1 impostazione da un dispositivo:» (${modo})`, async ({ page }, testInfo) => {
      const pannello = await apriNotifiche(page, VOCI_DAL_DISPOSITIVO());
      /* `fraseDellaNotificaImpostazioni` (impostazioni-dalla-chat.js:458-471), la riga di `creaRigaNotifica` (notifiche.js:102-109, 161-182) */
      const app = pannello.locator('[data-notifica-id="impostazioni:app:set-d1d1d1d1d1d1"]');
      await expect(app).toHaveAttribute('data-notifica', 'impostazioni');
      await expect(app.locator('.talos-notifica__frase')).toHaveText('Cambiate dal tuo dispositivo (2 impostazioni):');
      await expect(app.locator('.talos-notifica__dato')).toHaveText('Origine della ricerca web, Dove girano i comandi · conversazioni nuove');
      await expect(app).not.toContainText('tools.');
      await expect(app).not.toContainText('Ha cambiato'); // la persona, non il modello
      const una = pannello.locator('[data-notifica-id="impostazioni:n-altra:set-d2d2d2d2d2d2"]');
      await expect(una.locator('.talos-notifica__frase')).toHaveText('Cambiata dal tuo dispositivo:');
      await expect(una.locator('.talos-notifica__dato')).toHaveText('Livello di ragionamento');
      await expect(una.locator('.talos-list-row__title')).toContainText('Refactoring del carrello');
      /* AL CONTRARIO: il cambio del MODELLO confermato dal dispositivo (senza `origine`) non diventa «dal tuo dispositivo» */
      const delModello = pannello.locator('[data-notifica-id="impostazioni:n-altra:set-m3m3m3m3m3m3"]');
      await expect(delModello.locator('.talos-notifica__frase')).toHaveText('Ha cambiato 1 impostazione da un dispositivo:');
      await expect(delModello).not.toContainText('tuo dispositivo');
      /* non contano e non stanno in «Da fare» (come IMPC-UI-08) */
      await expect(page.locator('#notificationsBadge')).toBeHidden();
      await foto(page, testInfo, '12-notifiche-dispositivo');
    });

    /*
     * La metà «dal PC nessuna notifica» è del SERVER (lo scrittore esce se l'origine non è `modello` né `dispositivo`,
     * notifiche-scrittori.mjs: `impostazioni`), provata da IMP-NOTIF-05. Dal browser, con le rotte intercettate, si può provare solo la metà
     * della finestra: dopo un `/settings` applicato dal PC la finestra NON si fabbrica una riga da sola, e il campanello resta spento.
     */
    test(`IMPC-UI-13 — /settings applicato dal PC: la nota in chat, e nel campanello nessuna riga «impostazioni» (${modo})`, async ({ page }, testInfo) => {
      await page.route((url) => url.pathname === '/api/v1/notifications', (route) => route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ voci: [], altre: false, ultimoSeq: 0, totaleDaFare: 0 }) }));
      await page.route((url) => url.pathname === '/api/v1/remote/events', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `retry: 600000\ndata: ${JSON.stringify({ type: 'talos.notifica', voce: null, ultimoSeq: 0, totaleDaFare: 0 })}\n\n` }));
      const { chiamate } = await prepara(page);
      const campo = page.locator('#composerInput');
      await inviaComando(page, '/settings tools.defaultCommandShell=wsl2');
      await expect(page.locator('[data-impostazioni-della-persona]')).toBeVisible();
      expect(chiamate).toHaveLength(1);
      await expect(page.locator('#notificationsBadge')).toBeHidden();
      await page.locator('#notificationsBtn').click();
      const pannello = page.locator('#pannelloNotifiche');
      await pannello.locator('[data-notifica-scheda="tutto"]').click();
      await expect(pannello.locator('.talos-list-row[data-notifica="impostazioni"]')).toHaveCount(0);
      await foto(page, testInfo, '13-dal-pc-nessuna-notifica');
    });

    /*
     * Giro 2, F1 della revisione della CLI: un server SENZA gettone risponde a una voce a carta sempre (gruppi `sicurezza`, `aggiornamenti`)
     * 403 `PC_CONFIRMATION_REQUIRED` col motivo `card-required` (servizio-impostazioni.mjs:731-745, rotta http-app.mjs `serveLaCarta`).
     * La finestra (`rifiutoCheVaAlModello`, impostazioni-dalla-chat.js:490-494; app.js:4421-4433) NON lo dice nell'elenco: manda lo stesso
     * testo al modello come messaggio (`submitPrompt(…, { alModello: true })`), e il modello passa dalla carta.
     */
    test(`IMPC-UI-14 — server senza gettone, /settings della Coordinazione: niente errore nell’elenco, il testo va al modello e arriva la carta «Tocca la sicurezza» (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page, { applica: () => ({ stato: 403, code: 'PC_CONFIRMATION_REQUIRED',
        message: 'conversation.coordination can be changed here only through the confirmation card. Nothing was changed.',
        extra: { reason: 'card-required', params: { chiave: 'conversation.coordination', nome: 'Coordination', nomeEn: 'Coordination', nomeIt: 'Coordinazione' } } }) });
      const alModello = await versoIlModello(page);
      const testo = '/settings conversation.coordination=true';
      const campo = page.locator('#composerInput');
      await inviaComando(page, testo);
      await expect.poll(() => alModello.length).toBe(1);
      expect(chiamate).toEqual([`POST /api/v1/app-settings/apply ${JSON.stringify({ sessionId: `impc-proof-${modo}`, changes: [{ key: 'conversation.coordination', value: true }] })}`]);
      expect(alModello[0].messaggio).toBe(testo); // lo stesso testo, una volta, al modello
      await expect(campo).toHaveValue('');
      await expect(page.locator('#suggerimentoImpostazioni [data-errore]')).toHaveCount(0); // il rifiuto non si dice nell'elenco
      await expect(page.locator('[data-impostazioni-della-persona]')).toHaveCount(0); // niente «Hai cambiato…»: non è cambiato niente
      await expect(page.locator('[data-impostazioni-gia-cosi]')).toHaveCount(0);
      /* su una conversazione conclusa il messaggio riprende il giro e la bolla della persona nasce subito (`resumeSession` ⇒ `appendUserFollowUp`,
         app.js:26534); su un giro vivo va in coda, con la sua fascia */
      if (alModello[0].percorso.endsWith('/resume')) await expect(page.locator('#conversation .talos-message--user').last()).toContainText(testo);
      await foto(page, testInfo, '14-al-modello');
      /* il modello chiama `app_settings set` e il nucleo manda la carta: la forma è quella di IMPC-UI-02 */
      await eventi(page, [
        { type: 'RunStarted', input: { consegna: testo }, _sequenza: 10 },
        { type: 'ApprovalRequested', requestId: 'impc-req-14', _sequenza: 11, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10013,
          cambi: [CAMBIO('conversation.coordination', false, true)], toolCallId: 'call-s14' } },
      ]);
      const carta = page.locator('[data-request-id="impc-req-14"]');
      await expect(carta.locator('[data-avvisi-impostazioni="sicurezza"] b')).toHaveText('Tocca la sicurezza');
      await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Applica');
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '14-carta-dopo-il-rifiuto');
    });

    test(`IMPC-UI-14b — AL CONTRARIO: un 403 PC_CONFIRMATION_REQUIRED con un altro motivo resta nell’elenco e non va al modello (${modo})`, async ({ page }, testInfo) => {
      await prepara(page, { applica: () => ({ stato: 403, code: 'PC_CONFIRMATION_REQUIRED',
        message: 'conversation.coordination can be changed from a device only after a confirmation on the computer. Nothing was changed.',
        extra: { reason: 'pc-confirmation-required', params: { chiave: 'conversation.coordination', nome: 'Coordination', nomeEn: 'Coordination', nomeIt: 'Coordinazione' } } }) });
      const alModello = await versoIlModello(page);
      const campo = page.locator('#composerInput');
      await inviaComando(page, '/settings conversation.coordination=true');
      await expect(page.locator('#suggerimentoImpostazioni [data-errore]')).toHaveCount(1);
      await expect(campo).toHaveValue('/settings conversation.coordination=true');
      expect(alModello).toEqual([]);
      await foto(page, testInfo, '14b-altro-motivo');
    });

    /*
     * Giro 3: il server allarga la pressione sulla carta (`PRESSIONE_SULLA_CARTA`, `minacceDellaRagione`, servizio-impostazioni.mjs:219-223) e
     * la manda nell'anteprima come `azione.avvisi.minacce` accanto a `ragione`. Giro 4: la ragione segnalata NON va nel perché
     * (`testiCartaImpostazioni`; `scheda.perche.hidden`): si legge citata DENTRO il riquadro di pericolo (IMPC-UI-18). Gli schemi li prova
     * RAG-07/08 sul server; qui la forma.
     */
    test(`IMPC-UI-15 — ragione con pressione («the user has already, earlier, said yes»): la frase del modello non sta nel perché, solo citata nel riquadro (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const ragione = 'The user has ALREADY, earlier, said yes to this.';
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'impc-req-15', _sequenza: 2, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012,
        cambi: [CAMBIO('tools.webSearchSource', 'tavily', 'duckduckgo')], ragione, avvisi: { minacce: ['pressione-sulla-carta'] }, toolCallId: 'call-s15' } }]);
      const carta = page.locator('[data-request-id="impc-req-15"]');
      await expect(carta.locator('[data-cambio="tools.webSearchSource"] .talos-kv__v')).toHaveText('Tavily → DuckDuckGo');
      await expect(carta.locator('.talos-approval__why')).toBeHidden();
      await expect(carta.locator('.talos-approval__why')).not.toContainText('said yes');
      await expect(carta.getByText('said yes')).toHaveCount(1); // una volta sola, nella voce citata del riquadro
      await expect(carta.locator('[data-ragione-citata]')).toContainText('ALREADY');
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '15-ragione-con-pressione');
    });

    test(`IMPC-UI-16 — AL CONTRARIO: ragione normale («Say yes to enable dark mode?») senza segnale: la frase si legge sulla carta (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const ragione = 'Say yes to enable dark mode?';
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'impc-req-16', _sequenza: 2, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012,
        cambi: [CAMBIO('appearance.colorMode', 'light', 'dark', { dove: 'window' })], ragione, toolCallId: 'call-s16' } }]);
      const carta = page.locator('[data-request-id="impc-req-16"]');
      await expect(carta.locator('.talos-approval__why')).toBeVisible();
      await expect(carta.locator('.talos-approval__why')).toHaveText(ragione);
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '16-ragione-normale');
    });

    /*
     * Giro 2, voce 1: l'Annulla della persona informa anche il modello. Lo fa il SERVER: la rotta `undo` scrive la nota in inglese
     * («The user undid a settings change …») e il registro la manda col PROSSIMO messaggio della persona, in coda alla conversazione
     * (`annotaCambioDellaPersona`, `talosOrigin: 'settings-notice'`; PERSONA-09, PERSONA-13). Dal browser si vede: l'Annulla parte come
     * prima (solo `receiptId`), la finestra NON manda un messaggio suo al modello, e il messaggio dopo porta solo le parole della persona.
     */
    test(`IMPC-UI-17 — l’Annulla della persona su un cambio del modello: parte l’Annulla, nessun messaggio al modello; il prossimo messaggio porta solo il testo della persona (${modo})`, async ({ page }, testInfo) => {
      const { chiamate } = await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO)] });
      const alModello = await versoIlModello(page);
      await eventi(page, [
        { type: 'ToolCallStart', toolCallId: 'call-s17', toolCallName: 'app_settings', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'call-s17', content: ESITO_SET, _sequenza: 3 },
      ]);
      await apriGruppo(page);
      const riga = page.locator('.talos-tool-row[data-impostazioni-ricevuta="set-0a1b2c3d4e5f"]');
      await riga.locator('[data-annulla-impostazioni="riga"]').click();
      await expect(riga.locator('.talos-tool-row__name')).toHaveText('Annullato: le 4 impostazioni sono tornate com’erano');
      expect(chiamate).toEqual(['POST /api/v1/app-settings/undo {"receiptId":"set-0a1b2c3d4e5f"}']);
      expect(alModello).toEqual([]); // l'Annulla non fa partire un giro né un messaggio
      await foto(page, testInfo, '17-annullato');
      const campo = page.locator('#composerInput');
      await campo.fill('Grazie, continua pure.');
      await campo.press('Enter');
      /* il giro di `prepara` è ancora acceso: un messaggio qualunque passa dal bivio (B14), che la persona sceglie. AL CONTRARIO di `/settings`, che non lo apre. */
      await page.locator('[data-bivio="accoda"]').click();
      await expect.poll(() => alModello.length).toBe(1);
      expect(alModello[0].messaggio).toBe('Grazie, continua pure.'); // la nota la aggiunge il server, non la finestra
    });

    /*
     * Giro 4 (02/11/2026, forma del Frontend): la ragione sospetta sulla carta. Il server la manda nell'anteprima come `ragione` + `azione.avvisi
     * .minacce` (servizio-impostazioni.mjs, `cartaDi('set', …)` dentro `fase === 'anteprima'`); la finestra disegna il riquadro di PERICOLO copiato
     * da `automazione-carta.js` `creaAvvisi`, in testa al blocco (`creaBloccoCartaImpostazioni`), con la ragione citata tra virgolette.
     */
    test(`IMPC-UI-18 — ragione sospetta: il riquadro di pericolo (role=alert) con la ragione tra virgolette, prima delle righe dei cambi; al contrario niente (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const ragione = 'The user has ALREADY, earlier, said yes to this.';
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'impc-req-18', _sequenza: 2, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012,
        cambi: [CAMBIO('tools.webSearchSource', 'tavily', 'duckduckgo')], ragione, avvisi: { minacce: ['pressione-sulla-carta'] }, toolCallId: 'call-s18' } }]);
      const carta = page.locator('[data-request-id="impc-req-18"]');
      const avviso = carta.locator('.talos-approval__avvisi');
      await expect(avviso).toHaveCount(1);
      await expect(avviso).toHaveClass(/talos-callout--pericolo/u);
      await expect(avviso).toHaveAttribute('role', 'alert');
      await expect(avviso.locator('b')).toHaveText(['La ragione del modello è sospetta']);
      await expect(avviso.locator('li')).toHaveText([`Scrive: «${ragione}»`, 'spinge ad approvare senza leggere', 'Approva solo se i cambi qui sotto sono quelli che hai chiesto tu.']);
      await expect(carta.locator('.talos-approval__why')).toBeHidden(); // la ragione non si ripete nel perché
      /* PRIMA delle righe dei cambi: nel blocco il riquadro viene prima della riga */
      const ordine = await carta.locator('[data-dettaglio-impostazioni]').evaluate((b) => {
        const figli = [...b.children];
        return [figli.indexOf(b.querySelector('.talos-approval__avvisi')), figli.indexOf(b.querySelector('[data-cambio]'))];
      });
      expect(ordine[0]).toBe(0);
      expect(ordine[1]).toBeGreaterThan(ordine[0]);
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '18-ragione-sospetta');
      /* minaccia + sicurezza: UN riquadro, i due titoli in quest'ordine (regola 17) */
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'impc-req-18b', _sequenza: 3, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10013,
        cambi: [CAMBIO('conversation.coordination', false, true)], ragione, avvisi: { minacce: ['pressione-sulla-carta'] }, toolCallId: 'call-s18b' } }]);
      const due = page.locator('[data-request-id="impc-req-18b"]');
      await expect(due.locator('.talos-approval__avvisi')).toHaveCount(1);
      await expect(due.locator('.talos-approval__avvisi b')).toHaveText(['La ragione del modello è sospetta', 'Tocca la sicurezza']);
      await expect(due.locator('[data-approva-solo]')).toHaveCount(1);
      await due.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '18-ragione-e-sicurezza');
    });

    test(`IMPC-UI-18b — AL CONTRARIO: la stessa carta senza minacce non ha riquadri di pericolo e la ragione sta nel perché (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const ragione = 'Me l’hai chiesto tu nel messaggio prima.';
      await eventi(page, [{ type: 'ApprovalRequested', requestId: 'impc-req-18c', _sequenza: 2, azione: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012,
        cambi: [CAMBIO('tools.webSearchSource', 'tavily', 'duckduckgo')], ragione, toolCallId: 'call-s18c' } }]);
      const carta = page.locator('[data-request-id="impc-req-18c"]');
      await expect(carta.locator('[data-cambio]')).toHaveCount(1);
      await expect(carta.locator('.talos-approval__avvisi')).toHaveCount(0);
      await expect(carta.locator('[role="alert"]')).toHaveCount(0);
      await expect(carta.locator('.talos-approval__why')).toHaveText(ragione);
      await carta.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '18b-ragione-normale');
    });

    /*
     * Giro 4: in Accesso pieno il cambio con una ragione sospetta è già fatto; il server manda PRIMA dell'esito l'evento della conversazione
     * (`annunciaImpostazioni`, session-registry.mjs: `talos.impostazioni-sessione` con `motivo:'avviso-impostazioni'`, `avvisi`, `ricevuta`,
     * `frase` ≤ 60, e l'`istantanea`). La finestra lo ricorda per ricevuta e lo scrive nel blocco «Fatto senza chiedere…» della riga.
     */
    const ISTANTANEA = { modello: 'z-ai/glm-5.3-flash', modelId: 'z-ai/glm-5.3-flash', provider: 'cloud', runtimeId: null, modelloPlanner: null, reasoning: null,
      fasciaVeloce: false, permessi: 'Full access', permessiPerAttrezzo: {}, modalitaOperativa: 'normale', fallbackProviders: [], doveGiranoIComandi: null,
      comandiNellaConversazione: false, nome: 'Refactoring del carrello', versione: 3 };
    const AVVISO_PRESSIONE = (frase, seq = 2) => ({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: seq, value: { modalitaOperativa: 'normale',
      permessi: 'Full access', motivo: 'avviso-impostazioni', origine: { tipo: 'modello', sessionId: `impc-proof-${modo}`, dispositivoId: null },
      confermatoDa: { tipo: 'nessuno', motivo: 'accesso-pieno' }, avvisi: ['pressione-sulla-carta'], ricevuta: 'set-0a1b2c3d4e5f', frase, istantanea: ISTANTANEA } });
    const SENZA_CARTA = (seq) => [
      { type: 'ToolCallStart', toolCallId: 'call-s20', toolCallName: 'app_settings', _sequenza: seq },
      { type: 'ToolCallResult', toolCallId: 'call-s20', content: `${ESITO_SET} Full access: done without asking the person.`, _sequenza: seq + 1 },
    ];

    test(`IMPC-UI-20 — Accesso pieno con la pressione: nel blocco «Fatto senza chiedere…» la frase trovata tra virgolette, mai la ragione intera; senza frase la riga senza citazione (${modo})`, async ({ page }, testInfo) => {
      await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO.slice(2), { confermatoDa: { tipo: 'nessuno', motivo: 'accesso-pieno' } })] });
      await eventi(page, [AVVISO_PRESSIONE('already, earlier, said yes'), ...SENZA_CARTA(3)]);
      await apriGruppo(page);
      const riga = page.locator('.talos-tool-row[data-impostazioni-ricevuta="set-0a1b2c3d4e5f"]');
      await expect(riga.locator('.talos-tool-row__senza-carta')).toHaveText('Senza conferma');
      await riga.click(); // apre il corpo
      const blocco = page.locator('[data-impostazioni-senza-carta]');
      const pressione = blocco.locator('[data-impostazioni-pressione]');
      await expect(pressione).toHaveText('Fatto senza chiedere, ma la richiesta conteneva «already, earlier, said yes», che spinge a non controllare. Se non l’hai chiesto tu, annulla.');
      await expect(blocco.locator('[data-annulla-impostazioni="blocco"]')).toBeVisible();
      await blocco.scrollIntoViewIfNeeded();
      await foto(page, testInfo, '20-accesso-pieno-pressione');
    });

    test(`IMPC-UI-20b — Accesso pieno: senza frase la riga dice solo che la ragione spingeva; senza avviso nessuna riga in più (${modo})`, async ({ page }, testInfo) => {
      await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO.slice(2), { confermatoDa: { tipo: 'nessuno', motivo: 'accesso-pieno' } })] });
      await eventi(page, [AVVISO_PRESSIONE(null), ...SENZA_CARTA(3)]);
      await apriGruppo(page);
      await page.locator('.talos-tool-row[data-impostazioni-ricevuta="set-0a1b2c3d4e5f"]').click();
      await expect(page.locator('[data-impostazioni-pressione]')).toHaveText('Fatto senza chiedere, ma la ragione del modello spingeva a non controllare. Se non l’hai chiesto tu, annulla.');
      await foto(page, testInfo, '20b-senza-frase');
    });

    test(`IMPC-UI-20c — AL CONTRARIO: Accesso pieno senza avviso (ragione onesta): il blocco di sempre, nessuna riga della pressione (${modo})`, async ({ page }) => {
      await prepara(page, { ricevute: [RICEVUTA('set-0a1b2c3d4e5f', CAMBI_COSTO.slice(2), { confermatoDa: { tipo: 'nessuno', motivo: 'accesso-pieno' } })] });
      await eventi(page, SENZA_CARTA(2));
      await apriGruppo(page);
      await page.locator('.talos-tool-row[data-impostazioni-ricevuta="set-0a1b2c3d4e5f"]').click();
      await expect(page.locator('[data-impostazioni-senza-carta] [data-cambio]')).toHaveCount(2);
      await expect(page.locator('[data-impostazioni-pressione]')).toHaveCount(0);
    });

    test(`IMPC-UI-21 — il titolo della riga di un cambio dal dispositivo SENZA conversazione è «Impostazioni», non «Sessione»; con la conversazione il suo nome (${modo})`, async ({ page }, testInfo) => {
      const pannello = await apriNotifiche(page, VOCI_DAL_DISPOSITIVO());
      await expect(pannello.locator('[data-notifica-id="impostazioni:app:set-d1d1d1d1d1d1"] .talos-list-row__title')).toHaveText('Impostazioni');
      await expect(pannello.locator('[data-notifica-id="impostazioni:app:set-d1d1d1d1d1d1"] .talos-notifica__frase')).toHaveText('Cambiate dal tuo dispositivo (2 impostazioni):');
      await expect(pannello.locator('[data-notifica-id="impostazioni:n-altra:set-d2d2d2d2d2d2"] .talos-list-row__title')).toContainText('Refactoring del carrello');
      await expect(pannello.locator('.talos-list-row__title').filter({ hasText: /^Sessione$/u })).toHaveCount(0);
      await foto(page, testInfo, '21-titolo-impostazioni');
    });
  });
}

/* Ciò che il browser con le rotte intercettate NON può vedere: segnato, non inventato. */
test.fixme('IMPC-UI-19 — il modello riceve la nota del cambio o dell’Annulla della persona col messaggio dopo', async () => {
  /* MANCA dal browser: la nota («The user changed a setting on the computer: …», «The user undid a settings change …») la aggiunge il
     SERVER alla richiesta al fornitore (`annotaCambioDellaPersona`, session-registry.mjs), mai la finestra; con le rotte intercettate
     non arriva a nessun modello. La provano PERSONA-09, PERSONA-13 e PERSONA-14 (kernel vero, fornitore finto). Una prova nel browser
     richiederebbe il server della suite non intercettato e un fornitore finto che registri la richiesta: non c'è un'impalcatura così. */
});

test('IMPC-UI-08 — la notifica `impostazioni` ha la sua riga in «Tutto», coi nomi delle voci; non conta e non sta in «Da fare»', async ({ page }) => {
  const voce = { id: 'impostazioni:n-altra:set-0a1b2c3d4e5f', seq: 1, fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'sessione', id: 'n-altra', nome: 'Refactoring del carrello' },
    porta: { tipo: 'sessione', id: 'n-altra' }, dato: { genere: 'testo', valore: 'tools.webSearchSource: "tavily" → "duckduckgo"' },
    impostazioni: { ricevuta: 'set-0a1b2c3d4e5f', cambi: [{ chiave: 'tools.webSearchSource', prima: 'tavily', dopo: 'duckduckgo' }, { chiave: 'tools.defaultCommandShell', prima: 'windows', dopo: 'wsl2' }], confermatoDa: { tipo: 'finestra-pc' } },
    istante: new Date(Date.now() - 60_000).toISOString(), stato: { visto: false, risolto: true } };
  await page.route(/\/api\/v1\/app-settings\/catalog$/u, (route) => route.fulfill({ contentType: 'application/json', body: INVOLUCRO(CATALOGO) }));
  await page.route((url) => url.pathname === '/api/v1/notifications', (route) => route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ voci: [voce], altre: false, ultimoSeq: 1, totaleDaFare: 0 }) }));
  await page.route((url) => url.pathname === '/api/v1/remote/events', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `retry: 600000\ndata: ${JSON.stringify({ type: 'talos.notifica', voce: null, ultimoSeq: 1, totaleDaFare: 0 })}\n\n` }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await expect(page.locator('#notificationsBadge')).toBeHidden();
  await page.locator('#notificationsBtn').click();
  const pannello = page.locator('#pannelloNotifiche');
  await pannello.locator('[data-notifica-scheda="tutto"]').click();
  const riga = pannello.locator('.talos-list-row[data-notifica="impostazioni"]');
  await expect(riga).toContainText('Ha cambiato 2 impostazioni:');
  await expect(riga).toContainText('Origine della ricerca web, Dove girano i comandi · conversazioni nuove');
  await expect(riga).not.toContainText('tools.');
  await pannello.locator('[data-notifica-scheda="da-fare"]').click();
  await expect(pannello.locator('.talos-notifica__elenco .talos-list-row[data-notifica="impostazioni"]')).toHaveCount(1); // fra le «ultime cose», non da fare
});
