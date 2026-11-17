import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

/*
 * Long tasks, A and B (owner 13/11/2026 04:35; judge v1759 a) — the permission card of several calls of the same outside tool in one
 * answer, in the real page: the count in the head, every call listed with its arguments (past three under «Show all»), «Allow all» and
 * «Deny all» that send `ambito: 'risposta'`, and «No to this tool until your next message» in the «⋯» menu (and on a right click),
 * that sends a no with `ambito: 'strumento'`.
 * ⛔ Fake event with the TRUE text of the server (lesson of 26/09): the action is the one `talosHarness.mjs` builds for a connector tool,
 *   plus the `gruppo` the kernel writes (`{ totale, chiamate: [{ toolCallId, argomenti }] }`); the English sentence is
 *   `FRASI_DI_PERMESSO['server.approval.mcpTool']`. The test server of `playwright.config.mjs`, never the 4174; every write is stopped
 *   and counted. Photos 1920×1080, both themes, Italian and English.
 */
/* Headless Chromium hides every scroll bar (`--hide-scrollbars`, a default launch argument of Playwright): the photos of this file would
   show a list that scrolls with no bar, which the PC never does. The bar is put back for the whole file (a launch option forces its own
   worker, so it cannot live in a group). */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const CARTELLA_FOTO = process.env.CARTE_AB_FOTO
  ? path.resolve(process.env.CARTE_AB_FOTO)
  : path.resolve(fileURLToPath(new URL('../../artifacts/carte-compiti-lunghi-ab/', import.meta.url)));
const SESSIONE = 'carte-ab';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const MCP = {
  tipo: 'mcp_tool', toolCallId: 'call_x1_0', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue',
  frase: 'It wants to use the tool «create_issue» of the connector «github». A connector runs its own program outside TALOS: it needs your yes.',
  fraseChiave: 'server.approval.mcpTool', fraseParams: { server: 'github', attrezzo: 'create_issue' },
};
const TITOLI = ['Login fails on Safari', 'Crash when the folder is empty', 'Dark theme: unreadable labels', 'Export to PDF cuts the last page',
  'Search ignores accents', 'Slow start with 1000 notes', 'Tray icon stays after quit', 'Typo in the welcome screen'];
const GRUPPO = { totale: 8, chiamate: TITOLI.map((title, i) => ({ toolCallId: `call_x1_${i}`, argomenti: { title, labels: 'bug' } })) };
const CON_GRUPPO = { ...MCP, gruppo: GRUPPO };
/* the second reviewer's ROSSO (13/11/2026 19:08): a field name of 289 characters pushed the value to 0 px, in the group card and in the
   card of one call (0.2.1 too, measured on 5e9fdc1b9). The kernel no longer groups such a call; the card is the last net and must show it. */
const NOME_LUNGO = `note_${'x'.repeat(280)}_END`;
const TITOLO_300 = `${'a'.repeat(283)} DELETE EVERYTHING`.slice(0, 300);
const CON_NOME_LUNGO = { ...MCP, gruppo: { totale: 2, chiamate: [
  { toolCallId: 'call_x1_0', argomenti: { title: 'short' } },
  { toolCallId: 'call_x1_1', argomenti: { [NOME_LUNGO]: 'DELETE EVERYTHING', title: TITOLO_300 } },
] } };
const DAL_TESTO_NOME_LUNGO = { tipo: 'chiamata-dal-testo', toolCallId: 'daTesto-0123456789ab-1', nome: 'create_issue', semprePersona: true,
  argomenti: { [NOME_LUNGO]: 'DELETE EVERYTHING', title: TITOLO_300 },
  frase: 'The model wrote this tool call as text instead of calling the tool (create_issue). TALOS rebuilt it: run it?',
  fraseChiave: 'server.approval.callFromText', fraseParams: { nome: 'create_issue' } };
/** Every row of the card: the name inside the border and whole (it wraps, never cut), the value wide, inside the border, in view. */
const misuraRighe = (scheda) => scheda.evaluate((card) => {
  const c = card.getBoundingClientRect();
  return [...card.querySelectorAll('.talos-kv')].map((riga) => {
    const k = riga.querySelector('.talos-kv__k'); const v = riga.querySelector('.talos-kv__v');
    v.scrollIntoView({ block: 'nearest' });
    const rk = k.getBoundingClientRect(); const rv = v.getBoundingClientRect(); const rr = riga.getBoundingClientRect();
    const dopo = riga.nextElementSibling?.classList.contains('talos-kv') ? riga.nextElementSibling.getBoundingClientRect() : null;
    const lista = riga.closest('.talos-approval__gruppo, [data-argomenti-dal-testo]')?.getBoundingClientRect() ?? c;
    const riga1 = parseFloat(getComputedStyle(k).lineHeight) || parseFloat(getComputedStyle(k).fontSize) * 1.5;
    return {
      nome: k.textContent.length, nomeDentro: rk.left >= c.left - 0.5 && rk.right <= c.right + 0.5, nomeIntero: k.scrollWidth <= k.clientWidth + 1,
      nomeACapo: rk.height > riga1 * 1.5,
      /* the photo of 13/11 (a call written as text, 150%): the list squeezed the row and the wrapped name ran over the next one */
      nomeNellaRiga: rk.bottom <= rr.bottom + 0.5 && rv.bottom <= rr.bottom + 0.5 && (!dopo || rr.bottom <= dopo.top + 0.5),
      valoreLargo: Math.round(rv.width), valoreDentro: rv.left >= c.left - 0.5 && rv.right <= c.right + 0.5,
      valoreInVista: rv.top >= lista.top - 0.5 && rv.top + 8 <= lista.bottom, valoreIntero: v.scrollWidth <= v.clientWidth + 1,
    };
  });
});
/** WCAG 2.x relative luminance and contrast of two [r, g, b] pixels. */
const luminanza = ([r, g, b]) => [r, g, b].map((x) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
  .reduce((acc, x, i) => acc + x * [0.2126, 0.7152, 0.0722][i], 0);
const contrasto = (a, b) => { const [l1, l2] = [luminanza(a), luminanza(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };

for (const modo of ['light', 'dark']) {
  test.describe(`Long tasks A and B, the card of several calls · ${modo}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });

    async function prepara(page, lingua = 'it') {
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
      await page.evaluate(({ id, confine, titolo }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', titolo, 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
        r.handleRealEvent(confine, r.realSessionState.generation);
      }, { id: SESSIONE, confine: CONFINE, titolo: lingua === 'en' ? 'Triage of the week' : 'Smistamento della settimana' });
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
      await page.waitForFunction(() => document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).every((a) => a.playState !== 'running'), null, { timeout: 5_000 });
      await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot({ animations: 'disabled' }));
    }

    test('AB-UI-01 (it): the count, three calls in view with their titles, «Mostra tutte e 8», and «Consenti tutte» that answers for all', async ({ page }) => {
      const traffico = await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'ab-req-1', azione: CON_GRUPPO, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__conteggio')).toHaveText('8 chiamate in questa risposta');
      const voci = carta(page).locator('.talos-approval__chiamata');
      await expect(voci).toHaveCount(8);
      await expect(carta(page).locator('.talos-approval__chiamata:visible')).toHaveCount(3);
      await expect(voci.nth(0)).toContainText('Login fails on Safari');
      /* the reviewer's ROSSO (13/11): a number for each call, and «labels» (no translation) shown as data, never a fixed English word */
      await expect(voci.nth(0).locator('.talos-approval__chiamata-numero')).toHaveText('Chiamata 1 di 8');
      await expect(voci.nth(2).locator('.talos-approval__chiamata-numero')).toHaveText('Chiamata 3 di 8');
      const etichetta = voci.nth(0).locator('.talos-kv__k--dato');
      await expect(etichetta).toHaveText('labels');
      await expect(etichetta).toHaveAttribute('translate', 'no');
      /* the second reviewer (13/11 19:08): the name «as data» is set in the mono face on purpose, and so is the value of every house row
         (`.talos-kv__v`): a different FONT was the wrong check. What tells them apart on the card is the tone and the weight of today's
         rows: the name muted and lighter, the value in the text colour and heavier. */
      const stile = (n) => n.evaluate((x) => { const s = getComputedStyle(x); return { colore: s.color, peso: Number(s.fontWeight), font: s.fontFamily }; });
      const [nome, valore] = [await stile(etichetta), await stile(voci.nth(0).locator('.talos-kv__v').first())];
      expect(nome.font, 'the raw name is shown as data').toMatch(/mono/iu);
      expect(nome.colore, JSON.stringify({ nome, valore })).not.toBe(valore.colore);
      expect(valore.peso, JSON.stringify({ nome, valore })).toBeGreaterThan(nome.peso);
      await expect(carta(page).locator('.talos-approval__campi-in-piu')).toHaveCount(0);
      await expect(carta(page).locator('.talos-approval__foot-note')).toHaveText('Tutte e 8: solo queste chiamate. Per questo strumento: tutta la sessione');
      const tutto = carta(page).getByRole('button', { name: 'Mostra tutte e 8' });
      await expect(tutto).toHaveAttribute('aria-expanded', 'false');
      await foto(page, `carte-ab-gruppo-it-${modo}.png`);
      await tutto.click();
      await expect(carta(page).locator('.talos-approval__chiamata:visible')).toHaveCount(8);
      await expect(voci.nth(7)).toContainText('Typo in the welcome screen');
      await carta(page).getByRole('button', { name: 'Consenti tutte e 8' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toMatchObject({ requestId: 'ab-req-1', approvato: true, ambito: 'risposta' });
      expect(traffico.scritture.filter((s) => !s.endsWith('/approve'))).toEqual([]);
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'ab-req-1', approvato: true, ambito: 'risposta', _sequenza: 3 }]);
      await expect(carta(page)).toContainText('Consentito per tutte le chiamate di questa carta');
    });

    test('AB-UI-02 (en): the same card in English, the list open', async ({ page }) => {
      const traffico = await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'ab-req-2', azione: CON_GRUPPO, _sequenza: 2 }]);
      await expect(carta(page).locator('.talos-approval__conteggio')).toHaveText('8 calls in this reply');
      await expect(carta(page).getByRole('list', { name: 'The 8 calls this answer covers' })).toHaveCount(1);
      await carta(page).getByRole('button', { name: 'Show all 8' }).click();
      await expect(carta(page).getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
      await expect(carta(page).locator('.talos-approval__chiamata-numero').nth(7)).toHaveText('Call 8 of 8');
      await expect(carta(page).getByRole('button', { name: 'Allow all 8' })).toHaveCount(1);
      await foto(page, `carte-ab-gruppo-aperto-en-${modo}.png`);
      await carta(page).getByRole('button', { name: 'Deny all 8' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toMatchObject({ requestId: 'ab-req-2', approvato: false, ambito: 'risposta' });
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'ab-req-2', approvato: false, ambito: 'risposta', _sequenza: 3 }]);
      await expect(carta(page)).toContainText('You said no to every call on this card');
    });

    for (const [lingua, voce, esito] of [
      ['it', 'No a questo strumento fino al tuo prossimo messaggio', 'Hai detto di no a questo strumento fino al tuo prossimo messaggio'],
      ['en', 'No to this tool until your next message', 'You said no to this tool until your next message'],
    ]) test(`AB-UI-03 (${lingua}): «⋯» opens the menu with B; B sends a no for the tool, never a yes`, async ({ page }) => {
      const traffico = await prepara(page, lingua);
      await manda(page, [{ type: 'ApprovalRequested', requestId: `ab-req-3${lingua}`, azione: MCP, _sequenza: 2 }]);
      await expect(carta(page).locator('.talos-approval__conteggio')).toHaveCount(0);
      const piu = carta(page).locator('.talos-approval__piu');
      await expect(piu).toHaveAttribute('aria-haspopup', 'menu');
      await piu.click();
      const menu = page.locator('#menuCartaPermesso');
      await expect(menu).toBeVisible();
      await expect(piu).toHaveAttribute('aria-expanded', 'true');
      await expect(menu.getByRole('menuitem')).toHaveCount(1);
      /* the sentence stays inside the box (in Italian it ran past the right edge, photo of 13/11) */
      const esce = await menu.evaluate((m) => [...m.querySelectorAll('[role=menuitem]')].some((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > m.getBoundingClientRect().right + 0.5));
      expect(esce).toBe(false);
      await foto(page, `carte-ab-menu-b-${lingua}-${modo}.png`);
      await menu.getByRole('menuitem', { name: voce }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toMatchObject({ requestId: `ab-req-3${lingua}`, approvato: false, ambito: 'strumento' });
      await manda(page, [{ type: 'ApprovalResolved', requestId: `ab-req-3${lingua}`, approvato: false, ambito: 'strumento', _sequenza: 3 }]);
      await expect(carta(page)).toContainText(esito);
      await foto(page, `carte-ab-esito-b-${lingua}-${modo}.png`);
    });

    test('AB-UI-04: a right click on a pending card opens the same menu; Esc closes it and nothing is sent', async ({ page }) => {
      const traffico = await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'ab-req-4', azione: CON_GRUPPO, _sequenza: 2 }]);
      await carta(page).click({ button: 'right', position: { x: 40, y: 20 } });
      const menu = page.locator('#menuCartaPermesso');
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'No to this tool until your next message' })).toHaveCount(1);
      const attivo = await page.evaluate(() => `${document.activeElement?.tagName}/${document.activeElement?.getAttribute('role')}/${document.activeElement?.closest('#menuCartaPermesso') ? 'nel-menu' : 'fuori'}`);
      await page.keyboard.press('Escape');
      await expect(menu, `focus before Esc: ${attivo}`).toBeHidden();
      /* Esc closes the menu only: with a run going it never also opens the «stop the run?» veil behind it */
      await expect(page.locator('.overlay-layer:not([hidden])')).toHaveCount(0);
      await expect(carta(page).locator('.talos-approval__piu')).toBeFocused();
      expect(traffico.approve).toEqual([]);
    });

    test('AB-UI-05 (the reverse): a card that is not of an outside tool has no group, no count and no «⋯»', async ({ page }) => {
      await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'ab-req-5', azione: { tipo: 'shell', toolCallId: 'call_s_1', comando: 'npm test', gruppo: GRUPPO }, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__conteggio')).toHaveCount(0);
      await expect(carta(page).locator('.talos-approval__gruppo')).toHaveCount(0);
      await expect(carta(page).locator('.talos-approval__piu')).toHaveCount(0);
    });

    for (const [scala, vista] of [['100', { width: 1920, height: 1080 }], ['150', { width: 1280, height: 720 }]]) {
      test.describe(`a field name of 289 characters · ${scala}%`, () => {
        test.use({ viewport: vista, deviceScaleFactor: scala === '150' ? 1.5 : 1 });
        for (const lingua of ['it', 'en']) {
          for (const [forma, azione] of [['group', CON_NOME_LUNGO], ['one call written as text', DAL_TESTO_NOME_LUNGO]]) {
            test(`AB-UI-06 (${lingua}, ${scala}%, ${forma}): the long name wraps inside the card and the value «DELETE EVERYTHING» stays in view`, async ({ page }) => {
              const traffico = await prepara(page, lingua);
              await manda(page, [{ type: 'ApprovalRequested', requestId: 'ab-req-6', azione, _sequenza: 2 }]);
              await expect(carta(page)).toHaveCount(1);
              const righe = await misuraRighe(carta(page));
              const lunga = righe.find((r) => r.nome === NOME_LUNGO.length);
              expect(lunga, JSON.stringify(righe)).toBeTruthy();
              expect(lunga.nomeACapo, JSON.stringify(lunga)).toBe(true);
              for (const r of righe) {
                expect(r, JSON.stringify(r)).toMatchObject({ nomeDentro: true, nomeIntero: true, nomeNellaRiga: true, valoreDentro: true, valoreInVista: true, valoreIntero: true });
                expect(r.valoreLargo, JSON.stringify(r)).toBeGreaterThan(20);
              }
              await expect(carta(page).getByText('DELETE EVERYTHING', { exact: true })).toBeVisible();
              const nomeFoto = forma === 'group' ? 'gruppo' : 'dal-testo';
              await carta(page).getByText('DELETE EVERYTHING', { exact: true }).scrollIntoViewIfNeeded();
              await foto(page, `carte-ab-nome-lungo-${nomeFoto}-${lingua}-${modo}-${scala}.png`);
              expect(traffico.scritture).toEqual([]);
            });
          }
        }
      });
    }

    /* the second reviewer's yellow (13/11/2026): the list scrolls inside the card with no bar you can see (the bar is put back for this
       whole file, at the top) */
    test.describe('the scroll bar of the list', () => {
      test('AB-UI-07: with all 8 calls open the list scrolls, and its bar is drawn with a contrast of at least 3:1 (WCAG 1.4.11)', async ({ page }) => {
        await prepara(page, 'it');
        await manda(page, [{ type: 'ApprovalRequested', requestId: 'ab-req-7', azione: CON_GRUPPO, _sequenza: 2 }]);
        await carta(page).getByRole('button', { name: 'Mostra tutte e 8' }).click();
        await barraVisibile(carta(page).locator('.talos-approval__gruppo'));
        await foto(page, `carte-ab-barra-${modo}.png`);
      });
      test('AB-UI-07b: the list of a call written as text with a long name scrolls too, and its bar has the same contrast', async ({ page }) => {
        await prepara(page, 'en');
        await manda(page, [{ type: 'ApprovalRequested', requestId: 'ab-req-7b', azione: DAL_TESTO_NOME_LUNGO, _sequenza: 2 }]);
        await barraVisibile(carta(page).locator('[data-argomenti-dal-testo]'));
      });
      async function barraVisibile(lista) {
        const m = await lista.evaluate((n) => ({ scorre: n.scrollHeight > n.clientHeight + 1, barra: n.offsetWidth - n.clientWidth - parseFloat(getComputedStyle(n).borderLeftWidth) - parseFloat(getComputedStyle(n).borderRightWidth) }));
        expect(m.scorre, JSON.stringify(m)).toBe(true);
        expect(m.barra, JSON.stringify(m)).toBeGreaterThanOrEqual(6);
        await lista.evaluate((n) => { n.scrollTop = 0; });
        /* the strip of the bar against the card behind it: the left padding of the list, on the same row, is the card */
        const img = PNG.sync.read(await lista.screenshot({ animations: 'disabled' }));
        const scala = img.width / (await lista.evaluate((n) => n.offsetWidth));
        const striscia = Math.ceil(m.barra * scala);
        const px = (x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
        let migliore = 0; let pixel = 0;
        for (let y = 0; y < img.height; y += 1) {
          const fondo = px(Math.round(3 * scala), y);
          for (let x = img.width - striscia; x < img.width; x += 1) {
            const c = contrasto(px(x, y), fondo);
            if (c > 1.05) { pixel += 1; migliore = Math.max(migliore, c); }
          }
        }
        expect(pixel, `the thumb is drawn (${JSON.stringify(m)})`).toBeGreaterThan(20);
        expect(migliore, `best contrast of the thumb on its card: ${migliore.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    });
  });
}
