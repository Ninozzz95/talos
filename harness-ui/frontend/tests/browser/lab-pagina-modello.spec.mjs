/**
 * lab-pagina-modello.spec.mjs — FASE 5, CORSIA E (19/09/2026): LA PAGINA DEL MODELLO COL DISEGNO
 * DEL MOCKUP, e le due difese che la pagina porta.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * COSA PROVA, E PERCHE' COSI'
 *
 * Il soggetto e' `src/components/scheda-modello.js`. Il disegno viene dal mockup
 * `TALOS-Calm-Lab-04.html` letto dal suo DOM VIVO il 19/09/2026 (pagina
 * `#/impostazioni/modelli/scheda/local%3Aqwen8/<card|files|compatibility>`): toolbar con
 * l'identita' e due azioni a destra, hero col glifo e il NOME UMANO, striscia a QUATTRO blocchi,
 * tre lati col loro contenuto vero.
 *
 * ⛔ PERCHE' NON SI CARICA IL PACCHETTO COSTRUITO: come per `lab-scheda-modello.spec.mjs`, la
 *   pagina servita ha `script-src 'self'` e le sorgenti si servono su un percorso finto (`/__ce/…`)
 *   da cui si fa `import()`.
 *
 * ⛔ LE DUE DIFESE CHE QUESTA PROVA MISURA COL NUMERO, NON A OCCHIO:
 *   1. **`[object Object]`** (il difetto di `scheda-modello.js:994` prima della cura del 18/09):
 *      `backend` e `build` sono FATTI TIPIZZATI (`{state, value}`), non stringhe.
 *   2. **Le immagini remote della scheda.** Il server toglie gia' dal README ogni `<img>` e ogni
 *      `![](…)` (`hf-hub-client.mjs:14-37`) e le restituisce a parte in `images[]`: il punto in cui
 *      parte una richiesta verso un terzo e' il momento in cui QUESTA pagina disegna quelle
 *      immagini. Di serie non ne disegna nessuna, e non ne disegna nessuna **senza che parta una
 *      sola richiesta**: la prova CONTRA le richieste esterne, e pretende **zero**.
 *
 * ⛔ COSA DIVENTA ROSSO (ogni riga e' una riga che si puo' togliere dal componente per vederla
 *   diventare rossa — ed e' stata provata cosi', una rottura per volta, col ripristino al byte):
 *  - si tornasse a `[h2] stato.modello?.id` (o si togliesse `nomeUmano`) ⇒ PAGINA-02 rossa: il
 *    titolo e' l'id del FILE e non il nome del modello;
 *  - si togliesse la striscia a quattro blocchi, o si cambiasse l'ordine delle sue caselle ⇒
 *    PAGINA-03 rossa;
 *  - si rimettesse `[ispezione.backend, ispezione.build].filter(Boolean).join(' · ')` ⇒ PAGINA-04
 *    rossa: `[object Object]` a schermo;
 *  - si togliesse il `filter` per indice (la deduplica) ⇒ PAGINA-04 rossa: `Sconosciuto ·
 *    Sconosciuto`, due volte la stessa parola;
 *  - si disegnasse l'`<img>` senza guardare `stato.consenso` ⇒ PAGINA-05 rossa: parte la richiesta
 *    verso `github.com` a interruttore spento;
 *  - si togliesse `referrerpolicy="no-referrer"` ⇒ PAGINA-06 rossa;
 *  - non si scrivesse la preferenza nel documento delle preferenze dell'app ⇒ PAGINA-07 rossa (il
 *    montaggio successivo richiede di nuovo il consenso);
 *  - si passassero i file del repository a `confrontaFile` come se fossero sul disco ⇒ PAGINA-08
 *    rossa: la pagina direbbe «Coincide col repository» su file che NON sono stati scaricati;
 *  - si chiamasse `/fit` (o `/local-models`) per un repository non installato ⇒ PAGINA-08 rossa:
 *    il test pretende che quelle rotte NON siano chiamate;
 *  - `immaginiDellaScheda` accettasse ogni schema ⇒ PAGINA-09 rossa (`data:` e `javascript:` a
 *    schermo).
 *
 * LIMITI DICHIARATI (misurati, non supposti):
 *  · **Il foglio del mockup non c'e' ancora.** Le classi `.model-*` del mockup non hanno regole in
 *    `src/styles/` (misurato il 19/09/2026: zero occorrenze di `.model-page`, `.model-hero`,
 *    `.model-context-strip`, `.model-glyph` nei fogli di prodotto). Questa prova verifica la
 *    STRUTTURA (classi, ordine, testi, dati) e **non le misure in pixel del mockup**: asserire
 *    `70×70` o `40px` sarebbe asserire un foglio che non esiste. Le foto di PAGINA-10 escono quindi
 *    in DUE versioni: quella di oggi (le classi di prodotto) e quella **con le regole del mockup
 *    applicate a mano** (`addStyleTag`) — la seconda e' una PREVISIONE dichiarata, non una misura
 *    del prodotto.
 *  · Le foto sono la pagina montata dentro la cornice di una schermata vera (`div.talos-page`)
 *    sulla app servita: non e' la pagina dentro Impostazioni.
 *
 * Fonti (lette il 19/09/2026): le immagini di un Markdown sono richieste di rete e non asset
 * incorporati <https://dev.to/mdfold/markdown-images-are-network-requests-not-embedded-assets-5580>;
 * schemi/host ammessi e `data:`/`src=""` con sospetto
 * <https://tanstack.com/markdown/latest/docs/core-concepts/security>; il modello delle app di posta
 * (blocco di serie + «carica adesso» + «sempre») —
 * <https://support.postbox-inc.com/hc/en-us/articles/202198030-Displaying-Remote-Image-Content> ·
 * <https://www.fastmail.help/hc/en-us/articles/1500000278102-Blocking-remote-images>;
 * `referrerpolicy` in minuscolo e non ereditato — <https://www.php.cn/faq/2971847.html>.
 * `page.route`/`route.abort`/`route.fallback` e `page.on('request')`: Playwright,
 * `docs/src/network.md` e `docs/src/mock.md` (ctx7).
 */
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const FOTO = resolve(process.cwd(), 'artifacts', 'lab-pagina-modello');

/** Le 64 cifre di un'impronta vera. */
const IMPRONTA = '3f4b1c9d2a7e5086b1d4f0a39c8e7652140ab6cd93e5f2718b0c4d6e9a2f5317';
const REVISION = '0d32489ecb9db6d2a4fc93bd27ef01519f95474d';

/** Il modello VERO del 4174, misurato il 19/09/2026: id del file, repo del modello. */
const ID_LOCALE = 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf';
const REPO = 'unsloth/GLM-4.7-Flash-GGUF';
/** Il NOME UMANO che la pagina deve mostrare: la coda del repository, non l'id del file. */
const NOME_UMANO = 'GLM-4.7-Flash-GGUF';

function manifest() {
  return {
    id: ID_LOCALE,
    repo: REPO,
    revision: REVISION,
    license: 'mit',
    path: 'C:\\modelli\\glm-4.7-flash-q4km',
    state: 'ready',
    bytes: 18312339808,
    sha256: IMPRONTA,
    files: [{ path: 'GLM-4.7-Flash-Q4_K_M.gguf', bytes: 18312339808, sha256: IMPRONTA }],
  };
}

const README = `---
license: mit
base_model: zai-org/GLM-4.7-Flash
---

# Read our How to [Run GLM-4.7-Flash Guide!](https://unsloth.ai/docs/models/glm-4.7-flash)

Questa scheda descrive il modello. Il testo qui e' quello reso, non il sorgente.

\`\`\`bash
llama-server -m GLM-4.7-Flash-Q4_K_M.gguf -c 32768
\`\`\`

## Contesto e limiti

Il modello dichiara una finestra ampia. I numeri veri stanno nella scheda «Compatibilita'».

## Jan 21 update: llama.cpp fixed a bug that caused looping and poor outputs. We updated the GGUFs
`;

/** Il README VERO del 19/09/2026: 0 `<img>`, 0 `![`, e TRE immagini in `images[]`. */
const REPO_DATI = {
  repo: REPO,
  revision: REVISION,
  gated: false,
  /*
   * ⛔ LA LICENZA MANCA DI PROPOSITO. Non è un caso di scuola: Hugging Face restituisce `null` per
   *   i repository che non la dichiarano (`hf-hub-client.mjs:83`, `license || null`), e il server
   *   del download la PRETENDA non vuota (`requireHuggingFaceDownloadBody`, `http-app.mjs:1558-1560`:
   *   senza, il negozio dei modelli rifiuta il manifesto DOPO aver accettato la richiesta e la
   *   risposta era un **500** — R-08, giro da utente nuovo del 13/09). Con la licenza valorizzata
   *   questa difesa non si proverebbe: il ripiego non scatterebbe mai.
   */
  license: null,
  readme: README,
  images: [
    { alt: '', url: 'https://github.com/unslothai/unsloth/raw/main/images/unsloth%20new%20logo.png' },
    { alt: '', url: 'https://github.com/unslothai/unsloth/raw/main/images/Discord%20button.png' },
    { alt: '', url: 'https://raw.githubusercontent.com/unslothai/unsloth/refs/heads/main/images/documentation%20green%20button.png' },
  ],
  files: [
    { path: 'GLM-4.7-Flash-Q4_K_M.gguf', sizeBytes: 18312339808, sha256: IMPRONTA },
    { path: 'GLM-4.7-Flash-Q8_0.gguf', sizeBytes: 32000000000, sha256: 'aa11bb22cc33dd44ee55ff6600778899aabbccddeeff00112233445566778899' },
  ],
  downloads: 15234,
  likes: 87,
  pipelineTag: 'text-generation',
};

/** Il verdetto del 4174, con `backend` e `build` IGNOTI: e' la forma che stampava `[object Object]`. */
function fit({ backend = { state: 'unknown', value: null }, build = { state: 'unknown', value: null } } = {}) {
  return {
    modelId: ID_LOCALE,
    profile: 'agent',
    context: { requestedTokens: 65536, availableTokens: 202752 },
    storage: { requiredBytes: 18312339808, availableBytes: 226523176960 },
    memory: { requiredBytes: 19574038880, availableBytes: 10702528512 },
    inspection: {
      modelId: ID_LOCALE,
      format: { state: 'observed', magic: 'GGUF', version: 3 },
      context: {
        trainedTokens: { state: 'declared', value: 202752 },
        runtimeTokens: { state: 'unknown', value: null },
        effectiveTokens: { state: 'declared', value: 202752 },
      },
      runtime: { reachable: false, servingThisModel: true, servingModelId: null },
      template: { state: 'unknown', value: null },
      capabilities: {
        tools: { state: 'unknown', value: null },
        toolCalls: { state: 'unknown', value: null },
        systemRole: { state: 'unknown', value: null },
      },
      backend,
      build,
      observedAt: '2026-09-19T10:18:06.164Z',
    },
    state: 'blocked',
    reason: 'memory',
  };
}

const CAPACITA = {
  schema: 'talos.model-lab.capacity/1',
  platform: 'win32',
  arch: 'x64',
  measuredAt: '2026-09-19T10:18:05.925Z',
  memory: { totalBytes: 33944801280, freeBytes: 10804187136 },
  storage: { totalBytes: 1023055753216, availableBytes: 227596869632, reserveBytes: 1073741824, allocatableBytes: 226523127808 },
  runtime: { status: 'unconfigured', reason: 'Runtime locale desktop non scelto' },
};

/**
 * La STIMA di una variante — la risposta VERA del 4174 il 19/09/2026 per i byte di
 * `GLM-4.7-Flash-Q4_K_M.gguf` (18.312.339.808): `state:'blocked', reason:'memory'`, e la base
 * dichiarata dal server è `weights-only`.
 */
const STIMA = {
  bytes: 18312339808,
  basis: 'weights-only',
  contextTokens: null,
  storage: { requiredBytes: 18312339808, availableBytes: 227872849920 },
  memory: { requiredBytes: 18312339808, availableBytes: 11611451392 },
  observedAt: '2026-09-19T11:15:04.862Z',
  state: 'blocked',
  reason: 'memory',
};

const RISPOSTE_BASE = { modelli: { dati: { items: [manifest()] } }, fit: { dati: fit() }, capacita: { dati: CAPACITA }, repo: { dati: REPO_DATI }, stima: { dati: STIMA } };

test('RIPRESA-HF-DOWNLOAD-ROUTE — il montaggio reale della app passa il download al confine HTTP', async ({ page }) => {
  const posts = [];
  const busta = data => ({ json: { ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } } });
  await page.route('**/api/v1/huggingface/repo?**', route => route.fulfill(busta(REPO_DATI)));
  await page.route('**/api/v1/model-lab/capacity**', route => route.fulfill(busta(CAPACITA)));
  await page.route('**/api/v1/local-models/fit-estimate?**', route => route.fulfill(busta(STIMA)));
  await page.route('**/api/v1/huggingface/download', async route => {
    expect(route.request().method()).toBe('POST');
    posts.push(route.request().postDataJSON());
    await route.fulfill(busta({ id: posts.at(-1).id, state: 'queued' }));
  });
  await page.goto(`/#/impostazioni/modelli/scheda/${encodeURIComponent(`hf:${REPO}@${REVISION}`)}/files`);
  await expect(page.locator('#talosAvvio')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('#paginaModello')).toBeVisible();
  const variante = page.locator('#paginaModelloFileChoices [data-variante$="Q8_0.gguf"]');
  await variante.click();
  const scarica = page.locator('#paginaModelloScarica');
  // Deve fallire se apriPaginaModello smette di passare apiPost.
  await expect(scarica).toBeEnabled();
  await scarica.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    repo: REPO, revision: REVISION, bytes: 32000000000, license: 'unknown',
    files: [{ path: 'GLM-4.7-Flash-Q8_0.gguf', bytes: 32000000000, sha256: REPO_DATI.files[1].sha256 }],
  });
  expect(posts[0].id).toBe(posts[0].path);
  await expect(page.locator('#paginaModello [data-modello-scarica-esito="avviato"]')).toContainText('Download avviato');
  await expect(page.locator('#paginaModelloFileChoices')).toHaveCount(1);
});

async function preparaRipresaHf(page, { download, appearance = {}, dallaLista = false } = {}) {
  const busta = data => ({ json: { ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } } });
  await page.route('**/api/v1/huggingface/repo?**', route => route.fulfill(busta(REPO_DATI)));
  await page.route('**/api/v1/model-lab/capacity**', route => route.fulfill(busta(CAPACITA)));
  await page.route('**/api/v1/local-models/fit-estimate?**', route => route.fulfill(busta(STIMA)));
  if (download) await page.route('**/api/v1/huggingface/download', download);
  await page.addInitScript(appearance => {
    try {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
        version: 1, appearance: { colorMode: 'dark', themePreset: 'calm', themePresetVersione: 2, ...appearance }, chat: {}, workspaces: {},
      }));
    } catch { /* Gli iframe a origine opaca non possiedono questo storage. */ }
  }, appearance);
  await page.route('**/api/v1/huggingface/search?**', route => route.fulfill(busta({ items: [REPO_DATI] })));
  await page.goto(dallaLista ? '/' : `/#/impostazioni/modelli/scheda/${encodeURIComponent(`hf:${REPO}@${REVISION}`)}/files`);
  await expect(page.locator('#talosAvvio')).toHaveCount(0, { timeout: 10_000 });
  if (dallaLista) {
    const voce = page.locator('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = await voce.evaluate(el => el.closest('.td-nav-group')?.id);
    if (gruppo) {
      const testata = page.locator(`.talos-sidebar [aria-controls="${gruppo}"]`);
      if (await testata.getAttribute('aria-expanded') === 'false') await testata.click();
    }
    await voce.click();
    await page.locator('#setting-tab-models').click();
    await page.locator('#labSchedaModels').click();
    await expect(page.locator('#modelLabHfPanel [data-hf]')).toHaveCount(1);
    return;
  }
  await expect(page.locator('#paginaModelloFileChoices [data-variante]')).toHaveCount(2);
}

for (const width of [1440, 3840]) {
  test(`RIPRESA-HF-SHELL ${width} — la pagina conserva sidebar visibile e utilizzabile`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await preparaRipresaHf(page);
    const m = await page.evaluate(() => {
      const sidebar = document.querySelector('.talos-sidebar'); const s = sidebar.getBoundingClientRect(); const p = document.querySelector('#paginaModello').getBoundingClientRect();
      return { sidebar: s.width, left: p.left, right: s.right, libera: sidebar.contains(document.elementFromPoint(s.left + 30, s.top + 35)) };
    });
    expect(m.sidebar).toBeGreaterThan(100); expect(m.left).toBeGreaterThanOrEqual(m.right - 1); expect(m.libera).toBe(true);
  });
  test(`RIPRESA-HF-README ${width} — prosa centrata con la larghezza del mockup`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await preparaRipresaHf(page);
    await page.locator('#paginaModello [role="tab"]').nth(0).click();
    const prosa = page.locator('#paginaModello .readme-body');
    await expect(prosa).toBeVisible();
    const m = await prosa.evaluate(n => { const r = n.getBoundingClientRect(), p = n.closest('.readme-surface').getBoundingClientRect(); return { width: r.width, offset: Math.abs(r.left + r.width / 2 - p.left - p.width / 2) }; });
    expect(m.width).toBeGreaterThan(850); expect(m.width).toBeLessThanOrEqual(width >= 1920 ? 1031 : 961); expect(m.offset).toBeLessThan(2);
    const layout = await page.locator('#paginaModello .model-page').evaluate(n => {
      const tab = n.querySelector('[role="tab"][aria-selected="true"]');
      const header = n.querySelector('.readme-chrome');
      return { width: n.getBoundingClientRect().width, underline: getComputedStyle(tab).borderBottomWidth,
        radius: getComputedStyle(tab).borderRadius, headerGap: header.children[1].getBoundingClientRect().left - header.children[0].getBoundingClientRect().right };
    });
    expect.soft(layout.width).toBeLessThanOrEqual(1261);
    expect.soft(layout.underline).toBe('2px');
    expect.soft(layout.radius).toBe('0px');
    expect.soft(layout.headerGap).toBeLessThanOrEqual(16);
  });
}
test('RIPRESA-LAB-SENZA-RIEPILOGHI — i quattro riepiloghi rimossi dall’owner sono assenti', async ({ page }) => {
  await preparaRipresaHf(page, { dallaLista: true });
  await expect(page.locator('#modelLabCard .model-lab-ledger')).toHaveCount(0);
  await expect(page.locator('#modelLabRuntimeBadge')).toHaveCount(0);
  await expect(page.locator('#labSchedaSystem')).toBeVisible();
});

test('RIPRESA-HF-DOWNLOAD — lista, pagina, variante e accesso alla coda reale', async ({ page }) => {
  const posts = [];
  await page.route('**/api/v1/huggingface/downloads', route => route.fulfill({ json: { ok: true,
    data: { items: posts.map(post => ({ ...post, state: 'queued', downloadedBytes: 0 })) } } }));
  await preparaRipresaHf(page, { dallaLista: true, download: async route => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, data: { id: posts.at(-1).id, state: 'queued' } } });
  } });
  await page.locator('#modelLabHfPanel [data-hf]').click();
  await expect(page.locator('#paginaModello')).toBeVisible();
  await page.locator('#paginaModello [role="tab"]').nth(1).click();
  await page.locator('#paginaModelloFileChoices [data-variante$="Q8_0.gguf"]').click();
  await page.locator('#paginaModelloScarica').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ repo: REPO, revision: REVISION, bytes: 32000000000,
    files: [{ path: REPO_DATI.files[1].path, bytes: 32000000000, sha256: REPO_DATI.files[1].sha256 }] });
  await page.getByRole('button', { name: 'Apri Download', exact: true }).click();
  await expect(page.locator('#paginaModello')).toBeHidden();
  await expect(page.locator('#modelLabDownloadsPanel')).toBeVisible();
  await expect(page.locator('#labSchedaDownloads')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#modelLabDownloadsPanel [data-download-id="${posts[0].id}"]`)).toBeVisible();
});

test('RIPRESA-HF-RIENTRO — ricarica conserva revisione, variante e ritorno alla ricerca', async ({ page }) => {
  await preparaRipresaHf(page, { dallaLista: true });
  await page.locator('#modelLabHfSearch').fill('GLM');
  await page.locator('#modelLabHfSearch').press('Enter');
  await page.locator('#modelLabHfPanel [data-hf]').click();
  await expect(page.locator('#paginaModello')).toBeVisible();
  await page.locator('#paginaModello [role="tab"]').nth(1).click();
  const q8 = page.locator('#paginaModelloFileChoices [data-variante$="Q8_0.gguf"]');
  await q8.click();
  await page.reload();
  await expect(page.locator('#talosAvvio')).toHaveCount(0);
  await expect(q8).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(new RegExp(REVISION));
  await page.locator('#paginaModello [data-modello-indietro]').click();
  await expect(page.locator('#modelLabHfPanel')).toBeVisible();
  await expect(page.locator('#modelLabHfSearch')).toHaveValue('GLM');
  await page.locator('#modelLabHfPanel [data-hf]').click();
  await page.locator('#paginaModello [role="tab"]').nth(1).click();
  await expect(q8).toHaveAttribute('aria-checked', 'true');
  expect(await page.locator('#paginaModello [id]').evaluateAll(nodes => {
    return nodes.map(n => n.id).filter(id => document.querySelectorAll(`#${CSS.escape(id)}`).length !== 1);
  })).toEqual([]);
});

test('RIPRESA-HF-HASH-INVALIDO — un collegamento malformato non interrompe la app', async ({ page }) => {
  const errori = [];
  page.on('pageerror', error => errori.push(error.message));
  await page.goto('/#/impostazioni/modelli/scheda/%E0%A4%A/files');
  await expect(page.locator('#talosAvvio')).toHaveCount(0);
  expect(errori).toEqual([]);
});

test('RIPRESA-HF-CAMBIO-RAPIDO — la risposta del repository lasciato non cambia la pagina corrente', async ({ page }) => {
  await preparaRipresaHf(page);
  let sospesa;
  await page.route('**/api/v1/huggingface/repo?**', route => {
    if (new URL(route.request().url()).searchParams.get('repo') === 'esempio/altro') { sospesa = route; return; }
    return route.fulfill({ json: { ok: true, data: REPO_DATI } });
  });
  const rotta = id => `#/impostazioni/modelli/scheda/${encodeURIComponent(id)}/files`;
  await page.evaluate(hash => { location.hash = hash; }, rotta('hf:esempio/altro@main'));
  await expect.poll(() => Boolean(sospesa)).toBe(true);
  await page.goBack();
  await expect(page.locator('#paginaModelloFileChoices [data-variante]')).toHaveCount(2);
  const vecchiaRisposta = page.waitForResponse(r => new URL(r.url()).searchParams.get('repo') === 'esempio/altro');
  await sospesa.fulfill({ json: { ok: true, data: { ...REPO_DATI, repo: 'esempio/altro', files: [] } } });
  await (await vecchiaRisposta).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('#paginaModello [data-modello-id]')).toHaveAttribute('data-modello-id', `hf:${REPO}@${REVISION}`);
  await expect(page.locator('#paginaModelloFileChoices [data-variante]')).toHaveCount(2);
});

test('RIPRESA-HF-REVISIONE — main risolta resta fissata dopo la ricarica', async ({ page }) => {
  await preparaRipresaHf(page);
  const revisioni = [];
  await page.route('**/api/v1/huggingface/repo?**', route => {
    revisioni.push(new URL(route.request().url()).searchParams.get('revision'));
    return route.fulfill({ json: { ok: true, data: REPO_DATI } });
  });
  await page.evaluate(hash => { location.hash = hash; }, `#/impostazioni/modelli/scheda/${encodeURIComponent(`hf:${REPO}@main`)}/files`);
  const q8 = page.locator('#paginaModelloFileChoices [data-variante$="Q8_0.gguf"]');
  await q8.click();
  await page.reload();
  await expect(q8).toHaveAttribute('aria-checked', 'true');
  expect(revisioni).toEqual(['main', REVISION]);
});

test('RIPRESA-HF-SCELTA-ALTERATA — un file salvato assente dal repository non diventa un download', async ({ page }) => {
  const posts = [];
  await preparaRipresaHf(page, { download: async route => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, data: { state: 'queued' } } });
  } });
  await page.evaluate(({ id, revision }) => {
    sessionStorage.setItem('talos.harness.desktop.modelli.ripresa.v1', JSON.stringify({ version: 1,
      pagine: [{ id, revision, scelta: '../../non-esiste.gguf' }] }));
  }, { id: `hf:${REPO}@${REVISION}`, revision: REVISION });
  await page.reload();
  await expect(page.locator('#talosAvvio')).toHaveCount(0);
  await page.locator('#paginaModelloScarica').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(REPO_DATI.files.map(f => f.path)).toContain(posts[0].files[0].path);
});

test('RIPRESA-HF-PIN-URL — lo storage non sostituisce la revisione esplicita nel collegamento', async ({ page }) => {
  await preparaRipresaHf(page);
  await page.evaluate(id => {
    sessionStorage.setItem('talos.harness.desktop.modelli.ripresa.v1', JSON.stringify({ version: 1,
      pagine: [{ id, revision: 'a'.repeat(40), scelta: null }] }));
  }, `hf:${REPO}@${REVISION}`);
  const revisioni = [];
  await page.route('**/api/v1/huggingface/repo?**', route => {
    revisioni.push(new URL(route.request().url()).searchParams.get('revision'));
    return route.fulfill({ json: { ok: true, data: REPO_DATI } });
  });
  await page.reload();
  await expect(page.locator('#paginaModelloFileChoices [data-variante]')).toHaveCount(2);
  expect(revisioni).toEqual([REVISION]);
});

test('RIPRESA-HF-DOPPIO — in attesa del server il download non si invia due volte', async ({ page }) => {
  const richieste = [];
  await preparaRipresaHf(page, { download: route => { richieste.push(route); } });
  const scarica = page.locator('#paginaModelloScarica');
  await scarica.click();
  await expect.poll(() => richieste.length).toBe(1);
  await expect(scarica).toBeDisabled();
  await richieste[0].fulfill({ json: { ok: true, data: { state: 'queued' } } });
  await expect(page.locator('[data-modello-scarica-esito="avviato"]')).toBeVisible();
  expect(richieste).toHaveLength(1);
});

test('RIPRESA-HF-TAB-STATO — il percorso reale conserva la variante fra schede e cronologia', async ({ page }) => {
  await preparaRipresaHf(page);
  const q8 = () => page.locator('#paginaModelloFileChoices [data-variante$="Q8_0.gguf"]');
  await q8().click();
  const tabs = page.locator('#paginaModello [role="tab"]');
  await tabs.nth(0).click();
  await expect(page).toHaveURL(/\/card$/);
  await tabs.nth(1).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(q8()).toHaveAttribute('aria-checked', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/card$/);
  await page.goForward();
  await expect(q8()).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#paginaModelloFileChoices')).toHaveCount(1);
});

for (const colorMode of ['dark', 'light']) {
  test(`RIPRESA-HF-LAYOUT — pagina reale a 1024, scala 130%, ${colorMode}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await preparaRipresaHf(page, { appearance: { colorMode, uiFontScale: 'xlarge' } });
    const pagina = page.locator('#paginaModello');
    const misure = await pagina.evaluate(el => {
      const glifo = el.querySelector('.model-glyph');
      const lista = el.querySelector('[data-hf-file-choices]');
      return { zoom: el.currentCSSZoom, width: el.clientWidth, scrollWidth: el.scrollWidth,
        glyphWidth: getComputedStyle(glifo).width, glyphHeight: getComputedStyle(glifo).height,
        listaWidth: lista.clientWidth, listaScroll: lista.scrollWidth,
        radios: [...lista.querySelectorAll('[role="radio"]')].map(n => ({ width: n.clientWidth, scroll: n.scrollWidth })) };
    });
    await info.attach('geometria', { body: JSON.stringify(misure), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('pagina.png'), fullPage: true });
    await page.locator('#paginaModelloScarica').scrollIntoViewIfNeeded();
    await expect(page.locator('#paginaModelloScarica')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('selettore.png'), fullPage: true });
    expect.soft(Number(misure.zoom)).toBeCloseTo(1.3, 2);
    expect.soft(misure.glyphWidth).toBe('70px');
    expect.soft(misure.glyphHeight).toBe('70px');
    expect.soft(misure.scrollWidth).toBeLessThanOrEqual(misure.width + 1);
    expect.soft(misure.listaScroll).toBeLessThanOrEqual(misure.listaWidth + 1);
    for (const radio of misure.radios) expect.soft(radio.scroll).toBeLessThanOrEqual(radio.width + 1);
  });
}

/** Le sorgenti servite su un percorso finto, come il cancello della corsia 4 (`/__c4/`). */
async function serviLeSorgenti(page) {
  await page.route('**/__ce/**', async (route) => {
    const resto = new URL(route.request().url()).pathname.replace(/^\/__ce\//, '');
    try {
      const corpo = await readFile(resolve(SRC, resto), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: corpo });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca src/${resto}` });
    }
  });
}

/** Un PNG vero di 1×1: la risposta del finto proxy. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/**
 * ⛔ IL CONTATORE DELLE RICHIESTE — la difesa delle immagini si prova cosi', col numero.
 *
 *   Si contano DUE cose, e sono due domande diverse:
 *   · **al proxy** (`/api/v1/huggingface/image`): quante immagini la pagina ha CHIESTO al proprio
 *     server. A interruttore spento dev'essere **zero** — e il finto proxy risponde con un PNG
 *     vero, cosi' l'immagine si disegna davvero e non resta un `<img>` rotto che falserebbe il resto.
 *   · **verso l'esterno**: quante richieste sono uscite verso un altro host. Deve essere **zero
 *     sempre**, a interruttore spento e acceso: le immagini passano dal nostro server, e la CSP del
 *     prodotto (`img-src 'self' data:`) non lascerebbe comunque partire un indirizzo esterno.
 *   I gestori si registrano DOPO quello delle sorgenti: Playwright li esegue in ordine inverso, e
 *   per le richieste locali che non ci riguardano si usa `route.fallback()` — cioe' si ripassano al
 *   gestore precedente (le sorgenti `/__ce/`) invece di mandarle in rete con `continue()`.
 *   `proxyRotto` serve al caso del proxy che RIFIUTA (l'host non e' fra quelli ammessi dal server):
 *   allora non deve restare un buco muto.
 */
async function contaLeRichieste(page, { proxyRotto = false } = {}) {
  const esterne = [];
  const proxy = [];
  await page.route('**', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (url.pathname === '/api/v1/huggingface/image') {
        proxy.push(url.searchParams.get('url') || '');
        if (proxyRotto) return route.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' });
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      }
      return route.fallback();
    }
    esterne.push(url.href);
    return route.abort();
  });
  return { esterne, proxy };
}

/** In pagina: la cornice, il banco, la lettura finta che registra i percorsi, e il port delle preferenze. */
const AIUTI = () => {
  const esito = (fn) => {
    try { const v = fn(); return { esito: 'ok', valore: v === undefined ? null : v }; }
    catch (e) { return { esito: `${e && e.name ? e.name : 'Errore'}: ${e && e.message ? e.message : String(e)}`, valore: null }; }
  };
  /*
   * ⛔ IL CONTENITORE VERO, NON UNO INVENTATO PER LA PROVA: `talos-pagina-modello` è la classe del
   *   contenitore che l'aggancio in `app.js` dà alla pagina (`#paginaModello`), e porta le due cose
   *   che il componente dichiara di non avere — il padding e lo scorrimento. Con quella, la foto è
   *   la pagina COME LA VEDE L'OWNER: stessa cornice, stesso padding, stesso `z-index` sopra l'app.
   *   Con un contenitore mio, la barra laterale dell'app restava sopra la pagina nella foto.
   */
  const tela = () => {
    let t = document.getElementById('ce-tela');
    if (!t) {
      t = document.createElement('section');
      t.id = 'ce-tela';
      t.className = 'talos-pagina-modello';
      /*
       * ⛔ LA CORNICE SI ALZA SOPRA I VELI DELL'APP, e la ragione è del BANCO, non del prodotto:
       *   questo banco ha uno store VUOTO, quindi l'app ci mette sopra il suo velo di primo avvio
       *   (`#veloAmbiente`, `z-index:100`), che nell'app dell'owner non c'è. La pagina, nel
       *   prodotto, sta a **90** e sta sotto i veli PER DISEGNO (`pagina-modello.css`: un velo che si
       *   apre dalla pagina deve restarle davanti) — quindi questo `130` è la correzione di una
       *   differenza del banco, e senza di lui la foto sarebbe la foto del velo.
       */
      t.style.zIndex = '130';
      const pagina = document.createElement('div');
      pagina.dataset.cePagina = '';
      t.append(pagina);
      document.body.append(t);
    }
    return t.querySelector('[data-ce-pagina]');
  };
  const banco = () => {
    let b = document.getElementById('ce-banco');
    if (!b) { b = document.createElement('div'); b.id = 'ce-banco'; b.hidden = true; document.body.append(b); }
    return b;
  };
  const tipo = (p) => (p === '/api/v1/local-models' ? 'modelli'
    : p.includes('/fit-estimate?') ? 'stima'
      : p.includes('/fit?') ? 'fit'
        : p.includes('/huggingface/repo') ? 'repo'
          : p.includes('/model-lab/capacity') ? 'capacita' : 'ignoto');
  const stato = { risposte: {}, chiamate: [] };
  const apiFinta = async (percorso) => {
    stato.chiamate.push({ percorso, tipo: tipo(percorso) });
    const r = stato.risposte[tipo(percorso)];
    if (!r) throw new Error(`nessuna risposta preparata per «${tipo(percorso)}»`);
    if (r.errore) throw new Error(r.errore);
    return r.dati;
  };
  /*
   * ⛔ LA SCRITTURA FINTA: registra percorso E CORPO, e non parte nessuna richiesta. Serve al
   *   download, che e' l'unica scrittura di questa pagina (`apiPost`, facoltativo).
   */
  const scritture = [];
  const apiPostFinta = async (percorso, corpo) => {
    scritture.push({ percorso, corpo });
    if (stato.risposte.download?.errore) throw new Error(stato.risposte.download.errore);
    return stato.risposte.download?.dati ?? { id: corpo?.id ?? '', state: 'queued' };
  };
  /** Il port delle preferenze: un archivio in memoria, cosi' la prova vede cosa viene scritto. */
  const archivio = { scritto: null, valore: false };
  const preferenzeFinta = {
    leggi() { return archivio.valore === true; },
    scrivi(v) { archivio.scritto = v === true; archivio.valore = v === true; return true; },
  };
  window.__ce = {
    esito, tela, banco, stato, apiFinta, apiPostFinta, scritture, preferenzeFinta, archivio, moduli: {}, montaggi: [],
    /** Le scritture avvenute: percorso e corpo, per la prova del download. */
    scrittureDi(p) { return scritture.filter((s) => s.percorso.includes(p)); },
    prepara(risposte) { Object.assign(stato.risposte, risposte); },
    azzera() { stato.chiamate.length = 0; },
    chiamateDi(t) { return stato.chiamate.filter((c) => c.tipo === t).map((c) => c.percorso); },
    monta(opzioni = {}) {
      const m = esito(() => window.__ce.moduli['scheda-modello'].montaSchedaModello(
        (() => { const c = document.createElement('div'); tela().append(c); return c; })(),
        { apiGet: apiFinta, apiPost: apiPostFinta, preferenze: preferenzeFinta, ...opzioni },
      ));
      if (m.valore) window.__ce.montaggi.push(m.valore);
      return m;
    },
    montaNelBanco(opzioni = {}) {
      const m = esito(() => window.__ce.moduli['scheda-modello'].montaSchedaModello(
        (() => { const c = document.createElement('div'); banco().append(c); return c; })(),
        { apiGet: apiFinta, apiPost: apiPostFinta, preferenze: preferenzeFinta, ...opzioni },
      ));
      if (m.valore) window.__ce.montaggi.push(m.valore);
      return m;
    },
  };
};

async function apriIlBanco(page) {
  await serviLeSorgenti(page);
  await page.addInitScript(AIUTI);
  await page.goto('/');
  /*
   * ⛔ IL VELO D'AVVIO SI ASPETTA CHE SIA VIA: una foto scattata col velo a schermo e' una foto di
   *   niente (e' successo alla corsia 4, ed e' scritto nella sua testata). Si aspetta che NON ci
   *   sia, cosi' la guardia e' vera per costruzione.
   */
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 9000 });
  await page.evaluate(async () => { window.__ce.moduli['scheda-modello'] = await import('/__ce/components/scheda-modello.js'); });
}

async function risposte(page, quante) {
  await page.waitForFunction((n) => window.__ce.stato.chiamate.length >= n, quante, { timeout: 10000 });
  await page.waitForTimeout(120);
}

/* ═════════════════════════════ i casi ═════════════════════════════ */

test('PAGINA-01 — la toolbar del mockup: indietro, l\'identita\' col nome, due azioni a destra', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf', modello: null, indietro: () => {} }); }, RISPOSTE_BASE);
  await risposte(page, 3);

  const letto = await page.evaluate(() => {
    const r = document.querySelector('#ce-tela [data-scheda-modello]');
    const t = r.querySelector('.model-page-toolbar');
    const identita = t.querySelector('[data-modello-identita]');
    const azioni = t.querySelector('[data-modello-azioni]');
    return {
      classi: t.className,
      indietro: t.querySelector('[data-modello-indietro]')?.textContent ?? null,
      nome: identita?.firstChild?.nodeValue ?? null,
      origine: identita?.querySelector('span')?.textContent ?? null,
      unicoNome: r.querySelectorAll('[data-modello-identita]').length,
      azioni: [...azioni.querySelectorAll('a,button')].map((b) => b.textContent.trim()),
      ordine: [...t.children].map((c) => c.dataset.modelloAzioni !== undefined ? 'azioni' : (c.dataset.modelloIndietro !== undefined ? 'indietro' : c.dataset.modelloIdentita !== undefined ? 'identita' : c.className)),
    };
  });
  expect(letto.classi, 'la classe del mockup c\'e\'').toContain('model-page-toolbar');
  expect(letto.indietro, 'il ritorno all\'elenco').toContain('Tutti i modelli');
  // ⛔ IL NOME UMANO, NON L'ID: l'id vero e' quello del FILE e finisce con `-Q4-K-M-gguf`.
  expect(letto.nome, 'il nome nella toolbar e\' il nome del modello, non l\'id del file').toBe('GLM-4.7-Flash-GGUF');
  expect(letto.nome).not.toContain('Q4-K-M');
  expect(letto.origine, 'da dove viene il modello').toBe('Locale');
  expect(letto.unicoNome, 'l\'identita\' sta nella toolbar, una volta sola').toBe(1);
  expect(letto.azioni.join(' ')).toContain('Apri su Hugging Face');
  expect(letto.azioni).toHaveLength(2);
  const posizioni = ['indietro', 'identita', 'azioni'].map((k) => letto.ordine.indexOf(k));
  expect(posizioni[0], 'l\'indietro e\' il primo').toBe(0);
  expect(posizioni[2], 'le azioni sono per ultime, cioe\' a destra').toBe(letto.ordine.length - 1);
});

test('PAGINA-02 — l\'hero: glifo, soprattitolo, il NOME UMANO, la riga del repository, la frase', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const letto = await page.evaluate(() => {
    const r = document.querySelector('#ce-tela [data-scheda-modello]');
    const h = r.querySelector('[data-modello-testata]');
    return {
      classi: h.className,
      glifo: h.querySelector('.model-glyph') ? { classi: h.querySelector('.model-glyph').className, icone: h.querySelectorAll('.model-glyph svg').length } : null,
      occhiello: h.querySelector('.eyebrow')?.textContent ?? null,
      titolo: h.querySelector('h1')?.textContent ?? null,
      titoloTag: h.querySelector('[data-modello-nome]')?.tagName ?? null,
      repo: h.querySelector('[data-modello-repo]')?.textContent ?? null,
      didascalia: h.querySelector('.model-hero-caption')?.textContent ?? null,
    };
  });
  expect(letto.classi, 'la classe del mockup').toBe('model-hero');
  expect(letto.glifo, 'il riquadro del glifo').toBeTruthy();
  expect(letto.glifo.icone, 'col suo glifo dentro').toBe(1);
  expect(letto.occhiello?.toLowerCase(), 'il soprattitolo e\' quello del mockup').toBe('nel tuo laboratorio');
  expect(letto.titoloTag, 'e\' un titolo di primo livello, non un h2 dentro la pagina').toBe('H1');
  // ⛔ IL DIFETTO CHE QUESTA PROVA CHIUDE, in una riga: il titolo era `local:Qwen3-8B-GGUF-…`.
  expect(letto.titolo, 'il titolo e\' il NOME UMANO').toBe(NOME_UMANO);
  expect(letto.titolo, '⛔ mai l\'id grezzo').not.toBe(ID_LOCALE);
  expect(letto.titolo).not.toContain('-Q4-K-M-gguf');
  expect(letto.repo, 'la riga del repository').toContain(REPO);
  expect(letto.repo, 'con la revisione accorciata').toContain('revisione 0d32489ecb9d');
  expect(letto.repo).toContain('15.234 download');
  expect(letto.didascalia, 'la frase del mockup, parola per parola').toBe('Conosci il modello. Scegli come usarlo.');
});

test('PAGINA-03 — la striscia: QUATTRO blocchi, le etichette del mockup, dati veri', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const letto = await page.evaluate(() => {
    const s = document.querySelector('#ce-tela [data-modello-striscia]');
    return {
      classi: s.className,
      blocchi: [...s.children].map((c) => ({
        etichetta: c.querySelector('small')?.textContent ?? null,
        valore: c.querySelector('strong, .talos-badge')?.textContent ?? null,
        tag: c.querySelector('strong') ? 'strong' : (c.querySelector('.talos-badge') ? 'badge' : '?'),
      })),
      stato: s.querySelector('[data-modello-stato]')?.dataset.modelloStato ?? null,
      verdetto: s.querySelector('[data-modello-verdetto]')?.dataset.modelloVerdetto ?? null,
    };
  });
  expect(letto.classi).toContain('model-context-strip');
  expect(letto.blocchi.map((b) => b.etichetta), 'le quattro caselle del mockup, in quell\'ordine').toEqual(['Destinazione', 'Profilo', 'Stato', 'Verifica']);
  expect(letto.blocchi[0].valore).toBe('Sul dispositivo');
  expect(letto.blocchi[1].valore, 'il profilo col formato e la quantizzazione veri').toBe('GGUF · Q4_K_M · 17,1 GB');
  expect(letto.blocchi[2].tag, 'lo stato e\' una pastiglia, non una parola sciolta').toBe('badge');
  expect(letto.blocchi[2].valore).toBe('Sul disco');
  // ⛔ Lo stato e' quello del PRODOTTO (`datiModelloInstallato`), non il `state` grezzo del
  //   manifest: `ready` sul disco si dice «Sul disco», ed e' la stessa parola della lista Installati.
  expect(letto.stato).toBe('disco');
  expect(letto.blocchi[3].valore, 'la verifica e\' il verdetto vero del server').toBe('Non entra');
  expect(letto.verdetto).toBe('non-entra');
});

test('PAGINA-04 — `[object Object]`: `backend` e `build` sono fatti tipizzati, e due ignoti sono UNA parola', async ({ page }) => {
  await apriIlBanco(page);
  // (1) due fatti IGNOTI: il caso del 4174, che stampava «Sconosciuto · Sconosciuto»
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.montaNelBanco({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf', scheda: 'compatibility' }); }, RISPOSTE_BASE);
  await risposte(page, 4);
  const ignoti = await page.evaluate(() => document.querySelector('#ce-banco [data-modello-backend]')?.textContent ?? null);
  expect(ignoti, '⛔ mai `[object Object]`').not.toContain('[object Object]');
  expect(ignoti, '⛔ e mai la stessa parola due volte').toBe('Sconosciuto');

  // (2) due fatti DIVERSI: restano due, in ordine
  await page.evaluate((r) => {
    window.__ce.azzera();
    window.__ce.prepara({ ...r, fit: { dati: { ...r.fit.dati, inspection: { ...r.fit.dati.inspection, backend: { state: 'observed', value: 'Vulkan' }, build: { state: 'observed', value: 'b6421' } } } } });
    window.__ce.montaNelBanco({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf', scheda: 'compatibility' });
  }, RISPOSTE_BASE);
  await risposte(page, 4);
  const diversi = await page.evaluate(() => [...document.querySelectorAll('#ce-banco [data-modello-backend]')].map((n) => n.textContent));
  expect(diversi, 'due fatti diversi restano due').toContain('Vulkan · b6421');
  expect(diversi.join(' ')).not.toContain('[object Object]');
});

test('PAGINA-05 — le immagini: a interruttore SPENTO non parte NESSUNA richiesta, ne\' al proxy ne\' fuori', async ({ page }) => {
  const { esterne, proxy } = await contaLeRichieste(page);
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const letto = await page.evaluate(() => {
    const b = document.querySelector('#ce-tela [data-modello-immagini]');
    return {
      quante: b?.dataset.modelloImmagini ?? null,
      consenso: b?.dataset.modelloImmaginiConsenso ?? null,
      immagini: b?.querySelectorAll('img').length ?? -1,
      testo: b?.textContent ?? '',
      mostra: !!b?.querySelector('[data-modello-immagini-mostra]'),
      sempre: !!b?.querySelector('[data-modello-immagini-sempre]'),
      host: [...(b?.querySelectorAll('figure') || [])].map((f) => f.dataset.modelloImmagine),
    };
  });
  expect(letto.quante, 'la scheda dice quante immagini porta').toBe('3');
  expect(letto.consenso, 'e che il consenso non c\'e\'').toBe('negato');
  expect(letto.immagini, '⛔ NESSUN `<img>` nel documento').toBe(0);
  expect(letto.testo, 'il riquadro dice cosa manca e perche\'').toContain('non le carichiamo senza il tuo consenso');
  expect(letto.testo, 'e da dove verrebbero').toContain('github.com');
  expect(letto.testo).toContain('raw.githubusercontent.com');
  expect(letto.mostra, 'il comando per il caso singolo c\'e\'').toBe(true);
  expect(letto.sempre, 'e la casella per la scelta che resta').toBe(true);
  expect(proxy, '⛔ IL VERSO CHE DEVE FALLIRE: a interruttore spento non si chiede NIENTE al server').toEqual([]);
  expect(esterne, '⛔ e non esce niente verso l\'esterno').toEqual([]);
});

test('PAGINA-06 — le immagini: acceso il consenso ARRIVANO, si contano, e passano dal NOSTRO server', async ({ page }) => {
  const { esterne, proxy } = await contaLeRichieste(page);
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' }); }, RISPOSTE_BASE);
  await risposte(page, 4);
  await page.locator('#ce-tela [data-modello-immagini-mostra]').click();
  await page.waitForTimeout(400);

  const letto = await page.evaluate(() => {
    const b = document.querySelector('#ce-tela [data-modello-immagini]');
    const img = [...b.querySelectorAll('img')];
    return {
      consenso: b.dataset.modelloImmaginiConsenso,
      quante: img.length,
      referrer: img.map((i) => i.getAttribute('referrerpolicy')),
      indirizzi: img.map((i) => i.getAttribute('src')),
      disegnate: img.map((i) => i.naturalWidth),
      nascondi: !!b.querySelector('[data-modello-immagini-nascondi]'),
    };
  });
  expect(letto.consenso).toBe('dato');
  expect(letto.quante, 'tre immagini, e sono quelle che il repository dichiara').toBe(3);
  // ⛔ AL NOSTRO SERVER, MAI AL SITO ESTERNO: la CSP (`img-src 'self' data:`) un indirizzo esterno
  //   non lo lascerebbe partire, e il proxy e' l'unico punto che parla coi terzi.
  expect(letto.indirizzi.every((s) => s.startsWith('/api/v1/huggingface/image?url=')), '⛔ il src e\' la rotta del proxy, non l\'indirizzo esterno').toBe(true);
  expect(letto.indirizzi.join(' ')).not.toContain('https://github.com');
  expect(letto.referrer, 'ognuna dichiara di non mandare il referrer').toEqual(['no-referrer', 'no-referrer', 'no-referrer']);
  expect(letto.disegnate, 'e il PNG del proxy e\' arrivato davvero: nessun `<img>` rotto').toEqual([1, 1, 1]);
  expect(letto.nascondi, 'e si possono rimettere via').toBe(true);
  // ⛔ IL CONTO: una richiesta per immagine, e sono ESATTAMENTE quelle che il repository dichiara.
  expect(proxy.length, 'una richiesta al proxy per immagine, contate davvero').toBe(3);
  expect(new Set(proxy).size, 'e tre indirizzi diversi').toBe(3);
  expect(proxy.join(' ')).toContain('github.com/unslothai/unsloth');
  expect(esterne, '⛔ e verso l\'esterno continua a non uscire niente').toEqual([]);
});

test('PAGINA-11 — il proxy che RIFIUTA: non resta un buco muto, si dice cosa manca', async ({ page }) => {
  // Il caso vero e misurato: le tre immagini di GLM-4.7-Flash stanno su `github.com`, e il proxy
  // (`src/hf-image-proxy.mjs:4`) accetta solo `huggingface.co`/`hf.co`.
  const { esterne, proxy } = await contaLeRichieste(page, { proxyRotto: true });
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' }); }, RISPOSTE_BASE);
  await risposte(page, 4);
  await page.locator('#ce-tela [data-modello-immagini-mostra]').click();
  await page.waitForTimeout(600);

  const letto = await page.evaluate(() => {
    const b = document.querySelector('#ce-tela [data-modello-immagini]');
    return { figure: b.querySelectorAll('figure').length, testo: b.textContent, img: b.querySelectorAll('img').length };
  });
  expect(proxy.length, 'la richiesta e\' partita').toBe(3);
  expect(esterne, 'e non e\' uscita verso l\'esterno').toEqual([]);
  expect(letto.testo, '⛔ il buco non e\' muto: la pagina dice cosa manca').toContain('Immagine della scheda non disponibile.');
  expect(letto.figure, 'il posto dell\'immagine resta, con la sua didascalia').toBe(3);
});

test('PAGINA-07 — la preferenza che resta: si scrive dove vivono le preferenze, e il montaggio dopo non chiede piu\'', async ({ page }) => {
  // ⛔ Il contatore anche qui: accendendo la preferenza le immagini PARTONO, e una prova non manda
  //   richieste in rete per sbaglio — si contano e si servono qui (stessa disciplina di PAGINA-06).
  await contaLeRichieste(page);
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.montaNelBanco({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const prima = await page.evaluate(() => ({ scritto: window.__ce.archivio.scritto, valore: window.__ce.archivio.valore }));
  expect(prima, 'senza toccare niente non si scrive nessuna preferenza').toEqual({ scritto: null, valore: false });

  // ⛔ Si preme dal codice: il banco e' un contenitore NASCOSTO (e' li' per non finire in foto), e
  //   un `.check()` di Playwright vuole un elemento visibile. Il clic vero e' lo stesso evento.
  await page.evaluate(() => document.querySelector('#ce-banco [data-modello-immagini-sempre]').click());
  await page.waitForTimeout(300);
  const dopo = await page.evaluate(() => ({
    scritto: window.__ce.archivio.scritto,
    valore: window.__ce.archivio.valore,
    immagini: document.querySelectorAll('#ce-banco img').length,
    consenso: document.querySelector('#ce-banco [data-modello-immagini]')?.dataset.modelloImmaginiConsenso ?? null,
    nota: document.querySelector('#ce-banco [data-modello-immagini]')?.textContent ?? '',
  }));
  expect(dopo.scritto, '⛔ la casella scrive nel port delle preferenze, non in un archivio suo').toBe(true);
  expect(dopo.valore).toBe(true);
  expect(dopo.immagini, 'e accendendola le immagini compaiono subito').toBe(3);
  expect(dopo.nota, 'dicendo dove si torna a spegnere').toContain('Immagini remote nelle schede');

  // un montaggio NUOVO, con la preferenza accesa: nessun riquadro, nessun consenso da chiedere
  const nuovo = await page.evaluate((r) => {
    window.__ce.azzera();
    window.__ce.montaNelBanco({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' });
    return true;
  }, RISPOSTE_BASE);
  await risposte(page, 4);
  const secondo = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ce-banco [data-modello-immagini]')].pop();
    return { consenso: b?.dataset.modelloImmaginiConsenso ?? null, immagini: b?.querySelectorAll('img').length ?? -1, sempre: !!b?.querySelector('[data-modello-immagini-sempre]') };
  });
  expect(nuovo).toBe(true);
  expect(secondo.consenso, 'la preferenza accesa vale dal primo disegno').toBe('dato');
  expect(secondo.immagini).toBe(3);
  expect(secondo.sempre, 'e non si chiede di nuovo una cosa gia\' decisa').toBe(false);
});

test('PAGINA-08 — un REPOSITORY che non e\' installato: la sua scheda, i suoi file, e nessun verdetto inventato', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((r) => {
    window.__ce.prepara(r);
    // La forma dichiarata: il repository viaggia nell'ID, perche' la rotta porta solo l'id.
    window.__ce.monta({ id: `hf:${'unsloth/GLM-4.7-Flash-GGUF'}@${'0d32489ecb9db6d2a4fc93bd27ef01519f95474d'}` });
  }, RISPOSTE_BASE);
  await risposte(page, 2); // la capacita' e il repository: NIENT'ALTRO deve essere chiesto

  const letto = await page.evaluate(() => {
    const r = document.querySelector('#ce-tela [data-scheda-modello]');
    return {
      id: r.dataset.modelloId,
      origine: r.querySelector('[data-modello-identita]')?.querySelector('span')?.textContent ?? null,
      nome: r.querySelector('[data-modello-nome]')?.textContent ?? null,
      striscia: r.querySelector('[data-modello-striscia]')?.textContent ?? '',
      stato: r.querySelector('[data-modello-stato]')?.dataset.modelloStato ?? null,
      repo: r.querySelector('[data-modello-repo]')?.textContent ?? '',
      chiamate: window.__ce.stato.chiamate.map((c) => c.percorso),
    };
  });
  expect(letto.id, 'la forma dichiarata: `hf:<repo>@<revisione>` nell\'id').toBe(`hf:${REPO}@${REVISION}`);
  expect(letto.nome, 'il nome viene dal repository').toBe(NOME_UMANO);
  expect(letto.origine, 'la toolbar dice cos\'e\'').toBe('Repository');
  expect(letto.repo).toContain(`revisione ${REVISION.slice(0, 12)}`);
  expect(letto.striscia).toContain('Solo nel repository');
  expect(letto.striscia, '⛔ e MAI «Sul disco»').not.toContain('Sul disco');
  expect(letto.stato).toBe('non-installato');
  expect(letto.striscia, '⛔ niente badge «Non installato» due volte di fila').not.toContain('Non installato Non installato');
  expect(letto.chiamate.filter((p) => p.includes('/fit?')), '⛔ la verifica di memoria NON si chiede per un repository').toEqual([]);
  expect(letto.chiamate.filter((p) => p === '/api/v1/local-models'), '⛔ e nemmeno la lista dei modelli installati').toEqual([]);

  // la scheda «card» e' quella VERA del repository
  const card = await page.evaluate(() => document.querySelector('#ce-tela [data-modello-card]')?.textContent ?? '');
  expect(card, 'il README del repository, reso').toContain('Questa scheda descrive il modello');
  expect(card, 'e non il sorgente').not.toContain('license: mit');
  expect(card, 'col collegamento del README reso').toContain('Run GLM-4.7-Flash Guide');

  // il lato «file»: i file del REPOSITORY, non scaricati
  await page.evaluate(() => window.__ce.montaggi[0].vaiA('files'));
  await page.waitForTimeout(200);
  const files = await page.evaluate(() => {
    const p = document.querySelector('#ce-tela [data-modello-files]');
    return { testo: p?.textContent ?? '', esiti: [...(p?.querySelectorAll('[data-modello-esito]') || [])].map((n) => n.dataset.modelloEsito) };
  });
  expect(files.testo, 'lo dice: non e\' sul disco').toContain('non è sul disco');
  expect(files.testo).toContain('GLM-4.7-Flash-Q8_0.gguf');
  expect(files.testo, 'il peso del repository, dichiarato come tale').toContain('Peso complessivo del repository');
  expect(files.esiti, '⛔ NESSUN file puo\' dire «coincide»: non e\' stato scaricato niente').toEqual([]);
  expect(files.testo).not.toContain('Coincide col repository');

  // il lato «compatibilita'»: niente barra, niente verdetto, e la macchina vera
  await page.evaluate(() => window.__ce.montaggi[0].vaiA('compatibility'));
  await page.waitForTimeout(200);
  const compat = await page.evaluate(() => {
    const p = document.querySelector('#ce-tela [data-modello-compatibilita]');
    return { testo: p?.textContent ?? '', meter: p?.querySelectorAll('meter').length ?? -1, verdetto: p?.querySelectorAll('[data-modello-verdetto]').length ?? -1 };
  });
  expect(compat.testo, 'la ragione, non una stima').toContain('non è ancora sul disco');
  expect(compat.meter, '⛔ nessuna barra: non c\'e\' niente di misurato da disegnare').toBe(0);
  expect(compat.verdetto, '⛔ nessun verdetto').toBe(0);
  expect(compat.testo, 'ma la macchina si mostra lo stesso: e\' una misura vera').toContain('RAM totale');
});

test('PAGINA-09 — gli schemi pericolosi non diventano immagini ne\' indirizzi', async ({ page }) => {
  await apriIlBanco(page);
  const letto = await page.evaluate(async () => {
    const m = await import('/__ce/components/scheda-modello.js');
    return m.immaginiDellaScheda([
      { alt: 'buona', url: 'https://esempio.invalid/buona.png' },
      { alt: 'doppia', url: 'https://esempio.invalid/buona.png' },
      { alt: 'dati', url: 'data:image/png;base64,AAAA' },
      { alt: 'script', url: 'javascript:alert(1)' },
      { alt: 'vuota', url: '' },
      { alt: 'file', url: 'file:///C:/segreto.png' },
    ]);
  });
  expect(letto.quante, 'una sola passa, e il doppione non si conta due volte').toBe(1);
  expect(letto.immagini[0].url).toBe('https://esempio.invalid/buona.png');
  expect(letto.immagini[0].host).toBe('esempio.invalid');
  expect(letto.host).toEqual(['esempio.invalid']);
});

test('PAGINA-12 — l\'indice del README: un titolo lungo si accorcia, il testo resta intero', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const letto = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ce-tela [data-modello-indice-voce]')];
    const lungo = b.find((n) => n.dataset.modelloIndiceVoce.includes('jan-21-update'));
    const titolo = document.getElementById(lungo.dataset.modelloIndiceVoce);
    return {
      quante: b.length,
      breve: lungo?.textContent ?? null,
      intero: lungo?.title ?? null,
      titoloNelDocumento: titolo?.textContent ?? null,
    };
  });
  // ⛔ Il difetto trovato GUARDANDO la foto dei dati veri: il README di GLM-4.7-Flash ha un titolo
  //   di 145 caratteri, e per intero diventava una riga di paragrafo dentro l'indice.
  expect(letto.breve, 'l\'etichetta e\' accorciata').toBeTruthy();
  expect(letto.breve.length, '⛔ e non sfonda la riga dell\'indice').toBeLessThanOrEqual(45);
  expect(letto.breve.endsWith('…'), 'accorciata, non tagliata a meta\' parola senza dirlo').toBe(true);
  expect(letto.intero, 'il testo intero resta raggiungibile (il `title`)').toContain('looping and poor outputs');
  expect(letto.titoloNelDocumento, 'e il titolo nel documento resta INTERO: e\' lui il bersaglio').toContain('looping and poor outputs');
  // ⛔ DUE, e non è un caso: l'indice elenca `h2/h3/h4`, e il titolo di primo livello del README
  //   (`# Read our How to …`) è la testata della scheda, non una sezione da saltare.
  expect(letto.quante, 'tutte le sezioni sono nell\'indice, corte e lunghe').toBeGreaterThanOrEqual(2);
});

test('PAGINA-13 — da un repository non installato si ARRIVA AL DOWNLOAD, dalla pagina', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: `hf:${'unsloth/GLM-4.7-Flash-GGUF'}@${'0d32489ecb9db6d2a4fc93bd27ef01519f95474d'}`, scheda: 'files' }); }, RISPOSTE_BASE);
  await risposte(page, 2);

  // (1) il blocco c'e', con id PROPRI e senza rubare quelli del pannello
  const blocco = await page.evaluate(() => ({
    sezione: !!document.querySelector('#ce-tela [data-modello-scelta-file]'),
    varianti: document.querySelectorAll('#paginaModelloFileChoices [data-hf-file]').length,
    /*
     * ⛔ GLI ID SI CONTANO, e sono due domande diverse:
     *   · `#paginaModello*` deve esistere **una volta sola in TUTTO il documento** (`mioUnico`), non
     *     solo dentro la mia cornice: la pagina e il pannello del laboratorio convivono nello stesso
     *     documento, e un id ripetuto rende `querySelector('#x')` una domanda senza risposta unica;
     *   · e gli id DEL PANNELLO (`hfFileChoices`, `hfStima`, `hfScarica`) non devono comparire
     *     DENTRO la mia cornice — è la ragione per cui il blocco si monta con `prefissoId`.
     * ⛔ La cornice non è il documento: sul banco l'app tiene montato il suo pannello (`#panel-hf`),
     *   con gli id di sempre, ed è GIUSTO che li abbia (misurato il 19/09/2026: vivono in
     *   `aside.talos-card < #panel-hf < #schermoModelLab`).
     */
    idProprio: !!document.getElementById('paginaModelloFileChoices'),
    mioUnico: document.querySelectorAll('#paginaModelloFileChoices').length,
    idDelPannello: document.querySelectorAll('#ce-tela #hfFileChoices, #ce-tela #hfStima, #ce-tela #hfScarica').length,
    scarica: document.getElementById('paginaModelloScarica')?.textContent ?? null,
    scelto: document.querySelector('#paginaModelloFileChoices [aria-checked="true"]')?.dataset.variante ?? null,
    nota: document.querySelector('#ce-tela [data-modello-scelta-file] p')?.textContent ?? '',
  }));
  expect(blocco.sezione, 'la scelta del file sta nella sua scheda').toBe(true);
  expect(blocco.varianti, 'due varianti GGUF nel repository').toBe(2);
  expect(blocco.idProprio, 'gli id sono quelli dichiarati (`prefissoId`)').toBe(true);
  expect(blocco.mioUnico, '⛔ e sono UNICI nel documento, non solo nella cornice').toBe(1);
  // ⛔ LA GUARDIA DEGLI ID DOPPI: se il blocco montasse con gli id del pannello, `app.js` e la
  //   pagina si rubarebbero lo stesso nodo.
  expect(blocco.idDelPannello, '⛔ e quelli del pannello NON esistono dentro la pagina').toBe(0);
  expect(blocco.scelto, 'una variante e\' preselezionata').toBeTruthy();
  expect(blocco.scarica, 'col peso di quella variante nel pulsante').toContain('Scarica sul computer');
  expect(blocco.nota, 'e la nota lo dice: e\' una STIMA, con la sua base').toContain('si stimano dal peso del file');

  // (2) la stima: una richiesta per variante, e i numeri si leggono
  await page.locator('#ce-tela [data-azione="misura"]').click();
  await page.waitForFunction(() => window.__ce.stato.chiamate.filter((c) => c.tipo === 'stima').length >= 2, null, { timeout: 10000 });
  await page.waitForTimeout(250);
  const misurato = await page.evaluate(() => ({
    percorsi: window.__ce.chiamateDi('stima'),
    righe: [...document.querySelectorAll('#paginaModelloFileChoices [data-hf-file]')].map((b) => b.textContent),
    stima: document.getElementById('paginaModelloStima')?.textContent ?? '',
  }));
  // ⛔ LA ROTTA VUOLE IL PESO, NON UN ID: è per questo che funziona su un repository non installato.
  expect(misurato.percorsi.some((p) => p.includes('bytes=18312339808')), 'la stima parte dal peso del file').toBe(true);
  expect(misurato.percorsi.some((p) => p.includes('fit-estimate?')), 'e usa la rotta delle stime').toBe(true);
  expect(misurato.righe.join(' '), 'l\'esito vero: oltre la memoria allocabile').toContain('oltre la memoria allocabile');
  expect(misurato.stima, 'e la riga della stima dice quanto serve').toContain('necessari');

  // (3) si sceglie l'altra variante, e il pulsante cambia con lei
  await page.locator('#ce-tela #paginaModelloFileChoices [data-variante$="Q8_0.gguf"]').click();
  await page.waitForTimeout(200);
  const dopo = await page.evaluate(() => ({
    scelto: document.querySelector('#paginaModelloFileChoices [aria-checked="true"]')?.dataset.variante ?? null,
    scarica: document.getElementById('paginaModelloScarica')?.textContent ?? '',
  }));
  expect(dopo.scelto).toContain('Q8_0.gguf');
  expect(dopo.scarica, 'il pulsante porta il peso della variante scelta').toContain('29,8 GB');

  // (4) IL DOWNLOAD: si preme, e si guarda il CORPO che parte davvero
  await page.locator('#ce-tela #paginaModelloScarica').click();
  await page.waitForFunction(() => window.__ce.scrittureDi('/huggingface/download').length === 1, null, { timeout: 10000 });
  await page.waitForTimeout(200);
  const corpo = await page.evaluate(() => window.__ce.scrittureDi('/huggingface/download')[0]?.corpo ?? null);
  expect(corpo, 'una scrittura, al percorso del download').toBeTruthy();
  expect(corpo.repo).toBe('unsloth/GLM-4.7-Flash-GGUF');
  expect(corpo.revision).toBe('0d32489ecb9db6d2a4fc93bd27ef01519f95474d');
  expect(corpo.files.map((f) => f.path)).toEqual(['GLM-4.7-Flash-Q8_0.gguf']);
  expect(corpo.bytes, 'il peso del GRUPPO scelto, non di un altro').toBe(32000000000);
  expect(corpo.id, 'l\'identità del download').toBe(corpo.path);
  expect(corpo.id.length).toBeLessThanOrEqual(120);
  expect(corpo.files[0].bytes).toBe(32000000000);
  // I vincoli del server, riga per riga (`requireHuggingFaceDownloadBody`, `http-app.mjs:1546`):
  expect(/^[a-f0-9]{40,64}$/i.test(corpo.revision), 'revisione: hash 40-64 cifre').toBe(true);
  expect(/^[a-f0-9]{64}$/i.test(corpo.files[0].sha256), 'impronta: 64 cifre').toBe(true);
  // ⛔ La licenza del fixture è `null`: il corpo deve portare `'unknown'`, la stessa parola che
  //   manda il pannello (`app.js:3826`). Una licenza vuota fa rispondere **500** al server.
  expect(corpo.license, '⛔ licenza non vuota: senza, il server risponde 500 DOPO aver accettato').toBe('unknown');
  const esito = await page.evaluate(() => document.querySelector('#ce-tela [data-modello-scarica-esito]')?.textContent ?? null);
  expect(esito, 'il download avviato si dice a schermo').toContain('Download avviato');
  expect(esito).toContain('GLM-4.7-Flash-Q8_0.gguf');
  expect(esito).toContain('29,8 GB');
});

test('PAGINA-14 — il download che non parte: senza scrittore il pulsante e\' spento, e l\'errore si legge', async ({ page }) => {
  await apriIlBanco(page);
  // (a) montata SENZA scrittore: il pulsante non si lascia acceso
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.montaNelBanco({ id: 'hf:unsloth/GLM-4.7-Flash-GGUF', scheda: 'files', apiPost: null }); }, RISPOSTE_BASE);
  await risposte(page, 2);
  const spento = await page.evaluate(() => ({
    disabilitato: document.getElementById('paginaModelloScarica')?.disabled ?? null,
    testo: [...document.querySelectorAll('#ce-banco [data-modello-scelta-file] p')].map((p) => p.textContent).join(' '),
  }));
  // ⛔ Un controllo che promette e non mantiene è il difetto che questa casa chiama «un avviso che
  //   non può fermare è un commento a schermo»: senza `apiPost` il download non può partire, e si vede.
  expect(spento.disabilitato, 'senza scrittore il «Scarica» è spento').toBe(true);
  expect(spento.testo, 'e la ragione è scritta, non taciuta').toContain('apiPost');

  // (b) il server rifiuta: l'errore si legge, e la pagina non finge che sia andata bene
  await page.evaluate((r) => {
    window.__ce.montaggi[0]?.distruggi?.();
    window.__ce.prepara({ ...r, download: { errore: 'Corpo non valido: atteso {id, repo, revision (hash 40-64 esa), files: [{path, bytes, sha256}], bytes, path, license}' } });
    window.__ce.montaNelBanco({ id: 'hf:unsloth/GLM-4.7-Flash-GGUF', scheda: 'files' });
  }, RISPOSTE_BASE);
  await risposte(page, 2);
  // ⛔ Dopo il `distruggi` gli id devono tornare UNO: due montaggi vivi renderebbero
  //   `getElementById` una domanda senza risposta unica.
  expect(await page.locator('#paginaModelloScarica').count(), 'un solo pulsante nel documento').toBe(1);
  await page.evaluate(() => document.getElementById('paginaModelloScarica').click());
  await page.waitForTimeout(400);
  const rifiutato = await page.evaluate(() => ({
    esito: document.querySelector('#ce-banco [data-modello-scarica-esito]')?.textContent ?? null,
    ruolo: document.querySelector('#ce-banco [data-modello-scarica-esito]')?.getAttribute('role') ?? null,
    avviati: document.querySelectorAll('#ce-banco [data-modello-scarica-esito="avviato"]').length,
  }));
  expect(rifiutato.esito, 'il motivo del rifiuto è a schermo').toContain('Corpo non valido');
  expect(rifiutato.ruolo, 'e chi legge con uno screen reader lo sente').toBe('alert');
  expect(rifiutato.avviati, '⛔ e non si dice «avviato» quando non lo è').toBe(0);
});

test('PAGINA-10 — le foto: due temi, due larghezze, e zero errori in console', async ({ page }) => {
  mkdirSync(FOTO, { recursive: true });
  const errori = [];
  page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  page.on('pageerror', (e) => errori.push(String(e)));
  const { esterne, proxy } = await contaLeRichieste(page);

  await apriIlBanco(page);
  await page.evaluate((r) => { window.__ce.prepara(r); window.__ce.monta({ id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf', indietro: () => {} }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  // ⛔ Le regole del mockup, per MOSTRARE l'effetto atteso: non sono nel prodotto (e' la richiesta
  //   che accompagna questa corsia), quindi la seconda foto e' una PREVISIONE dichiarata.
  const FOGLIO_DEL_MOCKUP = `
    .model-page{width:100%;min-width:0}
    .model-page-toolbar{background:var(--talos-background);display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--talos-border);min-height:67px}
    .toolbar-identity{font-size:.8125rem;font-weight:500;display:flex;gap:10px;align-items:center;padding-left:16px;border-left:1px solid var(--talos-border)}
    .toolbar-identity>span{font-size:.625rem;font-weight:400;color:var(--talos-muted)}
    .model-page-actions{display:flex;gap:10px;align-items:center;margin-left:auto}
    .model-hero{display:grid;grid-template-columns:1fr auto;gap:16px 24px;padding:33px 0 29px;align-items:start}
    .model-hero-identity{display:flex;gap:20px;align-items:center;min-width:0}
    .model-hero .model-glyph.large{width:70px;height:70px;border-radius:18px;background:var(--talos-surface)}
    .model-hero .model-glyph.large svg{width:38px;height:38px}
    .model-hero h1{font-size:2.5rem;font-weight:550;letter-spacing:-.045em;line-height:1.14;margin:0}
    .model-hero .eyebrow{font-size:.5625rem;letter-spacing:.14em;margin-bottom:8px}
    .model-repository{display:flex;align-items:center;flex-wrap:wrap;gap:7px;color:var(--talos-muted);font-size:.75rem;margin-top:9px}
    .model-hero-caption{grid-column:1/-1;color:var(--talos-muted);font-size:.875rem}
    .model-context-strip{display:grid;grid-template-columns:1fr 1fr 1.3fr 1.1fr;background:var(--talos-surface);border:1px solid var(--talos-border);border-radius:11px;padding:16px 0;margin-bottom:19px}
    .model-context-strip>div{padding:0 21px;display:flex;gap:12px;align-items:center;border-right:1px solid var(--talos-border)}
    .model-context-strip>div:last-child{border-right:0}
    .model-context-strip small{font-size:.5625rem;letter-spacing:.08em;color:var(--talos-muted);display:block;margin-bottom:6px}
    .model-context-strip strong{display:block;font-size:.75rem;font-weight:500}
    .model-page-tabs{display:flex;align-items:stretch;gap:26px;border-bottom:1px solid var(--talos-border);margin-bottom:25px}
    .model-page-tab-note{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--talos-muted);margin-left:auto}
    .model-page-end{font-size:11px;color:var(--talos-muted)}
  `;

  const combinazioni = [
    ['scuro-1440x900', { chiaro: false, larghezza: 1440, altezza: 900 }],
    ['chiaro-1440x900', { chiaro: true, larghezza: 1440, altezza: 900 }],
    ['scuro-1024x800', { chiaro: false, larghezza: 1024, altezza: 800 }],
    ['chiaro-1024x800', { chiaro: true, larghezza: 1024, altezza: 800 }],
  ];
  for (const [nome, c] of combinazioni) {
    await page.setViewportSize({ width: c.larghezza, height: c.altezza });
    await page.evaluate((c) => {
      document.documentElement.setAttribute('data-talos-theme', 'calm');
      if (c.chiaro) document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
    }, c);
    for (const quale of ['card', 'files', 'compatibility']) {
      await page.evaluate((q) => window.__ce.montaggi[0].vaiA(q), quale);
      await page.waitForTimeout(200);
      expect(await page.locator('#talosAvvio').count(), `${nome}-${quale}: si sta fotografando il velo d'avvio, non la pagina`).toBe(0);
      await page.screenshot({ path: resolve(FOTO, `${nome}-${quale}.png`), fullPage: true });
    }
    // la stessa pagina con le regole del mockup, per MOSTRARE il disegno richiesto
    await page.evaluate((css) => {
      const s = document.createElement('style');
      s.id = 'ce-foglio-mockup';
      s.textContent = css;
      document.head.append(s);
    }, FOGLIO_DEL_MOCKUP);
    for (const quale of ['card', 'files', 'compatibility']) {
      await page.evaluate((q) => window.__ce.montaggi[0].vaiA(q), quale);
      await page.waitForTimeout(200);
      await page.screenshot({ path: resolve(FOTO, `${nome}-${quale}-col-foglio-del-mockup.png`), fullPage: true });
    }
    await page.evaluate(() => document.getElementById('ce-foglio-mockup')?.remove());

    // una misura che vale per tutte: la pagina non scorre in orizzontale e i numeri si leggono
    const forma = await page.evaluate(() => {
      const t = document.getElementById('ce-tela');
      const radice = t.querySelector('[data-scheda-modello]');
      return { scorrimento: t.scrollWidth - t.clientWidth, altezza: radice.getBoundingClientRect().height, blocchi: radice.querySelectorAll('[data-modello-striscia] > *').length };
    });
    expect(forma.scorrimento, `${nome}: niente scorrimento orizzontale`).toBeLessThanOrEqual(1);
    expect(forma.blocchi, `${nome}: quattro blocchi anche a finestra stretta`).toBe(4);
  }
  expect(proxy, '⛔ nemmeno le foto chiedono un\'immagine: l\'interruttore e\' spento').toEqual([]);
  expect(esterne, '⛔ e non e\' uscita una sola richiesta esterna').toEqual([]);
  expect(errori, 'nessun errore in console').toEqual([]);

  /*
   * ⛔ E LA PAGINA DI UN REPOSITORY, fotografata dove ora vive la scelta del file: la scheda «File
   *   del modello» con la scelta della variante, la stima e il «Scarica». È la superficie che il
   *   clic sulla riga della lista Hugging Face porta a vedere, e senza una foto non si saprebbe se
   *   il blocco ci sta davvero (le altre foto sono di un modello locale, dove quel blocco NON c'è).
   */
  await page.evaluate(() => { window.__ce.montaggi[0]?.distruggi?.(); window.__ce.azzera(); });
  await page.evaluate((r) => {
    window.__ce.prepara(r);
    window.__ce.monta({ id: `hf:${'unsloth/GLM-4.7-Flash-GGUF'}@${'0d32489ecb9d' + 'b6d2a4fc93bd27ef01519f95474d'}`, scheda: 'files', indietro: () => {} });
  }, RISPOSTE_BASE);
  await risposte(page, 2);
  // la stima si chiede, così nella foto ci sono anche i numeri veri
  await page.locator('#ce-tela [data-azione="misura"]').click();
  await page.waitForFunction(() => window.__ce.stato.chiamate.filter((c) => c.tipo === 'stima').length >= 2, null, { timeout: 10000 });
  await page.waitForTimeout(250);
  for (const [nome, chiaro] of [['scuro-1440x900', false], ['chiaro-1440x900', true], ['scuro-1024x800', false]]) {
    await page.setViewportSize(nome.includes('1024') ? { width: 1024, height: 800 } : { width: 1440, height: 900 });
    await page.evaluate((c) => {
      document.documentElement.setAttribute('data-talos-theme', 'calm');
      if (c) document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    }, chiaro);
    await page.screenshot({ path: resolve(FOTO, `${nome}-files-repository.png`), fullPage: true });
  }
  const bloccoDentroLaPagina = await page.evaluate(() => ({
    scelte: document.querySelectorAll('#ce-tela #paginaModelloFileChoices [data-hf-file]').length,
    scarica: document.getElementById('paginaModelloScarica')?.textContent ?? null,
    stima: document.getElementById('paginaModelloStima')?.textContent ?? null,
  }));
  expect(bloccoDentroLaPagina.scelte, 'nella foto la scelta del file c\'è davvero').toBe(2);
  expect(bloccoDentroLaPagina.scarica).toContain('Scarica sul computer');
  expect(bloccoDentroLaPagina.stima, 'e la stima ha i suoi numeri, non un segnaposto').toContain('necessari');
  expect(errori, 'e le foto del repository non aggiungono errori in console').toEqual([]);
});


test('RIPRESA-HF-RIPROVA-CONCORRENTE — doppio clic non crea due letture della stessa scheda', async ({ page }) => {
  await preparaRipresaHf(page, { dallaLista: true });
  let first = true;
  const pending = [];
  await page.route('**/api/v1/huggingface/repo?**', async route => {
    if (first) { first = false; await route.fulfill({ status: 503, json: { ok: false, error: { message: 'Repository temporaneamente non disponibile' } } }); return; }
    pending.push(route);
  });
  await page.locator('#modelLabHfPanel [data-hf]').click();
  const retry = page.locator('#paginaModello [data-modello-ricarica]').first();
  await expect(retry).toBeVisible();
  await retry.dblclick();
  await expect.poll(() => pending.length).toBe(1);
  await page.waitForTimeout(250);
  expect(pending).toHaveLength(1);
  await pending[0].fulfill({ json: { ok: true, data: REPO_DATI } });
  await expect(page.locator('#paginaModelloFileChoices [data-variante]')).toHaveCount(2);
  await expect(page.locator('#paginaModello [data-modello-errore]')).toHaveCount(0);
});
