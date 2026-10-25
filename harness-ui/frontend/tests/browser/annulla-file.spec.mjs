import { test, expect } from '@playwright/test';

/*
 * 18/10/2026 — R5.11 «Annulla le modifiche ai file» (owner: «Come Hermes, PC e telefono»; mockup approvato la sera stessa). Sul
 * pacchetto SERVITO, nei due temi. Le rotte `…/file-undo…` sono INTERCETTATE: qui si prova che cosa la finestra chiede e che cosa
 * disegna con la risposta; il server ha le sue prove (tests/punti-di-ripristino*.test.mjs, col git vero).
 */
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const DIFF = [
  'diff --git a/src/server/rotte.mjs b/src/server/rotte.mjs', '--- a/src/server/rotte.mjs', '+++ b/src/server/rotte.mjs',
  '@@ -41,3 +41,3 @@', ' export function creaRotte() {', "-  router.get('/utenti', elenca);", "+  router.get('/utenti', conCache(elenca));", ' }',
  'diff --git a/README.md b/README.md', '--- a/README.md', '+++ b/README.md', '@@ -1 +1 @@', '-# Vecchio', '+# Nuovo', '',
].join('\n');
const PIANO = {
  ok: true, turno: 1, commit: 'a'.repeat(40), alle: new Date().toISOString(),
  ripristina: [{ stato: 'M', percorso: 'src/server/rotte.mjs' }],
  salta: [{ stato: 'M', percorso: 'README.md', motivo: 'persona' }],
  fuori: ['C:/altrove/x.txt'], troppoGrandi: [], diff: DIFF, troncato: false,
};

for (const modo of ['dark', 'light']) {
  test.describe(`tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page, { punti = [{ turno: 1, seqAvvio: 1, alle: new Date().toISOString(), annullabile: true, fuori: 1 }] } = {}) {
      const chiamate = [];
      await page.addInitScript((colorMode) => {
        try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* sandbox */ }
      }, modo);
      await page.route('**/api/v1/sessions/annulla-proof-*/events', () => { /* aperto e muto */ });
      await page.route('**/api/v1/sessions/annulla-proof-*/file-undo**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        chiamate.push(`${req.method()} ${url.pathname.replace(/^.*file-undo/u, 'file-undo')} ${req.postData() ?? ''}`.trim());
        if (url.pathname.endsWith('/file-undo')) return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true, disponibile: true, punti }) });
        if (url.pathname.endsWith('/redo')) return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true, rifatti: ['src/server/rotte.mjs'], saltati: [] }) });
        if (req.method() === 'POST') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true, ripristinati: ['src/server/rotte.mjs', 'README.md'], saltati: [], fuori: [] }) });
        return route.fulfill({ contentType: 'application/json', body: INVOLUCRO(PIANO) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate((id) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Prova dell\'annulla', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
        for (const e of [
          { type: 'RunStarted', input: { consegna: 'aggiungi la cache alle rotte degli utenti' }, _sequenza: 1 },
          { type: 'TextMessageStart', messageId: 'm1', role: 'assistant', _sequenza: 2 },
          { type: 'TextMessageContent', messageId: 'm1', delta: 'Fatto: la cache è nelle rotte.', _sequenza: 3 },
          { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 4 },
          { type: 'RunFinished', _sequenza: 5 },
        ]) r.handleRealEvent(e, r.realSessionState.generation);
      }, `annulla-proof-${modo}`);
      await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
      return chiamate;
    }
    const messaggio = (page) => page.locator('#conversation .talos-message--user').last();
    async function apriMenu(page) {
      await messaggio(page).hover();
      await messaggio(page).locator('[data-message-action="piu"]').click();
    }

    /* 24/10/2026 sera (R-T1, revisione a blocco 4): il «⋯» del tuo messaggio ha «Riusa nel composer» per prima (owner, «Matita =
       modifica»): la voce si cerca per NOME, non per posizione. */
    test(`ANNULLA-UI-01 — dal «⋯» del tuo messaggio: anteprima, «Includi», conferma, poi «Rifai» (${modo})`, async ({ page }, testInfo) => {
      const chiamate = await prepara(page);
      await expect(messaggio(page).locator('[data-message-action="piu"]')).toHaveAttribute('aria-label', 'Altre azioni sul tuo messaggio');
      await apriMenu(page);
      const voce = page.locator('#menuRispostaMessaggio').getByRole('menuitem', { name: 'Annulla le modifiche ai file da qui', exact: true });
      await expect(voce).toHaveText('Annulla le modifiche ai file da qui');
      await page.screenshot({ path: testInfo.outputPath(`1-menu-${modo}.png`) });
      await voce.click();
      const finestra = page.locator('dialog.td-modal[data-annulla-file]');
      await expect(finestra.locator('h2')).toHaveText('Annulla le modifiche ai file');
      await expect(finestra.locator('.talos-annulla__lead')).toContainText('«aggiungi la cache alle rotte degli utenti»');
      await expect(finestra.locator('.talos-github-gruppo__titolo')).toHaveText(['Tornano com’erano', 'Restano come sono']);
      await expect(finestra.locator('[data-percorso="README.md"] .talos-github-riga__cartella')).toHaveText('L’hai modificato tu dopo TALOS');
      await expect(finestra.locator('.talos-annulla__elenco')).toContainText('1 file fuori da questa cartella è stato scritto');
      await expect(finestra.locator('.talos-annulla__diff summary')).toHaveText('Modifiche che si annullano in rotte.mjs');
      await expect(finestra.locator('.talos-annulla__diff .talos-diff__line--add')).toContainText('conCache');
      const conferma = finestra.locator('[data-annulla-conferma]');
      await expect(conferma).toHaveText('Annulla le modifiche a 1 file');
      await page.mouse.move(1900, 1070);
      await page.screenshot({ path: testInfo.outputPath(`2-anteprima-${modo}.png`) });
      /* il diff segue il file scelto */
      await finestra.locator('[data-percorso="README.md"] .talos-github-riga__apri').click();
      await expect(finestra.locator('.talos-annulla__diff summary')).toHaveText('Modifiche che si annullano in README.md');
      await finestra.locator('[data-annulla-includi="README.md"]').click();
      await expect(conferma).toHaveText('Annulla le modifiche a 2 file');
      await conferma.click();
      await expect(finestra).toHaveCount(0);
      const esito = page.locator('.talos-toast').filter({ hasText: '2 file rimessi com’erano' });
      await expect(esito).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`3-esito-${modo}.png`) });
      await esito.locator('[data-toast-action]').click();
      await expect(page.locator('.talos-toast').filter({ hasText: 'com’era prima dell’annullamento' })).toBeVisible();
      expect(chiamate).toEqual(['GET file-undo', 'GET file-undo/1', 'POST file-undo/1 {"include":["README.md"]}', 'POST file-undo/redo {}']);
    });

    test(`ANNULLA-UI-04 — la seconda porta: il modello propone, la carta mostra i file e il diff, «Annulla le modifiche» approva (${modo})`, async ({ page }, testInfo) => {
      await prepara(page);
      const risposte = [];
      await page.route('**/api/v1/sessions/annulla-proof-*/approve', async (route) => { risposte.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'undo-req-1', _sequenza: 6, azione: {
          tipo: 'file_changes_undo', toolCallId: 'call-u1', turno: 1, alle: new Date().toISOString(),
          ripristina: [{ stato: 'M', percorso: 'src/server/rotte.mjs' }], salta: [{ stato: 'M', percorso: 'README.md', motivo: 'persona' }],
          inclusi: ['README.md'], fuori: [], troppoGrandi: [], troncato: false,
          diff: ['diff --git a/src/server/rotte.mjs b/src/server/rotte.mjs', '--- a/src/server/rotte.mjs', '+++ b/src/server/rotte.mjs', '@@ -1 +1 @@', '-a', '+b', ''].join('\n'),
        } }, r.realSessionState.generation);
      });
      const carta = page.locator('[data-request-id="undo-req-1"]');
      await expect(carta).toBeVisible();
      await expect(carta.locator('[data-annulla-carta] .talos-github-gruppo__titolo')).toHaveText(['Tornano com’erano']);
      await expect(carta.locator('[data-percorso="README.md"] .talos-github-riga__cartella')).toHaveText('Incluso perché l’hai chiesto');
      await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Annulla le modifiche');
      await expect(carta.locator('[data-nega]')).toHaveText('Lascia com’è');
      await expect(carta.locator('[data-modifica-automazione]')).toHaveCount(0);
      await carta.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`4-carta-${modo}.png`) });
      await carta.locator('[data-approva-una-volta]').click();
      await expect.poll(() => risposte).toEqual([{ requestId: 'undo-req-1', approvato: true }]);
    });

    test(`ANNULLA-UI-05 — un annullamento fatto dalla chat porta il toast col «Rifai»; rigiocando la storia no (${modo})`, async ({ page }) => {
      const chiamate = await prepara(page);
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of [
          { type: 'RunStarted', input: { consegna: 'annulla quello che hai fatto' }, _sequenza: 6 },
          { type: 'ToolCallStart', toolCallId: 'call-u2', toolCallName: 'file_changes_undo', _sequenza: 7 },
          { type: 'ToolCallResult', toolCallId: 'call-u2', content: 'Put back as they were before that message: src/a.txt, src/b.txt. The person can redo it from the app.', _sequenza: 8 },
        ]) r.handleRealEvent(e, r.realSessionState.generation);
      });
      const esito = page.locator('.talos-toast').filter({ hasText: '2 file rimessi com’erano' });
      await expect(esito).toBeVisible();
      await esito.locator('[data-toast-action]').click();
      await expect.poll(() => chiamate).toContain('POST file-undo/redo {}');
      await expect(page.locator('.talos-toast').filter({ hasText: 'prima dell’annullamento' })).toBeVisible(); // l'esito del «Rifai», prima di pulire
      /* al contrario: la stessa storia RIGIOCATA (prima del confine `talos.fine-rigiocata`) non offre un «Rifai» di ieri */
      await page.evaluate(() => { for (const t of document.querySelectorAll('.talos-toast')) t.remove(); });
      await page.evaluate((id) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Rigiocata', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
        for (const e of [
          { type: 'RunStarted', input: { consegna: 'annulla' }, _sequenza: 1 },
          { type: 'ToolCallStart', toolCallId: 'call-r1', toolCallName: 'file_changes_undo', _sequenza: 2 },
          { type: 'ToolCallResult', toolCallId: 'call-r1', content: 'Put back as they were before that message: src/a.txt. The person can redo it from the app.', _sequenza: 3 },
        ]) r.handleRealEvent(e, r.realSessionState.generation);
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
      }, `annulla-proof-rigiocata-${modo}`);
      await page.waitForTimeout(500);
      await expect(page.locator('.talos-toast').filter({ hasText: 'Annullate dalla chat' })).toHaveCount(0);
    });

    test(`ANNULLA-UI-02 — al contrario: senza un punto da quel messaggio in poi, niente finestra e lo dice (${modo})`, async ({ page }) => {
      const chiamate = await prepara(page, { punti: [] });
      await apriMenu(page);
      await page.locator('#menuRispostaMessaggio').getByRole('menuitem', { name: 'Annulla le modifiche ai file da qui', exact: true }).click();
      await expect(page.locator('.talos-toast').filter({ hasText: 'Da questo messaggio in poi TALOS non ha cambiato file.' })).toBeVisible();
      await expect(page.locator('dialog.td-modal[data-annulla-file]')).toHaveCount(0);
      expect(chiamate).toEqual(['GET file-undo']);
    });

    test(`ANNULLA-UI-03 — al contrario: un punto senza copia dice perché (Git mancante) e non apre niente (${modo})`, async ({ page }) => {
      await prepara(page, { punti: [{ turno: 1, seqAvvio: 1, annullabile: false, motivo: 'git-assente', fuori: 0 }] });
      await apriMenu(page);
      await page.locator('#menuRispostaMessaggio').getByRole('menuitem', { name: 'Annulla le modifiche ai file da qui', exact: true }).click();
      await expect(page.locator('.talos-toast').filter({ hasText: 'serve Git installato sul computer' })).toBeVisible();
      await expect(page.locator('dialog.td-modal[data-annulla-file]')).toHaveCount(0);
    });
  });
}
