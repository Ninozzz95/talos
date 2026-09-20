/*
 * ============================================================================
 * FASE 2 — LE FORME DELLE OTTO SEZIONI (18/09/2026)
 * ============================================================================
 * Le otto sezioni che il mockup NON disegna (sono attenuate: `disabled title="Fuori dal lotto
 * dimostrativo"`) ricevono il suo VOCABOLARIO sul contenuto che l'app ha già:
 *   · una CARTA con la sua TESTATA (`.settings-group__head` = titolo + conteggio),
 *   · le AZIONI IN UN POSTO SOLO, in una banda in fondo al pannello (il `.settings-bottom` del
 *     mockup), non sparse dentro le carte,
 *   · i FATTI MISURATI in una lista CHIAVE/VALORE (`.talos-kv`).
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA, ed è stato provato togliendo un id (vedi resoconto):
 *   · si toglie un `id` da una delle tre sezioni → FORME-04 rossa (l'elenco atteso è scritto qui);
 *   · si rimette un `> h3` al posto della testata (o si annulla `testataCarta`) → FORME-01 rossa;
 *   · si riporta un pulsante dentro una carta → FORME-03 rossa;
 *   · si tolgono le classi chiave/valore dalle liste dei fatti → FORME-02 rossa.
 *
 * ⛔ PERCHÉ PROPRIO QUESTE TRE. Providers e Privacy hanno i FATTI in due liste che il prodotto
 *   riempie da sé (`app.js`), e sono le due che il vocabolario chiave/valore doveva vestire;
 *   Strumenti è l'unico pannello con DUE carte, cioè l'unico dove la copia per posizione di
 *   `static-copy.ts` sbagliava bersaglio — e la sua testata è la prova che il difetto è curato.
 *   Le altre cinque sezioni hanno la stessa forma e la stessa fabbrica (`testataCarta`), e sono
 *   misurate a parte nel resoconto.
 *
 * ⛔ NIENTE SCRITTURE: la pagina intercetta ogni richiesta e ABORTA le non-GET, tenendone
 *   l'elenco; ogni test chiude con `expect(tentate).toEqual([])`.
 */

import { expect, test } from '@playwright/test';

/** `/api/v1/search-source` — cinque fonti, `duckduckgo` pronta: nessuna chiave e nessun indirizzo. */
const FONTI_RICERCA = {
  ok: true,
  data: {
    source: 'duckduckgo',
    endpoint: '',
    readiness: 'pronta',
    fonti: [
      { id: 'duckduckgo', label: 'DuckDuckGo', needsKey: false, needsEndpoint: false, keyless: true, keyConfigured: false },
      { id: 'tavily', label: 'Tavily', needsKey: true, needsEndpoint: false, keyless: false, keyConfigured: false },
      { id: 'brave', label: 'Brave Search', needsKey: true, needsEndpoint: false, keyless: false, keyConfigured: false },
      { id: 'searxng', label: 'SearXNG', needsKey: false, needsEndpoint: true, keyless: false, keyConfigured: false },
      { id: 'custom', label: 'Servizio personale', needsKey: false, needsEndpoint: true, keyless: false, keyConfigured: false },
    ],
  },
  meta: { schema: 'talos.harness-ui.api.v1' },
};

/*
 * L'INVENTARIO DEGLI ID — misurato sul 4174 la notte del 18/09/2026 e riconfermato qui.
 * ⛔ È l'elenco ATTESO: se un id sparisce, l'uguaglianza è rossa. Ed è un elenco PIENO, non vuoto:
 *   un confronto fra due elenchi vuoti passerebbe per costruzione e non proverebbe niente.
 */
const SEZIONI = [
  {
    id: 'providers',
    idAttesi: ['settings-group-providers-state', 'settingsProvidersList'],
  },
  {
    id: 'privacy',
    idAttesi: [
      'settings-group-privacy-local', 'settings-group-privacy-transfer', 'settingsPrivacyList',
      'settingsSvuotaLocali', 'settingsTrasferimento', 'settingsEsporta', 'settingsImporta',
      'settingsRipristina', 'settingsImportaFile', 'settingsTrasferimentoEsito',
    ],
  },
  {
    id: 'tools',
    idAttesi: [
      'settings-group-tools-policy', 'settings-group-tools-search', 'settingsToolsFacts',
      'setting-source-preview', 'searchSourceMount', 'fonte-label-duckduckgo', 'fonte-label-tavily',
      'fonte-label-brave', 'fonte-label-searxng', 'fonte-label-custom', 'fonte-label-off', 'fonte-query',
    ],
  },
];

/** Apre la app in italiano e va su una sezione, col tasto di scrittura SPENTO. */
async function apriSezione(page, sezione) {
  await page.evaluate((s) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
  }, sezione);
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
}

async function avvia(page, { lingua = 'it' } = {}) {
  const tentate = [];
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${route.request().url()}`);
    return route.abort();
  });
  await page.route('**/api/v1/search-source', (route) => {
    if (route.request().method() !== 'GET') return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FONTI_RICERCA) });
  });
  await page.addInitScript((dati) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify(dati));
  }, { version: 1, appearance: { uiLanguage: lingua, colorMode: 'dark' }, chat: {}, workspaces: {} });
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  return tentate;
}

test('FORME-01 · ogni carta delle tre sezioni ha la sua TESTATA, col titolo dal contratto', async ({ page }) => {
  const tentate = await avvia(page);
  const attese = {
    providers: ['Stato degli accessi'],
    privacy: ['Dati locali del browser', 'Trasferisci le preferenze'],
    tools: ['Policy della sessione', 'Origine della ricerca web'],
  };
  for (const sezione of Object.keys(attese)) {
    await apriSezione(page, sezione);
    const carte = await page.evaluate((s) => [...document.querySelectorAll(`#setting-panel-${s} [data-settings-card]`)].map((carta) => ({
      chiave: carta.dataset.settingsCard,
      titolo: carta.querySelector(':scope > .settings-group__head > .settings-group__title, :scope > .settings-group__head > .settings-group__copy > .settings-group__title')?.textContent,
      conteggio: Boolean(carta.querySelector(':scope > .settings-group__head > .settings-group__count')),
      // la testata è la PRIMA cosa della carta: è quello che il mockup disegna (`.section-heading`)
      prima: carta.firstElementChild?.classList.contains('settings-group__head'),
    })), sezione);
    expect(carte.map((c) => c.titolo), `le testate di ${sezione}`).toEqual(attese[sezione]);
    for (const carta of carte) {
      expect(carta.prima, `la testata di ${carta.chiave} non è la prima cosa della carta`).toBe(true);
      expect(carta.conteggio, `il conteggio manca nella testata di ${carta.chiave}`).toBe(true);
    }
  }
  expect(tentate).toEqual([]);
});

test('FORME-02 · i fatti misurati sono una lista CHIAVE/VALORE, non due liste di nodi', async ({ page }) => {
  const tentate = await avvia(page);
  for (const [sezione, lista] of [['providers', 'settingsProvidersList'], ['privacy', 'settingsPrivacyList']]) {
    await apriSezione(page, sezione);
    const righe = await page.evaluate((id) => {
      const nodo = document.getElementById(id);
      return [...nodo.children].map((riga) => ({
        classi: riga.className,
        tag: riga.tagName,
        chiave: riga.children[0]?.className,
        valore: riga.children[1]?.className,
      }));
    }, lista);
    expect(righe.length, `${sezione}: la lista dei fatti è vuota, la prova non morderebbe`).toBeGreaterThan(0);
    for (const riga of righe) {
      expect(riga.classi, `${sezione}: la riga non è un .talos-kv`).toContain('talos-kv');
      expect(riga.chiave, `${sezione}: la chiave non è .talos-kv__k`).toContain('talos-kv__k');
      expect(riga.valore, `${sezione}: il valore non è .talos-kv__v`).toContain('talos-kv__v');
      // ⛔ il nodo resta un `<li>`: `settings-fatti-reali.spec.mjs` legge `#…List li`, e il tag
      //    non si cambia per un vestito.
      expect(riga.tag, `${sezione}: il nodo non è più un li`).toBe('LI');
    }
  }
  expect(tentate).toEqual([]);
});

test('FORME-03 · le azioni stanno in UNA banda in fondo al pannello, non dentro le carte', async ({ page }) => {
  const tentate = await avvia(page);
  for (const sezione of ['providers', 'privacy', 'tools']) {
    await apriSezione(page, sezione);
    const forma = await page.evaluate((s) => {
      const pannello = document.getElementById(`setting-panel-${s}`);
      const bande = [...pannello.querySelectorAll(':scope > .talos-settings__actions')];
      return {
        bande: bande.length,
        ultima: pannello.lastElementChild?.classList.contains('talos-settings__actions'),
        dentroLeCarte: [...pannello.querySelectorAll('[data-settings-card] .talos-settings__actions')].length,
        bottoni: bande.flatMap((b) => [...b.querySelectorAll('button')].map((x) => x.id || x.textContent.trim())),
      };
    }, sezione);
    expect(forma.bande, `${sezione}: le bande delle azioni sono ${forma.bande}`).toBe(1);
    expect(forma.ultima, `${sezione}: la banda non è in fondo al pannello`).toBe(true);
    // L'unica banda dentro una carta è quella del modulo di ricerca, che `fonte-ricerca.js`
    // RICOSTRUISCE a ogni risposta: spostarla sarebbe spostare un nodo che risorge.
    expect(forma.dentroLeCarte, `${sezione}: azioni rimaste dentro le carte`).toBe(sezione === 'tools' ? 1 : 0);
    expect(forma.bottoni.length, `${sezione}: la banda è vuota`).toBeGreaterThan(0);
  }
  expect(tentate).toEqual([]);
});

test('FORME-04 · nessun id è sparito: l\'elenco atteso è quello della pagina, intero', async ({ page }) => {
  const tentate = await avvia(page);
  for (const { id, idAttesi } of SEZIONI) {
    await apriSezione(page, id);
    const presenti = await page.evaluate((s) => [...document.querySelectorAll(`#setting-panel-${s} [id]`)].map((e) => e.id).sort(), id);
    // ⛔ L'elenco atteso non è vuoto: un confronto fra due elenchi vuoti passerebbe per costruzione.
    expect(idAttesi.length, `${id}: l'inventario atteso è vuoto`).toBeGreaterThan(0);
    expect(presenti, `${id}: id spariti o aggiunti`).toEqual([...idAttesi].sort());
  }
  expect(tentate).toEqual([]);
});

test('FORME-06 · il RIMONTAGGIO non duplica la testata', async ({ page }) => {
  /*
   * ⛔ IL RIMONTAGGIO È UN PERCORSO VERO, non un'ipotesi: «Ripristina i valori iniziali» chiama
   * `montaImpostazioni` una seconda volta sulle STESSE carte, e la vista si ricrea. Una testata
   * costruita senza guardare se esiste già ne metterebbe una seconda sopra la prima — è la forma
   * del doppio `#schermoHome` che il 18/09 è arrivata sul server vivo.
   */
  const tentate = await avvia(page);
  await apriSezione(page, 'privacy');
  const forma = () => page.evaluate(() => {
    const pannello = document.getElementById('setting-panel-privacy');
    return {
      testate: pannello.querySelectorAll('.settings-group__head').length,
      carte: pannello.querySelectorAll('[data-settings-card]').length,
      titoli: [...pannello.querySelectorAll('.settings-group__title')].map((e) => e.textContent),
      id: [...pannello.querySelectorAll('[id]')].map((e) => e.id).sort(),
    };
  });
  const prima = await forma();
  expect(prima.testate).toBe(2);
  expect(prima.carte).toBe(2);
  expect(prima.titoli).toEqual(['Dati locali del browser', 'Trasferisci le preferenze']);
  await page.locator('#settingsRipristina').click();
  await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await page.waitForTimeout(400);
  const dopo = await forma();
  /* ⛔ I TITOLI CAMBIANO LINGUA, E NON È UN DIFETTO: «Ripristina i valori iniziali» cancella la
     chiave delle preferenze, quindi `uiLanguage` torna al predefinito dell'app — che è l'inglese.
     È il prodotto che lo fa, non la corsia: quello che si prova qui è che la testata NON si
     duplica e che gli id restano gli stessi. */
  expect(dopo.testate, 'la testata si è duplicata al rimontaggio').toBe(2);
  expect(dopo.carte).toBe(2);
  expect(dopo.titoli.length).toBe(2);
  expect(dopo.titoli.every((t) => t && t.length > 0)).toBe(true);
  expect(dopo.id).toEqual(prima.id);
  expect(tentate).toEqual([]);
});

test('FORME-05 · la copia che la testata ha spostato c\'è ancora, in italiano E in inglese', async ({ page }) => {
  /*
   * ⛔ PERCHÉ QUESTA PROVA ESISTE. Il titolo di queste carte viveva in un `> h3` che
   * `static-copy.ts` sceglieva PER POSIZIONE; entrando nella testata quelle righe non lo
   * raggiungono più, e il testo lo porta `settings-view.ts`. Una traduzione persa in silenzio
   * sarebbe una funzione persa: qui si pretende la stessa stringa nelle due lingue.
   * Le parole sono quelle del prodotto (le stesse di `static-copy.ts`), non inventate.
   */
  const attesi = {
    it: {
      providers: ['Stato degli accessi'],
      privacy: ['Dati locali del browser', 'Trasferisci le preferenze'],
      tools: ['Policy della sessione', 'Origine della ricerca web'],
      costi: ['Consumo registrato'],
    },
    en: {
      providers: ['Access state'],
      privacy: ['Local browser data', 'Transfer preferences'],
      tools: ['Session policy', 'Web search source'],
      costi: ['Recorded usage'],
    },
  };
  for (const lingua of ['it', 'en']) {
    const tentate = await avvia(page, { lingua });
    for (const [sezione, titoli] of Object.entries(attesi[lingua])) {
      await apriSezione(page, sezione);
      await expect(page.locator(`#setting-panel-${sezione} .settings-group__title`)).toHaveText(titoli);
    }
    expect(tentate).toEqual([]);
  }
});
