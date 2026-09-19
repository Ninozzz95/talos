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
 * ⛔⛔ E IL 19/09/2026 SERA, FASE 4-bis — SEI MUTAZIONI NUOVE, e UNA HA BOCCIATO LA PROVA.
 *   Baseline verde su tutte e sette le spec prima di rompere; una rottura per volta;
 *   ripristino dal file originale e sha256 confrontato. Le nuove:
 *
 *     | mutazione                                              | prova   | esito |
 *     |--------------------------------------------------------|---------|-------|
 *     | «Configura» perde `stopPropagation` (la card si ridisegna sotto la modale) | PROV-03 | rosso |
 *     | la modale si apre con `open` invece di `showModal()`   | PROV-03 | rosso |
 *     | il corpo della modale perde `flex`/`overflow:auto`     | PROV-09 | rosso |
 *     | l'icona di «Configura» torna in CODA                   | PROV-01 | **VERDE al primo giro** |
 *     | la modale non si riapre dopo il ridisegno              | PROV-03 | rosso |
 *     | il velo torna a chiudere la modale                     | PROV-03 | rosso |
 *
 *   ⛔ E LA QUARTA È LA LEZIONE DEL GIRO: la riga che doveva mordere sull'ordine dell'icona
 *     leggeva `firstElementChild`, e la parola «Configura» è un NODO DI TESTO — `firstElementChild`
 *     salta i nodi di testo, quindi trovava l'`<svg>` sia prima sia dopo. **La prova era cieca e
 *     diceva verde.** Si legge `childNodes[0]`, e allora morde. È la stessa famiglia della
 *     mutazione che nel giro precedente aveva prodotto un falso rosso per una prova che non
 *     esisteva: una prova si giudica da cosa succede QUANDO IL PRODOTTO È ROTTO, mai dal verde.
 *   ⛔ E una nota sul banco, perché è costata un giro: il primo lanciatore usava
 *     `execFileSync('npx', …)`, che su Windows non trova `npx.cmd` senza shell — OGNI esecuzione
 *     falliva e il riepilogo scriveva «ROSSO» anche per la BASELINE. Dodici «prove che mordono»
 *     che non provavano niente, e il numero era bello proprio perché era rotto. Si lancia il CLI
 *     per percorso (`node node_modules/@playwright/test/cli.js`), come `run-browser-tests.mjs`.
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
  const salvataggi = [];
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
    /* Il salvataggio della configurazione — quello che preme la PRIMARIA della modale. Si conta
       come la sonda, e per la stessa ragione: una primaria che non salva niente è un pulsante
       che promette un'altra cosa, e senza questa riga la prova non se ne accorgerebbe. */
    await page.route('**/api/v1/providers/*/runtime', (route) => {
      salvataggi.push({ percorso: new URL(route.request().url()).pathname, corpo: route.request().postDataJSON() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
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
  return { tentate, prove, salvataggi, esito };
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
    /*
     * ── I DUE COMANDI DEL PIEDE HANNO LA FORMA DEL MOCKUP ──────────────────────────────────
     * ⛔ `.button` misurato dal DOM vivo: min-height 38 · padding 9px 13px · raggio 8 · bordo 1 ·
     *   12px/550 · gap 8 · icona 16×16 IN TESTA alla parola. Il primo giro aveva l'altezza 32,
     *   il bordo 2, il peso 600, nessuna icona — e poi l'icona in CODA (vista nella foto:
     *   «Configura» a destra, «Verifica accesso» a sinistra, due pulsanti uguali e diversi).
     */
    const comandi = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id] .talos-provider__azioni button')].map((b) => {
      const cs = getComputedStyle(b);
      /*
       * ⛔ `childNodes[0]`, NON `firstElementChild`: la parola «Configura» è un NODO DI TESTO, e
       *   `firstElementChild` salta i nodi di testo — quindi trovava l'`<svg>` sia quando stava
       *   PRIMA sia quando stava DOPO. La prima stesura di questa riga era cieca all'ordine, e
       *   l'ha detto la prova che morde: rimettendo l'icona in coda, questa prova restava VERDE.
       */
      const primo = b.childNodes[0];
      const eIcona = primo?.nodeName?.toLowerCase() === 'svg';
      return {
        testo: b.textContent.trim(),
        altezza: Math.round(b.getBoundingClientRect().height),
        raggio: cs.borderTopLeftRadius, bordo: cs.borderTopWidth, peso: cs.fontWeight, misura: cs.fontSize, gap: cs.columnGap,
        iconaPrima: eIcona,
        icona: eIcona ? `${Math.round(primo.getBoundingClientRect().width)}x${Math.round(primo.getBoundingClientRect().height)}` : null,
      };
    }));
    /* ⛔ Due comandi per card TRANNE UNA: l'agente esterno tiene la sua sonda nel CORPO
       («Prova collegamento», ed è il gesto principale di quella card), quindi nel piede ha solo
       «Configura». È una differenza dichiarata da `provider-card.js`, non una card a cui manca
       un comando — e va contata, o la riga direbbe «56» e accuserebbe il prodotto. */
    expect(comandi.length, 'due comandi per card, meno la sonda dell\'agente esterno che vive nel corpo').toBe(esito.n * 2 - 1);
    for (const c of comandi) {
      expect(scostamenti({ altezza: `${c.altezza}px`, raggio: c.raggio, bordo: c.bordo, peso: c.peso, misura: c.misura, gap: c.gap },
        { altezza: '38px', raggio: '8px', bordo: '1px', peso: '550', misura: '12px', gap: '8px' }), `«${c.testo}» non ha la forma del mockup`).toEqual({});
      expect(c.iconaPrima, `«${c.testo}»: l'icona del mockup sta PRIMA della parola`).toBe(true);
      expect(c.icona, `«${c.testo}»: l'icona del mockup misura 16×16`).toBe('16x16');
    }

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

  /*
   * ⛔⛔ RISCRITTA IL 19/09/2026 (FASE 4-bis) — IL BERSAGLIO È CAMBIATO, IL SIGNIFICATO NO.
   *   Il significato resta: «"Configura" apre la configurazione VERA di QUEL fornitore». Il
   *   bersaglio non può più essere il corpo che si apre in linea, perché l'owner ha bocciato
   *   proprio quello («su 4174 c'è un **collapse bruttissimo**») e al suo posto c'è la **modale
   *   del mockup**. ⇒ Si prova la modale: che sia un `<dialog>` APERTO, dentro quella card, col
   *   nome del fornitore e i campi veri.
   * ⛔ E si prova anche il verso che PRIMA non esisteva: che il clic NON passi dalla regia della
   *   disclosure. Senza il `stopPropagation`, `app.js` scriverebbe `aria-expanded` invertito e
   *   `c.hidden` sul corpo, e la lista si RIDISEGNEREBBE portandosi via la card con dentro la
   *   modale appena aperta — una modale che si chiude da sola, senza un errore da nessuna parte.
   *   La riga `prove.length` + `data-provider-signature` invariata è quella che lo morde.
   */
  test('PROV-03 — «Configura» apre la MODALE col nome del fornitore e i campi veri, e «Verifica accesso» fa partire la sonda VERA', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    const { prove, tentate, salvataggi } = await apriProvider(page, { test: true });

    const card = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"]');
    const corpo = card.locator('.talos-provider__body');
    const configura = card.locator('.talos-provider__azioni [data-provider-toggle]');

    /* La configurazione è CHIUSA di partenza, e il comando lo dichiara. */
    await expect(card.locator(':scope > .talos-provider__modale')).toHaveCount(0);
    await expect(corpo).toBeHidden();
    await expect(configura).toHaveAttribute('aria-expanded', 'false');
    await expect(configura).toContainText('Configura');
    const firmaPrima = await card.getAttribute('data-provider-signature');
    await configura.click();

    /* ── LA MODALE C'È, ed è una modale vera ─────────────────────────────────────────── */
    const modale = card.locator(':scope > .talos-provider__modale');
    await expect(modale, '«Configura» non ha aperto nessuna modale').toHaveCount(1);
    const stato = await page.evaluate(() => {
      const d = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"] > .talos-provider__modale');
      const r = d.getBoundingClientRect();
      return {
        tag: d.tagName, open: d.open, modale: d.matches(':modal'),
        titolo: d.querySelector('h2')?.textContent ?? null,
        etichettata: Boolean(document.getElementById(d.getAttribute('aria-labelledby'))),
        dentroLaCard: Boolean(d.closest('[data-provider-id="openai"]')),
        /*
         * ⛔ «Il resto è inerte» NON si legge da `elemento.inert`: la proprietà IDL `inert` è
         *   un'ALTRA cosa (l'attributo), e un `<dialog>` aperto con `showModal()` blocca il resto
         *   a livello del browser senza scriverla addosso a nessuno. L'ho scoperto così: la prima
         *   stesura di questa riga leggeva `.inert` su una card lontana, trovava `false` e
         *   accusava il prodotto di un difetto che non c'era. Si misura invece l'EFFETTO —
         *   provare a portare il fuoco fuori, e vedere che non ci va.
         */
        fuocoBloccatoFuori: (() => {
          const fuori = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
          if (!fuori) return null;
          fuori.focus({ preventScroll: true });
          return d.contains(document.activeElement);
        })(),
        chiave: Boolean(d.querySelector('[data-provider-key]')),
        indirizzo: Boolean(d.querySelector('[data-provider-endpoint]')),
        avviso: d.querySelector('[data-provider-modale-avviso]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        annulla: d.querySelector('[data-provider-modale-annulla]')?.textContent ?? null,
        primaria: d.querySelector('[data-provider-modale-salva]')?.textContent ?? null,
        primariaTipo: d.querySelector('[data-provider-modale-salva]')?.dataset.providerModaleSalva ?? null,
        fuocoDentro: d.contains(document.activeElement),
        fuocoSu: document.activeElement?.getAttribute('data-provider-key') !== null ? 'chiave' : (document.activeElement?.tagName ?? null),
        larghezza: Math.round(r.width), altezza: Math.round(r.height),
        /* Il corpo NON si è spostato fuori dalla card: la regia lo cerca con
           `button.closest('[data-provider-id]')` e da lì `card.querySelector('[data-provider-key]')`. */
        corpoDentroLaCard: Boolean(d.querySelector('.talos-provider__body')),
      };
    });
    expect(stato.tag).toBe('DIALOG');
    expect(stato.open, 'il `<dialog>` non è aperto').toBe(true);
    expect(stato.modale, '`showModal()` non è stato chiamato: il resto della pagina non è inerte e il fuoco scappa').toBe(true);
    expect(stato.titolo, 'il titolo del mockup: «Configura <Fornitore>»').toBe('Configura OpenAI');
    expect(stato.etichettata, '`aria-labelledby` deve puntare a un nodo vero').toBe(true);
    expect(stato.dentroLaCard, 'la modale vive DENTRO la card: è lì che la regia cerca i campi').toBe(true);
    expect(stato.corpoDentroLaCard, 'e i campi sono ancora suoi discendenti').toBe(true);
    expect(stato.fuocoBloccatoFuori, 'aperta la modale, il fuoco non deve poter uscire dal suo riquadro').toBe(true);
    /* I CAMPI VERI, non due `readonly` dimostrativi come quelli del mockup. */
    expect(stato.chiave, 'manca il campo della chiave').toBe(true);
    expect(stato.indirizzo, 'OpenAI dichiara `supportsEndpoint`: l\'indirizzo deve esserci').toBe(true);
    /*
     * ⛔ E LA NOTA DI SICUREZZA STA QUI, dov'è nel mockup (il suo `.inline-notice` è dentro la
     *   modale) — ma con le NOSTRE parole: quelle del mockup («Confermando si modifica solo lo
     *   stato temporaneo del prototipo») in TALOS sono false. La prova tiene tutte e due le metà.
     */
    expect(stato.avviso, 'la nota di sicurezza deve stare dentro la modale, dove si scrivono le credenziali').toContain('Le chiavi restano sul computer');
    expect(stato.avviso, 'e deve dire le verifiche distinte, che è la frase vera').toContain('verifiche distinte');
    expect(stato.avviso, 'la frase del mockup è del prototipo: qui sarebbe falsa').not.toContain('stato temporaneo del prototipo');
    expect(stato.annulla).toBe('Annulla');
    /* ⛔ LA PRIMARIA È IL GESTO VERO DELLA CARD, e il suo nome lo dice. Il mockup porta «Salva
       configurazione demo»: la sua è un'azione di PROTOTIPO. Qui la primaria preme il pulsante
       che la card premerebbe davvero — per OpenAI la CONFIGURAZIONE (indirizzo e tempo massimo,
       il `save-runtime` che la regia serve da sempre), per un fornitore che non ne ha una, la
       chiave. Un piede che promette «Salva configurazione» dove non c'è niente da configurare
       sarebbe la stessa classe di difetto del pulsante che promette un'altra cosa. */
    expect(stato.primaria).toBe('Salva configurazione');
    expect(stato.primariaTipo).toBe('runtime');
    /* E il corpo NON perde il suo gesto: «Salva chiave» resta dentro la modale, raggiungibile. */
    expect(await card.locator('.talos-provider__body [data-provider-action="save-key"]').count(), 'la chiave ha ancora il suo pulsante').toBe(1);
    /* Il fuoco entra nel primo controllo utile, non sul contenitore. */
    expect(stato.fuocoDentro, 'il fuoco è rimasto fuori dalla modale').toBe(true);
    expect(stato.fuocoSu, 'il fuoco entra nel primo controllo UTILE').toBe('chiave');
    expect(stato.larghezza, 'la larghezza del mockup').toBe(600);
    expect(stato.altezza).toBeGreaterThan(200);

    /*
     * ── IL VERSO CHE CONTA: il clic NON è passato dalla regia della disclosure ──────────
     * Se ci passasse, `providerAperti` cambierebbe e la lista si RIDISEGNEREBBE: la firma della
     * card cambierebbe e la card verrebbe sostituita — con dentro la modale appena aperta.
     */
    expect(await card.getAttribute('data-provider-signature'), 'la card è stata ridisegnata sotto la modale: il clic è arrivato alla regia').toBe(firmaPrima);
    await expect(modale, 'la modale si è chiusa da sola').toHaveCount(1);

    /* ── ESC CHIUDE, e il fuoco TORNA a chi ha aperto (WCAG 2.1.2 + APG «Dialog (Modal)») ── */
    await page.keyboard.press('Escape');
    await expect(modale, 'ESC non ha chiuso la modale').toHaveCount(0);
    const dopoEsc = await page.evaluate(() => {
      const a = document.activeElement;
      return { chi: a?.getAttribute('data-provider-toggle') ? 'configura' : a?.tagName ?? null, espanso: a?.getAttribute('aria-expanded') ?? null, dentro: a?.closest('[data-provider-id]')?.dataset.providerId ?? null };
    });
    expect(dopoEsc.chi, 'il fuoco non è tornato al pulsante che ha aperto la modale').toBe('configura');
    expect(dopoEsc.dentro).toBe('openai');
    expect(dopoEsc.espanso, 'e lo stato è tornato chiuso').toBe('false');
    /* Il corpo è tornato al suo posto, e richiuso. */
    await expect(corpo).toBeHidden();
    await expect(card.locator(':scope > .talos-provider__modale')).toHaveCount(0);

    /* ── E LA MODALE NON SI CHIUDE DAL VELO: dentro ci sono le chiavi che si stanno scrivendo ── */
    await configura.click();
    await expect(modale).toHaveCount(1);
    await page.mouse.click(20, 400); // fuori dal riquadro: sul velo scuro
    await expect(modale, 'un clic fuori non deve buttare via quello che si è scritto').toHaveCount(1);

    /*
     * ── E IL RIDISEGNO DELLA LISTA NON SE LA PORTA VIA ──────────────────────────────────
     * ⛔ Salvare RIDISEGNA: il salvataggio chiama l'«Aggiorna» del prodotto, la riga del fornitore
     *   cambia, la firma della card cambia e il renderer ne costruisce una NUOVA — portandosi via
     *   la card vecchia e, con lei, la modale appena aperta. Misurato il 19/09/2026: la richiesta
     *   partiva con il valore giusto e la modale spariva senza mostrare l'esito.
     * ⛔ QUI IL RIDISEGNO LO GUIDA LA PROVA, e non è un trucco: la regia che serve il salvataggio
     *   è quella del BUNDLE di ieri (`public/`, dell'orchestratore), quindi il SUO ridisegno
     *   userebbe il renderer di ieri. La cura è di OGGI e vive in `aggiornaProviderList`: per
     *   provarla si chiama quella, con la riga aggiornata — cioè ciò che farà il boot dopo il
     *   build. (È la stessa cosa che questa spec dichiara in testa: le foto provano il CODICE,
     *   non la consegna.)
     */
    await page.evaluate(() => {
      const righe = window.__righe.map((r) => r.id === 'openai' ? { ...r, endpoint: 'https://esempio.test/v1', endpointConfigured: true } : r);
      window.__righe = righe;
      window.__prov.aggiornaProviderList(document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList'), righe, {});
    });
    await expect(modale, 'il ridisegno della lista si è portato via la modale').toHaveCount(1);
    await expect(card.locator('.talos-provider__fatti'), 'la card nuova porta il dato nuovo').toContainText('Indirizzo personalizzato');
    await expect(card.locator('[data-provider-modale-salva]'), 'e la modale è quella della card nuova').toHaveCount(1);

    /*
     * ── LA PRIMARIA SALVA DAVVERO ─────────────────────────────────────────────────────
     * Non si crede al nome: si preme e si CONTA la richiesta. E si vede anche che il valore
     * scritto dentro la modale arriva al salvataggio — i campi sono gli STESSI nodi del corpo,
     * non due copie che si somigliano.
     */
    await card.locator('[data-provider-endpoint]').fill('https://esempio.test/v2');
    await card.locator('[data-provider-modale-salva]').click();
    await expect.poll(() => salvataggi.length, { message: 'la primaria della modale non ha salvato niente' }).toBe(1);
    expect(salvataggi[0].percorso).toBe('/api/v1/providers/openai/runtime');
    expect(salvataggi[0].corpo.endpoint, 'l\'indirizzo scritto nella modale arriva al salvataggio').toBe('https://esempio.test/v2');
    /* L'esito vive DENTRO la modale, dove stanno i campi: è la ragione per cui non si chiude. */
    await expect(card.locator('[data-provider-feedback]')).toHaveText('Collegamento salvato.');
    /*
     * ⛔ E QUI LA PROVA SI FERMA, DICHIARANDO IL CONFINE. Dopo il salvataggio il ridisegno lo fa
     *   la REGIA DEL BUNDLE (quella di ieri, servita da `public/`), che non ha la cura di oggi:
     *   la card viene sostituita e la modale va con lei. Nel prodotto, dopo il build, il ridisegno
     *   passa dal renderer di oggi e la modale resta — ed è ciò che la prova qui sopra ha appena
     *   misurato. Quello che si può pretendere DA QUESTA parte del confine è che l'esito
     *   sopravviva al ridisegno: il nodo del feedback è preservato, e si legge.
     */

    /*
     * ⛔ E PRIMA DELLA SONDA SI ASPETTA CHE IL RIDISEGNO DEL SALVATAGGIO SIA FINITO, poi si chiude
     *   la modale se è ancora lì. Non è pignoleria: questa prova è diventata ROSSA A SINGHIOZZO
     *   finché la riga non c'è stata, e la causa era una CORSA — dopo «Salva configurazione»
     *   partono DUE ridisegni, quello del bundle (che porta via la card con la modale) e quello
     *   della sorgente di oggi (che con `daRiaprire` la RIAPRE). Quale arrivasse per ultimo
     *   dipendeva dal tempo, e con la modale aperta il piede della card è coperto: il clic su
     *   «Verifica accesso» scadeva a 30 s. Una prova che balla non protegge — e una prova che
     *   accusa il prodotto di una corsa che ha fatto lei è peggio di nessuna prova.
     *   ⇒ L'ATTESA è ancorata a un fatto osservabile (la riga aggiornata è arrivata alla card),
     *     non a un `waitForTimeout`, e la CHIUSURA è una conseguenza dichiarata, non un caso.
     */
    await expect(card.locator('.talos-provider__fatti')).toContainText('Indirizzo personalizzato');
    if (await card.locator(':scope > .talos-provider__modale').count()) await card.locator('[data-provider-modale-annulla]').click();
    await expect(card.locator(':scope > .talos-provider__modale')).toHaveCount(0);

    /* E la sonda: `data-provider-action="test"` è il nome che la regia riconosce. */
    await ridisegna(page);
    const verifica = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"] .talos-provider__azioni [data-provider-action="test"]');
    await expect(verifica).toHaveText('Verifica accesso');
    await verifica.click();
    await expect.poll(() => prove.length, { message: '«Verifica accesso» non ha chiamato la sonda' }).toBe(1);
    expect(prove[0]).toBe('/api/v1/providers/openai/test');

    /* ⛔ E niente scritture: le uniche non-GET sono le due che abbiamo intercettato noi. */
    expect(tentate.filter((t) => !t.includes('/test') && !t.includes('/runtime')), 'nessuna scrittura non prevista').toEqual([]);
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

    /* Si apre DAVVERO — e dal 19/09/2026 «aprire» vuol dire la MODALE (PROV-03) — poi si
       ridisegna con la sorgente di oggi e si rilegge lo STESSO comando da aperto. */
    const card = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"]');
    await card.locator('.talos-provider__azioni [data-provider-toggle]').click();
    await expect(card.locator(':scope > .talos-provider__modale')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.querySelector('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openai"] .talos-provider__body')?.hidden ?? null)).toBe(false);
    await ridisegna(page, ['openai']);
    const aperto = await leggi();
    expect(aperto.espanso, 'aperto: lo stato è cambiato').toBe('true');
    expect(aperto.nome, '⛔ il nome accessibile NON deve cambiare col verso del comando').toBe(chiuso.nome);
    expect(aperto.testo, 'e nemmeno il testo visibile').toBe(chiuso.testo);
  });

  /*
   * ⛔⛔ NIENTE, DENTRO LA MODALE, DEVE ESSERE IRRAGGIUNGIBILE — e questa prova nasce da una FOTO,
   *   non da un ragionamento. Il primo giro della modale aveva la testata e il piede fissi ma il
   *   corpo che NON scorreva: in una finestra bassa il contenuto finiva sotto il bordo e
   *   «Salva chiave» non si poteva più premere. Il `<dialog>` ha `overflow:hidden`, quindi ciò che
   *   non ci sta non si perde in silenzio: SPARISCE.
   *   ⇒ Si prova nelle condizioni in cui il difetto vive — finestra CORTA — e si pretende che
   *     l'ultimo comando del corpo diventi raggiungibile scorrendo. È la stessa disciplina del
   *     composer (18/09: «la prova va fatta nelle condizioni in cui il difetto vive, non in quelle
   *     comode»).
   */
  test('PROV-09 — in una finestra bassa il corpo della modale SCORRE, e nessun comando resta irraggiungibile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 420 });
    await apriProvider(page);
    const card = page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="bedrock"]');
    await card.locator('.talos-provider__azioni [data-provider-toggle]').click();
    const modale = card.locator(':scope > .talos-provider__modale');
    await expect(modale).toHaveCount(1);

    const misura = await page.evaluate(() => {
      const d = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="bedrock"] > .talos-provider__modale');
      const telaio = d.querySelector('.talos-provider__modale-corpo');
      const cs = getComputedStyle(telaio);
      /* ⛔ Solo i controlli che si VEDONO: in fondo al corpo stanno i comandi del menu «⋯», che
         sono `hidden` e hanno rettangolo zero — prenderli per ultimi farebbe passare (o fallire)
         la prova su un nodo che nessuno può premere. */
      const dentro = [...telaio.querySelectorAll('input,textarea,button')].filter((n) => n.getClientRects().length > 0);
      const ultimo = dentro.at(-1);
      const prima = { riquadro: d.getBoundingClientRect(), ultimo: ultimo?.getBoundingClientRect(), scorre: telaio.scrollHeight > telaio.clientHeight, overflow: cs.overflowY, altezzaDialogo: d.getBoundingClientRect().height, altezzaFinestra: window.innerHeight };
      /* Si scorre in fondo: se il corpo scorre, l'ultimo comando entra nel riquadro. */
      telaio.scrollTop = telaio.scrollHeight;
      const dopo = { ultimo: ultimo?.getBoundingClientRect() };
      return { prima, dopo, bottoni: dentro.length };
    });
    expect(misura.bottoni, 'la card di Bedrock ha comandi nel corpo: senza, la prova sarebbe vacua').toBeGreaterThan(0);
    /* La finestra è corta E il contenuto non ci sta: è la condizione del difetto. */
    expect(misura.prima.altezzaFinestra).toBeLessThan(600);
    expect(misura.prima.scorre, 'il contenuto del corpo non eccede: la prova non sta misurando il difetto').toBe(true);
    expect(misura.prima.overflow, 'il corpo deve poter scorrere').toBe('auto');
    expect(misura.prima.altezzaDialogo, 'e la modale non deve sfondare la finestra').toBeLessThanOrEqual(misura.prima.altezzaFinestra);
    /* ⛔ E LA PROVA CHE MORDE: prima dello scorrimento l'ultimo comando è FUORI dal riquadro;
       dopo, è dentro. Senza `overflow:auto` + `flex:1` sul corpo, `scrollTop` non muove niente
       e la seconda riga è rossa. */
    expect(misura.prima.ultimo.bottom, 'l\'ultimo comando era già dentro: la prova non prova niente').toBeGreaterThan(misura.prima.riquadro.bottom - 1);
    expect(misura.dopo.ultimo.bottom, 'scorrendo, l\'ultimo comando deve entrare nel riquadro').toBeLessThanOrEqual(misura.prima.riquadro.bottom + 1);
    expect(misura.dopo.ultimo.top, 'ed essersi mosso davvero').toBeLessThan(misura.prima.ultimo.top);
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
      /* ⛔ E LA MODALE, che è il difetto numero 2 dell'owner: «mi apre una modale del mock-up,
         invece su 4174 c'è un collapse bruttissimo». Si apre dalla sua porta vera (il clic su
         «Configura») e si fotografa nei due temi — perché un velo scuro e un riquadro chiaro
         vivono in due mondi diversi, e una foto sola non li mostra tutti e due. */
      await nuova.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id="openrouter"] [data-provider-toggle]').click();
      await nuova.waitForTimeout(250);
      await foto(nuova, `provider-modale-${modo}-${larghezza}`);
      await nuova.close();
    }
  }
});
