/*
 * PANNELLO DI DESTRA v2 — la scheda PROCESSI nell'app vera (owner 29/10/2026: «prevedi tutti gli Edge cases»). Gli eventi entrano
 * dalla porta vera (`handleRealEvent`), le risorse e le porte dalla rotta vera (`GET …/processes/resources`, finta nel contenuto);
 * ogni scrittura si ferma e si conta. Casi limite: vuoto, uno, tantissimi (pagine al posto del tetto di 40), comando lunghissimo e
 * con caratteri strani, 900×600 e 1920×1080, chiaro e scuro, inglese, filtro per stato e ricerca che svuotano, porte (P-05), CPU nel
 * tempo (P-04), «Ferma tutti» con un comando che finisce intanto, processo che esce con la riga a vista, cambio di sessione, la misura
 * del ridisegno con 40 comandi e una sessione di 1000+ giri.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'pannello-processi');
const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const ID = 'pnpr-uno';

async function scena(page, { comandi = 6, finiti = 2, larghezza = 1440, altezza = 900, tema = 'dark', lingua = 'it', giri = 1, porte = { 'c-0': [5173] }, risorse = true } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode, lingua }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: lingua } })); } catch { /* */ }
  }, { colorMode: tema, lingua });
  const conto = { ferma: [], togli: [], altre: [], risorse: 0 };
  await page.routeWebSocket(/.*/u, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    const m = percorso.match(/^\/api\/v1\/sessions\/(pnpr-[^/]+)\/(.+)$/u);
    if (m && req.method() === 'POST') {
      const a = m[2].match(/^processes\/([^/]+)\/(stop|remove|sfondo)$/u);
      if (a?.[2] === 'stop') { conto.ferma.push(a[1]); return route.fulfill({ json: busta({ stopped: true }) }); }
      if (a?.[2] === 'remove') { conto.togli.push(a[1]); return route.fulfill({ json: busta({ removed: true }) }); }
    }
    if (req.method() !== 'GET') { conto.altre.push(percorso); return route.abort(); }
    /* la storia della sessione finisce col suo confine, come quella del server: senza, la colonna resta «in rigiocata» e non si
       ridisegna più (B1, `disegnaInspectorAdesso`) e gli eventi di dopo non arriverebbero a schermo */
    if (m?.[2] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 1 })}\n\n` });
    if (m?.[2] === 'processes/resources') {
      conto.risorse += 1;
      if (!risorse) return route.fulfill({ status: 503, json: { ok: false, error: { code: 'UNAVAILABLE' } } });
      return route.fulfill({ json: busta({ metodo: 'cim', misuratoAlle: new Date().toISOString(), processi: Array.from({ length: comandi }, (_, i) => ({ toolCallId: `c-${i}`, cpuPercento: 2 + (i % 7) + conto.risorse, memoriaByte: (40 + i) * 1_048_576, processi: 2, porte: porte[`c-${i}`] ?? [] })) }) });
    }
    if (m?.[2] === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
    return route.continue();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'PNPR', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
  }, ID);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await page.evaluate(({ comandi, finiti, giri }) => {
    const r = window.__talosHarnessUiRuntime;
    const g = r.realSessionState.generation;
    let s = 2;
    const ev = (e) => r.handleRealEvent({ ...e, _sequenza: s++ }, g);
    for (let k = 1; k < giri; k += 1) { ev({ type: 'RunStarted', input: { consegna: `giro ${k}` } }); ev({ type: 'TextMessageContent', messageId: `m${k}`, delta: `risposta ${k}` }); ev({ type: 'RunFinished' }); }
    ev({ type: 'RunStarted', input: { consegna: 'Avvia tutto' } });
    for (let i = 0; i < comandi; i += 1) {
      ev({ type: 'ToolCallStart', toolCallId: `c-${i}`, toolCallName: 'shell', giro: giri, avviatoA: Date.now() - (i + 1) * 61_000 });
      const comando = i === 1 ? `node "C:\\Program Files\\nodejs\\a b.js" --titolo="📊 <b>x</b>" ${'--opzione-lunghissima '.repeat(30)}` : `npm run lavoro-${i}`;
      ev({ type: 'ToolCallArgs', toolCallId: `c-${i}`, delta: JSON.stringify(i % 2 ? { comando } : { comando, descrizione: `Comando numero ${i}` }) });
      if (i >= comandi - finiti) ev({ type: 'ToolCallResult', toolCallId: `c-${i}`, content: i % 3 ? 'exit 1' : 'exit 0', uscita: i % 3 ? 1 : 0 });
    }
  }, { comandi, finiti, giri });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="processi"]').click();
  await expect(page.locator('#railProcessi .pn-testa'), 'premessa: la scheda v2 si è disegnata').toBeVisible({ timeout: 10_000 });
  return conto;
}
const scheda = (page) => page.locator('#railProcessi');
const riga = (page, id) => page.locator(`#railProcessi .pn-riga[data-chiave="${id}"]`);
const menu = (page) => page.locator('.ft-actions-menu');

test('PNPR-01 — testa, «Accesi» di serie, filtro per stato con i soli stati presenti, ricerca che svuota detta onestamente', async ({ page }) => {
  const conto = await scena(page);
  await expect(scheda(page).locator('.pn-grande')).toContainText('4');
  await expect(scheda(page).locator('[data-sezione="finiti"]'), 'ambito di serie: accesi').toHaveCount(0);
  await scheda(page).locator('[data-controllo="filtra-stato"]').click();
  const voci = await menu(page).locator('[role="menuitem"]').allInnerTexts();
  expect(voci[0]).toMatch(/Tutti gli stati/u);
  expect(voci.length, `solo gli stati presenti (+ «Tutti»): ${JSON.stringify(voci)}`).toBeLessThanOrEqual(4);
  await menu(page).locator('[role="menuitem"]', { hasText: /Non riuscito/u }).click();
  await expect(scheda(page).locator('.pn-conto')).toContainText('solo «Non riuscito»');
  await expect(scheda(page).locator('[data-controllo="ambito-tutti"]'), 'scegliere uno stato porta l’ambito a «Tutti»').toHaveAttribute('aria-pressed', 'true');
  await scheda(page).locator('[data-controllo="apri-cerca"]').click();
  await scheda(page).locator('[data-controllo="campo-cerca"]').fill('nessun comando si chiama così');
  await expect(scheda(page).locator('.pn-vuoto')).toContainText('nessun comando si chiama così');
  expect(conto.altre).toEqual([]);
});

test('PNPR-02 — CPU e memoria, il mini-grafico dell’ultimo minuto (P-04) e il chip della porta (P-05) solo dove c’è', async ({ page }) => {
  const conto = await scena(page);
  await expect.poll(() => conto.risorse, { timeout: 8_000, message: 'premessa: la rotta delle risorse è stata letta' }).toBeGreaterThan(0);
  await expect(riga(page, 'c-0').locator('.pn-chip--porta')).toContainText('localhost:5173', { timeout: 8_000 });
  await expect(riga(page, 'c-2').locator('.pn-chip--porta'), 'senza porta in ascolto nessun chip (niente di inventato)').toHaveCount(0);
  await expect(riga(page, 'c-0').locator('.pn-lato')).toContainText('MB');
  await expect.poll(() => riga(page, 'c-0').locator('svg.pn-scintilla polyline').count(), { timeout: 12_000, message: 'dopo due letture la storia della CPU si disegna' }).toBeGreaterThan(0);
});

test('PNPR-03 — risorse che rispondono errore: nessun numero, nessuna porta, nessun errore a schermo', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  await scena(page, { risorse: false });
  await page.waitForTimeout(2_000);
  await expect(scheda(page).locator('.pn-chip--porta')).toHaveCount(0);
  await expect(riga(page, 'c-0').locator('.pn-lato'), 'senza misura resta la durata, mai una percentuale').not.toContainText('%');
  expect(errori).toEqual([]);
});

test('PNPR-04 — «Ferma tutti quelli accesi»: conferma sotto la testa, Annulla non scrive; un comando finito intanto non riceve lo stop', async ({ page }) => {
  const conto = await scena(page, { comandi: 4, finiti: 0 });
  await scheda(page).locator('[data-controllo="menu-testa"]').click();
  await menu(page).locator('[role="menuitem"]', { hasText: 'Ferma tutti' }).click();
  await expect(scheda(page).locator('.pn-conferma--testa')).toBeVisible();
  await scheda(page).locator('.pn-conferma--testa [data-controllo="conferma-no"]').click();
  expect(conto.ferma).toEqual([]);
  await scheda(page).locator('[data-controllo="menu-testa"]').click();
  await menu(page).locator('[role="menuitem"]', { hasText: 'Ferma tutti' }).click();
  /* c-3 finisce mentre la conferma è aperta */
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c-3', content: 'exit 0', uscita: 0, _sequenza: 99_001 }, r.realSessionState.generation); });
  /* la colonna si ridisegna al fotogramma dopo (`aggiornaInspectorDaStato`): nessuna persona clicca prima */
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await scheda(page).locator('.pn-conferma--testa [data-controllo="conferma-si"]').click();
  await expect.poll(() => [...conto.ferma].sort()).toEqual(['c-0', 'c-1', 'c-2']);
});

test('PNPR-05 — 46 comandi: niente tetto di 40, le pagine portano a tutti e la colonna non scorre (1920×1080)', async ({ page }) => {
  await scena(page, { comandi: 46, finiti: 6, larghezza: 1920, altezza: 1080 });
  await scheda(page).locator('[data-controllo="ambito-tutti"]').click();
  await page.waitForTimeout(500);
  const m = await scheda(page).evaluate((n) => ({ alto: n.scrollHeight, vista: n.clientHeight }));
  expect(m.alto, JSON.stringify(m)).toBeLessThanOrEqual(m.vista + 1);
  await expect(scheda(page).locator('[data-pager]').first()).toBeVisible();
  /* la voce cercata oltre la prima pagina c'è: la ricerca lavora PRIMA delle pagine */
  await scheda(page).locator('[data-controllo="apri-cerca"]').click();
  await scheda(page).locator('[data-controllo="campo-cerca"]').fill('lavoro-38');
  await expect(riga(page, 'c-38')).toBeVisible();
});

test('PNPR-06 — un comando che esce con la riga aperta a vista: la riga resta, aperta, con lo stato nuovo', async ({ page }) => {
  await scena(page, { comandi: 3, finiti: 0 });
  await scheda(page).locator('[data-controllo="ambito-tutti"]').click();
  await riga(page, 'c-0').locator('.pn-nome').click(); // sul nome: il chip della porta apre il Browser, non la riga
  await expect(riga(page, 'c-0')).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'c-0', content: 'exit 0', uscita: 0, _sequenza: 99_101 }, r.realSessionState.generation); });
  await expect(riga(page, 'c-0')).toHaveAttribute('data-stato', 'riuscito');
  await expect(riga(page, 'c-0')).toHaveAttribute('aria-expanded', 'true');
});

test('PNPR-07 — cambio di sessione: nessuna riga, filtro o ricerca della sessione di prima', async ({ page }) => {
  await scena(page);
  await scheda(page).locator('[data-controllo="apri-cerca"]').click();
  await scheda(page).locator('[data-controllo="campo-cerca"]').fill('lavoro');
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('pnpr-due', 'workspace', 'PNPR2', 'z-ai/glm-5.3-flash', { conclusa: false });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 1 }, r.realSessionState.generation);
  });
  await expect(scheda(page).locator('.pn-riga')).toHaveCount(0);
  await expect(scheda(page).locator('[data-controllo="campo-cerca"]'), 'la ricerca non passa da una sessione all’altra').toHaveCount(0);
  await expect(page.locator('#railTabs [data-rail="processi"] .talos-tabs__count')).toHaveCount(0);
});

test('PNPR-08 — nome lunghissimo con markup, emoji e percorso Windows con spazi: testo, mai HTML, e niente fuori dalla colonna', async ({ page }) => {
  await scena(page);
  await expect(riga(page, 'c-1')).toContainText('<b>x</b>');
  await expect(scheda(page).locator('b:text("x")')).toHaveCount(0);
  const fuori = await scheda(page).evaluate((n) => { const b = n.getBoundingClientRect(); return [...n.querySelectorAll('.pn-riga *')].filter((x) => { const r = x.getBoundingClientRect(); return r.width && r.right > b.right + 1; }).length; });
  expect(fuori).toBe(0);
});

test('PNPR-09 — in inglese: nessuna parola italiana nella scheda', async ({ page }) => {
  await scena(page, { lingua: 'en' });
  const testo = await scheda(page).innerText();
  expect(testo).not.toMatch(/\b(Accesi|Finiti|Tutti|dall'agente|Ferma|uscita)\b/u);
});

test('PNPR-10 — vuoto: una frase e «Apri il Terminale»', async ({ page }) => {
  await scena(page, { comandi: 0, finiti: 0 });
  await expect(scheda(page).locator('.pn-vuoto')).toBeVisible();
  await expect(scheda(page).locator('[data-controllo="azione-vuoto"]')).toBeVisible();
});

/*
 * ⭐ Rischio 1 della MAPPA §7 (e revisione D, 29/10): il ridisegno intero contro l'aggiornamento per riga di oggi. Si misura il
 *   tempo dall'evento al fotogramma dopo, con 40 comandi in una sessione da 1000+ giri, e si stampa (MISURA-PNPR-RIDISEGNO).
 */
test('PNPR-MISURA — il ridisegno della scheda con 40 comandi in una sessione da 1.001 giri', async ({ page }) => {
  test.setTimeout(120_000);
  await scena(page, { comandi: 40, finiti: 10, giri: 1001, larghezza: 1920, altezza: 1080 });
  await page.waitForTimeout(1_500);
  const tempi = await page.evaluate(async () => {
    const r = window.__talosHarnessUiRuntime;
    const fuori = [];
    for (let k = 0; k < 15; k += 1) {
      const t0 = performance.now();
      r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c-0', delta: ' ', _sequenza: 200_000 + k }, r.realSessionState.generation);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      fuori.push(performance.now() - t0);
    }
    fuori.sort((a, b) => a - b);
    return { mediana: fuori[7], massimo: fuori.at(-1) };
  });
  console.log(`MISURA-PNPR-RIDISEGNO evento+2-fotogrammi ${JSON.stringify(tempi)}`);
  /* ⭐ revisione del passo 1 (coordinatore): il costo del SOLO ridisegno, sincrono (costruzione + misure + giri di adattamento), senza
     i due fotogrammi d'attesa che la misura sopra contiene per forza (~2 × 16,7 ms a 60 Hz) */
  const diretto = await page.evaluate(() => {
    const ui = document.querySelector('#railProcessi').__pannello;
    const t = []; const giri = [];
    for (let k = 0; k < 15; k += 1) { const t0 = performance.now(); ui.ridisegna(); t.push(performance.now() - t0); giri.push(ui.giriUltimoDisegno); }
    t.sort((a, b) => a - b);
    return { mediana: t[7], massimo: t.at(-1), giriMassimi: Math.max(...giri), righe: document.querySelectorAll('#railProcessi .pn-riga').length };
  });
  console.log(`MISURA-PNPR-RIDISEGNO solo-ridisegno ${JSON.stringify(diretto)}`);
  expect(diretto.mediana, JSON.stringify(diretto)).toBeLessThan(16);
  expect(tempi.mediana).toBeLessThan(200);
});

for (const [larghezza, altezza, tema] of [[1920, 1080, 'light'], [1920, 1080, 'dark'], [900, 600, 'dark'], [900, 600, 'light']]) {
  test(`PNPR-FOTO ${larghezza}×${altezza} ${tema} — tanti comandi, la colonna non scorre, niente esce`, async ({ page }) => {
    await scena(page, { comandi: 46, finiti: 6, larghezza, altezza, tema });
    await scheda(page).locator('[data-controllo="ambito-tutti"]').click();
    await page.waitForTimeout(600);
    const m = await scheda(page).evaluate((n) => ({ alto: n.scrollHeight, vista: n.clientHeight }));
    expect(m.alto, JSON.stringify(m)).toBeLessThanOrEqual(m.vista + 1);
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `processi-${tema}-${larghezza}x${altezza}.png`) });
  });
}

/*
 * ⭐ Owner 29/10/2026 sera (via coordinatore, opzione consigliata): «il TIPO del comando va nell'icona, chi l'ha lanciato nelle parole».
 *   Diventa rossa se l'icona della famiglia sparisce (torna l'icona di chi) o se «dall'agente» non è più scritto nella riga.
 */
test('PNPR-11 — l’icona dice il tipo del comando (git, prove…), le parole dicono chi l’ha lanciato; chi legge con lo screen reader sente tutti e due', async ({ page }) => {
  await scena(page, { comandi: 2, finiti: 0 });
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'g-1', toolCallName: 'shell', _sequenza: 99_201 }, g);
    r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'g-1', delta: JSON.stringify({ comando: 'git status --short' }), _sequenza: 99_202 }, g);
  });
  const git = riga(page, 'g-1');
  await expect(git).toHaveAttribute('data-famiglia', 'git');
  await expect(git.locator('.pn-segno use')).toHaveAttribute('href', '#i-git');
  await expect(git.locator('.pn-nome')).toHaveAttribute('aria-label', /git status --short/u);
  await expect(git).toContainText('dall’agente'.replace('’', "'"));
  /* con la descrizione: il comando sotto, e accanto chi l'ha lanciato */
  await expect(riga(page, 'c-0').locator('.pn-sotto__chi')).toContainText("dall'agente");
  await expect(riga(page, 'c-0').locator('.pn-segno use'), 'mai l’icona di chi l’ha lanciato al posto del tipo').not.toHaveAttribute('href', '#i-terminal');
});

/*
 * ⭐ Owner 29/10/2026 sera (opzione consigliata): con la colonna aperta gli avvisi in basso a destra NON coprono la barra delle
 *   pagine del pannello (prima la «Successiva» finiva sotto «Collegato di nuovo»). Rossa se la pila torna a sedere sul fondo.
 */
test('PNPR-12 — un avviso con la colonna aperta sta SOPRA la barra delle pagine, senza coprirla', async ({ page }) => {
  await scena(page, { comandi: 46, finiti: 6, larghezza: 900, altezza: 600 });
  await scheda(page).locator('[data-controllo="ambito-tutti"]').click();
  const barra = scheda(page).locator('[data-pager]').last();
  await expect(barra).toBeVisible();
  /* un avviso col markup dei toast dell'app (`components/toast.js`: `.talos-card.talos-toast` in `#regioneToast`), poi un evento qualunque:
     la colonna si ridisegna e la pila si ricolloca (la stessa strada di un avviso vero, `misuraPilaToast`) */
  await page.evaluate(() => {
    const t = document.createElement('div');
    t.className = 'talos-card talos-toast'; t.dataset.c = 'Toast'; t.style.minHeight = '96px'; t.textContent = 'Avviso di prova';
    const regione = document.querySelector('#regioneToast'); regione.append(t); regione.hidden = false; // come fa la pila (`creaPilaToast`, toast.js:215)
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'c-0', delta: ' ', _sequenza: 99_501 }, r.realSessionState.generation);
  });
  const avviso = page.locator('#regioneToast .talos-toast', { hasText: 'Avviso di prova' });
  await expect(avviso, 'premessa: un avviso a schermo').toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const t = [...document.querySelectorAll('#regioneToast .talos-toast')].find((n) => n.textContent === 'Avviso di prova').getBoundingClientRect();
    const pagine = [...document.querySelectorAll('#railProcessi [data-pager]')].map((n) => n.getBoundingClientRect()).filter((r) => r.height > 0);
    const sovrapposte = pagine.filter((r) => t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top);
    return { avviso: [Math.round(t.top), Math.round(t.bottom)], pagine: pagine.map((r) => [Math.round(r.top), Math.round(r.bottom)]), sovrapposte: sovrapposte.length };
  });
  console.log(`MISURA-PNPR-12 ${JSON.stringify(m)}`);
  expect(m.sovrapposte, JSON.stringify(m)).toBe(0);
});
