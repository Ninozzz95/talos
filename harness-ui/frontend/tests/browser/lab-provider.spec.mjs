import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * ============================================================================
 * LA SCHEDA «PROVIDER» — FASE 4, CORSIA 2, 19/09/2026
 * ============================================================================
 * Prova `src/components/provider-card.js`. Il modulo si serve dalla SORGENTE su
 * disco (`page.route('**\/__lab\/*.js')` + `import()` dalla pagina, che la CSP
 * `script-src 'self'` ammette perché è same-origin) e si disegna sulla CARTA
 * VERA del laboratorio, coi FORNITORI VERI che il server dichiara: niente finto
 * DOM, niente fixture. È la stessa forma della prova della FASE 3
 * (`_fase3-banda.spec.mjs`), e per la stessa ragione: `public/` lo costruisce e
 * lo consegna l'orchestratore, e una prova che dipendesse dal bundle misurerebbe
 * il bundle di ieri.
 *
 * ⛔ LE MISURE DEL MOCKUP, IN UN POSTO SOLO — e vengono dal DOM VIVO, non dal suo
 *   CSS letto a occhio. Sonda del 19/09/2026 su
 *   `C:\Users\Antonino\Downloads\TALOS-Calm-Lab-04.html` (md5
 *   `952fd467eff2cdd331f968c419fa1cc0`), rotta `#/impostazioni/modelli/providers`:
 *
 *     viewport 1440 → contenuto 1122 · `.provider-grid` 2 colonne gap 20 · card 551×332
 *     viewport 1024 → contenuto  754 · `.provider-grid` 1 colonna gap 15 · card 754×303
 *     `.provider-card`      padding 22px · raggio 12px · bordo 1px
 *     `.provider-head`      flex · align-items center · gap 12px · margin-bottom 24px
 *     `.model-glyph`        38×38 · raggio 10px
 *     `.badge`              11px/500 · padding 4px 7px · raggio 5px · gap 5px
 *     `.status-dot`         5×5
 *     `.provider-actions`   flex · gap 10px
 *
 * ⛔ E UNA MISURA NON SI PORTA, SI DICHIARA. Il mockup ha 1122 px di contenuto, noi
 *   **792** (misurato: `#modelLabCard` 842, il gruppo delle schede 792): la colonna
 *   delle Impostazioni ha la sua navigazione accanto. ⇒ **551 non è raggiungibile**,
 *   e la prova NON lo pretende: pretende il NUMERO DI COLONNE e le misure interne
 *   della card (padding, raggio, gap, corpi), che sono quelle che il mockup detta.
 *   Le due colonne da 386 che ne escono sono il mockup alla nostra larghezza.
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA — provato ROMPENDO DAVVERO IL PRODOTTO, una
 *   mutazione per volta su `src/components/provider-card.js`, il 19/09/2026. Baseline
 *   verde prima, ripristino **byte-identico** dopo (sha256 `c375ffee…b342`, verificato
 *   col `diff`: identico, sha256 `8a241fcc…4e6e`). Tredici mutazioni, **tredici rossi**:
 *
 *     | mutazione                                            | prova   |
 *     |------------------------------------------------------|---------|
 *     | la carta perde il padding 22px                       | PROV-01 |
 *     | la griglia torna a due colonne fisse (niente soglia) | PROV-02 |
 *     | «Configura» perde `data-provider-toggle`             | PROV-03 |
 *     | «Verifica accesso» non entra nel piede               | PROV-03 |
 *     | D9: la testata del pannello non si nasconde          | PROV-04 |
 *     | il punto di stato passa da 5px a 9px                 | PROV-01 |
 *     | la testata torna sulla classe col `+` di `::after`   | PROV-01 |
 *     | una riga di fatti torna un campo grezzo del server   | PROV-01 |
 *     | l'avviso ricopia la frase del mockup                 | PROV-04 |
 *     | la cura D9 morde ANCHE fuori dal guscio (M10)        | PROV-06 |
 *     | l'avviso nasce ANCHE fuori dal guscio (M11)          | PROV-06 |
 *     | l'id del corpo perde l'ambito (il doppione torna)    | PROV-07 |
 *     | il nome accessibile si capovolge col verso           | PROV-08 |
 *
 * ⛔ E UNA MUTAZIONE HA PRODOTTO UN FALSO ROSSO, che va detto perché è la trappola di sempre:
 *   la prima versione di M11 l'avevo lanciata con `-g "PROV-08"` **quando PROV-08 non esisteva**.
 *   Playwright esce in errore per «nessun test trovato», lo script leggeva «ROSSO» e il
 *   riepilogo avrebbe dichiarato una prova che morde — su una prova che non c'era. La cura:
 *   la prova si scrive PRIMA, si guarda verde, e solo dopo si muta.
 *
 * ⛔ E UNA COSA QUESTA PROVA **NON** PUÒ PROVARE, dichiarata invece che nascosta: le card
 *   che si vedono qui le disegna la SORGENTE di oggi chiamata dalla prova, non il bundle
 *   che il server consegna — `public/` è dell'orchestratore. ⇒ Le foto provano il CODICE,
 *   non la consegna; la verifica sul 4174 la fa l'orchestratore dopo il build.
 * ============================================================================
 */

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const CARTELLA_FOTO = resolve(process.cwd(), 'artifacts', 'fase4-provider', 'foto');

/** Le misure del mockup. Coi selettori da cui vengono. */
const MOCKUP = Object.freeze({
  card: { paddingTop: '22px', paddingRight: '22px', paddingBottom: '22px', paddingLeft: '22px', borderRadius: '12px', borderTopWidth: '1px' },
  testata: { display: 'flex', alignItems: 'center', columnGap: '12px', marginBottom: '24px' },
  glifo: { width: '38px', height: '38px', borderRadius: '10px' },
  pastiglia: { minHeight: '0px', paddingTop: '4px', paddingBottom: '4px', paddingLeft: '7px', paddingRight: '7px', borderRadius: '5px', borderTopWidth: '0px', fontSize: '11px', fontWeight: '500', columnGap: '5px' },
  punto: { width: '5px', height: '5px' },
  azioni: { display: 'flex', columnGap: '10px' },
  /* `.provider-facts > div`: flex · gap 10 · padding 12px 0 · filetto in basso. Il CORPO del
     mockup è alto così (`.provider-facts{font-size:.75rem}`), e da noi il 12px sta sulle due
     parti (`settings.css:365,372`) invece che sulla riga: la misura che si vede è la stessa,
     ed è quella che si controlla qui — vedi `kvTesto`. */
  kv: { display: 'flex', columnGap: '10px', paddingTop: '12px', paddingBottom: '12px', borderBottomWidth: '1px' },
  kvTesto: { fontSize: '12px' },
});
/** Le due larghezze del brief. */
const SOGLIE = { larga: 1440, stretta: 1024 };

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
}

/** I valori di una serie di proprietà, su OGNI nodo che il selettore trova DENTRO il pannello. */
async function stili(page, selettore, proprieta) {
  return page.evaluate(([sel, props]) => {
    const dentro = document.querySelector('#modelLabCard [data-model-lab-panel="providers"]') || document;
    const nodi = [...dentro.querySelectorAll(sel)];
    return {
      n: nodi.length,
      misure: nodi.map((n) => {
        const cs = getComputedStyle(n);
        const o = {};
        for (const p of props) o[p] = cs[p];
        return o;
      }),
    };
  }, [selettore, proprieta]);
}

/** Solo le proprietà che NON corrispondono all'atteso. Vuoto = la misura è quella del mockup. */
function scostamenti(misura, atteso) {
  const fuori = {};
  for (const [k, v] of Object.entries(atteso)) if (misura[k] !== v) fuori[k] = `${misura[k]} ≠ ${v}`;
  return fuori;
}

/**
 * Apre l'app, va in Impostazioni → Laboratorio modelli → scheda «Provider», e
 * ridisegna la lista con la SORGENTE del modulo e le righe VERE del server.
 * ⛔ Nessuna scrittura: ogni richiesta non-GET viene fermata e registrata.
 */
async function apriProvider(page, { colorMode = 'dark', test = false } = {}) {
  const tentate = [];
  const prove = [];
  /* ⛔ PRIMA il blocco, POI l'eccezione — e l'ordine NON è indifferente: Playwright prova i
     gestori in ordine INVERSO a quello di registrazione, quindi un `page.route('**\/*')` messo
     per ultimo vince su tutto e la sonda verrebbe ABORTITA dal blocco stesso. Misurato: con
     l'ordine opposto `prove` restava vuoto e la prova accusava ««Verifica accesso» non ha
     chiamato la sonda» mentre il difetto era nella prova. */
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  /* Il POST della sonda: si CONTA invece di sperarlo, ed è l'unica non-GET ammessa. */
  if (test) {
    await page.route('**/api/v1/providers/*/test', (route) => {
      prove.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { provider: 'x', esito: 'collegato', motivo: 'Servizio raggiunto.', modelli: 4, millisecondi: 12 } }) });
    });
  }
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' }, chat: {}, workspaces: {} }));
  }, colorMode);
  await serviIlModulo(page);
  await page.goto('/');
  /* ⛔ Si aspetta che il VELO D'AVVIO se ne sia andato: senza questa riga le foto
     fotografano la pagina nocciola con la marca TALOS al centro e le card «non si vedono». */
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
  });
  await page.click('#modelLabCard [data-lab-scheda="providers"]');
  await expect(page.locator('#modelLabCard [data-model-lab-panel="providers"]')).toBeVisible();
  const esito = await page.evaluate(async () => {
    const modulo = await import('/__lab/provider-card.js');
    window.__prov = modulo;
    const risposta = await (await fetch('/api/v1/providers')).json();
    window.__righe = risposta.data.items;
    const lista = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList');
    modulo.aggiornaProviderList(lista, window.__righe, { aperte: new Set(['openrouter']) });
    /*
     * ⛔ IL PANNELLO SI RIMONTA DALLA SORGENTE DI OGGI, e non è un trucco della prova: il
     *   bundle che il server serve è quello costruito ieri, e questa prova misura il codice che
     *   l'orchestratore consegnerà. Il montaggio dell'app (col bundle vecchio) ha già messo il
     *   suo timbro, quindi si toglie e si richiama `montaProviderPanel` QUELLO DI OGGI — che è
     *   la stessa cosa che farà il boot dopo il build. Il timbro evita il doppio `#providerRefresh`
     *   da solo (`provider-card.js`), quindi rimontare non duplica niente: è il suo contratto.
     */
    const pannello = document.querySelector('#modelLabCard [data-model-lab-panel="providers"]');
    const primaRefresh = pannello.querySelectorAll('#providerRefresh').length;
    delete pannello.dataset.providerMontato;
    modulo.montaProviderPanel(pannello);
    const dopoRefresh = pannello.querySelectorAll('#providerRefresh').length;
    return { n: window.__righe.length, prima: window.__righe[0]?.id ?? null, lista: Boolean(lista), primaRefresh, dopoRefresh };
  });
  return { tentate, prove, esito };
}

/** Ridisegna le card con la sorgente di OGGI (dopo che l'app ha ridisegnato le sue). */
async function ridisegna(page, aperte = ['openrouter']) {
  await page.evaluate((a) => {
    window.__prov.aggiornaProviderList(document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList'), window.__righe, { aperte: new Set(a) });
  }, aperte);
}

async function foto(page, nome) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.screenshot({ path: resolve(CARTELLA_FOTO, `${nome}.png`), fullPage: false, animations: 'disabled' });
}

test.describe('la scheda Provider — il vestito del mockup sul contenuto vero', () => {
  test('PROV-01 — le card del server hanno la forma del mockup, e sono TUTTE', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    const { esito } = await apriProvider(page);
    /* La premessa si ASSERISCE: se il server non dichiara fornitori, la misura sotto sarebbe vacua. */
    expect(esito.lista, 'il pannello Provider non ha una lista: la misura sarebbe vacua').toBe(true);
    expect(esito.n, 'il server deve dichiarare i suoi fornitori').toBeGreaterThanOrEqual(28);
    /* ⛔ Il rimontaggio non deve duplicare il comando: `#providerRefresh` è un ID, e due nodi
       con lo stesso id in un albero sono un difetto che questo repo ha già pagato (18/09). */
    expect(esito.dopoRefresh, 'il rimontaggio crea UN #providerRefresh, non due').toBe(1);
    expect(esito.primaRefresh, 'e ce n\'era già uno solo').toBe(1);

    const card = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]');
    await expect(card, 'una card per ogni fornitore che il server dichiara').toHaveCount(esito.n);

    /* ── LA CARTA — padding 22 · raggio 12 · bordo 1 (mockup `.provider-card`) ─────────── */
    const carte = await stili(page, '[data-provider-id]', Object.keys(MOCKUP.card));
    expect(carte.n).toBe(esito.n);
    carte.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.card), `carta ${i + 1} di ${carte.n}`).toEqual({}));

    /* ── LA GRIGLIA — due colonne a questa larghezza, come il mockup a 1122 ───────────── */
    const lista = await page.evaluate(() => {
      const n = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList');
      const cs = getComputedStyle(n);
      return { display: cs.display, colonne: cs.gridTemplateColumns.split(' ').length, gap: cs.columnGap };
    });
    expect(lista.display).toBe('grid');
    expect(lista.colonne, 'a 1440 il mockup ha DUE colonne (misurato)').toBe(2);
    expect(lista.gap).toBe('20px');

    /* ── LA TESTATA — glifo, nome, sottotitolo, UNA pastiglia di stato ─────────────────── */
    const testate = await stili(page, '.talos-provider__testata', Object.keys(MOCKUP.testata));
    expect(testate.n).toBe(esito.n);
    testate.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.testata), `testata ${i + 1}`).toEqual({}));
    /* ⛔ E NIENTE SEGNO DI APERTURA SULLA TESTATA — questo l'ha trovato la FOTO, non il DOM
       (19/09/2026): la testata portava ancora la classe `talos-provider__head`, e quella classe
       disegna un `+` con un `::after` (`index.css:2688`). Un pseudo-elemento NON si spegne da
       CSSOM, quindi la cura è stata cambiare la classe — e questa riga la tiene cambiata: la
       misura che conta è che il `::after` non disegni niente. */
    const segni = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] .talos-provider__testata')].map((n) => getComputedStyle(n, '::after').content));
    expect(segni.length).toBe(esito.n);
    expect(new Set(segni), 'la testata non deve disegnare un segno di apertura').toEqual(new Set(['none']));
    const glifi = await stili(page, '.talos-provider__glifo', Object.keys(MOCKUP.glifo));
    expect(glifi.n, 'ogni card ha il suo glifo').toBe(esito.n);
    glifi.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.glifo), `glifo ${i + 1}`).toEqual({}));

    /* La pastiglia: la riga di stato del mockup, col suo punto. */
    const pastiglie = await stili(page, '.talos-provider__testata .talos-badge', Object.keys(MOCKUP.pastiglia));
    expect(pastiglie.n, 'una pastiglia di stato per card').toBe(esito.n);
    pastiglie.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.pastiglia), `pastiglia ${i + 1}`).toEqual({}));
    const punti = await stili(page, '.talos-provider__testata .talos-badge .talos-dot', Object.keys(MOCKUP.punto));
    expect(punti.n, 'e il punto della riga di stato').toBe(esito.n);
    punti.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.punto), `punto ${i + 1}`).toEqual({}));

    /* ── I FATTI — `.provider-facts` del mockup, e sono `.talos-kv` (che ha già quelle misure) ── */
    const kv = await stili(page, '.talos-provider__fatti .talos-kv', Object.keys(MOCKUP.kv));
    /* ⛔ Due righe come MINIMO, non tre: la card del mockup che non ha un indirizzo ne porta
       due. E le due che ci sono SEMPRE si nominano, o il minimo non direbbe quali. */
    expect(kv.n, 'ogni card porta almeno due fatti').toBeGreaterThanOrEqual(esito.n * 2);
    const chiavi = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')].map((c) => [...c.querySelectorAll('.talos-provider__fatti .talos-kv__k')].map((n) => n.textContent)));
    for (const [i, k] of chiavi.entries()) {
      expect(k, `la card ${i + 1} non dice la credenziale`).toContain('Credenziale');
      expect(k, `la card ${i + 1} non dice l'ultima prova`).toContain('Ultima prova');
      /* E niente campi grezzi del server fra le chiavi: vedi la nota in `provider-card.js`. */
      expect(k, `la card ${i + 1} porta una chiave che il mockup non ha`).not.toContain('Esecuzione');
    }
    kv.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.kv), `riga di fatti ${i + 1} di ${kv.n}`).toEqual({}));
    const kvTesto = await stili(page, '.talos-provider__fatti .talos-kv__k, .talos-provider__fatti .talos-kv__v', Object.keys(MOCKUP.kvTesto));
    expect(kvTesto.n, 'chiave e valore di ogni fatto').toBe(kv.n * 2);
    kvTesto.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.kvTesto), `testo della riga di fatti ${i + 1}`).toEqual({}));

    /* ── IL PIEDE — `.provider-actions`: flex, gap 10 ─────────────────────────────────── */
    const piedi = await stili(page, '.talos-provider__azioni', Object.keys(MOCKUP.azioni));
    expect(piedi.n).toBe(esito.n);
    piedi.misure.forEach((m, i) => expect(scostamenti(m, MOCKUP.azioni), `piede ${i + 1}`).toEqual({}));

    /* ── E IL CONTENUTO È QUELLO VERO: il nome è l'etichetta del server, non un id ─────── */
    const nomi = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')].map((n) => ({ id: n.dataset.providerId, nome: n.querySelector('.talos-provider__name')?.textContent })));
    const righe = await page.evaluate(() => Object.fromEntries(window.__righe.map((r) => [r.id, r.label])));
    for (const { id, nome } of nomi) expect(nome, `la card ${id} non porta il nome del server`).toBe(righe[id]);
  });

  test('PROV-02 — a 1024 la griglia ripiega a UNA colonna, e la card resta dentro il suo contenitore', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.stretta, height: 900 });
    await apriProvider(page);
    const misura = await page.evaluate(() => {
      const n = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList');
      const card = n.querySelector('[data-provider-id]');
      const gruppo = n.closest('.talos-tabs__panel, .talos-lab__gruppo, section') || n.parentElement;
      return { colonne: getComputedStyle(n).gridTemplateColumns.split(' ').length, gap: getComputedStyle(n).columnGap, larghezzaCard: card.getBoundingClientRect().width, larghezzaGruppo: gruppo.getBoundingClientRect().width, eccedenza: document.documentElement.scrollWidth - window.innerWidth };
    });
    /* ⛔ Il mockup, a 754 di contenuto, ha UNA colonna con gap 15: da noi la soglia è espressa
       relativa al contenitore (`min(100%, 340px)`), quindi quello che si pretende è il
       COMPORTAMENTO — una colonna sola — non il numero 754, che è il suo contenitore e non il nostro. */
    expect(misura.colonne, 'a 1024 il mockup ripiega a una colonna').toBe(1);
    expect(misura.larghezzaCard, 'la card riempie il contenitore senza sfondarlo').toBeLessThanOrEqual(misura.larghezzaGruppo + 1);
    expect(misura.eccedenza, 'e niente scorre in orizzontale').toBeLessThanOrEqual(0);
  });

  test('PROV-03 — «Configura» apre la configurazione VERA, e «Verifica accesso» fa partire la sonda VERA', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    const { prove, tentate } = await apriProvider(page, { test: true });

    const card = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"]');
    const corpo = card.locator('.talos-provider__body');
    const configura = card.locator('.talos-provider__azioni [data-provider-toggle]');

    /* La card è CHIUSA di partenza, e il comando lo dichiara. */
    await expect(corpo).toBeHidden();
    await expect(configura).toHaveAttribute('aria-expanded', 'false');
    await expect(configura).toContainText('Configura');
    await configura.click();

    /* ⛔ LA PROVA CHE MORDE: il clic passa per la REGIA VERA (`app.js`, delega su
       `[data-provider-toggle]`) e cambia lo stato VERO. Staccando `data-provider-toggle` dal
       pulsante, questa riga diventa rossa: lo stato dell'app non cambia e la card resta chiusa. */
    await expect.poll(() => page.evaluate(() => {
      const c = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"]');
      return c?.querySelector('.talos-provider__body')?.hidden ?? null;
    }), { message: '«Configura» non ha aperto la configurazione' }).toBe(false);

    /* E la sonda: `data-provider-action="test"` è il nome che la regia riconosce. */
    await ridisegna(page);
    const verifica = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"] .talos-provider__azioni [data-provider-action="test"]');
    await expect(verifica).toHaveText('Verifica accesso');
    await verifica.click();
    await expect.poll(() => prove.length, { message: '«Verifica accesso» non ha chiamato la sonda' }).toBe(1);
    expect(prove[0]).toBe('/api/v1/providers/openai/test');

    /* ⛔ E niente scritture: l'unica non-GET è quella che abbiamo intercettato noi. */
    expect(tentate.filter((t) => !t.includes('/test')), 'nessuna scrittura non prevista').toEqual([]);
  });

  test('PROV-04 — D9: nella scheda «Provider» c\'è UNA testata sola', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriProvider(page);
    const testate = await page.evaluate(() => {
      const gruppo = document.querySelector('#modelLabCard [data-lab-frase="providers"]')?.parentElement;
      const pannello = document.querySelector('#modelLabCard [data-model-lab-panel="providers"]');
      const visibili = [...gruppo.querySelectorAll('h2,h3,h4')].filter((n) => n.offsetParent !== null);
      return {
        visibili: visibili.map((n) => ({ tag: n.tagName, testo: n.textContent.replace(/\s+/g, ' ').trim() })),
        /* Le due del difetto, misurate sulla 4174 il 19/09: se restano nel DOM ma non si vedono,
           è esattamente la cura — e il testo non si perde (il cancello lo pretende). */
        h4: pannello.querySelector('.model-lab-panel-heading h4')?.textContent ?? null,
        h4Nascosto: pannello.querySelector('.model-lab-panel-heading h4')?.hidden ?? null,
        nota: pannello.querySelector('.model-lab-panel-heading p')?.textContent ?? null,
        avviso: pannello.querySelector('[data-provider-avviso]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        avvisoVisibile: Boolean(pannello.querySelector('[data-provider-avviso]')?.offsetParent),
      };
    });
    expect(testate.visibili.map((t) => t.testo), 'la scheda Provider deve avere UNA testata, non due').toEqual(['Collegamenti, non scatole nere.']);
    expect(testate.h4, 'il titolo legacy resta nel DOM (il cancello dell\'identità lo legge)').toBe('Fornitori e accessi');
    expect(testate.h4Nascosto, 'ma non si vede: è la doppia testata del difetto D9').toBe(true);
    expect(testate.nota, 'e la sua frase non si butta').toContain('Le chiavi restano sul computer');
    expect(testate.avvisoVisibile, 'scende nell\'avviso in fondo alla griglia, come nel mockup').toBe(true);
    expect(testate.avviso).toContain('Le chiavi restano sul computer');
    /* ⛔ E la frase del MOCKUP non si ricopia: in TALOS è falsa (qui le chiavi vere si inseriscono). */
    expect(testate.avviso).not.toContain('Qui non inserire chiavi reali');
  });

  /*
   * ⛔ IL VERSO CONTRARIO DELLA CURA DI D9 — e senza questa prova la cura sarebbe una
   *   scommessa: nascondere la testata del pannello è giusto DENTRO il guscio, dove il
   *   guscio ne porta già una; fuori — la schermata Impostazioni, il velo — quella
   *   testata è l'UNICA che c'è, e nasconderla lascerebbe la pagina senza nome.
   *   `lab-montaggio-neutro.spec.mjs:571` pretende che il testo resti «Fornitori e accessi»:
   *   quella spec oggi si ferma prima, su una prova di un'ALTRA corsia (`misura-memoria`,
   *   `MONTAGGIO-04`: atteso «6,9 GiB», letto «6,9»), quindi il verso contrario lo si prova qui.
   */
  test('PROV-06 — fuori dal guscio la testata del pannello RESTA, e l\'avviso non nasce', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriProvider(page);
    const esito = await page.evaluate(() => {
      /* La carta VERA si clona col suo markup (niente DOM inventato), si monta FUORI dal
         guscio — che è la condizione della schermata Impostazioni e del velo — e si monta
         DUE volte, perché il timbro è il contratto che impedisce il secondo `#providerRefresh`. */
      const clone = document.querySelector('#modelLabCard [data-model-lab-panel="providers"]').cloneNode(true);
      /*
       * ⛔ E IL CLONE VA RIPORTATO ALLO STATO DI PARTENZA, o questa prova non proverebbe NIENTE —
       *   l'ha detto la prova stessa, al primo giro: `cloneNode(true)` copia anche il TIMBRO
       *   (`data-provider-montato="true"`, quindi `montaProviderPanel` usciva subito) e copia
       *   l'`hidden` che la cura del guscio aveva già messo sulla testata — così il rosso
       *   arrivava per il motivo sbagliato e un verde sarebbe stato VACUO. Si toglie ciò che
       *   il montaggio di prima aveva aggiunto: timbro, `#providerRefresh`, avviso, `hidden`.
       *   È la stessa disciplina di `lab-montaggio-neutro.spec.mjs`, che clona il velo e lo monta.
       */
      delete clone.dataset.providerMontato;
      clone.querySelector('#providerRefresh')?.remove();
      clone.querySelectorAll('[data-provider-avviso]').forEach((n) => n.remove());
      clone.querySelector('.model-lab-panel-heading h4')?.removeAttribute('hidden');
      clone.querySelector('.model-lab-panel-heading p')?.removeAttribute('hidden');
      document.body.append(clone);
      window.__prov.montaProviderPanel(clone);
      window.__prov.montaProviderPanel(clone);
      const h4 = clone.querySelector('.model-lab-panel-heading h4');
      const nota = clone.querySelector('.model-lab-panel-heading p');
      const fuori = {
        timbro: clone.dataset.providerMontato ?? null,
        titolo: h4?.textContent ?? null,
        titoloNascosto: h4?.hidden ?? null,
        notaNascosta: nota?.hidden ?? null,
        avvisi: clone.querySelectorAll('[data-provider-avviso]').length,
        refresh: clone.querySelectorAll('#providerRefresh').length,
      };
      /* Si stacca SUBITO: finché sta nel documento il suo `#providerRefresh` sarebbe un
         secondo nodo con lo stesso id — esattamente il difetto che quel timbro previene. */
      clone.remove();
      return { ...fuori, idNelDocumento: document.querySelectorAll('#providerRefresh').length };
    });
    expect(esito.timbro).toBe('true');
    expect(esito.titolo, 'fuori dal guscio la testata del pannello è l\'unica che c\'è').toBe('Fornitori e accessi');
    expect(esito.titoloNascosto, 'e NON si nasconde').toBe(false);
    expect(esito.notaNascosta, 'e la sua nota resta dove stava').toBe(false);
    expect(esito.avvisi, 'l\'avviso è del guscio: qui non nasce').toBe(0);
    expect(esito.refresh, 'il montaggio crea UN #providerRefresh, non due').toBe(1);
    expect(esito.idNelDocumento, 'e il documento torna ad averne UNO solo (id unici)').toBe(1);
  });

  /*
   * ⛔ L'ID DEL CORPO DELLA CARD NON SI RIPETE — segnalato dalla corsia 4 (Sistema) il 19/09/2026,
   *   mentre misurava la sua superficie: `#provider-body-openrouter` compariva DUE volte nel
   *   prodotto. È la classe di difetto che il 18/09 ha già portato una Home galleggiante sopra la
   *   chat sul server dell'owner (`#schermoHome` doppio), e per la ragione di sempre:
   *   `getElementById`/`querySelector('#x')` tornano il PRIMO in ordine d'albero, quindi
   *   `aria-controls` e qualunque lettura per id possono finire sul nodo SBAGLIATO in silenzio.
   * ⛔ Il velo «Fornitori e accessi» disegna lo STESSO fornitore del pannello, con lo stesso
   *   renderer: due card accese insieme ⇒ due `id` uguali. Questa prova le accende insieme e conta.
   */
  test('PROV-07 — l\'id del corpo della card è UNICO anche col velo aperto', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriProvider(page);
    const chiuso = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id] .talos-provider__body')].map((n) => n.id);
      return { corpi: ids.length, unici: new Set(ids).size, doppi: ids.filter((x, i) => ids.indexOf(x) !== i) };
    });
    expect(chiuso.corpi, 'un corpo per card').toBeGreaterThanOrEqual(28);
    expect(chiuso.doppi, 'col pannello da solo non ci sono id doppi').toEqual([]);

    /* E ORA IL VELO, che è dove il doppione nasce: la stessa riga, disegnata una seconda volta. */
    await page.evaluate(() => window.__talosHarnessUiRuntime.apriVeloMockup('veloFornitori'));
    await expect(page.locator('#veloFornitori')).toBeVisible();
    await page.evaluate(() => {
      /* Il velo si popola dalla regia dell'app, che gira col bundle di ieri: si ridisegna con la
         SORGENTE di oggi, come tutto il resto di questa prova. */
      const lista = document.querySelector('#veloFornitori [data-velo-lista]');
      const riga = window.__righe.find((r) => r.id === 'openrouter');
      /*
       * ⛔ LA LISTA SI SVUOTA PRIMA, e non è un dettaglio: il renderer RIUSA la card precedente
       *   quando la sua firma non cambia (`aggiornaProviderList`), e quella lì l'ha disegnata il
       *   bundle di ieri — con l'id vecchio. Senza questa riga la prova restava ROSSA anche dopo
       *   la cura, e accusava il prodotto di un difetto che era della prova: l'ha detto il
       *   secondo giro, non il ragionamento. Qui si vuole il disegno della SORGENTE di oggi.
       */
      lista.replaceChildren();
      window.__prov.aggiornaProviderList(lista, [riga], { aperte: new Set(['openrouter']) });
    });
    await expect(page.locator('#veloFornitori article[data-provider-id]')).toHaveCount(1);
    const aperto = await page.evaluate(() => {
      const tutti = [...document.querySelectorAll('[data-provider-id] .talos-provider__body')].map((n) => n.id);
      const doppi = tutti.filter((x, i) => tutti.indexOf(x) !== i);
      return { corpi: tutti.length, doppi, esempio: doppi[0] ?? null };
    });
    expect(aperto.doppi, `questi id di corpo sono ripetuti: ${JSON.stringify(aperto.doppi)}`).toEqual([]);
  });

  /*
   * ⛔ IL NOME DEL COMANDO NON SI CAPOVOLGE COL SUO VERSO — e la prima stesura faceva esattamente
   *   questo («Configura» da chiuso, «Chiudi» da aperto, `aria-label` capovolto insieme). La
   *   ricerca del 19/09/2026 l'ha SMENTITA: con `aria-expanded` che porta già lo stato, cambiare
   *   anche il nome fa annunciare la stessa cosa due volte e in versi opposti. Fonti in
   *   `provider-card.js` (W3C WAI-ARIA APG «Disclosure», e la regola per esteso).
   *   ⇒ Questa prova tiene ferma quella riga: nome e testo STABILI, stato solo in `aria-expanded`,
   *     e il nome che contiene la parola visibile (WCAG 2.5.3 «Label in Name»).
   */
  test('PROV-08 — il nome di «Configura» non cambia col verso: lo stato sta in aria-expanded', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriProvider(page);
    const leggi = () => page.evaluate(() => {
      const n = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"] .talos-provider__azioni [data-provider-toggle]');
      return n ? { nome: n.getAttribute('aria-label'), testo: n.textContent.trim(), espanso: n.getAttribute('aria-expanded') } : null;
    });
    /* Chiuso: lo dice `aria-expanded`, e il nome nomina il CONTENUTO (il fornitore), non l'azione. */
    const chiuso = await leggi();
    expect(chiuso.espanso).toBe('false');
    expect(chiuso.nome).toBe('Configura OpenAI');
    expect(chiuso.testo).toBe('Configura');
    expect(chiuso.nome, 'Label in Name: il nome deve contenere la parola visibile').toContain(chiuso.testo);

    /* Si apre DAVVERO (passando dalla regia vera, come PROV-03), poi si ridisegna con la
       sorgente di oggi e si rilegge lo STESSO comando da aperto. */
    const card = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"]');
    await card.locator('.talos-provider__azioni [data-provider-toggle]').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"] .talos-provider__body')?.hidden ?? null)).toBe(false);
    await ridisegna(page, ['openai']);
    const aperto = await leggi();
    expect(aperto.espanso, 'aperto: lo stato è cambiato').toBe('true');
    expect(aperto.nome, '⛔ il nome accessibile NON deve cambiare col verso del comando').toBe(chiuso.nome);
    expect(aperto.testo, 'e nemmeno il testo visibile').toBe(chiuso.testo);
  });

  test('PROV-05 — le card reggono la finestra stretta del velo, e il velo vero si apre ancora', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriProvider(page);
    /* La porta VERA del velo è la sua funzione di runtime, come fa `velo-fornitori.spec.mjs`. */
    await page.evaluate(() => window.__talosHarnessUiRuntime.apriVeloMockup('veloFornitori'));
    await expect(page.locator('#veloFornitori')).toBeVisible();
    await expect(page.locator('#veloFornitori article[data-provider-id]')).toHaveCount(1);
    const dentro = await page.evaluate(() => {
      const c = document.querySelector('#veloFornitori article[data-provider-id]');
      return { display: getComputedStyle(c.parentElement).display, colonne: getComputedStyle(c.parentElement).gridTemplateColumns.split(' ').length, eccede: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(dentro.colonne, 'un fornitore solo sta in una colonna sola').toBe(1);
    expect(dentro.eccede, 'niente scorrimento orizzontale nel velo').toBeLessThanOrEqual(0);
  });
});

/*
 * ============================================================================
 * LE FOTO — due temi, due larghezze, come chiede il brief
 * ============================================================================
 * `fullPage: false` di proposito: la pagina intera del laboratorio è alta migliaia di
 * pixel e in una foto intera la card diventa illeggibile. Si fotografa la FINESTRA,
 * con la scheda Provider in cima.
 */
test('PROV-FOTO — la scheda Provider nei due temi e alle due larghezze', async ({ page }) => {
  /* ⛔ Una PAGINA NUOVA per ogni combinazione, e non la stessa riusata: `addInitScript`
     si accumula a ogni navigazione, quindi il tema dell'ultimo giro resterebbe scritto
     in `localStorage` anche per i giri dopo — ed è la trappola che ha già prodotto due
     foto false in questo repo (18/09: «due lati in temi diversi = confronto falso»). */
  for (const modo of ['dark', 'light']) {
    for (const larghezza of [SOGLIE.larga, SOGLIE.stretta]) {
      const nuova = await page.context().newPage();
      await nuova.setViewportSize({ width: larghezza, height: 900 });
      await apriProvider(nuova, { colorMode: modo });
      /* Due inquadrature per combinazione, e non è un lusso: la prima mostra la TESTATA della
         scheda (dove si vede la cura di D9 — una sola, non due), la seconda le CARD. Una foto
         sola della griglia non direbbe niente della doppia testata, e una sola della testata non
         direbbe niente della forma della card. */
      await nuova.evaluate(() => document.querySelector('#modelLabCard [data-lab-frase="providers"]')?.scrollIntoView({ block: 'start' }));
      await nuova.waitForTimeout(200);
      await foto(nuova, `provider-testata-${modo}-${larghezza}`);
      await nuova.evaluate(() => document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList')?.scrollIntoView({ block: 'start' }));
      await nuova.waitForTimeout(200);
      await foto(nuova, `provider-card-${modo}-${larghezza}`);
      await nuova.close();
    }
  }
});
