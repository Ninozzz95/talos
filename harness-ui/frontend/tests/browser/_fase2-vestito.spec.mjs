/*
 * FASE 2 · CORSIA 1 — IL VESTITO DELLE DIECI SEZIONI, MISURATO.
 *
 * ⛔ COSA PROVA QUESTA SPEC, E CONTRO COSA.
 * Confronta il `getComputedStyle` VERO delle dieci sezioni delle Impostazioni con le misure lette
 * dal DOM vivo del mockup `TALOS-Calm-Lab-04.html` il 18/09/2026 (viewport 1440×900). Non è
 * un'impressione: ogni numero qui sotto ha il selettore del mockup da cui viene, scritto accanto.
 *
 *   mockup `.setting-row`          display:flex · gap:24px · padding:21px 0 · border-top:1px solid
 *   mockup `.setting-copy label`   14px · 550 · 21px
 *   mockup `.setting-copy p`       12px · 400 · 20,4px · margin-top:6px
 *   mockup `.settings-section`     padding:2px 0 0 · niente bordo · niente fondo · raggio 0 (PIATTA)
 *   mockup `.provider-card`, `.system-card`   padding:22px · raggio:12px · border:1px solid var(--line)
 *   mockup `.provider-facts > div` display:flex · gap:10px · padding:12px 0
 *                                  border-bottom:1px solid var(--line-soft) · 12px/400/18px
 *   mockup `#page-title`           32px · 600 · letter-spacing -1,76px
 *
 * ⛔ LE DUE DIREZIONI, E LA SECONDA È LA PIÙ IMPORTANTE.
 * Questa spec è verde col vestito del mockup e diventa ROSSA se qualcuno rimette i valori vecchi
 * (riga `grid · gap:20px · padding:17px 0`, etichetta `500`, carta `20px 24px · raggio 14px`,
 * chiave/valore `gap:18px · filetto in alto`). Provata nei DUE versi il 18/09/2026 — ricostruendo
 * prima coi valori vecchi e poi coi nuovi: il rosso e il verde sono nel resoconto, non dichiarati.
 *
 * ⛔ LA PRECONDIZIONE SI ASSERISCE, E NON È PIGNOLERIA — È UN ERRORE GIÀ PAGATO IN QUESTA CORSIA.
 * La prima stesura della sonda di misura girava mentre `public/` era a metà copia (`cp -rf dist/*`):
 * il bundle servito era misto, la schermata Impostazioni NON si montava, e la misura ha riportato
 * valori di RIPIEGO (`padding:18px`, larghezze `auto`) senza un solo errore. Una misura su una
 * schermata che non c'è non è una misura. Quindi qui, prima di qualunque numero:
 * `#schermoImpostazioni[data-settings-ui="v3"]` (lo mette `settings-view.ts` al montaggio, non il
 * template) deve esistere, il pannello deve essere VISIBILE, e i pannelli devono essere dieci.
 *
 * ⛔ I CONTEGGI NON SONO DECORAZIONE, E LE LORO SOGLIE SONO MISURATE.
 * «La forma non c'è» e «la forma c'è ed è giusta» si distinguono solo contando. Le soglie qui sotto
 * sono il MINIMO osservato in due giri di misura (18/09/2026), non il massimo: alcune carte e
 * alcune righe arrivano dal caricamento vivo (il pannello Strumenti ne mostra 4 a dati pronti e 2
 * subito), e una soglia presa dal massimo renderebbe la spec intermittente — cioè inutile.
 * Il minimo invece è stabile, e la non-vacuità è garantita dai CONTATORI DEI RAMI in fondo, che
 * dicono quante sezioni hanno davvero attraversato ogni controllo.
 *
 * ⛔ NIENTE SCRITTURE. Ogni richiesta non-GET viene ABORTITA e registrata; ogni test chiude con
 * `expect(tentate).toEqual([])`. La spec gira sul server isolato di `playwright.config.mjs`
 * (porta 4176, store vuoto in una cartella temporanea), ma la stessa spec addosso al 4174
 * dell'owner — che è di SOLA LETTURA — non scriverebbe comunque niente.
 */

import { expect, test } from '@playwright/test';

/** Le misure del mockup, coi selettori da cui vengono. Vedi l'intestazione. */
const MOCKUP = {
  riga: { display: 'flex', gap: '24px', paddingTop: '21px', paddingBottom: '21px', borderTopWidth: '1px' },
  etichetta: { fontSize: '14px', fontWeight: '550', lineHeight: '21px' },
  aiuto: { fontSize: '12px', lineHeight: '20.4px', marginTop: '6px' },
  /*
   * ⛔ LA CARTA DI SEZIONE NON PRENDE LE MISURE DEL MOCKUP, E QUESTA SPEC LO DICE INVECE DI
   *    FARLO SEMBRARE UNA DIMENTICANZA. Il mockup di carte di SEZIONE non ne ha (le sue
   *    `.settings-section` sono piatte: `padding:2px 0 0`), la sua unica carta è quella dei
   *    CONTENUTI (`.provider-card`: `padding:22px; raggio:12px`), e i due numeri del brief
   *    (`20px 24px`, raggio 14) sono i valori che l'app ha già — `--ui-radius-surface` di
   *    `foundations.css:7`. Portarli a 22/12 fa diventare rosse due prove già esistenti che
   *    questa corsia non può toccare (`sezioni-stile.spec.mjs:322` e `:505`), quindi la carta
   *    resta com'è e la scelta (com'è · 22/12 · piatta) è dell'OWNER. Qui si PINNA lo stato
   *    attuale, così il giorno in cui quella scelta arriva questa riga diventa rossa e si aggiorna
   *    con essa.
   */
  cartaApp: { paddingTop: '20px', paddingBottom: '20px', paddingLeft: '24px', borderTopWidth: '1px', borderRadius: '14px' },
  gruppoPiatto: { paddingTop: '2px', paddingBottom: '0px', borderTopWidth: '0px', borderRadius: '0px' },
  /*
   * La sezione ANNIDATA dentro una carta: piatta anche lei, ma senza nemmeno i 2px in alto —
   * `sezioni-stile.css` la porta a `padding:0` perché è già dentro il respiro della carta che la
   * contiene (misurato: `#contestoVoci` e `[data-search-details]`, `pad=0px/0px radius=0px`).
   */
  gruppoNidificato: { paddingTop: '0px', paddingBottom: '0px', paddingLeft: '0px', borderTopWidth: '0px', borderRadius: '0px' },
  testata: { fontSize: '32px', fontWeight: '600', letterSpacing: '-1.76px' },
  titoloCarta: { fontSize: '15px', fontWeight: '600' },
  kv: { display: 'flex', gap: '10px', paddingTop: '12px', paddingBottom: '12px', borderBottomWidth: '1px' },
  kvChiave: { fontSize: '12px' },
  kvValore: { fontSize: '12px' },
};

/**
 * LE DIECI SEZIONI, con la FORMA che ognuna ha davvero (misurata il 18/09/2026, non supposta).
 * `forma`: le cinque `.talos-settings__section` dell'Aspetto sono i GRUPPI PIATTI del mockup
 * (`padding:2px 0 0`), le altre nove sono CARTE (padding 22 / raggio 12).
 * I numeri sono i minimi osservati; `kv: 0` significa «questa sezione non ha righe chiave/valore»,
 * ed è un'informazione, non un'assenza di controllo.
 */
const SEZIONI = [
  { id: 'appearance', carte: { min: 5, forma: 'piatto' }, righe: { min: 22, controllate: true }, kv: { min: 0 } },
  { id: 'chat', carte: { min: 2, forma: 'carta' }, righe: { min: 6, controllate: true }, kv: { min: 6 } },
  { id: 'tools', carte: { min: 2, forma: 'carta' }, nidificate: 1, righe: { controllate: false }, kv: { min: 3 } },
  { id: 'memoria', carte: { min: 1, forma: 'carta' }, nidificate: 1, righe: { controllate: false }, kv: { min: 0 } },
  { id: 'privacy', carte: { min: 2, forma: 'carta' }, righe: { controllate: false }, kv: { min: 3 } },
  { id: 'models', carte: { min: 1, forma: 'carta' }, righe: { controllate: false }, kv: { min: 20 } },
  { id: 'providers', carte: { min: 1, forma: 'carta' }, righe: { controllate: false }, kv: { min: 10 } },
  { id: 'costi', carte: { min: 1, forma: 'carta' }, righe: { controllate: false }, kv: { min: 0 } },
  { id: 'workspace', carte: { min: 1, forma: 'carta' }, righe: { controllate: false }, kv: { min: 3 } },
  { id: 'account', carte: { min: 1, forma: 'carta' }, righe: { controllate: false }, kv: { min: 0 } },
];

const impostazioni = (colorMode) => ({ version: 1, appearance: { uiLanguage: 'it', colorMode }, chat: {}, workspaces: {} });

/** Ogni richiesta non-GET viene ABORTITA e registrata: `tentate` è mutato dal processo Node. */
async function bloccaNonGET(page, tentate) {
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${route.request().url()}`);
    return route.abort();
  });
}

/** Accende l'app col tema che diciamo noi e apre le Impostazioni. */
async function avvia(page, tentate, colorMode) {
  await bloccaNonGET(page, tentate);
  await page.addInitScript((dati) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify(dati));
  }, impostazioni(colorMode));
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
  });
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#schermoImpostazioni[data-settings-ui="v3"]')).toHaveCount(1);
  const pannelli = await page.locator('[id^="setting-panel-"]').count();
  expect(pannelli, 'i pannelli delle sezioni devono essere dieci: se sono meno, la misura sarebbe su una schermata incompleta').toBe(10);
}

/** Apre una sezione e pretende che il suo pannello sia VISIBILE. */
async function apriSezione(page, id) {
  await page.evaluate((s) => window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false }), id);
  await expect(page.locator(`#setting-panel-${id}`)).toBeVisible({ timeout: 10_000 });
}

/**
 * `getComputedStyle` su TUTTE le corrispondenze di un selettore dentro il pannello.
 * `mancante: true` quando non ce n'è nessuna: un elenco vuoto non deve mai passare per un verde.
 */
async function stili(page, id, selettore, campi) {
  return page.evaluate(({ id, selettore, campi }) => {
    const pannello = document.querySelector(`#setting-panel-${id}`);
    const nodi = pannello ? [...pannello.querySelectorAll(selettore)] : [];
    if (nodi.length === 0) return { mancante: true, n: 0, misure: [] };
    const misure = nodi.map((el) => {
      const cs = getComputedStyle(el);
      const out = {};
      for (const c of campi) out[c] = cs[c];
      return out;
    });
    return { mancante: false, n: nodi.length, misure };
  }, { id, selettore, campi });
}

/** Il primo elemento, che è quello che descrive la forma della sezione. */
async function primo(page, id, selettore, campi) {
  const r = await stili(page, id, selettore, campi);
  return r.mancante ? r : { mancante: false, n: r.n, ...r.misure[0] };
}

/** Gli scostamenti fra misurato e atteso, ridotti alle SOLE chiavi che non tornano. */
function scostamenti(misurato, atteso) {
  const fuori = {};
  for (const [k, v] of Object.entries(atteso)) {
    if (misurato[k] !== v) fuori[k] = `${misurato[k]} invece di ${v}`;
  }
  return fuori;
}

for (const tema of ['dark', 'light']) {
  test(`FASE2-VESTITO — le dieci sezioni hanno il vestito del mockup (tema ${tema})`, async ({ page }) => {
    const tentate = [];
    await avvia(page, tentate, tema);

    /* ── IL CONTROLLO NEGATIVO DELLA SONDA ───────────────────────────────────────────────────
       Un selettore che non esiste deve tornare `mancante`, non un oggetto vuoto che poi passa
       tutti i confronti. Se questa riga diventa rossa, la sonda sta mentendo e TUTTE le misure
       sotto sono da buttare. */
    const inesistente = await primo(page, 'appearance', '.questa-classe-non-esiste', ['fontSize']);
    expect(inesistente.mancante, 'la sonda deve dichiarare mancante un selettore che non esiste').toBe(true);

    /* ── LA TESTATA DI SEZIONE — `#page-title`, 32px/600/-1.76px ───────────────────────────── */
    const h2 = await page.evaluate(() => {
      const el = document.querySelector('.settings-section-heading h2');
      if (!el) return { mancante: true };
      const cs = getComputedStyle(el);
      return { mancante: false, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing };
    });
    expect(h2.mancante, 'la testata di sezione non esiste: la misura sotto sarebbe vacua').toBe(false);
    expect(scostamenti(h2, MOCKUP.testata), 'testata di sezione').toEqual({});

    let sezioniConRighe = 0;
    let sezioniConKv = 0;
    let sezioniConCarta = 0;
    let sezioniPiatte = 0;
    let righeMisurate = 0;
    let kvMisurati = 0;

    for (const sezione of SEZIONI) {
      await apriSezione(page, sezione.id);

      /* ── LA CARTA (o il gruppo piatto) ──────────────────────────────────────────────────── */
      const piatto = sezione.carte.forma === 'piatto';
      const attesoCarta = piatto ? MOCKUP.gruppoPiatto : MOCKUP.cartaApp;
      /*
       * ⛔ LE DUE CARTE CHE NON SONO CARTE, E PERCHÉ NON È UNA SCAPPATOIA.
       * In «Memoria» e in «Strumenti» c'è una sezione DENTRO una sezione — `#contestoVoci` e il
       * modulo della ricerca (`[data-search-details]`) — e `sezioni-stile.css` la disegna PIATTA
       * apposta (una card dentro una card è la scatola nella scatola, misurata il 18/09/2026).
       * Sono un'eccezione del PRODOTTO, dichiarata lì e qui: le si esclude dai controlli della
       * carta e le si controlla CONTRO la forma piatta del mockup, così restano un'affermazione
       * e non un buco.
       */
      const sel = piatto ? '.talos-settings__section' : '.talos-settings__section:not(#contestoVoci):not([data-search-details])';
      const carte = await stili(page, sezione.id, sel, Object.keys(attesoCarta));
      expect(carte.mancante, `${sezione.id}: la carta di sezione non esiste`).toBe(false);
      expect(carte.n, `${sezione.id}: carte di sezione`).toBeGreaterThanOrEqual(sezione.carte.min);
      if (piatto) sezioniPiatte += 1; else sezioniConCarta += 1;
      /*
       * ⛔ TUTTE le carte della sezione, non solo la prima: una carta sola giusta e tre sbagliate
       * è il modo in cui questo vestito si romperebbe senza che nessuno se ne accorga.
       * ⛔ L'Aspetto è l'eccezione DICHIARATA: i suoi cinque blocchi sono i `.settings-section`
       * PIATTI del mockup, e restano piatti (è il mockup stesso a disegnarli così).
       */
      carte.misure.forEach((m, i) => {
        expect(scostamenti(m, attesoCarta), `${sezione.id}: carta ${i + 1} di ${carte.n}`).toEqual({});
      });
      if (!piatto) {
        /*
         * ⛔ QUESTA RIGA BALLAAVA, e la causa è misurata: in «Strumenti» la sezione annidata
         *   (`[data-search-details]`, il modulo della ricerca) e la sua compagna in «Memoria»
         *   (`#contestoVoci`) **si costruiscono DOPO il montaggio** — il modulo di ricerca si
         *   ricostruisce con `replaceChildren` a ogni risposta. Una misura ISTANTANEA le trova a
         *   volte 0, a volte 1.
         * ⛔ Misurato il 18/09/2026, con la prova della corsia 1 lasciata intatta: **2 rossi su 13
         *   giri** in compagnia delle altre spec, **0 su 6** da sola — cioè il difetto si vede solo
         *   quando la superficie è più lenta, che è esattamente la condizione in cui una guardia
         *   deve tenere. Una prova che balla non protegge: si può solo sperare che passi.
         * ⭐ LA CURA È QUELLA DOCUMENTATA (fonte: la guida di Playwright sulle asserzioni che
         *   riprovano, letta il 18/09/2026 — `expect.poll` per una condizione che non è un matcher
         *   di locatore, `waitForTimeout` come ultima risorsa): si **riprova** finché il conteggio
         *   coincide. L'asserzione dice la STESSA cosa; cambia solo che aspetta. Se la sezione
         *   sparisce davvero, il rosso arriva lo stesso — dopo l'attesa, e non per una fotografia
         *   presa troppo presto.
         */
        await expect
          .poll(
            () => page.locator(`#setting-panel-${sezione.id}`).evaluate((p) => p.querySelectorAll('#contestoVoci, [data-search-details]').length),
            { message: `${sezione.id}: le sezioni annidate non compaiono entro l'attesa` },
          )
          .toBe(sezione.nidificate ?? 0);
        const nidificate = await stili(page, sezione.id, '#contestoVoci, [data-search-details]', Object.keys(MOCKUP.gruppoNidificato));
        expect(nidificate.n, `${sezione.id}: sezioni annidate da disegnare piatte`).toBe(sezione.nidificate ?? 0);
        nidificate.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.gruppoNidificato), `${sezione.id}: sezione annidata ${i + 1} di ${nidificate.n}`).toEqual({});
        });
      }

      /* ── LA TESTATA DELLA CARTA, dove c'è (il mockup la disegna 15px/600) ──────────────── */
      const titoli = await stili(page, sezione.id, '.talos-settings__section > h3', Object.keys(MOCKUP.titoloCarta));
      if (!titoli.mancante) {
        titoli.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.titoloCarta), `${sezione.id}: titolo della carta ${i + 1} di ${titoli.n}`).toEqual({});
        });
      }

      /* ── LA RIGA — `.setting-row`, su TUTTE le righe non migrate ───────────────────────── */
      if (sezione.righe.controllate) {
        const righe = await stili(page, sezione.id, '.talos-setting:not([data-td-migrata="si"])', Object.keys(MOCKUP.riga));
        expect(righe.mancante, `${sezione.id}: la riga non esiste`).toBe(false);
        expect(righe.n, `${sezione.id}: righe di preferenza`).toBeGreaterThanOrEqual(sezione.righe.min);
        righe.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.riga), `${sezione.id}: riga ${i + 1} di ${righe.n}`).toEqual({});
        });
        const etichette = await stili(page, sezione.id, '.talos-setting__label', Object.keys(MOCKUP.etichetta));
        expect(etichette.n, `${sezione.id}: etichette`).toBeGreaterThan(0);
        etichette.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.etichetta), `${sezione.id}: etichetta ${i + 1} di ${etichette.n}`).toEqual({});
        });
        const aiuti = await stili(page, sezione.id, '.talos-setting__help', Object.keys(MOCKUP.aiuto));
        expect(aiuti.n, `${sezione.id}: aiuti`).toBeGreaterThan(0);
        aiuti.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.aiuto), `${sezione.id}: aiuto ${i + 1} di ${aiuti.n}`).toEqual({});
        });
        sezioniConRighe += 1;
        righeMisurate += righe.n;
      }

      /* ── LE CHIAVI/VALORI — `.provider-facts > div` su TUTTE le righe ──────────────────── */
      const kv = await stili(page, sezione.id, '.talos-kv', Object.keys(MOCKUP.kv));
      if (sezione.kv.min > 0) {
        expect(kv.mancante, `${sezione.id}: la riga chiave/valore non esiste`).toBe(false);
        expect(kv.n, `${sezione.id}: righe chiave/valore`).toBeGreaterThanOrEqual(sezione.kv.min);
        kv.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.kv), `${sezione.id}: chiave/valore ${i + 1} di ${kv.n}`).toEqual({});
        });
        const chiavi = await stili(page, sezione.id, '.talos-kv__k', Object.keys(MOCKUP.kvChiave));
        chiavi.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.kvChiave), `${sezione.id}: chiave ${i + 1} di ${chiavi.n}`).toEqual({});
        });
        /*
         * ⛔ IL VALORE SI CONTROLLA SOLO DOVE NON È UNA PASTIGLIA: nel Laboratorio il valore di una
         * riga chiave/valore È un `.talos-badge` (`cornice-model-lab.js:72`), e la pastiglia ha la
         * sua misura (11px, la `.badge` del mockup). Chiedere 12px anche a lei sarebbe chiedere la
         * misura giusta all'elemento sbagliato.
         */
        const valori = await stili(page, sezione.id, '.talos-kv__v:not(.talos-badge)', Object.keys(MOCKUP.kvValore));
        valori.misure.forEach((m, i) => {
          expect(scostamenti(m, MOCKUP.kvValore), `${sezione.id}: valore ${i + 1} di ${valori.n}`).toEqual({});
        });
        sezioniConKv += 1;
        kvMisurati += kv.n;
      } else {
        /* Dove il mockup non ha chiavi/valore e l'app nemmeno: si DICHIARA, non si salta in silenzio. */
        expect(kv.n, `${sezione.id}: non deve avere righe chiave/valore`).toBe(0);
      }
    }

    /*
     * ── I RAMI PERCORSI — la rete contro il vuoto ──────────────────────────────────────────────
     * Un ciclo che non entra mai nel ramo giusto passa SEMPRE, e somiglia a un verde.
     */
    expect(sezioniConRighe, 'sezioni con la riga controllata').toBe(2); // Aspetto, Chat
    expect(sezioniConKv, 'sezioni con le chiave/valore controllate').toBe(6); // Chat, Strumenti, Privacy, Laboratorio, Provider, File
    expect(sezioniConCarta, 'sezioni con la carta controllata').toBe(9);
    expect(sezioniPiatte, 'sezioni coi gruppi piatti (Aspetto)').toBe(1);
    expect(righeMisurate, 'righe di preferenza misurate in tutto').toBeGreaterThanOrEqual(28);
    expect(kvMisurati, 'righe chiave/valore misurate in tutto').toBeGreaterThanOrEqual(40);

    expect(tentate, 'richieste non-GET tentate dalla pagina').toEqual([]);
  });
}
