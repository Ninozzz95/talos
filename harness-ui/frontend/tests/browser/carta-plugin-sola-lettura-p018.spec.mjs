import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * P018 round 2 (owner 11/11/2026 13:08-13:50): the card of a plugin tool and of a Tool Forge tool (they ran with no card), and the
 *   «Read only» card «only once» for every outside tool. The registry now puts `sempreNonBasta` on every outside-tool card for the
 *   phone (which draws no server or tool yet): the PC must keep its «for this tool» all the same, except in «Read only».
 * ⛔ Fake event with the TRUE text of the server (lesson of 26/09): the actions are the ones `talosHarness.mjs` builds in the plugin,
 *   Forge and MCP branches, plus `sempreNonBasta` from `session-registry.mjs`; the English sentences are `FRASI_DI_PERMESSO`.
 * ⛔ The test server of `playwright.config.mjs`, never the 4174; every write is stopped and counted. Photos 1920×1080, both themes.
 */
const CARTELLA_FOTO = process.env.P018_FOTO
  ? path.resolve(process.env.P018_FOTO)
  : path.resolve(fileURLToPath(new URL('../../artifacts/carta-plugin-sola-lettura-p018/', import.meta.url)));
const SESSIONE = 'carta-plugin';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const PLUGIN = {
  tipo: 'plugin_tool', toolCallId: 'call_plugin_1', nome: 'plugin__lint__check', plugin: 'lint', attrezzo: 'check', sempreNonBasta: true,
  frase: 'It wants to use the tool «check» of the plugin «lint». A plugin runs its own program on this PC: it needs your yes.',
  fraseChiave: 'server.approval.pluginTool', fraseParams: { plugin: 'lint', attrezzo: 'check' },
};
const FORGE = {
  tipo: 'forge_tool', toolCallId: 'call_forge_1', nome: 'forge_daily_note', attrezzo: 'daily_note', sempreNonBasta: true,
  frase: 'It wants to use «daily_note», a tool made in Tool Forge. It can change your notes, tasks and memory: it needs your yes.',
  fraseChiave: 'server.approval.forgeTool', fraseParams: { attrezzo: 'daily_note' },
};
const MCP = {
  tipo: 'mcp_tool', toolCallId: 'call_mcp_1', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue', sempreNonBasta: true,
  frase: 'It wants to use the tool «create_issue» of the connector «github». A connector runs its own program outside TALOS: it needs your yes.',
  fraseChiave: 'server.approval.mcpTool', fraseParams: { server: 'github', attrezzo: 'create_issue' },
};
const MCP_SOLA_LETTURA = {
  ...MCP, toolCallId: 'call_mcp_2', soloUnaVolta: true,
  frase: 'You are in Read only, but the tool «create_issue» of the connector «github» can change things outside this PC. Allow it only this once?',
  fraseChiave: 'server.approval.mcpToolReadOnly',
};
const PLUGIN_SOLA_LETTURA = {
  ...PLUGIN, toolCallId: 'call_plugin_2', soloUnaVolta: true,
  frase: 'You are in Read only, but the tool «check» of the plugin «lint» runs a program that can change things on this PC and outside it. Allow it only this once?',
  fraseChiave: 'server.approval.pluginToolReadOnly',
};

for (const modo of ['light', 'dark']) {
  test.describe(`P018 round 2 cards · ${modo}`, () => {
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
      }, { id: SESSIONE, confine: CONFINE, titolo: lingua === 'en' ? 'Weekly cleanup' : 'Pulizia della settimana', permessi });
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

    test('G2-CARTA-01 (it): plugin card: badge, the readable tool, plugin and tool in the why, «for this tool» that sends the scope', async ({ page }) => {
      const traffico = await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'plugin-req-1', azione: PLUGIN, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText('Chiede di usare un plugin');
      await expect(carta(page)).toContainText('Vuole usare uno strumento di un plugin');
      await expect(carta(page)).toContainText('check (lint)');
      await expect(carta(page)).toContainText('Vuole usare lo strumento «check» del plugin «lint»');
      await expect(carta(page)).not.toContainText('plugin__lint__check');
      const sessione = carta(page).getByRole('button', { name: 'Per questo strumento in questa sessione' });
      await expect(sessione).toHaveCount(1);
      await foto(page, `p018g2-carta-plugin-it-${modo}.png`);
      await sessione.click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toMatchObject({ requestId: 'plugin-req-1', approvato: true, ambito: 'strumento' });
      expect(traffico.scritture.filter((s) => !s.endsWith('/approve'))).toEqual([]);
    });

    test('G2-CARTA-02 (en): the plugin card in English', async ({ page }) => {
      await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'plugin-req-2', azione: PLUGIN, _sequenza: 2 }]);
      await expect(carta(page)).toContainText('Asks to use a plugin');
      await expect(carta(page)).toContainText('It wants to use a tool of a plugin');
      await expect(carta(page)).toContainText('It wants to use the tool «check» of the plugin «lint»');
      await expect(carta(page).getByRole('button', { name: 'For this tool in this session' })).toHaveCount(1);
      await foto(page, `p018g2-carta-plugin-en-${modo}.png`);
    });

    test('G2-CARTA-03 (it): Tool Forge card, with «for this tool»', async ({ page }) => {
      await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'forge-req-1', azione: FORGE, _sequenza: 2 }]);
      await expect(carta(page)).toContainText('Chiede di usare uno strumento di Tool Forge');
      await expect(carta(page)).toContainText('daily note');
      await expect(carta(page)).toContainText('Vuole usare «daily note», uno strumento fatto in Tool Forge');
      await expect(carta(page)).not.toContainText('daily_note');
      await expect(carta(page).getByRole('button', { name: 'Per questo strumento in questa sessione' })).toHaveCount(1);
      await foto(page, `p018g2-carta-forge-it-${modo}.png`);
    });

    test('G2-CARTA-03b (en): the Tool Forge card in English, one readable name', async ({ page }) => {
      await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'forge-req-2', azione: FORGE, _sequenza: 2 }]);
      await expect(carta(page)).toContainText('It wants to use «daily note», a tool made in Tool Forge');
      await expect(carta(page)).not.toContainText('daily_note');
      await expect(carta(page).locator('.talos-approval__foot-note')).toHaveText('Once: only this call. For this tool: the whole session');
      await foto(page, `p018g2-carta-forge-en-${modo}.png`);
    });

    test('G2-CARTA-04: the connector card with the phone mark (sempreNonBasta) keeps «for this tool» on the PC', async ({ page }) => {
      await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'mcp-req-1', azione: MCP, _sequenza: 2 }]);
      await expect(carta(page).getByRole('button', { name: 'Per questo strumento in questa sessione' })).toHaveCount(1);
    });

    for (const [lingua, unaVolta, nega, attesa] of [
      ['it', 'Consenti una volta', 'Nega', 'Sei in Solo lettura, ma lo strumento «create issue» del connettore «github» può cambiare cose fuori da questo PC'],
      ['en', 'Allow once', 'Deny', 'You are in Read only, but the tool «create issue» of the connector «github» can change things outside this PC'],
    ]) {
      test(`G2-CARTA-05 (${lingua}): «Read only»: the connector card offers only «once» and «deny», and says why`, async ({ page }) => {
        const traffico = await prepara(page, lingua, 'Read only');
        await manda(page, [{ type: 'ApprovalRequested', requestId: 'mcp-req-ro', azione: MCP_SOLA_LETTURA, _sequenza: 2 }]);
        /* repair round 13/11 (reviewer C): the session really is in Read only, and the composer chip says so (it said «writes to the project»: the test set the session up that way) */
        await expect(page.getByText(lingua === 'en' ? 'Writes to the project' : 'Scrive nel progetto', { exact: true }).filter({ visible: true })).toHaveCount(0);
        await expect(page.getByText(lingua === 'en' ? 'Read only' : 'Solo lettura', { exact: true }).filter({ visible: true }).first()).toBeVisible();
        await expect(carta(page)).toContainText(attesa);
        await expect(carta(page).getByRole('button', { name: /strumento|this tool/u })).toHaveCount(0);
        await expect(carta(page).getByRole('button', { name: /sessione|session/u })).toHaveCount(0);
        await expect(carta(page).getByRole('button', { name: unaVolta })).toHaveCount(1);
        await expect(carta(page).getByRole('button', { name: nega })).toHaveCount(1);
        await foto(page, `p018g2-carta-mcp-sola-lettura-${lingua}-${modo}.png`);
        await carta(page).getByRole('button', { name: unaVolta }).click();
        await expect.poll(() => traffico.approve.length).toBe(1);
        expect(traffico.approve[0].ambito).toBeUndefined();
        expect(traffico.approve[0].sempre).not.toBe(true);
      });
    }

    for (const [lingua, attesa] of [
      ['it', 'Sei in Solo lettura, ma lo strumento «check» del plugin «lint» fa girare un programma'],
      ['en', 'You are in Read only, but the tool «check» of the plugin «lint» runs a program'],
    ]) test(`G2-CARTA-06 (${lingua}): «Read only»: the plugin card too, only «once» and «deny»`, async ({ page }) => {
      await prepara(page, lingua, 'Read only');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'plugin-req-ro', azione: PLUGIN_SOLA_LETTURA, _sequenza: 2 }]);
      await expect(carta(page)).toContainText(attesa);
      await expect(carta(page).getByRole('button', { name: /strumento|sessione|this tool|session/u })).toHaveCount(0);
      await foto(page, `p018g2-carta-plugin-sola-lettura-${lingua}-${modo}.png`);
    });
  });
}
