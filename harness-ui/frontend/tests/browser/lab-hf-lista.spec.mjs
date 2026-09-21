import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { RISULTATI_HF } from '../../lab/fixtures/hf-catalogo.js';

/*
 * ============================================================================
 * LA LISTA «HUGGING FACE» COL DISEGNO DEL MOCKUP — FASE 4-bis, corsia A · 19/09/2026
 * ============================================================================
 * Owner, 19/09/2026, guardando il suo schermo: «La lista Hugging Face non è quella del mock-up.
 * Il mock-up ha una formattazione e uno stile molto migliore».
 *
 * ⛔ COME SI PROVA, e perché così. La prova NON costruisce un finto DOM: apre l'app VERA (il
 *   pacchetto servito sulla porta del banco), arriva al laboratorio per le PORTE VERE (barra
 *   laterale → `Impostazioni` → scheda `Laboratorio modelli` del guscio) e SERVE IL MODULO DALLA SUA
 *   SORGENTE SU DISCO via `page.route('**\/__lab\/*.js')`, caricandolo con un `import()` dalla
 *   pagina (la CSP `script-src 'self'` lo ammette: è same-origin). È lo stesso patto di
 *   `lab-sistema.spec.mjs` e `_fase3-banda.spec.mjs`: la prova del MODULO è di questa corsia, la
 *   prova del CABILAGGIO è del build, che non è di questa corsia.
 *
 * ⛔ I RISULTATI SONO REGISTRATI, NON INVENTATI. `RISULTATI_VERI` sono otto righe copiate **verbatim**
 *   dalla risposta vera di `GET /api/v1/huggingface/search?query=gguf%20qwen&limit=20&sort=downloads`
 *   letta il **19/09/2026** sul server del banco (che parla con `huggingface.co`): repo, revisione,
 *   download, preferiti, `gated`, `pipelineTag`, licenza — nessun campo scritto a mano. Si usano al
 *   posto della rete perché un cancello che dipende da `huggingface.co` è rosso quando Hugging Face
 *   ha un pomeriggio storto, e quel rosso non parlerebbe di noi.
 *   ⛔ Ciò che i dati veri NON contengono: **nessun repository GGUF «gated»** — misurato il
 *   19/09/2026 su **104 repository distinti** (sei ricerche, più `filter=gated`): `gated: true`
 *   compare **zero volte**. ⇒ Il ramo «Accesso richiesto» si prova con l'oggetto giusto che il
 *   prodotto ha già, `RISULTATI_HF[1]` della fixture di casa (`lab/fixtures/hf-catalogo.js`: il
 *   repository gated del pannello), importato — non riscritto qui dentro. E la sua assenza sui dati
 *   veri si prova per quello che è: un chip a zero, grigio e non cliccabile.
 *
 * ⛔ I SELETTORI SONO LETTI DAL SORGENTE, MAI INVENTATI — e sono tutti attributi `data-*` messi dal
 *   modulo (`data-hf-chip`, `data-hf-faccetta`, `data-hf-gruppo`, `data-hf-conteggio`,
 *   `data-hf-azzera`, `data-hf` sulla riga) più le classi del design system che il modulo usa
 *   (`talos-list-row__*`, `talos-dot`, `talos-eyebrow`). Le classi del MOCKUP (`model-row`, `chip`,
 *   `facet-select`, `list-group-label`) NON esistono in questo prodotto e non si cercano.
 *
 * ⛔ CHE COSA FA DIVENTARE ROSSA QUESTA PROVA. Le ricette stanno in fondo al file (`RICETTE`) e sono
 *   state provate una per una rompendo il modulo e guardando QUALI prove diventano rosse — non
 *   dedotte: chi tocca una riga qui deve poterla rompere e vedere il rosso.
 */

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const CARTELLA_FOTO = resolve(process.cwd(), 'artifacts', 'fase4bis-corsiaA', 'foto');

/*
 * OTTO RIGHE VERE — registrate il 19/09/2026 da
 * `GET /api/v1/huggingface/search?query=gguf%20qwen&limit=20&sort=downloads&direction=-1`.
 * `revision` è accorciata a 12 caratteri solo per leggibilità: è un commit esatto, come lo manda
 * l'hub. I numeri NON si arrotondano: sono quelli che il server ha risposto.
 */
const RISULTATI_VERI = [
  { repo: 'unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF', revision: 'b17cb02dd882', downloads: 12729626, likes: 1034, gated: false, pipelineTag: 'text-generation', license: 'apache-2.0' },
  { repo: 'unsloth/Qwen3.8-27B-GGUF', revision: '4ca720788d1e', downloads: 7118363, likes: 4343, gated: false, pipelineTag: null, license: 'apache-2.0' },
  { repo: 'cdiamond/Qwen3.8-27B-iMatrix-NVFP4-MTP-GGUF', revision: 'ac343e8f44ca', downloads: 4019016, likes: 11, gated: false, pipelineTag: 'image-text-to-text', license: 'apache-2.0' },
  { repo: 'huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF', revision: 'c21e1a9a4549', downloads: 2832383, likes: 795, gated: false, pipelineTag: 'image-text-to-text', license: 'apache-2.0' },
  { repo: 'JonathanColetti/Qwen3.8-27B-Uncensored-GGUF', revision: '45d0fc0ad6cf', downloads: 2301104, likes: 1153, gated: false, pipelineTag: 'text-generation', license: 'apache-2.0' },
  { repo: 'HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF', revision: '993a5971fda8', downloads: 2254086, likes: 1298, gated: false, pipelineTag: 'image-text-to-text', license: 'apache-2.0' },
  { repo: 'lmstudio-community/Qwen3.8-27B-GGUF', revision: '5a7da681f605', downloads: 1948614, likes: 48, gated: false, pipelineTag: null, license: 'apache-2.0' },
  { repo: 'RichardErkhov/model-hub_-_Mistral-7B-Instruct-v0.2-gguf', revision: '13eb4e1940b8', downloads: 5055, likes: 0, gated: null, pipelineTag: 'text-generation', license: null },
];

/** Le otto vere PIÙ il repository gated della fixture di casa: è l'unico modo di far esistere il ramo «Accesso richiesto». */
const RISULTATI_CON_GATED = [...RISULTATI_VERI, RISULTATI_HF[1]];

/*
 * ⛔ C'È UN SECONDO DISEGNATORE, ED È L'APP. Aprendo la sezione `huggingface` l'app fa UNA ricerca
 *   vera per conto suo (`app.js:4305`, guardia `hfCatalogoIniziale`) e poi ridisegna il pannello
 *   col SUO modulo — quello dentro il bundle, che è la versione precedente a questa corsia. Se la
 *   prova disegna e la ricerca dell'app arriva dopo, la lista della prova viene SOVRASCRITTA: si
 *   vedeva 9 righe, e tre clic dopo erano 20 (misurato il 19/09/2026: `Expected 9, Received 20`).
 *   ⇒ La ricerca dell'app si chiude SUBITO, con una risposta vuota e senza rete (un cancello che
 *   dipende da `huggingface.co` è rosso quando Hugging Face ha un pomeriggio storto), e si ASPETTA
 *   LA SUA RISPOSTA prima di disegnare la lista della prova. Da lì in poi il pannello è nostro.
 */
async function serviIlModulo(page) {
  await page.route('**/__lab/*.js', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const sorgente = readFileSync(resolve(COMPONENTI, nome), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: sorgente });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca ${nome}` });
    }
  });
  await page.route('**/api/v1/huggingface/search*', (route) => route.fulfill({ json: { ok: true, data: { items: [], nextCursor: null } } }));
}

/** Le porte VERE: la barra laterale, `Impostazioni`, la scheda del laboratorio. */
async function apriIlLaboratorio(page, { colorMode = 'dark' } = {}) {
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1, appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' }, chat: {}, workspaces: {},
    }));
  }, colorMode);
  await serviIlModulo(page);
  await page.goto('/');
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 20000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
  });
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 15000 });
  /* La sezione «Laboratorio modelli» delle Impostazioni: senza, la carta del laboratorio è montata
     ma in un pannello che non è quello mostrato (misurato: `#modelLabHfScoperta` risolve e risulta
     `hidden`, e ogni `click()` della prova scade sui 30 s di actionability). */
  await page.evaluate(() => document.querySelector('[data-settings-tab="models"]')?.click());
  await page.waitForTimeout(400);
  /* La scheda «Hugging Face» del guscio a quattro schede: si preme il pulsante VERO
     (`#labSchedaModels`, cioè `[data-lab-scheda="models"]`, che `lab-cornice-v3.js` costruisce e
     `lab-guscio` asserisce). `SCHEDE_LAB` dice che `huggingface` è la sua PRIMA sezione, quindi il
     pannello si accende senza altri passaggi. */
  /* Si aspettano LA RISPOSTA e il disegno che ne segue (vedi il commento su `serviIlModulo`): da
     qui in poi il pannello non viene più ridisegnato da nessun altro.
     ⛔ Si aspetta la RISPOSTA, non un nodo dell'app: `#modelLabHfStatus` — il `settings-status` del
     markup canonico — dopo il travaso NON ESISTE più nel pannello vestito (misurato il 19/09/2026:
     «element(s) not found»), e appoggiare un'attesa a un nodo che non c'è è il modo di scrivere una
     prova che aspetta per trenta secondi una cosa che non arriverà mai. */
  const risposta = page.waitForResponse((r) => r.url().includes('/api/v1/huggingface/search'), { timeout: 30_000 });
  await page.evaluate(() => document.querySelector('#labSchedaModels')?.click());
  await risposta;
  await expect(page.locator('#modelLabHfPanel')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
}

/** Disegna la lista col modulo NUOVO. `seleziona` scrive in `window.__hfClic` invece di navigare. */
async function disegna(page, risultati, opzioni = {}) {
  return page.evaluate(async ({ items, opts }) => {
    const mod = await import('/__lab/hf-catalogo.js');
    window.__hf = mod;
    window.__hfClic = [];
    const panel = document.querySelector('#modelLabHfPanel');
    return mod.aggiornaHf(panel, items, { ...opts, seleziona: (id) => { window.__hfClic.push(id); } });
  }, { items: risultati, opts: opzioni });
}

const chipDi = (page, testo) => page.locator('[data-hf-chip]').filter({ hasText: testo }).first();
const righe = (page) => page.locator('#modelLabHfResults .talos-list-row');

/** Usa la tendina Calm visibile, quindi lo stesso percorso di mouse/tastiera dell'app. */
async function scegliCalm(page, selettore, valore) {
  const sorgente = page.locator(selettore);
  const testo = (await sorgente.locator(`option[value="${valore}"]`).textContent())?.trim();
  if (!testo) throw new Error(`Opzione ${valore} assente da ${selettore}`);
  await page.locator(`${selettore}--calm`).click();
  await page.getByRole('option', { name: testo, exact: true }).click();
  await expect(sorgente).toHaveValue(valore);
}
const scegliFaccetta = (page, chiave, valore) => scegliCalm(page, `#modelLabHfFaccetta-${chiave}`, valore);

const paginaHfFixture = (inizio, quanti) => Array.from({ length: quanti }, (_, i) => ({ repo: `ripresa/modello-${inizio+i}`, revision: 'a'.repeat(40), gated: false, parameterCount: (inizio+i)%2 ? 7e9 : 30e9, downloads: 100, pipelineTag: 'text-generation', license: 'mit' }));
async function apriHfHttp(page, handler) {
  await page.route('**/api/v1/huggingface/search*', handler);
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await page.evaluate(() => document.querySelector('.talos-sidebar [data-vaia="impostazioni"]')?.click());
  await page.evaluate(() => document.querySelector('[data-settings-tab="models"]')?.click());
  await page.locator('#labSchedaModels').click();
  await expect(righe(page)).toHaveCount(20);
}
test('RIPRESA-HF-INFINITE — scorrimento oltre 20, dedup, fine e filtro parametri', async ({ page }) => {
  const calls = [];
  await apriHfHttp(page, async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor'); calls.push(cursor);
    await route.fulfill({ json: { ok:true, data: { items: cursor ? paginaHfFixture(19, 6) : paginaHfFixture(0,20), nextCursor: cursor ? null : 'seconda' } } });
  });
  await page.locator('#modelLabHfNextButtonControl').scrollIntoViewIfNeeded();
  await expect(righe(page)).toHaveCount(25);
  expect(calls.filter(c=>c==='seconda')).toHaveLength(1);
  await expect(page.locator('#modelLabHfNextButtonControl')).toBeHidden();
  await scegliFaccetta(page, 'parametri', '3-8b');
  await expect(righe(page)).toHaveCount(12);
  await page.locator('[data-hf-azzera]').click();
  await expect(righe(page)).toHaveCount(25);
});
test('RIPRESA-HF-PAGINA-ERRORE — conserva righe, niente loop di retry, riprova esplicita', async ({ page }) => {
  let attempts = 0;
  await apriHfHttp(page, async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if(cursor && ++attempts===1) { await route.fulfill({status:503,json:{ok:false,error:{message:'Hub temporaneamente non disponibile'}}}); return; }
    await route.fulfill({json:{ok:true,data:{items:cursor?paginaHfFixture(20,3):paginaHfFixture(0,20),nextCursor:cursor?null:'seconda'}}});
  });
  await page.locator('#modelLabHfNextButtonControl').scrollIntoViewIfNeeded();
  await expect(page.locator('#modelLabHfPanel')).toContainText('Riprova');
  await expect(righe(page)).toHaveCount(20);
  expect(attempts).toBe(1);
  await page.locator('#modelLabHfNextButtonControl').click();
  await expect(righe(page)).toHaveCount(23);
});
test('RIPRESA-HF-RICERCA-TARDIVA — nuova query e ordinamento vuoto non ereditano pagine vecchie', async ({ page }) => {
  let release; const waiting = new Promise(r=>release=r); let entered;
  const pending = new Promise(r=>entered=r); const calls=[];
  await apriHfHttp(page, async route => {
    const params=new URL(route.request().url()).searchParams;calls.push(Object.fromEntries(params));
    if(params.get('cursor')) { entered(); await waiting; }
    await route.fulfill({json:{ok:true,data:{items:params.get('query')==='nuova'?[{...paginaHfFixture(100,1)[0],repo:'ripresa/nuova'}]:params.get('cursor')?paginaHfFixture(20,5):paginaHfFixture(0,20),nextCursor:params.get('query')==='nuova'||params.get('cursor')?null:'seconda'}}});
  });
  await page.locator('#modelLabHfNextButtonControl').scrollIntoViewIfNeeded(); await pending;
  await page.locator('#modelLabHfSearch').fill('n');
  await expect(page.locator('#modelLabHfNextButtonControl')).toBeHidden();
  await page.locator('#modelLabHfSearch').fill('nuova'); await page.locator('#modelLabHfSearch').press('Enter');
  await expect(righe(page)).toHaveCount(1);release();
  await expect(righe(page)).toHaveCount(1);
  await expect(righe(page).first()).toContainText('nuova');
  await page.locator('#modelLabHfSearch').fill(''); await page.locator('#modelLabHfSearch').press('Enter');
  await expect(righe(page)).toHaveCount(20);
  await scegliCalm(page, '#modelLabHfSortControl', 'likes');
  await expect.poll(()=>calls.at(-1)?.sort).toBe('likes');
});

test('RIPRESA-HF-AZZERA — il comando visibile ripulisce query, server filter, ordine e faccette', async ({ page }) => {
  const calls = [];
  await page.route('**/api/v1/huggingface/search*', async route => {
    const params = new URL(route.request().url()).searchParams;
    calls.push(Object.fromEntries(params));
    await route.fulfill({ json: { ok: true, data: { items: params.get('query') === 'nessuno' ? [] : paginaHfFixture(0, 20), nextCursor: null } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached' });
  await page.evaluate(() => document.querySelector('.talos-sidebar [data-vaia="impostazioni"]')?.click());
  await page.evaluate(() => document.querySelector('[data-settings-tab="models"]')?.click());
  await page.locator('#labSchedaModels').click();
  await expect(righe(page)).toHaveCount(20);
  for (const ordine of ['likes', 'createdAt', 'lastModified', 'downloads', 'likes']) {
    await scegliCalm(page, '#modelLabHfSortControl', ordine);
    await expect.poll(() => calls.at(-1)?.sort).toBe(ordine);
  }
  await page.locator('#modelLabHfAuthorControl').fill('ripresa');
  await page.locator('#modelLabHfFiltersControl').fill('q4');
  await scegliFaccetta(page, 'parametri', '3-8b');
  await page.locator('#modelLabHfSearch').fill('nessuno');
  await page.locator('#modelLabHfSearch').press('Enter');
  await expect(page.locator('#vuotoHf')).toBeVisible();
  await page.locator('#vuotoHf [data-clear="hf"]').click();
  for (const id of ['modelLabHfSearch', 'modelLabHfAuthorControl', 'modelLabHfFiltersControl']) await expect(page.locator(`#${id}`)).toHaveValue('');
  await expect(page.locator('#modelLabHfSortControl')).toHaveValue('downloads');
  await expect(page.locator('[data-hf-faccetta="parametri"]')).toHaveValue('');
  expect(calls.some(c => c.query === 'nessuno' && c.sort === 'likes' && c.author === 'ripresa' && c.filter === 'q4')).toBe(true);
});
/** La riga di UN repository, per id: non `.nth(n)`, che dipende dall'ordine dei gruppi. */
const rigaDi = (page, repo) => page.locator(`#modelLabHfResults .talos-list-row[data-hf="${repo}"]`);

/*
 * ⛔ LE FACCETTE SONO VESTITE DA «CALM»: il `<select>` è la sorgente di stato nascosta e
 *   `#<id>--calm` è il combobox visibile. Le prove passano dal combobox e dalle opzioni ARIA; così
 *   verificano anche che il vestito inoltri davvero `input`/`change` alla sorgente.
 */
test.describe('la lista Hugging Face col disegno del mockup', () => {
  test('HF-LISTA-01 — la barra della scoperta, e i numeri sono contati sui risultati', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_VERI);

    /* I chip: la partizione dell'ambito, coi numeri CONTATI. Sono scritti per esteso perché è il
       fixture a essere vero, non il numero a essere comodo: `Tutti 8` non è una costante del
       disegno, è il conteggio di otto righe — e le righe sono otto. */
    const chip = await page.locator('[data-hf-chip]').evaluateAll((nodi) => nodi.map((b) => ({
      testo: b.textContent.trim(), valore: b.dataset.hfValore, gruppo: b.dataset.hfChip,
      conteggio: b.querySelector('.talos-badge')?.textContent ?? null, spento: b.disabled,
      acceso: b.getAttribute('aria-pressed') === 'true',
    })));
    expect(chip).toEqual([
      { testo: 'Tutti8', valore: '', gruppo: 'accesso', conteggio: '8', spento: false, acceso: true },
      { testo: 'Accesso aperto7', valore: 'aperto', gruppo: 'accesso', conteggio: '7', spento: false, acceso: false },
      { testo: 'Accesso richiesto0', valore: 'richiesto', gruppo: 'accesso', conteggio: '0', spento: true, acceso: false },
      { testo: 'Accesso non dichiarato1', valore: 'non-dichiarato', gruppo: 'accesso', conteggio: '1', spento: false, acceso: false },
      { testo: 'Con licenza7', valore: 'dichiarata', gruppo: 'licenza', conteggio: '7', spento: false, acceso: false },
      { testo: 'Senza licenza1', valore: 'non-dichiarata', gruppo: 'licenza', conteggio: '1', spento: false, acceso: false },
    ]);

    /* Le quattro faccette a select, con l'etichetta SOPRA (`.facet-select` del mockup), la prima voce
       «Qualsiasi» e i conteggi nelle voci. Una voce a ZERO non porta il numero: `(0)` si leggerebbe
       «contati: nessuno», mentre quel valore non è stato contato perché non c'è. */
    const faccette = await page.locator('[data-hf-faccetta]').evaluateAll((nodi) => nodi.map((s) => ({
      chiave: s.dataset.hfFaccetta,
      etichetta: s.closest('label')?.querySelector('span')?.textContent ?? null,
      prima: s.options[0].textContent, scelta: s.value,
      voci: [...s.options].slice(1).map((o) => [o.textContent, o.disabled]),
    })));
    expect(faccette.map((f) => [f.chiave, f.etichetta, f.prima, f.scelta])).toEqual([
      ['parametri', 'Parametri totali · miliardi', 'Qualsiasi', ''],
      ['popolarita', 'Popolarità · download', 'Qualsiasi', ''],
      ['tipo', 'Tipo · pipeline', 'Qualsiasi', ''],
      ['autore', 'Autore · organizzazione', 'Qualsiasi', ''],
    ]);
    expect(faccette[0].voci.at(-1)).toEqual(['Parametri non dichiarati (8)', false]);
    expect(faccette[0].voci.slice(0, -1).every(([, disabilitata]) => disabilitata)).toBe(true);
    expect(faccette[1].voci).toEqual([
      ['Oltre 100.000 (7)', false], ['Da 100.000 a 10.000', true], ['Da 10.000 a 1.000 (1)', false],
      ['Fino a 1.000', true], ['Download non dichiarati', true],
    ]);
    expect(faccette[2].voci).toEqual([['Immagini e testo (3)', false], ['Conversazione e codice (3)', false], ['Tipo non dichiarato (2)', false]]);
    expect(faccette[3].voci).toEqual([['unsloth (2)', false], ['cdiamond (1)', false], ['HauhauCS (1)', false], ['huihui-ai (1)', false], ['JonathanColetti (1)', false], ['lmstudio-community (1)', false], ['RichardErkhov (1)', false]]);

    /* La nota: dice a schermo ciò che la ricerca NON porta. È il posto dove il mockup ha
       «1B = un miliardo di parametri…», e la frase dev'essere la nostra. */
    await expect(page.locator('#modelLabHfScoperta p.talos-muted')).toContainText('parametri totali dichiarati');

    /* La testa dei risultati, e il pulsante di uscita che compare SOLO quando c'è qualcosa da
       azzerare: un comando sempre presente che non fa niente è un comando che mente. */
    await expect(page.locator('[data-hf-conteggio]')).toHaveText('8 modelli su 8 caricati');
    await expect(page.locator('[data-hf-azzera]')).toBeHidden();

    /* ⛔ I CONTROLLI VERI DI `app.js` SONO ANCORA AL LORO POSTO, coi loro id. La barra nuova è un
       SECONDO piano di comando: si mette sotto la riga che c'è già e non la sostituisce — se
       qualcuno rifacesse il markup, `cercaHuggingFaceModelLab` leggerebbe il vuoto e la ricerca
       smetterebbe di funzionare senza un errore da nessuna parte. */
    for (const id of ['modelLabHfSearch', 'modelLabHfSortControl', 'modelLabHfAuthorControl', 'modelLabHfFiltersControl', 'modelLabHfNextButtonControl', 'modelLabHfResults', 'modelLabHfDetail']) {
      await expect(page.locator(`#${id}`), `#${id}`).toHaveCount(1);
    }
    await expect(page.locator('.talos-toolbar--hf #modelLabHfSearch')).toHaveCount(1);
    /* E la barra nuova sta DOPO la riga dei comandi, non al posto suo: la testata, i comandi, la
       scoperta, il riquadro della lista. */
    const ordine = await page.evaluate(() => [...document.querySelector('#modelLabHfPanel').children].map((n) => n.id || n.className));
    expect(ordine[1]).toContain('talos-toolbar');
    expect(ordine[2]).toBe('modelLabHfScoperta');
    expect(ordine[3]).toContain('talos-split');
  });

  test('HF-LISTA-02 — OR dentro una faccetta, AND fra faccette, e la propria faccetta non si azzera', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_CON_GATED);
    await expect(righe(page)).toHaveCount(9);

    /* OR dentro: i tre valori della STESSA faccetta si sommano — 7 aperti + 1 richiesto + 1 non
       dichiarato = 9. L'assenza del metadato non viene scambiata per accesso aperto. È la
       prova che il conteggio di un valore non è un filtro esclusivo. */
    await chipDi(page, 'Accesso aperto').click();
    await expect(righe(page)).toHaveCount(7);
    await chipDi(page, 'Accesso richiesto').click();
    await expect(righe(page)).toHaveCount(8);
    await chipDi(page, 'Accesso non dichiarato').click();
    await expect(righe(page)).toHaveCount(9);
    await expect(chipDi(page, 'Accesso aperto')).toHaveAttribute('aria-pressed', 'true');
    await expect(chipDi(page, 'Accesso richiesto')).toHaveAttribute('aria-pressed', 'true');
    await expect(chipDi(page, 'Accesso non dichiarato')).toHaveAttribute('aria-pressed', 'true');

    /* AND fra faccette: si riparte senza filtri di accesso, si accende «Con licenza», e il risultato
       è l'INTERSEZIONE. Otto dei nove dichiarano la licenza (il gated della fixture dichiara
       «Gemma»); il nono è RichardErkhov, che non la dichiara. */
    await chipDi(page, 'Accesso aperto').click();
    await chipDi(page, 'Accesso richiesto').click();
    await chipDi(page, 'Accesso non dichiarato').click();
    await expect(righe(page)).toHaveCount(9);
    await chipDi(page, 'Con licenza').click();
    await expect(righe(page)).toHaveCount(8);
    await expect(rigaDi(page, 'RichardErkhov/model-hub_-_Mistral-7B-Instruct-v0.2-gguf')).toHaveCount(0);

    /* ⛔ IL CONTEGGIO DELLA PROPRIA FACCETTA NON SI AZZERA PER IL PROPRIO FILTRO. Con «Con licenza»
       acceso, «Senza licenza» deve continuare a dire quante ne resterebbero scegliendola (1), non 0:
       è la regola che permette di cambiare idea invece di vedersi sparire le voci davanti. */
    await expect(chipDi(page, 'Senza licenza')).toContainText('1');
    await expect(chipDi(page, 'Senza licenza')).not.toBeDisabled();
    /* ⛔ OR DENTRO LA STESSA FACCETTA NON RESTRINGE: ALLARGA. Accendendo anche «Senza licenza», che
       sta nella stessa faccetta di «Con licenza», la lista torna a nove — 8 + 1. È il verso che
       distingue una faccetta da un filtro esclusivo: due valori della stessa famiglia si sommano.
       (La prima stesura di questa prova si aspettava 1 riga qui, cioè il comportamento di un
       selettore a scelta unica: sarebbe stata una prova che pretende il difetto.) */
    await chipDi(page, 'Senza licenza').click();
    await expect(righe(page)).toHaveCount(9);
    await expect(chipDi(page, 'Con licenza')).toHaveAttribute('aria-pressed', 'true');
    await expect(chipDi(page, 'Senza licenza')).toHaveAttribute('aria-pressed', 'true');

    /* E l'ALTRA faccetta invece STRINGE: con entrambe le licenze accese, «Accesso richiesto»
       prende l'unico gated. */
    await chipDi(page, 'Accesso richiesto').click();
    await expect(righe(page)).toHaveCount(1);
    await expect(rigaDi(page, 'Community/Gemma-3-12B-GGUF')).toHaveCount(1);

    /* La faccetta a select filtra allo stesso modo, e il suo conteggio è quello degli altri filtri:
       con «Senza licenza» acceso, i tipi disponibili sono quelli di quell'unica riga. */
    await scegliFaccetta(page, 'tipo', 'text-generation');
    await expect(righe(page)).toHaveCount(1);
    await expect(page.locator('[data-hf-conteggio] strong')).toHaveText('1 modello');
  });

  test('HF-LISTA-03 — i valori a zero si GRIGIANO e restano a schermo, non si nascondono', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_VERI);
    /* Sui dati veri del 19/09/2026 nessuno dei 104 repository GGUF è «gated»: il chip c'è, dice 0,
       ed è spento — non sparisce. Un valore che sparisce dice «questo non esiste», che è falso:
       esiste nel vocabolario, e adesso non c'è niente dentro. */
    const richiesto = chipDi(page, 'Accesso richiesto');
    await expect(richiesto).toBeVisible();
    await expect(richiesto).toBeDisabled();
    await expect(richiesto).toHaveAttribute('title', 'Nessun repository con questo valore fra quelli caricati');
    await expect(richiesto).toContainText('0');
    /* Il chip spento NON filtra: premerlo non cambia la lista (il browser non emette il clic su un
       `disabled`, e la guardia nell'ascoltatore lo salta comunque). */
    await richiesto.click({ force: true });
    await expect(righe(page)).toHaveCount(8);

    /* E il ramo che i dati veri non portano — un repository davvero «gated» — si prova con
       l'oggetto minimo giusto: la fixture di casa. Chip acceso, badge sulla riga, tono d'avviso. */
    await disegna(page, RISULTATI_CON_GATED);
    const richiesto2 = chipDi(page, 'Accesso richiesto');
    await expect(richiesto2).toBeEnabled();
    await expect(richiesto2).toContainText('1');
    const rigaGated = page.locator('#modelLabHfResults .talos-list-row[data-hf="Community/Gemma-3-12B-GGUF"]');
    await expect(rigaGated.locator('.talos-badge')).toHaveText('Accesso richiesto');
    /* ⛔ In riga resta lo STATO, corto: la condizione estesa («Verifica le condizioni prima del
       download») sta nel callout `#hfAccesso` del pannello. Misurato il 19/09/2026: messa sulla riga,
       il testo andava a 325 px in una scatola da 320 e veniva tagliato a metà parola, senza i
       puntini — la riga è `nowrap` e non manda a capo. */
    await expect(rigaGated.locator('.talos-list-row__sub').nth(1)).toHaveText('Accesso richiesto');
    /* E il testo che dalla riga se n'è andato NON si è perso: il callout del pannello lo dice per
       intero (qui il dettaglio non è aperto, quindi il callout non è montato — la sua presenza è
       asserita da HF-LISTA-09; qui si asserisce che la riga non lo ripete, e non si taglia). */
    await expect(rigaGated.locator('.talos-dot')).toHaveClass(/talos-dot--warning/);
    /* E adesso il chip filtra davvero. */
    await richiesto2.click();
    await expect(righe(page)).toHaveCount(1);
  });

  test('HF-LISTA-04 — i gruppi: il tipo dichiarato, col conteggio, e ogni riga sotto il suo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_CON_GATED);

    const gruppi = await page.locator('[data-hf-gruppo]').evaluateAll((nodi) => nodi.map((g) => ({
      chiave: g.dataset.hfGruppo,
      titolo: g.querySelector('.talos-eyebrow')?.textContent,
      ruolo: g.querySelector('.talos-eyebrow')?.getAttribute('role'),
      livello: g.querySelector('.talos-eyebrow')?.getAttribute('aria-level'),
      conteggio: g.lastElementChild?.textContent,
    })));
    /* L'ordine è per numerosità: 4 «Conversazione e codice» · 3 «Immagini e testo» · 2 «Tipo non
       dichiarato». Le etichette sono quelle della faccetta «Tipo · pipeline»: la testa del gruppo e
       la voce del select dicono la stessa parola per la stessa cosa. */
    expect(gruppi).toEqual([
      { chiave: 'text-generation', titolo: 'Conversazione e codice', ruolo: 'heading', livello: '3', conteggio: '4' },
      { chiave: 'image-text-to-text', titolo: 'Immagini e testo', ruolo: 'heading', livello: '3', conteggio: '3' },
      { chiave: '__non-dichiarato', titolo: 'Tipo non dichiarato', ruolo: 'heading', livello: '3', conteggio: '2' },
    ]);

    /* ⛔ OGNI RIGA STA SOTTO IL GRUPPO A CUI APPARTIENE, e si verifica SCORRENDO L'ALBERO, non
       fidandosi del conteggio: un titolo che dice 4 con tre righe sotto è esattamente il difetto che
       questo controllo esiste per prendere. E nessuno resta fuori: 4 + 3 + 2 = 9 righe, tutte
       dentro un gruppo. */
    const albero = await page.locator('#modelLabHfResults').evaluate((l) => {
      const out = [];
      let gruppo = null;
      for (const n of l.children) {
        if (n.dataset?.hfGruppo) { gruppo = n.dataset.hfGruppo; continue; }
        if (n.classList?.contains('talos-list-row')) out.push({ gruppo, repo: n.dataset.hf });
      }
      return out;
    });
    expect(albero).toHaveLength(9);
    expect(albero.every((r) => r.gruppo !== null)).toBe(true);
    expect(albero[0].gruppo).toBe('text-generation');
    expect(albero.filter((r) => r.gruppo === 'text-generation')).toHaveLength(4);
    expect(albero.filter((r) => r.gruppo === 'image-text-to-text')).toHaveLength(3);
    expect(albero.filter((r) => r.gruppo === '__non-dichiarato')).toHaveLength(2);
    /* Il gated della fixture è `text-generation`, come il suo `pipelineTag` dice. */
    expect(albero.find((r) => r.repo === 'Community/Gemma-3-12B-GGUF').gruppo).toBe('text-generation');
    /* E i due senza tipo sono davvero i due senza tipo. */
    expect(albero.filter((r) => r.gruppo === '__non-dichiarato').map((r) => r.repo)).toEqual(['unsloth/Qwen3.8-27B-GGUF', 'lmstudio-community/Qwen3.8-27B-GGUF']);
  });

  test('HF-LISTA-05 — la riga: glifo, nome, badge, meta, stato col pallino, capacità, chevron', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_VERI);

    /* ⛔ PER ID, non `.nth(0)`: le righe sono raggruppate, e l'ordine dei gruppi è per numerosità —
       la prima riga a schermo non è la prima dei dati. Una prova che si ancora alla posizione
       diventa rossa il giorno che i dati cambiano di una riga, e quel rosso non parla di un difetto. */
    const riga = rigaDi(page, 'unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF');
    await expect(riga).toHaveAttribute('data-c', 'ListRow');
    await expect(riga.locator('.talos-list-row__icon')).toHaveCount(1);
    /* Il glifo: la scatola dell'icona, misurata. Il mockup la fa 38×38; qui è il blocco del design
       system (34×34) e la differenza è dichiarata nel referto, non nascosta. */
    expect(await riga.locator('.talos-list-row__icon').evaluate((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })).toEqual([34, 34]);
    await expect(riga.locator('.talos-list-row__title')).toHaveText('unsloth / Qwen3-Coder-30B-A3B-Instruct-GGUF');
    /* Tre righe di testo, come il `.model-row-copy` del mockup: nome (col badge), meta, stato. */
    await expect(riga.locator('.talos-list-row__text > *')).toHaveCount(3);
    await expect(riga.locator('.talos-list-row__sub').first()).toHaveText('Conversione della community');
    await expect(riga.locator('.talos-list-row__sub').nth(1)).toHaveText('Accesso aperto · Licenza apache-2.0');

    /* ⛔ IL PALLINO DELLO STATO — e si MISURA, non si guarda: `.talos-dot`
       (`design-system/controls.css:138`) dichiara `width`/`height`/`flex:none` e **nessun
       `display`** — è scritto per essere un FIGLIO DI FLEX. In un contenitore a blocco resta
       `inline`, e su una scatola inline `width`/`height` non si applicano: il pallino è nel DOM, si
       misura 6×6 con `getComputedStyle`, ed è INVISIBILE a schermo. Misurato il 19/09/2026 (foto
       `zoom-stato.png` senza pallino): per questo il genitore è `.talos-cluster`, `display:flex`. */
    const pallino = riga.locator('.talos-dot');
    await expect(pallino).toHaveClass(/talos-dot--sm/);
    await expect(pallino).toHaveClass(/talos-dot--success/);
    expect(await pallino.evaluate((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(n.parentElement).display]; })).toEqual([6, 6, 'flex']);

    /* La colonna delle capacità del mockup: un numero, la sua etichetta, e sotto un secondo fatto —
       i due numeri veri che la ricerca porta (download e preferiti). */
    expect(await riga.locator('[data-c="Capacity"]').evaluate((n) => [...n.children].map((c) => c.textContent))).toEqual(['12,7 M', 'download', '♥ 1 k preferiti']);
    await expect(riga.locator('.talos-hf-chevron')).toHaveCount(1);

    /* ⛔ E LE TRE RIGHE DI TESTO NON SI TAGLIANO. La riga è `nowrap` e non manda a capo
       (`talos-list-row__sub`), quindi un testo più lungo della scatola esce dai bordi senza
       nemmeno i puntini dell'ellissi: misurato il 19/09/2026 su un repository gated, 325 px di
       testo in 320 di scatola, tagliato a metà parola. Qui si misura su TUTTE le righe a schermo:
       `scrollWidth` non deve superare `clientWidth` — è il controllo che prende la prossima riga che
       cresce troppo, e che il 19/09 non c'era. */
    const cheSballano = await page.locator('#modelLabHfResults .talos-list-row__sub').evaluateAll((nodi) => nodi
      .map((n, i) => ({ i, testo: n.textContent.trim(), largo: n.scrollWidth, scatola: n.clientWidth }))
      .filter((x) => x.largo > x.scatola));
    expect(cheSballano).toEqual([]);

    /* La riga è un `<button>`: si preme, e l'etichetta accessibile dice le stesse cose a parole. */
    expect(await riga.evaluate((n) => n.tagName)).toBe('BUTTON');
    await expect(riga).toHaveAttribute('aria-label', 'unsloth / Qwen3-Coder-30B-A3B-Instruct-GGUF. Accesso aperto. 12,7 M download.');

    /* Nessuna riga dei dati veri porta il badge dell'accesso: non ce n'è una gated. La sua presenza
       si prova in HF-LISTA-03, sull'oggetto giusto. */
    await expect(page.locator('#modelLabHfResults .talos-badge', { hasText: 'Accesso richiesto' })).toHaveCount(0);
    /* E il badge che C'È sui dati veri è quello dell'autore del modello, sull'ottava riga. */
    await expect(rigaDi(page, 'RichardErkhov/model-hub_-_Mistral-7B-Instruct-v0.2-gguf').locator('.talos-badge')).toHaveText('Autore del modello');
  });

  test('HF-LISTA-06 — il clic esce dalla riga: il nodo, l’evento e cosa porta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_VERI);

    const riga = rigaDi(page, 'cdiamond/Qwen3.8-27B-iMatrix-NVFP4-MTP-GGUF');
    await expect(riga).toHaveAttribute('data-hf-revisione', 'ac343e8f44ca');
    await expect(riga).toHaveAttribute('data-author', 'cdiamond');
    await riga.click();

    /* UN clic, UNA chiamata: non due. Il doppione è il difetto classico delle righe-bottone. */
    expect(await page.evaluate(() => window.__hfClic)).toEqual(['cdiamond/Qwen3.8-27B-iMatrix-NVFP4-MTP-GGUF']);

    /* ⛔ E IL MODULO NON DECIDE LA DESTINAZIONE: non apre la pagina del modello da sé. Chi vuole
       portare la riga altrove ha due strade, e nessuna passa da questo file: sostituire la callback
       `seleziona` che `app.js` già passa in `renderizzaHfConMockup`, oppure delegare il clic su
       `#modelLabHfResults [data-hf]`. Il modulo mette a disposizione il nodo e i dati, non la rotta. */
    expect(await page.evaluate(() => Boolean(document.querySelector('#paginaModello') && !document.querySelector('#paginaModello').hidden))).toBe(false);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
  });

  test('HF-LISTA-07 — il conteggio dei risultati si ANNUNCIA, e cambia col filtro', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_CON_GATED);
    const conteggio = page.locator('[data-hf-conteggio]');
    await expect(conteggio).toHaveAttribute('role', 'status');
    await expect(conteggio).toHaveAttribute('aria-live', 'polite');
    await expect(conteggio).toHaveText('9 modelli su 9 caricati');

    await scegliFaccetta(page, 'tipo', 'text-generation');
    await expect(conteggio).toHaveText('4 modelli su 9 caricati');
    /* Il singolare/plurale: con un risultato solo si dice «1 modello», non «1 modelli». */
    await chipDi(page, 'Senza licenza').click();
    await expect(conteggio).toHaveText('1 modello su 9 caricati');
  });

  test('HF-LISTA-08 — «nessun risultato dai filtri» ≠ lista vuota: due stati, due frasi, e una via d’uscita', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await disegna(page, RISULTATI_VERI);

    /* Le opzioni a conteggio zero sono correttamente disabilitate, quindi questa combinazione non è
       producibile dal controllo visibile. Si inietta qui come stato difensivo (per esempio uno
       snapshot ereditato) per provare che il modulo offre comunque una via d'uscita. */
    await page.evaluate(() => {
      const panel = document.querySelector('#modelLabHfPanel');
      panel.__hfFiltri = { ...panel.__hfFiltri, tipo: ['image-text-to-text'], autore: ['lmstudio-community'] };
      const ultimo = panel.__hfUltimo;
      window.__hf.aggiornaHf(panel, ultimo.risultati, ultimo.opzioni);
    });
    await expect(righe(page)).toHaveCount(0);
    await expect(page.locator('#modelLabHfResults')).toContainText('Nessun repository corrisponde ai filtri scelti.');
    await expect(page.locator('[data-hf-conteggio]')).toHaveText('0 modelli su 8 caricati');
    /* Lo stato vuoto dell'app — quello di «non hai ancora cercato» — NON si mostra: è un'altra cosa,
       e mostrarlo direbbe che non c'è niente da cercare invece di «i tuoi filtri non prendono
       niente». */
    await expect(page.locator('#vuotoHf')).toBeHidden();

    /* La via d'uscita: il pulsante compare solo ora, e riporta tutto com'era. */
    const azzera = page.locator('[data-hf-azzera]');
    await expect(azzera).toBeVisible();
    await azzera.click();
    await expect(righe(page)).toHaveCount(8);
    await expect(azzera).toBeHidden();
    await expect(page.locator('[data-hf-faccetta="tipo"]')).toHaveValue('');
    await expect(page.locator('[data-hf-faccetta="autore"]')).toHaveValue('');
    await expect(chipDi(page, 'Tutti')).toHaveAttribute('aria-pressed', 'true');
  });

  test('HF-LISTA-09 — il pannello stretto non ha perso niente, e il blocco della scelta si monta anche fuori', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    const DETTAGLIO = {
      repo: 'unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF', revision: 'b17cb02dd882d5b6ab62fc777ad2995f19668350',
      license: 'apache-2.0', gated: false, downloads: 12729626, likes: 1034, pipelineTag: 'text-generation',
      files: [
        { path: 'Qwen3-Coder-Q4_K_M.gguf', sizeBytes: 18_600_000_000, sha256: 'a'.repeat(64) },
        { path: 'Qwen3-Coder-Q8_0.gguf', sizeBytes: 32_000_000_000, sha256: 'b'.repeat(64) },
      ],
    };
    await disegna(page, RISULTATI_VERI, { detail: DETTAGLIO, scelta: 'Qwen3-Coder-Q4_K_M.gguf' });

    /* Il pannello del repository è ancora quello di prima, coi suoi nodi e i suoi id: la scelta del
       file, la stima, lo scaricamento, «Tutti i file», il callout dell'accesso, la scheda. Niente è
       stato tolto: `app.js` li legge e li pilota, e li trova dov'erano. */
    await expect(page.locator('#modelLabHfDetail')).toBeVisible();
    for (const id of ['hfNome', 'hfAutore', 'hfLicenza', 'hfTuttiFile', 'hfFileChoices', 'hfStima', 'hfScarica', 'hfAccesso', 'hfScheda']) {
      await expect(page.locator(`#modelLabHfDetail #${id}`), `#${id}`).toHaveCount(1);
    }
    await expect(page.locator('#modelLabHfDetail #hfFileChoices [role="radio"]')).toHaveCount(2);
    await expect(page.locator('#modelLabHfDetail #hfScarica')).toContainText('Scarica sul computer');
    /* ⛔ L'ordine è quello di QUALITÀ DECRESCENTE, non quello dei nomi: in cima la variante PIÙ
       FEDELE (Q8_0, 8,5 bit per peso) e in fondo la più compressa (Q4_K_M, 4,5 + il suffisso). È la
       regola del 06/09 — l'API restituisce i file in ordine alfabetico, e `BF16 · 56,9 GB` finiva
       primo e preselezionato su una macchina che non poteva caricarlo. */
    const varianti = await page.locator('#modelLabHfDetail #hfFileChoices [role="radio"]').evaluateAll((nodi) => nodi.map((n) => n.dataset.variante));
    expect(varianti).toEqual(['Qwen3-Coder-Q8_0.gguf', 'Qwen3-Coder-Q4_K_M.gguf']);
    /* E la preselezione è la Q4_K_M che la prova ha chiesto (`scelta`), non la prima della lista. */
    await expect(page.locator('#modelLabHfDetail #hfFileChoices [role="radio"]').nth(1)).toHaveAttribute('aria-checked', 'true');

    /* ⛔ E IL BLOCCO DELLA SCELTA SI MONTA ANCHE FUORI, con un prefisso suo — è la ragione per cui è
       stato estratto (`montaSceltaFileHf`): nella PAGINA del modello la scheda «File del modello» è
       il suo posto. I nodi non si duplicano: due `#hfFileChoices` nel documento renderebbero
       `querySelector('#hfFileChoices')` una domanda senza risposta unica. */
    const fuori = await page.evaluate(async (dettaglio) => {
      const mod = await import('/__lab/hf-catalogo.js');
      const dove = document.createElement('div');
      dove.id = 'bancoCorsiaA';
      document.body.append(dove);
      const scelto = mod.montaSceltaFileHf(dove, dettaglio, { prefissoId: 'paginaModello' });
      const idDoppi = (() => { const v = {}; for (const n of document.querySelectorAll('[id]')) v[n.id] = (v[n.id] || 0) + 1; return Object.entries(v).filter(([, c]) => c > 1).map(([id]) => id); })();
      const esito = { scelto: scelto?.chiave ?? null, idSuoi: [...dove.querySelectorAll('[id]')].map((n) => n.id), radio: dove.querySelectorAll('[role="radio"]').length, idDoppi };
      dove.remove();
      return esito;
    }, DETTAGLIO);
    expect(fuori.scelto).toBe('Qwen3-Coder-Q4_K_M.gguf');
    expect(fuori.idSuoi.sort()).toEqual(['paginaModelloAccesso', 'paginaModelloFileChoices', 'paginaModelloScarica', 'paginaModelloStima']);
    expect(fuori.radio).toBe(2);
    /* Nessun ID DOPPIO introdotto dal montaggio fuori sede. `provider-body-openrouter` è un difetto
       PRE-ESISTENTE di un'altra superficie (misurato il 19/09/2026, non introdotto qui): si nomina
       invece di far finta di niente, e non si attribuisce a questa prova. */
    expect(fuori.idDoppi.filter((id) => id !== 'provider-body-openrouter')).toEqual([]);
  });

  test('HF-LISTA-10 — le difese del modulo provate a parte, sui casi che i dati veri non portano', async () => {
    /* Le funzioni PURE, in Node: sono le stesse che disegnano, ma qui si possono mettere alla prova
       sui casi che una ricerca vera non porta — un repository «gated», un insieme vuoto, un filtro
       rimasto da un'altra ricerca. L'oggetto minimo giusto: `RISULTATI_HF[1]` per il gated. */
    const mod = await import('../../src/components/hf-catalogo.js');
    const gated = RISULTATI_HF[1];
    const misto = [...RISULTATI_VERI, gated];
    const vuoti = mod.filtriHfVuoti();

    /* OR dentro: i tre valori di `accesso` sommati danno il totale; assente non significa aperto. */
    expect(mod.filtraRisultatiHf(misto, { ...vuoti, accesso: ['aperto', 'richiesto', 'non-dichiarato'] })).toHaveLength(9);
    /* AND fra: accesso ∧ licenza. */
    expect(mod.filtraRisultatiHf(misto, { ...vuoti, accesso: ['richiesto'], licenza: ['dichiarata'] })).toHaveLength(1);
    expect(mod.filtraRisultatiHf(misto, { ...vuoti, accesso: ['richiesto'], licenza: ['non-dichiarata'] })).toHaveLength(0);

    /* Il conteggio di una faccetta NON vede il filtro della sua stessa faccetta, ma vede gli altri:
       con «Con licenza» acceso, l'accesso si conta sugli 8 che dichiarano la licenza (7 aperti + 1
       richiesto), non su tutti e nove. */
    const soloDichiarate = { ...vuoti, licenza: ['dichiarata'] };
    expect([...mod.conteggiFaccettaHf(misto, soloDichiarate, 'accesso')]).toEqual([['aperto', 7], ['richiesto', 1]]);
    /* E la stessa faccetta, contata senza il proprio filtro, vede tutti e nove: le otto che la
       dichiarano e quella che non la dichiara. */
    expect([...mod.conteggiFaccettaHf(misto, soloDichiarate, 'licenza')]).toEqual([['dichiarata', 8], ['non-dichiarata', 1]]);
    /* Vista dall'altro lato: con «Accesso richiesto» acceso, la licenza si conta sull'unico gated. */
    const soloRichiesti = { ...vuoti, accesso: ['richiesto'] };
    expect([...mod.conteggiFaccettaHf(misto, soloRichiesti, 'licenza')]).toEqual([['dichiarata', 1]]);

    /* I gruppi: il tipo dichiarato e il non dichiarato, il gruppo vuoto che NON si disegna, e
       l'insieme vuoto che non produce gruppi. */
    expect(mod.raggruppaRisultatiHf(misto).map((g) => [g.chiave, g.righe.length])).toEqual([['text-generation', 4], ['image-text-to-text', 3], ['__non-dichiarato', 2]]);
    expect(mod.raggruppaRisultatiHf([])).toEqual([]);
    /* Nessuno resta fuori: la somma dei gruppi è il totale. */
    expect(mod.raggruppaRisultatiHf(misto).reduce((s, g) => s + g.righe.length, 0)).toBe(misto.length);

    /* La riga di un repository «gated»: il badge, il tono dello stato, la nota. */
    const riga = mod.datiRigaHf(gated);
    expect(riga.badge).toEqual({ testo: 'Accesso richiesto', tono: 'warning' });
    expect(riga.stato.tono).toBe('warning');
    expect(mod.datiRigaHf(RISULTATI_VERI[0]).stato.tono).toBe('success');

    /* Un filtro che non esiste più — un valore inventato, o un autore sparito dai risultati — si
       SCARTA: senza, un filtro rimasto da un'altra ricerca svuoterebbe la lista senza che nessun
       controllo a schermo lo mostri. */
    expect(mod.normalizzaFiltriHf({ accesso: ['boh', 'aperto', 'aperto'], autore: ['non-esiste'] }, RISULTATI_VERI)).toEqual({ ...vuoti, accesso: ['aperto'], autore: ['non-esiste'] });
  });

  test('HF-LISTA-11 — la lista vista nei due temi, a 1440 e a 1024', async ({ page }) => {
    test.setTimeout(120_000);
    await mkdir(CARTELLA_FOTO, { recursive: true });
    for (const [modo, tema] of [['dark', 'scuro'], ['light', 'chiaro']]) {
      for (const larghezza of [1440, 1024]) {
        await page.setViewportSize({ width: larghezza, height: 900 });
        await apriIlLaboratorio(page, { colorMode: modo });
        await disegna(page, RISULTATI_CON_GATED);
        /* Si scorre: la schermata delle impostazioni scorre dentro di sé, e una fotografia senza
           scorrere riprenderebbe la testata invece della lista. */
        await page.evaluate(() => {
          const lista = document.querySelector('#modelLabHfResults');
          const sc = [...document.querySelectorAll('*')].find((n) => { const s = getComputedStyle(n); return /auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 20 && n.contains(lista); });
          if (sc) sc.scrollTop = lista.getBoundingClientRect().top + sc.scrollTop - 300;
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(CARTELLA_FOTO, `hf-lista-${tema}-${larghezza}.png`) });
        /* ⛔ E LA FOTO SI GUARDA: la barra c'è, i chip hanno i loro numeri, i gruppi sono tre, e le
           righe sono nove. Una fotografia di una superficie vuota non prova niente. */
        await expect(page.locator('#modelLabHfScoperta')).toBeVisible();
        await expect(page.locator('[data-hf-chip]')).toHaveCount(6);
        await expect(page.locator('[data-hf-gruppo]')).toHaveCount(3);
        await expect(righe(page)).toHaveCount(9);
        /* E il tema è DAVVERO quello chiesto: nel chiaro la radice porta `data-theme="light"`. */
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(modo === 'light' ? 'light' : null);
      }
    }
  });
});

/*
 * ⛔ LE RICETTE DEL ROSSO — che cosa si rompe per far diventare rossa ogni difesa, e quali prove
 *    diventano rosse. MISURATE il 19/09/2026 rompendo il modulo una volta per ricetta, rilanciando
 *    questa prova intera e ripristinando al byte. Una difesa di cui non si sa far diventare rossa la
 *    prova non è una difesa: è una speranza.
 *
 *  R1  `aggiornaHf`, la riga `barra.aggiorna({...})` tolta → 01, 02, 03, 04, 07, 08 rosse: la barra
 *      resta coi numeri di prima, i select non si popolano, la testa non dice quanti sono.
 *  R2  `conteggiFaccettaHf`, `{ ...filtri, [chiave]: [] }` → `filtri` → 02 rossa: con «Con licenza»
 *      acceso, «Senza licenza» direbbe 0 invece di 1 — la voce che si è appena lasciata sparirebbe.
 *  R3  `normalizzaFiltriHf`, `scelti.filter(...)` → `scelti` → 08 rossa (un filtro può restare acceso
 *      su un vocabolario che non lo contiene) e 10 rossa.
 *  R4  `creaRigaHf`, il pallino fuori da `.talos-cluster` (figlio diretto del `__sub`) → 05 rossa
 *      sulla misura del pallino (scatola 0×0, `display` non `flex`). È la ricetta che il 19/09/2026
 *      ha trovato il DIFETTO VERO, non una sua parodia.
 *  R5  `raggruppaRisultatiHf`, senza l'ordinamento per numerosità → 04 rossa (l'ordine dei gruppi).
 *  R6  `chip`, `b.disabled = true` tolto → 03 rossa: il chip a zero diventa cliccabile e filtra.
 *  R7  `aggiornaHf`, il ramo `!visibili.length` tolto → 08 rossa (resterebbe la lista vuota senza
 *      dire perché, o la frase dell'altro stato).
 *  R8  `barraDelPannello` → `creaBarraScopertaHf` a ogni passata → 02 e 03 rosse: si perde la
 *      selezione del select a ogni ridisegno.
 *  R9  `creaGruppoHf`, `role`/`aria-level` tolti → 04 rossa.
 *  R10 `montaSceltaFileHf`, `idDi` → sempre `hf…` → 09 rossa sugli id (il montaggio fuori sede
 *      scrive `#hfFileChoices` una seconda volta).
 *  R11 `creaRigaHf`, `data-hf-revisione` tolto → 06 rossa.
 *  R12 `creaBarraScopertaHf`, `aria-live`/`role` tolti dal conteggio → 07 rossa.
 */


test('RIPRESA-HF-FILTRI-DIGITATI — autore e tag cercano senza Invio, Invio non duplica il timer', async ({ page }) => {
  const calls = [];
  await apriHfHttp(page, async route => {
    calls.push(Object.fromEntries(new URL(route.request().url()).searchParams));
    await route.fulfill({ json: { ok: true, data: { items: paginaHfFixture(0, 20), nextCursor: null } } });
  });
  const author = page.locator('#modelLabHfAuthorControl');
  await author.fill('publisher');
  await expect.poll(() => calls.filter(c => c.author === 'publisher').length).toBe(1);
  const tags = page.locator('#modelLabHfFiltersControl');
  await tags.fill('q4');
  await expect.poll(() => calls.filter(c => c.filter === 'q4').length).toBe(1);
  await tags.fill('q8');
  await tags.press('Enter');
  await expect.poll(() => calls.filter(c => c.filter === 'q8').length).toBe(1);
  await page.waitForTimeout(650);
  expect(calls.filter(c => c.filter === 'q8')).toHaveLength(1);
  await author.fill('');
  await expect.poll(() => calls.at(-1).author ?? '').toBe('');
});


test('RIPRESA-HF-FACCETTA-PERSISTENTE — autore della seconda pagina sopravvive a reload e rientro', async ({ page }) => {
  const repo = 'second-page/model';
  const revision = 'a'.repeat(40);
  let hold = false;
  const pending = [];
  const second = { items: [{ ...paginaHfFixture(20, 1)[0], repo }], nextCursor: null };
  await page.route('**/api/v1/huggingface/repo?**', route => route.fulfill({ json: { ok: true, data: {
    repo, revision, readme: '# Modello seconda pagina', files: [], gated: false, license: 'mit',
  } } }));
  await apriHfHttp(page, async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (cursor && hold) { pending.push(route); return; }
    await route.fulfill({ json: { ok: true, data: cursor ? second : { items: paginaHfFixture(0, 20), nextCursor: 'seconda' } } });
  });
  await page.locator('#modelLabHfNextButtonControl').scrollIntoViewIfNeeded();
  await expect(righe(page)).toHaveCount(21);
  await scegliFaccetta(page, 'autore', 'second-page');
  await expect(righe(page)).toHaveCount(1);
  await page.locator(`[data-hf="${repo}"]`).click();
  await expect(page.locator('#paginaModello')).toBeVisible();
  hold = true;
  await page.reload();
  await expect(page.locator('#paginaModello [data-modello-indietro]')).toBeVisible();
  await page.locator('#paginaModello [data-modello-indietro]').click();
  await expect(page.locator('#modelLabHfFaccetta-autore')).toHaveValue('second-page');
  await expect(page.locator('#modelLabHfFaccetta-autore--calm')).toContainText('second-page');
  await expect(righe(page)).toHaveCount(0);
  await page.locator('#modelLabHfNextButtonControl').scrollIntoViewIfNeeded();
  await expect.poll(() => pending.length).toBe(1);
  await pending[0].fulfill({ json: { ok: true, data: second } });
  await expect(righe(page)).toHaveCount(1);
  await expect(page.locator('#modelLabHfFaccetta-autore')).toHaveValue('second-page');
  await page.locator('[data-hf-azzera]').click();
  await expect(righe(page)).toHaveCount(21);
});
