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
import { TESTI } from '../../src/i18n/testi/index.js';

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
/* ⛔ 23/09/2026, decisione owner: «Provider e accessi» è tolta del tutto dalle Impostazioni — la sua voce (`settings-group-providers-state`, `settingsProvidersList`) esce
   dall'elenco con lei; lo stato dei fornitori vive nelle card della scheda «Provider» del laboratorio. */
/* 13/10/2026 (bugfixer): la carta «Link dalla chat» (decisione owner 11/10 «link in chat cliccabili, con conferma del sito»,
   `efba058c1`; la scelta «dove si aprono», owner 12/10, `756ecdedd`) è la terza carta della privacy. Gli inventari di questa spec
   erano fermi a due carte: non è cambiata la regola, è nata una carta. */
const SEZIONI = [
  {
    id: 'privacy',
    idAttesi: [
      'settings-group-privacy-local', 'settings-group-privacy-transfer', 'settings-group-privacy-link', 'settingsPrivacyList',
      'settingsSvuotaLocali', 'settingsTrasferimento', 'settingsEsporta', 'settingsImporta',
      'settingsRipristina', 'settingsImportaFile', 'settingsTrasferimentoEsito',
    ],
  },
  {
    id: 'tools',
    idAttesi: [
      'settings-group-tools-policy', 'settings-group-tools-search', 'settingsToolsFacts',
      'settings-group-tools-dove-girano', // owner 27/10/2026: «Dove girano i comandi» di serie (c71639d26)
      'settings-group-tools-pc-sveglio', 'setting-pc-sveglio-modo', 'setting-pc-sveglio-modo--calm', // 01/11/2026: «Tieni sveglio il PC» (77bf7608e)
      'setting-source-preview', 'searchSourceMount', 'fonte-label-duckduckgo', 'fonte-label-tavily',
      'fonte-label-brave', 'fonte-label-searxng', 'fonte-label-custom', 'fonte-label-off', 'fonte-query',
      // 07/11/2026 (curatore): la carta «Uso del computer» in Anteprima (17b6c7a17 + 92607b484, decisione 310, 06/11), con la testata
      // delle sorelle data da cdb475867 (decisioni 331, 335, 339): titolo, distintivo, interruttore, sua copia calma e suo aiuto.
      'settings-group-tools-computer-use', 'settings-group-tools-computer-use-segno',
      'setting-computerUseToggle', 'setting-computerUseToggle--calm', 'settingsHelp-computerUseToggle',
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

/* `lente`: indirizzi le cui GET si fanno attendere `ritardo` ms prima di passare (FORME-07, decisione 331, 07/11/2026). Le rotte stanno
   DOPO quella generale, così Playwright le sceglie per prime; il resto della pagina non cambia. */
async function avvia(page, { lingua = 'it', lente = [], ritardo = 400 } = {}) {
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
  for (const indirizzo of lente) {
    await page.route(indirizzo, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await new Promise((fatto) => setTimeout(fatto, ritardo));
      return route.continue();
    });
  }
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  return tentate;
}

test('FORME-01 · ogni carta delle tre sezioni ha la sua TESTATA, col titolo dal contratto', async ({ page }) => {
  const tentate = await avvia(page);
  /* 23/09/2026, decisione owner: «Provider e accessi» è tolta del tutto dalle Impostazioni: la carta «Stato degli accessi» non esiste più. */
  const attese = {
    privacy: ['Link dalla chat', 'Dati locali del browser', 'Trasferisci le preferenze'], // decisione owner 164 (bozzetto 14 B): «Link dalla chat» in cima, la banda resta in fondo
    /* «Dove girano i comandi» (owner 27/10) arriva dopo una lettura dal server: la prova leggeva le carte prima, e passava per tempismo
       (rossa nel blocco 12 quando la risposta è arrivata prima). Si aspetta la carta, poi si contano tutte. */
    tools: ['Policy della sessione', 'Dove girano i comandi · conversazioni nuove', 'Tieni sveglio il PC', 'Uso del computer', 'Origine della ricerca web'], // 01/11: «Tieni sveglio il PC» (77bf7608e)
  };
  for (const sezione of Object.keys(attese)) {
    await apriSezione(page, sezione);
    if (sezione === 'tools') {
      await expect(page.locator('#setting-panel-tools [data-settings-card="tools-dove-girano"]')).toBeAttached();
      await expect(page.locator('#setting-panel-tools [data-settings-card="tools-pc-sveglio"]')).toBeAttached(); // anche lei dopo una lettura dal server
    }
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
  /* 23/09/2026, decisione owner: «Provider e accessi» è tolta del tutto dalle Impostazioni: `settingsProvidersList` è tolta con lei; la lista della privacy resta, e la prova non
     diventa vacua (`righe.length > 0` qui sotto). */
  for (const [sezione, lista] of [['privacy', 'settingsPrivacyList']]) {
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
  /* 23/09/2026, decisione owner: «Provider e accessi» è tolta del tutto dalle Impostazioni. */
  for (const sezione of ['privacy', 'tools']) {
    await apriSezione(page, sezione);
    /* ⛔ L3-14 (bugfixer, 15/10/2026): rossa nella suite intera, verde da sola. Misurato con 40 ripetizioni a 8 lavoratori: 8 rosse,
       tutte «tools: azioni rimaste dentro le carte — atteso 1, letto 0». È la banda del modulo della fonte di ricerca, che si monta
       DOPO la risposta di `/api/v1/search-source`: letta subito, sotto carico non c'era ancora. Lo stesso difetto della prova che
       FORME-04 ha già curato (2cf053b2f): si aspettano gli id attesi della sezione, poi si misura. Il conteggio resta ESATTO. */
    const attesi = SEZIONI.find((x) => x.id === sezione)?.idAttesi ?? [];
    await page.waitForFunction(([s, ids]) => ids.every((x) => document.querySelector(`#setting-panel-${s} #${CSS.escape(x)}`)), [sezione, attesi], { timeout: 4000 }).catch(() => {});
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
    /* 13/10/2026 (bugfixer): il modulo della fonte di ricerca si monta DOPO la risposta di `/api/v1/search-source`; letta subito, una
       volta su tre la pagina non aveva ancora i suoi sette id (misurato: 1 rossa su 3 corse). Si aspetta che gli attesi ci siano —
       il confronto resta ESATTO: un id in più o in meno fa cadere la prova come prima. */
    await page.waitForFunction(([s, attesi]) => attesi.every((x) => document.querySelector(`#setting-panel-${s} #${CSS.escape(x)}`)), [id, idAttesi], { timeout: 4000 }).catch(() => {});
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
  expect(prima.testate).toBe(3);
  expect(prima.carte).toBe(3);
  expect(prima.titoli).toEqual(['Link dalla chat', 'Dati locali del browser', 'Trasferisci le preferenze']);
  await page.locator('#settingsRipristina').click();
  await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await page.waitForTimeout(400);
  const dopo = await forma();
  /* ⛔ I TITOLI CAMBIANO LINGUA, E NON È UN DIFETTO: «Ripristina i valori iniziali» cancella la
     chiave delle preferenze, quindi `uiLanguage` torna al predefinito dell'app — che è l'inglese.
     È il prodotto che lo fa, non la corsia: quello che si prova qui è che la testata NON si
     duplica e che gli id restano gli stessi. */
  expect(dopo.testate, 'la testata si è duplicata al rimontaggio').toBe(3);
  expect(dopo.carte).toBe(3);
  expect(dopo.titoli.length).toBe(3);
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
    /* 23/09/2026, decisione owner: «Provider e accessi» è tolta del tutto dalle Impostazioni: niente più «Stato degli accessi» / «Access state». */
    it: {
      privacy: ['Link dalla chat', 'Dati locali del browser', 'Trasferisci le preferenze'],
      tools: ['Policy della sessione', 'Dove girano i comandi · conversazioni nuove', 'Tieni sveglio il PC', 'Uso del computer', 'Origine della ricerca web'], // 27/10: la carta di serie dei comandi; 01/11: il PC sveglio
      costi: ['Consumo registrato'],
    },
    en: {
      privacy: ['Links from chat', 'Local browser data', 'Transfer preferences'],
      tools: ['Session policy', 'Where commands run · new conversations', 'Keep the PC awake', 'Computer use', 'Web search source'],
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

/*
 * FORME-07 — decisione 331 (07/11/2026), secondo giro: il posto della carta «Uso del computer» non dipende da chi risponde prima.
 * Il revisore della vista l'ha vista finire sotto «Origine della ricerca web» 3 volte su 3 rallentando di 400 ms le letture delle
 * sorelle (`c331-revisione-vista.md`). Si prova nei due versi: sorelle lente, poi la carta lenta lei. L'ordine atteso è quello di FORME-01.
 */
const ORDINE_STRUMENTI = ['tools-policy', 'tools-dove-girano', 'tools-pc-sveglio', 'tools-computer-use', 'tools-search'];
for (const [nome, lente] of [
  ['le sorelle rispondono 400 ms dopo', ['**/api/v1/keep-awake-settings', '**/api/v1/command-settings']],
  ['la carta risponde 400 ms dopo', ['**/api/v1/computer-use/settings']],
]) {
  test(`FORME-07 · il posto della carta «Uso del computer» è fisso: ${nome}`, async ({ page }) => {
    const tentate = await avvia(page, { lente });
    await apriSezione(page, 'tools');
    for (const chiave of ['tools-dove-girano', 'tools-pc-sveglio', 'tools-computer-use']) {
      await expect(page.locator(`#setting-panel-tools [data-settings-card="${chiave}"]`)).toBeAttached({ timeout: 8000 });
    }
    /* le letture lente devono essere finite: l'interruttore si accende e il menu del PC sveglio ha il suo valore solo dopo la risposta */
    await expect(page.locator('#setting-computerUseToggle')).toBeEnabled({ timeout: 8000 });
    await page.waitForTimeout(500);
    const ordine = await page.evaluate(() => [...document.querySelectorAll('#setting-panel-tools > [data-settings-card]')].map((c) => c.dataset.settingsCard));
    expect(ordine).toEqual(ORDINE_STRUMENTI);
    expect(tentate).toEqual([]);
  });
}

/*
 * FORME-08 — decisione 331 (07/11/2026), secondo giro: il segno «Anteprima» sta ACCANTO al titolo (non al bordo destro della carta),
 * sotto la testata c'è la spiegazione come nelle sorelle (`pc-sveglio-impostazioni.js`, `dove-girano-di-serie.js`), e l'aiuto della
 * riga ha la misura della spiegazione delle sorelle (13 px), non 12 px su 49 caratteri.
 */
test('FORME-08 · il segno «Anteprima» sta accanto al titolo, e la carta ha la spiegazione delle sorelle', async ({ page }) => {
  const tentate = await avvia(page);
  await apriSezione(page, 'tools');
  await expect(page.locator('#setting-computerUseToggle')).toBeEnabled({ timeout: 8000 });
  const m = await page.evaluate(() => {
    const carta = document.querySelector('#setting-panel-tools [data-settings-card="tools-computer-use"]');
    const titolo = carta.querySelector('.settings-group__title').getBoundingClientRect();
    const segno = carta.querySelector('[data-c="PreviewBadge"]').getBoundingClientRect();
    const testata = carta.querySelector(':scope > .settings-group__head');
    const spiegazione = testata.nextElementSibling;
    const sorella = document.querySelector('#setting-panel-tools [data-settings-card="tools-pc-sveglio"] > .settings-group__head + p');
    const aiuto = carta.querySelector('.talos-setting__help');
    return {
      distanza: segno.left - titolo.right,
      centri: Math.abs((segno.top + segno.height / 2) - (titolo.top + titolo.height / 2)),
      spiegazione: spiegazione?.tagName === 'P' ? spiegazione.textContent.trim() : null,
      corpoSpiegazione: spiegazione ? getComputedStyle(spiegazione).fontSize : null,
      corpoSorella: sorella ? getComputedStyle(sorella).fontSize : null,
      corpoAiuto: getComputedStyle(aiuto).fontSize,
      larghezzaAiuto: aiuto.getBoundingClientRect().width,
      larghezzaRiga: aiuto.closest('.talos-setting').getBoundingClientRect().width,
    };
  });
  expect(m.distanza, 'il segno è lontano dal titolo').toBeGreaterThanOrEqual(0);
  expect(m.distanza, 'il segno è lontano dal titolo').toBeLessThanOrEqual(12);
  expect(m.centri, 'il segno non è sulla riga del titolo').toBeLessThanOrEqual(4);
  expect(m.spiegazione, 'manca la spiegazione sotto la testata').toBeTruthy();
  expect(m.corpoSorella).toBe('13px');
  expect(m.corpoSpiegazione).toBe(m.corpoSorella);
  expect(m.corpoAiuto, 'l\'aiuto della riga non ha la misura delle sorelle').toBe(m.corpoSorella);
  expect(m.larghezzaAiuto, 'l\'aiuto è stretto e lascia un vuoto prima dell\'interruttore').toBeGreaterThan(m.larghezzaRiga / 2);
  expect(tentate).toEqual([]);
});

/*
 * FORME-09 — decisione 331 (07/11/2026), terzo giro: la revisione di correttezza del secondo giro (ROSSO) ha visto che la riga
 * `#setting-panel-tools > .talos-card > p` di `static-copy.ts` scriveva «Regole salvate con la sessione…» in OGNI paragrafo figlio di
 * OGNI carta degli Strumenti, a ogni `render()` delle Impostazioni: dopo una ricerca scritta e cancellata, o entrando negli Strumenti
 * dal selettore di sezione (senza il clic sulla scheda), la spiegazione di «Uso del computer», quella e la riga di stato di «Tieni
 * sveglio il PC» e la spiegazione di «Dove girano i comandi» diventavano la frase della politica. Si leggono i testi ESATTI, dal
 * dizionario, nelle due lingue e nei due percorsi. Il server di prova non è l'app installata (`http-app.mjs:3604`,
 * `nellAppInstallata = () => false`), quindi la riga di stato del PC sveglio dice «Solo nell'app installata.».
 */
const ATTESI_STRUMENTI = (l) => ({
  politica: TESTI[l]['impostazioni.copy.rulesSavedWithTheSession'],
  computerUse: TESTI[l]['computer.settings.description'],
  pcSveglio: TESTI[l]['varie.keepAwake.help'],
  pcSveglioStato: TESTI[l]['varie.keepAwake.onlyInApp'],
  doveGirano: TESTI[l]['varie.commandsDefault.description'],
});
const leggiStrumenti = (page) => page.evaluate(() => {
  const p = (s) => document.querySelector(`#setting-panel-tools ${s}`)?.textContent ?? null;
  return {
    politica: p('[data-settings-card="tools-policy"] > p'),
    computerUse: p('[data-settings-card="tools-computer-use"] > [data-computer-use-descrizione]'),
    pcSveglio: p('[data-settings-card="tools-pc-sveglio"] > [data-pc-sveglio-aiuto]'),
    pcSveglioStato: p('[data-settings-card="tools-pc-sveglio"] > [data-pc-sveglio-stato]'),
    doveGirano: p('[data-settings-card="tools-dove-girano"] > [data-dove-serie-descrizione]'),
  };
});
/* I tre percorsi che ridisegnano le Impostazioni, per una sezione qualunque (`sezione`), con `privacy` come sezione «altrove». */
const PERCORSI = [
  ['una ricerca scritta e poi cancellata', async (page, sezione) => {
    const ricerca = page.locator('#settingsSearch');
    /* revisione prove c331 giro 3, reperto 1 (c331g3-revisione-prove.md:15, 07/11/2026): «sveglio» nascondeva il pannello solo perché le carte
       dinamiche non sono indicizzate (schema.ts:131), un difetto noto. Una parola che non trova NIENTE nasconde ogni pannello e mostra il vuoto,
       oggi e il giorno in cui quel difetto si cura. */
    await ricerca.fill('zqxjvw');
    await expect(page.locator(`#setting-panel-${sezione}`)).toBeHidden();
    await expect(page.locator('#schermoImpostazioni .settings-empty')).toBeVisible();
    await ricerca.fill('');
    await expect(page.locator(`#setting-panel-${sezione}`)).toBeVisible();
  }],
  ['il selettore di sezione, via e ritorno', async (page, sezione) => {
    const scegli = (s) => page.evaluate((v) => {
      const sel = document.querySelector('#settingsSectionSelect'); sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, s);
    await scegli('privacy');
    await expect(page.locator(`#setting-panel-${sezione}`)).toBeHidden();
    await scegli(sezione);
    await expect(page.locator(`#setting-panel-${sezione}`)).toBeVisible();
  }],
  /* revisione prove c331 giro 3, reperto 2 (c331g3-revisione-prove.md:16, 07/11/2026): sul PC il selettore è nascosto (settings.css:81, si mostra
     solo sotto i 660 px del contenitore, settings.css:548); il percorso vero è il clic su un'altra scheda e il ritorno, a 1920×1080. */
  ['il clic su un\'altra scheda e il ritorno, sul PC', async (page, sezione) => {
    await page.locator('#setting-tab-privacy').click();
    await expect(page.locator(`#setting-panel-${sezione}`)).toBeHidden();
    await page.locator(`#setting-tab-${sezione}`).click();
    await expect(page.locator(`#setting-panel-${sezione}`)).toBeVisible();
  }, { pc: true }],
];
for (const lingua of ['it', 'en']) {
  for (const [nome, percorso, { pc = false } = {}] of PERCORSI) {
    test(`FORME-09 · ${lingua}: le spiegazioni delle carte degli Strumenti restano le loro dopo ${nome}`, async ({ page }) => {
      if (pc) await page.setViewportSize({ width: 1920, height: 1080 }); // revisione prove c331 giro 3, reperto 2 (07/11/2026)
      const tentate = await avvia(page, { lingua });
      await apriSezione(page, 'tools');
      await expect(page.locator('#setting-computerUseToggle')).toBeEnabled({ timeout: 8000 });
      await expect(page.locator('#setting-panel-tools [data-pc-sveglio-stato]')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('#setting-panel-tools [data-dove-serie-descrizione]')).toHaveText(ATTESI_STRUMENTI(lingua).doveGirano, { timeout: 8000 });
      expect(await leggiStrumenti(page), 'prima del percorso').toEqual(ATTESI_STRUMENTI(lingua));
      await percorso(page, 'tools');
      expect(await leggiStrumenti(page), `dopo ${nome}`).toEqual(ATTESI_STRUMENTI(lingua));
      expect(tentate).toEqual([]);
    });
  }
}

/*
 * FORME-10 — decisione 331 (07/11/2026), quarto giro: le revisioni di correttezza (c331g3-revisione-correttezza.md:12-17) e di vista
 * (c331g3-revisione-vista.md:10) del terzo giro hanno visto la stessa classe di FORME-09 nella Memoria: `#setting-panel-memoria > .talos-card
 * > p:first-of-type` di `static-copy.ts` scriveva a ogni `render()` la frase di «Ripartizione del contesto» nella spiegazione di «Motore del
 * contesto» e di «Compattazione della conversazione», le due carte che si montano dopo. Si leggono i testi ESATTI di ogni carta, dal
 * dizionario, nelle due lingue e nei tre percorsi.
 */
const ATTESI_MEMORIA = (l) => ({
  ripartizione: TESTI[l]['impostazioni.copy.contextAlreadyOccupiedBeforeYou'],
  ripartizioneStima: TESTI[l]['impostazioni.copy.toolUsageIsAnEstimate'],
  motore: TESTI[l]['varie.contextEngine.card.description'],
  compattazione: TESTI[l]['varie.compaction.card.description'],
});
const leggiMemoria = (page) => page.evaluate(() => {
  const p = (s) => document.querySelector(`#setting-panel-memoria ${s}`)?.textContent ?? null;
  return {
    ripartizione: p('[data-settings-card="memoria-context"] > p:first-of-type'),
    ripartizioneStima: p('[data-settings-card="memoria-context"] > p:last-child'),
    motore: p('[data-settings-card="memoria-motore-contesto"] > [data-motore-contesto-descrizione]'),
    compattazione: p('[data-settings-card="memoria-compattazione"] > [data-compattazione-descrizione]'),
  };
});
for (const lingua of ['it', 'en']) {
  for (const [nome, percorso, { pc = false } = {}] of PERCORSI) {
    test(`FORME-10 · ${lingua}: le spiegazioni delle carte della Memoria restano le loro dopo ${nome}`, async ({ page }) => {
      if (pc) await page.setViewportSize({ width: 1920, height: 1080 });
      const tentate = await avvia(page, { lingua });
      await apriSezione(page, 'memoria');
      /* le due carte dinamiche si montano dopo la lettura di `/api/v1/context-settings` (motore-contesto.js:68, carta-compattazione.js:182) */
      await expect(page.locator('#setting-panel-memoria [data-motore-contesto-descrizione]')).toHaveText(ATTESI_MEMORIA(lingua).motore, { timeout: 8000 });
      await expect(page.locator('#setting-panel-memoria [data-compattazione-descrizione]')).toHaveText(ATTESI_MEMORIA(lingua).compattazione, { timeout: 8000 });
      expect(await leggiMemoria(page), 'prima del percorso').toEqual(ATTESI_MEMORIA(lingua));
      await percorso(page, 'memoria');
      expect(await leggiMemoria(page), `dopo ${nome}`).toEqual(ATTESI_MEMORIA(lingua));
      expect(tentate).toEqual([]);
    });
  }
}

/*
 * FORME-11 — stesso giro: costi e spazio di lavoro avevano la stessa forma per posizione (`> .talos-card > p`). Oggi nessuna carta dinamica
 * si monta lì (revisione correttezza g3, c331g3-revisione-correttezza.md:19), quindi questa è una GUARDIA, non una prova rossa: inchioda i
 * testi esatti delle carte dei due pannelli dopo i tre percorsi, nelle due lingue.
 */
const ATTESI_ALTRI = (l) => ({
  costi: TESTI[l]['impostazioni.copy.usageByDayAndModel'],
  costiNota: TESTI[l]['impostazioni.copy.currencyAmountsAreReportedBy'],
  spazio: TESTI[l]['impostazioni.copy.folderAndDataForThe'],
});
const leggiAltri = (page) => page.evaluate(() => {
  const p = (s) => document.querySelector(s)?.textContent ?? null;
  return {
    costi: p('#setting-panel-costi > [data-settings-card="costi-usage"] > p:first-of-type'),
    costiNota: p('#setting-panel-costi > [data-settings-card="costi-usage"] > #costiNota'),
    spazio: p('#setting-panel-workspace > [data-settings-card="workspace-session"] > p'),
  };
});
for (const lingua of ['it', 'en']) {
  test(`FORME-11 · ${lingua}: le spiegazioni dei costi e dello spazio di lavoro restano le loro dopo i tre percorsi`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const tentate = await avvia(page, { lingua });
    for (const sezione of ['costi', 'workspace']) {
      await apriSezione(page, sezione);
      for (const [, percorso] of PERCORSI) await percorso(page, sezione);
    }
    expect(await leggiAltri(page)).toEqual(ATTESI_ALTRI(lingua));
    expect(tentate).toEqual([]);
  });
}
