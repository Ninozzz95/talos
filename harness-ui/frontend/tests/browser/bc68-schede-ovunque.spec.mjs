import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BC-68, 17/09/2026 — LE SCHEDE DEL BROWSER ENTRANO NEL COMPONENTE CONDIVISO, E LE TRE
 * STRISCE DICONO FINALMENTE CHE COSA GOVERNANO.
 *
 * Misurato sulla app viva PRIMA di toccare una riga (pacchetto di `d4ca608e`):
 *   · `aria-controls`: **0 linguette su 4**, su tutte e tre le superfici. L'APG «Tabs»
 *     (w3.org/WAI/ARIA/apg/patterns/tabs, riletto il 17/09/2026) lo chiede su ogni `tab`, col
 *     pannello che porta `role="tabpanel"` e `aria-labelledby` verso la linguetta.
 *   · la striscia del Terminale, con nessuna shell aperta, conteneva UNA cosa con `role="tab"` ed
 *     era il «+ Nuovo»: un lettore di schermo annunciava «scheda 1 di 1» su una striscia senza
 *     schede.
 *   · il menu contestuale condiviso era largo **340 px fissi** (`width:var(--talos-inspector-w)`,
 *     la misura della colonna dei dettagli) per due voci di due parole.
 *   · e `browser.js` aveva una SUA tastiera: `'ArrowRight'`/`'ArrowLeft'` alla riga 699 e
 *     `'Home'`/`'End'` alla 700 del sorgente di base (misurato con `git show`). La parte statica di
 *     questa riga vive in `tests/unit/bc68-una-tastiera-sola.test.mjs`.
 *
 * ⛔ Qui si misura la app, non il sorgente: che cosa porta ogni linguetta, dove punta, e che il
 *   Browser abbia guadagnato la meccanica condivisa senza perdere il suo aspetto.
 */

test.use({ locale: 'it-IT' });

async function scena(page, { larghezza = 1024, altezza = 800, tema = 'dark', quantePagine = 3 } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/bc68-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(async (quante) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc68-uno', 'workspace', 'BC68', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    let seq = 7000;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: seq += 1, input: { consegna: 'Leggi tre pagine' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'StateDelta', _sequenza: seq += 1, delta: [{ op: 'replace', path: '/file/src/uno.mjs', prima: 'a\n', value: 'a\nb\n' }] }, g);
    for (let i = 1; i <= quante; i += 1) {
      r.handleRealEvent({ type: 'ToolCallStart', toolCallId: `p${i}`, toolCallName: 'naviga', _sequenza: seq += 1 }, g);
      r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: `p${i}`, delta: JSON.stringify({ url: `https://sito-${i}.test/pagina` }), _sequenza: seq += 1 }, g);
      r.handleRealEvent({ type: 'ToolCallResult', toolCallId: `p${i}`, content: `Pagina numero ${i}\n\nIl testo della pagina.`, _sequenza: seq += 1 }, g);
    }
    r.executeCommand('browser');
    await new Promise((x) => requestAnimationFrame(x));
  }, quantePagine);
  await page.waitForTimeout(300);
}

const RADIOGRAFIA = `(() => {
  const tre = {};
  for (const [nome, sel] of [['terminale', '.talos-terminal__tabs'], ['revisione', '#schermoReview .talos-schede__lista'], ['browser', '#browserSchede']]) {
    const lista = document.querySelector(sel);
    if (!lista) { tre[nome] = null; continue; }
    const tabs = [...lista.querySelectorAll('[role="tab"]')];
    tre[nome] = {
      quantiTab: tabs.length,
      senzaAriaControls: tabs.filter((b) => !b.getAttribute('aria-controls')).length,
      pannelliRotti: tabs.map((b) => {
        const id = b.getAttribute('aria-controls');
        const p = id ? document.getElementById(id) : null;
        return { id, ruolo: p ? p.getAttribute('role') : null };
      }).filter((x) => x.ruolo !== 'tabpanel'),
      senzaHaspopup: tabs.filter((b) => b.getAttribute('aria-haspopup') !== 'menu').length,
      tabstop: tabs.filter((b) => b.tabIndex === 0).length,
    };
  }
  const nuova = document.querySelector('[data-terminale-nuova]');
  return {
    tre,
    nuovaEUnaScheda: nuova ? nuova.getAttribute('role') === 'tab' : null,
    /* Il pannello della Revisione e quello del Browser devono dichiarare CHI li descrive. */
    etichettatoDa: ['pannelloRevisione', 'pannelloBrowser'].map((id) => {
      const p = document.getElementById(id);
      const eti = p?.getAttribute('aria-labelledby');
      return { id, etichetta: eti || null, esiste: Boolean(eti && document.getElementById(eti)) };
    }),
  };
})()`;

test('BC68-ARIA — ogni linguetta dice quale pannello governa, e il pannello è un tabpanel', async ({ page }) => {
  await scena(page);
  const m = await page.evaluate(RADIOGRAFIA);
  console.log(`MISURA-BC68-ARIA = ${JSON.stringify(m)}`);
  /* La PREMESSA: le tre superfici hanno davvero delle linguette da guardare. Senza, questa prova
     passerebbe contando zero. */
  expect(m.tre.revisione?.quantiTab, 'la scena non si è formata: la Revisione non ha linguette').toBeGreaterThan(0);
  expect(m.tre.browser?.quantiTab, 'la scena non si è formata: il Browser non ha linguette').toBeGreaterThan(1);
  for (const [nome, striscia] of Object.entries(m.tre)) {
    if (!striscia || striscia.quantiTab === 0) continue;
    expect(striscia.senzaAriaControls, `${nome}: linguette senza aria-controls`).toBe(0);
    expect(striscia.pannelliRotti, `${nome}: aria-controls che non porta a un tabpanel: ${JSON.stringify(striscia.pannelliRotti)}`).toEqual([]);
    expect(striscia.senzaHaspopup, `${nome}: linguette con un menu che non lo dichiarano (aria-haspopup)`).toBe(0);
    expect(striscia.tabstop, `${nome}: roving tabindex, un solo tabstop`).toBe(1);
  }
  for (const p of m.etichettatoDa) {
    expect(p.esiste, `${p.id}: il pannello non dichiara quale linguetta lo descrive (aria-labelledby «${p.etichetta}»)`).toBe(true);
  }
  expect(m.nuovaEUnaScheda, 'il «+ Nuovo» del Terminale non è una scheda').toBe(false);
});

test('BC68-BROWSER — le linguette del Browser hanno la meccanica condivisa e il loro aspetto', async ({ page }) => {
  await scena(page);
  /* L'aspetto che era la ragione dichiarata per NON migrare: si pretende che ci sia ancora. */
  const aspetto = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#browserSchede [role="tab"]')];
    return {
      quanti: tabs.length,
      conIcona: tabs.filter((b) => b.querySelector('.talos-tabstrip__icona')).length,
      conTitolo: tabs.filter((b) => b.querySelector('.talos-tabstrip__titolo')?.textContent?.trim()).length,
      conChiusuraVera: tabs.filter((b) => b.querySelector('button.talos-tabstrip__chiudi')).length,
      conFumetto: tabs.filter((b) => b.dataset.tip).length,
      conStato: tabs.filter((b) => b.dataset.statoScheda).length,
      /* ⛔ Un `button` dentro un `button` non è HTML valido: la linguetta del Browser ospita la ✕
         vera, quindi resta un `div[role=tab]`. Se un giorno diventasse un bottone, questo cade. */
      tag: [...new Set(tabs.map((b) => b.tagName))],
    };
  });
  console.log(`MISURA-BC68-ASPETTO = ${JSON.stringify(aspetto)}`);
  expect(aspetto.quanti, 'la scena non si è formata').toBe(3);
  expect(aspetto.conIcona, 'ogni linguetta ha la sua icona di stato').toBe(3);
  expect(aspetto.conTitolo, 'e il titolo vero della pagina').toBe(3);
  expect(aspetto.conChiusuraVera, 'e la ✕ come elemento vero, non una zona di clic').toBe(3);
  expect(aspetto.conFumetto, 'e il fumetto con l’indirizzo').toBe(3);
  expect(aspetto.conStato, 'e lo stato canonico della scheda').toBe(3);
  expect(aspetto.tag, 'la linguetta resta un div: dentro c’è un bottone vero').toEqual(['DIV']);

  /* La MECCANICA che prima non c'era: le frecce ciclano, Home/End, e il fuoco segue la scelta. */
  const primaLinguetta = page.locator('#browserSchede [role="tab"]').first();
  await primaLinguetta.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  const dopoFreccia = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#browserSchede [role="tab"]')];
    return { scelta: tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true'), colFuoco: tabs.indexOf(document.activeElement) };
  });
  expect(dopoFreccia.scelta, 'la freccia destra sceglie la seconda').toBe(1);
  expect(dopoFreccia.colFuoco, 'e il fuoco la segue').toBe(1);
  await page.keyboard.press('End');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => [...document.querySelectorAll('#browserSchede [role="tab"]')].findIndex((b) => b.getAttribute('aria-selected') === 'true')), 'End va all’ultima').toBe(2);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => [...document.querySelectorAll('#browserSchede [role="tab"]')].findIndex((b) => b.getAttribute('aria-selected') === 'true')), 'e dall’ultima si CICLA alla prima (APG)').toBe(0);

  /* ⛔ Invio e Spazio: un `div[role=tab]` non li ha per natura, e senza di loro una scheda scelta
     con Tab non si può attivare da tastiera. È la riga che il tag alternativo si porta dietro. */
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  await page.evaluate(() => { document.querySelectorAll('#browserSchede [role="tab"]')[2].focus(); });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => [...document.querySelectorAll('#browserSchede [role="tab"]')].findIndex((b) => b.getAttribute('aria-selected') === 'true')), 'Invio attiva la linguetta col fuoco').toBe(2);
});

test('BC68-MENU — il menu contestuale è largo quanto la voce più lunga, non quanto la colonna dei dettagli', async ({ page }) => {
  await scena(page);
  const m = await page.evaluate(async () => {
    const tab = document.querySelector('#browserSchede [role="tab"]');
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }));
    await new Promise((x) => requestAnimationFrame(x));
    const menu = [...document.querySelectorAll('.talos-context-menu')].find((n) => !n.hidden);
    if (!menu) return { aperto: false };
    const r = menu.getBoundingClientRect();
    const voci = [...menu.querySelectorAll('[role="menuitem"]')];
    const piuLarga = Math.max(0, ...voci.map((v) => Math.ceil(v.getBoundingClientRect().width)));
    return {
      aperto: true,
      larghezza: Math.round(r.width),
      voci: voci.length,
      vociTesto: voci.map((v) => v.textContent.trim()),
      piuLarga,
      colonnaDettagli: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--talos-inspector-w')) || 0),
    };
  });
  console.log(`MISURA-BC68-MENU = ${JSON.stringify(m)}`);
  expect(m.aperto, 'la scena non si è formata: il menu contestuale non si è aperto').toBe(true);
  expect(m.voci, 'due voci vere, non decorative').toBe(2);
  /* ⛔ Il verdetto misura RETTANGOLI: il menu non può più essere largo quanto la colonna dei
     dettagli quando le sue voci sono corte. La soglia non è un numero scelto a caso — è la larghezza
     della colonna, che è esattamente il valore che era stato preso in prestito. */
  expect(m.larghezza, `il menu è ancora largo quanto la colonna dei dettagli (${m.colonnaDettagli} px) con due voci da ${m.piuLarga} px`).toBeLessThan(m.colonnaDettagli);
  expect(m.larghezza, 'ma non un francobollo: resta un bersaglio comodo').toBeGreaterThanOrEqual(180);
});
