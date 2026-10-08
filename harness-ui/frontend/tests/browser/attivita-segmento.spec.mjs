import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { test, expect } from '@playwright/test';

import { SCENE_ATTIVITA } from '../../lab/fixtures/attivita-compatta.js';

/*
 * R4 — SEGMENTO COMPATTO, FASE 2 (24/09/2026): le prove del PRODOTTO, con le stesse cinque scene del
 * laboratorio (`lab/fixtures/attivita-compatta.js`) rigiocate in `handleRealEvent` sul server di prova
 * (porta 4176, store temporaneo, chiavi in memoria: `playwright.config.mjs`). Nessuna scrittura verso il
 * server: ogni richiesta non-GET si ferma e si conta, e il conteggio deve restare 0.
 *
 * Scritte ROSSE il 24/09 prima della cura: ogni prova cita la decisione dell'owner che prova (D1…D14,
 * 23-24/09/2026) e ciò che oggi la fa fallire, misurato sul prodotto (documento di fase 1, §2.2).
 */
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const SEG = '#conversation .talos-activity--segment';

async function dueFotogrammi(page) {
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

/** Apre la app col tema chiesto e installa le rotte finte delle scene; torna il contatore dei non-GET. */
async function apri(page, { tema = 'dark', densita = null } = {}) {
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, densita }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it', ...(densita ? { uiDensity: densita } : {}) } }));
  }, { colorMode: tema, densita });
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const m = url.pathname.match(/\/api\/v1\/sessions\/att-(\w+)-[a-z0-9]+\/(events|metrics)/);
    if (m) {
      const scena = SCENE_ATTIVITA[m[1]];
      if (m[2] === 'metrics') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: scena.ragionamentiMs }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      }
      const storia = scena.vivo ? [CONFINE] : [...scena.eventi, CONFINE];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return contatore;
}

/** Rigioca una scena (storia dal server finto) o, per quella viva, la manda evento per evento con pause vere. */
async function scena(page, chiave, suffisso, { seguito = false } = {}) {
  const dati = SCENE_ATTIVITA[chiave];
  const id = `att-${chiave}-${suffisso}`;
  await page.evaluate(({ id, titolo }) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', titolo, 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
  }, { id, titolo: dati.titolo });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  if (dati.vivo) {
    for (const evento of dati.eventi) {
      await page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, evento);
      if (evento.type === 'ReasoningMessageStart') await page.waitForTimeout(1_200);
      if (evento.type === 'ToolCallResult') await page.waitForTimeout(250);
    }
    if (seguito) {
      /* Le stesse pause della prova V7 del prototipo (900 ms fra i passi): una ricerca che dura meno dei 700 ms
         dell'anti-lampeggio non compare mai nella riga, ed è giusto così (D12). */
      await page.waitForTimeout(1_000);
      for (const evento of dati.seguito) {
        await page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, evento);
        await page.waitForTimeout(evento.type === 'ReasoningMessageStart' ? 1_200 : 900);
      }
    }
  } else {
    const ultimo = dati.eventi.filter((e) => e.type === 'TextMessageContent').at(-1).delta.replace(/[*`]/g, '').slice(0, 24);
    await expect(page.locator('#conversation')).toContainText(ultimo, { timeout: 10_000 });
    await page.waitForTimeout(400); // le durate da `/metrics` arrivano DOPO la rigiocata
  }
  await dueFotogrammi(page);
}

test.describe('R4 segmento compatto — prodotto', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  /* Difetto 2 del 27/09 (owner, stessa notte: «1, 2 e 5 ora»): in una sessione RIGIOCATA le teste dei gruppi di attrezzi
     restavano visibili DENTRO il segmento. Dentro un segmento il livello del gruppo non esiste (`adottaSchedaNelSegmento`). */
  for (const chiave of ['breve', 'lungo', 'errore']) {
    test(`ATTIVITA-RIGIOCO-TESTE — ${chiave}: rigiocata, nessuna testa di gruppo visibile dentro il segmento`, async ({ page }) => {
      const c = await apri(page);
      await scena(page, chiave, `teste${chiave}`);
      const visibili = await page.locator(`${SEG} .talos-activity:not(.talos-activity--segment):not(.real-reasoning-note) > .talos-activity__head`)
        .evaluateAll((teste) => teste.filter((t) => !t.hidden && t.getBoundingClientRect().height > 0).map((t) => t.textContent.trim()));
      expect(visibili).toEqual([]);
      expect(c.nonGet, 'nessuna scrittura verso il server').toBe(0);
    });
  }

  test('ATTIVITA-D1-D2 — la riga chiusa dice il vero: elenco ≠ ricerca, modifica ≠ «altra azione», niente «completate», mai «…» in coda', async ({ page }) => {
    const c = await apri(page);
    await scena(page, 'lungo', 'd1');
    const testa = page.locator(`${SEG} > .talos-activity__head`);
    await expect(testa).toHaveCount(1);
    const descrizione = page.locator(`${SEG} .talos-activity__descrizione`);
    await expect(descrizione).toContainText('1 ricerca');
    await expect(descrizione).toContainText('1 cartella elencata');
    await expect(descrizione).toContainText('1 file modificato');
    await expect(descrizione).toContainText('3 ragionamenti (13 s)');
    const intera = await descrizione.textContent();
    expect(intera).not.toMatch(/altr[ae] azion|completat|2 ricerche/);
    const aSchermo = await page.locator(`${SEG} .talos-activity__conteggi`).first().textContent();
    expect(aSchermo).not.toMatch(/…$/);
    expect(aSchermo).not.toMatch(/altr[ae] azion|completat/);
    /* La forma adattiva: a 1024 px la riga passa alla breve invece di troncare (D1). */
    await page.setViewportSize({ width: 1024, height: 800 });
    await dueFotogrammi(page);
    await page.waitForTimeout(150);
    const stretta = await page.locator(`${SEG} .talos-activity__conteggi`).first().textContent();
    expect(stretta).not.toMatch(/…$/);
    expect(await page.locator(`${SEG} .talos-activity__conteggi`).first().evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    /* Il diff del segmento dai StateDelta veri (D2). */
    await expect(page.locator(`${SEG} .talos-activity__diff`)).toHaveText(/\+2\s*[−-]1/);
    // LINGUA-7 (08/10/2026): a voce, ogni numero col suo plurale — «2 righe aggiunte, 1 tolta», non «1 tolte»
    await expect(page.locator(`${SEG} .talos-activity__diff`)).toHaveAttribute('aria-label', '2 righe aggiunte, 1 tolta');
    expect(c.nonGet, 'nessuna scrittura verso il server').toBe(0);
  });

  test('ATTIVITA-D3 — l\'errore si legge a segmento CHIUSO: conteggio rosso e voce fissata; il clic apre, apre la voce e dà il fuoco', async ({ page }) => {
    await apri(page, { tema: 'light' });
    await scena(page, 'errore', 'd3');
    const seg = page.locator(SEG);
    await expect(seg).toHaveCount(1);
    await expect(seg.locator(':scope > .talos-activity__head')).toHaveAttribute('aria-expanded', 'false');
    await expect(seg.locator('.talos-activity__errore')).toHaveText(/1 comando non riuscito/);
    const fissata = seg.locator(':scope > .talos-activity__fissate .talos-activity__fissata');
    await expect(fissata).toHaveCount(1);
    await expect(fissata).toBeVisible();
    await expect(fissata).toContainText('Esegue i test unitari del frontend');
    await expect(fissata).toContainText('exit 1');
    const altezza = await seg.evaluate((s) => s.getBoundingClientRect().height);
    expect(altezza, 'chiuso con la voce fissata: sotto i 70 px (oggi 172 aperto da solo)').toBeLessThanOrEqual(70);
    await fissata.click();
    await expect(seg.locator(':scope > .talos-activity__head')).toHaveAttribute('aria-expanded', 'true');
    const fallita = seg.locator('[data-voce][data-tool-state="error"]');
    await expect(fallita).toHaveAttribute('aria-expanded', 'true');
    await expect(fallita).toBeFocused();
    await expect(seg.locator(':scope > .talos-activity__fissate')).toBeHidden();
    await expect(seg).toContainText('✖ ragionamento.test.mjs');
  });

  test('ATTIVITA-D4-D13 — scheda da 32 px con testa a 30, voci da 28 px normale e 24 compatta, icone da 16', async ({ page }) => {
    await apri(page);
    await scena(page, 'breve', 'd4');
    const seg = page.locator(SEG);
    const misure = await seg.evaluate((s) => ({
      scheda: s.getBoundingClientRect().height,
      testa: s.querySelector(':scope > .talos-activity__head').getBoundingClientRect().height,
    }));
    expect(Math.round(misure.testa)).toBe(30);
    expect(Math.round(misure.scheda)).toBe(32);
    await seg.locator(':scope > .talos-activity__head').click();
    const righe = seg.locator('[data-voce]');
    await expect(righe).toHaveCount(3);
    for (const h of await righe.evaluateAll((r) => r.map((x) => x.getBoundingClientRect().height))) expect(Math.round(h)).toBe(28);
    for (const w of await seg.locator('[data-voce] .talos-tool-row__icon, [data-voce] .talos-voce__icona').evaluateAll((r) => r.map((x) => x.getBoundingClientRect().width))) expect(Math.round(w)).toBe(16);
    await page.evaluate(() => document.documentElement.setAttribute('data-densita', 'compatta'));
    await dueFotogrammi(page);
    for (const h of await righe.evaluateAll((r) => r.map((x) => x.getBoundingClientRect().height))) expect(Math.round(h)).toBe(24);
    /* Le voci si leggono come verbo + oggetto, non come conteggi annidati. */
    const testi = await righe.allTextContents();
    expect(testi.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ')).toMatch(/Cercato\s*«aggiornaRiassuntoSegmento».*Cercato\s*«formattaConteggioAttivita».*Ha ragionato per 3 s/);
    expect(testi.join(' ')).not.toMatch(/1 ricerca completata/);
  });

  test('ATTIVITA-D5 — i filtri per specie compaiono solo da 6 voci: «Ragionamenti 3» mostra tre voci e lo dice', async ({ page }) => {
    await apri(page);
    await scena(page, 'breve', 'd5a');
    await page.locator(`${SEG} > .talos-activity__head`).click();
    await expect(page.locator(`${SEG} .talos-activity__filtri`)).toBeHidden();
    await scena(page, 'lungo', 'd5b');
    const seg = page.locator(SEG);
    await seg.locator(':scope > .talos-activity__head').click();
    const filtri = seg.locator('.talos-activity__filtri');
    await expect(filtri).toBeVisible();
    await expect(filtri.locator('.talos-filtro[data-filtro="tutte"]')).toHaveText('Tutte 9');
    const ragionamenti = filtri.locator('.talos-filtro[data-filtro="ragionamento"]');
    await expect(ragionamenti).toHaveText('Ragionamenti 3');
    await ragionamenti.click();
    await expect(ragionamenti).toHaveAttribute('aria-pressed', 'true');
    await expect(seg.locator('[data-voce]:visible')).toHaveCount(3);
    await expect(seg.locator('.talos-activity__nota')).toHaveText('Mostrate 3 voci su 9.');
    await filtri.locator('.talos-filtro[data-filtro="tutte"]').click();
    await expect(seg.locator('[data-voce]:visible')).toHaveCount(9);
  });

  test('ATTIVITA-D6 — «⋯» invisibile a riposo, menu di casa con tasto destro e frecce; «Apri tutti i ragionamenti»; «Copia» e «Review» solo coi diff', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await apri(page);
    await scena(page, 'lungo', 'd6');
    const seg = page.locator(SEG);
    const altro = seg.locator(':scope > .talos-activity__altro');
    await expect(altro).toHaveCount(1);
    expect(await altro.evaluate((b) => getComputedStyle(b).opacity)).toBe('0');
    await seg.locator(':scope > .talos-activity__head').hover();
    await expect.poll(() => altro.evaluate((b) => getComputedStyle(b).opacity)).toBe('1');
    /* Ciò che sta nel menu non resta anche in riga (D6). */
    await expect(seg.locator(':scope > .talos-activity__head button, :scope > .talos-activity__head [role="button"]')).toHaveCount(0);
    await altro.focus();
    await page.keyboard.press('Enter');
    const menu = page.locator('[role="menu"].talos-menu-azioni');
    await expect(menu).toBeVisible();
    const voci = menu.locator('[role="menuitem"]');
    await expect(voci).toHaveText(['Apri tutti i ragionamenti', 'Apri tutte le voci', 'Chiudi tutte le voci', 'Copia l’attività come testo', 'Apri le modifiche in Review']);
    await expect(voci.first()).toBeFocused();
    await page.waitForTimeout(60); // il menu di casa aggancia le frecce un tick dopo l'apertura (`apriMenuAzioni`, `setTimeout(0)`)
    await page.keyboard.press('ArrowDown');
    await expect(voci.nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(altro).toBeFocused();
    await seg.locator(':scope > .talos-activity__head').click({ button: 'right' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Apri tutti i ragionamenti' }).click();
    await expect(seg.locator(':scope > .talos-activity__head')).toHaveAttribute('aria-expanded', 'true');
    await expect(seg.locator('.real-reasoning-note > .talos-activity__head[aria-expanded="true"]')).toHaveCount(3);
    /* ⛔ Trovato dalla FOTO (`confronto-prodotto-lungo-S2-1920x1080-dark.png`, 24/09), non da una prova: aperto dal menu
       il ragionamento mostrava il testo GREZZO («**Cerco dove…**»), perché il markdown si montava solo sul clic della
       testa. Ora ogni apertura programmatica annuncia `talos:voce-aperta` e `app.js` monta (D14). */
    await expect(seg.locator('.real-reasoning-note').first().locator('.tool-note-detail strong')).toHaveText('Cerco dove nasce la categoria');
    await expect(seg.locator('.real-reasoning-note').first().locator('.tool-note-detail')).not.toContainText('**');
    await expect(seg.locator('[data-voce="attrezzo"][aria-expanded="true"]')).toHaveCount(0);
    await altro.click();
    await menu.getByRole('menuitem', { name: 'Chiudi tutte le voci' }).click();
    await expect(seg.locator('.real-reasoning-note > .talos-activity__head[aria-expanded="true"]')).toHaveCount(0);
    await altro.click();
    await menu.getByRole('menuitem', { name: 'Copia l’attività come testo' }).click();
    const copiato = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiato).toContain('- Letto harness-ui/frontend/src/legacy/app.js');
    expect(copiato).toContain('- Ha ragionato per 4 s: Cerco dove nasce la categoria');
    expect(copiato).toContain('- Elencato harness-ui/frontend/tests/unit/');
    /* Senza diff la voce «Review» non c'è: la scena breve non scrive niente. */
    await scena(page, 'breve', 'd6b');
    await page.locator(`${SEG} > .talos-activity__altro`).click();
    await expect(page.locator('[role="menu"].talos-menu-azioni [role="menuitem"]')).toHaveCount(4);
    await page.keyboard.press('Escape');
  });

  test('ATTIVITA-D7 — il corpo chiuso è hidden="until-found": un frammento dentro un segmento chiuso apre segmento e voce', async ({ page }) => {
    await apri(page);
    await scena(page, 'lungo', 'd7');
    const seg = page.locator(SEG);
    const corpo = seg.locator(':scope > .talos-activity__body');
    await expect(corpo).toHaveAttribute('hidden', 'until-found');
    expect(await corpo.evaluate((c) => getComputedStyle(c).display)).not.toBe('none');
    /* Il testo dei dettagli è nel documento anche da chiuso (`textContent`), com'è già per il ragionamento. */
    expect(await seg.evaluate((s) => s.textContent.includes("return 'cercato'"))).toBe(true);
    /* L'ancora va su un FIGLIO del dettaglio: l'`id` del `<pre>` è il suo `aria-controls`, e cambiarlo spezzerebbe il
       legame riga → corpo (la prima versione di questa prova lo faceva, e falliva per colpa sua). */
    const info = await page.evaluate(() => {
      const pre = [...document.querySelectorAll('#conversation .talos-activity--segment .tool-note-detail')].find((p) => p.textContent.includes("return 'cercato'"));
      const dentro = [...pre.querySelectorAll('code')].find((c) => c.textContent.includes("return 'cercato'")) || pre.firstElementChild;
      dentro.id = 'trovami';
      const riga = pre.previousElementSibling;
      return { riga: riga?.getAttribute('aria-expanded'), nascosto: pre.getAttribute('hidden') };
    });
    expect(info).toEqual({ riga: 'false', nascosto: 'until-found' });
    await page.evaluate(() => { location.hash = 'trovami'; });
    await expect(seg.locator(':scope > .talos-activity__head')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#trovami')).toBeVisible();
    expect(await page.locator('#trovami').evaluate((c) => c.closest('.tool-note-detail').previousElementSibling.getAttribute('aria-expanded'))).toBe('true');
    /* Chiudere a mano rimette `until-found`, non un `hidden` cieco: la ricerca deve trovare ancora. */
    await seg.locator(':scope > .talos-activity__head').click();
    await expect(corpo).toHaveAttribute('hidden', 'until-found');
  });

  test('ATTIVITA-D8 — lo stato aperto/chiuso vive solo in memoria: dopo la ricarica è tutto chiuso e niente finisce nello storage', async ({ page }) => {
    await apri(page);
    await scena(page, 'lungo', 'd8');
    const seg = page.locator(SEG);
    await seg.locator(':scope > .talos-activity__head').click();
    await seg.locator('[data-voce]').first().click();
    await expect(seg.locator('[data-voce][aria-expanded="true"]')).toHaveCount(1);
    const chiaviPrima = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)));
    await page.reload();
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
    await scena(page, 'lungo', 'd8');
    await expect(page.locator(`${SEG} > .talos-activity__head`)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`${SEG} [data-voce][aria-expanded="true"]`)).toHaveCount(0);
    const chiaviDopo = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)));
    expect(chiaviDopo.filter((k) => /attivit|segment|disclosure/i.test(k))).toEqual([]);
    expect(chiaviDopo.length).toBe(chiaviPrima.length);
  });

  test('ATTIVITA-D11-D12 — dal vivo: verbo al presente in testa, testa sempre a 30 px, mai «concluso» fra due chiamate, tempo misurato', async ({ page }) => {
    await apri(page);
    const campioni = [];
    const leggi = async () => campioni.push(await page.locator(SEG).first().evaluate((s) => ({
      testa: Math.round(s.querySelector(':scope > .talos-activity__head').getBoundingClientRect().height),
      adesso: s.querySelector('.talos-activity__adesso')?.textContent ?? '',
      stato: s.dataset.stato,
    })).catch(() => null));
    const orologio = setInterval(() => { void leggi(); }, 300);
    await scena(page, 'vivo', 'd11', { seguito: true });
    clearInterval(orologio);
    await page.waitForTimeout(400);
    await leggi();
    const validi = campioni.filter(Boolean);
    expect(validi.length).toBeGreaterThan(8);
    expect([...new Set(validi.map((c) => c.testa))], 'altezze della testa viste').toEqual([30]);
    const frasi = validi.map((c) => c.adesso).filter(Boolean);
    expect(frasi.some((f) => /^Cerca «R4-CHAT-ACTIVITY-ERROR»…$/.test(f)), frasi.join(' | ')).toBe(true);
    expect(frasi.some((f) => /^Sta ragionando/.test(f)), frasi.join(' | ')).toBe(true);
    expect(frasi.some((f) => /^Legge /.test(f)), frasi.join(' | ')).toBe(true);
    const primoConcluso = validi.findIndex((c) => c.stato === 'concluso');
    expect(primoConcluso, 'a giro finito il segmento è concluso').toBeGreaterThan(0);
    expect(validi.slice(primoConcluso).every((c) => c.stato === 'concluso'), validi.map((c) => c.stato).join(' ')).toBe(true);
    const ultimo = validi.at(-1);
    expect(ultimo.adesso).toBe('');
    /* Il tempo del segmento: misurato dal vivo, e presente solo qui (mai in una rigiocata: vedi D1). */
    await expect(page.locator(SEG).first().locator('.talos-activity__tempo')).toHaveText(/^\d+ s$/);
    await scena(page, 'breve', 'd11b');
    await expect(page.locator(`${SEG} .talos-activity__tempo`)).toHaveText('');
  });

  test('ATTIVITA-D14 — il ragionamento aperto è prosa: carattere di testo a 13 px, markdown col renderer condiviso, mai monospazio', async ({ page }) => {
    await apri(page);
    await scena(page, 'lungo', 'd14');
    const seg = page.locator(SEG);
    await seg.locator(':scope > .talos-activity__head').click();
    const testaRagionamento = seg.locator('.real-reasoning-note > .talos-activity__head').first();
    await testaRagionamento.click();
    const corpo = seg.locator('.real-reasoning-note').first().locator('.tool-note-detail');
    await expect(corpo).toBeVisible();
    await expect(corpo.locator('strong')).toHaveText('Cerco dove nasce la categoria');
    const stile = await corpo.evaluate((c) => { const s = getComputedStyle(c); return { size: s.fontSize, family: s.fontFamily, wrap: s.whiteSpace }; });
    expect(stile.size).toBe('13px');
    expect(stile.family).not.toMatch(/mono|Consolas/i);
    expect(stile.wrap).not.toBe('pre-wrap');
    /* Aperto, il titolo nella riga non si ripete sotto se stesso (la voce mostra il corpo). */
    expect(await testaRagionamento.evaluate((t) => getComputedStyle(t.querySelector('.talos-voce__oggetto')).visibility)).toBe('hidden');
    /* Il dettaglio di un attrezzo resta nel monospazio, col tetto di 240 px. */
    const attrezzo = seg.locator('[data-voce="attrezzo"]').first();
    await attrezzo.click();
    const pre = seg.locator('[data-voce="attrezzo"][aria-expanded="true"] + .tool-note-detail');
    await expect(pre).toBeVisible();
    expect(await pre.evaluate((p) => getComputedStyle(p).maxHeight)).toBe('240px');
  });

  test('ATTIVITA-V1 — tastiera: Invio apre, ↓ alla prima voce, frecce, Home/End, → apre, ← chiude e poi torna alla testa, Esc alla testa, Tab invariato', async ({ page }) => {
    await apri(page);
    await scena(page, 'lungo', 'v1');
    const seg = page.locator(SEG);
    const testa = seg.locator(':scope > .talos-activity__head');
    await testa.focus();
    await page.keyboard.press('Enter');
    await expect(testa).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    const righe = seg.locator('[data-voce]');
    await expect(righe.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(righe.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(righe.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(righe.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(righe.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(righe.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowLeft');
    await expect(testa).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(testa).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(seg.locator(':scope > .talos-activity__altro')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(seg.locator('.talos-filtro[data-filtro="tutte"]')).toBeFocused();
  });

  test('ATTIVITA-A11Y — axe-core: nessuna violazione grave o critica nei due temi, segmento aperto con voci e dettagli', async ({ page }) => {
    for (const tema of ['dark', 'light']) {
      await apri(page, { tema });
      await scena(page, 'errore', `axe${tema}`);
      const seg = page.locator(SEG);
      await seg.locator(':scope > .talos-activity__head').click();
      for (const r of await seg.locator('[data-voce]').all()) await r.click();
      /* La CSP della pagina (`script-src 'self' 'nonce-…'`) blocca uno script inline: axe si serve dalla stessa origine. */
      await page.route('**/__axe.min.js', (route) => route.fulfill({ contentType: 'application/javascript', body: AXE }));
      await page.addScriptTag({ url: '/__axe.min.js' });
      const violazioni = await page.evaluate(async () => {
        const ris = await window.axe.run(document.querySelector('#conversation .talos-turn[data-turno="talos"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
        return ris.violations.map((v) => ({ id: v.id, impatto: v.impact, esempio: v.nodes[0]?.target?.join(' ') }));
      });
      expect(violazioni.filter((v) => v.impatto === 'critical' || v.impatto === 'serious'), tema).toEqual([]);
    }
  });

  test('ATTIVITA-CONTRATTO — Inspector e spine contano ancora i giri; il segmento è UNO per giro; GAP-09 a 16 px; una voce sola resta nuda', async ({ page }) => {
    await apri(page);
    await scena(page, 'narrata', 'ctr');
    await expect(page.locator(SEG)).toHaveCount(5);
    /* La spina numera i gruppi di attrezzi (`nellaChat`, `eBloccoDiGiro`): cinque nella scena narrata, misurati il 24/09 PRIMA della cura — il contratto non cambia. */
    await expect(page.locator('#conversation .talos-turn[data-turno="talos"] .talos-turn-spine__n')).toHaveCount(5);
    const respiri = await page.evaluate(() => {
      const a = [...document.querySelectorAll('#conversation .talos-message > .talos-activity--segment + .talos-message__copy')].map((c) => c.getBoundingClientRect().top - c.previousElementSibling.getBoundingClientRect().bottom);
      const b = [...document.querySelectorAll('#conversation .talos-message > .talos-message__copy + .talos-activity--segment')].map((c) => c.getBoundingClientRect().top - c.previousElementSibling.getBoundingClientRect().bottom);
      return { a: a.map((x) => Math.round(x)), b: b.map((x) => Math.round(x)) };
    });
    expect(respiri.a.every((x) => x >= 16 && x <= 20), JSON.stringify(respiri)).toBe(true);
    expect(respiri.b.every((x) => x >= 16 && x <= 20), JSON.stringify(respiri)).toBe(true);
    expect(respiri.a.length + respiri.b.length).toBe(10);
    await expect(page.locator('#inspectorPanel')).toContainText('Indice dei giri');
  });
});
