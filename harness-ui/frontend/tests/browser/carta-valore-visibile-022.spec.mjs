import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * Twin repair for 0.2.2 (judge v1807, owner 14/11 08:41): on the SINGLE card of a call written as text, a field name of 289 characters
 * was 1991 px wide and left its value 0 px wide (measured on 0.2.1 `5e9fdc1b9` and on P018 `f2612bf54`, it/en, light/dark, 100%/150%).
 * The name must wrap (even with no spaces) inside the border of the card, and the value must always be visible: wider than 20 px, inside
 * the border of the card and inside the visible part of the list of arguments, which scrolls (max-height). The wrapped name must stay
 * inside its own row (it must not run over the next one).
 * ⛔ Fake event copied from the server (`talosHarness.mjs`, `verificaChiamataDalTesto`: `tipo: 'chiamata-dal-testo'`, English sentence of
 *   `server.approval.callFromText`). The test server of `playwright.config.mjs`, never the 4174; every write is stopped.
 * 150% = viewport 1280×720 at device scale 1.5, so every photo is 1920×1080 like the 100% ones.
 * Round 3, after the checker's RED (judge v1856): at 150-200% the row of the long name was 175-194 px high out of 195 visible, so the
 * second argument was under the border, and a fixed width of the name (600 px, 300 px) or a 70% limit passed. Now: 200% too (960×540 at
 * scale 2); EVERY argument starts inside the visible part of the list without scrolling; the long name takes the whole width of its row
 * (it does not leave its value 12em) and its value goes under it; a short name stays beside its value.
 */
const CARTELLA_FOTO = process.env.CARTA_VALORE_FOTO
  ? path.resolve(process.env.CARTA_VALORE_FOTO)
  : path.resolve(fileURLToPath(new URL('../../artifacts/carta-valore-visibile-022/', import.meta.url)));
const SESSIONE = 'carta-valore';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const NOME_LUNGO = `note_${'x'.repeat(280)}_END`; // 289 characters, no space to wrap on
const VALORE_300 = `${'a'.repeat(283)} DELETE EVERYTHING`.slice(0, 300);
const DAL_TESTO = {
  tipo: 'chiamata-dal-testo', toolCallId: 'daTesto-0123456789ab-1', nome: 'create_issue', semprePersona: true,
  argomenti: { [NOME_LUNGO]: 'DELETE EVERYTHING', title: VALORE_300 },
  frase: 'The model wrote this tool call as text instead of calling the tool (create_issue). TALOS rebuilt it: run it?',
  fraseChiave: 'server.approval.callFromText', fraseParams: { nome: 'create_issue' },
};

for (const [scala, viewport, dsf] of [['100', { width: 1920, height: 1080 }, 1], ['150', { width: 1280, height: 720 }, 1.5], ['200', { width: 960, height: 540 }, 2]]) {
  for (const modo of ['light', 'dark']) {
    test.describe(`Twin 0.2.2: the value stays visible on the card of a call written as text · ${modo} · ${scala}%`, () => {
      test.use({ colorScheme: modo, viewport, deviceScaleFactor: dsf, reducedMotion: 'reduce' });

      async function prepara(page, lingua) {
        const scritture = [];
        await page.addInitScript(({ colorMode, uiLanguage }) => {
          localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
        }, { colorMode: modo, uiLanguage: lingua });
        await page.route('**/api/**', (rotta) => {
          if (rotta.request().method() === 'GET') return rotta.fallback();
          scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
          return rotta.abort();
        });
        await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* open and silent */ });
        await page.goto('/');
        await page.waitForFunction(() => window.__talosHarnessUiRuntime);
        await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
        await page.evaluate(({ id, confine, titolo }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', titolo, 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
          r.handleRealEvent(confine, r.realSessionState.generation);
        }, { id: SESSIONE, confine: CONFINE, titolo: lingua === 'en' ? 'Issues of the week' : 'Issue della settimana' });
        await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
        await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
        return scritture;
      }
      const manda = (page, eventi) => page.evaluate((lista) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
      }, eventi);
      const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
      const misura = (page) => carta(page).evaluate((card) => {
        const c = card.getBoundingClientRect();
        const elenco = card.querySelector('[data-argomenti-dal-testo]');
        const e = elenco.getBoundingClientRect();
        const righe = [...elenco.querySelectorAll(':scope > .talos-kv')];
        return righe.map((riga, i) => {
          const k = riga.querySelector('.talos-kv__k'); const v = riga.querySelector('.talos-kv__v');
          const rr = riga.getBoundingClientRect(); const rk = k.getBoundingClientRect(); const rv = v.getBoundingClientRect();
          const dopo = righe[i + 1]?.getBoundingClientRect() ?? null;
          return {
            nome: k.textContent.length, nomeLargo: Math.round(rk.width), nomeDentro: rk.left >= c.left - 0.5 && rk.right <= c.right + 0.5,
            nomeNellaRiga: rk.bottom <= rr.bottom + 0.5 && (!dopo || rk.bottom <= dopo.top + 0.5),
            /* the whole name is shown, wrapped: never cut by its own box (an ellipsis or a clipped word would hide the end of it) */
            nomeIntero: k.scrollWidth <= k.clientWidth + 1 && k.scrollHeight <= k.clientHeight + 1,
            valoreLargo: Math.round(rv.width), valoreAlto: Math.round(rv.height),
            valoreDentro: rv.left >= c.left - 0.5 && rv.right <= c.right + 0.5,
            valoreSiVede: rv.width > 20 && rv.height > 0 && rv.top >= e.top - 0.5 && rv.top + 8 <= e.bottom,
            /* round 3: the share of the row the name takes, and whether the value sits beside the name (same top) or under it */
            nomeQuota: Math.round((100 * rk.width) / rr.width), valoreAccanto: Math.abs(rv.top - rk.top) <= 4, valoreSotto: rv.top >= rk.bottom - 0.5,
            /* each row keeps its whole height (the list scrolls, never the row): its value ends inside it and above the next row */
            valoreNellaRiga: rv.bottom <= rr.bottom + 0.5 && (!dopo || rv.bottom <= dopo.top + 0.5),
            valore: v.textContent.slice(0, 24),
          };
        });
      });

      for (const lingua of ['it', 'en']) {
        test(`CARTA-VALORE-01 (${lingua}): a field name of 289 characters wraps inside the card and its value stays visible`, async ({ page }) => {
          const scritture = await prepara(page, lingua);
          await manda(page, [{ type: 'ApprovalRequested', requestId: 'cv-req-1', azione: DAL_TESTO, _sequenza: 2 }]);
          await expect(carta(page)).toHaveCount(1);
          await expect(carta(page).locator('[data-argomenti-dal-testo] .talos-kv')).toHaveCount(2);
          const righe = await misura(page);
          console.log(`CARTA-VALORE ${lingua} ${modo} ${scala}: ${JSON.stringify(righe)}`);
          await mkdir(CARTELLA_FOTO, { recursive: true });
          await carta(page).scrollIntoViewIfNeeded();
          await writeFile(path.join(CARTELLA_FOTO, `carta-valore-${lingua}-${modo}-${scala}.png`), await page.screenshot({ animations: 'disabled' }));
          const [lunga, corta] = righe;
          expect(lunga.nome).toBe(289);
          expect(lunga.valore).toBe('DELETE EVERYTHING');
          expect(lunga.nomeDentro, 'the long name stays inside the border of the card').toBe(true);
          expect(lunga.nomeNellaRiga, 'the wrapped name stays inside its own row').toBe(true);
          expect(lunga.nomeIntero, 'the long name wraps and is shown whole, never cut').toBe(true);
          expect(lunga.valoreLargo, 'the value next to the long name is not squeezed to nothing').toBeGreaterThan(100);
          expect(lunga.valoreDentro, 'the value stays inside the border of the card').toBe(true);
          expect(lunga.valoreSiVede, 'the value is in the visible part of the list').toBe(true);
          /* the short row is untouched: its name on one line, its long value still wraps inside the card */
          expect(corta.nomeDentro).toBe(true);
          expect(corta.valoreDentro).toBe(true);
          expect(corta.valoreLargo).toBeGreaterThan(100);
          /* round 3 (judge v1856, points 2 and 3): every argument starts in the visible part of the list without scrolling, at every zoom */
          expect(corta.valoreSiVede, 'the second argument is visible without scrolling').toBe(true);
          expect(lunga.nomeQuota, 'the long name takes the whole width of its row').toBeGreaterThanOrEqual(95);
          expect(lunga.valoreSotto, 'the value of the long name goes under it, never squeezed beside it').toBe(true);
          expect(corta.valoreAccanto, 'a short name stays beside its value').toBe(true);
          expect(corta.nomeQuota, 'a short name takes only what it needs').toBeLessThan(50);
          expect(lunga.valoreNellaRiga, 'the row of the long name keeps its height: its value never runs onto the next row').toBe(true);
          expect(corta.valoreNellaRiga, 'the last row keeps its height too').toBe(true);
          expect(scritture).toEqual([]);
        });
      }
    });
  }
}
