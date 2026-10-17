/*
 * L3-10 — owner 13/10/2026 sera (D7, punto 7): «la pillola del modello per un fornitore DIRETTO dice anche da dove arriva»,
 * es. «Gemini · gemini-3.8-flash». La cura è `nomePillolaModello` in `src/legacy/app.js`. Qui la pillola si legge per tutti i
 * casi che la regola distingue, e nei due versi: chi deve dire l'origine la dice, chi non deve resta com'era.
 * Solo GET verso il server di prova: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

const pillola = (page) => page.locator('#schermoChat [data-open-sheet="model"] .talos-chip__label');

async function apri(page, modello, nome) {
  await page.evaluate(({ modello, nome }) => window.__talosHarnessUiRuntime.passaASessione(`pillola-${nome}`, 'workspace', nome, modello, { conclusa: true, modello }), { modello, nome });
  await attendiFineStoria(page);
}

test.beforeEach(async ({ page }) => {
  const scritture = [];
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return route.fallback();
    scritture.push(`${metodo} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  await page.route('**/api/v1/sessions/pillola-*/events*', flussoConConfine);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
});

const CASI = [
  // [id del modello, pillola attesa in italiano, perché]
  ['gemini:gemini-3.8-flash', 'Gemini · gemini-3.8-flash', 'diretto: l’origine davanti'],
  ['zai:glm-5.3-flash', 'Z.AI · glm-5.3-flash', 'diretto, nome con un punto'],
  ['anthropic:claude-sonnet-5', 'Anthropic · claude-sonnet-5', 'diretto'],
  ['openai:gpt-5.5-mini', 'OpenAI · gpt-5.5-mini', 'diretto'],
  ['google/gemini-3.8-flash', 'gemini-3.8-flash', 'OpenRouter, la strada di serie: niente origine'],
  ['z-ai/glm-5.3-flash', 'glm-5.3-flash', 'OpenRouter con la grafia di un diretto: niente origine'],
  ['meta-llama/llama-4:free', 'llama-4:free', 'OpenRouter coi due punti DOPO la barra: non è un prefisso'],
  ['openrouter:z-ai/glm-5.3-flash', 'glm-5.3-flash', 'OpenRouter col suo prefisso esplicito (config.mjs:189): niente origine'],
  ['chatgpt:gpt-5.5', 'gpt-5.5', 'piano ChatGPT: l’origine la dice già la sua pastiglia'],
  /* revisione del 15/10 (c3f792b1a), i due casi da giudicare, scritti per non decidere in silenzio: */
  ['ollama:qwen3:8b', 'qwen3:8b', 'Ollama non è fra i diretti: gira su questo computer, come i locali'],
  ['lmstudio:qwen/qwen3-4b', 'LM Studio · qwen3-4b', 'LM Studio sta fra i diretti (ha la sua scheda nel selettore): dice da dove arriva'],
  ['ollama-cloud:gpt-oss:120b', 'Ollama Cloud · gpt-oss:120b', 'Ollama Cloud è un diretto: l’origine distingue il cloud dal motore di casa'],
  ['sconosciuto:modello-x', 'modello-x', 'un fornitore che nessuna mappa sa nominare: mai l’id a schermo'],
];

test('PILLOLA-ORIGINE-01 — un fornitore diretto dice da dove arriva; OpenRouter, il piano e gli ignoti no', async ({ page }) => {
  let i = 0;
  for (const [modello, atteso, perche] of CASI) {
    await apri(page, modello, `caso-${i++}`);
    await expect(pillola(page), `${modello}: ${perche}`).toHaveText(atteso);
    await expect(page.locator('#schermoChat [data-open-sheet="model"]'), 'il suggerimento tiene l’id intero').toHaveAttribute('title', new RegExp(`${modello.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}$`, 'u'));
  }
});

test('PILLOLA-ORIGINE-02 — un modello locale resta col suo nome leggibile, senza «Locale ·» davanti', async ({ page }) => {
  await apri(page, 'local:bartowski_Qwen3-4B-Q4_K_M.gguf', 'locale');
  const testo = await pillola(page).textContent();
  expect(testo).not.toMatch(/^(Locale|Local|local)\s·/u);
  expect(testo).toContain('Q4_K_M');
});

test('PILLOLA-ORIGINE-03 — a 1024 px il nome lungo CON l’origine non sposta niente: stesse righe della barra che col nome corto, niente scorre in orizzontale', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  const misura = () => page.evaluate(() => {
    const barra = document.querySelector('#schermoChat .talos-composer__bar');
    const pill = barra?.querySelector('[data-open-sheet="model"]');
    const etichetta = pill?.querySelector('.talos-chip__label');
    const figli = [...(barra?.children ?? [])].filter((n) => n.offsetParent !== null).map((n) => Math.round(n.getBoundingClientRect().top));
    return { righe: new Set(figli).size, alta: Math.round(barra?.getBoundingClientRect().height ?? 0), eccedenza: document.documentElement.scrollWidth - window.innerWidth,
      troncata: etichetta ? etichetta.scrollWidth > etichetta.clientWidth : null };
  });
  await apri(page, 'google/gemini-3.8-flash', 'corta');
  const corta = await misura();
  await apri(page, 'anthropic:claude-sonnet-5-20261001-extended-thinking', 'lunga');
  const lunga = await misura();
  expect(lunga.eccedenza, 'niente scorre in orizzontale').toBeLessThanOrEqual(0);
  expect({ righe: lunga.righe, alta: lunga.alta }, JSON.stringify({ corta, lunga })).toEqual({ righe: corta.righe, alta: corta.alta });
});

/* Le foto della verifica (1920×1080, chiaro e scuro): solo quando chi lancia dà una cartella; altrimenti la prova si salta e lo dice. */
for (const tema of ['light', 'dark']) {
  test(`PILLOLA-ORIGINE-FOTO — 1920×1080, tema ${tema}`, async ({ page }) => {
    test.skip(!process.env.TALOS_REVISIONE_FOTO_DIR, 'foto solo con TALOS_REVISIONE_FOTO_DIR');
    await page.addInitScript((modo) => {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it', uiFontScale: 'default' }, chat: {}, workspaces: {} }));
    }, tema);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
    await apri(page, 'gemini:gemini-3.8-flash', `foto-${tema}`);
    await expect(pillola(page)).toHaveText('Gemini · gemini-3.8-flash');
    await page.screenshot({ path: `${process.env.TALOS_REVISIONE_FOTO_DIR}/pillola-origine-${tema}.png` });
  });
}
