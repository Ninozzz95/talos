import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * ============================================================================
 * LA BANDA DEL LABORATORIO — la prova della FASE 3, 19/09/2026
 * ============================================================================
 * Prova `src/components/lab-cornice-v3.js` SULLA CARTA VERA dell'app viva
 * (`#modelLabCard`), come la prova della corsia 2: niente finto DOM, niente
 * fixture. Il modulo si serve dalla sua SORGENTE su disco
 * (`page.route('**\/__lab\/*.js')`) e si carica con un `import()` dalla pagina,
 * che la CSP `script-src 'self'` ammette perché è same-origin.
 *
 * ⛔ COSA PROVA, e in che verso si rompe — **OGNI RIGA È STATA PROVATA ROMPENDO
 *   DAVVERO IL PRODOTTO**, non dedotta (regola 8 del foglio di coordinamento):
 *   · si toglie la cella del budget dalla banda → **BANDA-01, 03, 04, 06**
 *     rosse (misurato: 4 rosse su 10);
 *   · si toglie `overflow-wrap:anywhere` da `.talos-lab__banda-nome > strong`
 *     → **BANDA-05 rossa su tutte e quattro** le combinazioni: con un nome senza
 *     punti di spezzatura il testo arriva a **2706 px** contro una banda che
 *     finisce a **1375 px** (1440) e a **2662 px** contro **968 px** (1024);
 *   · si toglie il blocco `@media(max-width:1250px)` → **BANDA-05 rossa a
 *     1024** in tutt'e due i temi («a 1024 la cella della politica dovrebbe
 *     essere spenta»);
 *   · si cambia `18.6` in `catalog-engine.ts:346` → **BANDA-06 rossa** (parità
 *     del numero letta dal sorgente: «non dichiara più la soglia»).
 *
 * ⛔ E UNA PRETESA È STATA RITIRATA, perché misurata FALSA. La prima stesura
 *   diceva «si toglie `min-width:0` da `.talos-lab__banda-corrente` → BANDA-05
 *   rossa», e non era vero: togliendolo la prova restava **verde**, perché la
 *   difesa che regge è un'altra (`overflow-wrap:anywhere` sul nome). Peggio: la
 *   prima versione del caso usava come «nome lungo» un id di modello VERO
 *   (`local:bartowski-nvidia_Nemotron-…`), che è pieno di trattini — e i
 *   trattini sono punti di spezzatura, quindi si avvolgeva da solo e non
 *   sfondava niente. Due volte di fila la prova è rimasta verde mentre le
 *   toglievo la cosa che nominava: è la lezione «un test che non può mai
 *   diventare rosso non sta misurando». Le due difese che NON mordono restano
 *   nel foglio come margine dichiarato, non come prova.
 *
 * ⛔ LE MISURE NON SONO INVENTATE: sono state MISURATE sul DOM vivo del mockup
 *   (`C:\Users\Antonino\Downloads\TALOS-Calm-Lab-04.html`) con Playwright, e i
 *   numeri qui sotto sono quelli. La banda del mockup, a 1600 di viewport,
 *   misura **1260×116**; a 1440, **1122×116**. Le tre celle: `setup-current`
 *   `flex:1` con `gap:14`, `setup-budget` `min-width:195px` con `padding:1px 28px`
 *   e due filetti, `setup-policy` `gap:10` `font-size:11px`. Il glifo `42×46`
 *   con l'svg `30×30`. La barra: **4px** di altezza, riempimento al **58,117%**.
 * ============================================================================
 */

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const CARTELLA_FOTO = resolve(process.cwd(), 'artifacts', 'fase3-banda', 'foto');

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

/** Apre l'app, va in Impostazioni → Modelli e monta il guscio sulla carta vera. */
async function apriEEmonta(page, { colorMode = 'dark' } = {}) {
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
      chat: {},
      workspaces: {},
    }));
  }, colorMode);
  await serviIlModulo(page);
  await page.goto('/');
  /* ⛔ E SI ASPETTA CHE IL VELO D'AVVIO SE NE SIA ANDATO — `#talosAvvio`
     (`src/avvio.js:97`), che si stacca ~650 ms dopo il primo disegno.
     Senza questa riga la prima stesura delle foto ha fotografato il VELO: una
     pagina nocciola con la marca TALOS al centro, e una banda «vuota» che era
     solo coperta. Le prove di geometria passavano lo stesso — `toBeVisible` non
     guarda chi sta sopra — quindi la foto è l'unica che poteva dirlo, ed è per
     questo che il controllo visivo non è una cortesia.
     ⛔ E la prima correzione è stata INERTE: l'avevo scritta DOPO il `return`,
     cioè irraggiungibile, e la foto è rimasta identica. Un'attesa dopo un
     `return` non aspetta niente. */
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 10000 });
  return page.evaluate(async () => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    if (voce && !voce.offsetParent) {
      const gruppo = voce.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    }
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
    const modulo = await import('/__lab/lab-cornice-v3.js');
    window.__lab = modulo;
    const card = document.querySelector('#modelLabCard');
    const montato = modulo.montaGuscioLaboratorio(card, {});
    return { montato, carta: Boolean(card) };
  });
}

/*
 * ⛔ I NUMERI DEL MOCKUP, IN UN POSTO SOLO. Ogni prova che parla di geometria
 * legge da qui: se il mockup cambia, si cambia una riga e TUTTE le prove lo
 * seguono — invece di tre copie che divergono in silenzio.
 */
const MOCKUP = Object.freeze({
  banda: { minHeight: 106, gap: 24, paddingTop: 20, paddingLeft: 22, raggio: 12 },
  glifo: { w: 42, h: 46, svg: 30 },
  budget: { minWidth: 195, paddingLeft: 28, track: 4 },
  policy: { gap: 10, fontSize: 11 },
});

const SOGLIE = { larga: 1440, stretta: 1024 };

test.describe('la banda del laboratorio', () => {
  test('BANDA-01 — le tre celle del mockup ci sono, su tutte e quattro le schede', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    const esito = await apriEEmonta(page);
    expect(esito.montato).toBe(true);

    const banda = page.locator('#modelLabCard [data-lab-banda]');
    await expect(banda).toHaveCount(1);

    // Le tre celle, nell'ordine del mockup: corrente · budget · politica.
    const figli = await banda.evaluate(nodo => [...nodo.children].map(figlio => figlio.className));
    expect(figli).toEqual([
      'talos-lab__banda-corrente',
      'talos-lab__banda-budget',
      'talos-lab__banda-policy',
    ]);

    // Le tre etichette del mockup, parola per parola.
    const testo = await banda.innerText();
    expect(testo).toContain('Modello per le nuove chat');
    expect(testo).toContain('Budget RAM · scenario demo');
    // ⛔ La terza NON è quella del mockup, e non è una dimenticanza: la frase
    // del mockup («Nessun passaggio automatico al cloud») in TALOS è FALSA — il
    // ripiego automatico esiste (`session-registry.mjs:3728-3742`). Qui si
    // pretende la frase VERA, così se qualcuno ricopia il mockup la prova lo
    // dice invece di lasciar passare una bugia con l'aria di una rassicurazione.
    expect(testo).toContain('Al cloud solo con un consenso esplicito.');
    expect(testo).not.toContain('Nessun passaggio automatico al cloud');

    // La banda sta FUORI dai pannelli, quindi si vede su tutte e quattro le
    // schede: si aprono una per una e si guarda.
    for (const scheda of ['models', 'providers', 'downloads', 'system']) {
      await page.evaluate((id) => { window.__lab.selezionaScheda(document.querySelector('#modelLabCard'), id); }, scheda);
      await expect(banda, `scheda ${scheda}: la banda sparisce`).toBeVisible();
      expect(await banda.locator('.talos-lab__banda-corrente, .talos-lab__banda-budget').count()).toBe(2);
    }
  });

  test('BANDA-02 — la pastiglia della destinazione segue il dato vero, non un testo fisso', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriEEmonta(page);
    const banda = page.locator('#modelLabCard [data-lab-banda]');
    const pastiglia = banda.locator('[data-lab-banda-badge]');

    /* ⛔ PRIMA DI TUTTO: l'app ha DAVVERO timbrato il dato che la banda legge?
       Se `app.js` smettesse di scrivere `data-modello-destinazione`, la banda
       mostrerebbe lo stato vuoto per sempre e la prova lo deve dire — invece
       di limitarsi a pilotare l'attributo a mano e dichiararsi verde. */
    const timbrato = await page.evaluate(() => {
      const nodo = document.querySelector('#modelLabActiveModel');
      return {
        c1: nodo.dataset.modelloDestinazione ?? null,
        c2: nodo.dataset.modelloId ?? null,
      };
    });
    expect(timbrato.c1, 'app.js non timbra data-modello-destinazione: la banda non sa la destinazione').not.toBeNull();
    expect(['', 'locale', 'cloud']).toContain(timbrato.c1);
    expect(timbrato.c2, 'app.js non timbra data-modello-id').not.toBeNull();

    /* E i due capi dicono la stessa cosa: il dato timbrato e la pastiglia
       disegnata. Questa è la riga che lega il disegno al dato. */
    const coerenza = await page.evaluate(() => {
      const nodo = document.querySelector('#modelLabActiveModel');
      const p = document.querySelector('[data-lab-banda] [data-lab-banda-badge]');
      return { dato: nodo.dataset.modelloDestinazione, visibile: !p.hidden, testo: p.textContent };
    });
    if (coerenza.dato === '') expect(coerenza.visibile).toBe(false);
    else expect(coerenza.testo).toBe(coerenza.dato === 'locale' ? 'Locale' : 'Cloud');

    /* Il dato VERO è `data-modello-destinazione` sul nodo che `app.js:8400`
       scrive. Si muove QUELLO — non il testo a schermo — e la banda lo segue. */
    const metti = (destinazione, nome) => page.evaluate(([valore, testo]) => {
      const nodo = document.querySelector('[data-lab-banda] #modelLabActiveModel');
      nodo.dataset.modelloDestinazione = valore;
      nodo.textContent = testo;
      window.__lab.aggiornaBandaLaboratorio(document.querySelector('#modelLabCard'));
    }, [destinazione, nome]);

    await metti('locale', 'Qwen3 8B · Q4_0');
    await expect(pastiglia).toBeVisible();
    await expect(pastiglia).toHaveText('Locale');
    expect(await pastiglia.evaluate(n => n.classList.contains('talos-badge--success'))).toBe(true);

    await metti('cloud', 'glm-5.3-flash');
    await expect(pastiglia).toHaveText('Cloud');
    expect(await pastiglia.evaluate(n => n.classList.contains('talos-badge--accent'))).toBe(true);

    // Nessuna scelta: NIENTE pastiglia. Il ripiego «tutto il resto è Cloud»
    // disegnerebbe «Cloud» sopra un modello che non c'è.
    await metti('', 'Scegli il modello');
    await expect(pastiglia).toBeHidden();
    // E la nota cambia con lo stato: lo stato vuoto del mockup ha la sua frase.
    await expect(banda.locator('[data-lab-banda-nota]')).toHaveText(
      'Esplora il laboratorio, anche senza configurare un provider.');

    await metti('locale', 'X · Q4_0');
    await expect(banda.locator('[data-lab-banda-nota]')).toHaveText('Le chat già aperte non cambiano.');

    /* ⛔ E LA CLASSIFICAZIONE È UNA SOLA, non una copia in questa banda.
       `data-modello-destinazione` lo scrive `app.js` chiamando
       `fornitoreDelModello` (`workspace-footer.js:63`) — la funzione che il
       piede della sidebar usa già. Se qualcuno la riscrivesse qui dentro, la
       destinazione mostrata e quella usata dal resto del prodotto potrebbero
       divergere in silenzio; questa riga legge il sorgente di entrambi e
       pretende che la banda NON contenga una classificazione propria. */
    const bandaSorgente = readFileSync(resolve(COMPONENTI, 'lab-cornice-v3.js'), 'utf8');
    // ⛔ Si cerca il CODICE, non la prosa: il modulo SPIEGA in un commento
    // perché non importa quella funzione, e un `toContain` nudo prenderebbe la
    // spiegazione invece dell'import. La prima stesura è caduta esattamente lì.
    expect(bandaSorgente).not.toMatch(/\bimport\b[^;\n]*workspace-footer/);
    expect(bandaSorgente).not.toMatch(/\bfornitoreDelModello\s*\(/);
    expect(bandaSorgente).not.toMatch(/startsWith\('local:/);
    const appSorgente = readFileSync(resolve(process.cwd(), 'src', 'legacy', 'app.js'), 'utf8');
    expect(appSorgente).toContain('fornitoreDelModello(grezzo)');
  });

  test('BANDA-03 — il budget è la soglia dichiarata sul totale VERO della macchina', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriEEmonta(page);
    const banda = page.locator('#modelLabCard [data-lab-banda]');
    const frazione = banda.locator('[data-lab-banda-frazione]');
    const track = banda.locator('[data-lab-banda-track]');

    // Il numeratore è la costante dichiarata del catalogo.
    await expect(banda.locator('[data-lab-banda-valore]')).toHaveText('18,6');
    await expect(banda.locator('.talos-lab__banda-unita')).toHaveText('GiB');

    /* Il DENOMINATORE è misurato: si muove `#machineMemoryMetric`, il nodo che
       il pannello Sistema riempie, e la banda deve seguirlo DA SOLA (la prova
       non richiama `aggiornaBandaLaboratorio`: lo fa l'osservatore della carta). */
    await page.evaluate(() => {
      const nodo = document.querySelector('#machineMemoryMetric');
      nodo.textContent = '32 GiB';
    });
    await expect(frazione).toHaveText('su 32 GiB');
    await expect(track).toBeVisible();
    // 18,6 / 32 = 58,125% — lo STESSO conto del mockup, che sta al 58,117%.
    const riempimento = banda.locator('[data-lab-banda-fill]');
    const pct = await riempimento.evaluate(n => Number.parseFloat(n.style.width));
    expect(pct).toBeGreaterThan(58);
    expect(pct).toBeLessThan(58.3);

    /* E il denominatore è davvero quello: cambiando la RAM totale, la barra si
       sposta. Se la banda mostrasse ancora la RAM LIBERA questo non accadrebbe. */
    await page.evaluate(() => { document.querySelector('#machineMemoryMetric').textContent = '20 GiB'; });
    await expect(frazione).toHaveText('su 20 GiB');
    expect(await riempimento.evaluate(n => Number.parseFloat(n.style.width))).toBeGreaterThan(92);

    /* La fonte non è ancora misurata: la frazione SPARISCE e la barra pure.
       Non si inventa uno zero, e non si mostra un rapporto senza denominatore. */
    await page.evaluate(() => { document.querySelector('#machineMemoryMetric').textContent = '—'; });
    await expect(frazione).toHaveText('');
    await expect(track).toBeHidden();
    // Il numeratore resta: è una soglia dichiarata, non una misura. Non
    // dipende dalla macchina, quindi non ha motivo di sparire con lei.
    await expect(banda.locator('[data-lab-banda-valore]')).toHaveText('18,6');
  });

  test('BANDA-04 — le misure sono quelle del mockup, non «belle a vedersi»', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriEEmonta(page);
    const banda = page.locator('#modelLabCard [data-lab-banda]');

    const misure = await banda.evaluate((nodo) => {
      const stile = getComputedStyle(nodo);
      const glifo = nodo.querySelector('.talos-lab__banda-glifo');
      const svg = glifo?.querySelector('svg');
      const budget = nodo.querySelector('.talos-lab__banda-budget');
      const policy = nodo.querySelector('.talos-lab__banda-policy');
      const track = nodo.querySelector('[data-lab-banda-track]');
      const corrente = nodo.querySelector('.talos-lab__banda-corrente');
      return {
        banda: {
          minHeight: stile.minHeight, gap: stile.gap, paddingTop: stile.paddingTop,
          paddingLeft: stile.paddingLeft, raggio: stile.borderRadius,
        },
        glifo: { w: glifo?.getBoundingClientRect().width, h: glifo?.getBoundingClientRect().height },
        svg: { w: svg?.getBoundingClientRect().width, h: svg?.getBoundingClientRect().height },
        budget: { minWidth: getComputedStyle(budget).minWidth, paddingLeft: getComputedStyle(budget).paddingLeft },
        track: track?.getBoundingClientRect().height,
        policy: { gap: getComputedStyle(policy).gap, fontSize: getComputedStyle(policy).fontSize },
        correnteGap: getComputedStyle(corrente).gap,
        // ⛔ La riga che tiene la banda dentro la colonna: senza, il nome di un
        // modello locale (che è lungo) allarga la cella invece di stringerla.
        correnteMinWidth: getComputedStyle(corrente).minWidth,
      };
    });

    expect(misure.banda.minHeight).toBe(`${MOCKUP.banda.minHeight}px`);
    expect(misure.banda.gap).toBe(`${MOCKUP.banda.gap}px`);
    expect(misure.banda.paddingTop).toBe(`${MOCKUP.banda.paddingTop}px`);
    expect(misure.banda.paddingLeft).toBe(`${MOCKUP.banda.paddingLeft}px`);
    expect(misure.banda.raggio).toBe(`${MOCKUP.banda.raggio}px`);
    expect(misure.correnteGap).toBe('14px');
    expect(misure.correnteMinWidth).toBe('0px');
    expect(misure.glifo.w).toBe(MOCKUP.glifo.w);
    expect(misure.glifo.h).toBe(MOCKUP.glifo.h);
    expect(misure.svg.w).toBe(MOCKUP.glifo.svg);
    expect(misure.svg.h).toBe(MOCKUP.glifo.svg);
    expect(misure.budget.minWidth).toBe(`${MOCKUP.budget.minWidth}px`);
    expect(misure.budget.paddingLeft).toBe(`${MOCKUP.budget.paddingLeft}px`);
    expect(misure.track).toBe(MOCKUP.budget.track);
    expect(misure.policy.gap).toBe(`${MOCKUP.policy.gap}px`);
    expect(misure.policy.fontSize).toBe(`${MOCKUP.policy.fontSize}px`);
  });

  for (const [nome, larghezza] of [['larga', SOGLIE.larga], ['stretta', SOGLIE.stretta]]) {
    for (const modo of ['dark', 'light']) {
      test(`BANDA-05 — a ${larghezza} in tema ${modo} la banda non sfonda la colonna`, async ({ page }) => {
        await page.setViewportSize({ width: larghezza, height: 900 });
        await apriEEmonta(page, { colorMode: modo });

        /* ⛔⛔ IL CASO CHE ROMPE, e la prima versione di questa prova NON lo era.
           Avevo scritto un id di modello vero
           (`local:bartowski-nvidia_Nemotron-…-Q4-0-gguf`) credendo che fosse
           «lungo». Misurato togliendo la difesa: la banda restava **verde**,
           perché quel token è pieno di trattini e i trattini SONO punti di
           spezzatura — si avvolgeva da solo, 146 px per 243 px di altezza, senza
           che nessuna regola lo aiutasse. Una prova che resta verde quando le
           togli la cosa che nomina non sta provando quella cosa.
           ⇒ Qui si usa un nome che NON HA NESSUN PUNTO DI SPEZZATURA: una parola
             sola, senza trattini, underscore o spazi. È il caso patologico, ed è
             l'unico che distingue una difesa che c'è da una che non c'è.
           ⛔ E il difetto è REALE: `overflow-wrap:normal` (il default) non spezza
             un token così, quindi senza `overflow-wrap:anywhere` la cella
             corrente sfonda la banda e la banda sfonda la colonna. */
        await page.evaluate(() => {
          const nodo = document.querySelector('[data-lab-banda] #modelLabActiveModel');
          nodo.dataset.modelloId = `local:${'x'.repeat(120)}`;
          nodo.dataset.modelloDestinazione = 'locale';
          nodo.textContent = `Nemotron${'X'.repeat(160)}`;
          document.querySelector('#machineMemoryMetric').textContent = '31,6 GiB';
          window.__lab.aggiornaBandaLaboratorio(document.querySelector('#modelLabCard'));
        });

        const esito = await page.evaluate(() => {
          const banda = document.querySelector('#modelLabCard [data-lab-banda]');
          const colonna = banda.parentElement;
          const r = banda.getBoundingClientRect();
          const c = colonna.getBoundingClientRect();
          /* ⛔⛔ E SI MISURA IL TESTO, NON SOLO LA BANDA — la lezione che questa
             prova ha pagato due volte di fila. Un testo troppo lungo NON allarga
             il suo contenitore: `overflow` è `visible` per default, quindi esce
             dalla scatola e nessun `getBoundingClientRect` della banda se ne
             accorge. Le due volte precedenti la prova è rimasta verde togliendo
             la difesa, perché guardavo la scatola giusta e la cosa sbagliata.
             ⇒ `scrollWidth` contro `clientWidth` del nodo, e il bordo destro del
               nodo contro quello della banda: è l'unica coppia che distingue un
               testo contenuto da un testo che sborda. */
          const nodo = banda.querySelector('#modelLabActiveModel');
          const n = nodo.getBoundingClientRect();
          return {
            banda: { l: r.left, r: r.right, w: r.width, h: r.height },
            colonna: { l: c.left, r: c.right, w: c.width },
            nodo: { l: n.left, r: n.right, clientWidth: nodo.clientWidth, scrollWidth: nodo.scrollWidth },
            documento: document.documentElement.scrollWidth,
            finestra: window.innerWidth,
            /* Il tema è davvero quello chiesto, e lo si scopre dai BYTE prima
               che dall'immagine. ⛔ I byte NON si scrivono a mano: si fa
               RISOLVERE il token dal motore e si pretende che la banda usi
               quello. Scritti a mano sarebbero una copia in più da tenere
               allineata — e infatti la prima stesura di questa prova diceva
               `#242529` mentre il tema servito dichiara `#25262a`: stava
               provando `tokens.css`, non l'app. */
            ...(() => {
              /* ⛔ QUALE ATTRIBUTO PORTA IL TEMA, e non si indovina: misurato
                 sulla radice dell'app viva il 19/09/2026 provando a girarli uno
                 per uno e guardando se il token cambiava. Cambia `data-theme`
                 (`light` ↔ `dark`); `data-talos-color-mode` e
                 `data-talos-resolved-color-mode` si girano e il token resta
                 fermo — sono etichette di stato, non selettori. E `data-talos-mode`,
                 che pure esiste in `tokens.css:83`, l'app non lo scrive
                 affatto. Le prime due stesure di questa prova sono cadute
                 esattamente lì. */
              const radice = document.documentElement;
              /* ⛔ Il tema ACCESO si legge da `data-talos-color-mode`, perché
                 `data-theme` in tema scuro NON C'È: lo scuro è il `:root` nudo,
                 e il chiaro è l'attributo. Chiedere `data-theme` per sapere se
                 siamo in scuro risponde «niente» — misurato, ed è la terza
                 stesura di questa riga. */
              const modo = radice.getAttribute('data-talos-color-mode');
              const temaPrima = radice.getAttribute('data-theme');
              const altro = modo === 'dark' ? 'light' : 'dark';
              const sonda = document.createElement('span');
              sonda.style.display = 'none';
              radice.append(sonda);
              const token = {};
              const leggi = (chiave) => {
                sonda.style.backgroundColor = `var(${chiave})`;
                sonda.style.color = `var(${chiave})`;
                const stile = getComputedStyle(sonda);
                return { sfondo: stile.backgroundColor, testo: stile.color };
              };
              Object.assign(token, { panel: leggi('--talos-panel').sfondo, testo: leggi('--talos-text').testo });
              // E lo stesso token NELL'ALTRO TEMA: se i due dessero gli stessi
              // byte, le due prove non starebbero provando niente.
              radice.setAttribute('data-theme', altro);
              token.panelAltro = leggi('--talos-panel').sfondo;
              if (temaPrima === null) radice.removeAttribute('data-theme');
              else radice.setAttribute('data-theme', temaPrima);
              sonda.remove();
              return { token, modo: modo ?? '' };
            })(),
            sfondoBanda: getComputedStyle(banda).backgroundColor,
            coloreNome: getComputedStyle(banda.querySelector('.talos-lab__banda-nome')).color,
          };
        });

        // Dentro la colonna, con un margine di mezzo pixel per l'arrotondamento.
        expect(esito.banda.l).toBeGreaterThanOrEqual(esito.colonna.l - 0.5);
        expect(esito.banda.r).toBeLessThanOrEqual(esito.colonna.r + 0.5);
        // E la pagina non scorre in orizzontale.
        expect(esito.documento).toBeLessThanOrEqual(esito.finestra);
        // La banda ha una sua altezza: non è collassata a zero.
        expect(esito.banda.h).toBeGreaterThan(80);
        // ⛔ IL NOME NON SBORDA, ed è questa la riga che morde davvero: il
        // testo sta dentro la banda, e dentro la sua stessa scatola.
        expect(esito.nodo.r, 'il nome esce dalla banda').toBeLessThanOrEqual(esito.banda.r + 0.5);
        expect(esito.nodo.scrollWidth, 'il nome esce dalla sua scatola')
          .toBeLessThanOrEqual(esito.nodo.clientWidth + 1);

        /* ⛔ LA SOGLIA DEL MOCKUP, che è la seconda cosa che questa prova deve
           mordere. Il mockup spegne la terza cella sotto i 1250px di viewport, e
           la misura l'ho presa sul suo DOM vivo: a 1024 la cella della politica
           misura **0×0**. Se qualcuno toglie il `@media(max-width:1250px)` dal
           foglio, questa riga diventa rossa. */
        const politicaVisibile = await page.locator('#modelLabCard [data-lab-banda] [data-lab-banda-politica]')
          .evaluate(n => n.getBoundingClientRect().width > 0);
        expect(politicaVisibile, `a ${larghezza} la cella della politica dovrebbe essere ${larghezza > 1250 ? 'visibile' : 'spenta'}`)
          .toBe(larghezza > 1250);

        // Il tema è quello chiesto, e la banda usa i TOKEN di quel tema.
        expect(esito.modo).toBe(modo);
        expect(esito.sfondoBanda).toBe(esito.token.panel);
        expect(esito.coloreNome).toBe(esito.token.testo);
        // E i due temi non sono lo stesso tema travestito: se dessero gli
        // stessi byte, le due prove non starebbero provando niente.
        expect(esito.token.panel).not.toBe(esito.token.panelAltro);
      });
    }
  }

  /* Le foto: due temi per due larghezze, la banda ritagliata E la pagina intera.
     ⛔ Servono al controllo visivo, e il controllo visivo è un obbligo, non una
     cortesia: una prova verde non guarda i pixel. Le foto si GUARDANO — e
     guardano TUTTO, anche fuori dalla banda. */
  test('BANDA-07 — le foto: due temi per due larghezze', async ({ page }) => {
    await mkdir(CARTELLA_FOTO, { recursive: true });
    for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
      for (const modo of ['dark', 'light']) {
        await page.setViewportSize({ width: larghezza, height: altezza });
        await apriEEmonta(page, { colorMode: modo });
        // Con un contenuto vero, non vuoto: il nome di un modello e un totale
        // misurato, altrimenti la foto mostra uno stato che l'utente non vede.
        await page.evaluate(() => {
          const nodo = document.querySelector('[data-lab-banda] #modelLabActiveModel');
          nodo.dataset.modelloId = 'local:Qwen3-8B-GGUF-abc-Qwen3-8B-Q4-0-gguf';
          nodo.dataset.modelloDestinazione = 'locale';
          nodo.textContent = 'Qwen3 8B · Q4_0';
          document.querySelector('#machineMemoryMetric').textContent = '31,6 GiB';
          window.__lab.aggiornaBandaLaboratorio(document.querySelector('#modelLabCard'));
        });
        const banda = page.locator('#modelLabCard [data-lab-banda]');
        await expect(banda).toBeVisible();
        const nome = `${modo}-${larghezza}x${altezza}`;
        await banda.screenshot({ path: resolve(CARTELLA_FOTO, `banda-${nome}.png`) });
        await page.screenshot({ path: resolve(CARTELLA_FOTO, `pagina-${nome}.png`) });
      }
    }
  });

  test('BANDA-06 — il numero del budget è lo STESSO del motore del catalogo, letto dal sorgente', async ({ page }) => {
    await page.setViewportSize({ width: SOGLIE.larga, height: 900 });
    await apriEEmonta(page);

    /* ⛔ `18.6` vive in due righe di `catalog-engine.ts` (172 e 346) e non è
       esportato: qui se ne dichiara una copia in `lab-cornice-v3.js`, e questa
       prova è il contratto che le tiene insieme — è lo stesso patto di
       `tests/provider-registry-parita.test.mjs` per i fornitori. Senza,
       cambiare la soglia nel catalogo lascerebbe la banda a raccontare un
       numero che nessuno usa più. */
    const sorgente = readFileSync(resolve(process.cwd(), 'src', 'domain', 'catalog-engine.ts'), 'utf8');
    const nelCatalogo = [...sorgente.matchAll(/required <= (\d+(?:\.\d+)?)/g)].map(t => Number(t[1]));
    const nellaEtichetta = [...sorgente.matchAll(/Entro (\d+,\d+) GiB/g)].map(t => Number(t[1].replace(',', '.')));

    expect(nelCatalogo, 'catalog-engine.ts:346 non dichiara più la soglia').toEqual([18.6]);
    expect(nellaEtichetta, 'catalog-engine.ts:172 non dichiara più la soglia').toEqual([18.6]);

    const dichiarato = await page.evaluate(() => window.__lab.BUDGET_DEMO_GIB);
    expect(dichiarato).toBe(nelCatalogo[0]);
    // E il numero a schermo è quello, scritto all'italiana.
    await expect(page.locator('[data-lab-banda] [data-lab-banda-valore]')).toHaveText('18,6');
  });
});
